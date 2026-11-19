# Prompt for the org Claude session: StarRocks Logs Drilldown rollout

Copy everything below the line into Claude Code on the org PC. Fill in the **INPUTS** block first; leave a
value as `unknown` if you don't have it.

---

You are rolling out **`kotak-starrocks-logs-app`**, a new Grafana app plugin that gives the StarRocks log views
(`vw_eks_app_logs_<app_id>`) a Loki-style Logs Drilldown. The app is built and tested (unit, API and browser
end-to-end tests against Grafana 12.0.1-security-01 + the unchanged `kotak-starrocks-datasource` + StarRocks
4.0.10). Your job is to bring it into the org repo and pipelines, deploy it to UAT, verify it with the user,
and prepare prod.

Work step by step. Stop at every **CHECKPOINT** and wait for the user to reply "continue".

## What was decided (do not re-open)

- **The data source is not changed.** The app is frontend-only. It sends SQL to `/api/ds/query` addressed to
  `app-logs-starrocks-db`; Grafana adds the user's IDAM token; StarRocks and Ranger decide what the user sees.
- **The tenant is the view.** `vw_eks_app_logs_<app_id>`; access = Ranger role on that view. The app shows only
  the views `SHOW TABLES` returns for the user.
- **Per-tenant settings** (level source, trace regex + Tempo uid, patterns) are display settings keyed by
  `app_id`, provisioned per org from deploy-config. They are not access control.
- They are **generated once from the Loki data sources** with `scripts/gen-tenants-from-loki.py` (Loki
  `X-Scope-OrgID: app-01996-…` = StarRocks `app_id` `app_01996_…`). Loki will be removed after the migration;
  then the generated file is edited directly.
- Tempo stays readable by every org user; that is accepted.
- Same repo and pipelines as the data source, with **two sibling folders**: `plugins/kotak-starrocks-datasource/`
  and `plugins/kotak-starrocks-logs-app/`. A plugin at the repo root breaks the other one's webpack build.
- Pins: `@grafana/*` 12.0.1, `@grafana/scenes` 6.20.2 (6.21+ needs `@grafana/i18n`, absent in Grafana 12.0).

## INPUTS (filled in by the user)

```
GITHUB_SOURCE           = <path of a checkout of the GitHub repo, branch feature/monorepo-starrocks-logs-app>
ORG_PLUGIN_REPO         = <path of kotak-custom-grafana-plugins (ADO)>            BRANCH = <feature/kotak-starrocks-pipelines>
DEPLOY_CONFIG_REPO      = <path of obser-aws-deploy-config>                       BRANCH = <new-changes-4-plugin>
HELM_CHART_REPO         = <path of helm-charts/grafana at tag 8.3.4, or "unknown">
INPUTS_FILE             = <path of STARROCKS_DRILLDOWN_INPUTS.md>  (tenant → Tempo uid table is in A5)
HANDOFF_FILE            = <path of HANDOFF.md>
NPM_MIRROR_OK           = <yes/no/unknown>
STARROCKS_READ_ACCESS   = <MCP starrocksmcpuat available: yes/no>
PATTERNS_FROM_TEAMS     = <pattern lists per app_id, or "none yet">
MAX_SCAN_HOURS          = <6 unless decided otherwise>
```

## Rules (apply to every step)

1. Read first: `CLAUDE.md` (repo root and this folder), this folder's `README.md`, `docs/DESIGN.md`,
   `docs/ROLLOUT.md`, `docs/MONOREPO.md`, then `HANDOFF_FILE` and `INPUTS_FILE`.
2. **Ask before every outward or irreversible action:** push, PR, creating or running pipelines, publishing
   to the feed, `grafana-plugin-upload.yml`, `grafana-deploy.yml`, messages to other teams. The user runs
   pipelines and kubectl.
3. New branches only. Work in a detached worktree; push HEAD to the branch, and the user pulls. One PR per
   repo at the end, not many.
4. **Do not change product code** of either plugin (`src/`, `pkg/`, `third_party/`, `go.mod`, `.config/`,
   `webpack.config.ts`). If something seems to need it, explain why and wait.
5. No tokens, secrets or real user IDs in files or git (write `kmbl…`). Mask account IDs.
6. Do not invent values. Unknown → `TODO(<owner>)` and list it in the open items.
7. Keep a short log of what was done and decided in `HANDOFF_FILE` (section "Logs Drilldown rollout").
8. Terse replies.

## Step 1: bring the code into the org repo with two folders

1. In `ORG_PLUGIN_REPO`, create branch `feature/starrocks-logs-drilldown` from `BRANCH`.
2. Move the **org repo's own** data source files (its version is newer than GitHub's; do not overwrite them)
   into `plugins/kotak-starrocks-datasource/` with `git mv` (every tracked top-level entry except `pipelines/`
   if it exists at the root). Move ignored local folders (`node_modules`, `dist`) along if present.
3. Copy from `GITHUB_SOURCE`: `plugins/kotak-starrocks-logs-app/` (whole folder), `scripts/build-plugin.sh`,
   the root `README.md` and `CLAUDE.md` (adapt names if needed), and
   `pipelines/templates/build-plugin-steps.yml` (as a reference for step 3).
4. Fix any paths in the org pipelines and docs that assumed the data source at the root.
5. Show `git status` and the tree (two levels).

**CHECKPOINT 1**: user reviews the layout.

## Step 2: build both plugins locally with the org npm mirror

1. `npm view @grafana/scenes@6.20.2 version` and `npm view react-router-dom@6.28.2 version` against the mirror.
   If missing, stop and draft a request for the mirror owners.
2. `scripts/build-plugin.sh plugins/kotak-starrocks-logs-app` → expect 45 tests passing and
   `PASS package/kotak-starrocks-logs-app-0.1.0.zip`.
3. `scripts/build-plugin.sh plugins/kotak-starrocks-datasource` → the data source must build and verify
   exactly as before the move (same tests, both binaries, `PASS`).
4. Optional, only if Docker and the images are available: `cd plugins/kotak-starrocks-logs-app &&
   ./scripts/e2e.sh up && ./scripts/e2e.sh smoke` (needs the data source's built `dist/`).

**CHECKPOINT 2**: report results.

## Step 3: pipelines

1. Change the org's `pipelines/templates/build-steps.yml`, following `pipelines/templates/build-plugin-steps.yml`:
   - add parameters `pluginDir` (used as `workingDirectory` of every step) and `hasBackend` (wraps GoTool,
     vendored Go modules, `go vet`/`go test`, `build-backend.sh`);
   - keep everything else as is: npm mirror auth, Node selection, signing, checksum, artifact, Universal
     Package publish, security attestation and approvals from `cicd-templates`.
2. One pipeline file per plugin with path triggers (`plugins/<id>/*`) and PR validation per path.
3. Release tags per plugin: `<plugin-id>/v<version>`. Make the tag/version check read `<pluginDir>/package.json`.
4. The Universal Package name for the app is `kotak-starrocks-logs-app`, version from its `package.json` (0.1.0).
5. Prepare, do not run. List the ADO steps the user must do (create the new pipeline, PR policy per path).

**CHECKPOINT 3**: user creates/runs the pipelines. First run the **data source** pipeline to prove there is no
regression, then the app pipeline (publish = false, then true).

## Step 4: upload the app to S3 (UAT)

1. In `DEPLOY_CONFIG_REPO`, add `kotak-starrocks-logs-app-0.1.0|0.1.0` to the plugin parameter values of
   `pipelines/grafana-plugin-upload.yml` (same pattern as the data source).
2. Prepare the run for UAT; the user runs it.

**CHECKPOINT 4.**

## Step 5: generate the tenant settings (UAT)

1. Write `tenants-overrides-uat.yaml` (keep it next to the generated file in deploy-config):
   - `default: { level: { source: column } }`;
   - `app_1961_observability`: `level: { source: message }`, and
     `trace: { regex: 'traceid=([0-9a-f]{32})', tempoUid: <UAT Tempo uid for observability from INPUTS_FILE A5> }`;
   - patterns per tenant from `PATTERNS_FROM_TEAMS` (empty lists are fine; teams can use "Suggest patterns" in
     the app later).
2. Write `app-settings.yaml`: `{ maxScanHours: <MAX_SCAN_HOURS>, defaultTimeRange: now-15m }`.
3. Run:
   `python3 plugins/kotak-starrocks-logs-app/scripts/gen-tenants-from-loki.py <DEPLOY_CONFIG_REPO>/envs/uat-obs1-common/grafana-values.yml --datasource-uid app-logs-starrocks-db --overrides tenants-overrides-uat.yaml --settings app-settings.yaml`
4. Check the output:
   - one `apps` entry per org that has `app-logs-starrocks-db` (UAT: orgs 2 and 3);
   - every StarRocks view's `app_id` (11 in the config repo) either has an entry or is fine with `default`;
   - trace regexes copied from Loki actually match StarRocks messages. If `STARROCKS_READ_ACCESS` is yes,
     run per tenant (read-only):
     `SELECT COUNT(*) FROM vw_eks_app_logs_<app_id> WHERE $__timeFilter(observed_timestamp) AND regexp(message, '<regex>')`
     over 1 h. Report counts; do not paste message text.

**CHECKPOINT 5**: user reviews the generated file.

## Step 6: deploy-config change (UAT)

In `envs/uat-obs1-common/grafana-values.yml` (see `docs/ROLLOUT.md` for the exact snippets):
1. `grafana.ini.plugins.allow_loading_unsigned_plugins`: add `kotak-starrocks-logs-app`.
2. `grafana.ini` → `navigation.app_sections: { kotak-starrocks-logs-app: drilldown 5 }` (puts the card on the
   Drilldown page).
3. `s3-sync-init`: add the copy line for `kotak-starrocks-logs-app-0.1.0`, mirroring the data source's line
   (no `chmod` needed: no binary).
4. Provisioning: a ConfigMap with the generated file (`extraObjects`) mounted at
   `/etc/grafana/provisioning/plugins/kotak-starrocks-logs-app.yaml` (`extraConfigmapMounts`). Check in
   `HELM_CHART_REPO` that chart 8.3.4 supports both keys; if not, propose the equivalent the chart supports.
5. Do not change the data source entry or any other data source.

**CHECKPOINT 6**: user reviews the diff, then runs `grafana-deploy.yml` for UAT.

## Step 7: verify in UAT (with the user)

Ask the user to check, in a browser, as a normal IDAM user with access to at least one view:

| # | Check | Expected |
|---|---|---|
| 1 | Menu → Drilldown | a "StarRocks Logs Drilldown" card |
| 2 | Open it | the View list shows only the user's Ranger-granted views |
| 3 | Service grid | volume per service (coloured by level) and newest lines |
| 4 | Show logs on a service | Logs tab: volume, lines; Logs / Table / JSON switch |
| 5 | Level buttons, line search (include/exclude, Aa, regex), + / − in log details | the lines change; chips appear |
| 6 | A line with a trace id → View trace | Explore opens on that tenant's Tempo with the trace |
| 7 | Show context on a line | modal with lines of the same pod |
| 8 | Labels, Fields, Patterns tabs | breakdowns; patterns table with counts and "(unmatched)" |
| 9 | 24 h range + a line search | the scan notice; "Run anyway" works |
| 10 | Administration → Plugins → StarRocks Logs Drilldown → Configuration (admin) | effective config, no warnings |

Also record, for the observability view: time to load the service grid for 1 h and 24 h, and the Logs tab with
a line search for 1 h (browser dev tools, or Query inspector on a dashboard with the same SQL).

**CHECKPOINT 7**: write results to `HANDOFF_FILE`.

## Step 8: prod (prepare only)

Prod depends on the data source working in prod first (HANDOFF pending items: IDAM JWT access tokens, the prod
StarRocks JWT integration, Ranger policies in `obs2_logs1_prod`). When those are done, repeat steps 4–7 with:
- `envs/prod-obs1-common/grafana-values.yml`, prod org 3 only;
- prod Tempo uids (INPUTS_FILE A5, prod column; some differ from UAT).

Prepare the branch and diff; the user decides when to run.

## Step 9: wrap up

One PR per repo (plugin repo, deploy-config), with a description that lists what changed and how it was
verified. Update `HANDOFF_FILE`. List the open items:
- pattern lists per tenant;
- trace regexes for tenants with neither a Loki derived field nor an override;
- the StarRocks team ask: a resource group / concurrency limit for interactive Grafana users;
- after Loki is removed: the generated tenant file becomes the source; delete the overrides step.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No card on the Drilldown page | `navigation.app_sections` missing, or the plugin was not loaded | check grafana.ini; `kubectl logs … -c s3-sync-init`; plugin listed under Administration → Plugins |
| Plugin listed as invalid/unsigned | not in `allow_loading_unsigned_plugins` | add the id |
| "No log views available" | the user has no Ranger grant on any `vw_eks_app_logs_*` view | Ranger role for the user |
| "StarRocks refused the connection … invalid connection" | login rejected at the data source's default-database check (no grants in the DB) or token rejected | Ranger grants; IDAM token (access_token must be a JWT) |
| "Access denied by Ranger (5204)" on a view | Ranger denies that view | Ranger policy |
| Levels all "unknown" | the tenant's `level` column is empty | set `level: { source: message }` for that tenant |
| No "View trace" link | no `trace` setting for the tenant, or the regex does not match its messages | add/fix it in the tenant file; check on the Configuration page |
| Trace link opens Explore with no trace | wrong Tempo uid, or the trace is not in Tempo | Tempo uid from INPUTS_FILE A5 |
| Viewers cannot open Explore from the app | `viewers_can_edit` is false | already true in UAT/prod grafana.ini; keep it |
| Warning banner "The app configuration has problems" | invalid entries in the provisioning file | fix the listed entries; they are ignored meanwhile |
| Slow screens on long ranges | full scans of the message column on the shared CN | shorter ranges; ask the StarRocks team for a resource group |
