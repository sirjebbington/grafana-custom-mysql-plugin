import { DataFrame, DataQueryResponse, LoadingState } from '@grafana/data';

/**
 * Finished query results, kept for a few minutes under the exact query and time range. Going back to a screen
 * (browser Back, a tab, the grid) shows its last results at once instead of re-running queries that take
 * seconds on the shared cluster. A refresh evaluates the time range again (another key) and clears the cache;
 * a relative range moves on by itself, so only re-visits within the same range value hit.
 */
const TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 40;

interface Entry {
  at: number;
  response: DataQueryResponse;
}

const entries = new Map<string, Entry>();

function cloneFrame(f: DataFrame): DataFrame {
  // panels (infinite scroll's merge in particular) may change frames in place; the cache keeps its own copy
  return {
    ...f,
    fields: f.fields.map((x) => ({ ...x, values: [...x.values], ...(x.nanos ? { nanos: [...x.nanos] } : {}) })),
  };
}

function cloneResponse(r: DataQueryResponse): DataQueryResponse {
  return { ...r, data: (r.data as DataFrame[]).map(cloneFrame) };
}

export function getCached(key: string, now = Date.now()): DataQueryResponse | undefined {
  const e = entries.get(key);
  if (!e) {
    return undefined;
  }
  if (now - e.at > TTL_MS) {
    entries.delete(key);
    return undefined;
  }
  // most recently used last
  entries.delete(key);
  entries.set(key, e);
  return cloneResponse(e.response);
}

/** Keeps only finished, successful responses. */
export function putCached(key: string, response: DataQueryResponse, now = Date.now()) {
  if (response.state !== LoadingState.Done || response.error || (response.errors?.length ?? 0) > 0) {
    return;
  }
  entries.delete(key);
  entries.set(key, { at: now, response: cloneResponse(response) });
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    entries.delete(oldest);
  }
}

export function clearQueryCache() {
  entries.clear();
}

export function queryCacheSize(): number {
  return entries.size;
}
