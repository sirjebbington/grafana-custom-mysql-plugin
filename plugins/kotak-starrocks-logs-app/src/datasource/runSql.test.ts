import { of, throwError, lastValueFrom } from 'rxjs';

import { dateTime } from '@grafana/data';

import { setAppConfig } from '../config/config';
import { fetchViews, fetchViewSample, runSql, runSqlOnce, setSessionZone, stringColumn } from './api';

const fetch = jest.fn();
jest.mock('@grafana/runtime', () => {
  const actual = jest.requireActual('@grafana/runtime');
  return {
    ...actual,
    getBackendSrv: () => ({ fetch: (...args: unknown[]) => fetch(...args) }),
    getDataSourceSrv: () => ({ getList: () => [] }),
  };
});

const range = {
  from: dateTime(1_700_000_000_000),
  to: dateTime(1_700_003_600_000),
  raw: { from: 'now-1h', to: 'now' },
};

/** What /api/ds/query returns for one table frame (results are keyed by the query's refId). */
function okResponse(fields: Array<{ name: string; values: unknown[] }>, refId = 'A') {
  return {
    status: 200,
    data: {
      results: {
        [refId]: {
          frames: [
            {
              schema: {
                fields: fields.map((f) => ({
                  name: f.name,
                  type: typeof f.values[0] === 'number' ? 'number' : 'string',
                })),
              },
              data: { values: fields.map((f) => f.values) },
            },
          ],
        },
      },
    },
  };
}

beforeEach(() => {
  fetch.mockReset();
  setAppConfig({ datasourceUid: 'main' });
});

describe('runSql: one statement through /api/ds/query as the signed-in user', () => {
  it('posts the SQL to the chosen kotak-starrocks-datasource with the time range and the app hint', async () => {
    fetch.mockReturnValue(of(okResponse([{ name: 'x', values: [1] }])));
    setSessionZone('ds2', 'vw_a', '+00:00');
    await lastValueFrom(
      runSql('SELECT x FROM t', { refId: 'A', range, datasource: 'ds2', view: 'vw_a', requestId: 'r1' })
    );
    const req = fetch.mock.calls[0][0];
    expect(req.url).toBe('/api/ds/query');
    expect(req.method).toBe('POST');
    expect(req.requestId).toBe('r1');
    expect(req.showErrorAlert).toBe(false);
    expect(req.data.from).toBe('1700000000000');
    expect(req.data.to).toBe('1700003600000');
    const q = req.data.queries[0];
    expect(q.datasource).toEqual({ type: 'kotak-starrocks-datasource', uid: 'ds2' });
    expect(q.format).toBe('table');
    expect(q.rawSql).toBe("SELECT /*+ SET_VAR(time_zone = '+00:00', query_timeout = 120) */ x FROM t");
  });

  it('uses the default data source; an explicit zone (probes) or none replaces the view zone', async () => {
    fetch.mockReturnValue(of(okResponse([{ name: 'x', values: [1] }])));
    await lastValueFrom(runSql('SELECT 1', { refId: 'A', range, timeZone: '+01:00', timeoutSeconds: 30 }));
    let q = fetch.mock.calls[0][0].data.queries[0];
    expect(q.datasource.uid).toBe('main');
    expect(q.rawSql).toBe("SELECT /*+ SET_VAR(time_zone = '+01:00', query_timeout = 30) */ 1");
    await lastValueFrom(runSql('SELECT 1', { refId: 'A', range, timeZone: null }));
    q = fetch.mock.calls[1][0].data.queries[0];
    expect(q.rawSql).toBe('SELECT /*+ SET_VAR(query_timeout = 120) */ 1');
    await lastValueFrom(runSql('SHOW TABLES', { refId: 'A', range }));
    expect(fetch.mock.calls[2][0].data.queries[0].rawSql).toBe('SHOW TABLES');
  });

  it('a failed query (HTTP 4xx/5xx) comes back as errors with an explanation, not an exception', async () => {
    fetch.mockReturnValue(
      throwError(() => ({
        status: 400,
        data: { results: { A: { error: 'db query error: Error 5204 (42000): Access denied', status: 400 } } },
      }))
    );
    const res = await lastValueFrom(runSql('SELECT 1', { refId: 'A', range }));
    expect(res.errors?.[0].message).toMatch(/^Access denied by Ranger \(5204\)/);
    await expect(runSqlOnce('SELECT 1', range)).rejects.toThrow(/5204/);
  });

  it('runSqlOnce returns the frames; stringColumn reads a column as text', async () => {
    fetch.mockReturnValue(
      of(
        okResponse([
          { name: 'v', values: ['a', null] },
          { name: 'n', values: [1, 2] },
        ])
      )
    );
    const frames = await runSqlOnce('SELECT v, n FROM t', range);
    expect(stringColumn(frames[0], 'v')).toEqual(['a', '']);
    expect(stringColumn(frames[0])).toEqual(['a', '']);
    expect(stringColumn(undefined, 'v')).toEqual([]);
  });
});

describe('view list and columns', () => {
  it('lists the views of every prefix, sorted (one SHOW TABLES LIKE each, Ranger-filtered)', async () => {
    fetch.mockImplementation((req: { data: { queries: Array<{ rawSql: string }> } }) =>
      of(
        okResponse(
          [
            {
              name: 'Tables',
              values: req.data.queries[0].rawSql.includes('genai')
                ? ['vw_genai_logs_app_7001_agentrouter']
                : ['vw_eks_app_logs_b', 'vw_eksXapp_logs_like_wildcard', 'vw_eks_app_logs_a'],
            },
          ],
          'views'
        )
      )
    );
    expect(await fetchViews(range)).toEqual([
      'vw_eks_app_logs_a',
      'vw_eks_app_logs_b',
      'vw_genai_logs_app_7001_agentrouter',
    ]);
    expect(fetch.mock.calls.map((c) => c[0].data.queries[0].rawSql)).toEqual([
      "SHOW TABLES LIKE 'vw_eks_app_logs_%'",
      "SHOW TABLES LIKE 'vw_genai_logs_%'",
    ]);
  });

  it("reads a view's columns from one row of the last day, else from any row; cached; a failure is retried", async () => {
    const row = (fields: Array<{ name: string; values: unknown[] }>) => of(okResponse(fields, 'columns'));
    // the usual time column exists: one bounded query
    fetch.mockReturnValueOnce(
      row([
        { name: 'observed_timestamp', values: ['2026-11-26 10:00:00'] },
        { name: 'message', values: ['hello'] },
      ])
    );
    expect(await fetchViewSample('vw_a', range, 'dsx')).toEqual({
      names: ['observed_timestamp', 'message'],
      row: { observed_timestamp: '2026-11-26 10:00:00', message: 'hello' },
    });
    expect(await fetchViewSample('vw_a', range, 'dsx')).toMatchObject({ names: ['observed_timestamp', 'message'] });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0].data.queries[0].rawSql).toBe(
      'SELECT /*+ SET_VAR(query_timeout = 120) */ * FROM `vw_a` WHERE `observed_timestamp` >= DATE_SUB(NOW(), INTERVAL 1 DAY) LIMIT 1'
    );

    // another time column: the bounded query fails, the plain LIMIT 1 gives the names
    fetch.mockReset();
    fetch
      .mockReturnValueOnce(
        throwError(() => ({
          status: 400,
          data: { results: { columns: { error: 'Column observed_timestamp not found', status: 400 } } },
        }))
      )
      .mockReturnValueOnce(
        row([
          { name: 'event_time', values: ['x'] },
          { name: 'body', values: ['y'] },
        ])
      );
    expect((await fetchViewSample('vw_genai', range, 'dsx')).names).toEqual(['event_time', 'body']);
    expect(fetch.mock.calls[1][0].data.queries[0].rawSql).toBe(
      'SELECT /*+ SET_VAR(query_timeout = 120) */ * FROM `vw_genai` LIMIT 1'
    );

    // both fail: an error, and the next call tries again
    fetch.mockReset();
    fetch.mockReturnValue(
      throwError(() => ({ status: 500, data: { results: { columns: { error: 'boom', status: 500 } } } }))
    );
    await expect(fetchViewSample('vw_c', range, 'dsx')).rejects.toThrow('boom');
    fetch.mockReturnValue(row([{ name: 'observed_timestamp', values: ['t'] }]));
    expect((await fetchViewSample('vw_c', range, 'dsx')).names).toEqual(['observed_timestamp']);
  });
});
