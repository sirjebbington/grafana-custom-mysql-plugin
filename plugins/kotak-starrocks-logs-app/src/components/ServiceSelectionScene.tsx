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
import { Alert, Button, Icon, IconButton, Pagination, Select, Tooltip, useStyles2 } from '@grafana/ui';

import { runLogsQuery } from '../datasource/StarRocksLogsDataSource';
import { getFavorites, toggleFavorite } from '../state/storage';
import { QuerySpec } from '../state/types';
import { displayLabel, getExploration } from './api';
import { barsPanel, queryRunner, staticData } from './panels';
import { ErrorBox, Loading, SampleList } from './ui';

interface ServiceValue {
  value: string;
  total: number;
}

export interface ServiceSelectionState extends SceneObjectState {
  /** label filters except those on `label` (the grid shows every value of its own label) */
  spec: QuerySpec;
  label: string;
  search: string;
  withLevel: boolean;
  levelNotice: boolean;
  page: number;
  pageSize: number;
  values?: ServiceValue[];
  favorites: string[];
  panels: VizPanel[];
  samples: Record<string, DataFrame>;
  samplesLoading?: boolean;
  samplesError?: string;
  $data: SceneQueryRunner;
}

export const PAGE_SIZES = [10, 20, 50, 100];
const DEFAULT_PAGE_SIZE = 20;

/**
 * Landing view after a view is picked, like Logs Drilldown's service selection: one row per value of the
 * grouping label (the service by default) with its volume by level, favourite / Include / Show logs buttons
 * and its newest lines. Volumes for all values come from one GROUP BY query; the newest lines of the
 * visible page come from one UNION ALL query.
 */
export class ServiceSelectionScene extends SceneObjectBase<ServiceSelectionState> {
  static Component = ServiceSelectionRenderer;
  private samplesSub?: Unsubscribable;

  constructor(
    state: Omit<ServiceSelectionState, '$data' | 'panels' | 'samples' | 'page' | 'pageSize' | 'favorites'> &
      Partial<ServiceSelectionState>
  ) {
    super({
      page: 0,
      pageSize: DEFAULT_PAGE_SIZE,
      panels: [],
      samples: {},
      favorites: getFavorites(state.spec.datasource, state.spec.view, state.label),
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
    // favourites first (as of loading: starring a value does not move rows around), then by volume
    const fav = new Set(this.state.favorites);
    const values = Array.from(totals.entries())
      .map(([value, total]) => ({ value, total }))
      .sort(
        (a, b) =>
          Number(fav.has(b.value)) - Number(fav.has(a.value)) || b.total - a.total || a.value.localeCompare(b.value)
      );
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
    if (search === this.state.search) {
      return;
    }
    this.setState({ search, page: 0 });
    this.buildPage();
  }

  setPage(page: number, pageSize = this.state.pageSize) {
    this.setState({ page, pageSize });
    this.buildPage();
  }

  toggleFavorite(value: string) {
    const { spec, label } = this.state;
    this.setState({ favorites: toggleFavorite(spec.datasource, spec.view, label, value) });
  }

  private buildPage() {
    const data = this.state.$data.state.data;
    if (!data) {
      return;
    }
    const panels = this.visible().map(({ value, total }) =>
      barsPanel(
        value === '' ? '(empty)' : value,
        staticData(
          data.series.filter((f) => f.meta?.custom?.value === value),
          data.timeRange
        ),
        {
          legendTable: true,
          description: `${total.toLocaleString()} lines`,
          headerActions: <RowActions scene={this} value={value} />,
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

/** Buttons in a row's header: favourite, Include / Remove (label filter), Show logs. */
function RowActions({ scene, value }: { scene: ServiceSelectionScene; value: string }) {
  const styles = useStyles2(getStyles);
  const api = getExploration(scene);
  const { label, favorites } = scene.useState();
  // re-render when the label filters change (Include here, or the combobox)
  api.getLabelFiltersVariable().useState();
  const included = api.hasFilter(label, value, '=');
  const favorite = favorites.includes(value);
  return (
    <span className={styles.actions}>
      <IconButton
        name={favorite ? 'favorite' : 'star'}
        className={favorite ? styles.favorite : undefined}
        tooltip={favorite ? 'Remove from favourites' : 'Add to favourites (shown first)'}
        onClick={() => scene.toggleFavorite(value)}
        data-testid={`favorite-${value}`}
      />
      <Button
        size="sm"
        variant="secondary"
        fill="outline"
        tooltip={included ? `Remove ${displayLabel(label)} = ${value} from the filters` : `Filter by ${value}`}
        onClick={() => (included ? api.removeLabelFilter(label, value) : api.addFilter({ key: label, op: '=', value }))}
        data-testid={`include-${value}`}
      >
        {included ? 'Remove' : 'Include'}
      </Button>
      <Button
        size="sm"
        variant="primary"
        fill="outline"
        onClick={() => api.selectValue(label, value)}
        data-testid={`show-logs-${value}`}
      >
        Show logs
      </Button>
    </span>
  );
}

function ServiceSelectionRenderer({ model }: SceneComponentProps<ServiceSelectionScene>) {
  const styles = useStyles2(getStyles);
  const { panels, samples, samplesLoading, samplesError, search, page, pageSize, label, levelNotice, $data } =
    model.useState();
  const data = $data.useState().data;
  const filtered = model.filtered();
  const visible = model.visible();
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const name = displayLabel(label);

  const header = (
    <div className={styles.header}>
      <div className={styles.search} data-testid="service-search">
        <Select
          aria-label="Search values"
          placeholder={`Search ${name === 'service' ? 'services' : `${name} values`}`}
          prefix={<Icon name="search" />}
          isClearable
          options={filtered.slice(0, 200).map((v) => ({
            label: v.value === '' ? '(empty)' : v.value,
            value: v.value,
            description: `${v.total.toLocaleString()} lines`,
          }))}
          value={null}
          inputValue={search}
          onInputChange={(text, meta) => {
            if (meta.action === 'input-change') {
              getExploration(model).setSearch(text);
            }
          }}
          onChange={(o) => getExploration(model).setSearch(o?.value ?? '')}
          noOptionsMessage={`No ${name} values match`}
        />
      </div>
      <span className={styles.showing}>
        Showing
        <Select
          width={9}
          aria-label="Page size"
          options={PAGE_SIZES.map((n) => ({ label: String(n), value: n }))}
          value={pageSize}
          onChange={(o) => o.value && model.setPage(0, o.value)}
        />
        of {filtered.length}
        <Tooltip content={`Sorted by log volume in the time range; favourites (★) first.`}>
          <Icon name="info-circle" className={styles.muted} />
        </Tooltip>
      </span>
      <div className={styles.pagination}>
        <Pagination
          currentPage={page + 1}
          numberOfPages={pages}
          onNavigate={(p) => model.setPage(p - 1)}
          hideWhenSinglePage
        />
      </div>
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
        title={`Could not load the ${name} volumes`}
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
      {filtered.length === 0 && (
        <div className={styles.muted}>
          {search !== '' ? `No ${name} values match "${search}".` : 'No logs in the selected time range.'}
        </div>
      )}
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
      {pages > 1 && (
        <div className={styles.footer}>
          <Pagination currentPage={page + 1} numberOfPages={pages} onNavigate={(p) => model.setPage(p - 1)} />
        </div>
      )}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  header: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(1),
    flexWrap: 'wrap',
  }),
  search: css({ flex: '1 1 320px', maxWidth: 520 }),
  showing: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    color: theme.colors.text.secondary,
    whiteSpace: 'nowrap',
  }),
  pagination: css({ marginLeft: 'auto' }),
  footer: css({ display: 'flex', justifyContent: 'flex-end', marginTop: theme.spacing(1) }),
  muted: css({ color: theme.colors.text.secondary }),
  actions: css({ display: 'inline-flex', alignItems: 'center', gap: theme.spacing(1) }),
  favorite: css({ color: theme.colors.warning.main }),
  row: css({ display: 'flex', gap: theme.spacing(1), height: 220, marginBottom: theme.spacing(1), minWidth: 0 }),
  volume: css({ width: '42%', minWidth: 320, height: '100%' }),
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
