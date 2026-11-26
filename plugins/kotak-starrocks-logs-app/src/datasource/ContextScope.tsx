import { css } from '@emotion/css';

import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';

import { POD_NAME_COLUMN, POD_UID_COLUMN } from '../constants';

/** Columns shown at the top of "Show context" after the matched one, when the line has them. */
export const CONTEXT_LABELS = [
  POD_UID_COLUMN,
  POD_NAME_COLUMN,
  'k8s_namespace_name',
  'k8s_service_name',
  'service_name',
  'namespace',
];

/**
 * Top of the "Show context" modal: which lines are shown (the same pod, up to one hour before and after the line,
 * ordered by time then message) and the pod's namespace and service, like the Log Analytics context dialog.
 */
export function ContextScope({ labels, podColumn }: { labels: Record<string, string>; podColumn: string }) {
  const styles = useStyles2(getStyles);
  const shown = [podColumn, ...CONTEXT_LABELS.filter((k) => k !== podColumn)].filter((k) => labels[k]);
  return (
    <div className={styles.wrapper} data-testid="context-scope">
      <code className={styles.selector}>
        {'{ '}
        {shown.map((k, i) => (
          <span key={k} className={k === podColumn ? styles.matched : styles.label}>
            {k}=&quot;{labels[k]}&quot;{i < shown.length - 1 ? ', ' : ''}
          </span>
        ))}
        {' }'}
      </code>
      <span className={styles.note}>
        Lines of this pod ({podColumn}) up to 1 hour before and after the selected line, by time. The selected line is
        pinned: it stays at the top or bottom while you scroll; click its pin icon to let it scroll away.
      </span>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({ display: 'flex', flexDirection: 'column', gap: theme.spacing(0.5), marginBottom: theme.spacing(1) }),
  selector: css({
    padding: theme.spacing(0.5, 1),
    background: theme.colors.background.secondary,
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    whiteSpace: 'normal',
    wordBreak: 'break-all',
  }),
  matched: css({ color: theme.colors.primary.text, fontWeight: theme.typography.fontWeightMedium }),
  label: css({ color: theme.colors.text.primary }),
  note: css({ color: theme.colors.text.secondary, fontSize: theme.typography.bodySmall.fontSize }),
});
