# Rollout

The app is a second plugin zip delivered exactly like `kotak-starrocks-datasource`: S3 bucket →
`s3-sync-init` → `/grafana/plugins`. The datasource and its provisioning do not change.

## Prerequisites

- `kotak-starrocks-datasource` working for the target users (JWT login, Ranger grants on their views).
- Per tenant, the trace regex and the Tempo datasource uid (see the inputs file, section A5). Tempo must be in
  the same Grafana org as the StarRocks datasource (true for UAT orgs 2, 3 and prod org 3).

## How tenants are defined

With Loki, each tenant has its own data source (X-Scope-OrgID header, derived field with the trace regex,
link to the tenant's Tempo). With StarRocks there is one data source and **the tenant is the view**:
`vw_eks_app_logs_<app_id>`. Ranger decides which views a person can read; the app only offers those.

The app's `tenants` block is therefore keyed by `app_id` and holds display settings only (level source,
trace regex + Tempo uid, patterns). It is not an access control list: a tenant's settings are used only when
someone who can already read that view opens it.

Do not retype the trace settings: generate them from the Loki data sources in deploy-config. The Loki
tenant header and the StarRocks app_id are the same name with `-` vs `_`
(`app-01996-frontlineplatforms-cmm` ↔ `app_01996_frontlineplatforms_cmm`):

```bash
python3 scripts/gen-tenants-from-loki.py envs/<env>/grafana-values.yml \
  --datasource-uid app-logs-starrocks-db --overrides tenants-overrides.yaml > kotak-starrocks-logs-app.yaml
```

`tenants-overrides.yaml` holds what Loki does not have: tenants whose level is read from the message
(observability), trace regexes for tenants without a Loki derived field, and patterns. Run it in the
deploy-config pipeline (or as a check that fails when the committed file differs) so the two never drift.

## 1. Build and upload

1. Build: `npm ci && npm run typecheck && npm run lint && npm run test:ci && npm run build &&
   ./scripts/package.sh && ./scripts/verify-package.sh` → `package/kotak-starrocks-logs-app-<v>.zip`
   (pipeline: [MONOREPO.md](MONOREPO.md)).
2. Publish it to the Observability feed, then run `pipelines/grafana-plugin-upload.yml` in deploy-config
   with a new value `kotak-starrocks-logs-app-<v>|<v>` (same pattern as the datasource).

## 2. deploy-config (Helm values, per env)

```yaml
grafana.ini:
  plugins:
    allow_loading_unsigned_plugins: kotak-starrocks-datasource,kotak-starrocks-logs-app
  # shows "StarRocks Logs Drilldown" as a card on the Drilldown page next to Metrics / Logs / Traces
  navigation.app_sections:
    kotak-starrocks-logs-app: drilldown 5
```

- `s3-sync-init`: add the copy line for `kotak-starrocks-logs-app-<v>`, mirroring the datasource's line.
  No `chmod` is needed (no backend binary).
- App settings, provisioned as a file (Grafana reads `provisioning/plugins/*.yaml`; supported in 12.0.1).
  One entry per org (UAT: orgs 2 and 3; prod: org 3):

```yaml
extraObjects:
  - apiVersion: v1
    kind: ConfigMap
    metadata:
      name: grafana-starrocks-logs-app
    data:
      kotak-starrocks-logs-app.yaml: |
        apiVersion: 1
        apps:
          - type: kotak-starrocks-logs-app
            org_id: 3
            jsonData:
              datasourceUid: app-logs-starrocks-db
              maxScanHours: 6
              tenants:
                default: { level: { source: column } }
                app_1961_observability:
                  level: { source: message }
                  trace: { regex: 'traceid=([0-9a-f]{32})', tempoUid: <tempo uid> }
                  patterns: []
extraConfigmapMounts:
  - name: grafana-starrocks-logs-app
    configMap: grafana-starrocks-logs-app
    mountPath: /etc/grafana/provisioning/plugins/kotak-starrocks-logs-app.yaml
    subPath: kotak-starrocks-logs-app.yaml
    readOnly: true
```

Without the provisioning file the app still works (it is `autoEnabled`) with defaults
(`datasourceUid: app-logs-starrocks-db`, levels from the column, no trace links, no patterns); a Grafana
admin can then set the JSON on Administration → Plugins → StarRocks Logs Drilldown → Configuration.

3. Run `pipelines/grafana-deploy.yml` (the init container runs on pod start).

## 3. Check

- `kubectl -n <ns> logs <grafana-pod> -c s3-sync-init` shows the new plugin copied.
- Drilldown page shows the StarRocks card; the view picker lists only the user's views.
- On the configuration page, "Effective configuration" shows the tenants and no warnings.
- A trace link from the observability view opens Explore with the Tempo data source.

## Load on StarRocks

Per screen the app issues 1–3 queries (service grid: 2; Logs tab: 2; Labels/Fields/Patterns: 1 each),
plus one per filter value lookup. On the UAT observability view (5.6 M rows/hour) newest-N queries take
~0.15 s at any range, 1 h aggregates ~0.2 s, 24 h aggregates 3–4 s, and 24 h text scans 9–11 s on the single
CN. Ask the StarRocks team for a resource group / concurrency limit for interactive Grafana users before a
wide rollout.
