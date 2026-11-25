import { dateTime, rangeUtil } from '@grafana/data';

import { setAppConfig } from '../config/config';
import { CappedTimeRange, cappedOf } from './CappedTimeRange';

describe('CappedTimeRange (the scene time range: at most maxRangeHours)', () => {
  beforeEach(() => setAppConfig({}));

  it('cuts a 7-day change to the last 24 hours and flags it; a short range clears the flag', () => {
    const tr = new CappedTimeRange({ from: 'now-1h', to: 'now' });
    tr.onTimeRangeChange(rangeUtil.convertRawToRange({ from: 'now-7d', to: 'now' }));
    expect(tr.state.from).toBe('now-24h');
    expect(tr.state.to).toBe('now');
    expect(tr.state.value.to.valueOf() - tr.state.value.from.valueOf()).toBeCloseTo(24 * 3_600_000, -4);
    expect(cappedOf(tr.state)?.hours).toBe(24);
    tr.onTimeRangeChange(rangeUtil.convertRawToRange({ from: 'now-3h', to: 'now' }));
    expect(tr.state.from).toBe('now-3h');
    expect(cappedOf(tr.state)).toBeUndefined();
  });

  it('URL ranges are cut too (absolute: keeps the end)', () => {
    const tr = new CappedTimeRange({ from: 'now-1h', to: 'now' });
    const end = Date.UTC(2026, 10, 20, 12);
    tr.updateFromUrl({ from: String(end - 3 * 86_400_000), to: String(end) });
    expect(dateTime(tr.state.from).valueOf()).toBe(end - 86_400_000);
    expect(dateTime(tr.state.to).valueOf()).toBe(end);
  });

  it('a configured maxRangeHours; dismissing the notice keeps the range', () => {
    setAppConfig({ maxRangeHours: 6 });
    const tr = new CappedTimeRange({ from: 'now-1h', to: 'now' });
    tr.onTimeRangeChange(rangeUtil.convertRawToRange({ from: 'now-24h', to: 'now' }));
    expect(tr.state.from).toBe('now-6h');
    tr.dismissCapped();
    expect(cappedOf(tr.state)).toBeUndefined();
    expect(tr.state.from).toBe('now-6h');
  });
});
