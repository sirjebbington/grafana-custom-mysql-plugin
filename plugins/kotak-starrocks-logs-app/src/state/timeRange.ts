import { rangeUtil, TimeRange } from '@grafana/data';

// rounding of relative ranges ("now-24h" evaluated a moment later) is not a longer range
const SLACK_MS = 60_000;

/**
 * The same range cut to at most maxMs, keeping its end: a range ending now (or later, as after "zoom out")
 * becomes "now-24h".."now"; any other range becomes absolute (its last maxMs). Returns undefined when the
 * range is not longer than maxMs.
 */
export function capTimeRange(
  from: string,
  to: string,
  value: TimeRange,
  maxMs: number,
  nowMs = Date.now()
): { from: string; to: string } | undefined {
  if (value.to.valueOf() - value.from.valueOf() <= maxMs + SLACK_MS) {
    return undefined;
  }
  if (to === 'now' || value.to.valueOf() >= nowMs - SLACK_MS) {
    const minutes = Math.round(maxMs / 60_000);
    return { from: minutes % 60 === 0 ? `now-${minutes / 60}h` : `now-${minutes}m`, to: 'now' };
  }
  const toMs = value.to.valueOf();
  return { from: new Date(toMs - maxMs).toISOString(), to: new Date(toMs).toISOString() };
}

/** Length of a quick range like now-12h, or undefined. */
export function quickRangeMs(from: string): number | undefined {
  const m = /^now-(\d+[smhdwMy])$/.exec(from);
  return m ? rangeUtil.intervalToMs(m[1]) : undefined;
}
