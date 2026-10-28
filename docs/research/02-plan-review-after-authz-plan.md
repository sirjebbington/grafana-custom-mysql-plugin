# Plan review after the org authz plan

> **Session record**, kept verbatim. Written 2026-10-27, after the user shared StarRocks 4.0.10 and the authz plan (Ranger + IDAM JWT, Day-1 custom Grafana plugin).
>
> **Changed since:**
> - **Gap 1 was real, and worse than expected.** StarRocks never requests `mysql_clear_password` for JWT users; it requests `authentication_openid_connect_client`. The driver was patched. See [06](06-starrocks-jwt-auth-source-analysis.md).
> - **`BeforeConnect`:** not used. Per-user pools are opened with a fixed token and replaced when Grafana refreshes it.
> - **Per-user limit:** the default became 5 connections per user, not 2. The total per-datasource cap was dropped: holding a global slot while waiting for a per-user connection would starve other users.

---

Your plan settles three of the open decisions, and the code checks turned up three problems the plan doesn't cover yet.

## What's now decided

- **Identity:** the IDAM-issued JWT. The Grafana-signed token and impersonation options are dropped.
- **Delivery:** a new custom plugin with its own ID (your doc's §5.3), not a patch to the built-in MySQL plugin. The 26 UAT and 4 prod `mysql` datasources stay untouched.
- **Authorization:** Ranger decides who sees what. The plugin only carries the user's identity, and the shared per-app read-only user goes away for the new datasources.

## Good news for the custom-plugin route

- **The backend copies over cleanly.** `pkg/tsdb/mysql` imports nothing from Grafana's internals except its own `sqleng` folder.
- **No driver workaround needed.** The plugin gets its own Go module, so Grafana's pin of the MySQL driver to v1.7.1 doesn't apply. Driver v1.10's `BeforeConnect` hook (`dsn.go:124`) can set each user's name and current token on every new connection, which replaces the custom connector I mentioned last time.
- **Token forwarding works for external plugins too.** The middleware runs for every backend plugin, not just built-in ones.
- **One frontend catch:** the MySQL editor depends on `@grafana/sql`, which is marked `"private": true` (`packages/grafana-sql/package.json:4`) and isn't on npm. Its source has no imports from Grafana's internals, so it can be copied into the plugin.
- **Licensing:** the code you'd copy (the MySQL plugin and `@grafana/sql`) is AGPL-3.0-only. Worth a quick check with whoever handles licensing.

## Three gaps in the plan

**1. The cleartext login has to be tested first. This is the biggest technical risk.**
- The Go driver doesn't choose how to send the password. It uses whichever login method StarRocks announces first (`packets.go:262` in the driver).
- It only sends the JWT in cleartext if StarRocks announces `mysql_clear_password` or asks to switch to it.
- The MySQL command-line client can force cleartext with `--enable-cleartext-plugin`. The Go driver has no such option.
- If StarRocks 4.0.10 doesn't request the switch for JWT users, the driver hashes the JWT and login fails. The fix would then be a small patch to the driver.
- A short test program against your StarRocks will answer this before anything else gets built. I can write it now.

**2. MCP through Grafana won't carry the user's token.**
- Token forwarding only works for people who signed in to Grafana through the browser OAuth login.
- Service accounts are refused (`oauth_token.go:90`).
- Logins through Grafana's own JWT auth are refused too, because they're recorded as `jwt`, not `oauth_*` (`oauth_token.go:103`).
- The incoming auth header is also removed before it reaches any plugin (`clear_auth_headers_middleware.go`).
- So if mcp-grafana queries StarRocks through Grafana's API, Ranger won't see the end user. MCP would have to send the user's JWT to StarRocks directly.

**3. "No core Grafana configuration changes" isn't quite true.**
- **Signing:** an unsigned plugin only loads if `allow_loading_unsigned_plugins` is set in `grafana.ini`, and it's unset today. A private plugin signature avoids that. It needs a free Grafana Cloud account and is tied to each environment's root URL.
- **Helm values:**
  - An S3 copy line in the prod init container.
  - A `chmod +x` for the plugin binary, which only dev does today.
  - New provisioning entries with the new plugin type.
- **Alert rules:** any alert rules on the new datasources will fail, because no user is attached to them. That's probably right under the Ranger model, but it needs confirming.

## Connection strategy (still open)

I'd go with one small pool per user per datasource:
- Each new connection gets that user's latest token through `BeforeConnect`.
- At most 2 connections per user, closed after about 60s idle.
- A connection never lives longer than its token, because StarRocks likely checks the JWT only at login.
- A total cap per datasource. You run a single Grafana replica, so that cap is the overall limit.

For the POC, opening a fresh connection per query is fine and can be upgraded later.

## What I still need

1. **A decoded IDAM access token** (header and payload only, signature removed). I need `iss`, `aud`, lifetime, size, and which claim is the username Ranger knows (`sub`/employee ID or email). Also: does StarRocks expect the access token or the ID token?
2. **StarRocks JWT setup, from the StarRocks team:**
   - The security integration's settings: JWKS URL, username claim, required issuer and audience.
   - The `authentication_chain` setting.
   - Whether the login username must equal the username claim.
3. **The MCP path:** does MCP reach StarRocks through Grafana or directly?
4. **Alert rules:** do any exist on the StarRocks datasources, and is failing them OK?
5. **Sizing:** peak concurrent users, number of FE nodes, `qe_max_connection` and `max_user_connections`.
6. **TLS:** is the StarRocks FE certificate signed by the Kotak CA? That would let you drop `tlsSkipVerify`.
7. **Signing:** private signature, or is setting `allow_loading_unsigned_plugins` acceptable?
8. **For the test:** a test StarRocks endpoint and one JWT-enabled test user.

I'd start with the test program for gap 1, since its result decides whether the plain driver works or needs a patch. Want me to write it, or scaffold the plugin first?
