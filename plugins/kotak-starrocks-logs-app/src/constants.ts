export const PLUGIN_ID = 'kotak-starrocks-logs-app';
export const APP_TITLE = 'Logs Drilldown (StarRocks)';

// Time picker quick ranges: up to 24 hours, the default maxRangeHours (a longer typed range is cut to it).
// Ranges longer than a configured maxRangeHours are not offered.
export const QUICK_RANGES = [
  { from: 'now-5m', to: 'now', display: 'Last 5 minutes' },
  { from: 'now-15m', to: 'now', display: 'Last 15 minutes' },
  { from: 'now-30m', to: 'now', display: 'Last 30 minutes' },
  { from: 'now-1h', to: 'now', display: 'Last 1 hour' },
  { from: 'now-3h', to: 'now', display: 'Last 3 hours' },
  { from: 'now-6h', to: 'now', display: 'Last 6 hours' },
  { from: 'now-12h', to: 'now', display: 'Last 12 hours' },
  { from: 'now-24h', to: 'now', display: 'Last 24 hours' },
];
export const PLUGIN_BASE_URL = `/a/${PLUGIN_ID}`;
export const EXPLORE_ROUTE = `${PLUGIN_BASE_URL}/explore`;

// The app registers a runtime data source that turns structured queries into SQL and sends them through the
// configured kotak-starrocks-datasource instance. Panels inside the app query this runtime data source.
export const RUNTIME_DS_TYPE = 'kotak-starrocks-logs-runtime';
export const RUNTIME_DS_UID = 'kotak-starrocks-logs-runtime';
export const RUNTIME_DS = { type: RUNTIME_DS_TYPE, uid: RUNTIME_DS_UID };

// Schema of the StarRocks log views (vw_eks_app_logs_<app_id> over iceberg eks_app_logs). Every view has the
// same 21 columns; only the time column is not VARCHAR.
export const TIME_COLUMN = 'observed_timestamp';
export const MESSAGE_COLUMN = 'message';
export const LEVEL_COLUMN = 'level';
export const DETECTED_LEVEL = 'detected_level';
export const POD_UID_COLUMN = 'k8s_pod_uid';
export const POD_NAME_COLUMN = 'k8s_pod_name';

export const LEVELS = ['error', 'warn', 'info', 'debug', 'unknown'] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_COLORS: Record<Level | 'all', string> = {
  all: 'purple',
  error: 'red',
  warn: 'orange',
  info: 'green',
  debug: 'blue',
  unknown: 'text',
};

// Label-like (low cardinality) and field-like (higher cardinality) columns, measured on the UAT
// observability view on 2026-11-18. Columns missing from a view are dropped at runtime.
export const DEFAULT_LABELS = [
  'k8s_service_name',
  'k8s_namespace_name',
  'k8s_container_name',
  'k8s_deployment_name',
  'k8s_statefulset_name',
  'k8s_daemonset_name',
  'k8s_node_name',
  'eks_cluster_name',
  'log_iostream',
  'app_env',
  'tenant_name',
  'logtag',
];
export const DEFAULT_FIELDS = ['k8s_pod_name', 'k8s_pod_uid', 'k8s_pod_start_time', 'log_file_path'];

// Tried in order when a tenant derives its level from the message text (level column not populated).
// RE2 syntax (StarRocks); the first capture group is the level word.
export const DEFAULT_MESSAGE_LEVEL_REGEX = [
  `(?i)\\blevel["']?\\s*[=:]\\s*["']?([a-z]+)`,
  `\\b(FATAL|ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\\b`,
  `^([IWEF])[0-9]{4} `,
];

// Normalisation of raw level values; same buckets as the StarRocks Application Logs dashboard, plus the glog
// single letters. Anything else is "unknown".
export const LEVEL_ALIASES: Record<Exclude<Level, 'unknown'>, string[]> = {
  error: ['error', 'err', 'fatal', 'critical', 'crit', 'severe', 'panic', 'emerg', 'emergency', 'alert', 'e', 'f'],
  warn: ['warn', 'warning', 'w'],
  info: ['info', 'information', 'notice', 'i'],
  debug: ['debug', 'fine', 'config', 'trace', 'verbose', 'finest', 'd', 't'],
};
