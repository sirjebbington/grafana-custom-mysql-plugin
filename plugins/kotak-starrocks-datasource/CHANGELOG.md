# Changelog

## 0.1.0 (unreleased)

- First version. Fork of the Grafana 12.0.1 built-in MySQL datasource (`pkg/tsdb/mysql`,
  `public/app/plugins/datasource/mysql`, `packages/grafana-sql`) that connects to StarRocks as the signed-in
  user by forwarding their IDAM JWT (ID token by default, access token optional).
- Per-user connection pools; pools are replaced when Grafana refreshes the token and closed when it expires.
- go-sql-driver/mysql v1.10.0 patched for the `authentication_openid_connect_client` auth plugin that StarRocks
  JWT security integrations require (`third_party/go-sql-driver-mysql`).
- TLS is always on unless `allowPlaintext` is set for local testing.
- `CURRENT_USER()`, `USER()` and `SHOW GRANTS` are allowed in queries.
- Alerting is disabled (`alerting: false`): alert evaluation has no signed-in user and so no token.
