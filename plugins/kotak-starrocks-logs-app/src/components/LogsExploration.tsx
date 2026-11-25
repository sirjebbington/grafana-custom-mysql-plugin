import { css } from '@emotion/css';
import { useCallback, useEffect, useState } from 'react';

import { GrafanaTheme2, dateTimeFormat, rangeUtil } from '@grafana/data';
import {
  AdHocFiltersVariable,
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
import {
  Alert,
  Button,
  Icon,
  IconButton,
  InlineField,
  Select,
  Spinner,
  Tab,
  TabsBar,
  Tooltip,
  useStyles2,
} from '@grafana/ui';

import { LEVELS, QUICK_RANGES, RUNTIME_DS } from '../constants';
import { getAppConfig, getAppConfigErrors, viewPrefixFor } from '../config/config';
import { fetchViews, listDatasources, runSqlOnce, StarRocksDatasource, stringColumn } from '../datasource/api';
import { fetchOldestLog } from '../datasource/oldest';
import { buildContext } from '../datasource/StarRocksLogsDataSource';
import { BuildContext, labelValuesQuery, needsMessageScan } from '../sql/builder';
import { getLastSelection, setLastSelection } from '../state/storage';
import {
  asArray,
  decodeAll,
  decodeField,
  decodeFilter,
  decodeLine,
  decodePattern,
  encodeField,
  encodeLine,
  encodePattern,
} from '../state/url';
import {
  emptySpec,
  LabelFilter,
  LabelOp,
  LineFilter,
  MessageFieldFilter,
  PatternFilter,
  QuerySpec,
} from '../state/types';
import { Display, displayLabel, ExplorationApi, isExplorationApi, Tab as TabName } from './api';
import { BreakdownScene, MESSAGE_FIELD_PREFIX } from './BreakdownScene';
import { quickRangeMs } from '../state/timeRange';
import { CappedTimeRange, cappedOf } from './CappedTimeRange';
import { DetailsHeader } from './FiltersBar';
import { LogsTabScene } from './LogsTabScene';
import { PatternsTabScene } from './PatternsTabScene';
import { ServiceSelectionScene } from './ServiceSelectionScene';
import { Elapsed, ErrorBox, Loading, ScanGuard } from './ui';

type AdHocFilter = AdHocFiltersVariable['state']['filters'][number];

// level split from the message over more than this many hours is counted on a 1-in-LEVEL_SAMPLE hash sample
export const LEVEL_SAMPLE_ABOVE_HOURS = 1;
export const LEVEL_SAMPLE = 10;
type Page = 'selection' | 'details';

export interface LogsExplorationState extends SceneObjectState {
  /** selected kotak-starrocks-datasource instance (one StarRocks database) */
  datasource?: string;
  datasources?: StarRocksDatasource[];
  /** why a data source could not be used (no access, no views), shown in the picker */
  datasourceProblems?: Record<string, string>;
  view?: string;
  views?: string[];
  viewsError?: string;
  ctx?: BuildContext;
  ctxError?: string;
  /** the value grid ("selection") or the logs of the current filters ("details") */
  page: Page;
  /** label of the value grid (default: serviceLabel, shown as "service") */
  primaryLabel?: string;
  /** extra label tabs added with "Add label" */
  labelTabs: string[];
  /** "Filter by label values" combobox; source of truth for label filters (URL: var-filters) */
  labelFilters: AdHocFiltersVariable;
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
  /** service grid of a tenant whose level comes from the message: split the volumes by level (on request) */
  gridLevels: boolean;
  /** oldest line of the selected view ("Oldest log"), looked up in the background */
  oldest?: { key: string; ms?: number | null; loading?: boolean; error?: string };
  body?: SceneObject;
  controls: SceneObject[];
}

// "filter" is the 0.1.0/0.2.0 URL format for label filters; it is read and converted, never written.
const URL_KEYS = [
  'ds',
  'view',
  'page',
  'label',
  'tabs',
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
  'levelsplit',
];
const TABS: TabName[] = ['logs', 'labels', 'fields', 'patterns'];
// =| and !=| (one of / not one of) are expanded to several = / != filters
const LABEL_OPS: string[] = ['=', '!=', '=|', '!=|', '=~', '!~'];

function toAdHoc(f: LabelFilter): AdHocFilter {
  return { key: f.key, operator: f.op, value: f.value, keyLabel: f.key, valueLabels: [f.value] };
}

function findExploration(obj: SceneObject): LogsExploration | undefined {
  let cur: SceneObject | undefined = obj;
  while (cur) {
    if (isExplorationApi(cur)) {
      return cur as unknown as LogsExploration;
    }
    cur = cur.parent;
  }
  return undefined;
}

/** "Filter by label values" combobox; only operators that work on text columns (no < or >). */
class LabelFiltersVariable extends AdHocFiltersVariable {
  _getOperators() {
    return super._getOperators().filter((o) => o.value !== undefined && LABEL_OPS.includes(o.value));
  }
}

/** The same "Filter by label values" combobox as Logs Drilldown, fed with the view's columns and values. */
function createLabelFiltersVariable(): AdHocFiltersVariable {
  return new LabelFiltersVariable({
    name: 'filters',
    label: 'Labels',
    layout: 'combobox',
    applyMode: 'manual',
    datasource: RUNTIME_DS,
    filters: [],
    allowCustomValue: true,
    supportsMultiValueOperators: true,
    getTagKeysProvider: async (variable) => {
      const ctx = findExploration(variable)?.getContext();
      const keys = ctx ? [...ctx.labels, ...ctx.fields] : [];
      return { replace: true, values: keys.map((k) => ({ text: k, value: k })) };
    },
    getTagValuesProvider: async (variable, filter) => {
      const ex = findExploration(variable);
      const ctx = ex?.getContext();
      if (!ex || !ctx || !filter.key) {
        return { replace: true, values: [] };
      }
      // values of this label under the other filters (not those on the same label)
      const spec = { ...ex.getSpec(), filters: ex.getLabelFilters().filter((f) => f.key !== filter.key) };
      const frames = await runSqlOnce(
        labelValuesQuery(spec, ctx, filter.key, 200),
        sceneGraph.getTimeRange(ex).state.value,
        'values',
        spec.datasource,
        { view: spec.view }
      );
      return { replace: true, values: stringColumn(frames[0], 'v').map((v) => ({ text: v, value: v })) };
    },
  });
}

/**
 * Root of the drilldown. Owns the URL state (data source, view, page, filters, tab, display options) and
 * builds the body: the value grid ("selection") or the Logs / Labels / Fields / Patterns tabs ("details").
 */
export class LogsExploration extends SceneObjectBase<LogsExplorationState> implements ExplorationApi {
  static Component = LogsExplorationRenderer;
  readonly isLogsExploration = true as const;
  protected _urlSync = new SceneObjectUrlSyncConfig(this, { keys: URL_KEYS });
  private ctxRequest = 0;
  private guardSignature = '';

  constructor(state: Partial<LogsExplorationState> = {}) {
    super({
      page: 'selection',
      labelTabs: [],
      labelFilters: createLabelFiltersVariable(),
      levels: [],
      lineFilters: [],
      patternFilters: [],
      fieldFilters: [],
      tab: 'logs',
      sort: 'desc',
      display: 'logs',
      wrap: false,
      search: '',
      gridLevels: false,
      controls: [
        new SceneTimePicker({
          quickRanges: QUICK_RANGES.filter(
            (r) => (quickRangeMs(r.from) ?? 0) <= getAppConfig().maxRangeHours * 3_600_000
          ),
        }),
        new SceneRefreshPicker({}),
      ],
      ...state,
    });
    this.addActivationHandler(() => {
      const tr = sceneGraph.getTimeRange(this);
      const timeSub = tr.subscribeToState(() => {
        if (this.computeGuardSignature() !== this.guardSignature) {
          this.rebuild();
        }
      });
      const filterSub = this.state.labelFilters.subscribeToState((s, prev) => {
        if (s.filters !== prev.filters) {
          this.onLabelFiltersChanged(prev.filters, s.filters);
        }
      });
      if (this.state.views === undefined) {
        this.loadDatasources();
      } else {
        this.rebuild();
      }
      return () => {
        timeSub.unsubscribe();
        filterSub.unsubscribe();
      };
    });
  }

  // ---- URL state ----

  /** Navigation (page, tab, view, data source) adds a browser history step, so Back returns to it. */
  private navigate(change: () => void) {
    this._urlSync.performBrowserHistoryAction(change);
  }

  getUrlState(): SceneObjectUrlValues {
    const s = this.state;
    const list = (a: string[]) => (a.length > 0 ? a : null);
    return {
      ds: s.datasource ?? null,
      view: s.view ?? null,
      page: s.page === 'details' ? 'details' : null,
      label: s.primaryLabel ?? null,
      tabs: list(s.labelTabs),
      filter: null,
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
      levelsplit: s.gridLevels ? '1' : null,
    };
  }

  updateFromUrl(values: SceneObjectUrlValues) {
    const one = (k: string) => {
      const v = asArray(values[k] as string | string[] | null | undefined);
      return v.length > 0 && v[0] !== '' ? v[0] : undefined;
    };
    const next: Partial<LogsExplorationState> = {};
    // A URL without ds/view never clears them: they are picked automatically (and written back to the URL),
    // and a URL update can race with that pick.
    if (one('ds')) {
      next.datasource = one('ds');
    }
    if (one('view')) {
      next.view = one('view');
    }
    if ('page' in values) {
      next.page = one('page') === 'details' ? 'details' : 'selection';
    }
    if ('label' in values) {
      next.primaryLabel = one('label');
    }
    if ('tabs' in values) {
      next.labelTabs = asArray(values.tabs as string[]).filter((t) => t !== '');
    }
    const legacyFilters = decodeAll(values.filter as string[], decodeFilter);
    if (legacyFilters.length > 0) {
      next.page = 'details';
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
    if ('levelsplit' in values) {
      next.gridLevels = one('levelsplit') === '1';
    }
    if ('search' in values) {
      next.search = one('search') ?? '';
    }
    const dsChanged = next.datasource !== undefined && next.datasource !== this.state.datasource;
    const viewChanged = next.view !== undefined && next.view !== this.state.view;
    this.setState(next);
    if (legacyFilters.length > 0) {
      this.state.labelFilters.updateFilters(legacyFilters.map(toAdHoc));
    }
    if (this.isActive) {
      if (dsChanged && next.datasource) {
        this.loadViews(next.datasource);
      } else if (viewChanged && next.view) {
        this.loadContext(next.view);
      } else {
        this.rebuild();
      }
    }
  }

  // ---- loading ----

  /**
   * Lists the StarRocks data sources and picks one: the one in the URL if any (no fallback: the user chose
   * it), otherwise the last one used, the configured default, then any data source where the user can see
   * views (people with access to one database only land on it).
   */
  private async loadDatasources() {
    const list = listDatasources();
    this.setState({ datasources: list, datasourceProblems: {} });
    if (list.length === 0) {
      const type = getAppConfig().datasource.type;
      this.setState({ views: [], viewsError: `No ${type} data source is available to you in this organization.` });
      this.rebuild();
      return;
    }
    const chosen = this.state.datasource;
    if (chosen && list.some((d) => d.uid === chosen)) {
      await this.loadViews(chosen);
      return;
    }
    const preferred = [getLastSelection().ds, getAppConfig().datasource.uid];
    const uids = list.map((d) => d.uid);
    const order = Array.from(new Set([...preferred.filter((u): u is string => !!u && uids.includes(u)), ...uids]));
    const problems: Record<string, string> = {};
    for (const uid of order) {
      try {
        const views = await fetchViews(sceneGraph.getTimeRange(this).state.value, uid);
        if (views.length > 0) {
          this.setState({ datasource: uid, datasourceProblems: problems });
          await this.applyViews(views);
          return;
        }
        problems[uid] = 'no log views for you';
      } catch (e) {
        problems[uid] = e instanceof Error ? e.message : String(e);
      }
    }
    // nothing usable: show the first data source and why it failed
    this.setState({ datasource: order[0], datasourceProblems: problems });
    await this.loadViews(order[0]);
  }

  private async loadViews(datasource: string) {
    const req = ++this.ctxRequest;
    this.setState({ views: undefined, viewsError: undefined, ctx: undefined, ctxError: undefined });
    this.rebuild();
    try {
      const views = await fetchViews(sceneGraph.getTimeRange(this).state.value, datasource);
      if (req === this.ctxRequest) {
        await this.applyViews(views);
      }
    } catch (e) {
      if (req === this.ctxRequest) {
        this.setState({ views: [], viewsError: e instanceof Error ? e.message : String(e) });
        this.rebuild();
      }
    }
  }

  /** Picks the view: the one in the URL, else the last one used in this data source, else the first. */
  private async applyViews(views: string[]) {
    const last = getLastSelection();
    let view = views[0];
    if (this.state.view && views.includes(this.state.view)) {
      view = this.state.view;
    } else if (last.ds === this.state.datasource && last.view && views.includes(last.view)) {
      view = last.view;
    }
    this.setState({ views, view, viewsError: undefined });
    if (view) {
      setLastSelection(this.state.datasource, view);
      await this.loadContext(view);
    } else {
      this.rebuild();
    }
  }

  private async loadContext(view: string) {
    const req = ++this.ctxRequest;
    this.setState({ ctx: undefined, ctxError: undefined });
    this.rebuild();
    try {
      const ctx = await buildContext(view, sceneGraph.getTimeRange(this).state.value, this.state.datasource ?? '');
      if (req === this.ctxRequest) {
        this.setState({ ctx });
        this.loadOldest(view);
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

  /** "Oldest log": the oldest line of the view (cached per browser for a few hours), in the background. */
  private async loadOldest(view: string) {
    const ds = this.state.datasource ?? '';
    const key = `${ds}/${view}`;
    if (this.state.oldest?.key === key && !this.state.oldest.error) {
      return;
    }
    this.setState({ oldest: { key, loading: true } });
    const current = () => `${this.state.datasource ?? ''}/${this.state.view ?? ''}` === key;
    try {
      const ms = await fetchOldestLog(view, ds);
      if (current()) {
        this.setState({ oldest: { key, ms: ms ?? null } });
      }
    } catch (e) {
      if (current()) {
        this.setState({ oldest: { key, error: e instanceof Error ? e.message : String(e) } });
      }
    }
  }

  // ---- label filters ----

  getLabelFiltersVariable() {
    return this.state.labelFilters;
  }

  getLabelFilters(): LabelFilter[] {
    return this.state.labelFilters.state.filters
      .filter((f) => !f.hidden && f.key && LABEL_OPS.includes(f.operator))
      .flatMap((f): LabelFilter[] => {
        if (f.operator === '=|' || f.operator === '!=|') {
          const op: LabelOp = f.operator === '=|' ? '=' : '!=';
          return (f.values ?? [f.value]).map((value) => ({ key: f.key, op, value }));
        }
        return [{ key: f.key, op: f.operator as LabelOp, value: f.value }];
      });
  }

  private setLabelFilters(filters: LabelFilter[]) {
    this.state.labelFilters.updateFilters(filters.map(toAdHoc));
  }

  private onLabelFiltersChanged(prev: AdHocFilter[], next: AdHocFilter[]) {
    if (this.state.page === 'selection') {
      // Include / Remove on the grid's own label: the grid stays the same, its rows update themselves
      const primary = this.primaryLabel();
      const others = (fs: AdHocFilter[]) =>
        JSON.stringify(fs.filter((f) => f.key !== primary).map((f) => [f.key, f.operator, f.value]));
      if (others(prev) === others(next)) {
        return;
      }
    }
    this.setState({ breakdown: undefined });
    this.rebuild();
  }

  addFilter(f: LabelFilter) {
    const cur = this.getLabelFilters();
    const exists = cur.some((x) => x.key === f.key && x.value === f.value && x.op === f.op);
    const others = cur.filter((x) => !(x.key === f.key && x.value === f.value));
    this.setLabelFilters(exists ? others : [...others, f]);
  }

  removeLabelFilter(key: string, value: string) {
    this.setLabelFilters(this.getLabelFilters().filter((f) => !(f.key === key && f.value === value)));
  }

  hasFilter(key: string, value: string, op: LabelFilter['op'] = '=') {
    return this.getLabelFilters().some((f) => f.key === key && f.value === value && f.op === op);
  }

  // ---- ExplorationApi ----

  primaryLabel(): string {
    return this.state.primaryLabel ?? getAppConfig().serviceLabel;
  }

  getSpec(): QuerySpec {
    const s = this.state;
    return {
      datasource: s.datasource ?? '',
      view: s.view ?? '',
      filters: this.getLabelFilters(),
      levels: s.levels,
      lineFilters: s.lineFilters,
      patternFilters: s.patternFilters,
      fieldFilters: s.fieldFilters,
    };
  }

  /** The value grid uses only label filters, and not those on its own label (it shows every value). */
  private selectionSpec(): QuerySpec {
    const primary = this.primaryLabel();
    return {
      ...emptySpec(this.state.view ?? '', this.state.datasource ?? ''),
      filters: this.getLabelFilters().filter((f) => f.key !== primary),
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
    return this.state.page === 'details';
  }

  private clearedFilters() {
    return { levels: [], lineFilters: [], patternFilters: [], fieldFilters: [] };
  }

  /** Switch database: views, columns and filters belong to the data source, so they are reset. */
  setDatasource(uid: string) {
    if (uid === this.state.datasource) {
      return;
    }
    this.navigate(() =>
      this.setState({
        datasource: uid,
        view: undefined,
        page: 'selection',
        ...this.clearedFilters(),
        breakdown: undefined,
        tab: 'logs',
        search: '',
        primaryLabel: undefined,
        labelTabs: [],
      })
    );
    this.setLabelFilters([]);
    this.loadViews(uid);
  }

  setView(view: string) {
    if (view === this.state.view) {
      return;
    }
    this.navigate(() =>
      this.setState({
        view,
        page: 'selection',
        ...this.clearedFilters(),
        breakdown: undefined,
        tab: 'logs',
        search: '',
      })
    );
    this.setLabelFilters([]);
    setLastSelection(this.state.datasource, view);
    this.loadContext(view);
  }

  setLevels(levels: string[]) {
    const cur = this.state.levels;
    const same = cur.length === levels.length && levels.every((l) => cur.includes(l));
    this.setLevelsExact(same ? [] : levels);
  }

  /** From the "Log levels" select: exactly these levels (none or all = no filter). */
  setLevelsExact(levels: string[]) {
    this.setState({ levels: levels.length >= LEVELS.length ? [] : levels });
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
    this.navigate(() => this.setState({ tab, breakdown: undefined }));
    this.rebuild();
  }

  setBreakdown(key?: string) {
    this.setState({ breakdown: key });
    this.rebuild();
  }

  /** "Show logs" on a value: that value only (for its label), other filters kept. */
  selectValue(label: string, value: string) {
    const filters = this.getLabelFilters().filter((f) => !(f.key === label && f.op === '='));
    this.navigate(() => this.setState({ page: 'details', tab: 'logs', breakdown: undefined }));
    this.setLabelFilters([...filters, { key: label, op: '=', value }]);
    this.rebuild();
  }

  /** "Show logs" above the grid: the logs of the current filters. */
  showLogs() {
    this.navigate(() => this.setState({ page: 'details', tab: 'logs', breakdown: undefined }));
    this.rebuild();
  }

  backToSelection() {
    this.navigate(() => this.setState({ page: 'selection', breakdown: undefined }));
    this.rebuild();
  }

  setPrimaryLabel(label: string) {
    const primaryLabel = label === getAppConfig().serviceLabel ? undefined : label;
    this.navigate(() => this.setState({ primaryLabel, search: '' }));
    this.rebuild();
  }

  addLabelTab(label: string) {
    if (label !== getAppConfig().serviceLabel && !this.state.labelTabs.includes(label)) {
      this.setState({ labelTabs: [...this.state.labelTabs, label] });
    }
    this.setPrimaryLabel(label);
  }

  removeLabelTab(label: string) {
    const wasActive = this.primaryLabel() === label;
    this.setState({ labelTabs: this.state.labelTabs.filter((t) => t !== label) });
    if (wasActive) {
      this.setPrimaryLabel(getAppConfig().serviceLabel);
    }
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
    return `${this.rangeBlocked()}|${this.rangeHours() > LEVEL_SAMPLE_ABOVE_HOURS}`;
  }

  /**
   * How volumes get their level. Tenants with a level column: exact, always (cheap). Tenants whose level is
   * read from the message (a regexp per line, 92 % of the query time on UAT): the service grid shows plain
   * volumes unless the user asks for levels; with levels, ranges over an hour are counted on a 10 % hash sample
   * (about 4 times faster, counts multiplied by 10).
   */
  levelPlan(forGrid: boolean): { withLevel: boolean; sample?: number } {
    const tenant = this.state.ctx?.tenant;
    if (!tenant || tenant.level.source === 'column') {
      return { withLevel: true };
    }
    if (forGrid && !this.state.gridLevels) {
      return { withLevel: false };
    }
    return { withLevel: true, sample: this.rangeHours() > LEVEL_SAMPLE_ABOVE_HOURS ? LEVEL_SAMPLE : undefined };
  }

  setGridLevels(on: boolean) {
    this.setState({ gridLevels: on });
    this.rebuild();
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
    const dsName = s.datasources?.find((d) => d.uid === s.datasource)?.name ?? s.datasource ?? '';
    if (s.viewsError) {
      const others = (s.datasources?.length ?? 0) > 1 ? ' Try another data source.' : '';
      return this.message('error', `Could not list your StarRocks log views in ${dsName}`, `${s.viewsError}${others}`);
    }
    if (s.views === undefined) {
      return new SceneReactObject({ reactNode: <Loading text="Loading your views…" /> });
    }
    if (s.views.length === 0) {
      return this.message(
        'info',
        'No log views available',
        `StarRocks returned no views matching ${viewPrefixFor(config, s.datasource)}* in ${dsName} for your account. Ask for access to your team's log view${(s.datasources?.length ?? 0) > 1 ? ', or pick another data source' : ''}.`
      );
    }
    if (!s.view || !s.views.includes(s.view)) {
      // never stay without a view while the user has some: pick one
      const views = s.views;
      queueMicrotask(() => this.applyViews(views));
      return new SceneReactObject({ reactNode: <Loading text="Opening view…" /> });
    }
    if (s.ctxError) {
      return this.message('error', `Could not open ${s.view}`, s.ctxError);
    }
    if (!s.ctx) {
      return new SceneReactObject({ reactNode: <Loading text="Opening view…" /> });
    }
    const spec = this.getSpec();
    const tenant = s.ctx.tenant;
    const blocked = this.rangeBlocked();
    const gridLevel = this.levelPlan(true);
    const tabLevel = this.levelPlan(false);
    const textScan = needsMessageScan(spec, tenant, false);

    if (!this.isDetails()) {
      return new ServiceSelectionScene({
        spec: this.selectionSpec(),
        label: this.primaryLabel(),
        search: s.search,
        withLevel: gridLevel.withLevel,
        sample: gridLevel.sample,
        levelFromMessage: tenant.level.source === 'message',
      });
    }
    const reason =
      'The current filters (line search, message fields, patterns or a level read from the message) need a full scan of the log text.';
    const { display, sort, limit, wrap } = this.getDisplay();
    switch (s.tab) {
      case 'logs':
        // no guard: the lines are searched newest first and stop at the line limit; only the volume chart
        // (which reads every line) waits for the user
        return new LogsTabScene({
          spec,
          withLevel: tabLevel.withLevel,
          sample: tabLevel.sample,
          volumeDeferred: blocked && textScan,
          display,
          sort,
          limit,
          wrap,
        });
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
  const { views, view, body, controls, ctx, tab, datasources, datasource, datasourceProblems, labelFilters, page } =
    state;
  const { filters } = labelFilters.useState();
  const errors = getAppConfigErrors();
  const details = page === 'details';

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
      {/* row 1: label filters left; data source, view, time and refresh right. Nothing here changes width
          between pages, so the pickers never move. */}
      <div className={styles.header}>
        <div className={styles.left}>
          <div className={styles.caption}>Labels</div>
          <div className={styles.filters} data-testid="label-filters">
            <labelFilters.Component model={labelFilters} />
          </div>
        </div>
        <div className={styles.right}>
          <InlineField label="Data source">
            <Select
              width={22}
              aria-label="Data source"
              data-testid="datasource-picker"
              isLoading={datasources === undefined}
              options={(datasources ?? []).map((d) => ({
                label: d.name,
                value: d.uid,
                description: datasourceProblems?.[d.uid],
              }))}
              value={datasource ?? null}
              onChange={(o) => o.value && model.setDatasource(o.value)}
              placeholder="Select a data source"
            />
          </InlineField>
          <InlineField label="View">
            <Select
              width={34}
              aria-label="View"
              data-testid="view-picker"
              isLoading={views === undefined}
              options={(views ?? []).map((v) => ({ label: v, value: v }))}
              value={view ?? null}
              onChange={(o) => o.value && model.setView(o.value)}
              placeholder="Select a view"
            />
          </InlineField>
          {controls.map((c) => (
            <c.Component key={c.state.key} model={c} />
          ))}
        </div>
      </div>

      {/* row 2: where you are (Show logs / Back) on the left; status on the right (range notice, loading, oldest log) */}
      <div className={styles.bar} data-testid="page-bar">
        <div className={styles.barLeft}>
          {details ? (
            <Button
              size="sm"
              variant="secondary"
              icon="arrow-left"
              onClick={() => model.backToSelection()}
              data-testid="back-to-services"
            >
              Back to {displayLabel(model.primaryLabel())} values
            </Button>
          ) : (
            <Button
              size="sm"
              variant={filters.length > 0 ? 'primary' : 'secondary'}
              fill="outline"
              icon="arrow-right"
              onClick={() => model.showLogs()}
              data-testid="show-logs"
            >
              Show logs{filters.length > 0 ? ' of the current filters' : ''}
            </Button>
          )}
        </div>
        <div className={styles.barRight}>
          <RangeNotice model={model} />
          <RunningIndicator model={model} />
          <OldestLog model={model} />
        </div>
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
              />
            ))}
          </TabsBar>
        </>
      ) : (
        view && ctx && <LabelTabs model={model} />
      )}
      <BeforeOldestNotice model={model} />
      <div className={styles.body}>{body && <body.Component model={body} />}</div>
    </div>
  );
}

/**
 * "Oldest log": the time of the view's oldest line, so users know how far back they can look (like the
 * "Oldest Record" of the internal Log Analytics UI).
 */
function OldestLog({ model }: { model: LogsExploration }) {
  const styles = useStyles2(getStyles);
  const { oldest, view } = model.useState();
  const timeZone = sceneGraph.getTimeRange(model).getTimeZone();
  if (!oldest || !view || oldest.error) {
    return null;
  }
  const text = oldest.loading
    ? '…'
    : oldest.ms === null || oldest.ms === undefined
      ? 'no lines'
      : dateTimeFormat(oldest.ms, { format: 'D MMM YYYY HH:mm', timeZone });
  const tip =
    oldest.ms !== null && oldest.ms !== undefined
      ? `Oldest line in ${view}: ${dateTimeFormat(oldest.ms, { format: 'YYYY-MM-DD HH:mm:ss', timeZone })}`
      : `Looking up the oldest line in ${view}`;
  return (
    <Tooltip content={tip}>
      <span className={styles.oldest} data-testid="oldest-log">
        <span className={styles.oldestLabel}>Oldest log</span> <span>{text}</span>
      </span>
    </Tooltip>
  );
}

/** "Loading… 12 s  Cancel" while any query of the page runs (from the scene's query controller). */
function RunningIndicator({ model }: { model: LogsExploration }) {
  const controller = sceneGraph.getQueryController(model);
  return controller ? <RunningIndicatorInner controller={controller} /> : null;
}

function RunningIndicatorInner({
  controller,
}: {
  controller: NonNullable<ReturnType<typeof sceneGraph.getQueryController>>;
}) {
  const styles = useStyles2(getStyles);
  const { isRunning } = controller.useState();
  if (!isRunning) {
    return null;
  }
  return (
    <span className={styles.running} data-testid="running-indicator">
      <Spinner inline />
      Loading
      <Elapsed />
      <Button
        size="sm"
        fill="text"
        variant="secondary"
        onClick={() => controller.cancelAll()}
        data-testid="cancel-queries"
      >
        Cancel
      </Button>
    </span>
  );
}

/** "Time range limited to 24 hours", under the header (a toast would cover the time picker). Hides after 20 s. */
function RangeNotice({ model }: { model: LogsExploration }) {
  const styles = useStyles2(getStyles);
  const timeRange = sceneGraph.getTimeRange(model);
  const state = timeRange.useState();
  const capped = cappedOf(state);
  const dismiss = useCallback(() => {
    if (timeRange instanceof CappedTimeRange) {
      timeRange.dismissCapped();
    }
  }, [timeRange]);
  useEffect(() => {
    if (!capped) {
      return;
    }
    const timer = setTimeout(dismiss, 20_000);
    return () => clearTimeout(timer);
  }, [capped, dismiss]);
  if (!capped) {
    return null;
  }
  return (
    <span className={styles.notice} data-testid="range-capped" role="status">
      <Icon name="info-circle" />
      Time range limited to {capped.hours} hours: showing the last {capped.hours} hours of your selection.
      <IconButton name="times" size="sm" aria-label="Dismiss" onClick={dismiss} />
    </span>
  );
}

/** Shown when the whole time range is before the view's oldest line: nothing to find there. */
function BeforeOldestNotice({ model }: { model: LogsExploration }) {
  const { oldest, view } = model.useState();
  const timeRange = sceneGraph.getTimeRange(model);
  const { value } = timeRange.useState();
  const ms = oldest?.ms;
  if (ms === null || ms === undefined || value.to.valueOf() >= ms) {
    return null;
  }
  const hours = getAppConfig().maxRangeHours;
  const when = dateTimeFormat(ms, { format: 'D MMM YYYY HH:mm', timeZone: timeRange.getTimeZone() });
  const showFirst = () => {
    const to = Math.min(ms + hours * 3_600_000, Date.now());
    timeRange.onTimeRangeChange(
      rangeUtil.convertRawToRange({ from: new Date(ms).toISOString(), to: new Date(to).toISOString() })
    );
  };
  return (
    <Alert severity="info" title={`No logs in this time range: ${view} starts on ${when}`} data-testid="before-oldest">
      <Button size="sm" variant="secondary" onClick={showFirst}>
        Show the first {hours} hours of logs
      </Button>
    </Alert>
  );
}

/** "service" tab, tabs added with "Add label" (closable), like Logs Drilldown. */
function LabelTabs({ model }: { model: LogsExploration }) {
  const styles = useStyles2(getStyles);
  const { ctx, labelTabs } = model.useState();
  const [adding, setAdding] = useState(false);
  if (!ctx) {
    return null;
  }
  const service = getAppConfig().serviceLabel;
  const active = model.primaryLabel();
  const tabs = Array.from(new Set([service, ...labelTabs, active])).filter((l) => ctx.labels.includes(l));
  const remaining = ctx.labels.filter((l) => !tabs.includes(l));
  return (
    <TabsBar>
      {tabs.map((l) => (
        <Tab
          key={l}
          label={displayLabel(l)}
          active={active === l}
          onChangeTab={() => model.setPrimaryLabel(l)}
          suffix={
            l === service
              ? undefined
              : ({ className }: { className?: string }) => (
                  <IconButton
                    className={className}
                    name="times"
                    size="sm"
                    aria-label={`Remove ${l} tab`}
                    onClick={(e) => {
                      e.stopPropagation();
                      model.removeLabelTab(l);
                    }}
                  />
                )
          }
        />
      ))}
      <div className={styles.addLabel}>
        {adding ? (
          <Select
            width={30}
            autoFocus
            isOpen
            openMenuOnFocus
            aria-label="Search labels"
            placeholder="Search labels"
            options={remaining.map((l) => ({ label: l, value: l }))}
            onChange={(o) => {
              setAdding(false);
              if (o.value) {
                model.addLabelTab(o.value);
              }
            }}
            onBlur={() => setAdding(false)}
            onCloseMenu={() => setAdding(false)}
          />
        ) : (
          <Button fill="text" icon="plus-circle" onClick={() => setAdding(true)} data-testid="add-label">
            Add label
          </Button>
        )}
      </div>
    </TabsBar>
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
  header: css({
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: theme.spacing(2),
    flexWrap: 'wrap',
  }),
  // the pickers sit to the right of the label filters when there is room (about 1350 px of content), else
  // they wrap under them, right-aligned; the filter box never gets narrower than 280 px
  left: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    flex: '1 1 440px',
    minWidth: 'min-content',
  }),
  caption: css({ fontSize: theme.typography.bodySmall.fontSize, color: theme.colors.text.secondary }),
  filters: css({ minWidth: 280, maxWidth: 900 }),
  // stays right-aligned when a narrow window wraps it under the label filters
  right: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
    marginLeft: 'auto',
  }),
  bar: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(2),
    flexWrap: 'wrap',
    minHeight: 32,
  }),
  barLeft: css({ display: 'flex', alignItems: 'center', gap: theme.spacing(1) }),
  barRight: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing(2),
    flexWrap: 'wrap',
    marginLeft: 'auto',
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  running: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    color: theme.colors.text.secondary,
  }),
  notice: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    padding: theme.spacing(0.25, 0.5, 0.25, 1),
    borderRadius: theme.shape.radius.default,
    background: theme.colors.info.transparent,
    color: theme.colors.text.primary,
  }),
  addLabel: css({ marginLeft: theme.spacing(1), alignSelf: 'center' }),
  oldest: css({ whiteSpace: 'nowrap', color: theme.colors.text.primary }),
  oldestLabel: css({ color: theme.colors.text.secondary }),
  body: css({ paddingTop: theme.spacing(1), minWidth: 0 }),
});
