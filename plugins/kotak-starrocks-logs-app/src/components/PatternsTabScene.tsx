import { css } from '@emotion/css';
import { Unsubscribable } from 'rxjs';

import { DataFrame, GrafanaTheme2, LoadingState } from '@grafana/data';
import {
  SceneComponentProps,
  SceneObjectBase,
  SceneObjectState,
  SceneQueryRunner,
  VizPanel,
  sceneGraph,
} from '@grafana/scenes';
import { Alert, Button, ClipboardButton, useStyles2 } from '@grafana/ui';

import { PatternConfig } from '../config/config';
import { UNMATCHED } from '../datasource/frames';
import { runLogsQuery } from '../datasource/StarRocksLogsDataSource';
import { PatternSuggestion, drain } from '../patterns/drain';
import { QuerySpec } from '../state/types';
import { getExploration } from './api';
import { barsPanel, queryRunner } from './panels';
import { ErrorBox, Loading, Sparkline } from './ui';

const SUGGEST_SAMPLE = 2000;

export interface PatternsTabState extends SceneObjectState {
  spec: QuerySpec;
  tenantKey: string;
  patterns: PatternConfig[];
  $data?: SceneQueryRunner;
  chart?: VizPanel;
  suggestions?: PatternSuggestion[];
  suggesting?: boolean;
  suggestError?: string;
}

/**
 * Patterns tab. Patterns are configured per tenant (name + LIKE or regex); one query counts all of them per
 * bucket. "(unmatched)" is everything no pattern matched. "Suggest patterns" groups a sample of lines in the
 * browser to propose new configuration entries.
 */
export class PatternsTabScene extends SceneObjectBase<PatternsTabState> {
  static Component = PatternsTabRenderer;
  private sub?: Unsubscribable;

  constructor(state: PatternsTabState) {
    const has = state.patterns.length > 0;
    super({
      ...state,
      $data: has ? queryRunner('patterns', state.spec) : undefined,
      // no $data of its own: the chart uses this scene's query runner
      chart: has ? barsPanel('Pattern volume', undefined) : undefined,
    });
    this.addActivationHandler(() => () => this.sub?.unsubscribe());
  }

  suggest() {
    this.sub?.unsubscribe();
    this.setState({ suggesting: true, suggestError: undefined });
    const range = sceneGraph.getTimeRange(this).state.value;
    const spec = { ...this.state.spec, patternFilters: [] };
    this.sub = runLogsQuery(
      { refId: 'suggest', kind: 'logs', spec, params: { limit: SUGGEST_SAMPLE } },
      range,
      'patterns-suggest'
    ).subscribe((res) => {
      const err = res.errors?.[0] ?? res.error;
      if (err) {
        this.setState({ suggesting: false, suggestError: err.message });
        return;
      }
      const body = ((res.data[0] as DataFrame | undefined)?.fields.find((f) => f.name === 'body')?.values ?? []).map(
        String
      );
      this.setState({ suggesting: false, suggestions: drain(body).slice(0, 30) });
    });
  }
}

function PatternsTabRenderer({ model }: SceneComponentProps<PatternsTabScene>) {
  const styles = useStyles2(getStyles);
  const { patterns, chart, $data, suggestions, suggesting, suggestError, spec, tenantKey } = model.useState();
  const data = $data?.useState().data;
  const api = getExploration(model);
  const active = (name: string) => spec.patternFilters.find((f) => f.name === name)?.op;

  const rows = (data?.series ?? []).map((f) => {
    const values = (f.fields[1]?.values ?? []).map(Number);
    return { name: String(f.meta?.custom?.pattern ?? f.name), total: Number(f.meta?.custom?.total ?? 0), values };
  });
  const sum = rows.reduce((a, r) => a + r.total, 0) || 1;

  return (
    <div className={styles.wrapper} data-testid="patterns-tab">
      {patterns.length === 0 ? (
        <Alert severity="info" title={`No patterns configured for ${tenantKey}`}>
          Patterns are set per tenant in the app configuration (tenants.{tenantKey}.patterns). Use &quot;Suggest
          patterns&quot; below to get candidates from recent lines.
        </Alert>
      ) : data?.state === LoadingState.Error ? (
        <ErrorBox title="Pattern query failed" error={data.errors?.[0]?.message ?? data.error?.message ?? 'error'} />
      ) : !data || data.state === LoadingState.Loading ? (
        <Loading />
      ) : (
        <>
          <div className={styles.chart}>{chart && <chart.Component model={chart} />}</div>
          <table className={styles.table} data-testid="patterns-table">
            <thead>
              <tr>
                <th>Pattern</th>
                <th>Lines</th>
                <th>Share</th>
                <th>Trend</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const conf = patterns.find((p) => p.name === r.name);
                const op = active(r.name);
                return (
                  <tr key={r.name} data-testid={`pattern-row-${r.name}`}>
                    <td>
                      <div>{r.name}</div>
                      {conf && (
                        <div className={styles.mono}>
                          {conf.like !== undefined ? `LIKE ${conf.like}` : `regex ${conf.regex}`}
                        </div>
                      )}
                    </td>
                    <td>{r.total.toLocaleString()}</td>
                    <td>{((100 * r.total) / sum).toFixed(1)}%</td>
                    <td>
                      <Sparkline values={r.values} />
                    </td>
                    <td>
                      <div className={styles.actions}>
                        {r.name !== UNMATCHED && (
                          <>
                            <Button
                              size="sm"
                              variant={op === 'include' ? 'primary' : 'secondary'}
                              onClick={() => api.togglePatternFilter(r.name, 'include')}
                            >
                              Include
                            </Button>
                            <Button
                              size="sm"
                              variant={op === 'exclude' ? 'primary' : 'secondary'}
                              onClick={() => api.togglePatternFilter(r.name, 'exclude')}
                            >
                              Exclude
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      <div className={styles.suggestHeader}>
        <Button
          size="sm"
          variant="secondary"
          icon="search"
          onClick={() => model.suggest()}
          disabled={suggesting}
          data-testid="suggest-patterns"
        >
          {suggesting ? 'Grouping lines…' : `Suggest patterns (from the newest ${SUGGEST_SAMPLE} lines)`}
        </Button>
        {suggestions && suggestions.length > 0 && (
          <ClipboardButton
            size="sm"
            variant="secondary"
            icon="copy"
            getText={() =>
              JSON.stringify(
                suggestions.slice(0, 10).map(({ name, like, regex }) => ({ name, like, regex })),
                null,
                2
              )
            }
          >
            Copy top 10 as config
          </ClipboardButton>
        )}
      </div>
      {suggestError && <ErrorBox title="Could not sample lines" error={suggestError} />}
      {suggestions && (
        <table className={styles.table} data-testid="pattern-suggestions">
          <thead>
            <tr>
              <th>Lines in sample</th>
              <th>Template</th>
              <th>Config entry</th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((s, i) => (
              <tr key={i}>
                <td>{s.count}</td>
                <td className={styles.mono} title={s.sample}>
                  {s.template}
                </td>
                <td>
                  <ClipboardButton
                    size="sm"
                    fill="text"
                    icon="copy"
                    getText={() => JSON.stringify({ name: s.name, like: s.like, regex: s.regex })}
                  >
                    {(() => {
                      const text = s.like !== undefined ? `LIKE ${s.like}` : `regex ${s.regex}`;
                      return text.length > 60 ? `${text.slice(0, 60)}…` : text;
                    })()}
                  </ClipboardButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({ display: 'flex', flexDirection: 'column', gap: theme.spacing(1) }),
  chart: css({ height: 240 }),
  mono: css({
    fontFamily: theme.typography.fontFamilyMonospace,
    fontSize: theme.typography.bodySmall.fontSize,
    color: theme.colors.text.secondary,
  }),
  actions: css({ display: 'flex', gap: theme.spacing(0.5) }),
  suggestHeader: css({ display: 'flex', gap: theme.spacing(1), marginTop: theme.spacing(2) }),
  table: css({
    width: '100%',
    'th, td': {
      textAlign: 'left',
      padding: theme.spacing(0.5, 1),
      borderBottom: `1px solid ${theme.colors.border.weak}`,
      verticalAlign: 'top',
    },
  }),
});
