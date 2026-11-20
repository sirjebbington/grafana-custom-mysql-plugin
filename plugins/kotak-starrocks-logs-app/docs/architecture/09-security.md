# 9. Security

[Index](README.md) · Previous: [Labels, fields, patterns](08-labels-fields-patterns.md) · Next: [Performance](10-performance.md)

## The short version

- The app has **no privileges of its own**. Every query runs **as the signed-in user**, through the same
  data source and the same Ranger policies as their dashboards and Explore.
- A user can already run any SQL as themselves in Explore. The app only writes that SQL for them, so it adds
  **no new access path**.
- The app never handles tokens or secrets.

## The identity chain

1. **Sign-in**: Grafana's generic OAuth with IDAM. Grafana stores the tokens encrypted in its database.
2. **Every data source request**: Grafana's OAuth token sync refreshes an expired token first, then the
   OAuth middleware attaches it to requests for data sources that have **OAuth pass-through** on
   (`Authorization` for the access token, `X-Id-Token` for the ID token).
3. **`kotak-starrocks-datasource`**:
   - uses the **ID token** by default (`tokenSource`), and takes the username from the **`sub`** claim
     (`usernameClaim`). It does not verify the signature; StarRocks does;
   - with no token on the request (service account, alerting, basic-auth admin), it refuses: "no IDAM token
     on this request";
   - does not open new connections with a token that expires within 10 seconds;
   - keeps **one pool per StarRocks user**: at most 5 connections, closed after 60 s idle, the pool dropped
     after 10 minutes unused, and **retired when the user presents a new token**. A connection is never
     shared between users;
   - connects with **TLS** (unless `allowPlaintext` is set). The token is the MySQL password, sent through
     the `authentication_openid_connect_client` or cleartext plugin, inside TLS.
4. **StarRocks FE** verifies the JWT with **IDAM's JWKS**, fetched at each new login (StarRocks does not
   cache it). It then checks the data source's default database: the user needs a privilege on something
   in that database. A failure there is reported by the driver as "invalid connection".
5. **Ranger** applies the user's policies on every statement:
   - `SHOW TABLES` returns only the views they may read;
   - SELECT on any other view fails with **5204**;
   - `information_schema`, `DESCRIBE` and `SHOW COLUMNS` are denied, which is why columns come from
     `LIMIT 0`.

## What the browser could tamper with, and why it does not matter

| Tampering | Result |
|---|---|
| Edit the URL to another view | `SHOW TABLES` does not list it; a direct query fails with 5204 |
| Edit the URL to another data source uid | listed only if it exists in the org; queries still run as the user |
| Edit the app's JavaScript to send other SQL | the same as typing SQL in Explore: runs as the user, under Ranger |
| Change `tenants` settings | display only (level, trace link, patterns); no rows become visible |
| Inject SQL through a filter value | values are escaped literals; see below |

## Injection defences in the SQL builder

- **Identifiers** (columns, views) must match `^[A-Za-z_][A-Za-z0-9_]*$`, and are quoted with backticks.
  Label filter keys must also be columns of the view, or they are dropped.
- **Values** become string literals with `\` and `'` escaped.
- **Grafana macros**: the data source expands `$name(…)` and `$__interval` even **inside string literals**.
  A user value like `$__timeFilter(x)` could otherwise be rewritten. So any `$` in a value is emitted as a
  separate `'$'` literal joined with `concat()`.
- **Regex filters** run as `regexp(col, '^(?:…)$')`. RE2 has no backtracking, so a hostile regex cannot
  hang StarRocks with catastrophic backtracking.
- **Numbers** (limits, bucket sizes) are integers produced by the code, never user text.
- The API tests send injection strings through filters and check that StarRocks receives literals and that
  the query still works.

## Settings are not access control

- `tenants`, `datasources`, `viewPrefix` and patterns are **display settings**. They apply after StarRocks
  and Ranger have already decided what the user can read.
- The **Data source** picker lists data sources the user can see in Grafana. In OSS Grafana that is every
  data source in the org, because per-user or per-team data source permissions are an Enterprise feature.
  The real gate is still Ranger.

## Side systems

- **Tempo**: a View trace link opens the tenant's Tempo data source. In OSS Grafana, Tempo data sources are
  readable by every org Viewer. This was accepted.
- **Loki** stays until the migration is complete. Its data sources are also readable by every org Viewer.
  Per-user isolation covers the StarRocks logs.

## What is stored where

| Data | Where | Sensitive? |
|---|---|---|
| IDAM tokens | Grafana database (encrypted); data source memory (pool password) | yes, never in the app |
| App settings | Grafana app settings, provisioning file | no (regexes, uids, names) |
| Last data source/view, favourites | browser localStorage | no |
| Query results | browser memory only | as the user is allowed to see them |

## Network paths

- Browser to Grafana: HTTPS, the user's Grafana session.
- Grafana to the data source plugin: local gRPC to the plugin process (Grafana plugin protocol).
- Data source to StarRocks FE: MySQL protocol over TLS, to the FE's MySQL port through the NLB.
- StarRocks to IDAM: HTTPS for the JWKS.
- StarRocks to S3: the cluster's own credentials for Iceberg. Users have no S3 access.
