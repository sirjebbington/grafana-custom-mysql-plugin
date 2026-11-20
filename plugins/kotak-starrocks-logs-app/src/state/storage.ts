/**
 * Per-browser conveniences kept in localStorage: the last data source and view the user opened, and their
 * favourite values per view and label. Reads and writes never throw (private windows, blocked storage).
 */
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
