# Original step-by-step implementation guide (before implementation)

> **Session record**, kept verbatim. Written 2026-10-27, scoped to the Grafana-side plugin. The implementation that followed differs in the points below. The current, verified guide is [`docs/AGENT_GUIDE.md`](../AGENT_GUIDE.md).
>
> **Changed since:**
> - **Step 3 (cleartext) is wrong for StarRocks JWT.** The driver needs the `authentication_openid_connect_client` patch (`third_party/go-sql-driver-mysql`). `AllowOpenIDConnect` and `AllowCleartextPasswords` are both enabled.
> - **Step 4:** the semaphore was dropped. The default became `maxConnsPerUser: 5`. Pools are leased, so a retired pool closes only after in-flight requests finish. A newer token replaces the pool; an older token from another session reuses it. A sweep retires expired and idle pools.
> - **Step 6:** the security integration property names were confirmed against StarRocks 4.0.10. The test runs through `scripts/e2e.sh`.
> - **Step 1:** `serverName` is read by the SDK only when `tlsAuthWithCACert` or `tlsAuth` is on.
> - **Not in the original guide:**
>   - `CURRENT_USER()` / `SHOW GRANTS` are allowed.
>   - `react/jsx-runtime` is bundled for Grafana 12.0.
>   - The webpack, jest and eslint configs are extended for the automatic JSX runtime.
>   - The contract table now lives in `docs/QUESTIONS.md` Part A.

---

Below is the step-by-step guide for the plugin, scoped to the Grafana side. Anything that depends on how the other team sets up StarRocks is a datasource setting, so you can build in parallel with them.

## Step 0: Project layout

A new plugin with ID `kotak-starrocks-datasource`, built as a copy of the built-in MySQL plugin:

```
kotak-starrocks-datasource/          # scaffold: npx @grafana/create-plugin@latest (backend datasource)
├── go.mod                           # own Go module, so it can use go-sql-driver v1.10 (Grafana pins v1.7.1)
├── pkg/main.go                      # from pkg/tsdb/mysql/standalone/main.go, with the new plugin ID
├── pkg/mysql/                       # copy of pkg/tsdb/mysql, including sqleng/
│   └── sqleng/identity.go, userpool.go   # NEW (steps 2 and 4)
└── src/                             # copy of public/app/plugins/datasource/mysql
    └── sql/                         # copy of packages/grafana-sql/src (marked private, not on npm)
```

- **Imports:** change `@grafana/sql` to `./sql`, and the Go imports to the new module path.
- **Package versions:** pin the `@grafana/*` packages to 12.0.1 and `@grafana/plugin-ui` to 0.10.5.
- **Extra npm packages** needed by the copied `sql/` code: `@react-awesome-query-builder/ui`, `sql-formatter-plus`, `immutable`, `react-use`, `react-select`, `react-virtualized-auto-sizer`.
- **Code to drop:** the secure SOCKS proxy and unix-socket handling. Your datasources use neither.

`src/plugin.json`:
```json
{
  "type": "datasource",
  "name": "StarRocks (IDAM identity)",
  "id": "kotak-starrocks-datasource",
  "executable": "gpx_kotak_starrocks",
  "backend": true,
  "alerting": false,
  "annotations": true,
  "metrics": true,
  "dependencies": { "grafanaDependency": ">=12.0.0" }
}
```
`"alerting": false` is deliberate. Alert evaluation runs with no signed-in user, so there's never a token. This setting keeps the datasource out of the alert rule picker.

## Step 1: Frontend

`src/types.ts`:
```ts
export interface StarRocksOptions extends SQLOptions {
  oauthPassThru?: boolean;                     // Grafana's middleware attaches tokens only when this is true
  tokenSource?: 'id_token' | 'access_token';
  usernameClaim?: string;
  maxConnsPerUser?: number;
  serverName?: string;
}
```

In `ConfigurationEditor.tsx`:
- Remove the Username, Password and Allow Cleartext Passwords fields. The identity comes from the token, and cleartext is always on.
- Add this section:

```tsx
useEffect(() => {
  // Forward OAuth Identity is required, not optional, for this plugin
  if (!jsonData.oauthPassThru) {
    updateDatasourcePluginJsonDataOption(props, 'oauthPassThru', true);
  }
}, []); // eslint-disable-line react-hooks/exhaustive-deps

<ConfigSection title="IDAM identity">
  <Field label="Token to forward"
    description="ID token works with IDAM defaults. Access token needs Grafana's IDAM client set to JWT access tokens.">
    <RadioButtonGroup
      options={[{ label: 'ID token', value: 'id_token' }, { label: 'Access token', value: 'access_token' }]}
      value={jsonData.tokenSource || 'id_token'}
      onChange={(v) => updateDatasourcePluginJsonDataOption(props, 'tokenSource', v)}
    />
  </Field>
  <Field label="Username claim"
    description="Token claim sent as the StarRocks username. Must match the principal_field the StarRocks team configures.">
    <Input width={WIDTH_LONG} placeholder="sub" value={jsonData.usernameClaim || ''}
      onChange={onUpdateDatasourceJsonDataOption(props, 'usernameClaim')} />
  </Field>
</ConfigSection>
```
- Keep the existing CA certificate switch and `TLSSecretsConfig`, and add a `serverName` input next to them.
- No query editor changes. Table and column lookups also go through `QueryData`, so they carry the token too.

## Step 2: Backend token extraction

Grafana's middleware already puts the tokens on every request from a signed-in IDAM user (`oauthtoken_middleware.go:52`). The plugin only reads them.

`pkg/mysql/sqleng/identity.go`:
```go
package sqleng

// The plugin does not verify the token: StarRocks does. The claims are read only to pick the
// MySQL username (StarRocks checks it against the verified token) and to cap connection lifetime.

type identity struct {
	Username string
	Token    string
	Expiry   time.Time
}

type headerGetter interface{ GetHTTPHeader(string) string }

func identityFromRequest(req headerGetter, tokenSource, usernameClaim string) (*identity, error) {
	var raw string
	if tokenSource == "access_token" {
		raw = strings.TrimPrefix(req.GetHTTPHeader(backend.OAuthIdentityTokenHeaderName), "Bearer ")
	} else {
		raw = req.GetHTTPHeader(backend.OAuthIdentityIDTokenHeaderName)
	}
	if raw == "" {
		return nil, errors.New("no IDAM token on this request: sign in through IDAM (alerting and service accounts are not supported)")
	}
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("the IDAM %s is not a JWT (IDAM access tokens are opaque unless the client uses the JWT strategy)", tokenSource)
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("decode token payload: %w", err)
	}
	var claims map[string]any
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, fmt.Errorf("parse token claims: %w", err)
	}
	user, _ := claims[usernameClaim].(string)
	if user == "" {
		return nil, fmt.Errorf("token has no %q claim", usernameClaim)
	}
	exp, _ := claims["exp"].(float64)
	return &identity{Username: user, Token: raw, Expiry: time.Unix(int64(exp), 0)}, nil
}
```
The "not a JWT" error tells you right away whether Grafana's IDAM client issues opaque or JWT access tokens. Never log `raw`.

## Step 3: Cleartext password and TLS

In `mysql.go` `NewInstanceSettings`, build the driver config directly instead of a connection string. That also keeps the token out of any string that might get logged.

```go
base := mysql.NewConfig()
base.Net = "tcp"
base.Addr = settings.URL
base.DBName = database
base.Collation = "utf8mb4_unicode_ci"
base.ParseTime = true
base.Loc = time.UTC
base.AllowCleartextPasswords = true // StarRocks expects the raw JWT as the password
if jsonData.Timezone != "" {
	base.Params = map[string]string{"time_zone": "'" + jsonData.Timezone + "'"}
}

opts, err := settings.HTTPClientOptions(ctx)
if err != nil {
	return nil, err
}
tlsConfig, err := sdkhttpclient.GetTLSConfig(opts) // CA cert, skip-verify and serverName from the TLS settings
if err != nil {
	return nil, err
}
if tlsConfig == nil {
	tlsConfig = &tls.Config{}
}
base.TLS = tlsConfig // always set: the token never travels without TLS
```

- **TLS:** set `base.TLS` unconditionally. StarRocks rejects non-TLS connections anyway (`ssl_force_secure_transport=true`). The driver fills in the certificate hostname from `Addr` (`dsn.go:215` in v1.10), so certificate checking works once the Kotak CA is configured.
- **Driver behaviour:** go-sql-driver sends the token in cleartext only when StarRocks asks for `mysql_clear_password`. Step 6 tests that. If StarRocks never asks, the fix is a small driver fork that starts with cleartext, pulled in with a `replace` line in `go.mod`.
- **Error messages:** in `mysqlQueryResultTransformer.TransformQueryError`, let MySQL error 1045 (access denied) and permission errors through. Otherwise users get the generic "query failed" text instead of "access denied".

## Step 4: Per-user connection pools

The design:
- One small pool per user per datasource.
- When Grafana refreshes a user's token, the old pool is closed, so no connection keeps running on a superseded token.
- `BeforeConnect` isn't needed, because each pool's token is fixed.

`pkg/mysql/sqleng/userpool.go`:
```go
type userPool struct {
	db       *sql.DB
	token    string
	lastUsed time.Time
}

type PoolManager struct {
	mu          sync.Mutex
	base        *mysql.Config
	pools       map[string]*userPool // key: StarRocks username
	perUser     int
	idleTimeout time.Duration
	maxLifetime time.Duration
	stop        chan struct{}
}

func NewPoolManager(base *mysql.Config, perUser int, idleTimeout, maxLifetime time.Duration) *PoolManager {
	m := &PoolManager{base: base, pools: map[string]*userPool{}, perUser: perUser,
		idleTimeout: idleTimeout, maxLifetime: maxLifetime, stop: make(chan struct{})}
	go m.evictLoop()
	return m
}

func (m *PoolManager) get(id *identity) (*sql.DB, error) {
	lifetime := min(m.maxLifetime, time.Until(id.Expiry))
	if lifetime < 5*time.Second {
		return nil, errors.New("IDAM token has expired; reload the page to refresh it")
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if p, ok := m.pools[id.Username]; ok {
		if p.token == id.Token {
			p.lastUsed = time.Now()
			return p.db, nil
		}
		go p.db.Close() // token was refreshed: finish in-flight queries, then close
	}

	cfg := m.base.Clone()
	cfg.User = id.Username
	cfg.Passwd = id.Token
	connector, err := mysql.NewConnector(cfg)
	if err != nil {
		return nil, err
	}
	db := sql.OpenDB(connector)
	db.SetMaxOpenConns(m.perUser)
	db.SetMaxIdleConns(m.perUser)
	db.SetConnMaxIdleTime(m.idleTimeout) // stay under the NLB's ~350s idle timeout
	db.SetConnMaxLifetime(lifetime)       // never outlive the token
	m.pools[id.Username] = &userPool{db: db, token: id.Token, lastUsed: time.Now()}
	return db, nil
}

func (m *PoolManager) evictLoop() {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-m.stop:
			return
		case <-t.C:
			m.mu.Lock()
			for user, p := range m.pools {
				if time.Since(p.lastUsed) > 10*time.Minute {
					go p.db.Close()
					delete(m.pools, user)
				}
			}
			m.mu.Unlock()
		}
	}
}

func (m *PoolManager) Close() {
	close(m.stop)
	m.mu.Lock()
	defer m.mu.Unlock()
	for user, p := range m.pools {
		_ = p.db.Close()
		delete(m.pools, user)
	}
}
```

Changes to `sql_engine.go`:
- **Fields:** replace `db *sql.DB` with `pools *PoolManager`. Add `sem chan struct{}`, sized from `maxOpenConns`. It caps concurrent queries per datasource across all users; you run 1 Grafana replica, so that's the overall cap. Add `tokenSource` and `usernameClaim`, with defaults `id_token` and `sub`.
- **`QueryData`:** resolve the user's pool first, then pass it to each query:
  ```go
  id, err := identityFromRequest(req, e.tokenSource, e.usernameClaim)
  var db *sql.DB
  if err == nil {
  	db, err = e.pools.get(id)
  }
  if err != nil {
  	for _, q := range req.Queries {
  		result.Responses[q.RefID] = backend.ErrDataResponse(backend.StatusUnauthorized, err.Error())
  	}
  	return result, nil
  }
  // ...existing loop, now: go e.executeQuery(db, query, &wg, ctx, ch, queryjson)
  ```
- **`executeQuery`:** acquire `e.sem` (or stop on context cancel), then call `db.QueryContext(...)` where it used to call `e.db.QueryContext(...)` (line 253 today).
- **`Dispose`:** call `e.pools.Close()`.
- **In `mysql.go`:** create the pools with `sqleng.NewPoolManager(base, perUser /* default 2 */, 60*time.Second, 5*time.Minute)` and pass them to `NewQueryDataHandler` in place of `db`.

## Step 5: Save & test as a diagnostic

Replace `db.Ping()` in `handler_checkhealth.go`:
```go
id, err := identityFromRequest(req, e.tokenSource, e.usernameClaim)
if err != nil {
	return &backend.CheckHealthResult{Status: backend.HealthStatusError, Message: err.Error()}, nil
}
db, err := e.pools.get(id)
if err != nil {
	return ErrToHealthCheckResult(err)
}
var current string
if err := db.QueryRowContext(ctx, "SELECT current_user()").Scan(&current); err != nil {
	return ErrToHealthCheckResult(err)
}
return &backend.CheckHealthResult{Status: backend.HealthStatusOk,
	Message: fmt.Sprintf("Connected as %s using the %s (expires in %s)", current, e.tokenSource, time.Until(id.Expiry).Round(time.Second))}, nil
```

- Run it signed in through IDAM. The basic-auth admin account has no token.
- It tells you which token works, what username StarRocks sees, and how long the token has left.
- Running it again after an hour confirms whether IDAM sends a new ID token when Grafana refreshes.

## Step 6: Test without waiting for the other team

- **Start StarRocks locally:** run StarRocks all-in-one in Docker, using the same version as UAT.
- **Make a test token:** generate an RSA key, save its public JWKS file under `fe/conf`, and sign a test JWT with `iss`, `aud`, `sub` and `exp` claims.
- **Turn on JWT login in StarRocks:**
  ```sql
  CREATE SECURITY INTEGRATION local_jwt PROPERTIES (
    "type" = "authentication_jwt",
    "jwks_url" = "jwks.json",                 -- file under fe/conf, or an https URL
    "principal_field" = "sub",
    "required_issuer" = "https://local-issuer/",
    "required_audience" = "grafana-local"
  );
  ADMIN SET FRONTEND CONFIG ("authentication_chain" = "native,local_jwt");
  ```
  Property names are from the StarRocks JWT docs. Check them against the version you run.
- **Run the test:** write an integration test, e.g. `go test ./pkg/mysql/sqleng -run TestJWTLogin`, that feeds the test JWT to `PoolManager.get` and runs `SELECT current_user()`. It answers the cleartext question from step 3 on your own machine.
- **Full end-to-end (optional):** add Keycloak to the Docker setup as a stand-in for IDAM, sign in to Grafana through it, and point StarRocks's `jwks_url` at Keycloak's signing keys.

## Step 7: Build, sign, deliver, provision

1. **Build:** `npm run build` and `mage -v build:linuxAMD64`. Zip the output with the files inside a top-level `kotak-starrocks-datasource/` folder.
2. **Sign:** Grafana loads only signed plugins.
   - A private signature (`npx @grafana/sign-plugin --rootUrls https://uat.observability.kotak.internal,...`) needs a free Grafana Cloud account and no `grafana.ini` change. That matches the plan's "no core Grafana configuration changes".
   - For dev/UAT only, `allow_loading_unsigned_plugins` works.
3. **Deliver** through your existing S3 plugin path:
   - Add the plugin to `grafana-plugin-upload.yml`.
   - Add an `aws s3 cp` line in each environment's init container.
   - Add the `chmod +x gpx_*` step, which prod lacks today.
4. **Provision** a new datasource next to the existing one. Existing `mysql` datasources stay untouched.
   ```yaml
   - name: app-logs-observability-db-idam
     uid: app01961-ds-starrocks-obs-logs-public
     type: kotak-starrocks-datasource
     access: proxy
     orgId: 3
     url: uat.observability.logs.kotak.internal:9030
     jsonData:
       database: obs2_logs1_uat
       oauthPassThru: true
       tokenSource: id_token
       usernameClaim: sub
       tlsAuthWithCACert: true
       serverName: uat.observability.logs.kotak.internal
       maxOpenConns: 20
       maxConnsPerUser: 2
     secureJsonData:
       tlsCACert: $__file{/mnt/grafana-secrets/domain-kotak-cacerts}
   ```

## What to hand the StarRocks team

| Item | What the plugin does |
|---|---|
| Endpoint | FE port 9030 via `uat.observability.logs.kotak.internal`, TLS verified against the Kotak CA, so the certificate must cover that name |
| Username | Value of the configured claim. Default `sub` (lowercase `kmbl…`); `user_name` is the uppercase alternative. |
| Password | The raw IDAM JWT. ID token by default, access token if configured. |
| Login method | `mysql_clear_password`. StarRocks must ask for it, because the driver won't start with it. |
| Issuer | `https://uat.api.idam.kotak.internal/`, with the trailing slash |
| Audience | ID token: Grafana's client ID. Access token: the audience registered on Grafana's client. |
| Ranger usernames | Exactly the username claim's value and case |
| Connections | At most 2 per user per datasource, closed after 60s idle, replaced when the token refreshes |

## Left on your side

1. **Grafana's IDAM client:** get its client ID for the other team's audience setting. If you want access tokens, request the JWT access token setting, which needs IRM approval.
2. **ID token refresh:** confirm IDAM sends a new ID token when Grafana refreshes. If it doesn't, ID-token forwarding stops working after 60 minutes. Step 5's message shows the expiry.
3. **Signing:** choose private signature or unsigned loading.

I haven't compiled any of this. I checked the driver APIs against go-sql-driver v1.10 source on this machine. The plugin SDK v0.277 header calls are from memory, because that module isn't downloaded here. The StarRocks SQL in step 6 is the least certain part.

I can scaffold the actual plugin next, with these changes applied and unit tests for step 2 and step 4. Tell me where to create it; I'd suggest a sibling folder next to this Grafana source tree.
