import { Fragment, ReactElement } from 'react';
import { of } from 'rxjs';

import { createDataFrame, DataFrame, FieldType, LoadingState, PanelData } from '@grafana/data';
import { SceneCSSGridLayout, SceneQueryRunner, VizPanel } from '@grafana/scenes';
import { LogsSortOrder } from '@grafana/schema';

import { DETECTED_LEVEL, LEVEL_COLORS, LEVELS, RUNTIME_DS } from '../constants';
import { setAppConfig } from '../config/config';
import { setSessionZone } from '../datasource/api';
import { getFavorites } from '../state/storage';
import { emptySpec } from '../state/types';
import { ExplorationApi } from './api';
import { BreakdownScene, MessageFieldsScene } from './BreakdownScene';
import { formatSpan, JsonLogsScene, LogsTabScene, rowsOf } from './LogsTabScene';
import { barsPanel, logsPanel, queryRunner, staticData, tablePanel } from './panels';
import { PatternsTabScene } from './PatternsTabScene';
import { ServiceSelectionScene } from './ServiceSelectionScene';
import { COL_VIEW, ctxFor, flush, mountExploration, MSG_VIEW } from './testScene';

const listDatasources = jest.fn();
const fetchViews = jest.fn();
const runLogsQuery = jest.fn();

jest.mock('../datasource/api', () => ({
  ...jest.requireActual('../datasource/api'),
  listDatasources: () => listDatasources(),
  fetchViews: (...a: unknown[]) => fetchViews(...a),
}));
jest.mock('../datasource/StarRocksLogsDataSource', () => ({
  ...jest.requireActual('../datasource/StarRocksLogsDataSource'),
  buildContext: async (view: string) => ctxFor(view),
  runLogsQuery: (...a: unknown[]) => runLogsQuery(...a),
}));
jest.mock('../datasource/oldest', () => ({ fetchOldestLog: async () => undefined }));

// scenes are activated as on screen, but their query runners do not query (the data is set by each test)
// runWithTimeRange is private in the typings; it is where every query of a runner starts
jest
  .spyOn(SceneQueryRunner.prototype as unknown as { runWithTimeRange: () => Promise<void> }, 'runWithTimeRange')
  .mockImplementation(async () => undefined);

beforeEach(() => {
  localStorage.clear();
  setAppConfig({});
  listDatasources.mockReturnValue([{ uid: 'ds1', name: 'logs1' }]);
  fetchViews.mockResolvedValue([COL_VIEW, MSG_VIEW]);
  runLogsQuery.mockReset().mockReturnValue(of({ data: [] }));
});

const T0 = 1_700_000_000_000;

function done(series: DataFrame[]): PanelData {
  const { timeRange } = staticData([], { from: 0, to: 0 } as never).state.data!;
  return { state: LoadingState.Done, series, timeRange };
}

function volumeFrame(meta: Record<string, unknown>, name = 'info'): DataFrame {
  return createDataFrame({
    name,
    fields: [
      { name: 'time', type: FieldType.time, values: [T0] },
      { name, type: FieldType.number, values: [Number(meta.total ?? 1)] },
    ],
    meta: { custom: meta },
  });
}

function linesFrame(lines: string[], meta?: Record<string, unknown>): DataFrame {
  return createDataFrame({
    fields: [
      { name: 'timestamp', type: FieldType.time, values: lines.map((_, i) => T0 + i) },
      { name: 'body', type: FieldType.string, values: lines },
      { name: 'severity', type: FieldType.string, values: lines.map(() => 'info') },
      { name: 'labels', type: FieldType.other, values: lines.map(() => ({ k8s_service_name: 'a' })) },
    ],
    meta: meta ? { custom: meta } : undefined,
  });
}

/** The header buttons of a panel (a fragment or a single button), as React elements. */
function buttons(panel: VizPanel): ReactElement[] {
  const actions = panel.state.headerActions as ReactElement;
  if (actions.type !== Fragment) {
    return [actions];
  }
  return ([] as ReactElement[]).concat((actions.props as { children: ReactElement | ReactElement[] }).children);
}
const legendOf = (p: VizPanel) => (p.state.options as { legend?: unknown }).legend;
const click = (el: ReactElement) => (el.props as { onClick: () => void }).onClick();

describe('panels', () => {
  it('queryRunner: the app data source on the runner and on the query (show context resolves it per query)', () => {
    const r = queryRunner('volume', emptySpec('v', 'ds1'), { withLevel: true }, 'B');
    expect(r.state.datasource).toEqual(RUNTIME_DS);
    expect(r.state.queries[0]).toEqual({
      refId: 'B',
      kind: 'volume',
      spec: emptySpec('v', 'ds1'),
      params: { withLevel: true },
      datasource: RUNTIME_DS,
    });
  });

  it('barsPanel: stacked bars coloured by level; legend as a list, hidden, or a table with totals', () => {
    const p = barsPanel('Log volume', staticData([], done([]).timeRange), { description: '3 lines' });
    expect(p.state.title).toBe('Log volume');
    expect(p.state.description).toBe('3 lines');
    expect(p.state.fieldConfig.defaults.custom).toMatchObject({ drawStyle: 'bars', fillOpacity: 100 });
    const colours = Object.fromEntries(
      p.state.fieldConfig.overrides.map((o) => [o.matcher.options, o.properties[0].value.fixedColor])
    );
    for (const level of [...LEVELS, 'all' as const]) {
      expect(colours[level]).toBe(LEVEL_COLORS[level]);
    }
    expect(legendOf(p)).toMatchObject({ showLegend: true, displayMode: 'list', placement: 'bottom' });
    expect(legendOf(barsPanel('x', undefined, { legend: false }))).toMatchObject({ showLegend: false });
    expect(legendOf(barsPanel('x', undefined, { legendTable: true }))).toMatchObject({
      displayMode: 'table',
      placement: 'right',
      calcs: ['sum'],
    });
  });

  it('logsPanel: filter buttons on detected_level set levels, on labels add label filters; selected text adds line filters', async () => {
    const api = {
      setLevels: jest.fn(),
      addFilter: jest.fn(),
      addLineFilter: jest.fn(),
      hasFilter: jest.fn().mockReturnValue(true),
      getSpec: () => ({ ...emptySpec('v'), levels: ['error'] }),
    } as unknown as ExplorationApi;
    const p = logsPanel(api, queryRunner('logs', emptySpec('v')), { sort: 'asc', wrap: true, title: 'Logs' });
    const o = p.state.options as Record<string, (...a: string[]) => unknown>;
    expect(p.state.pluginId).toBe('logs');
    expect(p.state.options).toMatchObject({
      sortOrder: LogsSortOrder.Ascending,
      wrapLogMessage: true,
      showLogContextToggle: true,
      enableInfiniteScrolling: true,
    });
    o.onClickFilterLabel(DETECTED_LEVEL, 'error');
    expect(api.setLevels).toHaveBeenLastCalledWith(['error']);
    o.onClickFilterOutLabel(DETECTED_LEVEL, 'error');
    expect(api.setLevels).toHaveBeenLastCalledWith(['warn', 'info', 'debug', 'unknown']);
    o.onClickFilterLabel('k8s_pod_name', 'p1');
    expect(api.addFilter).toHaveBeenLastCalledWith({ key: 'k8s_pod_name', op: '=', value: 'p1' });
    o.onClickFilterOutLabel('k8s_pod_name', 'p1');
    expect(api.addFilter).toHaveBeenLastCalledWith({ key: 'k8s_pod_name', op: '!=', value: 'p1' });
    await expect(o.isFilterLabelActive(DETECTED_LEVEL, 'error')).resolves.toBe(true);
    await expect(o.isFilterLabelActive(DETECTED_LEVEL, 'warn')).resolves.toBe(false);
    await expect(o.isFilterLabelActive('k8s_pod_name', 'p1')).resolves.toBe(true);
    o.onClickFilterString('timed out');
    expect(api.addLineFilter).toHaveBeenLastCalledWith({
      op: 'include',
      value: 'timed out',
      caseSensitive: true,
      regex: false,
    });
    o.onClickFilterOutString('timed out');
    expect(api.addLineFilter).toHaveBeenLastCalledWith(expect.objectContaining({ op: 'exclude' }));
    expect(
      logsPanel(api, queryRunner('logs', emptySpec('v')), { sort: 'desc', wrap: false }).state.options
    ).toMatchObject({
      sortOrder: LogsSortOrder.Descending,
    });
  });

  it('tablePanel: a table over the runner', () => {
    expect(tablePanel(queryRunner('table', emptySpec('v'))).state.pluginId).toBe('table');
  });
});

describe('service grid', () => {
  async function grid(values: Array<[string, number]>) {
    const { ex } = await mountExploration();
    const g = ex.state.body as ServiceSelectionScene;
    g.activate();
    g.state.$data.setState({ data: done(values.map(([value, total]) => volumeFrame({ value, total }))) });
    await flush();
    return { ex, g };
  }

  it('runs the per-value volume query with the plan of the exploration', async () => {
    const { ex } = await mountExploration({ datasource: 'ds1', view: MSG_VIEW });
    const q = (ex.state.body as ServiceSelectionScene).state.$data.state.queries[0];
    expect(q).toMatchObject({ kind: 'serviceVolume', params: { label: 'k8s_service_name', withLevel: false } });
  });

  it('rows by volume (ties by name), favourites first; one bars panel per visible row', async () => {
    localStorage.clear();
    const { g } = await grid([
      ['b', 10],
      ['a', 10],
      ['c', 99],
      ['', 5],
    ]);
    expect(g.state.values!.map((v) => v.value)).toEqual(['c', 'a', 'b', '']);
    expect(g.state.panels.map((p) => p.state.title)).toEqual(['c', 'a', 'b', '(empty)']);
    expect(g.state.panels[0].state.description).toBe('99 lines');

    g.toggleFavorite('b');
    expect(getFavorites('ds1', COL_VIEW, 'k8s_service_name')).toEqual(['b']);
    // starring does not move rows; the next load puts favourites first
    expect(g.state.values!.map((v) => v.value)).toEqual(['c', 'a', 'b', '']);
    g.state.$data.setState({
      data: done([volumeFrame({ value: 'c', total: 99 }), volumeFrame({ value: 'b', total: 1 })]),
    });
    expect(g.state.values!.map((v) => v.value)).toEqual(['b', 'c']);
  });

  it('sums the level series of a value; ignores data that is still loading', async () => {
    const { g } = await grid([
      ['a', 3],
      ['a', 4],
    ]);
    expect(g.state.values).toEqual([{ value: 'a', total: 7 }]);
    g.state.$data.setState({ data: { ...done([]), state: LoadingState.Loading } });
    expect(g.state.values).toEqual([{ value: 'a', total: 7 }]);
  });

  it('search narrows the rows and goes back to page 1; pages of 20', async () => {
    const values = Array.from({ length: 25 }, (_, i): [string, number] => [
      `svc-${String(i).padStart(2, '0')}`,
      100 - i,
    ]);
    const { g } = await grid(values);
    expect(g.state.panels).toHaveLength(20);
    g.setPage(1);
    expect(g.state.panels.map((p) => p.state.title)).toEqual(['svc-20', 'svc-21', 'svc-22', 'svc-23', 'svc-24']);
    g.setSearch('SVC-1');
    expect(g.state.page).toBe(0);
    expect(g.filtered()).toHaveLength(10);
    expect(g.visible()).toHaveLength(10);
    const panels = g.state.panels;
    g.setSearch('SVC-1');
    expect(g.state.panels).toBe(panels);
    g.setPage(0, 50);
    g.setSearch('');
    expect(g.state.panels).toHaveLength(25);
  });

  it('newest lines of the visible rows in one query, keyed by value; an error is shown instead', async () => {
    runLogsQuery.mockReturnValue(of({ data: [linesFrame(['x'], { value: 'a' }), linesFrame(['y'], { value: 'b' })] }));
    const { g } = await grid([
      ['a', 2],
      ['b', 1],
    ]);
    const [query, , requestId] = runLogsQuery.mock.calls[runLogsQuery.mock.calls.length - 1];
    expect(query).toMatchObject({
      kind: 'serviceSamples',
      params: { label: 'k8s_service_name', values: ['a', 'b'], perValue: 10 },
    });
    expect(requestId).toBe('service-samples');
    expect(Object.keys(g.state.samples)).toEqual(['a', 'b']);
    expect(g.state.samplesLoading).toBe(false);

    runLogsQuery.mockReturnValue(of({ data: [], errors: [{ message: 'Query timed out after 120 s' }] }));
    g.setPage(0);
    expect(g.state.samplesError).toBe('Query timed out after 120 s');
    g.setSearch('nothing matches');
    expect(g.state.samples).toEqual({});
  });
});

describe('Logs tab', () => {
  async function logsTab(state = {}, from = 'now-1h', view = COL_VIEW) {
    const m = await mountExploration({ datasource: 'ds1', view, page: 'details', ...state }, from);
    m.ex.rebuild();
    const tab = m.ex.state.body as LogsTabScene;
    tab.activate();
    return { ...m, tab };
  }

  it('volume chart and Grafana Logs panel; the lines query uses the display options', async () => {
    const { tab } = await logsTab({ sort: 'asc', limit: 200 });
    expect(tab.state.volume?.state.title).toBe('Log volume');
    expect(tab.getVolumeRunner()?.state.queries[0]).toMatchObject({ kind: 'volume', params: { withLevel: true } });
    expect((tab.state.main as VizPanel).state.pluginId).toBe('logs');
    expect(tab.getLinesRunner()?.state.queries[0]).toMatchObject({ kind: 'logs', params: { limit: 200, sort: 'asc' } });
  });

  it('level from the message over more than an hour: the title says the volume is estimated', async () => {
    const { tab } = await logsTab({}, 'now-6h', MSG_VIEW);
    expect(tab.state.volume?.state.title).toBe('Log volume (≈ estimated from 1 in 10 lines)');
    expect(tab.state.volume?.state.description).toMatch(/hash sample/);
    expect(tab.getVolumeRunner()?.state.queries[0]).toMatchObject({ params: { withLevel: true, sample: 10 } });
  });

  it('a deferred volume has no chart; Table and JSON displays', async () => {
    const deferredTab = new LogsTabScene({
      spec: emptySpec(COL_VIEW, 'ds1'),
      withLevel: true,
      volumeDeferred: true,
      display: 'table',
      sort: 'desc',
      limit: 100,
      wrap: false,
    });
    const { ex } = await mountExploration();
    ex.setState({ body: deferredTab });
    deferredTab.activate();
    expect(deferredTab.state.volume).toBeUndefined();
    expect(deferredTab.getVolumeRunner()).toBeUndefined();
    expect((deferredTab.state.main as VizPanel).state.pluginId).toBe('table');
    expect(deferredTab.getLinesRunner()?.state.queries[0]).toMatchObject({ kind: 'table' });

    const json = await logsTab({ display: 'json' });
    expect(json.tab.state.main).toBeInstanceOf(JsonLogsScene);
  });

  it('Explore link: the same SQL as the table, with the view hint, in the selected data source', async () => {
    setSessionZone('ds1', COL_VIEW, '+00:00');
    const { tab } = await logsTab({ limit: 100 });
    const url = new URL(tab.exploreUrl()!, 'http://grafana');
    expect(url.pathname).toBe('/explore');
    const panes = JSON.parse(url.searchParams.get('panes')!);
    const q = panes.a.queries[0];
    expect(panes.a.datasource).toBe('ds1');
    expect(q.datasource).toEqual({ type: 'kotak-starrocks-datasource', uid: 'ds1' });
    expect(q.rawSql).toMatch(/^SELECT \/\*\+ SET_VAR\(time_zone = '\+00:00', query_timeout = 120\) \*\//);
    expect(q.rawSql).toContain('FROM `vw_eks_app_logs_app_04000_payments`');
    expect(q.rawSql).toContain('LIMIT 100');
    expect(panes.a.range).toEqual({ from: 'now-1h', to: 'now' });
  });

  it('formatSpan: minutes, hours, both', () => {
    expect(formatSpan(5 * 60_000)).toBe('5 min');
    expect(formatSpan(2 * 3_600_000)).toBe('2 h');
    expect(formatSpan(90 * 60_000)).toBe('1 h 30 min');
  });

  it('JSON rows: JSON messages stay objects, logfmt messages get their fields, plain text stays text', () => {
    const rows = rowsOf(linesFrame(['{"msg":"boom","code":5}', 'level=error status=500 path=/x', 'plain', '{broken']));
    expect(rows[0]).toMatchObject({
      level: 'info',
      labels: { k8s_service_name: 'a' },
      message: { msg: 'boom', code: 5 },
    });
    expect(rows[0]).not.toHaveProperty('fields');
    expect(rows[1].fields).toMatchObject({ level: 'error', status: '500', path: '/x' });
    expect(rows[2]).toMatchObject({ message: 'plain' });
    expect(rows[2]).not.toHaveProperty('fields');
    expect(rows[3].message).toBe('{broken');
    expect(rows[0].timestamp).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.000$/);
    expect(rowsOf(undefined)).toEqual([]);
  });
});

describe('Labels and Fields tabs (breakdowns)', () => {
  async function tab(t: 'labels' | 'fields', view = COL_VIEW) {
    const m = await mountExploration({ datasource: 'ds1', view, page: 'details', tab: t });
    m.ex.rebuild();
    return m;
  }

  it('overview: one GROUPING SETS query for all columns; columns with more than one value first; Select opens a column', async () => {
    const { ex } = await tab('labels');
    const b = ex.state.body as BreakdownScene;
    expect(b.state.$data?.state.queries[0]).toMatchObject({
      kind: 'labelOverview',
      params: { labels: ['k8s_service_name', 'k8s_namespace_name'], topN: 5 },
    });
    b.activate();
    b.state.$data!.setState({
      data: done([
        volumeFrame({ label: 'k8s_service_name', cardinality: 1 }),
        volumeFrame({ label: 'k8s_namespace_name', cardinality: 4 }),
      ]),
    });
    const panels = (b.state.grid as SceneCSSGridLayout).state.children as VizPanel[];
    expect(panels.map((p) => p.state.title)).toEqual(['k8s_namespace_name', 'k8s_service_name']);
    expect(panels[0].state.description).toBe('4 distinct values; top 5 shown');
    click(buttons(panels[0])[0]);
    expect(ex.state.breakdown).toBe('k8s_namespace_name');
  });

  it('one column: a panel per value; Include and Exclude add label filters', async () => {
    const { ex } = await tab('labels');
    ex.setBreakdown('k8s_namespace_name');
    const b = ex.state.body as BreakdownScene;
    expect(b.state.$data?.state.queries[0]).toMatchObject({
      kind: 'valueBreakdown',
      params: { label: 'k8s_namespace_name', topN: 30 },
    });
    b.activate();
    b.state.$data!.setState({ data: done([volumeFrame({ value: 'prod', total: 1200 })]) });
    const [panel] = (b.state.grid as SceneCSSGridLayout).state.children as VizPanel[];
    expect(panel.state.title).toBe('prod');
    expect(panel.state.description).toBe('1,200 lines');
    const [include, exclude] = buttons(panel);
    click(include);
    expect(ex.getLabelFilters()).toEqual([{ key: 'k8s_namespace_name', op: '=', value: 'prod' }]);
    click(exclude);
    expect(ex.getLabelFilters()).toEqual([{ key: 'k8s_namespace_name', op: '!=', value: 'prod' }]);
  });

  it('a field inside the message: the field query; Include adds a message field filter', async () => {
    const { ex } = await tab('fields');
    ex.setBreakdown('msg:status');
    const b = ex.state.body as BreakdownScene;
    expect(b.state.$data?.state.queries[0]).toMatchObject({
      kind: 'fieldBreakdown',
      params: { field: 'status', topN: 30 },
    });
    b.activate();
    b.state.$data!.setState({ data: done([volumeFrame({ value: '500', total: 3 })]) });
    const [panel] = (b.state.grid as SceneCSSGridLayout).state.children as VizPanel[];
    click(buttons(panel)[0]);
    expect(ex.state.fieldFilters).toEqual([{ key: 'status', op: '=', value: '500' }]);
  });

  it('Fields overview also lists key=value fields found in a sample of lines', async () => {
    runLogsQuery.mockReturnValue(of({ data: [linesFrame(['status=500 path=/a', 'status=200 path=/b', 'no fields'])] }));
    const { ex } = await tab('fields');
    const fields = (ex.state.body as BreakdownScene).state.messageFields as MessageFieldsScene;
    expect(fields).toBeInstanceOf(MessageFieldsScene);
    fields.activate();
    const [query, , requestId] = runLogsQuery.mock.calls[0];
    expect(query).toMatchObject({ kind: 'logs', params: { limit: 1000 } });
    expect(requestId).toBe('fields-sample');
    expect(fields.state.sampleSize).toBe(3);
    expect(fields.state.stats?.map((s) => s.key).sort()).toEqual(['path', 'status']);

    runLogsQuery.mockReturnValue(of({ data: [], error: { message: 'denied' } }));
    const again = new MessageFieldsScene({ spec: emptySpec(COL_VIEW) });
    ex.setState({ body: again });
    again.activate();
    expect(again.state.error).toBe('denied');
  });

  it('no columns: no query', () => {
    expect(new BreakdownScene({ spec: emptySpec('v'), mode: 'labels', columns: [] }).state.$data).toBeUndefined();
  });
});

describe('Patterns tab', () => {
  it('a tenant with patterns: one counting query and a chart; none: neither', async () => {
    const { ex } = await mountExploration({ datasource: 'ds1', view: MSG_VIEW, page: 'details', tab: 'patterns' });
    ex.rebuild();
    const p = ex.state.body as PatternsTabScene;
    expect(p.state.$data?.state.queries[0]).toMatchObject({ kind: 'patterns' });
    expect(p.state.chart?.state.title).toBe('Pattern volume');
    const none = new PatternsTabScene({ spec: emptySpec('v'), patterns: [], tenantKey: 'x' });
    expect(none.state.$data).toBeUndefined();
    expect(none.state.chart).toBeUndefined();
  });

  it('Suggest patterns groups a sample of lines without the pattern filters; an error is shown', async () => {
    const lines = [
      ...Array.from({ length: 6 }, (_, i) => `upstream timed out after ${i}ms on 10.0.0.${i}`),
      ...Array.from({ length: 3 }, (_, i) => `user ${i} logged in`),
    ];
    runLogsQuery.mockReturnValue(of({ data: [linesFrame(lines)] }));
    const { ex } = await mountExploration({ datasource: 'ds1', view: MSG_VIEW, page: 'details', tab: 'patterns' });
    ex.togglePatternFilter('Timeout', 'exclude');
    const p = ex.state.body as PatternsTabScene;
    p.activate();
    p.suggest();
    const [query, , requestId] = runLogsQuery.mock.calls[0];
    expect(query).toMatchObject({ kind: 'logs', params: { limit: 2000 } });
    expect(query.spec.patternFilters).toEqual([]);
    expect(requestId).toBe('patterns-suggest');
    expect(p.state.suggesting).toBe(false);
    expect(p.state.suggestions?.[0]).toMatchObject({ count: 6 });
    expect(p.state.suggestions).toHaveLength(2);

    runLogsQuery.mockReturnValue(of({ data: [], errors: [{ message: 'timeout' }] }));
    p.suggest();
    expect(p.state.suggestError).toBe('timeout');
  });
});
