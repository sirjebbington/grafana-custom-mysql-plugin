# Questions for the IDAM and StarRocks teams

The Grafana plugin is built and tested. It runs every StarRocks query as the signed-in user by sending that
user's IDAM JWT. The questions below are what the plugin's configuration and rollout still depend on. Each one
says why it matters and what answer is needed. Facts marked **verified** were tested on 2026-10-28 against
StarRocks 4.0.10 (`starrocks/allin1-ubuntu:4.0.10`) and Grafana `12.0.1-security-01`, or read from the
StarRocks 4.0.10 source.

---

## Part A: What the plugin sends (give this to both teams)

| Item | Value |
|---|---|
| Endpoint | StarRocks FE MySQL port, e.g. `uat.observability.logs.kotak.internal:9030`, through the NLB |
| Transport | TLS, always. Grafana verifies the server certificate against the CA bundle we configure (planned: `/mnt/grafana-secrets/domain-kotak-cacerts`), with host name checking |
| MySQL username | The value of one token claim, set per datasource: `sub` (default, lowercase `kmbl3…`) or `user_name` (uppercase `KMBL3…`) |
| Credential | The user's raw IDAM JWT. The ID token by default; the access token is optional (needs JWT access tokens) |
| Auth plugin | The client answers StarRocks' AuthSwitchRequest for `authentication_openid_connect_client` with `[0x01][length-encoded JWT]`. **Verified:** this is what StarRocks JWT security integrations require; `mysql_clear_password` is not accepted for JWT users |
| Who gets a token | Only users who signed in to Grafana through IDAM. Alert rules, service accounts, public dashboards and the local admin have no token, and this datasource refuses them |
| Connections | One pool per user per datasource: at most 5 connections (configurable), idle ones closed after 60s, every connection closed before its token expires, and a new pool opened when Grafana refreshes the token |
| Token freshness | Grafana refreshes the access token and ID token with the refresh token before forwarding them (`use_refresh_token: true`). **Verified with a standard OIDC provider:** a new ID token is forwarded after the old one expires |

**Verified StarRocks 4.0.10 behaviour that both teams should know** (`JWTAuthenticationProvider`,
`OpenIdConnectVerifier`, `JwkMgr`, `MysqlProto.switchAuthPlugin`):

1. The JWT must be signed with an **RSA** key (RS256/384/512) and carry a **`kid`** that is in the JWKS.
   EC or HMAC keys fail.
2. StarRocks compares the claim named by `principal_field` with the MySQL username **case-insensitively**.
   Logging in as `KMBL3ABC` with `sub = kmbl3abc` works. The session user, which Ranger sees, is the username
   **exactly as the client sent it**.
3. `exp` is checked **only at login**. A session stays open after its token expires; the plugin closes
   connections before expiry for that reason.
4. `iss` must exactly equal one of `required_issuer`, trailing slash included. `aud` must contain one of
   `required_audience`. Leaving either property out disables that check.
5. **The FE downloads the JWKS URL on every new connection.** There is no cache in 4.0.10. Every login is one
   HTTPS GET from the FE to IDAM.
6. A JWKS URL that does not start with `http(s)://` is read as a file under `fe/conf/`.
7. A failed login returns MySQL error **5208** with the reason, e.g.
   `Access denied; No authentication was successful in the authentication chain : [<integration>: Audience (aud) field [...] is invalid]`.
   A missing privilege returns error **5203**. The plugin shows both to the user.

---

## Part B: Questions for the IDAM team

**I1. What is the Grafana OAuth client ID in each environment (dev, UAT, prod, DR)?**
The ID token's `aud` is the client ID, and StarRocks' `required_audience` must be set to it.
*Need:* the client ID per environment, and whether `aud` in the ID token is the string `"<client_id>"` or the
array `["<client_id>"]`. Either works.

**I2. Which algorithm signs ID tokens and access tokens, and is `kid` always in the JWT header?**
StarRocks 4.0.10 only accepts RSA keys and looks keys up by `kid`.
*Need:* the algorithm (expect `RS256`) and confirmation that `kid` is always present.

**I3. What is the JWKS URL in each environment, and can the StarRocks FE pods reach it?**
We have `https://uat.api.idam.kotak.internal/.well-known/jwks.json` from the `jwt-support` branch docs. The prod
URL `https://api.idam.kotak.internal/.well-known/jwks.json` is inferred.
*Need:*
- Exact JWKS URLs per environment.
- Whether the endpoint is live in production now, not only on a branch.
- That it is reachable from the observability EKS VPC.
- Which CA signs its TLS certificate (the StarRocks JVM must trust it).

**I4. What is the exact `iss` value per environment?**
The docs show `https://uat.api.idam.kotak.internal/` with a trailing slash. StarRocks compares the string
exactly.
*Need:* exact issuer strings for dev/UAT/prod/DR.

**I5. Does a `refresh_token` grant return a new `id_token`?**
This is the most important question for ID-token mode. Grafana keeps forwarding whatever ID token it last
received. If IDAM's refresh response has no `id_token`, every user's ID token expires 60 minutes after login
and their StarRocks queries fail with "the IDAM token has expired" until they sign in again.
*Need:* yes or no for the Grafana client with scopes `openid email phone profile offline offline_access`. If no,
can it be enabled for this client?

**I6. Confirm token lifetimes for the Grafana client: ID token 60m, access token 10m, refresh token 8h.**
Grafana sessions last up to 8h. Connections are recycled at each token's expiry.
*Need:* lifetimes, and whether the ID token lifetime can be set per client.

**I7. Which claim is the permanent, unique user identifier: `sub` or `user_name`?**
It becomes the StarRocks/Ranger user name. It must never be reassigned to another person and must be the same
string Ranger policies will use.
*Need:*
- Confirmation that `sub` (lowercase `kmbl3…`) is stable and unique.
- Whether `user_name` (uppercase) is always identical apart from case.
- Which one other systems (AD, Ranger usersync later) use.

**I8. (Only if we choose access tokens.) Can the Grafana client get JWT access tokens with a StarRocks audience?**
Access tokens are opaque (`ory_at_…`) unless the client uses `access_token_strategy=jwt`, which needs IRM
approval. Their `aud` is empty unless an audience is registered on the client and requested at authorize time.
*Need:* whether IRM would approve the JWT strategy for Grafana, and whether an audience such as `starrocks` can
be registered.
Note: Grafana's generic OAuth has no audience setting. It would go in `auth_url` as `?audience=…`, which we
would verify on UAT.

**I9. Can the JWKS endpoint take one request per new StarRocks connection?**
StarRocks fetches the JWKS on every login (Part A, 5). Expect bursts when many users open dashboards at once.
*Need:* rate limits, caching or CDN in front, and the availability target. If IDAM is down, no new StarRocks
connection can be opened.

**I10. How are signing keys rotated?**
*Need:* the rotation frequency, and confirmation that the old key stays in the JWKS until every token it signed
has expired. Otherwise logins fail for up to 60 minutes after a rotation.

**I11. Is it acceptable that a JWT stays valid until it expires (up to 60 minutes) after the user signs out?**
JWTs cannot be revoked. StarRocks checks `exp` only at login, and the plugin closes connections at expiry.
*Need:* sign-off from IAM security, or a shorter ID token lifetime for this client.

**I12. Is there a machine identity (client-credentials JWT) for non-interactive use?**
This is Day 2. Alert rules and the MCP server have no user token. If they must run against StarRocks under
Ranger, they need an identity IDAM issues and StarRocks can verify.
*Need:* whether client-credentials tokens are JWTs, and their `sub`/`aud`.

---

## Part C: Questions for the StarRocks / Ranger team

**S1. Please share the security integration you will create in each environment:**
```sql
CREATE SECURITY INTEGRATION <name> PROPERTIES (
  "type" = "authentication_jwt",
  "jwks_url" = "...",
  "principal_field" = "...",
  "required_issuer" = "...",
  "required_audience" = "..."
);
```
The UAT ranger branch references `uat_jwt_auth` in `authentication_chain`, but its definition is in no repo.
*Need:* the full statement per environment. We set the plugin's username claim to the same field as
`principal_field`, and these values must match Part B's I1, I3 and I4.

**S2. Is `authentication_chain = native,<integration>` set in `fe.conf` (persistent) in each environment?**
`ADMIN SET FRONTEND CONFIG` is lost when the FE restarts. `native` must stay first so the existing
`logsro-app-*` users keep working during migration.
*Need:* where it is configured: the operator ConfigMap or `fe.conf`.

**S3. Which StarRocks version and image runs in each environment?**
We were told 4.0.10. The deploy repos show images tagged `obs2-starrocks-fe:v4.1.3` (main) and `v4.1.6` (ranger
branch). The JWT login was verified on 4.0.10.
*Need:* the exact version per environment (`SELECT current_version();`), and whether the build is upstream or
patched. If it is 4.1.x, we will rerun our integration test on that image.

**S4. Can the FE reach the IDAM JWKS URL over HTTPS, and does its JVM trust the CA?**
The FE opens the JWKS URL with the JVM default truststore (`new URL(jwksUrl).openStream()`). The IDAM
certificate is issued by an internal Kotak CA.
*Need:*
- Confirmation that the FE pods have egress to IDAM, and whether through a proxy.
- That the Kotak CA is in the FE JVM truststore.
- A test login result.
If you use a file JWKS instead, who updates it when IDAM rotates keys?

**S5. In which case should Ranger policies name users: `kmbl3xxxxx` or `KMBL3XXXXX`?**
StarRocks accepts either case at login (Part A, 2), but the session user and Ranger see exactly what the
plugin sends. Ranger user matching is normally case-sensitive.
*Need:* the agreed form. We will set `usernameClaim` to `sub` (lowercase) or `user_name` (uppercase) to match.

**S6. How do human users get permissions on Day 1?**
In our test the JWT users had no roles (`Current role(s): NONE`) and were denied with error 5203 until granted.
*Need:*
- Whether each user is added to a Ranger role or policy in `ranger-policies-values.yml` (there is no usersync).
- Whether a `group_provider` is configured for the integration.
- How to request access for a UAT test user.

**S7. TLS on 9030: which host names does the certificate cover, and which CA issues it?**
Grafana will verify the certificate, unlike the `tlsSkipVerify: true` the current datasources use.
*Need:*
- The SAN list. It must include `uat.observability.logs.kotak.internal` / `prod.observability.logs.kotak.internal`
  or whatever name Grafana should use.
- The issuing CA chain ("KotakGroup - Standalone"?), so we can confirm `/mnt/grafana-secrets/domain-kotak-cacerts`
  contains it or add a dedicated secret.
- Confirmation that TLS ends at the FE and the NLB only passes TCP through.

**S8. Are the connection limits OK?**
Expected peak connections = active users × datasources they use × up to 5. Each user is a separate StarRocks
user.
*Need:* confirmation that `qe_max_connection` (default 4096) and per-user `max_user_connections` (default 1024)
are fine, and whether you want a lower per-user cap in the plugin.

**S9. Is the token stored or logged anywhere on the StarRocks side?**
StarRocks keeps the token in the session (`context.setAuthToken`).
*Need:* confirmation that neither the audit log nor `fe.log` writes the token, and what the token is used for
after login (catalogs? Ranger?).

**S10. Is it acceptable that sessions continue past token expiry on the server side?**
StarRocks checks `exp` only at login. The plugin closes its connections before expiry, but other clients may
not.
*Need:* acknowledgement, or a session lifetime limit on the StarRocks side.

**S11. Which error messages should users see?**
The plugin passes StarRocks auth (5208) and privilege (5203) messages through to the user.
*Need:* confirmation that these messages are acceptable to show. They can include the integration name and the
audience value.

**S12. When can we run a joint UAT test?**
*Need:* a date when UAT has the integration enabled, one test user in a Ranger role, and the FE endpoint
reachable from the UAT Grafana pod.

---

## Part D: Decisions on our side (Grafana / observability)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| G1 | Plugin signing | (a) Private signature from a Grafana Cloud account; no `grafana.ini` change. The plugin ID prefix must match the account's org slug. (b) `allow_loading_unsigned_plugins = kotak-starrocks-datasource` in `grafana.ini` | (b) for dev/UAT now; (a) before prod if "no core config change" is a hard rule. With `public_key_retrieval_disabled: true` Grafana uses its built-in key, so test a signed build in dev first |
| G2 | Token type | ID token (works with IDAM defaults) or access token (needs I8) | ID token, if I5 = yes |
| G3 | Username claim | `sub` or `user_name` | Whatever S5 decides |
| G4 | Node architecture | EKS node arch for the Grafana pods | Ship both `linux_amd64` and `linux_arm64` binaries (the package already does) |
| G5 | Which datasources move | New `kotak-starrocks-datasource` entries next to the existing `mysql` ones, per app and org | Start with one (obs logs, org 3) in UAT |
| G6 | Alert rules on StarRocks data | They cannot use this datasource | Keep alerts on the existing `mysql` datasources until there is a machine identity (I12) |
