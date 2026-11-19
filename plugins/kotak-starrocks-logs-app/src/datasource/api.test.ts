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
