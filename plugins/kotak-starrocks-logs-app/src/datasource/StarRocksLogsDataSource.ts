import {
  Observable,
  Subscription,
  catchError,
  combineLatest,
  defer,
  from,
  lastValueFrom,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';

import {
  DataFrame,
  DataQueryError,
  DataQueryRequest,
  DataQueryResponse,
  LoadingState,
  LogRowContextOptions,
  LogRowContextQueryDirection,
  LogRowModel,
  TimeRange,
  dateTime,
} from '@grafana/data';
import { RuntimeDataSource } from '@grafana/scenes';
import { createElement, ReactNode } from 'react';
import { DataQuery } from '@grafana/schema';

import {
  DEFAULT_FIELDS,
  DEFAULT_LABELS,
  LEVEL_COLUMN,
  MESSAGE_COLUMN,
  POD_NAME_COLUMN,
  POD_UID_COLUMN,
  RUNTIME_DS_TYPE,
  RUNTIME_DS_UID,
  TIME_COLUMN,
} from '../constants';
import { getAppConfig, resolveTenant } from '../config/config';
import {
  BuildContext,
  contextQuery,
  fieldBreakdownQuery,
  labelOverviewQuery,
  logsQuery,
  needsMessageScan,
  patternsQuery,
  pickBucketSeconds,
  planWindows,
  serviceSamplesQuery,
  serviceVolumeQuery,
  TimeWindow,
  valueBreakdownQuery,
  volumeQuery,
  widenToSeconds,
} from '../sql/builder';
import { QueryKind, QueryParams, QuerySpec } from '../state/types';
import { fetchColumns, runSql } from './api';
import { ContextScope } from './ContextScope';
import { getCached, putCached } from './queryCache';
import { ensureSessionZone } from './timeZone';
import {
  concatFrames,
  groupValuesOf,
  toLabelOverviewFrames,
  toLevelFrames,
  toLogsFrame,
  toPatternFrames,
  toServiceFrames,
  toTableFrame,
  toValueFrames,
} from './frames';

export interface LogsAppQuery extends DataQuery {
  kind: QueryKind;
  spec: QuerySpec;
  params?: QueryParams;
}

/** Progress of a windowed text search, in meta.custom.search of the lines frame. */
export interface SearchProgress {
  /** part of the time range searched so far (ms) */
  searchedFromMs: number;
  searchedToMs: number;
  rangeFromMs: number;
  rangeToMs: number;
  windows: number;
  totalWindows: number;
  lines: number;
  limit: number;
  done: boolean;
}

export function searchProgressOf(frame?: DataFrame): SearchProgress | undefined {
  return frame?.meta?.custom?.search as SearchProgress | undefined;
}

const ALL_COLUMNS = [
  TIME_COLUMN,
  MESSAGE_COLUMN,
  LEVEL_COLUMN,
  'app_id',
  'level_parser',
  ...DEFAULT_LABELS,
  ...DEFAULT_FIELDS,
];

export async function buildContext(view: string, range: TimeRange, datasource = ''): Promise<BuildContext> {
  const config = getAppConfig();
  let columns = await fetchColumns(view, range, datasource);
  if (columns.length === 0) {
    columns = ALL_COLUMNS;
  }
  // before the view's first data query: the session zone its statements run in
  await ensureSessionZone(view, datasource);
  return {
    tenant: resolveTenant(config, view, datasource || config.datasource.uid),
    columns,
    labels: config.labels.filter((c) => columns.includes(c)),
    fields: config.fields.filter((c) => columns.includes(c)),
  };
}

export function bucketFor(range: TimeRange, maxPoints = 120): number {
  return pickBucketSeconds(range.to.valueOf() - range.from.valueOf(), maxPoints);
}

/** SQL for a structured query. Exported so the UI can show it / open it in Explore. */
export function buildSql(q: LogsAppQuery, ctx: BuildContext, range: TimeRange): string {
  const p = q.params ?? {};
  const bucket = bucketFor(range);
  const config = getAppConfig();
  switch (q.kind) {
    case 'serviceVolume':
      return serviceVolumeQuery(q.spec, ctx, p.label ?? config.serviceLabel, bucket, p.withLevel ?? true, p.sample);
    case 'serviceSamples':
      return serviceSamplesQuery(q.spec, ctx, p.label ?? config.serviceLabel, p.values ?? [], p.perValue ?? 10);
    case 'volume':
      return volumeQuery(q.spec, ctx, bucket, p.withLevel ?? true, p.sample);
    case 'logs':
    case 'table':
      // exact bounds: "load more" (infinite scrolling) asks for lines older/newer than a loaded line
      return logsQuery(q.spec, ctx, p.limit ?? config.lineLimit, p.sort ?? 'desc', {
        fromMs: range.from.valueOf(),
        toMs: range.to.valueOf(),
      });
    case 'labelOverview':
      return labelOverviewQuery(q.spec, ctx, p.labels ?? ctx.labels, bucket);
    case 'valueBreakdown':
      return valueBreakdownQuery(q.spec, ctx, p.label ?? config.serviceLabel, bucket);
    case 'fieldBreakdown':
      return fieldBreakdownQuery(q.spec, ctx, p.field ?? '', bucket);
    case 'patterns':
      return patternsQuery(q.spec, ctx, bucket);
  }
}

function transform(q: LogsAppQuery, ctx: BuildContext, frames: DataFrame[], range: TimeRange): DataFrame[] {
  const frame = frames[0];
  const bucket = bucketFor(range);
  const refId = q.refId;
  switch (q.kind) {
    case 'serviceVolume':
      return toServiceFrames(frame, range, bucket, refId).frames;
    case 'serviceSamples':
      return frame ? groupValuesOf(frame).map((value) => toLogsFrame(frame, { tenant: ctx.tenant, refId, value })) : [];
    case 'logs':
      return frame ? [toLogsFrame(frame, { tenant: ctx.tenant, refId })] : [];
    case 'table':
      return frame ? [toTableFrame(frame, refId)] : [];
    case 'volume':
      return toLevelFrames(frame, range, bucket, refId);
    case 'labelOverview':
      return toLabelOverviewFrames(frame, q.params?.labels ?? ctx.labels, range, bucket, refId, q.params?.topN ?? 5);
    case 'valueBreakdown':
    case 'fieldBreakdown':
      return toValueFrames(frame, range, bucket, refId, q.params?.topN ?? 30);
    case 'patterns':
      return toPatternFrames(frame, range, bucket, refId);
  }
}

function errorResponse(refId: string, err: unknown): DataQueryResponse {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
  const e: DataQueryError = { refId, message };
  return { data: [], errors: [e], error: e, state: LoadingState.Error };
}

function widenedRange(range: TimeRange): TimeRange {
  return widenedWindow({ fromMs: range.from.valueOf(), toMs: range.to.valueOf() });
}

function widenedWindow(win: TimeWindow): TimeRange {
  const w = widenToSeconds(win.fromMs, win.toMs);
  return { from: dateTime(w.fromMs), to: dateTime(w.toMs), raw: { from: dateTime(w.fromMs), to: dateTime(w.toMs) } };
}

/**
 * Lines with a text filter (line search, message field, pattern, level from the message): StarRocks has to
 * read the message of every row in the range, and ORDER BY ... LIMIT does not stop early. So the range is
 * searched in windows, newest first (oldest first for ascending order): 1 hour, then 2, 4, 8 hours...
 * The search stops when it has the line limit. After each window the lines found so far are sent to the
 * panel (Streaming), so they appear while older windows are read. Unsubscribing (a newer query, leaving the
 * page, the panel's cancel button) cancels the running window and starts no more.
 */
function runWindowedLines(
  q: LogsAppQuery,
  ctx: BuildContext,
  range: TimeRange,
  windows: TimeWindow[],
  requestId?: string
): Observable<DataQueryResponse> {
  const p = q.params ?? {};
  const limit = p.limit ?? getAppConfig().lineLimit;
  const sort = p.sort ?? 'desc';
  return new Observable<DataQueryResponse>((subscriber) => {
    let current: Subscription | undefined;
    const found: DataFrame[] = [];
    const sqls: string[] = [];
    let lines = 0;
    let empty: DataFrame | undefined;

    const step = (i: number) => {
      const w = windows[i];
      const sql = logsQuery(q.spec, ctx, limit - lines, sort, w);
      sqls.push(sql);
      current = runSql(sql, {
        datasource: q.spec.datasource,
        view: q.spec.view,
        refId: q.refId,
        range: widenedWindow(w),
        requestId: requestId ? `${requestId}_w${i}` : undefined,
      }).subscribe({
        next: (res) => {
          const err = res.errors?.[0] ?? res.error;
          if (err) {
            subscriber.next({ data: [], errors: [{ ...err, refId: q.refId }], error: err, state: LoadingState.Error });
            subscriber.complete();
            return;
          }
          const frame = (res.data as DataFrame[])[0];
          if (frame && frame.length > 0) {
            found.push(frame);
            lines += frame.length;
          } else if (frame) {
            empty = frame;
          }
          const done = lines >= limit || i === windows.length - 1;
          const progress: SearchProgress = {
            searchedFromMs: sort === 'desc' ? w.fromMs : windows[0].fromMs,
            searchedToMs: sort === 'desc' ? windows[0].toMs : w.toMs,
            rangeFromMs: range.from.valueOf(),
            rangeToMs: range.to.valueOf(),
            windows: i + 1,
            totalWindows: windows.length,
            lines,
            limit,
            done,
          };
          const source = found.length > 0 ? concatFrames(found) : empty;
          const frames = source ? transform(q, ctx, [source], range) : [];
          frames.forEach(
            (f) =>
              (f.meta = {
                ...f.meta,
                executedQueryString: sqls.join(';\n\n'),
                custom: { ...f.meta?.custom, search: progress },
              })
          );
          // Loading until the first lines arrive: the Logs panel keeps showing the previous result meanwhile
          const state = done ? LoadingState.Done : lines > 0 ? LoadingState.Streaming : LoadingState.Loading;
          subscriber.next({ data: frames, state, key: q.refId });
          if (done) {
            subscriber.complete();
          } else {
            step(i + 1);
          }
        },
        error: (e) => {
          subscriber.next(errorResponse(q.refId, e));
          subscriber.complete();
        },
      });
    };

    step(0);
    return () => current?.unsubscribe();
  });
}

/** Cache key of a query: everything that changes its SQL or its result. */
export function queryCacheKey(q: LogsAppQuery, range: TimeRange): string {
  return JSON.stringify([q.kind, q.spec, q.params ?? {}, q.refId, range.from.valueOf(), range.to.valueOf()]);
}

/** Runs one structured query, or answers from the short-lived cache (see queryCache.ts). */
export function runLogsQuery(q: LogsAppQuery, range: TimeRange, requestId?: string): Observable<DataQueryResponse> {
  const key = queryCacheKey(q, range);
  return defer(() => {
    const hit = getCached(key);
    return hit ? of(hit) : runLogsQueryUncached(q, range, requestId).pipe(tap((r) => putCached(key, r)));
  });
}

/** Runs one structured query and returns frames ready for the panels. */
function runLogsQueryUncached(q: LogsAppQuery, range: TimeRange, requestId?: string): Observable<DataQueryResponse> {
  return from(buildContext(q.spec.view, range, q.spec.datasource)).pipe(
    switchMap((ctx) => {
      if ((q.kind === 'logs' || q.kind === 'table') && needsMessageScan(q.spec, ctx.tenant, false)) {
        const windows = planWindows(range.from.valueOf(), range.to.valueOf(), q.params?.sort ?? 'desc');
        if (windows.length > 1) {
          return runWindowedLines(q, ctx, range, windows, requestId);
        }
      }
      const sql = buildSql(q, ctx, range);
      // line queries have exact bounds in the SQL; widen the range for $__timeFilter to whole seconds
      const sqlRange = q.kind === 'logs' || q.kind === 'table' ? widenedRange(range) : range;
      return runSql(sql, {
        datasource: q.spec.datasource,
        view: q.spec.view,
        refId: q.refId,
        range: sqlRange,
        requestId,
      }).pipe(
        map((res): DataQueryResponse => {
          const err = res.errors?.[0] ?? res.error;
          if (err) {
            return { data: [], errors: [{ ...err, refId: q.refId }], error: err, state: LoadingState.Error };
          }
          const frames = transform(q, ctx, res.data as DataFrame[], range);
          frames.forEach((f) => (f.meta = { ...f.meta, executedQueryString: sql }));
          return { data: frames, state: LoadingState.Done };
        })
      );
    }),
    catchError((err) => of(errorResponse(q.refId, err)))
  );
}

/**
 * Runtime data source used by every panel of the app. Panels send structured queries (kind + spec); this
 * turns them into SQL and sends them through kotak-starrocks-datasource as the signed-in user.
 */
export class StarRocksLogsDataSource extends RuntimeDataSource<LogsAppQuery> {
  constructor() {
    super(RUNTIME_DS_TYPE, RUNTIME_DS_UID);
  }

  query(request: DataQueryRequest<LogsAppQuery>): Observable<DataQueryResponse> {
    const targets = request.targets.filter((t) => !t.hide && t.kind && t.spec?.view);
    if (targets.length === 0) {
      return of({ data: [], state: LoadingState.Done });
    }
    // combineLatest, not forkJoin: a windowed text search sends its lines window by window
    return combineLatest(
      targets.map((t) => runLogsQuery(t, request.range, `${request.requestId ?? 'q'}_${t.refId}`))
    ).pipe(
      map((responses) => {
        const errors = responses.flatMap((r) => r.errors ?? []);
        const states = responses.map((r) => r.state ?? LoadingState.Done);
        const state =
          errors.length > 0
            ? LoadingState.Error
            : states.includes(LoadingState.Loading)
              ? LoadingState.Loading
              : states.includes(LoadingState.Streaming)
                ? LoadingState.Streaming
                : LoadingState.Done;
        return {
          data: responses.flatMap((r) => r.data),
          errors: errors.length > 0 ? errors : undefined,
          error: errors[0],
          state,
        };
      })
    );
  }

  /** Top of the "Show context" modal: which pod's lines are shown, as in the Log Analytics UI. */
  getLogRowContextUi(row: LogRowModel): ReactNode {
    const labels = (row.dataFrame.fields.find((f) => f.name === 'labels')?.values[row.rowIndex] ?? {}) as Record<
      string,
      string
    >;
    const podColumn = labels[POD_UID_COLUMN] ? POD_UID_COLUMN : POD_NAME_COLUMN;
    return createElement(ContextScope, { labels, podColumn });
  }

  /** "Show context": lines of the same pod before/after the clicked line (used by the Logs panel modal). */
  async getLogRowContext(
    row: LogRowModel,
    options?: LogRowContextOptions,
    query?: LogsAppQuery
  ): Promise<DataQueryResponse> {
    const view = query?.spec?.view;
    if (!view) {
      return { data: [] };
    }
    const frame = row.dataFrame;
    const tsRaw = String(frame.fields.find((f) => f.name === '__ts')?.values[row.rowIndex] ?? '');
    const labels = (frame.fields.find((f) => f.name === 'labels')?.values[row.rowIndex] ?? {}) as Record<
      string,
      string
    >;
    const podColumn = labels[POD_UID_COLUMN] ? POD_UID_COLUMN : POD_NAME_COLUMN;
    const pod = labels[podColumn];
    if (!tsRaw || !pod) {
      return { data: [] };
    }
    const direction = options?.direction === LogRowContextQueryDirection.Forward ? 'forward' : 'backward';
    const center = row.timeEpochMs;
    const range: TimeRange = {
      from: dateTime(center - 3600_000),
      to: dateTime(center + 3600_000),
      raw: { from: dateTime(center - 3600_000), to: dateTime(center + 3600_000) },
    };
    const datasource = query?.spec?.datasource ?? '';
    const ctx = await buildContext(view, range, datasource);
    // the message breaks ties: lines of the same pod with the same microsecond (42 % of lines on UAT)
    const sql = contextQuery(view, ctx, podColumn, pod, tsRaw, direction, options?.limit ?? 50, row.entry);
    const res = await lastValueFrom(runSql(sql, { datasource, view, refId: `context-${direction}`, range }));
    const err = res.errors?.[0] ?? res.error;
    if (err) {
      throw new Error(err.message);
    }
    const data = (res.data as DataFrame[]).map((f) =>
      toLogsFrame(f, { tenant: ctx.tenant, refId: row.dataFrame.refId ?? 'A' })
    );
    return { data };
  }

  testDatasource() {
    return Promise.resolve({ status: 'success', message: 'ok' });
  }
}

let registered = false;

export function ensureRuntimeDataSource(register: (ds: StarRocksLogsDataSource) => void) {
  if (!registered) {
    register(new StarRocksLogsDataSource());
    registered = true;
  }
}
