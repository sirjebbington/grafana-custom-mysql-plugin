# 12. Design decisions

[Index](README.md) · Previous: [When things go wrong](11-failure-modes.md) · Next: [Questions](13-questions.md)

Each entry gives the decision, why it was made, what else was considered, and what it costs.

## Shape of the solution

### D1. A separate app plugin; the data source stays unchanged

- **Why**: `kotak-starrocks-datasource` is the production plugin for the StarRocks FE, and the owner did
  not want it touched.
- **Considered**:
  - making the data source "Explore-native" (logs frames, context, volume, filter hooks), like
    ClickHouse's;
  - a copy of the data source under a new id.
- **Cost**: "Open in Explore" shows a table, not a logs view (the data source returns table frames).

### D2. No backend in the app

- **Why**: Grafana's OAuth middleware attaches the user's token **only to data source requests**. It skips
  requests without data source instance settings (`OAuthTokenMiddleware.applyToken`). An app backend could
  not log in to StarRocks as the user.
- **Considered**: a Go backend compiling filters to SQL; a Loki-API facade in front of StarRocks (a new
  token-handling service, and views do not map to Loki tenants).
- **Cost**: SQL is built in the browser. This is safe because the user could run any SQL as themselves in
  Explore anyway (D3).

### D3. SQL built in the browser, sent through `/api/ds/query`

- **Why**: the only way to use the user's identity without changing the data source (D1, D2).
- **Safety**: identifiers are allowlisted, values escaped, `$` split out. Ranger remains the
  authorisation boundary.
- **Cost**: the SQL builder carries its own quoting rules (see D18).

### D4. A runtime data source inside the app

- **Why**: the core panels, the Logs panel (with Show context and infinite scroll) and time series, need a
  `DataSourceApi` to query. SceneQueryRunners bring cancellation, time range and refresh.
- **Detail**: it is registered in **both** the Scenes and Grafana core registries, because the Logs panel
  resolves data sources from core.
- **Considered**: calling `runSql` directly from each scene. That would lose the panels' built-in features.

### D5. Grafana Scenes 6.20.2, `@grafana/*` 12.0.1

- **Why**: production is Grafana 12.0.1. Scenes 6.21+ needs `@grafana/i18n`, which 12.0 does not provide.
- **Cost**: upgrading Grafana (13.x) means re-checking these pins.

## Data model

### D6. The tenant is the view

- **Why**: one Iceberg table, one view per `app_id`. Ranger already grants access per view.
- **Consequence**: the app's `tenants` settings are display-only, keyed by `app_id`. They are never an
  access list.

### D7. Tenant settings generated from Loki, then owned in deploy-config

- **Why**: Loki data sources already hold each tenant's header (`X-Scope-OrgID`) and trace derived field.
  The header and the app_id differ only in `-` versus `_`.
- **Considered**: discovering tenants at runtime in the browser. That is impossible: the header value is in
  `secureJsonData`, and uid prefixes are shared by several tenants.
- **After Loki**: the generated file becomes the only source.

### D8. Several databases = several data source instances, with a picker

- **Why**: a `kotak-starrocks-datasource` instance is scoped to one database, and StarRocks checks that
  database at login.
- **Behaviour**: with no explicit choice, the first data source where the user has views wins. Problems are
  shown in the picker, and per-database tenant keys (`<uid>/<app_id>`) are supported.

### D9. Level from the column, or extracted from the message

- **Why**: most tenants fill `level`. Observability does not (100 % empty), and its lines mix logfmt, bare
  words and glog prefixes.
- **How**: per tenant. Message tenants use ordered RE2 regexes; normalisation uses the same buckets as the
  existing dashboards.
- **Cost**: message levels are text scans, so they are guarded on long ranges (D16).

### D10. Configured patterns instead of automatic ones

- **Why**: there are no server-side patterns in StarRocks. Masking digits on UAT produced 676 thousand
  groups for 1.16 million lines.
- **How**: named LIKE or regex per tenant, counted in one `CASE` scan, plus an "(unmatched)" share. A
  browser-side Drain suggests entries from a 2000-line sample.

## Queries

### D11. One query per screen element, aggregated in StarRocks

- **Choices**: the grid volume is one `GROUP BY` for all services; samples are one `UNION ALL`; the label
  overview is one `GROUPING SETS`; patterns are one `CASE`.
- **Why**: a small cluster with no query queue. Round trips and scans dominate the cost.

### D12. Columns from `SELECT * … LIMIT 0`

- **Why**: Ranger denies `DESCRIBE`, `SHOW COLUMNS` and `information_schema`. `LIMIT 0` returns the field
  names without reading rows.

### D13. `$__timeFilter` everywhere, plus exact microsecond bounds on line queries

- **Why**: the macro gives partition pruning, but it is cut to whole seconds. Exact bounds make paging
  correct.
- **Detail**: the macro range is widened to whole seconds around the exact bounds, so pruning is kept.

### D14. Stable line ids

- **Why**: Grafana merges infinite-scroll pages by time and `id`. The data has no row id, and timestamps
  are not unique.
- **How**: `<microsecond text>_<pod>_<FNV-1a of the message>`, with `#n` for exact duplicates.

### D15. Show context by pod and exact timestamp, one hour per step

- **Why**: there is no stream concept or row id. The pod is the closest thing to a Loki stream, and the
  `__ts` text avoids millisecond rounding.
- **Cost**: other lines in the same microsecond as the anchor are left out. A pod silent for more than an
  hour ends the context in that direction.

### D16. Scan guard and level-split skip

- **Why**: on UAT, a 24-hour text scan takes 9 to 11 seconds on a shared single-node cluster.
- **How**: `maxScanHours` (default 6); the user confirms per range. Message-level volumes become one "all"
  series beyond it.

### D17. Quick ranges up to 24 hours

- **Why**: requested by users, and it keeps casual clicks cheap. Longer ranges can still be typed.

### D18. Escaping choices

- **D18a, `instr()` for text with `%`, `_` or `\`**: StarRocks 4.0 does not match an escaped `\%` at the end
  of a LIKE pattern (found in testing).
- **D18b, `$` emitted through `concat()`**: the data source expands macros even inside string literals.

## User interface

### D19. Logs Drilldown's layout and controls

- **What**: label filters on the left (the same Scenes ad hoc filter combobox, with a values drop-down);
  data source, view, time and refresh on the right; a "service" tab plus closable added label tabs;
  Include/Remove; favourites; infinite scroll.
- **Why**: users already know Loki's Logs Drilldown. Same behaviour, different backend.

### D20. All state in the URL, with history steps

- **Why**: shareable links, reload safety, browser Back/Forward.
- **Detail**: label filters use Scenes' `var-filters` format. Old `filter=` links are converted. An empty
  `ds` or `view` never clears the selection (that race caused the 0.2.0 "Opening view…" hang).

### D21. Last view and favourites in localStorage

- **Why**: per-browser convenience with no server state. It is never needed for correctness, and failures
  are ignored.
- **Cost**: it does not follow the user across browsers.

## Delivery

### D22. One repository, two sibling plugin folders

- **Why**: same repository and pipelines as the data source.
- **Detail**: both plugins live under `plugins/`. A plugin at the repository root would pick up the other
  one's `plugin.json` through webpack's `**/src/**/plugin.json` glob.

### D23. Upgrades as patches over the app folder

- **Why**: the org repository may hold its own edits. `git apply --3way` over
  `plugins/kotak-starrocks-logs-app` keeps them. The self-contained upgrade file carries the patch for a PC
  without GitHub access.
