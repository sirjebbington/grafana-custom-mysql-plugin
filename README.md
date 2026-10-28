# StarRocks (IDAM identity) datasource

A Grafana datasource for StarRocks, over the MySQL protocol, that runs every query **as the Grafana user who
runs it**. It does not use a shared database user. The plugin takes the user's IDAM token, which Grafana
forwards when "Forward OAuth Identity" (`oauthPassThru`) is on, and logs in to StarRocks with it. StarRocks
verifies the JWT, and Apache Ranger decides what that user may read.

It is a fork of Grafana 12.0.1's built-in MySQL datasource. The query editor, macros (`$__timeFilter`, …) and
result handling are unchanged. Only authentication and connection pooling differ.

## How it works

```
Browser ──(Grafana session)──▶ Grafana ──QueryData + X-Id-Token / Authorization──▶ plugin backend
                                                                   │
                     one pool per user, user = token claim (sub)   │  TLS, MySQL protocol
                                                                   ▼
                       StarRocks FE :9030 ── JWT security integration (verifies signature, iss, aud, exp)
                                          └─ Ranger (authorizes by user name)
```

1. Grafana's OAuth pass-through middleware adds the user's ID token (`X-Id-Token`) and access token
   (`Authorization: Bearer …`) to each request from a signed-in IDAM user.
2. The plugin reads the configured token and takes the username from the configured claim (default `sub`).
3. It opens, or reuses, a small connection pool for that user. The username is the claim value and the
   password is the JWT. StarRocks switches the login to the `authentication_openid_connect_client` auth plugin
   and verifies the token.
4. When Grafana refreshes the token, the plugin opens a new pool with it. When a token expires, its pool is
   closed.

## Requirements

- Grafana ≥ 12.0 with users signed in through Generic OAuth (IDAM).
- StarRocks ≥ 3.5 with a JWT security integration in `authentication_chain`. This plugin was tested against
  4.0.10.
- TLS on the StarRocks MySQL port. The token is a bearer credential.

## Limitations

- **No alerting, no service accounts, no public dashboards, no basic-auth users.** These have no IDAM token.
  The datasource is marked `alerting: false`.
- Queries fail with "the IDAM token has expired" if IDAM stops returning a fresh token on refresh.

## Settings

| Setting | jsonData key | Default | Notes |
|---|---|---|---|
| Host URL | `url` (top level) | — | `host:9030` |
| Database | `database` | — | |
| Forward OAuth identity | `oauthPassThru` | forced `true` | Read by Grafana. Without it no token is forwarded |
| Token sent to StarRocks | `tokenSource` | `id_token` | or `access_token`, which must be a JWT |
| Username claim | `usernameClaim` | `sub` | Must match the StarRocks `principal_field` |
| Max connections per user | `maxConnsPerUser` | `5` | Per datasource |
| Idle connection timeout | `connMaxIdleSeconds` | `60` | Keep below the load-balancer idle timeout |
| Max connection lifetime | `connMaxLifetime` | Grafana default (14400) | Also capped by token expiry |
| With CA cert | `tlsAuthWithCACert` + secure `tlsCACert` | off | Verify StarRocks with this CA |
| Server name | `serverName` | host from URL | Only read when a CA cert or client cert is set |
| Skip TLS verify | `tlsSkipVerify` | off | Local testing only |
| Allow plaintext | `allowPlaintext` | off | No TLS at all. Local container only |
| Session timezone | `timezone` | — | `SET time_zone` per connection |

Documentation:
- `docs/AGENT_GUIDE.md`: build, test and deployment steps.
- `docs/BUILD_PIPELINE_GUIDE.md`: build anatomy, offline/air-gapped and Docker builds, and pipeline preparation.
- `docs/QUESTIONS.md`: open questions for the IDAM and StarRocks teams.
- `docs/research/`: how the design was reached, including the StarRocks JWT protocol analysis, Grafana internals and test evidence.

## License

AGPL-3.0-only, inherited from the Grafana code it is derived from. `third_party/go-sql-driver-mysql` is
MPL-2.0.
