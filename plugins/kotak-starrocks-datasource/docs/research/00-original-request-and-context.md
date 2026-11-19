# Original request and context

## The request (2026-10-27, pasted by the user)

> I am working in the grafana/grafana codebase and I need to customize the built-in MySQL datasource to
> support a 'Forward OAuth Identity' feature, similar to how it works in the Prometheus datasource. The goal
> is to pass the logged-in user's OAuth JWT token to the backend (StarRocks, which uses the MySQL wire
> protocol) for role-based access control.
>
> Please analyze the codebase and give me a step-by-step implementation guide covering:
>
> **Frontend:** Locate the MySQL configuration component (under public/app/plugins/datasource/mysql) and show
> me how to add the UI toggle for jsonData.forwardOauthIdentity.
>
> **Backend Token Extraction:** Show me how to extract the active user's JWT token inside the MySQL backend
> plugin (pkg/tsdb/mysql).
>
> **Cleartext Authentication:** StarRocks expects the JWT in the password field. How do we configure
> github.com/go-sql-driver/mysql to use the mysql_clear_password plugin so the JWT is sent without being
> hashed?
>
> **Connection Pooling Strategy:** Injecting a unique user JWT into the DSN will break Go's database/sql
> connection pooling, creating a new pool per user. How can we manage these connections efficiently without
> exhausting StarRocks' connection limits? Is there a way to inject the token per query/session rather than
> per connection pool?
>
> Tell what more do you need for a comprehensive research. What are my options?

## Later scope statements from the user

- "starrocks 4.0.10 is the version being used. the idam token is jwt not opaque." The user also shared the
  org authz plan, summarised below.
- "the part on the starrocks side is something being developed. my task is to customize the grafana mysql
  plugin to forward the token ID or access). context: currently, starrocks is setup with user id password for
  views, but the current development is ongoing on the apache ranger and starrocks by other team."
- "lets go ahead with the implementation. Then give me exact questions to ask, both from idam and starrocks
  perspective. Then write a proper step by step way for deploying this custom plugin in my org environment…
  prepare the steps in a proper md that I can give to the claude agent along with the code."

## Org authz plan (summary of the plan screenshot)

- Apache Ranger is integrated with StarRocks for authorization.
- Clients pass the IDAM-issued JWT. StarRocks validates it and passes the identity to Ranger, which enforces
  user and role policies.
- **Day 1 POC:**
  - Migrate the Logging UI.
  - "A new Grafana MySQL plugin will be developed to forward the user's JWT token to StarRocks … without
    requiring any core Grafana configuration changes; only the custom plugin implementation is needed."
  - MCP enhancements so that MCP also propagates the user JWT.
- **Day 2:** IDAM-to-Ranger role sync.

## Org deployment context

These notes were taken from photos of `obser-aws-deploy-config/docskip/grafana-oss-deployment-context.md`
and from the two research agents' findings. The photos are not in this repo.

**Grafana**
- `12.0.1-security-01` on EKS, except `uatdr`, which runs 11.4.0.
- Helm chart `grafana` 8.3.4 (Kotak fork, `helm-charts/grafana`), deployed by Azure DevOps
  `pipelines/grafana-deploy.yml`.
- StatefulSet, **1 replica**, PVC 10Gi.
- The image wraps the official `grafana/grafana-oss:12.0.1-security-01` (`blessed-images/grafana-oss`);
  nothing is compiled from source.
- Environments, with values in `envs/<env>/grafana-values.yml`:
  - `dev-common-shared`: dev.observability.kotak.internal
  - `uat-obs1-common`: uat.observability.kotak.internal
  - `uatdr-obs1-common`: 11.4.0
  - `prod-obs1-common`: prod.observability.kotak.internal
  - `dr-obs1-common`

**Plugins**
- Not installed through `GF_INSTALL_PLUGINS`.
- Flow: Azure Artifacts feed `Observability` (Universal Package `<plugin>-<ver>.zip`) →
  `pipelines/grafana-plugin-upload.yml` → `s3://obser-<env>-obs1-common-grafana-plugins/grafana_plugins/<folder>/`
  → init container `s3-sync-init` runs `aws s3 cp --recursive` into an emptyDir at `/grafana/plugins`
  (`[paths] plugins`).
- Only the dev init container runs `chmod +x` on `gpx_*` binaries.
- `allow_loading_unsigned_plugins` is unset everywhere, and `public_key_retrieval_disabled: true`.

**Auth**
- Generic OAuth against IDAM: `auth_url https://api.idam.kotak.internal/oauth2/auth` (UAT host
  `uat.api.idam.kotak.internal`).
- `scopes "openid email phone profile offline offline_access"`, `login_attribute_path: sub`,
  `auth_style: InParams`, `use_refresh_token: true`.
- `tls_client_ca: /mnt/grafana-secrets/domain-kotak-cacerts`.
- Feature toggle `accessTokenExpirationCheck: true`.
- Sessions last at most 8h.

**Secrets**
- AWS Secrets Manager → Secrets Store CSI (`grafana-secrets-provider`) → mounted at `/mnt/grafana-secrets/<alias>`
  and referenced with `$__file{}`.

**StarRocks datasources**
- `type: mysql`, e.g. prod `app-logs-observability-db` / `app01961-ds-mysql-obs-logs-public`.
- `url: prod.observability.logs.kotak.internal:9030`, database `obs2_logs1_prod`.
- User `logsro-app-1961-observability`, `maxOpenConns: 20`, `tlsSkipVerify: true`.
- 26 in UAT and 4 in prod, duplicated per org: 3 Kotak-All, 2 playground (UAT), 4 Alertmanager.
- `datasources.yaml` has `prune: true`.
- uid standard: `{appid}-ds-{type}-{appname}[-{db}]-{public|private}`.

**IDAM** (Ory Hydra)
- Access tokens are opaque (`ory_at_…`) unless the client uses `accessTokenStrategy=jwt`, which needs IRM
  approval.
- ID tokens are always JWTs.
- TTLs: access 10m, ID 60m, refresh 8h.
- `aud` is empty unless an audience is registered and requested.
- `sub` is lowercase `kmbl3…`; `user_name` is uppercase `KMBL3…`.
- UAT issuer is `https://uat.api.idam.kotak.internal/`, with a trailing slash.
- No token exchange.

**StarRocks** (other team)
- Run by the k8s operator: logs1r cluster, shared_data, 1 FE and 1 CN.
- Internal NLB, TCP 9030; idle timeout probably the AWS default of 350s.
- TLS forced (`ssl_force_secure_transport=true`), certificate from the "KotakGroup - Standalone" CA.
- The UAT ranger branch sets `authentication_chain=native,uat_jwt_auth` (definition not in any repo) and
  `access_control=ranger`.
- Ranger roles hold per-tenant service users. There is no usersync.
- Images seen: `obs2-starrocks-fe:v4.1.3` (main) and `v4.1.6` (ranger branch). The user says 4.0.10.

**MCP**
- `mcp-server-starrocks` connects directly as the static user `logsro-mcp-server`.
- mcp-grafana uses a static service account.
- mcp-auth-proxy forwards only `X-Forwarded-User` and `X-Forwarded-Email`.
