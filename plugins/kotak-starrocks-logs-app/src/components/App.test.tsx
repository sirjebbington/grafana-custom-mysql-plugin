import { render } from '@testing-library/react';

import { AppRootProps } from '@grafana/data';
import { behaviors, EmbeddedScene, SceneApp, SceneAppPage, SceneReactObject } from '@grafana/scenes';

import { EXPLORE_ROUTE, PLUGIN_BASE_URL } from '../constants';
import { getAppConfig } from '../config/config';
import { plugin } from '../module';
import { App } from './App';
import { AppConfig } from './AppConfig';
import { CappedTimeRange } from './CappedTimeRange';
import { LogsExploration } from './LogsExploration';

const registerScenes = jest.fn();
const registerCore = jest.fn();
const replace = jest.fn();
let factory: (() => SceneApp) | undefined;

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getDataSourceSrv: () => ({ registerRuntimeDataSource: (...a: unknown[]) => registerCore(...a) }),
  locationService: { replace: (...a: unknown[]) => replace(...a) },
}));
jest.mock('@grafana/scenes', () => {
  const actual = jest.requireActual('@grafana/scenes');
  return {
    ...actual,
    registerRuntimeDataSource: (...a: unknown[]) => registerScenes(...a),
    // the scene app itself needs Grafana's router; the test inspects what App builds
    useSceneApp: (f: () => SceneApp) => {
      factory = f;
      return { Component: () => null };
    },
  };
});

const props = (jsonData: object) => ({ meta: { jsonData } }) as unknown as AppRootProps;

describe('app wiring', () => {
  it('module: the app root page and the configuration page', () => {
    expect(plugin.root).toBe(App);
    expect(plugin.configPages?.[0]).toMatchObject({ id: 'configuration', title: 'Configuration', body: AppConfig });
  });

  it('App: reads the configuration, registers the data source once in the scenes and the core registry', () => {
    render(<App {...props({ maxRangeHours: 12, defaultTimeRange: 'now-30m' })} />);
    render(<App {...props({ maxRangeHours: 12, defaultTimeRange: 'now-30m' })} />);
    expect(getAppConfig().maxRangeHours).toBe(12);
    expect(registerScenes).toHaveBeenCalledTimes(1);
    expect(registerCore).toHaveBeenCalledTimes(1);
    const ds = registerScenes.mock.calls[0][0].dataSource;
    expect(registerCore.mock.calls[0][0].dataSource).toBe(ds);
  });

  it('explore page: capped time range from the configured default, query controller (refresh spinner, Cancel), the exploration', () => {
    render(<App {...props({ maxRangeHours: 12, defaultTimeRange: 'now-30m' })} />);
    const app = factory!();
    const [explore, fallback] = app.state.pages as SceneAppPage[];
    expect(explore.state).toMatchObject({ url: EXPLORE_ROUTE, routePath: 'explore/*' });
    expect(explore.state.renderTitle?.('x')).toBeNull();
    const scene = explore.state.getScene!(undefined as never) as EmbeddedScene;
    expect(scene.state.$timeRange).toBeInstanceOf(CappedTimeRange);
    expect(scene.state.$timeRange!.state.from).toBe('now-30m');
    expect(scene.state.$behaviors?.[0]).toBeInstanceOf(behaviors.SceneQueryController);
    expect(scene.state.body).toBeInstanceOf(LogsExploration);
    expect(app.state.urlSyncOptions).toEqual({ updateUrlOnInit: true, createBrowserHistorySteps: true });

    // anything else under the app redirects to the explore page
    expect(fallback.state).toMatchObject({ url: PLUGIN_BASE_URL, routePath: '*' });
    const redirect = (fallback.state.getScene!(undefined as never) as EmbeddedScene).state.body as SceneReactObject;
    const Redirect = redirect.state.component!;
    render(<Redirect />);
    expect(replace).toHaveBeenCalledWith(EXPLORE_ROUTE);
  });
});
