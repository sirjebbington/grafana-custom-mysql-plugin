# Grafana 12.0.1 internals the plugin relies on

This is a reference of what Grafana does around a backend datasource plugin that forwards OAuth identity.
Line numbers are from the Grafana `v12.0.1-security-01` source tree. The SDK is `grafana-plugin-sdk-go`
v0.277.0, the version Grafana 12.0.1 pins.

## Token forwarding

| Behaviour | Where |
|---|---|
| Plugin middleware order: `ClearAuthHeadersMiddleware` → `OAuthTokenMiddleware` → … → `ForwardIDMiddleware` | `pkg/services/pluginsintegration/pluginsintegration.go:194-198` |
| `ClearAuthHeadersMiddleware` deletes every auth header the incoming browser request carried before the request reaches a plugin | `pkg/services/pluginsintegration/clientmiddleware/clear_auth_headers_middleware.go:27-38` |
| `OAuthTokenMiddleware` does nothing without an HTTP request context, so alert evaluation and background jobs get no token | `clientmiddleware/oauthtoken_middleware.go:35` |
| It forwards only when `jsonData.oauthPassThru` is `true` | `oauthtoken_middleware.go:52`; the key is read in `pkg/services/oauthtoken/oauth_token.go:468` |
| It sets `Authorization: <token type> <access token>` and, when present, `X-Id-Token: <id_token>` on QueryData, CheckHealth and CallResource | `oauthtoken_middleware.go:54-80` |
| It applies to **every** backend plugin, core or external. Verified end to end with this external plugin | e2e test, `scripts/e2e.sh` |
| `GetCurrentOAuthToken` returns nil for service accounts | `oauth_token.go:90` (`!usr.IsIdentityType(claims.TypeUser)`) |
| … and for users not authenticated by an `oauth_*` module, e.g. basic auth or Grafana's own `[auth.jwt]` | `oauth_token.go:103`; e2e shows the log line `The specified user's auth provider is not oauth` |
| A refresh happens when **either** the access token **or** the ID token has expired (with skew). An expired ID token forces a refresh | `oauth_token.go:498-520` (`needTokenRefresh`) |
| Tokens are stored per user (`user_auth`). With feature toggle `improvedExternalSessionHandling` (public preview, off by default in 12.0.1) they are stored per session, so one user can present different tokens from different sessions. The plugin handles this | `oauth_token.go:110` |
| Grafana also signs its own per-user ID token (`X-Grafana-Id`): 10-minute TTL, `aud = org:<id>`. It was considered and not used | `pkg/services/auth/idimpl/service.go:27,180` |

## SDK (v0.277.0)

| Item | Value |
|---|---|
| `backend.OAuthIdentityTokenHeaderName` | `"Authorization"` (`backend/http_headers.go:16`) |
| `backend.OAuthIdentityIDTokenHeaderName` | `"X-Id-Token"` (`backend/http_headers.go:20`) |
| `QueryDataRequest.GetHTTPHeader`, `CheckHealthRequest.GetHTTPHeader` | Case-insensitive; reads both raw and `http_`-prefixed keys (`backend/data.go:79`, `backend/diagnostics.go:97`) |
| `settings.HTTPClientOptions(ctx)` + `httpclient.GetTLSConfig` | Builds TLS from `tlsAuth`, `tlsAuthWithCACert`, `tlsSkipVerify`, secure `tlsCACert`/`tlsClientCert`/`tlsClientKey`. **`serverName` is read only when `tlsAuth` or `tlsAuthWithCACert` is set** (`backend/http_settings.go:233-236`) |
| `backend.GrafanaConfigFromContext(ctx).SQL()` | Row limit and the `[sql_datasources]` defaults (`GF_SQL_*` keys, `backend/config.go:21-25`) |

## Built-in MySQL plugin, the starting point

| Fact | Where |
|---|---|
| Builds a DSN string with the password embedded, then opens **one shared `*sql.DB`** per datasource | `pkg/tsdb/mysql/mysql.go:98-150` |
| `allowCleartextPasswords` jsonData flag | `mysql.go:107`; UI switch at `ConfigurationEditor.tsx:142` |
| `tlsSkipVerify` becomes `tls=skip-verify` | `mysql.go:127` |
| Every query uses the shared pool | `pkg/tsdb/mysql/sqleng/sql_engine.go:253` |
| Blocks `SHOW GRANTS`, `CURRENT_USER()` and `USER()` in queries | `pkg/tsdb/mysql/macros.go:17` |
| Imports nothing from Grafana internals except its own `sqleng`, so it ports cleanly to an external plugin | `pkg/tsdb/mysql` |
| Grafana pins go-sql-driver to **v1.7.1** for MySQL tsdb compatibility. An external plugin has its own `go.mod` | `go.mod:596` |
| Frontend depends on `@grafana/sql`, which is `"private": true`. npm only has 13.x | `packages/grafana-sql/package.json:4` |
| Licence: `pkg/tsdb/mysql`, the MySQL frontend and `packages/grafana-sql` are AGPL-3.0-only | — |

## Frontend loading in 12.0.1

- Grafana shares these modules with plugins (`public/app/features/plugins/loader/sharedDependencies.ts`):
  - `@emotion/css`, `@grafana/{data,runtime,ui}`
  - `i18next`, `lodash`, `moment`
  - `react`, `react-dom`, `react-redux`, `redux`, `rxjs`
  - and a few more.
- **It does not share `react/jsx-runtime`.** The latest `@grafana/create-plugin` (7.16) marks
  `react/jsx-runtime` as external. A plugin built that way could not resolve it on 12.0.x. This plugin
  bundles it instead (`webpack.config.ts`).

## Plugin loading config in the org

- `[paths] plugins = /grafana/plugins` (an emptyDir filled by the init container).
- `public_key_retrieval_disabled: true`: signatures are checked only with the public key built into Grafana.
- `allow_loading_unsigned_plugins` is unset. In the e2e run, an unsigned plugin loads only when listed:
  ```
  level=warn msg="Plugin is unsigned" id=kotak-starrocks-datasource err="plugin is unsigned: could not find a MANIFEST.txt"
  level=warn msg="Permitting unsigned plugin. This is not recommended" pluginId=kotak-starrocks-datasource
  level=info msg="Plugin registered" pluginId=kotak-starrocks-datasource
  ```
