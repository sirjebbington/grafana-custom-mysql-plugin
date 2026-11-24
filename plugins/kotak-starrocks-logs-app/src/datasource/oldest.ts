import { dateTime, TimeRange } from '@grafana/data';

import { anyBeforeQuery, oldestInRangeQuery } from '../sql/builder';
import { getOldestCache, setOldestCache } from '../state/storage';
import { runSqlOnce } from './api';
import { findOldest } from './oldestSearch';

const HOUR_MS = 3_600_000;
// cached per browser, data source and view
const CACHE_MS = 6 * HOUR_MS;
// each probe is a LIMIT 1 query or a MIN over one hour
const PROBE_TIMEOUT_SECONDS = 30;

function rangeAround(ms: number): TimeRange {
  const t = dateTime(ms);
  return { from: t, to: t, raw: { from: t, to: t } };
}

const inFlight = new Map<string, Promise<number | undefined>>();

/** Oldest line of a view (ms), cached in localStorage for a few hours. */
export function fetchOldestLog(view: string, datasource: string, nowMs = Date.now()): Promise<number | undefined> {
  const cached = getOldestCache(datasource, view);
  if (cached && nowMs - cached.checkedAt < CACHE_MS) {
    return Promise.resolve(cached.oldestMs ?? undefined);
  }
  const key = `${datasource}/${view}`;
  let p = inFlight.get(key);
  if (!p) {
    const range = rangeAround(nowMs);
    const anyBefore = async (ms: number) => {
      const frames = await runSqlOnce(anyBeforeQuery(view, ms), range, 'oldest', datasource, {
        view,
        timeoutSeconds: PROBE_TIMEOUT_SECONDS,
      });
      return (frames[0]?.length ?? 0) > 0;
    };
    const oldestIn = async (fromMs: number, toMs: number) => {
      const frames = await runSqlOnce(oldestInRangeQuery(view, fromMs, toMs), range, 'oldest', datasource, {
        view,
        timeoutSeconds: PROBE_TIMEOUT_SECONDS,
      });
      const v = frames[0]?.fields[0]?.values[0];
      return v === null || v === undefined ? undefined : Number(v);
    };
    p = findOldest(nowMs, anyBefore, oldestIn)
      .then((oldestMs) => {
        setOldestCache(datasource, view, { oldestMs: oldestMs ?? null, checkedAt: nowMs });
        return oldestMs;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, p);
  }
  return p;
}
