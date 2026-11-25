import { DataQueryResponse, LoadingState, toDataFrame } from '@grafana/data';

import { clearQueryCache, getCached, putCached, queryCacheSize } from './queryCache';

function response(values: number[], state = LoadingState.Done): DataQueryResponse {
  return { data: [toDataFrame({ fields: [{ name: 'v', values }] })], state };
}

beforeEach(() => clearQueryCache());

describe('query result cache (back navigation without re-running queries)', () => {
  it('returns a finished response for the same key within 5 minutes, and nothing after', () => {
    putCached('k', response([1, 2]), 1000);
    expect(getCached('k', 1000 + 4 * 60_000)?.data[0].fields[0].values).toEqual([1, 2]);
    expect(getCached('k', 1000 + 5 * 60_000 + 1)).toBeUndefined();
    expect(queryCacheSize()).toBe(0);
  });

  it('keeps only finished, successful responses', () => {
    putCached('loading', response([1], LoadingState.Loading));
    putCached('streaming', response([1], LoadingState.Streaming));
    putCached('error', { ...response([1]), error: { message: 'x' } });
    putCached('errors', { ...response([1]), errors: [{ message: 'x' }] });
    expect(queryCacheSize()).toBe(0);
  });

  it('hands out copies: a panel that changes its frames does not change the cache', () => {
    putCached('k', response([1, 2]));
    const a = getCached('k')!;
    (a.data[0].fields[0].values as number[]).push(3);
    expect(getCached('k')!.data[0].fields[0].values).toEqual([1, 2]);
  });

  it('copies nanos too', () => {
    const r = response([1]);
    r.data[0].fields[0].nanos = [5];
    putCached('k', r);
    const a = getCached('k')!;
    a.data[0].fields[0].nanos![0] = 9;
    expect(getCached('k')!.data[0].fields[0].nanos).toEqual([5]);
  });

  it('holds at most 40 entries, dropping the least recently used', () => {
    for (let i = 0; i < 40; i++) {
      putCached(`k${i}`, response([i]));
    }
    getCached('k0'); // used: moves to the end
    putCached('k40', response([40]));
    expect(queryCacheSize()).toBe(40);
    expect(getCached('k0')).toBeDefined();
    expect(getCached('k1')).toBeUndefined();
  });
});
