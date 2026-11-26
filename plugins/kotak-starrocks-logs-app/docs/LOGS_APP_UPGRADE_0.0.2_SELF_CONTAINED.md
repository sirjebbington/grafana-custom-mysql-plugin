# Logs Drilldown (StarRocks): upgrade 0.0.1 → 0.0.2 (self-contained, for the org PC)

## For the person giving this file to Claude

1. Copy this file as **raw text** (GitHub "Raw" view, or a text editor), not from a rendered preview. The
   patch lines must stay exactly as they are; chat messages and email bodies wrap long lines.
2. On the org PC, save it as for example `~/plugin-poc/LOGS_APP_UPGRADE_0.0.2.md`.
3. Start Claude Code in the org plugin repo and say:
   *"Read ~/plugin-poc/LOGS_APP_UPGRADE_0.0.2.md and follow the instructions for the agent in it."*

What 0.0.2 changes for users:
- **GenAI log views.** Next to `vw_eks_app_logs_*`, the app lists `vw_genai_logs_<app_id>_<app_name>` views (in
  any data source, e.g. `genai-starrocks-db`), with no configuration change.
- **Views with other column names work as they are.** A view does not need the app logs' column names: the app
  finds its time, message, level, service and pod columns by common names (`event_time`, `body`,
  `severity_text`, `service_name`, `pod_uid`, ...) and shows every other column (as fields, JSON columns in the
  log details). A column it cannot find is named in the configuration, not in code.
- **The time picker only offers ranges of at most 24 hours.** Quick ranges stop at "Last 24 hours"; in an
  absolute range the end can only be picked up to 24 hours after the start (later days are disabled, a typed
  longer range cannot be applied); zoom out stops at 24 hours. The range picked is the range queried. Old links
  with a longer range are still cut to their last 24 hours, with the notice.

---

# Instructions for the agent

You are upgrading **`kotak-starrocks-logs-app`** from **0.0.1** (already applied in this org from
`LOGS_APP_UPGRADE_0.0.1_SELF_CONTAINED.md`) to **0.0.2**. This PC cannot reach the GitHub repo, so this one
file carries everything: these instructions, an extractor script, and the patch as 34 per-file blocks.

The patch is `git diff ffce890 d354a28 -- plugins/kotak-starrocks-logs-app`, without `docs/` and `README.md`
(documentation only). It was tested upstream against Grafana 12.0.1-security-01, the unchanged
`kotak-starrocks-datasource` and **StarRocks 4.1.6** (the UAT version) with the session in **Asia/Kolkata**: on
the app log views (native and real Iceberg tables) and on two GenAI views whose columns are named differently
(`event_time`, `body`, `severity_text`, `service_name`, `namespace`, `pod_name`, `pod_uid`, `tenant`,
`trace_id`, `model`, `attributes` as JSON text). 325 unit, 46 API (9 of them on the GenAI views), 16 Iceberg API
and 43 browser tests pass, and the pipeline build passes.

Work step by step. Stop at every **CHECKPOINT** and wait for the user to reply "continue".

**How to read this file:** the patch blocks are at the end, under "Patch blocks". Read up to that heading. Do
**not** read the patch blocks into your context and never retype them: the extractor writes them to disk byte
for byte. Open a single block only when you need it to resolve a conflict.

## What changes where (all inside `plugins/kotak-starrocks-logs-app/`)

| # | File | Change | What |
|---|---|---|---|
| 1 | `dev/e2e/provisioning/datasources/datasources.yaml` | modified | local test stack: a GenAI data source (database obs2_genai1_uat) |
| 2 | `dev/e2e/provisioning/plugins/kotak-starrocks-logs-app.yaml` | modified | local test stack: generated app settings (three data sources) |
| 3 | `dev/e2e/seed.py` | modified | local test stack: GenAI agent logs and two vw_genai_logs_* views with their own column names |
| 4 | `dev/e2e/tenants/app-settings.yml` | modified | local test stack: default view prefixes, three data sources |
| 5 | `package-lock.json` | modified | version 0.0.2 (the two root entries only; no dependency changes) |
| 6 | `package.json` | modified | version 0.0.2 |
| 7 | `scripts/e2e.sh` | modified | local test stack: row counts of the GenAI database after seeding |
| 8 | `src/components/AppConfig.tsx` | modified | configuration page: help text and example (view prefix list, tenant columns) |
| 9 | `src/components/LogsExploration.tsx` | modified | the new time control; the grid label of the view (its service column); "no views" names every prefix |
| 10 | `src/components/TimeWindowPicker.test.tsx` | new file | unit tests: time control |
| 11 | `src/components/TimeWindowPicker.tsx` | new file | time control: only ranges of at most 24 hours can be picked |
| 12 | `src/components/api.ts` | modified | service-like column names (service_name, ...) are shown as "service" |
| 13 | `src/components/pages.test.tsx` | modified | unit tests: longer timeout for whole-page renders |
| 14 | `src/config/config.test.ts` | modified | unit tests: view prefix lists, tenant columns |
| 15 | `src/config/config.ts` | modified | viewPrefix as a list (default vw_eks_app_logs_ and vw_genai_logs_), per data source too; tenants.<app_id>.columns |
| 16 | `src/datasource/ContextScope.tsx` | modified | Show context header: the matched column first, also service_name / namespace |
| 17 | `src/datasource/StarRocksLogsDataSource.ts` | modified | query context from the view columns (renaming table when needed); Show context on the view pod column |
| 18 | `src/datasource/api.ts` | modified | views of every prefix; column names from one sample row; registry of renaming tables for the probes |
| 19 | `src/datasource/buildContext.test.ts` | new file | unit tests: query context per view |
| 20 | `src/datasource/context.test.ts` | modified | unit tests: Show context (updated mock) |
| 21 | `src/datasource/oldest.ts` | modified | oldest-line probes read renamed views too |
| 22 | `src/datasource/probes.test.ts` | modified | unit tests: probes (updated mock) |
| 23 | `src/datasource/query.test.ts` | modified | unit tests: panel queries (updated mock) |
| 24 | `src/datasource/runSql.test.ts` | modified | unit tests: view list over prefixes, sample-row columns |
| 25 | `src/datasource/timeZone.ts` | modified | time zone probe reads renamed views too |
| 26 | `src/datasource/windowedSearch.test.ts` | modified | unit tests: windowed search (updated mock) |
| 27 | `src/sql/builder.ts` | modified | queries read through the renaming table when there is one; sample-row query; details columns; pod column for sampling |
| 28 | `src/sql/columns.test.ts` | new file | unit tests: column detection |
| 29 | `src/sql/columns.ts` | new file | finds the time, message, level, service and pod columns of a view; the renaming table; fields and details |
| 30 | `src/state/timeWindow.test.ts` | new file | unit tests: time window rules |
| 31 | `src/state/timeWindow.ts` | new file | time window rules: at most maxRangeHours, never in the future, zoom and step |
| 32 | `tests/e2e/drilldown.spec.ts` | modified | browser tests (43), local test stack only; not run by the pipeline |
| 33 | `tests/smoke/genai.test.ts` | new file | API tests on GenAI views with other column names (9), local test stack only |
| 34 | `tests/smoke/helpers.ts` | modified | API test helpers: the GenAI data source |

**Not changed:** `plugins/kotak-starrocks-datasource/`, `pipelines/`, the repository root, the zip layout, npm
dependencies (the lock file only changes its version lines), `docs/`, `README.md`, `CHANGELOG.md`. Every 0.0.1
settings key keeps its meaning; `viewPrefix` now also accepts a list. Existing provisioning files keep working.

## How 0.0.2 works (for questions from the user)

| Topic | Behaviour |
|---|---|
| Views listed | One `SHOW TABLES LIKE '<prefix>%'` per view prefix (each filtered by Ranger), merged. Default prefixes `vw_eks_app_logs_` and `vw_genai_logs_`; `viewPrefix` (top level, or per data source in `datasources`) takes one prefix or a list. The app_id (tenant key) is the view name without the prefix it starts with: `vw_genai_logs_app_7001_agentrouter` → `app_7001_agentrouter`. |
| Columns of a view | Read from one row when the view is opened (once per browser session): `SELECT * … WHERE observed_timestamp >= now - 1 day LIMIT 1`, and for a view without that column a plain `SELECT * … LIMIT 1`. (DESCRIBE is denied by Ranger; `LIMIT 0` returns no column names through Grafana.) |
| Roles | Found by name, any letter case, first match: time `observed_timestamp, timestamp, event_time, log_time, time, ts, datetime, created_at`; message `message, body, log, msg, log_message, line, content, text`; level `level, severity_text, severity, log_level, loglevel, lvl, level_name`; service (grid label, shown as "service") `k8s_service_name, service_name, service, app_name, application, agent_name, k8s_app_name`; pod (Show context, sampling) `k8s_pod_uid, k8s_pod_name, pod_uid, pod_name, pod, instance_id, hostname, host_name, host`. `tenants.<app_id>.columns.<role>: <column>` names a column instead (also under `tenants.default` or `<datasourceUid>/<app_id>`). |
| Renaming | A view whose time, message or level column has another name is read through `(SELECT <time> AS observed_timestamp, CAST(<message> AS VARCHAR) AS message, CAST(<level> AS VARCHAR) AS level, <other columns> FROM <view>) AS <view>`. The time column is used as it is, so time filters still prune partitions. Views with the app's names (the app log views) are queried as before. |
| Other columns | The known labels and fields as before; every other column is a field (filter, breakdown, log details); a column whose sample value is JSON (`Ellipsis` / `[...]`) is shown in the log details only. `app_id` and `level_parser` stay hidden. |
| Level | From the level column, mapped to error / warn / info / debug (the same names as before: ERROR, Warning, fatal, notice, ...); unknown values are "unknown". A view without a level column: from the message (tenant level rules). |
| Time control | Replaces Grafana's time picker in the app: quick ranges up to `maxRangeHours`; absolute From/To where the end's calendar allows days only up to start + `maxRangeHours` (and not after now); a typed longer range shows "Pick at most 24 hours" and Apply stays disabled; zoom out doubles up to 24 hours; ‹ › step by the range length (not past now). Links and URLs with a longer range are still cut by CappedTimeRange with the "Time range limited to 24 hours" notice. |

**Optional new setting:** `tenants.<app_id>.columns` (`time`, `message`, `level`, `service`, `pod`), only for
a view whose columns the app cannot find by name. None is needed for the app log views.

## INPUTS (ask the user for any that are missing)

```
THIS_FILE            = <path where this .md file was saved>
ORG_PLUGIN_REPO      = <path of kotak-custom-grafana-plugins>   BASE_BRANCH = <branch that has app 0.0.1>
DEPLOY_CONFIG_REPO   = <path of obser-aws-deploy-config>        BASE_BRANCH = <branch with the 0.0.1 rollout>
HANDOFF_FILE         = <path of HANDOFF.md>
```

## Rules

1. Ask before every outward or irreversible action: push, PR, creating or running pipelines, publishing to the
   feed, `grafana-plugin-upload.yml`, `grafana-deploy.yml`, messages to other teams. The user runs pipelines
   and kubectl.
2. New branches only. Work in a detached worktree; push HEAD to the branch, and the user pulls. One PR per repo
   at the end.
3. Do not change the data source plugin, `pipelines/` or the repository root. The app's files change only
   through this patch.
4. No tokens, secrets or real user IDs in files or git (write `kmbl…`).
5. Do not invent values. Write unknown ones as `TODO(<owner>)` and list them as open items.
6. Log what was done and decided in `HANDOFF_FILE` (section "Logs Drilldown rollout"). Keep replies terse.

## Step 0: extract and check the patch

1. Create `/tmp/logs-app-upgrade-002/` and save the Python block under **Extractor** (below) as
   `/tmp/logs-app-upgrade-002/extract_logs_patch.py`, exactly as shown. On Windows use a temp folder and
   `python` instead of `python3`.
2. Run `python3 /tmp/logs-app-upgrade-002/extract_logs_patch.py <THIS_FILE> /tmp/logs-app-upgrade-002/patches`.
3. Expect `34 of 34 blocks, 0 bad` and `matches` for the whole-patch sha256. The output is one file per block
   plus `logs-app-0.0.1-to-0.0.2.patch` (all blocks in order).
4. Any `BAD` block means the copy changed the text (wrapped lines, changed quotes, missing lines). Ask the user
   to copy the file again as raw text. Do not repair blocks by hand.

## Step 1: is the org at 0.0.1, and which files has it changed?

1. In `ORG_PLUGIN_REPO`, on `BASE_BRANCH`, check `plugins/kotak-starrocks-logs-app/package.json`: `"version": "0.0.1"`. If it says
   0.4.0, stop: apply `LOGS_APP_UPGRADE_0.0.1_SELF_CONTAINED.md` first.
2. Run `python3 /tmp/logs-app-upgrade-002/extract_logs_patch.py <THIS_FILE> /tmp/logs-app-upgrade-002/patches <ORG_PLUGIN_REPO>`.
   Each line gives the file's state (`git hash-object` against the 0.0.1 and 0.0.2 blob ids in the blocks):

   | State | Meaning |
   |---|---|
   | `as 0.0.1` | applies cleanly |
   | `as 0.0.2` | already there |
   | `CHANGED by the org` | needs a 3-way merge |
   | `missing` | the file is not in the repo |
   | `absent (new file)` | expected for the 8 new files |

3. For each `CHANGED` or `missing` file, show `git log --oneline -- <file>` and summarise the org's change.
4. If **every** file shows `CHANGED`, the cause is probably line endings: run
   `git ls-files --eol plugins/kotak-starrocks-logs-app | head`, report and wait.

**CHECKPOINT 1**: the user reviews the list.

## Step 2: apply the patch on a new branch

1. In `ORG_PLUGIN_REPO`, create `feature/starrocks-logs-0.0.2` from `BASE_BRANCH`, in a detached worktree.
2. Run `git apply --3way --check /tmp/logs-app-upgrade-002/patches/logs-app-0.0.1-to-0.0.2.patch`, then the
   same command without `--check`.
   - For each new file git may print "does not exist in index" or "cannot read the current contents of '…'",
     sometimes followed by "Falling back to direct application". That is expected: the files are created.
   - `CHANGED` files are merged 3-way; that needs the 0.0.1 blob in history (`git cat-file -e <old>`).
     Conflicts: keep the org-side intent and the 0.0.2 behaviour; show every resolution as a diff.
   - If a 0.0.1 blob is missing, apply that file's block alone with `git apply --3way <NN-….patch>`; if that
     fails, use `--reject` and resolve the `.rej` hunks, reading only that block.
3. Check: run the extractor again with the repo argument. Every file must show `as 0.0.2`, except files the org
   had changed.
4. `git status`: only files under `plugins/kotak-starrocks-logs-app/` have changed.

**CHECKPOINT 2**: the user reviews `git status`, the check output and any conflict resolutions.

## Step 3: build locally

1. Run `scripts/build-plugin.sh plugins/kotak-starrocks-logs-app`. Expect 325 unit tests passing and
   `PASS package/kotak-starrocks-logs-app-0.0.2.zip`.
2. No new npm dependencies (same mirror as before).
3. `tests/e2e`, `tests/smoke` and `dev/e2e` need the local Docker test stack; they are not part of the
   pipeline. Don't run them here.

**CHECKPOINT 3**: report the results. Then the user runs the app pipeline. Publish 0.0.2 to the feed only after
approval. Commit ("kotak-starrocks-logs-app 0.0.2: GenAI views, views with other column names, 24 h time
control; applied from the self-contained upgrade file") and push only after approval.

## Step 4: deploy-config (UAT)

On a new branch from `BASE_BRANCH` of `DEPLOY_CONFIG_REPO`:

1. `pipelines/grafana-plugin-upload.yml`: add `kotak-starrocks-logs-app-0.0.2|0.0.2`; keep 0.0.1 for rollback.
   The user runs the upload for UAT.
2. `envs/uat-obs1-common/grafana-values.yml`, `s3-sync-init`: change the app's copy line from 0.0.1 to 0.0.2.
3. App settings (`pluginApps` → `kotak-starrocks-logs-app` → `jsonData`): **no change needed**, with two checks:
   - if `viewPrefix` is set there, it must also list `vw_genai_logs_` (or be removed: the default has both);
   - if a `datasources` list is set there, it must include `genai-starrocks-db`.
   Report what you find; change only with the user's approval.

**CHECKPOINT 4**: the user reviews the diff and runs `grafana-deploy.yml` for UAT.

## Step 5: verify in UAT (with the user)

| # | Check | Expected |
|---|---|---|
| 1 | Open the time picker (clock button) | quick ranges from Last 5 minutes to Last 24 hours, nothing longer; ‹ and › around it, zoom out next to it |
| 2 | Absolute range: From two days ago | To jumps to 24 hours after From; in To's calendar the later days are disabled |
| 3 | Type a To 30 hours after From | "Pick at most 24 hours"; Apply time range is disabled |
| 4 | A 10-hour absolute range, Apply | the range is exactly that (no "Time range limited" notice); on Last 24 hours zoom out is disabled |
| 5 | Open an old link with `from=now-7d` | cut to Last 24 hours with the "Time range limited to 24 hours" notice (unchanged) |
| 6 | An app log view (`vw_eks_app_logs_*`) | as before: grid by service, levels, logs, Labels / Fields (no `app_id`, `level_parser`) |
| 7 | Data source `genai-starrocks-db` | the View picker lists the `vw_genai_logs_*` views the user is granted (once the GenAI team has created them) |
| 8 | A GenAI view | grid by its service column (tab "service"), levels from its level column, the body as the log line, its other columns in the log details |
| 9 | Show context on a GenAI line | lines of the same pod column (header names it) |
| 10 | Open in Explore on a GenAI view whose columns are named differently | the SQL reads `(SELECT <time> AS observed_timestamp … ) AS vw_genai_logs_…` |

If check 8 shows "… has no time column (looked for …)" (or message, level, service, pod), ask the user which
column it is and add, in the app settings, `tenants: { <app_id>: { columns: { time: <column> } } }` (the app_id
is the view name without `vw_genai_logs_`). If levels show as "unknown", report the distinct values of the
view's level column: numbers (OpenTelemetry severity numbers) are not mapped yet.

**CHECKPOINT 5**: write the results to `HANDOFF_FILE`.

## Step 6: prod and wrap up

Prod: after UAT sign-off, the same steps with prod values; prepare them, the user runs them. One PR per repo,
describing what changed and how it was verified. List any check that failed as an open item.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Extractor reports `BAD` blocks or fewer than 34 | the copy changed or cut the file | copy it again as raw text; never fix blocks by hand |
| `git apply --3way` prints "Applied patch to '…' with conflicts" | the org changed lines next to or on the patched ones | resolve the markers (ours = org, theirs = 0.0.2), show the diff, `git add` |
| Every file shows `CHANGED by the org` | line endings (CRLF) | `git ls-files --eol`; try `git apply --3way --ignore-whitespace` and report |
| Old time picker still shown | the 0.0.1 zip is still served | check the `s3-sync-init` log for 0.0.2 and restart the pod; reload the browser |
| GenAI views not listed | no Ranger grant on the views, `viewPrefix` set without `vw_genai_logs_`, or a `datasources` list without the GenAI data source | check the grants (the user's own `SHOW TABLES LIKE 'vw_genai_logs_%'` in Explore); fix the settings (step 4.3) |
| "… has no time column (looked for …)" | the view names that column otherwise | `tenants.<app_id>.columns.<role>` (step 5) |
| Levels "unknown" on a GenAI view | values the app does not know (e.g. numbers) | report the distinct values |
| First open of a GenAI view takes a moment | its columns are read from one row without a time bound (once per session) | expected |

## Extractor

Save exactly as `/tmp/logs-app-upgrade-002/extract_logs_patch.py`:

```python
#!/usr/bin/env python3
"""Extracts and checks the patch blocks of the Logs Drilldown (StarRocks) 0.0.1 -> 0.0.2 upgrade file.

  python3 extract_logs_patch.py <md file> <out dir>             write the patches and check their sha256
  python3 extract_logs_patch.py <md file> <out dir> <org repo>  also compare the repo's files with 0.0.1/0.0.2
"""
import hashlib
import os
import re
import subprocess
import sys

md, out = sys.argv[1], sys.argv[2]
repo = sys.argv[3] if len(sys.argv) > 3 else None
app = 'plugins/kotak-starrocks-logs-app'
text = open(md, encoding='utf-8').read().replace('\r\n', '\n')
fence = '`' * 4
block_re = re.compile(
    r'^PATCH-BLOCK (\d+)/(\d+) (\S+) old=(\w+) new=(\w+) sha256=(\w+)\n' + fence + r'diff\n(.*?)\n' + fence + '$',
    re.M | re.S,
)
blocks = block_re.findall(text)
os.makedirs(out, exist_ok=True)
bad, whole = 0, ''
for num, count, path, old, new, sha, body in blocks:
    # copy/paste and editors drop trailing spaces; in a diff only blank context lines (" ") end with one
    patch = '\n'.join(line.rstrip() or ' ' for line in body.split('\n')) + '\n'
    ok = hashlib.sha256(patch.encode('utf-8')).hexdigest() == sha
    bad += 0 if ok else 1
    whole += patch
    status = 'OK ' if ok else 'BAD'
    if repo:
        rel = app + '/' + path
        if not os.path.exists(os.path.join(repo, rel)):
            state = 'absent (new file)' if old == 'none' else 'missing'
        else:
            h = subprocess.run(['git', 'hash-object', rel], cwd=repo, capture_output=True, text=True).stdout.strip()
            state = {old: 'as 0.0.1', new: 'as 0.0.2'}.get(h, 'CHANGED by the org (neither 0.0.1 nor 0.0.2)')
        status += '  ' + state.ljust(46)
    print(status, path)
    name = '%02d-%s.patch' % (int(num), path.replace('/', '_'))
    with open(os.path.join(out, name), 'w', encoding='utf-8', newline='\n') as f:
        f.write(patch)
with open(os.path.join(out, 'logs-app-0.0.1-to-0.0.2.patch'), 'w', encoding='utf-8', newline='\n') as f:
    f.write(whole)
expected = int(blocks[0][1]) if blocks else -1
total = hashlib.sha256(whole.encode('utf-8')).hexdigest()
m = re.search(r'^WHOLE-PATCH sha256=(\w+)$', text, re.M)
print('%d of %d blocks, %d bad; whole patch sha256 %s (%s)' % (
    len(blocks), expected, bad, total, 'matches' if m and m.group(1) == total else 'DOES NOT MATCH'))
sys.exit(0 if blocks and len(blocks) == expected and bad == 0 and m and m.group(1) == total else 1)
```

WHOLE-PATCH sha256=9ed6a5947a65c47b4aa013b02f06e232fc91f1bdc7aea89eb46f0aa151bbae8c

## Patch blocks

34 blocks in `git diff` order. Each has a heading, one `PATCH-BLOCK` line (number, path inside the app folder,
0.0.1 blob id, 0.0.2 blob id, sha256 of the block) and the diff. Paths in the diffs are relative to the
repository root (`plugins/kotak-starrocks-logs-app/…`).

### 1/34 `dev/e2e/provisioning/datasources/datasources.yaml` (modified)

local test stack: a GenAI data source (database obs2_genai1_uat)

PATCH-BLOCK 1/34 dev/e2e/provisioning/datasources/datasources.yaml old=01d58ef4d086eb56093dc2694f5389cf3c8c4619 new=e5576a40c64f501bab8002459d21066dea3effd2 sha256=2fa6b76dc1c178cca013aa89575cd3710f20bbfb6a0fdc898f26c3c956845899
````diff
diff --git a/plugins/kotak-starrocks-logs-app/dev/e2e/provisioning/datasources/datasources.yaml b/plugins/kotak-starrocks-logs-app/dev/e2e/provisioning/datasources/datasources.yaml
index 01d58ef4d086eb56093dc2694f5389cf3c8c4619..e5576a40c64f501bab8002459d21066dea3effd2 100644
--- a/plugins/kotak-starrocks-logs-app/dev/e2e/provisioning/datasources/datasources.yaml
+++ b/plugins/kotak-starrocks-logs-app/dev/e2e/provisioning/datasources/datasources.yaml
@@ -32,6 +32,22 @@ datasources:
       maxConnsPerUser: 5
       connMaxIdleSeconds: 60
       allowPlaintext: true
+  # GenAI agent logs: views vw_genai_logs_<app_id>_<app_name> with their own column names
+  - name: genai-starrocks-db
+    uid: e2e-ds-genai
+    type: kotak-starrocks-datasource
+    access: proxy
+    orgId: 1
+    url: starrocks:9030
+    editable: false
+    jsonData:
+      database: obs2_genai1_uat
+      oauthPassThru: true
+      tokenSource: access_token
+      usernameClaim: sub
+      maxConnsPerUser: 5
+      connMaxIdleSeconds: 60
+      allowPlaintext: true
   # Tempo is not running locally; the app only needs the uids to build "View trace" links into Explore.
   - name: tempo-obs
     uid: e2e-tempo-obs
````

### 2/34 `dev/e2e/provisioning/plugins/kotak-starrocks-logs-app.yaml` (modified)

local test stack: generated app settings (three data sources)

PATCH-BLOCK 2/34 dev/e2e/provisioning/plugins/kotak-starrocks-logs-app.yaml old=fa5322551e834d5b434810e27a09d7bcb6691462 new=6651d838a69ddfa5e06e0c4e65e2fd2ee78436b6 sha256=6a2ff9e97f3f95e2594870ff75bb93a505500d6a03bd18ea586caa21b7cfb8d2
````diff
diff --git a/plugins/kotak-starrocks-logs-app/dev/e2e/provisioning/plugins/kotak-starrocks-logs-app.yaml b/plugins/kotak-starrocks-logs-app/dev/e2e/provisioning/plugins/kotak-starrocks-logs-app.yaml
index fa5322551e834d5b434810e27a09d7bcb6691462..6651d838a69ddfa5e06e0c4e65e2fd2ee78436b6 100644
--- a/plugins/kotak-starrocks-logs-app/dev/e2e/provisioning/plugins/kotak-starrocks-logs-app.yaml
+++ b/plugins/kotak-starrocks-logs-app/dev/e2e/provisioning/plugins/kotak-starrocks-logs-app.yaml
@@ -11,7 +11,7 @@ apps:
     datasources:
     - e2e-ds-starrocks-logs
     - e2e-ds-starrocks-logs2
-    viewPrefix: vw_eks_app_logs_
+    - e2e-ds-genai
     defaultTimeRange: now-1h
     maxScanHours: 3
     lineLimit: 1000
````

### 3/34 `dev/e2e/seed.py` (modified)

local test stack: GenAI agent logs and two vw_genai_logs_* views with their own column names

PATCH-BLOCK 3/34 dev/e2e/seed.py old=efdb6da66ef576d823f8bccd2fe3ff79fed162fc new=8dd1e80f14f679b649ad98a4704bfd226d6c2169 sha256=569fecf48927a89d69cf54f5d4e5fc5c9e0beb5d026e15a656c17783765dd9b4
````diff
diff --git a/plugins/kotak-starrocks-logs-app/dev/e2e/seed.py b/plugins/kotak-starrocks-logs-app/dev/e2e/seed.py
index efdb6da66ef576d823f8bccd2fe3ff79fed162fc..8dd1e80f14f679b649ad98a4704bfd226d6c2169 100644
--- a/plugins/kotak-starrocks-logs-app/dev/e2e/seed.py
+++ b/plugins/kotak-starrocks-logs-app/dev/e2e/seed.py
@@ -14,8 +14,13 @@ the views show observed_timestamp (the table holds UTC):
   ist      as IST wall-clock time whatever the session (a timestamp column written in local time)
   utc      as UTC wall-clock time whatever the session (a timestamp column written in UTC)
 The app detects which one it is and picks the session zone of its statements (src/sql/timeZone.ts).
+
+A third database, obs2_genai1_uat, holds GenAI agent logs (OpenTelemetry layout, table agent_logs) and per-app
+views vw_genai_logs_<app_id>_<app_name> that flatten them into log rows with their own column names (event_time,
+body, severity_text, service_name, ...): the app finds those columns itself (src/sql/columns.ts).
 """
 import datetime as dt
+import json
 import os
 import random
 import sys
@@ -286,6 +291,92 @@ def main():
         w(f"CREATE USER '{user}'@'%' IDENTIFIED WITH authentication_jwt AS {q(JWT)};\n")
         for db, app_id in views:
             w(f"GRANT SELECT ON VIEW {db}.vw_eks_app_logs_{app_id} TO USER '{user}'@'%';\n")
+    genai(w)
+
+
+# ---- GenAI agent logs --------------------------------------------------------------------------------------
+# The table is OpenTelemetry logs (logs.proto) as the GenAI pipeline writes it (stored as JSON here: native tables
+# cannot hold VARIANT); the views turn it into log rows, with column names that differ from the app log views.
+GENAI_DB = "obs2_genai1_uat"
+GENAI_ROWS = 3000
+# view app id, service, tenant, namespace, pods, body kind
+GENAI_SERVICES = [
+    ("app_7001_agentrouter", "agent-router", "genai-router", "genai-uat", 3, "router"),
+    ("app_7001_agentrouter", "llm-gateway", "genai-router", "genai-uat", 2, "gateway"),
+    ("app_7001_agentrouter", "tool-executor", "genai-router", "genai-uat", 2, "tool"),
+    ("app_7002_voiceagent", "voice-agent", "voice-agents", "voice-uat", 2, "voice"),
+]
+GENAI_APPS = sorted({s[0] for s in GENAI_SERVICES})
+# (severity_text, severity_number); an empty text leaves the level to the number
+SEVERITIES = [("INFO", 9)] * 6 + [("WARN", 13), ("ERROR", 17), ("DEBUG", 5), ("", 17), ("", 9), ("Information", 10)]
+GENAI_GRANTS = {"kmbl3e2e": GENAI_APPS}
+EPOCH = dt.datetime(1970, 1, 1)
+
+
+def genai_rows():
+    pods_by = {
+        name: [{"name": f"{name}-{hexid(10)}-{hexid(5)}", "uid": uid()} for _ in range(n)]
+        for _a, name, _t, _ns, n, _k in GENAI_SERVICES
+    }
+    span = HOURS * 3600
+    out = []
+    for _ in range(GENAI_ROWS):
+        app_id, name, tenant, ns, _n, kind = RNG.choice(GENAI_SERVICES)
+        pod = RNG.choice(pods_by[name])
+        ts = NOW - dt.timedelta(seconds=RNG.random() * span)
+        text, number = RNG.choice(SEVERITIES)
+        model = RNG.choice(["gpt-4o", "claude-sonnet", "llama-3-70b"])
+        if kind == "router":
+            status = 500 if number >= 17 else 200
+            body = f"routed request route=chat model={model} latency_ms={RNG.randint(40, 4000)} status={status}"
+        elif kind == "gateway":
+            body = {"event": "completion", "model": model, "tokens": RNG.randint(10, 4000), "finish_reason": "stop"}
+        elif kind == "tool":
+            body = f"tool call {RNG.choice(['search', 'crm_lookup', 'calculator'])} finished in {RNG.randint(5, 900)} ms"
+        else:
+            body = f"call session {RNG.choice(['started', 'ended'])} channel=sip duration_s={RNG.randint(1, 600)}"
+        resource = {
+            "service.name": name,
+            "k8s.namespace.name": ns,
+            "k8s.pod.name": pod["name"],
+            "k8s.pod.uid": pod["uid"],
+            "deployment.environment": "uat",
+        }
+        attributes = {"gen_ai.request.model": model, "gen_ai.operation.name": RNG.choice(["chat", "embeddings"])}
+        nanos = int((ts - EPOCH).total_seconds()) * 1_000_000_000 + ts.microsecond * 1000
+        out.append([
+            q(app_id), q(tenant), q(ts.strftime("%Y-%m-%d %H:%M:%S.%f")), str(nanos),
+            f"parse_json({q(json.dumps(resource))})", f"parse_json({q(json.dumps(body))})",
+            f"parse_json({q(json.dumps(attributes))})", q(hexid(32)), q(hexid(16)), q(text), str(number),
+        ])
+    return out
+
+
+def genai(w):
+    # recreated from scratch: earlier layouts of this database may have other objects
+    w(f"DROP DATABASE IF EXISTS {GENAI_DB} FORCE;\nCREATE DATABASE {GENAI_DB};\nUSE {GENAI_DB};\n")
+    w("CREATE TABLE agent_logs (\n  app_id VARCHAR(128), tenant VARCHAR(128), event_time DATETIME,\n"
+      "  event_time_unix_nano BIGINT, resource_attributes JSON, body JSON, attributes JSON,\n"
+      "  trace_id VARCHAR(64), span_id VARCHAR(32), severity_text VARCHAR(64), severity_number INT\n"
+      ") DUPLICATE KEY(app_id)\nDISTRIBUTED BY HASH(app_id) BUCKETS 3 PROPERTIES (\"replication_num\" = \"1\");\n")
+    rows = genai_rows()
+    for i in range(0, len(rows), 1000):
+        w("INSERT INTO agent_logs VALUES\n" + ",\n".join("(" + ", ".join(r) + ")" for r in rows[i:i + 1000]) + ";\n")
+    time_expr = (VIEW_TIME_EXPR[VIEW_TIME] or "observed_timestamp").replace("observed_timestamp", "event_time")
+    level = ("COALESCE(NULLIF(severity_text, ''), CASE WHEN severity_number >= 17 THEN 'ERROR' WHEN severity_number >= 13 "
+             "THEN 'WARN' WHEN severity_number >= 9 THEN 'INFO' ELSE 'DEBUG' END)")
+    for app_id in GENAI_APPS:
+        w(f"CREATE VIEW vw_genai_logs_{app_id} AS SELECT {time_expr} AS event_time, event_time_unix_nano,\n"
+          f"  get_json_string(body, '$') AS body, {level} AS severity_text,\n"
+          "  get_json_string(resource_attributes, '$.\"service.name\"') AS service_name,\n"
+          "  get_json_string(resource_attributes, '$.\"k8s.namespace.name\"') AS namespace,\n"
+          "  get_json_string(resource_attributes, '$.\"k8s.pod.name\"') AS pod_name,\n"
+          "  get_json_string(resource_attributes, '$.\"k8s.pod.uid\"') AS pod_uid,\n"
+          "  tenant, trace_id, span_id, get_json_string(attributes, '$.\"gen_ai.request.model\"') AS model,\n"
+          f"  CAST(attributes AS VARCHAR) AS attributes, app_id FROM agent_logs WHERE app_id = {q(app_id)};\n")
+    for user, apps in GENAI_GRANTS.items():
+        for app_id in apps:
+            w(f"GRANT SELECT ON VIEW {GENAI_DB}.vw_genai_logs_{app_id} TO USER '{user}'@'%';\n")
 
 
 if __name__ == "__main__":
````

### 4/34 `dev/e2e/tenants/app-settings.yml` (modified)

local test stack: default view prefixes, three data sources

PATCH-BLOCK 4/34 dev/e2e/tenants/app-settings.yml old=d6ba29bb787af76325bf286f2aca3b591c1ea9c9 new=220f4daf8cc22c3b05ae5db4fb60cd7d88752f09 sha256=bc821b08ed931f3b8f94b6ead00758ed9d963b28d5d5aeb50046f4fb1a6230be
````diff
diff --git a/plugins/kotak-starrocks-logs-app/dev/e2e/tenants/app-settings.yml b/plugins/kotak-starrocks-logs-app/dev/e2e/tenants/app-settings.yml
index d6ba29bb787af76325bf286f2aca3b591c1ea9c9..220f4daf8cc22c3b05ae5db4fb60cd7d88752f09 100644
--- a/plugins/kotak-starrocks-logs-app/dev/e2e/tenants/app-settings.yml
+++ b/plugins/kotak-starrocks-logs-app/dev/e2e/tenants/app-settings.yml
@@ -1,5 +1,10 @@
 # Other jsonData keys of the e2e app (short ranges: the seed spans 4 hours).
-viewPrefix: vw_eks_app_logs_
 defaultTimeRange: now-1h
 maxScanHours: 3
 lineLimit: 1000
+# picker list: the two EKS databases, then the GenAI one (views found by the default prefixes
+# vw_eks_app_logs_ and vw_genai_logs_)
+datasources:
+  - e2e-ds-starrocks-logs
+  - e2e-ds-starrocks-logs2
+  - e2e-ds-genai
````

### 5/34 `package-lock.json` (modified)

version 0.0.2 (the two root entries only; no dependency changes)

PATCH-BLOCK 5/34 package-lock.json old=264969f05d479af658927b2fda40c9f73dbc9985 new=f4d83318d3f3bf2c03000dbf8e02964da1b971f1 sha256=90aaf035f74ddfda49cc2f4d916227847d8c2afcd66e366bc6792027107aeab1
````diff
diff --git a/plugins/kotak-starrocks-logs-app/package-lock.json b/plugins/kotak-starrocks-logs-app/package-lock.json
index 264969f05d479af658927b2fda40c9f73dbc9985..f4d83318d3f3bf2c03000dbf8e02964da1b971f1 100644
--- a/plugins/kotak-starrocks-logs-app/package-lock.json
+++ b/plugins/kotak-starrocks-logs-app/package-lock.json
@@ -1,12 +1,12 @@
 {
   "name": "kotak-starrocks-logs-app",
-  "version": "0.0.1",
+  "version": "0.0.2",
   "lockfileVersion": 3,
   "requires": true,
   "packages": {
     "": {
       "name": "kotak-starrocks-logs-app",
-      "version": "0.0.1",
+      "version": "0.0.2",
       "license": "AGPL-3.0-only",
       "dependencies": {
         "@emotion/css": "11.13.5",
````

### 6/34 `package.json` (modified)

version 0.0.2

PATCH-BLOCK 6/34 package.json old=9a5ce5d6419e12c9ab6f13163ebb2bd855c35dc0 new=4c018e2326ef1081ceb817f7ab8bb8c5c61aa9bc sha256=3b31b22db576051bb95f92cfcedea58ecd496d6bc620e6eef07d2e48953527cb
````diff
diff --git a/plugins/kotak-starrocks-logs-app/package.json b/plugins/kotak-starrocks-logs-app/package.json
index 9a5ce5d6419e12c9ab6f13163ebb2bd855c35dc0..4c018e2326ef1081ceb817f7ab8bb8c5c61aa9bc 100644
--- a/plugins/kotak-starrocks-logs-app/package.json
+++ b/plugins/kotak-starrocks-logs-app/package.json
@@ -1,6 +1,6 @@
 {
   "name": "kotak-starrocks-logs-app",
-  "version": "0.0.1",
+  "version": "0.0.2",
   "description": "Logs Drilldown for StarRocks log views. Queries run through kotak-starrocks-datasource as the signed-in user.",
   "private": true,
   "scripts": {
````

### 7/34 `scripts/e2e.sh` (modified)

local test stack: row counts of the GenAI database after seeding

PATCH-BLOCK 7/34 scripts/e2e.sh old=df03aca32b2f1eb221906416ec626ea6299975db new=32d97929d8dd8c3243cefaccbe733d9b6e4b6fd1 sha256=68840347c4bcc35d61e1bf6a16b7ce7ba26a95a4c1e2172eb465f8c52c5ea178
````diff
diff --git a/plugins/kotak-starrocks-logs-app/scripts/e2e.sh b/plugins/kotak-starrocks-logs-app/scripts/e2e.sh
index df03aca32b2f1eb221906416ec626ea6299975db..32d97929d8dd8c3243cefaccbe733d9b6e4b6fd1 100755
--- a/plugins/kotak-starrocks-logs-app/scripts/e2e.sh
+++ b/plugins/kotak-starrocks-logs-app/scripts/e2e.sh
@@ -34,6 +34,7 @@ seed() {
   for db in obs2_logs1_uat obs2_logs2_uat; do
     sr -N -e "SELECT '$db', app_id, COUNT(*) FROM $db.eks_app_logs GROUP BY app_id ORDER BY app_id"
   done
+  sr -N -e "SELECT 'obs2_genai1_uat', app_id, COUNT(*) FROM obs2_genai1_uat.agent_logs GROUP BY app_id ORDER BY app_id"
 }
 
 # The app's provisioning file is generated like in deploy-config: from Loki-style data source entries plus
````

### 8/34 `src/components/AppConfig.tsx` (modified)

configuration page: help text and example (view prefix list, tenant columns)

PATCH-BLOCK 8/34 src/components/AppConfig.tsx old=052461776bcb35a374aa1ac03f443aab7e0a8ca5 new=1532f16a625fc8f89ee973e40a530d5eb7054a4c sha256=8744aa8f469af96d33ec2480ec15b46eaf08715c3ecd6a3712a1324d3fce02be
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/AppConfig.tsx b/plugins/kotak-starrocks-logs-app/src/components/AppConfig.tsx
index 052461776bcb35a374aa1ac03f443aab7e0a8ca5..1532f16a625fc8f89ee973e40a530d5eb7054a4c 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/AppConfig.tsx
+++ b/plugins/kotak-starrocks-logs-app/src/components/AppConfig.tsx
@@ -12,7 +12,8 @@ import { fetchViews, listDatasources } from '../datasource/api';
 const EXAMPLE: AppJsonData = {
   datasourceUid: 'app-logs-starrocks-db',
   datasources: ['app-logs-starrocks-db', { uid: 'app-logs-starrocks-db2', viewPrefix: 'vw_eks_app_logs_' }],
-  viewPrefix: 'vw_eks_app_logs_',
+  // EKS app log views and GenAI log views (the default); a data source can have its own list
+  viewPrefix: ['vw_eks_app_logs_', 'vw_genai_logs_'],
   maxRangeHours: 24,
   maxScanHours: 6,
   tenants: {
@@ -97,7 +98,7 @@ export function AppConfig({ plugin }: PluginConfigPageProps<AppPluginMeta<AppJso
       )}
       <Field
         label="jsonData"
-        description="Keys: datasourceUid, datasources, viewPrefix, serviceLabel, defaultTimeRange, maxRangeHours, maxScanHours, lineLimit, queryTimeoutSeconds, timeZone, labels, fields, tenants (app_id or <datasourceUid>/<app_id>)"
+        description="Keys: datasourceUid, datasources, viewPrefix (one or a list), serviceLabel, defaultTimeRange, maxRangeHours, maxScanHours, lineLimit, queryTimeoutSeconds, timeZone, labels, fields, tenants (app_id or <datasourceUid>/<app_id>; columns: time, message, level, service, pod when a view names them differently)"
       >
         <TextArea rows={24} value={text} onChange={(e) => setText(e.currentTarget.value)} className={styles.mono} />
       </Field>
````

### 9/34 `src/components/LogsExploration.tsx` (modified)

the new time control; the grid label of the view (its service column); "no views" names every prefix

PATCH-BLOCK 9/34 src/components/LogsExploration.tsx old=c9574d9edeaf80a7f2a358434d5514c2da1cf6d3 new=d01b8ad1694cad380593949a7b7544ab08a150a6 sha256=9418a9370cd6bc43d782bc97a9f73850f26ed2fd92659ce03768c04850fc063e
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/LogsExploration.tsx b/plugins/kotak-starrocks-logs-app/src/components/LogsExploration.tsx
index c9574d9edeaf80a7f2a358434d5514c2da1cf6d3..d01b8ad1694cad380593949a7b7544ab08a150a6 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/LogsExploration.tsx
+++ b/plugins/kotak-starrocks-logs-app/src/components/LogsExploration.tsx
@@ -12,7 +12,6 @@ import {
   SceneObjectUrlValues,
   SceneReactObject,
   SceneRefreshPicker,
-  SceneTimePicker,
   sceneGraph,
 } from '@grafana/scenes';
 import {
@@ -29,8 +28,8 @@ import {
   useStyles2,
 } from '@grafana/ui';
 
-import { LEVELS, QUICK_RANGES, RUNTIME_DS } from '../constants';
-import { getAppConfig, getAppConfigErrors, viewPrefixFor } from '../config/config';
+import { LEVELS, RUNTIME_DS } from '../constants';
+import { getAppConfig, getAppConfigErrors, viewPrefixesFor } from '../config/config';
 import { fetchViews, listDatasources, runSqlOnce, StarRocksDatasource, stringColumn } from '../datasource/api';
 import { fetchOldestLog } from '../datasource/oldest';
 import { buildContext } from '../datasource/StarRocksLogsDataSource';
@@ -58,8 +57,8 @@ import {
 } from '../state/types';
 import { Display, displayLabel, ExplorationApi, isExplorationApi, Tab as TabName } from './api';
 import { BreakdownScene, MESSAGE_FIELD_PREFIX } from './BreakdownScene';
-import { quickRangeMs } from '../state/timeRange';
 import { CappedTimeRange, cappedOf } from './CappedTimeRange';
+import { TimeWindowPicker } from './TimeWindowPicker';
 import { DetailsHeader } from './FiltersBar';
 import { LogsTabScene } from './LogsTabScene';
 import { PatternsTabScene } from './PatternsTabScene';
@@ -223,11 +222,8 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
       search: '',
       gridLevels: false,
       controls: [
-        new SceneTimePicker({
-          quickRanges: QUICK_RANGES.filter(
-            (r) => (quickRangeMs(r.from) ?? 0) <= getAppConfig().maxRangeHours * 3_600_000
-          ),
-        }),
+        // at most maxRangeHours can be picked (quick ranges and absolute ranges alike)
+        new TimeWindowPicker({}),
         new SceneRefreshPicker({}),
       ],
       ...state,
@@ -544,7 +540,12 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
   // ---- ExplorationApi ----
 
   primaryLabel(): string {
-    return this.state.primaryLabel ?? getAppConfig().serviceLabel;
+    return this.state.primaryLabel ?? this.serviceLabel();
+  }
+
+  /** label of the "service" tab: the view's service column (k8s_service_name, service_name, ...) */
+  serviceLabel(): string {
+    return this.state.ctx?.serviceLabel ?? getAppConfig().serviceLabel;
   }
 
   getSpec(): QuerySpec {
@@ -724,13 +725,13 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
   }
 
   setPrimaryLabel(label: string) {
-    const primaryLabel = label === getAppConfig().serviceLabel ? undefined : label;
+    const primaryLabel = label === this.serviceLabel() ? undefined : label;
     this.navigate(() => this.setState({ primaryLabel, search: '' }));
     this.rebuild();
   }
 
   addLabelTab(label: string) {
-    if (label !== getAppConfig().serviceLabel && !this.state.labelTabs.includes(label)) {
+    if (label !== this.serviceLabel() && !this.state.labelTabs.includes(label)) {
       this.setState({ labelTabs: [...this.state.labelTabs, label] });
     }
     this.setPrimaryLabel(label);
@@ -740,7 +741,7 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
     const wasActive = this.primaryLabel() === label;
     this.setState({ labelTabs: this.state.labelTabs.filter((t) => t !== label) });
     if (wasActive) {
-      this.setPrimaryLabel(getAppConfig().serviceLabel);
+      this.setPrimaryLabel(this.serviceLabel());
     }
   }
 
@@ -850,7 +851,11 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
       return this.message(
         'info',
         'No log views available',
-        `StarRocks returned no views matching ${viewPrefixFor(config, s.datasource)}* in ${dsName} for your account. Ask for access to your team's log view${(s.datasources?.length ?? 0) > 1 ? ', or pick another data source' : ''}.`
+        `StarRocks returned no views matching ${viewPrefixesFor(config, s.datasource)
+          .map((p) => `${p}*`)
+          .join(
+            ' or '
+          )} in ${dsName} for your account. Ask for access to your team's log view${(s.datasources?.length ?? 0) > 1 ? ', or pick another data source' : ''}.`
       );
     }
     if (!s.view || !s.views.includes(s.view)) {
@@ -1176,7 +1181,7 @@ function LabelTabs({ model }: { model: LogsExploration }) {
   if (!ctx) {
     return null;
   }
-  const service = getAppConfig().serviceLabel;
+  const service = model.serviceLabel();
   const active = model.primaryLabel();
   const tabs = Array.from(new Set([service, ...labelTabs, active])).filter((l) => ctx.labels.includes(l));
   const remaining = ctx.labels.filter((l) => !tabs.includes(l));
````

### 10/34 `src/components/TimeWindowPicker.test.tsx` (new file)

unit tests: time control

PATCH-BLOCK 10/34 src/components/TimeWindowPicker.test.tsx old=none new=0ef640aea6e89f6a872fc140af01551810615d2e sha256=1e4ca8ba8d161d72bee7234b6044cf1fc1202b5dda86bf78733404a463141c2d
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/TimeWindowPicker.test.tsx b/plugins/kotak-starrocks-logs-app/src/components/TimeWindowPicker.test.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..0ef640aea6e89f6a872fc140af01551810615d2e
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/components/TimeWindowPicker.test.tsx
@@ -0,0 +1,102 @@
+import { act, fireEvent, render, screen, within } from '@testing-library/react';
+
+import { dateTimeFormat } from '@grafana/data';
+import { EmbeddedScene, SceneReactObject } from '@grafana/scenes';
+
+import { setAppConfig } from '../config/config';
+import { CappedTimeRange } from './CappedTimeRange';
+import { TimeWindowPicker } from './TimeWindowPicker';
+
+const H = 3_600_000;
+
+function mount(from = 'now-1h', to = 'now') {
+  const picker = new TimeWindowPicker({});
+  const timeRange = new CappedTimeRange({ from, to, timeZone: 'utc' });
+  const scene = new EmbeddedScene({
+    $timeRange: timeRange,
+    controls: [picker],
+    body: new SceneReactObject({ reactNode: <div /> }),
+  });
+  scene.activate();
+  render(<picker.Component model={picker} />);
+  return { timeRange };
+}
+
+const fmt = (ms: number) => dateTimeFormat(ms, { format: 'YYYY-MM-DD HH:mm', timeZone: 'utc' });
+const inputs = () => screen.getAllByTestId('data-testid date-time-input') as HTMLInputElement[];
+function type(input: HTMLInputElement, value: string) {
+  fireEvent.change(input, { target: { value } });
+  fireEvent.blur(input);
+}
+
+beforeEach(() => setAppConfig({}));
+
+describe('time control: only ranges of at most 24 hours can be picked', () => {
+  it('shows the range; quick ranges stop at "Last 24 hours" (or the configured maximum)', () => {
+    setAppConfig({ maxRangeHours: 6 });
+    mount();
+    expect(screen.getByTestId('time-window-picker').textContent).toContain('Last 1 hour');
+    fireEvent.click(screen.getByTestId('time-window-picker'));
+    const quick = within(screen.getByTestId('time-window-quick'));
+    expect(quick.getByText('Last 6 hours')).toBeInTheDocument();
+    expect(quick.queryByText('Last 12 hours')).toBeNull();
+    expect(screen.getByText(/At most 6 hours/)).toBeInTheDocument();
+  });
+
+  it('a quick range is applied at once and closes the panel', () => {
+    const { timeRange } = mount();
+    fireEvent.click(screen.getByTestId('time-window-picker'));
+    fireEvent.click(screen.getByText('Last 24 hours'));
+    expect(timeRange.state.from).toBe('now-24h');
+    expect(screen.queryByTestId('time-window-panel')).toBeNull();
+  });
+
+  it('absolute range: the end follows the start within 24 hours; a longer end cannot be applied', () => {
+    const { timeRange } = mount();
+    fireEvent.click(screen.getByTestId('time-window-picker'));
+    const start = Math.floor((Date.now() - 48 * H) / 60_000) * 60_000;
+    type(inputs()[0], fmt(start));
+    // the end moved to 24 hours after the new start (the latest allowed)
+    expect(inputs()[1].value).toBe(fmt(start + 24 * H));
+    expect(screen.queryByTestId('time-window-error')).toBeNull();
+    // an end 30 hours after the start: refused, Apply disabled
+    type(inputs()[1], fmt(start + 30 * H));
+    expect(screen.getByTestId('time-window-error').textContent).toBe('Pick at most 24 hours');
+    expect(screen.getByTestId('time-window-apply')).toBeDisabled();
+    // 10 hours: applied as picked (nothing is cut afterwards)
+    type(inputs()[1], fmt(start + 10 * H));
+    fireEvent.click(screen.getByTestId('time-window-apply'));
+    expect(timeRange.state.value.from.valueOf()).toBe(start);
+    expect(timeRange.state.value.to.valueOf()).toBe(start + 10 * H);
+    expect((timeRange.state as { capped?: unknown }).capped).toBeUndefined();
+  });
+
+  it('Cancel and Escape close the panel without changing the range', () => {
+    const { timeRange } = mount();
+    fireEvent.click(screen.getByTestId('time-window-picker'));
+    fireEvent.click(screen.getByText('Cancel'));
+    expect(screen.queryByTestId('time-window-panel')).toBeNull();
+    fireEvent.click(screen.getByTestId('time-window-picker'));
+    act(() => {
+      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
+    });
+    expect(screen.queryByTestId('time-window-panel')).toBeNull();
+    expect(timeRange.state.from).toBe('now-1h');
+  });
+
+  it('zoom out doubles up to 24 hours; at 24 hours it is disabled', () => {
+    const { timeRange } = mount('now-6h');
+    fireEvent.click(screen.getByLabelText('Zoom out time range'));
+    const v = timeRange.state.value;
+    expect(Math.round((v.to.valueOf() - v.from.valueOf()) / H)).toBe(12);
+  });
+
+  it('at 24 hours zoom out is disabled; forward is disabled at now; back moves by the length', () => {
+    const { timeRange } = mount('now-24h');
+    expect(screen.getByLabelText('Zoom out time range')).toBeDisabled();
+    expect(screen.getByLabelText('Move time range forward')).toBeDisabled();
+    const before = timeRange.state.value.from.valueOf();
+    fireEvent.click(screen.getByLabelText('Move time range back'));
+    expect(Math.round((before - timeRange.state.value.from.valueOf()) / H)).toBe(24);
+  });
+});
````

### 11/34 `src/components/TimeWindowPicker.tsx` (new file)

time control: only ranges of at most 24 hours can be picked

PATCH-BLOCK 11/34 src/components/TimeWindowPicker.tsx old=none new=3a7e4a4249edfac785e5bf5e9d48d9d14ac7d852 sha256=ce7a2c5351f2ca08a7d9c8fc298a720b02bd7a1dbb348b12c7aae27a6fdc23a0
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/TimeWindowPicker.tsx b/plugins/kotak-starrocks-logs-app/src/components/TimeWindowPicker.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..3a7e4a4249edfac785e5bf5e9d48d9d14ac7d852
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/components/TimeWindowPicker.tsx
@@ -0,0 +1,202 @@
+import { css } from '@emotion/css';
+import { useEffect, useState } from 'react';
+
+import { dateTime, GrafanaTheme2, rangeUtil, RawTimeRange } from '@grafana/data';
+import { SceneComponentProps, SceneObjectBase, SceneObjectState, sceneGraph } from '@grafana/scenes';
+import { Button, ButtonGroup, DateTimePicker, Stack, ToolbarButton, useStyles2 } from '@grafana/ui';
+
+import { QUICK_RANGES } from '../constants';
+import { getAppConfig } from '../config/config';
+import { quickRangeMs } from '../state/timeRange';
+import { endForStart, latestEnd, shift, windowError, zoomOut } from '../state/timeWindow';
+
+const HOUR_MS = 3_600_000;
+
+/**
+ * The app's time control. Grafana's time picker lets any range be picked (the app then had to cut it); this one
+ * only offers ranges of at most maxRangeHours (24): quick ranges up to "Last 24 hours", and an absolute range
+ * whose end can be picked only up to maxRangeHours after its start (and not after now). Zoom out stops at
+ * maxRangeHours, stepping forward stops at now. Links and URLs with a longer range are still cut by
+ * CappedTimeRange, with a notice.
+ */
+export class TimeWindowPicker extends SceneObjectBase<SceneObjectState> {
+  static Component = TimeWindowPickerRenderer;
+}
+
+function TimeWindowPickerRenderer({ model }: SceneComponentProps<TimeWindowPicker>) {
+  const styles = useStyles2(getStyles);
+  const timeRange = sceneGraph.getTimeRange(model);
+  const { value, from, to } = timeRange.useState();
+  const timeZone = timeRange.getTimeZone();
+  const maxHours = getAppConfig().maxRangeHours;
+  const [draft, setDraft] = useState<{ from: number; to: number }>();
+  const open = draft !== undefined;
+  // "now" for the limits shown (latest end, forward button), refreshed every 30 s and when the panel opens
+  const [now, setNow] = useState(0);
+  useEffect(() => {
+    const tick = () => setNow(Date.now());
+    tick();
+    const timer = setInterval(tick, 30_000);
+    return () => clearInterval(timer);
+  }, []);
+  const fromMs = value.from.valueOf();
+  const toMs = value.to.valueOf();
+  const quick = QUICK_RANGES.filter((r) => (quickRangeMs(r.from) ?? 0) <= maxHours * HOUR_MS);
+
+  useEffect(() => {
+    if (!open) {
+      return;
+    }
+    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDraft(undefined);
+    window.addEventListener('keydown', onKey);
+    return () => window.removeEventListener('keydown', onKey);
+  }, [open]);
+
+  const apply = (raw: RawTimeRange) => {
+    timeRange.onTimeRangeChange(rangeUtil.convertRawToRange(raw, timeZone));
+    setDraft(undefined);
+  };
+  const applyMs = (r: { fromMs: number; toMs: number }) => apply({ from: dateTime(r.fromMs), to: dateTime(r.toMs) });
+  const error = draft ? windowError(draft.from, draft.to, maxHours, now) : undefined;
+
+  return (
+    <div className={styles.wrapper}>
+      <ButtonGroup>
+        <ToolbarButton
+          aria-label="Move time range back"
+          tooltip="Move the time range back"
+          icon="angle-left"
+          onClick={() => applyMs(shift(fromMs, toMs, -1, Date.now()))}
+        />
+        <ToolbarButton
+          data-testid="time-window-picker"
+          aria-label="Time range"
+          icon="clock-nine"
+          isOpen={open}
+          onClick={() => {
+            setNow(Date.now());
+            setDraft(open ? undefined : { from: fromMs, to: toMs });
+          }}
+        >
+          {rangeUtil.describeTimeRange({ from, to }, timeZone)}
+        </ToolbarButton>
+        <ToolbarButton
+          aria-label="Move time range forward"
+          tooltip="Move the time range forward"
+          icon="angle-right"
+          disabled={toMs >= now - 1000}
+          onClick={() => applyMs(shift(fromMs, toMs, 1, Date.now()))}
+        />
+      </ButtonGroup>
+      <ToolbarButton
+        aria-label="Zoom out time range"
+        tooltip={`Zoom out (at most ${maxHours} hours)`}
+        icon="search-minus"
+        disabled={toMs - fromMs >= maxHours * HOUR_MS}
+        onClick={() => applyMs(zoomOut(fromMs, toMs, maxHours, Date.now()))}
+      />
+      {draft && (
+        <div className={styles.panel} role="dialog" aria-label="Pick a time range" data-testid="time-window-panel">
+          <div className={styles.absolute}>
+            <div className={styles.title}>Absolute time range</div>
+            <div className={styles.hint}>
+              At most {maxHours} hours: the end can be picked up to {maxHours} hours after the start.
+            </div>
+            <DateTimePicker
+              label="From"
+              date={dateTime(draft.from)}
+              maxDate={new Date(now)}
+              timeZone={timeZone}
+              showSeconds={false}
+              onChange={(d) =>
+                d && setDraft({ from: d.valueOf(), to: endForStart(d.valueOf(), draft.to, maxHours, now) })
+              }
+            />
+            <DateTimePicker
+              label="To"
+              date={dateTime(draft.to)}
+              minDate={new Date(draft.from)}
+              maxDate={new Date(latestEnd(draft.from, maxHours, now))}
+              timeZone={timeZone}
+              showSeconds={false}
+              onChange={(d) => d && setDraft({ ...draft, to: d.valueOf() })}
+            />
+            {error && (
+              <div className={styles.error} data-testid="time-window-error" role="alert">
+                {error}
+              </div>
+            )}
+            <Stack>
+              <Button
+                size="sm"
+                disabled={error !== undefined}
+                onClick={() => applyMs({ fromMs: draft.from, toMs: draft.to })}
+                data-testid="time-window-apply"
+              >
+                Apply time range
+              </Button>
+              <Button size="sm" variant="secondary" onClick={() => setDraft(undefined)}>
+                Cancel
+              </Button>
+            </Stack>
+          </div>
+          <div className={styles.quick} data-testid="time-window-quick">
+            {quick.map((r) => (
+              <button
+                key={r.from}
+                type="button"
+                className={from === r.from && to === r.to ? styles.quickActive : styles.quickItem}
+                onClick={() => apply({ from: r.from, to: r.to })}
+              >
+                {r.display}
+              </button>
+            ))}
+          </div>
+        </div>
+      )}
+    </div>
+  );
+}
+
+const getStyles = (theme: GrafanaTheme2) => {
+  const item = {
+    background: 'none',
+    border: 'none',
+    textAlign: 'left' as const,
+    padding: theme.spacing(0.5, 1),
+    borderRadius: theme.shape.radius.default,
+    color: theme.colors.text.primary,
+    cursor: 'pointer',
+    '&:hover': { background: theme.colors.action.hover },
+  };
+  return {
+    wrapper: css({ position: 'relative', display: 'flex', gap: theme.spacing(1), alignItems: 'center' }),
+    panel: css({
+      position: 'absolute',
+      top: '100%',
+      right: 0,
+      marginTop: theme.spacing(0.5),
+      zIndex: theme.zIndex.dropdown,
+      display: 'flex',
+      gap: theme.spacing(2),
+      padding: theme.spacing(2),
+      background: theme.colors.background.primary,
+      border: `1px solid ${theme.colors.border.weak}`,
+      borderRadius: theme.shape.radius.default,
+      boxShadow: theme.shadows.z3,
+    }),
+    absolute: css({ display: 'flex', flexDirection: 'column', gap: theme.spacing(1), width: 320 }),
+    title: css({ fontWeight: theme.typography.fontWeightMedium }),
+    hint: css({ color: theme.colors.text.secondary, fontSize: theme.typography.bodySmall.fontSize }),
+    error: css({ color: theme.colors.error.text, fontSize: theme.typography.bodySmall.fontSize }),
+    quick: css({
+      display: 'flex',
+      flexDirection: 'column',
+      minWidth: 160,
+      borderLeft: `1px solid ${theme.colors.border.weak}`,
+      paddingLeft: theme.spacing(1),
+    }),
+    quickItem: css(item),
+    quickActive: css({ ...item, background: theme.colors.action.selected }),
+  };
+};
````

### 12/34 `src/components/api.ts` (modified)

service-like column names (service_name, ...) are shown as "service"

PATCH-BLOCK 12/34 src/components/api.ts old=8d6dfba606c38ab1560c93fd268325da4492875f new=53aece4f438a80bd133a47e24ed35bc37861e2e4 sha256=4f9511ad0590eb29746732180bd95dfa8df8c327f81979e307636fe5cbaaf4bc
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/api.ts b/plugins/kotak-starrocks-logs-app/src/components/api.ts
index 8d6dfba606c38ab1560c93fd268325da4492875f..53aece4f438a80bd133a47e24ed35bc37861e2e4 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/api.ts
+++ b/plugins/kotak-starrocks-logs-app/src/components/api.ts
@@ -3,6 +3,7 @@ import { AdHocFiltersVariable, SceneObject } from '@grafana/scenes';
 import { getAppConfig } from '../config/config';
 import { BuildContext } from '../sql/builder';
 import { LabelFilter, LineFilter, MessageFieldFilter, PatternFilter, QuerySpec } from '../state/types';
+import { COLUMN_CANDIDATES } from '../sql/columns';
 
 export type Tab = 'logs' | 'labels' | 'fields' | 'patterns';
 export type Display = 'logs' | 'table' | 'json';
@@ -53,5 +54,5 @@ export function getExploration(obj: SceneObject): ExplorationApi {
 
 /** Name shown for a label: the service label is "service", like Logs Drilldown. */
 export function displayLabel(label: string): string {
-  return label === getAppConfig().serviceLabel ? 'service' : label;
+  return label === getAppConfig().serviceLabel || COLUMN_CANDIDATES.service.includes(label) ? 'service' : label;
 }
````

### 13/34 `src/components/pages.test.tsx` (modified)

unit tests: longer timeout for whole-page renders

PATCH-BLOCK 13/34 src/components/pages.test.tsx old=243c6b7ed352c4c2f8b0da626c5c08365de8e721 new=cbb04c07a527a4f740c3fadc447999d59f82d770 sha256=351ca8654ccefccae91a9db95cd7284952aad0903cf2333b038f491bf1639f5d
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/pages.test.tsx b/plugins/kotak-starrocks-logs-app/src/components/pages.test.tsx
index 243c6b7ed352c4c2f8b0da626c5c08365de8e721..cbb04c07a527a4f740c3fadc447999d59f82d770 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/pages.test.tsx
+++ b/plugins/kotak-starrocks-logs-app/src/components/pages.test.tsx
@@ -37,6 +37,9 @@ jest.mock('../datasource/StarRocksLogsDataSource', () => ({
 }));
 jest.mock('../datasource/oldest', () => ({ fetchOldestLog: (...a: unknown[]) => fetchOldestLog(...a) }));
 
+// whole pages render here (Grafana UI, emotion): the first render is slow on a loaded machine
+jest.setTimeout(20_000);
+
 // panels never load their plugin here (their content is Grafana's); queries are set by the tests
 setPluginImportUtils({
   importPanelPlugin: () => new Promise(() => undefined),
````

### 14/34 `src/config/config.test.ts` (modified)

unit tests: view prefix lists, tenant columns

PATCH-BLOCK 14/34 src/config/config.test.ts old=93656aa30b5ee77d07aab2929f7d57f659e26466 new=9e0610e450daf33c9bc2d768107e46a79a82a855 sha256=ce930f2093ae8fe76fba43f39c19c3af7586e3cc7bc7cd0cdbd5353dd407b1b3
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/config/config.test.ts b/plugins/kotak-starrocks-logs-app/src/config/config.test.ts
index 93656aa30b5ee77d07aab2929f7d57f659e26466..9e0610e450daf33c9bc2d768107e46a79a82a855 100644
--- a/plugins/kotak-starrocks-logs-app/src/config/config.test.ts
+++ b/plugins/kotak-starrocks-logs-app/src/config/config.test.ts
@@ -1,12 +1,13 @@
 import { DEFAULT_MESSAGE_LEVEL_REGEX } from '../constants';
-import { DEFAULT_CONFIG, resolveConfig, resolveTenant, tenantKeyForView, viewPrefixFor } from './config';
+import { DEFAULT_CONFIG, resolveConfig, resolveTenant, tenantKeyForView, viewPrefixesFor } from './config';
 
 describe('resolveConfig', () => {
   it('uses defaults for empty jsonData', () => {
     const { config, errors } = resolveConfig(undefined);
     expect(errors).toEqual([]);
     expect(config.datasource).toEqual(DEFAULT_CONFIG.datasource);
-    expect(config.viewPrefix).toBe('vw_eks_app_logs_');
+    // the EKS app log views and the GenAI log views
+    expect(config.viewPrefixes).toEqual(['vw_eks_app_logs_', 'vw_genai_logs_']);
     expect(config.labels[0]).toBe('k8s_service_name');
   });
 
@@ -20,7 +21,7 @@ describe('resolveConfig', () => {
       defaultTimeRange: 'yesterday',
     });
     expect(config.datasource.uid).toBe('ds1');
-    expect(config.viewPrefix).toBe('vw_eks_app_logs_');
+    expect(config.viewPrefixes).toEqual(['vw_eks_app_logs_', 'vw_genai_logs_']);
     expect(config.lineLimit).toBe(100);
     expect(config.labels).toEqual(['k8s_service_name', 'a']);
     expect(errors).toHaveLength(4);
@@ -108,7 +109,7 @@ describe('several data sources (one per StarRocks database)', () => {
       ],
     });
     expect(config.datasource.uid).toBe('db1');
-    expect(config.datasources).toEqual([{ uid: 'db1' }, { uid: 'db2', viewPrefix: 'vw_other_' }]);
+    expect(config.datasources).toEqual([{ uid: 'db1' }, { uid: 'db2', viewPrefixes: ['vw_other_'] }]);
     expect(errors).toHaveLength(3);
   });
 
@@ -121,8 +122,8 @@ describe('several data sources (one per StarRocks database)', () => {
       datasources: ['db1', { uid: 'db2', viewPrefix: 'vw_other_' }],
       tenants: { app_7: { level: { source: 'message' } } },
     });
-    expect(viewPrefixFor(config, 'db2')).toBe('vw_other_');
-    expect(viewPrefixFor(config, 'db1')).toBe('vw_eks_app_logs_');
+    expect(viewPrefixesFor(config, 'db2')).toEqual(['vw_other_']);
+    expect(viewPrefixesFor(config, 'db1')).toEqual(['vw_eks_app_logs_', 'vw_genai_logs_']);
     expect(resolveTenant(config, 'vw_other_app_7', 'db2').key).toBe('app_7');
     expect(resolveTenant(config, 'vw_other_app_7', 'db2').level.source).toBe('message');
   });
@@ -144,3 +145,51 @@ describe('several data sources (one per StarRocks database)', () => {
     expect(resolveTenant(config, 'vw_eks_app_logs_app_1', 'db1').level.source).toBe('message');
   });
 });
+
+describe('several view prefixes (EKS app logs, GenAI logs)', () => {
+  it('viewPrefix takes one prefix or a list, at the top level and per data source', () => {
+    const { config, errors } = resolveConfig({
+      viewPrefix: ['vw_eks_app_logs_', 'vw_genai_logs_', 'vw_onprem_logs_'],
+      datasources: [
+        { uid: 'genai', viewPrefix: ['vw_genai_logs_'] },
+        { uid: 'bad', viewPrefix: ['ok_', 'x y'] },
+      ],
+    });
+    expect(config.viewPrefixes).toEqual(['vw_eks_app_logs_', 'vw_genai_logs_', 'vw_onprem_logs_']);
+    expect(viewPrefixesFor(config, 'genai')).toEqual(['vw_genai_logs_']);
+    expect(config.datasources.map((d) => d.uid)).toEqual(['genai']);
+    expect(errors).toEqual([
+      'datasources.bad.viewPrefix ["ok_","x y"]: prefixes may only contain letters, digits and _',
+    ]);
+    expect(resolveConfig({ viewPrefix: 'vw_x_' }).config.viewPrefixes).toEqual(['vw_x_']);
+  });
+
+  it('the app_id is the view name without the prefix it starts with (the longest one)', () => {
+    const prefixes = ['vw_eks_app_logs_', 'vw_genai_logs_', 'vw_genai_logs_v2_'];
+    expect(tenantKeyForView('vw_genai_logs_app_7001_agentrouter', prefixes)).toBe('app_7001_agentrouter');
+    expect(tenantKeyForView('vw_eks_app_logs_app_1961_observability', prefixes)).toBe('app_1961_observability');
+    expect(tenantKeyForView('vw_genai_logs_v2_app_1', prefixes)).toBe('app_1');
+    expect(tenantKeyForView('other_view', prefixes)).toBe('other_view');
+  });
+
+  it('a tenant can name its columns per role; default, app_id and <ds>/<app_id> merge per role', () => {
+    const { config, errors } = resolveConfig({
+      tenants: {
+        default: { columns: { pod: 'host' } },
+        app_7001_agentrouter: { columns: { time: 'event_ts', message: 'log_text' } },
+        'genai/app_7001_agentrouter': { columns: { message: 'body_text' } },
+        bad: { columns: { when: 'x', time: 'not a column' } as never },
+      },
+    });
+    expect(errors).toEqual([
+      'tenants.bad.columns.when: unknown role (one of time, message, level, service, pod)',
+      'tenants.bad.columns.time "not a column" is not a column name',
+    ]);
+    expect(resolveTenant(config, 'vw_genai_logs_app_7001_agentrouter', 'genai').columns).toEqual({
+      pod: 'host',
+      time: 'event_ts',
+      message: 'body_text',
+    });
+    expect(resolveTenant(config, 'vw_eks_app_logs_app_1').columns).toEqual({ pod: 'host' });
+  });
+});
````

### 15/34 `src/config/config.ts` (modified)

viewPrefix as a list (default vw_eks_app_logs_ and vw_genai_logs_), per data source too; tenants.<app_id>.columns

PATCH-BLOCK 15/34 src/config/config.ts old=63e6d264368b81b9786c3c3bbd8d7fc4b0262691 new=99dbee4cbaebb92b86a0a109c6e81f3cafcd1006 sha256=b99a0ccd39f90dd3afd2116ad6539ba9eb3564cc452275589ed3242c446ed600
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/config/config.ts b/plugins/kotak-starrocks-logs-app/src/config/config.ts
index 63e6d264368b81b9786c3c3bbd8d7fc4b0262691..99dbee4cbaebb92b86a0a109c6e81f3cafcd1006 100644
--- a/plugins/kotak-starrocks-logs-app/src/config/config.ts
+++ b/plugins/kotak-starrocks-logs-app/src/config/config.ts
@@ -23,17 +23,31 @@ export interface PatternConfig {
   regex?: string;
 }
 
+/**
+ * What a column is used for. Views can name their columns differently (the GenAI views do); the app finds each
+ * role by common names (sql/columns.ts) unless a tenant names the column here.
+ */
+export type ColumnRole = 'time' | 'message' | 'level' | 'service' | 'pod';
+export const COLUMN_ROLES: ColumnRole[] = ['time', 'message', 'level', 'service', 'pod'];
+
 export interface TenantConfig {
   level?: LevelConfig;
   trace?: TraceConfig;
   patterns?: PatternConfig[];
+  /** the view's column for a role, when the built-in names do not find it */
+  columns?: Partial<Record<ColumnRole, string>>;
 }
 
 /** One StarRocks data source (one database) offered in the app's data source picker. */
 export interface DatasourceEntry {
   uid: string;
-  /** views of this data source are named <viewPrefix><app_id>; default: the top-level viewPrefix */
-  viewPrefix?: string;
+  /** view name prefixes of this data source (views are <prefix><app_id>); default: the top-level viewPrefix */
+  viewPrefix?: string | string[];
+}
+
+export interface ResolvedDatasource {
+  uid: string;
+  viewPrefixes?: string[];
 }
 
 /** jsonData of the app (provisioned through provisioning/plugins or edited on the configuration page). */
@@ -47,7 +61,8 @@ export interface AppJsonData {
    * datasourceType that the user can see.
    */
   datasources?: Array<string | DatasourceEntry>;
-  viewPrefix?: string;
+  /** view name prefixes; views are <prefix><app_id> (default: vw_eks_app_logs_ and vw_genai_logs_) */
+  viewPrefix?: string | string[];
   serviceLabel?: string;
   defaultTimeRange?: string;
   /** longest time range a user can select, in hours (default 24); longer ranges are cut to this length */
@@ -84,14 +99,15 @@ export interface ResolvedTenant {
   level: { source: 'column' | 'message'; regex: string[] };
   trace?: TraceConfig;
   patterns: PatternConfig[];
+  columns: Partial<Record<ColumnRole, string>>;
 }
 
 export interface ResolvedConfig {
   /** default data source and the plugin type of all data sources the app uses */
   datasource: { uid: string; type: string };
   /** explicit list for the picker; empty = every instance of datasource.type */
-  datasources: DatasourceEntry[];
-  viewPrefix: string;
+  datasources: ResolvedDatasource[];
+  viewPrefixes: string[];
   serviceLabel: string;
   defaultTimeRange: string;
   maxRangeHours: number;
@@ -107,7 +123,7 @@ export interface ResolvedConfig {
 export const DEFAULT_CONFIG: ResolvedConfig = {
   datasource: { uid: 'app-logs-starrocks-db', type: 'kotak-starrocks-datasource' },
   datasources: [],
-  viewPrefix: 'vw_eks_app_logs_',
+  viewPrefixes: ['vw_eks_app_logs_', 'vw_genai_logs_'],
   serviceLabel: 'k8s_service_name',
   defaultTimeRange: 'now-15m',
   maxRangeHours: 24,
@@ -143,6 +159,17 @@ function regexError(re: string, needsGroup: boolean): string | undefined {
   }
 }
 
+/** A prefix or a list of prefixes; undefined (and an error) when not valid. */
+function parsePrefixes(v: unknown, where: string, errors: string[]): string[] | undefined {
+  const list = Array.isArray(v) ? v : [v];
+  const bad = list.filter((p) => !(typeof p === 'string' && PREFIX.test(p)));
+  if (list.length === 0 || bad.length > 0) {
+    errors.push(`${where} ${JSON.stringify(v)}: prefixes may only contain letters, digits and _`);
+    return undefined;
+  }
+  return Array.from(new Set(list as string[]));
+}
+
 function asList(v: string | string[] | undefined): string[] {
   if (v === undefined) {
     return [];
@@ -180,29 +207,23 @@ export function resolveConfig(jsonData?: AppJsonData | null): { config: Resolved
           errors.push(`datasources: ${JSON.stringify(d)} is not a data source uid`);
           continue;
         }
-        if (
-          entry.viewPrefix !== undefined &&
-          !(typeof entry.viewPrefix === 'string' && PREFIX.test(entry.viewPrefix))
-        ) {
-          errors.push(
-            `datasources.${entry.uid}.viewPrefix "${entry.viewPrefix}" may only contain letters, digits and _`
-          );
-          continue;
+        let viewPrefixes: string[] | undefined;
+        if (entry.viewPrefix !== undefined) {
+          viewPrefixes = parsePrefixes(entry.viewPrefix, `datasources.${entry.uid}.viewPrefix`, errors);
+          if (!viewPrefixes) {
+            continue;
+          }
         }
         if (c.datasources.some((x) => x.uid === entry.uid)) {
           errors.push(`datasources: "${entry.uid}" is listed twice`);
           continue;
         }
-        c.datasources.push(entry.viewPrefix ? { uid: entry.uid, viewPrefix: entry.viewPrefix } : { uid: entry.uid });
+        c.datasources.push(viewPrefixes ? { uid: entry.uid, viewPrefixes } : { uid: entry.uid });
       }
     }
   }
   if (j.viewPrefix !== undefined) {
-    if (typeof j.viewPrefix === 'string' && PREFIX.test(j.viewPrefix)) {
-      c.viewPrefix = j.viewPrefix;
-    } else {
-      errors.push(`viewPrefix "${j.viewPrefix}" may only contain letters, digits and _`);
-    }
+    c.viewPrefixes = parsePrefixes(j.viewPrefix, 'viewPrefix', errors) ?? c.viewPrefixes;
   }
   if (j.serviceLabel !== undefined) {
     if (isIdentifier(j.serviceLabel)) {
@@ -313,6 +334,18 @@ function validateTenant(key: string, t: TenantConfig, errors: string[]): TenantC
       out.trace = { regex: t.trace.regex, tempoUid: t.trace.tempoUid, linkTitle: t.trace.linkTitle };
     }
   }
+  if (t.columns !== undefined) {
+    out.columns = {};
+    for (const [role, col] of Object.entries(t.columns ?? {})) {
+      if (!COLUMN_ROLES.includes(role as ColumnRole)) {
+        errors.push(`${where}.columns.${role}: unknown role (one of ${COLUMN_ROLES.join(', ')})`);
+      } else if (!isIdentifier(col)) {
+        errors.push(`${where}.columns.${role} "${col}" is not a column name`);
+      } else {
+        out.columns[role as ColumnRole] = col;
+      }
+    }
+  }
   if (t.patterns !== undefined) {
     const seen = new Set<string>();
     out.patterns = [];
@@ -342,21 +375,25 @@ function validateTenant(key: string, t: TenantConfig, errors: string[]): TenantC
   return out;
 }
 
-export function tenantKeyForView(view: string, prefix: string): string {
-  return view.startsWith(prefix) ? view.slice(prefix.length) : view;
+/** The app_id of a view: its name without the (longest) prefix it starts with. */
+export function tenantKeyForView(view: string, prefixes: string | string[]): string {
+  const match = (Array.isArray(prefixes) ? prefixes : [prefixes])
+    .filter((p) => view.startsWith(p))
+    .sort((a, b) => b.length - a.length)[0];
+  return match ? view.slice(match.length) : view;
 }
 
-/** View name prefix of a data source (its own, or the top-level viewPrefix). */
-export function viewPrefixFor(config: ResolvedConfig, datasourceUid?: string): string {
-  return config.datasources.find((d) => d.uid === datasourceUid)?.viewPrefix ?? config.viewPrefix;
+/** View name prefixes of a data source (its own, or the top-level ones). */
+export function viewPrefixesFor(config: ResolvedConfig, datasourceUid?: string): string[] {
+  return config.datasources.find((d) => d.uid === datasourceUid)?.viewPrefixes ?? config.viewPrefixes;
 }
 
 /**
  * Settings for a view: each field comes from tenants["<datasourceUid>/<app_id>"], then tenants["<app_id>"],
- * then tenants.default.
+ * then tenants.default (column names: per role, in the same order).
  */
 export function resolveTenant(config: ResolvedConfig, view: string, datasourceUid?: string): ResolvedTenant {
-  const key = tenantKeyForView(view, viewPrefixFor(config, datasourceUid));
+  const key = tenantKeyForView(view, viewPrefixesFor(config, datasourceUid));
   const d = config.tenants.default ?? {};
   const t = config.tenants[key] ?? {};
   const s = (datasourceUid && config.tenants[`${datasourceUid}/${key}`]) || {};
@@ -370,6 +407,7 @@ export function resolveTenant(config: ResolvedConfig, view: string, datasourceUi
     },
     trace: s.trace ?? t.trace ?? d.trace,
     patterns: s.patterns ?? t.patterns ?? d.patterns ?? [],
+    columns: { ...d.columns, ...t.columns, ...s.columns },
   };
 }
 
````

### 16/34 `src/datasource/ContextScope.tsx` (modified)

Show context header: the matched column first, also service_name / namespace

PATCH-BLOCK 16/34 src/datasource/ContextScope.tsx old=6fcec268a5ffb0ff82972301363ddd80a46b80a2 new=e22e5a3884dba73ec8b7244ab6e9d621447c6993 sha256=57e6249c7548bcb87f63041f434a1d2f0016ad21e3888559417c387091db2ca3
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/ContextScope.tsx b/plugins/kotak-starrocks-logs-app/src/datasource/ContextScope.tsx
index 6fcec268a5ffb0ff82972301363ddd80a46b80a2..e22e5a3884dba73ec8b7244ab6e9d621447c6993 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/ContextScope.tsx
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/ContextScope.tsx
@@ -5,8 +5,15 @@ import { useStyles2 } from '@grafana/ui';
 
 import { POD_NAME_COLUMN, POD_UID_COLUMN } from '../constants';
 
-/** Columns shown at the top of "Show context", in this order (the first one present is the one matched). */
-export const CONTEXT_LABELS = [POD_UID_COLUMN, POD_NAME_COLUMN, 'k8s_namespace_name', 'k8s_service_name'];
+/** Columns shown at the top of "Show context" after the matched one, when the line has them. */
+export const CONTEXT_LABELS = [
+  POD_UID_COLUMN,
+  POD_NAME_COLUMN,
+  'k8s_namespace_name',
+  'k8s_service_name',
+  'service_name',
+  'namespace',
+];
 
 /**
  * Top of the "Show context" modal: which lines are shown (the same pod, up to one hour before and after the line,
@@ -14,7 +21,7 @@ export const CONTEXT_LABELS = [POD_UID_COLUMN, POD_NAME_COLUMN, 'k8s_namespace_n
  */
 export function ContextScope({ labels, podColumn }: { labels: Record<string, string>; podColumn: string }) {
   const styles = useStyles2(getStyles);
-  const shown = CONTEXT_LABELS.filter((k) => labels[k]);
+  const shown = [podColumn, ...CONTEXT_LABELS.filter((k) => k !== podColumn)].filter((k) => labels[k]);
   return (
     <div className={styles.wrapper} data-testid="context-scope">
       <code className={styles.selector}>
````

### 17/34 `src/datasource/StarRocksLogsDataSource.ts` (modified)

query context from the view columns (renaming table when needed); Show context on the view pod column

PATCH-BLOCK 17/34 src/datasource/StarRocksLogsDataSource.ts old=6d30a469ca51c60762a2cd492135d0d3a37e15da new=2e084c67f84bfb55928e5b0958e57f1ced185f4e sha256=f285510f587605e38cd31b12dd978de27628444adeb326ebcbd91594aa03074f
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/StarRocksLogsDataSource.ts b/plugins/kotak-starrocks-logs-app/src/datasource/StarRocksLogsDataSource.ts
index 6d30a469ca51c60762a2cd492135d0d3a37e15da..2e084c67f84bfb55928e5b0958e57f1ced185f4e 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/StarRocksLogsDataSource.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/StarRocksLogsDataSource.ts
@@ -31,15 +31,16 @@ import { DataQuery } from '@grafana/schema';
 import {
   DEFAULT_FIELDS,
   DEFAULT_LABELS,
+  DEFAULT_MESSAGE_LEVEL_REGEX,
   LEVEL_COLUMN,
   MESSAGE_COLUMN,
   POD_NAME_COLUMN,
-  POD_UID_COLUMN,
   RUNTIME_DS_TYPE,
   RUNTIME_DS_UID,
   TIME_COLUMN,
 } from '../constants';
 import { getAppConfig, resolveTenant } from '../config/config';
+import { podColumnOf, resolveViewColumns } from '../sql/columns';
 import {
   BuildContext,
   contextQuery,
@@ -58,7 +59,7 @@ import {
   widenToSeconds,
 } from '../sql/builder';
 import { QueryKind, QueryParams, QuerySpec } from '../state/types';
-import { fetchColumns, runSql } from './api';
+import { fetchViewSample, runSql, setRelation } from './api';
 import { ContextScope } from './ContextScope';
 import { getCached, putCached } from './queryCache';
 import { ensureSessionZone } from './timeZone';
@@ -108,20 +109,50 @@ const ALL_COLUMNS = [
   ...DEFAULT_FIELDS,
 ];
 
+/**
+ * What the queries of a view need: its columns (from one sample row), labels and fields, the tenant settings and,
+ * when the view names its time, message or level column differently, the derived table that renames them.
+ */
 export async function buildContext(view: string, range: TimeRange, datasource = ''): Promise<BuildContext> {
   const config = getAppConfig();
-  let columns = await fetchColumns(view, range, datasource);
-  if (columns.length === 0) {
-    columns = ALL_COLUMNS;
+  let tenant = resolveTenant(config, view, datasource || config.datasource.uid);
+  const sample = await fetchViewSample(view, range, datasource);
+  let ctx: BuildContext;
+  if (sample.names.length === 0) {
+    // a view without any row: the usual columns (there is nothing to show anyway)
+    ctx = {
+      tenant,
+      columns: ALL_COLUMNS,
+      labels: config.labels.filter((c) => ALL_COLUMNS.includes(c)),
+      fields: config.fields.filter((c) => ALL_COLUMNS.includes(c)),
+      serviceLabel: config.serviceLabel,
+    };
+  } else {
+    const v = resolveViewColumns(view, sample.names, sample.row, {
+      labels: config.labels,
+      fields: config.fields,
+      serviceLabel: config.serviceLabel,
+      overrides: tenant.columns,
+    });
+    // no level column: the level is read from the message with the tenant's rules
+    if (!v.hasLevel && tenant.level.source === 'column') {
+      tenant = { ...tenant, level: { source: 'message', regex: DEFAULT_MESSAGE_LEVEL_REGEX } };
+    }
+    ctx = {
+      tenant,
+      columns: v.columns,
+      labels: v.labels,
+      fields: v.fields,
+      details: v.details,
+      relation: v.relation,
+      serviceLabel: v.serviceLabel,
+      podColumns: v.podColumns,
+    };
   }
+  setRelation(datasource, view, ctx.relation);
   // before the view's first data query: the session zone its statements run in
   await ensureSessionZone(view, datasource);
-  return {
-    tenant: resolveTenant(config, view, datasource || config.datasource.uid),
-    columns,
-    labels: config.labels.filter((c) => columns.includes(c)),
-    fields: config.fields.filter((c) => columns.includes(c)),
-  };
+  return ctx;
 }
 
 export function bucketFor(range: TimeRange, maxPoints = 120): number {
@@ -135,9 +166,22 @@ export function buildSql(q: LogsAppQuery, ctx: BuildContext, range: TimeRange):
   const config = getAppConfig();
   switch (q.kind) {
     case 'serviceVolume':
-      return serviceVolumeQuery(q.spec, ctx, p.label ?? config.serviceLabel, bucket, p.withLevel ?? true, p.sample);
+      return serviceVolumeQuery(
+        q.spec,
+        ctx,
+        p.label ?? ctx.serviceLabel ?? config.serviceLabel,
+        bucket,
+        p.withLevel ?? true,
+        p.sample
+      );
     case 'serviceSamples':
-      return serviceSamplesQuery(q.spec, ctx, p.label ?? config.serviceLabel, p.values ?? [], p.perValue ?? 10);
+      return serviceSamplesQuery(
+        q.spec,
+        ctx,
+        p.label ?? ctx.serviceLabel ?? config.serviceLabel,
+        p.values ?? [],
+        p.perValue ?? 10
+      );
     case 'volume':
       return volumeQuery(q.spec, ctx, bucket, p.withLevel ?? true, p.sample);
     case 'logs':
@@ -150,7 +194,7 @@ export function buildSql(q: LogsAppQuery, ctx: BuildContext, range: TimeRange):
     case 'labelOverview':
       return labelOverviewQuery(q.spec, ctx, p.labels ?? ctx.labels, bucket);
     case 'valueBreakdown':
-      return valueBreakdownQuery(q.spec, ctx, p.label ?? config.serviceLabel, bucket);
+      return valueBreakdownQuery(q.spec, ctx, p.label ?? ctx.serviceLabel ?? config.serviceLabel, bucket);
     case 'fieldBreakdown':
       return fieldBreakdownQuery(q.spec, ctx, p.field ?? '', bucket);
     case 'patterns':
@@ -385,7 +429,7 @@ export class StarRocksLogsDataSource extends RuntimeDataSource<LogsAppQuery> {
       string,
       string
     >;
-    const podColumn = labels[POD_UID_COLUMN] ? POD_UID_COLUMN : POD_NAME_COLUMN;
+    const podColumn = podColumnOf(labels) ?? POD_NAME_COLUMN;
     return createElement(ContextScope, { labels, podColumn });
   }
 
@@ -405,9 +449,7 @@ export class StarRocksLogsDataSource extends RuntimeDataSource<LogsAppQuery> {
       string,
       string
     >;
-    const podColumn = labels[POD_UID_COLUMN] ? POD_UID_COLUMN : POD_NAME_COLUMN;
-    const pod = labels[podColumn];
-    if (!tsRaw || !pod) {
+    if (!tsRaw) {
       return { data: [] };
     }
     const direction = options?.direction === LogRowContextQueryDirection.Forward ? 'forward' : 'backward';
@@ -419,6 +461,12 @@ export class StarRocksLogsDataSource extends RuntimeDataSource<LogsAppQuery> {
     };
     const datasource = query?.spec?.datasource ?? '';
     const ctx = await buildContext(view, range, datasource);
+    // lines of the same source: the view's pod column, or the first identifying column this line has
+    const podColumn = podColumnOf(labels, ctx.podColumns);
+    const pod = podColumn ? labels[podColumn] : undefined;
+    if (!podColumn || !pod) {
+      return { data: [] };
+    }
     // the message breaks ties: lines of the same pod with the same microsecond (42 % of lines on UAT)
     const sql = contextQuery(view, ctx, podColumn, pod, tsRaw, direction, options?.limit ?? 50, row.entry);
     const res = await lastValueFrom(runSql(sql, { datasource, view, refId: `context-${direction}`, range }));
````

### 18/34 `src/datasource/api.ts` (modified)

views of every prefix; column names from one sample row; registry of renaming tables for the probes

PATCH-BLOCK 18/34 src/datasource/api.ts old=ef94a602e30ce49e1db90b896cc7fa20bd504c10 new=45c071712daf9022f2104553f2b9d3af4fb132a2 sha256=aa26fddad446f36859ad1c5fa5fb75b165c8012b330fbc93fe82da49816e1028
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/api.ts b/plugins/kotak-starrocks-logs-app/src/datasource/api.ts
index ef94a602e30ce49e1db90b896cc7fa20bd504c10..45c071712daf9022f2104553f2b9d3af4fb132a2 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/api.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/api.ts
@@ -9,8 +9,8 @@ import {
   toDataQueryResponse,
 } from '@grafana/runtime';
 
-import { getAppConfig, viewPrefixFor } from '../config/config';
-import { columnsQuery, queryHint, viewsQuery, withQueryHint } from '../sql/builder';
+import { getAppConfig, viewPrefixesFor } from '../config/config';
+import { queryHint, sampleRowQuery, viewsQuery, withQueryHint } from '../sql/builder';
 
 export interface StarRocksDatasource {
   uid: string;
@@ -186,27 +186,70 @@ export function stringColumn(frame: DataFrame | undefined, name?: string): strin
   return (field?.values ?? []).map((v) => (v === null || v === undefined ? '' : String(v)));
 }
 
-/** Views (vw_eks_app_logs_*) of a data source's database that this user can see (SHOW TABLES, Ranger-filtered). */
+/**
+ * Log views of a data source's database that this user can see: one SHOW TABLES LIKE per view prefix
+ * (vw_eks_app_logs_*, vw_genai_logs_*, ...), each Ranger-filtered. LIKE treats "_" as a wildcard, so the names are
+ * checked against the prefixes again.
+ */
 export async function fetchViews(range: TimeRange, datasource?: string): Promise<string[]> {
-  const viewPrefix = viewPrefixFor(getAppConfig(), datasource);
-  const frames = await runSqlOnce(viewsQuery(viewPrefix), range, 'views', datasource);
-  return stringColumn(frames[0])
-    .filter((v) => v.startsWith(viewPrefix))
-    .sort();
+  const prefixes = viewPrefixesFor(getAppConfig(), datasource);
+  const lists = await Promise.all(
+    prefixes.map((p) => runSqlOnce(viewsQuery(p), range, 'views', datasource).then((f) => stringColumn(f[0])))
+  );
+  const views = new Set(lists.flat().filter((v) => prefixes.some((p) => v.startsWith(p))));
+  return Array.from(views).sort();
+}
+
+export interface ViewSample {
+  /** column names of the view (empty when the view has no row at all) */
+  names: string[];
+  /** one row, to tell structured (JSON) columns from plain ones */
+  row?: Record<string, unknown>;
 }
 
-const columnCache = new Map<string, Promise<string[]>>();
+const sampleCache = new Map<string, Promise<ViewSample>>();
 
-/** Column names of a view. DESCRIBE is denied by Ranger, so this uses SELECT * ... LIMIT 0. */
-export function fetchColumns(view: string, range: TimeRange, datasource?: string): Promise<string[]> {
+/**
+ * Column names of a view, from one of its rows: DESCRIBE is denied by Ranger, and Grafana returns no columns for
+ * an empty result (SELECT * ... LIMIT 0). First a row of the last day on the usual time column; a view without
+ * that column (or without a recent row) is sampled with a plain LIMIT 1. Cached per data source and view.
+ */
+export function fetchViewSample(view: string, range: TimeRange, datasource?: string): Promise<ViewSample> {
   const key = `${datasource ?? ''}/${view}`;
-  let p = columnCache.get(key);
+  let p = sampleCache.get(key);
   if (!p) {
-    p = runSqlOnce(columnsQuery(view), range, 'columns', datasource).then((frames) =>
-      (frames[0]?.fields ?? []).map((f) => f.name)
-    );
-    p.catch(() => columnCache.delete(key));
-    columnCache.set(key, p);
+    const read = async (bounded: boolean): Promise<ViewSample> => {
+      const frames = await runSqlOnce(sampleRowQuery(view, bounded), range, 'columns', datasource, { timeZone: null });
+      const frame = frames[0];
+      const names = (frame?.fields ?? []).map((f) => f.name);
+      const row =
+        frame && frame.length > 0 ? Object.fromEntries(frame.fields.map((f) => [f.name, f.values[0]])) : undefined;
+      return { names, row };
+    };
+    p = read(true)
+      .catch(() => ({ names: [] }) as ViewSample)
+      .then((s) => (s.names.length > 0 ? s : read(false)));
+    p.catch(() => sampleCache.delete(key));
+    sampleCache.set(key, p);
   }
   return p;
 }
+
+const relations = new Map<string, string>();
+
+/**
+ * The FROM target of a view that is read through a renaming derived table (set by buildContext), for the queries
+ * that run without a build context: the time zone probe and the oldest-line probes.
+ */
+export function setRelation(datasource: string | undefined, view: string, relation: string | undefined) {
+  const key = `${datasource ?? ''}/${view}`;
+  if (relation) {
+    relations.set(key, relation);
+  } else {
+    relations.delete(key);
+  }
+}
+
+export function relationOf(datasource: string | undefined, view: string): string | undefined {
+  return relations.get(`${datasource ?? ''}/${view}`);
+}
````

### 19/34 `src/datasource/buildContext.test.ts` (new file)

unit tests: query context per view

PATCH-BLOCK 19/34 src/datasource/buildContext.test.ts old=none new=af2a38316445697a2773316450d3c1342984c73e sha256=e90e67ee9c7070cac6ae62ba40d29c22d4e7fa1fdf5dcc7202adf444920028bc
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/buildContext.test.ts b/plugins/kotak-starrocks-logs-app/src/datasource/buildContext.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..af2a38316445697a2773316450d3c1342984c73e
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/buildContext.test.ts
@@ -0,0 +1,82 @@
+import { dateTime } from '@grafana/data';
+
+import { setAppConfig } from '../config/config';
+import { buildContext } from './StarRocksLogsDataSource';
+
+const fetchViewSample = jest.fn();
+const setRelation = jest.fn();
+const ensureSessionZone = jest.fn();
+
+jest.mock('./api', () => ({
+  ...jest.requireActual('./api'),
+  fetchViewSample: (...a: unknown[]) => fetchViewSample(...a),
+  setRelation: (...a: unknown[]) => setRelation(...a),
+}));
+jest.mock('./timeZone', () => ({ ensureSessionZone: (...a: unknown[]) => ensureSessionZone(...a) }));
+
+const range = { from: dateTime(0), to: dateTime(3_600_000), raw: { from: 'now-1h', to: 'now' } };
+
+beforeEach(() => {
+  fetchViewSample.mockReset();
+  setRelation.mockReset();
+  ensureSessionZone.mockReset().mockResolvedValue(undefined);
+  setAppConfig({ tenants: { default: { level: { source: 'column' } } } });
+});
+
+describe('build context from the view columns', () => {
+  it('an EKS view: read as it is, the usual labels and fields', async () => {
+    fetchViewSample.mockResolvedValue({
+      names: ['observed_timestamp', 'message', 'level', 'k8s_service_name', 'k8s_pod_uid', 'app_id'],
+      row: { message: 'x' },
+    });
+    const ctx = await buildContext('vw_eks_app_logs_app_1', range, 'ds1');
+    expect(ctx.relation).toBeUndefined();
+    expect(ctx.labels).toEqual(['k8s_service_name']);
+    expect(ctx.fields).toEqual(['k8s_pod_uid']);
+    expect(ctx.serviceLabel).toBe('k8s_service_name');
+    expect(ctx.tenant.key).toBe('app_1');
+    expect(setRelation).toHaveBeenCalledWith('ds1', 'vw_eks_app_logs_app_1', undefined);
+  });
+
+  it('a GenAI view with other names: a renaming table, registered before the time zone probe', async () => {
+    fetchViewSample.mockResolvedValue({
+      names: ['event_time', 'body', 'severity_text', 'service_name', 'pod_name'],
+      row: { body: 'routed request' },
+    });
+    const ctx = await buildContext('vw_genai_logs_app_7001_agentrouter', range, 'genai');
+    expect(ctx.relation).toMatch(
+      /^\(SELECT `event_time` AS `observed_timestamp`, CAST\(`body` AS VARCHAR\) AS `message`/
+    );
+    expect(ctx.columns).toContain('level');
+    expect(ctx.serviceLabel).toBe('service_name');
+    expect(ctx.podColumns).toEqual(['pod_name']);
+    expect(ctx.tenant.key).toBe('app_7001_agentrouter');
+    expect(ctx.tenant.level.source).toBe('column');
+    expect(setRelation).toHaveBeenCalledWith('genai', 'vw_genai_logs_app_7001_agentrouter', ctx.relation);
+    expect(setRelation.mock.invocationCallOrder[0]).toBeLessThan(ensureSessionZone.mock.invocationCallOrder[0]);
+  });
+
+  it('no level column: the level is read from the message', async () => {
+    fetchViewSample.mockResolvedValue({ names: ['timestamp', 'log', 'service'] });
+    const ctx = await buildContext('vw_genai_logs_app_2', range, 'genai');
+    expect(ctx.tenant.level.source).toBe('message');
+    expect(ctx.tenant.level.regex.length).toBeGreaterThan(3);
+  });
+
+  it('the tenant names its columns', async () => {
+    setAppConfig({ tenants: { app_3: { columns: { time: 'logged_at', message: 'text' } } } });
+    fetchViewSample.mockResolvedValue({ names: ['logged_at', 'text', 'event_time', 'body'] });
+    const ctx = await buildContext('vw_genai_logs_app_3', range, 'genai');
+    expect(ctx.relation).toContain('`logged_at` AS `observed_timestamp`');
+    expect(ctx.relation).toContain('CAST(`text` AS VARCHAR) AS `message`');
+  });
+
+  it('a view without any row: the usual columns; a view without a time column: a clear error', async () => {
+    fetchViewSample.mockResolvedValue({ names: [] });
+    const empty = await buildContext('vw_eks_app_logs_empty', range, 'ds1');
+    expect(empty.relation).toBeUndefined();
+    expect(empty.columns).toContain('observed_timestamp');
+    fetchViewSample.mockResolvedValue({ names: ['body', 'service'] });
+    await expect(buildContext('vw_genai_logs_x', range, 'genai')).rejects.toThrow(/has no time column/);
+  });
+});
````

### 20/34 `src/datasource/context.test.ts` (modified)

unit tests: Show context (updated mock)

PATCH-BLOCK 20/34 src/datasource/context.test.ts old=91f7ef7cac9681c684eef81d662d4861ffef46cb new=59cfa0597fb9105107d87adf38e060c07520b2af sha256=435a99fc59c5016363f01cd972a6d2d3b67335d187fb130dcf08215660f1a6a6
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/context.test.ts b/plugins/kotak-starrocks-logs-app/src/datasource/context.test.ts
index 91f7ef7cac9681c684eef81d662d4861ffef46cb..59cfa0597fb9105107d87adf38e060c07520b2af 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/context.test.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/context.test.ts
@@ -11,15 +11,12 @@ jest.mock('./timeZone', () => ({ ensureSessionZone: async () => undefined }));
 jest.mock('./ContextScope', () => ({ ContextScope: (props: unknown) => props }));
 const runSql = jest.fn();
 jest.mock('./api', () => ({
+  setRelation: () => undefined,
+  relationOf: () => undefined,
   runSql: (...args: unknown[]) => runSql(...args),
-  fetchColumns: async () => [
-    'observed_timestamp',
-    'message',
-    'level',
-    'k8s_service_name',
-    'k8s_pod_uid',
-    'k8s_pod_name',
-  ],
+  fetchViewSample: async () => ({
+    names: ['observed_timestamp', 'message', 'level', 'k8s_service_name', 'k8s_pod_uid', 'k8s_pod_name'],
+  }),
 }));
 
 const VIEW = 'vw_eks_app_logs_app_1961_observability';
````

### 21/34 `src/datasource/oldest.ts` (modified)

oldest-line probes read renamed views too

PATCH-BLOCK 21/34 src/datasource/oldest.ts old=436881baebbe3956f11546ef36a3b2dc7a41a602 new=5277912f9ad42e1a66495a04b46be9dcc15be226 sha256=6856449feaccf5ad71040ca8fa23f96e813138ec1e4f397f50f5e26dd9084cc7
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/oldest.ts b/plugins/kotak-starrocks-logs-app/src/datasource/oldest.ts
index 436881baebbe3956f11546ef36a3b2dc7a41a602..5277912f9ad42e1a66495a04b46be9dcc15be226 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/oldest.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/oldest.ts
@@ -2,7 +2,7 @@ import { dateTime, TimeRange } from '@grafana/data';
 
 import { anyBeforeQuery, oldestInRangeQuery } from '../sql/builder';
 import { getOldestCache, setOldestCache } from '../state/storage';
-import { runSqlOnce } from './api';
+import { relationOf, runSqlOnce } from './api';
 import { findOldest } from './oldestSearch';
 
 const HOUR_MS = 3_600_000;
@@ -28,15 +28,16 @@ export function fetchOldestLog(view: string, datasource: string, nowMs = Date.no
   let p = inFlight.get(key);
   if (!p) {
     const range = rangeAround(nowMs);
+    const relation = relationOf(datasource, view);
     const anyBefore = async (ms: number) => {
-      const frames = await runSqlOnce(anyBeforeQuery(view, ms), range, 'oldest', datasource, {
+      const frames = await runSqlOnce(anyBeforeQuery(view, ms, relation), range, 'oldest', datasource, {
         view,
         timeoutSeconds: PROBE_TIMEOUT_SECONDS,
       });
       return (frames[0]?.length ?? 0) > 0;
     };
     const oldestIn = async (fromMs: number, toMs: number) => {
-      const frames = await runSqlOnce(oldestInRangeQuery(view, fromMs, toMs), range, 'oldest', datasource, {
+      const frames = await runSqlOnce(oldestInRangeQuery(view, fromMs, toMs, relation), range, 'oldest', datasource, {
         view,
         timeoutSeconds: PROBE_TIMEOUT_SECONDS,
       });
````

### 22/34 `src/datasource/probes.test.ts` (modified)

unit tests: probes (updated mock)

PATCH-BLOCK 22/34 src/datasource/probes.test.ts old=e7aef3a4cac95604be64119c4e1cc3d69b4f1737 new=deb01b744588f57b446a4f6a1b80635ef840bf02 sha256=0a6c46ff2ccaf776e8ed60887cde6040b232cb150f83f93847c49182ab51b346
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/probes.test.ts b/plugins/kotak-starrocks-logs-app/src/datasource/probes.test.ts
index e7aef3a4cac95604be64119c4e1cc3d69b4f1737..deb01b744588f57b446a4f6a1b80635ef840bf02 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/probes.test.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/probes.test.ts
@@ -6,6 +6,8 @@ import { getOldestCache, getTimeModeCache, setOldestCache } from '../state/stora
 const runSqlOnce = jest.fn();
 const setSessionZone = jest.fn();
 jest.mock('./api', () => ({
+  setRelation: () => undefined,
+  relationOf: () => undefined,
   runSqlOnce: (...args: unknown[]) => runSqlOnce(...args),
   setSessionZone: (...args: unknown[]) => setSessionZone(...args),
   stringColumn: (frame: DataFrame | undefined, name: string) =>
````

### 23/34 `src/datasource/query.test.ts` (modified)

unit tests: panel queries (updated mock)

PATCH-BLOCK 23/34 src/datasource/query.test.ts old=7c0a68b8a761fc1c2da3672c142c8fa5bd455354 new=d4f8efb33fbc2a6ac357d4b484a0dd42774e60fb sha256=4c1fa6684366e64f14fc36ea1af1d5d195923e0208f7305bd08fe8302dd9e59b
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/query.test.ts b/plugins/kotak-starrocks-logs-app/src/datasource/query.test.ts
index 7c0a68b8a761fc1c2da3672c142c8fa5bd455354..d4f8efb33fbc2a6ac357d4b484a0dd42774e60fb 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/query.test.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/query.test.ts
@@ -12,15 +12,12 @@ jest.mock('./timeZone', () => ({ ensureSessionZone: async () => undefined }));
 jest.mock('./ContextScope', () => ({ ContextScope: () => null }));
 const runSql = jest.fn();
 jest.mock('./api', () => ({
+  setRelation: () => undefined,
+  relationOf: () => undefined,
   runSql: (...args: unknown[]) => runSql(...args),
-  fetchColumns: async () => [
-    'observed_timestamp',
-    'message',
-    'level',
-    'k8s_service_name',
-    'k8s_namespace_name',
-    'k8s_pod_uid',
-  ],
+  fetchViewSample: async () => ({
+    names: ['observed_timestamp', 'message', 'level', 'k8s_service_name', 'k8s_namespace_name', 'k8s_pod_uid'],
+  }),
 }));
 
 const VIEW = 'vw_eks_app_logs_app_1'; // tenant app_1
````

### 24/34 `src/datasource/runSql.test.ts` (modified)

unit tests: view list over prefixes, sample-row columns

PATCH-BLOCK 24/34 src/datasource/runSql.test.ts old=57665ccb8dbdaa9304ddd8e31fcf9aa494301062 new=bbd6eeb261bbd37053c37ab1412b83700b66e3f5 sha256=acf8b262cc7f9c86d5317b0e74a4e88c6b39baab0859915ab2131eb92f6ef871
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/runSql.test.ts b/plugins/kotak-starrocks-logs-app/src/datasource/runSql.test.ts
index 57665ccb8dbdaa9304ddd8e31fcf9aa494301062..bbd6eeb261bbd37053c37ab1412b83700b66e3f5 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/runSql.test.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/runSql.test.ts
@@ -3,7 +3,7 @@ import { of, throwError, lastValueFrom } from 'rxjs';
 import { dateTime } from '@grafana/data';
 
 import { setAppConfig } from '../config/config';
-import { fetchColumns, fetchViews, runSql, runSqlOnce, setSessionZone, stringColumn } from './api';
+import { fetchViews, fetchViewSample, runSql, runSqlOnce, setSessionZone, stringColumn } from './api';
 
 const fetch = jest.fn();
 jest.mock('@grafana/runtime', () => {
@@ -112,35 +112,79 @@ describe('runSql: one statement through /api/ds/query as the signed-in user', ()
 });
 
 describe('view list and columns', () => {
-  it('lists only views with the data source prefix, sorted (SHOW TABLES, Ranger-filtered)', async () => {
-    fetch.mockReturnValue(
-      of(okResponse([{ name: 'Tables', values: ['vw_eks_app_logs_b', 'other', 'vw_eks_app_logs_a'] }], 'views'))
-    );
-    expect(await fetchViews(range)).toEqual(['vw_eks_app_logs_a', 'vw_eks_app_logs_b']);
-    expect(fetch.mock.calls[0][0].data.queries[0].rawSql).toBe("SHOW TABLES LIKE 'vw_eks_app_logs_%'");
-  });
-
-  it('reads the columns from SELECT * LIMIT 0 once per data source and view; a failure is retried', async () => {
-    fetch.mockReturnValueOnce(
-      throwError(() => ({ status: 500, data: { results: { columns: { error: 'boom', status: 500 } } } }))
-    );
-    await expect(fetchColumns('vw_c', range, 'dsx')).rejects.toThrow('boom');
-    fetch.mockReturnValue(
+  it('lists the views of every prefix, sorted (one SHOW TABLES LIKE each, Ranger-filtered)', async () => {
+    fetch.mockImplementation((req: { data: { queries: Array<{ rawSql: string }> } }) =>
       of(
         okResponse(
           [
-            { name: 'observed_timestamp', values: [] },
-            { name: 'message', values: [] },
+            {
+              name: 'Tables',
+              values: req.data.queries[0].rawSql.includes('genai')
+                ? ['vw_genai_logs_app_7001_agentrouter']
+                : ['vw_eks_app_logs_b', 'vw_eksXapp_logs_like_wildcard', 'vw_eks_app_logs_a'],
+            },
           ],
-          'columns'
+          'views'
         )
       )
     );
-    expect(await fetchColumns('vw_c', range, 'dsx')).toEqual(['observed_timestamp', 'message']);
-    expect(await fetchColumns('vw_c', range, 'dsx')).toEqual(['observed_timestamp', 'message']);
-    expect(fetch).toHaveBeenCalledTimes(2);
+    expect(await fetchViews(range)).toEqual([
+      'vw_eks_app_logs_a',
+      'vw_eks_app_logs_b',
+      'vw_genai_logs_app_7001_agentrouter',
+    ]);
+    expect(fetch.mock.calls.map((c) => c[0].data.queries[0].rawSql)).toEqual([
+      "SHOW TABLES LIKE 'vw_eks_app_logs_%'",
+      "SHOW TABLES LIKE 'vw_genai_logs_%'",
+    ]);
+  });
+
+  it("reads a view's columns from one row of the last day, else from any row; cached; a failure is retried", async () => {
+    const row = (fields: Array<{ name: string; values: unknown[] }>) => of(okResponse(fields, 'columns'));
+    // the usual time column exists: one bounded query
+    fetch.mockReturnValueOnce(
+      row([
+        { name: 'observed_timestamp', values: ['2026-11-26 10:00:00'] },
+        { name: 'message', values: ['hello'] },
+      ])
+    );
+    expect(await fetchViewSample('vw_a', range, 'dsx')).toEqual({
+      names: ['observed_timestamp', 'message'],
+      row: { observed_timestamp: '2026-11-26 10:00:00', message: 'hello' },
+    });
+    expect(await fetchViewSample('vw_a', range, 'dsx')).toMatchObject({ names: ['observed_timestamp', 'message'] });
+    expect(fetch).toHaveBeenCalledTimes(1);
+    expect(fetch.mock.calls[0][0].data.queries[0].rawSql).toBe(
+      'SELECT /*+ SET_VAR(query_timeout = 120) */ * FROM `vw_a` WHERE `observed_timestamp` >= DATE_SUB(NOW(), INTERVAL 1 DAY) LIMIT 1'
+    );
+
+    // another time column: the bounded query fails, the plain LIMIT 1 gives the names
+    fetch.mockReset();
+    fetch
+      .mockReturnValueOnce(
+        throwError(() => ({
+          status: 400,
+          data: { results: { columns: { error: 'Column observed_timestamp not found', status: 400 } } },
+        }))
+      )
+      .mockReturnValueOnce(
+        row([
+          { name: 'event_time', values: ['x'] },
+          { name: 'body', values: ['y'] },
+        ])
+      );
+    expect((await fetchViewSample('vw_genai', range, 'dsx')).names).toEqual(['event_time', 'body']);
     expect(fetch.mock.calls[1][0].data.queries[0].rawSql).toBe(
-      'SELECT /*+ SET_VAR(query_timeout = 120) */ * FROM `vw_c` LIMIT 0'
+      'SELECT /*+ SET_VAR(query_timeout = 120) */ * FROM `vw_genai` LIMIT 1'
+    );
+
+    // both fail: an error, and the next call tries again
+    fetch.mockReset();
+    fetch.mockReturnValue(
+      throwError(() => ({ status: 500, data: { results: { columns: { error: 'boom', status: 500 } } } }))
     );
+    await expect(fetchViewSample('vw_c', range, 'dsx')).rejects.toThrow('boom');
+    fetch.mockReturnValue(row([{ name: 'observed_timestamp', values: ['t'] }]));
+    expect((await fetchViewSample('vw_c', range, 'dsx')).names).toEqual(['observed_timestamp']);
   });
 });
````

### 25/34 `src/datasource/timeZone.ts` (modified)

time zone probe reads renamed views too

PATCH-BLOCK 25/34 src/datasource/timeZone.ts old=5b652c908d3c2d5e570002a177ed958c1f0cc634 new=4bacb4ca4c3142e3d1dc8f3f501809ba8c95566d sha256=d4eabf3031b7da43bbd5d37411517456e0135720728ce0f5321cf196dc8c6803
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/timeZone.ts b/plugins/kotak-starrocks-logs-app/src/datasource/timeZone.ts
index 5b652c908d3c2d5e570002a177ed958c1f0cc634..4bacb4ca4c3142e3d1dc8f3f501809ba8c95566d 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/timeZone.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/timeZone.ts
@@ -4,7 +4,7 @@ import { getAppConfig } from '../config/config';
 import { newestTimeTextQuery, sessionZoneQuery } from '../sql/builder';
 import { decideTimeMode, PROBE_ZONES, TimeMode, zoneForMode } from '../sql/timeZone';
 import { getTimeModeCache, setTimeModeCache } from '../state/storage';
-import { runSqlOnce, setSessionZone, stringColumn } from './api';
+import { relationOf, runSqlOnce, setSessionZone, stringColumn } from './api';
 
 const CACHE_MS = 24 * 3_600_000;
 const PROBE_TIMEOUT_SECONDS = 30;
@@ -17,10 +17,16 @@ function nowRange(): TimeRange {
 }
 
 async function probe(view: string, datasource: string, zone: string): Promise<string | undefined> {
-  const frames = await runSqlOnce(newestTimeTextQuery(view), nowRange(), 'tz', datasource, {
-    timeZone: zone,
-    timeoutSeconds: PROBE_TIMEOUT_SECONDS,
-  });
+  const frames = await runSqlOnce(
+    newestTimeTextQuery(view, relationOf(datasource, view)),
+    nowRange(),
+    'tz',
+    datasource,
+    {
+      timeZone: zone,
+      timeoutSeconds: PROBE_TIMEOUT_SECONDS,
+    }
+  );
   return stringColumn(frames[0], 't')[0];
 }
 
````

### 26/34 `src/datasource/windowedSearch.test.ts` (modified)

unit tests: windowed search (updated mock)

PATCH-BLOCK 26/34 src/datasource/windowedSearch.test.ts old=69eae448431e9fbcb68a7be8073c7dd56f1b6e97 new=d7758bf9c641d657b48da307201c1f684b843994 sha256=267a0f4dd9fdc4483542cb53b6ca907d3b42f487176a94d6ff2e4cda94d61e08
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/windowedSearch.test.ts b/plugins/kotak-starrocks-logs-app/src/datasource/windowedSearch.test.ts
index 69eae448431e9fbcb68a7be8073c7dd56f1b6e97..d7758bf9c641d657b48da307201c1f684b843994 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/windowedSearch.test.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/windowedSearch.test.ts
@@ -13,8 +13,12 @@ const runSql = jest.fn();
 jest.mock('./timeZone', () => ({ ensureSessionZone: async () => undefined }));
 jest.mock('./ContextScope', () => ({ ContextScope: () => null }));
 jest.mock('./api', () => ({
+  setRelation: () => undefined,
+  relationOf: () => undefined,
   runSql: (...args: unknown[]) => runSql(...args),
-  fetchColumns: async () => ['observed_timestamp', 'message', 'level', 'k8s_service_name', 'k8s_pod_uid'],
+  fetchViewSample: async () => ({
+    names: ['observed_timestamp', 'message', 'level', 'k8s_service_name', 'k8s_pod_uid'],
+  }),
 }));
 
 const H = 3_600_000;
````

### 27/34 `src/sql/builder.ts` (modified)

queries read through the renaming table when there is one; sample-row query; details columns; pod column for sampling

PATCH-BLOCK 27/34 src/sql/builder.ts old=15aa9b20459efbb62e6cfdcd1be258212496494d new=35e692d334f1cbf9c6dfd9ebf7ec6fa43eae9dd1 sha256=d308fa515cfeddd03206e6762db52248438cfbd33b7c5ea57c0579fe59cc32f2
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/sql/builder.ts b/plugins/kotak-starrocks-logs-app/src/sql/builder.ts
index 15aa9b20459efbb62e6cfdcd1be258212496494d..35e692d334f1cbf9c6dfd9ebf7ec6fa43eae9dd1 100644
--- a/plugins/kotak-starrocks-logs-app/src/sql/builder.ts
+++ b/plugins/kotak-starrocks-logs-app/src/sql/builder.ts
@@ -16,6 +16,17 @@ export interface BuildContext {
   columns: string[];
   labels: string[];
   fields: string[];
+  /** structured (JSON) columns: returned with each line for its details, never grouped by */
+  details?: string[];
+  /**
+   * FROM target when the view names its time, message or level column differently: a derived table that renames
+   * them (sql/columns.ts). Unset: the view itself.
+   */
+  relation?: string;
+  /** label of the value grid (the view's service column) */
+  serviceLabel?: string;
+  /** columns identifying where a line comes from (pod uid, pod name, ...), best first */
+  podColumns?: string[];
 }
 
 export function quoteIdent(name: string): string {
@@ -265,7 +276,7 @@ export function levelSplit(tenant: ResolvedTenant, ctx: BuildContext): Array<{ e
 
 /** Column used to spread a hash sample evenly over pods and time. */
 function sampleKey(ctx: BuildContext): string {
-  const pod = ['k8s_pod_uid', 'k8s_pod_name'].find((c) => ctx.columns.includes(c));
+  const pod = (ctx.podColumns ?? ['k8s_pod_uid', 'k8s_pod_name']).find((c) => ctx.columns.includes(c));
   return pod ? `${quoteIdent(pod)}, ${T}` : T;
 }
 
@@ -302,7 +313,7 @@ function countByLevel(
   const selects = parts.map((p) =>
     [
       `SELECT ${[...opts.select, `${p.out} AS ${opts.levelAlias}`, `${count} AS c`].join(', ')}`,
-      from(spec.view),
+      from(spec.view, ctx.relation),
       `WHERE ${whereClause(spec, ctx, { before: [...(p.cond ? [p.cond] : []), ...sample], levelBy: p.levelBy })}`,
       `GROUP BY ${groupBy}`,
     ].join('\n')
@@ -431,14 +442,16 @@ export function needsMessageScan(spec: QuerySpec, tenant: ResolvedTenant, includ
   );
 }
 
-function from(view: string): string {
-  return `FROM ${quoteIdent(view)}`;
+function from(view: string, relation?: string): string {
+  return `FROM ${relation ?? quoteIdent(view)}`;
 }
 
 /** Columns returned with every log line (labels first, then fields), limited to what the view has. */
 export function lineColumns(ctx: BuildContext): string[] {
   const skip = new Set([TIME_COLUMN, MESSAGE_COLUMN, LEVEL_COLUMN]);
-  return Array.from(new Set([...ctx.labels, ...ctx.fields])).filter((c) => ctx.columns.includes(c) && !skip.has(c));
+  return Array.from(new Set([...ctx.labels, ...ctx.fields, ...(ctx.details ?? [])])).filter(
+    (c) => ctx.columns.includes(c) && !skip.has(c)
+  );
 }
 
 /** Columns read inside the top-N of a lines query: no expression, so nothing is computed for dropped rows. */
@@ -476,7 +489,7 @@ function topLines(
   const n = Math.max(1, Math.floor(limit));
   const raw = rawLineColumns(ctx, opts.innerExtra).join(', ');
   const branches = wheres.map((w) =>
-    [`SELECT ${raw}`, from(view), `WHERE ${w}`, `ORDER BY ${orderBy}`, `LIMIT ${n}`].join('\n')
+    [`SELECT ${raw}`, from(view, ctx.relation), `WHERE ${w}`, `ORDER BY ${orderBy}`, `LIMIT ${n}`].join('\n')
   );
   const source = branches.length === 1 ? branches[0] : branches.map((b) => `(${b})`).join('\nUNION ALL\n');
   return [
@@ -501,8 +514,14 @@ export function viewsQuery(prefix: string): string {
   return `SHOW TABLES LIKE ${lit(`${prefix}%`)}`;
 }
 
-export function columnsQuery(view: string): string {
-  return `SELECT * ${from(view)} LIMIT 0`;
+/**
+ * One row of a view, for its column names: Grafana returns no columns for an empty result (LIMIT 0). The first
+ * try is bounded to the last day on the usual time column (cheap); a view that names its time column
+ * differently, or has no recent row, is sampled without a bound (LIMIT 1 stops at the first row).
+ */
+export function sampleRowQuery(view: string, bounded: boolean): string {
+  const where = bounded ? ` WHERE ${T} >= DATE_SUB(NOW(), INTERVAL 1 DAY)` : '';
+  return `SELECT * ${from(view)}${where} LIMIT 1`;
 }
 
 export function labelValuesQuery(spec: QuerySpec, ctx: BuildContext, key: string, limit = 500): string {
@@ -510,7 +529,7 @@ export function labelValuesQuery(spec: QuerySpec, ctx: BuildContext, key: string
   const others = { ...spec, filters: spec.filters.filter((f) => f.key !== key) };
   return [
     `SELECT ${col} AS v, COUNT(*) AS c`,
-    from(spec.view),
+    from(spec.view, ctx.relation),
     `WHERE ${whereClause(others, ctx, { extra: [`${col} != ''`] })}`,
     `GROUP BY ${col}`,
     `ORDER BY c DESC`,
@@ -602,7 +621,7 @@ export function labelOverviewQuery(spec: QuerySpec, ctx: BuildContext, labels: s
   return [
     `SELECT t, ${cols.join(', ')}, GROUPING_ID(${cols.join(', ')}) AS gid, COUNT(*) AS c`,
     `FROM (SELECT ${bucketExpr(bucket)} AS t, ${cols.join(', ')}`,
-    `  ${from(spec.view)}`,
+    `  ${from(spec.view, ctx.relation)}`,
     `  WHERE ${whereClause(spec, ctx)}) s`,
     `GROUP BY GROUPING SETS (${cols.map((c) => `(t, ${c})`).join(', ')})`,
   ].join('\n');
@@ -612,7 +631,7 @@ export function valueBreakdownQuery(spec: QuerySpec, ctx: BuildContext, key: str
   const col = quoteIdent(key);
   return [
     `SELECT ${bucketExpr(bucket)} AS t, ${col} AS v, COUNT(*) AS c`,
-    from(spec.view),
+    from(spec.view, ctx.relation),
     `WHERE ${whereClause(spec, ctx, { extra: [`${col} != ''`] })}`,
     `GROUP BY t, v`,
     `ORDER BY t`,
@@ -624,7 +643,7 @@ export function fieldBreakdownQuery(spec: QuerySpec, ctx: BuildContext, field: s
   return [
     `SELECT t, v, COUNT(*) AS c`,
     `FROM (SELECT ${bucketExpr(bucket)} AS t, regexp_extract(${M}, ${lit(messageFieldRegex(field))}, 2) AS v`,
-    `  ${from(spec.view)}`,
+    `  ${from(spec.view, ctx.relation)}`,
     `  WHERE ${whereClause(spec, ctx)}) s`,
     `WHERE v != ''`,
     `GROUP BY t, v`,
@@ -643,7 +662,7 @@ export function patternsQuery(spec: QuerySpec, ctx: BuildContext, bucket: number
     `SELECT ${bucketExpr(bucket)} AS t,`,
     `  CASE\n    ${cases}\n    ELSE '' END AS p,`,
     `  COUNT(*) AS c`,
-    from(spec.view),
+    from(spec.view, ctx.relation),
     `WHERE ${whereClause(spec, ctx, { skipPatterns: true })}`,
     `GROUP BY t, p`,
     `ORDER BY t`,
@@ -654,10 +673,10 @@ export function patternsQuery(spec: QuerySpec, ctx: BuildContext, bucket: number
  * The newest line's time as text, in the last day (TopN with LIMIT 1). Run with two session zones to tell an
  * instant-like column from a wall-clock one (sql/timeZone.ts).
  */
-export function newestTimeTextQuery(view: string): string {
+export function newestTimeTextQuery(view: string, relation?: string): string {
   return [
     `SELECT CAST(${T} AS VARCHAR) AS t`,
-    from(view),
+    from(view, relation),
     `WHERE ${T} >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
     `ORDER BY ${T} DESC`,
     `LIMIT 1`,
@@ -670,16 +689,16 @@ export function sessionZoneQuery(): string {
 }
 
 /** Is there any line older than beforeMs? LIMIT 1: StarRocks stops at the first row it finds. */
-export function anyBeforeQuery(view: string, beforeMs: number): string {
-  return `SELECT 1 AS x ${from(view)} WHERE ${T} < FROM_UNIXTIME(${Math.floor(beforeMs / 1000)}) LIMIT 1`;
+export function anyBeforeQuery(view: string, beforeMs: number, relation?: string): string {
+  return `SELECT 1 AS x ${from(view, relation)} WHERE ${T} < FROM_UNIXTIME(${Math.floor(beforeMs / 1000)}) LIMIT 1`;
 }
 
 /** Oldest line in a short range (the hour found by the search in findOldest), as epoch ms. */
-export function oldestInRangeQuery(view: string, fromMs: number, toMs: number): string {
+export function oldestInRangeQuery(view: string, fromMs: number, toMs: number, relation?: string): string {
   const s = (ms: number) => Math.floor(ms / 1000);
   return [
     `SELECT ${timeMsExpr(`MIN(${T})`)} AS oldest`,
-    from(view),
+    from(view, relation),
     `WHERE ${T} >= FROM_UNIXTIME(${s(fromMs)}) AND ${T} < FROM_UNIXTIME(${s(toMs)})`,
   ].join('\n');
 }
````

### 28/34 `src/sql/columns.test.ts` (new file)

unit tests: column detection

PATCH-BLOCK 28/34 src/sql/columns.test.ts old=none new=ead7eed96cc16d053bf4479349af28b16a395a5a sha256=1618ed92075ddab0f9665d09dd3d40f39f7cd4b55351d04874a316ff54067420
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/sql/columns.test.ts b/plugins/kotak-starrocks-logs-app/src/sql/columns.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ead7eed96cc16d053bf4479349af28b16a395a5a
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/sql/columns.test.ts
@@ -0,0 +1,143 @@
+import { DEFAULT_FIELDS, DEFAULT_LABELS } from '../constants';
+import { COLUMN_CANDIDATES, podColumnOf, resolveViewColumns } from './columns';
+
+// the 21 columns of the UAT eks_app_logs views (dev/e2e/seed.py COLUMNS)
+const EKS = [
+  'app_env',
+  'app_id',
+  'eks_cluster_name',
+  'k8s_container_name',
+  'k8s_daemonset_name',
+  'k8s_deployment_name',
+  'k8s_namespace_name',
+  'k8s_node_name',
+  'k8s_pod_name',
+  'k8s_pod_start_time',
+  'k8s_pod_uid',
+  'k8s_service_name',
+  'k8s_statefulset_name',
+  'log_file_path',
+  'log_iostream',
+  'logtag',
+  'message',
+  'observed_timestamp',
+  'tenant_name',
+  'level',
+  'level_parser',
+];
+const GENAI = [
+  'event_time',
+  'body',
+  'severity_text',
+  'service_name',
+  'namespace',
+  'pod_name',
+  'tenant',
+  'trace_id',
+  'model',
+  'attributes',
+];
+const opts = { labels: DEFAULT_LABELS, fields: DEFAULT_FIELDS, serviceLabel: 'k8s_service_name', overrides: {} };
+
+describe('a view with the app column names (EKS app logs): read as it is', () => {
+  const v = resolveViewColumns('vw_eks_app_logs_app_1', EKS, { message: 'x' }, opts);
+
+  it('no derived table; the usual labels and fields; pipeline columns hidden', () => {
+    expect(v.relation).toBeUndefined();
+    expect(v.found).toMatchObject({ time: 'observed_timestamp', message: 'message', level: 'level' });
+    expect(v.labels).toEqual(DEFAULT_LABELS.filter((l) => EKS.includes(l)));
+    expect(v.fields).toEqual(DEFAULT_FIELDS);
+    expect([...v.labels, ...v.fields]).not.toContain('app_id');
+    expect([...v.labels, ...v.fields]).not.toContain('level_parser');
+    expect(v.details).toEqual([]);
+    expect(v.serviceLabel).toBe('k8s_service_name');
+    expect(v.podColumns).toEqual(['k8s_pod_uid', 'k8s_pod_name']);
+    expect(v.hasLevel).toBe(true);
+  });
+});
+
+describe('a view that names its columns differently (GenAI logs)', () => {
+  const sample = { attributes: '{"gen_ai.request.model":"gpt-4o"}', model: 'gpt-4o', body: 'routed request' };
+  const v = resolveViewColumns('vw_genai_logs_app_7001_agentrouter', GENAI, sample, opts);
+
+  it('a derived table renames time, message and level; the time column stays plain (partition pruning)', () => {
+    expect(v.found).toMatchObject({
+      time: 'event_time',
+      message: 'body',
+      level: 'severity_text',
+      service: 'service_name',
+      pod: 'pod_name',
+    });
+    expect(v.relation).toBe(
+      '(SELECT `event_time` AS `observed_timestamp`, CAST(`body` AS VARCHAR) AS `message`, ' +
+        'CAST(`severity_text` AS VARCHAR) AS `level`, `service_name`, `namespace`, `pod_name`, `tenant`, `trace_id`, ' +
+        '`model`, `attributes` FROM `vw_genai_logs_app_7001_agentrouter`) AS `vw_genai_logs_app_7001_agentrouter`'
+    );
+    expect(v.columns.slice(0, 3)).toEqual(['observed_timestamp', 'message', 'level']);
+  });
+
+  it('every other column is shown: the service column as the grid label, the rest as fields, JSON in details', () => {
+    expect(v.serviceLabel).toBe('service_name');
+    expect(v.labels).toEqual(['service_name']);
+    expect(v.fields).toEqual(['namespace', 'pod_name', 'tenant', 'trace_id', 'model']);
+    expect(v.details).toEqual(['attributes']);
+    expect(v.podColumns).toEqual(['pod_name']);
+  });
+
+  it('names are matched without case', () => {
+    const w = resolveViewColumns('v', ['Timestamp', 'Message', 'Level', 'Service_Name'], undefined, opts);
+    expect(w.found).toMatchObject({ time: 'Timestamp', message: 'Message', level: 'Level', service: 'Service_Name' });
+    expect(w.relation).toContain('`Timestamp` AS `observed_timestamp`');
+  });
+});
+
+describe('tenant column names and missing columns', () => {
+  it('the tenant names a column for a role (overrides the built-in names)', () => {
+    const v = resolveViewColumns('v', ['ts_utc', 'event_time', 'text', 'body', 'sev', 'level', 'agent'], undefined, {
+      ...opts,
+      overrides: { time: 'ts_utc', message: 'text', level: 'sev', service: 'agent' },
+    });
+    expect(v.found).toMatchObject({ time: 'ts_utc', message: 'text', level: 'sev', service: 'agent' });
+    expect(v.relation).toContain('`ts_utc` AS `observed_timestamp`');
+    expect(v.relation).toContain('CAST(`sev` AS VARCHAR) AS `level`');
+    // the view's own "level" column is left out (its name is taken), the others stay
+    expect(v.relation!.match(/`level`/g)).toHaveLength(1);
+    expect(v.columns).toEqual(expect.arrayContaining(['event_time', 'body', 'agent']));
+    expect(v.serviceLabel).toBe('agent');
+  });
+
+  it('no level column: the level is read from the message (hasLevel false); no service column: first label', () => {
+    const v = resolveViewColumns('v', ['timestamp', 'msg', 'k8s_namespace_name', 'host'], undefined, opts);
+    expect(v.hasLevel).toBe(false);
+    expect(v.columns).not.toContain('level');
+    expect(v.serviceLabel).toBe('k8s_namespace_name');
+    expect(v.podColumns).toEqual(['host']);
+  });
+
+  it('no time or no message column: an error that says how to name it', () => {
+    expect(() => resolveViewColumns('vw_x', ['body', 'svc'], undefined, opts)).toThrow(
+      /vw_x has no time column \(looked for observed_timestamp, timestamp, event_time.*tenants\.<app_id>\.columns\.time/
+    );
+    expect(() => resolveViewColumns('vw_x', ['event_time', 'svc'], undefined, opts)).toThrow(
+      /vw_x has no message column .*columns\.message/
+    );
+    expect(() =>
+      resolveViewColumns('vw_x', ['event_time', 'body'], undefined, { ...opts, overrides: { time: 'missing' } })
+    ).toThrow(/looked for missing/);
+  });
+
+  it('columns that are not plain names are ignored', () => {
+    const v = resolveViewColumns('v', ['observed_timestamp', 'message', 'bad name', 'a-b'], undefined, opts);
+    expect(v.columns).toEqual(['observed_timestamp', 'message']);
+  });
+});
+
+describe('the column that identifies a line source (Show context)', () => {
+  it('the view pod column first, then the usual ones, among those the line has', () => {
+    expect(podColumnOf({ k8s_pod_uid: 'u', k8s_pod_name: 'p' })).toBe('k8s_pod_uid');
+    expect(podColumnOf({ k8s_pod_name: 'p' })).toBe('k8s_pod_name');
+    expect(podColumnOf({ pod_name: 'p', hostname: 'h' }, ['hostname'])).toBe('hostname');
+    expect(podColumnOf({ service_name: 's' })).toBeUndefined();
+    expect(COLUMN_CANDIDATES.pod[0]).toBe('k8s_pod_uid');
+  });
+});
````

### 29/34 `src/sql/columns.ts` (new file)

finds the time, message, level, service and pod columns of a view; the renaming table; fields and details

PATCH-BLOCK 29/34 src/sql/columns.ts old=none new=b96f2cb929e1d907b27888b8af18e1653cd37898 sha256=fcde68714934f194348d9c004c5deb604d0b1d5efbf365c4febada052613047b
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/sql/columns.ts b/plugins/kotak-starrocks-logs-app/src/sql/columns.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b96f2cb929e1d907b27888b8af18e1653cd37898
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/sql/columns.ts
@@ -0,0 +1,153 @@
+import { ColumnRole, COLUMN_ROLES, isIdentifier } from '../config/config';
+import { LEVEL_COLUMN, MESSAGE_COLUMN, TIME_COLUMN } from '../constants';
+import { quoteIdent } from './builder';
+
+/**
+ * How a view's columns are used. The app's queries use their own names for the time, message and level
+ * (observed_timestamp, message, level); a view that names them differently (the GenAI views) is read through a
+ * derived table that renames them, so every query works on any view. Everything else in the view is shown: known
+ * labels and fields as before, other columns as fields (structured JSON columns only in the log details).
+ */
+
+/** Common names for each role, tried in order (case-insensitive) unless the tenant names the column. */
+export const COLUMN_CANDIDATES: Record<ColumnRole, string[]> = {
+  time: ['observed_timestamp', 'timestamp', 'event_time', 'log_time', 'time', 'ts', 'datetime', 'created_at'],
+  message: ['message', 'body', 'log', 'msg', 'log_message', 'line', 'content', 'text'],
+  level: ['level', 'severity_text', 'severity', 'log_level', 'loglevel', 'lvl', 'level_name'],
+  service: ['k8s_service_name', 'service_name', 'service', 'app_name', 'application', 'agent_name', 'k8s_app_name'],
+  pod: ['k8s_pod_uid', 'k8s_pod_name', 'pod_uid', 'pod_name', 'pod', 'instance_id', 'hostname', 'host_name', 'host'],
+};
+
+/** Columns never shown: internal to the pipeline (the view filters on app_id). */
+export const HIDDEN_COLUMNS = ['app_id', 'level_parser'];
+
+export interface ViewColumns {
+  /** FROM target when the view's names differ from the app's; undefined: the view itself */
+  relation?: string;
+  /** the columns the app's queries see (after renaming) */
+  columns: string[];
+  labels: string[];
+  fields: string[];
+  /** structured (JSON) columns: in the log details, never grouped by */
+  details: string[];
+  /** label of the value grid */
+  serviceLabel?: string;
+  /** columns that identify the source of a line (Show context, sampling), best first */
+  podColumns: string[];
+  hasLevel: boolean;
+  /** the view column that fills each role */
+  found: Partial<Record<ColumnRole, string>>;
+}
+
+export interface ColumnOptions {
+  /** known label and field names (config labels / fields) */
+  labels: string[];
+  fields: string[];
+  /** the configured grid label, used when the view has it */
+  serviceLabel: string;
+  /** the tenant's column names per role */
+  overrides: Partial<Record<ColumnRole, string>>;
+  hidden?: string[];
+}
+
+function looksStructured(v: unknown): boolean {
+  if (v !== null && typeof v === 'object') {
+    return true;
+  }
+  const s = typeof v === 'string' ? v.trim() : '';
+  return (s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'));
+}
+
+/**
+ * Works out the roles and the derived table of a view from its column names (and one sample row, to tell
+ * structured columns from plain ones). Throws when the view has no time or no message column.
+ */
+export function resolveViewColumns(
+  view: string,
+  names: string[],
+  sample: Record<string, unknown> | undefined,
+  opts: ColumnOptions
+): ViewColumns {
+  const cols = names.filter((n) => isIdentifier(n));
+  const byLower = new Map(cols.map((c) => [c.toLowerCase(), c]));
+  const find = (role: ColumnRole): string | undefined => {
+    const wanted = opts.overrides[role];
+    if (wanted) {
+      return byLower.get(wanted.toLowerCase());
+    }
+    return COLUMN_CANDIDATES[role].map((c) => byLower.get(c)).find((c) => c !== undefined);
+  };
+  const found: Partial<Record<ColumnRole, string>> = {};
+  for (const role of COLUMN_ROLES) {
+    const c = find(role);
+    if (c) {
+      found[role] = c;
+    }
+  }
+  const missing = (role: ColumnRole) =>
+    new Error(
+      `${view} has no ${role} column (looked for ${opts.overrides[role] ?? COLUMN_CANDIDATES[role].join(', ')}). ` +
+        `Name it in the app configuration: tenants.<app_id>.columns.${role}`
+    );
+  if (!found.time) {
+    throw missing('time');
+  }
+  if (!found.message) {
+    throw missing('message');
+  }
+  const time = found.time;
+  const message = found.message;
+  const level = found.level;
+  const rename = time !== TIME_COLUMN || message !== MESSAGE_COLUMN || (level !== undefined && level !== LEVEL_COLUMN);
+
+  // the other columns, as the queries see them (a column named like a role it does not fill is left out when
+  // renaming, so the names stay unique)
+  const reserved = new Set([TIME_COLUMN, MESSAGE_COLUMN, LEVEL_COLUMN]);
+  const roleCols = new Set([time, message, level].filter((c): c is string => c !== undefined));
+  const rest = cols.filter((c) => !roleCols.has(c) && !(rename && reserved.has(c)));
+  const columns = [TIME_COLUMN, MESSAGE_COLUMN, ...(level ? [LEVEL_COLUMN] : []), ...rest];
+
+  let relation: string | undefined;
+  if (rename) {
+    const select = [
+      `${quoteIdent(time)} AS ${quoteIdent(TIME_COLUMN)}`,
+      // CAST: a VARIANT or JSON message becomes its text
+      `CAST(${quoteIdent(message)} AS VARCHAR) AS ${quoteIdent(MESSAGE_COLUMN)}`,
+      ...(level ? [`CAST(${quoteIdent(level)} AS VARCHAR) AS ${quoteIdent(LEVEL_COLUMN)}`] : []),
+      ...rest.map((c) => quoteIdent(c)),
+    ];
+    relation = `(SELECT ${select.join(', ')} FROM ${quoteIdent(view)}) AS ${quoteIdent(view)}`;
+  }
+
+  const hidden = new Set(opts.hidden ?? HIDDEN_COLUMNS);
+  const visible = rest.filter((c) => !hidden.has(c));
+  const service = found.service ?? (visible.includes(opts.serviceLabel) ? opts.serviceLabel : undefined);
+  const structured = new Set(visible.filter((c) => sample !== undefined && looksStructured(sample[c])));
+  const knownLabels = opts.labels.filter((c) => visible.includes(c) && !structured.has(c));
+  const labels = service && !knownLabels.includes(service) ? [service, ...knownLabels] : knownLabels;
+  const knownFields = opts.fields.filter((c) => visible.includes(c) && !labels.includes(c) && !structured.has(c));
+  const extra = visible.filter((c) => !labels.includes(c) && !knownFields.includes(c) && !structured.has(c));
+  const fields = [...knownFields, ...extra];
+  const details = visible.filter((c) => structured.has(c));
+  const podColumns = [
+    ...(found.pod ? [found.pod] : []),
+    ...COLUMN_CANDIDATES.pod.map((c) => byLower.get(c)).filter((c): c is string => c !== undefined),
+  ].filter((c, i, a) => a.indexOf(c) === i && columns.includes(c));
+
+  return {
+    relation,
+    columns,
+    labels,
+    fields,
+    details,
+    serviceLabel: service ?? labels[0] ?? fields[0],
+    podColumns,
+    hasLevel: level !== undefined,
+    found,
+  };
+}
+
+/** The column that identifies a line's source (Show context: lines of the same one), among those the line has. */
+export function podColumnOf(labels: Record<string, string>, preferred: string[] = []): string | undefined {
+  return [...preferred, ...COLUMN_CANDIDATES.pod].find((c) => labels[c]);
+}
````

### 30/34 `src/state/timeWindow.test.ts` (new file)

unit tests: time window rules

PATCH-BLOCK 30/34 src/state/timeWindow.test.ts old=none new=dfef3a375120318d1bf6306d5b654d77e70ff7ba sha256=62195fb48b61a425c2deac958babbb24b802a38582719ab1e97fea2d4f60cca3
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/state/timeWindow.test.ts b/plugins/kotak-starrocks-logs-app/src/state/timeWindow.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..dfef3a375120318d1bf6306d5b654d77e70ff7ba
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/state/timeWindow.test.ts
@@ -0,0 +1,39 @@
+import { endForStart, latestEnd, shift, windowError, zoomOut } from './timeWindow';
+
+const H = 3_600_000;
+const NOW = Date.UTC(2026, 10, 26, 12, 0);
+
+describe('time window rules (at most 24 hours, never in the future)', () => {
+  it('a valid window has no error; each invalid one says why', () => {
+    expect(windowError(NOW - 6 * H, NOW, 24, NOW)).toBeUndefined();
+    expect(windowError(NOW - 24 * H, NOW, 24, NOW)).toBeUndefined();
+    expect(windowError(NOW - 25 * H, NOW, 24, NOW)).toBe('Pick at most 24 hours');
+    expect(windowError(NOW - 2 * H, NOW - 3 * H, 24, NOW)).toBe('The end must be after the start');
+    expect(windowError(NOW + H, NOW + 2 * H, 24, NOW)).toBe('The start must be in the past');
+    expect(windowError(Number.NaN, NOW, 24, NOW)).toBe('Pick a start and an end');
+    expect(windowError(NOW - 7 * H, NOW, 6, NOW)).toBe('Pick at most 6 hours');
+  });
+
+  it('the latest end for a start: 24 hours later, but not after now', () => {
+    expect(latestEnd(NOW - 48 * H, 24, NOW)).toBe(NOW - 24 * H);
+    expect(latestEnd(NOW - 2 * H, 24, NOW)).toBe(NOW);
+  });
+
+  it('moving the start keeps a valid end, else uses the latest allowed end', () => {
+    expect(endForStart(NOW - 30 * H, NOW - 20 * H, 24, NOW)).toBe(NOW - 20 * H);
+    expect(endForStart(NOW - 72 * H, NOW, 24, NOW)).toBe(NOW - 48 * H);
+    expect(endForStart(NOW - 5 * H, NOW - 6 * H, 24, NOW)).toBe(NOW);
+  });
+
+  it('zoom out doubles around the middle, stops at 24 hours and at now', () => {
+    expect(zoomOut(NOW - 4 * H, NOW - 2 * H, 24, NOW)).toEqual({ fromMs: NOW - 5 * H, toMs: NOW - H });
+    expect(zoomOut(NOW - 6 * H, NOW, 24, NOW)).toEqual({ fromMs: NOW - 12 * H, toMs: NOW });
+    expect(zoomOut(NOW - 20 * H, NOW, 24, NOW)).toEqual({ fromMs: NOW - 24 * H, toMs: NOW });
+  });
+
+  it('step back and forward by the length; forward stops at now', () => {
+    expect(shift(NOW - 2 * H, NOW, -1, NOW)).toEqual({ fromMs: NOW - 4 * H, toMs: NOW - 2 * H });
+    expect(shift(NOW - 4 * H, NOW - 2 * H, 1, NOW)).toEqual({ fromMs: NOW - 2 * H, toMs: NOW });
+    expect(shift(NOW - 3 * H, NOW - H, 1, NOW)).toEqual({ fromMs: NOW - 2 * H, toMs: NOW });
+  });
+});
````

### 31/34 `src/state/timeWindow.ts` (new file)

time window rules: at most maxRangeHours, never in the future, zoom and step

PATCH-BLOCK 31/34 src/state/timeWindow.ts old=none new=79060ee3dddde8ce9d48e5d1e4059f5c81fb4344 sha256=e378bd789a867d7a4b0124059957307fcba4dba4d5c1c9eaae30b6c4a4a88f7c
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/state/timeWindow.ts b/plugins/kotak-starrocks-logs-app/src/state/timeWindow.ts
new file mode 100644
index 0000000000000000000000000000000000000000..79060ee3dddde8ce9d48e5d1e4059f5c81fb4344
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/state/timeWindow.ts
@@ -0,0 +1,59 @@
+/**
+ * Rules of the app's time control (components/TimeWindowPicker.tsx): a time range is at most maxRangeHours
+ * long and never ends in the future. The control only offers ranges that follow them, so the range the user
+ * picks is the range that is queried.
+ */
+const HOUR_MS = 3_600_000;
+
+/** Why a start/end pair cannot be applied, or undefined when it can. */
+export function windowError(fromMs: number, toMs: number, maxHours: number, nowMs: number): string | undefined {
+  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
+    return 'Pick a start and an end';
+  }
+  if (toMs <= fromMs) {
+    return 'The end must be after the start';
+  }
+  if (fromMs >= nowMs) {
+    return 'The start must be in the past';
+  }
+  if (toMs - fromMs > maxHours * HOUR_MS) {
+    return `Pick at most ${maxHours} hours`;
+  }
+  return undefined;
+}
+
+/** Latest end allowed for a start: maxHours later, but not after now. */
+export function latestEnd(fromMs: number, maxHours: number, nowMs: number): number {
+  return Math.min(fromMs + maxHours * HOUR_MS, nowMs);
+}
+
+/** End after the start moved: kept if still allowed, else the latest allowed end (shown before applying). */
+export function endForStart(fromMs: number, toMs: number, maxHours: number, nowMs: number): number {
+  const latest = latestEnd(fromMs, maxHours, nowMs);
+  return toMs > fromMs && toMs <= latest ? toMs : latest;
+}
+
+/** Zoom out: twice as long around the same middle, at most maxHours, not past now. */
+export function zoomOut(
+  fromMs: number,
+  toMs: number,
+  maxHours: number,
+  nowMs: number
+): { fromMs: number; toMs: number } {
+  const length = Math.min((toMs - fromMs) * 2, maxHours * HOUR_MS);
+  const middle = (fromMs + toMs) / 2;
+  const to = Math.min(Math.round(middle + length / 2), nowMs);
+  return { fromMs: to - length, toMs: to };
+}
+
+/** Step back or forward by the range's length; forward stops at now. */
+export function shift(
+  fromMs: number,
+  toMs: number,
+  direction: -1 | 1,
+  nowMs: number
+): { fromMs: number; toMs: number } {
+  const length = toMs - fromMs;
+  const to = Math.min(toMs + direction * length, nowMs);
+  return { fromMs: to - length, toMs: to };
+}
````

### 32/34 `tests/e2e/drilldown.spec.ts` (modified)

browser tests (43), local test stack only; not run by the pipeline

PATCH-BLOCK 32/34 tests/e2e/drilldown.spec.ts old=ebe4e0cbb83a59151ee4dcd53833e5a2749b308a new=f0e76410099028e71de9bd4bbfe47cf41681acbc sha256=30b9049a4de1681ef8a9a5953e36c992dd92c91d8084410c878468bdb0d49603
````diff
diff --git a/plugins/kotak-starrocks-logs-app/tests/e2e/drilldown.spec.ts b/plugins/kotak-starrocks-logs-app/tests/e2e/drilldown.spec.ts
index ebe4e0cbb83a59151ee4dcd53833e5a2749b308a..f0e76410099028e71de9bd4bbfe47cf41681acbc 100644
--- a/plugins/kotak-starrocks-logs-app/tests/e2e/drilldown.spec.ts
+++ b/plugins/kotak-starrocks-logs-app/tests/e2e/drilldown.spec.ts
@@ -77,7 +77,7 @@ test.describe('as kmbl3e2e (two granted views)', () => {
     const filters = await labelFilters(page).boundingBox();
     const ds = await page.getByTestId('datasource-picker').boundingBox();
     const view = await page.getByTestId('view-picker').boundingBox();
-    const time = await page.getByTestId('data-testid TimePicker Open Button').boundingBox();
+    const time = await page.getByTestId('time-window-picker').boundingBox();
     expect(filters && ds && view && time).toBeTruthy();
     expect(filters!.x).toBeLessThan(ds!.x);
     expect(ds!.x).toBeLessThan(view!.x);
@@ -90,11 +90,12 @@ test.describe('as kmbl3e2e (two granted views)', () => {
     await expect(page.getByTestId('add-label')).toBeVisible();
     await page.screenshot({ path: `${SHOTS}/00-layout.png` });
 
-    await page.getByTestId('data-testid TimePicker Open Button').click();
-    await expect(page.getByText('Last 24 hours', { exact: true })).toBeVisible();
-    await expect(page.getByText('Last 5 minutes', { exact: true })).toBeVisible();
-    await expect(page.getByText('Last 2 days', { exact: true })).toHaveCount(0);
-    await expect(page.getByText('Last 7 days', { exact: true })).toHaveCount(0);
+    await page.getByTestId('time-window-picker').click();
+    const quick = page.getByTestId('time-window-quick');
+    await expect(quick.getByText('Last 24 hours', { exact: true })).toBeVisible();
+    await expect(quick.getByText('Last 5 minutes', { exact: true })).toBeVisible();
+    await expect(quick.getByText('Last 2 days', { exact: true })).toHaveCount(0);
+    await expect(quick.getByText('Last 7 days', { exact: true })).toHaveCount(0);
     await page.screenshot({ path: `${SHOTS}/00-quick-ranges.png` });
     await page.getByText('Last 3 hours', { exact: true }).click();
     await expect(page).toHaveURL(/from=now-3h/);
@@ -129,9 +130,11 @@ test.describe('as kmbl3e2e (two granted views)', () => {
     const dsPicker = page.getByLabel('Data source', { exact: true });
     await dsPicker.click();
     const options = page.getByRole('option');
-    await expect(options).toHaveCount(2);
+    // the two EKS databases, then the GenAI one (see the GenAI tests below)
+    await expect(options).toHaveCount(3);
     await expect(options.nth(0)).toContainText('app-logs-starrocks-db');
     await expect(options.nth(1)).toContainText('app-logs-starrocks-db2');
+    await expect(options.nth(2)).toContainText('genai-starrocks-db');
     await options.nth(1).click();
     await expect(page).toHaveURL(new RegExp(`ds=${DS2}`));
     // first view of the second database (sorted): payments
@@ -500,12 +503,11 @@ test.describe('as kmbl3e2e (two granted views)', () => {
   test('the time range is limited to 24 hours: typed ranges, links and zoom out', async ({ page }) => {
     await page.goto(appUrl({ view: OBS, from: 'now-7d', to: 'now' }));
     await expect(page.getByText('Time range limited to 24 hours')).toBeVisible();
-    await expect(page.getByTestId('data-testid TimePicker Open Button')).toContainText('Last 24 hours');
+    await expect(page.getByTestId('time-window-picker')).toContainText('Last 24 hours');
     await expect(page).toHaveURL(/from=now-24h/);
     await page.screenshot({ path: `${SHOTS}/13-range-limited.png` });
-    // zoom out from 24 hours stays at 24 hours
-    await page.getByRole('button', { name: /Zoom out time range/ }).click();
-    await expect(page.getByTestId('data-testid TimePicker Open Button')).toContainText('Last 24 hours');
+    // zoom out cannot go beyond 24 hours
+    await expect(page.getByRole('button', { name: /Zoom out time range/ })).toBeDisabled();
     // an absolute range of 3 days keeps its end and is cut to its last 24 hours
     const end = Date.now() - 3_600_000;
     await page.goto(appUrl({ view: OBS, from: String(end - 3 * 86_400_000), to: String(end) }));
@@ -710,7 +712,7 @@ test.describe('0.0.1: journey, loading, levels, context (laptop size)', () => {
     await page.goto(appUrl({ view: OBS, from: 'now-7d', to: 'now' }));
     const notice = page.getByTestId('range-capped');
     await expect(notice).toContainText('Time range limited to 24 hours');
-    const time = await page.getByTestId('data-testid TimePicker Open Button').boundingBox();
+    const time = await page.getByTestId('time-window-picker').boundingBox();
     const box = await notice.boundingBox();
     expect(box!.y).toBeGreaterThan(time!.y + time!.height - 1);
     await notice.getByLabel('Dismiss').click();
@@ -771,3 +773,97 @@ test('admins see the effective configuration', async ({ page }) => {
   await expect(page.getByTestId('app-config')).toContainText('Effective configuration');
   await expect(page.getByTestId('app-config')).toContainText('e2e-tempo-obs');
 });
+
+test.describe('GenAI views (vw_genai_logs_*): other column names, found by the app', () => {
+  const GENAI = 'e2e-ds-genai';
+  const ROUTER = 'vw_genai_logs_app_7001_agentrouter';
+
+  test.beforeEach(async ({ page }) => {
+    await login(page, 'kmbl3e2e');
+  });
+
+  test('the GenAI views are listed; a grid by service_name with levels; the oldest log', async ({ page }) => {
+    await page.goto(appUrl({ ds: GENAI }));
+    await page.getByLabel('View', { exact: true }).click();
+    await expect(page.getByRole('option')).toHaveText([ROUTER, 'vw_genai_logs_app_7002_voiceagent']);
+    await page.keyboard.press('Escape');
+    for (const svc of ['agent-router', 'llm-gateway', 'tool-executor']) {
+      await expect(page.getByTestId(`service-row-${svc}`)).toBeVisible();
+    }
+    // service_name is shown as "service"; severity_text is a level column, so levels show without asking
+    await expect(page.getByRole('tab', { name: 'service' })).toBeVisible();
+    await expect(page.getByTestId('grid-levels')).toHaveCount(0);
+    await expect(page.getByTestId('oldest-log')).toContainText(/Oldest log \d/);
+    await page.screenshot({ path: `${SHOTS}/40-genai-grid.png` });
+  });
+
+  test("Show logs: the body as the line, levels, the view's other columns in the log details", async ({ page }) => {
+    await page.goto(appUrl({ ds: GENAI }));
+    await page.getByTestId('show-logs-llm-gateway').click();
+    // the view writes JSON bodies with get_json_string: '{"event": "completion", ...}'
+    await expect(logsMain(page)).toContainText(/"event": ?"completion"/);
+    await logsMain(page)
+      .getByText(/"event": ?"completion"/)
+      .first()
+      .click();
+    // a JSON column of the view (attributes) and plain ones (model, pod_name) in the details
+    await expect(logsMain(page)).toContainText('gen_ai.request.model');
+    await expect(logsMain(page)).toContainText('pod_name');
+    await page.screenshot({ path: `${SHOTS}/41-genai-logs.png` });
+
+    await page.goto(appUrl({ ds: GENAI, view: ROUTER, page: 'details', level: 'error' }));
+    await expect(logsMain(page)).toContainText('status=500');
+    await expect(logsMain(page)).not.toContainText('status=200');
+  });
+});
+
+test.describe('time control: only ranges of at most 24 hours can be picked', () => {
+  test.beforeEach(async ({ page }) => {
+    await login(page, 'kmbl3e2e');
+  });
+
+  test('an absolute range longer than 24 hours cannot be applied; a shorter one is applied as picked', async ({
+    page,
+  }) => {
+    await page.goto(appUrl({ view: OBS }));
+    await page.getByTestId('time-window-picker').click();
+    const panel = page.getByTestId('time-window-panel');
+    const inputs = panel.getByTestId('data-testid date-time-input');
+    const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
+    const start = Math.floor((Date.now() - 48 * 3_600_000) / 60_000) * 60_000;
+    await inputs.nth(0).fill(fmt(start));
+    await inputs.nth(0).press('Tab');
+    // the end follows the start: at most 24 hours after it
+    await expect(inputs.nth(1)).toHaveValue(fmt(start + 24 * 3_600_000));
+    // the calendar of the end offers no day after that (today is disabled)
+    await panel.getByRole('button', { name: 'Time picker' }).nth(1).click();
+    const today = new Date().toLocaleDateString('en-US', {
+      month: 'long',
+      day: 'numeric',
+      year: 'numeric',
+      timeZone: 'UTC',
+    });
+    await expect(page.getByRole('button', { name: today })).toBeDisabled();
+    await page.keyboard.press('Escape');
+    // typed past 24 hours: refused
+    await inputs.nth(1).fill(fmt(start + 30 * 3_600_000));
+    await inputs.nth(1).press('Tab');
+    await expect(panel.getByTestId('time-window-error')).toHaveText('Pick at most 24 hours');
+    await expect(panel.getByTestId('time-window-apply')).toBeDisabled();
+    await page.screenshot({ path: `${SHOTS}/42-time-window-refused.png` });
+    // 10 hours: applied exactly, no notice
+    await inputs.nth(1).fill(fmt(start + 10 * 3_600_000));
+    await inputs.nth(1).press('Tab');
+    await panel.getByTestId('time-window-apply').click();
+    await expect(page.getByTestId('time-window-panel')).toHaveCount(0);
+    await expect
+      .poll(() => {
+        const u = new URL(page.url());
+        const from = Date.parse(u.searchParams.get('from') ?? '') || Number(u.searchParams.get('from'));
+        const to = Date.parse(u.searchParams.get('to') ?? '') || Number(u.searchParams.get('to'));
+        return [from, to];
+      })
+      .toEqual([start, start + 10 * 3_600_000]);
+    await expect(page.getByTestId('range-capped')).toHaveCount(0);
+  });
+});
````

### 33/34 `tests/smoke/genai.test.ts` (new file)

API tests on GenAI views with other column names (9), local test stack only

PATCH-BLOCK 33/34 tests/smoke/genai.test.ts old=none new=88b61d9c388f8b99f63fc84afd6b70de6d9de276 sha256=09be6c11460fd5abc01908c2b1a4de04d78b93587b9fb4be55470685419dcd5d
````diff
diff --git a/plugins/kotak-starrocks-logs-app/tests/smoke/genai.test.ts b/plugins/kotak-starrocks-logs-app/tests/smoke/genai.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..88b61d9c388f8b99f63fc84afd6b70de6d9de276
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/tests/smoke/genai.test.ts
@@ -0,0 +1,188 @@
+/**
+ * GenAI agent logs: views vw_genai_logs_<app_id>_<app_name> whose columns are named differently from the app log
+ * views (event_time, body, severity_text, service_name, pod_uid, ...). The app finds the roles itself
+ * (src/sql/columns.ts) and every query kind runs on the renaming derived table. Same stack as smoke.test.ts.
+ */
+import { resolveConfig, resolveTenant } from '../../src/config/config';
+import { DEFAULT_FIELDS, DEFAULT_LABELS } from '../../src/constants';
+import { findOldest } from '../../src/datasource/oldestSearch';
+import {
+  anyBeforeQuery,
+  BuildContext,
+  contextQuery,
+  fieldBreakdownQuery,
+  labelOverviewQuery,
+  labelValuesQuery,
+  logsQuery,
+  oldestInRangeQuery,
+  sampleRowQuery,
+  serviceSamplesQuery,
+  serviceVolumeQuery,
+  viewsQuery,
+  volumeQuery,
+} from '../../src/sql/builder';
+import { resolveViewColumns } from '../../src/sql/columns';
+import { emptySpec, QuerySpec } from '../../src/state/types';
+import { appHint, detectMode, DS_GENAI, Session, setDefaultHint } from './helpers';
+
+const ROUTER = 'vw_genai_logs_app_7001_agentrouter';
+const VOICE = 'vw_genai_logs_app_7002_voiceagent';
+const { config } = resolveConfig({ tenants: { default: { level: { source: 'column' } } } });
+const e2e = new Session('kmbl3e2e');
+const ctxs: Record<string, BuildContext> = {};
+
+async function contextFor(view: string): Promise<BuildContext> {
+  // like the app: the bounded sample fails on these views (no observed_timestamp), the plain LIMIT 1 gives the row
+  await expect(e2e.sql(sampleRowQuery(view, true), 'now-1h', 'now', DS_GENAI, { hint: '' })).rejects.toThrow();
+  const [row] = await e2e.sql(sampleRowQuery(view, false), 'now-1h', 'now', DS_GENAI, { hint: '' });
+  const tenant = resolveTenant(config, view, DS_GENAI.uid);
+  const v = resolveViewColumns(view, Object.keys(row), row, {
+    labels: DEFAULT_LABELS,
+    fields: DEFAULT_FIELDS,
+    serviceLabel: 'k8s_service_name',
+    overrides: tenant.columns,
+  });
+  return {
+    tenant,
+    columns: v.columns,
+    labels: v.labels,
+    fields: v.fields,
+    details: v.details,
+    relation: v.relation,
+    serviceLabel: v.serviceLabel,
+    podColumns: v.podColumns,
+  };
+}
+const spec = (view = ROUTER, p: Partial<QuerySpec> = {}): QuerySpec => ({ ...emptySpec(view, DS_GENAI.uid), ...p });
+const sql = (s: string, from = 'now-6h') => e2e.sql(s, from, 'now', DS_GENAI);
+const sum = (rows: Array<Record<string, unknown>>, key: string) => {
+  const m: Record<string, number> = {};
+  rows.forEach((r) => (m[String(r[key])] = (m[String(r[key])] ?? 0) + Number(r.c)));
+  return m;
+};
+
+beforeAll(async () => {
+  await e2e.login();
+  ctxs[ROUTER] = await contextFor(ROUTER);
+  ctxs[VOICE] = await contextFor(VOICE);
+  setDefaultHint(DS_GENAI, appHint(await detectMode(e2e, ROUTER, DS_GENAI, ctxs[ROUTER].relation)));
+});
+
+describe('GenAI views with their own column names', () => {
+  it('the views are listed with the vw_genai_logs_ prefix; the app_id is the rest of the name', async () => {
+    const rows = await e2e.sql(viewsQuery('vw_genai_logs_'), 'now-1h', 'now', DS_GENAI, { hint: '' });
+    expect(rows.map((r) => Object.values(r)[0])).toEqual([ROUTER, VOICE]);
+    expect(resolveTenant(config, ROUTER, DS_GENAI.uid).key).toBe('app_7001_agentrouter');
+  });
+
+  it('the roles are found: event_time, body, severity_text, service_name, pod_uid; JSON attributes in details', () => {
+    const c = ctxs[ROUTER];
+    expect(c.relation).toContain('`event_time` AS `observed_timestamp`');
+    expect(c.relation).toContain('CAST(`body` AS VARCHAR) AS `message`');
+    expect(c.relation).toContain('CAST(`severity_text` AS VARCHAR) AS `level`');
+    expect(c.serviceLabel).toBe('service_name');
+    expect(c.podColumns![0]).toBe('pod_uid');
+    expect(c.details).toEqual(['attributes']);
+    expect(c.fields).toEqual(expect.arrayContaining(['namespace', 'pod_name', 'tenant', 'trace_id', 'model']));
+    expect([...c.labels, ...c.fields]).not.toContain('app_id');
+  });
+
+  it('service grid by service_name, with and without levels', async () => {
+    const c = ctxs[ROUTER];
+    const plain = sum(await sql(serviceVolumeQuery(spec(), c, c.serviceLabel!, 3600, false)), 'v');
+    expect(Object.keys(plain).sort()).toEqual(['agent-router', 'llm-gateway', 'tool-executor']);
+    const [n] = await sql(`SELECT COUNT(*) AS c FROM ${ROUTER}`, 'now-24h');
+    expect(Object.values(plain).reduce((a, b) => a + b, 0)).toBe(Number(n.c));
+    const levels = sum(await sql(volumeQuery(spec(), c, 3600, true)), 'g');
+    expect(Object.keys(levels).sort()).toEqual(['debug', 'error', 'info', 'warn']);
+  });
+
+  it('newest lines: the body text (JSON bodies as text), levels, the other columns; times are the record instants', async () => {
+    const c = ctxs[ROUTER];
+    const rows = await sql(logsQuery(spec(), c, 200, 'desc'));
+    expect(rows).toHaveLength(200);
+    const gateway = rows.find((r) => r.service_name === 'llm-gateway')!;
+    expect(JSON.parse(String(gateway.message))).toMatchObject({ event: 'completion' });
+    const router = rows.find((r) => r.service_name === 'agent-router')!;
+    expect(String(router.message)).toMatch(/^routed request route=chat/);
+    expect(['error', 'warn', 'info', 'debug']).toContain(router.detected_level);
+    expect(router.model).toMatch(/gpt-4o|claude-sonnet|llama-3-70b/);
+    expect(JSON.parse(String(router.attributes))).toHaveProperty(['gen_ai.request.model']);
+    // __ms (computed in the session zone found by the probe on the derived table) is the record's instant
+    expect(Number(router.__ms)).toBe(Math.floor(Number(router.event_time_unix_nano) / 1_000_000));
+    const ms = rows.map((r) => Number(r.__ms));
+    expect([...ms].sort((a, b) => b - a)).toEqual(ms);
+  });
+
+  it('filters: a level, a line search, a column of the view', async () => {
+    const c = ctxs[ROUTER];
+    const errors = await sql(logsQuery(spec(ROUTER, { levels: ['error'] }), c, 50, 'desc'));
+    expect(errors.length).toBeGreaterThan(0);
+    errors.forEach((r) => expect(r.detected_level).toBe('error'));
+    const tools = await sql(
+      logsQuery(
+        spec(ROUTER, { lineFilters: [{ op: 'include', value: 'tool call', caseSensitive: false, regex: false }] }),
+        c,
+        50,
+        'desc'
+      )
+    );
+    expect(tools).toHaveLength(50);
+    tools.forEach((r) => expect(r.service_name).toBe('tool-executor'));
+    const gpt = await sql(
+      logsQuery(spec(ROUTER, { filters: [{ key: 'model', op: '=', value: 'gpt-4o' }] }), c, 20, 'desc')
+    );
+    gpt.forEach((r) => expect(r.model).toBe('gpt-4o'));
+  });
+
+  it('label values, overview of the view columns, a key=value field inside the body', async () => {
+    const c = ctxs[ROUTER];
+    const models = await sql(labelValuesQuery(spec(), c, 'model'));
+    expect(models.map((r) => r.v).sort()).toEqual(['claude-sonnet', 'gpt-4o', 'llama-3-70b']);
+    expect(
+      (await sql(labelOverviewQuery(spec(), c, ['service_name', 'namespace', 'model'], 3600))).length
+    ).toBeGreaterThan(0);
+    const status = await sql(
+      fieldBreakdownQuery(
+        spec(ROUTER, { filters: [{ key: 'service_name', op: '=', value: 'agent-router' }] }),
+        c,
+        'status',
+        3600
+      )
+    );
+    expect(new Set(status.map((r) => String(r.v)))).toEqual(new Set(['200', '500']));
+  });
+
+  it('grid samples, and the 10 % hash sample keyed by pod_uid', async () => {
+    const c = ctxs[ROUTER];
+    const samples = await sql(serviceSamplesQuery(spec(), c, 'service_name', ['agent-router', 'tool-executor'], 5));
+    expect(samples).toHaveLength(10);
+    const sampled = await sql(volumeQuery(spec(), c, 3600, true, 10));
+    expect(sampled.every((r) => Number(r.c) % 10 === 0)).toBe(true);
+  });
+
+  it('show context: lines of the same pod_uid around a line', async () => {
+    const c = ctxs[VOICE];
+    const [line] = await sql(logsQuery(spec(VOICE), c, 1, 'desc'));
+    const before = await sql(
+      contextQuery(VOICE, c, 'pod_uid', String(line.pod_uid), String(line.__ts), 'backward', 20, String(line.message))
+    );
+    expect(before.length).toBeGreaterThan(0);
+    before.forEach((r) => expect(r.pod_uid).toBe(line.pod_uid));
+  });
+
+  it('oldest line: LIMIT 1 probes on the derived table', async () => {
+    const c = ctxs[VOICE];
+    const now = Date.now();
+    const oldest = await findOldest(
+      now,
+      async (ms) => (await sql(anyBeforeQuery(VOICE, ms, c.relation))).length > 0,
+      async (a, b) => {
+        const [r] = await sql(oldestInRangeQuery(VOICE, a, b, c.relation));
+        return r?.oldest == null ? undefined : Number(r.oldest);
+      }
+    );
+    expect(now - oldest!).toBeGreaterThan(3 * 3_600_000);
+    expect(now - oldest!).toBeLessThan(5 * 3_600_000);
+  });
+});
````

### 34/34 `tests/smoke/helpers.ts` (modified)

API test helpers: the GenAI data source

PATCH-BLOCK 34/34 tests/smoke/helpers.ts old=d02f8fba88a892ff589b0b68fcf60b4ec6a091b0 new=79892e7443fadcbefb6a58ba77431dc84a523c84 sha256=204f7b982c339f77be84cb2fe2d15a4aa1890ff174d163ce056713cc7be53c99
````diff
diff --git a/plugins/kotak-starrocks-logs-app/tests/smoke/helpers.ts b/plugins/kotak-starrocks-logs-app/tests/smoke/helpers.ts
index d02f8fba88a892ff589b0b68fcf60b4ec6a091b0..79892e7443fadcbefb6a58ba77431dc84a523c84 100644
--- a/plugins/kotak-starrocks-logs-app/tests/smoke/helpers.ts
+++ b/plugins/kotak-starrocks-logs-app/tests/smoke/helpers.ts
@@ -9,6 +9,8 @@ export const GRAFANA = process.env.GRAFANA_URL ?? 'http://localhost:23000';
 export const DS = { uid: 'e2e-ds-starrocks-logs', type: 'kotak-starrocks-datasource' };
 // second StarRocks database = second instance of the data source plugin
 export const DS2 = { uid: 'e2e-ds-starrocks-logs2', type: 'kotak-starrocks-datasource' };
+// GenAI agent logs: views vw_genai_logs_<app_id>_<app_name> with their own column names
+export const DS_GENAI = { uid: 'e2e-ds-genai', type: 'kotak-starrocks-datasource' };
 
 const defaultHints = new Map<string, string>();
 
@@ -23,10 +25,10 @@ export function appHint(mode: TimeMode): string {
 }
 
 /** Same probe as src/datasource/timeZone.ts: newest line in two zones, plus the session's own offset. */
-export async function detectMode(s: Session, view: string, ds = DS): Promise<TimeMode> {
+export async function detectMode(s: Session, view: string, ds = DS, relation?: string): Promise<TimeMode> {
   const probe = async (zone: string) =>
     (
-      await s.sql(newestTimeTextQuery(view), 'now-1h', 'now', ds, {
+      await s.sql(newestTimeTextQuery(view, relation), 'now-1h', 'now', ds, {
         hint: queryHint({ timeZone: zone, timeoutSeconds: 30 }),
       })
     )[0]?.t as string | undefined;
````
