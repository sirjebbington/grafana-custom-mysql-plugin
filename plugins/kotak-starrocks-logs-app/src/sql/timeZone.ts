/**
 * How the time column relates to time zones, found once per view from two tiny queries.
 *
 * StarRocks shows a DATETIME in one of two ways:
 * - "aware" (an Iceberg timestamptz): the value is an instant, shown as wall-clock time in the session zone.
 *   The same line reads 10:00 with time_zone '+00:00' and 11:00 with '+01:00'.
 * - "naive" (an Iceberg timestamp, a native DATETIME): the stored wall-clock text, whatever the session zone.
 *   Then the wall clock belongs to some zone (UTC, or e.g. IST if the pipeline wrote local time), found by
 *   comparing the newest line with the current time.
 *
 * The app runs every statement with time_zone set to the zone the column's wall clock is in ('+00:00' for
 * aware columns), and turns times into epoch milliseconds in SQL with UNIX_TIMESTAMP, which uses that same
 * zone. The time filter (FROM_UNIXTIME, also in the session zone), the times shown, "load more" and
 * "show context" then agree, whichever way the column was written.
 */

export type TimeMode =
  { kind: 'aware' } | { kind: 'naive'; offsetMinutes: number } | { kind: 'unknown'; reason: string };

/** The two session zones of the probe: the same line read in both. */
export const PROBE_ZONES = ['+00:00', '+01:00'] as const;

const MINUTE = 60_000;

/** Milliseconds of a StarRocks DATETIME text ("2026-11-24 10:45:43.898092"), read as if it were UTC. */
export function parseWallClock(text: string): number {
  const m = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)(?:\.(\d{1,6}))?/.exec(text.trim());
  if (!m) {
    return Number.NaN;
  }
  const ms = m[7] ? Number(m[7].padEnd(6, '0').slice(0, 3)) : 0;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms);
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const a = Math.abs(minutes);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

/**
 * Decides from the newest line read with time_zone '+00:00' (t0) and '+01:00' (t1).
 * - Aware: t1 is one hour after t0.
 * - Naive: both the same. The wall clock is in UTC or in the data source's session zone (sessionOffset
 *   minutes, e.g. 330 for Asia/Kolkata): the zone in which the newest line is not in the future, and is
 *   less than 15 minutes old if both qualify. If that does not decide it, unknown (the session zone is kept,
 *   the same assumption a client that simply uses the session makes).
 */
export function decideTimeMode(
  t0: string | undefined,
  t1: string | undefined,
  nowMs: number,
  sessionOffsetMinutes = 0
): TimeMode {
  if (!t0 || !t1) {
    return { kind: 'unknown', reason: 'no lines in the last day' };
  }
  const a = parseWallClock(t0);
  const b = parseWallClock(t1);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return { kind: 'unknown', reason: `unexpected time text ${t0} / ${t1}` };
  }
  // a new line may arrive between the two probes: allow a minute
  if (Math.abs(b - a - 60 * MINUTE) <= MINUTE) {
    return { kind: 'aware' };
  }
  if (Math.abs(b - a) > MINUTE) {
    return { kind: 'unknown', reason: `the probes disagree (${t0} / ${t1})` };
  }
  // age of the newest line if the wall clock is in a zone with this offset (allow a minute of clock skew)
  const ageIn = (offsetMinutes: number) => offsetMinutes * MINUTE - (a - nowMs);
  const candidates = Array.from(new Set([0, sessionOffsetMinutes]))
    .map((offsetMinutes) => ({ offsetMinutes, age: ageIn(offsetMinutes) }))
    .filter((c) => c.age >= -MINUTE)
    .sort((x, y) => x.age - y.age);
  if (candidates.length === 1 || (candidates.length > 1 && candidates[0].age < 15 * MINUTE)) {
    return { kind: 'naive', offsetMinutes: candidates[0].offsetMinutes };
  }
  return { kind: 'unknown', reason: 'the newest line is too old to tell the zone of its wall clock' };
}

/** Session zone for a mode; undefined = leave the data source's session zone. */
export function zoneForMode(mode: TimeMode): string | undefined {
  if (mode.kind === 'aware') {
    return '+00:00';
  }
  if (mode.kind === 'naive') {
    return formatOffset(mode.offsetMinutes);
  }
  return undefined;
}
