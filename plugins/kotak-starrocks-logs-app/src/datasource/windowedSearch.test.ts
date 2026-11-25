import { Observable, of, toArray, firstValueFrom, Subject } from 'rxjs';

import { DataQueryResponse, LoadingState, TimeRange, dateTime, toDataFrame } from '@grafana/data';

import { runLogsQuery, searchProgressOf, LogsAppQuery } from './StarRocksLogsDataSource';
import { clearQueryCache } from './queryCache';
import { emptySpec } from '../state/types';

// only the data source's own code is under test: no Grafana runtime, no Scenes
jest.mock('@grafana/scenes', () => ({ RuntimeDataSource: class {} }));

const runSql = jest.fn();
jest.mock('./timeZone', () => ({ ensureSessionZone: async () => undefined }));
jest.mock('./ContextScope', () => ({ ContextScope: () => null }));
jest.mock('./api', () => ({
  runSql: (...args: unknown[]) => runSql(...args),
  fetchColumns: async () => ['observed_timestamp', 'message', 'level', 'k8s_service_name', 'k8s_pod_uid'],
}));

const H = 3_600_000;
const TO = Date.UTC(2026, 10, 24, 14, 23);
const FROM = TO - 6 * H;

function range(): TimeRange {
  return { from: dateTime(FROM), to: dateTime(TO), raw: { from: 'now-6h', to: 'now' } };
}

/** n lines inside [fromMs, toMs], newest first, as the data source returns them. */
function lines(fromMs: number, toMs: number, n: number): DataQueryResponse {
  const ts = Array.from({ length: n }, (_, i) => toMs - Math.floor(((i + 0.5) * (toMs - fromMs)) / n));
  return {
    data: [
      toDataFrame({
        fields: [
          { name: '__ms', values: ts },
          { name: '__ts', values: ts.map((t) => new Date(t).toISOString().replace('T', ' ').replace('Z', '000')) },
          { name: 'message', values: ts.map((t) => `upstream timed out ${t}`) },
          { name: 'detected_level', values: ts.map(() => 'error') },
          { name: 'k8s_pod_uid', values: ts.map(() => 'pod-1') },
        ],
      }),
    ],
  };
}

/** Bounds of a window query (microseconds_add(FROM_UNIXTIME(s), us) on both sides) and its LIMIT. */
function parse(sql: string) {
  const b = [...sql.matchAll(/microseconds_add\(FROM_UNIXTIME\((\d+)\), (\d+)\)/g)].map(
    (m) => Number(m[1]) * 1000 + Number(m[2]) / 1000
  );
  return { fromMs: b[0], toMs: b[1] - 1, limit: Number(/LIMIT (\d+)/.exec(sql)![1]) };
}

function textQuery(limit: number): LogsAppQuery {
  const spec = {
    ...emptySpec('vw_eks_app_logs_app_1961_observability'),
    lineFilters: [{ op: 'include' as const, value: 'timed out', caseSensitive: false, regex: false }],
  };
  return { refId: 'A', kind: 'logs', spec, params: { limit, sort: 'desc' } };
}

beforeEach(() => {
  runSql.mockReset();
  clearQueryCache();
});

describe('windowed text search in the data source', () => {
  it('stops at the line limit: the newest window is enough when it has the lines', async () => {
    runSql.mockImplementation((sql: string) => {
      const w = parse(sql);
      return of(lines(w.fromMs, w.toMs, w.limit));
    });
    const out = await firstValueFrom(runLogsQuery(textQuery(100), range()).pipe(toArray()));
    expect(runSql).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(1);
    expect(out[0].state).toBe(LoadingState.Done);
    expect(out[0].data[0].length).toBe(100);
    const p = searchProgressOf(out[0].data[0])!;
    expect(p).toMatchObject({ done: true, lines: 100, limit: 100, windows: 1, searchedToMs: TO });
    expect(p.searchedFromMs).toBe(Date.UTC(2026, 10, 24, 13)); // 13:00, a whole hour
  });

  it('reads older windows while lines are missing, streaming what it has; each window asks only for the rest', async () => {
    // 30 lines per window at most
    runSql.mockImplementation((sql: string) => {
      const w = parse(sql);
      return of(lines(w.fromMs, w.toMs, Math.min(30, w.limit)));
    });
    const out = await firstValueFrom(runLogsQuery(textQuery(70), range()).pipe(toArray()));
    expect(runSql).toHaveBeenCalledTimes(3);
    expect(runSql.mock.calls.map((c) => parse(c[0]).limit)).toEqual([70, 40, 10]);
    expect(out.map((r) => r.state)).toEqual([LoadingState.Streaming, LoadingState.Streaming, LoadingState.Done]);
    expect(out.map((r) => r.data[0].length)).toEqual([30, 60, 70]);
    // newest first across windows, ids unique
    const times = out[2].data[0].fields.find((f: { name: string }) => f.name === 'timestamp').values as number[];
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    const ids = out[2].data[0].fields.find((f: { name: string }) => f.name === 'id').values as string[];
    expect(new Set(ids).size).toBe(70);
    // the $__timeFilter range of each window covers just that window (whole seconds)
    const sent = runSql.mock.calls.map((c) => c[1].range as TimeRange);
    expect(sent[0].to.valueOf()).toBeGreaterThan(TO);
    expect(sent[1].to.valueOf()).toBeLessThanOrEqual(sent[0].from.valueOf() + 1000);
  });

  it('searches the whole range when there are few matches, then ends', async () => {
    runSql.mockImplementation(() => of(lines(FROM, FROM + 1, 0)));
    const out = await firstValueFrom(runLogsQuery(textQuery(1000), range()).pipe(toArray()));
    const n = runSql.mock.calls.length;
    expect(n).toBeGreaterThan(1);
    const w = runSql.mock.calls.map((c) => parse(c[0]));
    expect(w[n - 1].fromMs).toBe(FROM);
    expect(w[0].toMs).toBe(TO);
    // Loading (keep showing the previous result) until lines arrive; Done at the end
    expect(out.slice(0, -1).every((r) => r.state === LoadingState.Loading)).toBe(true);
    expect(out[out.length - 1].state).toBe(LoadingState.Done);
  });

  it('unsubscribing cancels the running window and starts no more', async () => {
    const pending = new Subject<DataQueryResponse>();
    let cancelled = false;
    runSql.mockImplementation(
      () =>
        new Observable<DataQueryResponse>((sub) => {
          const s = pending.subscribe(sub);
          return () => {
            cancelled = true;
            s.unsubscribe();
          };
        })
    );
    const sub = runLogsQuery(textQuery(1000), range()).subscribe();
    await new Promise((r) => setTimeout(r, 0));
    expect(runSql).toHaveBeenCalledTimes(1);
    sub.unsubscribe();
    expect(cancelled).toBe(true);
    pending.next(lines(FROM, TO, 0));
    expect(runSql).toHaveBeenCalledTimes(1);
  });

  it('an error in a window ends the search with that error', async () => {
    runSql.mockImplementation(() => of({ data: [], errors: [{ message: 'Query reached its timeout' }] }));
    const out = await firstValueFrom(runLogsQuery(textQuery(1000), range()).pipe(toArray()));
    expect(runSql).toHaveBeenCalledTimes(1);
    expect(out[0].state).toBe(LoadingState.Error);
    expect(out[0].errors?.[0].message).toContain('timeout');
  });

  it('no text filter: one query over the whole range, as before', async () => {
    runSql.mockImplementation(() => of(lines(FROM, TO, 10)));
    const q = { ...textQuery(1000), spec: emptySpec('vw_eks_app_logs_app_1961_observability') };
    await firstValueFrom(runLogsQuery(q, range()).pipe(toArray()));
    expect(runSql).toHaveBeenCalledTimes(1);
  });
});
