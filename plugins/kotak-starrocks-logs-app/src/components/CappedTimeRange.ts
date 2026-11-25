import { rangeUtil } from '@grafana/data';
import { SceneTimeRange, SceneTimeRangeState } from '@grafana/scenes';

import { getAppConfig } from '../config/config';
import { capTimeRange } from '../state/timeRange';

const HOUR_MS = 3_600_000;

export interface CappedTimeRangeState extends SceneTimeRangeState {
  /** set when the last change was cut to maxRangeHours; shown as a notice under the header */
  capped?: { hours: number; at: number };
}

/**
 * Time range of the app, limited to maxRangeHours (24 by default). Every way a range is set (picker, typed
 * range, zoom out, URL, "Use the last N hours") goes through setState, so a longer range never reaches a
 * query: it is cut to its last maxRangeHours, and `capped` tells the page to say so (a notice under the header,
 * not a toast over the time picker).
 */
export class CappedTimeRange extends SceneTimeRange {
  public setState(update: Partial<CappedTimeRangeState>) {
    if (update.from !== undefined || update.to !== undefined || update.value !== undefined) {
      const next = { ...this.state, ...update };
      const maxHours = getAppConfig().maxRangeHours;
      const capped = capTimeRange(next.from, next.to, next.value, maxHours * HOUR_MS);
      if (capped) {
        update = {
          ...update,
          ...capped,
          value: rangeUtil.convertRawToRange(capped, this.getTimeZone()),
          capped: { hours: maxHours, at: Date.now() },
        };
      } else if (update.from !== undefined || update.to !== undefined) {
        update = { ...update, capped: undefined };
      }
    }
    super.setState(update);
  }

  dismissCapped() {
    super.setState({ capped: undefined } as Partial<CappedTimeRangeState>);
  }
}

/** The capped-range notice of the scene's time range, if it is a CappedTimeRange. */
export function cappedOf(state: object): CappedTimeRangeState['capped'] {
  return (state as CappedTimeRangeState).capped;
}
