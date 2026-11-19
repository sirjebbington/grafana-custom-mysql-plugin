import { Observable, catchError, forkJoin, from, lastValueFrom, map, of, switchMap } from 'rxjs';

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
  patternsQuery,
  pickBucketSeconds,
  serviceSamplesQuery,
  serviceVolumeQuery,
  valueBreakdownQuery,
  volumeQuery,
} from '../sql/builder';
import { QueryKind, QueryParams, QuerySpec } from '../state/types';
import { fetchColumns, runSql } from './api';
import {
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
      return serviceVolumeQuery(q.spec, ctx, p.label ?? config.serviceLabel, bucket, p.withLevel ?? true);
    case 'serviceSamples':
      return serviceSamplesQuery(q.spec, ctx, p.label ?? config.serviceLabel, p.values ?? [], p.perValue ?? 10);
    case 'volume':
      return volumeQuery(q.spec, ctx, bucket, p.withLevel ?? true);
    case 'logs':
    case 'table':
      return logsQuery(q.spec, ctx, p.limit ?? config.lineLimit, p.sort ?? 'desc');
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

/** Runs one structured query and returns frames ready for the panels. */
export function runLogsQuery(q: LogsAppQuery, range: TimeRange, requestId?: string): Observable<DataQueryResponse> {
  return from(buildContext(q.spec.view, range, q.spec.datasource)).pipe(
    switchMap((ctx) => {
      const sql = buildSql(q, ctx, range);
      return runSql(sql, { datasource: q.spec.datasource, refId: q.refId, range, requestId }).pipe(
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
    return forkJoin(targets.map((t) => runLogsQuery(t, request.range, `${request.requestId ?? 'q'}_${t.refId}`))).pipe(
      map((responses) => {
        const errors = responses.flatMap((r) => r.errors ?? []);
        return {
          data: responses.flatMap((r) => r.data),
          errors: errors.length > 0 ? errors : undefined,
          error: errors[0],
          state: errors.length > 0 ? LoadingState.Error : LoadingState.Done,
        };
      })
    );
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
    const sql = contextQuery(view, ctx, podColumn, pod, tsRaw, direction, options?.limit ?? 50);
    const res = await lastValueFrom(runSql(sql, { datasource, refId: `context-${direction}`, range }));
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
