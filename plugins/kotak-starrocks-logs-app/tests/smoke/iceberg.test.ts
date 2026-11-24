/**
 * The app's queries on REAL Iceberg tables (scripts/e2e.sh iceberg, then iceberg-smoke), on the StarRocks
 * version of UAT, with the session in Asia/Kolkata like UAT:
 *   vw_eks_app_logs_app_9100_icebergtz   observed_timestamp is an Iceberg timestamptz
 *   vw_eks_app_logs_app_9200_icebergntz  observed_timestamp is an Iceberg timestamp holding IST wall-clock time
 * Both tables are partitioned by identity(app_id) and hour(observed_timestamp), like UAT's eks_app_logs.
 */
import { resolveConfig, resolveTenant } from '../../src/config/config';
import { DEFAULT_FIELDS, DEFAULT_LABELS } from '../../src/constants';
import { findOldest } from '../../src/datasource/oldestSearch';
import {
  anyBeforeQuery,
  BuildContext,
  contextQuery,
  logsQuery,
  oldestInRangeQuery,
  planWindows,
  timeMsExpr,
  volumeQuery,
  widenToSeconds,
} from '../../src/sql/builder';
import { emptySpec, QuerySpec } from '../../src/state/types';
import { appHint, detectMode, DS, Session } from './helpers';

const TZ_VIEW = 'vw_eks_app_logs_app_9100_icebergtz';
const NTZ_VIEW = 'vw_eks_app_logs_app_9200_icebergntz';
const COLUMNS = [
  'observed_timestamp',
  'message',
  'level',
  'app_id',
  'level_parser',
  ...DEFAULT_LABELS,
  ...DEFAULT_FIELDS,
];
const H = 3_600_000;

const run = process.env.ICEBERG === '1' ? describe : describe.skip;
const user = new Session('kmbl3iceberg');

function ctx(view: string): BuildContext {
  const { config } = resolveConfig({ tenants: { default: { level: { source: 'column' } } } });
  return {
    tenant: resolveTenant(config, view, DS.uid),
    columns: COLUMNS,
    labels: DEFAULT_LABELS,
    fields: DEFAULT_FIELDS,
  };
}

const otel = (view: string, p: Partial<QuerySpec> = {}): QuerySpec => ({
  ...emptySpec(view, DS.uid),
  filters: [{ key: 'k8s_service_name', op: '=', value: 'otel-collector' }],
  ...p,
});
const inMessage = (r: Record<string, unknown>) => Date.parse(/ts=(\S+?)\d{3}Z/.exec(String(r.message))![1] + 'Z');

run('real Iceberg tables on the UAT StarRocks version (session Asia/Kolkata)', () => {
  beforeAll(async () => {
    await user.login();
  });

  it('runs the UAT StarRocks version, session in Asia/Kolkata', async () => {
    const [v] = await user.sql('SELECT current_version() AS v, @@time_zone AS tz', 'now-1h', 'now', DS, { hint: '' });
    expect(String(v.v)).toMatch(/^4\.1\.6/);
    expect(v.tz).toBe('Asia/Kolkata');
  });

  it('the probe: timestamptz is an instant (shown in the session zone); the IST timestamp is wall clock', async () => {
    expect(await detectMode(user, TZ_VIEW)).toEqual({ kind: 'aware' });
    expect(await detectMode(user, NTZ_VIEW)).toEqual({ kind: 'naive', offsetMinutes: 330 });
  });

  for (const view of [TZ_VIEW, NTZ_VIEW]) {
    describe(view, () => {
      let hint = '';
      beforeAll(async () => {
        hint = appHint(await detectMode(user, view));
      });
      const q = (sql: string, from: string, to: string) => user.sql(sql, from, to, DS, { hint });

      it('line times equal the time in the message', async () => {
        const rows = await q(logsQuery(otel(view), ctx(view), 300, 'desc'), 'now-12h', 'now+12h');
        expect(rows.length).toBe(300);
        rows.forEach((r) => expect(Number(r.__ms)).toBe(inMessage(r)));
      });

      it('the time filter selects by real time; windows of a text search join exactly', async () => {
        const [newest] = await q(logsQuery(otel(view), ctx(view), 1, 'desc'), 'now-12h', 'now+12h');
        const toMs = Number(newest.__ms);
        const fromMs = toMs - 4 * H;
        const text = otel(view, {
          lineFilters: [{ op: 'include', value: 'timed out', caseSensitive: false, regex: false }],
        });
        const page = async (f: number, t: number) => {
          const w = widenToSeconds(f, t);
          return q(logsQuery(text, ctx(view), 5000, 'desc', { fromMs: f, toMs: t }), String(w.fromMs), String(w.toMs));
        };
        const whole = await page(fromMs, toMs);
        expect(whole.length).toBeGreaterThan(20);
        whole.forEach((r) => {
          expect(inMessage(r)).toBeGreaterThanOrEqual(fromMs);
          expect(inMessage(r)).toBeLessThanOrEqual(toMs);
        });
        const parts: Array<Record<string, unknown>> = [];
        for (const w of planWindows(fromMs, toMs, 'desc')) {
          parts.push(...(await page(w.fromMs, w.toMs)));
        }
        expect(parts.map((r) => `${r.__ts}|${r.message}`)).toEqual(whole.map((r) => `${r.__ts}|${r.message}`));
      });

      it('volume buckets count lines by real time', async () => {
        const [newest] = await q(logsQuery(otel(view), ctx(view), 1, 'desc'), 'now-12h', 'now+12h');
        const to = Math.ceil(Number(newest.__ms) / 3_600_000) * 3_600_000;
        const rows = await q(volumeQuery(otel(view), ctx(view), 3600), String(to - 6 * H), String(to));
        const buckets = rows.map((r) => Number(r.t) * 1000);
        expect(Math.max(...buckets)).toBe(to - H);
      });

      it('show context: the same pod before a line', async () => {
        const [line] = await q(logsQuery(otel(view), ctx(view), 1, 'desc'), 'now-12h', 'now+12h');
        const back = await q(
          contextQuery(view, ctx(view), 'k8s_pod_uid', String(line.k8s_pod_uid), String(line.__ts), 'backward', 10),
          String(Number(line.__ms) - H),
          String(Number(line.__ms) + H)
        );
        expect(back).toHaveLength(10);
        back.forEach((r) => expect(Number(r.__ms)).toBeLessThan(Number(line.__ms)));
      });

      it('"Oldest log": LIMIT 1 probes find the same oldest line as MIN over the whole view', async () => {
        const [{ oldest: expected }] = await q(
          `SELECT ${timeMsExpr('MIN(observed_timestamp)')} AS oldest FROM ${view}`,
          'now-1h',
          'now'
        );
        const found = await findOldest(
          Date.now(),
          async (ms) => (await q(anyBeforeQuery(view, ms), 'now-1h', 'now')).length > 0,
          async (a, b) => {
            const [r] = await q(oldestInRangeQuery(view, a, b), 'now-1h', 'now');
            return r?.oldest === null || r?.oldest === undefined ? undefined : Number(r.oldest);
          }
        );
        expect(found).toBe(Number(expected));
      });

      it('partition pruning: a one-hour line query reads one or two of the hourly partitions', async () => {
        const [newest] = await q(logsQuery(otel(view), ctx(view), 1, 'desc'), 'now-12h', 'now+12h');
        const to = Number(newest.__ms);
        const w = widenToSeconds(to - H, to);
        const plan = await q(
          `EXPLAIN VERBOSE ${logsQuery(otel(view), ctx(view), 100, 'desc', { fromMs: to - H, toMs: to })}`,
          String(w.fromMs),
          String(w.toMs)
        );
        const text = plan.map((r) => String(Object.values(r)[0])).join('\n');
        const m = /partitions=(\d+)\/(\d+)/.exec(text);
        expect(m).toBeTruthy();
        expect(Number(m![1])).toBeLessThanOrEqual(2);
        expect(Number(m![2])).toBeGreaterThanOrEqual(4);
      });
    });
  }
});
