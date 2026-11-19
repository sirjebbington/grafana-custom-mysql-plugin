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
import { Alert, Button, Icon, Input, Select, useStyles2 } from '@grafana/ui';

import { runLogsQuery } from '../datasource/StarRocksLogsDataSource';
import { QuerySpec } from '../state/types';
import { getExploration } from './api';
import { barsPanel, queryRunner, staticData } from './panels';
import { ErrorBox, Loading, SampleList } from './ui';

interface ServiceValue {
  value: string;
  total: number;
}

export interface ServiceSelectionState extends SceneObjectState {
  spec: QuerySpec;
  label: string;
  search: string;
  withLevel: boolean;
  levelNotice: boolean;
  page: number;
  pageSize: number;
  values?: ServiceValue[];
  panels: VizPanel[];
  samples: Record<string, DataFrame>;
  samplesLoading?: boolean;
  samplesError?: string;
  $data: SceneQueryRunner;
}

/**
 * Landing view after a view is picked: one row per value of the grouping label (k8s_service_name by default)
 * with its log volume by level and its newest lines. Volumes for all values come from one GROUP BY query;
 * the newest lines for the visible page come from one UNION ALL query.
 */
export class ServiceSelectionScene extends SceneObjectBase<ServiceSelectionState> {
  static Component = ServiceSelectionRenderer;
  private samplesSub?: Unsubscribable;

  constructor(
    state: Omit<ServiceSelectionState, '$data' | 'panels' | 'samples' | 'page' | 'pageSize'> &
      Partial<ServiceSelectionState>
  ) {
    super({
      page: 0,
      pageSize: 10,
      panels: [],
      samples: {},
      $data: queryRunner('serviceVolume', state.spec, { label: state.label, withLevel: state.withLevel }),
      ...state,
    });
    this.addActivationHandler(() => {
      const sub = this.state.$data.subscribeToState((s, prev) => {
        if (s.data !== prev.data) {
          this.onData();
        }
      });
      this.onData();
      return () => {
        sub.unsubscribe();
        this.samplesSub?.unsubscribe();
      };
    });
  }

  private onData() {
    const data = this.state.$data.state.data;
    if (!data || data.state !== LoadingState.Done) {
      return;
    }
    const totals = new Map<string, number>();
    for (const f of data.series) {
      const v = String(f.meta?.custom?.value ?? '');
      totals.set(v, (totals.get(v) ?? 0) + Number(f.meta?.custom?.total ?? 0));
    }
    const values = Array.from(totals.entries())
      .map(([value, total]) => ({ value, total }))
      .sort((a, b) => b.total - a.total || a.value.localeCompare(b.value));
    this.setState({ values });
    this.buildPage();
  }

  filtered(): ServiceValue[] {
    const q = this.state.search.trim().toLowerCase();
    return (this.state.values ?? []).filter((v) => q === '' || v.value.toLowerCase().includes(q));
  }

  visible(): ServiceValue[] {
    const { page, pageSize } = this.state;
    return this.filtered().slice(page * pageSize, (page + 1) * pageSize);
  }

  setSearch(search: string) {
    this.setState({ search, page: 0 });
    this.buildPage();
  }

  setPage(page: number, pageSize = this.state.pageSize) {
    this.setState({ page, pageSize });
    this.buildPage();
  }

  private buildPage() {
    const data = this.state.$data.state.data;
    if (!data) {
      return;
    }
    const { label } = this.state;
    const panels = this.visible().map(({ value, total }) =>
      barsPanel(
        value === '' ? '(empty)' : value,
        staticData(
          data.series.filter((f) => f.meta?.custom?.value === value),
          data.timeRange
        ),
        {
          legend: false,
          description: `${total.toLocaleString()} lines`,
          headerActions: (
            <Button
              size="sm"
              variant="primary"
              fill="outline"
              data-testid={`show-logs-${value}`}
              onClick={() => getExploration(this).selectValue(label, value)}
            >
              Show logs
            </Button>
          ),
        }
      )
    );
    this.setState({ panels });
    this.fetchSamples(this.visible().map((v) => v.value));
  }

  private fetchSamples(values: string[]) {
    this.samplesSub?.unsubscribe();
    if (values.length === 0) {
      this.setState({ samples: {}, samplesLoading: false });
      return;
    }
    this.setState({ samplesLoading: true, samplesError: undefined });
    const range = sceneGraph.getTimeRange(this).state.value;
    this.samplesSub = runLogsQuery(
      {
        refId: 'samples',
        kind: 'serviceSamples',
        spec: this.state.spec,
        params: { label: this.state.label, values, perValue: 10 },
      },
      range,
      'service-samples'
    ).subscribe((res) => {
      const err = res.errors?.[0] ?? res.error;
      if (err) {
        this.setState({ samplesLoading: false, samplesError: err.message });
        return;
      }
      const samples: Record<string, DataFrame> = {};
      for (const f of res.data as DataFrame[]) {
        samples[String(f.meta?.custom?.value ?? f.name ?? '')] = f;
      }
      this.setState({ samples, samplesLoading: false });
    });
  }
}

const PAGE_SIZES = [10, 20, 50].map((n) => ({ label: String(n), value: n }));

function ServiceSelectionRenderer({ model }: SceneComponentProps<ServiceSelectionScene>) {
  const styles = useStyles2(getStyles);
  const { panels, samples, samplesLoading, samplesError, search, page, pageSize, label, levelNotice, $data } =
    model.useState();
  const data = $data.useState().data;
  const filtered = model.filtered();
  const visible = model.visible();
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const header = (
    <div className={styles.header}>
      <Input
        width={40}
        prefix={<Icon name="search" />}
        placeholder={`Search ${label} values`}
        value={search}
        onChange={(e) => getExploration(model).setSearch(e.currentTarget.value)}
        data-testid="service-search"
      />
      <span className={styles.muted}>
        Showing {visible.length} of {filtered.length}
      </span>
      <Select
        width={10}
        options={PAGE_SIZES}
        value={pageSize}
        onChange={(o) => model.setPage(0, o.value!)}
        aria-label="Page size"
      />
      <Button
        size="sm"
        variant="secondary"
        icon="angle-left"
        disabled={page === 0}
        onClick={() => model.setPage(page - 1)}
        aria-label="Previous page"
      />
      <span className={styles.muted}>
        {page + 1} / {pages}
      </span>
      <Button
        size="sm"
        variant="secondary"
        icon="angle-right"
        disabled={page + 1 >= pages}
        onClick={() => model.setPage(page + 1)}
        aria-label="Next page"
      />
    </div>
  );

  if (!data || (data.state === LoadingState.Loading && panels.length === 0)) {
    return (
      <div>
        {header}
        <Loading text="Loading volumes…" />
      </div>
    );
  }
  if (data.state === LoadingState.Error) {
    return (
      <ErrorBox
        title="Could not load the service volumes"
        error={data.errors?.[0]?.message ?? data.error?.message ?? 'error'}
      />
    );
  }
  return (
    <div>
      {header}
      {levelNotice && (
        <Alert severity="info" title="Volumes are not split by level for this range">
          This tenant&apos;s level is read from the message text, which is slow over long ranges. Shorten the range to
          see levels.
        </Alert>
      )}
      {filtered.length === 0 && <div className={styles.muted}>No logs in the selected time range.</div>}
      {visible.map((v, i) => {
        const panel = panels[i];
        return (
          <div key={v.value} className={styles.row} data-testid={`service-row-${v.value}`}>
            <div className={styles.volume}>{panel && <panel.Component model={panel} />}</div>
            <div className={styles.lines}>
              <SampleList frame={samples[v.value]} loading={samplesLoading} error={samplesError} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  header: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
    flexWrap: 'wrap',
  }),
  muted: css({ color: theme.colors.text.secondary }),
  row: css({ display: 'flex', gap: theme.spacing(1), height: 200, marginBottom: theme.spacing(1), minWidth: 0 }),
  volume: css({ width: '38%', minWidth: 280, height: '100%' }),
  lines: css({
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    height: '100%',
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    padding: theme.spacing(0.5),
    background: theme.colors.background.primary,
  }),
});
