import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { of } from 'rxjs';

import { createDataFrame, FieldType, LoadingState, PanelData, PluginType, rangeUtil } from '@grafana/data';
import { setPluginImportUtils } from '@grafana/runtime';
import { behaviors, EmbeddedScene, SceneQueryRunner, SceneReactObject } from '@grafana/scenes';

import { setAppConfig } from '../config/config';
import { AppConfig } from './AppConfig';
import { CappedTimeRange } from './CappedTimeRange';
import { LogsExploration, LogsExplorationState } from './LogsExploration';
import { BreakdownScene } from './BreakdownScene';
import { LogsTabScene } from './LogsTabScene';
import { PatternsTabScene } from './PatternsTabScene';
import { RowActions, ServiceSelectionScene } from './ServiceSelectionScene';
import { COL_VIEW, ctxFor, flush, MSG_VIEW } from './testScene';

const fetchOldestLog = jest.fn();
const fetchViews = jest.fn();
const listDatasources = jest.fn();
const post = jest.fn();
const runLogsQuery = jest.fn();

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getBackendSrv: () => ({ post: (...a: unknown[]) => post(...a) }),
}));
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
jest.mock('../datasource/oldest', () => ({ fetchOldestLog: (...a: unknown[]) => fetchOldestLog(...a) }));

// whole pages render here (Grafana UI, emotion): the first render is slow on a loaded machine
jest.setTimeout(20_000);

// panels never load their plugin here (their content is Grafana's); queries are set by the tests
setPluginImportUtils({
  importPanelPlugin: () => new Promise(() => undefined),
  getPanelPluginFromCache: () => undefined,
});
// runWithTimeRange is private in the typings; it is where every query of a runner starts
jest
  .spyOn(SceneQueryRunner.prototype as unknown as { runWithTimeRange: () => Promise<void> }, 'runWithTimeRange')
  .mockImplementation(async () => undefined);

// 14 Nov 2023 22:13:20 UTC
const OLDEST = 1_700_000_000_000;

beforeEach(() => {
  localStorage.clear();
  setAppConfig({});
  listDatasources.mockReturnValue([
    { uid: 'ds1', name: 'logs1' },
    { uid: 'ds2', name: 'logs2' },
  ]);
  fetchViews.mockResolvedValue([COL_VIEW, MSG_VIEW]);
  fetchOldestLog.mockReset().mockResolvedValue(OLDEST);
  runLogsQuery.mockReset().mockReturnValue(of({ data: [] }));
});

/** The page as the app shows it: time range (UTC here), query controller, the exploration. */
async function page(state: Partial<LogsExplorationState> = {}, from = 'now-1h', to = 'now', keepBody = false) {
  const ex = new LogsExploration(state);
  const controller = new behaviors.SceneQueryController();
  const timeRange = new CappedTimeRange({ from, to, timeZone: 'utc' });
  const scene = new EmbeddedScene({ $timeRange: timeRange, $behaviors: [controller], body: ex });
  scene.activate();
  ex.activate();
  await flush();
  if (!keepBody) {
    ex.setState({ body: new SceneReactObject({ reactNode: <div data-testid="body">body</div> }) });
  }
  const view = render(<ex.Component model={ex} />);
  await act(flush);
  return { ex, controller, timeRange, view };
}

describe('page header and page bar', () => {
  it('data source and view pickers; "Show logs" opens the logs and "Back" returns, the pickers stay in row 1', async () => {
    const { ex } = await page();
    expect(screen.getByTestId('datasource-picker').textContent).toBe('logs1');
    expect(screen.getByTestId('view-picker').textContent).toBe(COL_VIEW);
    expect(screen.getByText('Last 1 hour')).toBeInTheDocument();

    const bar = screen.getByTestId('page-bar');
    expect(within(bar).getByTestId('show-logs').textContent).toBe('Show logs');
    act(() => ex.addFilter({ key: 'k8s_namespace_name', op: '=', value: 'prod' }));
    expect(within(bar).getByTestId('show-logs').textContent).toBe('Show logs of the current filters');
    fireEvent.click(screen.getByTestId('show-logs'));
    expect(ex.state.page).toBe('details');
    ex.setState({ body: new SceneReactObject({ reactNode: <div /> }) });
    await act(flush);
    expect(screen.getByTestId('back-to-services').textContent).toBe('Back to service values');
    expect(screen.getByTestId('datasource-picker')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('back-to-services'));
    expect(ex.state.page).toBe('selection');
  });

  it('Oldest log on the right of the page bar, in the time zone of the page; "…" while looking, hidden on error', async () => {
    const { ex } = await page();
    const oldest = within(screen.getByTestId('page-bar')).getByTestId('oldest-log');
    expect(oldest.textContent).toBe('Oldest log 14 Nov 2023 22:13');
    act(() => ex.setState({ oldest: { key: 'x', loading: true } }));
    expect(screen.getByTestId('oldest-log').textContent).toBe('Oldest log …');
    act(() => ex.setState({ oldest: { key: 'x', ms: null } }));
    expect(screen.getByTestId('oldest-log').textContent).toBe('Oldest log no lines');
    act(() => ex.setState({ oldest: { key: 'x', error: 'timeout' } }));
    expect(screen.queryByTestId('oldest-log')).toBeNull();
  });

  it('"Loading … Cancel" while queries run; Cancel stops all of them', async () => {
    const { controller } = await page();
    expect(screen.queryByTestId('running-indicator')).toBeNull();
    const cancelAll = jest.spyOn(controller, 'cancelAll');
    act(() => controller.setState({ isRunning: true }));
    const running = within(screen.getByTestId('page-bar')).getByTestId('running-indicator');
    expect(running.textContent).toContain('Loading');
    fireEvent.click(screen.getByTestId('cancel-queries'));
    expect(cancelAll).toHaveBeenCalled();
    act(() => controller.setState({ isRunning: false }));
    expect(screen.queryByTestId('running-indicator')).toBeNull();
  });

  it('a range over 24 h is cut and says so under the header; Dismiss, or it goes after 20 s', async () => {
    const { timeRange } = await page();
    act(() => timeRange.onTimeRangeChange(rangeUtil.convertRawToRange({ from: 'now-7d', to: 'now' })));
    expect(timeRange.state.from).toBe('now-24h');
    const notice = within(screen.getByTestId('page-bar')).getByTestId('range-capped');
    expect(notice.textContent).toContain('Time range limited to 24 hours');
    fireEvent.click(within(notice).getByLabelText('Dismiss'));
    expect(screen.queryByTestId('range-capped')).toBeNull();

    jest.useFakeTimers();
    act(() => timeRange.onTimeRangeChange(rangeUtil.convertRawToRange({ from: 'now-2d', to: 'now' })));
    expect(screen.getByTestId('range-capped')).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(20_000);
    });
    expect(screen.queryByTestId('range-capped')).toBeNull();
    jest.useRealTimers();
  });

  it('a range before the oldest line: a notice that jumps to the first 24 hours of logs', async () => {
    const { timeRange } = await page({}, '2023-01-01T00:00:00Z', '2023-01-02T00:00:00Z');
    const notice = screen.getByTestId('before-oldest');
    expect(notice.textContent).toContain(`No logs in this time range: ${COL_VIEW} starts on 14 Nov 2023 22:13`);
    fireEvent.click(within(notice).getByText('Show the first 24 hours of logs'));
    expect(timeRange.state.value.from.valueOf()).toBe(OLDEST);
    expect(timeRange.state.value.to.valueOf()).toBe(OLDEST + 24 * 3_600_000);
    await act(flush);
    expect(screen.queryByTestId('before-oldest')).toBeNull();
  });

  it('configuration problems are listed above the page', async () => {
    setAppConfig({ maxRangeHours: 0 } as never);
    await page();
    expect(screen.getByText('The app configuration has problems; invalid entries are ignored')).toBeInTheDocument();
    expect(screen.getByText(/maxRangeHours must be a number/)).toBeInTheDocument();
  });
});

describe('label tabs and the logs page', () => {
  it('grid: the service tab, "Add label" adds a closable tab', async () => {
    const { ex } = await page();
    expect(screen.getByRole('tab', { name: 'service' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('add-label'));
    fireEvent.click(await screen.findByText('k8s_namespace_name'));
    expect(ex.state.labelTabs).toEqual(['k8s_namespace_name']);
    expect(ex.primaryLabel()).toBe('k8s_namespace_name');
    fireEvent.click(screen.getByLabelText('Remove k8s_namespace_name tab'));
    expect(ex.state.labelTabs).toEqual([]);
    expect(ex.primaryLabel()).toBe('k8s_service_name');
  });

  it('logs page: tabs with counts, level select, line search with Include / Exclude, filter chips', async () => {
    const { ex } = await page({ datasource: 'ds1', view: MSG_VIEW, page: 'details' });
    expect(screen.getByRole('tab', { name: /Labels.*2/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Fields.*1/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Patterns.*1/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Patterns/ }));
    expect(ex.state.tab).toBe('patterns');

    const input = screen.getByTestId('line-filter-input');
    fireEvent.change(input, { target: { value: 'timed out' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(ex.state.lineFilters).toEqual([{ op: 'include', value: 'timed out', caseSensitive: false, regex: false }]);
    fireEvent.click(screen.getByLabelText('Match case'));
    fireEvent.click(screen.getByLabelText('Regex'));
    fireEvent.change(input, { target: { value: 'tim.d' } });
    fireEvent.click(screen.getByTestId('line-exclude'));
    expect(ex.state.lineFilters[1]).toEqual({ op: 'exclude', value: 'tim.d', caseSensitive: true, regex: true });
    fireEvent.click(screen.getByTestId('line-include'));
    expect(ex.state.lineFilters).toHaveLength(2);

    act(() => {
      ex.togglePatternFilter('Timeout', 'exclude');
      ex.addFieldFilter({ key: 'status', op: '=', value: '500' });
    });
    const chips = screen.getAllByTestId(/-chip$/).map((c) => c.textContent);
    expect(chips).toEqual([
      'line contains (any case) "timed out"',
      'line does not contain regex "tim.d"',
      'not pattern "Timeout"',
      'status = 500 (in message)',
    ]);
    while (screen.queryAllByTestId(/-chip$/).length > 0) {
      fireEvent.click(within(screen.getAllByTestId(/-chip$/)[0]).getByLabelText('Remove filter'));
    }
    expect(ex.state.lineFilters.length + ex.state.patternFilters.length + ex.state.fieldFilters.length).toBe(0);

    fireEvent.keyDown(within(screen.getByTestId('log-levels')).getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByText('error'));
    expect(ex.state.levels).toEqual(['error']);
  });
});

describe('service grid', () => {
  function done(values: Array<[string, number]>): PanelData {
    return {
      state: LoadingState.Done,
      series: values.map(([value, total]) =>
        createDataFrame({
          name: 'info',
          fields: [
            { name: 'time', type: FieldType.time, values: [OLDEST] },
            { name: 'info', type: FieldType.number, values: [total] },
          ],
          meta: { custom: { value, total } },
        })
      ),
      timeRange: rangeUtil.convertRawToRange({ from: 'now-1h', to: 'now' }),
    };
  }

  async function grid(view = COL_VIEW) {
    const p = await page({ datasource: 'ds1', view }, 'now-6h', 'now', true);
    return { ...p, g: p.ex.state.body as ServiceSelectionScene };
  }

  it('placeholder rows with a timer while the volumes load; an error box when they fail', async () => {
    const { g } = await grid();
    expect(screen.getByTestId('grid-loading').textContent).toContain('Loading service volumes…');
    act(() =>
      g.state.$data.setState({
        data: { ...done([]), state: LoadingState.Error, errors: [{ message: 'Query timed out after 120 s' }] },
      })
    );
    expect(screen.getByText('Could not load the service volumes')).toBeInTheDocument();
    expect(screen.getByText('Query timed out after 120 s')).toBeInTheDocument();
  });

  it('a row per value with its newest lines; search narrows them; empty ranges say so', async () => {
    const { g } = await grid();
    act(() =>
      g.state.$data.setState({
        data: done([
          ['checkout', 10],
          ['payments', 5],
        ]),
      })
    );
    expect(screen.getByTestId('service-row-checkout')).toBeInTheDocument();
    expect(screen.getByTestId('service-row-payments')).toBeInTheDocument();
    expect(screen.getByText(/of 2/)).toBeInTheDocument();
    act(() => g.setSearch('zzz'));
    expect(screen.getByText('No service values match "zzz".')).toBeInTheDocument();
    act(() => {
      g.setSearch('');
      g.state.$data.setState({ data: done([]) });
    });
    expect(screen.getByText('No logs in the selected time range.')).toBeInTheDocument();
  });

  it('more than a page: pagination above and below the rows', async () => {
    const { g } = await grid();
    act(() =>
      g.state.$data.setState({ data: done(Array.from({ length: 25 }, (_, i): [string, number] => [`s${i}`, 100 - i])) })
    );
    expect(screen.getAllByTestId(/^service-row-/)).toHaveLength(20);
    const pager = screen.getByTestId('grid-pagination');
    fireEvent.click(within(pager).getByText('2'));
    expect(g.state.page).toBe(1);
    expect(screen.getAllByTestId(/^service-row-/)).toHaveLength(5);
  });

  it('level from the message: "Split by level" off by default; on, with the estimate note over an hour', async () => {
    const { ex } = await grid(MSG_VIEW);
    const toggle = screen.getByTestId('grid-levels');
    expect((toggle as HTMLInputElement).checked).toBe(false);
    fireEvent.click(toggle);
    expect(ex.state.gridLevels).toBe(true);
    await act(flush);
    expect(screen.getByText('≈ estimated (1 in 10 lines)')).toBeInTheDocument();
  });

  it('a tenant with a level column has no "Split by level" switch', async () => {
    await grid(COL_VIEW);
    expect(screen.queryByTestId('grid-levels')).toBeNull();
  });

  it('row buttons: favourite, Include / Remove, Show logs', async () => {
    const { ex, g, view } = await grid();
    view.unmount();
    render(<RowActions scene={g} value="checkout" />);
    fireEvent.click(screen.getByTestId('favorite-checkout'));
    expect(g.state.favorites).toEqual(['checkout']);
    fireEvent.click(screen.getByTestId('include-checkout'));
    expect(ex.hasFilter('k8s_service_name', 'checkout')).toBe(true);
    expect(screen.getByTestId('include-checkout').textContent).toBe('Remove');
    fireEvent.click(screen.getByTestId('include-checkout'));
    expect(ex.hasFilter('k8s_service_name', 'checkout')).toBe(false);
    fireEvent.click(screen.getByTestId('show-logs-checkout'));
    expect(ex.state.page).toBe('details');
    expect(ex.getLabelFilters()).toEqual([{ key: 'k8s_service_name', op: '=', value: 'checkout' }]);
  });
});

describe('configuration page', () => {
  const plugin = (jsonData: object) =>
    ({ meta: { id: 'kotak-starrocks-logs-app', type: PluginType.app, jsonData } }) as never;

  it('shows the effective configuration and the problems of the JSON', () => {
    render(<AppConfig plugin={plugin({ maxScanHours: -1 })} query={{}} />);
    expect(screen.getByText('Configuration problems (invalid entries are ignored)')).toBeInTheDocument();
    expect(screen.getByText(/maxScanHours must be a number/)).toBeInTheDocument();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '{ not json' } });
    expect(screen.getByText(/^JSON:/)).toBeInTheDocument();
    expect(screen.getByText('Save').closest('button')).toBeDisabled();
    fireEvent.click(screen.getByText('Load example'));
    expect((textarea as HTMLTextAreaElement).value).toContain('app_1961_observability');
  });

  it('Test: list my views, per data source, with errors', async () => {
    fetchViews.mockImplementation(async (_r: unknown, uid: string) => {
      if (uid === 'ds2') {
        throw new Error('Access denied');
      }
      return [COL_VIEW];
    });
    render(<AppConfig plugin={plugin({})} query={{}} />);
    fireEvent.click(screen.getByText('Test: list my views'));
    expect((await screen.findByTestId('config-views')).textContent).toBe(
      `logs1: ${COL_VIEW}\nlogs2: error: Access denied`
    );
  });

  it('Save posts the settings; a failure is shown', async () => {
    post.mockRejectedValue(new Error('403 Forbidden'));
    render(<AppConfig plugin={plugin({ maxScanHours: 3 })} query={{}} />);
    fireEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('403 Forbidden')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/api/plugins/kotak-starrocks-logs-app/settings', {
      enabled: true,
      pinned: true,
      jsonData: { maxScanHours: 3 },
    });
  });
});

function linesFrame(n: number, search?: object) {
  return createDataFrame({
    fields: [
      { name: 'timestamp', type: FieldType.time, values: Array.from({ length: n }, (_, i) => OLDEST + i) },
      { name: 'body', type: FieldType.string, values: Array.from({ length: n }, (_, i) => `status=500 line ${i}`) },
      { name: 'severity', type: FieldType.string, values: Array.from({ length: n }, () => 'error') },
      { name: 'labels', type: FieldType.other, values: Array.from({ length: n }, () => ({})) },
    ],
    meta: search ? { custom: { search } } : undefined,
  });
}

const HOUR = 3_600_000;

describe('Logs tab', () => {
  async function logs(state: Partial<LogsExplorationState> = {}, from = 'now-1h') {
    const p = await page({ datasource: 'ds1', view: COL_VIEW, page: 'details', ...state }, from, 'now', true);
    return { ...p, tab: p.ex.state.body as LogsTabScene };
  }
  const progress = (o: object) => ({
    searchedFromMs: 5 * HOUR,
    searchedToMs: 6 * HOUR,
    rangeFromMs: 0,
    rangeToMs: 6 * HOUR,
    windows: 1,
    totalWindows: 4,
    lines: 12,
    limit: 1000,
    done: false,
    ...o,
  });

  it('loading badges over the volume and the lines; toolbar changes the display; Explore link', async () => {
    const { ex, tab } = await logs();
    expect(screen.getByTestId('volume-panel')).toBeInTheDocument();
    const badges = () => screen.queryAllByTestId('panel-loading').map((b) => b.textContent?.trim());
    expect(badges()).toEqual(['Loading log volume…', 'Loading lines…']);
    // list first: the volume query starts once the first lines are in (as in the internal UI)
    expect(tab.getVolumeRunner()!.isActive).toBe(false);
    act(() => tab.getLinesRunner()!.setState({ data: { ...done(), state: LoadingState.Loading } }));
    expect(tab.getVolumeRunner()!.isActive).toBe(false);
    act(() => tab.getLinesRunner()!.setState({ data: { ...done(), series: [linesFrame(2)] } }));
    await act(flush);
    expect(tab.state.volumeReady).toBe(true);
    expect(tab.getVolumeRunner()!.isActive).toBe(true);
    expect(badges()).toEqual(['Loading log volume…']);
    act(() => tab.getVolumeRunner()!.setState({ data: { ...done(), state: LoadingState.Done } }));
    expect(badges()).toEqual([]);

    fireEvent.click(screen.getByText('Oldest first'));
    expect(ex.state.sort).toBe('asc');
    expect(screen.getByTestId('open-in-explore').getAttribute('href')).toMatch(/^\/explore\?schemaVersion=1&panes=/);
  });

  it('the Volume switch hides the chart and is remembered', async () => {
    const first = await logs();
    fireEvent.click(screen.getByTestId('toggle-volume'));
    expect(screen.queryByTestId('volume-panel')).toBeNull();
    first.view.unmount();
    await logs();
    expect(screen.queryByTestId('volume-panel')).toBeNull();
    expect((screen.getByTestId('toggle-volume') as HTMLInputElement).checked).toBe(false);
  });

  it('a text search over 24 h: the volume waits for "Load volume"; the lines show the search progress and Stop', async () => {
    const { ex, tab } = await logs(
      { lineFilters: [{ op: 'include', value: 'timed out', caseSensitive: false, regex: false }] },
      'now-24h'
    );
    expect(screen.getByTestId('volume-deferred').textContent).toContain('text search over 24 hours');
    expect(screen.queryByTestId('toggle-volume')).toBeNull();

    const runner = tab.getLinesRunner()!;
    const cancel = jest.spyOn(runner, 'cancelQuery').mockImplementation(() => undefined);
    act(() =>
      runner.setState({ data: { ...done(), state: LoadingState.Streaming, series: [linesFrame(12, progress({}))] } })
    );
    expect(screen.getByTestId('search-status').textContent).toBe(
      'Searching the log text, newest first: 1 h of 6 h searched, 12 lines found.Stop'
    );
    fireEvent.click(screen.getByText('Stop'));
    expect(cancel).toHaveBeenCalled();
    act(() => runner.setState({ data: { ...done(), series: [linesFrame(12, progress({}))] } }));
    expect(screen.getByTestId('search-status').textContent).toBe(
      'Search stopped: 1 h of 6 h searched, 12 lines found.'
    );
    act(() =>
      runner.setState({
        data: { ...done(), series: [linesFrame(3, progress({ done: true, lines: 1000, searchedFromMs: 4.5 * HOUR }))] },
      })
    );
    expect(screen.getByTestId('search-status').textContent).toBe(
      'The newest 1000 matching lines were found in the last 1 h 30 min of the 6 h; scroll to the end of the list to load more.'
    );
    act(() => runner.setState({ data: { ...done(), series: [linesFrame(3, progress({ done: true, lines: 3 }))] } }));
    expect(screen.queryByTestId('search-status')).toBeNull();

    fireEvent.click(screen.getByText('Load volume'));
    expect(ex.state.scanAllowedFor).toBe('now-24h|now');
    await act(flush);
    expect(screen.getByTestId('volume-panel')).toBeInTheDocument();
  });

  it('JSON display: 100 rows at a time; loading and errors', async () => {
    const { tab } = await logs({ display: 'json' });
    const runner = tab.getLinesRunner()!;
    act(() => runner.setState({ data: { ...done(), series: [linesFrame(150)] } }));
    expect(screen.getByTestId('json-view').children).toHaveLength(101);
    fireEvent.click(screen.getByText('Show more (50 left)'));
    expect(screen.getByTestId('json-view').children).toHaveLength(150);
    act(() => runner.setState({ data: { ...done(), series: [linesFrame(0)] } }));
    expect(screen.getByText('No lines')).toBeInTheDocument();
    act(() => runner.setState({ data: { ...done(), state: LoadingState.Error, errors: [{ message: 'denied' }] } }));
    expect(screen.getByText('Query failed')).toBeInTheDocument();
  });
});

describe('Patterns tab', () => {
  function counts(rows: Array<[string, number]>): PanelData {
    return {
      ...done(),
      series: rows.map(([pattern, total]) =>
        createDataFrame({
          name: pattern,
          fields: [
            { name: 'time', type: FieldType.time, values: [OLDEST, OLDEST + HOUR] },
            { name: pattern, type: FieldType.number, values: [total / 2, total / 2] },
          ],
          meta: { custom: { pattern, total } },
        })
      ),
    };
  }

  it('a row per pattern with lines, share, Include / Exclude; "(unmatched)" has no buttons', async () => {
    const { ex } = await page(
      { datasource: 'ds1', view: MSG_VIEW, page: 'details', tab: 'patterns' },
      'now-1h',
      'now',
      true
    );
    const p = ex.state.body as PatternsTabScene;
    act(() =>
      p.state.$data!.setState({
        data: counts([
          ['Timeout', 30],
          ['(unmatched)', 70],
        ]),
      })
    );
    const row = screen.getByTestId('pattern-row-Timeout');
    expect(row.textContent).toContain('LIKE %timed out%');
    expect(row.textContent).toContain('30.0%');
    expect(within(screen.getByTestId('pattern-row-(unmatched)')).queryByText('Include')).toBeNull();
    fireEvent.click(within(row).getByText('Exclude'));
    expect(ex.state.patternFilters).toEqual([{ name: 'Timeout', op: 'exclude' }]);
  });

  it('errors; no configured patterns; suggestions from a sample', async () => {
    const { ex } = await page(
      { datasource: 'ds1', view: MSG_VIEW, page: 'details', tab: 'patterns' },
      'now-1h',
      'now',
      true
    );
    const p = ex.state.body as PatternsTabScene;
    act(() =>
      p.state.$data!.setState({ data: { ...done(), state: LoadingState.Error, errors: [{ message: 'boom' }] } })
    );
    expect(screen.getByText('Pattern query failed')).toBeInTheDocument();

    runLogsQuery.mockReturnValue(of({ data: [linesFrame(5)] }));
    fireEvent.click(screen.getByTestId('suggest-patterns'));
    const suggestions = screen.getByTestId('pattern-suggestions').textContent;
    expect(suggestions).toContain('status=<*> line <*>');
    expect(suggestions).toContain('LIKE %status=% line %');
    expect(screen.getByText('Copy top 10 as config')).toBeInTheDocument();

    act(() => ex.setView(COL_VIEW));
    await act(flush);
    act(() => {
      ex.showLogs();
      ex.setTab('patterns');
    });
    expect(screen.getByText('No patterns configured for app_04000_payments')).toBeInTheDocument();
  });
});

describe('Labels and Fields tabs', () => {
  it('Fields: columns, then key=value fields of the newest lines with + / − and Breakdown', async () => {
    runLogsQuery.mockReturnValue(of({ data: [linesFrame(4)] }));
    const { ex } = await page(
      { datasource: 'ds1', view: COL_VIEW, page: 'details', tab: 'fields' },
      'now-1h',
      'now',
      true
    );
    expect(screen.getByText('Columns')).toBeInTheDocument();
    const table = screen.getByTestId('message-fields');
    expect(table.textContent).toContain('status');
    expect(table.textContent).toContain('100%');
    fireEvent.click(screen.getByLabelText('Include status=500'));
    expect(ex.state.fieldFilters).toEqual([{ key: 'status', op: '=', value: '500' }]);
    await act(flush);
    fireEvent.click(within(screen.getByTestId('message-fields')).getByText('Breakdown'));
    expect(ex.state.breakdown).toBe('msg:status');
    await act(flush);
    expect(screen.getByTestId('breakdown-fields').textContent).toContain('Values of status (top 30 by volume)');
    fireEvent.click(screen.getByText('All fields'));
    expect(ex.state.breakdown).toBeUndefined();
  });

  it('Labels: loading, then an error box when the breakdown fails', async () => {
    const { ex } = await page(
      { datasource: 'ds1', view: COL_VIEW, page: 'details', tab: 'labels' },
      'now-1h',
      'now',
      true
    );
    const b = ex.state.body as BreakdownScene;
    expect(screen.getByTestId('breakdown-labels')).toBeInTheDocument();
    act(() =>
      b.state.$data!.setState({ data: { ...done(), state: LoadingState.Error, errors: [{ message: 'denied' }] } })
    );
    expect(screen.getByText('Breakdown failed')).toBeInTheDocument();
  });
});

function done(): PanelData {
  return {
    state: LoadingState.Done,
    series: [],
    timeRange: rangeUtil.convertRawToRange({ from: 'now-1h', to: 'now' }),
  };
}
