import { css } from '@emotion/css';

import { GrafanaTheme2, rangeUtil } from '@grafana/data';
import {
  SceneComponentProps,
  SceneObject,
  SceneObjectBase,
  SceneObjectState,
  SceneObjectUrlSyncConfig,
  SceneObjectUrlValues,
  SceneReactObject,
  SceneRefreshPicker,
  SceneTimePicker,
  sceneGraph,
} from '@grafana/scenes';
import { Alert, Button, Select, Tab, TabsBar, useStyles2 } from '@grafana/ui';

import { LEVELS } from '../constants';
import { getAppConfig, getAppConfigErrors } from '../config/config';
import { fetchViews } from '../datasource/api';
import { buildContext } from '../datasource/StarRocksLogsDataSource';
import { BuildContext, needsMessageScan } from '../sql/builder';
import {
  asArray,
  decodeAll,
  decodeField,
  decodeFilter,
  decodeLine,
  decodePattern,
  encodeField,
  encodeFilter,
  encodeLine,
  encodePattern,
} from '../state/url';
import { LabelFilter, LineFilter, MessageFieldFilter, PatternFilter, QuerySpec } from '../state/types';
import { Display, ExplorationApi, Tab as TabName } from './api';
import { BreakdownScene, MESSAGE_FIELD_PREFIX } from './BreakdownScene';
import { DetailsHeader } from './FiltersBar';
import { LogsTabScene } from './LogsTabScene';
import { PatternsTabScene } from './PatternsTabScene';
import { ServiceSelectionScene } from './ServiceSelectionScene';
import { ErrorBox, Loading, ScanGuard } from './ui';

export interface LogsExplorationState extends SceneObjectState {
  view?: string;
  views?: string[];
  viewsError?: string;
  ctx?: BuildContext;
  ctxError?: string;
  primaryLabel?: string;
  filters: LabelFilter[];
  levels: string[];
  lineFilters: LineFilter[];
  patternFilters: PatternFilter[];
  fieldFilters: MessageFieldFilter[];
  tab: TabName;
  breakdown?: string;
  sort: 'desc' | 'asc';
  limit?: number;
  display: Display;
  wrap: boolean;
  search: string;
  /** time range (raw from|to) for which the user accepted a long text scan */
  scanAllowedFor?: string;
  body?: SceneObject;
  controls: SceneObject[];
}

const URL_KEYS = [
  'view',
  'label',
  'filter',
  'level',
  'line',
  'pattern',
  'field',
  'tab',
  'breakdown',
  'sort',
  'limit',
  'display',
  'wrap',
  'search',
];
const TABS: TabName[] = ['logs', 'labels', 'fields', 'patterns'];

/**
 * Root of the drilldown. Owns all state that is in the URL (view, filters, tab, display options) and builds
 * the body: the service grid when no filter is set, otherwise the Logs / Labels / Fields / Patterns tabs.
 */
export class LogsExploration extends SceneObjectBase<LogsExplorationState> implements ExplorationApi {
  static Component = LogsExplorationRenderer;
  readonly isLogsExploration = true as const;
  protected _urlSync = new SceneObjectUrlSyncConfig(this, { keys: URL_KEYS });
  private ctxRequest = 0;
  private guardSignature = '';

  constructor(state: Partial<LogsExplorationState> = {}) {
    super({
      filters: [],
      levels: [],
      lineFilters: [],
      patternFilters: [],
      fieldFilters: [],
      tab: 'logs',
      sort: 'desc',
      display: 'logs',
      wrap: false,
      search: '',
      controls: [new SceneTimePicker({}), new SceneRefreshPicker({})],
      ...state,
    });
    this.addActivationHandler(() => {
      const tr = sceneGraph.getTimeRange(this);
      const sub = tr.subscribeToState(() => {
        if (this.computeGuardSignature() !== this.guardSignature) {
          this.rebuild();
        }
      });
      if (this.state.views === undefined) {
        this.loadViews();
      } else {
        this.rebuild();
      }
      return () => sub.unsubscribe();
    });
  }

  // ---- URL state ----

  getUrlState(): SceneObjectUrlValues {
    const s = this.state;
    const list = (a: string[]) => (a.length > 0 ? a : null);
    return {
      view: s.view ?? null,
      label: s.primaryLabel ?? null,
      filter: list(s.filters.map(encodeFilter)),
      level: list(s.levels),
      line: list(s.lineFilters.map(encodeLine)),
      pattern: list(s.patternFilters.map(encodePattern)),
      field: list(s.fieldFilters.map(encodeField)),
      tab: s.tab === 'logs' ? null : s.tab,
      breakdown: s.breakdown ?? null,
      sort: s.sort === 'desc' ? null : s.sort,
      limit: s.limit !== undefined ? String(s.limit) : null,
      display: s.display === 'logs' ? null : s.display,
      wrap: s.wrap ? '1' : null,
      search: s.search !== '' ? s.search : null,
    };
  }

  updateFromUrl(values: SceneObjectUrlValues) {
    const one = (k: string) => {
      const v = asArray(values[k] as string | string[] | null | undefined);
      return v.length > 0 ? v[0] : undefined;
    };
    const next: Partial<LogsExplorationState> = {};
    if ('view' in values) {
      next.view = one('view');
    }
    if ('label' in values) {
      next.primaryLabel = one('label');
    }
    if ('filter' in values) {
      next.filters = decodeAll(values.filter as string[], decodeFilter);
    }
    if ('level' in values) {
      next.levels = asArray(values.level as string[]).filter((l) => (LEVELS as readonly string[]).includes(l));
    }
    if ('line' in values) {
      next.lineFilters = decodeAll(values.line as string[], decodeLine);
    }
    if ('pattern' in values) {
      next.patternFilters = decodeAll(values.pattern as string[], decodePattern);
    }
    if ('field' in values) {
      next.fieldFilters = decodeAll(values.field as string[], decodeField);
    }
    if ('tab' in values) {
      const t = one('tab') as TabName | undefined;
      next.tab = t && TABS.includes(t) ? t : 'logs';
    }
    if ('breakdown' in values) {
      next.breakdown = one('breakdown');
    }
    if ('sort' in values) {
      next.sort = one('sort') === 'asc' ? 'asc' : 'desc';
    }
    if ('limit' in values) {
      const n = Number(one('limit'));
      next.limit = Number.isInteger(n) && n >= 10 && n <= 5000 ? n : undefined;
    }
    if ('display' in values) {
      const d = one('display');
      next.display = d === 'table' || d === 'json' ? d : 'logs';
    }
    if ('wrap' in values) {
      next.wrap = one('wrap') === '1';
    }
    if ('search' in values) {
      next.search = one('search') ?? '';
    }
    const viewChanged = next.view !== undefined && next.view !== this.state.view;
    this.setState(next);
    if (this.isActive) {
      if (viewChanged && next.view) {
        this.loadContext(next.view);
      } else {
        this.rebuild();
      }
    }
  }

  // ---- loading ----

  private async loadViews() {
    try {
      const views = await fetchViews(sceneGraph.getTimeRange(this).state.value);
      const view = this.state.view && views.includes(this.state.view) ? this.state.view : views[0];
      this.setState({ views, view, viewsError: undefined });
      if (view) {
        await this.loadContext(view);
      } else {
        this.rebuild();
      }
    } catch (e) {
      this.setState({ views: [], viewsError: e instanceof Error ? e.message : String(e) });
      this.rebuild();
    }
  }

  private async loadContext(view: string) {
    const req = ++this.ctxRequest;
    this.setState({ ctx: undefined, ctxError: undefined });
    this.rebuild();
    try {
      const ctx = await buildContext(view, sceneGraph.getTimeRange(this).state.value);
      if (req === this.ctxRequest) {
        this.setState({ ctx });
      }
    } catch (e) {
      if (req === this.ctxRequest) {
        this.setState({ ctxError: e instanceof Error ? e.message : String(e) });
      }
    }
    if (req === this.ctxRequest) {
      this.rebuild();
    }
  }

  // ---- ExplorationApi ----

  getSpec(): QuerySpec {
    const s = this.state;
    return {
      view: s.view ?? '',
      filters: s.filters,
      levels: s.levels,
      lineFilters: s.lineFilters,
      patternFilters: s.patternFilters,
      fieldFilters: s.fieldFilters,
    };
  }

  getContext() {
    return this.state.ctx;
  }

  getDisplay() {
    const s = this.state;
    return { display: s.display, sort: s.sort, limit: s.limit ?? getAppConfig().lineLimit, wrap: s.wrap };
  }

  setDisplay(d: Partial<{ display: Display; sort: 'desc' | 'asc'; limit: number; wrap: boolean }>) {
    this.setState(d);
    this.rebuild();
  }

  isDetails() {
    return this.state.filters.length > 0;
  }

  setView(view: string) {
    if (view === this.state.view) {
      return;
    }
    this.setState({ view, ...this.clearedFilters(), breakdown: undefined, tab: 'logs', search: '' });
    this.loadContext(view);
  }

  private clearedFilters() {
    return { filters: [], levels: [], lineFilters: [], patternFilters: [], fieldFilters: [] };
  }

  addFilter(f: LabelFilter) {
    const others = this.state.filters.filter((x) => !(x.key === f.key && x.value === f.value));
    const exists = this.state.filters.some((x) => x.key === f.key && x.value === f.value && x.op === f.op);
    this.setState({ filters: exists ? others : [...others, f] });
    this.afterFilterChange();
  }

  removeFilter(i: number) {
    const filters = this.state.filters.filter((_, n) => n !== i);
    this.setState(filters.length === 0 ? { ...this.clearedFilters(), breakdown: undefined } : { filters });
    this.afterFilterChange();
  }

  hasFilter(key: string, value: string, op: LabelFilter['op'] = '=') {
    return this.state.filters.some((f) => f.key === key && f.value === value && f.op === op);
  }

  setLevels(levels: string[]) {
    const cur = this.state.levels;
    const same = cur.length === levels.length && levels.every((l) => cur.includes(l));
    this.setState({ levels: same || levels.length >= LEVELS.length ? [] : levels });
    this.afterFilterChange();
  }

  toggleLevel(level: string) {
    const cur = this.state.levels;
    this.setState({ levels: cur.includes(level) ? cur.filter((l) => l !== level) : [...cur, level] });
    this.afterFilterChange();
  }

  addLineFilter(f: LineFilter) {
    if (f.value === '') {
      return;
    }
    const exists = this.state.lineFilters.some((x) => JSON.stringify(x) === JSON.stringify(f));
    if (!exists) {
      this.setState({ lineFilters: [...this.state.lineFilters, f] });
      this.afterFilterChange();
    }
  }

  removeLineFilter(i: number) {
    this.setState({ lineFilters: this.state.lineFilters.filter((_, n) => n !== i) });
    this.afterFilterChange();
  }

  togglePatternFilter(name: string, op: PatternFilter['op']) {
    const cur = this.state.patternFilters.find((f) => f.name === name);
    const rest = this.state.patternFilters.filter((f) => f.name !== name);
    this.setState({ patternFilters: cur?.op === op ? rest : [...rest, { name, op }] });
    this.afterFilterChange();
  }

  removePatternFilter(i: number) {
    this.setState({ patternFilters: this.state.patternFilters.filter((_, n) => n !== i) });
    this.afterFilterChange();
  }

  addFieldFilter(f: MessageFieldFilter) {
    const exists = this.hasFieldFilter(f.key, f.value, f.op);
    const rest = this.state.fieldFilters.filter((x) => !(x.key === f.key && x.value === f.value));
    this.setState({ fieldFilters: exists ? rest : [...rest, f] });
    this.afterFilterChange();
  }

  hasFieldFilter(key: string, value: string, op: MessageFieldFilter['op']) {
    return this.state.fieldFilters.some((f) => f.key === key && f.value === value && f.op === op);
  }

  removeFieldFilter(i: number) {
    this.setState({ fieldFilters: this.state.fieldFilters.filter((_, n) => n !== i) });
    this.afterFilterChange();
  }

  private afterFilterChange() {
    // a filter chosen from a breakdown applies to the logs; go back to the overview of that tab
    this.setState({ breakdown: undefined });
    this.rebuild();
  }

  setTab(tab: TabName) {
    this.setState({ tab, breakdown: undefined });
    this.rebuild();
  }

  setBreakdown(key?: string) {
    this.setState({ breakdown: key });
    this.rebuild();
  }

  selectValue(label: string, value: string) {
    this.setState({
      ...this.clearedFilters(),
      filters: [{ key: label, op: '=', value }],
      tab: 'logs',
      breakdown: undefined,
    });
    this.rebuild();
  }

  clearAll() {
    this.setState({ ...this.clearedFilters(), breakdown: undefined, tab: 'logs' });
    this.rebuild();
  }

  setPrimaryLabel(label: string) {
    this.setState({ primaryLabel: label === getAppConfig().serviceLabel ? undefined : label, search: '' });
    this.rebuild();
  }

  setSearch(search: string) {
    this.setState({ search });
    if (this.state.body instanceof ServiceSelectionScene) {
      this.state.body.setSearch(search);
    }
  }

  allowLongScan() {
    this.setState({ scanAllowedFor: this.rangeKey() });
    this.rebuild();
  }

  shrinkRange(hours: number) {
    const raw = { from: `now-${hours}h`, to: 'now' };
    sceneGraph.getTimeRange(this).onTimeRangeChange(rangeUtil.convertRawToRange(raw));
  }

  // ---- body ----

  private rangeHours(): number {
    const v = sceneGraph.getTimeRange(this).state.value;
    return (v.to.valueOf() - v.from.valueOf()) / 3_600_000;
  }

  private rangeKey(): string {
    const s = sceneGraph.getTimeRange(this).state;
    return `${s.from}|${s.to}`;
  }

  private rangeBlocked(): boolean {
    return this.rangeHours() > getAppConfig().maxScanHours && this.state.scanAllowedFor !== this.rangeKey();
  }

  private computeGuardSignature(): string {
    return `${this.rangeBlocked()}`;
  }

  rebuild() {
    this.guardSignature = this.computeGuardSignature();
    this.setState({ body: this.buildBody() });
  }

  private message(severity: 'info' | 'error', title: string, text: string): SceneObject {
    return new SceneReactObject({
      reactNode:
        severity === 'error' ? (
          <ErrorBox title={title} error={text} />
        ) : (
          <Alert severity="info" title={title}>
            {text}
          </Alert>
        ),
    });
  }

  private guard(reason: string): SceneObject {
    const max = getAppConfig().maxScanHours;
    return new SceneReactObject({
      component: ScanGuard,
      props: {
        hours: this.rangeHours(),
        max,
        reason,
        onRun: () => this.allowLongScan(),
        onShrink: () => this.shrinkRange(max),
      },
    });
  }

  private buildBody(): SceneObject {
    const s = this.state;
    const config = getAppConfig();
    if (s.viewsError) {
      return this.message('error', 'Could not list your StarRocks log views', s.viewsError);
    }
    if (s.views === undefined) {
      return new SceneReactObject({ reactNode: <Loading text="Loading your views…" /> });
    }
    if (s.views.length === 0) {
      return this.message(
        'info',
        'No log views available',
        `StarRocks returned no views matching ${config.viewPrefix}* for your account. Ask for access to your team's log view.`
      );
    }
    if (s.ctxError) {
      return this.message('error', `Could not open ${s.view}`, s.ctxError);
    }
    if (!s.view || !s.ctx) {
      return new SceneReactObject({ reactNode: <Loading text="Opening view…" /> });
    }
    const spec = this.getSpec();
    const tenant = s.ctx.tenant;
    const blocked = this.rangeBlocked();
    const levelSkipped = blocked && tenant.level.source === 'message';
    const textScan = needsMessageScan(spec, tenant, false);

    if (!this.isDetails()) {
      return new ServiceSelectionScene({
        spec,
        label: s.primaryLabel ?? config.serviceLabel,
        search: s.search,
        withLevel: !levelSkipped,
        levelNotice: levelSkipped,
      });
    }
    const reason =
      'The current filters (line search, message fields, patterns or a level read from the message) need a full scan of the log text.';
    const { display, sort, limit, wrap } = this.getDisplay();
    switch (s.tab) {
      case 'logs':
        return blocked && textScan
          ? this.guard(reason)
          : new LogsTabScene({ spec, withLevel: !levelSkipped, display, sort, limit, wrap });
      case 'labels':
      case 'fields': {
        const messageBreakdown = s.breakdown?.startsWith(MESSAGE_FIELD_PREFIX) ?? false;
        if (blocked && (textScan || messageBreakdown)) {
          return this.guard(messageBreakdown ? 'A breakdown of a field inside the message reads every line.' : reason);
        }
        return new BreakdownScene({
          spec,
          mode: s.tab,
          columns: s.tab === 'labels' ? s.ctx.labels : s.ctx.fields,
          selected: s.breakdown,
        });
      }
      case 'patterns':
        return blocked && tenant.patterns.length > 0
          ? this.guard('Counting patterns reads every line in the range.')
          : new PatternsTabScene({ spec, patterns: tenant.patterns, tenantKey: tenant.key });
    }
  }
}

function LogsExplorationRenderer({ model }: SceneComponentProps<LogsExploration>) {
  const styles = useStyles2(getStyles);
  const state = model.useState();
  const { views, view, body, controls, ctx, tab, primaryLabel } = state;
  const config = getAppConfig();
  const errors = getAppConfigErrors();
  const details = model.isDetails();
  const label = primaryLabel ?? config.serviceLabel;
  const labelTabs = Array.from(new Set([config.serviceLabel, 'k8s_namespace_name', label])).filter(
    (l) => !ctx || ctx.labels.includes(l)
  );

  return (
    <div className={styles.wrapper}>
      {errors.length > 0 && (
        <Alert severity="warning" title="The app configuration has problems; invalid entries are ignored">
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}
      <div className={styles.topRow}>
        <span className={styles.label}>View</span>
        <Select
          width={48}
          aria-label="View"
          data-testid="view-picker"
          isLoading={views === undefined}
          options={(views ?? []).map((v) => ({ label: v, value: v }))}
          value={view ?? null}
          onChange={(o) => o.value && model.setView(o.value)}
          placeholder="Select a view"
        />
        {details && (
          <Button
            size="md"
            variant="secondary"
            icon="arrow-left"
            onClick={() => model.clearAll()}
            data-testid="back-to-services"
          >
            All values of {label}
          </Button>
        )}
        <div className={styles.spacer} />
        {controls.map((c) => (
          <c.Component key={c.state.key} model={c} />
        ))}
      </div>

      {details ? (
        <>
          <DetailsHeader model={model} />
          <TabsBar>
            {TABS.map((t) => (
              <Tab
                key={t}
                label={t[0].toUpperCase() + t.slice(1)}
                active={tab === t}
                onChangeTab={() => model.setTab(t)}
                counter={
                  t === 'labels'
                    ? ctx?.labels.length
                    : t === 'fields'
                      ? ctx?.fields.length
                      : t === 'patterns'
                        ? ctx?.tenant.patterns.length
                        : undefined
                }
                data-testid={`tab-${t}`}
              />
            ))}
          </TabsBar>
        </>
      ) : (
        view &&
        ctx && (
          <TabsBar>
            {labelTabs.map((l) => (
              <Tab
                key={l}
                label={l}
                active={label === l}
                onChangeTab={() => model.setPrimaryLabel(l)}
                data-testid={`label-tab-${l}`}
              />
            ))}
            <div className={styles.addLabel}>
              <Select
                width={28}
                aria-label="Group by another label"
                placeholder="+ Add label"
                options={ctx.labels.filter((l) => !labelTabs.includes(l)).map((l) => ({ label: l, value: l }))}
                value={null}
                onChange={(o) => o.value && model.setPrimaryLabel(o.value)}
              />
            </div>
          </TabsBar>
        )
      )}
      <div className={styles.body}>{body && <body.Component model={body} />}</div>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  // minWidth 0: long unwrapped log lines must not widen the page beyond the viewport
  wrapper: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    minHeight: '100%',
    minWidth: 0,
    width: '100%',
  }),
  topRow: css({ display: 'flex', alignItems: 'center', gap: theme.spacing(1), flexWrap: 'wrap' }),
  label: css({ color: theme.colors.text.secondary }),
  spacer: css({ flex: 1 }),
  addLabel: css({ marginLeft: theme.spacing(1), alignSelf: 'center' }),
  body: css({ paddingTop: theme.spacing(1), minWidth: 0 }),
});
