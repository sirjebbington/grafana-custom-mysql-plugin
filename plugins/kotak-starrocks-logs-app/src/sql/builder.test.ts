import { resolveConfig, resolveTenant } from '../config/config';
import { emptySpec, QuerySpec } from '../state/types';
import {
  anyBeforeQuery,
  BuildContext,
  contextQuery,
  escapeRegex,
  labelOverviewQuery,
  levelExpr,
  containsCond,
  lit,
  logsQuery,
  messageFieldRegex,
  needsMessageScan,
  newestTimeTextQuery,
  oldestInRangeQuery,
  patternsQuery,
  pickBucketSeconds,
  planWindows,
  preciseTimeBounds,
  queryHint,
  quoteIdent,
  serviceSamplesQuery,
  serviceVolumeQuery,
  volumeQuery,
  whereClause,
  widenToSeconds,
  withQueryHint,
} from './builder';

const VIEW = 'vw_eks_app_logs_app_1961_observability';
const COLUMNS = [
  'observed_timestamp',
  'message',
  'level',
  'k8s_service_name',
  'k8s_namespace_name',
  'k8s_pod_uid',
  'k8s_pod_name',
];

function ctx(jsonData = {}): BuildContext {
  const { config } = resolveConfig({
    tenants: {
      app_1961_observability: {
        level: { source: 'message' },
        patterns: [
          { name: 'timeout', like: '%timed out%' },
          { name: '5xx', regex: '" 5[0-9]{2} ' },
        ],
      },
    },
    ...jsonData,
  });
  return {
    tenant: resolveTenant(config, VIEW),
    columns: COLUMNS,
    labels: ['k8s_service_name', 'k8s_namespace_name'],
    fields: ['k8s_pod_name', 'k8s_pod_uid'],
  };
}

function spec(p: Partial<QuerySpec> = {}): QuerySpec {
  return { ...emptySpec(VIEW), ...p };
}

describe('quoting', () => {
  it('quotes identifiers and rejects anything else', () => {
    expect(quoteIdent('k8s_pod_name')).toBe('`k8s_pod_name`');
    expect(() => quoteIdent('a`; DROP TABLE x; --')).toThrow();
    expect(() => quoteIdent('a b')).toThrow();
  });

  it('escapes quotes and backslashes in literals', () => {
    expect(lit("it's")).toBe("'it\\'s'");
    expect(lit('a\\b')).toBe("'a\\\\b'");
    expect(lit("x' OR '1'='1")).toBe("'x\\' OR \\'1\\'=\\'1'");
  });

  it('splits $ out of literals so the datasource does not expand macros inside them', () => {
    expect(lit('cost $__interval(x)')).toBe("concat('cost ', '$', '__interval(x)')");
    expect(lit('^a$')).toBe("concat('^a', '$')");
    expect(lit('$')).toBe("concat('$')");
  });

  it('uses LIKE for plain text and instr() when the text has LIKE metacharacters', () => {
    expect(containsCond('`message`', 'timed out')).toBe("`message` LIKE '%timed out%'");
    expect(containsCond('`message`', '50%_off')).toBe("instr(`message`, '50%_off') > 0");
    expect(containsCond('`message`', 'C:\\temp')).toBe("instr(`message`, 'C:\\\\temp') > 0");
    expect(escapeRegex('a.b(c)')).toBe('a\\.b\\(c\\)');
  });
});

describe('level expression', () => {
  it('reads the level column for column tenants', () => {
    const c = ctx({ tenants: {} });
    expect(c.tenant.level.source).toBe('column');
    expect(levelExpr(c.tenant)).toContain('lower(trim(`level`))');
    expect(levelExpr(c.tenant)).toContain("WHEN 'warning' THEN 'warn'");
    expect(levelExpr(c.tenant)).toContain("ELSE 'unknown' END");
  });

  it('extracts the level from the message with the default regexes for message tenants', () => {
    const expr = levelExpr(ctx().tenant);
    expect(expr).toContain('regexp_extract(`message`');
    expect(expr).toContain('FATAL|ERROR|WARN');
    expect(expr).not.toContain('`level`');
  });
});

describe('where clause', () => {
  it('starts with the time filter macro and groups = filters on the same column', () => {
    const w = whereClause(
      spec({
        filters: [
          { key: 'k8s_service_name', op: '=', value: 'proxy' },
          { key: 'k8s_service_name', op: '=', value: 'apilog' },
          { key: 'k8s_namespace_name', op: '!=', value: 'kube-system' },
        ],
      }),
      ctx()
    );
    expect(w.startsWith('$__timeFilter(`observed_timestamp`)')).toBe(true);
    expect(w).toContain("`k8s_service_name` IN ('proxy', 'apilog')");
    expect(w).toContain("`k8s_namespace_name` != 'kube-system'");
  });

  it('drops filters on unknown or invalid columns', () => {
    const w = whereClause(
      spec({
        filters: [
          { key: 'not_a_column', op: '=', value: 'x' },
          { key: 'x;y', op: '=', value: 'x' },
        ],
      }),
      ctx()
    );
    expect(w).toBe('$__timeFilter(`observed_timestamp`)');
  });

  it('builds regex label filters anchored', () => {
    const w = whereClause(spec({ filters: [{ key: 'k8s_service_name', op: '=~', value: 'api.*' }] }), ctx());
    expect(w).toContain("regexp(`k8s_service_name`, concat('^(?:api.*)', '$'))");
  });

  it('builds line filters: case-insensitive by default, exclude, regex', () => {
    const w = whereClause(
      spec({
        lineFilters: [
          { op: 'include', value: 'Timeout', caseSensitive: false, regex: false },
          { op: 'exclude', value: 'health', caseSensitive: true, regex: false },
          { op: 'include', value: 'time.?out', caseSensitive: false, regex: true },
        ],
      }),
      ctx()
    );
    expect(w).toContain("lower(`message`) LIKE '%timeout%'");
    expect(w).toContain("NOT (`message` LIKE '%health%')");
    expect(w).toContain("regexp(`message`, '(?i)time.?out')");
  });

  it('ORs included patterns and ANDs excluded ones; ignores unknown pattern names', () => {
    const w = whereClause(
      spec({
        patternFilters: [
          { name: 'timeout', op: 'include' },
          { name: '5xx', op: 'exclude' },
          { name: 'nope', op: 'include' },
        ],
      }),
      ctx()
    );
    expect(w).toContain("(`message` LIKE '%timed out%')");
    expect(w).toContain("NOT (regexp(`message`, '\" 5[0-9]{2} '))");
    expect(w).not.toContain('nope');
  });

  it('filters levels through the level expression, but not when all levels are selected', () => {
    expect(whereClause(spec({ levels: ['error', 'warn'] }), ctx())).toContain("END) IN ('error', 'warn')");
    expect(whereClause(spec({ levels: ['error', 'warn', 'info', 'debug', 'unknown'] }), ctx())).not.toContain('IN (');
  });

  it('builds message field filters as anchored key/value regexes', () => {
    const w = whereClause(spec({ fieldFilters: [{ key: 'status', op: '=', value: '500' }] }), ctx());
    expect(w).toContain('regexp(`message`');
    expect(w).toContain('status');
    expect(messageFieldRegex('status', '500')).toBe('(^|[\\s{,;])"?status"?\\s*[=:]\\s*"?500("|\\s|,|;|}|$)');
  });
});

describe('queries', () => {
  it('service volume groups by bucket, label and level in one query', () => {
    const q = serviceVolumeQuery(spec(), ctx(), 'k8s_service_name', 60);
    expect(q).toContain('(UNIX_TIMESTAMP(`observed_timestamp`) DIV 60) * 60 AS t');
    expect(q).toContain('`k8s_service_name` AS v');
    expect(q).toContain('GROUP BY t, v, lvl');
    expect(q).toContain('FROM `vw_eks_app_logs_app_1961_observability`');
  });

  it('can skip the level split', () => {
    expect(serviceVolumeQuery(spec(), ctx(), 'k8s_service_name', 60, false)).toContain("'all' AS lvl");
    expect(volumeQuery(spec(), ctx(), 60, false)).toContain("'all' AS g");
  });

  it('service samples are a UNION ALL of top-N queries per value', () => {
    const q = serviceSamplesQuery(spec(), ctx(), 'k8s_service_name', ['a', "b'c"], 5);
    expect(q.split('UNION ALL')).toHaveLength(2);
    expect(q).toContain("`k8s_service_name` = 'b\\'c'");
    expect(q).toContain('LIMIT 5)');
  });

  it('logs query selects the line columns and sorts', () => {
    const q = logsQuery(spec(), ctx(), 1000, 'asc');
    expect(q).toContain('CAST(`observed_timestamp` AS VARCHAR) AS __ts');
    expect(q).toContain('AS detected_level');
    expect(q).toContain('`k8s_pod_uid`');
    expect(q).toContain('ORDER BY `observed_timestamp` ASC');
    expect(q).toContain('LIMIT 1000');
  });

  it('logs query with bounds adds exact microsecond bounds (infinite scroll pages must not skip or repeat lines)', () => {
    // 2026-11-20 10:00:00.250 .. 10:05:00.999
    const q = logsQuery(spec(), ctx(), 1000, 'desc', { fromMs: 1_763_632_800_250, toMs: 1_763_633_100_999 });
    expect(q).toContain('$__timeFilter(`observed_timestamp`)');
    expect(q).toContain('`observed_timestamp` >= microseconds_add(FROM_UNIXTIME(1763632800), 250000)');
    // the end is inclusive to the millisecond: < end + 1 ms
    expect(q).toContain('`observed_timestamp` < microseconds_add(FROM_UNIXTIME(1763633101), 0)');
  });

  it('precise bounds and the widened macro range', () => {
    expect(preciseTimeBounds(1000.7, 2999)).toEqual([
      '`observed_timestamp` >= microseconds_add(FROM_UNIXTIME(1), 0)',
      '`observed_timestamp` < microseconds_add(FROM_UNIXTIME(3), 0)',
    ]);
    // the macro truncates to seconds, so its range is widened to whole seconds around [from, to + 1 ms)
    expect(widenToSeconds(1250, 4999)).toEqual({ fromMs: 1000, toMs: 5000 });
    expect(widenToSeconds(1250, 5000)).toEqual({ fromMs: 1000, toMs: 6000 });
  });

  it('label overview uses GROUPING SETS over present labels', () => {
    const q = labelOverviewQuery(spec(), ctx(), ['k8s_service_name', 'k8s_namespace_name', 'missing'], 300);
    expect(q).toContain('GROUPING_ID(`k8s_service_name`, `k8s_namespace_name`) AS gid');
    expect(q).toContain('GROUP BY GROUPING SETS ((t, `k8s_service_name`), (t, `k8s_namespace_name`))');
    expect(q).not.toContain('missing');
  });

  it('patterns query has one CASE branch per pattern and ignores pattern filters', () => {
    const q = patternsQuery(spec({ patternFilters: [{ name: 'timeout', op: 'include' }] }), ctx(), 60);
    expect(q).toContain("WHEN `message` LIKE '%timed out%' THEN 'timeout'");
    expect(q).toContain("ELSE '' END AS p");
    expect(q.split('WHERE')[1]).not.toContain('timed out');
  });

  it('context query looks one hour before/after on the same pod with the exact timestamp', () => {
    const back = contextQuery(VIEW, ctx(), 'k8s_pod_uid', 'u-1', '2026-11-18 17:04:11.121232', 'backward', 20);
    expect(back).toContain("`k8s_pod_uid` = 'u-1'");
    expect(back).toContain("`observed_timestamp` < CAST('2026-11-18 17:04:11.121232' AS DATETIME)");
    expect(back).toContain('DATE_SUB(');
    expect(back).toContain('DESC');
    const fwd = contextQuery(VIEW, ctx(), 'k8s_pod_uid', 'u-1', '2026-11-18 17:04:11.121232', 'forward', 20);
    expect(fwd).toContain('> CAST(');
    expect(fwd).toContain('ASC');
  });
});

describe('scan detection and buckets', () => {
  it('knows which queries read the message', () => {
    const msg = ctx().tenant;
    const col = ctx({ tenants: {} }).tenant;
    expect(needsMessageScan(spec(), col, true)).toBe(false);
    expect(needsMessageScan(spec(), msg, true)).toBe(true);
    expect(needsMessageScan(spec(), msg, false)).toBe(false);
    expect(needsMessageScan(spec({ levels: ['error'] }), msg, false)).toBe(true);
    expect(needsMessageScan(spec({ levels: ['error'] }), col, false)).toBe(false);
    expect(
      needsMessageScan(
        spec({ lineFilters: [{ op: 'include', value: 'x', caseSensitive: false, regex: false }] }),
        col,
        false
      )
    ).toBe(true);
  });

  it('picks round bucket sizes', () => {
    expect(pickBucketSeconds(15 * 60 * 1000)).toBe(10);
    expect(pickBucketSeconds(3600 * 1000)).toBe(30);
    expect(pickBucketSeconds(24 * 3600 * 1000)).toBe(900);
    expect(pickBucketSeconds(7 * 24 * 3600 * 1000)).toBe(7200);
  });
});

describe('query hint (session zone, query timeout)', () => {
  const hint = queryHint({ timeZone: '+00:00', timeoutSeconds: 120 });

  it('sets time_zone and query_timeout in one SET_VAR', () => {
    expect(hint).toBe("/*+ SET_VAR(time_zone = '+00:00', query_timeout = 120) */");
    expect(queryHint({ timeoutSeconds: 0 })).toBe('');
    expect(queryHint({ timeoutSeconds: 60 })).toBe('/*+ SET_VAR(query_timeout = 60) */');
    expect(queryHint({ timeZone: 'Asia/Kolkata', timeoutSeconds: 0 })).toBe(
      "/*+ SET_VAR(time_zone = 'Asia/Kolkata') */"
    );
  });

  it('goes after the first SELECT, also of a parenthesised UNION ALL; SHOW is unchanged', () => {
    expect(withQueryHint('SELECT 1', hint)).toBe(`SELECT ${hint} 1`);
    expect(withQueryHint('(SELECT a FROM t)\nUNION ALL\n(SELECT a FROM u)', hint)).toBe(
      `(SELECT ${hint} a FROM t)\nUNION ALL\n(SELECT a FROM u)`
    );
    expect(withQueryHint("SHOW TABLES LIKE 'vw_%'", hint)).toBe("SHOW TABLES LIKE 'vw_%'");
    expect(withQueryHint('SELECT 1', '')).toBe('SELECT 1');
  });

  it('has no $ (the data source would treat $name(...) as a macro)', () => {
    expect(hint).not.toContain('$');
  });
});

describe('line times are computed by StarRocks (epoch ms in the session zone)', () => {
  it('line queries return __ms and the exact text, not the raw DATETIME', () => {
    const sql = logsQuery(spec(), ctx(), 10, 'desc');
    expect(sql).toContain(
      "SELECT (UNIX_TIMESTAMP(`observed_timestamp`) * 1000 + MILLISECONDS_DIFF(`observed_timestamp`, DATE_TRUNC('second', `observed_timestamp`))) AS __ms, CAST(`observed_timestamp` AS VARCHAR) AS __ts"
    );
    expect(sql).toContain('ORDER BY `observed_timestamp` DESC');
  });

  it('the zone probe reads the newest line of the last day as text', () => {
    expect(newestTimeTextQuery(VIEW)).toBe(
      `SELECT CAST(\`observed_timestamp\` AS VARCHAR) AS t\nFROM \`${VIEW}\`\nWHERE \`observed_timestamp\` >= DATE_SUB(NOW(), INTERVAL 1 DAY)\nORDER BY \`observed_timestamp\` DESC\nLIMIT 1`
    );
  });
});

describe('planWindows (newest-first text search)', () => {
  const H = 3_600_000;
  const at = (h: number, m = 0) => Date.UTC(2026, 10, 24, h, m);

  it('keeps a range of up to 2 hours as one window', () => {
    expect(planWindows(at(12), at(14), 'desc')).toEqual([{ fromMs: at(12), toMs: at(14) }]);
  });

  it('desc: newest window first, doubling, inner boundaries on whole hours, no gap or overlap', () => {
    const w = planWindows(at(2, 23), at(14, 23), 'desc');
    expect(w).toEqual([
      { fromMs: at(13), toMs: at(14, 23) },
      { fromMs: at(11), toMs: at(13) - 1 },
      { fromMs: at(7), toMs: at(11) - 1 },
      { fromMs: at(2, 23), toMs: at(7) - 1 },
    ]);
  });

  it('asc: oldest window first', () => {
    const w = planWindows(at(2, 23), at(14, 23), 'asc');
    expect(w[0]).toEqual({ fromMs: at(2, 23), toMs: at(4) - 1 });
    expect(w[w.length - 1].toMs).toBe(at(14, 23));
  });

  it('covers 24 hours in at most 5 windows, contiguous', () => {
    for (const sort of ['desc', 'asc'] as const) {
      const from = at(0, 7) - 24 * H + 7;
      const to = at(0, 7) + 123;
      const w = planWindows(from, to, sort);
      expect(w.length).toBeLessThanOrEqual(5);
      const ordered = sort === 'desc' ? [...w].reverse() : w;
      expect(ordered[0].fromMs).toBe(from);
      expect(ordered[ordered.length - 1].toMs).toBe(to);
      for (let i = 1; i < ordered.length; i++) {
        expect(ordered[i].fromMs).toBe(ordered[i - 1].toMs + 1);
      }
    }
  });

  it('window bounds give exact SQL bounds that meet: ts < boundary, then ts >= boundary', () => {
    const [newest, next] = planWindows(at(2, 23), at(14, 23), 'desc');
    expect(preciseTimeBounds(next.fromMs, next.toMs)[1]).toBe(
      preciseTimeBounds(newest.fromMs, newest.toMs)[0].replace('>=', '<')
    );
  });
});

describe('oldest line queries', () => {
  it('asks for one line older than a time (LIMIT 1)', () => {
    expect(anyBeforeQuery(VIEW, 1_700_000_000_999)).toBe(
      `SELECT 1 AS x FROM \`${VIEW}\` WHERE \`observed_timestamp\` < FROM_UNIXTIME(1700000000) LIMIT 1`
    );
  });

  it('takes MIN over a short range only', () => {
    const sql = oldestInRangeQuery(VIEW, 1_700_000_000_000, 1_700_003_600_000);
    expect(sql).toContain('UNIX_TIMESTAMP(MIN(`observed_timestamp`)) * 1000');
    expect(sql).toContain('>= FROM_UNIXTIME(1700000000) AND `observed_timestamp` < FROM_UNIXTIME(1700003600)');
  });
});
