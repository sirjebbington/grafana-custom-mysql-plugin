import { Observable, catchError, firstValueFrom, map, of } from 'rxjs';

import { DataFrame, DataQueryResponse, TimeRange } from '@grafana/data';
import {
  BackendDataSourceResponse,
  FetchResponse,
  getBackendSrv,
  getDataSourceSrv,
  toDataQueryResponse,
} from '@grafana/runtime';

import { getAppConfig, viewPrefixFor } from '../config/config';
import { columnsQuery, queryHint, viewsQuery, withQueryHint } from '../sql/builder';

export interface StarRocksDatasource {
  uid: string;
  name: string;
}

/**
 * The kotak-starrocks-datasource instances offered in the picker: the configured list (in its order), or
 * every instance of the plugin type the user can see. Each instance is scoped to one StarRocks database.
 */
export function listDatasources(): StarRocksDatasource[] {
  const { datasource, datasources } = getAppConfig();
  // pluginId, not type: Grafana 12.0 getList() appends "-- Grafana --" unless pluginId (or alerting) is set
  const all = getDataSourceSrv()
    .getList({ pluginId: datasource.type })
    .filter((ds) => ds.type === datasource.type)
    .map((ds) => ({ uid: ds.uid, name: ds.name }));
  if (datasources.length === 0) {
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }
  return datasources
    .map((d) => all.find((x) => x.uid === d.uid))
    .filter((x): x is StarRocksDatasource => x !== undefined);
}

// session time zone per data source and view, found by datasource/timeZone.ts (undefined = session default)
const sessionZones = new Map<string, string | undefined>();

function zoneKey(datasource: string | undefined, view: string): string {
  return `${datasource || getAppConfig().datasource.uid}/${view}`;
}

export function setSessionZone(datasource: string | undefined, view: string, zone: string | undefined) {
  sessionZones.set(zoneKey(datasource, view), zone);
}

/** The session zone the app's statements on this view run in (undefined: the data source's default). */
export function sessionZone(datasource: string | undefined, view: string | undefined): string | undefined {
  const tz = getAppConfig().timeZone;
  if (tz === 'session') {
    return undefined;
  }
  if (tz !== 'auto') {
    return tz;
  }
  return view ? sessionZones.get(zoneKey(datasource, view)) : undefined;
}

/** The SET_VAR hint the app adds to statements on a view (session zone, query timeout). */
export function appQueryHint(opts: { datasource?: string; view?: string; timeoutSeconds?: number } = {}): string {
  return queryHint({
    timeZone: sessionZone(opts.datasource, opts.view),
    timeoutSeconds: opts.timeoutSeconds ?? getAppConfig().queryTimeoutSeconds,
  });
}

/**
 * Runs SQL through a kotak-starrocks-datasource instance via Grafana's /api/ds/query. Grafana's OAuth
 * middleware attaches the signed-in user's IDAM token, so StarRocks and Ranger see the user, exactly as for
 * dashboard panels. The datasource's frontend is bypassed on purpose: the SQL is sent as built, without
 * template-variable interpolation, plus the app's SET_VAR hint (UTC session, query timeout).
 *
 * Unsubscribing cancels the HTTP request; Grafana then cancels the data source call, the data source closes
 * its StarRocks connection, and StarRocks stops the query (mysql_service_kill_after_disconnect).
 */
export function runSql(
  sql: string,
  opts: {
    /** data source uid; default: the configured default data source */
    datasource?: string;
    refId: string;
    range: TimeRange;
    requestId?: string;
    maxDataPoints?: number;
    intervalMs?: number;
    /** query_timeout for this statement; default: the app's queryTimeoutSeconds */
    timeoutSeconds?: number;
    /** the view queried: its session zone is used (see datasource/timeZone.ts) */
    view?: string;
    /** session zone for this statement instead of the view's (the zone probe); null = none */
    timeZone?: string | null;
  }
): Observable<DataQueryResponse> {
  const { datasource } = getAppConfig();
  const hint =
    opts.timeZone !== undefined
      ? queryHint({
          timeZone: opts.timeZone ?? undefined,
          timeoutSeconds: opts.timeoutSeconds ?? getAppConfig().queryTimeoutSeconds,
        })
      : appQueryHint({ datasource: opts.datasource, view: opts.view, timeoutSeconds: opts.timeoutSeconds });
  sql = withQueryHint(sql, hint);
  const query = {
    refId: opts.refId,
    datasource: { type: datasource.type, uid: opts.datasource || datasource.uid },
    rawSql: sql,
    format: 'table',
    rawQuery: true,
    editorMode: 'code',
    maxDataPoints: opts.maxDataPoints ?? 1000,
    intervalMs: opts.intervalMs ?? 1000,
  };
  return getBackendSrv()
    .fetch<BackendDataSourceResponse>({
      url: '/api/ds/query',
      method: 'POST',
      data: { queries: [query], from: String(opts.range.from.valueOf()), to: String(opts.range.to.valueOf()) },
      requestId: opts.requestId,
      // errors are returned as DataQueryResponse.errors so panels can show them
      showErrorAlert: false,
    })
    .pipe(
      map((res: FetchResponse<BackendDataSourceResponse>) => toResponse(res)),
      // a failed query comes back as HTTP 4xx/5xx; the FetchError still carries the per-query results
      catchError((err) => of(toResponse(err)))
    );

  function toResponse(res: unknown): DataQueryResponse {
    const out = toDataQueryResponse(res as FetchResponse<BackendDataSourceResponse>, [query]);
    for (const frame of out.data as DataFrame[]) {
      frame.meta = { ...frame.meta, executedQueryString: frame.meta?.executedQueryString ?? sql };
    }
    out.errors = out.errors?.map((e) => ({ ...e, message: friendlyError(e.message ?? '') }));
    if (out.error) {
      out.error = { ...out.error, message: friendlyError(out.error.message ?? '') };
    }
    return out;
  }
}

export async function runSqlOnce(
  sql: string,
  range: TimeRange,
  refId = 'A',
  datasource?: string,
  opts: { timeoutSeconds?: number; view?: string; timeZone?: string | null } = {}
): Promise<DataFrame[]> {
  const res = await firstValueFrom(runSql(sql, { refId, range, datasource, ...opts }));
  const err = res.errors?.[0] ?? res.error;
  if (err) {
    throw new Error(err.message ?? 'query failed');
  }
  return res.data as DataFrame[];
}

/** Adds an explanation to StarRocks errors users are likely to hit. */
export function friendlyError(message: string): string {
  if (/\b5204\b/.test(message)) {
    return `Access denied by Ranger (5204). You may not have access to this view. ${message}`;
  }
  if (/\b5203\b/.test(message) && /on DATABASE/i.test(message)) {
    // StarRocks 4.1: a user without any grant in the database logs in, then listing its views fails
    return `You have no access to any log view in this database. Ask for access to your team's log view. (StarRocks: ${message})`;
  }
  if (/\b5203\b/.test(message)) {
    return `Access denied by StarRocks (5203). ${message}`;
  }
  if (/invalid connection/i.test(message)) {
    // kotak-starrocks-datasource 0.1.0 reports a login rejected at the default-database check this way
    return `StarRocks refused the connection. Usually your account has no access to any log view in this database (Ranger), or your IDAM token was rejected. (${message})`;
  }
  if (/timeout|timed out|time limit/i.test(message) && /query/i.test(message)) {
    return `The query took longer than the time limit. Narrow the time range or add label filters. (${message})`;
  }
  if (/no IDAM token/i.test(message)) {
    return `Sign in with IDAM to query StarRocks. ${message}`;
  }
  return message;
}

export function stringColumn(frame: DataFrame | undefined, name?: string): string[] {
  const field = name ? frame?.fields.find((f) => f.name === name) : frame?.fields[0];
  return (field?.values ?? []).map((v) => (v === null || v === undefined ? '' : String(v)));
}

/** Views (vw_eks_app_logs_*) of a data source's database that this user can see (SHOW TABLES, Ranger-filtered). */
export async function fetchViews(range: TimeRange, datasource?: string): Promise<string[]> {
  const viewPrefix = viewPrefixFor(getAppConfig(), datasource);
  const frames = await runSqlOnce(viewsQuery(viewPrefix), range, 'views', datasource);
  return stringColumn(frames[0])
    .filter((v) => v.startsWith(viewPrefix))
    .sort();
}

const columnCache = new Map<string, Promise<string[]>>();

/** Column names of a view. DESCRIBE is denied by Ranger, so this uses SELECT * ... LIMIT 0. */
export function fetchColumns(view: string, range: TimeRange, datasource?: string): Promise<string[]> {
  const key = `${datasource ?? ''}/${view}`;
  let p = columnCache.get(key);
  if (!p) {
    p = runSqlOnce(columnsQuery(view), range, 'columns', datasource).then((frames) =>
      (frames[0]?.fields ?? []).map((f) => f.name)
    );
    p.catch(() => columnCache.delete(key));
    columnCache.set(key, p);
  }
  return p;
}
