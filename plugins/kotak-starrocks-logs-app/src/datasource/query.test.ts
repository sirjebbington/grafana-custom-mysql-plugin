import { of } from 'rxjs';

import { DataQueryRequest, LoadingState, dateTime, toDataFrame } from '@grafana/data';

import { emptySpec } from '../state/types';
import { clearQueryCache } from './queryCache';
import { BuildContext, resolvePatterns } from './testUtils';
import { buildSql, ensureRuntimeDataSource, LogsAppQuery, StarRocksLogsDataSource } from './StarRocksLogsDataSource';

jest.mock('@grafana/scenes', () => ({ RuntimeDataSource: class {} }));
jest.mock('./timeZone', () => ({ ensureSessionZone: async () => undefined }));
jest.mock('./ContextScope', () => ({ ContextScope: () => null }));
const runSql = jest.fn();
jest.mock('./api', () => ({
  setRelation: () => undefined,
  relationOf: () => undefined,
  runSql: (...args: unknown[]) => runSql(...args),
  fetchViewSample: async () => ({
    names: ['observed_timestamp', 'message', 'level', 'k8s_service_name', 'k8s_namespace_name', 'k8s_pod_uid'],
  }),
}));

const VIEW = 'vw_eks_app_logs_app_1'; // tenant app_1
const range = {
  from: dateTime(Date.UTC(2026, 10, 25, 3)),
  to: dateTime(Date.UTC(2026, 10, 25, 4)),
  raw: { from: 'now-1h', to: 'now' },
};

function request(targets: LogsAppQuery[]): DataQueryRequest<LogsAppQuery> {
  return { targets, range, requestId: 'r' } as unknown as DataQueryRequest<LogsAppQuery>;
}

beforeEach(() => {
  runSql.mockReset();
  clearQueryCache();
});

describe('runtime data source: what the panels get', () => {
  const ds = new StarRocksLogsDataSource();

  it('no target with a view: done, no query', async () => {
    const res = await new Promise((resolve) =>
      ds.query(request([{ refId: 'A', kind: 'logs', spec: emptySpec('') }])).subscribe(resolve)
    );
    expect(res).toEqual({ data: [], state: LoadingState.Done });
    expect(runSql).not.toHaveBeenCalled();
  });

  it('several targets are combined; one error makes the panel show the error', async () => {
    runSql
      .mockReturnValueOnce(
        of({
          data: [
            toDataFrame({
              fields: [
                { name: 't', values: [1] },
                { name: 'g', values: ['all'] },
                { name: 'c', values: [2] },
              ],
            }),
          ],
        })
      )
      .mockReturnValueOnce(of({ data: [], errors: [{ message: 'denied' }] }));
    const targets: LogsAppQuery[] = [
      { refId: 'A', kind: 'volume', spec: emptySpec(VIEW), params: { withLevel: false } },
      { refId: 'B', kind: 'volume', spec: emptySpec(VIEW), params: { withLevel: true } },
    ];
    const res = await new Promise<{ state: LoadingState; errors?: Array<{ message?: string; refId?: string }> }>(
      (resolve) => ds.query(request(targets)).subscribe((r) => resolve(r as never))
    );
    expect(res.state).toBe(LoadingState.Error);
    expect(res.errors?.[0]).toMatchObject({ message: 'denied', refId: 'B' });
  });

  it('testDatasource is always fine; the data source registers once', async () => {
    expect(await ds.testDatasource()).toEqual({ status: 'success', message: 'ok' });
    const register = jest.fn();
    ensureRuntimeDataSource(register);
    ensureRuntimeDataSource(register);
    expect(register).toHaveBeenCalledTimes(1);
  });
});

describe('buildSql: every query kind', () => {
  const ctx: BuildContext = resolvePatterns(VIEW);
  const q = (kind: LogsAppQuery['kind'], params = {}): LogsAppQuery => ({
    refId: 'A',
    kind,
    spec: emptySpec(VIEW),
    params,
  });

  it.each([
    ['serviceVolume', {}, 'GROUP BY t, v, lvl'],
    ['serviceVolume', { withLevel: true, sample: 10 }, 'COUNT(*) * 10'],
    ['serviceSamples', { values: ['a', 'b'], perValue: 3 }, 'UNION ALL'],
    ['volume', { withLevel: false }, "'all' AS g"],
    ['logs', { limit: 50, sort: 'asc' }, 'ORDER BY `observed_timestamp` ASC\nLIMIT 50'],
    ['table', {}, 'LIMIT 1000'],
    ['labelOverview', { labels: ['k8s_service_name', 'k8s_namespace_name'] }, 'GROUPING SETS'],
    ['valueBreakdown', { label: 'k8s_namespace_name' }, '`k8s_namespace_name` AS v'],
    ['fieldBreakdown', { field: 'status' }, 'regexp_extract(`message`'],
    ['patterns', {}, "WHEN `message` LIKE '%timed out%' THEN 'Timeout'"],
  ] as const)('%s %j', (kind, params, expected) => {
    expect(buildSql(q(kind, params), ctx, range)).toContain(expected);
  });

  it('line queries carry exact microsecond bounds of the request range', () => {
    const sql = buildSql(q('logs'), ctx, range);
    expect(sql).toContain(`microseconds_add(FROM_UNIXTIME(${Date.UTC(2026, 10, 25, 3) / 1000}), 0)`);
  });
});
