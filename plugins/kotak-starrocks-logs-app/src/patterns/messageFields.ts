/**
 * Extracts key/value pairs from a log message: top-level scalars of a JSON object, otherwise logfmt-style
 * key=value / key="quoted value" pairs. Used for the "Fields in log lines" section, computed from a sample.
 */
export function extractMessageFields(message: string): Record<string, string> {
  const out: Record<string, string> = {};
  const trimmed = message.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) {
        if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
          out[k] = String(v);
        }
      }
      return out;
    } catch {
      // not JSON, fall through to logfmt
    }
  }
  const re = /(?:^|\s)([A-Za-z_][A-Za-z0-9_.-]*)=("(?:[^"\\]|\\.)*"|\S*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) {
    const raw = m[2];
    out[m[1]] = raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2 ? raw.slice(1, -1) : raw;
  }
  return out;
}

export interface FieldStats {
  key: string;
  lines: number;
  distinct: number;
  top: Array<{ value: string; count: number }>;
}

export function fieldStats(messages: string[], topN = 5, maxDistinct = 1000): FieldStats[] {
  const stats = new Map<string, { lines: number; values: Map<string, number> }>();
  for (const msg of messages) {
    for (const [k, v] of Object.entries(extractMessageFields(msg))) {
      const s = stats.get(k) ?? { lines: 0, values: new Map<string, number>() };
      s.lines++;
      if (s.values.has(v) || s.values.size < maxDistinct) {
        s.values.set(v, (s.values.get(v) ?? 0) + 1);
      }
      stats.set(k, s);
    }
  }
  return Array.from(stats.entries())
    .map(([key, s]) => ({
      key,
      lines: s.lines,
      distinct: s.values.size,
      top: Array.from(s.values.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, topN),
    }))
    .sort((a, b) => b.lines - a.lines || a.key.localeCompare(b.key));
}
