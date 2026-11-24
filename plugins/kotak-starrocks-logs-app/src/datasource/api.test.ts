import { setAppConfig } from '../config/config';
import { friendlyError, listDatasources } from './api';

const instances = [
  { uid: 'db2', name: 'logs-db2', type: 'kotak-starrocks-datasource' },
  { uid: 'db1', name: 'logs-db1', type: 'kotak-starrocks-datasource' },
];

// like Grafana 12.0: the built-in "-- Grafana --" data source is appended unless pluginId is given
const grafanaBuiltIn = { uid: 'grafana', name: '-- Grafana --', type: 'grafana' };
jest.mock('@grafana/runtime', () => ({
  getDataSourceSrv: () => ({
    getList: ({ pluginId, type }: { pluginId?: string; type?: string }) => [
      ...instances.filter((i) => (pluginId ?? type) === undefined || i.type === (pluginId ?? type)),
      ...(pluginId ? [] : [grafanaBuiltIn]),
    ],
  }),
}));

describe('friendlyError', () => {
  it('explains Ranger and login rejections and keeps the original text', () => {
    expect(friendlyError('Error 5204 (42000): Access denied')).toMatch(
      /^Access denied by Ranger \(5204\)\..*Error 5204/
    );
    expect(friendlyError('db query error: invalid connection')).toMatch(
      /no access to any log view.*invalid connection/
    );
    expect(friendlyError('something else')).toBe('something else');
  });

  it('StarRocks 4.1: no grant in the database is 5203 on DATABASE; query timeouts are explained', () => {
    const msg =
      'db query error: Error 5203 (42000): Access denied; you need (at least one of) the ANY privilege(s) on DATABASE obs2_logs1_uat for this operation.';
    expect(friendlyError(msg)).toMatch(
      /^You have no access to any log view in this database\..*on DATABASE obs2_logs1_uat/
    );
    expect(friendlyError('Error 5203: Access denied on TABLE x')).toMatch(/^Access denied by StarRocks \(5203\)/);
    expect(friendlyError('Query reached its timeout of 120 seconds')).toMatch(
      /^The query took longer than the time limit/
    );
  });
});

describe('listDatasources', () => {
  it('offers every instance of the plugin type, by name, when no list is configured (never "-- Grafana --")', () => {
    setAppConfig({});
    expect(listDatasources().map((d) => d.uid)).toEqual(['db1', 'db2']);
  });

  it('follows the configured list and order, skipping data sources the user cannot see', () => {
    setAppConfig({ datasources: ['db2', 'missing', 'db1'] });
    expect(listDatasources()).toEqual([
      { uid: 'db2', name: 'logs-db2' },
      { uid: 'db1', name: 'logs-db1' },
    ]);
  });
});
