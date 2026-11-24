import { AppEvents, rangeUtil } from '@grafana/data';
import { getAppEvents } from '@grafana/runtime';
import { SceneTimeRange, SceneTimeRangeState } from '@grafana/scenes';

import { getAppConfig } from '../config/config';
import { capTimeRange } from '../state/timeRange';

const HOUR_MS = 3_600_000;

/**
 * Time range of the app, limited to maxRangeHours (24 by default). Every way a range is set (picker, typed
 * range, zoom out, URL, "Use the last N hours") goes through setState, so a longer range never reaches a
 * query: it is cut to its last maxRangeHours and the user is told.
 */
export class CappedTimeRange extends SceneTimeRange {
  public setState(update: Partial<SceneTimeRangeState>) {
    if (update.from !== undefined || update.to !== undefined || update.value !== undefined) {
      const next = { ...this.state, ...update };
      const maxHours = getAppConfig().maxRangeHours;
      const capped = capTimeRange(next.from, next.to, next.value, maxHours * HOUR_MS);
      if (capped) {
        update = {
          ...update,
          ...capped,
          value: rangeUtil.convertRawToRange(capped, this.getTimeZone()),
        };
        notifyCapped(maxHours);
      }
    }
    super.setState(update);
  }
}

let lastNotice = 0;

function notifyCapped(hours: number) {
  // one notice per change (the URL sync can apply the same range twice)
  if (Date.now() - lastNotice < 2000) {
    return;
  }
  lastNotice = Date.now();
  try {
    getAppEvents().publish({
      type: AppEvents.alertWarning.name,
      payload: [
        `Time range limited to ${hours} hours`,
        `Logs Drilldown (StarRocks) searches at most ${hours} hours at a time. The range was cut to its last ${hours} hours.`,
      ],
    });
  } catch {
    // no app events (tests)
  }
}
