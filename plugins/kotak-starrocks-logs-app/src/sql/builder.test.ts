import { resolveConfig, resolveTenant } from '../config/config';
import { emptySpec, QuerySpec } from '../state/types';
import {
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
  patternsQuery,
  pickBucketSeconds,
  quoteIdent,
  serviceSamplesQuery,
  serviceVolumeQuery,
  volumeQuery,
  whereClause,
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
