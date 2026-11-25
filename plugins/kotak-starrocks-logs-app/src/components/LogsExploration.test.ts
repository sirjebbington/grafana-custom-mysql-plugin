import { SceneReactObject } from '@grafana/scenes';

import { setAppConfig } from '../config/config';
import { BuildContext } from '../sql/builder';
import { getLastSelection, setLastSelection } from '../state/storage';
import { LineFilter, MessageFieldFilter } from '../state/types';
import { BreakdownScene } from './BreakdownScene';
import { LogsTabScene } from './LogsTabScene';
import { PatternsTabScene } from './PatternsTabScene';
import { ServiceSelectionScene } from './ServiceSelectionScene';
import { COL_VIEW, ctxFor, deferred, flush, mountExploration as setup, MSG_VIEW } from './testScene';
import { ScanGuard } from './ui';

const listDatasources = jest.fn();
const fetchViews = jest.fn();
const buildContext = jest.fn();
const fetchOldestLog = jest.fn();

jest.mock('../datasource/api', () => ({
  ...jest.requireActual('../datasource/api'),
  listDatasources: () => listDatasources(),
  fetchViews: (...a: unknown[]) => fetchViews(...a),
}));
jest.mock('../datasource/StarRocksLogsDataSource', () => ({
  ...jest.requireActual('../datasource/StarRocksLogsDataSource'),
  buildContext: (...a: unknown[]) => buildContext(...a),
}));
jest.mock('../datasource/oldest', () => ({ fetchOldestLog: (...a: unknown[]) => fetchOldestLog(...a) }));

beforeEach(() => {
  localStorage.clear();
  setAppConfig({});
  listDatasources.mockReset().mockReturnValue([
    { uid: 'ds1', name: 'logs1' },
    { uid: 'ds2', name: 'logs2' },
  ]);
  fetchViews.mockReset().mockResolvedValue([COL_VIEW, MSG_VIEW]);
  buildContext.mockReset().mockImplementation(async (view: string) => ctxFor(view));
  fetchOldestLog.mockReset().mockResolvedValue(1_700_000_000_000);
});

describe('opening the app: data source, view, context, oldest log', () => {
  it('picks the first data source with views, the first view, builds the context and looks up the oldest line', async () => {
    const { ex } = await setup();
    expect(ex.state.datasource).toBe('ds1');
    expect(ex.state.view).toBe(COL_VIEW);
    expect(buildContext).toHaveBeenCalledWith(COL_VIEW, expect.anything(), 'ds1');
    expect(ex.state.ctx?.tenant.key).toBe('app_04000_payments');
    expect(fetchOldestLog).toHaveBeenCalledWith(COL_VIEW, 'ds1');
    expect(ex.state.oldest).toEqual({ key: `ds1/${COL_VIEW}`, ms: 1_700_000_000_000 });
    expect(ex.state.body).toBeInstanceOf(ServiceSelectionScene);
    expect(getLastSelection()).toEqual({ ds: 'ds1', view: COL_VIEW });
  });

  it('skips data sources that fail or have no views and records why', async () => {
    fetchViews.mockImplementation(async (_r: unknown, uid: string) => {
      if (uid === 'ds1') {
        throw new Error('Access denied by Ranger (5204)');
      }
      return [MSG_VIEW];
    });
    const { ex } = await setup();
    expect(ex.state.datasource).toBe('ds2');
    expect(ex.state.datasourceProblems).toEqual({ ds1: 'Access denied by Ranger (5204)' });
    expect(ex.state.view).toBe(MSG_VIEW);
  });

  it('prefers the last data source and view used in this browser', async () => {
    setLastSelection('ds2', MSG_VIEW);
    const { ex } = await setup();
    expect(fetchViews.mock.calls[0][1]).toBe('ds2');
    expect(ex.state.datasource).toBe('ds2');
    expect(ex.state.view).toBe(MSG_VIEW);
  });

  it('a data source from the URL is used as is (no fallback), with the view from the URL', async () => {
    const { ex } = await setup({ datasource: 'ds2', view: MSG_VIEW });
    expect(fetchViews).toHaveBeenCalledTimes(1);
    expect(fetchViews.mock.calls[0][1]).toBe('ds2');
    expect(ex.state.view).toBe(MSG_VIEW);
  });

  it('no data source: an explanation instead of the grid', async () => {
    listDatasources.mockReturnValue([]);
    const { ex } = await setup();
    expect(ex.state.views).toEqual([]);
    expect(ex.state.viewsError).toMatch(/No kotak-starrocks-datasource data source is available/);
    expect(ex.state.body).toBeInstanceOf(SceneReactObject);
  });

  it('no view anywhere: the first data source and an info message', async () => {
    fetchViews.mockResolvedValue([]);
    const { ex } = await setup();
    expect(ex.state.datasource).toBe('ds1');
    expect(ex.state.views).toEqual([]);
    expect(ex.state.datasourceProblems).toEqual({ ds1: 'no log views for you', ds2: 'no log views for you' });
    expect(ex.state.body).toBeInstanceOf(SceneReactObject);
  });

  it('a context error and an oldest-log error are kept in the state', async () => {
    buildContext.mockRejectedValue(new Error('5203: no SELECT on the view'));
    const { ex } = await setup();
    expect(ex.state.ctxError).toBe('5203: no SELECT on the view');
    expect(ex.state.body).toBeInstanceOf(SceneReactObject);

    buildContext.mockImplementation(async (view: string) => ctxFor(view));
    fetchOldestLog.mockRejectedValue(new Error('timeout'));
    ex.setView(MSG_VIEW);
    await flush();
    expect(ex.state.oldest).toEqual({ key: `ds1/${MSG_VIEW}`, error: 'timeout' });
  });

  it('a slow reply for a view the user already left is dropped', async () => {
    const { ex } = await setup();
    const slow = deferred<BuildContext>();
    const fast = deferred<BuildContext>();
    buildContext.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    ex.setView(MSG_VIEW);
    ex.setView(COL_VIEW);
    fast.resolve(ctxFor(COL_VIEW));
    await flush();
    slow.resolve(ctxFor(MSG_VIEW));
    await flush();
    expect(ex.state.view).toBe(COL_VIEW);
    expect(ex.state.ctx?.tenant.key).toBe('app_04000_payments');
  });
});

describe('URL state', () => {
  it('writes only what differs from the defaults', async () => {
    const { ex } = await setup();
    expect(ex.getUrlState()).toEqual({
      ds: 'ds1',
      view: COL_VIEW,
      page: null,
      label: null,
      tabs: null,
      filter: null,
      level: null,
      line: null,
      pattern: null,
      field: null,
      tab: null,
      breakdown: null,
      sort: null,
      limit: null,
      display: null,
      wrap: null,
      search: null,
      levelsplit: null,
    });
  });

  it('reads every key, drops invalid values, and writes the same values back', async () => {
    const { ex } = await setup();
    ex.updateFromUrl({
      page: 'details',
      label: 'k8s_namespace_name',
      tabs: ['k8s_namespace_name', ''],
      level: ['error', 'bogus'],
      tab: 'patterns',
      breakdown: 'k8s_pod_uid',
      sort: 'asc',
      limit: '200',
      display: 'table',
      wrap: '1',
      search: 'pay',
      levelsplit: '1',
    });
    const s = ex.state;
    expect(s.page).toBe('details');
    expect(s.primaryLabel).toBe('k8s_namespace_name');
    expect(s.labelTabs).toEqual(['k8s_namespace_name']);
    expect(s.levels).toEqual(['error']);
    expect(s.tab).toBe('patterns');
    expect(s.sort).toBe('asc');
    expect(s.limit).toBe(200);
    expect(s.display).toBe('table');
    expect(s.wrap).toBe(true);
    expect(s.search).toBe('pay');
    expect(s.gridLevels).toBe(true);
    expect(ex.getUrlState()).toMatchObject({
      page: 'details',
      tab: 'patterns',
      sort: 'asc',
      limit: '200',
      display: 'table',
      wrap: '1',
      levelsplit: '1',
      level: ['error'],
    });

    ex.updateFromUrl({ tab: 'nope', limit: '3', display: 'chart', sort: 'x', page: 'x' });
    expect(ex.state.tab).toBe('logs');
    expect(ex.state.limit).toBeUndefined();
    expect(ex.state.display).toBe('logs');
    expect(ex.state.sort).toBe('desc');
    expect(ex.state.page).toBe('selection');
  });

  it('a URL without ds/view keeps them; a URL with another view opens it', async () => {
    const { ex } = await setup();
    ex.updateFromUrl({ ds: null, view: null });
    expect(ex.state.datasource).toBe('ds1');
    expect(ex.state.view).toBe(COL_VIEW);
    ex.updateFromUrl({ view: MSG_VIEW });
    await flush();
    expect(buildContext).toHaveBeenLastCalledWith(MSG_VIEW, expect.anything(), 'ds1');
    expect(ex.state.ctx?.tenant.key).toBe('app_1961_observability');
  });

  it('line, pattern and field filters round-trip', async () => {
    const { ex } = await setup();
    ex.addLineFilter({ op: 'include', value: 'timed out', caseSensitive: false, regex: false });
    ex.togglePatternFilter('Timeout', 'include');
    ex.addFieldFilter({ key: 'status', value: '500', op: '=' });
    const url = ex.getUrlState();
    const copy = await setup();
    copy.ex.updateFromUrl(url);
    expect(copy.ex.state.lineFilters).toEqual(ex.state.lineFilters);
    expect(copy.ex.state.patternFilters).toEqual(ex.state.patternFilters);
    expect(copy.ex.state.fieldFilters).toEqual(ex.state.fieldFilters);
  });

  it('the old "filter" key (0.1.0/0.2.0 links) becomes label filters and opens the logs', async () => {
    const { ex } = await setup();
    ex.updateFromUrl({ filter: ['k8s_service_name|=|checkout'] });
    expect(ex.state.page).toBe('details');
    expect(ex.getLabelFilters()).toEqual([{ key: 'k8s_service_name', op: '=', value: 'checkout' }]);
    expect(ex.getUrlState().filter).toBeNull();
  });
});

describe('filters', () => {
  it('label filters toggle; "one of" filters expand to several', async () => {
    const { ex } = await setup();
    ex.addFilter({ key: 'k8s_namespace_name', op: '=', value: 'prod' });
    expect(ex.hasFilter('k8s_namespace_name', 'prod')).toBe(true);
    ex.addFilter({ key: 'k8s_namespace_name', op: '!=', value: 'prod' });
    expect(ex.getLabelFilters()).toEqual([{ key: 'k8s_namespace_name', op: '!=', value: 'prod' }]);
    ex.addFilter({ key: 'k8s_namespace_name', op: '!=', value: 'prod' });
    expect(ex.getLabelFilters()).toEqual([]);

    ex.state.labelFilters.updateFilters([
      { key: 'k8s_service_name', operator: '=|', value: 'a', values: ['a', 'b'] },
      { key: 'k8s_pod_uid', operator: '<', value: '1' },
    ]);
    expect(ex.getLabelFilters()).toEqual([
      { key: 'k8s_service_name', op: '=', value: 'a' },
      { key: 'k8s_service_name', op: '=', value: 'b' },
    ]);
    ex.removeLabelFilter('k8s_service_name', 'a');
    expect(ex.getLabelFilters()).toEqual([{ key: 'k8s_service_name', op: '=', value: 'b' }]);
  });

  it('levels: the same set again clears; all levels means no filter', async () => {
    const { ex } = await setup();
    ex.setLevels(['error']);
    expect(ex.state.levels).toEqual(['error']);
    ex.setLevels(['error']);
    expect(ex.state.levels).toEqual([]);
    ex.setLevelsExact(['error', 'warn', 'info', 'debug', 'unknown']);
    expect(ex.state.levels).toEqual([]);
  });

  it('line filters ignore empty and duplicate entries; patterns and fields toggle; a filter closes the breakdown', async () => {
    const { ex } = await setup();
    const f: LineFilter = { op: 'include', value: 'x', caseSensitive: false, regex: false };
    ex.addLineFilter({ op: 'include', value: '', caseSensitive: false, regex: false });
    ex.addLineFilter(f);
    ex.addLineFilter(f);
    expect(ex.state.lineFilters).toHaveLength(1);
    ex.removeLineFilter(0);
    expect(ex.state.lineFilters).toEqual([]);

    ex.togglePatternFilter('Timeout', 'include');
    ex.togglePatternFilter('Timeout', 'exclude');
    expect(ex.state.patternFilters).toEqual([{ name: 'Timeout', op: 'exclude' }]);
    ex.togglePatternFilter('Timeout', 'exclude');
    expect(ex.state.patternFilters).toEqual([]);
    ex.togglePatternFilter('Timeout', 'include');
    ex.removePatternFilter(0);
    expect(ex.state.patternFilters).toEqual([]);

    ex.setBreakdown('k8s_pod_uid');
    const ff: MessageFieldFilter = { key: 'status', value: '500', op: '=' };
    ex.addFieldFilter(ff);
    expect(ex.state.breakdown).toBeUndefined();
    expect(ex.hasFieldFilter('status', '500', '=')).toBe(true);
    ex.addFieldFilter(ff);
    expect(ex.state.fieldFilters).toEqual([]);
    ex.addFieldFilter(ff);
    ex.removeFieldFilter(0);
    expect(ex.state.fieldFilters).toEqual([]);
  });

  it('the grid ignores filters on its own label and rebuilds for filters on other labels', async () => {
    const { ex } = await setup();
    const grid = ex.state.body;
    ex.addFilter({ key: 'k8s_service_name', op: '=', value: 'checkout' });
    expect(ex.state.body).toBe(grid);
    ex.addFilter({ key: 'k8s_namespace_name', op: '=', value: 'prod' });
    expect(ex.state.body).not.toBe(grid);
    const spec = (ex.state.body as ServiceSelectionScene).state.spec;
    expect(spec.filters).toEqual([{ key: 'k8s_namespace_name', op: '=', value: 'prod' }]);
    expect(ex.getSpec().filters).toHaveLength(2);
  });
});

describe('navigation', () => {
  it('Show logs on a value replaces the "=" filter of that label and opens the Logs tab; Back returns to the grid', async () => {
    const { ex } = await setup();
    ex.addFilter({ key: 'k8s_service_name', op: '=', value: 'a' });
    ex.addFilter({ key: 'k8s_namespace_name', op: '=', value: 'prod' });
    ex.selectValue('k8s_service_name', 'b');
    expect(ex.isDetails()).toBe(true);
    expect(ex.state.tab).toBe('logs');
    expect(ex.getLabelFilters()).toEqual([
      { key: 'k8s_namespace_name', op: '=', value: 'prod' },
      { key: 'k8s_service_name', op: '=', value: 'b' },
    ]);
    expect(ex.state.body).toBeInstanceOf(LogsTabScene);
    ex.backToSelection();
    expect(ex.state.page).toBe('selection');
    expect(ex.state.body).toBeInstanceOf(ServiceSelectionScene);
    ex.showLogs();
    expect(ex.state.body).toBeInstanceOf(LogsTabScene);
  });

  it('tabs: labels and fields open a breakdown over the view columns, patterns the tenant patterns', async () => {
    const { ex } = await setup({ datasource: 'ds1', view: MSG_VIEW });
    ex.showLogs();
    ex.setTab('labels');
    expect((ex.state.body as BreakdownScene).state.columns).toEqual(['k8s_service_name', 'k8s_namespace_name']);
    ex.setTab('fields');
    expect((ex.state.body as BreakdownScene).state.columns).toEqual(['k8s_pod_uid']);
    ex.setBreakdown('k8s_pod_uid');
    expect((ex.state.body as BreakdownScene).state.selected).toBe('k8s_pod_uid');
    ex.setTab('patterns');
    expect(ex.state.breakdown).toBeUndefined();
    expect(ex.state.body).toBeInstanceOf(PatternsTabScene);
  });

  it('display options go to the Logs tab; the line limit falls back to the configured one', async () => {
    const { ex } = await setup();
    ex.showLogs();
    expect(ex.getDisplay()).toEqual({ display: 'logs', sort: 'desc', limit: 1000, wrap: false });
    ex.setDisplay({ sort: 'asc', limit: 200, wrap: true, display: 'table' });
    expect((ex.state.body as LogsTabScene).state).toMatchObject({
      sort: 'asc',
      limit: 200,
      wrap: true,
      display: 'table',
    });
  });

  it('label tabs: added once, never for the service label; removing the active one returns to services', async () => {
    const { ex } = await setup();
    ex.addLabelTab('k8s_namespace_name');
    ex.addLabelTab('k8s_namespace_name');
    expect(ex.state.labelTabs).toEqual(['k8s_namespace_name']);
    expect(ex.primaryLabel()).toBe('k8s_namespace_name');
    expect((ex.state.body as ServiceSelectionScene).state.label).toBe('k8s_namespace_name');
    ex.addLabelTab('k8s_service_name');
    expect(ex.state.labelTabs).toEqual(['k8s_namespace_name']);
    expect(ex.state.primaryLabel).toBeUndefined();
    ex.setPrimaryLabel('k8s_namespace_name');
    ex.removeLabelTab('k8s_namespace_name');
    expect(ex.state.labelTabs).toEqual([]);
    expect(ex.primaryLabel()).toBe('k8s_service_name');
  });

  it('the grid search is passed to the grid without rebuilding it', async () => {
    const { ex } = await setup();
    const grid = ex.state.body as ServiceSelectionScene;
    ex.setSearch('pay');
    expect(ex.state.body).toBe(grid);
    expect(grid.state.search).toBe('pay');
  });

  it('switching data source or view resets view, filters and tabs', async () => {
    const { ex } = await setup();
    ex.addFilter({ key: 'k8s_namespace_name', op: '=', value: 'prod' });
    ex.setLevels(['error']);
    ex.showLogs();
    ex.setTab('patterns');
    ex.setView(COL_VIEW);
    expect(fetchViews).toHaveBeenCalledTimes(1);
    ex.setView(MSG_VIEW);
    expect(ex.state).toMatchObject({ view: MSG_VIEW, page: 'selection', tab: 'logs', levels: [] });
    expect(ex.getLabelFilters()).toEqual([]);
    expect(getLastSelection()).toEqual({ ds: 'ds1', view: MSG_VIEW });
    await flush();

    ex.addLabelTab('k8s_namespace_name');
    ex.setDatasource('ds1');
    expect(fetchViews).toHaveBeenCalledTimes(1);
    ex.setDatasource('ds2');
    expect(ex.state).toMatchObject({ datasource: 'ds2', labelTabs: [], primaryLabel: undefined });
    await flush();
    expect(fetchViews.mock.calls[1][1]).toBe('ds2');
    // last view of ds1 is not carried to ds2: ds2's first view
    expect(ex.state.view).toBe(COL_VIEW);
  });
});

describe('level plan (how volumes get their level)', () => {
  it('a level column: exact levels everywhere, no sampling', async () => {
    const { ex } = await setup({}, 'now-24h');
    expect(ex.levelPlan(true)).toEqual({ withLevel: true });
    expect(ex.levelPlan(false)).toEqual({ withLevel: true });
  });

  it('level from the message: plain grid unless asked; levels sampled 1 in 10 above an hour', async () => {
    const { ex, setRange } = await setup({ datasource: 'ds1', view: MSG_VIEW });
    expect(ex.levelPlan(true)).toEqual({ withLevel: false });
    expect(ex.levelPlan(false)).toEqual({ withLevel: true, sample: undefined });
    let grid = ex.state.body as ServiceSelectionScene;
    expect(grid.state).toMatchObject({ withLevel: false, levelFromMessage: true });

    ex.setGridLevels(true);
    expect(ex.levelPlan(true)).toEqual({ withLevel: true, sample: undefined });
    await setRange('now-6h');
    expect(ex.levelPlan(true)).toEqual({ withLevel: true, sample: 10 });
    expect(ex.levelPlan(false)).toEqual({ withLevel: true, sample: 10 });
    grid = ex.state.body as ServiceSelectionScene;
    expect(grid.state).toMatchObject({ withLevel: true, sample: 10 });
  });
});

describe('long-range guard (text scans over more than maxScanHours)', () => {
  it('patterns over 24 h wait for the user; "Run anyway" lets this range through', async () => {
    const { ex } = await setup({ datasource: 'ds1', view: MSG_VIEW }, 'now-24h');
    ex.showLogs();
    ex.setTab('patterns');
    const body = ex.state.body as SceneReactObject;
    expect(body).toBeInstanceOf(SceneReactObject);
    expect(body.state.component).toBe(ScanGuard);
    const props = body.state.props as { hours: number; max: number; reason: string; onRun: () => void };
    expect(props.hours).toBe(24);
    expect(props.max).toBe(6);
    expect(props.reason).toMatch(/patterns/);
    props.onRun();
    expect(ex.state.body).toBeInstanceOf(PatternsTabScene);
    expect(ex.state.scanAllowedFor).toBe('now-24h|now');
  });

  it('"Use the last 6 hours" shrinks the range and the guard goes away', async () => {
    const { ex, scene } = await setup({ datasource: 'ds1', view: MSG_VIEW }, 'now-24h');
    ex.showLogs();
    ex.setTab('patterns');
    const props = (ex.state.body as SceneReactObject).state.props as { onShrink: () => void };
    props.onShrink();
    await flush();
    expect(scene.state.$timeRange!.state.from).toBe('now-6h');
    expect(ex.state.body).toBeInstanceOf(PatternsTabScene);
  });

  it('the Logs tab is never blocked: only its volume chart is deferred for a text search', async () => {
    const { ex } = await setup({ datasource: 'ds1', view: COL_VIEW }, 'now-24h');
    ex.showLogs();
    expect((ex.state.body as LogsTabScene).state.volumeDeferred).toBe(false);
    ex.addLineFilter({ op: 'include', value: 'timed out', caseSensitive: false, regex: false });
    expect((ex.state.body as LogsTabScene).state.volumeDeferred).toBe(true);
  });

  it('a breakdown on a column is fine over 24 h; a field inside the message is guarded', async () => {
    const { ex } = await setup({ datasource: 'ds1', view: COL_VIEW }, 'now-24h');
    ex.showLogs();
    ex.setTab('fields');
    expect(ex.state.body).toBeInstanceOf(BreakdownScene);
    ex.setBreakdown('msg:status');
    const props = (ex.state.body as SceneReactObject).state.props as { reason: string };
    expect(props.reason).toMatch(/field inside the message/);
  });

  it('a time change rebuilds the body only when the guard or the sampling changes', async () => {
    const { ex, setRange } = await setup({ datasource: 'ds1', view: MSG_VIEW }, 'now-1h');
    ex.showLogs();
    ex.setTab('patterns');
    const first = ex.state.body;
    await setRange('now-30m');
    expect(ex.state.body).toBe(first);
    await setRange('now-12h');
    expect((ex.state.body as SceneReactObject).state.component).toBe(ScanGuard);
  });
});
