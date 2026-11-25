import { of } from 'rxjs';

import { DataFrame, LogRowContextQueryDirection, LogRowModel, dateTime, toDataFrame } from '@grafana/data';

import { clearQueryCache } from './queryCache';
import { LogsAppQuery, runLogsQuery, StarRocksLogsDataSource } from './StarRocksLogsDataSource';
import { emptySpec } from '../state/types';

jest.mock('@grafana/scenes', () => ({ RuntimeDataSource: class {} }));
jest.mock('./timeZone', () => ({ ensureSessionZone: async () => undefined }));
jest.mock('./ContextScope', () => ({ ContextScope: (props: unknown) => props }));
const runSql = jest.fn();
jest.mock('./api', () => ({
  runSql: (...args: unknown[]) => runSql(...args),
  fetchColumns: async () => [
    'observed_timestamp',
    'message',
    'level',
    'k8s_service_name',
    'k8s_pod_uid',
    'k8s_pod_name',
  ],
}));

const VIEW = 'vw_eks_app_logs_app_1961_observability';

function logRow(labels: Record<string, string>, refId = 'A'): LogRowModel {
  const frame: DataFrame = toDataFrame({
    refId,
    fields: [
      { name: '__ts', values: ['2026-11-24 22:37:43.157123'] },
      { name: 'labels', values: [labels] },
    ],
  });
  return {
    dataFrame: frame,
    rowIndex: 0,
    entry: "client 10.0.0.1 closed keepalive connection 'x'",
    timeEpochMs: Date.UTC(2026, 10, 24, 22, 37, 43, 157),
  } as unknown as LogRowModel;
}

const query: LogsAppQuery = { refId: 'A', kind: 'logs', spec: emptySpec(VIEW) };

beforeEach(() => {
  runSql.mockReset();
  runSql.mockImplementation(() => of({ data: [toDataFrame({ fields: [{ name: '__ms', values: [] }] })] }));
  clearQueryCache();
});

describe('show context (Grafana calls getLogRowContext from the Logs panel modal)', () => {
  const ds = new StarRocksLogsDataSource();

  it('queries the same pod uid around the exact timestamp, ties broken by the message', async () => {
    await ds.getLogRowContext(
      logRow({ k8s_pod_uid: 'u-1', k8s_pod_name: 'p-1' }),
      { direction: LogRowContextQueryDirection.Backward, limit: 100 },
      query
    );
    const sql = runSql.mock.calls[0][0] as string;
    expect(sql).toContain("`k8s_pod_uid` = 'u-1'");
    expect(sql).toContain("CAST('2026-11-24 22:37:43.157123' AS DATETIME)");
    expect(sql).toContain("`message` < 'client 10.0.0.1 closed keepalive connection \\'x\\''");
    expect(sql).toContain('LIMIT 100');
    expect(runSql.mock.calls[0][1]).toMatchObject({ view: VIEW, refId: 'context-backward' });
  });

  it('falls back to the pod name; forward goes the other way', async () => {
    await ds.getLogRowContext(
      logRow({ k8s_pod_name: 'p-1' }),
      { direction: LogRowContextQueryDirection.Forward, limit: 10 },
      query
    );
    const sql = runSql.mock.calls[0][0] as string;
    expect(sql).toContain("`k8s_pod_name` = 'p-1'");
    expect(sql).toContain('ORDER BY `observed_timestamp` ASC, `message` ASC');
  });

  it('works on rows whose refId the modal renamed (Grafana sets context_<n>_<m> when loading more)', async () => {
    await ds.getLogRowContext(
      logRow({ k8s_pod_uid: 'u-1' }, 'context_2_1'),
      { direction: LogRowContextQueryDirection.Backward, limit: 100 },
      query
    );
    expect(runSql).toHaveBeenCalledTimes(1);
  });

  it('returns nothing without a view, a timestamp or a pod', async () => {
    expect((await ds.getLogRowContext(logRow({ k8s_pod_uid: 'u' }), {}, undefined)).data).toEqual([]);
    expect((await ds.getLogRowContext(logRow({}), {}, query)).data).toEqual([]);
    expect(runSql).not.toHaveBeenCalled();
  });

  it('turns StarRocks errors into an error the modal shows', async () => {
    runSql.mockImplementation(() => of({ data: [], errors: [{ message: 'Access denied' }] }));
    await expect(ds.getLogRowContext(logRow({ k8s_pod_uid: 'u' }), {}, query)).rejects.toThrow('Access denied');
  });

  it('the context header names the pod column that is matched', () => {
    const ui = ds.getLogRowContextUi(logRow({ k8s_pod_uid: 'u-1', k8s_pod_name: 'p-1' })) as unknown as {
      props: { podColumn: string; labels: Record<string, string> };
    };
    expect(ui.props.podColumn).toBe('k8s_pod_uid');
    expect(ui.props.labels.k8s_pod_name).toBe('p-1');
    const byName = ds.getLogRowContextUi(logRow({ k8s_pod_name: 'p-1' })) as unknown as {
      props: { podColumn: string };
    };
    expect(byName.props.podColumn).toBe('k8s_pod_name');
  });
});

describe('runLogsQuery uses the result cache', () => {
  const range = { from: dateTime(1_000_000), to: dateTime(4_600_000), raw: { from: 'now-1h', to: 'now' } };
  const volume: LogsAppQuery = { refId: 'A', kind: 'volume', spec: emptySpec(VIEW), params: { withLevel: false } };

  it('answers the same query and range from the cache; another range runs again', async () => {
    runSql.mockImplementation(() =>
      of({
        data: [
          toDataFrame({
            fields: [
              { name: 't', values: [1000] },
              { name: 'g', values: ['all'] },
              { name: 'c', values: [3] },
            ],
          }),
        ],
      })
    );
    const first = await new Promise((resolve) => runLogsQuery(volume, range).subscribe({ next: resolve }));
    const second = await new Promise((resolve) => runLogsQuery(volume, range).subscribe({ next: resolve }));
    expect(runSql).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    const later = { ...range, to: dateTime(4_700_000) };
    await new Promise((resolve) => runLogsQuery(volume, later).subscribe({ next: resolve }));
    expect(runSql).toHaveBeenCalledTimes(2);
  });

  it('passes the level sampling to the SQL', async () => {
    const sampled: LogsAppQuery = { ...volume, params: { withLevel: true, sample: 10 } };
    await new Promise((resolve) => runLogsQuery(sampled, range).subscribe({ next: resolve }));
    expect(runSql.mock.calls[0][0]).toContain('COUNT(*) * 10');
  });
});
