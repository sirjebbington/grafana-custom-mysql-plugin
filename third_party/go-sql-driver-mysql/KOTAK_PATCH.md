# Patched go-sql-driver/mysql v1.10.0

This is github.com/go-sql-driver/mysql v1.10.0 (MPL-2.0, see LICENSE) with one change, marked `[kotak patch]`:

- `auth.go`: support for the `authentication_openid_connect_client` auth plugin. StarRocks JWT security
  integrations send an AuthSwitchRequest to this plugin and read the response as
  `[capability: 1 byte][ID token: length-encoded string]`
  (StarRocks `fe/fe-core/.../authentication/JWTAuthenticationProvider.java`, `MysqlProto.switchAuthPlugin`).
  Upstream v1.10.0 rejects the plugin with "unknown auth plugin".
- `dsn.go`: new `Config.AllowOpenIDConnect` flag that gates it (off by default).
- `errors.go`: `ErrOpenIDConnect`.
- `auth_test.go`: `TestAuthSwitchOpenIDConnect`, `TestAuthSwitchOpenIDConnectNotAllowed`.

The plugin's go.mod uses it through `replace github.com/go-sql-driver/mysql => ./third_party/go-sql-driver-mysql`.
To upgrade: copy a newer upstream release over this directory and re-apply the hunks marked `[kotak patch]`.
