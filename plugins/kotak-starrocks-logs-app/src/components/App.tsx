import { useEffect } from 'react';

import { AppRootProps } from '@grafana/data';
import { getDataSourceSrv, locationService } from '@grafana/runtime';
import {
  EmbeddedScene,
  SceneApp,
  SceneAppPage,
  SceneReactObject,
  RuntimeDataSource,
  SceneTimeRange,
  registerRuntimeDataSource,
  useSceneApp,
} from '@grafana/scenes';

import { APP_TITLE, EXPLORE_ROUTE, PLUGIN_BASE_URL } from '../constants';
import { AppJsonData, getAppConfig, setAppConfig } from '../config/config';
import { ensureRuntimeDataSource } from '../datasource/StarRocksLogsDataSource';
import { LogsExploration } from './LogsExploration';

function getExploreScene(): EmbeddedScene {
  return new EmbeddedScene({
    $timeRange: new SceneTimeRange({ from: getAppConfig().defaultTimeRange, to: 'now' }),
    body: new LogsExploration(),
  });
}

function RedirectToExplore() {
  useEffect(() => {
    locationService.replace(EXPLORE_ROUTE);
  }, []);
  return null;
}

// Scenes 6 matches page routes relative to /a/<plugin-id>/; inside a page "/" is the page itself and anything
// left over falls through to "Not found", so the page route must consume "explore".
function getSceneApp(): SceneApp {
  return new SceneApp({
    urlSyncOptions: { updateUrlOnInit: true, createBrowserHistorySteps: true },
    pages: [
      new SceneAppPage({
        // title in the breadcrumb and browser tab only; the page itself starts with the filters, like Logs Drilldown
        title: APP_TITLE,
        renderTitle: () => null,
        url: EXPLORE_ROUTE,
        routePath: 'explore/*',
        getScene: getExploreScene,
      }),
      new SceneAppPage({
        title: APP_TITLE,
        url: PLUGIN_BASE_URL,
        routePath: '*',
        getScene: () => new EmbeddedScene({ body: new SceneReactObject({ component: RedirectToExplore }) }),
      }),
    ],
  });
}

export function App(props: AppRootProps<AppJsonData>) {
  setAppConfig(props.meta.jsonData);
  ensureRuntimeDataSource((ds) => {
    // registerRuntimeDataSource is typed for DataQuery; the app's query type is a subtype
    registerRuntimeDataSource({ dataSource: ds as unknown as RuntimeDataSource });
    // Grafana core keeps its own registry; the Logs panel looks the data source up there for "show context"
    const srv = getDataSourceSrv() as unknown as { registerRuntimeDataSource?: (e: { dataSource: unknown }) => void };
    try {
      srv.registerRuntimeDataSource?.({ dataSource: ds });
    } catch (e) {
      console.warn('kotak-starrocks-logs-app: could not register the runtime data source with Grafana', e);
    }
  });
  const scene = useSceneApp(getSceneApp);
  return <scene.Component model={scene} />;
}
