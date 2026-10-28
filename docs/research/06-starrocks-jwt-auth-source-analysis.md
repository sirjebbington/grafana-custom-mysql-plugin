# StarRocks 4.0.10 JWT authentication: protocol analysis

Written 2026-10-28. This is the finding that changed the design. The original plan, to send the JWT as a
`mysql_clear_password` password, does not work for StarRocks JWT security integrations.

The evidence comes from three places:
1. Experiments against `starrocks/allin1-ubuntu:4.0.10` (`current_version()` = `4.0.10-5b36164`).
2. Reading the StarRocks source at tag `4.0.10`
   (`fe/fe-core/src/main/java/com/starrocks/{authentication,mysql}/…`, Apache-2.0).
3. The plugin's integration and end-to-end tests.

## 1. Experiment: the stock MySQL client cannot log in

Setup:
```sql
CREATE SECURITY INTEGRATION local_jwt PROPERTIES (
  "type" = "authentication_jwt",
  "jwks_url" = "jwks.json",                    -- file under fe/conf
  "principal_field" = "sub",
  "required_issuer" = "https://local-idam/",
  "required_audience" = "grafana-local"
);
ADMIN SET FRONTEND CONFIG ("authentication_chain" = "native,local_jwt");
```
These property names are accepted by 4.0.10.

Login with a valid RS256 JWT, `sub = kmbl3test1`:
```
$ mysql -h127.0.0.1 -P9030 -ukmbl3test1 -p"$JWT" --enable-cleartext-plugin -e "SELECT CURRENT_USER()"
ERROR 2059 (HY000): Authentication plugin 'authentication_openid_connect_client' cannot be loaded:
  /usr/lib/mysql/plugin/authentication_openid_connect_client.so: cannot open shared object file
```
The result is the same without `--enable-cleartext-plugin`, with a wrong audience, and with a different
username. The server always asks for `authentication_openid_connect_client`.

## 2. Source: how the server picks the client auth plugin

`mysql/privilege/AuthPlugin.java` maps server-side mechanisms to client plugins:
```java
} else if (serverPluginName.equalsIgnoreCase(Server.AUTHENTICATION_LDAP_SIMPLE.toString())) {
    return Client.MYSQL_CLEAR_PASSWORD.toString();
} else if (serverPluginName.equalsIgnoreCase(Server.AUTHENTICATION_JWT.toString())) {
    return Client.AUTHENTICATION_OPENID_CONNECT_CLIENT.toString();
```
Only LDAP uses `mysql_clear_password`. JWT uses `authentication_openid_connect_client`.

`mysql/MysqlProto.java` `switchAuthPlugin(...)`:
- If the user is not a native user, it takes the **first non-native entry** of `authentication_chain`.
  It maps that integration's type to a client plugin.
- If the client's handshake used a different plugin, it sends an **AuthSwitchRequest**:
  `0xfe` + plugin name + `0x00`. It then reads the whole switch response as the auth response.
- If the client already used `authentication_openid_connect_client` in its handshake, no switch is sent and
  the handshake auth data is used directly.

`authentication/AuthenticationHandler.java` `authenticateWithSecurityIntegration(...)`:
- It skips any integration whose client plugin differs from the plugin of the current connection. So a
  `mysql_clear_password` response can never reach the JWT provider.
- The authenticated user is `UserIdentity.createEphemeralUserIdent(user, remoteHost)`: the username **as the
  client sent it**.

## 3. Source: the response format the JWT provider expects

`authentication/JWTAuthenticationProvider.java`:
```java
ByteBuffer authBuffer = ByteBuffer.wrap(authResponse);
//1 Byte for capability mysql client
MysqlCodec.readInt1(authBuffer);
byte[] idToken = MysqlCodec.readLenEncodedString(authBuffer);
JWKSet jwkSet = GlobalStateMgr.getCurrentState().getJwkMgr().getJwkSet(jwksUrl);
OpenIdConnectVerifier.verify(new String(idToken), userIdentity.getUser(), jwkSet, principalFiled, requiredIssuer, requiredAudience);
context.setAuthToken(new String(idToken));
```
So the client must send **one capability byte followed by the token as a length-encoded string**. The raw
JWT plus a NUL terminator, which is what `mysql_clear_password` sends, would be misread.

## 4. Source: what is verified

`authentication/OpenIdConnectVerifier.java`:

| Check | Behaviour |
|---|---|
| Signature | `SignedJWT.parse`, key looked up by **`kid`** in the JWKS, then `jwk.toRSAKey()` + `RSASSAVerifier`. **RSA only.** A missing `kid` fails with "Cannot find public key for kid" |
| Principal | `claims.getStringClaim(principal_field)` must exist and **`equalsIgnoreCase`** the login name |
| Expiry | Rejected if `exp` is in the past. **No `exp` claim means no expiry check.** Checked only at login |
| Issuer | `iss` must be one of `required_issuer`, exact string match. An unset property skips the check |
| Audience | `aud` must contain one of `required_audience`. An unset property skips the check |

`authentication/JwkMgr.java`:
- `getJwkSet(url)` opens `http(s)://` URLs with `new URL(jwksUrl).openStream()`, or reads
  `$STARROCKS_HOME/conf/<url>` otherwise.
- **There is no caching: one fetch per login.**
- HTTPS uses the JVM default truststore.

`authentication/JWTSecurityIntegration.java`:
- Required properties are `type`, `jwks_url` and `principal_field`.
- `required_issuer` and `required_audience` are optional comma-separated lists.

## 5. What the plugin does about it

- **Driver patch.** `third_party/go-sql-driver-mysql` is go-sql-driver v1.10.0 with one new auth case,
  gated by `Config.AllowOpenIDConnect`:
  ```go
  case "authentication_openid_connect_client":
      if !mc.cfg.AllowOpenIDConnect { return nil, ErrOpenIDConnect }
      authResp := []byte{1}
      authResp = appendLengthEncodedInteger(authResp, uint64(len(mc.cfg.Passwd)))
      return append(authResp, mc.cfg.Passwd...), nil
  ```
  The plugin's `go.mod` uses it through `replace`. See `third_party/go-sql-driver-mysql/KOTAK_PATCH.md`.
- **Connection lifetime.** No connection outlives its token, because `exp` is checked only at login. Pools
  are retired at token expiry and replaced when Grafana refreshes the token.
- **Error visibility.** Auth failures (error 5208) and privilege failures (5203) are shown to the user,
  because they explain the denial.

## 6. Results with the patched driver

Through the plugin's real `QueryData` and `CheckHealth` against 4.0.10:
```
Connected to StarRocks as 'kmbl3alice'@'172.17.0.1' using the IDAM id_token (claim sub=kmbl3alice, token expires in 1h0m0s)
db query error: Error 5208 (42000): Access denied; No authentication was successful in the authentication chain : [local_jwt: Audience (aud) field [some-other-client] is invalid]
db query error: Error 5203 (42000): Access denied; you need (at least one of) the SELECT privilege(s) on TABLE logs for this operation. ... Current role(s): NONE.
```

- A login as `KMBL3ALICE` with `sub = kmbl3alice` succeeds, and `CURRENT_USER()` is `'KMBL3ALICE'@…`. The
  case-insensitive match is confirmed, and Ranger would see the upper-case name.
- A token signed with a key not in the JWKS is rejected.
- 40 concurrent queries from 4 users each returned only their own `CURRENT_USER()`.

## 7. Consequences for other clients

These apply to the Logging UI, MCP, and scripts:
- **JDBC/MySQL Connector, mariadb CLI, Python clients:** they need a client that implements
  `authentication_openid_connect_client`. MySQL 9.x clients support it with
  `--authentication-openid-connect-client-id-token-file`; older clients do not. Forcing
  `mysql_clear_password` does **not** work.
- **The StarRocks team** should know that every new connection fetches the JWKS from IDAM. JWKS
  availability and latency therefore affect login, and the FE JVM must trust IDAM's TLS certificate.
