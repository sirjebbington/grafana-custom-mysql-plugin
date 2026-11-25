import { resolveConfig, resolveTenant } from '../config/config';
import { BuildContext } from '../sql/builder';

export type { BuildContext };

/** A build context for tenant app_1 with one LIKE pattern, for tests. */
export function resolvePatterns(view: string): BuildContext {
  const { config } = resolveConfig({ tenants: { app_1: { patterns: [{ name: 'Timeout', like: '%timed out%' }] } } });
  return {
    tenant: resolveTenant(config, view),
    columns: ['observed_timestamp', 'message', 'level', 'k8s_service_name', 'k8s_namespace_name', 'k8s_pod_uid'],
    labels: ['k8s_service_name', 'k8s_namespace_name'],
    fields: ['k8s_pod_uid'],
  };
}
