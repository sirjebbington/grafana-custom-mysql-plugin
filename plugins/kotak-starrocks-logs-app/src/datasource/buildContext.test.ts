import { dateTime } from '@grafana/data';

import { setAppConfig } from '../config/config';
import { buildContext } from './StarRocksLogsDataSource';

const fetchViewSample = jest.fn();
const setRelation = jest.fn();
const ensureSessionZone = jest.fn();

jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  fetchViewSample: (...a: unknown[]) => fetchViewSample(...a),
  setRelation: (...a: unknown[]) => setRelation(...a),
}));
jest.mock('./timeZone', () => ({ ensureSessionZone: (...a: unknown[]) => ensureSessionZone(...a) }));

const range = { from: dateTime(0), to: dateTime(3_600_000), raw: { from: 'now-1h', to: 'now' } };

beforeEach(() => {
  fetchViewSample.mockReset();
  setRelation.mockReset();
  ensureSessionZone.mockReset().mockResolvedValue(undefined);
  setAppConfig({ tenants: { default: { level: { source: 'column' } } } });
});

describe('build context from the view columns', () => {
  it('an EKS view: read as it is, the usual labels and fields', async () => {
    fetchViewSample.mockResolvedValue({
      names: ['observed_timestamp', 'message', 'level', 'k8s_service_name', 'k8s_pod_uid', 'app_id'],
      row: { message: 'x' },
    });
    const ctx = await buildContext('vw_eks_app_logs_app_1', range, 'ds1');
    expect(ctx.relation).toBeUndefined();
    expect(ctx.labels).toEqual(['k8s_service_name']);
    expect(ctx.fields).toEqual(['k8s_pod_uid']);
    expect(ctx.serviceLabel).toBe('k8s_service_name');
    expect(ctx.tenant.key).toBe('app_1');
    expect(setRelation).toHaveBeenCalledWith('ds1', 'vw_eks_app_logs_app_1', undefined);
  });

  it('a GenAI view with other names: a renaming table, registered before the time zone probe', async () => {
    fetchViewSample.mockResolvedValue({
      names: ['event_time', 'body', 'severity_text', 'service_name', 'pod_name'],
      row: { body: 'routed request' },
    });
    const ctx = await buildContext('vw_genai_logs_app_7001_agentrouter', range, 'genai');
    expect(ctx.relation).toMatch(
      /^\(SELECT `event_time` AS `observed_timestamp`, CAST\(`body` AS VARCHAR\) AS `message`/
    );
    expect(ctx.columns).toContain('level');
    expect(ctx.serviceLabel).toBe('service_name');
    expect(ctx.podColumns).toEqual(['pod_name']);
    expect(ctx.tenant.key).toBe('app_7001_agentrouter');
    expect(ctx.tenant.level.source).toBe('column');
    expect(setRelation).toHaveBeenCalledWith('genai', 'vw_genai_logs_app_7001_agentrouter', ctx.relation);
    expect(setRelation.mock.invocationCallOrder[0]).toBeLessThan(ensureSessionZone.mock.invocationCallOrder[0]);
  });

  it('no level column: the level is read from the message', async () => {
    fetchViewSample.mockResolvedValue({ names: ['timestamp', 'log', 'service'] });
    const ctx = await buildContext('vw_genai_logs_app_2', range, 'genai');
    expect(ctx.tenant.level.source).toBe('message');
    expect(ctx.tenant.level.regex.length).toBeGreaterThan(3);
  });

  it('the tenant names its columns', async () => {
    setAppConfig({ tenants: { app_3: { columns: { time: 'logged_at', message: 'text' } } } });
    fetchViewSample.mockResolvedValue({ names: ['logged_at', 'text', 'event_time', 'body'] });
    const ctx = await buildContext('vw_genai_logs_app_3', range, 'genai');
    expect(ctx.relation).toContain('`logged_at` AS `observed_timestamp`');
    expect(ctx.relation).toContain('CAST(`text` AS VARCHAR) AS `message`');
  });

  it('a view without any row: the usual columns; a view without a time column: a clear error', async () => {
    fetchViewSample.mockResolvedValue({ names: [] });
    const empty = await buildContext('vw_eks_app_logs_empty', range, 'ds1');
    expect(empty.relation).toBeUndefined();
    expect(empty.columns).toContain('observed_timestamp');
    fetchViewSample.mockResolvedValue({ names: ['body', 'service'] });
    await expect(buildContext('vw_genai_logs_x', range, 'genai')).rejects.toThrow(/has no time column/);
  });
});
