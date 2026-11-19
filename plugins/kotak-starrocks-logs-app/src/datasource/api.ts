import { Observable, catchError, firstValueFrom, map, of } from 'rxjs';

import { DataFrame, DataQueryResponse, TimeRange } from '@grafana/data';
import { BackendDataSourceResponse, FetchResponse, getBackendSrv, toDataQueryResponse } from '@grafana/runtime';

import { getAppConfig } from '../config/config';
import { columnsQuery, viewsQuery } from '../sql/builder';

/**
 * Runs SQL through the configured kotak-starrocks-datasource via Grafana's /api/ds/query. Grafana's OAuth
 * middleware attaches the signed-in user's IDAM token, so StarRocks and Ranger see the user, exactly as for
 * dashboard panels. The datasource's frontend is bypassed on purpose: the SQL is sent as built, without
 * template-variable interpolation.
 */
export function runSql(
  sql: string,
  opts: { refId: string; range: TimeRange; requestId?: string; maxDataPoints?: number; intervalMs?: number }
): Observable<DataQueryResponse> {
  const { datasource } = getAppConfig();
  const query = {
    refId: opts.refId,
    datasource,
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

export async function runSqlOnce(sql: string, range: TimeRange, refId = 'A'): Promise<DataFrame[]> {
  const res = await firstValueFrom(runSql(sql, { refId, range }));
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
  if (/\b5203\b/.test(message)) {
    return `Access denied by StarRocks (5203). ${message}`;
  }
  if (/invalid connection/i.test(message)) {
    // kotak-starrocks-datasource 0.1.0 reports a login rejected at the default-database check this way
    return `StarRocks refused the connection. Usually your account has no access to any log view in this database (Ranger), or your IDAM token was rejected. (${message})`;
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

/** Views (vw_eks_app_logs_*) this user can see. SHOW TABLES is filtered by Ranger. */
export async function fetchViews(range: TimeRange): Promise<string[]> {
  const { viewPrefix } = getAppConfig();
  const frames = await runSqlOnce(viewsQuery(viewPrefix), range, 'views');
  return stringColumn(frames[0])
    .filter((v) => v.startsWith(viewPrefix))
    .sort();
}

const columnCache = new Map<string, Promise<string[]>>();

/** Column names of a view. DESCRIBE is denied by Ranger, so this uses SELECT * ... LIMIT 0. */
export function fetchColumns(view: string, range: TimeRange): Promise<string[]> {
  let p = columnCache.get(view);
  if (!p) {
    p = runSqlOnce(columnsQuery(view), range, 'columns').then((frames) => (frames[0]?.fields ?? []).map((f) => f.name));
    p.catch(() => columnCache.delete(view));
    columnCache.set(view, p);
  }
  return p;
}
