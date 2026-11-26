import { css } from '@emotion/css';
import { useEffect, useState } from 'react';

import { dateTime, GrafanaTheme2, rangeUtil, RawTimeRange } from '@grafana/data';
import { SceneComponentProps, SceneObjectBase, SceneObjectState, sceneGraph } from '@grafana/scenes';
import { Button, ButtonGroup, DateTimePicker, Stack, ToolbarButton, useStyles2 } from '@grafana/ui';

import { QUICK_RANGES } from '../constants';
import { getAppConfig } from '../config/config';
import { quickRangeMs } from '../state/timeRange';
import { endForStart, latestEnd, shift, windowError, zoomOut } from '../state/timeWindow';

const HOUR_MS = 3_600_000;

/**
 * The app's time control. Grafana's time picker lets any range be picked (the app then had to cut it); this one
 * only offers ranges of at most maxRangeHours (24): quick ranges up to "Last 24 hours", and an absolute range
 * whose end can be picked only up to maxRangeHours after its start (and not after now). Zoom out stops at
 * maxRangeHours, stepping forward stops at now. Links and URLs with a longer range are still cut by
 * CappedTimeRange, with a notice.
 */
export class TimeWindowPicker extends SceneObjectBase<SceneObjectState> {
  static Component = TimeWindowPickerRenderer;
}

function TimeWindowPickerRenderer({ model }: SceneComponentProps<TimeWindowPicker>) {
  const styles = useStyles2(getStyles);
  const timeRange = sceneGraph.getTimeRange(model);
  const { value, from, to } = timeRange.useState();
  const timeZone = timeRange.getTimeZone();
  const maxHours = getAppConfig().maxRangeHours;
  const [draft, setDraft] = useState<{ from: number; to: number }>();
  const open = draft !== undefined;
  // "now" for the limits shown (latest end, forward button), refreshed every 30 s and when the panel opens
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, []);
  const fromMs = value.from.valueOf();
  const toMs = value.to.valueOf();
  const quick = QUICK_RANGES.filter((r) => (quickRangeMs(r.from) ?? 0) <= maxHours * HOUR_MS);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDraft(undefined);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const apply = (raw: RawTimeRange) => {
    timeRange.onTimeRangeChange(rangeUtil.convertRawToRange(raw, timeZone));
    setDraft(undefined);
  };
  const applyMs = (r: { fromMs: number; toMs: number }) => apply({ from: dateTime(r.fromMs), to: dateTime(r.toMs) });
  const error = draft ? windowError(draft.from, draft.to, maxHours, now) : undefined;

  return (
    <div className={styles.wrapper}>
      <ButtonGroup>
        <ToolbarButton
          aria-label="Move time range back"
          tooltip="Move the time range back"
          icon="angle-left"
          onClick={() => applyMs(shift(fromMs, toMs, -1, Date.now()))}
        />
        <ToolbarButton
          data-testid="time-window-picker"
          aria-label="Time range"
          icon="clock-nine"
          isOpen={open}
          onClick={() => {
            setNow(Date.now());
            setDraft(open ? undefined : { from: fromMs, to: toMs });
          }}
        >
          {rangeUtil.describeTimeRange({ from, to }, timeZone)}
        </ToolbarButton>
        <ToolbarButton
          aria-label="Move time range forward"
          tooltip="Move the time range forward"
          icon="angle-right"
          disabled={toMs >= now - 1000}
          onClick={() => applyMs(shift(fromMs, toMs, 1, Date.now()))}
        />
      </ButtonGroup>
      <ToolbarButton
        aria-label="Zoom out time range"
        tooltip={`Zoom out (at most ${maxHours} hours)`}
        icon="search-minus"
        disabled={toMs - fromMs >= maxHours * HOUR_MS}
        onClick={() => applyMs(zoomOut(fromMs, toMs, maxHours, Date.now()))}
      />
      {draft && (
        <div className={styles.panel} role="dialog" aria-label="Pick a time range" data-testid="time-window-panel">
          <div className={styles.absolute}>
            <div className={styles.title}>Absolute time range</div>
            <div className={styles.hint}>
              At most {maxHours} hours: the end can be picked up to {maxHours} hours after the start.
            </div>
            <DateTimePicker
              label="From"
              date={dateTime(draft.from)}
              maxDate={new Date(now)}
              timeZone={timeZone}
              showSeconds={false}
              onChange={(d) =>
                d && setDraft({ from: d.valueOf(), to: endForStart(d.valueOf(), draft.to, maxHours, now) })
              }
            />
            <DateTimePicker
              label="To"
              date={dateTime(draft.to)}
              minDate={new Date(draft.from)}
              maxDate={new Date(latestEnd(draft.from, maxHours, now))}
              timeZone={timeZone}
              showSeconds={false}
              onChange={(d) => d && setDraft({ ...draft, to: d.valueOf() })}
            />
            {error && (
              <div className={styles.error} data-testid="time-window-error" role="alert">
                {error}
              </div>
            )}
            <Stack>
              <Button
                size="sm"
                disabled={error !== undefined}
                onClick={() => applyMs({ fromMs: draft.from, toMs: draft.to })}
                data-testid="time-window-apply"
              >
                Apply time range
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setDraft(undefined)}>
                Cancel
              </Button>
            </Stack>
          </div>
          <div className={styles.quick} data-testid="time-window-quick">
            {quick.map((r) => (
              <button
                key={r.from}
                type="button"
                className={from === r.from && to === r.to ? styles.quickActive : styles.quickItem}
                onClick={() => apply({ from: r.from, to: r.to })}
              >
                {r.display}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => {
  const item = {
    background: 'none',
    border: 'none',
    textAlign: 'left' as const,
    padding: theme.spacing(0.5, 1),
    borderRadius: theme.shape.radius.default,
    color: theme.colors.text.primary,
    cursor: 'pointer',
    '&:hover': { background: theme.colors.action.hover },
  };
  return {
    wrapper: css({ position: 'relative', display: 'flex', gap: theme.spacing(1), alignItems: 'center' }),
    panel: css({
      position: 'absolute',
      top: '100%',
      right: 0,
      marginTop: theme.spacing(0.5),
      zIndex: theme.zIndex.dropdown,
      display: 'flex',
      gap: theme.spacing(2),
      padding: theme.spacing(2),
      background: theme.colors.background.primary,
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.radius.default,
      boxShadow: theme.shadows.z3,
    }),
    absolute: css({ display: 'flex', flexDirection: 'column', gap: theme.spacing(1), width: 320 }),
    title: css({ fontWeight: theme.typography.fontWeightMedium }),
    hint: css({ color: theme.colors.text.secondary, fontSize: theme.typography.bodySmall.fontSize }),
    error: css({ color: theme.colors.error.text, fontSize: theme.typography.bodySmall.fontSize }),
    quick: css({
      display: 'flex',
      flexDirection: 'column',
      minWidth: 160,
      borderLeft: `1px solid ${theme.colors.border.weak}`,
      paddingLeft: theme.spacing(1),
    }),
    quickItem: css(item),
    quickActive: css({ ...item, background: theme.colors.action.selected }),
  };
};
