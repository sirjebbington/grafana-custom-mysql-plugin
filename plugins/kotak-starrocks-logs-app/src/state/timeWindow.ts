/**
 * Rules of the app's time control (components/TimeWindowPicker.tsx): a time range is at most maxRangeHours
 * long and never ends in the future. The control only offers ranges that follow them, so the range the user
 * picks is the range that is queried.
 */
const HOUR_MS = 3_600_000;

/** Why a start/end pair cannot be applied, or undefined when it can. */
export function windowError(fromMs: number, toMs: number, maxHours: number, nowMs: number): string | undefined {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return 'Pick a start and an end';
  }
  if (toMs <= fromMs) {
    return 'The end must be after the start';
  }
  if (fromMs >= nowMs) {
    return 'The start must be in the past';
  }
  if (toMs - fromMs > maxHours * HOUR_MS) {
    return `Pick at most ${maxHours} hours`;
  }
  return undefined;
}

/** Latest end allowed for a start: maxHours later, but not after now. */
export function latestEnd(fromMs: number, maxHours: number, nowMs: number): number {
  return Math.min(fromMs + maxHours * HOUR_MS, nowMs);
}

/** End after the start moved: kept if still allowed, else the latest allowed end (shown before applying). */
export function endForStart(fromMs: number, toMs: number, maxHours: number, nowMs: number): number {
  const latest = latestEnd(fromMs, maxHours, nowMs);
  return toMs > fromMs && toMs <= latest ? toMs : latest;
}

/** Zoom out: twice as long around the same middle, at most maxHours, not past now. */
export function zoomOut(
  fromMs: number,
  toMs: number,
  maxHours: number,
  nowMs: number
): { fromMs: number; toMs: number } {
  const length = Math.min((toMs - fromMs) * 2, maxHours * HOUR_MS);
  const middle = (fromMs + toMs) / 2;
  const to = Math.min(Math.round(middle + length / 2), nowMs);
  return { fromMs: to - length, toMs: to };
}

/** Step back or forward by the range's length; forward stops at now. */
export function shift(
  fromMs: number,
  toMs: number,
  direction: -1 | 1,
  nowMs: number
): { fromMs: number; toMs: number } {
  const length = toMs - fromMs;
  const to = Math.min(toMs + direction * length, nowMs);
  return { fromMs: to - length, toMs: to };
}
