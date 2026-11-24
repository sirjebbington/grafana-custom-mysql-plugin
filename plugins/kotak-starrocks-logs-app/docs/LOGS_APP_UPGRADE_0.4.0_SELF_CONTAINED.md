# Logs Drilldown (StarRocks): upgrade 0.3.0 → 0.4.0 (self-contained, for the org PC)

## For the person giving this file to Claude

1. Copy this file as **raw text** (GitHub "Raw" view, or a text editor), not from a rendered preview. The
   patch lines must stay exactly as they are; chat messages and email bodies wrap long lines.
2. On the org PC, save it as for example `~/plugin-poc/LOGS_APP_UPGRADE_0.4.0.md`.
3. Start Claude Code in the org plugin repo and say:
   *"Read ~/plugin-poc/LOGS_APP_UPGRADE_0.4.0.md and follow the instructions for the agent in it."*

What 0.4.0 changes for users:
- **Correct times.** In UAT, 0.3.0 shows every line 5 h 30 min late (the StarRocks session is Asia/Kolkata and
  0.3.0 read times as UTC), and scrolling for more lines asks for the wrong lines. 0.4.0 lets StarRocks compute
  the times and detects, per view, which session zone the queries must use.
- **No more "This query scans log text over a long time range" on the Logs tab.** A text search over 12 or 24
  hours shows lines at once: it searches newest first, an hour at a time and then wider, and stops at the line
  limit. Lines appear while older hours are read, with a Stop button. Only the volume chart waits for "Load
  volume".
- **Time range limited to 24 hours**, however it is chosen.
- **"Oldest log"** at the top right (like "Oldest Record" in the Log Analytics UI), and a notice when the
  chosen range is before it.

---

# Instructions for the agent

You are upgrading **`kotak-starrocks-logs-app`** from **0.3.0** (already applied in this org from
`LOGS_APP_UPGRADE_0.3.0_SELF_CONTAINED.md`) to **0.4.0**. This PC cannot reach the GitHub repo, so this one
file carries everything: these instructions, an extractor script, and the patch as 40 per-file blocks.

The patch is `git diff ad77cf6 2c20c14 -- plugins/kotak-starrocks-logs-app`, without `docs/` and `README.md` (documentation only).
It was tested upstream against Grafana 12.0.1-security-01, the unchanged `kotak-starrocks-datasource` and
**StarRocks 4.1.6** (the UAT version) with the session in **Asia/Kolkata**, on native tables and on **real
Iceberg tables** (one `timestamptz`, one `timestamp`, both partitioned by `app_id` and
`hour(observed_timestamp)` like UAT): 98 unit, 31 API, 14 Iceberg API and 33 browser tests pass. The time
handling was also tested with the session in UTC and with views showing UTC or IST wall-clock times.

Work step by step. Stop at every **CHECKPOINT** and wait for the user to reply "continue".

**How to read this file:** the patch blocks are at the end, under "Patch blocks". Read up to that heading. Do
**not** read the patch blocks into your context and never retype them: the extractor writes them to disk byte
for byte. Open a single block only when you need it to resolve a conflict.

## What changes where (all inside `plugins/kotak-starrocks-logs-app/`)

| # | File | Change | What |
|---|---|---|---|
| 1 | `.gitignore` | modified | local test stack: ignore Python caches |
| 2 | `CHANGELOG.md` | modified | docs: 0.4.0 entry |
| 3 | `dev/e2e/docker-compose.yaml` | modified | local test stack: StarRocks 4.1.6 (the UAT version) by default |
| 4 | `dev/e2e/iceberg/docker-compose.iceberg.yaml` | new file | local test stack: S3 store, Iceberg REST catalog, writer |
| 5 | `dev/e2e/iceberg/s3.json` | new file | local test stack: test-only S3 key of the local store |
| 6 | `dev/e2e/iceberg/starrocks_sql.py` | new file | local test stack: external catalog, two views, test user |
| 7 | `dev/e2e/iceberg/write_iceberg.py` | new file | local test stack: writes an Iceberg timestamptz and a timestamp table |
| 8 | `dev/e2e/seed.py` | modified | local test stack: session Asia/Kolkata like UAT; VIEW_TIME modes |
| 9 | `package-lock.json` | modified | version 0.4.0 (the two root entries only; no dependency changes) |
| 10 | `package.json` | modified | version 0.4.0 |
| 11 | `scripts/e2e.sh` | modified | local test stack: `iceberg` and `iceberg-smoke` commands, StarRocks image |
| 12 | `src/components/App.tsx` | modified | time range limited to maxRangeHours (CappedTimeRange) |
| 13 | `src/components/AppConfig.tsx` | modified | configuration page: new keys in the help text and example |
| 14 | `src/components/CappedTimeRange.ts` | new file | cuts a longer time range to 24 hours, with a notice |
| 15 | `src/components/LogsExploration.tsx` | modified | "Oldest log"; notice for a range before it; Logs tab no longer blocked; quick ranges up to maxRangeHours |
| 16 | `src/components/LogsTabScene.tsx` | modified | search progress with Stop; "Load volume"; Explore link carries the hint |
| 17 | `src/config/config.test.ts` | modified | unit tests: new settings |
| 18 | `src/config/config.ts` | modified | settings `maxRangeHours`, `queryTimeoutSeconds`, `timeZone` |
| 19 | `src/constants.ts` | modified | comment on quick ranges |
| 20 | `src/datasource/StarRocksLogsDataSource.ts` | modified | newest-first windowed line search (lines stream in); time zone probe before the first query |
| 21 | `src/datasource/api.test.ts` | modified | unit tests: error messages |
| 22 | `src/datasource/api.ts` | modified | SET_VAR hint (time zone, query_timeout) on every statement; per-view session zone; clearer 5203 and timeout errors |
| 23 | `src/datasource/frames.test.ts` | modified | unit tests: line time from `__ms` |
| 24 | `src/datasource/frames.ts` | modified | line time from `__ms` (epoch ms from StarRocks); joining window results |
| 25 | `src/datasource/oldest.ts` | new file | oldest line of a view, cached per browser |
| 26 | `src/datasource/oldestSearch.test.ts` | new file | unit tests: oldest line search |
| 27 | `src/datasource/oldestSearch.ts` | new file | oldest line search with LIMIT 1 probes |
| 28 | `src/datasource/timeZone.ts` | new file | time zone probe per view, cached per browser |
| 29 | `src/datasource/windowedSearch.test.ts` | new file | unit tests: windowed search, streaming, stop, errors |
| 30 | `src/sql/builder.test.ts` | modified | unit tests: hint, `__ms`, windows, probe queries |
| 31 | `src/sql/builder.ts` | modified | line time as epoch ms in SQL (`__ms`), hint, search windows, probe queries |
| 32 | `src/sql/timeZone.test.ts` | new file | unit tests: time column kind |
| 33 | `src/sql/timeZone.ts` | new file | decides the time column kind (instant or wall clock, and its zone) |
| 34 | `src/state/storage.ts` | modified | browser caches for "Oldest log" and the time zone |
| 35 | `src/state/timeRange.test.ts` | new file | unit tests: 24-hour limit |
| 36 | `src/state/timeRange.ts` | new file | the 24-hour limit |
| 37 | `tests/e2e/drilldown.spec.ts` | modified | browser tests (33), local test stack only; not run by the pipeline |
| 38 | `tests/smoke/helpers.ts` | new file | API test helpers, local test stack only |
| 39 | `tests/smoke/iceberg.test.ts` | new file | API tests on real Iceberg tables (14), local test stack only |
| 40 | `tests/smoke/smoke.test.ts` | modified | API tests (31), local test stack only; not run by the pipeline |

**Not changed:** `plugins/kotak-starrocks-datasource/`, `pipelines/`, the repository root, the zip layout, npm
dependencies (the lock file only changes its version lines), `docs/`, `README.md`, and every 0.3.0 settings
key. Existing provisioning files keep working as they are.

## How 0.4.0 works (for questions from the user)

| Topic | Behaviour |
|---|---|
| Line times | Each line query returns `__ms` = `UNIX_TIMESTAMP(observed_timestamp) * 1000 + MILLISECONDS_DIFF(...)`, computed by StarRocks in the session zone, the same zone `$__timeFilter`'s `FROM_UNIXTIME` uses. 0.3.0 read the raw DATETIME, which the data source parses as UTC. |
| Session zone | Setting `timeZone` (default `"auto"`). Per view, once per browser per day, the app reads the newest line of the last day with `time_zone '+00:00'` and with `'+01:00'`. If the text differs by one hour, the column is an instant (Iceberg `timestamptz`): statements run with `time_zone '+00:00'`. If it is the same, the column is wall-clock time: statements run in UTC or in the data source's session zone, whichever fits the newest line. If that cannot be told (no recent lines), the session zone is kept. `"session"`, `"+00:00"` or `"Asia/Kolkata"` force a zone. |
| Hint | Every statement carries `/*+ SET_VAR(time_zone = '…', query_timeout = 120) */` after its first SELECT (StarRocks applies it to the whole statement). `queryTimeoutSeconds` sets the timeout (0 = cluster default). |
| Long text searches | Lines with a line search, message field, pattern or message level: the range is searched newest first in windows of 1, 2, 4, 8 hours (inner boundaries on whole hours, so each hourly partition is read once) and the search stops at the line limit. Each window's lines are shown at once. Above `maxScanHours` (6) the volume chart loads on "Load volume". Labels, Fields and Patterns still ask first ("Run anyway"). |
| Cancelling | A new selection, leaving the page or Stop cancels the HTTP request; Grafana cancels the data source call, the data source closes its connection, and StarRocks kills the query (`mysql_service_kill_after_disconnect`, on by default; verified on 4.1.6). |
| Time range | At most `maxRangeHours` (24): longer typed ranges, links and zoom out are cut to their last 24 hours, with a notice "Time range limited to 24 hours". |
| Oldest log | Found with "is there a line before X?" (`LIMIT 1`) probes, about 20 tiny queries, then `MIN()` over one hour; never a `MIN()` over the whole view. Cached per browser for 6 hours. |

**New optional settings:** `maxRangeHours` (default 24), `queryTimeoutSeconds` (default 120), `timeZone`
(default `"auto"`). None is needed.

## INPUTS (ask the user for any that are missing)

```
THIS_FILE            = <path where this .md file was saved>
ORG_PLUGIN_REPO      = <path of kotak-custom-grafana-plugins>   BASE_BRANCH = <branch that has app 0.3.0>
DEPLOY_CONFIG_REPO   = <path of obser-aws-deploy-config>        BASE_BRANCH = <branch with the 0.3.0 rollout>
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

1. Create `/tmp/logs-app-upgrade-040/` and save the Python block under **Extractor** (below) as
   `/tmp/logs-app-upgrade-040/extract_logs_patch.py`, exactly as shown. On Windows use a temp folder and
   `python` instead of `python3`.
2. Run `python3 /tmp/logs-app-upgrade-040/extract_logs_patch.py <THIS_FILE> /tmp/logs-app-upgrade-040/patches`.
3. Expect `40 of 40 blocks, 0 bad` and `matches` for the whole-patch sha256. The output is one file per block
   plus `logs-app-0.3.0-to-0.4.0.patch` (all blocks in order).
4. Any `BAD` block means the copy changed the text (wrapped lines, changed quotes, missing lines). Ask the user
   to copy the file again as raw text. Do not repair blocks by hand.

## Step 1: is the org at 0.3.0, and which files has it changed?

1. In `ORG_PLUGIN_REPO`, on `BASE_BRANCH`, check `plugins/kotak-starrocks-logs-app/package.json`: `"version": "0.3.0"`. If it says 0.1.0,
   stop: apply `LOGS_APP_UPGRADE_0.3.0_SELF_CONTAINED.md` first.
2. Run `python3 /tmp/logs-app-upgrade-040/extract_logs_patch.py <THIS_FILE> /tmp/logs-app-upgrade-040/patches <ORG_PLUGIN_REPO>`.
   Each line gives the file's state (`git hash-object` against the 0.3.0 and 0.4.0 blob ids in the blocks):

   | State | Meaning |
   |---|---|
   | `as 0.3.0` | applies cleanly |
   | `as 0.4.0` | already there |
   | `CHANGED by the org` | needs a 3-way merge |
   | `missing` | the file is not in the repo |
   | `absent (new file)` | expected for the 16 new files |

3. For each `CHANGED` or `missing` file, show `git log --oneline -- <file>` and summarise the org's change.
   (The 0.3.0 upgrade removed five screenshot links from `README.md`; README is not in this patch.)
4. If **every** file shows `CHANGED`, the cause is probably line endings: run
   `git ls-files --eol plugins/kotak-starrocks-logs-app | head`, report and wait.

**CHECKPOINT 1**: the user reviews the list.

## Step 2: apply the patch on a new branch

1. In `ORG_PLUGIN_REPO`, create `feature/starrocks-logs-0.4.0` from `BASE_BRANCH`, in a detached worktree.
2. Run `git apply --3way --check /tmp/logs-app-upgrade-040/patches/logs-app-0.3.0-to-0.4.0.patch`, then the
   same command without `--check`.
   - For each new file git may print "does not exist in index" or "cannot read the current contents of '…'",
     sometimes followed by "Falling back to direct application". That is expected: the files are created.
   - `CHANGED` files are merged 3-way; that needs the 0.3.0 blob in history (`git cat-file -e <old>`).
     Conflicts: keep the org-side intent and the 0.4.0 behaviour; show every resolution as a diff.
   - If a 0.3.0 blob is missing, apply that file's block alone with `git apply --3way <NN-….patch>`; if that
     fails, use `--reject` and resolve the `.rej` hunks, reading only that block.
3. Check: run the extractor again with the repo argument. Every file must show `as 0.4.0`, except files the org
   had changed.
4. `git status`: only files under `plugins/kotak-starrocks-logs-app/` have changed.

**CHECKPOINT 2**: the user reviews `git status`, the check output and any conflict resolutions.

## Step 3: build locally

1. Run `scripts/build-plugin.sh plugins/kotak-starrocks-logs-app`. Expect 98 unit tests passing and
   `PASS package/kotak-starrocks-logs-app-0.4.0.zip`.
2. No new npm dependencies (same mirror as before).
3. `tests/e2e`, `tests/smoke` and `dev/e2e/iceberg` need the local Docker test stack; they are not part of
   the pipeline. Don't run them here.

**CHECKPOINT 3**: report the results. Then the user runs the app pipeline. Publish 0.4.0 to the feed only after
approval. Commit ("kotak-starrocks-logs-app 0.4.0: correct times, newest-first text search, 24 h limit, oldest
log; applied from the self-contained upgrade file") and push only after approval.

## Step 4: deploy-config (UAT)

On a new branch from `BASE_BRANCH` of `DEPLOY_CONFIG_REPO`:

1. `pipelines/grafana-plugin-upload.yml`: add `kotak-starrocks-logs-app-0.4.0|0.4.0`; keep 0.3.0 for rollback.
   The user runs the upload for UAT.
2. `envs/uat-obs1-common/grafana-values.yml`, `s3-sync-init`: change the app's copy line from 0.3.0 to 0.4.0.
3. Provisioning file: **no change needed**. Leave `timeZone` unset ("auto"). Only if the user wants different
   limits: `maxRangeHours`, `queryTimeoutSeconds`.

**CHECKPOINT 4**: the user reviews the diff and runs `grafana-deploy.yml` for UAT.

## Step 5: verify in UAT (with the user)

| # | Check | Expected |
|---|---|---|
| 1 | Logs of a service whose lines carry their own time (e.g. `ts=…Z`, or a `[24/Nov/2026:10:45:42 +0000]` access log) | the time column equals the time in the line (in the browser's zone); not 5 h 30 min later |
| 2 | Same as the earlier screenshot: `k8s_service_name = grafana`, line contains "lock", Last 12 hours | lines appear; no "This query scans log text…" warning; above the lines a dashed box "The log volume … loads on request" with **Load volume** |
| 3 | While a long search runs | "Searching the log text, newest first: … of 12 h searched, N lines found" with **Stop**; Stop keeps the lines found |
| 4 | Scroll to the end of the logs | the next lines load, older than the last one shown, no repeats |
| 5 | Show context on a line | lines of the same pod before and after it, times consistent |
| 6 | Time picker: type `now-7d` to `now`; also press zoom out on Last 24 hours | "Time range limited to 24 hours"; range becomes Last 24 hours |
| 7 | Top right | "Oldest log" with a date; hover shows the full time |
| 8 | Absolute range ending before the oldest log | "No logs in this time range: … starts on …" and **Show the first 24 hours of logs** |
| 9 | Labels / Fields / Patterns with a text filter over 12 hours | they still ask first ("Run anyway") |
| 10 | Open in Explore | the SQL starts with `SELECT /*+ SET_VAR(` (time zone and query timeout) |
| 11 | A user without access to the database | "You have no access to any log view in this database…" |

If check 1 fails, open the browser console (F12) on the app: a line "time zone of <view> not detected (…)"
means the probe could not decide. Report it, then set `timeZone` in the provisioning file
(`"+00:00"` if the column is an Iceberg timestamptz, else the zone the times were written in) and re-check.

**CHECKPOINT 5**: write the results to `HANDOFF_FILE`.

## Step 6: prod and wrap up

Prod: after UAT sign-off, the same steps with prod values; prepare them, the user runs them. One PR per repo,
describing what changed and how it was verified. Open items: none expected; list any check that failed.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Extractor reports `BAD` blocks or fewer than 40 | the copy changed or cut the file | copy it again as raw text; never fix blocks by hand |
| `git apply --3way` prints "Applied patch to '…' with conflicts" | the org changed lines next to or on the patched ones | resolve the markers (ours = org, theirs = 0.4.0), show the diff, `git add` |
| Every file shows `CHANGED by the org` | line endings (CRLF) | `git ls-files --eol`; try `git apply --3way --ignore-whitespace` and report |
| Times still 5 h 30 min off | old zip still served, or `timeZone` set to `"session"` | check the `s3-sync-init` log for 0.4.0 and restart the pod; remove `timeZone` |
| Times off and the console says "not detected" | the view has no lines in the last day, or the newest line is old | set `timeZone` explicitly (see step 5) |
| "The query took longer than the time limit" | a single statement ran more than `queryTimeoutSeconds` | narrow the range or add label filters; or raise `queryTimeoutSeconds` |
| Error mentioning `SET_VAR` or `time_zone` | StarRocks older than 3.x, or hints disabled | report it; `timeZone: "session"` and `queryTimeoutSeconds: 0` turn the hint off |
| "Oldest log" missing | the probe failed (shown in the console) | nothing breaks; report the console line |

## Extractor

Save exactly as `/tmp/logs-app-upgrade-040/extract_logs_patch.py`:

```python
#!/usr/bin/env python3
"""Extracts and checks the patch blocks of the Logs Drilldown (StarRocks) 0.3.0 -> 0.4.0 upgrade file.

  python3 extract_logs_patch.py <md file> <out dir>             write the patches and check their sha256
  python3 extract_logs_patch.py <md file> <out dir> <org repo>  also compare the repo's files with 0.3.0/0.4.0
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
            state = {old: 'as 0.3.0', new: 'as 0.4.0'}.get(h, 'CHANGED by the org (neither 0.3.0 nor 0.4.0)')
        status += '  ' + state.ljust(46)
    print(status, path)
    name = '%02d-%s.patch' % (int(num), path.replace('/', '_'))
    with open(os.path.join(out, name), 'w', encoding='utf-8', newline='\n') as f:
        f.write(patch)
with open(os.path.join(out, 'logs-app-0.3.0-to-0.4.0.patch'), 'w', encoding='utf-8', newline='\n') as f:
    f.write(whole)
expected = int(blocks[0][1]) if blocks else -1
total = hashlib.sha256(whole.encode('utf-8')).hexdigest()
m = re.search(r'^WHOLE-PATCH sha256=(\w+)$', text, re.M)
print('%d of %d blocks, %d bad; whole patch sha256 %s (%s)' % (
    len(blocks), expected, bad, total, 'matches' if m and m.group(1) == total else 'DOES NOT MATCH'))
sys.exit(0 if blocks and len(blocks) == expected and bad == 0 and m and m.group(1) == total else 1)
```

WHOLE-PATCH sha256=3b02ec5dcfa235e5c7b9df8b753e13458a65c137fc6db17821a23594b8dcc65d

## Patch blocks

40 blocks in `git diff` order. Each has a heading, one `PATCH-BLOCK` line (number, path inside the app folder,
0.3.0 blob id, 0.4.0 blob id, sha256 of the block) and the diff. Paths in the diffs are relative to the
repository root (`plugins/kotak-starrocks-logs-app/…`).

### 1/40 `.gitignore` (modified)

local test stack: ignore Python caches

PATCH-BLOCK 1/40 .gitignore old=ee8dc07fba54bcfbe8ec53bc154468947f8d23a6 new=1b736f831b63a4b8cb8b420124340d5f23af9f73 sha256=f9baa3c53fb3a31c57ed657de41af23fe3d56a4d0ac5a550fb5118d373a26f5b
````diff
diff --git a/plugins/kotak-starrocks-logs-app/.gitignore b/plugins/kotak-starrocks-logs-app/.gitignore
index ee8dc07fba54bcfbe8ec53bc154468947f8d23a6..1b736f831b63a4b8cb8b420124340d5f23af9f73 100644
--- a/plugins/kotak-starrocks-logs-app/.gitignore
+++ b/plugins/kotak-starrocks-logs-app/.gitignore
@@ -12,3 +12,4 @@ artifacts/
 /playwright/.auth/
 dev/e2e/.state/
 .idea
+__pycache__/
````

### 2/40 `CHANGELOG.md` (modified)

docs: 0.4.0 entry

PATCH-BLOCK 2/40 CHANGELOG.md old=d031e66919d1bb6339fac8fca211e14347278ae9 new=c616980c3c90686dbdfdf320ecbafe4061240e5f sha256=bc59692c9fd5b295f05f712ca4f0670d8dccac344ddf4135374e9c56b1154aee
````diff
diff --git a/plugins/kotak-starrocks-logs-app/CHANGELOG.md b/plugins/kotak-starrocks-logs-app/CHANGELOG.md
index d031e66919d1bb6339fac8fca211e14347278ae9..c616980c3c90686dbdfdf320ecbafe4061240e5f 100644
--- a/plugins/kotak-starrocks-logs-app/CHANGELOG.md
+++ b/plugins/kotak-starrocks-logs-app/CHANGELOG.md
@@ -1,5 +1,31 @@
 # Changelog
 
+## 0.4.0
+
+- **Correct times on any StarRocks session zone.** Line times are computed by StarRocks
+  (`UNIX_TIMESTAMP`, epoch ms) instead of being read as UTC by the data source. With the UAT FE in
+  Asia/Kolkata, 0.3.0 showed every line 5 h 30 min late and "load more" asked for the wrong lines.
+- **Time zone detected per view** (`timeZone: "auto"`, the default): two tiny probes tell an Iceberg
+  `timestamptz` column (statements then run with `time_zone '+00:00'`) from a wall-clock `timestamp` column
+  (statements run in the zone of its wall clock: UTC or the session zone). Override with `timeZone`
+  (`"session"`, `"+00:00"`, `"Asia/Kolkata"`, …). Every statement carries a `SET_VAR` hint with the zone and
+  `query_timeout` (`queryTimeoutSeconds`, default 120).
+- **Text searches over long ranges are no longer blocked on the Logs tab**: the lines are searched newest
+  first in windows (1, 2, 4, 8 h, on hourly partition boundaries) and the search stops at the line limit.
+  Lines appear window by window, with progress and a Stop button. Above `maxScanHours` only the volume chart
+  waits for "Load volume"; Labels, Fields and Patterns still ask first.
+- **Time range limited to 24 hours** (`maxRangeHours`): typed ranges, links and zoom out are cut to their
+  last 24 hours, with a notice.
+- **Oldest log** at the top right: the time of the view's oldest line, found with LIMIT 1 probes (no scan of
+  the whole view) and cached per browser for 6 hours. A time range before it says so and offers the first
+  hours of logs.
+- Cancelling: a newer selection, leaving the page or Stop cancels the request; StarRocks stops the query
+  when the connection closes (verified on 4.1.6), and `query_timeout` is a backstop.
+- StarRocks 4.1 "no grant in this database" (5203 on DATABASE) is explained in plain words.
+- Local test stack: StarRocks 4.1.6 (the UAT version), session in Asia/Kolkata, `VIEW_TIME` modes, and real
+  Iceberg tables (`scripts/e2e.sh iceberg`, `iceberg-smoke`).
+- Settings: new optional `maxRangeHours`, `queryTimeoutSeconds`, `timeZone`; every 0.3.0 key works as before.
+
 ## 0.3.0
 
 - Name: **Logs Drilldown (StarRocks)** (plugin id unchanged).
````

### 3/40 `dev/e2e/docker-compose.yaml` (modified)

local test stack: StarRocks 4.1.6 (the UAT version) by default

PATCH-BLOCK 3/40 dev/e2e/docker-compose.yaml old=13f0fbe0868d39e70b4d0a4c90cb272d04d65057 new=1e3eb14d7e24509ef430385051cf5bce405d7f35 sha256=e7b93f88b3d889df7aae2644b75204ea8aa6e330888cf63e0832ea55be46d717
````diff
diff --git a/plugins/kotak-starrocks-logs-app/dev/e2e/docker-compose.yaml b/plugins/kotak-starrocks-logs-app/dev/e2e/docker-compose.yaml
index 13f0fbe0868d39e70b4d0a4c90cb272d04d65057..1e3eb14d7e24509ef430385051cf5bce405d7f35 100644
--- a/plugins/kotak-starrocks-logs-app/dev/e2e/docker-compose.yaml
+++ b/plugins/kotak-starrocks-logs-app/dev/e2e/docker-compose.yaml
@@ -1,12 +1,13 @@
 # Local end-to-end environment for kotak-starrocks-logs-app: Grafana 12.0.1-security-01 with the app and the
-# (unchanged) kotak-starrocks-datasource, a mock OIDC provider standing in for IDAM, and StarRocks 4.0.10 with
-# an eks_app_logs-shaped table, per-tenant views and native JWT users with per-view grants.
+# (unchanged) kotak-starrocks-datasource, a mock OIDC provider standing in for IDAM, and StarRocks (4.1.6, the
+# UAT version; STARROCKS_IMAGE overrides it) with an eks_app_logs-shaped table, per-tenant views and native JWT
+# users with per-view grants. docker-compose.iceberg.yaml adds a real Iceberg table (scripts/e2e.sh iceberg).
 # Driven by scripts/e2e.sh. Ports differ from the datasource repo's e2e stack so both can run.
 name: kotak-starrocks-logs-e2e
 
 services:
   starrocks:
-    image: starrocks/allin1-ubuntu:4.0.10
+    image: ${STARROCKS_IMAGE:-starrocks/allin1-ubuntu:4.1.6}
     ports:
       - "29030:9030"
 
````

### 4/40 `dev/e2e/iceberg/docker-compose.iceberg.yaml` (new file)

local test stack: S3 store, Iceberg REST catalog, writer

PATCH-BLOCK 4/40 dev/e2e/iceberg/docker-compose.iceberg.yaml old=none new=0665b2f147b042c1e4c50f955b6eb83980619350 sha256=96e9e905eab11e68577fb495c257c8645bde934962af5a291c79ee7dc0c98d6b
````diff
diff --git a/plugins/kotak-starrocks-logs-app/dev/e2e/iceberg/docker-compose.iceberg.yaml b/plugins/kotak-starrocks-logs-app/dev/e2e/iceberg/docker-compose.iceberg.yaml
new file mode 100644
index 0000000000000000000000000000000000000000..0665b2f147b042c1e4c50f955b6eb83980619350
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/dev/e2e/iceberg/docker-compose.iceberg.yaml
@@ -0,0 +1,38 @@
+# Real Iceberg tables for the e2e stack (scripts/e2e.sh iceberg): an S3 store (SeaweedFS), an Iceberg REST
+# catalog, and a PyIceberg writer. Used with docker-compose.yaml (same project and network); StarRocks reads
+# the tables through an external catalog, like the UAT Glue catalog. Relative paths are relative to
+# dev/e2e (the directory of the first compose file).
+services:
+  s3:
+    image: chrislusf/seaweedfs:3.85
+    command: server -s3 -s3.config=/etc/seaweedfs/s3.json -dir=/data -volume.max=0 -master.volumeSizeLimitMB=256
+    volumes:
+      - ./iceberg/s3.json:/etc/seaweedfs/s3.json:ro
+
+  iceberg-rest:
+    image: apache/iceberg-rest-fixture:1.9.1
+    depends_on:
+      - s3
+    environment:
+      AWS_ACCESS_KEY_ID: e2e
+      AWS_SECRET_ACCESS_KEY: e2e-secret
+      AWS_REGION: us-east-1
+      # a file, not the default in-memory SQLite (its connections are recycled and the tables vanish)
+      CATALOG_URI: jdbc:sqlite:/tmp/iceberg_catalog.db
+      CATALOG_WAREHOUSE: s3://warehouse/
+      CATALOG_IO__IMPL: org.apache.iceberg.aws.s3.S3FileIO
+      CATALOG_S3_ENDPOINT: http://s3:8333
+      CATALOG_S3_PATH__STYLE__ACCESS: "true"
+
+  iceberg-writer:
+    image: python:3.12-slim
+    profiles: ["tools"]
+    depends_on:
+      - iceberg-rest
+    working_dir: /work
+    volumes:
+      - .:/work:ro
+    environment:
+      PIP_DISABLE_PIP_VERSION_CHECK: "1"
+    command: >
+      sh -c "pip install -q 'pyiceberg[pyarrow]==0.9.1' && python /work/iceberg/write_iceberg.py"
````

### 5/40 `dev/e2e/iceberg/s3.json` (new file)

local test stack: test-only S3 key of the local store

PATCH-BLOCK 5/40 dev/e2e/iceberg/s3.json old=none new=423fadb523b9e3d56a7254f607ec9a9be90046f5 sha256=b4782c565c12797f0c152c36abbad8173a03f8f7ed9bc2af46ee9c518917630b
````diff
diff --git a/plugins/kotak-starrocks-logs-app/dev/e2e/iceberg/s3.json b/plugins/kotak-starrocks-logs-app/dev/e2e/iceberg/s3.json
new file mode 100644
index 0000000000000000000000000000000000000000..423fadb523b9e3d56a7254f607ec9a9be90046f5
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/dev/e2e/iceberg/s3.json
@@ -0,0 +1,9 @@
+{
+  "identities": [
+    {
+      "name": "e2e",
+      "credentials": [{ "accessKey": "e2e", "secretKey": "e2e-secret" }],
+      "actions": ["Admin", "Read", "Write", "List", "Tagging"]
+    }
+  ]
+}
````

### 6/40 `dev/e2e/iceberg/starrocks_sql.py` (new file)

local test stack: external catalog, two views, test user

PATCH-BLOCK 6/40 dev/e2e/iceberg/starrocks_sql.py old=none new=f7a27a547a9830e2b81d5050f44f2c668ed90ba4 sha256=c5979995ee6e23f8d598bf9e3b379994a53e5952bf353b91f29531cb159b0a23
````diff
diff --git a/plugins/kotak-starrocks-logs-app/dev/e2e/iceberg/starrocks_sql.py b/plugins/kotak-starrocks-logs-app/dev/e2e/iceberg/starrocks_sql.py
new file mode 100644
index 0000000000000000000000000000000000000000..f7a27a547a9830e2b81d5050f44f2c668ed90ba4
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/dev/e2e/iceberg/starrocks_sql.py
@@ -0,0 +1,34 @@
+#!/usr/bin/env python3
+"""Prints the StarRocks SQL for the Iceberg e2e: the external catalog, one view per Iceberg table in the first
+database (like UAT's views over the Glue table), and the user kmbl3iceberg granted those views only."""
+import os
+import sys
+
+sys.argv = [sys.argv[0], "4"]
+sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
+import seed  # noqa: E402
+
+print("""CREATE EXTERNAL CATALOG IF NOT EXISTS iceberg_e2e PROPERTIES (
+  "type" = "iceberg",
+  "iceberg.catalog.type" = "rest",
+  "iceberg.catalog.uri" = "http://iceberg-rest:8181",
+  "aws.s3.endpoint" = "http://s3:8333",
+  "aws.s3.enable_path_style_access" = "true",
+  "aws.s3.enable_ssl" = "false",
+  "aws.s3.access_key" = "e2e",
+  "aws.s3.secret_key" = "e2e-secret",
+  "aws.s3.region" = "us-east-1"
+);
+REFRESH EXTERNAL TABLE iceberg_e2e.logs.eks_app_logs;
+REFRESH EXTERNAL TABLE iceberg_e2e.logs.eks_app_logs_ntz;
+USE obs2_logs1_uat;
+DROP VIEW IF EXISTS vw_eks_app_logs_app_9100_icebergtz;
+CREATE VIEW vw_eks_app_logs_app_9100_icebergtz AS
+  SELECT * FROM iceberg_e2e.logs.eks_app_logs WHERE app_id = 'app_9100_icebergtz';
+DROP VIEW IF EXISTS vw_eks_app_logs_app_9200_icebergntz;
+CREATE VIEW vw_eks_app_logs_app_9200_icebergntz AS
+  SELECT * FROM iceberg_e2e.logs.eks_app_logs_ntz WHERE app_id = 'app_9200_icebergntz';
+DROP USER IF EXISTS 'kmbl3iceberg'@'%';""")
+print(f"CREATE USER 'kmbl3iceberg'@'%' IDENTIFIED WITH authentication_jwt AS {seed.q(seed.JWT)};")
+print("GRANT SELECT ON VIEW obs2_logs1_uat.vw_eks_app_logs_app_9100_icebergtz TO USER 'kmbl3iceberg'@'%';")
+print("GRANT SELECT ON VIEW obs2_logs1_uat.vw_eks_app_logs_app_9200_icebergntz TO USER 'kmbl3iceberg'@'%';")
````

### 7/40 `dev/e2e/iceberg/write_iceberg.py` (new file)

local test stack: writes an Iceberg timestamptz and a timestamp table

PATCH-BLOCK 7/40 dev/e2e/iceberg/write_iceberg.py old=none new=0500fe54e33f0018ab5f2dd9faf6722f2d894866 sha256=a1862575fc9810d81d42e7999db3f716b517d92fdc6a56639c8f51a508e36040
````diff
diff --git a/plugins/kotak-starrocks-logs-app/dev/e2e/iceberg/write_iceberg.py b/plugins/kotak-starrocks-logs-app/dev/e2e/iceberg/write_iceberg.py
new file mode 100644
index 0000000000000000000000000000000000000000..0500fe54e33f0018ab5f2dd9faf6722f2d894866
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/dev/e2e/iceberg/write_iceberg.py
@@ -0,0 +1,88 @@
+#!/usr/bin/env python3
+"""Writes two Iceberg tables shaped like UAT's eks_app_logs through the REST catalog (run by the
+iceberg-writer service). Both are partitioned by identity(app_id) and hour(observed_timestamp), like UAT.
+
+  logs.eks_app_logs      observed_timestamp is timestamptz (an instant; StarRocks shows it in the session zone)
+  logs.eks_app_logs_ntz  observed_timestamp is timestamp holding IST wall-clock time (a pipeline that wrote local
+                         time; StarRocks shows the stored text whatever the session zone)
+
+The rows are the e2e observability tenant from seed.py (messages carry their UTC time, e.g. ts=...Z).
+"""
+import datetime as dt
+import sys
+import time
+
+import pyarrow as pa
+import pyarrow.fs as pafs
+from pyiceberg.catalog import load_catalog
+from pyiceberg.partitioning import PartitionField, PartitionSpec
+from pyiceberg.schema import Schema
+from pyiceberg.transforms import HourTransform, IdentityTransform
+from pyiceberg.types import NestedField, StringType, TimestampType, TimestamptzType
+
+sys.argv = [sys.argv[0], "4"]
+sys.path.insert(0, "/work")
+import seed  # noqa: E402
+
+S3 = {"s3.endpoint": "http://s3:8333", "s3.access-key-id": "e2e", "s3.secret-access-key": "e2e-secret",
+      "s3.region": "us-east-1", "s3.path-style-access": "true"}
+TABLES = {
+    "eks_app_logs": ("app_9100_icebergtz", TimestamptzType()),
+    "eks_app_logs_ntz": ("app_9200_icebergntz", TimestampType()),
+}
+IST = dt.timedelta(hours=5, minutes=30)
+
+
+def main():
+    fs = pafs.S3FileSystem(endpoint_override="s3:8333", scheme="http", access_key="e2e", secret_key="e2e-secret",
+                           region="us-east-1")
+    try:
+        fs.create_dir("warehouse")
+    except OSError:
+        pass
+    for attempt in range(60):  # the REST catalog may still be starting
+        try:
+            cat = load_catalog("rest", **{"uri": "http://iceberg-rest:8181", **S3})
+            break
+        except Exception:  # noqa: BLE001
+            time.sleep(2)
+    else:
+        raise SystemExit("Iceberg REST catalog not reachable")
+    try:
+        cat.create_namespace("logs")
+    except Exception:  # noqa: BLE001 - already there
+        pass
+    spec_obs = seed.TENANTS_DB1["app_1961_observability"]
+    for name, (app_id, ts_type) in TABLES.items():
+        fields = [
+            NestedField(i + 1, c, ts_type if c == "observed_timestamp" else StringType(), required=False)
+            for i, c in enumerate(seed.COLUMNS)
+        ]
+        schema = Schema(*fields)
+        ts_id = seed.COLUMNS.index("observed_timestamp") + 1
+        app_field = seed.COLUMNS.index("app_id") + 1
+        spec = PartitionSpec(
+            PartitionField(source_id=app_field, field_id=1000, transform=IdentityTransform(), name="app_id"),
+            PartitionField(source_id=ts_id, field_id=1001, transform=HourTransform(), name="observed_timestamp_hour"),
+        )
+        ident = f"logs.{name}"
+        if cat.table_exists(ident):
+            cat.drop_table(ident)
+        table = cat.create_table(ident, schema=schema, partition_spec=spec)
+        rows = seed.rows_for(app_id, {**spec_obs, "rows": 20000})
+        cols = {c: [] for c in seed.COLUMNS}
+        for r in rows:
+            for c, v in zip(seed.COLUMNS, r):
+                cols[c].append(v)
+        utc = [dt.datetime.strptime(t, "%Y-%m-%d %H:%M:%S.%f") for t in cols["observed_timestamp"]]
+        if isinstance(ts_type, TimestamptzType):
+            ts = pa.array([t.replace(tzinfo=dt.timezone.utc) for t in utc], pa.timestamp("us", tz="UTC"))
+        else:
+            ts = pa.array([t + IST for t in utc], pa.timestamp("us"))
+        arrays = [ts if c == "observed_timestamp" else pa.array(cols[c], pa.string()) for c in seed.COLUMNS]
+        table.append(pa.Table.from_arrays(arrays, schema=schema.as_arrow()))
+        print(f"{ident}: {len(rows)} rows, {app_id}, {ts_type}")
+
+
+if __name__ == "__main__":
+    main()
````

### 8/40 `dev/e2e/seed.py` (modified)

local test stack: session Asia/Kolkata like UAT; VIEW_TIME modes

PATCH-BLOCK 8/40 dev/e2e/seed.py old=73bfb10752f412c56a42119301f4499b10dd7a0c new=9d4b284f87c1111bb0ccb99daf856b3b1ac4bca7 sha256=6b13e8f755c9b61478245bd34d905cebc4eef2475bf1b1480b664364718f60d9
````diff
diff --git a/plugins/kotak-starrocks-logs-app/dev/e2e/seed.py b/plugins/kotak-starrocks-logs-app/dev/e2e/seed.py
index 73bfb10752f412c56a42119301f4499b10dd7a0c..9d4b284f87c1111bb0ccb99daf856b3b1ac4bca7 100644
--- a/plugins/kotak-starrocks-logs-app/dev/e2e/seed.py
+++ b/plugins/kotak-starrocks-logs-app/dev/e2e/seed.py
@@ -7,8 +7,16 @@ granted SELECT on some views (stands in for Ranger).
   python3 dev/e2e/seed.py [hours] | mysql -h127.0.0.1 -P29030 -uroot
 
 Timestamps are relative to now (UTC, microseconds), so re-run it before testing on another day.
+
+Like UAT, the StarRocks session time zone is not UTC (FE_TIME_ZONE, default Asia/Kolkata). VIEW_TIME sets how
+the views show observed_timestamp (the table holds UTC):
+  session  (default) in the session time zone, the way StarRocks shows an Iceberg timestamptz column
+  ist      as IST wall-clock time whatever the session (a timestamp column written in local time)
+  utc      as UTC wall-clock time whatever the session (a timestamp column written in UTC)
+The app detects which one it is and picks the session zone of its statements (src/sql/timeZone.ts).
 """
 import datetime as dt
+import os
 import random
 import sys
 
@@ -217,8 +225,26 @@ def rows_for(app_id, spec):
     return out
 
 
+FE_TIME_ZONE = os.environ.get("FE_TIME_ZONE", "Asia/Kolkata")
+VIEW_TIME = os.environ.get("VIEW_TIME", "session")
+VIEW_TIME_EXPR = {
+    "session": "CONVERT_TZ(observed_timestamp, '+00:00', @@time_zone)",
+    "ist": "CONVERT_TZ(observed_timestamp, '+00:00', '+05:30')",
+    "utc": None,
+}
+
+
+def view_select():
+    """SELECT list of a tenant view, with observed_timestamp shown as VIEW_TIME says."""
+    expr = VIEW_TIME_EXPR[VIEW_TIME]
+    if expr is None:
+        return "*"
+    return ", ".join(f"{expr} AS observed_timestamp" if c == "observed_timestamp" else c for c in COLUMNS)
+
+
 def main():
     w = sys.stdout.write
+    w(f"SET GLOBAL time_zone = {q(FE_TIME_ZONE)};\n")
     cols = ",\n  ".join(
         f"{c} DATETIME" if c == "observed_timestamp" else (f"{c} VARCHAR(65533)" if c == "message" else f"{c} VARCHAR(512)")
         for c in COLUMNS
@@ -233,7 +259,7 @@ def main():
                 batch = rows[i:i + 2000]
                 w("INSERT INTO eks_app_logs VALUES\n" + ",\n".join("(" + ", ".join(q(v) for v in r) + ")" for r in batch) + ";\n")
             w(f"DROP VIEW IF EXISTS vw_eks_app_logs_{app_id};\n")
-            w(f"CREATE VIEW vw_eks_app_logs_{app_id} AS SELECT * FROM eks_app_logs WHERE app_id = {q(app_id)};\n")
+            w(f"CREATE VIEW vw_eks_app_logs_{app_id} AS SELECT {view_select()} FROM eks_app_logs WHERE app_id = {q(app_id)};\n")
     for user, views in GRANTS.items():
         w(f"DROP USER IF EXISTS '{user}'@'%';\n")
         w(f"CREATE USER '{user}'@'%' IDENTIFIED WITH authentication_jwt AS {q(JWT)};\n")
````

### 9/40 `package-lock.json` (modified)

version 0.4.0 (the two root entries only; no dependency changes)

PATCH-BLOCK 9/40 package-lock.json old=94194b83785de022008a50929b8f59704a392aa3 new=1d4bfebe38332ada40323d738fbab106e7a2add5 sha256=fa430598f03fd8c1fe1cf99aa79c4dbf163991677d6f828824ee9187054dfbb3
````diff
diff --git a/plugins/kotak-starrocks-logs-app/package-lock.json b/plugins/kotak-starrocks-logs-app/package-lock.json
index 94194b83785de022008a50929b8f59704a392aa3..1d4bfebe38332ada40323d738fbab106e7a2add5 100644
--- a/plugins/kotak-starrocks-logs-app/package-lock.json
+++ b/plugins/kotak-starrocks-logs-app/package-lock.json
@@ -1,12 +1,12 @@
 {
   "name": "kotak-starrocks-logs-app",
-  "version": "0.3.0",
+  "version": "0.4.0",
   "lockfileVersion": 3,
   "requires": true,
   "packages": {
     "": {
       "name": "kotak-starrocks-logs-app",
-      "version": "0.3.0",
+      "version": "0.4.0",
       "license": "AGPL-3.0-only",
       "dependencies": {
         "@emotion/css": "11.13.5",
````

### 10/40 `package.json` (modified)

version 0.4.0

PATCH-BLOCK 10/40 package.json old=3a5077d4a097a7cd3095dcabc200e52a94a27dfd new=a853dfeab37861034f600775af59fbe0d847fa6d sha256=9e2beda7e2c1e634ad4f82a19371760965e9becad5a52338067a58a6c0148e05
````diff
diff --git a/plugins/kotak-starrocks-logs-app/package.json b/plugins/kotak-starrocks-logs-app/package.json
index 3a5077d4a097a7cd3095dcabc200e52a94a27dfd..a853dfeab37861034f600775af59fbe0d847fa6d 100644
--- a/plugins/kotak-starrocks-logs-app/package.json
+++ b/plugins/kotak-starrocks-logs-app/package.json
@@ -1,6 +1,6 @@
 {
   "name": "kotak-starrocks-logs-app",
-  "version": "0.3.0",
+  "version": "0.4.0",
   "description": "Logs Drilldown for StarRocks log views. Queries run through kotak-starrocks-datasource as the signed-in user.",
   "private": true,
   "scripts": {
````

### 11/40 `scripts/e2e.sh` (modified)

local test stack: `iceberg` and `iceberg-smoke` commands, StarRocks image

PATCH-BLOCK 11/40 scripts/e2e.sh old=9c748c58b9d2d4d0cd3d41c144f5f5671d58b367 new=df03aca32b2f1eb221906416ec626ea6299975db sha256=5eaa6637a32e93e2a6c76293579b2d6f36bd925826ee2dbd92bbcce5f6be133e
````diff
diff --git a/plugins/kotak-starrocks-logs-app/scripts/e2e.sh b/plugins/kotak-starrocks-logs-app/scripts/e2e.sh
index 9c748c58b9d2d4d0cd3d41c144f5f5671d58b367..df03aca32b2f1eb221906416ec626ea6299975db 100755
--- a/plugins/kotak-starrocks-logs-app/scripts/e2e.sh
+++ b/plugins/kotak-starrocks-logs-app/scripts/e2e.sh
@@ -8,14 +8,20 @@
 #   ./scripts/e2e.sh tenants      # regenerate the app's provisioning file from dev/e2e/tenants/
 #   ./scripts/e2e.sh smoke        # API-level checks with curl (login, views per user, every query kind)
 #   ./scripts/e2e.sh test         # browser tests (Playwright)
+#   ./scripts/e2e.sh iceberg      # add real Iceberg tables (timestamptz and IST timestamp) + their views
+#   ./scripts/e2e.sh iceberg-smoke  # API checks on those Iceberg views
 #   ./scripts/e2e.sh down
 #
+# STARROCKS_IMAGE picks the StarRocks image (default 4.1.6, the UAT version). seed.py's FE_TIME_ZONE and
+# VIEW_TIME choose the session zone and how the views show the time column (default: like UAT).
+#
 # DATASOURCE_DIST points at the datasource plugin's built dist/ (default: ../kotak-starrocks-datasource/dist).
 # Grafana: http://localhost:23000 ("Sign in with IDAM", then any user name, e.g. kmbl3e2e). StarRocks: 127.0.0.1:29030.
 set -euo pipefail
 cd "$(dirname "$0")/.."
 
 COMPOSE=(docker compose -f dev/e2e/docker-compose.yaml)
+ICEBERG=(docker compose -f dev/e2e/docker-compose.yaml -f dev/e2e/iceberg/docker-compose.iceberg.yaml)
 GRAFANA=http://localhost:23000
 STATE=dev/e2e/.state
 mkdir -p "$STATE"
@@ -55,6 +61,14 @@ up() {
   echo "ready: $GRAFANA"
 }
 
+# Real Iceberg tables through a REST catalog on S3 (SeaweedFS), read by StarRocks through an external catalog.
+iceberg() {
+  "${ICEBERG[@]}" up -d s3 iceberg-rest
+  "${ICEBERG[@]}" run --rm iceberg-writer
+  python3 dev/e2e/iceberg/starrocks_sql.py | sr
+  sr -N -e "SELECT COUNT(*) FROM iceberg_e2e.logs.eks_app_logs; SELECT COUNT(*) FROM iceberg_e2e.logs.eks_app_logs_ntz"
+}
+
 # Signs in through the mock IDAM login form as $1 and stores the Grafana session cookie in $STATE/$1.cookies
 login() {
   local user="$1" jar="$STATE/$1.cookies" authorize form_action callback
@@ -72,6 +86,8 @@ case "${1:-}" in
   tenants) tenants ;;
   login) login "${2:?user}" ;;
   smoke) npx jest -c jest.smoke.config.js --runInBand ;;
+  iceberg) iceberg ;;
+  iceberg-smoke) ICEBERG=1 npx jest -c jest.smoke.config.js --runInBand tests/smoke/iceberg.test.ts ;;
   # Chromium needs system libraries the WSL host lacks, so the tests run in the matching Playwright image
   # (host network: the browser reaches Grafana on localhost:23000 and the mock IDAM on localhost:28080).
   test)
@@ -81,7 +97,7 @@ case "${1:-}" in
       docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD":/work -w /work \
         mcr.microsoft.com/playwright:v1.52.0-noble npx playwright test "${@:2}"
     fi ;;
-  down) "${COMPOSE[@]}" down -v; rm -rf "$STATE" ;;
+  down) "${ICEBERG[@]}" down -v; rm -rf "$STATE" ;;
   logs) "${COMPOSE[@]}" logs -f "${2:-grafana}" ;;
-  *) echo "usage: $0 up|seed|tenants|login <user>|smoke|test|down|logs" >&2; exit 2 ;;
+  *) echo "usage: $0 up|seed|tenants|login <user>|smoke|test|iceberg|iceberg-smoke|down|logs" >&2; exit 2 ;;
 esac
````

### 12/40 `src/components/App.tsx` (modified)

time range limited to maxRangeHours (CappedTimeRange)

PATCH-BLOCK 12/40 src/components/App.tsx old=b5fac39ddf5c1611c8cdb8c23c8f1c59e6747584 new=74fc0f238fa5963a2771924d409c2921814ca7d3 sha256=d4263b942d5cc4f5c148ee64c294b1d15e90e489df1e8b1835b6b5adc8e89ef7
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/App.tsx b/plugins/kotak-starrocks-logs-app/src/components/App.tsx
index b5fac39ddf5c1611c8cdb8c23c8f1c59e6747584..74fc0f238fa5963a2771924d409c2921814ca7d3 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/App.tsx
+++ b/plugins/kotak-starrocks-logs-app/src/components/App.tsx
@@ -8,7 +8,6 @@ import {
   SceneAppPage,
   SceneReactObject,
   RuntimeDataSource,
-  SceneTimeRange,
   registerRuntimeDataSource,
   useSceneApp,
 } from '@grafana/scenes';
@@ -16,11 +15,13 @@ import {
 import { APP_TITLE, EXPLORE_ROUTE, PLUGIN_BASE_URL } from '../constants';
 import { AppJsonData, getAppConfig, setAppConfig } from '../config/config';
 import { ensureRuntimeDataSource } from '../datasource/StarRocksLogsDataSource';
+import { CappedTimeRange } from './CappedTimeRange';
 import { LogsExploration } from './LogsExploration';
 
 function getExploreScene(): EmbeddedScene {
   return new EmbeddedScene({
-    $timeRange: new SceneTimeRange({ from: getAppConfig().defaultTimeRange, to: 'now' }),
+    // at most maxRangeHours (24 h by default), however the range is chosen
+    $timeRange: new CappedTimeRange({ from: getAppConfig().defaultTimeRange, to: 'now' }),
     body: new LogsExploration(),
   });
 }
````

### 13/40 `src/components/AppConfig.tsx` (modified)

configuration page: new keys in the help text and example

PATCH-BLOCK 13/40 src/components/AppConfig.tsx old=bea937c249662743ab8bd87eaf40232c3617dc97 new=052461776bcb35a374aa1ac03f443aab7e0a8ca5 sha256=a780cbb0d52871541be32346a3e9cc2c2f54ab00d2f9f96e5ab87fac9e81381f
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/AppConfig.tsx b/plugins/kotak-starrocks-logs-app/src/components/AppConfig.tsx
index bea937c249662743ab8bd87eaf40232c3617dc97..052461776bcb35a374aa1ac03f443aab7e0a8ca5 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/AppConfig.tsx
+++ b/plugins/kotak-starrocks-logs-app/src/components/AppConfig.tsx
@@ -13,6 +13,7 @@ const EXAMPLE: AppJsonData = {
   datasourceUid: 'app-logs-starrocks-db',
   datasources: ['app-logs-starrocks-db', { uid: 'app-logs-starrocks-db2', viewPrefix: 'vw_eks_app_logs_' }],
   viewPrefix: 'vw_eks_app_logs_',
+  maxRangeHours: 24,
   maxScanHours: 6,
   tenants: {
     default: { level: { source: 'column' } },
@@ -96,7 +97,7 @@ export function AppConfig({ plugin }: PluginConfigPageProps<AppPluginMeta<AppJso
       )}
       <Field
         label="jsonData"
-        description="Keys: datasourceUid, datasources, viewPrefix, serviceLabel, defaultTimeRange, maxScanHours, lineLimit, labels, fields, tenants (app_id or <datasourceUid>/<app_id>)"
+        description="Keys: datasourceUid, datasources, viewPrefix, serviceLabel, defaultTimeRange, maxRangeHours, maxScanHours, lineLimit, queryTimeoutSeconds, timeZone, labels, fields, tenants (app_id or <datasourceUid>/<app_id>)"
       >
         <TextArea rows={24} value={text} onChange={(e) => setText(e.currentTarget.value)} className={styles.mono} />
       </Field>
````

### 14/40 `src/components/CappedTimeRange.ts` (new file)

cuts a longer time range to 24 hours, with a notice

PATCH-BLOCK 14/40 src/components/CappedTimeRange.ts old=none new=4ded175d35f0ed2ab499345c398b867ca9706707 sha256=0dfe7593b9dcc4dc6f064e1e12912f7b16f681c55304e212afbca4ef45c322e7
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/CappedTimeRange.ts b/plugins/kotak-starrocks-logs-app/src/components/CappedTimeRange.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4ded175d35f0ed2ab499345c398b867ca9706707
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/components/CappedTimeRange.ts
@@ -0,0 +1,53 @@
+import { AppEvents, rangeUtil } from '@grafana/data';
+import { getAppEvents } from '@grafana/runtime';
+import { SceneTimeRange, SceneTimeRangeState } from '@grafana/scenes';
+
+import { getAppConfig } from '../config/config';
+import { capTimeRange } from '../state/timeRange';
+
+const HOUR_MS = 3_600_000;
+
+/**
+ * Time range of the app, limited to maxRangeHours (24 by default). Every way a range is set (picker, typed
+ * range, zoom out, URL, "Use the last N hours") goes through setState, so a longer range never reaches a
+ * query: it is cut to its last maxRangeHours and the user is told.
+ */
+export class CappedTimeRange extends SceneTimeRange {
+  public setState(update: Partial<SceneTimeRangeState>) {
+    if (update.from !== undefined || update.to !== undefined || update.value !== undefined) {
+      const next = { ...this.state, ...update };
+      const maxHours = getAppConfig().maxRangeHours;
+      const capped = capTimeRange(next.from, next.to, next.value, maxHours * HOUR_MS);
+      if (capped) {
+        update = {
+          ...update,
+          ...capped,
+          value: rangeUtil.convertRawToRange(capped, this.getTimeZone()),
+        };
+        notifyCapped(maxHours);
+      }
+    }
+    super.setState(update);
+  }
+}
+
+let lastNotice = 0;
+
+function notifyCapped(hours: number) {
+  // one notice per change (the URL sync can apply the same range twice)
+  if (Date.now() - lastNotice < 2000) {
+    return;
+  }
+  lastNotice = Date.now();
+  try {
+    getAppEvents().publish({
+      type: AppEvents.alertWarning.name,
+      payload: [
+        `Time range limited to ${hours} hours`,
+        `Logs Drilldown (StarRocks) searches at most ${hours} hours at a time. The range was cut to its last ${hours} hours.`,
+      ],
+    });
+  } catch {
+    // no app events (tests)
+  }
+}
````

### 15/40 `src/components/LogsExploration.tsx` (modified)

"Oldest log"; notice for a range before it; Logs tab no longer blocked; quick ranges up to maxRangeHours

PATCH-BLOCK 15/40 src/components/LogsExploration.tsx old=4fc116e0aeef7b10fda0350218100986b13eace3 new=418a72572543c91550f7f70dc85b299d122881e9 sha256=24c2ac161100eeae8b3cbc5500a1f2ce25e60d9876cda742c0ab3ed574a06f5c
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/LogsExploration.tsx b/plugins/kotak-starrocks-logs-app/src/components/LogsExploration.tsx
index 4fc116e0aeef7b10fda0350218100986b13eace3..418a72572543c91550f7f70dc85b299d122881e9 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/LogsExploration.tsx
+++ b/plugins/kotak-starrocks-logs-app/src/components/LogsExploration.tsx
@@ -1,7 +1,7 @@
 import { css } from '@emotion/css';
 import { useState } from 'react';
 
-import { GrafanaTheme2, rangeUtil } from '@grafana/data';
+import { GrafanaTheme2, dateTimeFormat, rangeUtil } from '@grafana/data';
 import {
   AdHocFiltersVariable,
   SceneComponentProps,
@@ -15,11 +15,12 @@ import {
   SceneTimePicker,
   sceneGraph,
 } from '@grafana/scenes';
-import { Alert, Button, IconButton, InlineField, Select, Tab, TabsBar, useStyles2 } from '@grafana/ui';
+import { Alert, Button, IconButton, InlineField, Select, Tab, TabsBar, Tooltip, useStyles2 } from '@grafana/ui';
 
 import { LEVELS, QUICK_RANGES, RUNTIME_DS } from '../constants';
 import { getAppConfig, getAppConfigErrors, viewPrefixFor } from '../config/config';
 import { fetchViews, listDatasources, runSqlOnce, StarRocksDatasource, stringColumn } from '../datasource/api';
+import { fetchOldestLog } from '../datasource/oldest';
 import { buildContext } from '../datasource/StarRocksLogsDataSource';
 import { BuildContext, labelValuesQuery, needsMessageScan } from '../sql/builder';
 import { getLastSelection, setLastSelection } from '../state/storage';
@@ -45,6 +46,7 @@ import {
 } from '../state/types';
 import { Display, displayLabel, ExplorationApi, isExplorationApi, Tab as TabName } from './api';
 import { BreakdownScene, MESSAGE_FIELD_PREFIX } from './BreakdownScene';
+import { quickRangeMs } from '../state/timeRange';
 import { DetailsHeader } from './FiltersBar';
 import { LogsTabScene } from './LogsTabScene';
 import { PatternsTabScene } from './PatternsTabScene';
@@ -86,6 +88,8 @@ export interface LogsExplorationState extends SceneObjectState {
   search: string;
   /** time range (raw from|to) for which the user accepted a long text scan */
   scanAllowedFor?: string;
+  /** oldest line of the selected view ("Oldest log"), looked up in the background */
+  oldest?: { key: string; ms?: number | null; loading?: boolean; error?: string };
   body?: SceneObject;
   controls: SceneObject[];
 }
@@ -164,7 +168,8 @@ function createLabelFiltersVariable(): AdHocFiltersVariable {
         labelValuesQuery(spec, ctx, filter.key, 200),
         sceneGraph.getTimeRange(ex).state.value,
         'values',
-        spec.datasource
+        spec.datasource,
+        { view: spec.view }
       );
       return { replace: true, values: stringColumn(frames[0], 'v').map((v) => ({ text: v, value: v })) };
     },
@@ -196,7 +201,14 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
       display: 'logs',
       wrap: false,
       search: '',
-      controls: [new SceneTimePicker({ quickRanges: QUICK_RANGES }), new SceneRefreshPicker({})],
+      controls: [
+        new SceneTimePicker({
+          quickRanges: QUICK_RANGES.filter(
+            (r) => (quickRangeMs(r.from) ?? 0) <= getAppConfig().maxRangeHours * 3_600_000
+          ),
+        }),
+        new SceneRefreshPicker({}),
+      ],
       ...state,
     });
     this.addActivationHandler(() => {
@@ -420,6 +432,7 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
       const ctx = await buildContext(view, sceneGraph.getTimeRange(this).state.value, this.state.datasource ?? '');
       if (req === this.ctxRequest) {
         this.setState({ ctx });
+        this.loadOldest(view);
       }
     } catch (e) {
       if (req === this.ctxRequest) {
@@ -431,6 +444,27 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
     }
   }
 
+  /** "Oldest log": the oldest line of the view (cached per browser for a few hours), in the background. */
+  private async loadOldest(view: string) {
+    const ds = this.state.datasource ?? '';
+    const key = `${ds}/${view}`;
+    if (this.state.oldest?.key === key && !this.state.oldest.error) {
+      return;
+    }
+    this.setState({ oldest: { key, loading: true } });
+    const current = () => `${this.state.datasource ?? ''}/${this.state.view ?? ''}` === key;
+    try {
+      const ms = await fetchOldestLog(view, ds);
+      if (current()) {
+        this.setState({ oldest: { key, ms: ms ?? null } });
+      }
+    } catch (e) {
+      if (current()) {
+        this.setState({ oldest: { key, error: e instanceof Error ? e.message : String(e) } });
+      }
+    }
+  }
+
   // ---- label filters ----
 
   getLabelFiltersVariable() {
@@ -804,9 +838,17 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
     const { display, sort, limit, wrap } = this.getDisplay();
     switch (s.tab) {
       case 'logs':
-        return blocked && textScan
-          ? this.guard(reason)
-          : new LogsTabScene({ spec, withLevel: !levelSkipped, display, sort, limit, wrap });
+        // no guard: the lines are searched newest first and stop at the line limit; only the volume chart
+        // (which reads every line) waits for the user
+        return new LogsTabScene({
+          spec,
+          withLevel: !levelSkipped,
+          volumeDeferred: blocked && textScan,
+          display,
+          sort,
+          limit,
+          wrap,
+        });
       case 'labels':
       case 'fields': {
         const messageBreakdown = s.breakdown?.startsWith(MESSAGE_FIELD_PREFIX) ?? false;
@@ -877,6 +919,7 @@ function LogsExplorationRenderer({ model }: SceneComponentProps<LogsExploration>
           </div>
         </div>
         <div className={styles.right}>
+          <OldestLog model={model} />
           <InlineField label="Data source">
             <Select
               width={22}
@@ -937,11 +980,68 @@ function LogsExplorationRenderer({ model }: SceneComponentProps<LogsExploration>
       ) : (
         view && ctx && <LabelTabs model={model} />
       )}
+      <BeforeOldestNotice model={model} />
       <div className={styles.body}>{body && <body.Component model={body} />}</div>
     </div>
   );
 }
 
+/**
+ * "Oldest log": the time of the view's oldest line, so users know how far back they can look (like the
+ * "Oldest Record" of the internal Log Analytics UI).
+ */
+function OldestLog({ model }: { model: LogsExploration }) {
+  const styles = useStyles2(getStyles);
+  const { oldest, view } = model.useState();
+  const timeZone = sceneGraph.getTimeRange(model).getTimeZone();
+  if (!oldest || !view || oldest.error) {
+    return null;
+  }
+  const text = oldest.loading
+    ? '…'
+    : oldest.ms === null || oldest.ms === undefined
+      ? 'no lines'
+      : dateTimeFormat(oldest.ms, { format: 'D MMM YYYY HH:mm', timeZone });
+  const tip =
+    oldest.ms !== null && oldest.ms !== undefined
+      ? `Oldest line in ${view}: ${dateTimeFormat(oldest.ms, { format: 'YYYY-MM-DD HH:mm:ss', timeZone })}`
+      : `Looking up the oldest line in ${view}`;
+  return (
+    <Tooltip content={tip}>
+      <div className={styles.oldest} data-testid="oldest-log">
+        <span className={styles.oldestLabel}>Oldest log</span>
+        <span>{text}</span>
+      </div>
+    </Tooltip>
+  );
+}
+
+/** Shown when the whole time range is before the view's oldest line: nothing to find there. */
+function BeforeOldestNotice({ model }: { model: LogsExploration }) {
+  const { oldest, view } = model.useState();
+  const timeRange = sceneGraph.getTimeRange(model);
+  const { value } = timeRange.useState();
+  const ms = oldest?.ms;
+  if (ms === null || ms === undefined || value.to.valueOf() >= ms) {
+    return null;
+  }
+  const hours = getAppConfig().maxRangeHours;
+  const when = dateTimeFormat(ms, { format: 'D MMM YYYY HH:mm', timeZone: timeRange.getTimeZone() });
+  const showFirst = () => {
+    const to = Math.min(ms + hours * 3_600_000, Date.now());
+    timeRange.onTimeRangeChange(
+      rangeUtil.convertRawToRange({ from: new Date(ms).toISOString(), to: new Date(to).toISOString() })
+    );
+  };
+  return (
+    <Alert severity="info" title={`No logs in this time range: ${view} starts on ${when}`} data-testid="before-oldest">
+      <Button size="sm" variant="secondary" onClick={showFirst}>
+        Show the first {hours} hours of logs
+      </Button>
+    </Alert>
+  );
+}
+
 /** "service" tab, tabs added with "Add label" (closable), like Logs Drilldown. */
 function LabelTabs({ model }: { model: LogsExploration }) {
   const styles = useStyles2(getStyles);
@@ -1048,5 +1148,13 @@ const getStyles = (theme: GrafanaTheme2) => ({
     marginLeft: 'auto',
   }),
   addLabel: css({ marginLeft: theme.spacing(1), alignSelf: 'center' }),
+  oldest: css({
+    display: 'flex',
+    flexDirection: 'column',
+    lineHeight: 1.2,
+    fontSize: theme.typography.bodySmall.fontSize,
+    whiteSpace: 'nowrap',
+  }),
+  oldestLabel: css({ color: theme.colors.text.secondary }),
   body: css({ paddingTop: theme.spacing(1), minWidth: 0 }),
 });
````

### 16/40 `src/components/LogsTabScene.tsx` (modified)

search progress with Stop; "Load volume"; Explore link carries the hint

PATCH-BLOCK 16/40 src/components/LogsTabScene.tsx old=ad73925eed2ac8e2dd5103c9d5ca427b3aaefe69 new=56b3ea1e124982dbb35a71e9a9ff33e11b02c634 sha256=84774b5eeda11fab0f2f19056d6b466da61c6bef3aa38c8181a5fe795c414b95
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/LogsTabScene.tsx b/plugins/kotak-starrocks-logs-app/src/components/LogsTabScene.tsx
index ad73925eed2ac8e2dd5103c9d5ca427b3aaefe69..56b3ea1e124982dbb35a71e9a9ff33e11b02c634 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/LogsTabScene.tsx
+++ b/plugins/kotak-starrocks-logs-app/src/components/LogsTabScene.tsx
@@ -8,6 +8,7 @@ import {
   SceneObject,
   SceneObjectBase,
   SceneObjectState,
+  SceneQueryRunner,
   VizPanel,
   sceneGraph,
 } from '@grafana/scenes';
@@ -15,16 +16,20 @@ import {
   Alert,
   Button,
   ClipboardButton,
+  Icon,
   InlineSwitch,
   JSONFormatter,
   LinkButton,
   RadioButtonGroup,
   Select,
+  Spinner,
   useStyles2,
 } from '@grafana/ui';
 
 import { getAppConfig } from '../config/config';
-import { buildSql } from '../datasource/StarRocksLogsDataSource';
+import { appQueryHint } from '../datasource/api';
+import { buildSql, searchProgressOf } from '../datasource/StarRocksLogsDataSource';
+import { withQueryHint } from '../sql/builder';
 import { extractMessageFields } from '../patterns/messageFields';
 import { QuerySpec } from '../state/types';
 import { Display, getExploration } from './api';
@@ -34,6 +39,11 @@ import { ErrorBox, Loading } from './ui';
 export interface LogsTabState extends SceneObjectState {
   spec: QuerySpec;
   withLevel: boolean;
+  /**
+   * text search over more than maxScanHours: the volume chart (which has to read every line in the range) is
+   * loaded on request; the lines are searched newest first and stop at the line limit
+   */
+  volumeDeferred?: boolean;
   display: Display;
   sort: 'desc' | 'asc';
   limit: number;
@@ -45,6 +55,8 @@ export interface LogsTabState extends SceneObjectState {
 /** Logs tab: volume histogram by level and the lines as Logs, Table or JSON. */
 export class LogsTabScene extends SceneObjectBase<LogsTabState> {
   static Component = LogsTabRenderer;
+  /** query of the lines (owned by the panel); its progress is shown above the lines */
+  private linesRunner?: SceneQueryRunner;
 
   constructor(state: LogsTabState) {
     super(state);
@@ -56,25 +68,31 @@ export class LogsTabScene extends SceneObjectBase<LogsTabState> {
   }
 
   private build() {
-    const { spec, withLevel, display, sort, limit, wrap } = this.state;
+    const { spec, withLevel, display, sort, limit, wrap, volumeDeferred } = this.state;
     const api = getExploration(this);
-    const volume = barsPanel('Log volume', queryRunner('volume', spec, { withLevel }));
+    const volume = volumeDeferred ? undefined : barsPanel('Log volume', queryRunner('volume', spec, { withLevel }));
     let main: SceneObject;
+    const lines = queryRunner(display === 'table' ? 'table' : 'logs', spec, { limit, sort });
     if (display === 'table') {
-      main = tablePanel(queryRunner('table', spec, { limit, sort }));
+      main = tablePanel(lines);
     } else if (display === 'json') {
-      main = new JsonLogsScene({ $data: queryRunner('logs', spec, { limit, sort }) });
+      main = new JsonLogsScene({ $data: lines });
     } else {
-      main = logsPanel(api, queryRunner('logs', spec, { limit, sort }), {
+      main = logsPanel(api, lines, {
         sort,
         wrap,
         // the line limit is the page size: scrolling to the end loads the next page
         title: 'Logs',
       });
     }
+    this.linesRunner = lines;
     this.setState({ volume, main });
   }
 
+  getLinesRunner(): SceneQueryRunner | undefined {
+    return this.linesRunner;
+  }
+
   exploreUrl(): string | undefined {
     const api = getExploration(this);
     const ctx = api.getContext();
@@ -82,10 +100,19 @@ export class LogsTabScene extends SceneObjectBase<LogsTabState> {
       return undefined;
     }
     const tr = sceneGraph.getTimeRange(this).state;
-    const sql = buildSql(
-      { refId: 'A', kind: 'table', spec: this.state.spec, params: { limit: this.state.limit, sort: this.state.sort } },
-      ctx,
-      tr.value
+    // with the app's hint (session zone of this view, query timeout); Explore shows __ms as the line time
+    const sql = withQueryHint(
+      buildSql(
+        {
+          refId: 'A',
+          kind: 'table',
+          spec: this.state.spec,
+          params: { limit: this.state.limit, sort: this.state.sort },
+        },
+        ctx,
+        tr.value
+      ),
+      appQueryHint({ datasource: this.state.spec.datasource, view: this.state.spec.view })
     );
     const config = getAppConfig();
     // the data source selected in the app (each one is a different StarRocks database)
@@ -115,12 +142,86 @@ const SORTS: Array<{ label: string; value: 'desc' | 'asc' }> = [
   { label: 'Oldest first', value: 'asc' },
 ];
 
+function formatSpan(ms: number): string {
+  const minutes = Math.round(ms / 60_000);
+  const h = Math.floor(minutes / 60);
+  const m = minutes % 60;
+  if (h === 0) {
+    return `${m} min`;
+  }
+  return m === 0 ? `${h} h` : `${h} h ${m} min`;
+}
+
+/** Progress of a windowed text search (newest first), with a Stop button while it runs. */
+function SearchStatus({ runner, sort }: { runner: SceneQueryRunner; sort: 'desc' | 'asc' }) {
+  const styles = useStyles2(getStyles);
+  const { data } = runner.useState();
+  const p = searchProgressOf(data?.series[0]);
+  if (!p || !data) {
+    return null;
+  }
+  const running = data.state === LoadingState.Loading || data.state === LoadingState.Streaming;
+  const total = formatSpan(p.rangeToMs - p.rangeFromMs);
+  const searched = formatSpan(p.searchedToMs - p.searchedFromMs);
+  const order = sort === 'desc' ? 'newest' : 'oldest';
+  if (running) {
+    return (
+      <div className={styles.status} data-testid="search-status">
+        <Spinner inline />
+        <span>
+          Searching the log text, {order} first: {searched} of {total} searched, {p.lines} lines found.
+        </span>
+        <Button size="sm" fill="text" icon="square-shape" onClick={() => runner.cancelQuery()}>
+          Stop
+        </Button>
+      </div>
+    );
+  }
+  if (!p.done) {
+    return (
+      <div className={styles.status} data-testid="search-status">
+        Search stopped: {searched} of {total} searched, {p.lines} lines found.
+      </div>
+    );
+  }
+  if (p.lines >= p.limit && p.searchedToMs - p.searchedFromMs < p.rangeToMs - p.rangeFromMs) {
+    return (
+      <div className={styles.status} data-testid="search-status">
+        The {order} {p.lines} matching lines were found in the {order === 'newest' ? 'last' : 'first'} {searched} of the{' '}
+        {total}; scroll to the end of the list to load more.
+      </div>
+    );
+  }
+  return null;
+}
+
+/** Placeholder for the volume chart of a long text search, loaded on request. */
+function DeferredVolume({ model }: { model: LogsTabScene }) {
+  const styles = useStyles2(getStyles);
+  const api = getExploration(model);
+  const range = sceneGraph.getTimeRange(model).useState().value;
+  const hours = Math.round(((range.to.valueOf() - range.from.valueOf()) / 3_600_000) * 10) / 10;
+  return (
+    <div className={styles.deferred} data-testid="volume-deferred">
+      <Icon name="chart-line" />
+      <span>
+        The log volume of a text search over {hours} hours reads every line in the range (more than{' '}
+        {getAppConfig().maxScanHours} hours), so it loads on request. The lines below are searched newest first.
+      </span>
+      <Button size="sm" variant="secondary" onClick={() => api.allowLongScan()}>
+        Load volume
+      </Button>
+    </div>
+  );
+}
+
 function LogsTabRenderer({ model }: SceneComponentProps<LogsTabScene>) {
   const styles = useStyles2(getStyles);
-  const { volume, main, display, sort, limit, wrap, withLevel } = model.useState();
+  const { volume, main, display, sort, limit, wrap, withLevel, volumeDeferred } = model.useState();
   const api = getExploration(model);
   const ctx = api.getContext();
-  const levelSkipped = !withLevel && ctx?.tenant.level.source === 'message';
+  const levelSkipped = !volumeDeferred && !withLevel && ctx?.tenant.level.source === 'message';
+  const runner = main ? model.getLinesRunner() : undefined;
 
   return (
     <div className={styles.wrapper}>
@@ -133,7 +234,11 @@ function LogsTabRenderer({ model }: SceneComponentProps<LogsTabScene>) {
           </Button>
         </Alert>
       )}
-      <div className={styles.volume}>{volume && <volume.Component model={volume} />}</div>
+      {volumeDeferred ? (
+        <DeferredVolume model={model} />
+      ) : (
+        <div className={styles.volume}>{volume && <volume.Component model={volume} />}</div>
+      )}
       <div className={styles.toolbar}>
         <RadioButtonGroup size="sm" options={SORTS} value={sort} onChange={(v) => api.setDisplay({ sort: v })} />
         <Select
@@ -167,6 +272,7 @@ function LogsTabRenderer({ model }: SceneComponentProps<LogsTabScene>) {
           Copy link
         </ClipboardButton>
       </div>
+      {runner && <SearchStatus runner={runner} sort={sort} />}
       <div className={styles.main} data-testid="logs-main">
         {main && <main.Component model={main} />}
       </div>
@@ -242,6 +348,22 @@ function JsonLogsRenderer({ model }: SceneComponentProps<JsonLogsScene>) {
 const getStyles = (theme: GrafanaTheme2) => ({
   wrapper: css({ display: 'flex', flexDirection: 'column', gap: theme.spacing(1), minWidth: 0 }),
   volume: css({ height: 200 }),
+  deferred: css({
+    display: 'flex',
+    alignItems: 'center',
+    gap: theme.spacing(1),
+    padding: theme.spacing(1, 2),
+    border: `1px dashed ${theme.colors.border.medium}`,
+    borderRadius: theme.shape.radius.default,
+    color: theme.colors.text.secondary,
+  }),
+  status: css({
+    display: 'flex',
+    alignItems: 'center',
+    gap: theme.spacing(1),
+    color: theme.colors.text.secondary,
+    fontSize: theme.typography.bodySmall.fontSize,
+  }),
   toolbar: css({ display: 'flex', alignItems: 'center', gap: theme.spacing(1), flexWrap: 'wrap' }),
   spacer: css({ flex: 1 }),
   main: css({ height: 'calc(100vh - 320px)', minHeight: 480, minWidth: 0 }),
````

### 17/40 `src/config/config.test.ts` (modified)

unit tests: new settings

PATCH-BLOCK 17/40 src/config/config.test.ts old=a3961e340df722572f127569f256f36d98c73685 new=93656aa30b5ee77d07aab2929f7d57f659e26466 sha256=0740dac413f19c109ef07c9aa645d1516ea3fe12d5c435d461c7f155a67778e2
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/config/config.test.ts b/plugins/kotak-starrocks-logs-app/src/config/config.test.ts
index a3961e340df722572f127569f256f36d98c73685..93656aa30b5ee77d07aab2929f7d57f659e26466 100644
--- a/plugins/kotak-starrocks-logs-app/src/config/config.test.ts
+++ b/plugins/kotak-starrocks-logs-app/src/config/config.test.ts
@@ -49,6 +49,23 @@ describe('resolveConfig', () => {
     expect(errors.length).toBe(6);
   });
 
+  it('range, timeout and time zone settings: defaults and validation', () => {
+    const d = resolveConfig({}).config;
+    expect(d.maxRangeHours).toBe(24);
+    expect(d.queryTimeoutSeconds).toBe(120);
+    expect(d.timeZone).toBe('auto');
+    for (const timeZone of ['session', '+00:00', '-03:30', 'Asia/Kolkata', 'UTC']) {
+      expect(resolveConfig({ timeZone }).errors).toEqual([]);
+    }
+    const { config, errors } = resolveConfig({ maxRangeHours: 12, queryTimeoutSeconds: 0, timeZone: '+05:30' });
+    expect(errors).toEqual([]);
+    expect([config.maxRangeHours, config.queryTimeoutSeconds, config.timeZone]).toEqual([12, 0, '+05:30']);
+    const bad = resolveConfig({ maxRangeHours: 0, queryTimeoutSeconds: 1.5, timeZone: "x'; DROP" });
+    expect(bad.errors).toHaveLength(3);
+    expect(bad.config.maxRangeHours).toBe(24);
+    expect(bad.config.timeZone).toBe('auto');
+  });
+
   it('accepts RE2 (?i) prefixes', () => {
     const { errors } = resolveConfig({ tenants: { a: { level: { source: 'message', regex: '(?i)level=(\\w+)' } } } });
     expect(errors).toEqual([]);
````

### 18/40 `src/config/config.ts` (modified)

settings `maxRangeHours`, `queryTimeoutSeconds`, `timeZone`

PATCH-BLOCK 18/40 src/config/config.ts old=51bdcf606486118180bc984c9936ec0243994c91 new=63e6d264368b81b9786c3c3bbd8d7fc4b0262691 sha256=2843a4325854b1101cd2937ce926f27a90fbd30230a2bda9eacd1d62af2cbc04
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/config/config.ts b/plugins/kotak-starrocks-logs-app/src/config/config.ts
index 51bdcf606486118180bc984c9936ec0243994c91..63e6d264368b81b9786c3c3bbd8d7fc4b0262691 100644
--- a/plugins/kotak-starrocks-logs-app/src/config/config.ts
+++ b/plugins/kotak-starrocks-logs-app/src/config/config.ts
@@ -50,8 +50,26 @@ export interface AppJsonData {
   viewPrefix?: string;
   serviceLabel?: string;
   defaultTimeRange?: string;
+  /** longest time range a user can select, in hours (default 24); longer ranges are cut to this length */
+  maxRangeHours?: number;
+  /**
+   * text scans (line search, fields inside the message, patterns, levels read from the message) over a longer
+   * range: the Logs tab searches newest-first and loads the volume chart on request; Labels, Fields and
+   * Patterns ask first
+   */
   maxScanHours?: number;
   lineLimit?: number;
+  /**
+   * StarRocks query_timeout for every statement the app sends, in seconds, as a SET_VAR hint (default 120;
+   * 0 = the cluster default). A backstop: StarRocks also stops a query when Grafana cancels it.
+   */
+  queryTimeoutSeconds?: number;
+  /**
+   * Session time zone of the app's statements (SET_VAR hint). "auto" (default): found per view by a probe
+   * (an Iceberg timestamptz column gets '+00:00'; a wall-clock column gets the zone of its wall clock).
+   * "session": the data source's own session zone. Or a zone such as "+00:00" or "Asia/Kolkata".
+   */
+  timeZone?: string;
   labels?: string[];
   fields?: string[];
   /**
@@ -76,8 +94,11 @@ export interface ResolvedConfig {
   viewPrefix: string;
   serviceLabel: string;
   defaultTimeRange: string;
+  maxRangeHours: number;
   maxScanHours: number;
   lineLimit: number;
+  queryTimeoutSeconds: number;
+  timeZone: string;
   labels: string[];
   fields: string[];
   tenants: Record<string, TenantConfig>;
@@ -89,8 +110,11 @@ export const DEFAULT_CONFIG: ResolvedConfig = {
   viewPrefix: 'vw_eks_app_logs_',
   serviceLabel: 'k8s_service_name',
   defaultTimeRange: 'now-15m',
+  maxRangeHours: 24,
   maxScanHours: 6,
   lineLimit: 1000,
+  queryTimeoutSeconds: 120,
+  timeZone: 'auto',
   labels: DEFAULT_LABELS,
   fields: DEFAULT_FIELDS,
   tenants: {},
@@ -194,6 +218,13 @@ export function resolveConfig(jsonData?: AppJsonData | null): { config: Resolved
       errors.push(`defaultTimeRange "${j.defaultTimeRange}" must look like now-15m`);
     }
   }
+  if (j.maxRangeHours !== undefined) {
+    if (typeof j.maxRangeHours === 'number' && j.maxRangeHours >= 1 && j.maxRangeHours <= 24 * 90) {
+      c.maxRangeHours = j.maxRangeHours;
+    } else {
+      errors.push('maxRangeHours must be a number between 1 and 2160');
+    }
+  }
   if (j.maxScanHours !== undefined) {
     if (typeof j.maxScanHours === 'number' && j.maxScanHours > 0 && j.maxScanHours <= 24 * 90) {
       c.maxScanHours = j.maxScanHours;
@@ -208,6 +239,24 @@ export function resolveConfig(jsonData?: AppJsonData | null): { config: Resolved
       errors.push('lineLimit must be an integer between 10 and 5000');
     }
   }
+  if (j.queryTimeoutSeconds !== undefined) {
+    const t = j.queryTimeoutSeconds;
+    if (typeof t === 'number' && Number.isInteger(t) && t >= 0 && t <= 3600) {
+      c.queryTimeoutSeconds = t;
+    } else {
+      errors.push('queryTimeoutSeconds must be an integer between 0 and 3600');
+    }
+  }
+  if (j.timeZone !== undefined) {
+    if (
+      typeof j.timeZone === 'string' &&
+      /^(auto|session|[+-]\d{2}:\d{2}|[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*)$/.test(j.timeZone)
+    ) {
+      c.timeZone = j.timeZone;
+    } else {
+      errors.push('timeZone must be "auto", "session", or a zone like "+00:00" or "Asia/Kolkata"');
+    }
+  }
   for (const key of ['labels', 'fields'] as const) {
     const v = j[key];
     if (v === undefined) {
````

### 19/40 `src/constants.ts` (modified)

comment on quick ranges

PATCH-BLOCK 19/40 src/constants.ts old=3b0a4688f10c0d3660074d1535cd88bff2cd99da new=8f2c6444c7a9a4b5670ce7e75004cc4ecc9d2d34 sha256=1af8a273831596cb2f24b2695cbb94a95457f560208195b2a296853244a962c3
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/constants.ts b/plugins/kotak-starrocks-logs-app/src/constants.ts
index 3b0a4688f10c0d3660074d1535cd88bff2cd99da..8f2c6444c7a9a4b5670ce7e75004cc4ecc9d2d34 100644
--- a/plugins/kotak-starrocks-logs-app/src/constants.ts
+++ b/plugins/kotak-starrocks-logs-app/src/constants.ts
@@ -1,8 +1,8 @@
 export const PLUGIN_ID = 'kotak-starrocks-logs-app';
 export const APP_TITLE = 'Logs Drilldown (StarRocks)';
 
-// Time picker quick ranges: up to 24 hours (longer ranges scan a lot of data on the shared cluster; an
-// absolute range can still be typed, and the scan guard applies).
+// Time picker quick ranges: up to 24 hours, the default maxRangeHours (a longer typed range is cut to it).
+// Ranges longer than a configured maxRangeHours are not offered.
 export const QUICK_RANGES = [
   { from: 'now-5m', to: 'now', display: 'Last 5 minutes' },
   { from: 'now-15m', to: 'now', display: 'Last 15 minutes' },
````

### 20/40 `src/datasource/StarRocksLogsDataSource.ts` (modified)

newest-first windowed line search (lines stream in); time zone probe before the first query

PATCH-BLOCK 20/40 src/datasource/StarRocksLogsDataSource.ts old=7b39a416caf303e2a95205373a6f27779915606d new=4c4f7938ba46899c0fee5ba8f94f6df602ce948a sha256=3995f78730cd63852ca72608d09e48d423431e9810277a512f7803759220cc60
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/StarRocksLogsDataSource.ts b/plugins/kotak-starrocks-logs-app/src/datasource/StarRocksLogsDataSource.ts
index 7b39a416caf303e2a95205373a6f27779915606d..4c4f7938ba46899c0fee5ba8f94f6df602ce948a 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/StarRocksLogsDataSource.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/StarRocksLogsDataSource.ts
@@ -1,4 +1,4 @@
-import { Observable, catchError, forkJoin, from, lastValueFrom, map, of, switchMap } from 'rxjs';
+import { Observable, Subscription, catchError, combineLatest, from, lastValueFrom, map, of, switchMap } from 'rxjs';
 
 import {
   DataFrame,
@@ -33,17 +33,22 @@ import {
   fieldBreakdownQuery,
   labelOverviewQuery,
   logsQuery,
+  needsMessageScan,
   patternsQuery,
   pickBucketSeconds,
+  planWindows,
   serviceSamplesQuery,
   serviceVolumeQuery,
+  TimeWindow,
   valueBreakdownQuery,
   volumeQuery,
   widenToSeconds,
 } from '../sql/builder';
 import { QueryKind, QueryParams, QuerySpec } from '../state/types';
 import { fetchColumns, runSql } from './api';
+import { ensureSessionZone } from './timeZone';
 import {
+  concatFrames,
   groupValuesOf,
   toLabelOverviewFrames,
   toLevelFrames,
@@ -60,6 +65,24 @@ export interface LogsAppQuery extends DataQuery {
   params?: QueryParams;
 }
 
+/** Progress of a windowed text search, in meta.custom.search of the lines frame. */
+export interface SearchProgress {
+  /** part of the time range searched so far (ms) */
+  searchedFromMs: number;
+  searchedToMs: number;
+  rangeFromMs: number;
+  rangeToMs: number;
+  windows: number;
+  totalWindows: number;
+  lines: number;
+  limit: number;
+  done: boolean;
+}
+
+export function searchProgressOf(frame?: DataFrame): SearchProgress | undefined {
+  return frame?.meta?.custom?.search as SearchProgress | undefined;
+}
+
 const ALL_COLUMNS = [
   TIME_COLUMN,
   MESSAGE_COLUMN,
@@ -76,6 +99,8 @@ export async function buildContext(view: string, range: TimeRange, datasource =
   if (columns.length === 0) {
     columns = ALL_COLUMNS;
   }
+  // before the view's first data query: the session zone its statements run in
+  await ensureSessionZone(view, datasource);
   return {
     tenant: resolveTenant(config, view, datasource || config.datasource.uid),
     columns,
@@ -150,18 +175,127 @@ function errorResponse(refId: string, err: unknown): DataQueryResponse {
 }
 
 function widenedRange(range: TimeRange): TimeRange {
-  const w = widenToSeconds(range.from.valueOf(), range.to.valueOf());
+  return widenedWindow({ fromMs: range.from.valueOf(), toMs: range.to.valueOf() });
+}
+
+function widenedWindow(win: TimeWindow): TimeRange {
+  const w = widenToSeconds(win.fromMs, win.toMs);
   return { from: dateTime(w.fromMs), to: dateTime(w.toMs), raw: { from: dateTime(w.fromMs), to: dateTime(w.toMs) } };
 }
 
+/**
+ * Lines with a text filter (line search, message field, pattern, level from the message): StarRocks has to
+ * read the message of every row in the range, and ORDER BY ... LIMIT does not stop early. So the range is
+ * searched in windows, newest first (oldest first for ascending order): 1 hour, then 2, 4, 8 hours...
+ * The search stops when it has the line limit. After each window the lines found so far are sent to the
+ * panel (Streaming), so they appear while older windows are read. Unsubscribing (a newer query, leaving the
+ * page, the panel's cancel button) cancels the running window and starts no more.
+ */
+function runWindowedLines(
+  q: LogsAppQuery,
+  ctx: BuildContext,
+  range: TimeRange,
+  windows: TimeWindow[],
+  requestId?: string
+): Observable<DataQueryResponse> {
+  const p = q.params ?? {};
+  const limit = p.limit ?? getAppConfig().lineLimit;
+  const sort = p.sort ?? 'desc';
+  return new Observable<DataQueryResponse>((subscriber) => {
+    let current: Subscription | undefined;
+    const found: DataFrame[] = [];
+    const sqls: string[] = [];
+    let lines = 0;
+    let empty: DataFrame | undefined;
+
+    const step = (i: number) => {
+      const w = windows[i];
+      const sql = logsQuery(q.spec, ctx, limit - lines, sort, w);
+      sqls.push(sql);
+      current = runSql(sql, {
+        datasource: q.spec.datasource,
+        view: q.spec.view,
+        refId: q.refId,
+        range: widenedWindow(w),
+        requestId: requestId ? `${requestId}_w${i}` : undefined,
+      }).subscribe({
+        next: (res) => {
+          const err = res.errors?.[0] ?? res.error;
+          if (err) {
+            subscriber.next({ data: [], errors: [{ ...err, refId: q.refId }], error: err, state: LoadingState.Error });
+            subscriber.complete();
+            return;
+          }
+          const frame = (res.data as DataFrame[])[0];
+          if (frame && frame.length > 0) {
+            found.push(frame);
+            lines += frame.length;
+          } else if (frame) {
+            empty = frame;
+          }
+          const done = lines >= limit || i === windows.length - 1;
+          const progress: SearchProgress = {
+            searchedFromMs: sort === 'desc' ? w.fromMs : windows[0].fromMs,
+            searchedToMs: sort === 'desc' ? windows[0].toMs : w.toMs,
+            rangeFromMs: range.from.valueOf(),
+            rangeToMs: range.to.valueOf(),
+            windows: i + 1,
+            totalWindows: windows.length,
+            lines,
+            limit,
+            done,
+          };
+          const source = found.length > 0 ? concatFrames(found) : empty;
+          const frames = source ? transform(q, ctx, [source], range) : [];
+          frames.forEach(
+            (f) =>
+              (f.meta = {
+                ...f.meta,
+                executedQueryString: sqls.join(';\n\n'),
+                custom: { ...f.meta?.custom, search: progress },
+              })
+          );
+          // Loading until the first lines arrive: the Logs panel keeps showing the previous result meanwhile
+          const state = done ? LoadingState.Done : lines > 0 ? LoadingState.Streaming : LoadingState.Loading;
+          subscriber.next({ data: frames, state, key: q.refId });
+          if (done) {
+            subscriber.complete();
+          } else {
+            step(i + 1);
+          }
+        },
+        error: (e) => {
+          subscriber.next(errorResponse(q.refId, e));
+          subscriber.complete();
+        },
+      });
+    };
+
+    step(0);
+    return () => current?.unsubscribe();
+  });
+}
+
 /** Runs one structured query and returns frames ready for the panels. */
 export function runLogsQuery(q: LogsAppQuery, range: TimeRange, requestId?: string): Observable<DataQueryResponse> {
   return from(buildContext(q.spec.view, range, q.spec.datasource)).pipe(
     switchMap((ctx) => {
+      if ((q.kind === 'logs' || q.kind === 'table') && needsMessageScan(q.spec, ctx.tenant, false)) {
+        const windows = planWindows(range.from.valueOf(), range.to.valueOf(), q.params?.sort ?? 'desc');
+        if (windows.length > 1) {
+          return runWindowedLines(q, ctx, range, windows, requestId);
+        }
+      }
       const sql = buildSql(q, ctx, range);
       // line queries have exact bounds in the SQL; widen the range for $__timeFilter to whole seconds
       const sqlRange = q.kind === 'logs' || q.kind === 'table' ? widenedRange(range) : range;
-      return runSql(sql, { datasource: q.spec.datasource, refId: q.refId, range: sqlRange, requestId }).pipe(
+      return runSql(sql, {
+        datasource: q.spec.datasource,
+        view: q.spec.view,
+        refId: q.refId,
+        range: sqlRange,
+        requestId,
+      }).pipe(
         map((res): DataQueryResponse => {
           const err = res.errors?.[0] ?? res.error;
           if (err) {
@@ -191,14 +325,26 @@ export class StarRocksLogsDataSource extends RuntimeDataSource<LogsAppQuery> {
     if (targets.length === 0) {
       return of({ data: [], state: LoadingState.Done });
     }
-    return forkJoin(targets.map((t) => runLogsQuery(t, request.range, `${request.requestId ?? 'q'}_${t.refId}`))).pipe(
+    // combineLatest, not forkJoin: a windowed text search sends its lines window by window
+    return combineLatest(
+      targets.map((t) => runLogsQuery(t, request.range, `${request.requestId ?? 'q'}_${t.refId}`))
+    ).pipe(
       map((responses) => {
         const errors = responses.flatMap((r) => r.errors ?? []);
+        const states = responses.map((r) => r.state ?? LoadingState.Done);
+        const state =
+          errors.length > 0
+            ? LoadingState.Error
+            : states.includes(LoadingState.Loading)
+              ? LoadingState.Loading
+              : states.includes(LoadingState.Streaming)
+                ? LoadingState.Streaming
+                : LoadingState.Done;
         return {
           data: responses.flatMap((r) => r.data),
           errors: errors.length > 0 ? errors : undefined,
           error: errors[0],
-          state: errors.length > 0 ? LoadingState.Error : LoadingState.Done,
+          state,
         };
       })
     );
@@ -235,7 +381,7 @@ export class StarRocksLogsDataSource extends RuntimeDataSource<LogsAppQuery> {
     const datasource = query?.spec?.datasource ?? '';
     const ctx = await buildContext(view, range, datasource);
     const sql = contextQuery(view, ctx, podColumn, pod, tsRaw, direction, options?.limit ?? 50);
-    const res = await lastValueFrom(runSql(sql, { datasource, refId: `context-${direction}`, range }));
+    const res = await lastValueFrom(runSql(sql, { datasource, view, refId: `context-${direction}`, range }));
     const err = res.errors?.[0] ?? res.error;
     if (err) {
       throw new Error(err.message);
````

### 21/40 `src/datasource/api.test.ts` (modified)

unit tests: error messages

PATCH-BLOCK 21/40 src/datasource/api.test.ts old=a570e4396521be59a5eca8c9349d5df4165c6993 new=0912f893e7e90b5455d59a4ccbf5df446f52b70f sha256=f82cd53d3dc5c5ffe0ccbc9659e07ad41ead364b78ecbad521f745d610910e52
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/api.test.ts b/plugins/kotak-starrocks-logs-app/src/datasource/api.test.ts
index a570e4396521be59a5eca8c9349d5df4165c6993..0912f893e7e90b5455d59a4ccbf5df446f52b70f 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/api.test.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/api.test.ts
@@ -27,6 +27,18 @@ describe('friendlyError', () => {
     );
     expect(friendlyError('something else')).toBe('something else');
   });
+
+  it('StarRocks 4.1: no grant in the database is 5203 on DATABASE; query timeouts are explained', () => {
+    const msg =
+      'db query error: Error 5203 (42000): Access denied; you need (at least one of) the ANY privilege(s) on DATABASE obs2_logs1_uat for this operation.';
+    expect(friendlyError(msg)).toMatch(
+      /^You have no access to any log view in this database\..*on DATABASE obs2_logs1_uat/
+    );
+    expect(friendlyError('Error 5203: Access denied on TABLE x')).toMatch(/^Access denied by StarRocks \(5203\)/);
+    expect(friendlyError('Query reached its timeout of 120 seconds')).toMatch(
+      /^The query took longer than the time limit/
+    );
+  });
 });
 
 describe('listDatasources', () => {
````

### 22/40 `src/datasource/api.ts` (modified)

SET_VAR hint (time zone, query_timeout) on every statement; per-view session zone; clearer 5203 and timeout errors

PATCH-BLOCK 22/40 src/datasource/api.ts old=918305444891319b0578ef1a2da19b9aaf991a5f new=ef94a602e30ce49e1db90b896cc7fa20bd504c10 sha256=8331c0cf47a62721e31f27d4047fe4da00900f25732bd80a1a2285932e354fd3
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/api.ts b/plugins/kotak-starrocks-logs-app/src/datasource/api.ts
index 918305444891319b0578ef1a2da19b9aaf991a5f..ef94a602e30ce49e1db90b896cc7fa20bd504c10 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/api.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/api.ts
@@ -10,7 +10,7 @@ import {
 } from '@grafana/runtime';
 
 import { getAppConfig, viewPrefixFor } from '../config/config';
-import { columnsQuery, viewsQuery } from '../sql/builder';
+import { columnsQuery, queryHint, viewsQuery, withQueryHint } from '../sql/builder';
 
 export interface StarRocksDatasource {
   uid: string;
@@ -36,11 +36,45 @@ export function listDatasources(): StarRocksDatasource[] {
     .filter((x): x is StarRocksDatasource => x !== undefined);
 }
 
+// session time zone per data source and view, found by datasource/timeZone.ts (undefined = session default)
+const sessionZones = new Map<string, string | undefined>();
+
+function zoneKey(datasource: string | undefined, view: string): string {
+  return `${datasource || getAppConfig().datasource.uid}/${view}`;
+}
+
+export function setSessionZone(datasource: string | undefined, view: string, zone: string | undefined) {
+  sessionZones.set(zoneKey(datasource, view), zone);
+}
+
+/** The session zone the app's statements on this view run in (undefined: the data source's default). */
+export function sessionZone(datasource: string | undefined, view: string | undefined): string | undefined {
+  const tz = getAppConfig().timeZone;
+  if (tz === 'session') {
+    return undefined;
+  }
+  if (tz !== 'auto') {
+    return tz;
+  }
+  return view ? sessionZones.get(zoneKey(datasource, view)) : undefined;
+}
+
+/** The SET_VAR hint the app adds to statements on a view (session zone, query timeout). */
+export function appQueryHint(opts: { datasource?: string; view?: string; timeoutSeconds?: number } = {}): string {
+  return queryHint({
+    timeZone: sessionZone(opts.datasource, opts.view),
+    timeoutSeconds: opts.timeoutSeconds ?? getAppConfig().queryTimeoutSeconds,
+  });
+}
+
 /**
  * Runs SQL through a kotak-starrocks-datasource instance via Grafana's /api/ds/query. Grafana's OAuth
  * middleware attaches the signed-in user's IDAM token, so StarRocks and Ranger see the user, exactly as for
  * dashboard panels. The datasource's frontend is bypassed on purpose: the SQL is sent as built, without
- * template-variable interpolation.
+ * template-variable interpolation, plus the app's SET_VAR hint (UTC session, query timeout).
+ *
+ * Unsubscribing cancels the HTTP request; Grafana then cancels the data source call, the data source closes
+ * its StarRocks connection, and StarRocks stops the query (mysql_service_kill_after_disconnect).
  */
 export function runSql(
   sql: string,
@@ -52,9 +86,23 @@ export function runSql(
     requestId?: string;
     maxDataPoints?: number;
     intervalMs?: number;
+    /** query_timeout for this statement; default: the app's queryTimeoutSeconds */
+    timeoutSeconds?: number;
+    /** the view queried: its session zone is used (see datasource/timeZone.ts) */
+    view?: string;
+    /** session zone for this statement instead of the view's (the zone probe); null = none */
+    timeZone?: string | null;
   }
 ): Observable<DataQueryResponse> {
   const { datasource } = getAppConfig();
+  const hint =
+    opts.timeZone !== undefined
+      ? queryHint({
+          timeZone: opts.timeZone ?? undefined,
+          timeoutSeconds: opts.timeoutSeconds ?? getAppConfig().queryTimeoutSeconds,
+        })
+      : appQueryHint({ datasource: opts.datasource, view: opts.view, timeoutSeconds: opts.timeoutSeconds });
+  sql = withQueryHint(sql, hint);
   const query = {
     refId: opts.refId,
     datasource: { type: datasource.type, uid: opts.datasource || datasource.uid },
@@ -97,9 +145,10 @@ export async function runSqlOnce(
   sql: string,
   range: TimeRange,
   refId = 'A',
-  datasource?: string
+  datasource?: string,
+  opts: { timeoutSeconds?: number; view?: string; timeZone?: string | null } = {}
 ): Promise<DataFrame[]> {
-  const res = await firstValueFrom(runSql(sql, { refId, range, datasource }));
+  const res = await firstValueFrom(runSql(sql, { refId, range, datasource, ...opts }));
   const err = res.errors?.[0] ?? res.error;
   if (err) {
     throw new Error(err.message ?? 'query failed');
@@ -112,6 +161,10 @@ export function friendlyError(message: string): string {
   if (/\b5204\b/.test(message)) {
     return `Access denied by Ranger (5204). You may not have access to this view. ${message}`;
   }
+  if (/\b5203\b/.test(message) && /on DATABASE/i.test(message)) {
+    // StarRocks 4.1: a user without any grant in the database logs in, then listing its views fails
+    return `You have no access to any log view in this database. Ask for access to your team's log view. (StarRocks: ${message})`;
+  }
   if (/\b5203\b/.test(message)) {
     return `Access denied by StarRocks (5203). ${message}`;
   }
@@ -119,6 +172,9 @@ export function friendlyError(message: string): string {
     // kotak-starrocks-datasource 0.1.0 reports a login rejected at the default-database check this way
     return `StarRocks refused the connection. Usually your account has no access to any log view in this database (Ranger), or your IDAM token was rejected. (${message})`;
   }
+  if (/timeout|timed out|time limit/i.test(message) && /query/i.test(message)) {
+    return `The query took longer than the time limit. Narrow the time range or add label filters. (${message})`;
+  }
   if (/no IDAM token/i.test(message)) {
     return `Sign in with IDAM to query StarRocks. ${message}`;
   }
````

### 23/40 `src/datasource/frames.test.ts` (modified)

unit tests: line time from `__ms`

PATCH-BLOCK 23/40 src/datasource/frames.test.ts old=d7d0481b890d7412049eb88c7663800dafe7db76 new=0629b5453fa45125d6e9654c7df97ca7ace17ed2 sha256=bad3f3a11965f7bad529862632372ca65e04e5cb4f03590f2da9d7fddb889600
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/frames.test.ts b/plugins/kotak-starrocks-logs-app/src/datasource/frames.test.ts
index d7d0481b890d7412049eb88c7663800dafe7db76..0629b5453fa45125d6e9654c7df97ca7ace17ed2 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/frames.test.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/frames.test.ts
@@ -4,6 +4,7 @@ import { resolveConfig, resolveTenant } from '../config/config';
 import {
   fnv1a,
   stableIds,
+  toTableFrame,
   toLabelOverviewFrames,
   toLogsFrame,
   toPatternFrames,
@@ -33,6 +34,32 @@ const lines = createDataFrame({
   ],
 });
 
+describe('line time from __ms (epoch ms computed by StarRocks)', () => {
+  // the session shows 10:00 (e.g. IST wall clock); __ms is the real instant; the raw DATETIME is not used
+  const withMs = createDataFrame({
+    fields: [
+      { name: '__ms', type: FieldType.number, values: [1795497300123] },
+      { name: '__ts', type: FieldType.string, values: ['2026-11-24 16:15:00.123456'] },
+      { name: 'message', type: FieldType.string, values: ['x'] },
+      { name: 'detected_level', type: FieldType.string, values: ['info'] },
+    ],
+  });
+
+  it('logs frame timestamp = __ms, and __ms is not a label', () => {
+    const f = toLogsFrame(withMs, { tenant: tenant(false), refId: 'A' });
+    expect(f.fields.find((x) => x.name === 'timestamp')?.values).toEqual([1795497300123]);
+    expect(f.fields.find((x) => x.name === 'labels')?.values[0]).toEqual({ detected_level: 'info' });
+  });
+
+  it('table frame shows __ms as observed_timestamp (a time field)', () => {
+    const t = toTableFrame(withMs, 'A');
+    const ts = t.fields.find((x) => x.name === 'observed_timestamp');
+    expect(ts?.type).toBe(FieldType.time);
+    expect(ts?.values).toEqual([1795497300123]);
+    expect(t.fields.some((x) => x.name === '__ms' || x.name === '__ts')).toBe(false);
+  });
+});
+
 describe('toLogsFrame', () => {
   it('produces a data plane log frame with labels and a hidden exact timestamp', () => {
     const f = toLogsFrame(lines, { tenant: tenant(false), refId: 'A' });
````

### 24/40 `src/datasource/frames.ts` (modified)

line time from `__ms` (epoch ms from StarRocks); joining window results

PATCH-BLOCK 24/40 src/datasource/frames.ts old=b8a375c8537475ce54629782a20dea38921b92c5 new=ba45284778b135a699373c08b5da994f6573fcf7 sha256=407781b2f5d3927dbdc6545515e676d112b8cc3beffed97ed046ee61568cf1df
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/frames.ts b/plugins/kotak-starrocks-logs-app/src/datasource/frames.ts
index b8a375c8537475ce54629782a20dea38921b92c5..ba45284778b135a699373c08b5da994f6573fcf7 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/frames.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/frames.ts
@@ -3,7 +3,9 @@ import { DataFrame, DataFrameType, DataLink, Field, FieldType, TimeRange, create
 import { DETECTED_LEVEL, LEVELS, POD_UID_COLUMN, TIME_COLUMN } from '../constants';
 import { ResolvedTenant, TraceConfig } from '../config/config';
 
-const INTERNAL_COLUMNS = new Set([TIME_COLUMN, '__ts', 'message', DETECTED_LEVEL, '__value']);
+const INTERNAL_COLUMNS = new Set([TIME_COLUMN, '__ms', '__ts', 'message', DETECTED_LEVEL, '__value']);
+// line queries return the time as epoch ms (__ms, computed by StarRocks in the session zone)
+const TIME_MS = '__ms';
 
 function col(frame: DataFrame, name: string): unknown[] {
   return frame.fields.find((f) => f.name === name)?.values ?? [];
@@ -44,7 +46,7 @@ export interface LogsFrameOptions {
  * field with an Explore link to Tempo when the tenant has a trace regex.
  */
 export function toLogsFrame(frame: DataFrame, opts: LogsFrameOptions): DataFrame {
-  const ts = col(frame, TIME_COLUMN);
+  const ts = frame.fields.some((f) => f.name === TIME_MS) ? col(frame, TIME_MS).map(Number) : col(frame, TIME_COLUMN);
   const tsRaw = col(frame, '__ts');
   const msg = col(frame, 'message');
   const lvl = col(frame, DETECTED_LEVEL);
@@ -322,9 +324,30 @@ export function toPatternFrames(frame: DataFrame | undefined, range: TimeRange,
 
 /** Plain table of the line query result (Table view). Internal helper columns are removed. */
 export function toTableFrame(frame: DataFrame, refId: string): DataFrame {
+  const fields = frame.fields
+    .filter((f) => f.name !== '__ts' && f.name !== '__value')
+    .map((f) =>
+      f.name === TIME_MS
+        ? { ...f, name: TIME_COLUMN, type: FieldType.time, values: f.values.map(Number), config: {} }
+        : f
+    );
+  return createDataFrame({ refId, fields, meta: { ...frame.meta, preferredVisualisationType: 'table' } });
+}
+
+/**
+ * Joins frames of the same query shape (the windows of a newest-first search) into one, rows in order.
+ * Frames whose field names differ from the first one are skipped.
+ */
+export function concatFrames(frames: DataFrame[]): DataFrame {
+  if (frames.length === 1) {
+    return frames[0];
+  }
+  const first = frames[0];
+  const names = first.fields.map((f) => f.name).join('\u0000');
+  const same = frames.filter((f) => f.fields.map((x) => x.name).join('\u0000') === names);
   return createDataFrame({
-    refId,
-    fields: frame.fields.filter((f) => f.name !== '__ts' && f.name !== '__value'),
-    meta: { ...frame.meta, preferredVisualisationType: 'table' },
+    refId: first.refId,
+    meta: first.meta,
+    fields: first.fields.map((f, i) => ({ ...f, values: same.flatMap((fr) => fr.fields[i].values) })),
   });
 }
````

### 25/40 `src/datasource/oldest.ts` (new file)

oldest line of a view, cached per browser

PATCH-BLOCK 25/40 src/datasource/oldest.ts old=none new=436881baebbe3956f11546ef36a3b2dc7a41a602 sha256=de0896bb5f9e6ac90201916220fbda969cf2494576e98f85edefef8bf0b1c185
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/oldest.ts b/plugins/kotak-starrocks-logs-app/src/datasource/oldest.ts
new file mode 100644
index 0000000000000000000000000000000000000000..436881baebbe3956f11546ef36a3b2dc7a41a602
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/oldest.ts
@@ -0,0 +1,55 @@
+import { dateTime, TimeRange } from '@grafana/data';
+
+import { anyBeforeQuery, oldestInRangeQuery } from '../sql/builder';
+import { getOldestCache, setOldestCache } from '../state/storage';
+import { runSqlOnce } from './api';
+import { findOldest } from './oldestSearch';
+
+const HOUR_MS = 3_600_000;
+// cached per browser, data source and view
+const CACHE_MS = 6 * HOUR_MS;
+// each probe is a LIMIT 1 query or a MIN over one hour
+const PROBE_TIMEOUT_SECONDS = 30;
+
+function rangeAround(ms: number): TimeRange {
+  const t = dateTime(ms);
+  return { from: t, to: t, raw: { from: t, to: t } };
+}
+
+const inFlight = new Map<string, Promise<number | undefined>>();
+
+/** Oldest line of a view (ms), cached in localStorage for a few hours. */
+export function fetchOldestLog(view: string, datasource: string, nowMs = Date.now()): Promise<number | undefined> {
+  const cached = getOldestCache(datasource, view);
+  if (cached && nowMs - cached.checkedAt < CACHE_MS) {
+    return Promise.resolve(cached.oldestMs ?? undefined);
+  }
+  const key = `${datasource}/${view}`;
+  let p = inFlight.get(key);
+  if (!p) {
+    const range = rangeAround(nowMs);
+    const anyBefore = async (ms: number) => {
+      const frames = await runSqlOnce(anyBeforeQuery(view, ms), range, 'oldest', datasource, {
+        view,
+        timeoutSeconds: PROBE_TIMEOUT_SECONDS,
+      });
+      return (frames[0]?.length ?? 0) > 0;
+    };
+    const oldestIn = async (fromMs: number, toMs: number) => {
+      const frames = await runSqlOnce(oldestInRangeQuery(view, fromMs, toMs), range, 'oldest', datasource, {
+        view,
+        timeoutSeconds: PROBE_TIMEOUT_SECONDS,
+      });
+      const v = frames[0]?.fields[0]?.values[0];
+      return v === null || v === undefined ? undefined : Number(v);
+    };
+    p = findOldest(nowMs, anyBefore, oldestIn)
+      .then((oldestMs) => {
+        setOldestCache(datasource, view, { oldestMs: oldestMs ?? null, checkedAt: nowMs });
+        return oldestMs;
+      })
+      .finally(() => inFlight.delete(key));
+    inFlight.set(key, p);
+  }
+  return p;
+}
````

### 26/40 `src/datasource/oldestSearch.test.ts` (new file)

unit tests: oldest line search

PATCH-BLOCK 26/40 src/datasource/oldestSearch.test.ts old=none new=ec742184d4a6af0b172363843f9cef575eefec2e sha256=e52dd19e8dd4680e2b82ec4a7df68559fb1979339835520d798b637ad7eb5e55
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/oldestSearch.test.ts b/plugins/kotak-starrocks-logs-app/src/datasource/oldestSearch.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ec742184d4a6af0b172363843f9cef575eefec2e
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/oldestSearch.test.ts
@@ -0,0 +1,52 @@
+import { findOldest } from './oldestSearch';
+
+const H = 3_600_000;
+const D = 24 * H;
+
+function fakeView(oldestMs: number | undefined) {
+  const probes: number[] = [];
+  const anyBefore = async (ms: number) => {
+    probes.push(ms);
+    return oldestMs !== undefined && oldestMs < ms;
+  };
+  const oldestIn = async (fromMs: number, toMs: number) =>
+    oldestMs !== undefined && oldestMs >= fromMs && oldestMs < toMs ? oldestMs : undefined;
+  return { anyBefore, oldestIn, probes };
+}
+
+describe('findOldest', () => {
+  const now = Date.UTC(2026, 10, 24, 14, 23, 11);
+
+  it('finds the exact oldest line with a few LIMIT 1 probes', async () => {
+    const oldest = now - 137 * D - 5 * H - 1234;
+    const v = fakeView(oldest);
+    expect(await findOldest(now, v.anyBefore, v.oldestIn)).toBe(oldest);
+    expect(v.probes.length).toBeLessThanOrEqual(25);
+  });
+
+  it('works when all lines are from the last day', async () => {
+    const oldest = now - 3 * H - 17;
+    const v = fakeView(oldest);
+    expect(await findOldest(now, v.anyBefore, v.oldestIn)).toBe(oldest);
+  });
+
+  it('returns undefined for an empty view, after one probe', async () => {
+    const v = fakeView(undefined);
+    expect(await findOldest(now, v.anyBefore, v.oldestIn)).toBeUndefined();
+    expect(v.probes).toEqual([now]);
+  });
+
+  it('stops at 2048 days', async () => {
+    const v = fakeView(now - 5000 * D);
+    const res = await findOldest(now, v.anyBefore, v.oldestIn);
+    expect(res).toBeLessThanOrEqual(now - 2048 * D + H);
+  });
+
+  it('copes with gaps: only "any line before X" is asked, which is monotonic', async () => {
+    // lines 40 days ago and in the last hour, nothing in between
+    const oldest = now - 40 * D;
+    const anyBefore = async (ms: number) => oldest < ms;
+    const oldestIn = async (a: number, b: number) => (oldest >= a && oldest < b ? oldest : undefined);
+    expect(await findOldest(now, anyBefore, oldestIn)).toBe(oldest);
+  });
+});
````

### 27/40 `src/datasource/oldestSearch.ts` (new file)

oldest line search with LIMIT 1 probes

PATCH-BLOCK 27/40 src/datasource/oldestSearch.ts old=none new=94b5ed25b685cc724e66f660d2f744955e215cfb sha256=12d92ed83f82d8972db1ad6264056d27ebf22d7a2974e69d25d5f91b37bf4947
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/oldestSearch.ts b/plugins/kotak-starrocks-logs-app/src/datasource/oldestSearch.ts
new file mode 100644
index 0000000000000000000000000000000000000000..94b5ed25b685cc724e66f660d2f744955e215cfb
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/oldestSearch.ts
@@ -0,0 +1,50 @@
+/**
+ * Search for the time of a view's oldest line, independent of how queries are run (so it can be unit
+ * tested without Grafana).
+ */
+const HOUR_MS = 3_600_000;
+const DAY_MS = 24 * HOUR_MS;
+// a view older than this is shown as "more than 2048 days"
+const MAX_DAYS = 2048;
+
+/**
+ * Finds the time of the oldest line of a view without reading it all. A MIN() over the whole view would read
+ * the time column of every hourly partition the view has; instead this asks "is there any line before X?"
+ * (LIMIT 1, so StarRocks stops at the first row; partitions after X are pruned, so a "no" costs nothing):
+ * first 1, 2, 4, ... days back until the answer is no, then halving the gap down to one hour, then a MIN()
+ * over that hour. About 20 small queries for a view with half a year of data.
+ * Returns undefined when the view has no lines at all.
+ */
+export async function findOldest(
+  nowMs: number,
+  anyBefore: (ms: number) => Promise<boolean>,
+  oldestIn: (fromMs: number, toMs: number) => Promise<number | undefined>
+): Promise<number | undefined> {
+  if (!(await anyBefore(nowMs))) {
+    return undefined;
+  }
+  // data before hi, none before lo
+  let hi = nowMs;
+  let lo = Number.NaN;
+  for (let days = 1; days <= MAX_DAYS; days *= 2) {
+    const x = Math.floor((nowMs - days * DAY_MS) / HOUR_MS) * HOUR_MS;
+    if (await anyBefore(x)) {
+      hi = x;
+    } else {
+      lo = x;
+      break;
+    }
+  }
+  if (Number.isNaN(lo)) {
+    return hi;
+  }
+  while (hi - lo > HOUR_MS) {
+    const mid: number = lo + Math.max(1, Math.floor((hi - lo) / 2 / HOUR_MS)) * HOUR_MS;
+    if (await anyBefore(mid)) {
+      hi = mid;
+    } else {
+      lo = mid;
+    }
+  }
+  return (await oldestIn(lo, hi)) ?? lo;
+}
````

### 28/40 `src/datasource/timeZone.ts` (new file)

time zone probe per view, cached per browser

PATCH-BLOCK 28/40 src/datasource/timeZone.ts old=none new=5b652c908d3c2d5e570002a177ed958c1f0cc634 sha256=00ef593a4e1f52ee043348da23e8b73956573f1a2980d48bf5ec4629af57731e
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/timeZone.ts b/plugins/kotak-starrocks-logs-app/src/datasource/timeZone.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5b652c908d3c2d5e570002a177ed958c1f0cc634
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/timeZone.ts
@@ -0,0 +1,78 @@
+import { dateTime, TimeRange } from '@grafana/data';
+
+import { getAppConfig } from '../config/config';
+import { newestTimeTextQuery, sessionZoneQuery } from '../sql/builder';
+import { decideTimeMode, PROBE_ZONES, TimeMode, zoneForMode } from '../sql/timeZone';
+import { getTimeModeCache, setTimeModeCache } from '../state/storage';
+import { runSqlOnce, setSessionZone, stringColumn } from './api';
+
+const CACHE_MS = 24 * 3_600_000;
+const PROBE_TIMEOUT_SECONDS = 30;
+
+const pending = new Map<string, Promise<TimeMode>>();
+
+function nowRange(): TimeRange {
+  const now = dateTime();
+  return { from: now, to: now, raw: { from: now, to: now } };
+}
+
+async function probe(view: string, datasource: string, zone: string): Promise<string | undefined> {
+  const frames = await runSqlOnce(newestTimeTextQuery(view), nowRange(), 'tz', datasource, {
+    timeZone: zone,
+    timeoutSeconds: PROBE_TIMEOUT_SECONDS,
+  });
+  return stringColumn(frames[0], 't')[0];
+}
+
+/** Offset of the data source's own session zone, in minutes (e.g. 330 for Asia/Kolkata). */
+async function sessionOffset(datasource: string): Promise<number> {
+  const frames = await runSqlOnce(sessionZoneQuery(), nowRange(), 'tz', datasource, {
+    timeZone: null,
+    timeoutSeconds: PROBE_TIMEOUT_SECONDS,
+  });
+  const off = Number(stringColumn(frames[0], 'off')[0]);
+  return Number.isFinite(off) ? Math.round(off / 15) * 15 : 0;
+}
+
+/** Finds how the view's time column relates to time zones (sql/timeZone.ts); cached per browser for a day. */
+export function detectTimeMode(view: string, datasource: string): Promise<TimeMode> {
+  const key = `${datasource}/${view}`;
+  const cached = getTimeModeCache(datasource, view);
+  if (cached && Date.now() - cached.checkedAt < CACHE_MS) {
+    return Promise.resolve(cached.mode);
+  }
+  let p = pending.get(key);
+  if (!p) {
+    p = (async () => {
+      const t0 = await probe(view, datasource, PROBE_ZONES[0]);
+      const t1 = await probe(view, datasource, PROBE_ZONES[1]);
+      const mode = decideTimeMode(t0, t1, Date.now(), await sessionOffset(datasource));
+      if (mode.kind !== 'unknown') {
+        setTimeModeCache(datasource, view, { mode, checkedAt: Date.now() });
+      }
+      return mode;
+    })().finally(() => pending.delete(key));
+    pending.set(key, p);
+  }
+  return p;
+}
+
+/**
+ * Sets the session zone of the app's statements on this view, before its first query (called from
+ * buildContext). With timeZone "auto" it is detected; a failed probe leaves the data source's session zone.
+ */
+export async function ensureSessionZone(view: string, datasource: string): Promise<void> {
+  if (getAppConfig().timeZone !== 'auto') {
+    return;
+  }
+  try {
+    const mode = await detectTimeMode(view, datasource);
+    setSessionZone(datasource, view, zoneForMode(mode));
+    if (mode.kind === 'unknown') {
+      console.info(`kotak-starrocks-logs-app: time zone of ${view} not detected (${mode.reason}); session zone used`);
+    }
+  } catch (e) {
+    setSessionZone(datasource, view, undefined);
+    console.warn(`kotak-starrocks-logs-app: time zone probe of ${view} failed`, e);
+  }
+}
````

### 29/40 `src/datasource/windowedSearch.test.ts` (new file)

unit tests: windowed search, streaming, stop, errors

PATCH-BLOCK 29/40 src/datasource/windowedSearch.test.ts old=none new=84e6b6e295b22e4535730e476e8b1554248a6fcb sha256=57bf15f59ad8b19b8ec89c1ed2d15379f32e6cce425b86f680ea33c3b7b3c5f6
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/windowedSearch.test.ts b/plugins/kotak-starrocks-logs-app/src/datasource/windowedSearch.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..84e6b6e295b22e4535730e476e8b1554248a6fcb
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/windowedSearch.test.ts
@@ -0,0 +1,149 @@
+import { Observable, of, toArray, firstValueFrom, Subject } from 'rxjs';
+
+import { DataQueryResponse, LoadingState, TimeRange, dateTime, toDataFrame } from '@grafana/data';
+
+import { runLogsQuery, searchProgressOf, LogsAppQuery } from './StarRocksLogsDataSource';
+import { emptySpec } from '../state/types';
+
+// only the data source's own code is under test: no Grafana runtime, no Scenes
+jest.mock('@grafana/scenes', () => ({ RuntimeDataSource: class {} }));
+
+const runSql = jest.fn();
+jest.mock('./timeZone', () => ({ ensureSessionZone: async () => undefined }));
+jest.mock('./api', () => ({
+  runSql: (...args: unknown[]) => runSql(...args),
+  fetchColumns: async () => ['observed_timestamp', 'message', 'level', 'k8s_service_name', 'k8s_pod_uid'],
+}));
+
+const H = 3_600_000;
+const TO = Date.UTC(2026, 10, 24, 14, 23);
+const FROM = TO - 6 * H;
+
+function range(): TimeRange {
+  return { from: dateTime(FROM), to: dateTime(TO), raw: { from: 'now-6h', to: 'now' } };
+}
+
+/** n lines inside [fromMs, toMs], newest first, as the data source returns them. */
+function lines(fromMs: number, toMs: number, n: number): DataQueryResponse {
+  const ts = Array.from({ length: n }, (_, i) => toMs - Math.floor(((i + 0.5) * (toMs - fromMs)) / n));
+  return {
+    data: [
+      toDataFrame({
+        fields: [
+          { name: '__ms', values: ts },
+          { name: '__ts', values: ts.map((t) => new Date(t).toISOString().replace('T', ' ').replace('Z', '000')) },
+          { name: 'message', values: ts.map((t) => `upstream timed out ${t}`) },
+          { name: 'detected_level', values: ts.map(() => 'error') },
+          { name: 'k8s_pod_uid', values: ts.map(() => 'pod-1') },
+        ],
+      }),
+    ],
+  };
+}
+
+/** Bounds of a window query (microseconds_add(FROM_UNIXTIME(s), us) on both sides) and its LIMIT. */
+function parse(sql: string) {
+  const b = [...sql.matchAll(/microseconds_add\(FROM_UNIXTIME\((\d+)\), (\d+)\)/g)].map(
+    (m) => Number(m[1]) * 1000 + Number(m[2]) / 1000
+  );
+  return { fromMs: b[0], toMs: b[1] - 1, limit: Number(/LIMIT (\d+)/.exec(sql)![1]) };
+}
+
+function textQuery(limit: number): LogsAppQuery {
+  const spec = {
+    ...emptySpec('vw_eks_app_logs_app_1961_observability'),
+    lineFilters: [{ op: 'include' as const, value: 'timed out', caseSensitive: false, regex: false }],
+  };
+  return { refId: 'A', kind: 'logs', spec, params: { limit, sort: 'desc' } };
+}
+
+beforeEach(() => runSql.mockReset());
+
+describe('windowed text search in the data source', () => {
+  it('stops at the line limit: the newest window is enough when it has the lines', async () => {
+    runSql.mockImplementation((sql: string) => {
+      const w = parse(sql);
+      return of(lines(w.fromMs, w.toMs, w.limit));
+    });
+    const out = await firstValueFrom(runLogsQuery(textQuery(100), range()).pipe(toArray()));
+    expect(runSql).toHaveBeenCalledTimes(1);
+    expect(out).toHaveLength(1);
+    expect(out[0].state).toBe(LoadingState.Done);
+    expect(out[0].data[0].length).toBe(100);
+    const p = searchProgressOf(out[0].data[0])!;
+    expect(p).toMatchObject({ done: true, lines: 100, limit: 100, windows: 1, searchedToMs: TO });
+    expect(p.searchedFromMs).toBe(Date.UTC(2026, 10, 24, 13)); // 13:00, a whole hour
+  });
+
+  it('reads older windows while lines are missing, streaming what it has; each window asks only for the rest', async () => {
+    // 30 lines per window at most
+    runSql.mockImplementation((sql: string) => {
+      const w = parse(sql);
+      return of(lines(w.fromMs, w.toMs, Math.min(30, w.limit)));
+    });
+    const out = await firstValueFrom(runLogsQuery(textQuery(70), range()).pipe(toArray()));
+    expect(runSql).toHaveBeenCalledTimes(3);
+    expect(runSql.mock.calls.map((c) => parse(c[0]).limit)).toEqual([70, 40, 10]);
+    expect(out.map((r) => r.state)).toEqual([LoadingState.Streaming, LoadingState.Streaming, LoadingState.Done]);
+    expect(out.map((r) => r.data[0].length)).toEqual([30, 60, 70]);
+    // newest first across windows, ids unique
+    const times = out[2].data[0].fields.find((f: { name: string }) => f.name === 'timestamp').values as number[];
+    expect([...times].sort((a, b) => b - a)).toEqual(times);
+    const ids = out[2].data[0].fields.find((f: { name: string }) => f.name === 'id').values as string[];
+    expect(new Set(ids).size).toBe(70);
+    // the $__timeFilter range of each window covers just that window (whole seconds)
+    const sent = runSql.mock.calls.map((c) => c[1].range as TimeRange);
+    expect(sent[0].to.valueOf()).toBeGreaterThan(TO);
+    expect(sent[1].to.valueOf()).toBeLessThanOrEqual(sent[0].from.valueOf() + 1000);
+  });
+
+  it('searches the whole range when there are few matches, then ends', async () => {
+    runSql.mockImplementation(() => of(lines(FROM, FROM + 1, 0)));
+    const out = await firstValueFrom(runLogsQuery(textQuery(1000), range()).pipe(toArray()));
+    const n = runSql.mock.calls.length;
+    expect(n).toBeGreaterThan(1);
+    const w = runSql.mock.calls.map((c) => parse(c[0]));
+    expect(w[n - 1].fromMs).toBe(FROM);
+    expect(w[0].toMs).toBe(TO);
+    // Loading (keep showing the previous result) until lines arrive; Done at the end
+    expect(out.slice(0, -1).every((r) => r.state === LoadingState.Loading)).toBe(true);
+    expect(out[out.length - 1].state).toBe(LoadingState.Done);
+  });
+
+  it('unsubscribing cancels the running window and starts no more', async () => {
+    const pending = new Subject<DataQueryResponse>();
+    let cancelled = false;
+    runSql.mockImplementation(
+      () =>
+        new Observable<DataQueryResponse>((sub) => {
+          const s = pending.subscribe(sub);
+          return () => {
+            cancelled = true;
+            s.unsubscribe();
+          };
+        })
+    );
+    const sub = runLogsQuery(textQuery(1000), range()).subscribe();
+    await new Promise((r) => setTimeout(r, 0));
+    expect(runSql).toHaveBeenCalledTimes(1);
+    sub.unsubscribe();
+    expect(cancelled).toBe(true);
+    pending.next(lines(FROM, TO, 0));
+    expect(runSql).toHaveBeenCalledTimes(1);
+  });
+
+  it('an error in a window ends the search with that error', async () => {
+    runSql.mockImplementation(() => of({ data: [], errors: [{ message: 'Query reached its timeout' }] }));
+    const out = await firstValueFrom(runLogsQuery(textQuery(1000), range()).pipe(toArray()));
+    expect(runSql).toHaveBeenCalledTimes(1);
+    expect(out[0].state).toBe(LoadingState.Error);
+    expect(out[0].errors?.[0].message).toContain('timeout');
+  });
+
+  it('no text filter: one query over the whole range, as before', async () => {
+    runSql.mockImplementation(() => of(lines(FROM, TO, 10)));
+    const q = { ...textQuery(1000), spec: emptySpec('vw_eks_app_logs_app_1961_observability') };
+    await firstValueFrom(runLogsQuery(q, range()).pipe(toArray()));
+    expect(runSql).toHaveBeenCalledTimes(1);
+  });
+});
````

### 30/40 `src/sql/builder.test.ts` (modified)

unit tests: hint, `__ms`, windows, probe queries

PATCH-BLOCK 30/40 src/sql/builder.test.ts old=bc901ede96b119f51e98f9dfd20de17b0bb17ef8 new=f64c52a6f53025f2bb31003b92d42bdac0115e69 sha256=e960bb647a5bec314c69d8be2636f8254660dd83908873f73001b8ba94d2bae4
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/sql/builder.test.ts b/plugins/kotak-starrocks-logs-app/src/sql/builder.test.ts
index bc901ede96b119f51e98f9dfd20de17b0bb17ef8..f64c52a6f53025f2bb31003b92d42bdac0115e69 100644
--- a/plugins/kotak-starrocks-logs-app/src/sql/builder.test.ts
+++ b/plugins/kotak-starrocks-logs-app/src/sql/builder.test.ts
@@ -1,6 +1,7 @@
 import { resolveConfig, resolveTenant } from '../config/config';
 import { emptySpec, QuerySpec } from '../state/types';
 import {
+  anyBeforeQuery,
   BuildContext,
   contextQuery,
   escapeRegex,
@@ -11,15 +12,20 @@ import {
   logsQuery,
   messageFieldRegex,
   needsMessageScan,
+  newestTimeTextQuery,
+  oldestInRangeQuery,
   patternsQuery,
   pickBucketSeconds,
+  planWindows,
   preciseTimeBounds,
+  queryHint,
   quoteIdent,
   serviceSamplesQuery,
   serviceVolumeQuery,
   volumeQuery,
   whereClause,
   widenToSeconds,
+  withQueryHint,
 } from './builder';
 
 const VIEW = 'vw_eks_app_logs_app_1961_observability';
@@ -282,3 +288,106 @@ describe('scan detection and buckets', () => {
     expect(pickBucketSeconds(7 * 24 * 3600 * 1000)).toBe(7200);
   });
 });
+
+describe('query hint (session zone, query timeout)', () => {
+  const hint = queryHint({ timeZone: '+00:00', timeoutSeconds: 120 });
+
+  it('sets time_zone and query_timeout in one SET_VAR', () => {
+    expect(hint).toBe("/*+ SET_VAR(time_zone = '+00:00', query_timeout = 120) */");
+    expect(queryHint({ timeoutSeconds: 0 })).toBe('');
+    expect(queryHint({ timeoutSeconds: 60 })).toBe('/*+ SET_VAR(query_timeout = 60) */');
+    expect(queryHint({ timeZone: 'Asia/Kolkata', timeoutSeconds: 0 })).toBe(
+      "/*+ SET_VAR(time_zone = 'Asia/Kolkata') */"
+    );
+  });
+
+  it('goes after the first SELECT, also of a parenthesised UNION ALL; SHOW is unchanged', () => {
+    expect(withQueryHint('SELECT 1', hint)).toBe(`SELECT ${hint} 1`);
+    expect(withQueryHint('(SELECT a FROM t)\nUNION ALL\n(SELECT a FROM u)', hint)).toBe(
+      `(SELECT ${hint} a FROM t)\nUNION ALL\n(SELECT a FROM u)`
+    );
+    expect(withQueryHint("SHOW TABLES LIKE 'vw_%'", hint)).toBe("SHOW TABLES LIKE 'vw_%'");
+    expect(withQueryHint('SELECT 1', '')).toBe('SELECT 1');
+  });
+
+  it('has no $ (the data source would treat $name(...) as a macro)', () => {
+    expect(hint).not.toContain('$');
+  });
+});
+
+describe('line times are computed by StarRocks (epoch ms in the session zone)', () => {
+  it('line queries return __ms and the exact text, not the raw DATETIME', () => {
+    const sql = logsQuery(spec(), ctx(), 10, 'desc');
+    expect(sql).toContain(
+      "SELECT (UNIX_TIMESTAMP(`observed_timestamp`) * 1000 + MILLISECONDS_DIFF(`observed_timestamp`, DATE_TRUNC('second', `observed_timestamp`))) AS __ms, CAST(`observed_timestamp` AS VARCHAR) AS __ts"
+    );
+    expect(sql).toContain('ORDER BY `observed_timestamp` DESC');
+  });
+
+  it('the zone probe reads the newest line of the last day as text', () => {
+    expect(newestTimeTextQuery(VIEW)).toBe(
+      `SELECT CAST(\`observed_timestamp\` AS VARCHAR) AS t\nFROM \`${VIEW}\`\nWHERE \`observed_timestamp\` >= DATE_SUB(NOW(), INTERVAL 1 DAY)\nORDER BY \`observed_timestamp\` DESC\nLIMIT 1`
+    );
+  });
+});
+
+describe('planWindows (newest-first text search)', () => {
+  const H = 3_600_000;
+  const at = (h: number, m = 0) => Date.UTC(2026, 10, 24, h, m);
+
+  it('keeps a range of up to 2 hours as one window', () => {
+    expect(planWindows(at(12), at(14), 'desc')).toEqual([{ fromMs: at(12), toMs: at(14) }]);
+  });
+
+  it('desc: newest window first, doubling, inner boundaries on whole hours, no gap or overlap', () => {
+    const w = planWindows(at(2, 23), at(14, 23), 'desc');
+    expect(w).toEqual([
+      { fromMs: at(13), toMs: at(14, 23) },
+      { fromMs: at(11), toMs: at(13) - 1 },
+      { fromMs: at(7), toMs: at(11) - 1 },
+      { fromMs: at(2, 23), toMs: at(7) - 1 },
+    ]);
+  });
+
+  it('asc: oldest window first', () => {
+    const w = planWindows(at(2, 23), at(14, 23), 'asc');
+    expect(w[0]).toEqual({ fromMs: at(2, 23), toMs: at(4) - 1 });
+    expect(w[w.length - 1].toMs).toBe(at(14, 23));
+  });
+
+  it('covers 24 hours in at most 5 windows, contiguous', () => {
+    for (const sort of ['desc', 'asc'] as const) {
+      const from = at(0, 7) - 24 * H + 7;
+      const to = at(0, 7) + 123;
+      const w = planWindows(from, to, sort);
+      expect(w.length).toBeLessThanOrEqual(5);
+      const ordered = sort === 'desc' ? [...w].reverse() : w;
+      expect(ordered[0].fromMs).toBe(from);
+      expect(ordered[ordered.length - 1].toMs).toBe(to);
+      for (let i = 1; i < ordered.length; i++) {
+        expect(ordered[i].fromMs).toBe(ordered[i - 1].toMs + 1);
+      }
+    }
+  });
+
+  it('window bounds give exact SQL bounds that meet: ts < boundary, then ts >= boundary', () => {
+    const [newest, next] = planWindows(at(2, 23), at(14, 23), 'desc');
+    expect(preciseTimeBounds(next.fromMs, next.toMs)[1]).toBe(
+      preciseTimeBounds(newest.fromMs, newest.toMs)[0].replace('>=', '<')
+    );
+  });
+});
+
+describe('oldest line queries', () => {
+  it('asks for one line older than a time (LIMIT 1)', () => {
+    expect(anyBeforeQuery(VIEW, 1_700_000_000_999)).toBe(
+      `SELECT 1 AS x FROM \`${VIEW}\` WHERE \`observed_timestamp\` < FROM_UNIXTIME(1700000000) LIMIT 1`
+    );
+  });
+
+  it('takes MIN over a short range only', () => {
+    const sql = oldestInRangeQuery(VIEW, 1_700_000_000_000, 1_700_003_600_000);
+    expect(sql).toContain('UNIX_TIMESTAMP(MIN(`observed_timestamp`)) * 1000');
+    expect(sql).toContain('>= FROM_UNIXTIME(1700000000) AND `observed_timestamp` < FROM_UNIXTIME(1700003600)');
+  });
+});
````

### 31/40 `src/sql/builder.ts` (modified)

line time as epoch ms in SQL (`__ms`), hint, search windows, probe queries

PATCH-BLOCK 31/40 src/sql/builder.ts old=4ef9eb80ba4ce66b2b6fb353bd3e0d37c416f5f4 new=3e54f260f74d19355203bf89d9d86eec473f05ad sha256=73f5bcf9a0b6fb7c8f9d186dc535ba607c933dfa3083091e5859dd6ccfd84e35
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/sql/builder.ts b/plugins/kotak-starrocks-logs-app/src/sql/builder.ts
index 4ef9eb80ba4ce66b2b6fb353bd3e0d37c416f5f4..3e54f260f74d19355203bf89d9d86eec473f05ad 100644
--- a/plugins/kotak-starrocks-logs-app/src/sql/builder.ts
+++ b/plugins/kotak-starrocks-logs-app/src/sql/builder.ts
@@ -67,6 +67,15 @@ export function escapeRegex(text: string): string {
 const T = quoteIdent(TIME_COLUMN);
 const M = quoteIdent(MESSAGE_COLUMN);
 
+/**
+ * Epoch milliseconds of a DATETIME expression, computed by StarRocks in the session zone. The data source
+ * would read a DATETIME as UTC, which is wrong whenever the session zone is not UTC. (StarRocks has no
+ * MICROSECOND(); the milliseconds within the second come from MILLISECONDS_DIFF.)
+ */
+export function timeMsExpr(expr: string): string {
+  return `(UNIX_TIMESTAMP(${expr}) * 1000 + MILLISECONDS_DIFF(${expr}, DATE_TRUNC('second', ${expr})))`;
+}
+
 export function timeFilter(): string {
   return `$__timeFilter(${T})`;
 }
@@ -85,6 +94,83 @@ export function preciseTimeBounds(fromMs: number, toMs: number): string[] {
   return [`${T} >= ${at(Math.floor(fromMs))}`, `${T} < ${at(Math.floor(toMs) + 1)}`];
 }
 
+/**
+ * Query-scope SET_VAR hint added to every statement the app sends:
+ * - time_zone: the zone the time column's wall clock is in (see sql/timeZone.ts), so that FROM_UNIXTIME and
+ *   UNIX_TIMESTAMP agree with the column. Left out when unknown: the data source's session zone applies.
+ * - query_timeout: a backstop. StarRocks also stops a query when its connection closes, which is what
+ *   happens when Grafana cancels a request (a newer selection, leaving the page, the panel's cancel).
+ */
+export function queryHint(opts: { timeZone?: string; timeoutSeconds: number }): string {
+  const vars: string[] = [];
+  if (opts.timeZone) {
+    vars.push(`time_zone = ${lit(opts.timeZone)}`);
+  }
+  if (opts.timeoutSeconds > 0) {
+    vars.push(`query_timeout = ${Math.floor(opts.timeoutSeconds)}`);
+  }
+  return vars.length > 0 ? `/*+ SET_VAR(${vars.join(', ')}) */` : '';
+}
+
+/**
+ * Puts the hint after the statement's first SELECT. StarRocks applies a query-scope hint found anywhere in
+ * the statement to all of it (UNION ALL included). SHOW statements are returned unchanged.
+ */
+export function withQueryHint(sql: string, hint: string): string {
+  if (hint === '') {
+    return sql;
+  }
+  return sql.replace(/^(\s*\(?\s*SELECT)\b/i, (m) => `${m} ${hint}`);
+}
+
+const HOUR_MS = 3_600_000;
+
+/** Inclusive millisecond bounds of one search window (as for preciseTimeBounds). */
+export interface TimeWindow {
+  fromMs: number;
+  toMs: number;
+}
+
+/**
+ * Splits a range into windows searched one after another for the newest (desc) or oldest (asc) lines, so a
+ * text search stops as soon as it has enough lines instead of reading the whole range. The first window is
+ * about firstMs long and each next one is twice as long; inner boundaries fall on whole hours, so each
+ * hourly Iceberg partition is read by one window only. Windows do not overlap and leave no gap.
+ */
+export function planWindows(fromMs: number, toMs: number, sort: 'desc' | 'asc', firstMs = HOUR_MS): TimeWindow[] {
+  const from = Math.floor(fromMs);
+  const end = Math.floor(toMs) + 1; // exclusive
+  if (end - 1 - from <= 2 * firstMs) {
+    return [{ fromMs: from, toMs: end - 1 }];
+  }
+  const out: TimeWindow[] = [];
+  let size = firstMs;
+  if (sort === 'desc') {
+    let hi = end;
+    while (hi > from) {
+      let lo = Math.floor((hi - size) / HOUR_MS) * HOUR_MS;
+      if (lo - from < HOUR_MS) {
+        lo = from; // no window shorter than an hour at the far end
+      }
+      out.push({ fromMs: lo, toMs: hi - 1 });
+      hi = lo;
+      size *= 2;
+    }
+  } else {
+    let lo = from;
+    while (lo < end) {
+      let hi = Math.ceil((lo + size) / HOUR_MS) * HOUR_MS;
+      if (end - hi < HOUR_MS) {
+        hi = end;
+      }
+      out.push({ fromMs: lo, toMs: hi - 1 });
+      lo = hi;
+      size *= 2;
+    }
+  }
+  return out;
+}
+
 /** Time range to send with a line query so that $__timeFilter covers the exact bounds (whole seconds). */
 export function widenToSeconds(fromMs: number, toMs: number): { fromMs: number; toMs: number } {
   return { fromMs: Math.floor(fromMs / 1000) * 1000, toMs: Math.ceil((Math.floor(toMs) + 1) / 1000) * 1000 };
@@ -235,7 +321,7 @@ export function lineColumns(ctx: BuildContext): string[] {
 
 function lineSelect(ctx: BuildContext): string {
   return [
-    T,
+    `${timeMsExpr(T)} AS __ms`,
     `CAST(${T} AS VARCHAR) AS __ts`,
     M,
     `${levelExpr(ctx.tenant)} AS detected_level`,
@@ -393,6 +479,40 @@ export function patternsQuery(spec: QuerySpec, ctx: BuildContext, bucket: number
   ].join('\n');
 }
 
+/**
+ * The newest line's time as text, in the last day (TopN with LIMIT 1). Run with two session zones to tell an
+ * instant-like column from a wall-clock one (sql/timeZone.ts).
+ */
+export function newestTimeTextQuery(view: string): string {
+  return [
+    `SELECT CAST(${T} AS VARCHAR) AS t`,
+    from(view),
+    `WHERE ${T} >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
+    `ORDER BY ${T} DESC`,
+    `LIMIT 1`,
+  ].join('\n');
+}
+
+/** The data source's own session zone and its offset from UTC in minutes (run without a time_zone hint). */
+export function sessionZoneQuery(): string {
+  return 'SELECT @@time_zone AS tz, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS off';
+}
+
+/** Is there any line older than beforeMs? LIMIT 1: StarRocks stops at the first row it finds. */
+export function anyBeforeQuery(view: string, beforeMs: number): string {
+  return `SELECT 1 AS x ${from(view)} WHERE ${T} < FROM_UNIXTIME(${Math.floor(beforeMs / 1000)}) LIMIT 1`;
+}
+
+/** Oldest line in a short range (the hour found by the search in findOldest), as epoch ms. */
+export function oldestInRangeQuery(view: string, fromMs: number, toMs: number): string {
+  const s = (ms: number) => Math.floor(ms / 1000);
+  return [
+    `SELECT ${timeMsExpr(`MIN(${T})`)} AS oldest`,
+    from(view),
+    `WHERE ${T} >= FROM_UNIXTIME(${s(fromMs)}) AND ${T} < FROM_UNIXTIME(${s(toMs)})`,
+  ].join('\n');
+}
+
 /**
  * Lines of the same pod before (backward) or after (forward) a line, within one hour. Uses the exact
  * microsecond timestamp of the line. Timestamps are not unique, so lines with the same timestamp are left out.
````

### 32/40 `src/sql/timeZone.test.ts` (new file)

unit tests: time column kind

PATCH-BLOCK 32/40 src/sql/timeZone.test.ts old=none new=6be0b9ae10d33191efd39525897474a122065d2d sha256=7be02129ee891e0e1e15032c9583704035b0b87be9f54f16cca8d36fe1242cdb
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/sql/timeZone.test.ts b/plugins/kotak-starrocks-logs-app/src/sql/timeZone.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6be0b9ae10d33191efd39525897474a122065d2d
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/sql/timeZone.test.ts
@@ -0,0 +1,61 @@
+import { decideTimeMode, formatOffset, parseWallClock, zoneForMode } from './timeZone';
+
+const now = Date.UTC(2026, 10, 24, 10, 45, 0);
+const text = (ms: number) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '123');
+
+describe('decideTimeMode', () => {
+  it('aware (Iceberg timestamptz): the same line reads one hour later with +01:00 -> UTC session', () => {
+    const t = now - 20_000;
+    const mode = decideTimeMode(text(t), text(t + 3_600_000), now);
+    expect(mode).toEqual({ kind: 'aware' });
+    expect(zoneForMode(mode)).toBe('+00:00');
+  });
+
+  it('a line arriving between the probes still counts', () => {
+    expect(decideTimeMode(text(now - 20_000), text(now - 5_000 + 3_600_000), now)).toEqual({ kind: 'aware' });
+    expect(decideTimeMode(text(now - 20_000), text(now - 5_000), now).kind).toBe('naive');
+  });
+
+  it('naive with IST wall clock (a pipeline writing local time) -> +05:30 session', () => {
+    const ist = now - 90_000 + 330 * 60_000;
+    const mode = decideTimeMode(text(ist), text(ist), now, 330);
+    expect(mode).toEqual({ kind: 'naive', offsetMinutes: 330 });
+    expect(zoneForMode(mode)).toBe('+05:30');
+    // 3 hours old: in UTC it would be in the future, so IST
+    const older = now - 3 * 3_600_000 + 330 * 60_000;
+    expect(decideTimeMode(text(older), text(older), now, 330)).toEqual({ kind: 'naive', offsetMinutes: 330 });
+  });
+
+  it('naive with UTC wall clock -> +00:00 session, whatever the session zone', () => {
+    const mode = decideTimeMode(text(now - 60_000), text(now - 60_000), now, 330);
+    expect(mode).toEqual({ kind: 'naive', offsetMinutes: 0 });
+    expect(zoneForMode(mode)).toBe('+00:00');
+    expect(decideTimeMode(text(now - 60_000), text(now - 60_000), now, 0)).toEqual({ kind: 'naive', offsetMinutes: 0 });
+  });
+
+  it('unknown (session zone kept) when there are no recent lines or the newest is too old to tell', () => {
+    expect(decideTimeMode(undefined, undefined, now).kind).toBe('unknown');
+    // 5 hours old in UTC, or 10.5 hours old in IST: cannot tell
+    const old = now - 5 * 3_600_000;
+    expect(decideTimeMode(text(old), text(old), now, 330).kind).toBe('unknown');
+    expect(decideTimeMode(text(now), text(now + 7_200_000), now).kind).toBe('unknown');
+    expect(zoneForMode({ kind: 'unknown', reason: 'x' })).toBeUndefined();
+  });
+
+  it('a session in UTC: a naive column is UTC even if old', () => {
+    const old = now - 5 * 3_600_000;
+    expect(decideTimeMode(text(old), text(old), now, 0)).toEqual({ kind: 'naive', offsetMinutes: 0 });
+  });
+});
+
+describe('helpers', () => {
+  it('parseWallClock reads StarRocks DATETIME text with or without microseconds', () => {
+    expect(parseWallClock('2026-11-24 10:45:43.898092')).toBe(Date.UTC(2026, 10, 24, 10, 45, 43, 898));
+    expect(parseWallClock('2026-11-24 10:45:43')).toBe(Date.UTC(2026, 10, 24, 10, 45, 43));
+    expect(parseWallClock('nope')).toBeNaN();
+  });
+
+  it('formatOffset', () => {
+    expect([formatOffset(330), formatOffset(0), formatOffset(-210)]).toEqual(['+05:30', '+00:00', '-03:30']);
+  });
+});
````

### 33/40 `src/sql/timeZone.ts` (new file)

decides the time column kind (instant or wall clock, and its zone)

PATCH-BLOCK 33/40 src/sql/timeZone.ts old=none new=20db34ebb21c1353e1336023d38103b156352490 sha256=f1bdbc6f8cabf54f0c2668e7dc1569fd932bb2f65c5005956e83d949100e1e70
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/sql/timeZone.ts b/plugins/kotak-starrocks-logs-app/src/sql/timeZone.ts
new file mode 100644
index 0000000000000000000000000000000000000000..20db34ebb21c1353e1336023d38103b156352490
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/sql/timeZone.ts
@@ -0,0 +1,91 @@
+/**
+ * How the time column relates to time zones, found once per view from two tiny queries.
+ *
+ * StarRocks shows a DATETIME in one of two ways:
+ * - "aware" (an Iceberg timestamptz): the value is an instant, shown as wall-clock time in the session zone.
+ *   The same line reads 10:00 with time_zone '+00:00' and 11:00 with '+01:00'.
+ * - "naive" (an Iceberg timestamp, a native DATETIME): the stored wall-clock text, whatever the session zone.
+ *   Then the wall clock belongs to some zone (UTC, or e.g. IST if the pipeline wrote local time), found by
+ *   comparing the newest line with the current time.
+ *
+ * The app runs every statement with time_zone set to the zone the column's wall clock is in ('+00:00' for
+ * aware columns), and turns times into epoch milliseconds in SQL with UNIX_TIMESTAMP, which uses that same
+ * zone. The time filter (FROM_UNIXTIME, also in the session zone), the times shown, "load more" and
+ * "show context" then agree, whichever way the column was written.
+ */
+
+export type TimeMode =
+  { kind: 'aware' } | { kind: 'naive'; offsetMinutes: number } | { kind: 'unknown'; reason: string };
+
+/** The two session zones of the probe: the same line read in both. */
+export const PROBE_ZONES = ['+00:00', '+01:00'] as const;
+
+const MINUTE = 60_000;
+
+/** Milliseconds of a StarRocks DATETIME text ("2026-11-24 10:45:43.898092"), read as if it were UTC. */
+export function parseWallClock(text: string): number {
+  const m = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)(?:\.(\d{1,6}))?/.exec(text.trim());
+  if (!m) {
+    return Number.NaN;
+  }
+  const ms = m[7] ? Number(m[7].padEnd(6, '0').slice(0, 3)) : 0;
+  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms);
+}
+
+export function formatOffset(minutes: number): string {
+  const sign = minutes < 0 ? '-' : '+';
+  const a = Math.abs(minutes);
+  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
+}
+
+/**
+ * Decides from the newest line read with time_zone '+00:00' (t0) and '+01:00' (t1).
+ * - Aware: t1 is one hour after t0.
+ * - Naive: both the same. The wall clock is in UTC or in the data source's session zone (sessionOffset
+ *   minutes, e.g. 330 for Asia/Kolkata): the zone in which the newest line is not in the future, and is
+ *   less than 15 minutes old if both qualify. If that does not decide it, unknown (the session zone is kept,
+ *   the same assumption a client that simply uses the session makes).
+ */
+export function decideTimeMode(
+  t0: string | undefined,
+  t1: string | undefined,
+  nowMs: number,
+  sessionOffsetMinutes = 0
+): TimeMode {
+  if (!t0 || !t1) {
+    return { kind: 'unknown', reason: 'no lines in the last day' };
+  }
+  const a = parseWallClock(t0);
+  const b = parseWallClock(t1);
+  if (Number.isNaN(a) || Number.isNaN(b)) {
+    return { kind: 'unknown', reason: `unexpected time text ${t0} / ${t1}` };
+  }
+  // a new line may arrive between the two probes: allow a minute
+  if (Math.abs(b - a - 60 * MINUTE) <= MINUTE) {
+    return { kind: 'aware' };
+  }
+  if (Math.abs(b - a) > MINUTE) {
+    return { kind: 'unknown', reason: `the probes disagree (${t0} / ${t1})` };
+  }
+  // age of the newest line if the wall clock is in a zone with this offset (allow a minute of clock skew)
+  const ageIn = (offsetMinutes: number) => offsetMinutes * MINUTE - (a - nowMs);
+  const candidates = Array.from(new Set([0, sessionOffsetMinutes]))
+    .map((offsetMinutes) => ({ offsetMinutes, age: ageIn(offsetMinutes) }))
+    .filter((c) => c.age >= -MINUTE)
+    .sort((x, y) => x.age - y.age);
+  if (candidates.length === 1 || (candidates.length > 1 && candidates[0].age < 15 * MINUTE)) {
+    return { kind: 'naive', offsetMinutes: candidates[0].offsetMinutes };
+  }
+  return { kind: 'unknown', reason: 'the newest line is too old to tell the zone of its wall clock' };
+}
+
+/** Session zone for a mode; undefined = leave the data source's session zone. */
+export function zoneForMode(mode: TimeMode): string | undefined {
+  if (mode.kind === 'aware') {
+    return '+00:00';
+  }
+  if (mode.kind === 'naive') {
+    return formatOffset(mode.offsetMinutes);
+  }
+  return undefined;
+}
````

### 34/40 `src/state/storage.ts` (modified)

browser caches for "Oldest log" and the time zone

PATCH-BLOCK 34/40 src/state/storage.ts old=0145b7badf9a1b42162ff281243bad8cd92aae55 new=0f5b8956c900c861ff8f5ee36f8a86c5b2e75cdb sha256=2c2d7ca2802218a0ab6545b5d952290d9a9e626b5369fe467430d8f0993dcb22
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/state/storage.ts b/plugins/kotak-starrocks-logs-app/src/state/storage.ts
index 0145b7badf9a1b42162ff281243bad8cd92aae55..0f5b8956c900c861ff8f5ee36f8a86c5b2e75cdb 100644
--- a/plugins/kotak-starrocks-logs-app/src/state/storage.ts
+++ b/plugins/kotak-starrocks-logs-app/src/state/storage.ts
@@ -1,7 +1,10 @@
 /**
- * Per-browser conveniences kept in localStorage: the last data source and view the user opened, and their
- * favourite values per view and label. Reads and writes never throw (private windows, blocked storage).
+ * Per-browser conveniences kept in localStorage: the last data source and view the user opened, their
+ * favourite values per view and label, and per view the cached time of its oldest line and how its time
+ * column relates to time zones. Reads and writes never throw (private windows, blocked storage).
  */
+import { TimeMode } from '../sql/timeZone';
+
 const PREFIX = 'kotak-starrocks-logs-app';
 
 function read<T>(key: string, fallback: T): T {
@@ -49,3 +52,42 @@ export function toggleFavorite(ds: string, view: string, label: string, value: s
   write(favKey(ds, view, label), next);
   return next;
 }
+
+export interface OldestCache {
+  /** time of the oldest line, ms; null = the view had no lines */
+  oldestMs: number | null;
+  checkedAt: number;
+}
+
+export function getOldestCache(ds: string, view: string): OldestCache | undefined {
+  const v = read<Partial<OldestCache> | null>(`oldest:${ds}:${view}`, null);
+  if (!v || typeof v.checkedAt !== 'number' || !(v.oldestMs === null || typeof v.oldestMs === 'number')) {
+    return undefined;
+  }
+  return { oldestMs: v.oldestMs, checkedAt: v.checkedAt };
+}
+
+export function setOldestCache(ds: string, view: string, value: OldestCache) {
+  write(`oldest:${ds}:${view}`, value);
+}
+
+export interface TimeModeCache {
+  mode: TimeMode;
+  checkedAt: number;
+}
+
+export function getTimeModeCache(ds: string, view: string): TimeModeCache | undefined {
+  const v = read<Partial<TimeModeCache> | null>(`tz:${ds}:${view}`, null);
+  const kind = v?.mode?.kind;
+  if (!v || typeof v.checkedAt !== 'number' || (kind !== 'aware' && kind !== 'naive')) {
+    return undefined;
+  }
+  if (kind === 'naive' && typeof (v.mode as { offsetMinutes?: unknown }).offsetMinutes !== 'number') {
+    return undefined;
+  }
+  return { mode: v.mode as TimeMode, checkedAt: v.checkedAt };
+}
+
+export function setTimeModeCache(ds: string, view: string, value: TimeModeCache) {
+  write(`tz:${ds}:${view}`, value);
+}
````

### 35/40 `src/state/timeRange.test.ts` (new file)

unit tests: 24-hour limit

PATCH-BLOCK 35/40 src/state/timeRange.test.ts old=none new=de58a3b635d2c30456ba329c8add0c6bfa8b8f40 sha256=a29d89f0fc1cb829a4269d10d74c2ff7cdca1017f485f65f474d8bc747c46287
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/state/timeRange.test.ts b/plugins/kotak-starrocks-logs-app/src/state/timeRange.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..de58a3b635d2c30456ba329c8add0c6bfa8b8f40
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/state/timeRange.test.ts
@@ -0,0 +1,57 @@
+import { dateTime, TimeRange } from '@grafana/data';
+
+import { capTimeRange, quickRangeMs } from './timeRange';
+
+const H = 3_600_000;
+
+function range(fromMs: number, toMs: number): TimeRange {
+  return { from: dateTime(fromMs), to: dateTime(toMs), raw: { from: dateTime(fromMs), to: dateTime(toMs) } };
+}
+
+describe('capTimeRange', () => {
+  const now = Date.UTC(2026, 10, 24, 14, 0);
+
+  it('leaves ranges up to the limit alone (with a minute of slack)', () => {
+    expect(capTimeRange('now-24h', 'now', range(now - 24 * H, now), 24 * H)).toBeUndefined();
+    expect(capTimeRange('now-15m', 'now', range(now - 15 * 60_000, now), 24 * H)).toBeUndefined();
+  });
+
+  it('keeps a relative range relative: now-7d..now becomes now-24h..now', () => {
+    expect(capTimeRange('now-7d', 'now', range(now - 7 * 24 * H, now), 24 * H)).toEqual({
+      from: 'now-24h',
+      to: 'now',
+    });
+    expect(capTimeRange('now-7d', 'now', range(now - 7 * 24 * H, now), 1.5 * H)).toEqual({
+      from: 'now-90m',
+      to: 'now',
+    });
+  });
+
+  it('a range ending in the future (zoom out) becomes the last 24 hours', () => {
+    expect(capTimeRange('a', 'b', range(now - 36 * H, now + 12 * H), 24 * H, now)).toEqual({
+      from: 'now-24h',
+      to: 'now',
+    });
+  });
+
+  it('cuts any other range to its last 24 hours, as absolute times', () => {
+    const to = Date.UTC(2026, 10, 20, 12, 0);
+    expect(
+      capTimeRange('2026-11-17T00:00:00.000Z', '2026-11-20T12:00:00.000Z', range(to - 84 * H, to), 24 * H)
+    ).toEqual({
+      from: '2026-11-19T12:00:00.000Z',
+      to: '2026-11-20T12:00:00.000Z',
+    });
+    expect(capTimeRange('now-3d', 'now-1d', range(now - 72 * H, now - 24 * H), 24 * H, now)?.to).toBe(
+      new Date(now - 24 * H).toISOString()
+    );
+  });
+});
+
+describe('quickRangeMs', () => {
+  it('reads now-N<unit> quick ranges', () => {
+    expect(quickRangeMs('now-12h')).toBe(12 * H);
+    expect(quickRangeMs('now-15m')).toBe(15 * 60_000);
+    expect(quickRangeMs('now/d')).toBeUndefined();
+  });
+});
````

### 36/40 `src/state/timeRange.ts` (new file)

the 24-hour limit

PATCH-BLOCK 36/40 src/state/timeRange.ts old=none new=7ec18956af2db3420139404388011151418e9e01 sha256=f953146440452edba9b83eeb674973f28e34ecaf8174cc4e9161814186d86b26
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/state/timeRange.ts b/plugins/kotak-starrocks-logs-app/src/state/timeRange.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7ec18956af2db3420139404388011151418e9e01
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/state/timeRange.ts
@@ -0,0 +1,33 @@
+import { rangeUtil, TimeRange } from '@grafana/data';
+
+// rounding of relative ranges ("now-24h" evaluated a moment later) is not a longer range
+const SLACK_MS = 60_000;
+
+/**
+ * The same range cut to at most maxMs, keeping its end: a range ending now (or later, as after "zoom out")
+ * becomes "now-24h".."now"; any other range becomes absolute (its last maxMs). Returns undefined when the
+ * range is not longer than maxMs.
+ */
+export function capTimeRange(
+  from: string,
+  to: string,
+  value: TimeRange,
+  maxMs: number,
+  nowMs = Date.now()
+): { from: string; to: string } | undefined {
+  if (value.to.valueOf() - value.from.valueOf() <= maxMs + SLACK_MS) {
+    return undefined;
+  }
+  if (to === 'now' || value.to.valueOf() >= nowMs - SLACK_MS) {
+    const minutes = Math.round(maxMs / 60_000);
+    return { from: minutes % 60 === 0 ? `now-${minutes / 60}h` : `now-${minutes}m`, to: 'now' };
+  }
+  const toMs = value.to.valueOf();
+  return { from: new Date(toMs - maxMs).toISOString(), to: new Date(toMs).toISOString() };
+}
+
+/** Length of a quick range like now-12h, or undefined. */
+export function quickRangeMs(from: string): number | undefined {
+  const m = /^now-(\d+[smhdwMy])$/.exec(from);
+  return m ? rangeUtil.intervalToMs(m[1]) : undefined;
+}
````

### 37/40 `tests/e2e/drilldown.spec.ts` (modified)

browser tests (33), local test stack only; not run by the pipeline

PATCH-BLOCK 37/40 tests/e2e/drilldown.spec.ts old=b0b502537faa6ecfa0ba4b840b6721013d61cfbb new=7a3eb03347b03e93d0c90a1eb15bc43f8511bdab sha256=a038d66d2d7ddcd03c004c256ab8850d55793ada4dcbafb242e844e86f1f3f12
````diff
diff --git a/plugins/kotak-starrocks-logs-app/tests/e2e/drilldown.spec.ts b/plugins/kotak-starrocks-logs-app/tests/e2e/drilldown.spec.ts
index b0b502537faa6ecfa0ba4b840b6721013d61cfbb..7a3eb03347b03e93d0c90a1eb15bc43f8511bdab 100644
--- a/plugins/kotak-starrocks-logs-app/tests/e2e/drilldown.spec.ts
+++ b/plugins/kotak-starrocks-logs-app/tests/e2e/drilldown.spec.ts
@@ -377,6 +377,8 @@ test.describe('as kmbl3e2e (two granted views)', () => {
     const href = await page.getByTestId('open-in-explore').getAttribute('href');
     expect(decodeURIComponent(href ?? '')).toContain('rawSql');
     expect(decodeURIComponent(href ?? '')).toContain(OBS);
+    // Explore runs it in UTC too (the e2e StarRocks session is Asia/Kolkata)
+    expect(decodeURIComponent(href ?? '')).toContain("SET_VAR(time_zone = '+00:00'");
   });
 
   test('labels tab: overview, value breakdown, include', async ({ page }) => {
@@ -436,16 +438,126 @@ test.describe('as kmbl3e2e (two granted views)', () => {
     await expect(logsMain(page)).not.toContainText('created order');
   });
 
-  test('long text scans are guarded; Run anyway runs them', async ({ page }) => {
+  test('long text search: the Logs tab is not blocked, lines come newest first, volume on request', async ({
+    page,
+  }) => {
+    // the e2e maxScanHours is 3: 6 hours with a line search was blocked before 0.4.0
+    const line = ['include', '0', '0', encodeURIComponent('timed out')].join('|');
+    await page.goto(
+      appUrl({ view: OBS, filter: filter('k8s_service_name', '=', 'proxy'), line, from: 'now-6h', to: 'now' })
+    );
+    await expect(logsMain(page)).toContainText('upstream timed out');
+    await expect(page.getByTestId('scan-guard')).toHaveCount(0);
+    await expect(page.getByTestId('volume-deferred')).toBeVisible();
+    await expect(page.getByTestId('volume-deferred')).toContainText('6 hours');
+    await page.screenshot({ path: `${SHOTS}/09-long-text-search.png` });
+    await page.getByRole('button', { name: 'Load volume' }).click();
+    await expect(page.getByTestId('volume-deferred')).toHaveCount(0);
+    await expect(page.getByText('Log volume', { exact: true })).toBeVisible();
+    await expect(logsMain(page)).toContainText('upstream timed out');
+  });
+
+  test('long text search: lines appear window by window with progress, and Stop ends the search', async ({ page }) => {
+    // slow down each window of the search (line queries with exact bounds and a text filter)
+    await page.route('**/api/ds/query**', async (route) => {
+      const body = route.request().postData() ?? '';
+      if (body.includes('microseconds_add') && body.includes('timed out')) {
+        await new Promise((r) => setTimeout(r, 3000));
+      }
+      await route.continue();
+    });
     const line = ['include', '0', '0', encodeURIComponent('timed out')].join('|');
     await page.goto(
       appUrl({ view: OBS, filter: filter('k8s_service_name', '=', 'proxy'), line, from: 'now-6h', to: 'now' })
     );
+    const status = page.getByTestId('search-status');
+    await expect(status).toContainText('Searching the log text, newest first');
+    // the newest window's lines are shown while older windows are still being read
+    await expect(logsMain(page)).toContainText('upstream timed out', { timeout: 15_000 });
+    await expect(status).toContainText(/\d+ lines found/);
+    await page.screenshot({ path: `${SHOTS}/15-search-progress.png` });
+    await status.getByRole('button', { name: 'Stop' }).click();
+    await expect(status).toContainText('Search stopped');
+    await expect(logsMain(page)).toContainText('upstream timed out');
+  });
+
+  test('long text scans on the Patterns tab still ask first; Run anyway runs them', async ({ page }) => {
+    await page.goto(
+      appUrl({
+        view: OBS,
+        filter: filter('k8s_service_name', '!=', 'nothing'),
+        tab: 'patterns',
+        from: 'now-6h',
+        to: 'now',
+      })
+    );
     await expect(page.getByTestId('scan-guard')).toBeVisible();
-    await page.screenshot({ path: `${SHOTS}/09-scan-guard.png` });
     await page.getByRole('button', { name: 'Run anyway' }).click();
     await expect(page.getByTestId('scan-guard')).toHaveCount(0);
-    await expect(logsMain(page)).toContainText('upstream timed out');
+  });
+
+  test('the time range is limited to 24 hours: typed ranges, links and zoom out', async ({ page }) => {
+    await page.goto(appUrl({ view: OBS, from: 'now-7d', to: 'now' }));
+    await expect(page.getByText('Time range limited to 24 hours')).toBeVisible();
+    await expect(page.getByTestId('data-testid TimePicker Open Button')).toContainText('Last 24 hours');
+    await expect(page).toHaveURL(/from=now-24h/);
+    await page.screenshot({ path: `${SHOTS}/13-range-limited.png` });
+    // zoom out from 24 hours stays at 24 hours
+    await page.getByRole('button', { name: /Zoom out time range/ }).click();
+    await expect(page.getByTestId('data-testid TimePicker Open Button')).toContainText('Last 24 hours');
+    // an absolute range of 3 days keeps its end and is cut to its last 24 hours
+    const end = Date.now() - 3_600_000;
+    await page.goto(appUrl({ view: OBS, from: String(end - 3 * 86_400_000), to: String(end) }));
+    await expect(page.getByText('Time range limited to 24 hours')).toBeVisible();
+    await expect
+      .poll(() => {
+        const u = new URL(page.url());
+        const from = Date.parse(u.searchParams.get('from') ?? '') || Number(u.searchParams.get('from'));
+        const to = Date.parse(u.searchParams.get('to') ?? '') || Number(u.searchParams.get('to'));
+        return Math.round((to - from) / 3_600_000);
+      })
+      .toBe(24);
+  });
+
+  test('times are right although the StarRocks session is Asia/Kolkata; "Oldest log" shows the oldest line', async ({
+    page,
+  }) => {
+    await page.goto(appUrl({ view: OBS, filter: filter('k8s_service_name', '=', 'otel-collector') }));
+    const first = logsMain(page).locator('tr').first();
+    await expect(first).toContainText('ts=');
+    const text = (await first.textContent()) ?? '';
+    const shown = /\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}/.exec(text)?.[0];
+    const utcInMessage = /ts=(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3})\d{3}Z/.exec(text)?.[1];
+    expect(shown && utcInMessage).toBeTruthy();
+    // the time shown (browser zone) is the time written in the line (UTC), not 5 h 30 min later
+    const diffMs = await page.evaluate(
+      ([s, u]) => new Date(s.replace(' ', 'T')).getTime() - Date.parse(u + 'Z'),
+      [shown!, utcInMessage!]
+    );
+    expect(diffMs).toBe(0);
+
+    const oldest = page.getByTestId('oldest-log');
+    await expect(oldest).toContainText('Oldest log');
+    await expect(oldest).toContainText(/\d{1,2} [A-Z][a-z]{2} \d{4} \d\d:\d\d/);
+    // the seed spans 4 hours: the oldest line is about 4 hours before the newest one
+    const hours = await oldest.evaluate((el, newest) => {
+      const m = /(\d{1,2} [A-Z][a-z]{2} \d{4} \d\d:\d\d)/.exec(el.textContent ?? '');
+      return m ? (new Date(newest.replace(' ', 'T')).getTime() - new Date(m[1]).getTime()) / 3_600_000 : NaN;
+    }, shown!);
+    expect(hours).toBeGreaterThan(3.8);
+    expect(hours).toBeLessThan(4.1);
+    await page.screenshot({ path: `${SHOTS}/14-oldest-log.png` });
+  });
+
+  test('a time range before the oldest log says so and offers the first hours of logs', async ({ page }) => {
+    const end = Date.now() - 10 * 86_400_000;
+    await page.goto(appUrl({ view: OBS, page: 'details', from: String(end - 3_600_000), to: String(end) }));
+    const notice = page.getByTestId('before-oldest');
+    await expect(notice).toContainText('No logs in this time range');
+    await page.screenshot({ path: `${SHOTS}/16-before-oldest.png` });
+    await notice.getByRole('button', { name: /Show the first 24 hours of logs/ }).click();
+    await expect(page.getByTestId('before-oldest')).toHaveCount(0);
+    await expect(logsMain(page).locator('tr').first()).toBeVisible();
   });
 
   test('state is in the URL: reload keeps filters, back returns to the service grid', async ({ page }) => {
````

### 38/40 `tests/smoke/helpers.ts` (new file)

API test helpers, local test stack only

PATCH-BLOCK 38/40 tests/smoke/helpers.ts old=none new=d02f8fba88a892ff589b0b68fcf60b4ec6a091b0 sha256=eb8bb9d5fb034aca7fa0ba601f2a425f4b958cb8e3b718d5822d0329ae0ecc9b
````diff
diff --git a/plugins/kotak-starrocks-logs-app/tests/smoke/helpers.ts b/plugins/kotak-starrocks-logs-app/tests/smoke/helpers.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d02f8fba88a892ff589b0b68fcf60b4ec6a091b0
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/tests/smoke/helpers.ts
@@ -0,0 +1,115 @@
+/**
+ * Shared by the API-level e2e tests: sign-in through the mock IDAM, SQL through Grafana's /api/ds/query and the
+ * unchanged kotak-starrocks-datasource, and the app's time zone probe (src/sql/timeZone.ts).
+ */
+import { newestTimeTextQuery, queryHint, sessionZoneQuery, withQueryHint } from '../../src/sql/builder';
+import { decideTimeMode, PROBE_ZONES, TimeMode, zoneForMode } from '../../src/sql/timeZone';
+
+export const GRAFANA = process.env.GRAFANA_URL ?? 'http://localhost:23000';
+export const DS = { uid: 'e2e-ds-starrocks-logs', type: 'kotak-starrocks-datasource' };
+// second StarRocks database = second instance of the data source plugin
+export const DS2 = { uid: 'e2e-ds-starrocks-logs2', type: 'kotak-starrocks-datasource' };
+
+const defaultHints = new Map<string, string>();
+
+/** The hint sent with every statement on this data source unless a test passes its own. */
+export function setDefaultHint(ds: { uid: string }, hint: string) {
+  defaultHints.set(ds.uid, hint);
+}
+
+/** The app's hint for a time column kind (queryTimeoutSeconds default 120). */
+export function appHint(mode: TimeMode): string {
+  return queryHint({ timeZone: zoneForMode(mode), timeoutSeconds: 120 });
+}
+
+/** Same probe as src/datasource/timeZone.ts: newest line in two zones, plus the session's own offset. */
+export async function detectMode(s: Session, view: string, ds = DS): Promise<TimeMode> {
+  const probe = async (zone: string) =>
+    (
+      await s.sql(newestTimeTextQuery(view), 'now-1h', 'now', ds, {
+        hint: queryHint({ timeZone: zone, timeoutSeconds: 30 }),
+      })
+    )[0]?.t as string | undefined;
+  const t0 = await probe(PROBE_ZONES[0]);
+  const t1 = await probe(PROBE_ZONES[1]);
+  const [z] = await s.sql(sessionZoneQuery(), 'now-1h', 'now', ds, { hint: '' });
+  return decideTimeMode(t0, t1, Date.now(), Math.round(Number(z.off) / 15) * 15);
+}
+
+export class Session {
+  private cookies = new Map<string, string>();
+  constructor(readonly user: string) {}
+
+  private header() {
+    return Array.from(this.cookies.entries())
+      .map(([k, v]) => `${k}=${v}`)
+      .join('; ');
+  }
+
+  private store(res: Response) {
+    for (const c of res.headers.getSetCookie()) {
+      const [kv] = c.split(';');
+      const i = kv.indexOf('=');
+      this.cookies.set(kv.slice(0, i), kv.slice(i + 1));
+    }
+  }
+
+  async login() {
+    let res = await fetch(`${GRAFANA}/login/generic_oauth`, { redirect: 'manual' });
+    this.store(res);
+    const authorize = res.headers.get('location')!;
+    // the mock IDAM puts these claims into the ID and access tokens
+    const claims = { aud: ['grafana-e2e'], email: `${this.user}@kotak.com` };
+    const form = new URLSearchParams({ username: this.user, claims: JSON.stringify(claims) });
+    res = await fetch(authorize, { method: 'POST', body: form, redirect: 'manual' });
+    const callback = res.headers.get('location')!;
+    res = await fetch(callback, { headers: { cookie: this.header() }, redirect: 'manual' });
+    this.store(res);
+    const me = await (await fetch(`${GRAFANA}/api/user`, { headers: { cookie: this.header() } })).json();
+    expect(me.login).toBe(this.user);
+  }
+
+  /**
+   * Runs SQL as this user, with the data source's hint (setDefaultHint) like the app's runSql (hint: '' sends
+   * none); returns rows as objects, or throws with the datasource error.
+   */
+  async sql(
+    rawSql: string,
+    from = 'now-6h',
+    to = 'now',
+    ds = DS,
+    opts: { hint?: string; signal?: AbortSignal } = {}
+  ): Promise<Array<Record<string, unknown>>> {
+    const res = await fetch(`${GRAFANA}/api/ds/query`, {
+      method: 'POST',
+      headers: { cookie: this.header(), 'content-type': 'application/json' },
+      body: JSON.stringify({
+        from,
+        to,
+        queries: [
+          {
+            refId: 'A',
+            datasource: ds,
+            rawSql: withQueryHint(rawSql, opts.hint ?? defaultHints.get(ds.uid) ?? ''),
+            format: 'table',
+            rawQuery: true,
+          },
+        ],
+      }),
+      signal: opts.signal,
+    });
+    const body = await res.json();
+    const r = body.results?.A;
+    if (!r || r.error) {
+      throw new Error(r?.error ?? JSON.stringify(body));
+    }
+    const frame = r.frames?.[0];
+    if (!frame) {
+      return [];
+    }
+    const names: string[] = frame.schema.fields.map((f: { name: string }) => f.name);
+    const cols: unknown[][] = frame.data?.values ?? [];
+    const n = cols[0]?.length ?? 0;
+    return Array.from({ length: n }, (_, i) => Object.fromEntries(names.map((name, j) => [name, cols[j][i]])));
+  }
+}
````

### 39/40 `tests/smoke/iceberg.test.ts` (new file)

API tests on real Iceberg tables (14), local test stack only

PATCH-BLOCK 39/40 tests/smoke/iceberg.test.ts old=none new=f328cfda30f650713df98666bd8b171a85c8046b sha256=f6789a2b8c5726d96d58df7dd4dbad6533d2f3b89e8162406653c955be48391d
````diff
diff --git a/plugins/kotak-starrocks-logs-app/tests/smoke/iceberg.test.ts b/plugins/kotak-starrocks-logs-app/tests/smoke/iceberg.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f328cfda30f650713df98666bd8b171a85c8046b
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/tests/smoke/iceberg.test.ts
@@ -0,0 +1,165 @@
+/**
+ * The app's queries on REAL Iceberg tables (scripts/e2e.sh iceberg, then iceberg-smoke), on the StarRocks
+ * version of UAT, with the session in Asia/Kolkata like UAT:
+ *   vw_eks_app_logs_app_9100_icebergtz   observed_timestamp is an Iceberg timestamptz
+ *   vw_eks_app_logs_app_9200_icebergntz  observed_timestamp is an Iceberg timestamp holding IST wall-clock time
+ * Both tables are partitioned by identity(app_id) and hour(observed_timestamp), like UAT's eks_app_logs.
+ */
+import { resolveConfig, resolveTenant } from '../../src/config/config';
+import { DEFAULT_FIELDS, DEFAULT_LABELS } from '../../src/constants';
+import { findOldest } from '../../src/datasource/oldestSearch';
+import {
+  anyBeforeQuery,
+  BuildContext,
+  contextQuery,
+  logsQuery,
+  oldestInRangeQuery,
+  planWindows,
+  timeMsExpr,
+  volumeQuery,
+  widenToSeconds,
+} from '../../src/sql/builder';
+import { emptySpec, QuerySpec } from '../../src/state/types';
+import { appHint, detectMode, DS, Session } from './helpers';
+
+const TZ_VIEW = 'vw_eks_app_logs_app_9100_icebergtz';
+const NTZ_VIEW = 'vw_eks_app_logs_app_9200_icebergntz';
+const COLUMNS = [
+  'observed_timestamp',
+  'message',
+  'level',
+  'app_id',
+  'level_parser',
+  ...DEFAULT_LABELS,
+  ...DEFAULT_FIELDS,
+];
+const H = 3_600_000;
+
+const run = process.env.ICEBERG === '1' ? describe : describe.skip;
+const user = new Session('kmbl3iceberg');
+
+function ctx(view: string): BuildContext {
+  const { config } = resolveConfig({ tenants: { default: { level: { source: 'column' } } } });
+  return {
+    tenant: resolveTenant(config, view, DS.uid),
+    columns: COLUMNS,
+    labels: DEFAULT_LABELS,
+    fields: DEFAULT_FIELDS,
+  };
+}
+
+const otel = (view: string, p: Partial<QuerySpec> = {}): QuerySpec => ({
+  ...emptySpec(view, DS.uid),
+  filters: [{ key: 'k8s_service_name', op: '=', value: 'otel-collector' }],
+  ...p,
+});
+const inMessage = (r: Record<string, unknown>) => Date.parse(/ts=(\S+?)\d{3}Z/.exec(String(r.message))![1] + 'Z');
+
+run('real Iceberg tables on the UAT StarRocks version (session Asia/Kolkata)', () => {
+  beforeAll(async () => {
+    await user.login();
+  });
+
+  it('runs the UAT StarRocks version, session in Asia/Kolkata', async () => {
+    const [v] = await user.sql('SELECT current_version() AS v, @@time_zone AS tz', 'now-1h', 'now', DS, { hint: '' });
+    expect(String(v.v)).toMatch(/^4\.1\.6/);
+    expect(v.tz).toBe('Asia/Kolkata');
+  });
+
+  it('the probe: timestamptz is an instant (shown in the session zone); the IST timestamp is wall clock', async () => {
+    expect(await detectMode(user, TZ_VIEW)).toEqual({ kind: 'aware' });
+    expect(await detectMode(user, NTZ_VIEW)).toEqual({ kind: 'naive', offsetMinutes: 330 });
+  });
+
+  for (const view of [TZ_VIEW, NTZ_VIEW]) {
+    describe(view, () => {
+      let hint = '';
+      beforeAll(async () => {
+        hint = appHint(await detectMode(user, view));
+      });
+      const q = (sql: string, from: string, to: string) => user.sql(sql, from, to, DS, { hint });
+
+      it('line times equal the time in the message', async () => {
+        const rows = await q(logsQuery(otel(view), ctx(view), 300, 'desc'), 'now-12h', 'now+12h');
+        expect(rows.length).toBe(300);
+        rows.forEach((r) => expect(Number(r.__ms)).toBe(inMessage(r)));
+      });
+
+      it('the time filter selects by real time; windows of a text search join exactly', async () => {
+        const [newest] = await q(logsQuery(otel(view), ctx(view), 1, 'desc'), 'now-12h', 'now+12h');
+        const toMs = Number(newest.__ms);
+        const fromMs = toMs - 4 * H;
+        const text = otel(view, {
+          lineFilters: [{ op: 'include', value: 'timed out', caseSensitive: false, regex: false }],
+        });
+        const page = async (f: number, t: number) => {
+          const w = widenToSeconds(f, t);
+          return q(logsQuery(text, ctx(view), 5000, 'desc', { fromMs: f, toMs: t }), String(w.fromMs), String(w.toMs));
+        };
+        const whole = await page(fromMs, toMs);
+        expect(whole.length).toBeGreaterThan(20);
+        whole.forEach((r) => {
+          expect(inMessage(r)).toBeGreaterThanOrEqual(fromMs);
+          expect(inMessage(r)).toBeLessThanOrEqual(toMs);
+        });
+        const parts: Array<Record<string, unknown>> = [];
+        for (const w of planWindows(fromMs, toMs, 'desc')) {
+          parts.push(...(await page(w.fromMs, w.toMs)));
+        }
+        expect(parts.map((r) => `${r.__ts}|${r.message}`)).toEqual(whole.map((r) => `${r.__ts}|${r.message}`));
+      });
+
+      it('volume buckets count lines by real time', async () => {
+        const [newest] = await q(logsQuery(otel(view), ctx(view), 1, 'desc'), 'now-12h', 'now+12h');
+        const to = Math.ceil(Number(newest.__ms) / 3_600_000) * 3_600_000;
+        const rows = await q(volumeQuery(otel(view), ctx(view), 3600), String(to - 6 * H), String(to));
+        const buckets = rows.map((r) => Number(r.t) * 1000);
+        expect(Math.max(...buckets)).toBe(to - H);
+      });
+
+      it('show context: the same pod before a line', async () => {
+        const [line] = await q(logsQuery(otel(view), ctx(view), 1, 'desc'), 'now-12h', 'now+12h');
+        const back = await q(
+          contextQuery(view, ctx(view), 'k8s_pod_uid', String(line.k8s_pod_uid), String(line.__ts), 'backward', 10),
+          String(Number(line.__ms) - H),
+          String(Number(line.__ms) + H)
+        );
+        expect(back).toHaveLength(10);
+        back.forEach((r) => expect(Number(r.__ms)).toBeLessThan(Number(line.__ms)));
+      });
+
+      it('"Oldest log": LIMIT 1 probes find the same oldest line as MIN over the whole view', async () => {
+        const [{ oldest: expected }] = await q(
+          `SELECT ${timeMsExpr('MIN(observed_timestamp)')} AS oldest FROM ${view}`,
+          'now-1h',
+          'now'
+        );
+        const found = await findOldest(
+          Date.now(),
+          async (ms) => (await q(anyBeforeQuery(view, ms), 'now-1h', 'now')).length > 0,
+          async (a, b) => {
+            const [r] = await q(oldestInRangeQuery(view, a, b), 'now-1h', 'now');
+            return r?.oldest === null || r?.oldest === undefined ? undefined : Number(r.oldest);
+          }
+        );
+        expect(found).toBe(Number(expected));
+      });
+
+      it('partition pruning: a one-hour line query reads one or two of the hourly partitions', async () => {
+        const [newest] = await q(logsQuery(otel(view), ctx(view), 1, 'desc'), 'now-12h', 'now+12h');
+        const to = Number(newest.__ms);
+        const w = widenToSeconds(to - H, to);
+        const plan = await q(
+          `EXPLAIN VERBOSE ${logsQuery(otel(view), ctx(view), 100, 'desc', { fromMs: to - H, toMs: to })}`,
+          String(w.fromMs),
+          String(w.toMs)
+        );
+        const text = plan.map((r) => String(Object.values(r)[0])).join('\n');
+        const m = /partitions=(\d+)\/(\d+)/.exec(text);
+        expect(m).toBeTruthy();
+        expect(Number(m![1])).toBeLessThanOrEqual(2);
+        expect(Number(m![2])).toBeGreaterThanOrEqual(4);
+      });
+    });
+  }
+});
````

### 40/40 `tests/smoke/smoke.test.ts` (modified)

API tests (31), local test stack only; not run by the pipeline

PATCH-BLOCK 40/40 tests/smoke/smoke.test.ts old=9f144f8a3e92408f4905855634295672194645cf new=1498392c2b8a41595a9def1301dd15138e5ffdae sha256=31e402bf15ac0295c0685c319244b64acbe6cb8cd43dcd11ffa729cc02f7a949
````diff
diff --git a/plugins/kotak-starrocks-logs-app/tests/smoke/smoke.test.ts b/plugins/kotak-starrocks-logs-app/tests/smoke/smoke.test.ts
index 9f144f8a3e92408f4905855634295672194645cf..1498392c2b8a41595a9def1301dd15138e5ffdae 100644
--- a/plugins/kotak-starrocks-logs-app/tests/smoke/smoke.test.ts
+++ b/plugins/kotak-starrocks-logs-app/tests/smoke/smoke.test.ts
@@ -5,26 +5,28 @@
  */
 import { resolveConfig, resolveTenant, AppJsonData } from '../../src/config/config';
 import {
+  anyBeforeQuery,
   BuildContext,
   contextQuery,
   fieldBreakdownQuery,
   labelOverviewQuery,
   logsQuery,
+  oldestInRangeQuery,
   patternsQuery,
+  planWindows,
   serviceSamplesQuery,
+  timeMsExpr,
   serviceVolumeQuery,
   valueBreakdownQuery,
   viewsQuery,
   volumeQuery,
   widenToSeconds,
 } from '../../src/sql/builder';
+import { findOldest } from '../../src/datasource/oldestSearch';
+import { appHint, detectMode, DS, DS2, Session, setDefaultHint } from './helpers';
 import { DEFAULT_FIELDS, DEFAULT_LABELS } from '../../src/constants';
 import { emptySpec, QuerySpec } from '../../src/state/types';
 
-const GRAFANA = process.env.GRAFANA_URL ?? 'http://localhost:23000';
-const DS = { uid: 'e2e-ds-starrocks-logs', type: 'kotak-starrocks-datasource' };
-// second StarRocks database = second instance of the data source plugin
-const DS2 = { uid: 'e2e-ds-starrocks-logs2', type: 'kotak-starrocks-datasource' };
 const PAYMENTS = 'vw_eks_app_logs_app_04000_payments';
 const OBS = 'vw_eks_app_logs_app_1961_observability';
 const CMM = 'vw_eks_app_logs_app_01996_frontlineplatforms_cmm';
@@ -49,66 +51,6 @@ const JSON_DATA: AppJsonData = {
   },
 };
 
-class Session {
-  private cookies = new Map<string, string>();
-  constructor(readonly user: string) {}
-
-  private header() {
-    return Array.from(this.cookies.entries())
-      .map(([k, v]) => `${k}=${v}`)
-      .join('; ');
-  }
-
-  private store(res: Response) {
-    for (const c of res.headers.getSetCookie()) {
-      const [kv] = c.split(';');
-      const i = kv.indexOf('=');
-      this.cookies.set(kv.slice(0, i), kv.slice(i + 1));
-    }
-  }
-
-  async login() {
-    let res = await fetch(`${GRAFANA}/login/generic_oauth`, { redirect: 'manual' });
-    this.store(res);
-    const authorize = res.headers.get('location')!;
-    // the mock IDAM puts these claims into the ID and access tokens
-    const claims = { aud: ['grafana-e2e'], email: `${this.user}@kotak.com` };
-    const form = new URLSearchParams({ username: this.user, claims: JSON.stringify(claims) });
-    res = await fetch(authorize, { method: 'POST', body: form, redirect: 'manual' });
-    const callback = res.headers.get('location')!;
-    res = await fetch(callback, { headers: { cookie: this.header() }, redirect: 'manual' });
-    this.store(res);
-    const me = await (await fetch(`${GRAFANA}/api/user`, { headers: { cookie: this.header() } })).json();
-    expect(me.login).toBe(this.user);
-  }
-
-  /** Runs SQL as this user; returns rows as objects, or throws with the datasource error. */
-  async sql(rawSql: string, from = 'now-6h', to = 'now', ds = DS): Promise<Array<Record<string, unknown>>> {
-    const res = await fetch(`${GRAFANA}/api/ds/query`, {
-      method: 'POST',
-      headers: { cookie: this.header(), 'content-type': 'application/json' },
-      body: JSON.stringify({
-        from,
-        to,
-        queries: [{ refId: 'A', datasource: ds, rawSql, format: 'table', rawQuery: true }],
-      }),
-    });
-    const body = await res.json();
-    const r = body.results?.A;
-    if (!r || r.error) {
-      throw new Error(r?.error ?? JSON.stringify(body));
-    }
-    const frame = r.frames?.[0];
-    if (!frame) {
-      return [];
-    }
-    const names: string[] = frame.schema.fields.map((f: { name: string }) => f.name);
-    const cols: unknown[][] = frame.data?.values ?? [];
-    const n = cols[0]?.length ?? 0;
-    return Array.from({ length: n }, (_, i) => Object.fromEntries(names.map((name, j) => [name, cols[j][i]])));
-  }
-}
-
 const COLUMNS = [
   'observed_timestamp',
   'message',
@@ -134,9 +76,15 @@ function spec(view: string, p: Partial<QuerySpec> = {}, ds = DS): QuerySpec {
 }
 
 const e2e = new Session('kmbl3e2e');
+// what the seed's views are like (seed.py VIEW_TIME / FE_TIME_ZONE)
+const VIEW_TIME = process.env.VIEW_TIME ?? 'session';
+const FE_TIME_ZONE = process.env.FE_TIME_ZONE ?? 'Asia/Kolkata';
 
 beforeAll(async () => {
   await e2e.login();
+  // like the app: detect each database's time column kind, then send that hint with every statement
+  setDefaultHint(DS, appHint(await detectMode(e2e, OBS, DS)));
+  setDefaultHint(DS2, appHint(await detectMode(e2e, OBS, DS2)));
 });
 
 describe('per-user access (StarRocks grants stand in for Ranger)', () => {
@@ -188,7 +136,7 @@ describe('every query kind runs on StarRocks (observability view, level from mes
     const rows = await e2e.sql(logsQuery(spec(OBS), c, 50, 'desc'));
     expect(rows).toHaveLength(50);
     expect(String(rows[0].__ts)).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{6}$/);
-    expect(Number(rows[0].observed_timestamp)).toBeGreaterThanOrEqual(Number(rows[49].observed_timestamp));
+    expect(Number(rows[0].__ms)).toBeGreaterThanOrEqual(Number(rows[49].__ms));
     expect(rows[0]).toHaveProperty('k8s_pod_uid');
   });
 
@@ -203,17 +151,17 @@ describe('every query kind runs on StarRocks (observability view, level from mes
     const key = (r: Record<string, unknown>) => `${r.__ts}|${r.k8s_pod_uid}|${r.message}`;
     const p1 = await page(toMs, 1000);
     expect(p1).toHaveLength(1000);
-    const oldest1 = Number(p1[999].observed_timestamp);
+    const oldest1 = Number(p1[999].__ms);
     const p2 = await page(oldest1, 1000);
     expect(p2).toHaveLength(1000);
     // page 2 starts within the last millisecond of page 1 (the overlap is removed by line id)
-    expect(Number(p2[0].observed_timestamp)).toBeLessThanOrEqual(oldest1 + 1);
+    expect(Number(p2[0].__ms)).toBeLessThanOrEqual(oldest1 + 1);
     const merged = new Map([...p1, ...p2].map((r) => [key(r), r]));
     expect(merged.size).toBeGreaterThan(1500);
     // no gap: every line of one 2500-line query down to page 2's oldest millisecond is in the two pages
-    const oldest2 = Number(p2[999].observed_timestamp);
+    const oldest2 = Number(p2[999].__ms);
     const all = await page(toMs, 2500);
-    const expected = all.filter((r) => Number(r.observed_timestamp) > oldest2);
+    const expected = all.filter((r) => Number(r.__ms) > oldest2);
     expect(expected.length).toBeGreaterThan(1500);
     expect(expected.filter((r) => !merged.has(key(r)))).toEqual([]);
   });
@@ -347,6 +295,153 @@ describe('every query kind runs on StarRocks (observability view, level from mes
   });
 });
 
+describe(`time zone: session ${FE_TIME_ZONE}, views show the time column as "${VIEW_TIME}"`, () => {
+  const c = ctx(OBS);
+  // otel-collector lines carry their UTC time in the message (ts=...Z), like the UAT screenshots
+  const otel = spec(OBS, { filters: [{ key: 'k8s_service_name', op: '=', value: 'otel-collector' }] });
+  const inMessage = (r: Record<string, unknown>) => Date.parse(/ts=(\S+?)\d{3}Z/.exec(String(r.message))![1] + 'Z');
+  const sessionOffsetMin = FE_TIME_ZONE === 'Asia/Kolkata' ? 330 : 0;
+
+  it('the session zone is the FE default', async () => {
+    const [tz] = await e2e.sql('SELECT @@time_zone AS tz', 'now-6h', 'now', DS, { hint: '' });
+    expect(tz.tz).toBe(FE_TIME_ZONE);
+  });
+
+  it('the probe tells the kind of time column: instant (timestamptz) or wall clock in IST or UTC', async () => {
+    const mode = await detectMode(e2e, OBS, DS);
+    const expected = {
+      session: { kind: 'aware' },
+      ist: { kind: 'naive', offsetMinutes: 330 },
+      utc: { kind: 'naive', offsetMinutes: 0 },
+    };
+    expect(mode).toEqual(expected[VIEW_TIME as keyof typeof expected]);
+  });
+
+  it('with the app hint, every line time (__ms) is the time written in the message, and __ts is the same instant', async () => {
+    const rows = await e2e.sql(logsQuery(otel, c, 200, 'desc'), 'now-12h', 'now+12h');
+    expect(rows.length).toBe(200);
+    rows.forEach((r) => expect(Number(r.__ms)).toBe(inMessage(r)));
+  });
+
+  it('the time filter (FROM_UNIXTIME in the same zone) selects lines by their real time', async () => {
+    const [newest] = await e2e.sql(logsQuery(otel, c, 1, 'desc'), 'now-12h', 'now+12h');
+    const to = Number(newest.__ms) + 1000;
+    const from = to - 15 * 60_000;
+    const rows = await e2e.sql(logsQuery(otel, c, 5000, 'desc'), String(from), String(to));
+    expect(rows.length).toBeGreaterThan(0);
+    rows.forEach((r) => {
+      expect(inMessage(r)).toBeGreaterThanOrEqual(from - 1000);
+      expect(inMessage(r)).toBeLessThanOrEqual(to);
+    });
+    // and nothing in that window is missing: count by message time over a wider window
+    const wide = await e2e.sql(logsQuery(otel, c, 5000, 'desc'), String(from - 3_600_000), String(to + 60_000));
+    const inWindow = wide.filter((r) => inMessage(r) >= from - 1000 + 1000 && inMessage(r) <= to - 1000);
+    const got = new Set(rows.map((r) => String(r.message)));
+    expect(inWindow.filter((r) => !got.has(String(r.message)))).toEqual([]);
+  });
+
+  it('0.3.0 read the raw DATETIME as UTC: off by the zone the view shows it in', async () => {
+    const [raw] = await e2e.sql(
+      `SELECT observed_timestamp, message FROM ${OBS} WHERE k8s_service_name = 'otel-collector' ORDER BY observed_timestamp DESC LIMIT 1`,
+      'now-1h',
+      'now',
+      DS,
+      { hint: '' }
+    );
+    const shownIn = { session: sessionOffsetMin, ist: 330, utc: 0 }[VIEW_TIME] ?? 0;
+    expect(Math.round((Number(raw.observed_timestamp) - inMessage(raw)) / 60_000)).toBe(shownIn);
+  });
+
+  it('a hinted statement also sets query_timeout', async () => {
+    const [r] = await e2e.sql('SELECT @@query_timeout AS qt');
+    expect(r.qt).toBe(120);
+  });
+});
+
+describe('newest-first windowed search (text filters over long ranges)', () => {
+  const c = ctx(OBS);
+  const text = spec(OBS, { lineFilters: [{ op: 'include', value: 'timed out', caseSensitive: false, regex: false }] });
+
+  it('the windows together return exactly the lines of one query over the whole range', async () => {
+    const toMs = Date.now();
+    const fromMs = toMs - 4 * 3_600_000;
+    const windows = planWindows(fromMs, toMs, 'desc');
+    expect(windows.length).toBeGreaterThan(1);
+    const run = async (fromW: number, toW: number, limit: number) => {
+      const w = widenToSeconds(fromW, toW);
+      return e2e.sql(logsQuery(text, c, limit, 'desc', { fromMs: fromW, toMs: toW }), String(w.fromMs), String(w.toMs));
+    };
+    const whole = await run(fromMs, toMs, 5000);
+    expect(whole.length).toBeGreaterThan(20);
+    const parts: Array<Record<string, unknown>> = [];
+    for (const w of windows) {
+      parts.push(...(await run(w.fromMs, w.toMs, 5000)));
+    }
+    const key = (r: Record<string, unknown>) => `${r.__ts}|${r.k8s_pod_uid}|${r.message}`;
+    expect(parts.map(key)).toEqual(whole.map(key));
+  });
+
+  it('the newest window alone gives the newest lines when it has enough', async () => {
+    const toMs = Date.now();
+    const [newest] = planWindows(toMs - 4 * 3_600_000, toMs, 'desc');
+    const w = widenToSeconds(newest.fromMs, newest.toMs);
+    const first = await e2e.sql(logsQuery(text, c, 10, 'desc', newest), String(w.fromMs), String(w.toMs));
+    const ww = widenToSeconds(toMs - 4 * 3_600_000, toMs);
+    const whole = await e2e.sql(
+      logsQuery(text, c, 10, 'desc', { fromMs: toMs - 4 * 3_600_000, toMs }),
+      String(ww.fromMs),
+      String(ww.toMs)
+    );
+    expect(first.map((r) => r.__ts)).toEqual(whole.map((r) => r.__ts));
+  });
+});
+
+describe('oldest line of a view ("Oldest log")', () => {
+  it('LIMIT 1 probes and a MIN over one hour find the same time as MIN over the whole view', async () => {
+    const [{ oldest: expected }] = await e2e.sql(
+      `SELECT ${timeMsExpr('MIN(observed_timestamp)')} AS oldest FROM ${OBS}`
+    );
+    let probes = 0;
+    const anyBefore = async (ms: number) => {
+      probes++;
+      return (await e2e.sql(anyBeforeQuery(OBS, ms))).length > 0;
+    };
+    const oldestIn = async (a: number, b: number) => {
+      const [r] = await e2e.sql(oldestInRangeQuery(OBS, a, b));
+      return r?.oldest === null || r?.oldest === undefined ? undefined : Number(r.oldest);
+    };
+    const found = await findOldest(Date.now(), anyBefore, oldestIn);
+    expect(found).toBe(Number(expected));
+    expect(probes).toBeLessThan(15);
+  });
+});
+
+describe('cancelling', () => {
+  it('a cancelled request stops the StarRocks query (the data source closes the connection)', async () => {
+    const marker = `cancel_probe_${Date.now()}`;
+    const ctl = new AbortController();
+    const running = e2e.sql(`SELECT sleep(30) AS ${marker}`, 'now-1h', 'now', DS, { signal: ctl.signal });
+    running.catch(() => undefined);
+    const listed = async () =>
+      (await e2e.sql('SHOW FULL PROCESSLIST', 'now-1h', 'now', DS, { hint: '' })).some((r) =>
+        String(r.Info ?? '').includes(marker)
+      );
+    let seen = false;
+    for (let i = 0; i < 20 && !seen; i++) {
+      await new Promise((r) => setTimeout(r, 250));
+      seen = await listed();
+    }
+    expect(seen).toBe(true);
+    ctl.abort();
+    let gone = false;
+    for (let i = 0; i < 40 && !gone; i++) {
+      await new Promise((r) => setTimeout(r, 250));
+      gone = !(await listed());
+    }
+    expect(gone).toBe(true);
+  }, 30_000);
+});
+
 describe('level column tenant (cmm)', () => {
   it('normalises Warning, fatal, notice and empty level values', async () => {
     const rows = await e2e.sql(volumeQuery(spec(CMM), ctx(CMM), 3600));
````
