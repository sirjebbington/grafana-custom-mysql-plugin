/**
 * API-level end-to-end checks: signs in through the mock IDAM as different users and runs the SQL produced by
 * src/sql/builder.ts through Grafana's /api/ds/query and the unchanged kotak-starrocks-datasource, against
 * the seeded StarRocks (scripts/e2e.sh up). Run with: npx jest -c jest.smoke.config.js
 */
import { resolveConfig, resolveTenant, AppJsonData } from '../../src/config/config';
import {
  BuildContext,
  contextQuery,
  fieldBreakdownQuery,
  labelOverviewQuery,
  logsQuery,
  patternsQuery,
  serviceSamplesQuery,
  serviceVolumeQuery,
  valueBreakdownQuery,
  viewsQuery,
  volumeQuery,
  widenToSeconds,
} from '../../src/sql/builder';
import { DEFAULT_FIELDS, DEFAULT_LABELS } from '../../src/constants';
import { emptySpec, QuerySpec } from '../../src/state/types';

const GRAFANA = process.env.GRAFANA_URL ?? 'http://localhost:23000';
const DS = { uid: 'e2e-ds-starrocks-logs', type: 'kotak-starrocks-datasource' };
// second StarRocks database = second instance of the data source plugin
const DS2 = { uid: 'e2e-ds-starrocks-logs2', type: 'kotak-starrocks-datasource' };
const PAYMENTS = 'vw_eks_app_logs_app_04000_payments';
const OBS = 'vw_eks_app_logs_app_1961_observability';
const CMM = 'vw_eks_app_logs_app_01996_frontlineplatforms_cmm';
const DPDPA = 'vw_eks_app_logs_app_03123_dpdpa';

// same tenant settings as dev/e2e/provisioning/plugins/kotak-starrocks-logs-app.yaml
const JSON_DATA: AppJsonData = {
  tenants: {
    default: { level: { source: 'column' } },
    app_1961_observability: {
      level: { source: 'message' },
      trace: { regex: 'traceid=([0-9a-f]{32})', tempoUid: 'e2e-tempo-obs' },
      patterns: [
        { name: 'Request completed', like: '%msg="request completed"%' },
        { name: 'Upstream timed out', like: '%upstream timed out%' },
        { name: 'Connection refused', regex: 'Connection refused to [a-z0-9-]+:[0-9]+' },
        { name: 'Health check', like: '%/healthz%' },
      ],
    },
    // only in the second database: there the observability view has the level column filled
    'e2e-ds-starrocks-logs2/app_1961_observability': { level: { source: 'column' } },
  },
};

class Session {
  private cookies = new Map<string, string>();
  constructor(readonly user: string) {}

  private header() {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  private store(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      this.cookies.set(kv.slice(0, i), kv.slice(i + 1));
    }
  }

  async login() {
    let res = await fetch(`${GRAFANA}/login/generic_oauth`, { redirect: 'manual' });
    this.store(res);
    const authorize = res.headers.get('location')!;
    // the mock IDAM puts these claims into the ID and access tokens
    const claims = { aud: ['grafana-e2e'], email: `${this.user}@kotak.com` };
    const form = new URLSearchParams({ username: this.user, claims: JSON.stringify(claims) });
    res = await fetch(authorize, { method: 'POST', body: form, redirect: 'manual' });
    const callback = res.headers.get('location')!;
    res = await fetch(callback, { headers: { cookie: this.header() }, redirect: 'manual' });
    this.store(res);
    const me = await (await fetch(`${GRAFANA}/api/user`, { headers: { cookie: this.header() } })).json();
    expect(me.login).toBe(this.user);
  }

  /** Runs SQL as this user; returns rows as objects, or throws with the datasource error. */
  async sql(rawSql: string, from = 'now-6h', to = 'now', ds = DS): Promise<Array<Record<string, unknown>>> {
    const res = await fetch(`${GRAFANA}/api/ds/query`, {
      method: 'POST',
      headers: { cookie: this.header(), 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        queries: [{ refId: 'A', datasource: ds, rawSql, format: 'table', rawQuery: true }],
      }),
    });
    const body = await res.json();
    const r = body.results?.A;
    if (!r || r.error) {
      throw new Error(r?.error ?? JSON.stringify(body));
    }
    const frame = r.frames?.[0];
    if (!frame) {
      return [];
    }
    const names: string[] = frame.schema.fields.map((f: { name: string }) => f.name);
    const cols: unknown[][] = frame.data?.values ?? [];
    const n = cols[0]?.length ?? 0;
    return Array.from({ length: n }, (_, i) => Object.fromEntries(names.map((name, j) => [name, cols[j][i]])));
  }
}

const COLUMNS = [
  'observed_timestamp',
  'message',
  'level',
  'app_id',
  'level_parser',
  ...DEFAULT_LABELS,
  ...DEFAULT_FIELDS,
];

function ctx(view: string, ds = DS): BuildContext {
  const { config } = resolveConfig(JSON_DATA);
  return {
    tenant: resolveTenant(config, view, ds.uid),
    columns: COLUMNS,
    labels: DEFAULT_LABELS,
    fields: DEFAULT_FIELDS,
  };
}

function spec(view: string, p: Partial<QuerySpec> = {}, ds = DS): QuerySpec {
  return { ...emptySpec(view, ds.uid), ...p };
}

const e2e = new Session('kmbl3e2e');

beforeAll(async () => {
  await e2e.login();
});

describe('per-user access (StarRocks grants stand in for Ranger)', () => {
  it('kmbl3e2e sees only its two views', async () => {
    const rows = await e2e.sql(viewsQuery('vw_eks_app_logs_'));
    expect(rows.map((r) => Object.values(r)[0]).sort()).toEqual([CMM, OBS]);
  });

  it('kmbl3e2e cannot read a view it was not granted', async () => {
    await expect(e2e.sql(`SELECT COUNT(*) FROM ${DPDPA}`)).rejects.toThrow(/denied|privilege/i);
  });

  it('kmbl3other sees only its view', async () => {
    const other = new Session('kmbl3other');
    await other.login();
    const rows = await other.sql(viewsQuery('vw_eks_app_logs_'));
    expect(rows.map((r) => Object.values(r)[0])).toEqual([DPDPA]);
  });

  it('a user with no grants gets an error, not data', async () => {
    const none = new Session('kmbl3none');
    await none.login();
    // StarRocks rejects the login at the default-database check; datasource 0.1.0 reports "invalid connection"
    await expect(none.sql(viewsQuery('vw_eks_app_logs_'))).rejects.toThrow(/invalid connection|denied|privilege/i);
  });
});

describe('every query kind runs on StarRocks (observability view, level from message)', () => {
  const c = ctx(OBS);

  it('service volume: one row per bucket/service/level, levels detected from the message', async () => {
    const rows = await e2e.sql(serviceVolumeQuery(spec(OBS), c, 'k8s_service_name', 300));
    const services = new Set(rows.map((r) => r.v));
    expect(services).toEqual(new Set(['proxy', 'apilog', 'otel-collector', 'vector', 'loki-gateway']));
    const levels = new Set(rows.map((r) => r.lvl));
    expect(levels).toEqual(new Set(['error', 'warn', 'info', 'debug', 'unknown'].filter((l) => levels.has(l))));
    for (const l of ['error', 'warn', 'info', 'unknown']) {
      expect(levels.has(l)).toBe(true);
    }
  });

  it('service samples: newest lines per service in one UNION ALL', async () => {
    const rows = await e2e.sql(serviceSamplesQuery(spec(OBS), c, 'k8s_service_name', ['proxy', 'vector'], 5));
    expect(rows.filter((r) => r.__value === 'proxy')).toHaveLength(5);
    expect(rows.filter((r) => r.__value === 'vector')).toHaveLength(5);
  });

  it('logs: newest first with microsecond timestamps and line columns', async () => {
    const rows = await e2e.sql(logsQuery(spec(OBS), c, 50, 'desc'));
    expect(rows).toHaveLength(50);
    expect(String(rows[0].__ts)).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{6}$/);
    expect(Number(rows[0].observed_timestamp)).toBeGreaterThanOrEqual(Number(rows[49].observed_timestamp));
    expect(rows[0]).toHaveProperty('k8s_pod_uid');
  });

  it('infinite scroll: the next page (up to the oldest line shown) joins the first, no gaps, overlap deduped', async () => {
    // what the Logs panel does: page 1 over [from, to]; page 2 over [from, oldest line of page 1 in ms]
    const toMs = Date.now();
    const fromMs = toMs - 3_600_000;
    const page = async (to: number, limit: number) => {
      const w = widenToSeconds(fromMs, to);
      return e2e.sql(logsQuery(spec(OBS), c, limit, 'desc', { fromMs, toMs: to }), String(w.fromMs), String(w.toMs));
    };
    const key = (r: Record<string, unknown>) => `${r.__ts}|${r.k8s_pod_uid}|${r.message}`;
    const p1 = await page(toMs, 1000);
    expect(p1).toHaveLength(1000);
    const oldest1 = Number(p1[999].observed_timestamp);
    const p2 = await page(oldest1, 1000);
    expect(p2).toHaveLength(1000);
    // page 2 starts within the last millisecond of page 1 (the overlap is removed by line id)
    expect(Number(p2[0].observed_timestamp)).toBeLessThanOrEqual(oldest1 + 1);
    const merged = new Map([...p1, ...p2].map((r) => [key(r), r]));
    expect(merged.size).toBeGreaterThan(1500);
    // no gap: every line of one 2500-line query down to page 2's oldest millisecond is in the two pages
    const oldest2 = Number(p2[999].observed_timestamp);
    const all = await page(toMs, 2500);
    const expected = all.filter((r) => Number(r.observed_timestamp) > oldest2);
    expect(expected.length).toBeGreaterThan(1500);
    expect(expected.filter((r) => !merged.has(key(r)))).toEqual([]);
  });

  it('glog, logfmt, JSON and upper-case levels are normalised', async () => {
    const rows = await e2e.sql(
      volumeQuery(spec(OBS, { filters: [{ key: 'k8s_service_name', op: '=', value: 'vector' }] }), c, 3600)
    );
    const levels = new Set(rows.map((r) => r.g));
    expect(levels.has('error')).toBe(true); // E1118 ...
    expect(levels.has('info')).toBe(true); // I1118 ...
    const gw = await e2e.sql(
      logsQuery(
        spec(OBS, { filters: [{ key: 'k8s_service_name', op: '=', value: 'loki-gateway' }], levels: ['error'] }),
        c,
        20,
        'desc'
      )
    );
    expect(gw.length).toBeGreaterThan(0);
    gw.forEach((r) => expect(String(r.message)).toContain('"level":"error"'));
  });

  it('line filters: include, exclude, regex, case', async () => {
    const inc = await e2e.sql(
      logsQuery(
        spec(OBS, {
          lineFilters: [{ op: 'include', value: 'UPSTREAM TIMED OUT', caseSensitive: false, regex: false }],
        }),
        c,
        100,
        'desc'
      )
    );
    expect(inc.length).toBeGreaterThan(0);
    inc.forEach((r) => expect(String(r.message).toLowerCase()).toContain('upstream timed out'));
    const cs = await e2e.sql(
      logsQuery(
        spec(OBS, { lineFilters: [{ op: 'include', value: 'UPSTREAM TIMED OUT', caseSensitive: true, regex: false }] }),
        c,
        100,
        'desc'
      )
    );
    expect(cs).toHaveLength(0);
    const exc = await e2e.sql(
      logsQuery(
        spec(OBS, {
          filters: [{ key: 'k8s_service_name', op: '=', value: 'proxy' }],
          lineFilters: [{ op: 'exclude', value: '/healthz', caseSensitive: true, regex: false }],
        }),
        c,
        500,
        'desc'
      )
    );
    exc.forEach((r) => expect(String(r.message)).not.toContain('/healthz'));
    const re = await e2e.sql(
      logsQuery(
        spec(OBS, { lineFilters: [{ op: 'include', value: 'status=5\\d\\d', caseSensitive: true, regex: true }] }),
        c,
        50,
        'desc'
      )
    );
    expect(re.length).toBeGreaterThan(0);
    re.forEach((r) => expect(String(r.message)).toMatch(/status=5\d\d/));
  });

  it('search text with $, %, _ and quotes is matched literally and never breaks the query', async () => {
    for (const value of ['$__interval', '$__timeFilter(x)', "it's", '50%', 'a_b', 'C:\\temp']) {
      const rows = await e2e.sql(
        logsQuery(
          spec(OBS, { lineFilters: [{ op: 'include', value, caseSensitive: true, regex: false }] }),
          c,
          5,
          'desc'
        )
      );
      expect(rows).toHaveLength(0);
    }
    const pct = await e2e.sql(
      logsQuery(
        spec(OBS, { lineFilters: [{ op: 'include', value: 'kong_request_id: "', caseSensitive: true, regex: false }] }),
        c,
        5,
        'desc'
      )
    );
    expect(pct.length).toBe(5);
  });

  it('label filter values cannot inject SQL', async () => {
    const rows = await e2e.sql(
      logsQuery(spec(OBS, { filters: [{ key: 'k8s_service_name', op: '=', value: "x' OR '1'='1" }] }), c, 5, 'desc')
    );
    expect(rows).toHaveLength(0);
  });

  it('labels overview: GROUPING SETS over all label columns in one query', async () => {
    const rows = await e2e.sql(labelOverviewQuery(spec(OBS), c, DEFAULT_LABELS, 3600));
    const gids = new Set(rows.map((r) => Number(r.gid)));
    expect(gids.size).toBeGreaterThanOrEqual(10);
  });

  it('value and message-field breakdowns', async () => {
    const values = await e2e.sql(valueBreakdownQuery(spec(OBS), c, 'k8s_namespace_name', 3600));
    expect(new Set(values.map((r) => r.v))).toEqual(new Set(['kong', 'observability', 'monitoring']));
    const status = await e2e.sql(fieldBreakdownQuery(spec(OBS), c, 'status', 3600));
    expect(new Set(status.map((r) => r.v))).toEqual(new Set(['200', '500', '429']));
  });

  it('patterns: every configured pattern counted in one scan, plus unmatched', async () => {
    const rows = await e2e.sql(patternsQuery(spec(OBS), c, 3600));
    const names = new Set(rows.map((r) => r.p));
    for (const p of ['Request completed', 'Upstream timed out', 'Connection refused', 'Health check', '']) {
      expect(names.has(p)).toBe(true);
    }
  });

  it('show context: same pod, before and after a line', async () => {
    const [line] = await e2e.sql(
      logsQuery(spec(OBS, { filters: [{ key: 'k8s_service_name', op: '=', value: 'apilog' }] }), c, 1, 'desc')
    );
    const back = await e2e.sql(
      contextQuery(OBS, c, 'k8s_pod_uid', String(line.k8s_pod_uid), String(line.__ts), 'backward', 10)
    );
    expect(back).toHaveLength(10);
    back.forEach((r) => expect(r.k8s_pod_uid).toBe(line.k8s_pod_uid));
    expect(String(back[0].__ts) < String(line.__ts)).toBe(true);
  });
});

describe('level column tenant (cmm)', () => {
  it('normalises Warning, fatal, notice and empty level values', async () => {
    const rows = await e2e.sql(volumeQuery(spec(CMM), ctx(CMM), 3600));
    const levels = new Set(rows.map((r) => r.g));
    expect(levels).toEqual(new Set(['error', 'warn', 'info', 'debug', 'unknown']));
  });
});

describe('a second StarRocks database through a second data source instance', () => {
  it('kmbl3e2e sees the views of the second database there', async () => {
    const rows = await e2e.sql(viewsQuery('vw_eks_app_logs_'), 'now-6h', 'now', DS2);
    expect(rows.map((r) => Object.values(r)[0]).sort()).toEqual([PAYMENTS, OBS]);
  });

  it('the same view name in another database is different data', async () => {
    const rows = await e2e.sql(
      serviceVolumeQuery(spec(OBS, {}, DS2), ctx(OBS, DS2), 'k8s_service_name', 3600),
      'now-6h',
      'now',
      DS2
    );
    expect(new Set(rows.map((r) => r.v))).toEqual(new Set(['archive-compactor', 'cold-reader']));
  });

  it('per-database tenant settings: level from the column in db2, from the message in db1', async () => {
    expect(ctx(OBS, DS2).tenant.level.source).toBe('column');
    expect(ctx(OBS, DS).tenant.level.source).toBe('message');
    const rows = await e2e.sql(volumeQuery(spec(OBS, {}, DS2), ctx(OBS, DS2), 3600), 'now-6h', 'now', DS2);
    expect(new Set(rows.map((r) => r.g))).toEqual(new Set(['error', 'warn', 'info']));
  });

  it('a user granted only in db2 is refused by db1 and sees only their view in db2', async () => {
    const db2only = new Session('kmbl3db2only');
    await db2only.login();
    await expect(db2only.sql(viewsQuery('vw_eks_app_logs_'))).rejects.toThrow(/invalid connection|denied|privilege/i);
    const rows = await db2only.sql(viewsQuery('vw_eks_app_logs_'), 'now-6h', 'now', DS2);
    expect(rows.map((r) => Object.values(r)[0])).toEqual([PAYMENTS]);
  });
});
