import { LEVEL_ALIASES, LEVEL_COLUMN, LEVELS, MESSAGE_COLUMN, TIME_COLUMN } from '../constants';
import { isIdentifier, PatternConfig, ResolvedTenant } from '../config/config';
import { LabelFilter, LineFilter, MessageFieldFilter, QuerySpec } from '../state/types';

/**
 * Builds the StarRocks SQL for every panel of the app. All values coming from the user or the URL go through
 * quoteIdent / lit; identifiers must be plain column names.
 *
 * The only Grafana macro used is $__timeFilter(observed_timestamp), which the datasource expands to a
 * BETWEEN on the panel time range (it lets StarRocks prune the hourly Iceberg partitions).
 */

export interface BuildContext {
  tenant: ResolvedTenant;
  /** columns present in the view; filters and selects on other columns are dropped */
  columns: string[];
  labels: string[];
  fields: string[];
}

export function quoteIdent(name: string): string {
  if (!isIdentifier(name)) {
    throw new Error(`invalid identifier: ${name}`);
  }
  return '`' + name + '`';
}

/**
 * SQL string literal. Backslashes and quotes are escaped (StarRocks string literals are MySQL style).
 * The datasource expands $name(...) macros and $__interval anywhere in the SQL, including inside literals,
 * so any "$" is emitted as a separate '$' literal joined with concat(); StarRocks folds the constant.
 */
export function lit(s: string): string {
  const quote = (x: string) => `'${x.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (!s.includes('$')) {
    return quote(s);
  }
  const parts: string[] = [];
  s.split('$').forEach((p, i) => {
    if (i > 0) {
      parts.push(quote('$'));
    }
    if (p !== '') {
      parts.push(quote(p));
    }
  });
  return `concat(${parts.join(', ')})`;
}

/**
 * Exact substring test. Uses LIKE '%text%' (the form measured on UAT) when the text has no LIKE
 * metacharacters, otherwise instr(): StarRocks 4.0 does not match an escaped \% at the end of a LIKE
 * pattern (e.g. '%50\%%'), so escaping is not reliable.
 */
export function containsCond(col: string, text: string): string {
  if (/[%_\\]/.test(text)) {
    return `instr(${col}, ${lit(text)}) > 0`;
  }
  return `${col} LIKE ${lit(`%${text}%`)}`;
}

/** Escapes RE2 metacharacters so the text matches literally. */
export function escapeRegex(text: string): string {
  return text.replace(/[\\.+*?()|[\]{}^$]/g, (c) => '\\' + c);
}

const T = quoteIdent(TIME_COLUMN);
const M = quoteIdent(MESSAGE_COLUMN);

export function timeFilter(): string {
  return `$__timeFilter(${T})`;
}

/**
 * Exact time bounds for line queries, in addition to $__timeFilter (which the datasource truncates to whole
 * seconds; at ~1.6k lines/s that would skip lines when "load more" asks for lines older than the oldest one
 * shown). Inclusive of the whole millisecond at both ends: lines equal to a loaded line are merged by id.
 * FROM_UNIXTIME uses the session time zone, like the macro.
 */
export function preciseTimeBounds(fromMs: number, toMs: number): string[] {
  const at = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `microseconds_add(FROM_UNIXTIME(${s}), ${(ms - s * 1000) * 1000})`;
  };
  return [`${T} >= ${at(Math.floor(fromMs))}`, `${T} < ${at(Math.floor(toMs) + 1)}`];
}

/** Time range to send with a line query so that $__timeFilter covers the exact bounds (whole seconds). */
export function widenToSeconds(fromMs: number, toMs: number): { fromMs: number; toMs: number } {
  return { fromMs: Math.floor(fromMs / 1000) * 1000, toMs: Math.ceil((Math.floor(toMs) + 1) / 1000) * 1000 };
}

export function bucketExpr(bucketSeconds: number): string {
  const b = Math.max(1, Math.floor(bucketSeconds));
  return `(UNIX_TIMESTAMP(${T}) DIV ${b}) * ${b}`;
}

const BUCKETS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];

/** Picks a "round" bucket size so the range has at most maxPoints buckets. */
export function pickBucketSeconds(rangeMs: number, maxPoints = 120): number {
  const ideal = rangeMs / 1000 / Math.max(1, maxPoints);
  return BUCKETS.find((b) => b >= ideal) ?? Math.ceil(ideal / 86400) * 86400;
}

/** Raw (not normalised) level value, lower case. */
export function levelRawExpr(tenant: ResolvedTenant): string {
  if (tenant.level.source === 'column') {
    return `lower(trim(${quoteIdent(LEVEL_COLUMN)}))`;
  }
  const tries = tenant.level.regex.map((re) => `nullif(regexp_extract(${M}, ${lit(re)}, 1), '')`);
  return `lower(coalesce(${[...tries, "''"].join(', ')}))`;
}

/** Normalised level: error | warn | info | debug | unknown. A simple CASE evaluates the raw value once. */
export function levelExpr(tenant: ResolvedTenant): string {
  const whens = Object.entries(LEVEL_ALIASES)
    .flatMap(([level, aliases]) => aliases.map((a) => `WHEN '${a}' THEN '${level}'`))
    .join(' ');
  return `(CASE ${levelRawExpr(tenant)} ${whens} ELSE 'unknown' END)`;
}

function labelCond(key: string, filters: LabelFilter[]): string[] {
  const col = quoteIdent(key);
  const conds: string[] = [];
  const eq = filters.filter((f) => f.op === '=').map((f) => lit(f.value));
  if (eq.length === 1) {
    conds.push(`${col} = ${eq[0]}`);
  } else if (eq.length > 1) {
    conds.push(`${col} IN (${eq.join(', ')})`);
  }
  for (const f of filters) {
    if (f.op === '!=') {
      conds.push(`${col} != ${lit(f.value)}`);
    } else if (f.op === '=~') {
      conds.push(`regexp(${col}, ${lit(`^(?:${f.value})$`)})`);
    } else if (f.op === '!~') {
      conds.push(`NOT regexp(${col}, ${lit(`^(?:${f.value})$`)})`);
    }
  }
  return conds;
}

export function lineFilterCond(f: LineFilter): string {
  let cond: string;
  if (f.regex) {
    cond = `regexp(${M}, ${lit(f.caseSensitive ? f.value : `(?i)${f.value}`)})`;
  } else if (f.caseSensitive) {
    cond = containsCond(M, f.value);
  } else {
    cond = containsCond(`lower(${M})`, f.value.toLowerCase());
  }
  return f.op === 'exclude' ? `NOT (${cond})` : cond;
}

const FIELD_SEP = `(^|[\\s{,;])`;

/** RE2 regex matching key=value / "key":"value" / key: value inside the message. */
export function messageFieldRegex(key: string, value?: string): string {
  const k = `"?${escapeRegex(key)}"?\\s*[=:]\\s*"?`;
  if (value === undefined) {
    return `${FIELD_SEP}${k}([^"\\s,;}]+)`;
  }
  return `${FIELD_SEP}${k}${escapeRegex(value)}("|\\s|,|;|}|$)`;
}

export function fieldFilterCond(f: MessageFieldFilter): string {
  const cond = `regexp(${M}, ${lit(messageFieldRegex(f.key, f.value))})`;
  return f.op === '!=' ? `NOT ${cond}` : cond;
}

export function patternCond(p: PatternConfig): string {
  if (p.like !== undefined) {
    return `${M} LIKE ${lit(p.like)}`;
  }
  return `regexp(${M}, ${lit(p.regex ?? '')})`;
}

interface WhereOptions {
  skipPatterns?: boolean;
  extra?: string[];
}

export function whereClause(spec: QuerySpec, ctx: BuildContext, opts: WhereOptions = {}): string {
  const conds: string[] = [timeFilter()];
  const byKey = new Map<string, LabelFilter[]>();
  for (const f of spec.filters) {
    if (!isIdentifier(f.key) || !ctx.columns.includes(f.key)) {
      continue;
    }
    byKey.set(f.key, [...(byKey.get(f.key) ?? []), f]);
  }
  byKey.forEach((fs, key) => conds.push(...labelCond(key, fs)));

  const levels = spec.levels.filter((l) => (LEVELS as readonly string[]).includes(l));
  if (levels.length > 0 && levels.length < LEVELS.length) {
    conds.push(`${levelExpr(ctx.tenant)} IN (${levels.map(lit).join(', ')})`);
  }
  spec.lineFilters.filter((f) => f.value !== '').forEach((f) => conds.push(lineFilterCond(f)));
  spec.fieldFilters.filter((f) => f.key !== '').forEach((f) => conds.push(fieldFilterCond(f)));

  if (!opts.skipPatterns) {
    const byName = new Map(ctx.tenant.patterns.map((p) => [p.name, p]));
    const inc = spec.patternFilters.filter((f) => f.op === 'include' && byName.has(f.name));
    const exc = spec.patternFilters.filter((f) => f.op === 'exclude' && byName.has(f.name));
    if (inc.length > 0) {
      conds.push(`(${inc.map((f) => patternCond(byName.get(f.name)!)).join(' OR ')})`);
    }
    exc.forEach((f) => conds.push(`NOT (${patternCond(byName.get(f.name)!)})`));
  }
  conds.push(...(opts.extra ?? []));
  return conds.join('\n  AND ');
}

/** True when the query has to read the message column (expensive on long ranges). */
export function needsMessageScan(spec: QuerySpec, tenant: ResolvedTenant, includesLevel: boolean): boolean {
  return (
    (includesLevel && tenant.level.source === 'message') ||
    (spec.levels.length > 0 && tenant.level.source === 'message') ||
    spec.lineFilters.length > 0 ||
    spec.fieldFilters.length > 0 ||
    spec.patternFilters.length > 0
  );
}

function from(view: string): string {
  return `FROM ${quoteIdent(view)}`;
}

/** Columns returned with every log line (labels first, then fields), limited to what the view has. */
export function lineColumns(ctx: BuildContext): string[] {
  const skip = new Set([TIME_COLUMN, MESSAGE_COLUMN, LEVEL_COLUMN]);
  return Array.from(new Set([...ctx.labels, ...ctx.fields])).filter((c) => ctx.columns.includes(c) && !skip.has(c));
}

function lineSelect(ctx: BuildContext): string {
  return [
    T,
    `CAST(${T} AS VARCHAR) AS __ts`,
    M,
    `${levelExpr(ctx.tenant)} AS detected_level`,
    ...lineColumns(ctx).map(quoteIdent),
  ].join(', ');
}

export function viewsQuery(prefix: string): string {
  return `SHOW TABLES LIKE ${lit(`${prefix}%`)}`;
}

export function columnsQuery(view: string): string {
  return `SELECT * ${from(view)} LIMIT 0`;
}

export function labelValuesQuery(spec: QuerySpec, ctx: BuildContext, key: string, limit = 500): string {
  const col = quoteIdent(key);
  const others = { ...spec, filters: spec.filters.filter((f) => f.key !== key) };
  return [
    `SELECT ${col} AS v, COUNT(*) AS c`,
    from(spec.view),
    `WHERE ${whereClause(others, ctx, { extra: [`${col} != ''`] })}`,
    `GROUP BY ${col}`,
    `ORDER BY c DESC`,
    `LIMIT ${limit}`,
  ].join('\n');
}

/** Service grid: counts per bucket, label value and level, all values in one scan. */
export function serviceVolumeQuery(
  spec: QuerySpec,
  ctx: BuildContext,
  label: string,
  bucket: number,
  withLevel = true
): string {
  const lvl = withLevel ? levelExpr(ctx.tenant) : `'all'`;
  return [
    `SELECT ${bucketExpr(bucket)} AS t, ${quoteIdent(label)} AS v, ${lvl} AS lvl, COUNT(*) AS c`,
    from(spec.view),
    `WHERE ${whereClause(spec, ctx)}`,
    `GROUP BY t, v, lvl`,
    `ORDER BY t`,
  ].join('\n');
}

/** Newest lines for each of the given label values, as one UNION ALL of top-N queries. */
export function serviceSamplesQuery(
  spec: QuerySpec,
  ctx: BuildContext,
  label: string,
  values: string[],
  perValue: number
): string {
  const col = quoteIdent(label);
  return values
    .map((v) =>
      [
        `(SELECT ${lineSelect(ctx)}, ${col} AS __value`,
        from(spec.view),
        `WHERE ${whereClause(spec, ctx, { extra: [`${col} = ${lit(v)}`] })}`,
        `ORDER BY ${T} DESC`,
        `LIMIT ${Math.max(1, Math.floor(perValue))})`,
      ].join('\n')
    )
    .join('\nUNION ALL\n');
}

export function logsQuery(
  spec: QuerySpec,
  ctx: BuildContext,
  limit: number,
  sort: 'desc' | 'asc',
  bounds?: { fromMs: number; toMs: number }
): string {
  const extra = bounds ? preciseTimeBounds(bounds.fromMs, bounds.toMs) : [];
  return [
    `SELECT ${lineSelect(ctx)}`,
    from(spec.view),
    `WHERE ${whereClause(spec, ctx, { extra })}`,
    `ORDER BY ${T} ${sort === 'asc' ? 'ASC' : 'DESC'}`,
    `LIMIT ${Math.max(1, Math.floor(limit))}`,
  ].join('\n');
}

/** Log volume by level for the Logs tab histogram ('all' when the level split is skipped). */
export function volumeQuery(spec: QuerySpec, ctx: BuildContext, bucket: number, withLevel = true): string {
  const lvl = withLevel ? levelExpr(ctx.tenant) : `'all'`;
  return [
    `SELECT ${bucketExpr(bucket)} AS t, ${lvl} AS g, COUNT(*) AS c`,
    from(spec.view),
    `WHERE ${whereClause(spec, ctx)}`,
    `GROUP BY t, g`,
    `ORDER BY t`,
  ].join('\n');
}

/**
 * Counts per bucket for every label at once (Labels/Fields tab overview): one scan with GROUPING SETS. The
 * gid column tells which label a row belongs to (GROUPING_ID bit is 0 for the grouped label).
 */
export function labelOverviewQuery(spec: QuerySpec, ctx: BuildContext, labels: string[], bucket: number): string {
  const cols = labels.filter((l) => ctx.columns.includes(l)).map(quoteIdent);
  if (cols.length === 0) {
    throw new Error('no label columns');
  }
  return [
    `SELECT t, ${cols.join(', ')}, GROUPING_ID(${cols.join(', ')}) AS gid, COUNT(*) AS c`,
    `FROM (SELECT ${bucketExpr(bucket)} AS t, ${cols.join(', ')}`,
    `  ${from(spec.view)}`,
    `  WHERE ${whereClause(spec, ctx)}) s`,
    `GROUP BY GROUPING SETS (${cols.map((c) => `(t, ${c})`).join(', ')})`,
  ].join('\n');
}

export function valueBreakdownQuery(spec: QuerySpec, ctx: BuildContext, key: string, bucket: number): string {
  const col = quoteIdent(key);
  return [
    `SELECT ${bucketExpr(bucket)} AS t, ${col} AS v, COUNT(*) AS c`,
    from(spec.view),
    `WHERE ${whereClause(spec, ctx, { extra: [`${col} != ''`] })}`,
    `GROUP BY t, v`,
    `ORDER BY t`,
  ].join('\n');
}

/** Breakdown of a key=value pair found inside the message (full scan of the message column). */
export function fieldBreakdownQuery(spec: QuerySpec, ctx: BuildContext, field: string, bucket: number): string {
  return [
    `SELECT t, v, COUNT(*) AS c`,
    `FROM (SELECT ${bucketExpr(bucket)} AS t, regexp_extract(${M}, ${lit(messageFieldRegex(field))}, 2) AS v`,
    `  ${from(spec.view)}`,
    `  WHERE ${whereClause(spec, ctx)}) s`,
    `WHERE v != ''`,
    `GROUP BY t, v`,
    `ORDER BY t`,
  ].join('\n');
}

/** Counts of every configured pattern per bucket in one scan; '' is the unmatched remainder. */
export function patternsQuery(spec: QuerySpec, ctx: BuildContext, bucket: number): string {
  const patterns = ctx.tenant.patterns;
  if (patterns.length === 0) {
    throw new Error('no patterns configured for this tenant');
  }
  const cases = patterns.map((p) => `WHEN ${patternCond(p)} THEN ${lit(p.name)}`).join('\n    ');
  return [
    `SELECT ${bucketExpr(bucket)} AS t,`,
    `  CASE\n    ${cases}\n    ELSE '' END AS p,`,
    `  COUNT(*) AS c`,
    from(spec.view),
    `WHERE ${whereClause(spec, ctx, { skipPatterns: true })}`,
    `GROUP BY t, p`,
    `ORDER BY t`,
  ].join('\n');
}

/**
 * Lines of the same pod before (backward) or after (forward) a line, within one hour. Uses the exact
 * microsecond timestamp of the line. Timestamps are not unique, so lines with the same timestamp are left out.
 */
export function contextQuery(
  view: string,
  ctx: BuildContext,
  podColumn: string,
  pod: string,
  tsRaw: string,
  direction: 'backward' | 'forward',
  limit: number
): string {
  const ts = `CAST(${lit(tsRaw)} AS DATETIME)`;
  const range =
    direction === 'backward'
      ? `${T} < ${ts} AND ${T} >= DATE_SUB(${ts}, INTERVAL 1 HOUR)`
      : `${T} > ${ts} AND ${T} <= DATE_ADD(${ts}, INTERVAL 1 HOUR)`;
  return [
    `SELECT ${lineSelect(ctx)}`,
    from(view),
    `WHERE ${quoteIdent(podColumn)} = ${lit(pod)} AND ${range}`,
    `ORDER BY ${T} ${direction === 'backward' ? 'DESC' : 'ASC'}`,
    `LIMIT ${Math.max(1, Math.floor(limit))}`,
  ].join('\n');
}
