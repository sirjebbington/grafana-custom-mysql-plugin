import { DEFAULT_MESSAGE_LEVEL_REGEX } from '../constants';
import { DEFAULT_CONFIG, resolveConfig, resolveTenant, tenantKeyForView } from './config';

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
