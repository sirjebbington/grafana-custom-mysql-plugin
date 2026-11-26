/**
 * Shared by the API-level e2e tests: sign-in through the mock IDAM, SQL through Grafana's /api/ds/query and the
 * unchanged kotak-starrocks-datasource, and the app's time zone probe (src/sql/timeZone.ts).
 */
import { newestTimeTextQuery, queryHint, sessionZoneQuery, withQueryHint } from '../../src/sql/builder';
import { decideTimeMode, PROBE_ZONES, TimeMode, zoneForMode } from '../../src/sql/timeZone';

export const GRAFANA = process.env.GRAFANA_URL ?? 'http://localhost:23000';
export const DS = { uid: 'e2e-ds-starrocks-logs', type: 'kotak-starrocks-datasource' };
// second StarRocks database = second instance of the data source plugin
export const DS2 = { uid: 'e2e-ds-starrocks-logs2', type: 'kotak-starrocks-datasource' };
// GenAI agent logs: views vw_genai_logs_<app_id>_<app_name> with their own column names
export const DS_GENAI = { uid: 'e2e-ds-genai', type: 'kotak-starrocks-datasource' };

const defaultHints = new Map<string, string>();

/** The hint sent with every statement on this data source unless a test passes its own. */
export function setDefaultHint(ds: { uid: string }, hint: string) {
  defaultHints.set(ds.uid, hint);
}

/** The app's hint for a time column kind (queryTimeoutSeconds default 120). */
export function appHint(mode: TimeMode): string {
  return queryHint({ timeZone: zoneForMode(mode), timeoutSeconds: 120 });
}

/** Same probe as src/datasource/timeZone.ts: newest line in two zones, plus the session's own offset. */
export async function detectMode(s: Session, view: string, ds = DS, relation?: string): Promise<TimeMode> {
  const probe = async (zone: string) =>
    (
      await s.sql(newestTimeTextQuery(view, relation), 'now-1h', 'now', ds, {
        hint: queryHint({ timeZone: zone, timeoutSeconds: 30 }),
      })
    )[0]?.t as string | undefined;
  const t0 = await probe(PROBE_ZONES[0]);
  const t1 = await probe(PROBE_ZONES[1]);
  const [z] = await s.sql(sessionZoneQuery(), 'now-1h', 'now', ds, { hint: '' });
  return decideTimeMode(t0, t1, Date.now(), Math.round(Number(z.off) / 15) * 15);
}

export class Session {
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

  /**
   * Runs SQL as this user, with the data source's hint (setDefaultHint) like the app's runSql (hint: '' sends
   * none); returns rows as objects, or throws with the datasource error.
   */
  async sql(
    rawSql: string,
    from = 'now-6h',
    to = 'now',
    ds = DS,
    opts: { hint?: string; signal?: AbortSignal } = {}
  ): Promise<Array<Record<string, unknown>>> {
    const res = await fetch(`${GRAFANA}/api/ds/query`, {
      method: 'POST',
      headers: { cookie: this.header(), 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        queries: [
          {
            refId: 'A',
            datasource: ds,
            rawSql: withQueryHint(rawSql, opts.hint ?? defaultHints.get(ds.uid) ?? ''),
            format: 'table',
            rawQuery: true,
          },
        ],
      }),
      signal: opts.signal,
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
