import { css } from '@emotion/css';
import { Unsubscribable } from 'rxjs';

import { DataFrame, GrafanaTheme2, LoadingState } from '@grafana/data';
import {
  SceneCSSGridLayout,
  SceneComponentProps,
  SceneObjectBase,
  SceneObjectState,
  SceneQueryRunner,
  VizPanel,
  sceneGraph,
} from '@grafana/scenes';
import { Button, useStyles2 } from '@grafana/ui';

import { getAppConfig } from '../config/config';
import { runLogsQuery } from '../datasource/StarRocksLogsDataSource';
import { FieldStats, fieldStats } from '../patterns/messageFields';
import { QuerySpec } from '../state/types';
import { getExploration } from './api';
import { barsPanel, queryRunner, staticData } from './panels';
import { ErrorBox, Loading } from './ui';

export const MESSAGE_FIELD_PREFIX = 'msg:';

export interface BreakdownState extends SceneObjectState {
  spec: QuerySpec;
  mode: 'labels' | 'fields';
  columns: string[];
  /** a column, or msg:<key> for a key=value field inside the message */
  selected?: string;
  $data?: SceneQueryRunner;
  grid?: SceneCSSGridLayout;
  messageFields?: MessageFieldsScene;
}

/**
 * Labels and Fields tabs. Without a selection: one panel per column with its top values over time (all
 * columns in one GROUPING SETS query). With a selection: one panel per value with Include / Exclude.
 */
export class BreakdownScene extends SceneObjectBase<BreakdownState> {
  static Component = BreakdownRenderer;

  constructor(state: BreakdownState) {
    const { spec, columns, selected, mode } = state;
    let $data: SceneQueryRunner | undefined;
    if (selected === undefined) {
      $data = columns.length > 0 ? queryRunner('labelOverview', spec, { labels: columns, topN: 5 }) : undefined;
    } else if (selected.startsWith(MESSAGE_FIELD_PREFIX)) {
      $data = queryRunner('fieldBreakdown', spec, { field: selected.slice(MESSAGE_FIELD_PREFIX.length), topN: 30 });
    } else {
      $data = queryRunner('valueBreakdown', spec, { label: selected, topN: 30 });
    }
    super({
      ...state,
      $data,
      messageFields: mode === 'fields' && selected === undefined ? new MessageFieldsScene({ spec }) : undefined,
    });
    this.addActivationHandler(() => {
      const runner = this.state.$data;
      if (!runner) {
        return;
      }
      const sub = runner.subscribeToState((s, prev) => {
        if (s.data !== prev.data) {
          this.buildGrid();
        }
      });
      this.buildGrid();
      return () => sub.unsubscribe();
    });
  }

  private buildGrid() {
    const data = this.state.$data?.state.data;
    if (!data || data.state !== LoadingState.Done) {
      return;
    }
    const api = getExploration(this);
    const { selected, columns } = this.state;
    let panels: VizPanel[];
    if (selected === undefined) {
      const byLabel = new Map<string, DataFrame[]>();
      for (const f of data.series) {
        const label = String(f.meta?.custom?.label ?? '');
        byLabel.set(label, [...(byLabel.get(label) ?? []), f]);
      }
      const card = (l: string) => Number(byLabel.get(l)?.[0]?.meta?.custom?.cardinality ?? 0);
      const ordered = columns.filter((l) => byLabel.has(l)).sort((a, b) => Number(card(b) > 1) - Number(card(a) > 1));
      panels = ordered.map((label) =>
        barsPanel(label, staticData(byLabel.get(label)!, data.timeRange), {
          description: `${card(label)} distinct values; top 5 shown`,
          headerActions: (
            <Button
              size="sm"
              variant="secondary"
              data-testid={`select-${label}`}
              onClick={() => api.setBreakdown(label)}
            >
              Select
            </Button>
          ),
        })
      );
    } else {
      const isMessageField = selected.startsWith(MESSAGE_FIELD_PREFIX);
      const key = isMessageField ? selected.slice(MESSAGE_FIELD_PREFIX.length) : selected;
      panels = data.series.map((f) => {
        const value = String(f.meta?.custom?.value ?? f.name ?? '');
        const add = (op: '=' | '!=') =>
          isMessageField ? api.addFieldFilter({ key, op, value }) : api.addFilter({ key, op, value });
        return barsPanel(value, staticData([f], data.timeRange), {
          legend: false,
          description: `${Number(f.meta?.custom?.total ?? 0).toLocaleString()} lines`,
          headerActions: (
            <>
              <Button size="sm" variant="secondary" data-testid={`include-${value}`} onClick={() => add('=')}>
                Include
              </Button>
              <Button size="sm" variant="secondary" data-testid={`exclude-${value}`} onClick={() => add('!=')}>
                Exclude
              </Button>
            </>
          ),
        });
      });
    }
    this.setState({
      grid: new SceneCSSGridLayout({
        templateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
        autoRows: '220px',
        rowGap: 1,
        columnGap: 1,
        children: panels,
      }),
    });
  }
}

function BreakdownRenderer({ model }: SceneComponentProps<BreakdownScene>) {
  const styles = useStyles2(getStyles);
  const { grid, selected, mode, $data, messageFields, columns } = model.useState();
  const data = $data?.useState().data;
  const api = getExploration(model);
  const noun = mode === 'labels' ? 'labels' : 'fields';
  return (
    <div className={styles.wrapper} data-testid={`breakdown-${mode}`}>
      {selected !== undefined ? (
        <div className={styles.header}>
          <Button size="sm" variant="secondary" icon="arrow-left" onClick={() => api.setBreakdown(undefined)}>
            All {noun}
          </Button>
          <span>
            Values of{' '}
            <b>{selected.startsWith(MESSAGE_FIELD_PREFIX) ? selected.slice(MESSAGE_FIELD_PREFIX.length) : selected}</b>{' '}
            (top 30 by volume)
          </span>
        </div>
      ) : (
        mode === 'fields' && <h4 className={styles.section}>Columns</h4>
      )}
      {columns.length === 0 && selected === undefined && (
        <div className={styles.muted}>No {noun} configured for this view.</div>
      )}
      {data?.state === LoadingState.Error ? (
        <ErrorBox title="Breakdown failed" error={data.errors?.[0]?.message ?? data.error?.message ?? 'error'} />
      ) : !grid && $data ? (
        <Loading />
      ) : (
        grid && <grid.Component model={grid} />
      )}
      {messageFields && (
        <>
          <h4 className={styles.section}>Fields in log lines (from the newest {getAppConfig().lineLimit} lines)</h4>
          <messageFields.Component model={messageFields} />
        </>
      )}
    </div>
  );
}

interface MessageFieldsState extends SceneObjectState {
  spec: QuerySpec;
  stats?: FieldStats[];
  sampleSize?: number;
  error?: string;
}

/** key=value / JSON fields found in a sample of lines, with their most common values. */
export class MessageFieldsScene extends SceneObjectBase<MessageFieldsState> {
  static Component = MessageFieldsRenderer;
  private sub?: Unsubscribable;

  constructor(state: MessageFieldsState) {
    super(state);
    this.addActivationHandler(() => {
      this.load();
      return () => this.sub?.unsubscribe();
    });
  }

  private load() {
    const range = sceneGraph.getTimeRange(this).state.value;
    this.sub = runLogsQuery(
      { refId: 'fields-sample', kind: 'logs', spec: this.state.spec, params: { limit: getAppConfig().lineLimit } },
      range,
      'fields-sample'
    ).subscribe((res) => {
      const err = res.errors?.[0] ?? res.error;
      if (err) {
        this.setState({ error: err.message });
        return;
      }
      const body = ((res.data[0] as DataFrame | undefined)?.fields.find((f) => f.name === 'body')?.values ?? []).map(
        String
      );
      this.setState({ stats: fieldStats(body), sampleSize: body.length });
    });
  }
}

function MessageFieldsRenderer({ model }: SceneComponentProps<MessageFieldsScene>) {
  const styles = useStyles2(getStyles);
  const { stats, sampleSize, error } = model.useState();
  const api = getExploration(model);
  if (error) {
    return <ErrorBox title="Could not sample log lines" error={error} />;
  }
  if (!stats) {
    return <Loading />;
  }
  if (stats.length === 0) {
    return <div className={styles.muted}>No key=value or JSON fields found in the sampled lines.</div>;
  }
  return (
    <table className={styles.table} data-testid="message-fields">
      <thead>
        <tr>
          <th>Field</th>
          <th>Lines</th>
          <th>Distinct</th>
          <th>Top values (click + to include, − to exclude)</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {stats.map((s) => (
          <tr key={s.key}>
            <td className={styles.mono}>{s.key}</td>
            <td>{sampleSize ? `${Math.round((100 * s.lines) / sampleSize)}%` : s.lines}</td>
            <td>{s.distinct}</td>
            <td>
              {s.top.map((t) => (
                <span key={t.value} className={styles.value}>
                  <span className={styles.mono}>{t.value === '' ? '""' : t.value}</span> ({t.count})
                  <Button
                    size="sm"
                    fill="text"
                    aria-label={`Include ${s.key}=${t.value}`}
                    onClick={() => api.addFieldFilter({ key: s.key, op: '=', value: t.value })}
                  >
                    +
                  </Button>
                  <Button
                    size="sm"
                    fill="text"
                    aria-label={`Exclude ${s.key}=${t.value}`}
                    onClick={() => api.addFieldFilter({ key: s.key, op: '!=', value: t.value })}
                  >
                    −
                  </Button>
                </span>
              ))}
            </td>
            <td>
              <Button size="sm" variant="secondary" onClick={() => api.setBreakdown(`${MESSAGE_FIELD_PREFIX}${s.key}`)}>
                Breakdown
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({ display: 'flex', flexDirection: 'column', gap: theme.spacing(1) }),
  header: css({ display: 'flex', alignItems: 'center', gap: theme.spacing(1) }),
  section: css({ marginTop: theme.spacing(1) }),
  muted: css({ color: theme.colors.text.secondary }),
  mono: css({ fontFamily: theme.typography.fontFamilyMonospace }),
  value: css({ display: 'inline-flex', alignItems: 'center', marginRight: theme.spacing(1) }),
  table: css({
    width: '100%',
    'th, td': {
      textAlign: 'left',
      padding: theme.spacing(0.5, 1),
      borderBottom: `1px solid ${theme.colors.border.weak}`,
    },
  }),
});
