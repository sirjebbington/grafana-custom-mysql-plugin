/**
 * Groups log lines into templates for the "Suggest patterns" helper. A small implementation of the Drain idea
 * (He et al., ICWS 2017): variable-looking tokens are masked, lines are bucketed by token count and first
 * token, and a line joins the most similar template in its bucket when enough positions match; differing
 * positions become <*>. It runs in the browser on a sample of lines, so its counts are sample counts.
 */

export interface PatternSuggestion {
  template: string;
  count: number;
  sample: string;
  /** configuration entry: LIKE when the template has no %, _ or \\ characters, otherwise a regex */
  like?: string;
  regex?: string;
  name: string;
}

const WILDCARD = '<*>';

const VARIABLE_TOKEN = [
  /^[-+]?\d+([.,:/]\d+)*[a-z%]*$/i, // numbers, times, dates, versions, 12ms, 99%
  /^[0-9a-f]{8,}$/i, // hex ids
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // uuid
  /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/, // ip[:port]
  /\d.*\d.*\d/, // anything with 3+ digits (ids, timestamps glued to text)
];

function maskToken(tok: string): string {
  const eq = tok.indexOf('=');
  if (eq > 0 && eq < tok.length - 1) {
    // key=value: keep the key, mask the value when it looks variable
    const value = tok.slice(eq + 1).replace(/^"|"$/g, '');
    return VARIABLE_TOKEN.some((re) => re.test(value)) ? `${tok.slice(0, eq + 1)}${WILDCARD}` : tok;
  }
  return VARIABLE_TOKEN.some((re) => re.test(tok)) ? WILDCARD : tok;
}

export function tokenize(line: string, maxTokens = 64): string[] {
  return line.trim().split(/\s+/).slice(0, maxTokens).map(maskToken);
}

interface Cluster {
  tokens: string[];
  count: number;
  sample: string;
}

function similarity(template: string[], tokens: string[]): number {
  let same = 0;
  let params = 0;
  for (let i = 0; i < template.length; i++) {
    if (template[i] === WILDCARD) {
      params++;
    } else if (template[i] === tokens[i]) {
      same++;
    }
  }
  return template.length === params ? 1 : same / template.length;
}

export function drain(lines: string[], opts: { similarity?: number; maxClusters?: number } = {}): PatternSuggestion[] {
  const threshold = opts.similarity ?? 0.5;
  const maxClusters = opts.maxClusters ?? 500;
  const buckets = new Map<string, Cluster[]>();
  let total = 0;
  for (const line of lines) {
    if (!line || !line.trim()) {
      continue;
    }
    const tokens = tokenize(line);
    const first = tokens[0] === WILDCARD ? WILDCARD : tokens[0];
    const key = `${tokens.length}|${first}`;
    const clusters = buckets.get(key) ?? [];
    let best: Cluster | undefined;
    let bestSim = -1;
    for (const c of clusters) {
      const s = similarity(c.tokens, tokens);
      if (s > bestSim) {
        bestSim = s;
        best = c;
      }
    }
    if (best && bestSim >= threshold) {
      best.tokens = best.tokens.map((t, i) => (t === tokens[i] ? t : WILDCARD));
      best.count++;
    } else if (total < maxClusters) {
      clusters.push({ tokens, count: 1, sample: line });
      buckets.set(key, clusters);
      total++;
    }
  }
  return Array.from(buckets.values())
    .flat()
    .sort((a, b) => b.count - a.count)
    .map((c) => {
      const template = c.tokens.join(' ');
      const literal = c.tokens.filter((t) => t !== WILDCARD).join(' ');
      const match = /[%_\\]/.test(literal.split(WILDCARD).join(''))
        ? { regex: templateToRegex(c.tokens) }
        : { like: templateToLike(c.tokens) };
      return { template, count: c.count, sample: c.sample, name: suggestName(c.tokens), ...match };
    });
}

/** LIKE pattern for a template: wildcard tokens become %, consecutive wildcards are merged. */
export function templateToLike(tokens: string[]): string {
  const esc = (s: string) => s.replace(/[\\%_]/g, (ch) => '\\' + ch);
  const parts: string[] = [];
  for (const t of tokens) {
    if (t === WILDCARD) {
      if (parts[parts.length - 1] !== '%') {
        parts.push('%');
      }
    } else {
      parts.push(esc(t).split(WILDCARD).join('%'));
    }
  }
  let like = parts.join(' ');
  if (!like.startsWith('%')) {
    like = `%${like}`;
  }
  if (!like.endsWith('%') || like.endsWith('\\%')) {
    like = `${like}%`;
  }
  return like;
}

/** RE2 regex for a template: literal parts escaped, wildcards match anything. */
export function templateToRegex(tokens: string[]): string {
  const esc = (t: string) => t.replace(/[\\.+*?()|[\]{}^$]/g, (ch) => '\\' + ch);
  return tokens
    .map((t) => (t === WILDCARD ? '.*' : t.split(WILDCARD).map(esc).join('.*')))
    .join('\\s+')
    .replace(/(\.\*\\s\+)+\.\*/g, '.*');
}

function suggestName(tokens: string[]): string {
  const words = tokens
    .map((t) => t.replace(/=?<\*>/g, '').replace(/[^A-Za-z0-9_ .:-]/g, ''))
    .filter((t) => t.length > 1)
    .slice(0, 5);
  return words.join(' ').slice(0, 60) || 'pattern';
}
