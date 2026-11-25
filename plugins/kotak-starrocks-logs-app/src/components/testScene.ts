import { rangeUtil } from '@grafana/data';
import { EmbeddedScene } from '@grafana/scenes';

import { resolveConfig, resolveTenant } from '../config/config';
import { BuildContext } from '../sql/builder';
import { CappedTimeRange } from './CappedTimeRange';
import { LogsExploration, LogsExplorationState } from './LogsExploration';

/** Test helpers for scene tests. The test file mocks the data source calls (jest.mock is per file). */

export const MSG_VIEW = 'vw_eks_app_logs_app_1961_observability';
export const COL_VIEW = 'vw_eks_app_logs_app_04000_payments';

/** observability reads its level from the message and has one pattern; payments uses the level column */
export function ctxFor(view: string): BuildContext {
  const { config } = resolveConfig({
    tenants: {
      app_1961_observability: {
        level: { source: 'message' },
        patterns: [{ name: 'Timeout', like: '%timed out%' }],
      },
    },
  });
  return {
    tenant: resolveTenant(config, view),
    columns: ['observed_timestamp', 'message', 'level', 'k8s_service_name', 'k8s_namespace_name', 'k8s_pod_uid'],
    labels: ['k8s_service_name', 'k8s_namespace_name'],
    fields: ['k8s_pod_uid'],
  };
}

export const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
};

export function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** A LogsExploration in a scene with the app's time range, activated (as when the page is shown). */
export async function mountExploration(state: Partial<LogsExplorationState> = {}, from = 'now-1h') {
  const ex = new LogsExploration(state);
  const scene = new EmbeddedScene({ $timeRange: new CappedTimeRange({ from, to: 'now' }), body: ex });
  scene.activate();
  ex.activate();
  await flush();
  const setRange = async (f: string) => {
    scene.state.$timeRange!.onTimeRangeChange(rangeUtil.convertRawToRange({ from: f, to: 'now' }));
    await flush();
  };
  return { ex, scene, setRange };
}
