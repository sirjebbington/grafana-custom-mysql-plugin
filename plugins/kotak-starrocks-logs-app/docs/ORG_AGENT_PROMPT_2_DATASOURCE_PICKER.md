# Prompt for the org Claude session, edit 2: data source picker (app 0.2.0)

> **Superseded** by [`ORG_AGENT_PROMPT_3_UPGRADE_0.3.0.md`](ORG_AGENT_PROMPT_3_UPGRADE_0.3.0.md), which upgrades
> 0.1.0 → 0.3.0 in one patch (this data source picker plus the Logs Drilldown look). Kept for reference.

Copy everything below the line into Claude Code on the org PC, after edit 1 (`ORG_AGENT_PROMPT.md`, app 0.1.0)
is rolled out. Fill in the **INPUTS** block first.

---

You are applying **edit 2** to `kotak-starrocks-logs-app`: a **Data source picker** next to the View picker.
Each `kotak-starrocks-datasource` instance is scoped to one StarRocks database, so other databases with their
own `vw_eks_app_logs_*` views become separate data source instances, and the app lets the user pick one.
Version 0.1.0 → **0.2.0**. Tested upstream: 51 unit, 20 API and 20 browser end-to-end tests, with two databases,
a user who can only reach the second one, and per-database tenant settings.

Work step by step. Stop at every **CHECKPOINT** and wait for the user to reply "continue".

## What changed (all inside `plugins/kotak-starrocks-logs-app/`)

| Area | Change |
|---|---|
| UI | "Data source" dropdown left of "View". Switching resets the view and filters. The choice is in the URL as `ds`. |
| Default choice | `datasourceUid` (unchanged key). If the URL has no `ds` and the default data source gives an error or no views for the user, the app tries the next data source; failures show next to it in the dropdown. |
| New optional setting `datasources` | Picker allowlist and order: `[uid, …]` or `[{uid, viewPrefix}, …]`. Absent = every `kotak-starrocks-datasource` instance in the org. |
| Tenant keys | `tenants` may also use `<datasourceUid>/<app_id>` for settings that only apply in one database (field by field over `<app_id>`, then `default`). |
| Generator | `gen-tenants-from-loki.py` finds every StarRocks data source per org; `--pin-datasources` writes them as `datasources`. |
| Not changed | The data source plugin, `pipelines/`, all 0.1.0 settings keys, the zip layout. (The repo-root README only got a link to this file.) |

**Compatibility with your earlier changes:** 0.2.0 reads every 0.1.0 setting the same way, so your existing
provisioning file, overrides and settings files keep working unchanged. The only deploy-config change needed
is the version (0.1.0 → 0.2.0) in the upload parameter and the `s3-sync-init` line. Your pipeline changes are
untouched because nothing outside the app folder changed.

## INPUTS (filled in by the user)

```
GITHUB_SOURCE        = <checkout of the GitHub repo, branch feature/monorepo-starrocks-logs-app>
ORG_PLUGIN_REPO      = <path of kotak-custom-grafana-plugins>   BASE_BRANCH = <branch that has app 0.1.0>
DEPLOY_CONFIG_REPO   = <path of obser-aws-deploy-config>        BASE_BRANCH = <branch with the 0.1.0 rollout>
HANDOFF_FILE         = <path of HANDOFF.md>
SECOND_DATABASE      = <name of another StarRocks database with vw_eks_app_logs_* views, or "none yet">
```

## Rules

Same as edit 1 (`ORG_AGENT_PROMPT.md`, "Rules"). In short: ask before any push, PR, pipeline run, feed publish,
upload or deploy; the user runs pipelines and kubectl; new branches only (detached worktree, push HEAD, the user
pulls); do not change product code of the data source; no tokens or real user IDs in files; do not invent
values (`TODO(<owner>)`); log decisions in `HANDOFF_FILE`; terse replies.

## Step 1: see what you changed in the app folder since 0.1.0

1. In `GITHUB_SOURCE`: `git fetch && git log --oneline -3`. Note the 0.1.0 commit (`60b0353`, "Add
   kotak-starrocks-logs-app") and the edit 2 commit: `git log -1 --format=%h --grep='data source picker'`.
2. In `ORG_PLUGIN_REPO` (on `BASE_BRANCH`): `git log --oneline -- plugins/kotak-starrocks-logs-app`, and compare
   the folder with GitHub's 0.1.0 (exclude `node_modules`, `dist`, `package`, `test-results`):
   `git -C <GITHUB_SOURCE> archive 60b0353 plugins/kotak-starrocks-logs-app | tar -x -C /tmp/app-0.1.0` then
   `diff -r -x node_modules -x dist -x package /tmp/app-0.1.0/plugins/kotak-starrocks-logs-app plugins/kotak-starrocks-logs-app`.
3. List each org-side difference and whether edit 2 touches the same file.

**CHECKPOINT 1**: user reviews the list.

## Step 2: apply edit 2 as a patch (keeps your edits)

1. In `ORG_PLUGIN_REPO`: new branch `feature/starrocks-logs-ds-picker` from `BASE_BRANCH`.
2. In `GITHUB_SOURCE`: `git diff 60b0353 <edit2-commit> -- plugins/kotak-starrocks-logs-app > /tmp/ds-picker.patch`.
3. In `ORG_PLUGIN_REPO`: `git apply --3way /tmp/ds-picker.patch`. Resolve conflicts by keeping the org-side
   intent and the edit 2 behaviour; show every conflict resolution as a diff. Expected and harmless: for the
   new file `docs/ORG_AGENT_PROMPT_2_DATASOURCE_PICKER.md` git prints "does not exist in index … Falling back to
   direct application" (verified upstream: on an unmodified 0.1.0 folder all 27 files apply cleanly).
4. Do not touch `plugins/kotak-starrocks-datasource/`, `pipelines/` or the repo root.

**CHECKPOINT 2**: user reviews `git status` and the conflict resolutions, if any.

## Step 3: build locally

`scripts/build-plugin.sh plugins/kotak-starrocks-logs-app` → expect 51 tests passing and
`PASS package/kotak-starrocks-logs-app-0.2.0.zip`. No new npm dependencies were added (same mirror as 0.1.0).

**CHECKPOINT 3**: report results. Then the user runs the app pipeline (the data source pipeline is not
triggered: path filters). Publish `kotak-starrocks-logs-app` 0.2.0 to the feed only after approval.

## Step 4: deploy-config (UAT)

On a new branch from `BASE_BRANCH`:
1. `pipelines/grafana-plugin-upload.yml`: add `kotak-starrocks-logs-app-0.2.0|0.2.0` (keep the 0.1.0 value for
   rollback). The user runs the upload for UAT.
2. `envs/uat-obs1-common/grafana-values.yml`, `s3-sync-init`: change the app's copy line from 0.1.0 to 0.2.0.
   Check how the init container handles an older version folder already present (the pod filesystem is
   rebuilt on restart; confirm in the values file).
3. Provisioning file: **no change needed**. Optional:
   - fix the picker list/order with `datasources: [app-logs-starrocks-db, …]`, or re-run the generator with
     `--pin-datasources`, keeping your existing overrides and settings files;
   - add `<datasourceUid>/<app_id>` tenant entries only where a tenant differs between databases.
4. If `SECOND_DATABASE` is not "none yet": follow `docs/ROLLOUT.md` → "Adding another StarRocks database":
   a second `kotak-starrocks-datasource` entry (new `name`, `uid`, `jsonData.database: <SECOND_DATABASE>`,
   everything else copied from the existing entry) in each org that has the first one. The views and Ranger
   policies in that database are the StarRocks team's; list them as a prerequisite, do not assume them.

**CHECKPOINT 4**: user reviews the diff and runs `grafana-deploy.yml` for UAT.

## Step 5: verify in UAT (with the user)

| # | Check | Expected |
|---|---|---|
| 1 | Open the app | "Data source" dropdown shows the StarRocks data source(s); with one, everything works as in 0.1.0 |
| 2 | URL | contains `ds=<uid>`; an old 0.1.0 link without `ds` still opens (default data source) |
| 3 | Configuration page (admin) → "Test: list my views" | one line per data source with the views the admin can see |
| 4 | With a second database | switching the data source changes the view list and the data; filters reset |
| 5 | A user with access in only one database | lands on that database; the other shows the reason in the dropdown |
| 6 | Logs, Labels, Fields, Patterns, View trace, Show context | unchanged from 0.1.0 |

**CHECKPOINT 5**: write results to `HANDOFF_FILE`.

## Step 6: prod and wrap up

Prod: the same steps with prod values after UAT sign-off; prepare, the user runs. One PR per repo, describing
what changed and how it was verified. Open items to list: second-database views and Ranger policies (StarRocks
team), whether to pin `datasources`, per-database tenant entries if any.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Data source dropdown empty, "No kotak-starrocks-datasource data source is available" | no instance in this org, or `datasources` lists uids that do not exist here | check the org's data sources; fix or remove `datasources` |
| A data source shows "StarRocks refused the connection … invalid connection" | the user has no access in that database (login checks the default database) | expected for people without grants there; Ranger if they should have access |
| A data source shows "no log views for you" | the database has no `<viewPrefix>*` views the user may read | Ranger; or a different `viewPrefix` for that data source in `datasources` |
| Wrong level / trace settings in one database only | the tenant differs between databases | add a `<datasourceUid>/<app_id>` tenant entry |
| Config warning "is not an app_id or <datasourceUid>/<app_id>" | bad tenant key | fix the key |
