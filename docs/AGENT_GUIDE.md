# kotak-starrocks-datasource: implementation, test and deployment guide

This document is written for an AI coding agent, such as Claude Code, working in the observability team's
repositories. A human engineer can follow it too. It covers what this plugin is, what is already built and
verified, how to build and test it, and how to deploy it through `obser-aws-deploy-config`.

Read sections 0 to 2 before changing anything. The design history, the StarRocks protocol analysis
(`docs/research/06-…`) and the raw test evidence are in `docs/research/`.

---

## 0. Rules for the agent

1. **Never log, print, commit or paste a token.** The JWT is the user's password for StarRocks. That covers
   test output and screenshots. In logs, the plugin records only the username and the time to expiry. Keep it
   that way.
2. **Never turn off transport security outside a local container.** `allowPlaintext` and `tlsSkipVerify` are
   for `dev/e2e` only. Every provisioned datasource must have `tlsAuthWithCACert: true` and a CA certificate.
3. **Do not modify `.config/`.** It belongs to `@grafana/create-plugin`. Extend it from the root files
   (`webpack.config.ts`, `jest.config.js`, `eslint.config.mjs`, `tsconfig.json`).
4. **Do not change the plugin ID** (`kotak-starrocks-datasource`) unless the signing decision forces it
   (§8). If it does change, change every place listed in §8.3 in the same commit.
5. **Keep the driver patch.** `go.mod` must keep
   `replace github.com/go-sql-driver/mysql => ./third_party/go-sql-driver-mysql`. Without it, logins fail
   with "unknown auth plugin" (§2.3, D3).
6. **Do not touch the existing `type: mysql` datasources** in `grafana-values.yml`. The new datasource is
   added next to them. `datasources.yaml` has `prune: true`, so removing or renaming an entry deletes that
   datasource and breaks the dashboards that use it.
7. **Do not enable alerting** in `src/plugin.json`. Alert evaluation has no user and therefore no token.
8. **Ask a human before outward actions:** merging to the deploy repo's main branch, running
   `grafana-deploy.yml` or `grafana-plugin-upload.yml`, publishing to Azure Artifacts, or signing with a Grafana
   Cloud token. Prepare the change, show the diff and wait for approval.
9. **Stop and report when a dependency is missing.** Several steps depend on answers from the IDAM and
   StarRocks teams (`docs/QUESTIONS.md`). Do not guess client IDs, issuers, audiences or user-name formats.
10. Use Grafana's plugin docs at https://grafana.com/developers/plugin-tools/ when you need API details. See
    `.config/AGENTS/instructions.md`.

---

## 1. Background

**Goal (Day-1 POC of the org authz plan).** Grafana users query StarRocks logs as themselves.
- StarRocks verifies each user's IDAM-issued JWT.
- Apache Ranger enforces per-user and per-role policies.
- There are no core Grafana changes: delivery is a custom plugin.

**Today.** About 26 UAT and 4 prod datasources of `type: mysql` connect to StarRocks (FE port 9030) as shared
per-app read-only users such as `logsro-app-1961-observability`, with `tlsSkipVerify: true`.

**Ownership.**
- The observability/Grafana team, and this agent, own the plugin and its deployment in Grafana.
- Another team owns StarRocks, Ranger and the StarRocks JWT security integration. Their part is a dependency
  (`docs/QUESTIONS.md` Part C).
- The IDAM team owns token issuance (Part B).

```
User ── browser ──▶ Grafana 12.0.1 (EKS, StatefulSet, 1 replica)
                     │  Generic OAuth login with IDAM (Ory Hydra); Grafana stores access, ID and refresh tokens
                     │  per datasource with jsonData.oauthPassThru=true, Grafana's OAuthTokenMiddleware adds:
                     │     Authorization: Bearer <access token>     X-Id-Token: <ID token>
                     ▼
            kotak-starrocks-datasource backend (gpx_kotak_starrocks_linux_amd64)
                     │  username = token claim (sub), password = JWT, one pool per user
                     │  TLS (CA verified) ── NLB :9030 (TCP) ──▶
                     ▼
            StarRocks FE: authentication_chain = native,<jwt integration>
                     │  AuthSwitch → authentication_openid_connect_client → verify RSA signature (JWKS), iss, aud, exp
                     ▼
            session user = username as sent ──▶ Ranger policies decide row/table access
```

---

## 2. What is implemented and verified

### 2.1 Repository layout

```
kotak-starrocks-datasource/
├── src/                                   # frontend (TypeScript/React), from Grafana 12.0.1 public/app/plugins/datasource/mysql
│   ├── plugin.json                        # id kotak-starrocks-datasource, executable gpx_kotak_starrocks, alerting:false
│   ├── module.ts                          # DataSourcePlugin: MySqlDatasource + SqlQueryEditorLazy + ConfigurationEditor
│   ├── configuration/ConfigurationEditor.tsx  # REWRITTEN: no user/password; forces oauthPassThru; IDAM identity, TLS, limits
│   ├── configuration/ConfigurationEditor.test.tsx  # NEW
│   ├── types.ts                           # MySQLOptions + tokenSource, usernameClaim, maxConnsPerUser, connMaxIdleSeconds, serverName, allowPlaintext
│   ├── MySqlDatasource.ts, sqlUtil.ts, fields.ts, mySqlMetaQuery.ts, sqlCompletionProvider.ts, CheatSheet.tsx  # unchanged upstream
│   └── sql/                               # verbatim copy of Grafana 12.0.1 packages/grafana-sql/src (not on npm for 12.x)
├── pkg/                                   # backend (Go)
│   ├── main.go                            # datasource.Manage("kotak-starrocks-datasource", mysql.NewInstanceSettings(...))
│   └── mysql/
│       ├── mysql.go                       # CHANGED: driver Config (not a DSN), TLS always on, openid/cleartext auth, PoolManager, error passthrough
│       ├── macros.go                      # CHANGED: CURRENT_USER()/USER()/SHOW GRANTS no longer blocked
│       ├── starrocks_integration_test.go  # NEW: real StarRocks test (skipped unless STARROCKS_IT_ADDR is set)
│       └── sqleng/
│           ├── identity.go (+_test)       # NEW: read the forwarded token, take the username claim and exp
│           ├── userpool.go (+_test)       # NEW: per-user connection pools with token-based retirement
│           ├── sql_engine.go              # CHANGED: resolves the user's pool per request instead of one shared *sql.DB
│           └── handler_checkhealth.go     # CHANGED: Save & test logs in as the user and reports CURRENT_USER()
├── third_party/go-sql-driver-mysql/       # go-sql-driver/mysql v1.10.0 + authentication_openid_connect_client (KOTAK_PATCH.md)
├── tools/devjwt/                          # NEW: dev-only RSA key, JWKS and JWT generator
├── dev/e2e/                               # NEW: docker compose: Grafana 12.0.1-security-01 + mock IDAM + StarRocks 4.0.10
├── scripts/e2e.sh                         # NEW: up | test | refresh | down
├── scripts/package.sh                     # NEW: builds package/<id>-<version>.zip in the layout S3/Grafana expect
├── ci/azure-pipelines.yml                 # NEW: DRAFT build/test/package/publish pipeline
├── docs/AGENT_GUIDE.md                    # this file
├── docs/QUESTIONS.md                      # questions for IDAM and StarRocks teams, and Grafana-side decisions
├── webpack.config.ts, jest.config.js, eslint.config.mjs, tsconfig.json   # extend .config/ for Grafana 12.0 (see D7)
└── Magefile.go, go.mod, package.json, .config/  # scaffolded by @grafana/create-plugin 7.16.0
```

### 2.2 Request flow in code

1. Grafana calls `QueryData` or `CheckHealth`. The headers were set by Grafana's
   `OAuthTokenMiddleware` (Grafana source `pkg/services/pluginsintegration/clientmiddleware/oauthtoken_middleware.go`).
   It does this only when the datasource's `jsonData.oauthPassThru` is `true`, the request comes from a
   browser session, and the user signed in with OAuth.
2. `sqleng.IdentityFromRequest` (`pkg/mysql/sqleng/identity.go`):
   - reads `X-Id-Token` (`tokenSource: id_token`, the default) or `Authorization`
     (`tokenSource: access_token`, with the `Bearer ` prefix stripped);
   - decodes the JWT payload **without verifying it**, because StarRocks verifies it;
   - returns `{Username: claims[usernameClaim], Token: raw, Expiry: claims.exp}`.

   Errors: no token, not a JWT, missing claim, missing `exp`.
3. `PoolManager.Acquire` (`pkg/mysql/sqleng/userpool.go`):
   - Rejects tokens with less than 10s left (`ErrTokenExpired`).
   - Reuses the user's pool if the token is the same.
   - Opens a new pool if the token is newer (Grafana refreshed it).
   - Keeps the existing pool if the token is older but the pool's token is still valid. That case is a second
     Grafana session for the same user.
   - New pools use `cfg.User = username` and `cfg.Passwd = JWT`, with `MaxOpen = MaxIdle = maxConnsPerUser`,
     `ConnMaxIdleTime = connMaxIdleSeconds`, and `ConnMaxLifetime = min(connMaxLifetime, token TTL)`.
   - The caller gets a lease. Retired pools are closed once their last lease is released.
   - A sweep every 30s retires pools whose token has expired, and pools unused for 10 minutes.
4. `DataSourceHandler.QueryData` (`sql_engine.go`) resolves the pool once per request. It then runs each query
   on that pool in parallel with the unchanged upstream query engine (macros, frame conversion, time series
   handling).
5. Connecting: go-sql-driver sends the handshake. StarRocks finds no native user and sends an AuthSwitchRequest
   for `authentication_openid_connect_client`. The patched driver answers with `[0x01][lenenc JWT]`
   (`third_party/go-sql-driver-mysql/auth.go`, `[kotak patch]`). StarRocks verifies the JWT and the session
   runs as the username.
6. Errors: StarRocks auth failures (5208) and privilege failures (5203, or any message containing
   "access denied") are passed through to the user (`mysql.go` `TransformQueryError`). Other server errors keep
   upstream's generic message, and network errors are logged and hidden.

### 2.3 Design decisions

| # | Decision | Why |
|---|---|---|
| D1 | External plugin with a new ID, not a patch to the built-in `mysql` | The org's image wraps the official binary, so a core change needs a from-source Grafana build. The plan says "no core Grafana changes". Existing `mysql` datasources stay untouched |
| D2 | Use Grafana's `oauthPassThru` key | Grafana's middleware only forwards tokens when this exact jsonData key is `true`. The config editor forces it on |
| D3 | Patched go-sql-driver (`authentication_openid_connect_client`) | **Verified:** StarRocks 4.0.10 JWT integrations switch clients to this plugin and parse `[1 byte][lenenc token]`. Upstream go-sql-driver v1.10.0 rejects it. `mysql_clear_password` is not accepted for JWT users |
| D4 | One pool per user; never a shared pool | MySQL authenticates once per connection. A shared pool would run user B's query on user A's session |
| D5 | Pools follow token lifetime | StarRocks checks `exp` only at login, so the plugin ends connections before expiry and reconnects with the refreshed token |
| D6 | ID token by default | IDAM access tokens are opaque by default. ID tokens are always JWTs, and their `aud` is the Grafana client ID |
| D7 | Bundle `react/jsx-runtime`; use the automatic JSX runtime | Grafana 12.0 does not share `react/jsx-runtime` with plugins, and the latest scaffold marks it external. The bundled copy uses Grafana's React 18 through the external `react`. Drop this override once the minimum Grafana shares `react/jsx-runtime` |
| D8 | `@grafana/sql` copied into `src/sql` | Version 12.0.1 of the package is private (npm only has 13.x) |
| D9 | TLS always, CA-verified | The token is a bearer credential |
| D10 | `alerting: false` | There is no token for alert evaluation |
| D11 | `CURRENT_USER()` and `SHOW GRANTS` allowed | Upstream blocks them to hide the shared DB user. Here they only show the user's own identity, which helps debug Ranger decisions |
| D12 | The plugin does not verify JWT signatures | StarRocks is the enforcement point. The tokens come from Grafana's server-side token store, not the browser: Grafana strips incoming auth headers |

### 2.4 Verification already done (2026-10-28, WSL2 Linux, Go 1.25, Node 22.20)

| Check | Command | Result |
|---|---|---|
| Go build and vet | `go build ./... && go vet ./...` | OK |
| Go unit tests (upstream + new identity/pool tests, race detector) | `go test -race ./pkg/...` | PASS |
| Driver patch tests | `(cd third_party/go-sql-driver-mysql && go test -run TestAuth .)` | PASS |
| StarRocks JWT login, real server | `STARROCKS_IT_ADDR=127.0.0.1:19030 … go test ./pkg/mysql -run TestIntegrationStarRocksJWT -v` | 12/12 PASS. Covered: ID token and access token; `user_name` (upper case) login; 40 concurrent queries across 4 users each seeing only themselves; refreshed token reconnects; wrong `aud` → `Error 5208 … Audience (aud) field [...] is invalid`; foreign key rejected; no token; `oauthPassThru` off; expired token; privilege error `Error 5203 … SELECT privilege(s) on TABLE logs` shown to the user |
| Frontend typecheck, lint, tests | `npm run typecheck && npm run lint && npm run test:ci` | OK; 0 lint errors; 9 suites / 57 tests pass |
| Frontend build | `npm run build` | OK. AMD externals are only `@emotion/css, @grafana/{data,runtime,ui}, i18next, lodash, module, moment, react, react-redux, redux, rxjs`, all shared by Grafana 12.0.1 |
| **End-to-end in Grafana `12.0.1-security-01`** | `./scripts/e2e.sh up && ./scripts/e2e.sh test` | PASS. Plugin registered as unsigned and permitted. Real OAuth login as `kmbl3e2e`. Save & test → `Connected to StarRocks as 'kmbl3e2e'@'172.19.0.4' using the IDAM id_token (…)`. `/api/ds/query` `SELECT CURRENT_USER()` → `'kmbl3e2e'@…`. Basic-auth admin → `no IDAM token on this request …` |
| **ID token refresh** | `./scripts/e2e.sh refresh` (120s tokens) | PASS. Pool retired at expiry (`reason="token expired"`). The next query carried a new ID token from Grafana's refresh and opened a new pool |

Not verified, because it needs the org environment or other teams:
- IDAM's real refresh behaviour (QUESTIONS I5).
- TLS against the real StarRocks certificate.
- The UAT security integration and Ranger.
- A signed build with `public_key_retrieval_disabled: true`.
- The `linux_arm64` binary at runtime.

---

## 3. Toolchain

| Tool | Version | Notes |
|---|---|---|
| Go | ≥ 1.24.3 (tested with 1.25.0) | `go.mod` says `go 1.24.3` |
| Node.js | 22.x (`.nvmrc`) | npm 10 |
| mage | v1.15.0 | `go install github.com/magefile/mage@v1.15.0`, or `go run github.com/magefile/mage@v1.15.0 …` |
| Docker + compose v2 | any recent | Only for §5.2 and §5.3. Needs about 4 GB free RAM for StarRocks |
| zip, python3, curl | — | Used by the scripts |

If the build agents sit behind the corporate proxy, set `GOPROXY`, `HTTPS_PROXY`, and the npm `registry` in
`.npmrc` to the internal mirrors.

---

## 4. Build

```bash
npm ci                                        # frontend dependencies (package-lock.json pins them)
npm run build                                 # frontend → dist/ (module.js, plugin.json, img/, README, LICENSE…)
./scripts/build-backend.sh                    # backend → dist/gpx_kotak_starrocks_linux_{amd64,arm64} (= mage -v build:linux build:linuxARM64)
./scripts/package.sh                          # → package/kotak-starrocks-datasource-<version>.zip (+ .sha256)
./scripts/verify-package.sh                   # release gate: layout, version, static binaries, checksum
```

- The version comes from `package.json` (`"version": "0.1.0"`). It is written into `dist/plugin.json` and the
  binary. Bump it for every release: the S3 folder and the init container line include it.
- Webpack writes `dist/` first. Running mage first is also fine: webpack does not delete the `gpx_*` files.
  To be safe, always run both and then `package.sh`.

---

## 5. Test

### 5.1 Unit tests (always)

```bash
go vet ./... && go test -race ./pkg/...
(cd third_party/go-sql-driver-mysql && go test -run TestAuth .)
npm run typecheck && npm run lint && npm run test:ci
```

### 5.2 Integration test against a real StarRocks (before every release)

```bash
go run ./tools/devjwt keygen -dir dev/jwt     # dev RSA key + JWKS (gitignored)
./scripts/e2e.sh up                           # starts StarRocks 4.0.10 (+ mock IDAM + Grafana) and creates the JWT integrations
STARROCKS_IT_ADDR=127.0.0.1:19030 STARROCKS_IT_KEY=$PWD/dev/jwt/key.pem \
  go test ./pkg/mysql -run TestIntegrationStarRocksJWT -v -count=1
```

`e2e.sh up` creates two StarRocks security integrations:
- `local_jwt`: file JWKS `fe/conf/jwks.json`, issuer `https://local-idam/`, audience `grafana-local`. Used
  by tokens from `tools/devjwt` and the Go test.
- `e2e_jwt`: JWKS `http://idam:8080/idam/jwks`, issuer `http://idam:8080/idam`, audience `grafana-e2e`.
  Used by tokens from the mock IDAM that Grafana forwards.

It sets `authentication_chain = native,e2e_jwt,local_jwt`. That is a runtime setting, re-applied on every
`up`.

**When the StarRocks team confirms their version** (QUESTIONS S3), change the image in
`dev/e2e/docker-compose.yaml` to it, e.g. `starrocks/allin1-ubuntu:4.1.x`, and rerun this test.

### 5.3 End-to-end in Grafana 12.0.1 (before every release)

```bash
npm run build && mage -v build:linux          # dist/ is mounted into Grafana
./scripts/e2e.sh up
./scripts/e2e.sh test                         # curl does the OAuth login; Save & test; query; no-token case
./scripts/e2e.sh refresh                      # optional, ~2.5 min: verifies token refresh → new pool
./scripts/e2e.sh down
```

Expected `test` output:
```
signed in to Grafana as: kmbl3e2e
--- Save & test as the IDAM user
{"message":"Connected to StarRocks as 'kmbl3e2e'@'…' using the IDAM id_token (claim sub=kmbl3e2e, token expires in 1m59s)","status":"OK"}
--- query as the IDAM user
[["'kmbl3e2e'@'…'"]]
--- Save & test as basic-auth admin (no IDAM token: must fail clearly)
{"message":"no IDAM token on this request: …","status":"ERROR"}
PASS
```

### 5.4 Manual UI check

With `./scripts/e2e.sh up` running:
1. Open http://localhost:13000 and click **Sign in with IDAM**. The mock signs you in as `kmbl3e2e` with no
   form.
2. Go to **Connections → Data sources → starrocks-idam-e2e**. Check:
   - There are no username or password fields.
   - The **IDAM identity** section has the token radio and the username claim field.
   - **Save & test** shows "Connected to StarRocks as 'kmbl3e2e'…".
3. In **Explore**, run `SELECT CURRENT_USER()` (Code mode). Also try the visual builder: the dataset and
   table dropdowns go through `QueryData` too.
4. Add a new datasource of this type and check that `oauthPassThru` is saved as `true`: **Save**, then
   `GET /api/datasources/uid/<uid>`.
5. Confirm the datasource does **not** appear in the alert rule datasource picker.

---

## 6. Configuration reference

| UI field | Provisioning key | Default | Notes |
|---|---|---|---|
| Host URL | `url` | — | `host:9030`, no scheme |
| Database name | `jsonData.database` (or top-level `database`) | — | |
| (hidden) | `jsonData.oauthPassThru` | `true` (forced by UI) | **Must** be `true` in provisioning. Grafana reads it |
| Token sent to StarRocks | `jsonData.tokenSource` | `id_token` | `access_token` needs JWT access tokens (QUESTIONS I8) |
| Username claim | `jsonData.usernameClaim` | `sub` | Must match StarRocks `principal_field` and Ranger user names (S1, S5) |
| With CA Cert | `jsonData.tlsAuthWithCACert` + `secureJsonData.tlsCACert` | off | **Required in every real environment** |
| Server name | `jsonData.serverName` | host from `url` | Read only when `tlsAuthWithCACert` or `tlsAuth` is on |
| Use TLS Client Auth | `jsonData.tlsAuth` + `secureJsonData.tlsClientCert/tlsClientKey` | off | Only if StarRocks requires mTLS |
| Skip TLS Verification | `jsonData.tlsSkipVerify` | off | Never in a real environment |
| Session timezone | `jsonData.timezone` | — | Validated against `^[A-Za-z0-9_/+:-]+$` |
| Min time interval | `jsonData.timeInterval` | — | |
| Max connections per user | `jsonData.maxConnsPerUser` | 5 | Number, not string |
| Idle connection timeout (s) | `jsonData.connMaxIdleSeconds` | 60 | Below the NLB idle timeout (~350s) |
| Max connection lifetime (s) | `jsonData.connMaxLifetime` | Grafana `[sql_datasources]` default (14400) | Always capped by token expiry |
| Allow plaintext connection | `jsonData.allowPlaintext` | off | Local container only |

Ignored here although upstream MySQL uses them: `user`, `secureJsonData.password`, `maxOpenConns`,
`maxIdleConns`, `allowCleartextPasswords`, `enableSecureSocksProxy`.

---

## 7. Packaging and the S3 layout

`scripts/package.sh` creates:
```
package/kotak-starrocks-datasource-0.1.0.zip
└── kotak-starrocks-datasource/           ← top-level folder = plugin ID
    ├── plugin.json, module.js, 473.js, sql-query-editor.js (+ .map), img/logo.svg
    ├── README.md, CHANGELOG.md, LICENSE, LICENSE.txt
    ├── gpx_kotak_starrocks_linux_amd64, gpx_kotak_starrocks_linux_arm64, go_plugin_build_manifest
    └── MANIFEST.txt                      ← only when signed (§8)
```

How it reaches the pod, per `docskip/grafana-oss-deployment-context.md` §3 in `obser-aws-deploy-config`:
```
Azure Artifacts feed "Observability" (Universal Package) ─▶ pipelines/grafana-plugin-upload.yml
   UniversalPackages@0 download → unzip -d …/<artifact_name> → S3Upload@1
      s3://obser-<env>-obs1-common-grafana-plugins/grafana_plugins/<artifact_name>/kotak-starrocks-datasource/plugin.json
      (dev bucket: s3://obser-dev-common-shared-grafana-plugins/…)
Pod start: initContainer s3-sync-init
   aws s3 cp s3://…/grafana_plugins/<artifact_name> /grafana/plugins/ --recursive
      → /grafana/plugins/kotak-starrocks-datasource/plugin.json     ✔ what Grafana needs ([paths] plugins=/grafana/plugins)
```

`aws s3 cp --recursive` copies the **contents** of `<artifact_name>/` into `/grafana/plugins/`. That is why the
zip needs the top-level `kotak-starrocks-datasource/` folder. Before relying on this, compare with an existing
plugin:
`aws s3 ls --recursive s3://obser-uat-obs1-common-grafana-plugins/grafana_plugins/grafana-lokiexplore-app-1.0.26/ | head`.
It should show `grafana-lokiexplore-app/plugin.json` one level down.

S3 does not keep the executable bit, so the init container must
`chmod +x` the `gpx_*` binary (§10.4). Dev already does; UAT and prod do not yet.

---

## 8. Signing

Grafana 12 loads unsigned plugins only when they are listed in `[plugins] allow_loading_unsigned_plugins`.
That key is unset in every environment today.

### 8.1 Option A: unsigned with an allow-list (fastest; a one-line `grafana.ini` change)
In `envs/<env>/grafana-values.yml`:
```yaml
grafana.ini:
  plugins:
    public_key_retrieval_disabled: true      # existing
    check_for_plugin_updates: false          # existing
    enable_alpha: false                      # existing
    allow_loading_unsigned_plugins: kotak-starrocks-datasource   # NEW
```
Grafana then logs `Plugin is unsigned … Permitting unsigned plugin` (seen in §2.4).

### 8.2 Option B: private signature (no `grafana.ini` change)
1. A Grafana Cloud account (free) owned by the team. Its **org slug must match the plugin ID prefix**
   (`kotak`). If the slug differs, rename the plugin ID to `<slug>-starrocks-datasource` (§8.3).
2. Create an access policy token with the `plugins:write` scope. Store it as the pipeline secret
   `GRAFANA_ACCESS_POLICY_TOKEN`.
3. After the build and before packaging:
   `npx @grafana/sign-plugin@latest --rootUrls https://dev.observability.kotak.internal/,https://uat.observability.kotak.internal/,https://prod.observability.kotak.internal/[,<DR root_url>]`.
   This writes `dist/MANIFEST.txt`. Do not modify `dist/` afterwards.
4. Root URLs must match each environment's `server.root_url` exactly. Prod is
   `https://prod.observability.kotak.internal`. Read dev, UAT and DR from their `grafana-values.yml`.
5. Test in dev first. `public_key_retrieval_disabled: true` means Grafana validates with its built-in public
   key only.

### 8.3 If the plugin ID must change
Change all of these together:
- `src/plugin.json` (`id`)
- `pkg/main.go` (`datasource.Manage("<id>", …)`)
- `scripts/package.sh` (reads it from `plugin.json` automatically)
- `dev/e2e/docker-compose.yaml` (volume path, `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS`, `GF_LOG_FILTERS`)
- `dev/e2e/provisioning/datasources/starrocks.yaml` (`type`)
- `ci/azure-pipelines.yml` (`pluginId`)
- The deploy-config snippets in §10
- `README.md`

---

## 9. CI pipeline (Azure DevOps)

> **See [`BUILD_PIPELINE_GUIDE.md`](BUILD_PIPELINE_GUIDE.md)** for the full build investigation, the offline,
> Docker and native recipes, and step-by-step pipeline preparation. This section is a short summary.

`ci/azure-pipelines.yml` is a **draft** of: install → typecheck/lint/test → Go tests → build (mage + webpack)
→ optional signing → `scripts/package.sh` → publish a pipeline artifact → optional Universal Package publish to
the `Observability` feed.

Before using it, open `obser-aws-deploy-config/pipelines/grafana-plugin-upload.yml` and copy its conventions:
- How existing plugins are named in the feed: package name, version, and whether the zip is named
  `<id>-<ver>.zip`. Its parameter values look like `grafana-lokiexplore-app-1.0.26` and
  `yesoreyeram-infinity-datasource-2.11.1.linux_amd64`.
- Which agent pool and service connections it uses (`GrafanaS3Upload{Dev,Uat,Prod}`; pools `OnPremUnix` /
  `OnPrimeProdUnix` / `OnPremDRUnix`).
- Whether builds must go through the shared templates repo `Builder Tools/cicd-templates`.

Then set `vstsFeedPackagePublish`, `versionPublish` and the zip name so the upload pipeline can download it
unchanged.

Where the plugin source lives (a new Azure Repos repo, for example) is the team's decision. This directory is
self-contained.

---

## 10. Deploying in the org (`obser-aws-deploy-config`)

### 10.0 Environments and order

| Env dir (`envs/…/grafana-values.yml`) | Grafana | Host (`root_url`) | Plugin bucket | Notes |
|---|---|---|---|---|
| `dev-common-shared` | 12.0.1-security-01 | `dev.observability.kotak.internal` | `obser-dev-common-shared-grafana-plugins` | No StarRocks datasource today. Use it to check plugin loading. Init container already has `mkdir` + `chmod` |
| `uat-obs1-common` | 12.0.1-security-01 | `uat.observability.kotak.internal` | `obser-uat-obs1-common-grafana-plugins` | First real test with the StarRocks team (QUESTIONS S12) |
| `prod-obs1-common` | 12.0.1-security-01 | `prod.observability.kotak.internal` | `obser-prod-obs1-common-grafana-plugins` | After UAT sign-off |
| `dr-obs1-common` | 12.0.1-security-01 | (DR host) | — | `grafana-plugin-upload.yml` has **no DR bucket mapping**. Add one or skip DR |
| `uatdr-obs1-common` | **11.4.0** | — | — | **Skip.** The plugin requires Grafana ≥ 12.0 |

Release namespace and pod: `common-grafana` / `common-grafana-0` (dev: `shared-grafana` / `shared-grafana-0`).
Containers: `s3-sync-init` (init), `grafana`, `s3-sync`.

**Gates before UAT** (from `docs/QUESTIONS.md`):
- I1, I3, I4 and I5 answered by IDAM.
- S1, S2, S4, S5 and S7 answered by StarRocks, and the UAT integration created.
- G1 (signing) decided.

### 10.1 Publish the package
Run the plugin pipeline (§9) with `publish: true`, or upload `package/kotak-starrocks-datasource-<ver>.zip` to
the `Observability` feed by hand. **Needs human approval.**

### 10.2 Upload to S3
1. In `obser-aws-deploy-config/pipelines/grafana-plugin-upload.yml`, add `kotak-starrocks-datasource-<ver>` to
   the `plugin` parameter's `values` list, next to `grafana-lokiexplore-app-1.0.26` and the others. Follow the
   exact naming the existing entries use.
2. Run the pipeline once per environment (Dev, Uat, Prod) with that value. **Needs human approval.**
3. Verify the layout (§7):
   ```bash
   aws s3 ls --recursive s3://obser-uat-obs1-common-grafana-plugins/grafana_plugins/kotak-starrocks-datasource-<ver>/
   # expect …/kotak-starrocks-datasource-<ver>/kotak-starrocks-datasource/plugin.json and …/gpx_kotak_starrocks_linux_amd64
   ```

### 10.3 Decide where the StarRocks CA comes from
The datasource must verify the StarRocks certificate. `grafana.ini` already uses
`/mnt/grafana-secrets/domain-kotak-cacerts` (Secrets Manager `<env>/domain/kotak-cacerts`, through the
`grafana-secrets-provider` SecretProviderClass) as the internal CA bundle for IDAM.
- If that bundle contains the CA that issued the StarRocks 9030 certificate (QUESTIONS S7), use it directly.
- Otherwise, add a secret, e.g. `<env>/logs1r/starrocks-ca`, to the SecretProviderClass objects in
  `extraObjects` with an `objectAlias`, e.g. `grafana-starrocks-ca`, and reference
  `/mnt/grafana-secrets/grafana-starrocks-ca`.

Check from the pod before provisioning:
```bash
kubectl -n common-grafana exec common-grafana-0 -c grafana -- sh -c \
  'openssl s_client -connect uat.observability.logs.kotak.internal:9030 -starttls mysql \
     -CAfile /mnt/grafana-secrets/domain-kotak-cacerts -servername uat.observability.logs.kotak.internal </dev/null 2>&1 | grep -E "Verify return code|subject=|issuer="'
# expect "Verify return code: 0 (ok)"
```
`-starttls mysql` needs OpenSSL ≥ 1.1.1. If the Grafana image has no openssl, run the same command from any
pod or host in the VPC that has it.

### 10.4 Edit `envs/<env>/grafana-values.yml`

**a) Init container.** Add the copy line and the `chmod`. The UAT and prod shape is shown; keep every existing
line:
```yaml
extraInitContainers:
  - name: s3-sync-init
    image: <ecr>/aws-cli:2.37.0-with-grafana-user-472
    imagePullPolicy: Always
    command: ["/bin/sh", "-c"]
    args:
      - |
        aws s3 sync s3://obser-uat-obs1-common-config-grafana-dashboards /grafana/provisioning/user-dashboards --delete
        aws s3 cp s3://obser-uat-obs1-common-grafana-plugins/grafana_plugins/grafana-metricsdrilldown-app-1.0.3 /grafana/plugins/ --recursive
        aws s3 cp s3://obser-uat-obs1-common-grafana-plugins/grafana_plugins/grafana-lokiexplore-app-1.0.26 /grafana/plugins/ --recursive
        aws s3 cp s3://obser-uat-obs1-common-grafana-plugins/grafana_plugins/grafana-exploretraces-app-1.0.0 /grafana/plugins/ --recursive
        # StarRocks datasource that runs queries as the signed-in IDAM user
        aws s3 cp s3://obser-uat-obs1-common-grafana-plugins/grafana_plugins/kotak-starrocks-datasource-0.1.0 /grafana/plugins/ --recursive
        # S3 drops the executable bit; backend plugin binaries need it (dev already does this)
        find /grafana/plugins -type f -name "gpx_*" -exec chmod +x {} \;
    volumeMounts: [dashboards-volume, grafana-secrets (ro), plugin-volume]   # unchanged
```
Use the environment's own bucket names. The prod file uses `obser-prod-obs1-common-…`.

**b) Signing.** Only for option A (§8.1): add `allow_loading_unsigned_plugins: kotak-starrocks-datasource`
under `grafana.ini.plugins`.

**c) Datasource.** Add a new entry under `datasources: datasources.yaml: datasources:`. Do not change the
existing `type: mysql` entries. UAT example for the obs logs app in org 3 (Kotak-All):
```yaml
      # StarRocks logs, queried as the signed-in IDAM user (kotak-starrocks-datasource)
      - name: app-logs-observability-db-idam
        uid: app01961-ds-starrocks-obs-logs-public      # {appid}-ds-{type}-{appname}-{public|private}; ≤ 40 chars
        type: kotak-starrocks-datasource
        access: proxy
        orgId: 3
        editable: false
        isDefault: false
        url: uat.observability.logs.kotak.internal:9030
        jsonData:
          database: obs2_logs1_uat
          oauthPassThru: true            # required: Grafana forwards the user's IDAM tokens only when true
          tokenSource: id_token          # G2 / QUESTIONS I5, I8
          usernameClaim: sub             # = StarRocks principal_field; case must match Ranger users (S1, S5)
          maxConnsPerUser: 5
          connMaxIdleSeconds: 60
          tlsAuthWithCACert: true
          serverName: uat.observability.logs.kotak.internal   # must be in the StarRocks certificate SAN (S7)
        secureJsonData:
          tlsCACert: $__file{/mnt/grafana-secrets/domain-kotak-cacerts}   # or the dedicated alias from §10.3
```
The prod values are `url: prod.observability.logs.kotak.internal:9030`, `database: obs2_logs1_prod` and
`serverName: prod.observability.logs.kotak.internal`.

Start with this one datasource. After sign-off, add one per app and org that needs per-user access, following
the existing `mysql` entries: org 3 and, in UAT, org 2 "playground". Do not add any to org 4 (Alertmanager).
Alert rules cannot use this datasource.

**d) Optional diagnostics** while testing UAT. Revert afterwards:
```yaml
grafana.ini:
  log:
    filters: plugin.kotak-starrocks-datasource:debug
```

### 10.5 Deploy
Open a PR in `obser-aws-deploy-config` with 10.2 and 10.4, and get it reviewed. After merge, run
`pipelines/grafana-deploy.yml` with `environment_cluster_cell` = `uat|obs1|common` (dev: `dev|common|shared`;
prod: `prod|obs1|common`) and `deployGrafana: true`. **Needs human approval.**

The StatefulSet has 1 replica, so expect a short outage while the pod restarts. The SQLite database on the PVC
persists.

### 10.6 Validate (UAT)
```bash
NS=common-grafana; POD=common-grafana-0
kubectl -n $NS logs $POD -c s3-sync-init | tail -20                                # copy lines, no errors
kubectl -n $NS exec $POD -c grafana -- ls -l /grafana/plugins/kotak-starrocks-datasource/   # gpx_* must be -rwxr-xr-x
kubectl -n $NS logs $POD -c grafana | grep -E 'kotak-starrocks|Plugin registered' | head
#   expect: msg="Plugin registered" pluginId=kotak-starrocks-datasource
#   unsigned (option A): msg="Permitting unsigned plugin. This is not recommended" pluginId=kotak-starrocks-datasource
kubectl -n $NS logs $POD -c grafana | grep -E 'provisioning.datasources.*app01961-ds-starrocks'   # datasource inserted
```

In the browser, signed in through IDAM as a UAT test user who has a Ranger policy (S6 / S12):
1. **Connections → Data sources → app-logs-observability-db-idam → Save & test**. Expect
   `Connected to StarRocks as '<user>'@'<ip>' using the IDAM id_token (claim sub=<user>, token expires in …)`.
2. **Explore**: `SELECT CURRENT_USER()` returns the test user.
3. Query a table the user **is** allowed to read: rows come back.
4. Query a table the user is **not** allowed to read: `Error 5203 … Access denied …`, shown as is.
5. Ask the StarRocks team to confirm the audit log shows the human user, not `logsro-app-*`.
6. Leave the session open for more than 60 minutes, then run a query. It must still work, which proves IDAM
   returns a fresh ID token on refresh (QUESTIONS I5). If it fails with "the IDAM token has expired", I5 is
   "no": stop and report.
7. Open an existing dashboard that uses the old `mysql` datasource and check it is unaffected.

### 10.7 Rollback
- **Plugin problem:** remove the new datasource entry and the init-container lines (and
  `allow_loading_unsigned_plugins`), then redeploy. With `prune: true`, removing the entry deletes the
  datasource.
- **Bad plugin version:** point the init-container line back to the previous `kotak-starrocks-datasource-<ver>`
  folder in S3 and redeploy.
- The existing `mysql` datasources are never touched, so rollback does not affect current dashboards.

---

## 11. Troubleshooting

| Symptom (what the user or log shows) | Cause | Fix |
|---|---|---|
| `no IDAM token on this request …` | The user did not sign in through IDAM (basic-auth admin), or the request is an alert, service account or public dashboard | Sign in with IDAM. Alerts and service accounts are not supported |
| `… (oauthPassThru is disabled on this datasource; enable it)` | Provisioning lacks `oauthPassThru: true` | Add it (§10.4c) |
| `the IDAM access_token cannot be used: it is not a JWT (opaque token?)` | `tokenSource: access_token` with Hydra's opaque tokens | Use `id_token`, or get the JWT strategy (I8) |
| `the IDAM token has expired and Grafana could not refresh it …` | IDAM returned no new ID token on refresh, or the refresh failed | QUESTIONS I5. Check Grafana logs for `oauthtoken` refresh errors |
| `Error 5208 … Audience (aud) field [...] is invalid` | `required_audience` ≠ the Grafana client ID (or the access-token audience) | StarRocks team: fix `required_audience` (I1/S1) |
| `Error 5208 … Issuer (iss) field … is invalid` | Issuer mismatch, often the trailing `/` | StarRocks team: set the exact `iss` (I4) |
| `Error 5208 … Cannot find public key for kid: …` | Wrong-environment JWKS, a rotation not yet published, or a file JWKS that is stale | StarRocks team: JWKS URL (I3, I10) |
| `Error 5208 … Login name X is not matched to user Y` | `usernameClaim` ≠ StarRocks `principal_field` | Align them (S1) |
| `Error 5208 … Can not get specified principal …` | The token lacks the `principal_field` claim | Check the claim name |
| `Error 5208 …` mentioning `PKIX`, `SSLHandshake`, `UnknownHost`, `Connection refused` | The FE cannot fetch the JWKS: egress, DNS, or the CA missing from the JVM truststore | StarRocks team (S4) |
| `Error 5203 … Access denied; you need … privilege(s)` | Ranger or StarRocks has no grant for this user | Add the user, in the right case, to a Ranger role (S5, S6) |
| `x509: certificate signed by unknown authority` | The CA bundle lacks the StarRocks issuer | §10.3 |
| `x509: certificate is valid for A, not B` | `serverName`/host not in the certificate SAN | Set `serverName` to a SAN entry (S7) |
| `failed to connect to server - please inspect Grafana server log …` | Network error (DNS, NLB, security group). The detail is in the Grafana log | `kubectl logs … -c grafana`, look for `Query error` |
| `StarRocks requested an auth plugin the driver refused …` / `unknown auth plugin` | Built without the driver patch (`replace` missing) | Restore `go.mod` replace (§0.5) and rebuild |
| Datasource shows "Plugin not found" / type unknown | Init container did not copy the plugin, or wrong S3 layout | §10.6 `ls`, §7 layout |
| Grafana log `fork/exec …/gpx_kotak_starrocks_linux_amd64: permission denied` | Missing `chmod +x` | §10.4a |
| Grafana log `plugin is unsigned … not allowed` | Unsigned and not allow-listed | §8 |
| Datasource missing in the alert rule editor | By design (`alerting: false`) | Use the `mysql` datasources for alerts |

What the plugin logs:
- `Opened StarRocks connection pool` (user, time to expiry)
- `Retiring StarRocks connection pool` (reason: `token replaced`, `token expired`, `idle`,
  `datasource disposed`)
- `Cannot resolve StarRocks identity` (the error, never the token)
- Warnings when `allowPlaintext` is on or `oauthPassThru` is off

Debug lines need `plugin.kotak-starrocks-datasource:debug` in `log.filters`.

---

## 12. Security notes

- Tokens reach the plugin only through Grafana's server-side middleware, after `ClearAuthHeadersMiddleware`
  has removed any auth headers the browser sent. A user cannot inject another user's token.
- The plugin keeps tokens only in memory, as connection credentials. It never writes or logs them.
- Each connection belongs to exactly one user. Pools are keyed by the username from the token, and a pool is
  reused only within its token's validity.
- Through `oauthPassThru`, Grafana also forwards the access token to the plugin. Only the configured one is
  sent to StarRocks.
- TLS verification protects the bearer token in transit. Without it, anyone on the path could replay the
  token until it expires.
- JWTs cannot be revoked. A token stays usable for its lifetime (60 min for ID tokens) even after sign-out
  (QUESTIONS I11).

---

## 13. Maintenance

- **Grafana upgrades** (13.x is staged in `blessed-images`):
  - Rerun §5.3 with the new image tag in `dev/e2e/docker-compose.yaml`.
  - If the new Grafana shares `react/jsx-runtime` and uses React 19, remove the externals override in
    `webpack.config.ts` (D7) and bump `@grafana/*`, `react` and `@types/react` in `package.json`.
- **Upstream MySQL plugin fixes:** diff `pkg/tsdb/mysql` and `public/app/plugins/datasource/mysql` between
  Grafana versions and port the relevant changes. The new logic is isolated in `identity.go`, `userpool.go`,
  `ConfigurationEditor.tsx`, `NewInstanceSettings` and `CheckHealth`.
- **Driver upgrades:** follow `third_party/go-sql-driver-mysql/KOTAK_PATCH.md`.
- **StarRocks upgrades:** rerun §5.2 with the new `allin1-ubuntu` tag. The auth switch logic lives in
  StarRocks `MysqlProto.switchAuthPlugin` and `JWTAuthenticationProvider.authenticate`.
- **License:** the plugin is AGPL-3.0-only because it is derived from Grafana's AGPL code. Internal use is
  fine. Distributing it outside the company has obligations; check with legal before doing so.

---

## 14. Open items

| Item | Owner | Blocks |
|---|---|---|
| Answers to `docs/QUESTIONS.md` Part B (IDAM) | IDAM team | UAT config values; ID token vs access token |
| Answers to Part C, and the UAT security integration plus a Ranger test user | StarRocks team | UAT test |
| Signing decision (G1) | Observability lead | Any deployment |
| Where the plugin repo and pipeline live (§9) | Observability team | Packaging/publishing |
| DR bucket mapping in `grafana-plugin-upload.yml` | Observability team | DR rollout |
| Machine identity for alerts and MCP (Day 2) | IDAM + StarRocks | Alerting on per-user datasources |
