import { LabelFilter, LabelOp, LineFilter, MessageFieldFilter, PatternFilter } from './types';

// Filters are kept in the URL as repeated parameters, one per filter, with |-separated, URI-encoded parts,
// e.g. filter=k8s_service_name|%3D|proxy. Unparseable values are ignored.

const e = encodeURIComponent;

function d(s: string): string | undefined {
  try {
    return decodeURIComponent(s);
  } catch {
    return undefined;
  }
}

function parts(s: string, n: number): string[] | undefined {
  const p = s.split('|');
  if (p.length !== n) {
    return undefined;
  }
  const out = p.map(d);
  return out.some((x) => x === undefined) ? undefined : (out as string[]);
}

const LABEL_OPS: LabelOp[] = ['=', '!=', '=~', '!~'];

export const encodeFilter = (f: LabelFilter) => [e(f.key), e(f.op), e(f.value)].join('|');
export function decodeFilter(s: string): LabelFilter | undefined {
  const p = parts(s, 3);
  if (!p || !LABEL_OPS.includes(p[1] as LabelOp)) {
    return undefined;
  }
  return { key: p[0], op: p[1] as LabelOp, value: p[2] };
}

export const encodeLine = (f: LineFilter) =>
  [f.op, f.caseSensitive ? '1' : '0', f.regex ? '1' : '0', e(f.value)].join('|');
export function decodeLine(s: string): LineFilter | undefined {
  const p = parts(s, 4);
  if (!p || (p[0] !== 'include' && p[0] !== 'exclude')) {
    return undefined;
  }
  return { op: p[0], caseSensitive: p[1] === '1', regex: p[2] === '1', value: p[3] };
}

export const encodePattern = (f: PatternFilter) => [f.op, e(f.name)].join('|');
export function decodePattern(s: string): PatternFilter | undefined {
  const p = parts(s, 2);
  if (!p || (p[0] !== 'include' && p[0] !== 'exclude')) {
    return undefined;
  }
  return { op: p[0], name: p[1] };
}

export const encodeField = (f: MessageFieldFilter) => [e(f.key), e(f.op), e(f.value)].join('|');
export function decodeField(s: string): MessageFieldFilter | undefined {
  const p = parts(s, 3);
  if (!p || (p[1] !== '=' && p[1] !== '!=')) {
    return undefined;
  }
  return { key: p[0], op: p[1], value: p[2] };
}

export function asArray(v: string | string[] | null | undefined): string[] {
  if (v === null || v === undefined) {
    return [];
  }
  return Array.isArray(v) ? v : [v];
}

export function decodeAll<T>(v: string | string[] | null | undefined, decode: (s: string) => T | undefined): T[] {
  return asArray(v)
    .map(decode)
    .filter((x): x is T => x !== undefined);
}
