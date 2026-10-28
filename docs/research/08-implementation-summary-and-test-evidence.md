# Implementation summary and test evidence

> **Session record.** The summary given to the user on 2026-10-28 after implementation is kept verbatim in
> section 1. Section 2 holds the raw test output it is based on. Paths refer to the developer machine. In
> this repo they are relative to the repo root.

---

## 1. Summary as delivered

The plugin is built and tested at `/home/sai/kotak-starrocks-datasource`. I ran it end to end in the official `grafana-oss:12.0.1-security-01` image, with a mock OIDC provider standing in for IDAM and a local StarRocks 4.0.10. Save & test and queries ran as the signed-in user, and token refresh worked.

**My earlier cleartext-password plan was wrong.** StarRocks 4.0.10 rejects `mysql_clear_password` for JWT users. It switches the login to the `authentication_openid_connect_client` plugin and expects one byte followed by the length-prefixed JWT. The Go MySQL driver doesn't support that plugin, so I vendored it with a roughly 10-line patch (`third_party/go-sql-driver-mysql/`, explained in `KOTAK_PATCH.md`).

**Verified locally**
- **Go tests:** all pass, including new tests for reading the token and for the per-user pools. 12 out of 12 checks against real StarRocks pass:
  - ID token and access token.
  - Upper-case `user_name` login.
  - 40 concurrent queries across 4 users, each seeing only itself.
  - Wrong audience and foreign signing key rejected with a visible error 5208.
  - Ranger-style privilege error 5203 shown to the user.
- **Frontend:** typecheck and lint have no errors; 57 out of 57 tests pass. The build only depends on modules Grafana 12.0.1 shares with plugins.
- **End to end:** after the OAuth login, Save & test returned `Connected to StarRocks as 'kmbl3e2e'…`. The basic-auth admin gets a clear "no IDAM token" error.
- **Token refresh:** when the 2-minute test token expired, the plugin closed that user's connections. The next query arrived with the refreshed ID token from Grafana and reconnected.
- **Not verified:** IDAM's real refresh behaviour, the real StarRocks TLS certificate, the UAT JWT setup and Ranger, a signed build, and the arm64 binary at runtime.

**Choices I made you should know about**
- `CURRENT_USER()` and `SHOW GRANTS` are now allowed in queries. Upstream blocks them to hide the shared database user, which no longer exists here, and they help users debug Ranger denials.
- The default is 5 connections per user per datasource. My earlier contract said 2; `docs/QUESTIONS.md` has the updated number.
- Alerting is switched off on this datasource, because alert rules have no user token.

**What to hand to your agent**
- Give it the whole folder, without the gitignored `node_modules`, `dist`, `package` and `dev/jwt`.
- `docs/AGENT_GUIDE.md` is the main document: rules, design, how to build and test, and step-by-step org deployment. The deployment steps cover:
  - the upload pipeline and S3 layout;
  - the init-container `chmod`, which UAT and prod lack today;
  - signing options;
  - a ready datasource entry for UAT and prod;
  - checks to run, rollback, and an error-by-error troubleshooting table.
- `CLAUDE.md` points the agent at the guide.
- `ci/azure-pipelines.yml` is a draft. Align it with the conventions in `grafana-plugin-upload.yml`.

**Questions for the other teams:** `docs/QUESTIONS.md` has 12 for IDAM and 12 for StarRocks/Ranger, each with why it matters, plus 6 decisions on your side. The ones that block UAT:
- **IDAM:** does a refresh return a new ID token? If not, queries fail an hour after login. Also the Grafana client ID per environment, and the exact issuer and JWKS URLs.
- **StarRocks:** the exact JWT integration settings, whether user names in Ranger are lowercase `sub` or uppercase `user_name`, whether the StarRocks server can fetch the IDAM JWKS (it does so on every new connection), and which CA issued the 9030 certificate.
- **Your decision:** a private plugin signature, or allowing it unsigned with `allow_loading_unsigned_plugins`.

The unsigned package is ready at `/home/sai/kotak-starrocks-datasource/package/kotak-starrocks-datasource-0.1.0.zip`. To run the local environment again: `./scripts/e2e.sh up`, then `test` (Grafana is on localhost:13000).

I can also publish `QUESTIONS.md` as a shareable page for the IDAM and StarRocks teams.

---

## 2. Test evidence (2026-10-28)

### 2.1 Go integration test against StarRocks 4.0.10

`STARROCKS_IT_ADDR=127.0.0.1:19030 STARROCKS_IT_KEY=$PWD/dev/jwt/key.pem go test ./pkg/mysql -run TestIntegrationStarRocksJWT -v -count=1`
```
starrocks_integration_test.go:102: Connected to StarRocks as 'kmbl3alice'@'172.17.0.1' using the IDAM id_token (claim sub=kmbl3alice, token expires in 1h0m0s)
starrocks_integration_test.go:156: db query error: Error 5208 (42000): Access denied; No authentication was successful in the authentication chain : [local_jwt: Audience (aud) field [some-other-client] is invalid]
starrocks_integration_test.go:202: db query error: Error 5203 (42000): Access denied; you need (at least one of) the SELECT privilege(s) on TABLE logs for this operation. Please ask the admin to grant permission(s) or try activating existing roles using <set [default] role>. Current role(s): NONE. Inactivated role(s): NONE.
--- PASS: TestIntegrationStarRocksJWT (0.17s)
    --- PASS: TestIntegrationStarRocksJWT/health_check_logs_in_as_the_token's_user (0.01s)
    --- PASS: TestIntegrationStarRocksJWT/query_runs_as_the_token's_user (0.01s)
    --- PASS: TestIntegrationStarRocksJWT/access_token_source (0.01s)
    --- PASS: TestIntegrationStarRocksJWT/user_name_claim_logs_in_with_the_upper-case_id (0.01s)
    --- PASS: TestIntegrationStarRocksJWT/concurrent_users_never_share_a_connection (0.03s)
    --- PASS: TestIntegrationStarRocksJWT/refreshed_token_reconnects (0.02s)
    --- PASS: TestIntegrationStarRocksJWT/wrong_audience_is_rejected_by_StarRocks_with_a_visible_error (0.00s)
    --- PASS: TestIntegrationStarRocksJWT/token_signed_by_another_key_is_rejected (0.07s)
    --- PASS: TestIntegrationStarRocksJWT/no_token (0.00s)
    --- PASS: TestIntegrationStarRocksJWT/oauthPassThru_disabled (0.00s)
    --- PASS: TestIntegrationStarRocksJWT/expired_token_is_not_sent (0.00s)
    --- PASS: TestIntegrationStarRocksJWT/privilege_errors_are_shown_to_the_user (0.01s)
ok  	github.com/kotak/kotak-starrocks-datasource/pkg/mysql	0.177s
```

### 2.2 End to end in Grafana `12.0.1-security-01`

The OAuth login is done with curl against the mock IDAM, then Save & test and a query run in Grafana.

`./scripts/e2e.sh test`
```
signed in to Grafana as: kmbl3e2e
--- Save & test as the IDAM user
{"message":"Connected to StarRocks as 'kmbl3e2e'@'172.19.0.4' using the IDAM id_token (claim sub=kmbl3e2e, token expires in 1m59s)","status":"OK"}
--- query as the IDAM user
[["'kmbl3e2e'@'172.19.0.4'"]]
--- Save & test as basic-auth admin (no IDAM token: must fail clearly)
{"message":"no IDAM token on this request: sign in to Grafana through IDAM (alerting, service accounts and basic-auth users are not supported by this datasource)","status":"ERROR"}
--- sessions seen by StarRocks
      1 16777227 kmbl3e2e Sleep
      1 16777230 root Query
PASS
```

Grafana log while loading the plugin and serving the requests:
```
logger=plugins.signature level=warn msg="Plugin is unsigned" id=kotak-starrocks-datasource err="plugin is unsigned: could not find a MANIFEST.txt"
logger=plugin.signature.validator level=warn msg="Permitting unsigned plugin. This is not recommended" pluginId=kotak-starrocks-datasource
logger=plugins.registration level=info msg="Plugin registered" pluginId=kotak-starrocks-datasource
logger=provisioning.datasources level=info msg="inserting datasource from configuration" name=starrocks-idam-e2e uid=e2e-ds-kotak-starrocks-public
logger=plugin.kotak-starrocks-datasource level=debug msg="Opened StarRocks connection pool" pools=1 starrocksUser=kmbl3e2e
logger=plugin.kotak-starrocks-datasource level=info msg="Plugin Request Completed" endpoint=checkHealth status=ok uname=kmbl3e2e
logger=plugin.kotak-starrocks-datasource level=info msg="Plugin Request Completed" endpoint=queryData status=ok uname=kmbl3e2e
logger=oauthtoken endpoint=checkHealth uname=admin level=warn msg="The specified user's auth provider is not oauth" authmodule=password
```

### 2.3 ID token refresh (120s tokens)

`./scripts/e2e.sh refresh`. The `tokenExpiresIn=1.2e+11` value is nanoseconds; it has since been changed to
log as a duration string.
```
first query
[["'kmbl3e2e'@'172.19.0.4'"]]
waiting 130s for the 120s ID token to expire...
query after expiry (Grafana must refresh the token and forward the new ID token)
[["'kmbl3e2e'@'172.19.0.4'"]]
grafana-1  | logger=plugin.kotak-starrocks-datasource t=2026-10-28T04:46:33.497613211Z level=debug msg="Opened StarRocks connection pool" logger=kotak-starrocks-datasource pools=1 starrocksUser=kmbl3e2e tokenExpiresIn=1.2e+11
grafana-1  | logger=plugin.kotak-starrocks-datasource t=2026-10-28T04:48:33.505832732Z level=debug msg="Retiring StarRocks connection pool" logger=kotak-starrocks-datasource reason="token expired" starrocksUser=kmbl3e2e inFlight=0
grafana-1  | logger=plugin.kotak-starrocks-datasource t=2026-10-28T04:48:53.247573419Z level=debug msg="Opened StarRocks connection pool" logger=kotak-starrocks-datasource pools=1 starrocksUser=kmbl3e2e tokenExpiresIn=1.2e+11
PASS
exit 0
```

The pool was retired when the token expired. The next query carried the new ID token that Grafana got from
its refresh, and a new pool opened.

### 2.4 Frontend and unit tests
```
npm run typecheck   → OK
npm run lint        → 0 errors (29 warnings: upstream deprecations)
npm run test:ci     → Test Suites: 9 passed, 9 total; Tests: 57 passed, 57 total
go vet ./... && go test -race ./pkg/...                          → ok
(cd third_party/go-sql-driver-mysql && go test -run TestAuth .)  → ok
```
