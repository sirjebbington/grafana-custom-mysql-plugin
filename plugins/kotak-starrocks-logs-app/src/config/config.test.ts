import { DEFAULT_MESSAGE_LEVEL_REGEX } from '../constants';
import { DEFAULT_CONFIG, resolveConfig, resolveTenant, tenantKeyForView, viewPrefixFor } from './config';

describe('resolveConfig', () => {
  it('uses defaults for empty jsonData', () => {
    const { config, errors } = resolveConfig(undefined);
    expect(errors).toEqual([]);
    expect(config.datasource).toEqual(DEFAULT_CONFIG.datasource);
    expect(config.viewPrefix).toBe('vw_eks_app_logs_');
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
    expect(config.viewPrefix).toBe('vw_eks_app_logs_');
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
    expect(config.datasources).toEqual([{ uid: 'db1' }, { uid: 'db2', viewPrefix: 'vw_other_' }]);
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
    expect(viewPrefixFor(config, 'db2')).toBe('vw_other_');
    expect(viewPrefixFor(config, 'db1')).toBe('vw_eks_app_logs_');
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
