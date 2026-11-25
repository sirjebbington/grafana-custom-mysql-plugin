import {
  getOldestCache,
  getTimeModeCache,
  getVolumeVisible,
  setOldestCache,
  setTimeModeCache,
  setVolumeVisible,
} from './storage';

beforeEach(() => window.localStorage.clear());

describe('per-browser caches and settings', () => {
  it('oldest log per data source and view; invalid stored values are ignored', () => {
    setOldestCache('ds', 'v', { oldestMs: 5, checkedAt: 9 });
    expect(getOldestCache('ds', 'v')).toEqual({ oldestMs: 5, checkedAt: 9 });
    expect(getOldestCache('ds', 'other')).toBeUndefined();
    window.localStorage.setItem(
      'kotak-starrocks-logs-app:oldest:ds:bad',
      JSON.stringify({ oldestMs: 'x', checkedAt: 1 })
    );
    expect(getOldestCache('ds', 'bad')).toBeUndefined();
    setOldestCache('ds', 'empty', { oldestMs: null, checkedAt: 1 });
    expect(getOldestCache('ds', 'empty')?.oldestMs).toBeNull();
  });

  it('time column kind per view; unknown and malformed entries are not used', () => {
    setTimeModeCache('ds', 'v', { mode: { kind: 'naive', offsetMinutes: 330 }, checkedAt: 1 });
    expect(getTimeModeCache('ds', 'v')?.mode).toEqual({ kind: 'naive', offsetMinutes: 330 });
    window.localStorage.setItem(
      'kotak-starrocks-logs-app:tz:ds:u',
      JSON.stringify({ mode: { kind: 'unknown' }, checkedAt: 1 })
    );
    expect(getTimeModeCache('ds', 'u')).toBeUndefined();
    window.localStorage.setItem(
      'kotak-starrocks-logs-app:tz:ds:n',
      JSON.stringify({ mode: { kind: 'naive' }, checkedAt: 1 })
    );
    expect(getTimeModeCache('ds', 'n')).toBeUndefined();
  });

  it('the volume chart is shown unless hidden', () => {
    expect(getVolumeVisible()).toBe(true);
    setVolumeVisible(false);
    expect(getVolumeVisible()).toBe(false);
    setVolumeVisible(true);
    expect(getVolumeVisible()).toBe(true);
  });
});
