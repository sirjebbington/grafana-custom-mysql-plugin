import {
  decodeField,
  decodeFilter,
  decodeLine,
  decodePattern,
  encodeField,
  encodeFilter,
  encodeLine,
  encodePattern,
} from '../state/url';
import { drain, templateToLike, templateToRegex, tokenize } from './drain';
import { extractMessageFields, fieldStats } from './messageFields';

describe('drain', () => {
  it('masks variable tokens', () => {
    expect(tokenize('GET /api/v1 200 12ms id=1234 host=10.1.2.3:80 user=alice')).toEqual([
      'GET',
      '/api/v1',
      '<*>',
      '<*>',
      'id=<*>',
      'host=<*>',
      'user=alice',
    ]);
  });

  it('groups similar lines into one template', () => {
    const lines = [
      'Connection refused to db-01 after 3 retries',
      'Connection refused to db-02 after 5 retries',
      'Connection refused to cache after 1 retries',
      'request completed status=200 duration_ms=12',
      'request completed status=200 duration_ms=40',
    ];
    const out = drain(lines);
    expect(out[0]).toMatchObject({ count: 3, template: 'Connection refused to <*> after <*> retries' });
    expect(out[0].like).toBe('%Connection refused to % after % retries%');
    expect(out[1]).toMatchObject({ count: 2, template: 'request completed status=<*> duration_ms=<*>' });
  });

  it('turns templates into LIKE patterns, merging wildcards', () => {
    expect(templateToLike(['GET', '<*>', '<*>', 'done'])).toBe('%GET % done%');
  });

  it('suggests a regex instead of LIKE when the template has LIKE metacharacters', () => {
    const out = drain(['cpu at 99% on node_a', 'cpu at 97% on node_a']);
    expect(out[0].like).toBeUndefined();
    expect(out[0].regex).toBe('cpu\\s+at\\s+.*\\s+on\\s+node_a');
    expect(templateToRegex(['a.b', '<*>', 'x=<*>'])).toBe('a\\.b\\s+.*\\s+x=.*');
  });
});

describe('message fields', () => {
  it('parses logfmt including quoted values', () => {
    expect(extractMessageFields('level=info msg="request done" status=200 path=/x')).toEqual({
      level: 'info',
      msg: 'request done',
      status: '200',
      path: '/x',
    });
  });

  it('parses top-level JSON scalars', () => {
    expect(extractMessageFields('{"level":"warn","n":3,"nested":{"a":1}}')).toEqual({ level: 'warn', n: '3' });
  });

  it('computes stats per key', () => {
    const s = fieldStats(['a=1 b=x', 'a=1', 'a=2']);
    expect(s[0]).toEqual({
      key: 'a',
      lines: 3,
      distinct: 2,
      top: [
        { value: '1', count: 2 },
        { value: '2', count: 1 },
      ],
    });
    expect(s[1].key).toBe('b');
  });
});

describe('url encoding', () => {
  it('round-trips filters with separators in values', () => {
    const f = { key: 'k8s_service_name', op: '!=' as const, value: 'a|b c=d' };
    expect(decodeFilter(encodeFilter(f))).toEqual(f);
    const l = { op: 'exclude' as const, value: 'x|y%', caseSensitive: true, regex: false };
    expect(decodeLine(encodeLine(l))).toEqual(l);
    const p = { op: 'include' as const, name: 'HTTP | 5xx' };
    expect(decodePattern(encodePattern(p))).toEqual(p);
    const m = { key: 'status', op: '=' as const, value: '500' };
    expect(decodeField(encodeField(m))).toEqual(m);
  });

  it('rejects malformed values', () => {
    expect(decodeFilter('a|<>|b')).toBeUndefined();
    expect(decodeFilter('a|=')).toBeUndefined();
    expect(decodeLine('maybe|0|0|x')).toBeUndefined();
  });
});
