import { DEFAULT_FIELDS, DEFAULT_LABELS, DEFAULT_MESSAGE_LEVEL_REGEX } from '../constants';

/** How a tenant's level is obtained. `column` reads the `level` column; `message` extracts it with regexes. */
export interface LevelConfig {
  source: 'column' | 'message';
  /** message source only: RE2 regexes tried in order; the first capture group is the level word */
  regex?: string | string[];
}

/** Turns a trace id found in the message into a link that opens the trace in Explore. */
export interface TraceConfig {
  /** RE2/JS regex; the first capture group is the trace id */
  regex: string;
  /** uid of the Tempo data source that holds this tenant's traces */
  tempoUid: string;
  linkTitle?: string;
}

/** A named log pattern. Exactly one of `like` (SQL LIKE, use % as wildcard) or `regex` (RE2). */
export interface PatternConfig {
  name: string;
  like?: string;
  regex?: string;
}

export interface TenantConfig {
  level?: LevelConfig;
  trace?: TraceConfig;
  patterns?: PatternConfig[];
}

/** One StarRocks data source (one database) offered in the app's data source picker. */
export interface DatasourceEntry {
  uid: string;
  /** views of this data source are named <viewPrefix><app_id>; default: the top-level viewPrefix */
  viewPrefix?: string;
}

/** jsonData of the app (provisioned through provisioning/plugins or edited on the configuration page). */
export interface AppJsonData {
  /** the data source selected by default */
  datasourceUid?: string;
  datasourceType?: string;
  /**
   * Data sources offered in the picker, in this order (uids, or {uid, viewPrefix}). Each
   * kotak-starrocks-datasource instance is scoped to one database. Default: every instance of
   * datasourceType that the user can see.
   */
  datasources?: Array<string | DatasourceEntry>;
  viewPrefix?: string;
  serviceLabel?: string;
  defaultTimeRange?: string;
  /** longest time range a user can select, in hours (default 24); longer ranges are cut to this length */
  maxRangeHours?: number;
  /**
   * text scans (line search, fields inside the message, patterns, levels read from the message) over a longer
   * range: the Logs tab searches newest-first and loads the volume chart on request; Labels, Fields and
   * Patterns ask first
   */
  maxScanHours?: number;
  lineLimit?: number;
  /**
   * StarRocks query_timeout for every statement the app sends, in seconds, as a SET_VAR hint (default 120;
   * 0 = the cluster default). A backstop: StarRocks also stops a query when Grafana cancels it.
   */
  queryTimeoutSeconds?: number;
  /**
   * Session time zone of the app's statements (SET_VAR hint). "auto" (default): found per view by a probe
   * (an Iceberg timestamptz column gets '+00:00'; a wall-clock column gets the zone of its wall clock).
   * "session": the data source's own session zone. Or a zone such as "+00:00" or "Asia/Kolkata".
   */
  timeZone?: string;
  labels?: string[];
  fields?: string[];
  /**
   * keyed by app_id (the view name without the prefix), or <datasourceUid>/<app_id> for settings that only
   * apply in one data source; "default" applies to every tenant
   */
  tenants?: Record<string, TenantConfig>;
}

export interface ResolvedTenant {
  key: string;
  level: { source: 'column' | 'message'; regex: string[] };
  trace?: TraceConfig;
  patterns: PatternConfig[];
}

export interface ResolvedConfig {
  /** default data source and the plugin type of all data sources the app uses */
  datasource: { uid: string; type: string };
  /** explicit list for the picker; empty = every instance of datasource.type */
  datasources: DatasourceEntry[];
  viewPrefix: string;
  serviceLabel: string;
  defaultTimeRange: string;
  maxRangeHours: number;
  maxScanHours: number;
  lineLimit: number;
  queryTimeoutSeconds: number;
  timeZone: string;
  labels: string[];
  fields: string[];
  tenants: Record<string, TenantConfig>;
}

export const DEFAULT_CONFIG: ResolvedConfig = {
  datasource: { uid: 'app-logs-starrocks-db', type: 'kotak-starrocks-datasource' },
  datasources: [],
  viewPrefix: 'vw_eks_app_logs_',
  serviceLabel: 'k8s_service_name',
  defaultTimeRange: 'now-15m',
  maxRangeHours: 24,
  maxScanHours: 6,
  lineLimit: 1000,
  queryTimeoutSeconds: 120,
  timeZone: 'auto',
  labels: DEFAULT_LABELS,
  fields: DEFAULT_FIELDS,
  tenants: {},
};

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PREFIX = /^[A-Za-z0-9_]+$/;
const DS_UID = /^[A-Za-z0-9._-]{1,128}$/;
// app_id, or <datasourceUid>/<app_id>
const TENANT_KEY = /^(?:[A-Za-z0-9._-]{1,128}\/)?[A-Za-z0-9_]+$/;

export function isIdentifier(s: unknown): s is string {
  return typeof s === 'string' && IDENT.test(s);
}

function regexError(re: string, needsGroup: boolean): string | undefined {
  try {
    // RE2 accepts a leading (?i); JavaScript does not, so strip it for the syntax check.
    const compiled = new RegExp(re.replace(/^\(\?i\)/, ''));
    if (needsGroup && new RegExp(`${compiled.source}|`).exec('')!.length < 2) {
      return 'needs a capture group';
    }
    return undefined;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

function asList(v: string | string[] | undefined): string[] {
  if (v === undefined) {
    return [];
  }
  return Array.isArray(v) ? v : [v];
}

/**
 * Applies defaults to the app's jsonData and validates it. Invalid entries are dropped and reported, so a
 * single mistake in one tenant does not break the app for everyone.
 */
export function resolveConfig(jsonData?: AppJsonData | null): { config: ResolvedConfig; errors: string[] } {
  const j = jsonData ?? {};
  const errors: string[] = [];
  const c: ResolvedConfig = { ...DEFAULT_CONFIG, datasources: [], tenants: {} };

  if (j.datasourceUid !== undefined) {
    if (typeof j.datasourceUid === 'string' && j.datasourceUid.trim() !== '') {
      c.datasource = { ...c.datasource, uid: j.datasourceUid.trim() };
    } else {
      errors.push('datasourceUid must be a non-empty string');
    }
  }
  if (typeof j.datasourceType === 'string' && j.datasourceType.trim() !== '') {
    c.datasource = { ...c.datasource, type: j.datasourceType.trim() };
  }
  if (j.datasources !== undefined) {
    if (!Array.isArray(j.datasources)) {
      errors.push('datasources must be a list of data source uids');
    } else {
      for (const d of j.datasources) {
        const entry: DatasourceEntry | undefined =
          typeof d === 'string' ? { uid: d } : d && typeof d === 'object' && typeof d.uid === 'string' ? d : undefined;
        if (!entry || !DS_UID.test(entry.uid)) {
          errors.push(`datasources: ${JSON.stringify(d)} is not a data source uid`);
          continue;
        }
        if (
          entry.viewPrefix !== undefined &&
          !(typeof entry.viewPrefix === 'string' && PREFIX.test(entry.viewPrefix))
        ) {
          errors.push(
            `datasources.${entry.uid}.viewPrefix "${entry.viewPrefix}" may only contain letters, digits and _`
          );
          continue;
        }
        if (c.datasources.some((x) => x.uid === entry.uid)) {
          errors.push(`datasources: "${entry.uid}" is listed twice`);
          continue;
        }
        c.datasources.push(entry.viewPrefix ? { uid: entry.uid, viewPrefix: entry.viewPrefix } : { uid: entry.uid });
      }
    }
  }
  if (j.viewPrefix !== undefined) {
    if (typeof j.viewPrefix === 'string' && PREFIX.test(j.viewPrefix)) {
      c.viewPrefix = j.viewPrefix;
    } else {
      errors.push(`viewPrefix "${j.viewPrefix}" may only contain letters, digits and _`);
    }
  }
  if (j.serviceLabel !== undefined) {
    if (isIdentifier(j.serviceLabel)) {
      c.serviceLabel = j.serviceLabel;
    } else {
      errors.push(`serviceLabel "${j.serviceLabel}" is not a column name`);
    }
  }
  if (j.defaultTimeRange !== undefined) {
    if (typeof j.defaultTimeRange === 'string' && /^now-\d+[smhdw]$/.test(j.defaultTimeRange)) {
      c.defaultTimeRange = j.defaultTimeRange;
    } else {
      errors.push(`defaultTimeRange "${j.defaultTimeRange}" must look like now-15m`);
    }
  }
  if (j.maxRangeHours !== undefined) {
    if (typeof j.maxRangeHours === 'number' && j.maxRangeHours >= 1 && j.maxRangeHours <= 24 * 90) {
      c.maxRangeHours = j.maxRangeHours;
    } else {
      errors.push('maxRangeHours must be a number between 1 and 2160');
    }
  }
  if (j.maxScanHours !== undefined) {
    if (typeof j.maxScanHours === 'number' && j.maxScanHours > 0 && j.maxScanHours <= 24 * 90) {
      c.maxScanHours = j.maxScanHours;
    } else {
      errors.push('maxScanHours must be a number between 0 and 2160');
    }
  }
  if (j.lineLimit !== undefined) {
    if (typeof j.lineLimit === 'number' && Number.isInteger(j.lineLimit) && j.lineLimit >= 10 && j.lineLimit <= 5000) {
      c.lineLimit = j.lineLimit;
    } else {
      errors.push('lineLimit must be an integer between 10 and 5000');
    }
  }
  if (j.queryTimeoutSeconds !== undefined) {
    const t = j.queryTimeoutSeconds;
    if (typeof t === 'number' && Number.isInteger(t) && t >= 0 && t <= 3600) {
      c.queryTimeoutSeconds = t;
    } else {
      errors.push('queryTimeoutSeconds must be an integer between 0 and 3600');
    }
  }
  if (j.timeZone !== undefined) {
    if (
      typeof j.timeZone === 'string' &&
      /^(auto|session|[+-]\d{2}:\d{2}|[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*)$/.test(j.timeZone)
    ) {
      c.timeZone = j.timeZone;
    } else {
      errors.push('timeZone must be "auto", "session", or a zone like "+00:00" or "Asia/Kolkata"');
    }
  }
  for (const key of ['labels', 'fields'] as const) {
    const v = j[key];
    if (v === undefined) {
      continue;
    }
    if (!Array.isArray(v)) {
      errors.push(`${key} must be a list of column names`);
      continue;
    }
    const good = v.filter(isIdentifier);
    v.filter((x) => !isIdentifier(x)).forEach((x) => errors.push(`${key}: "${x}" is not a column name`));
    c[key] = good;
  }
  if (!c.labels.includes(c.serviceLabel)) {
    c.labels = [c.serviceLabel, ...c.labels];
  }

  for (const [key, t] of Object.entries(j.tenants ?? {})) {
    if (key !== 'default' && !TENANT_KEY.test(key)) {
      errors.push(`tenants: "${key}" is not an app_id or <datasourceUid>/<app_id>`);
      continue;
    }
    c.tenants[key] = validateTenant(key, t ?? {}, errors);
  }
  return { config: c, errors };
}

function validateTenant(key: string, t: TenantConfig, errors: string[]): TenantConfig {
  const out: TenantConfig = {};
  const where = `tenants.${key}`;
  if (t.level !== undefined) {
    if (t.level.source === 'column') {
      out.level = { source: 'column' };
    } else if (t.level.source === 'message') {
      const regex = asList(t.level.regex).filter((r) => {
        const err = regexError(r, true);
        if (err) {
          errors.push(`${where}.level.regex "${r}": ${err}`);
        }
        return !err;
      });
      out.level = { source: 'message', regex: regex.length > 0 ? regex : undefined };
    } else {
      errors.push(`${where}.level.source must be "column" or "message"`);
    }
  }
  if (t.trace !== undefined) {
    const err = typeof t.trace.regex === 'string' ? regexError(t.trace.regex, true) : 'missing';
    if (err) {
      errors.push(`${where}.trace.regex: ${err}`);
    } else if (typeof t.trace.tempoUid !== 'string' || t.trace.tempoUid === '') {
      errors.push(`${where}.trace.tempoUid is required`);
    } else {
      out.trace = { regex: t.trace.regex, tempoUid: t.trace.tempoUid, linkTitle: t.trace.linkTitle };
    }
  }
  if (t.patterns !== undefined) {
    const seen = new Set<string>();
    out.patterns = [];
    for (const p of Array.isArray(t.patterns) ? t.patterns : []) {
      const name = typeof p?.name === 'string' ? p.name.trim() : '';
      const hasLike = typeof p?.like === 'string' && p.like !== '';
      const hasRegex = typeof p?.regex === 'string' && p.regex !== '';
      if (name === '' || hasLike === hasRegex) {
        errors.push(`${where}.patterns: "${name || '?'}" needs a name and exactly one of like / regex`);
        continue;
      }
      if (seen.has(name)) {
        errors.push(`${where}.patterns: duplicate name "${name}"`);
        continue;
      }
      if (hasRegex) {
        const err = regexError(p.regex!, false);
        if (err) {
          errors.push(`${where}.patterns "${name}": ${err}`);
          continue;
        }
      }
      seen.add(name);
      out.patterns.push(hasLike ? { name, like: p.like } : { name, regex: p.regex });
    }
  }
  return out;
}

export function tenantKeyForView(view: string, prefix: string): string {
  return view.startsWith(prefix) ? view.slice(prefix.length) : view;
}

/** View name prefix of a data source (its own, or the top-level viewPrefix). */
export function viewPrefixFor(config: ResolvedConfig, datasourceUid?: string): string {
  return config.datasources.find((d) => d.uid === datasourceUid)?.viewPrefix ?? config.viewPrefix;
}

/**
 * Settings for a view: each field comes from tenants["<datasourceUid>/<app_id>"], then tenants["<app_id>"],
 * then tenants.default.
 */
export function resolveTenant(config: ResolvedConfig, view: string, datasourceUid?: string): ResolvedTenant {
  const key = tenantKeyForView(view, viewPrefixFor(config, datasourceUid));
  const d = config.tenants.default ?? {};
  const t = config.tenants[key] ?? {};
  const s = (datasourceUid && config.tenants[`${datasourceUid}/${key}`]) || {};
  const level = s.level ?? t.level ?? d.level ?? { source: 'column' };
  const regex = level.source === 'message' ? asList(level.regex) : [];
  return {
    key,
    level: {
      source: level.source,
      regex: level.source === 'message' && regex.length === 0 ? DEFAULT_MESSAGE_LEVEL_REGEX : regex,
    },
    trace: s.trace ?? t.trace ?? d.trace,
    patterns: s.patterns ?? t.patterns ?? d.patterns ?? [],
  };
}

let current: { config: ResolvedConfig; errors: string[] } = { config: DEFAULT_CONFIG, errors: [] };

export function setAppConfig(jsonData?: AppJsonData | null) {
  current = resolveConfig(jsonData);
}

export function getAppConfig(): ResolvedConfig {
  return current.config;
}

export function getAppConfigErrors(): string[] {
  return current.errors;
}
