/**
 * Per-browser conveniences kept in localStorage: the last data source and view the user opened, their
 * favourite values per view and label, and per view the cached time of its oldest line and how its time
 * column relates to time zones. Reads and writes never throw (private windows, blocked storage).
 */
import { TimeMode } from '../sql/timeZone';

const PREFIX = 'kotak-starrocks-logs-app';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`${PREFIX}:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(`${PREFIX}:${key}`, JSON.stringify(value));
  } catch {
    // ignore: storage unavailable
  }
}

export interface LastSelection {
  ds?: string;
  view?: string;
}

export function getLastSelection(): LastSelection {
  return read<LastSelection>('last', {});
}

export function setLastSelection(ds: string | undefined, view: string | undefined) {
  write('last', { ds, view });
}

function favKey(ds: string, view: string, label: string) {
  return `fav:${ds}:${view}:${label}`;
}

export function getFavorites(ds: string, view: string, label: string): string[] {
  const v = read<unknown>(favKey(ds, view, label), []);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function toggleFavorite(ds: string, view: string, label: string, value: string): string[] {
  const cur = getFavorites(ds, view, label);
  const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
  write(favKey(ds, view, label), next);
  return next;
}

export interface OldestCache {
  /** time of the oldest line, ms; null = the view had no lines */
  oldestMs: number | null;
  checkedAt: number;
}

export function getOldestCache(ds: string, view: string): OldestCache | undefined {
  const v = read<Partial<OldestCache> | null>(`oldest:${ds}:${view}`, null);
  if (!v || typeof v.checkedAt !== 'number' || !(v.oldestMs === null || typeof v.oldestMs === 'number')) {
    return undefined;
  }
  return { oldestMs: v.oldestMs, checkedAt: v.checkedAt };
}

export function setOldestCache(ds: string, view: string, value: OldestCache) {
  write(`oldest:${ds}:${view}`, value);
}

export interface TimeModeCache {
  mode: TimeMode;
  checkedAt: number;
}

export function getTimeModeCache(ds: string, view: string): TimeModeCache | undefined {
  const v = read<Partial<TimeModeCache> | null>(`tz:${ds}:${view}`, null);
  const kind = v?.mode?.kind;
  if (!v || typeof v.checkedAt !== 'number' || (kind !== 'aware' && kind !== 'naive')) {
    return undefined;
  }
  if (kind === 'naive' && typeof (v.mode as { offsetMinutes?: unknown }).offsetMinutes !== 'number') {
    return undefined;
  }
  return { mode: v.mode as TimeMode, checkedAt: v.checkedAt };
}

export function setTimeModeCache(ds: string, view: string, value: TimeModeCache) {
  write(`tz:${ds}:${view}`, value);
}

/** Logs tab: volume chart shown (default) or hidden, per browser. */
export function getVolumeVisible(): boolean {
  return read<boolean>('volume', true) !== false;
}

export function setVolumeVisible(visible: boolean) {
  write('volume', visible);
}
