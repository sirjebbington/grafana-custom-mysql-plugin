# 14. Glossary

[Index](README.md) · Previous: [Questions](13-questions.md)

**`/api/ds/query`**: Grafana's endpoint for data source queries. The app sends every SQL statement there.

**Activation (Scenes)**: when a scene object is shown, it activates; queries start then.

**AdHocFiltersVariable**: Scenes' "Filter by label values" control. Here it holds the label filters, and is
in the URL as `var-filters`.

**app_id**: the tenant id in StarRocks, e.g. `app_01996_frontlineplatforms_cmm`. The view name is
`<viewPrefix><app_id>`.

**Bucket**: the time slot used by charts, `(UNIX_TIMESTAMP(ts) DIV b) * b`. There are at most 120 per
range.

**Context (Show context)**: the lines of the same pod before and after a line, in Grafana's modal.

**`__ts`**: a hidden field with the exact timestamp text, including microseconds. It anchors context and
line ids.

**Data frame**: Grafana's columnar result format. Log lines use the "log-lines" frame type.

**Data source (`kotak-starrocks-datasource`)**: the Go plugin that runs SQL on StarRocks as the signed-in
user. There is one instance per StarRocks database.

**Details page**: the logs page (`page=details`), with the Logs, Labels, Fields and Patterns tabs.

**Drain**: a log-template clustering algorithm. A small version suggests patterns in the browser.

**Exact bounds**: `ts >= from` and `ts < to + 1 ms` at microsecond precision on line queries. They make
infinite scroll exact.

**FE**: StarRocks frontend node. It handles logins, planning and Ranger checks.

**FNV-1a**: a fast 32-bit hash, used on the message text inside line ids.

**GROUPING SETS / GROUPING_ID**: SQL that aggregates several groupings in one scan. It is used for the
label overview.

**IDAM**: the identity provider (OIDC). It issues the tokens and the JWKS signing keys.

**Iceberg**: the table format of `eks_app_logs` on S3, partitioned by `app_id` and hour.

**Infinite scroll**: the Logs panel loading the next page when the user scrolls to the end.

**JWKS**: the JSON Web Key Set, IDAM's public keys. StarRocks fetches it to verify JWTs at login.

**JWT**: the signed token (here the IDAM ID token by default). It is used as the StarRocks password.

**Kind**: which query a panel wants (`serviceVolume`, `logs`, `volume`, `labelOverview`, `patterns`…).

**Label / field columns**: low-cardinality columns (service, namespace…) and higher-cardinality ones (pod
name, pod uid…). Both can be filtered.

**`lineLimit`**: lines per query and per infinite-scroll page (default 1000).

**Macro**: a placeholder the data source replaces before running SQL, e.g. `$__timeFilter(col)`.

**`maxScanHours`**: above this range length, text scans ask first (default 6).

**Message field**: a `key=value` or JSON field inside the log text, e.g. `status=500`.

**Message tenant**: a tenant whose level is extracted from the message text because its `level` column is
empty.

**OAuth pass-through**: the data source setting that makes Grafana forward the user's tokens.

**Pattern**: a named LIKE or regex in a tenant's settings, counted on the Patterns tab.

**Provisioning file**: `provisioning/plugins/*.yaml`. It sets the app's settings (`jsonData`) per org.

**Ranger**: the authorisation layer for StarRocks. It allows SELECT per view, per user. Error 5204 is a
denial.

**Runtime data source**: a data source object that lives only in the app's page
(`kotak-starrocks-logs-runtime`). It turns structured queries into SQL.

**Scan guard**: the notice shown instead of a long text scan.

**Scene / SceneQueryRunner**: Grafana Scenes building blocks. A runner runs queries for its panels and
re-runs on time range changes.

**Selection page**: the service grid (no `page` in the URL).

**Spec (`QuerySpec`)**: the data source, the view and all filters. It is the input for every query.

**Tenant settings**: per-`app_id` display settings: level source, trace link, patterns.

**Text scan**: a query that reads every message in range (line search, fields inside lines, patterns,
message levels).

**View**: `vw_eks_app_logs_<app_id>`, one per tenant, over the shared Iceberg table.

**`viewPrefix`**: the view name prefix, `vw_eks_app_logs_` by default. It can be set per data source.
