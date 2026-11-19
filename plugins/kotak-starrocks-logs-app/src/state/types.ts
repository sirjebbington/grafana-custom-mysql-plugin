export type LabelOp = '=' | '!=' | '=~' | '!~';

/** Filter on a view column (k8s_service_name, k8s_pod_name, ...). */
export interface LabelFilter {
  key: string;
  op: LabelOp;
  value: string;
}

/** Search in the log line. Case-insensitive substring by default. */
export interface LineFilter {
  op: 'include' | 'exclude';
  value: string;
  caseSensitive: boolean;
  regex: boolean;
}

/** Include or exclude one of the tenant's configured patterns. */
export interface PatternFilter {
  name: string;
  op: 'include' | 'exclude';
}

/** Filter on a key=value (logfmt) or "key":"value" (JSON) pair inside the message. */
export interface MessageFieldFilter {
  key: string;
  op: '=' | '!=';
  value: string;
}

/** Everything that narrows the rows of a view, independent of the time range. */
export interface QuerySpec {
  /** uid of the kotak-starrocks-datasource instance (one StarRocks database); '' = the default one */
  datasource: string;
  view: string;
  filters: LabelFilter[];
  levels: string[];
  lineFilters: LineFilter[];
  patternFilters: PatternFilter[];
  fieldFilters: MessageFieldFilter[];
}

export type QueryKind =
  | 'serviceVolume'
  | 'serviceSamples'
  | 'volume'
  | 'logs'
  | 'table'
  | 'labelOverview'
  | 'valueBreakdown'
  | 'fieldBreakdown'
  | 'patterns';

export interface QueryParams {
  label?: string;
  values?: string[];
  labels?: string[];
  field?: string;
  limit?: number;
  sort?: 'desc' | 'asc';
  perValue?: number;
  topN?: number;
  /** volume queries: split by level (false skips the message scan for message-derived levels) */
  withLevel?: boolean;
}

export function emptySpec(view: string, datasource = ''): QuerySpec {
  return { datasource, view, filters: [], levels: [], lineFilters: [], patternFilters: [], fieldFilters: [] };
}
