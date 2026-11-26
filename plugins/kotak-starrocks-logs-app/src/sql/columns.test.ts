import { DEFAULT_FIELDS, DEFAULT_LABELS } from '../constants';
import { COLUMN_CANDIDATES, podColumnOf, resolveViewColumns } from './columns';

// the 21 columns of the UAT eks_app_logs views (dev/e2e/seed.py COLUMNS)
const EKS = [
  'app_env',
  'app_id',
  'eks_cluster_name',
  'k8s_container_name',
  'k8s_daemonset_name',
  'k8s_deployment_name',
  'k8s_namespace_name',
  'k8s_node_name',
  'k8s_pod_name',
  'k8s_pod_start_time',
  'k8s_pod_uid',
  'k8s_service_name',
  'k8s_statefulset_name',
  'log_file_path',
  'log_iostream',
  'logtag',
  'message',
  'observed_timestamp',
  'tenant_name',
  'level',
  'level_parser',
];
const GENAI = [
  'event_time',
  'body',
  'severity_text',
  'service_name',
  'namespace',
  'pod_name',
  'tenant',
  'trace_id',
  'model',
  'attributes',
];
const opts = { labels: DEFAULT_LABELS, fields: DEFAULT_FIELDS, serviceLabel: 'k8s_service_name', overrides: {} };

describe('a view with the app column names (EKS app logs): read as it is', () => {
  const v = resolveViewColumns('vw_eks_app_logs_app_1', EKS, { message: 'x' }, opts);

  it('no derived table; the usual labels and fields; pipeline columns hidden', () => {
    expect(v.relation).toBeUndefined();
    expect(v.found).toMatchObject({ time: 'observed_timestamp', message: 'message', level: 'level' });
    expect(v.labels).toEqual(DEFAULT_LABELS.filter((l) => EKS.includes(l)));
    expect(v.fields).toEqual(DEFAULT_FIELDS);
    expect([...v.labels, ...v.fields]).not.toContain('app_id');
    expect([...v.labels, ...v.fields]).not.toContain('level_parser');
    expect(v.details).toEqual([]);
    expect(v.serviceLabel).toBe('k8s_service_name');
    expect(v.podColumns).toEqual(['k8s_pod_uid', 'k8s_pod_name']);
    expect(v.hasLevel).toBe(true);
  });
});

describe('a view that names its columns differently (GenAI logs)', () => {
  const sample = { attributes: '{"gen_ai.request.model":"gpt-4o"}', model: 'gpt-4o', body: 'routed request' };
  const v = resolveViewColumns('vw_genai_logs_app_7001_agentrouter', GENAI, sample, opts);

  it('a derived table renames time, message and level; the time column stays plain (partition pruning)', () => {
    expect(v.found).toMatchObject({
      time: 'event_time',
      message: 'body',
      level: 'severity_text',
      service: 'service_name',
      pod: 'pod_name',
    });
    expect(v.relation).toBe(
      '(SELECT `event_time` AS `observed_timestamp`, CAST(`body` AS VARCHAR) AS `message`, ' +
        'CAST(`severity_text` AS VARCHAR) AS `level`, `service_name`, `namespace`, `pod_name`, `tenant`, `trace_id`, ' +
        '`model`, `attributes` FROM `vw_genai_logs_app_7001_agentrouter`) AS `vw_genai_logs_app_7001_agentrouter`'
    );
    expect(v.columns.slice(0, 3)).toEqual(['observed_timestamp', 'message', 'level']);
  });

  it('every other column is shown: the service column as the grid label, the rest as fields, JSON in details', () => {
    expect(v.serviceLabel).toBe('service_name');
    expect(v.labels).toEqual(['service_name']);
    expect(v.fields).toEqual(['namespace', 'pod_name', 'tenant', 'trace_id', 'model']);
    expect(v.details).toEqual(['attributes']);
    expect(v.podColumns).toEqual(['pod_name']);
  });

  it('names are matched without case', () => {
    const w = resolveViewColumns('v', ['Timestamp', 'Message', 'Level', 'Service_Name'], undefined, opts);
    expect(w.found).toMatchObject({ time: 'Timestamp', message: 'Message', level: 'Level', service: 'Service_Name' });
    expect(w.relation).toContain('`Timestamp` AS `observed_timestamp`');
  });
});

describe('tenant column names and missing columns', () => {
  it('the tenant names a column for a role (overrides the built-in names)', () => {
    const v = resolveViewColumns('v', ['ts_utc', 'event_time', 'text', 'body', 'sev', 'level', 'agent'], undefined, {
      ...opts,
      overrides: { time: 'ts_utc', message: 'text', level: 'sev', service: 'agent' },
    });
    expect(v.found).toMatchObject({ time: 'ts_utc', message: 'text', level: 'sev', service: 'agent' });
    expect(v.relation).toContain('`ts_utc` AS `observed_timestamp`');
    expect(v.relation).toContain('CAST(`sev` AS VARCHAR) AS `level`');
    // the view's own "level" column is left out (its name is taken), the others stay
    expect(v.relation!.match(/`level`/g)).toHaveLength(1);
    expect(v.columns).toEqual(expect.arrayContaining(['event_time', 'body', 'agent']));
    expect(v.serviceLabel).toBe('agent');
  });

  it('no level column: the level is read from the message (hasLevel false); no service column: first label', () => {
    const v = resolveViewColumns('v', ['timestamp', 'msg', 'k8s_namespace_name', 'host'], undefined, opts);
    expect(v.hasLevel).toBe(false);
    expect(v.columns).not.toContain('level');
    expect(v.serviceLabel).toBe('k8s_namespace_name');
    expect(v.podColumns).toEqual(['host']);
  });

  it('no time or no message column: an error that says how to name it', () => {
    expect(() => resolveViewColumns('vw_x', ['body', 'svc'], undefined, opts)).toThrow(
      /vw_x has no time column \(looked for observed_timestamp, timestamp, event_time.*tenants\.<app_id>\.columns\.time/
    );
    expect(() => resolveViewColumns('vw_x', ['event_time', 'svc'], undefined, opts)).toThrow(
      /vw_x has no message column .*columns\.message/
    );
    expect(() =>
      resolveViewColumns('vw_x', ['event_time', 'body'], undefined, { ...opts, overrides: { time: 'missing' } })
    ).toThrow(/looked for missing/);
  });

  it('columns that are not plain names are ignored', () => {
    const v = resolveViewColumns('v', ['observed_timestamp', 'message', 'bad name', 'a-b'], undefined, opts);
    expect(v.columns).toEqual(['observed_timestamp', 'message']);
  });
});

describe('the column that identifies a line source (Show context)', () => {
  it('the view pod column first, then the usual ones, among those the line has', () => {
    expect(podColumnOf({ k8s_pod_uid: 'u', k8s_pod_name: 'p' })).toBe('k8s_pod_uid');
    expect(podColumnOf({ k8s_pod_name: 'p' })).toBe('k8s_pod_name');
    expect(podColumnOf({ pod_name: 'p', hostname: 'h' }, ['hostname'])).toBe('hostname');
    expect(podColumnOf({ service_name: 's' })).toBeUndefined();
    expect(COLUMN_CANDIDATES.pod[0]).toBe('k8s_pod_uid');
  });
});
