import { DEFAULT_MESSAGE_LEVEL_REGEX } from '../constants';
import { DEFAULT_CONFIG, resolveConfig, resolveTenant, tenantKeyForView, viewPrefixesFor } from './config';

describe('resolveConfig', () => {
  it('uses defaults for empty jsonData', () => {
    const { config, errors } = resolveConfig(undefined);
    expect(errors).toEqual([]);
    expect(config.datasource).toEqual(DEFAULT_CONFIG.datasource);
    // the EKS app log views and the GenAI log views
    expect(config.viewPrefixes).toEqual(['vw_eks_app_logs_', 'vw_genai_logs_']);
    expect(config.labels[0]).toBe('k8s_service_name');
  });

  it('applies valid values and reports invalid ones', () => {
    const { config, errors } = resolveConfig({
      datasourceUid: 'ds1',
      viewPrefix: 'bad prefix',
      maxScanHours: -1,
      lineLimit: 100,
      labels: ['a', 'b c'],
      defaultTimeRange: 'yesterday',
    });
    expect(config.datasource.uid).toBe('ds1');
    expect(config.viewPrefixes).toEqual(['vw_eks_app_logs_', 'vw_genai_logs_']);
    expect(config.lineLimit).toBe(100);
    expect(config.labels).toEqual(['k8s_service_name', 'a']);
    expect(errors).toHaveLength(4);
  });

  it('validates tenants: regex syntax, capture groups, pattern shape and duplicates', () => {
    const { config, errors } = resolveConfig({
      tenants: {
        app_1: {
          level: { source: 'message', regex: ['level=(\\w+)', 'no-group', '(unclosed'] },
          trace: { regex: 'traceid=([0-9a-f]{32})', tempoUid: 'tempo' },
          patterns: [
            { name: 'ok', like: '%x%' },
            { name: 'both', like: '%x%', regex: 'x' },
            { name: 'ok', like: '%y%' },
            { name: 'bad regex', regex: '(' },
          ],
        },
        'bad key!': {},
      },
    });
    expect(config.tenants.app_1.level).toEqual({ source: 'message', regex: ['level=(\\w+)'] });
    expect(config.tenants.app_1.trace?.tempoUid).toBe('tempo');
    expect(config.tenants.app_1.patterns).toEqual([{ name: 'ok', like: '%x%' }]);
    expect(config.tenants['bad key!']).toBeUndefined();
    expect(errors.length).toBe(6);
  });

  it('range, timeout and time zone settings: defaults and validation', () => {
    const d = resolveConfig({}).config;
    expect(d.maxRangeHours).toBe(24);
    expect(d.queryTimeoutSeconds).toBe(120);
    expect(d.timeZone).toBe('auto');
    for (const timeZone of ['session', '+00:00', '-03:30', 'Asia/Kolkata', 'UTC']) {
      expect(resolveConfig({ timeZone }).errors).toEqual([]);
    }
    const { config, errors } = resolveConfig({ maxRangeHours: 12, queryTimeoutSeconds: 0, timeZone: '+05:30' });
    expect(errors).toEqual([]);
    expect([config.maxRangeHours, config.queryTimeoutSeconds, config.timeZone]).toEqual([12, 0, '+05:30']);
    const bad = resolveConfig({ maxRangeHours: 0, queryTimeoutSeconds: 1.5, timeZone: "x'; DROP" });
    expect(bad.errors).toHaveLength(3);
    expect(bad.config.maxRangeHours).toBe(24);
    expect(bad.config.timeZone).toBe('auto');
  });

  it('accepts RE2 (?i) prefixes', () => {
    const { errors } = resolveConfig({ tenants: { a: { level: { source: 'message', regex: '(?i)level=(\\w+)' } } } });
    expect(errors).toEqual([]);
  });
});

describe('resolveTenant', () => {
  const { config } = resolveConfig({
    tenants: {
      default: { level: { source: 'column' }, patterns: [{ name: 'p', like: '%p%' }] },
      app_1961_observability: { level: { source: 'message' } },
    },
  });

  it('derives the tenant key from the view name', () => {
    expect(tenantKeyForView('vw_eks_app_logs_app_1961_observability', 'vw_eks_app_logs_')).toBe(
      'app_1961_observability'
    );
  });

  it('merges the default tenant and fills default message regexes', () => {
    const obs = resolveTenant(config, 'vw_eks_app_logs_app_1961_observability');
    expect(obs.level).toEqual({ source: 'message', regex: DEFAULT_MESSAGE_LEVEL_REGEX });
    expect(obs.patterns).toEqual([{ name: 'p', like: '%p%' }]);
    const other = resolveTenant(config, 'vw_eks_app_logs_app_x');
    expect(other.level).toEqual({ source: 'column', regex: [] });
  });
});

describe('several data sources (one per StarRocks database)', () => {
  it('parses the datasources list: uids, {uid, viewPrefix}, and reports bad entries', () => {
    const { config, errors } = resolveConfig({
      datasourceUid: 'db1',
      datasources: [
        'db1',
        { uid: 'db2', viewPrefix: 'vw_other_' },
        'db1',
        { uid: 'bad uid' },
        { uid: 'db3', viewPrefix: 'x-y' },
      ],
    });
    expect(config.datasource.uid).toBe('db1');
    expect(config.datasources).toEqual([{ uid: 'db1' }, { uid: 'db2', viewPrefixes: ['vw_other_'] }]);
    expect(errors).toHaveLength(3);
  });

  it('defaults to an empty list (= every instance of the plugin type)', () => {
    expect(resolveConfig({}).config.datasources).toEqual([]);
  });

  it('uses the data source view prefix to find the tenant', () => {
    const { config } = resolveConfig({
      datasources: ['db1', { uid: 'db2', viewPrefix: 'vw_other_' }],
      tenants: { app_7: { level: { source: 'message' } } },
    });
    expect(viewPrefixesFor(config, 'db2')).toEqual(['vw_other_']);
    expect(viewPrefixesFor(config, 'db1')).toEqual(['vw_eks_app_logs_', 'vw_genai_logs_']);
    expect(resolveTenant(config, 'vw_other_app_7', 'db2').key).toBe('app_7');
    expect(resolveTenant(config, 'vw_other_app_7', 'db2').level.source).toBe('message');
  });

  it('prefers <datasourceUid>/<app_id> settings field by field, then app_id, then default', () => {
    const { config, errors } = resolveConfig({
      tenants: {
        default: { patterns: [{ name: 'd', like: '%d%' }] },
        app_1: { level: { source: 'message' }, trace: { regex: 't=(\\w+)', tempoUid: 'tempo' } },
        'db2/app_1': { level: { source: 'column' } },
        'not valid/x': {},
      },
    });
    expect(errors).toEqual(['tenants: "not valid/x" is not an app_id or <datasourceUid>/<app_id>']);
    const inDb2 = resolveTenant(config, 'vw_eks_app_logs_app_1', 'db2');
    expect(inDb2.level.source).toBe('column');
    expect(inDb2.trace?.tempoUid).toBe('tempo');
    expect(inDb2.patterns).toEqual([{ name: 'd', like: '%d%' }]);
    expect(resolveTenant(config, 'vw_eks_app_logs_app_1', 'db1').level.source).toBe('message');
  });
});

describe('several view prefixes (EKS app logs, GenAI logs)', () => {
  it('viewPrefix takes one prefix or a list, at the top level and per data source', () => {
    const { config, errors } = resolveConfig({
      viewPrefix: ['vw_eks_app_logs_', 'vw_genai_logs_', 'vw_onprem_logs_'],
      datasources: [
        { uid: 'genai', viewPrefix: ['vw_genai_logs_'] },
        { uid: 'bad', viewPrefix: ['ok_', 'x y'] },
      ],
    });
    expect(config.viewPrefixes).toEqual(['vw_eks_app_logs_', 'vw_genai_logs_', 'vw_onprem_logs_']);
    expect(viewPrefixesFor(config, 'genai')).toEqual(['vw_genai_logs_']);
    expect(config.datasources.map((d) => d.uid)).toEqual(['genai']);
    expect(errors).toEqual([
      'datasources.bad.viewPrefix ["ok_","x y"]: prefixes may only contain letters, digits and _',
    ]);
    expect(resolveConfig({ viewPrefix: 'vw_x_' }).config.viewPrefixes).toEqual(['vw_x_']);
  });

  it('the app_id is the view name without the prefix it starts with (the longest one)', () => {
    const prefixes = ['vw_eks_app_logs_', 'vw_genai_logs_', 'vw_genai_logs_v2_'];
    expect(tenantKeyForView('vw_genai_logs_app_7001_agentrouter', prefixes)).toBe('app_7001_agentrouter');
    expect(tenantKeyForView('vw_eks_app_logs_app_1961_observability', prefixes)).toBe('app_1961_observability');
    expect(tenantKeyForView('vw_genai_logs_v2_app_1', prefixes)).toBe('app_1');
    expect(tenantKeyForView('other_view', prefixes)).toBe('other_view');
  });

  it('a tenant can name its columns per role; default, app_id and <ds>/<app_id> merge per role', () => {
    const { config, errors } = resolveConfig({
      tenants: {
        default: { columns: { pod: 'host' } },
        app_7001_agentrouter: { columns: { time: 'event_ts', message: 'log_text' } },
        'genai/app_7001_agentrouter': { columns: { message: 'body_text' } },
        bad: { columns: { when: 'x', time: 'not a column' } as never },
      },
    });
    expect(errors).toEqual([
      'tenants.bad.columns.when: unknown role (one of time, message, level, service, pod)',
      'tenants.bad.columns.time "not a column" is not a column name',
    ]);
    expect(resolveTenant(config, 'vw_genai_logs_app_7001_agentrouter', 'genai').columns).toEqual({
      pod: 'host',
      time: 'event_ts',
      message: 'body_text',
    });
    expect(resolveTenant(config, 'vw_eks_app_logs_app_1').columns).toEqual({ pod: 'host' });
  });
});
