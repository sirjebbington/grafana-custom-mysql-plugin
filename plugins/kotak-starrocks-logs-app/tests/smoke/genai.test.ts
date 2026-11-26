/**
 * GenAI agent logs: views vw_genai_logs_<app_id>_<app_name> whose columns are named differently from the app log
 * views (event_time, body, severity_text, service_name, pod_uid, ...). The app finds the roles itself
 * (src/sql/columns.ts) and every query kind runs on the renaming derived table. Same stack as smoke.test.ts.
 */
import { resolveConfig, resolveTenant } from '../../src/config/config';
import { DEFAULT_FIELDS, DEFAULT_LABELS } from '../../src/constants';
import { findOldest } from '../../src/datasource/oldestSearch';
import {
  anyBeforeQuery,
  BuildContext,
  contextQuery,
  fieldBreakdownQuery,
  labelOverviewQuery,
  labelValuesQuery,
  logsQuery,
  oldestInRangeQuery,
  sampleRowQuery,
  serviceSamplesQuery,
  serviceVolumeQuery,
  viewsQuery,
  volumeQuery,
} from '../../src/sql/builder';
import { resolveViewColumns } from '../../src/sql/columns';
import { emptySpec, QuerySpec } from '../../src/state/types';
import { appHint, detectMode, DS_GENAI, Session, setDefaultHint } from './helpers';

const ROUTER = 'vw_genai_logs_app_7001_agentrouter';
const VOICE = 'vw_genai_logs_app_7002_voiceagent';
const { config } = resolveConfig({ tenants: { default: { level: { source: 'column' } } } });
const e2e = new Session('kmbl3e2e');
const ctxs: Record<string, BuildContext> = {};

async function contextFor(view: string): Promise<BuildContext> {
  // like the app: the bounded sample fails on these views (no observed_timestamp), the plain LIMIT 1 gives the row
  await expect(e2e.sql(sampleRowQuery(view, true), 'now-1h', 'now', DS_GENAI, { hint: '' })).rejects.toThrow();
  const [row] = await e2e.sql(sampleRowQuery(view, false), 'now-1h', 'now', DS_GENAI, { hint: '' });
  const tenant = resolveTenant(config, view, DS_GENAI.uid);
  const v = resolveViewColumns(view, Object.keys(row), row, {
    labels: DEFAULT_LABELS,
    fields: DEFAULT_FIELDS,
    serviceLabel: 'k8s_service_name',
    overrides: tenant.columns,
  });
  return {
    tenant,
    columns: v.columns,
    labels: v.labels,
    fields: v.fields,
    details: v.details,
    relation: v.relation,
    serviceLabel: v.serviceLabel,
    podColumns: v.podColumns,
  };
}
const spec = (view = ROUTER, p: Partial<QuerySpec> = {}): QuerySpec => ({ ...emptySpec(view, DS_GENAI.uid), ...p });
const sql = (s: string, from = 'now-6h') => e2e.sql(s, from, 'now', DS_GENAI);
const sum = (rows: Array<Record<string, unknown>>, key: string) => {
  const m: Record<string, number> = {};
  rows.forEach((r) => (m[String(r[key])] = (m[String(r[key])] ?? 0) + Number(r.c)));
  return m;
};

beforeAll(async () => {
  await e2e.login();
  ctxs[ROUTER] = await contextFor(ROUTER);
  ctxs[VOICE] = await contextFor(VOICE);
  setDefaultHint(DS_GENAI, appHint(await detectMode(e2e, ROUTER, DS_GENAI, ctxs[ROUTER].relation)));
});

describe('GenAI views with their own column names', () => {
  it('the views are listed with the vw_genai_logs_ prefix; the app_id is the rest of the name', async () => {
    const rows = await e2e.sql(viewsQuery('vw_genai_logs_'), 'now-1h', 'now', DS_GENAI, { hint: '' });
    expect(rows.map((r) => Object.values(r)[0])).toEqual([ROUTER, VOICE]);
    expect(resolveTenant(config, ROUTER, DS_GENAI.uid).key).toBe('app_7001_agentrouter');
  });

  it('the roles are found: event_time, body, severity_text, service_name, pod_uid; JSON attributes in details', () => {
    const c = ctxs[ROUTER];
    expect(c.relation).toContain('`event_time` AS `observed_timestamp`');
    expect(c.relation).toContain('CAST(`body` AS VARCHAR) AS `message`');
    expect(c.relation).toContain('CAST(`severity_text` AS VARCHAR) AS `level`');
    expect(c.serviceLabel).toBe('service_name');
    expect(c.podColumns![0]).toBe('pod_uid');
    expect(c.details).toEqual(['attributes']);
    expect(c.fields).toEqual(expect.arrayContaining(['namespace', 'pod_name', 'tenant', 'trace_id', 'model']));
    expect([...c.labels, ...c.fields]).not.toContain('app_id');
  });

  it('service grid by service_name, with and without levels', async () => {
    const c = ctxs[ROUTER];
    const plain = sum(await sql(serviceVolumeQuery(spec(), c, c.serviceLabel!, 3600, false)), 'v');
    expect(Object.keys(plain).sort()).toEqual(['agent-router', 'llm-gateway', 'tool-executor']);
    const [n] = await sql(`SELECT COUNT(*) AS c FROM ${ROUTER}`, 'now-24h');
    expect(Object.values(plain).reduce((a, b) => a + b, 0)).toBe(Number(n.c));
    const levels = sum(await sql(volumeQuery(spec(), c, 3600, true)), 'g');
    expect(Object.keys(levels).sort()).toEqual(['debug', 'error', 'info', 'warn']);
  });

  it('newest lines: the body text (JSON bodies as text), levels, the other columns; times are the record instants', async () => {
    const c = ctxs[ROUTER];
    const rows = await sql(logsQuery(spec(), c, 200, 'desc'));
    expect(rows).toHaveLength(200);
    const gateway = rows.find((r) => r.service_name === 'llm-gateway')!;
    expect(JSON.parse(String(gateway.message))).toMatchObject({ event: 'completion' });
    const router = rows.find((r) => r.service_name === 'agent-router')!;
    expect(String(router.message)).toMatch(/^routed request route=chat/);
    expect(['error', 'warn', 'info', 'debug']).toContain(router.detected_level);
    expect(router.model).toMatch(/gpt-4o|claude-sonnet|llama-3-70b/);
    expect(JSON.parse(String(router.attributes))).toHaveProperty(['gen_ai.request.model']);
    // __ms (computed in the session zone found by the probe on the derived table) is the record's instant
    expect(Number(router.__ms)).toBe(Math.floor(Number(router.event_time_unix_nano) / 1_000_000));
    const ms = rows.map((r) => Number(r.__ms));
    expect([...ms].sort((a, b) => b - a)).toEqual(ms);
  });

  it('filters: a level, a line search, a column of the view', async () => {
    const c = ctxs[ROUTER];
    const errors = await sql(logsQuery(spec(ROUTER, { levels: ['error'] }), c, 50, 'desc'));
    expect(errors.length).toBeGreaterThan(0);
    errors.forEach((r) => expect(r.detected_level).toBe('error'));
    const tools = await sql(
      logsQuery(
        spec(ROUTER, { lineFilters: [{ op: 'include', value: 'tool call', caseSensitive: false, regex: false }] }),
        c,
        50,
        'desc'
      )
    );
    expect(tools).toHaveLength(50);
    tools.forEach((r) => expect(r.service_name).toBe('tool-executor'));
    const gpt = await sql(
      logsQuery(spec(ROUTER, { filters: [{ key: 'model', op: '=', value: 'gpt-4o' }] }), c, 20, 'desc')
    );
    gpt.forEach((r) => expect(r.model).toBe('gpt-4o'));
  });

  it('label values, overview of the view columns, a key=value field inside the body', async () => {
    const c = ctxs[ROUTER];
    const models = await sql(labelValuesQuery(spec(), c, 'model'));
    expect(models.map((r) => r.v).sort()).toEqual(['claude-sonnet', 'gpt-4o', 'llama-3-70b']);
    expect(
      (await sql(labelOverviewQuery(spec(), c, ['service_name', 'namespace', 'model'], 3600))).length
    ).toBeGreaterThan(0);
    const status = await sql(
      fieldBreakdownQuery(
        spec(ROUTER, { filters: [{ key: 'service_name', op: '=', value: 'agent-router' }] }),
        c,
        'status',
        3600
      )
    );
    expect(new Set(status.map((r) => String(r.v)))).toEqual(new Set(['200', '500']));
  });

  it('grid samples, and the 10 % hash sample keyed by pod_uid', async () => {
    const c = ctxs[ROUTER];
    const samples = await sql(serviceSamplesQuery(spec(), c, 'service_name', ['agent-router', 'tool-executor'], 5));
    expect(samples).toHaveLength(10);
    const sampled = await sql(volumeQuery(spec(), c, 3600, true, 10));
    expect(sampled.every((r) => Number(r.c) % 10 === 0)).toBe(true);
  });

  it('show context: lines of the same pod_uid around a line', async () => {
    const c = ctxs[VOICE];
    const [line] = await sql(logsQuery(spec(VOICE), c, 1, 'desc'));
    const before = await sql(
      contextQuery(VOICE, c, 'pod_uid', String(line.pod_uid), String(line.__ts), 'backward', 20, String(line.message))
    );
    expect(before.length).toBeGreaterThan(0);
    before.forEach((r) => expect(r.pod_uid).toBe(line.pod_uid));
  });

  it('oldest line: LIMIT 1 probes on the derived table', async () => {
    const c = ctxs[VOICE];
    const now = Date.now();
    const oldest = await findOldest(
      now,
      async (ms) => (await sql(anyBeforeQuery(VOICE, ms, c.relation))).length > 0,
      async (a, b) => {
        const [r] = await sql(oldestInRangeQuery(VOICE, a, b, c.relation));
        return r?.oldest == null ? undefined : Number(r.oldest);
      }
    );
    expect(now - oldest!).toBeGreaterThan(3 * 3_600_000);
    expect(now - oldest!).toBeLessThan(5 * 3_600_000);
  });
});
