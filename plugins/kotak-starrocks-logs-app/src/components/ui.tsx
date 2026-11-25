import { css, cx } from '@emotion/css';
import { ReactNode, useEffect, useState } from 'react';

import { DataFrame, GrafanaTheme2, dateTimeFormat } from '@grafana/data';
import { Alert, Button, IconButton, LoadingPlaceholder, useStyles2, useTheme2 } from '@grafana/ui';

import { LEVEL_COLORS, Level } from '../constants';

export function levelColor(theme: GrafanaTheme2, level: string): string {
  const c = LEVEL_COLORS[(level as Level) ?? 'unknown'] ?? LEVEL_COLORS.unknown;
  return c === 'text' ? theme.colors.text.secondary : theme.visualization.getColorByName(c);
}

export function Chip({ children, onRemove, testId }: { children: ReactNode; onRemove?: () => void; testId?: string }) {
  const styles = useStyles2(getStyles);
  return (
    <span className={styles.chip} data-testid={testId}>
      <span className={styles.chipText}>{children}</span>
      {onRemove && <IconButton name="times" size="sm" aria-label="Remove filter" onClick={onRemove} />}
    </span>
  );
}

export function LevelDot({ level }: { level: string }) {
  const theme = useTheme2();
  return (
    <span
      style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: levelColor(theme, level) }}
    />
  );
}

/** Compact list of the newest lines of one service, used in the service grid. */
export function SampleList({ frame, loading, error }: { frame?: DataFrame; loading?: boolean; error?: string }) {
  const styles = useStyles2(getStyles);
  const theme = useTheme2();
  if (error) {
    return <div className={styles.sampleEmpty}>{error}</div>;
  }
  if (!frame) {
    return <div className={styles.sampleEmpty}>{loading ? 'Loading lines…' : 'No lines'}</div>;
  }
  const ts = frame.fields.find((f) => f.name === 'timestamp')?.values ?? [];
  const body = frame.fields.find((f) => f.name === 'body')?.values ?? [];
  const sev = frame.fields.find((f) => f.name === 'severity')?.values ?? [];
  return (
    <div className={styles.samples} data-testid="service-samples">
      {body.map((line, i) => (
        <div key={i} className={styles.sampleLine} style={{ borderLeftColor: levelColor(theme, String(sev[i])) }}>
          <span className={styles.sampleTime}>
            {dateTimeFormat(Number(ts[i]), { format: 'YYYY-MM-DD HH:mm:ss.SSS' })}
          </span>{' '}
          {String(line)}
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ values, width = 120, height = 24 }: { values: number[]; width?: number; height?: number }) {
  const theme = useTheme2();
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * (height - 2) - 1).toFixed(1)}`);
  return (
    <svg width={width} height={height} aria-hidden>
      <polyline fill="none" stroke={theme.colors.primary.main} strokeWidth={1.5} points={points.join(' ')} />
    </svg>
  );
}

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return <LoadingPlaceholder text={text} />;
}

export function ErrorBox({ title, error }: { title: string; error: string }) {
  return (
    <Alert severity="error" title={title}>
      {error}
    </Alert>
  );
}

/** Shown instead of a query that would scan the message text over more than maxScanHours. */
export function ScanGuard(props: {
  hours: number;
  max: number;
  reason: string;
  onRun: () => void;
  onShrink: () => void;
}) {
  return (
    <Alert severity="warning" title="This query scans log text over a long time range" data-testid="scan-guard">
      <p>
        {props.reason} The selected range is {props.hours.toFixed(1)} hours; the configured limit for text scans is{' '}
        {props.max} hours. Long scans are slow and load the shared StarRocks cluster.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button size="sm" onClick={props.onShrink}>
          Use the last {props.max} hours
        </Button>
        <Button size="sm" variant="secondary" onClick={props.onRun}>
          Run anyway
        </Button>
      </div>
    </Alert>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  chip: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    padding: theme.spacing(0.25, 0.5, 0.25, 1),
    borderRadius: theme.shape.radius.default,
    background: theme.colors.background.secondary,
    border: `1px solid ${theme.colors.border.weak}`,
    fontSize: theme.typography.bodySmall.fontSize,
    maxWidth: 480,
  }),
  chipText: css({
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: theme.typography.fontFamilyMonospace,
  }),
  samples: css({
    height: '100%',
    overflow: 'auto',
    fontFamily: theme.typography.fontFamilyMonospace,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  sampleLine: cx(
    css({
      borderLeft: '3px solid',
      paddingLeft: theme.spacing(1),
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      lineHeight: 1.6,
    })
  ),
  sampleTime: css({ color: theme.colors.text.secondary }),
  sampleEmpty: css({ color: theme.colors.text.secondary, padding: theme.spacing(2) }),
});

/**
 * Seconds since this element appeared ("…" for the first two seconds). Mount it only while something runs, so
 * every run starts from 0.
 */
export function Elapsed() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span data-testid="elapsed">{seconds >= 2 ? ` ${seconds} s` : '…'}</span>;
}
