import { dateTime, TimeRange } from '@grafana/data';

import { getAppConfig } from '../config/config';
import { newestTimeTextQuery, sessionZoneQuery } from '../sql/builder';
import { decideTimeMode, PROBE_ZONES, TimeMode, zoneForMode } from '../sql/timeZone';
import { getTimeModeCache, setTimeModeCache } from '../state/storage';
import { relationOf, runSqlOnce, setSessionZone, stringColumn } from './api';

const CACHE_MS = 24 * 3_600_000;
const PROBE_TIMEOUT_SECONDS = 30;

const pending = new Map<string, Promise<TimeMode>>();

function nowRange(): TimeRange {
  const now = dateTime();
  return { from: now, to: now, raw: { from: now, to: now } };
}

async function probe(view: string, datasource: string, zone: string): Promise<string | undefined> {
  const frames = await runSqlOnce(
    newestTimeTextQuery(view, relationOf(datasource, view)),
    nowRange(),
    'tz',
    datasource,
    {
      timeZone: zone,
      timeoutSeconds: PROBE_TIMEOUT_SECONDS,
    }
  );
  return stringColumn(frames[0], 't')[0];
}

/** Offset of the data source's own session zone, in minutes (e.g. 330 for Asia/Kolkata). */
async function sessionOffset(datasource: string): Promise<number> {
  const frames = await runSqlOnce(sessionZoneQuery(), nowRange(), 'tz', datasource, {
    timeZone: null,
    timeoutSeconds: PROBE_TIMEOUT_SECONDS,
  });
  const off = Number(stringColumn(frames[0], 'off')[0]);
  return Number.isFinite(off) ? Math.round(off / 15) * 15 : 0;
}

/** Finds how the view's time column relates to time zones (sql/timeZone.ts); cached per browser for a day. */
export function detectTimeMode(view: string, datasource: string): Promise<TimeMode> {
  const key = `${datasource}/${view}`;
  const cached = getTimeModeCache(datasource, view);
  if (cached && Date.now() - cached.checkedAt < CACHE_MS) {
    return Promise.resolve(cached.mode);
  }
  let p = pending.get(key);
  if (!p) {
    p = (async () => {
      const t0 = await probe(view, datasource, PROBE_ZONES[0]);
      const t1 = await probe(view, datasource, PROBE_ZONES[1]);
      const mode = decideTimeMode(t0, t1, Date.now(), await sessionOffset(datasource));
      if (mode.kind !== 'unknown') {
        setTimeModeCache(datasource, view, { mode, checkedAt: Date.now() });
      }
      return mode;
    })().finally(() => pending.delete(key));
    pending.set(key, p);
  }
  return p;
}

/**
 * Sets the session zone of the app's statements on this view, before its first query (called from
 * buildContext). With timeZone "auto" it is detected; a failed probe leaves the data source's session zone.
 */
export async function ensureSessionZone(view: string, datasource: string): Promise<void> {
  if (getAppConfig().timeZone !== 'auto') {
    return;
  }
  try {
    const mode = await detectTimeMode(view, datasource);
    setSessionZone(datasource, view, zoneForMode(mode));
    if (mode.kind === 'unknown') {
      console.info(`kotak-starrocks-logs-app: time zone of ${view} not detected (${mode.reason}); session zone used`);
    }
  } catch (e) {
    setSessionZone(datasource, view, undefined);
    console.warn(`kotak-starrocks-logs-app: time zone probe of ${view} failed`, e);
  }
}
