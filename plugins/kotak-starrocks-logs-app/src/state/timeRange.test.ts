import { dateTime, TimeRange } from '@grafana/data';

import { capTimeRange, quickRangeMs } from './timeRange';

const H = 3_600_000;

function range(fromMs: number, toMs: number): TimeRange {
  return { from: dateTime(fromMs), to: dateTime(toMs), raw: { from: dateTime(fromMs), to: dateTime(toMs) } };
}

describe('capTimeRange', () => {
  const now = Date.UTC(2026, 10, 24, 14, 0);

  it('leaves ranges up to the limit alone (with a minute of slack)', () => {
    expect(capTimeRange('now-24h', 'now', range(now - 24 * H, now), 24 * H)).toBeUndefined();
    expect(capTimeRange('now-15m', 'now', range(now - 15 * 60_000, now), 24 * H)).toBeUndefined();
  });

  it('keeps a relative range relative: now-7d..now becomes now-24h..now', () => {
    expect(capTimeRange('now-7d', 'now', range(now - 7 * 24 * H, now), 24 * H)).toEqual({
      from: 'now-24h',
      to: 'now',
    });
    expect(capTimeRange('now-7d', 'now', range(now - 7 * 24 * H, now), 1.5 * H)).toEqual({
      from: 'now-90m',
      to: 'now',
    });
  });

  it('a range ending in the future (zoom out) becomes the last 24 hours', () => {
    expect(capTimeRange('a', 'b', range(now - 36 * H, now + 12 * H), 24 * H, now)).toEqual({
      from: 'now-24h',
      to: 'now',
    });
  });

  it('cuts any other range to its last 24 hours, as absolute times', () => {
    const to = Date.UTC(2026, 10, 20, 12, 0);
    expect(
      capTimeRange('2026-11-17T00:00:00.000Z', '2026-11-20T12:00:00.000Z', range(to - 84 * H, to), 24 * H)
    ).toEqual({
      from: '2026-11-19T12:00:00.000Z',
      to: '2026-11-20T12:00:00.000Z',
    });
    expect(capTimeRange('now-3d', 'now-1d', range(now - 72 * H, now - 24 * H), 24 * H, now)?.to).toBe(
      new Date(now - 24 * H).toISOString()
    );
  });
});

describe('quickRangeMs', () => {
  it('reads now-N<unit> quick ranges', () => {
    expect(quickRangeMs('now-12h')).toBe(12 * H);
    expect(quickRangeMs('now-15m')).toBe(15 * 60_000);
    expect(quickRangeMs('now/d')).toBeUndefined();
  });
});
