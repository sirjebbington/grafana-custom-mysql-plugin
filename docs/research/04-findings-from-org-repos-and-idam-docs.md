# Findings from the org repos and IDAM docs

> **Session record**, kept verbatim. Written 2026-10-27, after reading the 41 photos of the two agents' findings files.
>
> **Changed since:**
> - **The mariadb `--default-auth=mysql_clear_password` test proposed here would fail** against a StarRocks JWT integration. Only `authentication_openid_connect_client` is accepted for security-integration logins. See [06](06-starrocks-jwt-auth-source-analysis.md).
> - **Go driver test:** the test program proposed here became `pkg/mysql/starrocks_integration_test.go`, plus the docker-compose environment in `dev/e2e`.
> - **Ownership:** the user later clarified that StarRocks, Ranger and the JWT integration belong to another team. The "what I still need" items became [`docs/QUESTIONS.md`](../QUESTIONS.md).

---

I've read all 41 photos: the deploy-config findings and the IDAM facts file. Three findings change the plan.

## The three things that change the plan

**1. The token may not be a JWT.**
- The IDAM docs say access tokens are opaque by default: Ory Hydra tokens starting `ory_at_` (`faqs.md:50`, `faqs.md:231`).
- JWT access tokens are an opt-in per-client setting, `accessTokenStrategy=jwt`, and need IRM approval. That setting is documented only on the `jwt-doc` branch.
- ID tokens are always JWTs.
- You said the token is a JWT. If Grafana's IDAM client was already switched to the JWT setting, fine. If not, StarRocks can't validate the access token.

**2. No one has ever logged in to StarRocks with a JWT.**
- Every client uses a fixed username and a normal password.
- The UAT ranger branch sets `authentication_chain = "native,uat_jwt_auth"`, but the `uat_jwt_auth` definition (signing-key URL, username claim, issuer, audience) isn't in any repo. Someone created it by hand.
- It's very likely untested. The StarRocks Java process doesn't trust the Kotak CA. A `truststore.jks` is built on the ranger branch, but no Java startup option points at it. So fetching IDAM's signing keys over HTTPS will probably fail.

**3. No Ranger policy covers individual people yet.**
- Ranger runs only on UAT.
- Its roles contain tenant service users (e.g. `logsro-app-1961-observability`), and there's no user sync.
- A real person's login needs that person added to a Ranger role, with the exact name StarRocks will see. `sub` is lowercase `kmbl…` and `user_name` is uppercase `KMBL…`.

## Which token to forward

| | ID token (`X-ID-Token`) | Access token as a JWT |
|---|---|---|
| Changes needed in IDAM | None. It's always a JWT. | `accessTokenStrategy=jwt` (IRM approval), plus a StarRocks audience registered on the Grafana client |
| `aud` StarRocks must check | Grafana's client ID (inferred, not documented) | The registered StarRocks audience. Grafana can request it by adding `?audience=…` to `auth_url` (should work; verify on UAT). |
| Lifetime / still valid after logout | 60 minutes | 10 minutes |
| Kept fresh by Grafana | Yes. Grafana refreshes when either token expires (`oauth_token.go:497-519`), as long as IDAM returns a new ID token on refresh, which the docs don't confirm. | Yes |

My recommendation: run the POC on the ID token, since it needs no IDAM ticket, and raise the IRM request for JWT access tokens now for production. The plugin can offer both through a "token to forward" setting.

## Quick checks on UAT that unblock everything

```sql
-- StarRocks admin, on the UAT FE
SELECT current_version();             -- repos show v4.1.3 / v4.1.6 images; only blessed-images has 4.0.10
SHOW CREATE SECURITY INTEGRATION uat_jwt_auth;
ADMIN SHOW FRONTEND CONFIG LIKE '%authentication_chain%';
```

```bash
# Which certificate the UAT FE actually serves (the prod cert was checked; UAT wasn't)
openssl s_client -starttls mysql -connect uat.observability.logs.kotak.internal:9030 \
  -servername uat.observability.logs.kotak.internal </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -ext subjectAltName -dates
```

Also, in the IDAM self-service portal (UDP UI), check the Grafana client's "Access Token Strategy" and its audience list.

Then run the login test in two steps:
- **Command-line login, forcing cleartext.** Use the mariadb client your init jobs already use: `mariadb -h … -P 9030 --ssl --default-auth=mysql_clear_password -u <claim value> -p"$JWT"`. This proves StarRocks, Ranger and the signing-key fetch work at all. If it fails, `fe.log` shows why.
- **The Go driver with `allowCleartextPasswords=true`.** This proves StarRocks asks the client to switch to cleartext. If the command-line login works but Go gets "access denied", the driver needs a small patch.

## Design details now settled

- **MCP is unaffected by this plugin.** The StarRocks MCP server connects to StarRocks directly as `logsro-mcp-server`, and mcp-grafana uses a fixed service account. Giving MCP per-user identity is separate work: the MCP auth proxy currently drops the IDAM token and forwards only `X-Forwarded-User` and `X-Forwarded-Email`.
- **TLS:** StarRocks forces TLS, so the JWT travels encrypted. The plugin should verify the certificate against the Kotak CA bundle Grafana already mounts, using the hostname on the certificate, instead of `tlsSkipVerify`.
- **Connection pool:** the network load balancer has no idle timeout configured, so the AWS default of 350s probably applies. I'd close idle connections after 60s and keep connection lifetime under both the token's remaining life and about 5 minutes.
- **Connection limits:** with one FE, the StarRocks defaults are 4096 connections total and 1024 per user (inferred, not set anywhere). Per-user connections fit easily.
- **Username:** the plugin will read it from a configurable claim in the token, not from the Grafana login. Grafana's login is `sub`, but StarRocks may use `user_name`.
- **Scope:** the plugin targets the logs1r cluster: 10 app-log datasources in UAT, each in 2 orgs. The audit StarRocks cluster has no JWT setup, and the real MySQL datasources stay on the built-in plugin.
- **Alerts:** no alert rules on these datasources exist in any repo. Rules made in the UI are still unknown, so the curl loop from my last message still applies.

## What I still need from you

1. The output of the three SQL queries and the openssl command.
2. The Grafana client's access token strategy and audience settings from the UDP UI.
3. A way to get your own UAT token for the login test. For example, a UAT test client created in the UDP UI (non-prod can skip approval), or a token from the IDAM team.
4. A UAT test user added to one tenant role in `ranger-policies-values.yml`, named exactly as the username claim shows it.

I can write the Go test program now so it's ready when you have a token. Want me to?
