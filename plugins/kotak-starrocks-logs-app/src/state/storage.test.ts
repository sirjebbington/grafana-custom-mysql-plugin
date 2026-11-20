import { getFavorites, getLastSelection, setLastSelection, toggleFavorite } from './storage';

describe('storage', () => {
  beforeEach(() => window.localStorage.clear());

  it('remembers the last data source and view', () => {
    expect(getLastSelection()).toEqual({});
    setLastSelection('ds1', 'vw_eks_app_logs_a');
    expect(getLastSelection()).toEqual({ ds: 'ds1', view: 'vw_eks_app_logs_a' });
  });

  it('toggles favourites per data source, view and label', () => {
    expect(toggleFavorite('ds1', 'v', 'k8s_service_name', 'api')).toEqual(['api']);
    expect(toggleFavorite('ds1', 'v', 'k8s_service_name', 'web')).toEqual(['api', 'web']);
    expect(getFavorites('ds2', 'v', 'k8s_service_name')).toEqual([]);
    expect(toggleFavorite('ds1', 'v', 'k8s_service_name', 'api')).toEqual(['web']);
  });

  it('never throws when storage is broken', () => {
    window.localStorage.setItem('kotak-starrocks-logs-app:last', '{not json');
    expect(getLastSelection()).toEqual({});
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => setLastSelection('a', 'b')).not.toThrow();
    spy.mockRestore();
  });
});
