import { decideTimeMode, formatOffset, parseWallClock, zoneForMode } from './timeZone';

const now = Date.UTC(2026, 10, 24, 10, 45, 0);
const text = (ms: number) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '123');

describe('decideTimeMode', () => {
  it('aware (Iceberg timestamptz): the same line reads one hour later with +01:00 -> UTC session', () => {
    const t = now - 20_000;
    const mode = decideTimeMode(text(t), text(t + 3_600_000), now);
    expect(mode).toEqual({ kind: 'aware' });
    expect(zoneForMode(mode)).toBe('+00:00');
  });

  it('a line arriving between the probes still counts', () => {
    expect(decideTimeMode(text(now - 20_000), text(now - 5_000 + 3_600_000), now)).toEqual({ kind: 'aware' });
    expect(decideTimeMode(text(now - 20_000), text(now - 5_000), now).kind).toBe('naive');
  });

  it('naive with IST wall clock (a pipeline writing local time) -> +05:30 session', () => {
    const ist = now - 90_000 + 330 * 60_000;
    const mode = decideTimeMode(text(ist), text(ist), now, 330);
    expect(mode).toEqual({ kind: 'naive', offsetMinutes: 330 });
    expect(zoneForMode(mode)).toBe('+05:30');
    // 3 hours old: in UTC it would be in the future, so IST
    const older = now - 3 * 3_600_000 + 330 * 60_000;
    expect(decideTimeMode(text(older), text(older), now, 330)).toEqual({ kind: 'naive', offsetMinutes: 330 });
  });

  it('naive with UTC wall clock -> +00:00 session, whatever the session zone', () => {
    const mode = decideTimeMode(text(now - 60_000), text(now - 60_000), now, 330);
    expect(mode).toEqual({ kind: 'naive', offsetMinutes: 0 });
    expect(zoneForMode(mode)).toBe('+00:00');
    expect(decideTimeMode(text(now - 60_000), text(now - 60_000), now, 0)).toEqual({ kind: 'naive', offsetMinutes: 0 });
  });

  it('unknown (session zone kept) when there are no recent lines or the newest is too old to tell', () => {
    expect(decideTimeMode(undefined, undefined, now).kind).toBe('unknown');
    // 5 hours old in UTC, or 10.5 hours old in IST: cannot tell
    const old = now - 5 * 3_600_000;
    expect(decideTimeMode(text(old), text(old), now, 330).kind).toBe('unknown');
    expect(decideTimeMode(text(now), text(now + 7_200_000), now).kind).toBe('unknown');
    expect(zoneForMode({ kind: 'unknown', reason: 'x' })).toBeUndefined();
  });

  it('a session in UTC: a naive column is UTC even if old', () => {
    const old = now - 5 * 3_600_000;
    expect(decideTimeMode(text(old), text(old), now, 0)).toEqual({ kind: 'naive', offsetMinutes: 0 });
  });
});

describe('helpers', () => {
  it('parseWallClock reads StarRocks DATETIME text with or without microseconds', () => {
    expect(parseWallClock('2026-11-24 10:45:43.898092')).toBe(Date.UTC(2026, 10, 24, 10, 45, 43, 898));
    expect(parseWallClock('2026-11-24 10:45:43')).toBe(Date.UTC(2026, 10, 24, 10, 45, 43));
    expect(parseWallClock('nope')).toBeNaN();
  });

  it('formatOffset', () => {
    expect([formatOffset(330), formatOffset(0), formatOffset(-210)]).toEqual(['+05:30', '+00:00', '-03:30']);
  });
});
