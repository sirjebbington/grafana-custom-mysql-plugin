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
  /** structured (JSON) columns: returned with each line for its details, never grouped by */
  details?: string[];
  /**
   * FROM target when the view names its time, message or level column differently: a derived table that renames
   * them (sql/columns.ts). Unset: the view itself.
   */
  relation?: string;
  /** label of the value grid (the view's service column) */
  serviceLabel?: string;
  /** columns identifying where a line comes from (pod uid, pod name, ...), best first */
  podColumns?: string[];
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

/**
 * Epoch milliseconds of a DATETIME expression, computed by StarRocks in the session zone. The data source
 * would read a DATETIME as UTC, which is wrong whenever the session zone is not UTC. (StarRocks has no
 * MICROSECOND(); the milliseconds within the second come from MILLISECONDS_DIFF.)
 */
export function timeMsExpr(expr: string): string {
  return `(UNIX_TIMESTAMP(${expr}) * 1000 + MILLISECONDS_DIFF(${expr}, DATE_TRUNC('second', ${expr})))`;
}

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

/**
 * Query-scope SET_VAR hint added to every statement the app sends:
 * - time_zone: the zone the time column's wall clock is in (see sql/timeZone.ts), so that FROM_UNIXTIME and
 *   UNIX_TIMESTAMP agree with the column. Left out when unknown: the data source's session zone applies.
 * - query_timeout: a backstop. StarRocks also stops a query when its connection closes, which is what
 *   happens when Grafana cancels a request (a newer selection, leaving the page, the panel's cancel).
 */
export function queryHint(opts: { timeZone?: string; timeoutSeconds: number }): string {
  const vars: string[] = [];
  if (opts.timeZone) {
    vars.push(`time_zone = ${lit(opts.timeZone)}`);
  }
  if (opts.timeoutSeconds > 0) {
    vars.push(`query_timeout = ${Math.floor(opts.timeoutSeconds)}`);
  }
  return vars.length > 0 ? `/*+ SET_VAR(${vars.join(', ')}) */` : '';
}

/**
 * Puts the hint after the statement's first SELECT. StarRocks applies a query-scope hint found anywhere in
 * the statement to all of it (UNION ALL included). SHOW statements are returned unchanged.
 */
export function withQueryHint(sql: string, hint: string): string {
  if (hint === '') {
    return sql;
  }
  return sql.replace(/^(\s*\(?\s*SELECT)\b/i, (m) => `${m} ${hint}`);
}

const HOUR_MS = 3_600_000;

/** Inclusive millisecond bounds of one search window (as for preciseTimeBounds). */
export interface TimeWindow {
  fromMs: number;
  toMs: number;
}

/**
 * Splits a range into windows searched one after another for the newest (desc) or oldest (asc) lines, so a
 * text search stops as soon as it has enough lines instead of reading the whole range. The first window is
 * about firstMs long and each next one is twice as long; inner boundaries fall on whole hours, so each
 * hourly Iceberg partition is read by one window only. Windows do not overlap and leave no gap.
 */
export function planWindows(fromMs: number, toMs: number, sort: 'desc' | 'asc', firstMs = HOUR_MS): TimeWindow[] {
  const from = Math.floor(fromMs);
  const end = Math.floor(toMs) + 1; // exclusive
  if (end - 1 - from <= 2 * firstMs) {
    return [{ fromMs: from, toMs: end - 1 }];
  }
  const out: TimeWindow[] = [];
  let size = firstMs;
  if (sort === 'desc') {
    let hi = end;
    while (hi > from) {
      let lo = Math.floor((hi - size) / HOUR_MS) * HOUR_MS;
      if (lo - from < HOUR_MS) {
        lo = from; // no window shorter than an hour at the far end
      }
      out.push({ fromMs: lo, toMs: hi - 1 });
      hi = lo;
      size *= 2;
    }
  } else {
    let lo = from;
    while (lo < end) {
      let hi = Math.ceil((lo + size) / HOUR_MS) * HOUR_MS;
      if (end - hi < HOUR_MS) {
        hi = end;
      }
      out.push({ fromMs: lo, toMs: hi - 1 });
      lo = hi;
      size *= 2;
    }
  }
  return out;
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

/** Normalises a lower-case raw level value: error | warn | info | debug | unknown. */
function normaliseLevel(raw: string): string {
  const whens = Object.entries(LEVEL_ALIASES)
    .flatMap(([level, aliases]) => aliases.map((a) => `WHEN '${a}' THEN '${level}'`))
    .join(' ');
  return `(CASE ${raw} ${whens} ELSE 'unknown' END)`;
}

const LEVEL_COL = quoteIdent(LEVEL_COLUMN);

/** Raw level from the `level` column, lower case. */
function columnLevelRaw(): string {
  return `lower(trim(${LEVEL_COL}))`;
}

/** Raw level read from the message with the tenant's regexes (first match wins), lower case. */
function messageLevelRaw(tenant: ResolvedTenant): string {
  const tries = tenant.level.regex.map((re) => `nullif(regexp_extract(${M}, ${lit(re)}, 1), '')`);
  return `lower(coalesce(${[...tries, "''"].join(', ')}))`;
}

/** The `level` column is filled on this row. */
export function levelFilledCond(): string {
  return `trim(${LEVEL_COL}) != ''`;
}

/** The `level` column is empty (or NULL) on this row: the level has to come from the message. */
export function levelEmptyCond(): string {
  return `(${LEVEL_COL} IS NULL OR trim(${LEVEL_COL}) = '')`;
}

/** Whether a "message" tenant's view also has the level column (then filled rows use it). */
function hasLevelColumn(ctx?: Pick<BuildContext, 'columns'>): boolean {
  return ctx === undefined || ctx.columns.includes(LEVEL_COLUMN);
}

/**
 * Raw (not normalised) level value, lower case. "column" tenants read the level column. "message" tenants read
 * the level column where the pipeline filled it, and the message (tenant regexes) where it is empty, so they keep
 * working, faster, once the pipeline starts filling it. In aggregations use levelSplit instead: StarRocks
 * evaluates both CASE branches on every row (measured on UAT: 17.1 s vs 6.0 s with a WHERE split).
 */
export function levelRawExpr(tenant: ResolvedTenant, ctx?: Pick<BuildContext, 'columns'>): string {
  if (tenant.level.source === 'column') {
    return columnLevelRaw();
  }
  if (!hasLevelColumn(ctx)) {
    return messageLevelRaw(tenant);
  }
  return `(CASE WHEN ${levelFilledCond()} THEN ${columnLevelRaw()} ELSE ${messageLevelRaw(tenant)} END)`;
}

/** Normalised level: error | warn | info | debug | unknown. A simple CASE evaluates the raw value once. */
export function levelExpr(tenant: ResolvedTenant, ctx?: Pick<BuildContext, 'columns'>): string {
  return normaliseLevel(levelRawExpr(tenant, ctx));
}

/**
 * For aggregations by level: one SELECT per way of getting the level, each with its own row condition, to be
 * joined with UNION ALL (the regexp then runs only on rows without a filled level column).
 */
export function levelSplit(tenant: ResolvedTenant, ctx: BuildContext): Array<{ expr: string; cond?: string }> {
  if (tenant.level.source === 'column') {
    return [{ expr: normaliseLevel(columnLevelRaw()) }];
  }
  if (!hasLevelColumn(ctx)) {
    return [{ expr: normaliseLevel(messageLevelRaw(tenant)) }];
  }
  return [
    { expr: normaliseLevel(columnLevelRaw()), cond: levelFilledCond() },
    { expr: normaliseLevel(messageLevelRaw(tenant)), cond: levelEmptyCond() },
  ];
}

/** Column used to spread a hash sample evenly over pods and time. */
function sampleKey(ctx: BuildContext): string {
  const pod = (ctx.podColumns ?? ['k8s_pod_uid', 'k8s_pod_name']).find((c) => ctx.columns.includes(c));
  return pod ? `${quoteIdent(pod)}, ${T}` : T;
}

/**
 * Keeps about 1 in n rows, spread evenly (hash of pod and exact time; sampling by time alone is biased because
 * lines arrive in bursts: 12.9 % kept instead of 10 % on UAT). Counts are multiplied by n.
 */
export function sampleCond(ctx: BuildContext, n: number): string {
  return `MOD(ABS(murmur_hash3_32(${sampleKey(ctx)})), ${Math.max(1, Math.floor(n))}) = 0`;
}

/**
 * GROUP BY bucket (and grouping columns) and level, with the level split (levelSplit) and optional sampling.
 * `select` gives the grouping columns other than the level (already aliased), `groupBy` their aliases.
 */
function countByLevel(
  spec: QuerySpec,
  ctx: BuildContext,
  opts: { select: string[]; groupBy: string[]; levelAlias: string; withLevel: boolean; sample?: number }
): string {
  const n = opts.sample && opts.sample > 1 ? Math.floor(opts.sample) : 1;
  const sample = n > 1 ? [sampleCond(ctx, n)] : [];
  const count = n > 1 ? `COUNT(*) * ${n}` : 'COUNT(*)';
  // split by level source when levels are shown or filtered: each branch reads the level one way only
  const parts: Array<{ out: string; levelBy?: string; cond?: string }> =
    opts.withLevel || activeLevels(spec).length > 0
      ? levelSplit(ctx.tenant, ctx).map((p) => ({
          out: opts.withLevel ? p.expr : `'all'`,
          levelBy: p.expr,
          cond: p.cond,
        }))
      : [{ out: `'all'` }];
  const groupBy = [...opts.groupBy, opts.levelAlias].join(', ');
  const selects = parts.map((p) =>
    [
      `SELECT ${[...opts.select, `${p.out} AS ${opts.levelAlias}`, `${count} AS c`].join(', ')}`,
      from(spec.view, ctx.relation),
      `WHERE ${whereClause(spec, ctx, { before: [...(p.cond ? [p.cond] : []), ...sample], levelBy: p.levelBy })}`,
      `GROUP BY ${groupBy}`,
    ].join('\n')
  );
  if (selects.length === 1) {
    return `${selects[0]}\nORDER BY t`;
  }
  return [
    `SELECT ${[...opts.groupBy, opts.levelAlias, 'SUM(c) AS c'].join(', ')}`,
    `FROM (\n${selects.join('\nUNION ALL\n')}\n) u`,
    `GROUP BY ${groupBy}`,
    `ORDER BY t`,
  ].join('\n');
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
  /** cheap row conditions placed right after the time filter, before any regexp (level source, sample) */
  before?: string[];
  /** level expression for a level filter (a levelSplit branch); default levelExpr (CASE: column, else message) */
  levelBy?: string;
}

/** The level filter of a spec, or none when no level or every level is selected. */
function activeLevels(spec: QuerySpec): string[] {
  const levels = spec.levels.filter((l) => (LEVELS as readonly string[]).includes(l));
  return levels.length > 0 && levels.length < LEVELS.length ? levels : [];
}

export function whereClause(spec: QuerySpec, ctx: BuildContext, opts: WhereOptions = {}): string {
  const conds: string[] = [timeFilter(), ...(opts.before ?? [])];
  const byKey = new Map<string, LabelFilter[]>();
  for (const f of spec.filters) {
    if (!isIdentifier(f.key) || !ctx.columns.includes(f.key)) {
      continue;
    }
    byKey.set(f.key, [...(byKey.get(f.key) ?? []), f]);
  }
  byKey.forEach((fs, key) => conds.push(...labelCond(key, fs)));

  const levels = activeLevels(spec);
  if (levels.length > 0) {
    conds.push(`${opts.levelBy ?? levelExpr(ctx.tenant, ctx)} IN (${levels.map(lit).join(', ')})`);
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

function from(view: string, relation?: string): string {
  return `FROM ${relation ?? quoteIdent(view)}`;
}

/** Columns returned with every log line (labels first, then fields), limited to what the view has. */
export function lineColumns(ctx: BuildContext): string[] {
  const skip = new Set([TIME_COLUMN, MESSAGE_COLUMN, LEVEL_COLUMN]);
  return Array.from(new Set([...ctx.labels, ...ctx.fields, ...(ctx.details ?? [])])).filter(
    (c) => ctx.columns.includes(c) && !skip.has(c)
  );
}

/** Columns read inside the top-N of a lines query: no expression, so nothing is computed for dropped rows. */
function rawLineColumns(ctx: BuildContext, extra: string[] = []): string[] {
  const level = ctx.columns.includes(LEVEL_COLUMN) || ctx.tenant.level.source === 'column' ? [LEVEL_COLUMN] : [];
  return Array.from(new Set([TIME_COLUMN, MESSAGE_COLUMN, ...level, ...lineColumns(ctx), ...extra])).map(quoteIdent);
}

/**
 * WHERE clauses of a lines query: one, or for a level filter on a "message" tenant with a level column, one per
 * level source (column rows filtered on the column, the others on the message regexp; see levelSplit).
 */
function linesWheres(spec: QuerySpec, ctx: BuildContext, extra: string[]): string[] {
  const split = levelSplit(ctx.tenant, ctx);
  if (activeLevels(spec).length === 0 || split.length === 1) {
    return [whereClause(spec, ctx, { extra })];
  }
  return split.map((p) => whereClause(spec, ctx, { before: [p.cond!], extra, levelBy: p.expr }));
}

/**
 * Top-N lines: the newest (or oldest) rows on the raw columns, then the level (a regexp per line for "message"
 * tenants), __ms and __ts computed on those rows only (UAT: 0.11 s for 1 h and 6 h, any range, with the time
 * column untouched in WHERE and ORDER BY). Several WHERE branches are joined with UNION ALL, each with its own
 * top-N, and cut to the top-N again.
 */
function topLines(
  view: string,
  ctx: BuildContext,
  wheres: string[],
  orderBy: string,
  limit: number,
  opts: { innerExtra?: string[]; outerExtra?: string[] } = {}
): string {
  const n = Math.max(1, Math.floor(limit));
  const raw = rawLineColumns(ctx, opts.innerExtra).join(', ');
  const branches = wheres.map((w) =>
    [`SELECT ${raw}`, from(view, ctx.relation), `WHERE ${w}`, `ORDER BY ${orderBy}`, `LIMIT ${n}`].join('\n')
  );
  const source = branches.length === 1 ? branches[0] : branches.map((b) => `(${b})`).join('\nUNION ALL\n');
  return [
    `SELECT ${[lineSelect(ctx), ...(opts.outerExtra ?? [])].join(', ')}`,
    `FROM (\n${source}\n) l`,
    `ORDER BY ${orderBy}`,
    `LIMIT ${n}`,
  ].join('\n');
}

function lineSelect(ctx: BuildContext): string {
  return [
    `${timeMsExpr(T)} AS __ms`,
    `CAST(${T} AS VARCHAR) AS __ts`,
    M,
    `${levelExpr(ctx.tenant, ctx)} AS detected_level`,
    ...lineColumns(ctx).map(quoteIdent),
  ].join(', ');
}

export function viewsQuery(prefix: string): string {
  return `SHOW TABLES LIKE ${lit(`${prefix}%`)}`;
}

/**
 * One row of a view, for its column names: Grafana returns no columns for an empty result (LIMIT 0). The first
 * try is bounded to the last day on the usual time column (cheap); a view that names its time column
 * differently, or has no recent row, is sampled without a bound (LIMIT 1 stops at the first row).
 */
export function sampleRowQuery(view: string, bounded: boolean): string {
  const where = bounded ? ` WHERE ${T} >= DATE_SUB(NOW(), INTERVAL 1 DAY)` : '';
  return `SELECT * ${from(view)}${where} LIMIT 1`;
}

export function labelValuesQuery(spec: QuerySpec, ctx: BuildContext, key: string, limit = 500): string {
  const col = quoteIdent(key);
  const others = { ...spec, filters: spec.filters.filter((f) => f.key !== key) };
  return [
    `SELECT ${col} AS v, COUNT(*) AS c`,
    from(spec.view, ctx.relation),
    `WHERE ${whereClause(others, ctx, { extra: [`${col} != ''`] })}`,
    `GROUP BY ${col}`,
    `ORDER BY c DESC`,
    `LIMIT ${limit}`,
  ].join('\n');
}

/**
 * Service grid: counts per bucket, label value and level, all values in one scan (two with a level split).
 * `sample` keeps about 1 in n rows and multiplies the counts (for a level split from the message).
 */
export function serviceVolumeQuery(
  spec: QuerySpec,
  ctx: BuildContext,
  label: string,
  bucket: number,
  withLevel = true,
  sample?: number
): string {
  return countByLevel(spec, ctx, {
    select: [`${bucketExpr(bucket)} AS t`, `${quoteIdent(label)} AS v`],
    groupBy: ['t', 'v'],
    levelAlias: 'lvl',
    withLevel,
    sample,
  });
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
    .map(
      (v) =>
        `(${topLines(spec.view, ctx, linesWheres(spec, ctx, [`${col} = ${lit(v)}`]), `${T} DESC`, perValue, {
          innerExtra: [label],
          outerExtra: [`${col} AS __value`],
        })})`
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
  return topLines(spec.view, ctx, linesWheres(spec, ctx, extra), `${T} ${sort === 'asc' ? 'ASC' : 'DESC'}`, limit);
}

/**
 * Log volume by level for the Logs tab histogram ('all' when the level split is skipped). `sample` keeps about 1
 * in n rows and multiplies the counts.
 */
export function volumeQuery(
  spec: QuerySpec,
  ctx: BuildContext,
  bucket: number,
  withLevel = true,
  sample?: number
): string {
  return countByLevel(spec, ctx, {
    select: [`${bucketExpr(bucket)} AS t`],
    groupBy: ['t'],
    levelAlias: 'g',
    withLevel,
    sample,
  });
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
    `  ${from(spec.view, ctx.relation)}`,
    `  WHERE ${whereClause(spec, ctx)}) s`,
    `GROUP BY GROUPING SETS (${cols.map((c) => `(t, ${c})`).join(', ')})`,
  ].join('\n');
}

export function valueBreakdownQuery(spec: QuerySpec, ctx: BuildContext, key: string, bucket: number): string {
  const col = quoteIdent(key);
  return [
    `SELECT ${bucketExpr(bucket)} AS t, ${col} AS v, COUNT(*) AS c`,
    from(spec.view, ctx.relation),
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
    `  ${from(spec.view, ctx.relation)}`,
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
    from(spec.view, ctx.relation),
    `WHERE ${whereClause(spec, ctx, { skipPatterns: true })}`,
    `GROUP BY t, p`,
    `ORDER BY t`,
  ].join('\n');
}

/**
 * The newest line's time as text, in the last day (TopN with LIMIT 1). Run with two session zones to tell an
 * instant-like column from a wall-clock one (sql/timeZone.ts).
 */
export function newestTimeTextQuery(view: string, relation?: string): string {
  return [
    `SELECT CAST(${T} AS VARCHAR) AS t`,
    from(view, relation),
    `WHERE ${T} >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
    `ORDER BY ${T} DESC`,
    `LIMIT 1`,
  ].join('\n');
}

/** The data source's own session zone and its offset from UTC in minutes (run without a time_zone hint). */
export function sessionZoneQuery(): string {
  return 'SELECT @@time_zone AS tz, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS off';
}

/** Is there any line older than beforeMs? LIMIT 1: StarRocks stops at the first row it finds. */
export function anyBeforeQuery(view: string, beforeMs: number, relation?: string): string {
  return `SELECT 1 AS x ${from(view, relation)} WHERE ${T} < FROM_UNIXTIME(${Math.floor(beforeMs / 1000)}) LIMIT 1`;
}

/** Oldest line in a short range (the hour found by the search in findOldest), as epoch ms. */
export function oldestInRangeQuery(view: string, fromMs: number, toMs: number, relation?: string): string {
  const s = (ms: number) => Math.floor(ms / 1000);
  return [
    `SELECT ${timeMsExpr(`MIN(${T})`)} AS oldest`,
    from(view, relation),
    `WHERE ${T} >= FROM_UNIXTIME(${s(fromMs)}) AND ${T} < FROM_UNIXTIME(${s(toMs)})`,
  ].join('\n');
}

/**
 * Lines of the same pod before (backward) or after (forward) a line, within one hour, nearest first. Uses the
 * exact microsecond timestamp of the line. Timestamps are not unique: on UAT 42 % of lines share their exact
 * microsecond with another line of the same pod (always a different message), so lines are ordered by time,
 * then message, and the lines tied with the anchor are on the right side of it.
 */
export function contextQuery(
  view: string,
  ctx: BuildContext,
  podColumn: string,
  pod: string,
  tsRaw: string,
  direction: 'backward' | 'forward',
  limit: number,
  message?: string
): string {
  const ts = `CAST(${lit(tsRaw)} AS DATETIME)`;
  const back = direction === 'backward';
  const cmp = back ? '<' : '>';
  const position =
    message === undefined
      ? `${T} ${cmp} ${ts}`
      : `(${T} ${cmp} ${ts} OR (${T} = ${ts} AND ${M} ${cmp} ${lit(message)}))`;
  const bound = back ? `${T} >= DATE_SUB(${ts}, INTERVAL 1 HOUR)` : `${T} <= DATE_ADD(${ts}, INTERVAL 1 HOUR)`;
  const dir = back ? 'DESC' : 'ASC';
  return topLines(
    view,
    ctx,
    [`${quoteIdent(podColumn)} = ${lit(pod)} AND ${position} AND ${bound}`],
    `${T} ${dir}${message === undefined ? '' : `, ${M} ${dir}`}`,
    limit,
    { innerExtra: [podColumn] }
  );
}
