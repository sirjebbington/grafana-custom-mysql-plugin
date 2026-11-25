import { DataFrame, toDataFrame } from '@grafana/data';

import { setAppConfig } from '../config/config';
import { getOldestCache, getTimeModeCache, setOldestCache } from '../state/storage';

const runSqlOnce = jest.fn();
const setSessionZone = jest.fn();
jest.mock('./api', () => ({
  runSqlOnce: (...args: unknown[]) => runSqlOnce(...args),
  setSessionZone: (...args: unknown[]) => setSessionZone(...args),
  stringColumn: (frame: DataFrame | undefined, name: string) =>
    (frame?.fields.find((f) => f.name === name)?.values ?? []).map((v) => (v == null ? '' : String(v))),
}));

import { detectTimeMode, ensureSessionZone } from './timeZone';
import { fetchOldestLog } from './oldest';

const t = (text: string) => [toDataFrame({ fields: [{ name: 't', values: [text] }] })];
const off = (minutes: number) => [
  toDataFrame({
    fields: [
      { name: 'tz', values: ['x'] },
      { name: 'off', values: [minutes] },
    ],
  }),
];
const iso = (ms: number) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '000');

beforeEach(() => {
  runSqlOnce.mockReset();
  setSessionZone.mockReset();
  window.localStorage.clear();
  setAppConfig({});
});

describe('time zone probe per view (datasource/timeZone.ts)', () => {
  it('an instant column (Iceberg timestamptz): +1 h under +01:00 → statements run in +00:00, cached per browser', async () => {
    const now = Date.now();
    runSqlOnce
      .mockResolvedValueOnce(t(iso(now - 5000)))
      .mockResolvedValueOnce(t(iso(now - 5000 + 3_600_000)))
      .mockResolvedValueOnce(off(330));
    await ensureSessionZone('vw_a', 'ds1');
    expect(setSessionZone).toHaveBeenCalledWith('ds1', 'vw_a', '+00:00');
    // the probes: newest line text in +00:00 and +01:00, then the session's own offset (no zone)
    expect(runSqlOnce.mock.calls[0][4]).toMatchObject({ timeZone: '+00:00', timeoutSeconds: 30 });
    expect(runSqlOnce.mock.calls[1][4]).toMatchObject({ timeZone: '+01:00' });
    expect(runSqlOnce.mock.calls[2][4]).toMatchObject({ timeZone: null });
    expect(getTimeModeCache('ds1', 'vw_a')?.mode).toEqual({ kind: 'aware' });
    // second time: from the cache, no queries
    runSqlOnce.mockClear();
    expect(await detectTimeMode('vw_a', 'ds1')).toEqual({ kind: 'aware' });
    expect(runSqlOnce).not.toHaveBeenCalled();
  });

  it('a wall-clock column in IST with an IST session → +05:30', async () => {
    const wall = Date.now() - 30_000 + 330 * 60_000;
    runSqlOnce
      .mockResolvedValueOnce(t(iso(wall)))
      .mockResolvedValueOnce(t(iso(wall)))
      .mockResolvedValueOnce(off(330));
    await ensureSessionZone('vw_b', 'ds1');
    expect(setSessionZone).toHaveBeenCalledWith('ds1', 'vw_b', '+05:30');
  });

  it('no recent lines → the session zone (not cached, tried again next time)', async () => {
    runSqlOnce.mockResolvedValueOnce([toDataFrame({ fields: [{ name: 't', values: [] }] })]);
    runSqlOnce.mockResolvedValueOnce([toDataFrame({ fields: [{ name: 't', values: [] }] })]);
    runSqlOnce.mockResolvedValueOnce(off(0));
    await ensureSessionZone('vw_c', 'ds1');
    expect(setSessionZone).toHaveBeenCalledWith('ds1', 'vw_c', undefined);
    expect(getTimeModeCache('ds1', 'vw_c')).toBeUndefined();
  });

  it('a failing probe leaves the session zone and does not break the page', async () => {
    runSqlOnce.mockRejectedValue(new Error('denied'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(ensureSessionZone('vw_d', 'ds1')).resolves.toBeUndefined();
    expect(setSessionZone).toHaveBeenCalledWith('ds1', 'vw_d', undefined);
    warn.mockRestore();
  });

  it('timeZone other than "auto": no probe at all', async () => {
    setAppConfig({ timeZone: '+00:00' });
    await ensureSessionZone('vw_e', 'ds1');
    expect(runSqlOnce).not.toHaveBeenCalled();
  });
});

describe('oldest log of a view (datasource/oldest.ts)', () => {
  it('runs the LIMIT 1 probes, then MIN over one hour; caches the result per browser', async () => {
    const now = Date.UTC(2026, 10, 25, 6, 0);
    const oldest = now - 3 * 3_600_000 - 1234;
    runSqlOnce.mockImplementation(async (sql: string) => {
      const before = /< FROM_UNIXTIME\((\d+)\) LIMIT 1/.exec(sql);
      if (before) {
        return [toDataFrame({ fields: [{ name: 'x', values: oldest < Number(before[1]) * 1000 ? [1] : [] }] })];
      }
      return [toDataFrame({ fields: [{ name: 'oldest', values: [oldest] }] })];
    });
    expect(await fetchOldestLog('vw_o', 'ds1', now)).toBe(oldest);
    expect(runSqlOnce.mock.calls.every((c) => c[4].view === 'vw_o' && c[4].timeoutSeconds === 30)).toBe(true);
    expect(getOldestCache('ds1', 'vw_o')).toEqual({ oldestMs: oldest, checkedAt: now });
    runSqlOnce.mockClear();
    expect(await fetchOldestLog('vw_o', 'ds1', now + 60_000)).toBe(oldest);
    expect(runSqlOnce).not.toHaveBeenCalled();
  });

  it('a cache older than 6 hours is refreshed; an empty view is remembered as null', async () => {
    setOldestCache('ds1', 'vw_e', { oldestMs: 1, checkedAt: 0 });
    runSqlOnce.mockResolvedValue([toDataFrame({ fields: [{ name: 'x', values: [] }] })]);
    expect(await fetchOldestLog('vw_e', 'ds1', 7 * 3_600_000)).toBeUndefined();
    expect(getOldestCache('ds1', 'vw_e')?.oldestMs).toBeNull();
  });

  it('two callers at once share one search', async () => {
    let calls = 0;
    runSqlOnce.mockImplementation(async () => {
      calls++;
      return [toDataFrame({ fields: [{ name: 'x', values: [] }] })];
    });
    await Promise.all([fetchOldestLog('vw_s', 'ds2', 1000), fetchOldestLog('vw_s', 'ds2', 1000)]);
    expect(calls).toBe(1);
  });
});
