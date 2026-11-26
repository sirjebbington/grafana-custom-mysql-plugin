import { endForStart, latestEnd, shift, windowError, zoomOut } from './timeWindow';

const H = 3_600_000;
const NOW = Date.UTC(2026, 10, 26, 12, 0);

describe('time window rules (at most 24 hours, never in the future)', () => {
  it('a valid window has no error; each invalid one says why', () => {
    expect(windowError(NOW - 6 * H, NOW, 24, NOW)).toBeUndefined();
    expect(windowError(NOW - 24 * H, NOW, 24, NOW)).toBeUndefined();
    expect(windowError(NOW - 25 * H, NOW, 24, NOW)).toBe('Pick at most 24 hours');
    expect(windowError(NOW - 2 * H, NOW - 3 * H, 24, NOW)).toBe('The end must be after the start');
    expect(windowError(NOW + H, NOW + 2 * H, 24, NOW)).toBe('The start must be in the past');
    expect(windowError(Number.NaN, NOW, 24, NOW)).toBe('Pick a start and an end');
    expect(windowError(NOW - 7 * H, NOW, 6, NOW)).toBe('Pick at most 6 hours');
  });

  it('the latest end for a start: 24 hours later, but not after now', () => {
    expect(latestEnd(NOW - 48 * H, 24, NOW)).toBe(NOW - 24 * H);
    expect(latestEnd(NOW - 2 * H, 24, NOW)).toBe(NOW);
  });

  it('moving the start keeps a valid end, else uses the latest allowed end', () => {
    expect(endForStart(NOW - 30 * H, NOW - 20 * H, 24, NOW)).toBe(NOW - 20 * H);
    expect(endForStart(NOW - 72 * H, NOW, 24, NOW)).toBe(NOW - 48 * H);
    expect(endForStart(NOW - 5 * H, NOW - 6 * H, 24, NOW)).toBe(NOW);
  });

  it('zoom out doubles around the middle, stops at 24 hours and at now', () => {
    expect(zoomOut(NOW - 4 * H, NOW - 2 * H, 24, NOW)).toEqual({ fromMs: NOW - 5 * H, toMs: NOW - H });
    expect(zoomOut(NOW - 6 * H, NOW, 24, NOW)).toEqual({ fromMs: NOW - 12 * H, toMs: NOW });
    expect(zoomOut(NOW - 20 * H, NOW, 24, NOW)).toEqual({ fromMs: NOW - 24 * H, toMs: NOW });
  });

  it('step back and forward by the length; forward stops at now', () => {
    expect(shift(NOW - 2 * H, NOW, -1, NOW)).toEqual({ fromMs: NOW - 4 * H, toMs: NOW - 2 * H });
    expect(shift(NOW - 4 * H, NOW - 2 * H, 1, NOW)).toEqual({ fromMs: NOW - 2 * H, toMs: NOW });
    expect(shift(NOW - 3 * H, NOW - H, 1, NOW)).toEqual({ fromMs: NOW - 2 * H, toMs: NOW });
  });
});
