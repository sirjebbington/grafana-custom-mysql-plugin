/**
 * API-level end-to-end checks: signs in through the mock IDAM as different users and runs the SQL produced by
 * src/sql/builder.ts through Grafana's /api/ds/query and the unchanged kotak-starrocks-datasource, against
 * the seeded StarRocks (scripts/e2e.sh up). Run with: npx jest -c jest.smoke.config.js
 */
import { resolveConfig, resolveTenant, AppJsonData } from '../../src/config/config';
import {
  anyBeforeQuery,
  BuildContext,
  contextQuery,
  fieldBreakdownQuery,
  labelOverviewQuery,
  levelExpr,
  logsQuery,
  oldestInRangeQuery,
  patternsQuery,
  planWindows,
  serviceSamplesQuery,
  timeMsExpr,
  serviceVolumeQuery,
  valueBreakdownQuery,
  viewsQuery,
  volumeQuery,
  widenToSeconds,
} from '../../src/sql/builder';
import { findOldest } from '../../src/datasource/oldestSearch';
import { appHint, detectMode, DS, DS2, Session, setDefaultHint } from './helpers';
import { DEFAULT_FIELDS, DEFAULT_LABELS } from '../../src/constants';
import { emptySpec, QuerySpec } from '../../src/state/types';

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
// what the seed's views are like (seed.py VIEW_TIME / FE_TIME_ZONE)
const VIEW_TIME = process.env.VIEW_TIME ?? 'session';
const FE_TIME_ZONE = process.env.FE_TIME_ZONE ?? 'Asia/Kolkata';

beforeAll(async () => {
  await e2e.login();
  // like the app: detect each database's time column kind, then send that hint with every statement
  setDefaultHint(DS, appHint(await detectMode(e2e, OBS, DS)));
  setDefaultHint(DS2, appHint(await detectMode(e2e, OBS, DS2)));
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
    expect(Number(rows[0].__ms)).toBeGreaterThanOrEqual(Number(rows[49].__ms));
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
    const oldest1 = Number(p1[999].__ms);
    const p2 = await page(oldest1, 1000);
    expect(p2).toHaveLength(1000);
    // page 2 starts within the last millisecond of page 1 (the overlap is removed by line id)
    expect(Number(p2[0].__ms)).toBeLessThanOrEqual(oldest1 + 1);
    const merged = new Map([...p1, ...p2].map((r) => [key(r), r]));
    expect(merged.size).toBeGreaterThan(1500);
    // no gap: every line of one 2500-line query down to page 2's oldest millisecond is in the two pages
    const oldest2 = Number(p2[999].__ms);
    const all = await page(toMs, 2500);
    const expected = all.filter((r) => Number(r.__ms) > oldest2);
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

describe(`time zone: session ${FE_TIME_ZONE}, views show the time column as "${VIEW_TIME}"`, () => {
  const c = ctx(OBS);
  // otel-collector lines carry their UTC time in the message (ts=...Z), like the UAT screenshots
  const otel = spec(OBS, { filters: [{ key: 'k8s_service_name', op: '=', value: 'otel-collector' }] });
  const inMessage = (r: Record<string, unknown>) => Date.parse(/ts=(\S+?)\d{3}Z/.exec(String(r.message))![1] + 'Z');
  const sessionOffsetMin = FE_TIME_ZONE === 'Asia/Kolkata' ? 330 : 0;

  it('the session zone is the FE default', async () => {
    const [tz] = await e2e.sql('SELECT @@time_zone AS tz', 'now-6h', 'now', DS, { hint: '' });
    expect(tz.tz).toBe(FE_TIME_ZONE);
  });

  it('the probe tells the kind of time column: instant (timestamptz) or wall clock in IST or UTC', async () => {
    const mode = await detectMode(e2e, OBS, DS);
    const expected = {
      session: { kind: 'aware' },
      ist: { kind: 'naive', offsetMinutes: 330 },
      utc: { kind: 'naive', offsetMinutes: 0 },
    };
    expect(mode).toEqual(expected[VIEW_TIME as keyof typeof expected]);
  });

  it('with the app hint, every line time (__ms) is the time written in the message, and __ts is the same instant', async () => {
    const rows = await e2e.sql(logsQuery(otel, c, 200, 'desc'), 'now-12h', 'now+12h');
    expect(rows.length).toBe(200);
    rows.forEach((r) => expect(Number(r.__ms)).toBe(inMessage(r)));
  });

  it('the time filter (FROM_UNIXTIME in the same zone) selects lines by their real time', async () => {
    const [newest] = await e2e.sql(logsQuery(otel, c, 1, 'desc'), 'now-12h', 'now+12h');
    const to = Number(newest.__ms) + 1000;
    const from = to - 15 * 60_000;
    const rows = await e2e.sql(logsQuery(otel, c, 5000, 'desc'), String(from), String(to));
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => {
      expect(inMessage(r)).toBeGreaterThanOrEqual(from - 1000);
      expect(inMessage(r)).toBeLessThanOrEqual(to);
    });
    // and nothing in that window is missing: count by message time over a wider window
    const wide = await e2e.sql(logsQuery(otel, c, 5000, 'desc'), String(from - 3_600_000), String(to + 60_000));
    const inWindow = wide.filter((r) => inMessage(r) >= from - 1000 + 1000 && inMessage(r) <= to - 1000);
    const got = new Set(rows.map((r) => String(r.message)));
    expect(inWindow.filter((r) => !got.has(String(r.message)))).toEqual([]);
  });

  it('0.3.0 read the raw DATETIME as UTC: off by the zone the view shows it in', async () => {
    const [raw] = await e2e.sql(
      `SELECT observed_timestamp, message FROM ${OBS} WHERE k8s_service_name = 'otel-collector' ORDER BY observed_timestamp DESC LIMIT 1`,
      'now-1h',
      'now',
      DS,
      { hint: '' }
    );
    const shownIn = { session: sessionOffsetMin, ist: 330, utc: 0 }[VIEW_TIME] ?? 0;
    expect(Math.round((Number(raw.observed_timestamp) - inMessage(raw)) / 60_000)).toBe(shownIn);
  });

  it('a hinted statement also sets query_timeout', async () => {
    const [r] = await e2e.sql('SELECT @@query_timeout AS qt');
    expect(r.qt).toBe(120);
  });
});

describe('newest-first windowed search (text filters over long ranges)', () => {
  const c = ctx(OBS);
  const text = spec(OBS, { lineFilters: [{ op: 'include', value: 'timed out', caseSensitive: false, regex: false }] });

  it('the windows together return exactly the lines of one query over the whole range', async () => {
    const toMs = Date.now();
    const fromMs = toMs - 4 * 3_600_000;
    const windows = planWindows(fromMs, toMs, 'desc');
    expect(windows.length).toBeGreaterThan(1);
    const run = async (fromW: number, toW: number, limit: number) => {
      const w = widenToSeconds(fromW, toW);
      return e2e.sql(logsQuery(text, c, limit, 'desc', { fromMs: fromW, toMs: toW }), String(w.fromMs), String(w.toMs));
    };
    const whole = await run(fromMs, toMs, 5000);
    expect(whole.length).toBeGreaterThan(20);
    const parts: Array<Record<string, unknown>> = [];
    for (const w of windows) {
      parts.push(...(await run(w.fromMs, w.toMs, 5000)));
    }
    const key = (r: Record<string, unknown>) => `${r.__ts}|${r.k8s_pod_uid}|${r.message}`;
    expect(parts.map(key)).toEqual(whole.map(key));
  });

  it('the newest window alone gives the newest lines when it has enough', async () => {
    const toMs = Date.now();
    const [newest] = planWindows(toMs - 4 * 3_600_000, toMs, 'desc');
    const w = widenToSeconds(newest.fromMs, newest.toMs);
    const first = await e2e.sql(logsQuery(text, c, 10, 'desc', newest), String(w.fromMs), String(w.toMs));
    const ww = widenToSeconds(toMs - 4 * 3_600_000, toMs);
    const whole = await e2e.sql(
      logsQuery(text, c, 10, 'desc', { fromMs: toMs - 4 * 3_600_000, toMs }),
      String(ww.fromMs),
      String(ww.toMs)
    );
    expect(first.map((r) => r.__ts)).toEqual(whole.map((r) => r.__ts));
  });
});

describe('oldest line of a view ("Oldest log")', () => {
  it('LIMIT 1 probes and a MIN over one hour find the same time as MIN over the whole view', async () => {
    const [{ oldest: expected }] = await e2e.sql(
      `SELECT ${timeMsExpr('MIN(observed_timestamp)')} AS oldest FROM ${OBS}`
    );
    let probes = 0;
    const anyBefore = async (ms: number) => {
      probes++;
      return (await e2e.sql(anyBeforeQuery(OBS, ms))).length > 0;
    };
    const oldestIn = async (a: number, b: number) => {
      const [r] = await e2e.sql(oldestInRangeQuery(OBS, a, b));
      return r?.oldest === null || r?.oldest === undefined ? undefined : Number(r.oldest);
    };
    const found = await findOldest(Date.now(), anyBefore, oldestIn);
    expect(found).toBe(Number(expected));
    expect(probes).toBeLessThan(15);
  });
});

describe('cancelling', () => {
  it('a cancelled request stops the StarRocks query (the data source closes the connection)', async () => {
    const marker = `cancel_probe_${Date.now()}`;
    const ctl = new AbortController();
    const running = e2e.sql(`SELECT sleep(30) AS ${marker}`, 'now-1h', 'now', DS, { signal: ctl.signal });
    running.catch(() => undefined);
    const listed = async () =>
      (await e2e.sql('SHOW FULL PROCESSLIST', 'now-1h', 'now', DS, { hint: '' })).some((r) =>
        String(r.Info ?? '').includes(marker)
      );
    let seen = false;
    for (let i = 0; i < 20 && !seen; i++) {
      await new Promise((r) => setTimeout(r, 250));
      seen = await listed();
    }
    expect(seen).toBe(true);
    ctl.abort();
    let gone = false;
    for (let i = 0; i < 40 && !gone; i++) {
      await new Promise((r) => setTimeout(r, 250));
      gone = !(await listed());
    }
    expect(gone).toBe(true);
  }, 30_000);
});

describe('0.0.1 SQL on StarRocks (level split, sampling, HTTP status levels, context ties)', () => {
  const c = ctx(OBS);
  const sumBy = (rows: Array<Record<string, unknown>>, key: string) => {
    const m: Record<string, number> = {};
    rows.forEach((r) => (m[String(r[key])] = (m[String(r[key])] ?? 0) + Number(r.c)));
    return m;
  };

  it('the UNION ALL level split counts exactly what one CASE expression counts', async () => {
    const split = await e2e.sql(volumeQuery(spec(OBS), c, 3600, true), 'now-6h', 'now');
    const caseSql = [
      `SELECT (UNIX_TIMESTAMP(observed_timestamp) DIV 3600) * 3600 AS t, ${levelExpr(c.tenant, c)} AS g, COUNT(*) AS c`,
      `FROM ${OBS} WHERE $__timeFilter(observed_timestamp) GROUP BY t, g`,
    ].join('\n');
    const single = await e2e.sql(caseSql, 'now-6h', 'now');
    expect(sumBy(split, 'g')).toEqual(sumBy(single, 'g'));
    expect(Object.keys(sumBy(split, 'g')).length).toBeGreaterThan(2);
  });

  it('a level column tenant (cmm) needs no split, and the split SQL on it gives the same counts', async () => {
    const cc = ctx(CMM);
    const column = await e2e.sql(volumeQuery(spec(CMM), cc, 3600, true), 'now-6h', 'now');
    const asMessage = {
      ...cc,
      tenant: { ...cc.tenant, level: { source: 'message' as const, regex: c.tenant.level.regex } },
    };
    const split = await e2e.sql(volumeQuery(spec(CMM), asMessage, 3600, true), 'now-6h', 'now');
    // every cmm row has a filled level column, so the message branch adds nothing
    expect(sumBy(split, 'g')).toEqual(sumBy(column, 'g'));
  });

  it('a level filter on lines: one top-N per level source gives exactly the lines of one CASE query (mixed level column)', async () => {
    // cmm read as a "message" tenant: most rows have the level column, about 1 in 13 has it empty
    const cc = ctx(CMM);
    const asMessage = {
      ...cc,
      tenant: { ...cc.tenant, level: { source: 'message' as const, regex: c.tenant.level.regex } },
    };
    const filtered = spec(CMM, { levels: ['error', 'unknown'] });
    const key = (r: Record<string, unknown>) => `${r.__ts}|${r.k8s_pod_uid}|${r.message}`;
    const oneCase = (limit: number) =>
      [
        'SELECT CAST(observed_timestamp AS VARCHAR) AS __ts, k8s_pod_uid, message',
        `FROM ${CMM} WHERE $__timeFilter(observed_timestamp)`,
        `  AND ${levelExpr(asMessage.tenant, asMessage)} IN ('error', 'unknown')`,
        `ORDER BY observed_timestamp DESC LIMIT ${limit}`,
      ].join('\n');
    // every matching line (the limit is above the match count)
    const split = await e2e.sql(logsQuery(filtered, asMessage, 8000, 'desc'), 'now-6h', 'now');
    const single = await e2e.sql(oneCase(8000), 'now-6h', 'now');
    expect(split.length).toBeGreaterThan(1000);
    expect(split.length).toBeLessThan(8000);
    expect(split.map(key).sort()).toEqual(single.map(key).sort());
    // both branches contribute: filled ERROR / fatal rows and empty-level rows
    const levels = new Set(split.map((r) => r.detected_level));
    expect(levels).toEqual(new Set(['error', 'unknown']));
    // the top 50: the same newest times, in order
    const top = await e2e.sql(logsQuery(filtered, asMessage, 50, 'desc'), 'now-6h', 'now');
    const topCase = await e2e.sql(oneCase(50), 'now-6h', 'now');
    expect(top.map((r) => r.__ts)).toEqual(topCase.map((r) => r.__ts));
  });

  it('the 10 % hash sample estimates the counts within 15 %', async () => {
    const full = await e2e.sql(volumeQuery(spec(OBS), c, 3600, true), 'now-6h', 'now');
    const sampled = await e2e.sql(volumeQuery(spec(OBS), c, 3600, true, 10), 'now-6h', 'now');
    const total = (rows: Array<Record<string, unknown>>) => rows.reduce((a, r) => a + Number(r.c), 0);
    expect(Math.abs(total(sampled) - total(full)) / total(full)).toBeLessThan(0.15);
    sampled.forEach((r) => expect(Number(r.c) % 10).toBe(0));
  });

  it('proxy access logs get their level from the HTTP status class', async () => {
    const proxy = spec(OBS, { filters: [{ key: 'k8s_service_name', op: '=', value: 'proxy' }] });
    const levels = sumBy(await e2e.sql(volumeQuery(proxy, c, 3600, true), 'now-6h', 'now'), 'g');
    expect(levels.info).toBeGreaterThan(0);
    expect((levels.warn ?? 0) + (levels.error ?? 0)).toBeGreaterThan(0);
    expect(levels.unknown ?? 0).toBeLessThan(0.05 * Object.values(levels).reduce((a, b) => a + b, 0));
  });

  it('show context: lines tied on the exact microsecond are ordered by message on the right side of the anchor', async () => {
    const [b] = await e2e.sql(
      `SELECT CAST(observed_timestamp AS VARCHAR) AS __ts, message FROM ${OBS} WHERE k8s_pod_name = 'tie-pod-0' AND message = 'tie line B'`
    );
    const ts = String(b.__ts);
    const back = await e2e.sql(contextQuery(OBS, c, 'k8s_pod_name', 'tie-pod-0', ts, 'backward', 10, 'tie line B'));
    expect(back.map((r) => r.message)).toEqual(['tie line A', 'tie before']);
    const fwdFromA = await e2e.sql(contextQuery(OBS, c, 'k8s_pod_name', 'tie-pod-0', ts, 'forward', 10, 'tie line A'));
    expect(fwdFromA.map((r) => r.message)).toEqual(['tie line B', 'tie after']);
    // the old strict comparison loses the tied line
    const strict = await e2e.sql(contextQuery(OBS, c, 'k8s_pod_name', 'tie-pod-0', ts, 'backward', 10));
    expect(strict.map((r) => r.message)).toEqual(['tie before']);
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
