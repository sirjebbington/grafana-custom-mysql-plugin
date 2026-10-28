# Initial analysis and options

> **Session record**, kept verbatim. Written 2026-10-27, after reading the Grafana 12.0.1 source and the 20 deployment-doc photos.
>
> **Changed since:**
> - **Cleartext password (point 3):** wrong for StarRocks JWT logins. StarRocks switches JWT users to `authentication_openid_connect_client`, not `mysql_clear_password`. The plugin ships a patched driver instead. See [06](06-starrocks-jwt-auth-source-analysis.md).
> - **Decision 3:** the external plugin with a new ID (§5.3) was chosen.
> - **Decision 1:** the IDAM token was chosen: the ID token by default, the access token as an option.
> - **Decision 2:** per-user pools (option 1) were implemented.
> - **Custom connector / `BeforeConnect`:** not needed. Each pool's token is fixed, and a refreshed token opens a new pool.

---

I've read all 20 screenshots and traced the code. The short version: 2 of your 4 questions are mostly solved by code Grafana already ships. The hard part is connection pooling.

## Already in this codebase

1. **Frontend toggle:** name the setting `oauthPassThru`, not `forwardOauthIdentity`. Grafana's plugin middleware already reads that key. For every backend plugin, including the built-in MySQL one, it attaches the user's access token (`Authorization: Bearer …`) and ID token (`X-ID-Token`) to each request (`pkg/services/pluginsintegration/clientmiddleware/oauthtoken_middleware.go:52`). The UI change is one `<Switch>` in `ConfigurationEditor.tsx`.
2. **Getting the token in the backend:** one call to `req.GetHTTPHeader(backend.OAuthIdentityTokenHeaderName)` in `QueryData`.
3. **Cleartext password:** already supported. The `allowCleartextPasswords` setting adds `&allowCleartextPasswords=true` to the connection string (`pkg/tsdb/mysql/mysql.go:107`), and its switch is already in the UI (`ConfigurationEditor.tsx:142`). Nothing to build.
4. **Pooling is the real work.** Each datasource gets one connection pool with the password fixed in the connection string (`mysql.go:98`, `:150`), and every user shares it (`sqleng/sql_engine.go:253`). Grafana pins the MySQL driver to v1.7.1 (`go.mod:596`). That version doesn't have the `BeforeConnect` hook added in 1.8, so putting a per-user token on each new connection needs a small custom connector.

## Risks in your setup

- **TLS:** your StarRocks datasources set `tlsSkipVerify: true`, which becomes `tls=skip-verify` (`mysql.go:127`). The token would be encrypted but open to a man-in-the-middle attack. You already mount the `domain-kotak-cacerts` CA bundle, so these datasources should verify against it.
- **No logged-in user means no token:** the middleware does nothing when there's no browser request behind the query (`oauthtoken_middleware.go:35`). Alert rules and other background queries get no token. Your basic-auth admin account gets none either, so "Save & test" would fail for it.
- **Username:** StarRocks will probably require the MySQL username to match a claim in the token. The datasource's fixed `user` field would have to become per-user. In your config, the Grafana login is the IDAM `sub`.
- **Build:** changing the built-in plugin requires the from-source image in your doc's §5.2, which doesn't exist yet.

## Your options

**Decision 1: which identity StarRocks trusts**

| Option | Source | Trade-off |
|---|---|---|
| A. IDAM access token | `Authorization` header | Only works if IDAM access tokens are JWTs, not opaque strings. StarRocks must reach IDAM's signing keys (JWKS) and accept the token's issuer and audience. |
| B. IDAM ID token | `X-ID-Token` header | Always a JWT under OIDC, with the audience set to Grafana's client ID. ID tokens weren't designed as API credentials, though this use is common. |
| C. Grafana-signed token | `X-Grafana-Id` header | Grafana 12.0.1 signs one per user on every request: 10-minute lifetime, issuer is your root URL, includes email and login. Signing keys are published at `/api/signing-keys/keys`. No dependency on IDAM, but no IDAM group claims either. |
| D. No token | Service account plus StarRocks `EXECUTE AS <user> WITH NO REVERT` | StarRocks trusts Grafana's word for who the user is. Users must already exist in StarRocks, and the service account needs impersonation grants. |

**Decision 2: connection strategy**

On "per query or per session": MySQL authenticates once, when the connection opens, and has no per-query credential. Per session means per connection, so the question is how to reuse each user's connections.

Don't put a per-request token on one shared pool. The pool hands idle connections to whoever asks next, so user B could end up in user A's session.

| Option | How it works | Trade-off |
|---|---|---|
| **1. Per-user pools (recommended)** | One pool per user per datasource. Each new connection fetches that user's latest token. Cap of 1–2 connections per user, about 60s idle timeout, connection lifetime no longer than the token's, least-recently-used pools closed first, plus a total cap per datasource. | Bounded, and connections are reused across panel refreshes. You run 1 replica, so a cap inside Grafana is your total cap. Most code of the four. |
| 2. New connection per query | Open, authenticate, query, close, with a concurrency cap | Simplest and safest. Costs a TCP + TLS + token check per panel query. |
| 3. Shared pool with `EXECUTE AS` | Option D above | `NO REVERT` means the connection can't go back into the pool, so it costs the same as option 2. |
| 4. Re-authenticate pooled connections | MySQL `COM_CHANGE_USER` | The Go driver doesn't support it, so you'd need to fork it, and I haven't verified StarRocks supports it. Not recommended. |

**Decision 3: how to ship it**

- **Patch the built-in `mysql` plugin:** the feature is opt-in per datasource through `oauthPassThru`, so your 26 UAT and 4 prod datasources behave as before. Needs the §5.2 from-source image.
- **External plugin with a new ID (§5.3):** no Grafana rebuild. It has to be signed or allowed as unsigned, and dashboards need their datasource type changed.

If the real goal is only to stop one app's users from querying another app's datasource, Grafana Enterprise's datasource permissions do that without any database-side identity. Grafana OSS doesn't have them.

## What I need from you

These decide the design:
1. **StarRocks version and JWT setup.** As far as I know, JWT authentication arrived in StarRocks 3.5. Is it configured, and how (security integration, or per-user `authentication_jwt`)? I need the signing-key URL, the claim used as the username, and the required issuer and audience.
2. **Sample IDAM tokens:** an access token and an ID token, decoded, header and payload only with the signature removed. I need to know whether the access token is a JWT, plus its `iss`, `aud`, `sub`, `exp` and size.
3. **How StarRocks gives users roles:** pre-created users with grants, a group provider, or claims from the token?
4. **Alerts and background queries:** do any alert rules, recording rules or public dashboards use the StarRocks datasources? If a query has no token, should it fail or fall back to the service account?
5. **Sizing:** peak concurrent users, panels per dashboard, number of StarRocks FE nodes, and the `qe_max_connection` and `max_user_connections` settings.

These would help:

6. Is the StarRocks FE certificate signed by the Kotak CA, and why is `tlsSkipVerify` on? Can the FE nodes reach IDAM's or Grafana's signing-key URL?
7. Which datasources need this: StarRocks logs only, or audit too?
8. Can your Azure agents build Grafana from source (your §5.5 open items), and are you targeting 12.0.1 or 13.x?
9. Has your security team agreed to forwarding user tokens to the database?

Once I have answers to 1–4, I can write the step-by-step guide with code. I saved your deployment context to memory so future sessions can pick it up.
