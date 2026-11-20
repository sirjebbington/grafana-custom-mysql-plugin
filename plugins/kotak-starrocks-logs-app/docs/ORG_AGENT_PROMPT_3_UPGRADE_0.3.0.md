# Prompt for the org Claude session, edit 3: upgrade 0.1.0 → 0.3.0 in one patch

Copy everything below the line into Claude Code on the org PC. Fill in the **INPUTS** block first.
This replaces edit 2 (`ORG_AGENT_PROMPT_2_DATASOURCE_PICKER.md`): if 0.2.0 was never rolled out, apply this
one only. It contains 0.2.0 (data source picker) and 0.3.0 (the Logs Drilldown look).

---

You are upgrading **`kotak-starrocks-logs-app`** from **0.1.0** (rolled out) to **0.3.0**, as one patch over
the app folder. Tested upstream against Grafana 12.0.1-security-01, the unchanged `kotak-starrocks-datasource`
and StarRocks 4.0.10 with two databases: 58 unit, 21 API and 28 browser end-to-end tests.

Work step by step. Stop at every **CHECKPOINT** and wait for the user to reply "continue".

## What changed (all inside `plugins/kotak-starrocks-logs-app/`)

| Version | Area | Change |
|---|---|---|
| 0.2.0 | Data source picker | "Data source" dropdown next to "View" (one `kotak-starrocks-datasource` instance per StarRocks database); URL key `ds`. Optional `datasources` setting (allowlist/order, per-database `viewPrefix`); `<datasourceUid>/<app_id>` tenant keys; generator `--pin-datasources`. |
| 0.3.0 | Name | **Logs Drilldown (StarRocks)** (card, menu, breadcrumb). Plugin id unchanged. |
| 0.3.0 | Header | Left: "Filter by label values" combobox with a **dropdown of values**. Right: Data source, View, time range (quick ranges **5 minutes … 24 hours**), refresh. |
| 0.3.0 | Service grid | Only the "service" tab plus **+ Add label** (closable tabs). "Search services" dropdown, "Showing N of M", page size, pages. Per row: ★ favourite, **Include / Remove**, Show logs; legend table with totals per level. "Show logs" above the grid shows the logs of the current filters. |
| 0.3.0 | Logs | **Infinite scroll**: scrolling to the end loads the next `lineLimit` lines, without gaps or repeats. "Log levels" select next to the line search. |
| 0.3.0 | View selection | Always selects a view the user can read (URL view → last view used in this browser → first view). Fixes "Select a view / Opening view…" staying up. |
| 0.3.0 | Navigation | Browser Back/Forward between grid, logs and tabs. Label filters in the URL as `var-filters`; 0.1.0 links with `filter=` still open. |
| — | Not changed | Every 0.1.0 settings key; the data source plugin; `pipelines/`; the zip layout; no new npm dependencies. |

**Compatibility with your earlier changes:** 0.3.0 reads every 0.1.0 setting the same way, so the existing
provisioning file, overrides and settings files keep working. Deploy-config only needs the version
(0.1.0 → 0.3.0) in the upload parameter and the `s3-sync-init` line. Pipeline changes are untouched
(nothing outside the app folder is in the patch).

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

1. In `GITHUB_SOURCE`: `git fetch && git log --oneline -6`. Note the 0.1.0 commit `60b0353` ("Add
   kotak-starrocks-logs-app") and the 0.3.0 commit: `git log -1 --format=%h --grep='logs-app 0.3.0'`.
2. In `ORG_PLUGIN_REPO` (on `BASE_BRANCH`): `git log --oneline -- plugins/kotak-starrocks-logs-app`, and compare
   the folder with GitHub's 0.1.0 (exclude `node_modules`, `dist`, `package`, `test-results`):
   `mkdir -p /tmp/app-0.1.0 && git -C <GITHUB_SOURCE> archive 60b0353 plugins/kotak-starrocks-logs-app | tar -x -C /tmp/app-0.1.0`
   then `diff -r -x node_modules -x dist -x package -x test-results /tmp/app-0.1.0/plugins/kotak-starrocks-logs-app plugins/kotak-starrocks-logs-app`.
3. List each org-side difference and whether the patch touches the same file
   (`git -C <GITHUB_SOURCE> diff --stat 60b0353 <0.3.0-commit> -- plugins/kotak-starrocks-logs-app`).

**CHECKPOINT 1**: user reviews the list.

## Step 2: apply the patch (keeps your edits)

1. In `ORG_PLUGIN_REPO`: new branch `feature/starrocks-logs-0.3.0` from `BASE_BRANCH`.
2. In `GITHUB_SOURCE`:
   `git diff --binary 60b0353 <0.3.0-commit> -- plugins/kotak-starrocks-logs-app > /tmp/logs-app-0.3.0.patch`
   (`--binary` is needed: the patch adds screenshots under `docs/screenshots/`).
3. In `ORG_PLUGIN_REPO`: `git apply --3way /tmp/logs-app-0.3.0.patch`. Resolve conflicts by keeping the
   org-side intent and the 0.3.0 behaviour; show every resolution as a diff. Expected and harmless for each
   new file: "error: cannot read the current contents of '…' / Falling back to direct application" (verified
   upstream: on an unmodified 0.1.0 folder the patch applies cleanly and gives exactly the 0.3.0 folder).
4. Do not touch `plugins/kotak-starrocks-datasource/`, `pipelines/` or the repo root.

**CHECKPOINT 2**: user reviews `git status` and the conflict resolutions, if any.

## Step 3: build locally

`scripts/build-plugin.sh plugins/kotak-starrocks-logs-app` → expect 58 tests passing and
`PASS package/kotak-starrocks-logs-app-0.3.0.zip`. Same npm mirror and lock file dependencies as 0.1.0.

**CHECKPOINT 3**: report results. Then the user runs the app pipeline (the data source pipeline is not
triggered: path filters). Publish `kotak-starrocks-logs-app` 0.3.0 to the feed only after approval.

## Step 4: deploy-config (UAT)

On a new branch from `BASE_BRANCH`:
1. `pipelines/grafana-plugin-upload.yml`: add `kotak-starrocks-logs-app-0.3.0|0.3.0` (keep the 0.1.0 value for
   rollback). The user runs the upload for UAT.
2. `envs/uat-obs1-common/grafana-values.yml`, `s3-sync-init`: change the app's copy line from 0.1.0 to 0.3.0.
   Confirm in the values file that an old version folder cannot linger (the pod filesystem is rebuilt on
   restart). The new name comes from `plugin.json`, so the pod restart from the deploy is enough.
3. Provisioning file: **no change needed**. `[navigation.app_sections] kotak-starrocks-logs-app = drilldown 5`
   stays. Optional:
   - fix the picker list/order with `datasources: [app-logs-starrocks-db, …]`, or re-run the generator with
     `--pin-datasources`, keeping your existing overrides and settings files;
   - add `<datasourceUid>/<app_id>` tenant entries only where a tenant differs between databases.
4. If `SECOND_DATABASE` is not "none yet": follow `docs/ROLLOUT.md` → "Adding another StarRocks database"
   (a second `kotak-starrocks-datasource` entry with a new `name`, `uid` and `jsonData.database`, the rest copied
   from the existing entry, in each org that has the first one). The views and Ranger policies in that
   database belong to the StarRocks team; list them as a prerequisite, do not assume them.

**CHECKPOINT 4**: user reviews the diff and runs `grafana-deploy.yml` for UAT.

## Step 5: verify in UAT (with the user)

| # | Check | Expected |
|---|---|---|
| 1 | Menu → Drilldown | card and menu entry "Logs Drilldown (StarRocks)" |
| 2 | Open the app (no URL parameters) | a view the user can read is selected at once (no "Select a view / Opening view…"); URL has `ds=` and `view=` |
| 3 | Header | label filter box left; Data source, View, time, refresh right (on narrow windows they wrap below, right-aligned) |
| 4 | Time picker | quick ranges Last 5 minutes … Last 24 hours, nothing longer |
| 5 | Tabs above the grid | only "service" and "+ Add label"; Add label → a closable tab for that label |
| 6 | Service row | ★, Include (→ filter appears in the label box, button becomes Remove), Show logs |
| 7 | Label filter box | pick a label and operator → a dropdown of its values |
| 8 | "Search services" | typing filters the rows; the dropdown lists matches with line counts |
| 9 | Logs | scroll to the end → the next lines load (more than `lineLimit`) |
| 10 | Back / Forward, old 0.1.0 links | return to the previous screen; an old link with `filter=` opens the same logs |
| 11 | Data source picker | with one database, as in 0.1.0; with two, switching changes views and data |
| 12 | Labels, Fields, Patterns, View trace, Show context | unchanged |

**CHECKPOINT 5**: write results to `HANDOFF_FILE`.

## Step 6: prod and wrap up

Prod: the same steps with prod values after UAT sign-off; prepare, the user runs. One PR per repo describing
what changed and how it was verified. Open items: second-database views and Ranger policies (StarRocks team),
whether to pin `datasources`, per-database tenant entries if any.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Card still says "StarRocks Logs Drilldown" | old zip or the pod was not restarted | check the `s3-sync-init` log for 0.3.0; restart the pod |
| Data source dropdown empty, "No kotak-starrocks-datasource data source is available" | no instance in this org, or `datasources` lists uids that do not exist here | check the org's data sources; fix or remove `datasources` |
| A data source shows "StarRocks refused the connection … invalid connection" | the user has no access in that database (login checks the default database) | expected for people without grants there; Ranger if they should have access |
| "No log views available" | no `<viewPrefix>*` views the user may read | Ranger; or a different `viewPrefix` |
| Values dropdown empty for a label | no rows in the time range under the other filters | widen the range or remove filters |
| Infinite scroll stops early | the range has no older lines | expected; widen the time range |
| Config warning "is not an app_id or <datasourceUid>/<app_id>" | bad tenant key | fix the key |
