# kotak-starrocks-logs-app — StarRocks Logs Drilldown

A Grafana app plugin that gives the StarRocks log views (`vw_eks_app_logs_<app_id>`) the Loki Logs
Drilldown experience, without writing SQL. It does **not** change `kotak-starrocks-datasource`: every query
is plain SQL sent through that datasource, so the signed-in user's IDAM token is forwarded and StarRocks and
Ranger decide what each person sees, exactly as for dashboards.

| Logs Drilldown feature | Here |
|---|---|
| Data source picker | **Data source picker** (one `kotak-starrocks-datasource` instance per StarRocks database) **+ view picker** (`SHOW TABLES LIKE 'vw_eks_app_logs_%'`, filtered by Ranger) |
| Service grid (volume + newest lines per service), search, label tabs | Yes: one `GROUP BY` for all volumes, one `UNION ALL` for the visible page's lines |
| Logs tab: volume by level, lines, newest/oldest, wrap, line limit | Yes (Grafana's Logs panel) |
| Logs / Table / JSON views | Yes |
| Search in log lines: include / exclude, match case, regex | Yes |
| Label and level filters; filter buttons in log details | Yes |
| Trace links → Explore with the trace | Yes: per-tenant regex + Tempo uid |
| Show context | Yes: same pod, ±1 h (Grafana's context modal) |
| Labels tab, Fields tab (incl. key=value / JSON fields in lines) | Yes, with Include / Exclude |
| Patterns tab | Yes: **per-tenant configured patterns** (one scan), "(unmatched)" share, "Suggest patterns" from a sample |
| Open in Explore, share link (state in the URL) | Yes (Explore shows the SQL result as a table) |
| Level | Per tenant: the `level` column, or extracted from the message (observability) |

Not in this version: favourites, add-to-dashboard, alerts and an "Open in StarRocks drilldown" button
inside Explore.

## How it works

```mermaid
flowchart LR
  U[Browser: the app] -->|structured query: kind + view + filters| R[Runtime data source inside the app]
  R -->|SQL + $__timeFilter| Q[Grafana /api/ds/query]
  Q -->|OAuth middleware adds the user's IDAM token| D[kotak-starrocks-datasource, unchanged]
  D -->|JWT login as the user, per-user pool| S[StarRocks FE]
  S -->|Ranger per-view policy| V[(vw_eks_app_logs_* over Iceberg)]
  U -. View trace link .-> E[Explore with the tenant's Tempo data source]
```

- `src/sql/builder.ts` builds all SQL. Identifiers are checked, values are escaped, and `$` is split out of
  literals so the datasource's macro engine cannot touch user text.
- `src/datasource/StarRocksLogsDataSource.ts` is the runtime data source every panel queries; it also
  implements "show context".
- `src/components/*` are the Scenes screens. All state is in the URL.
- Long text scans are guarded (`maxScanHours`): the user sees a notice and can shorten the range or run anyway.

Screenshots from the end-to-end run (synthetic data): [service grid](docs/screenshots/02-service-grid.png),
[log details with trace link](docs/screenshots/03-log-details-trace-link.png),
[show context](docs/screenshots/05-show-context.png), [labels](docs/screenshots/06-labels-tab.png),
[patterns](docs/screenshots/08-patterns-tab.png).

More in [docs/DESIGN.md](docs/DESIGN.md). Rollout in [docs/ROLLOUT.md](docs/ROLLOUT.md). Building it from the
same repository and pipelines as the datasource: [docs/MONOREPO.md](docs/MONOREPO.md). Step-by-step rollout for
the Claude session on the org PC: [docs/ORG_AGENT_PROMPT.md](docs/ORG_AGENT_PROMPT.md) (0.1.0), then
[docs/ORG_AGENT_PROMPT_2_DATASOURCE_PICKER.md](docs/ORG_AGENT_PROMPT_2_DATASOURCE_PICKER.md) (0.2.0, data source picker).

## Configuration (app jsonData)

Provisioned per org from deploy-config (`provisioning/plugins/*.yaml`), or edited on the app's
configuration page. Invalid entries are ignored and listed on the page. The tenant is the view
(`vw_eks_app_logs_<app_id>`); generate the per-tenant trace settings from the existing Loki data sources with
`scripts/gen-tenants-from-loki.py` (see [docs/ROLLOUT.md](docs/ROLLOUT.md#how-tenants-are-defined)).

```yaml
apiVersion: 1
apps:
  - type: kotak-starrocks-logs-app
    org_id: 3
    jsonData:
      datasourceUid: app-logs-starrocks-db      # data source selected by default
      # datasources: [app-logs-starrocks-db, { uid: app-logs-starrocks-db2, viewPrefix: vw_eks_app_logs_ }]
      #   optional picker allowlist/order; default: every kotak-starrocks-datasource instance in the org
      viewPrefix: vw_eks_app_logs_
      defaultTimeRange: now-15m
      maxScanHours: 6                           # text scans over longer ranges ask first
      lineLimit: 1000
      # labels / fields: optional column lists (defaults: k8s_* and friends)
      tenants:                                  # keyed by app_id = view name without the prefix,
                                                # or <datasourceUid>/<app_id> for one database only
        default:
          level: { source: column }             # read the level column (normalised)
        app_1961_observability:
          level: { source: message }            # level column is empty: extract from the line
          trace: { regex: 'traceid=([0-9a-f]{32})', tempoUid: <tempo datasource uid> }
          patterns:
            - { name: Upstream timed out, like: '%upstream timed out%' }
            - { name: Connection refused, regex: 'Connection refused to [a-z0-9-]+:[0-9]+' }
```

- `level.regex` (message source, optional): RE2 regexes tried in order; the first capture group is the level.
  The defaults handle `level=info`, `"level":"info"`, bare `ERROR`/`WARN`/… and glog `E1118 …` prefixes.
- Several StarRocks databases: add one `kotak-starrocks-datasource` instance per database (each has its own
  `database` setting); they appear in the app's Data source picker. Views, columns and filters belong to the
  selected data source (URL key `ds`). Without an explicit choice the app opens `datasourceUid`, or the next
  data source where the user can see views.
- `patterns[].like` is a SQL LIKE pattern (`%` wildcard). Prefer `regex` when the text itself contains `%`,
  `_` or `\` (StarRocks 4.0 does not honour an escaped `\%` at the end of a LIKE pattern).

## Development

Node 22 and npm. No backend, no Go.

```bash
npm ci
npm run typecheck && npm run lint && npm run test:ci     # 51 unit tests
npm run build                                             # → dist/
./scripts/package.sh && ./scripts/verify-package.sh       # → package/kotak-starrocks-logs-app-<version>.zip
```

### End-to-end tests

`scripts/e2e.sh` runs Grafana 12.0.1-security-01 with this app and the **built, unchanged**
`kotak-starrocks-datasource` (`DATASOURCE_DIST`, default `../kotak-starrocks-datasource/dist`, the sibling folder in this repository), a mock IDAM,
and StarRocks 4.0.10 seeded with two databases (two data source instances), each with an `eks_app_logs`-shaped
table and tenant views, and native JWT users with per-view grants (standing in for Ranger).

```bash
npm run build
./scripts/e2e.sh up        # generates the app provisioning from dev/e2e/tenants/ (like deploy-config), seeds,
                           # Grafana http://localhost:23000 ("Sign in with IDAM", user e.g. kmbl3e2e)
./scripts/e2e.sh smoke     # 20 API checks: every query kind on StarRocks, per-user views, two databases, escaping
./scripts/e2e.sh test      # 20 browser tests (Playwright, in mcr.microsoft.com/playwright:v1.52.0-noble;
                           # PLAYWRIGHT_LOCAL=1 runs them on the host if Chromium's libraries are installed)
./scripts/e2e.sh down
```

Test users: `kmbl3e2e` (db1: observability + cmm; db2: observability + payments), `kmbl3other` (db1: dpdpa),
`kmbl3db2only` (db2: payments), `kmbl3none` (no views), `kmbl3admin` (Grafana admin, db1: observability).
