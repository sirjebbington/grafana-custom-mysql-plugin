import {
  asArray,
  decodeAll,
  decodeField,
  decodeFilter,
  decodeLine,
  decodePattern,
  encodeField,
  encodeFilter,
  encodeLine,
  encodePattern,
} from './url';

describe('URL state encoding (shareable links)', () => {
  it('round-trips every filter kind, including separators and unicode in values', () => {
    const label = { key: 'k8s_service_name', op: '!=' as const, value: 'a|b c/ä' };
    expect(decodeFilter(encodeFilter(label))).toEqual(label);
    const line = { op: 'exclude' as const, value: 'x|y "z"', caseSensitive: true, regex: true };
    expect(decodeLine(encodeLine(line))).toEqual(line);
    const pattern = { name: 'Health | check', op: 'include' as const };
    expect(decodePattern(encodePattern(pattern))).toEqual(pattern);
    const field = { key: 'status', op: '=' as const, value: '5|00' };
    expect(decodeField(encodeField(field))).toEqual(field);
  });

  it('rejects unknown operators and malformed values', () => {
    expect(decodeFilter('k|>|1')).toBeUndefined();
    expect(decodeFilter('only-key')).toBeUndefined();
    expect(decodeLine('maybe|1|0|x')).toBeUndefined();
    expect(decodePattern('both|x')).toBeUndefined();
    expect(decodeField('k|~|v')).toBeUndefined();
  });

  it('reads single values, lists and empty values; drops undecodable entries', () => {
    expect(asArray(undefined)).toEqual([]);
    expect(asArray(null)).toEqual([]);
    expect(asArray('a')).toEqual(['a']);
    expect(asArray(['a', 'b'])).toEqual(['a', 'b']);
    expect(decodeAll(['k|=|v', 'bad'], decodeFilter)).toEqual([{ key: 'k', op: '=', value: 'v' }]);
  });
});
