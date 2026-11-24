/**
 * Search for the time of a view's oldest line, independent of how queries are run (so it can be unit
 * tested without Grafana).
 */
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
// a view older than this is shown as "more than 2048 days"
const MAX_DAYS = 2048;

/**
 * Finds the time of the oldest line of a view without reading it all. A MIN() over the whole view would read
 * the time column of every hourly partition the view has; instead this asks "is there any line before X?"
 * (LIMIT 1, so StarRocks stops at the first row; partitions after X are pruned, so a "no" costs nothing):
 * first 1, 2, 4, ... days back until the answer is no, then halving the gap down to one hour, then a MIN()
 * over that hour. About 20 small queries for a view with half a year of data.
 * Returns undefined when the view has no lines at all.
 */
export async function findOldest(
  nowMs: number,
  anyBefore: (ms: number) => Promise<boolean>,
  oldestIn: (fromMs: number, toMs: number) => Promise<number | undefined>
): Promise<number | undefined> {
  if (!(await anyBefore(nowMs))) {
    return undefined;
  }
  // data before hi, none before lo
  let hi = nowMs;
  let lo = Number.NaN;
  for (let days = 1; days <= MAX_DAYS; days *= 2) {
    const x = Math.floor((nowMs - days * DAY_MS) / HOUR_MS) * HOUR_MS;
    if (await anyBefore(x)) {
      hi = x;
    } else {
      lo = x;
      break;
    }
  }
  if (Number.isNaN(lo)) {
    return hi;
  }
  while (hi - lo > HOUR_MS) {
    const mid: number = lo + Math.max(1, Math.floor((hi - lo) / 2 / HOUR_MS)) * HOUR_MS;
    if (await anyBefore(mid)) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return (await oldestIn(lo, hi)) ?? lo;
}
