import { DEFAULT_MESSAGE_LEVEL_REGEX, LEVEL_ALIASES } from '../constants';
import { resolveConfig, resolveTenant } from '../config/config';
import { toJsRegex } from '../datasource/frames';
import { emptySpec } from '../state/types';
import {
  BuildContext,
  contextQuery,
  levelEmptyCond,
  logsQuery,
  serviceSamplesQuery,
  levelExpr,
  levelFilledCond,
  levelSplit,
  sampleCond,
  serviceVolumeQuery,
  volumeQuery,
  whereClause,
} from './builder';

const VIEW = 'vw_eks_app_logs_app_1961_observability';
const COLUMNS = ['observed_timestamp', 'message', 'level', 'k8s_service_name', 'k8s_pod_name', 'k8s_pod_uid'];

function ctx(source: 'message' | 'column', columns = COLUMNS): BuildContext {
  const { config } = resolveConfig({ tenants: { app_1961_observability: { level: { source } } } });
  return { tenant: resolveTenant(config, VIEW), columns, labels: ['k8s_service_name'], fields: ['k8s_pod_name'] };
}

/** What the SQL level expression computes for a line, in JavaScript: first matching rule, then the aliases. */
function levelOf(message: string): string {
  let raw = '';
  for (const re of DEFAULT_MESSAGE_LEVEL_REGEX) {
    const m = toJsRegex(re).exec(message);
    if (m && m[1]) {
      raw = m[1].toLowerCase();
      break;
    }
  }
  const hit = Object.entries(LEVEL_ALIASES).find(([, aliases]) => aliases.includes(raw));
  return hit ? hit[0] : 'unknown';
}

describe('default message level rules (shapes measured on UAT observability)', () => {
  it.each([
    // proxy, nginx error log: 58 % of proxy lines, the level in lower-case brackets
    ['2026/11/24 22:37:42 [info] 140700#0: *21193563 client 10.0.0.1 closed keepalive connection', 'info'],
    ['2026/11/24 22:37:43 [warn] 140700#0: *733 a client request body is buffered to a temporary file', 'warn'],
    ['2026/11/24 22:37:43 [error] 1#0: *9 upstream timed out', 'error'],
    ['2026/11/24 22:37:43 [crit] 1#0: *9 something', 'error'],
    ['2026/11/24 22:37:43 [notice] 1#0: signal process started', 'info'],
    // proxy, access log: no level word; the HTTP status class
    ['10.0.0.1 - - [24/Nov/2026:22:37:43 +0000] "POST /v1/logs HTTP/1.1" 200 0 "-" "OpenTelemetry Collector"', 'info'],
    ['10.0.0.1 - - [24/Nov/2026:22:37:43 +0000] "GET /status HTTP/2.0" 304 0 "-" "kong"', 'info'],
    ['10.0.0.1 - - [24/Nov/2026:22:37:43 +0000] "GET /x HTTP/1.1" 404 12 "-" "curl"', 'warn'],
    ['10.0.0.1 - - [24/Nov/2026:22:37:43 +0000] "POST /v1/traces HTTP/1.1" 503 0 "-" "otel"', 'error'],
    // grafana, distributor: logfmt
    ['logger=ngalert.scheduler t=2026-11-24T22:39:44.08Z level=debug msg="Rule evaluated"', 'debug'],
    ['ts=2026-11-24T22:39:44.2880Z caller=push.go:211 level=error user=x msg="detected an error"', 'error'],
    ['level=warn ts=2026-11-24T22:39:44Z msg="slow request"', 'warn'],
    // JSON and severity keys
    ['{"level":"error","msg":"boom"}', 'error'],
    ['{"severity": "WARNING", "message": "disk"}', 'warn'],
    ['lvl=info msg=started', 'info'],
    // vector, flink: upper-case words
    [
      '2026-11-24T22:39:44.085277Z DEBUG sink{component_kind="sink"}: hyper::client::pool: reuse idle connection',
      'debug',
    ],
    ['2026-11-24 22:39:44,123 INFO  org.apache.flink.runtime.Something - started', 'info'],
    // logrus text format
    ['ERRO[0000] failed to sync', 'error'],
    // otc-container: zap console encoder, the level between tabs
    ['2026-11-24T22:39:44.085Z\terror\tgrpc/server.go:42\tfailed\t{"kind": "exporter"}', 'error'],
    ['2026-11-24T22:39:44.085Z\tinfo\tservice.go:10\tEverything is ready.', 'info'],
    // aws-cluster-autoscaler: glog
    ['E1125 04:09:43.511       1 static_autoscaler.go:300] Failed to scale up', 'error'],
    ['I1125 04:09:43.511       1 main.go:10] started', 'info'],
    ['W1125 04:09:43.511       1 main.go:10] slow', 'warn'],
  ])('%s → %s', (line, level) => {
    expect(levelOf(line)).toBe(level);
  });

  it.each([
    // stack-trace continuation lines carry no level
    ['github.com/foo/bar.(*Server).Run(0xc000123)'],
    ['\t/go/src/app/main.go:42 +0x1d'],
    ['goroutine 1 [running]:'],
    // lower-case words in free text are not levels
    ['user asked for the info page and got an error message'],
  ])('%s stays unknown', (line) => {
    expect(levelOf(line)).toBe('unknown');
  });

  it('every default rule is valid RE2-compatible JavaScript with one capture group', () => {
    const { errors } = resolveConfig({
      tenants: { x: { level: { source: 'message', regex: DEFAULT_MESSAGE_LEVEL_REGEX } } },
    });
    expect(errors).toEqual([]);
  });
});

describe('level split for aggregations (UNION ALL, not CASE)', () => {
  it('column tenants: one branch from the column', () => {
    const parts = levelSplit(ctx('column').tenant, ctx('column'));
    expect(parts).toHaveLength(1);
    expect(parts[0].expr).toContain('lower(trim(`level`))');
    expect(parts[0].cond).toBeUndefined();
  });

  it('message tenants with a level column: filled rows from the column, the others from the message', () => {
    const c = ctx('message');
    const [col, msg] = levelSplit(c.tenant, c);
    expect(col.cond).toBe(levelFilledCond());
    expect(col.expr).not.toContain('regexp_extract');
    expect(msg.cond).toBe(levelEmptyCond());
    expect(msg.expr).toContain('regexp_extract(`message`');
    expect(levelEmptyCond()).toBe("(`level` IS NULL OR trim(`level`) = '')");
  });

  it('message tenants without a level column: one branch from the message', () => {
    const c = ctx(
      'message',
      COLUMNS.filter((x) => x !== 'level')
    );
    expect(levelSplit(c.tenant, c)).toHaveLength(1);
    expect(levelExpr(c.tenant, c)).not.toContain('`level`');
  });

  it('volume query: two GROUP BYs joined with UNION ALL and summed', () => {
    const c = ctx('message');
    const sql = volumeQuery(emptySpec(VIEW), c, 300, true);
    expect(sql.startsWith('SELECT t, g, SUM(c) AS c\nFROM (\nSELECT')).toBe(true);
    expect(sql.match(/UNION ALL/g)).toHaveLength(1);
    expect(sql).toContain(`AND ${levelFilledCond()}`);
    expect(sql).toContain(`AND ${levelEmptyCond()}`);
    expect(sql.endsWith(') u\nGROUP BY t, g\nORDER BY t')).toBe(true);
    // every branch keeps the time filter (partition pruning)
    expect(sql.match(/\$__timeFilter\(`observed_timestamp`\)/g)).toHaveLength(2);
  });

  it('service grid: the same split with the label column; no split for column tenants or without levels', () => {
    const c = ctx('message');
    const split = serviceVolumeQuery(emptySpec(VIEW), c, 'k8s_service_name', 300, true);
    expect(split).toContain('SELECT t, v, lvl, SUM(c) AS c');
    expect(split).toContain('GROUP BY t, v, lvl');
    const column = serviceVolumeQuery(emptySpec(VIEW), ctx('column'), 'k8s_service_name', 300, true);
    expect(column).not.toContain('UNION ALL');
    const plain = serviceVolumeQuery(emptySpec(VIEW), c, 'k8s_service_name', 300, false);
    expect(plain).not.toContain('UNION ALL');
    expect(plain).toContain("'all' AS lvl");
    expect(plain).not.toContain('regexp_extract');
  });

  it('a level filter on a message tenant uses the column-else-message expression', () => {
    const c = ctx('message');
    const w = whereClause({ ...emptySpec(VIEW), levels: ['error'] }, c);
    expect(w).toContain(`CASE WHEN ${levelFilledCond()} THEN lower(trim(\`level\`)) ELSE`);
    expect(w).toContain("IN ('error')");
  });
});

describe('sampling (estimated level counts over long ranges)', () => {
  it('hashes pod and exact time, keeps 1 in n, and multiplies the counts', () => {
    const c = ctx('message');
    expect(sampleCond(c, 10)).toBe('MOD(ABS(murmur_hash3_32(`k8s_pod_uid`, `observed_timestamp`)), 10) = 0');
    const sql = volumeQuery(emptySpec(VIEW), c, 300, true, 10);
    expect(sql.match(/murmur_hash3_32/g)).toHaveLength(2);
    expect(sql).toContain('COUNT(*) * 10 AS c');
    expect(sql).not.toMatch(/COUNT\(\*\) AS c/);
  });

  it('falls back to the pod name, then to time only', () => {
    const noUid = ctx(
      'message',
      COLUMNS.filter((x) => x !== 'k8s_pod_uid')
    );
    expect(sampleCond(noUid, 10)).toContain('murmur_hash3_32(`k8s_pod_name`, `observed_timestamp`)');
    const noPod = ctx('message', ['observed_timestamp', 'message', 'level']);
    expect(sampleCond(noPod, 5)).toBe('MOD(ABS(murmur_hash3_32(`observed_timestamp`)), 5) = 0');
  });

  it('no sampling for n <= 1', () => {
    const sql = volumeQuery(emptySpec(VIEW), ctx('column'), 300, true, 1);
    expect(sql).not.toContain('murmur_hash3_32');
    expect(sql).toContain('COUNT(*) AS c');
  });
});

describe('show context tie-break (same pod, same microsecond)', () => {
  const c = ctx('column');
  const ts = '2026-11-24 22:37:43.157123';

  it('backward: older lines, and same-microsecond lines whose message sorts before, nearest first', () => {
    const sql = contextQuery(VIEW, c, 'k8s_pod_uid', 'u1', ts, 'backward', 100, 'b message');
    expect(sql).toContain(
      "(`observed_timestamp` < CAST('2026-11-24 22:37:43.157123' AS DATETIME) OR (`observed_timestamp` = CAST('2026-11-24 22:37:43.157123' AS DATETIME) AND `message` < 'b message'))"
    );
    expect(sql).toContain('ORDER BY `observed_timestamp` DESC, `message` DESC');
    expect(sql).toContain('`observed_timestamp` >= DATE_SUB(');
    expect(sql).toContain("`k8s_pod_uid` = 'u1'");
  });

  it('forward: newer lines, and same-microsecond lines whose message sorts after', () => {
    const sql = contextQuery(VIEW, c, 'k8s_pod_uid', 'u1', ts, 'forward', 100, "it's");
    expect(sql).toContain("AND `message` > 'it\\'s'))");
    expect(sql).toContain('ORDER BY `observed_timestamp` ASC, `message` ASC');
    expect(sql).toContain('`observed_timestamp` <= DATE_ADD(');
  });

  it('without a message: strict time comparison only', () => {
    const sql = contextQuery(VIEW, c, 'k8s_pod_name', 'p', ts, 'backward', 10);
    expect(sql).toContain("`observed_timestamp` < CAST('2026-11-24 22:37:43.157123' AS DATETIME) AND");
    expect(sql).toContain('ORDER BY `observed_timestamp` DESC\n');
  });

  it('a message with $ cannot expand into a macro', () => {
    const sql = contextQuery(VIEW, c, 'k8s_pod_uid', 'u1', ts, 'forward', 10, 'cost $__interval');
    expect(sql).not.toContain('$__interval');
    expect(sql).toContain("concat('cost ', '$', '__interval')");
  });
});

describe('top-N lines: the level is computed on the returned rows only (UAT H.6)', () => {
  /** inner (top-N on raw columns) and outer (expressions) parts of a lines query */
  function parts(sql: string) {
    const start = sql.indexOf('FROM (\n') + 'FROM ('.length;
    const end = sql.lastIndexOf('\n) l\n');
    return { outer: sql.slice(0, start) + sql.slice(end), inner: sql.slice(start, end).trim() };
  }

  it('logs: raw columns inside ORDER BY ... LIMIT, the level regexp and the times outside', () => {
    const c = ctx('message');
    const sql = logsQuery(emptySpec(VIEW), c, 1000, 'desc');
    const { inner, outer } = parts(sql);
    expect(inner).toContain(
      'SELECT `observed_timestamp`, `message`, `level`, `k8s_service_name`, `k8s_pod_name`\nFROM `vw_eks_app_logs_app_1961_observability`'
    );
    expect(inner).toContain('ORDER BY `observed_timestamp` DESC\nLIMIT 1000');
    expect(inner).not.toContain('regexp_extract');
    expect(inner).not.toContain('UNIX_TIMESTAMP');
    expect(outer).toContain('regexp_extract(`message`');
    expect(outer).toContain('AS detected_level');
    expect(outer).toContain('AS __ms');
    expect(sql.endsWith(') l\nORDER BY `observed_timestamp` DESC\nLIMIT 1000')).toBe(true);
    expect(sql).not.toContain('UNION ALL');
  });

  it('a level filter on a message tenant: one top-N per level source, no CASE in WHERE', () => {
    const c = ctx('message');
    const sql = logsQuery({ ...emptySpec(VIEW), levels: ['error'] }, c, 100, 'asc');
    const branches = parts(sql).inner.split('\nUNION ALL\n');
    expect(branches).toHaveLength(2);
    const [col, msg] = branches;
    // the level source right after the time filter, before the level filter
    expect(col).toContain(`WHERE $__timeFilter(\`observed_timestamp\`)\n  AND ${levelFilledCond()}\n  AND (CASE lower`);
    expect(col).not.toContain('regexp_extract');
    expect(col).toMatch(/lower\(trim\(`level`\)\).*IN \('error'\)/s);
    expect(msg).toContain(
      `WHERE $__timeFilter(\`observed_timestamp\`)\n  AND ${levelEmptyCond()}\n  AND (CASE lower(coalesce(`
    );
    expect(msg).toContain('regexp_extract(`message`');
    for (const b of branches) {
      expect(b).toMatch(/^\(SELECT /);
      expect(b).toContain('ORDER BY `observed_timestamp` ASC\nLIMIT 100)');
      expect(b).not.toContain('CASE WHEN');
    }
    expect(sql.endsWith(') l\nORDER BY `observed_timestamp` ASC\nLIMIT 100')).toBe(true);
  });

  it('column tenants and message tenants without a level column: one top-N even with a level filter', () => {
    const levels = { ...emptySpec(VIEW), levels: ['warn'] };
    expect(logsQuery(levels, ctx('column'), 10, 'desc')).not.toContain('UNION ALL');
    const noLevel = ctx(
      'message',
      COLUMNS.filter((x) => x !== 'level')
    );
    const sql = logsQuery(levels, noLevel, 10, 'desc');
    expect(sql).not.toContain('UNION ALL');
    expect(parts(sql).inner).not.toContain('`level`');
  });

  it('service samples: one top-N per value, the value column read inside and returned as __value', () => {
    const c = ctx('message');
    const sql = serviceSamplesQuery(emptySpec(VIEW), c, 'k8s_service_name', ['a', 'b'], 10);
    const values = sql.split(/\n\) l\nORDER BY `observed_timestamp` DESC\nLIMIT 10\)\nUNION ALL\n/);
    expect(values).toHaveLength(2);
    expect(sql).toContain("`k8s_service_name` = 'a'");
    expect(sql).toContain("`k8s_service_name` = 'b'");
    expect(sql.match(/`k8s_service_name` AS __value/g)).toHaveLength(2);
    expect(sql.match(/LIMIT 10/g)).toHaveLength(4);
  });

  it('show context: the pod column is read inside, the level computed outside', () => {
    const sql = contextQuery(
      VIEW,
      ctx('message'),
      'k8s_pod_uid',
      'u1',
      '2026-11-24 22:37:43.157123',
      'backward',
      50,
      'm'
    );
    const { inner, outer } = parts(sql);
    expect(inner).toContain('`k8s_pod_uid`');
    expect(inner).not.toContain('regexp_extract');
    expect(outer).toContain('regexp_extract');
    expect(sql.endsWith(') l\nORDER BY `observed_timestamp` DESC, `message` DESC\nLIMIT 50')).toBe(true);
  });
});

describe('aggregations with a level filter (UAT H.5)', () => {
  it('a level filter without the level split: still split by level source, each branch filtering its own way', () => {
    const c = ctx('message');
    const sql = volumeQuery({ ...emptySpec(VIEW), levels: ['error', 'warn'] }, c, 300, false);
    const branches = sql.split('\nUNION ALL\n');
    expect(branches).toHaveLength(2);
    expect(branches[0]).toContain("'all' AS g");
    expect(branches[0]).not.toContain('regexp_extract');
    expect(branches[1]).toContain('regexp_extract(`message`');
    expect(sql).not.toContain('CASE WHEN');
  });

  it('with the level split, the filter uses the branch expression too', () => {
    const c = ctx('message');
    const sql = serviceVolumeQuery({ ...emptySpec(VIEW), levels: ['error'] }, c, 'k8s_service_name', 300, true);
    expect(sql).not.toContain('CASE WHEN');
    expect(sql.match(/IN \('error'\)/g)).toHaveLength(2);
  });

  it('no level filter and no split: one plain GROUP BY', () => {
    const sql = volumeQuery(emptySpec(VIEW), ctx('message'), 300, false);
    expect(sql).not.toContain('UNION ALL');
    expect(sql).not.toContain('regexp_extract');
  });
});
