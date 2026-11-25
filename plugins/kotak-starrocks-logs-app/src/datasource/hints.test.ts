import { setAppConfig } from '../config/config';
import { appQueryHint, sessionZone, setSessionZone } from './api';

jest.mock('@grafana/runtime', () => ({ getDataSourceSrv: () => ({ getList: () => [] }), getBackendSrv: () => ({}) }));

describe('SET_VAR hint per data source and view', () => {
  beforeEach(() => setAppConfig({}));

  it('auto: the zone detected for that view, plus the query timeout', () => {
    setSessionZone('ds1', 'vw_a', '+00:00');
    setSessionZone('ds1', 'vw_b', '+05:30');
    expect(appQueryHint({ datasource: 'ds1', view: 'vw_a' })).toBe(
      "/*+ SET_VAR(time_zone = '+00:00', query_timeout = 120) */"
    );
    expect(appQueryHint({ datasource: 'ds1', view: 'vw_b' })).toContain("time_zone = '+05:30'");
    // another data source, same view name: not detected yet = the session zone
    expect(appQueryHint({ datasource: 'ds2', view: 'vw_a' })).toBe('/*+ SET_VAR(query_timeout = 120) */');
    expect(sessionZone('ds1', undefined)).toBeUndefined();
  });

  it('the default data source is keyed by its uid', () => {
    setAppConfig({ datasourceUid: 'main' });
    setSessionZone(undefined, 'vw_x', '+00:00');
    expect(sessionZone('main', 'vw_x')).toBe('+00:00');
    expect(sessionZone('', 'vw_x')).toBe('+00:00');
  });

  it('timeZone "session" never sets one; an explicit zone is always used', () => {
    setSessionZone('ds1', 'vw_a', '+00:00');
    setAppConfig({ timeZone: 'session' });
    expect(appQueryHint({ datasource: 'ds1', view: 'vw_a' })).toBe('/*+ SET_VAR(query_timeout = 120) */');
    setAppConfig({ timeZone: 'Asia/Kolkata', queryTimeoutSeconds: 0 });
    expect(appQueryHint({ datasource: 'ds9', view: 'vw_z' })).toBe("/*+ SET_VAR(time_zone = 'Asia/Kolkata') */");
  });

  it('a per-statement timeout overrides the setting (probes use 30 s)', () => {
    expect(appQueryHint({ timeoutSeconds: 30 })).toBe('/*+ SET_VAR(query_timeout = 30) */');
  });
});
