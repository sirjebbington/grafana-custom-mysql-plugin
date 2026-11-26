import { ColumnRole, COLUMN_ROLES, isIdentifier } from '../config/config';
import { LEVEL_COLUMN, MESSAGE_COLUMN, TIME_COLUMN } from '../constants';
import { quoteIdent } from './builder';

/**
 * How a view's columns are used. The app's queries use their own names for the time, message and level
 * (observed_timestamp, message, level); a view that names them differently (the GenAI views) is read through a
 * derived table that renames them, so every query works on any view. Everything else in the view is shown: known
 * labels and fields as before, other columns as fields (structured JSON columns only in the log details).
 */

/** Common names for each role, tried in order (case-insensitive) unless the tenant names the column. */
export const COLUMN_CANDIDATES: Record<ColumnRole, string[]> = {
  time: ['observed_timestamp', 'timestamp', 'event_time', 'log_time', 'time', 'ts', 'datetime', 'created_at'],
  message: ['message', 'body', 'log', 'msg', 'log_message', 'line', 'content', 'text'],
  level: ['level', 'severity_text', 'severity', 'log_level', 'loglevel', 'lvl', 'level_name'],
  service: ['k8s_service_name', 'service_name', 'service', 'app_name', 'application', 'agent_name', 'k8s_app_name'],
  pod: ['k8s_pod_uid', 'k8s_pod_name', 'pod_uid', 'pod_name', 'pod', 'instance_id', 'hostname', 'host_name', 'host'],
};

/** Columns never shown: internal to the pipeline (the view filters on app_id). */
export const HIDDEN_COLUMNS = ['app_id', 'level_parser'];

export interface ViewColumns {
  /** FROM target when the view's names differ from the app's; undefined: the view itself */
  relation?: string;
  /** the columns the app's queries see (after renaming) */
  columns: string[];
  labels: string[];
  fields: string[];
  /** structured (JSON) columns: in the log details, never grouped by */
  details: string[];
  /** label of the value grid */
  serviceLabel?: string;
  /** columns that identify the source of a line (Show context, sampling), best first */
  podColumns: string[];
  hasLevel: boolean;
  /** the view column that fills each role */
  found: Partial<Record<ColumnRole, string>>;
}

export interface ColumnOptions {
  /** known label and field names (config labels / fields) */
  labels: string[];
  fields: string[];
  /** the configured grid label, used when the view has it */
  serviceLabel: string;
  /** the tenant's column names per role */
  overrides: Partial<Record<ColumnRole, string>>;
  hidden?: string[];
}

function looksStructured(v: unknown): boolean {
  if (v !== null && typeof v === 'object') {
    return true;
  }
  const s = typeof v === 'string' ? v.trim() : '';
  return (s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'));
}

/**
 * Works out the roles and the derived table of a view from its column names (and one sample row, to tell
 * structured columns from plain ones). Throws when the view has no time or no message column.
 */
export function resolveViewColumns(
  view: string,
  names: string[],
  sample: Record<string, unknown> | undefined,
  opts: ColumnOptions
): ViewColumns {
  const cols = names.filter((n) => isIdentifier(n));
  const byLower = new Map(cols.map((c) => [c.toLowerCase(), c]));
  const find = (role: ColumnRole): string | undefined => {
    const wanted = opts.overrides[role];
    if (wanted) {
      return byLower.get(wanted.toLowerCase());
    }
    return COLUMN_CANDIDATES[role].map((c) => byLower.get(c)).find((c) => c !== undefined);
  };
  const found: Partial<Record<ColumnRole, string>> = {};
  for (const role of COLUMN_ROLES) {
    const c = find(role);
    if (c) {
      found[role] = c;
    }
  }
  const missing = (role: ColumnRole) =>
    new Error(
      `${view} has no ${role} column (looked for ${opts.overrides[role] ?? COLUMN_CANDIDATES[role].join(', ')}). ` +
        `Name it in the app configuration: tenants.<app_id>.columns.${role}`
    );
  if (!found.time) {
    throw missing('time');
  }
  if (!found.message) {
    throw missing('message');
  }
  const time = found.time;
  const message = found.message;
  const level = found.level;
  const rename = time !== TIME_COLUMN || message !== MESSAGE_COLUMN || (level !== undefined && level !== LEVEL_COLUMN);

  // the other columns, as the queries see them (a column named like a role it does not fill is left out when
  // renaming, so the names stay unique)
  const reserved = new Set([TIME_COLUMN, MESSAGE_COLUMN, LEVEL_COLUMN]);
  const roleCols = new Set([time, message, level].filter((c): c is string => c !== undefined));
  const rest = cols.filter((c) => !roleCols.has(c) && !(rename && reserved.has(c)));
  const columns = [TIME_COLUMN, MESSAGE_COLUMN, ...(level ? [LEVEL_COLUMN] : []), ...rest];

  let relation: string | undefined;
  if (rename) {
    const select = [
      `${quoteIdent(time)} AS ${quoteIdent(TIME_COLUMN)}`,
      // CAST: a VARIANT or JSON message becomes its text
      `CAST(${quoteIdent(message)} AS VARCHAR) AS ${quoteIdent(MESSAGE_COLUMN)}`,
      ...(level ? [`CAST(${quoteIdent(level)} AS VARCHAR) AS ${quoteIdent(LEVEL_COLUMN)}`] : []),
      ...rest.map((c) => quoteIdent(c)),
    ];
    relation = `(SELECT ${select.join(', ')} FROM ${quoteIdent(view)}) AS ${quoteIdent(view)}`;
  }

  const hidden = new Set(opts.hidden ?? HIDDEN_COLUMNS);
  const visible = rest.filter((c) => !hidden.has(c));
  const service = found.service ?? (visible.includes(opts.serviceLabel) ? opts.serviceLabel : undefined);
  const structured = new Set(visible.filter((c) => sample !== undefined && looksStructured(sample[c])));
  const knownLabels = opts.labels.filter((c) => visible.includes(c) && !structured.has(c));
  const labels = service && !knownLabels.includes(service) ? [service, ...knownLabels] : knownLabels;
  const knownFields = opts.fields.filter((c) => visible.includes(c) && !labels.includes(c) && !structured.has(c));
  const extra = visible.filter((c) => !labels.includes(c) && !knownFields.includes(c) && !structured.has(c));
  const fields = [...knownFields, ...extra];
  const details = visible.filter((c) => structured.has(c));
  const podColumns = [
    ...(found.pod ? [found.pod] : []),
    ...COLUMN_CANDIDATES.pod.map((c) => byLower.get(c)).filter((c): c is string => c !== undefined),
  ].filter((c, i, a) => a.indexOf(c) === i && columns.includes(c));

  return {
    relation,
    columns,
    labels,
    fields,
    details,
    serviceLabel: service ?? labels[0] ?? fields[0],
    podColumns,
    hasLevel: level !== undefined,
    found,
  };
}

/** The column that identifies a line's source (Show context: lines of the same one), among those the line has. */
export function podColumnOf(labels: Record<string, string>, preferred: string[] = []): string | undefined {
  return [...preferred, ...COLUMN_CANDIDATES.pod].find((c) => labels[c]);
}
