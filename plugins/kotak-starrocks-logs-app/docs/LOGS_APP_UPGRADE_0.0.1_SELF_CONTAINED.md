# Logs Drilldown (StarRocks): upgrade 0.4.0 → 0.0.1 (self-contained, for the org PC)

## For the person giving this file to Claude

1. Copy this file as **raw text** (GitHub "Raw" view, or a text editor), not from a rendered preview. The
   patch lines must stay exactly as they are; chat messages and email bodies wrap long lines.
2. On the org PC, save it as for example `~/plugin-poc/LOGS_APP_UPGRADE_0.0.1.md`.
3. Start Claude Code in the org plugin repo and say:
   *"Read ~/plugin-poc/LOGS_APP_UPGRADE_0.0.1.md and follow the instructions for the agent in it."*

**Version number:** this release is numbered **0.0.1** on purpose (the owner's choice), although it comes after
0.4.0. Always name `0.0.1` explicitly; anything that picks "the latest version" would pick 0.4.0.

What 0.0.1 changes for users (the fixes for the UAT screen recording of 0.4.0):
- **The refresh button spins** while queries run, and "Loading … Cancel" shows in the page bar. Clicking either
  cancels the running queries.
- **Layout across the journey.** Row 1: label filter on the left; data source, view, time and refresh on the
  right, and they no longer move between pages. Row 2 (page bar): Show logs / Back on the left; the 24-hour notice,
  Loading and **Oldest log** on the right. The logs page fits the window: only the list scrolls, not the page. A
  **Volume** switch hides the chart. The grid's page buttons sit next to "Showing 20 of N".
- **Fast service grid.** For tenants whose level is read from the message (observability: its `level` column
  is empty), the grid shows plain volumes by default, and levels on **Split by level**; over an hour these are
  estimated from 1 in 10 lines. UAT lab: 24 hours went from 66.6 s to 4.8 s without levels.
- **Better levels.** nginx `[info]`/`[warn]`/`[error]`, zap (tab-separated), glog and the HTTP status of access
  logs are recognised (UAT lab: "unknown" from 54 % to 23 % of lines). Where the pipeline fills `level`, the
  column is used instead of the message, automatically.
- **Lines first.** The newest lines come from a cheap top-N query and the level is computed only on the lines
  returned; the volume chart starts after them.
- **Back is instant** (results are kept for 5 minutes), and loading states are visible (placeholder rows with a
  timer, "Loading…" badges on panels).
- **Show context** shows what it matched (pod, namespace, service) and how to pin, keeps lines that share the
  exact microsecond with the clicked line (42 % of UAT lines have such a twin), and orders lines below the
  millisecond.

---

# Instructions for the agent

You are upgrading **`kotak-starrocks-logs-app`** from **0.4.0** (already applied in this org from
`LOGS_APP_UPGRADE_0.4.0_SELF_CONTAINED.md`) to **0.0.1**. This PC cannot reach the GitHub repo, so this one
file carries everything: these instructions, an extractor script, and the patch as 44 per-file blocks.

The patch is `git diff 2c20c14 ffce890 -- plugins/kotak-starrocks-logs-app`, without `docs/` and `README.md`
(documentation only). It was tested upstream against Grafana 12.0.1-security-01, the unchanged
`kotak-starrocks-datasource` and **StarRocks 4.1.6** (the UAT version) with the session in **Asia/Kolkata**,
on native tables and on **real Iceberg tables** partitioned like UAT: 297 unit, 37 API, 16 Iceberg API and 40
browser tests pass, and the pipeline build passes. The SQL follows the measurements of the StarRocks query
lab run on UAT (`STARROCKS_QUERY_LAB.md`).

Work step by step. Stop at every **CHECKPOINT** and wait for the user to reply "continue".

**How to read this file:** the patch blocks are at the end, under "Patch blocks". Read up to that heading. Do
**not** read the patch blocks into your context and never retype them: the extractor writes them to disk byte
for byte. Open a single block only when you need it to resolve a conflict.

## What changes where (all inside `plugins/kotak-starrocks-logs-app/`)

| # | File | Change | What |
|---|---|---|---|
| 1 | `dev/e2e/seed.py` | modified | local test stack: four lines of one pod on the same microsecond (Show context ties) |
| 2 | `package-lock.json` | modified | version 0.0.1 (the two root entries only; no dependency changes) |
| 3 | `package.json` | modified | version 0.0.1 |
| 4 | `src/components/App.test.tsx` | new file | unit tests: app wiring (pages, query controller, data source registration) |
| 5 | `src/components/App.tsx` | modified | query controller: the refresh button spins while queries run, and cancels them |
| 6 | `src/components/CappedTimeRange.test.ts` | new file | unit tests: 24-hour limit and its notice |
| 7 | `src/components/CappedTimeRange.ts` | modified | "Time range limited to 24 hours" shown in the page bar, not as a toast over the time picker |
| 8 | `src/components/LogsExploration.test.ts` | new file | unit tests: data source and view choice, URL state, filters, navigation, guard, level plan |
| 9 | `src/components/LogsExploration.tsx` | modified | page bar (Show logs / Back left; range notice, Loading + Cancel, Oldest log right); pickers fixed in row 1; level plan of the grid ("Split by level", sampling) |
| 10 | `src/components/LogsTabScene.tsx` | modified | fills the window (no page scroll); Volume switch; loading badges; volume chart starts after the first lines; "estimated" volume title |
| 11 | `src/components/ServiceSelectionScene.tsx` | modified | placeholder rows with a timer while loading; page buttons next to "Showing"; "Split by level" switch |
| 12 | `src/components/api.ts` | modified | exploration API: `setGridLevels` |
| 13 | `src/components/layout.test.ts` | new file | unit tests: fill height |
| 14 | `src/components/layout.ts` | new file | makes the Logs tab end at the bottom of the window |
| 15 | `src/components/layoutHook.test.tsx` | new file | unit tests: fill-height hook |
| 16 | `src/components/pages.test.tsx` | new file | unit tests: rendered pages (header, page bar, notices, grid, tabs, configuration page) |
| 17 | `src/components/scenes.test.tsx` | new file | unit tests: grid, Logs tab, breakdowns, patterns, panel builders |
| 18 | `src/components/testScene.ts` | new file | test helpers (scenes) |
| 19 | `src/components/ui.test.tsx` | new file | unit tests: small UI parts |
| 20 | `src/components/ui.tsx` | modified | elapsed-seconds counter for loading states |
| 21 | `src/constants.ts` | modified | level rules: nginx `[level]`, zap tab-separated, glog, logrus, HTTP status class; more level aliases |
| 22 | `src/datasource/ContextScope.tsx` | new file | Show context header: what the context matches (pod, namespace, service) and how to pin |
| 23 | `src/datasource/StarRocksLogsDataSource.ts` | modified | short result cache (Back is instant); Show context tie-break and header; sampling passed to the SQL |
| 24 | `src/datasource/context.test.ts` | new file | unit tests: Show context |
| 25 | `src/datasource/frames.nanos.test.ts` | new file | unit tests: sub-millisecond order |
| 26 | `src/datasource/frames.ts` | modified | sub-millisecond order of lines in the logs panel (`nanos`) |
| 27 | `src/datasource/hints.test.ts` | new file | unit tests: SQL hint per view |
| 28 | `src/datasource/probes.test.ts` | new file | unit tests: time zone and oldest-log probes |
| 29 | `src/datasource/query.test.ts` | new file | unit tests: panel queries, SQL per query kind |
| 30 | `src/datasource/queryCache.test.ts` | new file | unit tests: result cache |
| 31 | `src/datasource/queryCache.ts` | new file | results kept 5 minutes (40 entries) in the browser tab |
| 32 | `src/datasource/runSql.test.ts` | new file | unit tests: `/api/ds/query` calls and errors |
| 33 | `src/datasource/testUtils.ts` | new file | test helpers |
| 34 | `src/datasource/windowedSearch.test.ts` | modified | unit tests: windowed search (updated) |
| 35 | `src/sql/builder.test.ts` | modified | unit tests: SQL (updated) |
| 36 | `src/sql/builder.ts` | modified | level from the column where filled, else the message, aggregated with WHERE + UNION ALL; hash sampling; top-N lines with the level computed on the returned rows; level filters split by source; Show context tie-break |
| 37 | `src/sql/levels.test.ts` | new file | unit tests: level rules on UAT line shapes, split, sampling, top-N shape, ties |
| 38 | `src/state/storage.more.test.ts` | new file | unit tests: browser storage |
| 39 | `src/state/storage.ts` | modified | Volume switch remembered per browser |
| 40 | `src/state/types.ts` | modified | `sample` parameter of volume queries |
| 41 | `src/state/url.more.test.ts` | new file | unit tests: URL encoding |
| 42 | `tests/e2e/drilldown.spec.ts` | modified | browser tests (40), local test stack only; not run by the pipeline |
| 43 | `tests/smoke/iceberg.test.ts` | modified | API tests on real Iceberg tables (16), local test stack only |
| 44 | `tests/smoke/smoke.test.ts` | modified | API tests (37), local test stack only; not run by the pipeline |

**Not changed:** `plugins/kotak-starrocks-datasource/`, `pipelines/`, the repository root, the zip layout, npm
dependencies (the lock file only changes its version lines), `docs/`, `README.md`, `CHANGELOG.md`, and every
0.4.0 settings key. There are no new settings. Existing provisioning files keep working as they are.

## How 0.0.1 works (for questions from the user)

| Topic | Behaviour |
|---|---|
| Level source | Tenants with `level.source: "column"` read `level`. Tenants with `"message"` read `level` on rows where it is filled and the message (tenant regexes) on the others, so they get faster on their own once the pipeline fills `level`. |
| Level in aggregations | Volumes by level run one `GROUP BY` per level source (`WHERE trim(level) != ''` and `WHERE level` empty) joined with `UNION ALL`, never one `CASE`: StarRocks evaluates both `CASE` branches on every row (UAT lab: 17.1 s vs 6.0 s). |
| Service grid | Message-level tenants: plain volumes by default (`'all'`), levels on "Split by level" (URL `levelsplit=1`). Column tenants: levels always. |
| Sampling | Volumes by level from the message over more than 1 hour keep about 1 in 10 rows with `MOD(ABS(murmur_hash3_32(k8s_pod_uid, observed_timestamp)), 10) = 0` and multiply the counts by 10 (UAT lab: 10.01 % kept, 4.1 times faster). Titles say "≈ estimated (1 in 10 lines)". |
| Line queries | Logs, the grid's newest lines and Show context read raw columns inside `ORDER BY observed_timestamp … LIMIT n`; the level (a regexp for message tenants), `__ms` and `__ts` are computed outside it, on the returned rows only. A level filter on a message tenant runs one top-N per level source, joined with `UNION ALL` and cut to `n` again. |
| Logs tab order | The volume chart's query starts when the first lines arrive (one StarRocks backend in UAT, DOP 3: the cheap list should not wait behind the heavy chart). Later refreshes run both. |
| Result cache | Answers are kept 5 minutes (40 entries) in the browser tab, keyed by query and absolute time range: Back and tab switches show at once; the refresh button and relative ranges ("Last 1 hour" moves) query again. |
| Refresh / Cancel | A Scenes query controller tracks the page's queries: the refresh button spins and cancels them; "Loading … Cancel" in the page bar does the same. Cancelling closes the request; StarRocks stops the query if `mysql_service_kill_after_disconnect` is on (default; ask the StarRocks team to confirm for UAT). |
| Show context | Same pod, 1 hour each side, ordered by time then message; lines tied on the exact microsecond are placed by message on the right side. The header lists what is matched. Pin: hover the line, then click the pin icon; the line stays at the top while scrolling (Grafana's own behaviour). |
| Level rules | Default message rules: `level=`/`"level":`/`severity` keys; `[emerg…debug]` (nginx); upper-case words (`ERROR`, `WARN`, `INFO`, …, `ERRO`, `DEBU`); zap `\t<level>\t`; glog `E1125 …`; HTTP status of access logs (2xx/3xx info, 4xx warn, 5xx error). A tenant with its own `level.regex` uses only its own rules. |

## INPUTS (ask the user for any that are missing)

```
THIS_FILE            = <path where this .md file was saved>
ORG_PLUGIN_REPO      = <path of kotak-custom-grafana-plugins>   BASE_BRANCH = <branch that has app 0.4.0>
DEPLOY_CONFIG_REPO   = <path of obser-aws-deploy-config>        BASE_BRANCH = <branch with the 0.4.0 rollout>
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

1. Create `/tmp/logs-app-upgrade-001/` and save the Python block under **Extractor** (below) as
   `/tmp/logs-app-upgrade-001/extract_logs_patch.py`, exactly as shown. On Windows use a temp folder and
   `python` instead of `python3`.
2. Run `python3 /tmp/logs-app-upgrade-001/extract_logs_patch.py <THIS_FILE> /tmp/logs-app-upgrade-001/patches`.
3. Expect `44 of 44 blocks, 0 bad` and `matches` for the whole-patch sha256. The output is one file per block
   plus `logs-app-0.4.0-to-0.0.1.patch` (all blocks in order).
4. Any `BAD` block means the copy changed the text (wrapped lines, changed quotes, missing lines). Ask the user
   to copy the file again as raw text. Do not repair blocks by hand.

## Step 1: is the org at 0.4.0, and which files has it changed?

1. In `ORG_PLUGIN_REPO`, on `BASE_BRANCH`, check `plugins/kotak-starrocks-logs-app/package.json`: `"version": "0.4.0"`. If it says
   0.3.0, stop: apply `LOGS_APP_UPGRADE_0.4.0_SELF_CONTAINED.md` first.
2. Run `python3 /tmp/logs-app-upgrade-001/extract_logs_patch.py <THIS_FILE> /tmp/logs-app-upgrade-001/patches <ORG_PLUGIN_REPO>`.
   Each line gives the file's state (`git hash-object` against the 0.4.0 and 0.0.1 blob ids in the blocks):

   | State | Meaning |
   |---|---|
   | `as 0.4.0` | applies cleanly |
   | `as 0.0.1` | already there |
   | `CHANGED by the org` | needs a 3-way merge |
   | `missing` | the file is not in the repo |
   | `absent (new file)` | expected for the 23 new files |

3. For each `CHANGED` or `missing` file, show `git log --oneline -- <file>` and summarise the org's change.
4. If **every** file shows `CHANGED`, the cause is probably line endings: run
   `git ls-files --eol plugins/kotak-starrocks-logs-app | head`, report and wait.

**CHECKPOINT 1**: the user reviews the list.

## Step 2: apply the patch on a new branch

1. In `ORG_PLUGIN_REPO`, create `feature/starrocks-logs-0.0.1` from `BASE_BRANCH`, in a detached worktree.
2. Run `git apply --3way --check /tmp/logs-app-upgrade-001/patches/logs-app-0.4.0-to-0.0.1.patch`, then the
   same command without `--check`.
   - For each new file git may print "does not exist in index" or "cannot read the current contents of '…'",
     sometimes followed by "Falling back to direct application". That is expected: the files are created.
   - `CHANGED` files are merged 3-way; that needs the 0.4.0 blob in history (`git cat-file -e <old>`).
     Conflicts: keep the org-side intent and the 0.0.1 behaviour; show every resolution as a diff.
   - If a 0.4.0 blob is missing, apply that file's block alone with `git apply --3way <NN-….patch>`; if that
     fails, use `--reject` and resolve the `.rej` hunks, reading only that block.
3. Check: run the extractor again with the repo argument. Every file must show `as 0.0.1`, except files the org
   had changed.
4. `git status`: only files under `plugins/kotak-starrocks-logs-app/` have changed.

**CHECKPOINT 2**: the user reviews `git status`, the check output and any conflict resolutions.

## Step 3: build locally

1. Run `scripts/build-plugin.sh plugins/kotak-starrocks-logs-app`. Expect 297 unit tests passing and
   `PASS package/kotak-starrocks-logs-app-0.0.1.zip`.
2. No new npm dependencies (same mirror as before).
3. `tests/e2e`, `tests/smoke` and `dev/e2e` need the local Docker test stack; they are not part of the
   pipeline. Don't run them here.

**CHECKPOINT 3**: report the results. Then the user runs the app pipeline. Publish 0.0.1 to the feed only after
approval. Commit ("kotak-starrocks-logs-app 0.0.1: UAT video fixes, faster levels, unit tests; applied from the
self-contained upgrade file") and push only after approval.

## Step 4: deploy-config (UAT)

On a new branch from `BASE_BRANCH` of `DEPLOY_CONFIG_REPO`:

1. `pipelines/grafana-plugin-upload.yml`: add `kotak-starrocks-logs-app-0.0.1|0.0.1`; keep 0.4.0 for rollback.
   The user runs the upload for UAT.
2. `envs/uat-obs1-common/grafana-values.yml`, `s3-sync-init`: change the app's copy line from 0.4.0 to 0.0.1.
   Check that nothing in the chain picks "the latest version" (it would pick 0.4.0).
3. Provisioning file: **no change needed**. Look at the `tenants` entries: a tenant with its own
   `level.regex` keeps only its own rules and gets none of the new ones (nginx, zap, HTTP status). Report any;
   the user decides whether to remove the key (the defaults then apply) or keep it.

**CHECKPOINT 4**: the user reviews the diff and runs `grafana-deploy.yml` for UAT.

## Step 5: verify in UAT (with the user)

Use the observability view on a laptop-size window (the screen recording was taken that way).

| # | Check | Expected |
|---|---|---|
| 1 | Open the app on Last 12 hours | the refresh button spins while the grid loads; the page bar shows "Loading … N s" and **Cancel**; Cancel stops it |
| 2 | Page bar | **Oldest log** with a date at the right end of the second row; the data source, view and time pickers stay in place when "Show logs" turns into "Back to service values" |
| 3 | Service grid, Last 24 hours | plain volumes (no level colours) in seconds, not a minute; page buttons next to "Showing 20 of N" |
| 4 | Turn on **Split by level** | volumes by level, with "≈ estimated (1 in 10 lines)" |
| 5 | Show logs of `proxy` | `[info]` / `[warn]` lines are info / warn (log details: `detected_level` not "unknown"); access-log lines get their level from the HTTP status |
| 6 | Logs tab | the lines appear first, then the volume chart; over 1 hour its title says "(≈ estimated from 1 in 10 lines)"; the page does not scroll, only the list; the **Volume** switch hides the chart and is remembered |
| 7 | Back to service values, then Show logs again (within 5 minutes, absolute or unchanged range) | both appear at once |
| 8 | Pick Last 7 days | "Time range limited to 24 hours" in the page bar, with Dismiss; it does not cover the pickers |
| 9 | Show context on a line | header `{ k8s_pod_uid=“…”, … }` with the matched label; lines before and after, including lines with the same time as the clicked one; pin: hover the line, click the pin icon, the line stays on top while scrolling |
| 10 | Log levels = error on observability | only error lines; no error message |
| 11 | A tenant with a filled `level` column | unchanged: levels on the grid at once |
| 12 | Open in Explore | the SQL selects from `( SELECT … ORDER BY observed_timestamp DESC LIMIT n ) l` |

**CHECKPOINT 5**: write the results to `HANDOFF_FILE`, with these open items for other teams (from the query
lab): StarRocks team: is `mysql_service_kill_after_disconnect` on in UAT (Cancel relies on it), backend sizing,
an async 5-minute MV per app/service/level; observability pipeline owner: fill `level` for observability and
kotakmobilebanking2 (once all retained days have it, the tenant can switch to `level.source: "column"`).

## Step 6: prod and wrap up

Prod: after UAT sign-off, the same steps with prod values; prepare them, the user runs them. One PR per repo,
describing what changed and how it was verified. List any check that failed as an open item.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Extractor reports `BAD` blocks or fewer than 44 | the copy changed or cut the file | copy it again as raw text; never fix blocks by hand |
| `git apply --3way` prints "Applied patch to '…' with conflicts" | the org changed lines next to or on the patched ones | resolve the markers (ours = org, theirs = 0.0.1), show the diff, `git add` |
| Every file shows `CHANGED by the org` | line endings (CRLF) | `git ls-files --eol`; try `git apply --3way --ignore-whitespace` and report |
| Refresh does not spin, old layout | the 0.4.0 zip is still served | check the `s3-sync-init` log for 0.0.1 and restart the pod; reload the browser |
| Grid shows no level colours | expected for message-level tenants | turn on "Split by level" |
| nginx lines still "unknown" | the tenant has its own `level.regex` in provisioning | see step 4.3 |
| Cancel stops the page but StarRocks keeps the query running | `mysql_service_kill_after_disconnect` off | StarRocks team |
| "Split by level" slow over 24 hours | the regexp still reads every sampled line | expected until `level` is filled; narrow the range or filter a service |
| "Oldest log" missing | the probe failed (shown in the browser console) | nothing breaks; report the console line |

## Extractor

Save exactly as `/tmp/logs-app-upgrade-001/extract_logs_patch.py`:

```python
#!/usr/bin/env python3
"""Extracts and checks the patch blocks of the Logs Drilldown (StarRocks) 0.4.0 -> 0.0.1 upgrade file.

  python3 extract_logs_patch.py <md file> <out dir>             write the patches and check their sha256
  python3 extract_logs_patch.py <md file> <out dir> <org repo>  also compare the repo's files with 0.4.0/0.0.1
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
            state = {old: 'as 0.4.0', new: 'as 0.0.1'}.get(h, 'CHANGED by the org (neither 0.4.0 nor 0.0.1)')
        status += '  ' + state.ljust(46)
    print(status, path)
    name = '%02d-%s.patch' % (int(num), path.replace('/', '_'))
    with open(os.path.join(out, name), 'w', encoding='utf-8', newline='\n') as f:
        f.write(patch)
with open(os.path.join(out, 'logs-app-0.4.0-to-0.0.1.patch'), 'w', encoding='utf-8', newline='\n') as f:
    f.write(whole)
expected = int(blocks[0][1]) if blocks else -1
total = hashlib.sha256(whole.encode('utf-8')).hexdigest()
m = re.search(r'^WHOLE-PATCH sha256=(\w+)$', text, re.M)
print('%d of %d blocks, %d bad; whole patch sha256 %s (%s)' % (
    len(blocks), expected, bad, total, 'matches' if m and m.group(1) == total else 'DOES NOT MATCH'))
sys.exit(0 if blocks and len(blocks) == expected and bad == 0 and m and m.group(1) == total else 1)
```

WHOLE-PATCH sha256=8c5dec6e532535bb8fb9e0c0042b73c3de850a5cc96dd5e9fb408d65e5343457

## Patch blocks

44 blocks in `git diff` order. Each has a heading, one `PATCH-BLOCK` line (number, path inside the app folder,
0.4.0 blob id, 0.0.1 blob id, sha256 of the block) and the diff. Paths in the diffs are relative to the
repository root (`plugins/kotak-starrocks-logs-app/…`).

### 1/44 `dev/e2e/seed.py` (modified)

local test stack: four lines of one pod on the same microsecond (Show context ties)

PATCH-BLOCK 1/44 dev/e2e/seed.py old=9d4b284f87c1111bb0ccb99daf856b3b1ac4bca7 new=efdb6da66ef576d823f8bccd2fe3ff79fed162fc sha256=56422007b500d05e37fbed102280e2d2f7337abe162fb9fa4ca2121feb62568c
````diff
diff --git a/plugins/kotak-starrocks-logs-app/dev/e2e/seed.py b/plugins/kotak-starrocks-logs-app/dev/e2e/seed.py
index 9d4b284f87c1111bb0ccb99daf856b3b1ac4bca7..efdb6da66ef576d823f8bccd2fe3ff79fed162fc 100644
--- a/plugins/kotak-starrocks-logs-app/dev/e2e/seed.py
+++ b/plugins/kotak-starrocks-logs-app/dev/e2e/seed.py
@@ -242,6 +242,25 @@ def view_select():
     return ", ".join(f"{expr} AS observed_timestamp" if c == "observed_timestamp" else c for c in COLUMNS)
 
 
+TIE_POD_UID = "00000000-0000-0000-0000-0000000071e5"
+
+
+def tie_rows(template):
+    """Lines of one pod sharing an exact microsecond (42 % of UAT lines have such a twin): two at T, one just
+    before and one just after, so "show context" ordering by time then message can be tested."""
+    t = NOW - dt.timedelta(minutes=20)
+    out = []
+    for offset, message in ((-1, "tie before"), (0, "tie line A"), (0, "tie line B"), (1, "tie after")):
+        r = list(template)
+        ts = t + dt.timedelta(microseconds=offset)
+        r[COLUMNS.index("k8s_pod_uid")] = TIE_POD_UID
+        r[COLUMNS.index("k8s_pod_name")] = "tie-pod-0"
+        r[COLUMNS.index("message")] = message
+        r[COLUMNS.index("observed_timestamp")] = ts.strftime("%Y-%m-%d %H:%M:%S.%f")
+        out.append(r)
+    return out
+
+
 def main():
     w = sys.stdout.write
     w(f"SET GLOBAL time_zone = {q(FE_TIME_ZONE)};\n")
@@ -255,6 +274,8 @@ def main():
           "DISTRIBUTED BY HASH(app_id) BUCKETS 3 PROPERTIES (\"replication_num\" = \"1\");\n")
         for app_id, spec in tenants.items():
             rows = rows_for(app_id, spec)
+            if db == "obs2_logs1_uat" and app_id == "app_1961_observability":
+                rows += tie_rows(rows[0])
             for i in range(0, len(rows), 2000):
                 batch = rows[i:i + 2000]
                 w("INSERT INTO eks_app_logs VALUES\n" + ",\n".join("(" + ", ".join(q(v) for v in r) + ")" for r in batch) + ";\n")
````

### 2/44 `package-lock.json` (modified)

version 0.0.1 (the two root entries only; no dependency changes)

PATCH-BLOCK 2/44 package-lock.json old=1d4bfebe38332ada40323d738fbab106e7a2add5 new=264969f05d479af658927b2fda40c9f73dbc9985 sha256=9f15c67ac7c10cbd89dfe80cfc039acb004bd37432af2ddabbd67e7f35d443a2
````diff
diff --git a/plugins/kotak-starrocks-logs-app/package-lock.json b/plugins/kotak-starrocks-logs-app/package-lock.json
index 1d4bfebe38332ada40323d738fbab106e7a2add5..264969f05d479af658927b2fda40c9f73dbc9985 100644
--- a/plugins/kotak-starrocks-logs-app/package-lock.json
+++ b/plugins/kotak-starrocks-logs-app/package-lock.json
@@ -1,12 +1,12 @@
 {
   "name": "kotak-starrocks-logs-app",
-  "version": "0.4.0",
+  "version": "0.0.1",
   "lockfileVersion": 3,
   "requires": true,
   "packages": {
     "": {
       "name": "kotak-starrocks-logs-app",
-      "version": "0.4.0",
+      "version": "0.0.1",
       "license": "AGPL-3.0-only",
       "dependencies": {
         "@emotion/css": "11.13.5",
````

### 3/44 `package.json` (modified)

version 0.0.1

PATCH-BLOCK 3/44 package.json old=a853dfeab37861034f600775af59fbe0d847fa6d new=9a5ce5d6419e12c9ab6f13163ebb2bd855c35dc0 sha256=bf5cedc5c7d54970ab4822e005dfdab25d0094f7c4d3c6855f46142ce7f1e611
````diff
diff --git a/plugins/kotak-starrocks-logs-app/package.json b/plugins/kotak-starrocks-logs-app/package.json
index a853dfeab37861034f600775af59fbe0d847fa6d..9a5ce5d6419e12c9ab6f13163ebb2bd855c35dc0 100644
--- a/plugins/kotak-starrocks-logs-app/package.json
+++ b/plugins/kotak-starrocks-logs-app/package.json
@@ -1,6 +1,6 @@
 {
   "name": "kotak-starrocks-logs-app",
-  "version": "0.4.0",
+  "version": "0.0.1",
   "description": "Logs Drilldown for StarRocks log views. Queries run through kotak-starrocks-datasource as the signed-in user.",
   "private": true,
   "scripts": {
````

### 4/44 `src/components/App.test.tsx` (new file)

unit tests: app wiring (pages, query controller, data source registration)

PATCH-BLOCK 4/44 src/components/App.test.tsx old=none new=9833a5bf8eb495e37000800df493122109829d4f sha256=0058da26245d53c03e7419ce1e7a0e3f9ada89392cd2ef91bc0db6d6a210b2b2
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/App.test.tsx b/plugins/kotak-starrocks-logs-app/src/components/App.test.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..9833a5bf8eb495e37000800df493122109829d4f
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/components/App.test.tsx
@@ -0,0 +1,75 @@
+import { render } from '@testing-library/react';
+
+import { AppRootProps } from '@grafana/data';
+import { behaviors, EmbeddedScene, SceneApp, SceneAppPage, SceneReactObject } from '@grafana/scenes';
+
+import { EXPLORE_ROUTE, PLUGIN_BASE_URL } from '../constants';
+import { getAppConfig } from '../config/config';
+import { plugin } from '../module';
+import { App } from './App';
+import { AppConfig } from './AppConfig';
+import { CappedTimeRange } from './CappedTimeRange';
+import { LogsExploration } from './LogsExploration';
+
+const registerScenes = jest.fn();
+const registerCore = jest.fn();
+const replace = jest.fn();
+let factory: (() => SceneApp) | undefined;
+
+jest.mock('@grafana/runtime', () => ({
+  ...jest.requireActual('@grafana/runtime'),
+  getDataSourceSrv: () => ({ registerRuntimeDataSource: (...a: unknown[]) => registerCore(...a) }),
+  locationService: { replace: (...a: unknown[]) => replace(...a) },
+}));
+jest.mock('@grafana/scenes', () => {
+  const actual = jest.requireActual('@grafana/scenes');
+  return {
+    ...actual,
+    registerRuntimeDataSource: (...a: unknown[]) => registerScenes(...a),
+    // the scene app itself needs Grafana's router; the test inspects what App builds
+    useSceneApp: (f: () => SceneApp) => {
+      factory = f;
+      return { Component: () => null };
+    },
+  };
+});
+
+const props = (jsonData: object) => ({ meta: { jsonData } }) as unknown as AppRootProps;
+
+describe('app wiring', () => {
+  it('module: the app root page and the configuration page', () => {
+    expect(plugin.root).toBe(App);
+    expect(plugin.configPages?.[0]).toMatchObject({ id: 'configuration', title: 'Configuration', body: AppConfig });
+  });
+
+  it('App: reads the configuration, registers the data source once in the scenes and the core registry', () => {
+    render(<App {...props({ maxRangeHours: 12, defaultTimeRange: 'now-30m' })} />);
+    render(<App {...props({ maxRangeHours: 12, defaultTimeRange: 'now-30m' })} />);
+    expect(getAppConfig().maxRangeHours).toBe(12);
+    expect(registerScenes).toHaveBeenCalledTimes(1);
+    expect(registerCore).toHaveBeenCalledTimes(1);
+    const ds = registerScenes.mock.calls[0][0].dataSource;
+    expect(registerCore.mock.calls[0][0].dataSource).toBe(ds);
+  });
+
+  it('explore page: capped time range from the configured default, query controller (refresh spinner, Cancel), the exploration', () => {
+    render(<App {...props({ maxRangeHours: 12, defaultTimeRange: 'now-30m' })} />);
+    const app = factory!();
+    const [explore, fallback] = app.state.pages as SceneAppPage[];
+    expect(explore.state).toMatchObject({ url: EXPLORE_ROUTE, routePath: 'explore/*' });
+    expect(explore.state.renderTitle?.('x')).toBeNull();
+    const scene = explore.state.getScene!(undefined as never) as EmbeddedScene;
+    expect(scene.state.$timeRange).toBeInstanceOf(CappedTimeRange);
+    expect(scene.state.$timeRange!.state.from).toBe('now-30m');
+    expect(scene.state.$behaviors?.[0]).toBeInstanceOf(behaviors.SceneQueryController);
+    expect(scene.state.body).toBeInstanceOf(LogsExploration);
+    expect(app.state.urlSyncOptions).toEqual({ updateUrlOnInit: true, createBrowserHistorySteps: true });
+
+    // anything else under the app redirects to the explore page
+    expect(fallback.state).toMatchObject({ url: PLUGIN_BASE_URL, routePath: '*' });
+    const redirect = (fallback.state.getScene!(undefined as never) as EmbeddedScene).state.body as SceneReactObject;
+    const Redirect = redirect.state.component!;
+    render(<Redirect />);
+    expect(replace).toHaveBeenCalledWith(EXPLORE_ROUTE);
+  });
+});
````

### 5/44 `src/components/App.tsx` (modified)

query controller: the refresh button spins while queries run, and cancels them

PATCH-BLOCK 5/44 src/components/App.tsx old=74fc0f238fa5963a2771924d409c2921814ca7d3 new=0a3ed414c31048f5fa768bf95eb23d15a0887e75 sha256=587c20b5787dbf49abb1a25dc19c146e496f7ba0aacca87143d9a42f7e311d0e
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/App.tsx b/plugins/kotak-starrocks-logs-app/src/components/App.tsx
index 74fc0f238fa5963a2771924d409c2921814ca7d3..0a3ed414c31048f5fa768bf95eb23d15a0887e75 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/App.tsx
+++ b/plugins/kotak-starrocks-logs-app/src/components/App.tsx
@@ -8,6 +8,7 @@ import {
   SceneAppPage,
   SceneReactObject,
   RuntimeDataSource,
+  behaviors,
   registerRuntimeDataSource,
   useSceneApp,
 } from '@grafana/scenes';
@@ -22,6 +23,8 @@ function getExploreScene(): EmbeddedScene {
   return new EmbeddedScene({
     // at most maxRangeHours (24 h by default), however the range is chosen
     $timeRange: new CappedTimeRange({ from: getAppConfig().defaultTimeRange, to: 'now' }),
+    // knows which queries run: the refresh button spins (and cancels them on click), the header shows "Loading"
+    $behaviors: [new behaviors.SceneQueryController()],
     body: new LogsExploration(),
   });
 }
````

### 6/44 `src/components/CappedTimeRange.test.ts` (new file)

unit tests: 24-hour limit and its notice

PATCH-BLOCK 6/44 src/components/CappedTimeRange.test.ts old=none new=e2378b7a9f02e09e151e5e85cb8997875456c0cb sha256=9590b0a75d99beeb9acc37392ff55198a16440d8e71f733a8ea1585cec0405a1
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/CappedTimeRange.test.ts b/plugins/kotak-starrocks-logs-app/src/components/CappedTimeRange.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e2378b7a9f02e09e151e5e85cb8997875456c0cb
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/components/CappedTimeRange.test.ts
@@ -0,0 +1,38 @@
+import { dateTime, rangeUtil } from '@grafana/data';
+
+import { setAppConfig } from '../config/config';
+import { CappedTimeRange, cappedOf } from './CappedTimeRange';
+
+describe('CappedTimeRange (the scene time range: at most maxRangeHours)', () => {
+  beforeEach(() => setAppConfig({}));
+
+  it('cuts a 7-day change to the last 24 hours and flags it; a short range clears the flag', () => {
+    const tr = new CappedTimeRange({ from: 'now-1h', to: 'now' });
+    tr.onTimeRangeChange(rangeUtil.convertRawToRange({ from: 'now-7d', to: 'now' }));
+    expect(tr.state.from).toBe('now-24h');
+    expect(tr.state.to).toBe('now');
+    expect(tr.state.value.to.valueOf() - tr.state.value.from.valueOf()).toBeCloseTo(24 * 3_600_000, -4);
+    expect(cappedOf(tr.state)?.hours).toBe(24);
+    tr.onTimeRangeChange(rangeUtil.convertRawToRange({ from: 'now-3h', to: 'now' }));
+    expect(tr.state.from).toBe('now-3h');
+    expect(cappedOf(tr.state)).toBeUndefined();
+  });
+
+  it('URL ranges are cut too (absolute: keeps the end)', () => {
+    const tr = new CappedTimeRange({ from: 'now-1h', to: 'now' });
+    const end = Date.UTC(2026, 10, 20, 12);
+    tr.updateFromUrl({ from: String(end - 3 * 86_400_000), to: String(end) });
+    expect(dateTime(tr.state.from).valueOf()).toBe(end - 86_400_000);
+    expect(dateTime(tr.state.to).valueOf()).toBe(end);
+  });
+
+  it('a configured maxRangeHours; dismissing the notice keeps the range', () => {
+    setAppConfig({ maxRangeHours: 6 });
+    const tr = new CappedTimeRange({ from: 'now-1h', to: 'now' });
+    tr.onTimeRangeChange(rangeUtil.convertRawToRange({ from: 'now-24h', to: 'now' }));
+    expect(tr.state.from).toBe('now-6h');
+    tr.dismissCapped();
+    expect(cappedOf(tr.state)).toBeUndefined();
+    expect(tr.state.from).toBe('now-6h');
+  });
+});
````

### 7/44 `src/components/CappedTimeRange.ts` (modified)

"Time range limited to 24 hours" shown in the page bar, not as a toast over the time picker

PATCH-BLOCK 7/44 src/components/CappedTimeRange.ts old=4ded175d35f0ed2ab499345c398b867ca9706707 new=3707f9fb4db54c091b9a40a93aa66381a9e6f897 sha256=f84b987722551ab461e5b0340839f8067974f61ad63584e596912dcd7a280279
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/CappedTimeRange.ts b/plugins/kotak-starrocks-logs-app/src/components/CappedTimeRange.ts
index 4ded175d35f0ed2ab499345c398b867ca9706707..3707f9fb4db54c091b9a40a93aa66381a9e6f897 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/CappedTimeRange.ts
+++ b/plugins/kotak-starrocks-logs-app/src/components/CappedTimeRange.ts
@@ -1,5 +1,4 @@
-import { AppEvents, rangeUtil } from '@grafana/data';
-import { getAppEvents } from '@grafana/runtime';
+import { rangeUtil } from '@grafana/data';
 import { SceneTimeRange, SceneTimeRangeState } from '@grafana/scenes';
 
 import { getAppConfig } from '../config/config';
@@ -7,13 +6,19 @@ import { capTimeRange } from '../state/timeRange';
 
 const HOUR_MS = 3_600_000;
 
+export interface CappedTimeRangeState extends SceneTimeRangeState {
+  /** set when the last change was cut to maxRangeHours; shown as a notice under the header */
+  capped?: { hours: number; at: number };
+}
+
 /**
  * Time range of the app, limited to maxRangeHours (24 by default). Every way a range is set (picker, typed
  * range, zoom out, URL, "Use the last N hours") goes through setState, so a longer range never reaches a
- * query: it is cut to its last maxRangeHours and the user is told.
+ * query: it is cut to its last maxRangeHours, and `capped` tells the page to say so (a notice under the header,
+ * not a toast over the time picker).
  */
 export class CappedTimeRange extends SceneTimeRange {
-  public setState(update: Partial<SceneTimeRangeState>) {
+  public setState(update: Partial<CappedTimeRangeState>) {
     if (update.from !== undefined || update.to !== undefined || update.value !== undefined) {
       const next = { ...this.state, ...update };
       const maxHours = getAppConfig().maxRangeHours;
@@ -23,31 +28,21 @@ export class CappedTimeRange extends SceneTimeRange {
           ...update,
           ...capped,
           value: rangeUtil.convertRawToRange(capped, this.getTimeZone()),
+          capped: { hours: maxHours, at: Date.now() },
         };
-        notifyCapped(maxHours);
+      } else if (update.from !== undefined || update.to !== undefined) {
+        update = { ...update, capped: undefined };
       }
     }
     super.setState(update);
   }
-}
-
-let lastNotice = 0;
 
-function notifyCapped(hours: number) {
-  // one notice per change (the URL sync can apply the same range twice)
-  if (Date.now() - lastNotice < 2000) {
-    return;
-  }
-  lastNotice = Date.now();
-  try {
-    getAppEvents().publish({
-      type: AppEvents.alertWarning.name,
-      payload: [
-        `Time range limited to ${hours} hours`,
-        `Logs Drilldown (StarRocks) searches at most ${hours} hours at a time. The range was cut to its last ${hours} hours.`,
-      ],
-    });
-  } catch {
-    // no app events (tests)
+  dismissCapped() {
+    super.setState({ capped: undefined } as Partial<CappedTimeRangeState>);
   }
 }
+
+/** The capped-range notice of the scene's time range, if it is a CappedTimeRange. */
+export function cappedOf(state: object): CappedTimeRangeState['capped'] {
+  return (state as CappedTimeRangeState).capped;
+}
````

### 8/44 `src/components/LogsExploration.test.ts` (new file)

unit tests: data source and view choice, URL state, filters, navigation, guard, level plan

PATCH-BLOCK 8/44 src/components/LogsExploration.test.ts old=none new=4db4b79dc3d318221f8834283c12385114c3eb90 sha256=b8c5bbece00d0abcd56d28f43ccdb229a36544bfa6049fbdaeb38dd337371e75
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/LogsExploration.test.ts b/plugins/kotak-starrocks-logs-app/src/components/LogsExploration.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4db4b79dc3d318221f8834283c12385114c3eb90
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/components/LogsExploration.test.ts
@@ -0,0 +1,487 @@
+import { SceneReactObject } from '@grafana/scenes';
+
+import { setAppConfig } from '../config/config';
+import { BuildContext } from '../sql/builder';
+import { getLastSelection, setLastSelection } from '../state/storage';
+import { LineFilter, MessageFieldFilter } from '../state/types';
+import { BreakdownScene } from './BreakdownScene';
+import { LogsTabScene } from './LogsTabScene';
+import { PatternsTabScene } from './PatternsTabScene';
+import { ServiceSelectionScene } from './ServiceSelectionScene';
+import { COL_VIEW, ctxFor, deferred, flush, mountExploration as setup, MSG_VIEW } from './testScene';
+import { ScanGuard } from './ui';
+
+const listDatasources = jest.fn();
+const fetchViews = jest.fn();
+const buildContext = jest.fn();
+const fetchOldestLog = jest.fn();
+
+jest.mock('../datasource/api', () => ({
+  ...jest.requireActual('../datasource/api'),
+  listDatasources: () => listDatasources(),
+  fetchViews: (...a: unknown[]) => fetchViews(...a),
+}));
+jest.mock('../datasource/StarRocksLogsDataSource', () => ({
+  ...jest.requireActual('../datasource/StarRocksLogsDataSource'),
+  buildContext: (...a: unknown[]) => buildContext(...a),
+}));
+jest.mock('../datasource/oldest', () => ({ fetchOldestLog: (...a: unknown[]) => fetchOldestLog(...a) }));
+
+beforeEach(() => {
+  localStorage.clear();
+  setAppConfig({});
+  listDatasources.mockReset().mockReturnValue([
+    { uid: 'ds1', name: 'logs1' },
+    { uid: 'ds2', name: 'logs2' },
+  ]);
+  fetchViews.mockReset().mockResolvedValue([COL_VIEW, MSG_VIEW]);
+  buildContext.mockReset().mockImplementation(async (view: string) => ctxFor(view));
+  fetchOldestLog.mockReset().mockResolvedValue(1_700_000_000_000);
+});
+
+describe('opening the app: data source, view, context, oldest log', () => {
+  it('picks the first data source with views, the first view, builds the context and looks up the oldest line', async () => {
+    const { ex } = await setup();
+    expect(ex.state.datasource).toBe('ds1');
+    expect(ex.state.view).toBe(COL_VIEW);
+    expect(buildContext).toHaveBeenCalledWith(COL_VIEW, expect.anything(), 'ds1');
+    expect(ex.state.ctx?.tenant.key).toBe('app_04000_payments');
+    expect(fetchOldestLog).toHaveBeenCalledWith(COL_VIEW, 'ds1');
+    expect(ex.state.oldest).toEqual({ key: `ds1/${COL_VIEW}`, ms: 1_700_000_000_000 });
+    expect(ex.state.body).toBeInstanceOf(ServiceSelectionScene);
+    expect(getLastSelection()).toEqual({ ds: 'ds1', view: COL_VIEW });
+  });
+
+  it('skips data sources that fail or have no views and records why', async () => {
+    fetchViews.mockImplementation(async (_r: unknown, uid: string) => {
+      if (uid === 'ds1') {
+        throw new Error('Access denied by Ranger (5204)');
+      }
+      return [MSG_VIEW];
+    });
+    const { ex } = await setup();
+    expect(ex.state.datasource).toBe('ds2');
+    expect(ex.state.datasourceProblems).toEqual({ ds1: 'Access denied by Ranger (5204)' });
+    expect(ex.state.view).toBe(MSG_VIEW);
+  });
+
+  it('prefers the last data source and view used in this browser', async () => {
+    setLastSelection('ds2', MSG_VIEW);
+    const { ex } = await setup();
+    expect(fetchViews.mock.calls[0][1]).toBe('ds2');
+    expect(ex.state.datasource).toBe('ds2');
+    expect(ex.state.view).toBe(MSG_VIEW);
+  });
+
+  it('a data source from the URL is used as is (no fallback), with the view from the URL', async () => {
+    const { ex } = await setup({ datasource: 'ds2', view: MSG_VIEW });
+    expect(fetchViews).toHaveBeenCalledTimes(1);
+    expect(fetchViews.mock.calls[0][1]).toBe('ds2');
+    expect(ex.state.view).toBe(MSG_VIEW);
+  });
+
+  it('no data source: an explanation instead of the grid', async () => {
+    listDatasources.mockReturnValue([]);
+    const { ex } = await setup();
+    expect(ex.state.views).toEqual([]);
+    expect(ex.state.viewsError).toMatch(/No kotak-starrocks-datasource data source is available/);
+    expect(ex.state.body).toBeInstanceOf(SceneReactObject);
+  });
+
+  it('no view anywhere: the first data source and an info message', async () => {
+    fetchViews.mockResolvedValue([]);
+    const { ex } = await setup();
+    expect(ex.state.datasource).toBe('ds1');
+    expect(ex.state.views).toEqual([]);
+    expect(ex.state.datasourceProblems).toEqual({ ds1: 'no log views for you', ds2: 'no log views for you' });
+    expect(ex.state.body).toBeInstanceOf(SceneReactObject);
+  });
+
+  it('a context error and an oldest-log error are kept in the state', async () => {
+    buildContext.mockRejectedValue(new Error('5203: no SELECT on the view'));
+    const { ex } = await setup();
+    expect(ex.state.ctxError).toBe('5203: no SELECT on the view');
+    expect(ex.state.body).toBeInstanceOf(SceneReactObject);
+
+    buildContext.mockImplementation(async (view: string) => ctxFor(view));
+    fetchOldestLog.mockRejectedValue(new Error('timeout'));
+    ex.setView(MSG_VIEW);
+    await flush();
+    expect(ex.state.oldest).toEqual({ key: `ds1/${MSG_VIEW}`, error: 'timeout' });
+  });
+
+  it('a slow reply for a view the user already left is dropped', async () => {
+    const { ex } = await setup();
+    const slow = deferred<BuildContext>();
+    const fast = deferred<BuildContext>();
+    buildContext.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
+    ex.setView(MSG_VIEW);
+    ex.setView(COL_VIEW);
+    fast.resolve(ctxFor(COL_VIEW));
+    await flush();
+    slow.resolve(ctxFor(MSG_VIEW));
+    await flush();
+    expect(ex.state.view).toBe(COL_VIEW);
+    expect(ex.state.ctx?.tenant.key).toBe('app_04000_payments');
+  });
+});
+
+describe('URL state', () => {
+  it('writes only what differs from the defaults', async () => {
+    const { ex } = await setup();
+    expect(ex.getUrlState()).toEqual({
+      ds: 'ds1',
+      view: COL_VIEW,
+      page: null,
+      label: null,
+      tabs: null,
+      filter: null,
+      level: null,
+      line: null,
+      pattern: null,
+      field: null,
+      tab: null,
+      breakdown: null,
+      sort: null,
+      limit: null,
+      display: null,
+      wrap: null,
+      search: null,
+      levelsplit: null,
+    });
+  });
+
+  it('reads every key, drops invalid values, and writes the same values back', async () => {
+    const { ex } = await setup();
+    ex.updateFromUrl({
+      page: 'details',
+      label: 'k8s_namespace_name',
+      tabs: ['k8s_namespace_name', ''],
+      level: ['error', 'bogus'],
+      tab: 'patterns',
+      breakdown: 'k8s_pod_uid',
+      sort: 'asc',
+      limit: '200',
+      display: 'table',
+      wrap: '1',
+      search: 'pay',
+      levelsplit: '1',
+    });
+    const s = ex.state;
+    expect(s.page).toBe('details');
+    expect(s.primaryLabel).toBe('k8s_namespace_name');
+    expect(s.labelTabs).toEqual(['k8s_namespace_name']);
+    expect(s.levels).toEqual(['error']);
+    expect(s.tab).toBe('patterns');
+    expect(s.sort).toBe('asc');
+    expect(s.limit).toBe(200);
+    expect(s.display).toBe('table');
+    expect(s.wrap).toBe(true);
+    expect(s.search).toBe('pay');
+    expect(s.gridLevels).toBe(true);
+    expect(ex.getUrlState()).toMatchObject({
+      page: 'details',
+      tab: 'patterns',
+      sort: 'asc',
+      limit: '200',
+      display: 'table',
+      wrap: '1',
+      levelsplit: '1',
+      level: ['error'],
+    });
+
+    ex.updateFromUrl({ tab: 'nope', limit: '3', display: 'chart', sort: 'x', page: 'x' });
+    expect(ex.state.tab).toBe('logs');
+    expect(ex.state.limit).toBeUndefined();
+    expect(ex.state.display).toBe('logs');
+    expect(ex.state.sort).toBe('desc');
+    expect(ex.state.page).toBe('selection');
+  });
+
+  it('a URL without ds/view keeps them; a URL with another view opens it', async () => {
+    const { ex } = await setup();
+    ex.updateFromUrl({ ds: null, view: null });
+    expect(ex.state.datasource).toBe('ds1');
+    expect(ex.state.view).toBe(COL_VIEW);
+    ex.updateFromUrl({ view: MSG_VIEW });
+    await flush();
+    expect(buildContext).toHaveBeenLastCalledWith(MSG_VIEW, expect.anything(), 'ds1');
+    expect(ex.state.ctx?.tenant.key).toBe('app_1961_observability');
+  });
+
+  it('line, pattern and field filters round-trip', async () => {
+    const { ex } = await setup();
+    ex.addLineFilter({ op: 'include', value: 'timed out', caseSensitive: false, regex: false });
+    ex.togglePatternFilter('Timeout', 'include');
+    ex.addFieldFilter({ key: 'status', value: '500', op: '=' });
+    const url = ex.getUrlState();
+    const copy = await setup();
+    copy.ex.updateFromUrl(url);
+    expect(copy.ex.state.lineFilters).toEqual(ex.state.lineFilters);
+    expect(copy.ex.state.patternFilters).toEqual(ex.state.patternFilters);
+    expect(copy.ex.state.fieldFilters).toEqual(ex.state.fieldFilters);
+  });
+
+  it('the old "filter" key (0.1.0/0.2.0 links) becomes label filters and opens the logs', async () => {
+    const { ex } = await setup();
+    ex.updateFromUrl({ filter: ['k8s_service_name|=|checkout'] });
+    expect(ex.state.page).toBe('details');
+    expect(ex.getLabelFilters()).toEqual([{ key: 'k8s_service_name', op: '=', value: 'checkout' }]);
+    expect(ex.getUrlState().filter).toBeNull();
+  });
+});
+
+describe('filters', () => {
+  it('label filters toggle; "one of" filters expand to several', async () => {
+    const { ex } = await setup();
+    ex.addFilter({ key: 'k8s_namespace_name', op: '=', value: 'prod' });
+    expect(ex.hasFilter('k8s_namespace_name', 'prod')).toBe(true);
+    ex.addFilter({ key: 'k8s_namespace_name', op: '!=', value: 'prod' });
+    expect(ex.getLabelFilters()).toEqual([{ key: 'k8s_namespace_name', op: '!=', value: 'prod' }]);
+    ex.addFilter({ key: 'k8s_namespace_name', op: '!=', value: 'prod' });
+    expect(ex.getLabelFilters()).toEqual([]);
+
+    ex.state.labelFilters.updateFilters([
+      { key: 'k8s_service_name', operator: '=|', value: 'a', values: ['a', 'b'] },
+      { key: 'k8s_pod_uid', operator: '<', value: '1' },
+    ]);
+    expect(ex.getLabelFilters()).toEqual([
+      { key: 'k8s_service_name', op: '=', value: 'a' },
+      { key: 'k8s_service_name', op: '=', value: 'b' },
+    ]);
+    ex.removeLabelFilter('k8s_service_name', 'a');
+    expect(ex.getLabelFilters()).toEqual([{ key: 'k8s_service_name', op: '=', value: 'b' }]);
+  });
+
+  it('levels: the same set again clears; all levels means no filter', async () => {
+    const { ex } = await setup();
+    ex.setLevels(['error']);
+    expect(ex.state.levels).toEqual(['error']);
+    ex.setLevels(['error']);
+    expect(ex.state.levels).toEqual([]);
+    ex.setLevelsExact(['error', 'warn', 'info', 'debug', 'unknown']);
+    expect(ex.state.levels).toEqual([]);
+  });
+
+  it('line filters ignore empty and duplicate entries; patterns and fields toggle; a filter closes the breakdown', async () => {
+    const { ex } = await setup();
+    const f: LineFilter = { op: 'include', value: 'x', caseSensitive: false, regex: false };
+    ex.addLineFilter({ op: 'include', value: '', caseSensitive: false, regex: false });
+    ex.addLineFilter(f);
+    ex.addLineFilter(f);
+    expect(ex.state.lineFilters).toHaveLength(1);
+    ex.removeLineFilter(0);
+    expect(ex.state.lineFilters).toEqual([]);
+
+    ex.togglePatternFilter('Timeout', 'include');
+    ex.togglePatternFilter('Timeout', 'exclude');
+    expect(ex.state.patternFilters).toEqual([{ name: 'Timeout', op: 'exclude' }]);
+    ex.togglePatternFilter('Timeout', 'exclude');
+    expect(ex.state.patternFilters).toEqual([]);
+    ex.togglePatternFilter('Timeout', 'include');
+    ex.removePatternFilter(0);
+    expect(ex.state.patternFilters).toEqual([]);
+
+    ex.setBreakdown('k8s_pod_uid');
+    const ff: MessageFieldFilter = { key: 'status', value: '500', op: '=' };
+    ex.addFieldFilter(ff);
+    expect(ex.state.breakdown).toBeUndefined();
+    expect(ex.hasFieldFilter('status', '500', '=')).toBe(true);
+    ex.addFieldFilter(ff);
+    expect(ex.state.fieldFilters).toEqual([]);
+    ex.addFieldFilter(ff);
+    ex.removeFieldFilter(0);
+    expect(ex.state.fieldFilters).toEqual([]);
+  });
+
+  it('the grid ignores filters on its own label and rebuilds for filters on other labels', async () => {
+    const { ex } = await setup();
+    const grid = ex.state.body;
+    ex.addFilter({ key: 'k8s_service_name', op: '=', value: 'checkout' });
+    expect(ex.state.body).toBe(grid);
+    ex.addFilter({ key: 'k8s_namespace_name', op: '=', value: 'prod' });
+    expect(ex.state.body).not.toBe(grid);
+    const spec = (ex.state.body as ServiceSelectionScene).state.spec;
+    expect(spec.filters).toEqual([{ key: 'k8s_namespace_name', op: '=', value: 'prod' }]);
+    expect(ex.getSpec().filters).toHaveLength(2);
+  });
+});
+
+describe('navigation', () => {
+  it('Show logs on a value replaces the "=" filter of that label and opens the Logs tab; Back returns to the grid', async () => {
+    const { ex } = await setup();
+    ex.addFilter({ key: 'k8s_service_name', op: '=', value: 'a' });
+    ex.addFilter({ key: 'k8s_namespace_name', op: '=', value: 'prod' });
+    ex.selectValue('k8s_service_name', 'b');
+    expect(ex.isDetails()).toBe(true);
+    expect(ex.state.tab).toBe('logs');
+    expect(ex.getLabelFilters()).toEqual([
+      { key: 'k8s_namespace_name', op: '=', value: 'prod' },
+      { key: 'k8s_service_name', op: '=', value: 'b' },
+    ]);
+    expect(ex.state.body).toBeInstanceOf(LogsTabScene);
+    ex.backToSelection();
+    expect(ex.state.page).toBe('selection');
+    expect(ex.state.body).toBeInstanceOf(ServiceSelectionScene);
+    ex.showLogs();
+    expect(ex.state.body).toBeInstanceOf(LogsTabScene);
+  });
+
+  it('tabs: labels and fields open a breakdown over the view columns, patterns the tenant patterns', async () => {
+    const { ex } = await setup({ datasource: 'ds1', view: MSG_VIEW });
+    ex.showLogs();
+    ex.setTab('labels');
+    expect((ex.state.body as BreakdownScene).state.columns).toEqual(['k8s_service_name', 'k8s_namespace_name']);
+    ex.setTab('fields');
+    expect((ex.state.body as BreakdownScene).state.columns).toEqual(['k8s_pod_uid']);
+    ex.setBreakdown('k8s_pod_uid');
+    expect((ex.state.body as BreakdownScene).state.selected).toBe('k8s_pod_uid');
+    ex.setTab('patterns');
+    expect(ex.state.breakdown).toBeUndefined();
+    expect(ex.state.body).toBeInstanceOf(PatternsTabScene);
+  });
+
+  it('display options go to the Logs tab; the line limit falls back to the configured one', async () => {
+    const { ex } = await setup();
+    ex.showLogs();
+    expect(ex.getDisplay()).toEqual({ display: 'logs', sort: 'desc', limit: 1000, wrap: false });
+    ex.setDisplay({ sort: 'asc', limit: 200, wrap: true, display: 'table' });
+    expect((ex.state.body as LogsTabScene).state).toMatchObject({
+      sort: 'asc',
+      limit: 200,
+      wrap: true,
+      display: 'table',
+    });
+  });
+
+  it('label tabs: added once, never for the service label; removing the active one returns to services', async () => {
+    const { ex } = await setup();
+    ex.addLabelTab('k8s_namespace_name');
+    ex.addLabelTab('k8s_namespace_name');
+    expect(ex.state.labelTabs).toEqual(['k8s_namespace_name']);
+    expect(ex.primaryLabel()).toBe('k8s_namespace_name');
+    expect((ex.state.body as ServiceSelectionScene).state.label).toBe('k8s_namespace_name');
+    ex.addLabelTab('k8s_service_name');
+    expect(ex.state.labelTabs).toEqual(['k8s_namespace_name']);
+    expect(ex.state.primaryLabel).toBeUndefined();
+    ex.setPrimaryLabel('k8s_namespace_name');
+    ex.removeLabelTab('k8s_namespace_name');
+    expect(ex.state.labelTabs).toEqual([]);
+    expect(ex.primaryLabel()).toBe('k8s_service_name');
+  });
+
+  it('the grid search is passed to the grid without rebuilding it', async () => {
+    const { ex } = await setup();
+    const grid = ex.state.body as ServiceSelectionScene;
+    ex.setSearch('pay');
+    expect(ex.state.body).toBe(grid);
+    expect(grid.state.search).toBe('pay');
+  });
+
+  it('switching data source or view resets view, filters and tabs', async () => {
+    const { ex } = await setup();
+    ex.addFilter({ key: 'k8s_namespace_name', op: '=', value: 'prod' });
+    ex.setLevels(['error']);
+    ex.showLogs();
+    ex.setTab('patterns');
+    ex.setView(COL_VIEW);
+    expect(fetchViews).toHaveBeenCalledTimes(1);
+    ex.setView(MSG_VIEW);
+    expect(ex.state).toMatchObject({ view: MSG_VIEW, page: 'selection', tab: 'logs', levels: [] });
+    expect(ex.getLabelFilters()).toEqual([]);
+    expect(getLastSelection()).toEqual({ ds: 'ds1', view: MSG_VIEW });
+    await flush();
+
+    ex.addLabelTab('k8s_namespace_name');
+    ex.setDatasource('ds1');
+    expect(fetchViews).toHaveBeenCalledTimes(1);
+    ex.setDatasource('ds2');
+    expect(ex.state).toMatchObject({ datasource: 'ds2', labelTabs: [], primaryLabel: undefined });
+    await flush();
+    expect(fetchViews.mock.calls[1][1]).toBe('ds2');
+    // last view of ds1 is not carried to ds2: ds2's first view
+    expect(ex.state.view).toBe(COL_VIEW);
+  });
+});
+
+describe('level plan (how volumes get their level)', () => {
+  it('a level column: exact levels everywhere, no sampling', async () => {
+    const { ex } = await setup({}, 'now-24h');
+    expect(ex.levelPlan(true)).toEqual({ withLevel: true });
+    expect(ex.levelPlan(false)).toEqual({ withLevel: true });
+  });
+
+  it('level from the message: plain grid unless asked; levels sampled 1 in 10 above an hour', async () => {
+    const { ex, setRange } = await setup({ datasource: 'ds1', view: MSG_VIEW });
+    expect(ex.levelPlan(true)).toEqual({ withLevel: false });
+    expect(ex.levelPlan(false)).toEqual({ withLevel: true, sample: undefined });
+    let grid = ex.state.body as ServiceSelectionScene;
+    expect(grid.state).toMatchObject({ withLevel: false, levelFromMessage: true });
+
+    ex.setGridLevels(true);
+    expect(ex.levelPlan(true)).toEqual({ withLevel: true, sample: undefined });
+    await setRange('now-6h');
+    expect(ex.levelPlan(true)).toEqual({ withLevel: true, sample: 10 });
+    expect(ex.levelPlan(false)).toEqual({ withLevel: true, sample: 10 });
+    grid = ex.state.body as ServiceSelectionScene;
+    expect(grid.state).toMatchObject({ withLevel: true, sample: 10 });
+  });
+});
+
+describe('long-range guard (text scans over more than maxScanHours)', () => {
+  it('patterns over 24 h wait for the user; "Run anyway" lets this range through', async () => {
+    const { ex } = await setup({ datasource: 'ds1', view: MSG_VIEW }, 'now-24h');
+    ex.showLogs();
+    ex.setTab('patterns');
+    const body = ex.state.body as SceneReactObject;
+    expect(body).toBeInstanceOf(SceneReactObject);
+    expect(body.state.component).toBe(ScanGuard);
+    const props = body.state.props as { hours: number; max: number; reason: string; onRun: () => void };
+    expect(props.hours).toBe(24);
+    expect(props.max).toBe(6);
+    expect(props.reason).toMatch(/patterns/);
+    props.onRun();
+    expect(ex.state.body).toBeInstanceOf(PatternsTabScene);
+    expect(ex.state.scanAllowedFor).toBe('now-24h|now');
+  });
+
+  it('"Use the last 6 hours" shrinks the range and the guard goes away', async () => {
+    const { ex, scene } = await setup({ datasource: 'ds1', view: MSG_VIEW }, 'now-24h');
+    ex.showLogs();
+    ex.setTab('patterns');
+    const props = (ex.state.body as SceneReactObject).state.props as { onShrink: () => void };
+    props.onShrink();
+    await flush();
+    expect(scene.state.$timeRange!.state.from).toBe('now-6h');
+    expect(ex.state.body).toBeInstanceOf(PatternsTabScene);
+  });
+
+  it('the Logs tab is never blocked: only its volume chart is deferred for a text search', async () => {
+    const { ex } = await setup({ datasource: 'ds1', view: COL_VIEW }, 'now-24h');
+    ex.showLogs();
+    expect((ex.state.body as LogsTabScene).state.volumeDeferred).toBe(false);
+    ex.addLineFilter({ op: 'include', value: 'timed out', caseSensitive: false, regex: false });
+    expect((ex.state.body as LogsTabScene).state.volumeDeferred).toBe(true);
+  });
+
+  it('a breakdown on a column is fine over 24 h; a field inside the message is guarded', async () => {
+    const { ex } = await setup({ datasource: 'ds1', view: COL_VIEW }, 'now-24h');
+    ex.showLogs();
+    ex.setTab('fields');
+    expect(ex.state.body).toBeInstanceOf(BreakdownScene);
+    ex.setBreakdown('msg:status');
+    const props = (ex.state.body as SceneReactObject).state.props as { reason: string };
+    expect(props.reason).toMatch(/field inside the message/);
+  });
+
+  it('a time change rebuilds the body only when the guard or the sampling changes', async () => {
+    const { ex, setRange } = await setup({ datasource: 'ds1', view: MSG_VIEW }, 'now-1h');
+    ex.showLogs();
+    ex.setTab('patterns');
+    const first = ex.state.body;
+    await setRange('now-30m');
+    expect(ex.state.body).toBe(first);
+    await setRange('now-12h');
+    expect((ex.state.body as SceneReactObject).state.component).toBe(ScanGuard);
+  });
+});
````

### 9/44 `src/components/LogsExploration.tsx` (modified)

page bar (Show logs / Back left; range notice, Loading + Cancel, Oldest log right); pickers fixed in row 1; level plan of the grid ("Split by level", sampling)

PATCH-BLOCK 9/44 src/components/LogsExploration.tsx old=418a72572543c91550f7f70dc85b299d122881e9 new=c9574d9edeaf80a7f2a358434d5514c2da1cf6d3 sha256=f6e2fcc3e90b31d5d3fe5a942bf8618eda27a73c66a4c81583b38f8fa65691e7
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/LogsExploration.tsx b/plugins/kotak-starrocks-logs-app/src/components/LogsExploration.tsx
index 418a72572543c91550f7f70dc85b299d122881e9..c9574d9edeaf80a7f2a358434d5514c2da1cf6d3 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/LogsExploration.tsx
+++ b/plugins/kotak-starrocks-logs-app/src/components/LogsExploration.tsx
@@ -1,5 +1,5 @@
 import { css } from '@emotion/css';
-import { useState } from 'react';
+import { useCallback, useEffect, useState } from 'react';
 
 import { GrafanaTheme2, dateTimeFormat, rangeUtil } from '@grafana/data';
 import {
@@ -15,7 +15,19 @@ import {
   SceneTimePicker,
   sceneGraph,
 } from '@grafana/scenes';
-import { Alert, Button, IconButton, InlineField, Select, Tab, TabsBar, Tooltip, useStyles2 } from '@grafana/ui';
+import {
+  Alert,
+  Button,
+  Icon,
+  IconButton,
+  InlineField,
+  Select,
+  Spinner,
+  Tab,
+  TabsBar,
+  Tooltip,
+  useStyles2,
+} from '@grafana/ui';
 
 import { LEVELS, QUICK_RANGES, RUNTIME_DS } from '../constants';
 import { getAppConfig, getAppConfigErrors, viewPrefixFor } from '../config/config';
@@ -47,13 +59,18 @@ import {
 import { Display, displayLabel, ExplorationApi, isExplorationApi, Tab as TabName } from './api';
 import { BreakdownScene, MESSAGE_FIELD_PREFIX } from './BreakdownScene';
 import { quickRangeMs } from '../state/timeRange';
+import { CappedTimeRange, cappedOf } from './CappedTimeRange';
 import { DetailsHeader } from './FiltersBar';
 import { LogsTabScene } from './LogsTabScene';
 import { PatternsTabScene } from './PatternsTabScene';
 import { ServiceSelectionScene } from './ServiceSelectionScene';
-import { ErrorBox, Loading, ScanGuard } from './ui';
+import { Elapsed, ErrorBox, Loading, ScanGuard } from './ui';
 
 type AdHocFilter = AdHocFiltersVariable['state']['filters'][number];
+
+// level split from the message over more than this many hours is counted on a 1-in-LEVEL_SAMPLE hash sample
+export const LEVEL_SAMPLE_ABOVE_HOURS = 1;
+export const LEVEL_SAMPLE = 10;
 type Page = 'selection' | 'details';
 
 export interface LogsExplorationState extends SceneObjectState {
@@ -88,6 +105,8 @@ export interface LogsExplorationState extends SceneObjectState {
   search: string;
   /** time range (raw from|to) for which the user accepted a long text scan */
   scanAllowedFor?: string;
+  /** service grid of a tenant whose level comes from the message: split the volumes by level (on request) */
+  gridLevels: boolean;
   /** oldest line of the selected view ("Oldest log"), looked up in the background */
   oldest?: { key: string; ms?: number | null; loading?: boolean; error?: string };
   body?: SceneObject;
@@ -113,6 +132,7 @@ const URL_KEYS = [
   'display',
   'wrap',
   'search',
+  'levelsplit',
 ];
 const TABS: TabName[] = ['logs', 'labels', 'fields', 'patterns'];
 // =| and !=| (one of / not one of) are expanded to several = / != filters
@@ -201,6 +221,7 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
       display: 'logs',
       wrap: false,
       search: '',
+      gridLevels: false,
       controls: [
         new SceneTimePicker({
           quickRanges: QUICK_RANGES.filter(
@@ -263,6 +284,7 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
       display: s.display === 'logs' ? null : s.display,
       wrap: s.wrap ? '1' : null,
       search: s.search !== '' ? s.search : null,
+      levelsplit: s.gridLevels ? '1' : null,
     };
   }
 
@@ -326,6 +348,9 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
     if ('wrap' in values) {
       next.wrap = one('wrap') === '1';
     }
+    if ('levelsplit' in values) {
+      next.gridLevels = one('levelsplit') === '1';
+    }
     if ('search' in values) {
       next.search = one('search') ?? '';
     }
@@ -753,7 +778,29 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
   }
 
   private computeGuardSignature(): string {
-    return `${this.rangeBlocked()}`;
+    return `${this.rangeBlocked()}|${this.rangeHours() > LEVEL_SAMPLE_ABOVE_HOURS}`;
+  }
+
+  /**
+   * How volumes get their level. Tenants with a level column: exact, always (cheap). Tenants whose level is
+   * read from the message (a regexp per line, 92 % of the query time on UAT): the service grid shows plain
+   * volumes unless the user asks for levels; with levels, ranges over an hour are counted on a 10 % hash sample
+   * (about 4 times faster, counts multiplied by 10).
+   */
+  levelPlan(forGrid: boolean): { withLevel: boolean; sample?: number } {
+    const tenant = this.state.ctx?.tenant;
+    if (!tenant || tenant.level.source === 'column') {
+      return { withLevel: true };
+    }
+    if (forGrid && !this.state.gridLevels) {
+      return { withLevel: false };
+    }
+    return { withLevel: true, sample: this.rangeHours() > LEVEL_SAMPLE_ABOVE_HOURS ? LEVEL_SAMPLE : undefined };
+  }
+
+  setGridLevels(on: boolean) {
+    this.setState({ gridLevels: on });
+    this.rebuild();
   }
 
   rebuild() {
@@ -821,7 +868,8 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
     const spec = this.getSpec();
     const tenant = s.ctx.tenant;
     const blocked = this.rangeBlocked();
-    const levelSkipped = blocked && tenant.level.source === 'message';
+    const gridLevel = this.levelPlan(true);
+    const tabLevel = this.levelPlan(false);
     const textScan = needsMessageScan(spec, tenant, false);
 
     if (!this.isDetails()) {
@@ -829,8 +877,9 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
         spec: this.selectionSpec(),
         label: this.primaryLabel(),
         search: s.search,
-        withLevel: !levelSkipped,
-        levelNotice: levelSkipped,
+        withLevel: gridLevel.withLevel,
+        sample: gridLevel.sample,
+        levelFromMessage: tenant.level.source === 'message',
       });
     }
     const reason =
@@ -842,7 +891,8 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
         // (which reads every line) waits for the user
         return new LogsTabScene({
           spec,
-          withLevel: !levelSkipped,
+          withLevel: tabLevel.withLevel,
+          sample: tabLevel.sample,
           volumeDeferred: blocked && textScan,
           display,
           sort,
@@ -890,36 +940,16 @@ function LogsExplorationRenderer({ model }: SceneComponentProps<LogsExploration>
           </ul>
         </Alert>
       )}
+      {/* row 1: label filters left; data source, view, time and refresh right. Nothing here changes width
+          between pages, so the pickers never move. */}
       <div className={styles.header}>
         <div className={styles.left}>
           <div className={styles.caption}>Labels</div>
-          <div className={styles.filterRow}>
-            <div className={styles.filters} data-testid="label-filters">
-              <labelFilters.Component model={labelFilters} />
-            </div>
-            {details ? (
-              <Button
-                variant="secondary"
-                icon="arrow-left"
-                onClick={() => model.backToSelection()}
-                data-testid="back-to-services"
-              >
-                Back to {displayLabel(model.primaryLabel())} values
-              </Button>
-            ) : (
-              <Button
-                variant={filters.length > 0 ? 'primary' : 'secondary'}
-                fill="outline"
-                onClick={() => model.showLogs()}
-                data-testid="show-logs"
-              >
-                Show logs
-              </Button>
-            )}
+          <div className={styles.filters} data-testid="label-filters">
+            <labelFilters.Component model={labelFilters} />
           </div>
         </div>
         <div className={styles.right}>
-          <OldestLog model={model} />
           <InlineField label="Data source">
             <Select
               width={22}
@@ -954,6 +984,39 @@ function LogsExplorationRenderer({ model }: SceneComponentProps<LogsExploration>
         </div>
       </div>
 
+      {/* row 2: where you are (Show logs / Back) on the left; status on the right (range notice, loading, oldest log) */}
+      <div className={styles.bar} data-testid="page-bar">
+        <div className={styles.barLeft}>
+          {details ? (
+            <Button
+              size="sm"
+              variant="secondary"
+              icon="arrow-left"
+              onClick={() => model.backToSelection()}
+              data-testid="back-to-services"
+            >
+              Back to {displayLabel(model.primaryLabel())} values
+            </Button>
+          ) : (
+            <Button
+              size="sm"
+              variant={filters.length > 0 ? 'primary' : 'secondary'}
+              fill="outline"
+              icon="arrow-right"
+              onClick={() => model.showLogs()}
+              data-testid="show-logs"
+            >
+              Show logs{filters.length > 0 ? ' of the current filters' : ''}
+            </Button>
+          )}
+        </div>
+        <div className={styles.barRight}>
+          <RangeNotice model={model} />
+          <RunningIndicator model={model} />
+          <OldestLog model={model} />
+        </div>
+      </div>
+
       {details ? (
         <>
           <DetailsHeader model={model} />
@@ -1008,14 +1071,77 @@ function OldestLog({ model }: { model: LogsExploration }) {
       : `Looking up the oldest line in ${view}`;
   return (
     <Tooltip content={tip}>
-      <div className={styles.oldest} data-testid="oldest-log">
-        <span className={styles.oldestLabel}>Oldest log</span>
-        <span>{text}</span>
-      </div>
+      <span className={styles.oldest} data-testid="oldest-log">
+        <span className={styles.oldestLabel}>Oldest log</span> <span>{text}</span>
+      </span>
     </Tooltip>
   );
 }
 
+/** "Loading… 12 s  Cancel" while any query of the page runs (from the scene's query controller). */
+function RunningIndicator({ model }: { model: LogsExploration }) {
+  const controller = sceneGraph.getQueryController(model);
+  return controller ? <RunningIndicatorInner controller={controller} /> : null;
+}
+
+function RunningIndicatorInner({
+  controller,
+}: {
+  controller: NonNullable<ReturnType<typeof sceneGraph.getQueryController>>;
+}) {
+  const styles = useStyles2(getStyles);
+  const { isRunning } = controller.useState();
+  if (!isRunning) {
+    return null;
+  }
+  return (
+    <span className={styles.running} data-testid="running-indicator">
+      <Spinner inline />
+      Loading
+      <Elapsed />
+      <Button
+        size="sm"
+        fill="text"
+        variant="secondary"
+        onClick={() => controller.cancelAll()}
+        data-testid="cancel-queries"
+      >
+        Cancel
+      </Button>
+    </span>
+  );
+}
+
+/** "Time range limited to 24 hours", under the header (a toast would cover the time picker). Hides after 20 s. */
+function RangeNotice({ model }: { model: LogsExploration }) {
+  const styles = useStyles2(getStyles);
+  const timeRange = sceneGraph.getTimeRange(model);
+  const state = timeRange.useState();
+  const capped = cappedOf(state);
+  const dismiss = useCallback(() => {
+    if (timeRange instanceof CappedTimeRange) {
+      timeRange.dismissCapped();
+    }
+  }, [timeRange]);
+  useEffect(() => {
+    if (!capped) {
+      return;
+    }
+    const timer = setTimeout(dismiss, 20_000);
+    return () => clearTimeout(timer);
+  }, [capped, dismiss]);
+  if (!capped) {
+    return null;
+  }
+  return (
+    <span className={styles.notice} data-testid="range-capped" role="status">
+      <Icon name="info-circle" />
+      Time range limited to {capped.hours} hours: showing the last {capped.hours} hours of your selection.
+      <IconButton name="times" size="sm" aria-label="Dismiss" onClick={dismiss} />
+    </span>
+  );
+}
+
 /** Shown when the whole time range is before the view's oldest line: nothing to find there. */
 function BeforeOldestNotice({ model }: { model: LogsExploration }) {
   const { oldest, view } = model.useState();
@@ -1136,8 +1262,7 @@ const getStyles = (theme: GrafanaTheme2) => ({
     minWidth: 'min-content',
   }),
   caption: css({ fontSize: theme.typography.bodySmall.fontSize, color: theme.colors.text.secondary }),
-  filterRow: css({ display: 'flex', alignItems: 'center', gap: theme.spacing(1) }),
-  filters: css({ flex: 1, minWidth: 280, maxWidth: 900 }),
+  filters: css({ minWidth: 280, maxWidth: 900 }),
   // stays right-aligned when a narrow window wraps it under the label filters
   right: css({
     display: 'flex',
@@ -1147,14 +1272,41 @@ const getStyles = (theme: GrafanaTheme2) => ({
     flexWrap: 'wrap',
     marginLeft: 'auto',
   }),
-  addLabel: css({ marginLeft: theme.spacing(1), alignSelf: 'center' }),
-  oldest: css({
+  bar: css({
     display: 'flex',
-    flexDirection: 'column',
-    lineHeight: 1.2,
+    alignItems: 'center',
+    justifyContent: 'space-between',
+    gap: theme.spacing(2),
+    flexWrap: 'wrap',
+    minHeight: 32,
+  }),
+  barLeft: css({ display: 'flex', alignItems: 'center', gap: theme.spacing(1) }),
+  barRight: css({
+    display: 'flex',
+    alignItems: 'center',
+    justifyContent: 'flex-end',
+    gap: theme.spacing(2),
+    flexWrap: 'wrap',
+    marginLeft: 'auto',
     fontSize: theme.typography.bodySmall.fontSize,
-    whiteSpace: 'nowrap',
   }),
+  running: css({
+    display: 'inline-flex',
+    alignItems: 'center',
+    gap: theme.spacing(0.5),
+    color: theme.colors.text.secondary,
+  }),
+  notice: css({
+    display: 'inline-flex',
+    alignItems: 'center',
+    gap: theme.spacing(0.5),
+    padding: theme.spacing(0.25, 0.5, 0.25, 1),
+    borderRadius: theme.shape.radius.default,
+    background: theme.colors.info.transparent,
+    color: theme.colors.text.primary,
+  }),
+  addLabel: css({ marginLeft: theme.spacing(1), alignSelf: 'center' }),
+  oldest: css({ whiteSpace: 'nowrap', color: theme.colors.text.primary }),
   oldestLabel: css({ color: theme.colors.text.secondary }),
   body: css({ paddingTop: theme.spacing(1), minWidth: 0 }),
 });
````

### 10/44 `src/components/LogsTabScene.tsx` (modified)

fills the window (no page scroll); Volume switch; loading badges; volume chart starts after the first lines; "estimated" volume title

PATCH-BLOCK 10/44 src/components/LogsTabScene.tsx old=56b3ea1e124982dbb35a71e9a9ff33e11b02c634 new=1d8209fc42fc23e64d35376ddcac11368f0081de sha256=2a23d3f7a93bbaba1c96a64066251fae58c264a4d126a449d2a982063b79750c
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/LogsTabScene.tsx b/plugins/kotak-starrocks-logs-app/src/components/LogsTabScene.tsx
index 56b3ea1e124982dbb35a71e9a9ff33e11b02c634..1d8209fc42fc23e64d35376ddcac11368f0081de 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/LogsTabScene.tsx
+++ b/plugins/kotak-starrocks-logs-app/src/components/LogsTabScene.tsx
@@ -1,5 +1,5 @@
 import { css } from '@emotion/css';
-import { useMemo, useState } from 'react';
+import { useMemo, useRef, useState } from 'react';
 
 import { DataFrame, GrafanaTheme2, LoadingState, dateTimeFormat, urlUtil } from '@grafana/data';
 import { config as grafanaConfig } from '@grafana/runtime';
@@ -13,7 +13,6 @@ import {
   sceneGraph,
 } from '@grafana/scenes';
 import {
-  Alert,
   Button,
   ClipboardButton,
   Icon,
@@ -33,12 +32,16 @@ import { withQueryHint } from '../sql/builder';
 import { extractMessageFields } from '../patterns/messageFields';
 import { QuerySpec } from '../state/types';
 import { Display, getExploration } from './api';
+import { getVolumeVisible, setVolumeVisible } from '../state/storage';
+import { useFillHeight } from './layout';
 import { barsPanel, logsPanel, queryRunner, tablePanel } from './panels';
 import { ErrorBox, Loading } from './ui';
 
 export interface LogsTabState extends SceneObjectState {
   spec: QuerySpec;
   withLevel: boolean;
+  /** level split estimated from about 1 in n lines (message-level tenants over more than an hour) */
+  sample?: number;
   /**
    * text search over more than maxScanHours: the volume chart (which has to read every line in the range) is
    * loaded on request; the lines are searched newest first and stop at the line limit
@@ -50,6 +53,8 @@ export interface LogsTabState extends SceneObjectState {
   wrap: boolean;
   volume?: VizPanel;
   main?: SceneObject;
+  /** the first lines are in: the volume chart may start */
+  volumeReady?: boolean;
 }
 
 /** Logs tab: volume histogram by level and the lines as Logs, Table or JSON. */
@@ -57,6 +62,8 @@ export class LogsTabScene extends SceneObjectBase<LogsTabState> {
   static Component = LogsTabRenderer;
   /** query of the lines (owned by the panel); its progress is shown above the lines */
   private linesRunner?: SceneQueryRunner;
+  /** query of the volume chart (owned by its panel), for the loading badge */
+  private volumeRunner?: SceneQueryRunner;
 
   constructor(state: LogsTabState) {
     super(state);
@@ -64,13 +71,49 @@ export class LogsTabScene extends SceneObjectBase<LogsTabState> {
       if (!this.state.main) {
         this.build();
       }
+      return this.startVolumeAfterLines();
     });
   }
 
+  /**
+   * The volume chart reads every line in the range; the list is a cheap top-N. The chart starts once the first
+   * lines are in (or the list failed), so the two do not compete for the backend (UAT: one backend, DOP 3) and
+   * the lines show first, as in the internal UI. Later refreshes run both together.
+   */
+  private startVolumeAfterLines(): (() => void) | undefined {
+    const runner = this.linesRunner;
+    if (this.state.volumeReady || !runner) {
+      return undefined;
+    }
+    const arrived = () => {
+      const data = runner.state.data;
+      return data !== undefined && data.state !== LoadingState.Loading;
+    };
+    if (arrived()) {
+      this.setState({ volumeReady: true });
+      return undefined;
+    }
+    const sub = runner.subscribeToState(() => {
+      if (arrived()) {
+        sub.unsubscribe();
+        this.setState({ volumeReady: true });
+      }
+    });
+    return () => sub.unsubscribe();
+  }
+
   private build() {
-    const { spec, withLevel, display, sort, limit, wrap, volumeDeferred } = this.state;
+    const { spec, withLevel, sample, display, sort, limit, wrap, volumeDeferred } = this.state;
     const api = getExploration(this);
-    const volume = volumeDeferred ? undefined : barsPanel('Log volume', queryRunner('volume', spec, { withLevel }));
+    const volumeRunner = volumeDeferred ? undefined : queryRunner('volume', spec, { withLevel, sample });
+    const volume = volumeRunner
+      ? barsPanel(sample ? `Log volume (≈ estimated from 1 in ${sample} lines)` : 'Log volume', volumeRunner, {
+          description: sample
+            ? 'This tenant has no level column: levels are read from the message text. Over this range the counts per level are estimated from a hash sample of the lines and multiplied back.'
+            : undefined,
+        })
+      : undefined;
+    this.volumeRunner = volumeRunner;
     let main: SceneObject;
     const lines = queryRunner(display === 'table' ? 'table' : 'logs', spec, { limit, sort });
     if (display === 'table') {
@@ -93,6 +136,10 @@ export class LogsTabScene extends SceneObjectBase<LogsTabState> {
     return this.linesRunner;
   }
 
+  getVolumeRunner(): SceneQueryRunner | undefined {
+    return this.volumeRunner;
+  }
+
   exploreUrl(): string | undefined {
     const api = getExploration(this);
     const ctx = api.getContext();
@@ -142,7 +189,7 @@ const SORTS: Array<{ label: string; value: 'desc' | 'asc' }> = [
   { label: 'Oldest first', value: 'asc' },
 ];
 
-function formatSpan(ms: number): string {
+export function formatSpan(ms: number): string {
   const minutes = Math.round(ms / 60_000);
   const h = Math.floor(minutes / 60);
   const m = minutes % 60;
@@ -215,29 +262,54 @@ function DeferredVolume({ model }: { model: LogsTabScene }) {
   );
 }
 
+/** "Loading…" badge over a panel while its query runs (the panels alone show an empty box or old data). */
+function LoadingBadge({ runner, text }: { runner?: SceneQueryRunner; text: string }) {
+  if (!runner) {
+    return null;
+  }
+  return <LoadingBadgeInner runner={runner} text={text} />;
+}
+
+function LoadingBadgeInner({ runner, text }: { runner: SceneQueryRunner; text: string }) {
+  const styles = useStyles2(getStyles);
+  const { data } = runner.useState();
+  const loading = !data || data.state === LoadingState.Loading;
+  if (!loading) {
+    return null;
+  }
+  const empty = !data || data.series.every((f) => f.length === 0);
+  return (
+    <div className={empty ? styles.badgeCenter : styles.badgeCorner} data-testid="panel-loading">
+      <Spinner inline /> {text}
+    </div>
+  );
+}
+
 function LogsTabRenderer({ model }: SceneComponentProps<LogsTabScene>) {
   const styles = useStyles2(getStyles);
-  const { volume, main, display, sort, limit, wrap, withLevel, volumeDeferred } = model.useState();
+  const { volume, main, display, sort, limit, wrap, volumeDeferred, volumeReady } = model.useState();
   const api = getExploration(model);
-  const ctx = api.getContext();
-  const levelSkipped = !volumeDeferred && !withLevel && ctx?.tenant.level.source === 'message';
   const runner = main ? model.getLinesRunner() : undefined;
+  const ref = useRef<HTMLDivElement>(null);
+  // the tab fills the window below the header; the lines scroll inside their panel, not the page
+  const height = useFillHeight(ref);
+  const [showVolume, setShowVolume] = useState(() => getVolumeVisible());
+  const toggleVolume = () => {
+    setVolumeVisible(!showVolume);
+    setShowVolume(!showVolume);
+  };
 
   return (
-    <div className={styles.wrapper}>
-      {levelSkipped && (
-        <Alert severity="info" title="Log volume is not split by level for this range">
-          This tenant&apos;s level is read from the message text, which needs a full scan over more than{' '}
-          {getAppConfig().maxScanHours} hours.{' '}
-          <Button size="sm" variant="secondary" onClick={() => api.allowLongScan()}>
-            Split by level anyway
-          </Button>
-        </Alert>
-      )}
+    <div className={styles.wrapper} ref={ref} style={height ? { height } : undefined} data-testid="logs-tab">
       {volumeDeferred ? (
         <DeferredVolume model={model} />
       ) : (
-        <div className={styles.volume}>{volume && <volume.Component model={volume} />}</div>
+        showVolume && (
+          <div className={styles.volume} data-testid="volume-panel">
+            {volume && volumeReady && <volume.Component model={volume} />}
+            <LoadingBadge runner={model.getVolumeRunner()} text="Loading log volume…" />
+          </div>
+        )
       )}
       <div className={styles.toolbar}>
         <RadioButtonGroup size="sm" options={SORTS} value={sort} onChange={(v) => api.setDisplay({ sort: v })} />
@@ -257,6 +329,15 @@ function LogsTabRenderer({ model }: SceneComponentProps<LogsTabScene>) {
         {display === 'logs' && (
           <InlineSwitch label="Wrap lines" showLabel value={wrap} onChange={() => api.setDisplay({ wrap: !wrap })} />
         )}
+        {!volumeDeferred && (
+          <InlineSwitch
+            label="Volume"
+            showLabel
+            value={showVolume}
+            onChange={toggleVolume}
+            data-testid="toggle-volume"
+          />
+        )}
         <div className={styles.spacer} />
         <LinkButton
           size="sm"
@@ -275,6 +356,7 @@ function LogsTabRenderer({ model }: SceneComponentProps<LogsTabScene>) {
       {runner && <SearchStatus runner={runner} sort={sort} />}
       <div className={styles.main} data-testid="logs-main">
         {main && <main.Component model={main} />}
+        <LoadingBadge runner={runner} text="Loading lines…" />
       </div>
     </div>
   );
@@ -287,7 +369,8 @@ export class JsonLogsScene extends SceneObjectBase<JsonLogsState> {
   static Component = JsonLogsRenderer;
 }
 
-function rowsOf(frame?: DataFrame) {
+/** Rows of the JSON view: a JSON message stays an object, a logfmt one gets its key=value fields. */
+export function rowsOf(frame?: DataFrame) {
   if (!frame) {
     return [];
   }
@@ -346,8 +429,8 @@ function JsonLogsRenderer({ model }: SceneComponentProps<JsonLogsScene>) {
 }
 
 const getStyles = (theme: GrafanaTheme2) => ({
-  wrapper: css({ display: 'flex', flexDirection: 'column', gap: theme.spacing(1), minWidth: 0 }),
-  volume: css({ height: 200 }),
+  wrapper: css({ display: 'flex', flexDirection: 'column', gap: theme.spacing(1), minWidth: 0, minHeight: 0 }),
+  volume: css({ height: 150, flex: '0 0 auto', position: 'relative' }),
   deferred: css({
     display: 'flex',
     alignItems: 'center',
@@ -356,6 +439,7 @@ const getStyles = (theme: GrafanaTheme2) => ({
     border: `1px dashed ${theme.colors.border.medium}`,
     borderRadius: theme.shape.radius.default,
     color: theme.colors.text.secondary,
+    flex: '0 0 auto',
   }),
   status: css({
     display: 'flex',
@@ -363,10 +447,36 @@ const getStyles = (theme: GrafanaTheme2) => ({
     gap: theme.spacing(1),
     color: theme.colors.text.secondary,
     fontSize: theme.typography.bodySmall.fontSize,
+    flex: '0 0 auto',
   }),
   toolbar: css({ display: 'flex', alignItems: 'center', gap: theme.spacing(1), flexWrap: 'wrap' }),
   spacer: css({ flex: 1 }),
-  main: css({ height: 'calc(100vh - 320px)', minHeight: 480, minWidth: 0 }),
+  // fills what is left of the tab's height; the Logs panel scrolls inside it
+  main: css({ flex: '1 1 auto', minHeight: 320, minWidth: 0, position: 'relative' }),
+  badgeCenter: css({
+    position: 'absolute',
+    inset: 0,
+    display: 'flex',
+    alignItems: 'center',
+    justifyContent: 'center',
+    gap: theme.spacing(1),
+    color: theme.colors.text.secondary,
+    pointerEvents: 'none',
+  }),
+  badgeCorner: css({
+    position: 'absolute',
+    top: theme.spacing(0.5),
+    right: theme.spacing(5),
+    display: 'flex',
+    alignItems: 'center',
+    gap: theme.spacing(0.5),
+    padding: theme.spacing(0.25, 1),
+    borderRadius: theme.shape.radius.default,
+    background: theme.colors.background.secondary,
+    color: theme.colors.text.secondary,
+    fontSize: theme.typography.bodySmall.fontSize,
+    pointerEvents: 'none',
+  }),
   json: css({ height: '100%', overflow: 'auto' }),
   jsonRow: css({ borderBottom: `1px solid ${theme.colors.border.weak}`, padding: theme.spacing(0.5, 0) }),
 });
````

### 11/44 `src/components/ServiceSelectionScene.tsx` (modified)

placeholder rows with a timer while loading; page buttons next to "Showing"; "Split by level" switch

PATCH-BLOCK 11/44 src/components/ServiceSelectionScene.tsx old=edf5193c25a3663d07bed1f9e870a9b85b9d324c new=3b04e5248786dcf41d7e01cb91c9c2b996103019 sha256=f79314cc031be509a4738bf8a2754d5155acffb364a3129e26025af3b11f151e
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/ServiceSelectionScene.tsx b/plugins/kotak-starrocks-logs-app/src/components/ServiceSelectionScene.tsx
index edf5193c25a3663d07bed1f9e870a9b85b9d324c..3b04e5248786dcf41d7e01cb91c9c2b996103019 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/ServiceSelectionScene.tsx
+++ b/plugins/kotak-starrocks-logs-app/src/components/ServiceSelectionScene.tsx
@@ -10,14 +10,14 @@ import {
   VizPanel,
   sceneGraph,
 } from '@grafana/scenes';
-import { Alert, Button, Icon, IconButton, Pagination, Select, Tooltip, useStyles2 } from '@grafana/ui';
+import { Button, Icon, IconButton, InlineSwitch, Pagination, Select, Spinner, Tooltip, useStyles2 } from '@grafana/ui';
 
 import { runLogsQuery } from '../datasource/StarRocksLogsDataSource';
 import { getFavorites, toggleFavorite } from '../state/storage';
 import { QuerySpec } from '../state/types';
 import { displayLabel, getExploration } from './api';
 import { barsPanel, queryRunner, staticData } from './panels';
-import { ErrorBox, Loading, SampleList } from './ui';
+import { Elapsed, ErrorBox, SampleList } from './ui';
 
 interface ServiceValue {
   value: string;
@@ -30,7 +30,10 @@ export interface ServiceSelectionState extends SceneObjectState {
   label: string;
   search: string;
   withLevel: boolean;
-  levelNotice: boolean;
+  /** keep about 1 in n rows (hash sample) for the level split; counts are multiplied by n */
+  sample?: number;
+  /** the tenant's level is read from the message (slow): levels are shown on request */
+  levelFromMessage: boolean;
   page: number;
   pageSize: number;
   values?: ServiceValue[];
@@ -65,7 +68,11 @@ export class ServiceSelectionScene extends SceneObjectBase<ServiceSelectionState
       panels: [],
       samples: {},
       favorites: getFavorites(state.spec.datasource, state.spec.view, state.label),
-      $data: queryRunner('serviceVolume', state.spec, { label: state.label, withLevel: state.withLevel }),
+      $data: queryRunner('serviceVolume', state.spec, {
+        label: state.label,
+        withLevel: state.withLevel,
+        sample: state.sample,
+      }),
       ...state,
     });
     this.addActivationHandler(() => {
@@ -188,7 +195,7 @@ export class ServiceSelectionScene extends SceneObjectBase<ServiceSelectionState
 }
 
 /** Buttons in a row's header: favourite, Include / Remove (label filter), Show logs. */
-function RowActions({ scene, value }: { scene: ServiceSelectionScene; value: string }) {
+export function RowActions({ scene, value }: { scene: ServiceSelectionScene; value: string }) {
   const styles = useStyles2(getStyles);
   const api = getExploration(scene);
   const { label, favorites } = scene.useState();
@@ -228,15 +235,33 @@ function RowActions({ scene, value }: { scene: ServiceSelectionScene; value: str
   );
 }
 
+/** "Loading volumes… 12 s" with placeholder rows, so a slow first load does not look like an empty page. */
+function LoadingRows({ text }: { text: string }) {
+  const styles = useStyles2(getStyles);
+  return (
+    <div data-testid="grid-loading">
+      <div className={styles.loadingText}>
+        <Spinner inline /> {text}
+        <Elapsed />
+      </div>
+      {[0, 1, 2].map((i) => (
+        <div key={i} className={styles.placeholderRow} />
+      ))}
+    </div>
+  );
+}
+
 function ServiceSelectionRenderer({ model }: SceneComponentProps<ServiceSelectionScene>) {
   const styles = useStyles2(getStyles);
-  const { panels, samples, samplesLoading, samplesError, search, page, pageSize, label, levelNotice, $data } =
+  const { panels, samples, samplesLoading, samplesError, search, page, pageSize, label, $data, levelFromMessage } =
     model.useState();
+  const { withLevel, sample } = model.useState();
   const data = $data.useState().data;
   const filtered = model.filtered();
   const visible = model.visible();
   const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
   const name = displayLabel(label);
+  const api = getExploration(model);
 
   const header = (
     <div className={styles.header}>
@@ -255,10 +280,10 @@ function ServiceSelectionRenderer({ model }: SceneComponentProps<ServiceSelectio
           inputValue={search}
           onInputChange={(text, meta) => {
             if (meta.action === 'input-change') {
-              getExploration(model).setSearch(text);
+              api.setSearch(text);
             }
           }}
-          onChange={(o) => getExploration(model).setSearch(o?.value ?? '')}
+          onChange={(o) => api.setSearch(o?.value ?? '')}
           noOptionsMessage={`No ${name} values match`}
         />
       </div>
@@ -276,7 +301,7 @@ function ServiceSelectionRenderer({ model }: SceneComponentProps<ServiceSelectio
           <Icon name="info-circle" className={styles.muted} />
         </Tooltip>
       </span>
-      <div className={styles.pagination}>
+      <div className={styles.pagination} data-testid="grid-pagination">
         <Pagination
           currentPage={page + 1}
           numberOfPages={pages}
@@ -284,6 +309,28 @@ function ServiceSelectionRenderer({ model }: SceneComponentProps<ServiceSelectio
           hideWhenSinglePage
         />
       </div>
+      {levelFromMessage && (
+        <div className={styles.levels}>
+          <InlineSwitch
+            label="Split by level"
+            showLabel
+            value={withLevel}
+            onChange={() => api.setGridLevels(!withLevel)}
+            data-testid="grid-levels"
+          />
+          <Tooltip
+            content={
+              withLevel && sample
+                ? `Levels are read from the message text, a regexp per line. To stay fast over this range the counts per level are estimated from about 1 in ${sample} lines.`
+                : 'This tenant has no level column: levels are read from the message text, which is slow for every service at once. Turn on to see them anyway.'
+            }
+          >
+            <span className={styles.muted}>
+              {withLevel && sample ? `≈ estimated (1 in ${sample} lines)` : <Icon name="info-circle" />}
+            </span>
+          </Tooltip>
+        </div>
+      )}
     </div>
   );
 
@@ -291,27 +338,24 @@ function ServiceSelectionRenderer({ model }: SceneComponentProps<ServiceSelectio
     return (
       <div>
         {header}
-        <Loading text="Loading volumes…" />
+        <LoadingRows text={`Loading ${name} volumes…`} />
       </div>
     );
   }
   if (data.state === LoadingState.Error) {
     return (
-      <ErrorBox
-        title={`Could not load the ${name} volumes`}
-        error={data.errors?.[0]?.message ?? data.error?.message ?? 'error'}
-      />
+      <div>
+        {header}
+        <ErrorBox
+          title={`Could not load the ${name} volumes`}
+          error={data.errors?.[0]?.message ?? data.error?.message ?? 'error'}
+        />
+      </div>
     );
   }
   return (
     <div>
       {header}
-      {levelNotice && (
-        <Alert severity="info" title="Volumes are not split by level for this range">
-          This tenant&apos;s level is read from the message text, which is slow over long ranges. Shorten the range to
-          see levels.
-        </Alert>
-      )}
       {filtered.length === 0 && (
         <div className={styles.muted}>
           {search !== '' ? `No ${name} values match "${search}".` : 'No logs in the selected time range.'}
@@ -353,7 +397,23 @@ const getStyles = (theme: GrafanaTheme2) => ({
     color: theme.colors.text.secondary,
     whiteSpace: 'nowrap',
   }),
-  pagination: css({ marginLeft: 'auto' }),
+  // right after "Showing N of M", not at the far edge
+  pagination: css({ display: 'flex', alignItems: 'center' }),
+  levels: css({ display: 'inline-flex', alignItems: 'center', gap: theme.spacing(1), marginLeft: 'auto' }),
+  loadingText: css({
+    display: 'flex',
+    alignItems: 'center',
+    gap: theme.spacing(1),
+    color: theme.colors.text.secondary,
+    margin: theme.spacing(1, 0),
+  }),
+  placeholderRow: css({
+    height: 220,
+    marginBottom: theme.spacing(1),
+    borderRadius: theme.shape.radius.default,
+    background: theme.colors.background.secondary,
+    opacity: 0.6,
+  }),
   footer: css({ display: 'flex', justifyContent: 'flex-end', marginTop: theme.spacing(1) }),
   muted: css({ color: theme.colors.text.secondary }),
   actions: css({ display: 'inline-flex', alignItems: 'center', gap: theme.spacing(1) }),
````

### 12/44 `src/components/api.ts` (modified)

exploration API: `setGridLevels`

PATCH-BLOCK 12/44 src/components/api.ts old=73003a5a36342df12fb6ac9406dff410c38a6167 new=8d6dfba606c38ab1560c93fd268325da4492875f sha256=7258206751850d129ee1604d4ab97d83a29f4b1857ca7df814abd593f3afe47a
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/api.ts b/plugins/kotak-starrocks-logs-app/src/components/api.ts
index 73003a5a36342df12fb6ac9406dff410c38a6167..8d6dfba606c38ab1560c93fd268325da4492875f 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/api.ts
+++ b/plugins/kotak-starrocks-logs-app/src/components/api.ts
@@ -30,6 +30,8 @@ export interface ExplorationApi {
   selectValue(label: string, value: string): void;
   setSearch(search: string): void;
   allowLongScan(): void;
+  /** service grid of a message-level tenant: split volumes by level (sampled over long ranges) */
+  setGridLevels(on: boolean): void;
   shrinkRange(hours: number): void;
 }
 
````

### 13/44 `src/components/layout.test.ts` (new file)

unit tests: fill height

PATCH-BLOCK 13/44 src/components/layout.test.ts old=none new=1953ba19ccbb76041f59e2eba5b0a1e84d394692 sha256=9b636466be48f83ba4ed8c6913e75939cad543626cd7482e1a4203ea29a03257
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/layout.test.ts b/plugins/kotak-starrocks-logs-app/src/components/layout.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1953ba19ccbb76041f59e2eba5b0a1e84d394692
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/components/layout.test.ts
@@ -0,0 +1,27 @@
+import { heightToFill } from './layout';
+
+function el(top: number): HTMLElement {
+  return { getBoundingClientRect: () => ({ top }) } as unknown as HTMLElement;
+}
+
+function container(top: number, clientHeight: number, scrollTop: number): HTMLElement {
+  return { getBoundingClientRect: () => ({ top }), clientHeight, scrollTop } as unknown as HTMLElement;
+}
+
+describe('heightToFill (the Logs tab ends at the bottom of the visible page)', () => {
+  it('fills the scroll container below the element, whatever the scroll position', () => {
+    // container from y=80, 900 px tall; the tab starts 300 px into the content
+    expect(heightToFill(el(380), container(80, 900, 0), 16, 100)).toBe(900 - 300 - 16);
+    // scrolled by 200: the tab is 200 px higher on screen, same height
+    expect(heightToFill(el(180), container(80, 900, 200), 16, 100)).toBe(900 - 300 - 16);
+  });
+
+  it('never below the minimum (small windows scroll the page instead)', () => {
+    expect(heightToFill(el(380), container(80, 400, 0), 16, 480)).toBe(480);
+  });
+
+  it('without a scroll container: the window', () => {
+    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
+    expect(heightToFill(el(250), undefined, 10, 100)).toBe(740);
+  });
+});
````

### 14/44 `src/components/layout.ts` (new file)

makes the Logs tab end at the bottom of the window

PATCH-BLOCK 14/44 src/components/layout.ts old=none new=6bce838dc748bbb9659951b0225b65cce4e5c347 sha256=2c04e480d7c62def17e2b63cd127fce3f1ed520059e54a376025d106008907b9
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/layout.ts b/plugins/kotak-starrocks-logs-app/src/components/layout.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6bce838dc748bbb9659951b0225b65cce4e5c347
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/components/layout.ts
@@ -0,0 +1,59 @@
+import { RefObject, useLayoutEffect, useState } from 'react';
+
+/** Nearest ancestor that scrolls vertically (Grafana's page content), or undefined for the window. */
+export function scrollParent(el: HTMLElement | null): HTMLElement | undefined {
+  let cur = el?.parentElement ?? null;
+  while (cur) {
+    const overflowY = window.getComputedStyle(cur).overflowY;
+    if (overflowY === 'auto' || overflowY === 'scroll') {
+      return cur;
+    }
+    cur = cur.parentElement;
+  }
+  return undefined;
+}
+
+/**
+ * Height that makes an element end at the bottom of the visible page area (its scroll container), so a page
+ * fits the window and only the panel inside scrolls. Follows window resizes and header changes (wrapping,
+ * notices). Never less than `min`.
+ */
+export function heightToFill(el: HTMLElement, container: HTMLElement | undefined, bottom: number, min: number): number {
+  const rect = el.getBoundingClientRect();
+  if (!container) {
+    return Math.max(min, Math.floor(window.innerHeight - rect.top - bottom));
+  }
+  const box = container.getBoundingClientRect();
+  // position inside the scrolled content, independent of the current scroll position
+  const top = rect.top - box.top + container.scrollTop;
+  return Math.max(min, Math.floor(container.clientHeight - top - bottom));
+}
+
+export function useFillHeight(ref: RefObject<HTMLElement>, opts: { bottom?: number; min?: number } = {}) {
+  // Grafana's page content has 16 px padding below; 32 keeps the page itself from scrolling
+  const { bottom = 32, min = 480 } = opts;
+  const [height, setHeight] = useState<number>();
+  useLayoutEffect(() => {
+    const el = ref.current;
+    if (!el) {
+      return;
+    }
+    const container = scrollParent(el);
+    const update = () => setHeight(heightToFill(el, container, bottom, min));
+    update();
+    window.addEventListener('resize', update);
+    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : undefined;
+    // the header above can grow (wrapping, notices); the container can be resized
+    if (el.parentElement?.parentElement) {
+      observer?.observe(el.parentElement.parentElement);
+    }
+    if (container) {
+      observer?.observe(container);
+    }
+    return () => {
+      window.removeEventListener('resize', update);
+      observer?.disconnect();
+    };
+  }, [ref, bottom, min]);
+  return height;
+}
````

### 15/44 `src/components/layoutHook.test.tsx` (new file)

unit tests: fill-height hook

PATCH-BLOCK 15/44 src/components/layoutHook.test.tsx old=none new=163dc521324135dcc4548ad0832258feb38fe96d sha256=ad2d7b754b3283c4620caa69322d6fc4baf7ea6978baa67fa6b7ed93225ed84c
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/layoutHook.test.tsx b/plugins/kotak-starrocks-logs-app/src/components/layoutHook.test.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..163dc521324135dcc4548ad0832258feb38fe96d
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/components/layoutHook.test.tsx
@@ -0,0 +1,54 @@
+import { act, render } from '@testing-library/react';
+import { useRef } from 'react';
+
+import { scrollParent, useFillHeight } from './layout';
+
+function Probe({ onHeight }: { onHeight: (h?: number) => void }) {
+  const ref = useRef<HTMLDivElement>(null);
+  onHeight(useFillHeight(ref, { bottom: 10, min: 100 }));
+  return <div ref={ref} data-testid="probe" />;
+}
+
+describe('useFillHeight / scrollParent', () => {
+  it('finds the nearest scrolling ancestor', () => {
+    const outer = document.createElement('div');
+    outer.style.overflowY = 'auto';
+    const inner = document.createElement('div');
+    const leaf = document.createElement('div');
+    outer.appendChild(inner);
+    inner.appendChild(leaf);
+    document.body.appendChild(outer);
+    expect(scrollParent(leaf)).toBe(outer);
+    expect(scrollParent(outer)).toBeUndefined();
+    outer.remove();
+  });
+
+  it('measures on mount and on window resize', () => {
+    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
+    const heights: Array<number | undefined> = [];
+    render(<Probe onHeight={(h) => heights.push(h)} />);
+    // jsdom elements sit at top 0: 800 - 0 - 10
+    expect(heights[heights.length - 1]).toBe(790);
+    Object.defineProperty(window, 'innerHeight', { value: 500, configurable: true });
+    act(() => {
+      window.dispatchEvent(new Event('resize'));
+    });
+    expect(heights[heights.length - 1]).toBe(490);
+  });
+
+  it('inside a scrolling container: fills the container below the element, never less than min', () => {
+    const container = document.createElement('div');
+    container.style.overflowY = 'auto';
+    document.body.appendChild(container);
+    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true });
+    const heights: Array<number | undefined> = [];
+    render(<Probe onHeight={(h) => heights.push(h)} />, { container });
+    expect(heights[heights.length - 1]).toBe(590);
+    Object.defineProperty(container, 'clientHeight', { value: 50, configurable: true });
+    act(() => {
+      window.dispatchEvent(new Event('resize'));
+    });
+    expect(heights[heights.length - 1]).toBe(100);
+    container.remove();
+  });
+});
````

### 16/44 `src/components/pages.test.tsx` (new file)

unit tests: rendered pages (header, page bar, notices, grid, tabs, configuration page)

PATCH-BLOCK 16/44 src/components/pages.test.tsx old=none new=243c6b7ed352c4c2f8b0da626c5c08365de8e721 sha256=d1a93440387c97dae2c126ed951f4365a787b1d2feb526a359bc60da702ac1a2
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/pages.test.tsx b/plugins/kotak-starrocks-logs-app/src/components/pages.test.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..243c6b7ed352c4c2f8b0da626c5c08365de8e721
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/components/pages.test.tsx
@@ -0,0 +1,599 @@
+import { act, fireEvent, render, screen, within } from '@testing-library/react';
+import { of } from 'rxjs';
+
+import { createDataFrame, FieldType, LoadingState, PanelData, PluginType, rangeUtil } from '@grafana/data';
+import { setPluginImportUtils } from '@grafana/runtime';
+import { behaviors, EmbeddedScene, SceneQueryRunner, SceneReactObject } from '@grafana/scenes';
+
+import { setAppConfig } from '../config/config';
+import { AppConfig } from './AppConfig';
+import { CappedTimeRange } from './CappedTimeRange';
+import { LogsExploration, LogsExplorationState } from './LogsExploration';
+import { BreakdownScene } from './BreakdownScene';
+import { LogsTabScene } from './LogsTabScene';
+import { PatternsTabScene } from './PatternsTabScene';
+import { RowActions, ServiceSelectionScene } from './ServiceSelectionScene';
+import { COL_VIEW, ctxFor, flush, MSG_VIEW } from './testScene';
+
+const fetchOldestLog = jest.fn();
+const fetchViews = jest.fn();
+const listDatasources = jest.fn();
+const post = jest.fn();
+const runLogsQuery = jest.fn();
+
+jest.mock('@grafana/runtime', () => ({
+  ...jest.requireActual('@grafana/runtime'),
+  getBackendSrv: () => ({ post: (...a: unknown[]) => post(...a) }),
+}));
+jest.mock('../datasource/api', () => ({
+  ...jest.requireActual('../datasource/api'),
+  listDatasources: () => listDatasources(),
+  fetchViews: (...a: unknown[]) => fetchViews(...a),
+}));
+jest.mock('../datasource/StarRocksLogsDataSource', () => ({
+  ...jest.requireActual('../datasource/StarRocksLogsDataSource'),
+  buildContext: async (view: string) => ctxFor(view),
+  runLogsQuery: (...a: unknown[]) => runLogsQuery(...a),
+}));
+jest.mock('../datasource/oldest', () => ({ fetchOldestLog: (...a: unknown[]) => fetchOldestLog(...a) }));
+
+// panels never load their plugin here (their content is Grafana's); queries are set by the tests
+setPluginImportUtils({
+  importPanelPlugin: () => new Promise(() => undefined),
+  getPanelPluginFromCache: () => undefined,
+});
+// runWithTimeRange is private in the typings; it is where every query of a runner starts
+jest
+  .spyOn(SceneQueryRunner.prototype as unknown as { runWithTimeRange: () => Promise<void> }, 'runWithTimeRange')
+  .mockImplementation(async () => undefined);
+
+// 14 Nov 2023 22:13:20 UTC
+const OLDEST = 1_700_000_000_000;
+
+beforeEach(() => {
+  localStorage.clear();
+  setAppConfig({});
+  listDatasources.mockReturnValue([
+    { uid: 'ds1', name: 'logs1' },
+    { uid: 'ds2', name: 'logs2' },
+  ]);
+  fetchViews.mockResolvedValue([COL_VIEW, MSG_VIEW]);
+  fetchOldestLog.mockReset().mockResolvedValue(OLDEST);
+  runLogsQuery.mockReset().mockReturnValue(of({ data: [] }));
+});
+
+/** The page as the app shows it: time range (UTC here), query controller, the exploration. */
+async function page(state: Partial<LogsExplorationState> = {}, from = 'now-1h', to = 'now', keepBody = false) {
+  const ex = new LogsExploration(state);
+  const controller = new behaviors.SceneQueryController();
+  const timeRange = new CappedTimeRange({ from, to, timeZone: 'utc' });
+  const scene = new EmbeddedScene({ $timeRange: timeRange, $behaviors: [controller], body: ex });
+  scene.activate();
+  ex.activate();
+  await flush();
+  if (!keepBody) {
+    ex.setState({ body: new SceneReactObject({ reactNode: <div data-testid="body">body</div> }) });
+  }
+  const view = render(<ex.Component model={ex} />);
+  await act(flush);
+  return { ex, controller, timeRange, view };
+}
+
+describe('page header and page bar', () => {
+  it('data source and view pickers; "Show logs" opens the logs and "Back" returns, the pickers stay in row 1', async () => {
+    const { ex } = await page();
+    expect(screen.getByTestId('datasource-picker').textContent).toBe('logs1');
+    expect(screen.getByTestId('view-picker').textContent).toBe(COL_VIEW);
+    expect(screen.getByText('Last 1 hour')).toBeInTheDocument();
+
+    const bar = screen.getByTestId('page-bar');
+    expect(within(bar).getByTestId('show-logs').textContent).toBe('Show logs');
+    act(() => ex.addFilter({ key: 'k8s_namespace_name', op: '=', value: 'prod' }));
+    expect(within(bar).getByTestId('show-logs').textContent).toBe('Show logs of the current filters');
+    fireEvent.click(screen.getByTestId('show-logs'));
+    expect(ex.state.page).toBe('details');
+    ex.setState({ body: new SceneReactObject({ reactNode: <div /> }) });
+    await act(flush);
+    expect(screen.getByTestId('back-to-services').textContent).toBe('Back to service values');
+    expect(screen.getByTestId('datasource-picker')).toBeInTheDocument();
+    fireEvent.click(screen.getByTestId('back-to-services'));
+    expect(ex.state.page).toBe('selection');
+  });
+
+  it('Oldest log on the right of the page bar, in the time zone of the page; "…" while looking, hidden on error', async () => {
+    const { ex } = await page();
+    const oldest = within(screen.getByTestId('page-bar')).getByTestId('oldest-log');
+    expect(oldest.textContent).toBe('Oldest log 14 Nov 2023 22:13');
+    act(() => ex.setState({ oldest: { key: 'x', loading: true } }));
+    expect(screen.getByTestId('oldest-log').textContent).toBe('Oldest log …');
+    act(() => ex.setState({ oldest: { key: 'x', ms: null } }));
+    expect(screen.getByTestId('oldest-log').textContent).toBe('Oldest log no lines');
+    act(() => ex.setState({ oldest: { key: 'x', error: 'timeout' } }));
+    expect(screen.queryByTestId('oldest-log')).toBeNull();
+  });
+
+  it('"Loading … Cancel" while queries run; Cancel stops all of them', async () => {
+    const { controller } = await page();
+    expect(screen.queryByTestId('running-indicator')).toBeNull();
+    const cancelAll = jest.spyOn(controller, 'cancelAll');
+    act(() => controller.setState({ isRunning: true }));
+    const running = within(screen.getByTestId('page-bar')).getByTestId('running-indicator');
+    expect(running.textContent).toContain('Loading');
+    fireEvent.click(screen.getByTestId('cancel-queries'));
+    expect(cancelAll).toHaveBeenCalled();
+    act(() => controller.setState({ isRunning: false }));
+    expect(screen.queryByTestId('running-indicator')).toBeNull();
+  });
+
+  it('a range over 24 h is cut and says so under the header; Dismiss, or it goes after 20 s', async () => {
+    const { timeRange } = await page();
+    act(() => timeRange.onTimeRangeChange(rangeUtil.convertRawToRange({ from: 'now-7d', to: 'now' })));
+    expect(timeRange.state.from).toBe('now-24h');
+    const notice = within(screen.getByTestId('page-bar')).getByTestId('range-capped');
+    expect(notice.textContent).toContain('Time range limited to 24 hours');
+    fireEvent.click(within(notice).getByLabelText('Dismiss'));
+    expect(screen.queryByTestId('range-capped')).toBeNull();
+
+    jest.useFakeTimers();
+    act(() => timeRange.onTimeRangeChange(rangeUtil.convertRawToRange({ from: 'now-2d', to: 'now' })));
+    expect(screen.getByTestId('range-capped')).toBeInTheDocument();
+    act(() => {
+      jest.advanceTimersByTime(20_000);
+    });
+    expect(screen.queryByTestId('range-capped')).toBeNull();
+    jest.useRealTimers();
+  });
+
+  it('a range before the oldest line: a notice that jumps to the first 24 hours of logs', async () => {
+    const { timeRange } = await page({}, '2023-01-01T00:00:00Z', '2023-01-02T00:00:00Z');
+    const notice = screen.getByTestId('before-oldest');
+    expect(notice.textContent).toContain(`No logs in this time range: ${COL_VIEW} starts on 14 Nov 2023 22:13`);
+    fireEvent.click(within(notice).getByText('Show the first 24 hours of logs'));
+    expect(timeRange.state.value.from.valueOf()).toBe(OLDEST);
+    expect(timeRange.state.value.to.valueOf()).toBe(OLDEST + 24 * 3_600_000);
+    await act(flush);
+    expect(screen.queryByTestId('before-oldest')).toBeNull();
+  });
+
+  it('configuration problems are listed above the page', async () => {
+    setAppConfig({ maxRangeHours: 0 } as never);
+    await page();
+    expect(screen.getByText('The app configuration has problems; invalid entries are ignored')).toBeInTheDocument();
+    expect(screen.getByText(/maxRangeHours must be a number/)).toBeInTheDocument();
+  });
+});
+
+describe('label tabs and the logs page', () => {
+  it('grid: the service tab, "Add label" adds a closable tab', async () => {
+    const { ex } = await page();
+    expect(screen.getByRole('tab', { name: 'service' })).toBeInTheDocument();
+    fireEvent.click(screen.getByTestId('add-label'));
+    fireEvent.click(await screen.findByText('k8s_namespace_name'));
+    expect(ex.state.labelTabs).toEqual(['k8s_namespace_name']);
+    expect(ex.primaryLabel()).toBe('k8s_namespace_name');
+    fireEvent.click(screen.getByLabelText('Remove k8s_namespace_name tab'));
+    expect(ex.state.labelTabs).toEqual([]);
+    expect(ex.primaryLabel()).toBe('k8s_service_name');
+  });
+
+  it('logs page: tabs with counts, level select, line search with Include / Exclude, filter chips', async () => {
+    const { ex } = await page({ datasource: 'ds1', view: MSG_VIEW, page: 'details' });
+    expect(screen.getByRole('tab', { name: /Labels.*2/ })).toBeInTheDocument();
+    expect(screen.getByRole('tab', { name: /Fields.*1/ })).toBeInTheDocument();
+    expect(screen.getByRole('tab', { name: /Patterns.*1/ })).toBeInTheDocument();
+    fireEvent.click(screen.getByRole('tab', { name: /Patterns/ }));
+    expect(ex.state.tab).toBe('patterns');
+
+    const input = screen.getByTestId('line-filter-input');
+    fireEvent.change(input, { target: { value: 'timed out' } });
+    fireEvent.keyDown(input, { key: 'Enter' });
+    expect(ex.state.lineFilters).toEqual([{ op: 'include', value: 'timed out', caseSensitive: false, regex: false }]);
+    fireEvent.click(screen.getByLabelText('Match case'));
+    fireEvent.click(screen.getByLabelText('Regex'));
+    fireEvent.change(input, { target: { value: 'tim.d' } });
+    fireEvent.click(screen.getByTestId('line-exclude'));
+    expect(ex.state.lineFilters[1]).toEqual({ op: 'exclude', value: 'tim.d', caseSensitive: true, regex: true });
+    fireEvent.click(screen.getByTestId('line-include'));
+    expect(ex.state.lineFilters).toHaveLength(2);
+
+    act(() => {
+      ex.togglePatternFilter('Timeout', 'exclude');
+      ex.addFieldFilter({ key: 'status', op: '=', value: '500' });
+    });
+    const chips = screen.getAllByTestId(/-chip$/).map((c) => c.textContent);
+    expect(chips).toEqual([
+      'line contains (any case) "timed out"',
+      'line does not contain regex "tim.d"',
+      'not pattern "Timeout"',
+      'status = 500 (in message)',
+    ]);
+    while (screen.queryAllByTestId(/-chip$/).length > 0) {
+      fireEvent.click(within(screen.getAllByTestId(/-chip$/)[0]).getByLabelText('Remove filter'));
+    }
+    expect(ex.state.lineFilters.length + ex.state.patternFilters.length + ex.state.fieldFilters.length).toBe(0);
+
+    fireEvent.keyDown(within(screen.getByTestId('log-levels')).getByRole('combobox'), { key: 'ArrowDown' });
+    fireEvent.click(await screen.findByText('error'));
+    expect(ex.state.levels).toEqual(['error']);
+  });
+});
+
+describe('service grid', () => {
+  function done(values: Array<[string, number]>): PanelData {
+    return {
+      state: LoadingState.Done,
+      series: values.map(([value, total]) =>
+        createDataFrame({
+          name: 'info',
+          fields: [
+            { name: 'time', type: FieldType.time, values: [OLDEST] },
+            { name: 'info', type: FieldType.number, values: [total] },
+          ],
+          meta: { custom: { value, total } },
+        })
+      ),
+      timeRange: rangeUtil.convertRawToRange({ from: 'now-1h', to: 'now' }),
+    };
+  }
+
+  async function grid(view = COL_VIEW) {
+    const p = await page({ datasource: 'ds1', view }, 'now-6h', 'now', true);
+    return { ...p, g: p.ex.state.body as ServiceSelectionScene };
+  }
+
+  it('placeholder rows with a timer while the volumes load; an error box when they fail', async () => {
+    const { g } = await grid();
+    expect(screen.getByTestId('grid-loading').textContent).toContain('Loading service volumes…');
+    act(() =>
+      g.state.$data.setState({
+        data: { ...done([]), state: LoadingState.Error, errors: [{ message: 'Query timed out after 120 s' }] },
+      })
+    );
+    expect(screen.getByText('Could not load the service volumes')).toBeInTheDocument();
+    expect(screen.getByText('Query timed out after 120 s')).toBeInTheDocument();
+  });
+
+  it('a row per value with its newest lines; search narrows them; empty ranges say so', async () => {
+    const { g } = await grid();
+    act(() =>
+      g.state.$data.setState({
+        data: done([
+          ['checkout', 10],
+          ['payments', 5],
+        ]),
+      })
+    );
+    expect(screen.getByTestId('service-row-checkout')).toBeInTheDocument();
+    expect(screen.getByTestId('service-row-payments')).toBeInTheDocument();
+    expect(screen.getByText(/of 2/)).toBeInTheDocument();
+    act(() => g.setSearch('zzz'));
+    expect(screen.getByText('No service values match "zzz".')).toBeInTheDocument();
+    act(() => {
+      g.setSearch('');
+      g.state.$data.setState({ data: done([]) });
+    });
+    expect(screen.getByText('No logs in the selected time range.')).toBeInTheDocument();
+  });
+
+  it('more than a page: pagination above and below the rows', async () => {
+    const { g } = await grid();
+    act(() =>
+      g.state.$data.setState({ data: done(Array.from({ length: 25 }, (_, i): [string, number] => [`s${i}`, 100 - i])) })
+    );
+    expect(screen.getAllByTestId(/^service-row-/)).toHaveLength(20);
+    const pager = screen.getByTestId('grid-pagination');
+    fireEvent.click(within(pager).getByText('2'));
+    expect(g.state.page).toBe(1);
+    expect(screen.getAllByTestId(/^service-row-/)).toHaveLength(5);
+  });
+
+  it('level from the message: "Split by level" off by default; on, with the estimate note over an hour', async () => {
+    const { ex } = await grid(MSG_VIEW);
+    const toggle = screen.getByTestId('grid-levels');
+    expect((toggle as HTMLInputElement).checked).toBe(false);
+    fireEvent.click(toggle);
+    expect(ex.state.gridLevels).toBe(true);
+    await act(flush);
+    expect(screen.getByText('≈ estimated (1 in 10 lines)')).toBeInTheDocument();
+  });
+
+  it('a tenant with a level column has no "Split by level" switch', async () => {
+    await grid(COL_VIEW);
+    expect(screen.queryByTestId('grid-levels')).toBeNull();
+  });
+
+  it('row buttons: favourite, Include / Remove, Show logs', async () => {
+    const { ex, g, view } = await grid();
+    view.unmount();
+    render(<RowActions scene={g} value="checkout" />);
+    fireEvent.click(screen.getByTestId('favorite-checkout'));
+    expect(g.state.favorites).toEqual(['checkout']);
+    fireEvent.click(screen.getByTestId('include-checkout'));
+    expect(ex.hasFilter('k8s_service_name', 'checkout')).toBe(true);
+    expect(screen.getByTestId('include-checkout').textContent).toBe('Remove');
+    fireEvent.click(screen.getByTestId('include-checkout'));
+    expect(ex.hasFilter('k8s_service_name', 'checkout')).toBe(false);
+    fireEvent.click(screen.getByTestId('show-logs-checkout'));
+    expect(ex.state.page).toBe('details');
+    expect(ex.getLabelFilters()).toEqual([{ key: 'k8s_service_name', op: '=', value: 'checkout' }]);
+  });
+});
+
+describe('configuration page', () => {
+  const plugin = (jsonData: object) =>
+    ({ meta: { id: 'kotak-starrocks-logs-app', type: PluginType.app, jsonData } }) as never;
+
+  it('shows the effective configuration and the problems of the JSON', () => {
+    render(<AppConfig plugin={plugin({ maxScanHours: -1 })} query={{}} />);
+    expect(screen.getByText('Configuration problems (invalid entries are ignored)')).toBeInTheDocument();
+    expect(screen.getByText(/maxScanHours must be a number/)).toBeInTheDocument();
+    const textarea = screen.getByRole('textbox');
+    fireEvent.change(textarea, { target: { value: '{ not json' } });
+    expect(screen.getByText(/^JSON:/)).toBeInTheDocument();
+    expect(screen.getByText('Save').closest('button')).toBeDisabled();
+    fireEvent.click(screen.getByText('Load example'));
+    expect((textarea as HTMLTextAreaElement).value).toContain('app_1961_observability');
+  });
+
+  it('Test: list my views, per data source, with errors', async () => {
+    fetchViews.mockImplementation(async (_r: unknown, uid: string) => {
+      if (uid === 'ds2') {
+        throw new Error('Access denied');
+      }
+      return [COL_VIEW];
+    });
+    render(<AppConfig plugin={plugin({})} query={{}} />);
+    fireEvent.click(screen.getByText('Test: list my views'));
+    expect((await screen.findByTestId('config-views')).textContent).toBe(
+      `logs1: ${COL_VIEW}\nlogs2: error: Access denied`
+    );
+  });
+
+  it('Save posts the settings; a failure is shown', async () => {
+    post.mockRejectedValue(new Error('403 Forbidden'));
+    render(<AppConfig plugin={plugin({ maxScanHours: 3 })} query={{}} />);
+    fireEvent.click(screen.getByText('Save'));
+    expect(await screen.findByText('403 Forbidden')).toBeInTheDocument();
+    expect(post).toHaveBeenCalledWith('/api/plugins/kotak-starrocks-logs-app/settings', {
+      enabled: true,
+      pinned: true,
+      jsonData: { maxScanHours: 3 },
+    });
+  });
+});
+
+function linesFrame(n: number, search?: object) {
+  return createDataFrame({
+    fields: [
+      { name: 'timestamp', type: FieldType.time, values: Array.from({ length: n }, (_, i) => OLDEST + i) },
+      { name: 'body', type: FieldType.string, values: Array.from({ length: n }, (_, i) => `status=500 line ${i}`) },
+      { name: 'severity', type: FieldType.string, values: Array.from({ length: n }, () => 'error') },
+      { name: 'labels', type: FieldType.other, values: Array.from({ length: n }, () => ({})) },
+    ],
+    meta: search ? { custom: { search } } : undefined,
+  });
+}
+
+const HOUR = 3_600_000;
+
+describe('Logs tab', () => {
+  async function logs(state: Partial<LogsExplorationState> = {}, from = 'now-1h') {
+    const p = await page({ datasource: 'ds1', view: COL_VIEW, page: 'details', ...state }, from, 'now', true);
+    return { ...p, tab: p.ex.state.body as LogsTabScene };
+  }
+  const progress = (o: object) => ({
+    searchedFromMs: 5 * HOUR,
+    searchedToMs: 6 * HOUR,
+    rangeFromMs: 0,
+    rangeToMs: 6 * HOUR,
+    windows: 1,
+    totalWindows: 4,
+    lines: 12,
+    limit: 1000,
+    done: false,
+    ...o,
+  });
+
+  it('loading badges over the volume and the lines; toolbar changes the display; Explore link', async () => {
+    const { ex, tab } = await logs();
+    expect(screen.getByTestId('volume-panel')).toBeInTheDocument();
+    const badges = () => screen.queryAllByTestId('panel-loading').map((b) => b.textContent?.trim());
+    expect(badges()).toEqual(['Loading log volume…', 'Loading lines…']);
+    // list first: the volume query starts once the first lines are in (as in the internal UI)
+    expect(tab.getVolumeRunner()!.isActive).toBe(false);
+    act(() => tab.getLinesRunner()!.setState({ data: { ...done(), state: LoadingState.Loading } }));
+    expect(tab.getVolumeRunner()!.isActive).toBe(false);
+    act(() => tab.getLinesRunner()!.setState({ data: { ...done(), series: [linesFrame(2)] } }));
+    await act(flush);
+    expect(tab.state.volumeReady).toBe(true);
+    expect(tab.getVolumeRunner()!.isActive).toBe(true);
+    expect(badges()).toEqual(['Loading log volume…']);
+    act(() => tab.getVolumeRunner()!.setState({ data: { ...done(), state: LoadingState.Done } }));
+    expect(badges()).toEqual([]);
+
+    fireEvent.click(screen.getByText('Oldest first'));
+    expect(ex.state.sort).toBe('asc');
+    expect(screen.getByTestId('open-in-explore').getAttribute('href')).toMatch(/^\/explore\?schemaVersion=1&panes=/);
+  });
+
+  it('the Volume switch hides the chart and is remembered', async () => {
+    const first = await logs();
+    fireEvent.click(screen.getByTestId('toggle-volume'));
+    expect(screen.queryByTestId('volume-panel')).toBeNull();
+    first.view.unmount();
+    await logs();
+    expect(screen.queryByTestId('volume-panel')).toBeNull();
+    expect((screen.getByTestId('toggle-volume') as HTMLInputElement).checked).toBe(false);
+  });
+
+  it('a text search over 24 h: the volume waits for "Load volume"; the lines show the search progress and Stop', async () => {
+    const { ex, tab } = await logs(
+      { lineFilters: [{ op: 'include', value: 'timed out', caseSensitive: false, regex: false }] },
+      'now-24h'
+    );
+    expect(screen.getByTestId('volume-deferred').textContent).toContain('text search over 24 hours');
+    expect(screen.queryByTestId('toggle-volume')).toBeNull();
+
+    const runner = tab.getLinesRunner()!;
+    const cancel = jest.spyOn(runner, 'cancelQuery').mockImplementation(() => undefined);
+    act(() =>
+      runner.setState({ data: { ...done(), state: LoadingState.Streaming, series: [linesFrame(12, progress({}))] } })
+    );
+    expect(screen.getByTestId('search-status').textContent).toBe(
+      'Searching the log text, newest first: 1 h of 6 h searched, 12 lines found.Stop'
+    );
+    fireEvent.click(screen.getByText('Stop'));
+    expect(cancel).toHaveBeenCalled();
+    act(() => runner.setState({ data: { ...done(), series: [linesFrame(12, progress({}))] } }));
+    expect(screen.getByTestId('search-status').textContent).toBe(
+      'Search stopped: 1 h of 6 h searched, 12 lines found.'
+    );
+    act(() =>
+      runner.setState({
+        data: { ...done(), series: [linesFrame(3, progress({ done: true, lines: 1000, searchedFromMs: 4.5 * HOUR }))] },
+      })
+    );
+    expect(screen.getByTestId('search-status').textContent).toBe(
+      'The newest 1000 matching lines were found in the last 1 h 30 min of the 6 h; scroll to the end of the list to load more.'
+    );
+    act(() => runner.setState({ data: { ...done(), series: [linesFrame(3, progress({ done: true, lines: 3 }))] } }));
+    expect(screen.queryByTestId('search-status')).toBeNull();
+
+    fireEvent.click(screen.getByText('Load volume'));
+    expect(ex.state.scanAllowedFor).toBe('now-24h|now');
+    await act(flush);
+    expect(screen.getByTestId('volume-panel')).toBeInTheDocument();
+  });
+
+  it('JSON display: 100 rows at a time; loading and errors', async () => {
+    const { tab } = await logs({ display: 'json' });
+    const runner = tab.getLinesRunner()!;
+    act(() => runner.setState({ data: { ...done(), series: [linesFrame(150)] } }));
+    expect(screen.getByTestId('json-view').children).toHaveLength(101);
+    fireEvent.click(screen.getByText('Show more (50 left)'));
+    expect(screen.getByTestId('json-view').children).toHaveLength(150);
+    act(() => runner.setState({ data: { ...done(), series: [linesFrame(0)] } }));
+    expect(screen.getByText('No lines')).toBeInTheDocument();
+    act(() => runner.setState({ data: { ...done(), state: LoadingState.Error, errors: [{ message: 'denied' }] } }));
+    expect(screen.getByText('Query failed')).toBeInTheDocument();
+  });
+});
+
+describe('Patterns tab', () => {
+  function counts(rows: Array<[string, number]>): PanelData {
+    return {
+      ...done(),
+      series: rows.map(([pattern, total]) =>
+        createDataFrame({
+          name: pattern,
+          fields: [
+            { name: 'time', type: FieldType.time, values: [OLDEST, OLDEST + HOUR] },
+            { name: pattern, type: FieldType.number, values: [total / 2, total / 2] },
+          ],
+          meta: { custom: { pattern, total } },
+        })
+      ),
+    };
+  }
+
+  it('a row per pattern with lines, share, Include / Exclude; "(unmatched)" has no buttons', async () => {
+    const { ex } = await page(
+      { datasource: 'ds1', view: MSG_VIEW, page: 'details', tab: 'patterns' },
+      'now-1h',
+      'now',
+      true
+    );
+    const p = ex.state.body as PatternsTabScene;
+    act(() =>
+      p.state.$data!.setState({
+        data: counts([
+          ['Timeout', 30],
+          ['(unmatched)', 70],
+        ]),
+      })
+    );
+    const row = screen.getByTestId('pattern-row-Timeout');
+    expect(row.textContent).toContain('LIKE %timed out%');
+    expect(row.textContent).toContain('30.0%');
+    expect(within(screen.getByTestId('pattern-row-(unmatched)')).queryByText('Include')).toBeNull();
+    fireEvent.click(within(row).getByText('Exclude'));
+    expect(ex.state.patternFilters).toEqual([{ name: 'Timeout', op: 'exclude' }]);
+  });
+
+  it('errors; no configured patterns; suggestions from a sample', async () => {
+    const { ex } = await page(
+      { datasource: 'ds1', view: MSG_VIEW, page: 'details', tab: 'patterns' },
+      'now-1h',
+      'now',
+      true
+    );
+    const p = ex.state.body as PatternsTabScene;
+    act(() =>
+      p.state.$data!.setState({ data: { ...done(), state: LoadingState.Error, errors: [{ message: 'boom' }] } })
+    );
+    expect(screen.getByText('Pattern query failed')).toBeInTheDocument();
+
+    runLogsQuery.mockReturnValue(of({ data: [linesFrame(5)] }));
+    fireEvent.click(screen.getByTestId('suggest-patterns'));
+    const suggestions = screen.getByTestId('pattern-suggestions').textContent;
+    expect(suggestions).toContain('status=<*> line <*>');
+    expect(suggestions).toContain('LIKE %status=% line %');
+    expect(screen.getByText('Copy top 10 as config')).toBeInTheDocument();
+
+    act(() => ex.setView(COL_VIEW));
+    await act(flush);
+    act(() => {
+      ex.showLogs();
+      ex.setTab('patterns');
+    });
+    expect(screen.getByText('No patterns configured for app_04000_payments')).toBeInTheDocument();
+  });
+});
+
+describe('Labels and Fields tabs', () => {
+  it('Fields: columns, then key=value fields of the newest lines with + / − and Breakdown', async () => {
+    runLogsQuery.mockReturnValue(of({ data: [linesFrame(4)] }));
+    const { ex } = await page(
+      { datasource: 'ds1', view: COL_VIEW, page: 'details', tab: 'fields' },
+      'now-1h',
+      'now',
+      true
+    );
+    expect(screen.getByText('Columns')).toBeInTheDocument();
+    const table = screen.getByTestId('message-fields');
+    expect(table.textContent).toContain('status');
+    expect(table.textContent).toContain('100%');
+    fireEvent.click(screen.getByLabelText('Include status=500'));
+    expect(ex.state.fieldFilters).toEqual([{ key: 'status', op: '=', value: '500' }]);
+    await act(flush);
+    fireEvent.click(within(screen.getByTestId('message-fields')).getByText('Breakdown'));
+    expect(ex.state.breakdown).toBe('msg:status');
+    await act(flush);
+    expect(screen.getByTestId('breakdown-fields').textContent).toContain('Values of status (top 30 by volume)');
+    fireEvent.click(screen.getByText('All fields'));
+    expect(ex.state.breakdown).toBeUndefined();
+  });
+
+  it('Labels: loading, then an error box when the breakdown fails', async () => {
+    const { ex } = await page(
+      { datasource: 'ds1', view: COL_VIEW, page: 'details', tab: 'labels' },
+      'now-1h',
+      'now',
+      true
+    );
+    const b = ex.state.body as BreakdownScene;
+    expect(screen.getByTestId('breakdown-labels')).toBeInTheDocument();
+    act(() =>
+      b.state.$data!.setState({ data: { ...done(), state: LoadingState.Error, errors: [{ message: 'denied' }] } })
+    );
+    expect(screen.getByText('Breakdown failed')).toBeInTheDocument();
+  });
+});
+
+function done(): PanelData {
+  return {
+    state: LoadingState.Done,
+    series: [],
+    timeRange: rangeUtil.convertRawToRange({ from: 'now-1h', to: 'now' }),
+  };
+}
````

### 17/44 `src/components/scenes.test.tsx` (new file)

unit tests: grid, Logs tab, breakdowns, patterns, panel builders

PATCH-BLOCK 17/44 src/components/scenes.test.tsx old=none new=0a29710afffe5c788077fef539e9fe2d1e25b96c sha256=3eb6bfbfc7ff57b300d8f83972d4ccc381da138390f896b50970afaf3ac8068f
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/scenes.test.tsx b/plugins/kotak-starrocks-logs-app/src/components/scenes.test.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..0a29710afffe5c788077fef539e9fe2d1e25b96c
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/components/scenes.test.tsx
@@ -0,0 +1,472 @@
+import { Fragment, ReactElement } from 'react';
+import { of } from 'rxjs';
+
+import { createDataFrame, DataFrame, FieldType, LoadingState, PanelData } from '@grafana/data';
+import { SceneCSSGridLayout, SceneQueryRunner, VizPanel } from '@grafana/scenes';
+import { LogsSortOrder } from '@grafana/schema';
+
+import { DETECTED_LEVEL, LEVEL_COLORS, LEVELS, RUNTIME_DS } from '../constants';
+import { setAppConfig } from '../config/config';
+import { setSessionZone } from '../datasource/api';
+import { getFavorites } from '../state/storage';
+import { emptySpec } from '../state/types';
+import { ExplorationApi } from './api';
+import { BreakdownScene, MessageFieldsScene } from './BreakdownScene';
+import { formatSpan, JsonLogsScene, LogsTabScene, rowsOf } from './LogsTabScene';
+import { barsPanel, logsPanel, queryRunner, staticData, tablePanel } from './panels';
+import { PatternsTabScene } from './PatternsTabScene';
+import { ServiceSelectionScene } from './ServiceSelectionScene';
+import { COL_VIEW, ctxFor, flush, mountExploration, MSG_VIEW } from './testScene';
+
+const listDatasources = jest.fn();
+const fetchViews = jest.fn();
+const runLogsQuery = jest.fn();
+
+jest.mock('../datasource/api', () => ({
+  ...jest.requireActual('../datasource/api'),
+  listDatasources: () => listDatasources(),
+  fetchViews: (...a: unknown[]) => fetchViews(...a),
+}));
+jest.mock('../datasource/StarRocksLogsDataSource', () => ({
+  ...jest.requireActual('../datasource/StarRocksLogsDataSource'),
+  buildContext: async (view: string) => ctxFor(view),
+  runLogsQuery: (...a: unknown[]) => runLogsQuery(...a),
+}));
+jest.mock('../datasource/oldest', () => ({ fetchOldestLog: async () => undefined }));
+
+// scenes are activated as on screen, but their query runners do not query (the data is set by each test)
+// runWithTimeRange is private in the typings; it is where every query of a runner starts
+jest
+  .spyOn(SceneQueryRunner.prototype as unknown as { runWithTimeRange: () => Promise<void> }, 'runWithTimeRange')
+  .mockImplementation(async () => undefined);
+
+beforeEach(() => {
+  localStorage.clear();
+  setAppConfig({});
+  listDatasources.mockReturnValue([{ uid: 'ds1', name: 'logs1' }]);
+  fetchViews.mockResolvedValue([COL_VIEW, MSG_VIEW]);
+  runLogsQuery.mockReset().mockReturnValue(of({ data: [] }));
+});
+
+const T0 = 1_700_000_000_000;
+
+function done(series: DataFrame[]): PanelData {
+  const { timeRange } = staticData([], { from: 0, to: 0 } as never).state.data!;
+  return { state: LoadingState.Done, series, timeRange };
+}
+
+function volumeFrame(meta: Record<string, unknown>, name = 'info'): DataFrame {
+  return createDataFrame({
+    name,
+    fields: [
+      { name: 'time', type: FieldType.time, values: [T0] },
+      { name, type: FieldType.number, values: [Number(meta.total ?? 1)] },
+    ],
+    meta: { custom: meta },
+  });
+}
+
+function linesFrame(lines: string[], meta?: Record<string, unknown>): DataFrame {
+  return createDataFrame({
+    fields: [
+      { name: 'timestamp', type: FieldType.time, values: lines.map((_, i) => T0 + i) },
+      { name: 'body', type: FieldType.string, values: lines },
+      { name: 'severity', type: FieldType.string, values: lines.map(() => 'info') },
+      { name: 'labels', type: FieldType.other, values: lines.map(() => ({ k8s_service_name: 'a' })) },
+    ],
+    meta: meta ? { custom: meta } : undefined,
+  });
+}
+
+/** The header buttons of a panel (a fragment or a single button), as React elements. */
+function buttons(panel: VizPanel): ReactElement[] {
+  const actions = panel.state.headerActions as ReactElement;
+  if (actions.type !== Fragment) {
+    return [actions];
+  }
+  return ([] as ReactElement[]).concat((actions.props as { children: ReactElement | ReactElement[] }).children);
+}
+const legendOf = (p: VizPanel) => (p.state.options as { legend?: unknown }).legend;
+const click = (el: ReactElement) => (el.props as { onClick: () => void }).onClick();
+
+describe('panels', () => {
+  it('queryRunner: the app data source on the runner and on the query (show context resolves it per query)', () => {
+    const r = queryRunner('volume', emptySpec('v', 'ds1'), { withLevel: true }, 'B');
+    expect(r.state.datasource).toEqual(RUNTIME_DS);
+    expect(r.state.queries[0]).toEqual({
+      refId: 'B',
+      kind: 'volume',
+      spec: emptySpec('v', 'ds1'),
+      params: { withLevel: true },
+      datasource: RUNTIME_DS,
+    });
+  });
+
+  it('barsPanel: stacked bars coloured by level; legend as a list, hidden, or a table with totals', () => {
+    const p = barsPanel('Log volume', staticData([], done([]).timeRange), { description: '3 lines' });
+    expect(p.state.title).toBe('Log volume');
+    expect(p.state.description).toBe('3 lines');
+    expect(p.state.fieldConfig.defaults.custom).toMatchObject({ drawStyle: 'bars', fillOpacity: 100 });
+    const colours = Object.fromEntries(
+      p.state.fieldConfig.overrides.map((o) => [o.matcher.options, o.properties[0].value.fixedColor])
+    );
+    for (const level of [...LEVELS, 'all' as const]) {
+      expect(colours[level]).toBe(LEVEL_COLORS[level]);
+    }
+    expect(legendOf(p)).toMatchObject({ showLegend: true, displayMode: 'list', placement: 'bottom' });
+    expect(legendOf(barsPanel('x', undefined, { legend: false }))).toMatchObject({ showLegend: false });
+    expect(legendOf(barsPanel('x', undefined, { legendTable: true }))).toMatchObject({
+      displayMode: 'table',
+      placement: 'right',
+      calcs: ['sum'],
+    });
+  });
+
+  it('logsPanel: filter buttons on detected_level set levels, on labels add label filters; selected text adds line filters', async () => {
+    const api = {
+      setLevels: jest.fn(),
+      addFilter: jest.fn(),
+      addLineFilter: jest.fn(),
+      hasFilter: jest.fn().mockReturnValue(true),
+      getSpec: () => ({ ...emptySpec('v'), levels: ['error'] }),
+    } as unknown as ExplorationApi;
+    const p = logsPanel(api, queryRunner('logs', emptySpec('v')), { sort: 'asc', wrap: true, title: 'Logs' });
+    const o = p.state.options as Record<string, (...a: string[]) => unknown>;
+    expect(p.state.pluginId).toBe('logs');
+    expect(p.state.options).toMatchObject({
+      sortOrder: LogsSortOrder.Ascending,
+      wrapLogMessage: true,
+      showLogContextToggle: true,
+      enableInfiniteScrolling: true,
+    });
+    o.onClickFilterLabel(DETECTED_LEVEL, 'error');
+    expect(api.setLevels).toHaveBeenLastCalledWith(['error']);
+    o.onClickFilterOutLabel(DETECTED_LEVEL, 'error');
+    expect(api.setLevels).toHaveBeenLastCalledWith(['warn', 'info', 'debug', 'unknown']);
+    o.onClickFilterLabel('k8s_pod_name', 'p1');
+    expect(api.addFilter).toHaveBeenLastCalledWith({ key: 'k8s_pod_name', op: '=', value: 'p1' });
+    o.onClickFilterOutLabel('k8s_pod_name', 'p1');
+    expect(api.addFilter).toHaveBeenLastCalledWith({ key: 'k8s_pod_name', op: '!=', value: 'p1' });
+    await expect(o.isFilterLabelActive(DETECTED_LEVEL, 'error')).resolves.toBe(true);
+    await expect(o.isFilterLabelActive(DETECTED_LEVEL, 'warn')).resolves.toBe(false);
+    await expect(o.isFilterLabelActive('k8s_pod_name', 'p1')).resolves.toBe(true);
+    o.onClickFilterString('timed out');
+    expect(api.addLineFilter).toHaveBeenLastCalledWith({
+      op: 'include',
+      value: 'timed out',
+      caseSensitive: true,
+      regex: false,
+    });
+    o.onClickFilterOutString('timed out');
+    expect(api.addLineFilter).toHaveBeenLastCalledWith(expect.objectContaining({ op: 'exclude' }));
+    expect(
+      logsPanel(api, queryRunner('logs', emptySpec('v')), { sort: 'desc', wrap: false }).state.options
+    ).toMatchObject({
+      sortOrder: LogsSortOrder.Descending,
+    });
+  });
+
+  it('tablePanel: a table over the runner', () => {
+    expect(tablePanel(queryRunner('table', emptySpec('v'))).state.pluginId).toBe('table');
+  });
+});
+
+describe('service grid', () => {
+  async function grid(values: Array<[string, number]>) {
+    const { ex } = await mountExploration();
+    const g = ex.state.body as ServiceSelectionScene;
+    g.activate();
+    g.state.$data.setState({ data: done(values.map(([value, total]) => volumeFrame({ value, total }))) });
+    await flush();
+    return { ex, g };
+  }
+
+  it('runs the per-value volume query with the plan of the exploration', async () => {
+    const { ex } = await mountExploration({ datasource: 'ds1', view: MSG_VIEW });
+    const q = (ex.state.body as ServiceSelectionScene).state.$data.state.queries[0];
+    expect(q).toMatchObject({ kind: 'serviceVolume', params: { label: 'k8s_service_name', withLevel: false } });
+  });
+
+  it('rows by volume (ties by name), favourites first; one bars panel per visible row', async () => {
+    localStorage.clear();
+    const { g } = await grid([
+      ['b', 10],
+      ['a', 10],
+      ['c', 99],
+      ['', 5],
+    ]);
+    expect(g.state.values!.map((v) => v.value)).toEqual(['c', 'a', 'b', '']);
+    expect(g.state.panels.map((p) => p.state.title)).toEqual(['c', 'a', 'b', '(empty)']);
+    expect(g.state.panels[0].state.description).toBe('99 lines');
+
+    g.toggleFavorite('b');
+    expect(getFavorites('ds1', COL_VIEW, 'k8s_service_name')).toEqual(['b']);
+    // starring does not move rows; the next load puts favourites first
+    expect(g.state.values!.map((v) => v.value)).toEqual(['c', 'a', 'b', '']);
+    g.state.$data.setState({
+      data: done([volumeFrame({ value: 'c', total: 99 }), volumeFrame({ value: 'b', total: 1 })]),
+    });
+    expect(g.state.values!.map((v) => v.value)).toEqual(['b', 'c']);
+  });
+
+  it('sums the level series of a value; ignores data that is still loading', async () => {
+    const { g } = await grid([
+      ['a', 3],
+      ['a', 4],
+    ]);
+    expect(g.state.values).toEqual([{ value: 'a', total: 7 }]);
+    g.state.$data.setState({ data: { ...done([]), state: LoadingState.Loading } });
+    expect(g.state.values).toEqual([{ value: 'a', total: 7 }]);
+  });
+
+  it('search narrows the rows and goes back to page 1; pages of 20', async () => {
+    const values = Array.from({ length: 25 }, (_, i): [string, number] => [
+      `svc-${String(i).padStart(2, '0')}`,
+      100 - i,
+    ]);
+    const { g } = await grid(values);
+    expect(g.state.panels).toHaveLength(20);
+    g.setPage(1);
+    expect(g.state.panels.map((p) => p.state.title)).toEqual(['svc-20', 'svc-21', 'svc-22', 'svc-23', 'svc-24']);
+    g.setSearch('SVC-1');
+    expect(g.state.page).toBe(0);
+    expect(g.filtered()).toHaveLength(10);
+    expect(g.visible()).toHaveLength(10);
+    const panels = g.state.panels;
+    g.setSearch('SVC-1');
+    expect(g.state.panels).toBe(panels);
+    g.setPage(0, 50);
+    g.setSearch('');
+    expect(g.state.panels).toHaveLength(25);
+  });
+
+  it('newest lines of the visible rows in one query, keyed by value; an error is shown instead', async () => {
+    runLogsQuery.mockReturnValue(of({ data: [linesFrame(['x'], { value: 'a' }), linesFrame(['y'], { value: 'b' })] }));
+    const { g } = await grid([
+      ['a', 2],
+      ['b', 1],
+    ]);
+    const [query, , requestId] = runLogsQuery.mock.calls[runLogsQuery.mock.calls.length - 1];
+    expect(query).toMatchObject({
+      kind: 'serviceSamples',
+      params: { label: 'k8s_service_name', values: ['a', 'b'], perValue: 10 },
+    });
+    expect(requestId).toBe('service-samples');
+    expect(Object.keys(g.state.samples)).toEqual(['a', 'b']);
+    expect(g.state.samplesLoading).toBe(false);
+
+    runLogsQuery.mockReturnValue(of({ data: [], errors: [{ message: 'Query timed out after 120 s' }] }));
+    g.setPage(0);
+    expect(g.state.samplesError).toBe('Query timed out after 120 s');
+    g.setSearch('nothing matches');
+    expect(g.state.samples).toEqual({});
+  });
+});
+
+describe('Logs tab', () => {
+  async function logsTab(state = {}, from = 'now-1h', view = COL_VIEW) {
+    const m = await mountExploration({ datasource: 'ds1', view, page: 'details', ...state }, from);
+    m.ex.rebuild();
+    const tab = m.ex.state.body as LogsTabScene;
+    tab.activate();
+    return { ...m, tab };
+  }
+
+  it('volume chart and Grafana Logs panel; the lines query uses the display options', async () => {
+    const { tab } = await logsTab({ sort: 'asc', limit: 200 });
+    expect(tab.state.volume?.state.title).toBe('Log volume');
+    expect(tab.getVolumeRunner()?.state.queries[0]).toMatchObject({ kind: 'volume', params: { withLevel: true } });
+    expect((tab.state.main as VizPanel).state.pluginId).toBe('logs');
+    expect(tab.getLinesRunner()?.state.queries[0]).toMatchObject({ kind: 'logs', params: { limit: 200, sort: 'asc' } });
+  });
+
+  it('level from the message over more than an hour: the title says the volume is estimated', async () => {
+    const { tab } = await logsTab({}, 'now-6h', MSG_VIEW);
+    expect(tab.state.volume?.state.title).toBe('Log volume (≈ estimated from 1 in 10 lines)');
+    expect(tab.state.volume?.state.description).toMatch(/hash sample/);
+    expect(tab.getVolumeRunner()?.state.queries[0]).toMatchObject({ params: { withLevel: true, sample: 10 } });
+  });
+
+  it('a deferred volume has no chart; Table and JSON displays', async () => {
+    const deferredTab = new LogsTabScene({
+      spec: emptySpec(COL_VIEW, 'ds1'),
+      withLevel: true,
+      volumeDeferred: true,
+      display: 'table',
+      sort: 'desc',
+      limit: 100,
+      wrap: false,
+    });
+    const { ex } = await mountExploration();
+    ex.setState({ body: deferredTab });
+    deferredTab.activate();
+    expect(deferredTab.state.volume).toBeUndefined();
+    expect(deferredTab.getVolumeRunner()).toBeUndefined();
+    expect((deferredTab.state.main as VizPanel).state.pluginId).toBe('table');
+    expect(deferredTab.getLinesRunner()?.state.queries[0]).toMatchObject({ kind: 'table' });
+
+    const json = await logsTab({ display: 'json' });
+    expect(json.tab.state.main).toBeInstanceOf(JsonLogsScene);
+  });
+
+  it('Explore link: the same SQL as the table, with the view hint, in the selected data source', async () => {
+    setSessionZone('ds1', COL_VIEW, '+00:00');
+    const { tab } = await logsTab({ limit: 100 });
+    const url = new URL(tab.exploreUrl()!, 'http://grafana');
+    expect(url.pathname).toBe('/explore');
+    const panes = JSON.parse(url.searchParams.get('panes')!);
+    const q = panes.a.queries[0];
+    expect(panes.a.datasource).toBe('ds1');
+    expect(q.datasource).toEqual({ type: 'kotak-starrocks-datasource', uid: 'ds1' });
+    expect(q.rawSql).toMatch(/^SELECT \/\*\+ SET_VAR\(time_zone = '\+00:00', query_timeout = 120\) \*\//);
+    expect(q.rawSql).toContain('FROM `vw_eks_app_logs_app_04000_payments`');
+    expect(q.rawSql).toContain('LIMIT 100');
+    expect(panes.a.range).toEqual({ from: 'now-1h', to: 'now' });
+  });
+
+  it('formatSpan: minutes, hours, both', () => {
+    expect(formatSpan(5 * 60_000)).toBe('5 min');
+    expect(formatSpan(2 * 3_600_000)).toBe('2 h');
+    expect(formatSpan(90 * 60_000)).toBe('1 h 30 min');
+  });
+
+  it('JSON rows: JSON messages stay objects, logfmt messages get their fields, plain text stays text', () => {
+    const rows = rowsOf(linesFrame(['{"msg":"boom","code":5}', 'level=error status=500 path=/x', 'plain', '{broken']));
+    expect(rows[0]).toMatchObject({
+      level: 'info',
+      labels: { k8s_service_name: 'a' },
+      message: { msg: 'boom', code: 5 },
+    });
+    expect(rows[0]).not.toHaveProperty('fields');
+    expect(rows[1].fields).toMatchObject({ level: 'error', status: '500', path: '/x' });
+    expect(rows[2]).toMatchObject({ message: 'plain' });
+    expect(rows[2]).not.toHaveProperty('fields');
+    expect(rows[3].message).toBe('{broken');
+    expect(rows[0].timestamp).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.000$/);
+    expect(rowsOf(undefined)).toEqual([]);
+  });
+});
+
+describe('Labels and Fields tabs (breakdowns)', () => {
+  async function tab(t: 'labels' | 'fields', view = COL_VIEW) {
+    const m = await mountExploration({ datasource: 'ds1', view, page: 'details', tab: t });
+    m.ex.rebuild();
+    return m;
+  }
+
+  it('overview: one GROUPING SETS query for all columns; columns with more than one value first; Select opens a column', async () => {
+    const { ex } = await tab('labels');
+    const b = ex.state.body as BreakdownScene;
+    expect(b.state.$data?.state.queries[0]).toMatchObject({
+      kind: 'labelOverview',
+      params: { labels: ['k8s_service_name', 'k8s_namespace_name'], topN: 5 },
+    });
+    b.activate();
+    b.state.$data!.setState({
+      data: done([
+        volumeFrame({ label: 'k8s_service_name', cardinality: 1 }),
+        volumeFrame({ label: 'k8s_namespace_name', cardinality: 4 }),
+      ]),
+    });
+    const panels = (b.state.grid as SceneCSSGridLayout).state.children as VizPanel[];
+    expect(panels.map((p) => p.state.title)).toEqual(['k8s_namespace_name', 'k8s_service_name']);
+    expect(panels[0].state.description).toBe('4 distinct values; top 5 shown');
+    click(buttons(panels[0])[0]);
+    expect(ex.state.breakdown).toBe('k8s_namespace_name');
+  });
+
+  it('one column: a panel per value; Include and Exclude add label filters', async () => {
+    const { ex } = await tab('labels');
+    ex.setBreakdown('k8s_namespace_name');
+    const b = ex.state.body as BreakdownScene;
+    expect(b.state.$data?.state.queries[0]).toMatchObject({
+      kind: 'valueBreakdown',
+      params: { label: 'k8s_namespace_name', topN: 30 },
+    });
+    b.activate();
+    b.state.$data!.setState({ data: done([volumeFrame({ value: 'prod', total: 1200 })]) });
+    const [panel] = (b.state.grid as SceneCSSGridLayout).state.children as VizPanel[];
+    expect(panel.state.title).toBe('prod');
+    expect(panel.state.description).toBe('1,200 lines');
+    const [include, exclude] = buttons(panel);
+    click(include);
+    expect(ex.getLabelFilters()).toEqual([{ key: 'k8s_namespace_name', op: '=', value: 'prod' }]);
+    click(exclude);
+    expect(ex.getLabelFilters()).toEqual([{ key: 'k8s_namespace_name', op: '!=', value: 'prod' }]);
+  });
+
+  it('a field inside the message: the field query; Include adds a message field filter', async () => {
+    const { ex } = await tab('fields');
+    ex.setBreakdown('msg:status');
+    const b = ex.state.body as BreakdownScene;
+    expect(b.state.$data?.state.queries[0]).toMatchObject({
+      kind: 'fieldBreakdown',
+      params: { field: 'status', topN: 30 },
+    });
+    b.activate();
+    b.state.$data!.setState({ data: done([volumeFrame({ value: '500', total: 3 })]) });
+    const [panel] = (b.state.grid as SceneCSSGridLayout).state.children as VizPanel[];
+    click(buttons(panel)[0]);
+    expect(ex.state.fieldFilters).toEqual([{ key: 'status', op: '=', value: '500' }]);
+  });
+
+  it('Fields overview also lists key=value fields found in a sample of lines', async () => {
+    runLogsQuery.mockReturnValue(of({ data: [linesFrame(['status=500 path=/a', 'status=200 path=/b', 'no fields'])] }));
+    const { ex } = await tab('fields');
+    const fields = (ex.state.body as BreakdownScene).state.messageFields as MessageFieldsScene;
+    expect(fields).toBeInstanceOf(MessageFieldsScene);
+    fields.activate();
+    const [query, , requestId] = runLogsQuery.mock.calls[0];
+    expect(query).toMatchObject({ kind: 'logs', params: { limit: 1000 } });
+    expect(requestId).toBe('fields-sample');
+    expect(fields.state.sampleSize).toBe(3);
+    expect(fields.state.stats?.map((s) => s.key).sort()).toEqual(['path', 'status']);
+
+    runLogsQuery.mockReturnValue(of({ data: [], error: { message: 'denied' } }));
+    const again = new MessageFieldsScene({ spec: emptySpec(COL_VIEW) });
+    ex.setState({ body: again });
+    again.activate();
+    expect(again.state.error).toBe('denied');
+  });
+
+  it('no columns: no query', () => {
+    expect(new BreakdownScene({ spec: emptySpec('v'), mode: 'labels', columns: [] }).state.$data).toBeUndefined();
+  });
+});
+
+describe('Patterns tab', () => {
+  it('a tenant with patterns: one counting query and a chart; none: neither', async () => {
+    const { ex } = await mountExploration({ datasource: 'ds1', view: MSG_VIEW, page: 'details', tab: 'patterns' });
+    ex.rebuild();
+    const p = ex.state.body as PatternsTabScene;
+    expect(p.state.$data?.state.queries[0]).toMatchObject({ kind: 'patterns' });
+    expect(p.state.chart?.state.title).toBe('Pattern volume');
+    const none = new PatternsTabScene({ spec: emptySpec('v'), patterns: [], tenantKey: 'x' });
+    expect(none.state.$data).toBeUndefined();
+    expect(none.state.chart).toBeUndefined();
+  });
+
+  it('Suggest patterns groups a sample of lines without the pattern filters; an error is shown', async () => {
+    const lines = [
+      ...Array.from({ length: 6 }, (_, i) => `upstream timed out after ${i}ms on 10.0.0.${i}`),
+      ...Array.from({ length: 3 }, (_, i) => `user ${i} logged in`),
+    ];
+    runLogsQuery.mockReturnValue(of({ data: [linesFrame(lines)] }));
+    const { ex } = await mountExploration({ datasource: 'ds1', view: MSG_VIEW, page: 'details', tab: 'patterns' });
+    ex.togglePatternFilter('Timeout', 'exclude');
+    const p = ex.state.body as PatternsTabScene;
+    p.activate();
+    p.suggest();
+    const [query, , requestId] = runLogsQuery.mock.calls[0];
+    expect(query).toMatchObject({ kind: 'logs', params: { limit: 2000 } });
+    expect(query.spec.patternFilters).toEqual([]);
+    expect(requestId).toBe('patterns-suggest');
+    expect(p.state.suggesting).toBe(false);
+    expect(p.state.suggestions?.[0]).toMatchObject({ count: 6 });
+    expect(p.state.suggestions).toHaveLength(2);
+
+    runLogsQuery.mockReturnValue(of({ data: [], errors: [{ message: 'timeout' }] }));
+    p.suggest();
+    expect(p.state.suggestError).toBe('timeout');
+  });
+});
````

### 18/44 `src/components/testScene.ts` (new file)

test helpers (scenes)

PATCH-BLOCK 18/44 src/components/testScene.ts old=none new=971c478004196e81e4c44881b422ed473216baa2 sha256=a3c18bc20c4da4314737793f6907491ba95e28d970b54c8f1e4a7df7a12a9306
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/testScene.ts b/plugins/kotak-starrocks-logs-app/src/components/testScene.ts
new file mode 100644
index 0000000000000000000000000000000000000000..971c478004196e81e4c44881b422ed473216baa2
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/components/testScene.ts
@@ -0,0 +1,56 @@
+import { rangeUtil } from '@grafana/data';
+import { EmbeddedScene } from '@grafana/scenes';
+
+import { resolveConfig, resolveTenant } from '../config/config';
+import { BuildContext } from '../sql/builder';
+import { CappedTimeRange } from './CappedTimeRange';
+import { LogsExploration, LogsExplorationState } from './LogsExploration';
+
+/** Test helpers for scene tests. The test file mocks the data source calls (jest.mock is per file). */
+
+export const MSG_VIEW = 'vw_eks_app_logs_app_1961_observability';
+export const COL_VIEW = 'vw_eks_app_logs_app_04000_payments';
+
+/** observability reads its level from the message and has one pattern; payments uses the level column */
+export function ctxFor(view: string): BuildContext {
+  const { config } = resolveConfig({
+    tenants: {
+      app_1961_observability: {
+        level: { source: 'message' },
+        patterns: [{ name: 'Timeout', like: '%timed out%' }],
+      },
+    },
+  });
+  return {
+    tenant: resolveTenant(config, view),
+    columns: ['observed_timestamp', 'message', 'level', 'k8s_service_name', 'k8s_namespace_name', 'k8s_pod_uid'],
+    labels: ['k8s_service_name', 'k8s_namespace_name'],
+    fields: ['k8s_pod_uid'],
+  };
+}
+
+export const flush = async () => {
+  for (let i = 0; i < 5; i++) {
+    await new Promise((r) => setTimeout(r, 0));
+  }
+};
+
+export function deferred<T>() {
+  let resolve!: (v: T) => void;
+  const promise = new Promise<T>((r) => (resolve = r));
+  return { promise, resolve };
+}
+
+/** A LogsExploration in a scene with the app's time range, activated (as when the page is shown). */
+export async function mountExploration(state: Partial<LogsExplorationState> = {}, from = 'now-1h') {
+  const ex = new LogsExploration(state);
+  const scene = new EmbeddedScene({ $timeRange: new CappedTimeRange({ from, to: 'now' }), body: ex });
+  scene.activate();
+  ex.activate();
+  await flush();
+  const setRange = async (f: string) => {
+    scene.state.$timeRange!.onTimeRangeChange(rangeUtil.convertRawToRange({ from: f, to: 'now' }));
+    await flush();
+  };
+  return { ex, scene, setRange };
+}
````

### 19/44 `src/components/ui.test.tsx` (new file)

unit tests: small UI parts

PATCH-BLOCK 19/44 src/components/ui.test.tsx old=none new=56421a46b3cea4ad4a9c8494080932862ca5f36e sha256=742d8f42a45c0431c3910c8956dbb0f1e054dd94a7d1296c4b9f260f72615795
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/ui.test.tsx b/plugins/kotak-starrocks-logs-app/src/components/ui.test.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..56421a46b3cea4ad4a9c8494080932862ca5f36e
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/components/ui.test.tsx
@@ -0,0 +1,83 @@
+import { act, fireEvent, render, screen } from '@testing-library/react';
+
+import { createDataFrame, FieldType } from '@grafana/data';
+
+import { ContextScope } from '../datasource/ContextScope';
+import { Chip, Elapsed, ErrorBox, SampleList, ScanGuard } from './ui';
+
+describe('small UI pieces', () => {
+  it('Elapsed shows "…" first, then seconds', () => {
+    jest.useFakeTimers();
+    render(<Elapsed />);
+    expect(screen.getByTestId('elapsed').textContent).toBe('…');
+    act(() => {
+      jest.advanceTimersByTime(3000);
+    });
+    expect(screen.getByTestId('elapsed').textContent).toBe(' 3 s');
+    jest.useRealTimers();
+  });
+
+  it('ScanGuard explains the long scan and offers both ways out', () => {
+    const onRun = jest.fn();
+    const onShrink = jest.fn();
+    render(
+      <ScanGuard hours={12} max={6} reason="Counting patterns reads every line." onRun={onRun} onShrink={onShrink} />
+    );
+    expect(screen.getByTestId('scan-guard').textContent).toContain('12.0 hours');
+    fireEvent.click(screen.getByText('Run anyway'));
+    fireEvent.click(screen.getByText('Use the last 6 hours'));
+    expect(onRun).toHaveBeenCalledTimes(1);
+    expect(onShrink).toHaveBeenCalledTimes(1);
+  });
+
+  it('Chip removes itself through its button', () => {
+    const onRemove = jest.fn();
+    render(
+      <Chip onRemove={onRemove} testId="c">
+        line contains x
+      </Chip>
+    );
+    fireEvent.click(screen.getByLabelText('Remove filter'));
+    expect(onRemove).toHaveBeenCalled();
+  });
+
+  it('SampleList: lines with time, or loading / empty / error text', () => {
+    const frame = createDataFrame({
+      fields: [
+        { name: 'timestamp', type: FieldType.time, values: [Date.UTC(2026, 10, 25, 4, 7, 43, 157)] },
+        { name: 'body', type: FieldType.string, values: ['hello'] },
+        { name: 'severity', type: FieldType.string, values: ['info'] },
+      ],
+    });
+    const { rerender } = render(<SampleList frame={frame} />);
+    expect(screen.getByTestId('service-samples').textContent).toContain('hello');
+    rerender(<SampleList loading />);
+    expect(screen.getByText('Loading lines…')).toBeTruthy();
+    rerender(<SampleList />);
+    expect(screen.getByText('No lines')).toBeTruthy();
+    rerender(<SampleList error="denied" />);
+    expect(screen.getByText('denied')).toBeTruthy();
+  });
+
+  it('ErrorBox shows the title and the message', () => {
+    render(<ErrorBox title="Query failed" error="boom" />);
+    expect(screen.getByText('Query failed')).toBeTruthy();
+    expect(screen.getByText('boom')).toBeTruthy();
+  });
+
+  it('ContextScope lists the identifying labels that are set, matched one first, and explains the pin', () => {
+    render(
+      <ContextScope
+        podColumn="k8s_pod_uid"
+        labels={{ k8s_pod_uid: 'u-1', k8s_pod_name: 'p-1', k8s_service_name: 'apilog', other: 'x' }}
+      />
+    );
+    const text = screen.getByTestId('context-scope').textContent ?? '';
+    expect(text).toContain('k8s_pod_uid="u-1"');
+    expect(text).toContain('k8s_pod_name="p-1"');
+    expect(text).toContain('k8s_service_name="apilog"');
+    expect(text).not.toContain('other');
+    expect(text).not.toContain('k8s_namespace_name');
+    expect(text).toContain('pinned');
+  });
+});
````

### 20/44 `src/components/ui.tsx` (modified)

elapsed-seconds counter for loading states

PATCH-BLOCK 20/44 src/components/ui.tsx old=2c5b4dd0017594b0f044de758eacb2cdb62ae5fd new=8cc35c074bd3c80df6ec099127d8cc469308ac43 sha256=4301d5f26ee3a536e60b1a7d9e083d179e1550f8a5d39c704a99185a76ff940e
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/ui.tsx b/plugins/kotak-starrocks-logs-app/src/components/ui.tsx
index 2c5b4dd0017594b0f044de758eacb2cdb62ae5fd..8cc35c074bd3c80df6ec099127d8cc469308ac43 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/ui.tsx
+++ b/plugins/kotak-starrocks-logs-app/src/components/ui.tsx
@@ -1,5 +1,5 @@
 import { css, cx } from '@emotion/css';
-import { ReactNode } from 'react';
+import { ReactNode, useEffect, useState } from 'react';
 
 import { DataFrame, GrafanaTheme2, dateTimeFormat } from '@grafana/data';
 import { Alert, Button, IconButton, LoadingPlaceholder, useStyles2, useTheme2 } from '@grafana/ui';
@@ -144,3 +144,17 @@ const getStyles = (theme: GrafanaTheme2) => ({
   sampleTime: css({ color: theme.colors.text.secondary }),
   sampleEmpty: css({ color: theme.colors.text.secondary, padding: theme.spacing(2) }),
 });
+
+/**
+ * Seconds since this element appeared ("…" for the first two seconds). Mount it only while something runs, so
+ * every run starts from 0.
+ */
+export function Elapsed() {
+  const [seconds, setSeconds] = useState(0);
+  useEffect(() => {
+    const start = Date.now();
+    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
+    return () => clearInterval(timer);
+  }, []);
+  return <span data-testid="elapsed">{seconds >= 2 ? ` ${seconds} s` : '…'}</span>;
+}
````

### 21/44 `src/constants.ts` (modified)

level rules: nginx `[level]`, zap tab-separated, glog, logrus, HTTP status class; more level aliases

PATCH-BLOCK 21/44 src/constants.ts old=8f2c6444c7a9a4b5670ce7e75004cc4ecc9d2d34 new=5ca758a4d5c5e8029720de4e9e5e9104685af14b sha256=14dd349ff8a103a53bb8523e912e4b31475f5cf142704a8b19868a84330199ff
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/constants.ts b/plugins/kotak-starrocks-logs-app/src/constants.ts
index 8f2c6444c7a9a4b5670ce7e75004cc4ecc9d2d34..5ca758a4d5c5e8029720de4e9e5e9104685af14b 100644
--- a/plugins/kotak-starrocks-logs-app/src/constants.ts
+++ b/plugins/kotak-starrocks-logs-app/src/constants.ts
@@ -62,18 +62,46 @@ export const DEFAULT_LABELS = [
 export const DEFAULT_FIELDS = ['k8s_pod_name', 'k8s_pod_uid', 'k8s_pod_start_time', 'log_file_path'];
 
 // Tried in order when a tenant derives its level from the message text (level column not populated).
-// RE2 syntax (StarRocks); the first capture group is the level word.
+// RE2 syntax (StarRocks); the first capture group is the level word. Coverage measured on the UAT observability
+// view (1 hour, 5.8M lines): logfmt/JSON 38 %, nginx 31 %, upper-case words 7 %, glog 1 %, HTTP status of
+// access logs most of the rest (was 54 % "unknown" with the first rule set, about 1 % with this one).
 export const DEFAULT_MESSAGE_LEVEL_REGEX = [
-  `(?i)\\blevel["']?\\s*[=:]\\s*["']?([a-z]+)`,
-  `\\b(FATAL|ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\\b`,
+  // logfmt / JSON / "key: value": level=info, "level":"info", lvl=warn, severity=ERROR
+  `(?i)\\b(?:level|lvl|severity)["']?\\s*[=:]\\s*["']?([a-z]+)`,
+  // nginx error log: 2026/11/24 22:37:42 [info] 140700#0: ...
+  `\\[(emerg|alert|crit|error|warn|notice|info|debug)\\]`,
+  // upper-case level words (logrus ERRO / DEBU too)
+  `\\b(FATAL|ERROR|ERRO|WARN|WARNING|INFO|DEBUG|DEBU|TRACE)\\b`,
+  // zap console encoder: <time>\t<level>\t<caller>\t<message>
+  `\\t(error|warn|info|debug|dpanic|panic|fatal)\\t`,
+  // glog / klog: E1125 04:09:43.511 ...
   `^([IWEF])[0-9]{4} `,
+  // access logs without a level: the HTTP status class (2xx/3xx info, 4xx warn, 5xx error)
+  `HTTP/[0-9.]+" ([1-5])[0-9]{2} `,
 ];
 
 // Normalisation of raw level values; same buckets as the StarRocks Application Logs dashboard, plus the glog
 // single letters. Anything else is "unknown".
 export const LEVEL_ALIASES: Record<Exclude<Level, 'unknown'>, string[]> = {
-  error: ['error', 'err', 'fatal', 'critical', 'crit', 'severe', 'panic', 'emerg', 'emergency', 'alert', 'e', 'f'],
-  warn: ['warn', 'warning', 'w'],
-  info: ['info', 'information', 'notice', 'i'],
-  debug: ['debug', 'fine', 'config', 'trace', 'verbose', 'finest', 'd', 't'],
+  error: [
+    'error',
+    'err',
+    'erro',
+    'fatal',
+    'critical',
+    'crit',
+    'severe',
+    'panic',
+    'dpanic',
+    'emerg',
+    'emergency',
+    'alert',
+    'e',
+    'f',
+    // HTTP status class 5xx
+    '5',
+  ],
+  warn: ['warn', 'warning', 'w', '4'],
+  info: ['info', 'information', 'notice', 'i', '1', '2', '3'],
+  debug: ['debug', 'debu', 'fine', 'config', 'trace', 'verbose', 'finest', 'd', 't'],
 };
````

### 22/44 `src/datasource/ContextScope.tsx` (new file)

Show context header: what the context matches (pod, namespace, service) and how to pin

PATCH-BLOCK 22/44 src/datasource/ContextScope.tsx old=none new=6fcec268a5ffb0ff82972301363ddd80a46b80a2 sha256=ff4bbcd72e1a25d0dc337605d8a639eb1d99dc72cdd7d0963bfb3345323a08ff
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/ContextScope.tsx b/plugins/kotak-starrocks-logs-app/src/datasource/ContextScope.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..6fcec268a5ffb0ff82972301363ddd80a46b80a2
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/ContextScope.tsx
@@ -0,0 +1,50 @@
+import { css } from '@emotion/css';
+
+import { GrafanaTheme2 } from '@grafana/data';
+import { useStyles2 } from '@grafana/ui';
+
+import { POD_NAME_COLUMN, POD_UID_COLUMN } from '../constants';
+
+/** Columns shown at the top of "Show context", in this order (the first one present is the one matched). */
+export const CONTEXT_LABELS = [POD_UID_COLUMN, POD_NAME_COLUMN, 'k8s_namespace_name', 'k8s_service_name'];
+
+/**
+ * Top of the "Show context" modal: which lines are shown (the same pod, up to one hour before and after the line,
+ * ordered by time then message) and the pod's namespace and service, like the Log Analytics context dialog.
+ */
+export function ContextScope({ labels, podColumn }: { labels: Record<string, string>; podColumn: string }) {
+  const styles = useStyles2(getStyles);
+  const shown = CONTEXT_LABELS.filter((k) => labels[k]);
+  return (
+    <div className={styles.wrapper} data-testid="context-scope">
+      <code className={styles.selector}>
+        {'{ '}
+        {shown.map((k, i) => (
+          <span key={k} className={k === podColumn ? styles.matched : styles.label}>
+            {k}=&quot;{labels[k]}&quot;{i < shown.length - 1 ? ', ' : ''}
+          </span>
+        ))}
+        {' }'}
+      </code>
+      <span className={styles.note}>
+        Lines of this pod ({podColumn}) up to 1 hour before and after the selected line, by time. The selected line is
+        pinned: it stays at the top or bottom while you scroll; click its pin icon to let it scroll away.
+      </span>
+    </div>
+  );
+}
+
+const getStyles = (theme: GrafanaTheme2) => ({
+  wrapper: css({ display: 'flex', flexDirection: 'column', gap: theme.spacing(0.5), marginBottom: theme.spacing(1) }),
+  selector: css({
+    padding: theme.spacing(0.5, 1),
+    background: theme.colors.background.secondary,
+    border: `1px solid ${theme.colors.border.weak}`,
+    borderRadius: theme.shape.radius.default,
+    whiteSpace: 'normal',
+    wordBreak: 'break-all',
+  }),
+  matched: css({ color: theme.colors.primary.text, fontWeight: theme.typography.fontWeightMedium }),
+  label: css({ color: theme.colors.text.primary }),
+  note: css({ color: theme.colors.text.secondary, fontSize: theme.typography.bodySmall.fontSize }),
+});
````

### 23/44 `src/datasource/StarRocksLogsDataSource.ts` (modified)

short result cache (Back is instant); Show context tie-break and header; sampling passed to the SQL

PATCH-BLOCK 23/44 src/datasource/StarRocksLogsDataSource.ts old=4c4f7938ba46899c0fee5ba8f94f6df602ce948a new=6d30a469ca51c60762a2cd492135d0d3a37e15da sha256=493640e9cb818313f8061a0b157f5be8ec2172027a1660de45f8a99d901aac20
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/StarRocksLogsDataSource.ts b/plugins/kotak-starrocks-logs-app/src/datasource/StarRocksLogsDataSource.ts
index 4c4f7938ba46899c0fee5ba8f94f6df602ce948a..6d30a469ca51c60762a2cd492135d0d3a37e15da 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/StarRocksLogsDataSource.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/StarRocksLogsDataSource.ts
@@ -1,4 +1,16 @@
-import { Observable, Subscription, catchError, combineLatest, from, lastValueFrom, map, of, switchMap } from 'rxjs';
+import {
+  Observable,
+  Subscription,
+  catchError,
+  combineLatest,
+  defer,
+  from,
+  lastValueFrom,
+  map,
+  of,
+  switchMap,
+  tap,
+} from 'rxjs';
 
 import {
   DataFrame,
@@ -13,6 +25,7 @@ import {
   dateTime,
 } from '@grafana/data';
 import { RuntimeDataSource } from '@grafana/scenes';
+import { createElement, ReactNode } from 'react';
 import { DataQuery } from '@grafana/schema';
 
 import {
@@ -46,6 +59,8 @@ import {
 } from '../sql/builder';
 import { QueryKind, QueryParams, QuerySpec } from '../state/types';
 import { fetchColumns, runSql } from './api';
+import { ContextScope } from './ContextScope';
+import { getCached, putCached } from './queryCache';
 import { ensureSessionZone } from './timeZone';
 import {
   concatFrames,
@@ -120,11 +135,11 @@ export function buildSql(q: LogsAppQuery, ctx: BuildContext, range: TimeRange):
   const config = getAppConfig();
   switch (q.kind) {
     case 'serviceVolume':
-      return serviceVolumeQuery(q.spec, ctx, p.label ?? config.serviceLabel, bucket, p.withLevel ?? true);
+      return serviceVolumeQuery(q.spec, ctx, p.label ?? config.serviceLabel, bucket, p.withLevel ?? true, p.sample);
     case 'serviceSamples':
       return serviceSamplesQuery(q.spec, ctx, p.label ?? config.serviceLabel, p.values ?? [], p.perValue ?? 10);
     case 'volume':
-      return volumeQuery(q.spec, ctx, bucket, p.withLevel ?? true);
+      return volumeQuery(q.spec, ctx, bucket, p.withLevel ?? true, p.sample);
     case 'logs':
     case 'table':
       // exact bounds: "load more" (infinite scrolling) asks for lines older/newer than a loaded line
@@ -276,8 +291,22 @@ function runWindowedLines(
   });
 }
 
-/** Runs one structured query and returns frames ready for the panels. */
+/** Cache key of a query: everything that changes its SQL or its result. */
+export function queryCacheKey(q: LogsAppQuery, range: TimeRange): string {
+  return JSON.stringify([q.kind, q.spec, q.params ?? {}, q.refId, range.from.valueOf(), range.to.valueOf()]);
+}
+
+/** Runs one structured query, or answers from the short-lived cache (see queryCache.ts). */
 export function runLogsQuery(q: LogsAppQuery, range: TimeRange, requestId?: string): Observable<DataQueryResponse> {
+  const key = queryCacheKey(q, range);
+  return defer(() => {
+    const hit = getCached(key);
+    return hit ? of(hit) : runLogsQueryUncached(q, range, requestId).pipe(tap((r) => putCached(key, r)));
+  });
+}
+
+/** Runs one structured query and returns frames ready for the panels. */
+function runLogsQueryUncached(q: LogsAppQuery, range: TimeRange, requestId?: string): Observable<DataQueryResponse> {
   return from(buildContext(q.spec.view, range, q.spec.datasource)).pipe(
     switchMap((ctx) => {
       if ((q.kind === 'logs' || q.kind === 'table') && needsMessageScan(q.spec, ctx.tenant, false)) {
@@ -350,6 +379,16 @@ export class StarRocksLogsDataSource extends RuntimeDataSource<LogsAppQuery> {
     );
   }
 
+  /** Top of the "Show context" modal: which pod's lines are shown, as in the Log Analytics UI. */
+  getLogRowContextUi(row: LogRowModel): ReactNode {
+    const labels = (row.dataFrame.fields.find((f) => f.name === 'labels')?.values[row.rowIndex] ?? {}) as Record<
+      string,
+      string
+    >;
+    const podColumn = labels[POD_UID_COLUMN] ? POD_UID_COLUMN : POD_NAME_COLUMN;
+    return createElement(ContextScope, { labels, podColumn });
+  }
+
   /** "Show context": lines of the same pod before/after the clicked line (used by the Logs panel modal). */
   async getLogRowContext(
     row: LogRowModel,
@@ -380,7 +419,8 @@ export class StarRocksLogsDataSource extends RuntimeDataSource<LogsAppQuery> {
     };
     const datasource = query?.spec?.datasource ?? '';
     const ctx = await buildContext(view, range, datasource);
-    const sql = contextQuery(view, ctx, podColumn, pod, tsRaw, direction, options?.limit ?? 50);
+    // the message breaks ties: lines of the same pod with the same microsecond (42 % of lines on UAT)
+    const sql = contextQuery(view, ctx, podColumn, pod, tsRaw, direction, options?.limit ?? 50, row.entry);
     const res = await lastValueFrom(runSql(sql, { datasource, view, refId: `context-${direction}`, range }));
     const err = res.errors?.[0] ?? res.error;
     if (err) {
````

### 24/44 `src/datasource/context.test.ts` (new file)

unit tests: Show context

PATCH-BLOCK 24/44 src/datasource/context.test.ts old=none new=91f7ef7cac9681c684eef81d662d4861ffef46cb sha256=5a0f550fd5af3592d8069aa9a4f27d484369f5475c24558639c37650b145ccdf
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/context.test.ts b/plugins/kotak-starrocks-logs-app/src/datasource/context.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..91f7ef7cac9681c684eef81d662d4861ffef46cb
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/context.test.ts
@@ -0,0 +1,144 @@
+import { of } from 'rxjs';
+
+import { DataFrame, LogRowContextQueryDirection, LogRowModel, dateTime, toDataFrame } from '@grafana/data';
+
+import { clearQueryCache } from './queryCache';
+import { LogsAppQuery, runLogsQuery, StarRocksLogsDataSource } from './StarRocksLogsDataSource';
+import { emptySpec } from '../state/types';
+
+jest.mock('@grafana/scenes', () => ({ RuntimeDataSource: class {} }));
+jest.mock('./timeZone', () => ({ ensureSessionZone: async () => undefined }));
+jest.mock('./ContextScope', () => ({ ContextScope: (props: unknown) => props }));
+const runSql = jest.fn();
+jest.mock('./api', () => ({
+  runSql: (...args: unknown[]) => runSql(...args),
+  fetchColumns: async () => [
+    'observed_timestamp',
+    'message',
+    'level',
+    'k8s_service_name',
+    'k8s_pod_uid',
+    'k8s_pod_name',
+  ],
+}));
+
+const VIEW = 'vw_eks_app_logs_app_1961_observability';
+
+function logRow(labels: Record<string, string>, refId = 'A'): LogRowModel {
+  const frame: DataFrame = toDataFrame({
+    refId,
+    fields: [
+      { name: '__ts', values: ['2026-11-24 22:37:43.157123'] },
+      { name: 'labels', values: [labels] },
+    ],
+  });
+  return {
+    dataFrame: frame,
+    rowIndex: 0,
+    entry: "client 10.0.0.1 closed keepalive connection 'x'",
+    timeEpochMs: Date.UTC(2026, 10, 24, 22, 37, 43, 157),
+  } as unknown as LogRowModel;
+}
+
+const query: LogsAppQuery = { refId: 'A', kind: 'logs', spec: emptySpec(VIEW) };
+
+beforeEach(() => {
+  runSql.mockReset();
+  runSql.mockImplementation(() => of({ data: [toDataFrame({ fields: [{ name: '__ms', values: [] }] })] }));
+  clearQueryCache();
+});
+
+describe('show context (Grafana calls getLogRowContext from the Logs panel modal)', () => {
+  const ds = new StarRocksLogsDataSource();
+
+  it('queries the same pod uid around the exact timestamp, ties broken by the message', async () => {
+    await ds.getLogRowContext(
+      logRow({ k8s_pod_uid: 'u-1', k8s_pod_name: 'p-1' }),
+      { direction: LogRowContextQueryDirection.Backward, limit: 100 },
+      query
+    );
+    const sql = runSql.mock.calls[0][0] as string;
+    expect(sql).toContain("`k8s_pod_uid` = 'u-1'");
+    expect(sql).toContain("CAST('2026-11-24 22:37:43.157123' AS DATETIME)");
+    expect(sql).toContain("`message` < 'client 10.0.0.1 closed keepalive connection \\'x\\''");
+    expect(sql).toContain('LIMIT 100');
+    expect(runSql.mock.calls[0][1]).toMatchObject({ view: VIEW, refId: 'context-backward' });
+  });
+
+  it('falls back to the pod name; forward goes the other way', async () => {
+    await ds.getLogRowContext(
+      logRow({ k8s_pod_name: 'p-1' }),
+      { direction: LogRowContextQueryDirection.Forward, limit: 10 },
+      query
+    );
+    const sql = runSql.mock.calls[0][0] as string;
+    expect(sql).toContain("`k8s_pod_name` = 'p-1'");
+    expect(sql).toContain('ORDER BY `observed_timestamp` ASC, `message` ASC');
+  });
+
+  it('works on rows whose refId the modal renamed (Grafana sets context_<n>_<m> when loading more)', async () => {
+    await ds.getLogRowContext(
+      logRow({ k8s_pod_uid: 'u-1' }, 'context_2_1'),
+      { direction: LogRowContextQueryDirection.Backward, limit: 100 },
+      query
+    );
+    expect(runSql).toHaveBeenCalledTimes(1);
+  });
+
+  it('returns nothing without a view, a timestamp or a pod', async () => {
+    expect((await ds.getLogRowContext(logRow({ k8s_pod_uid: 'u' }), {}, undefined)).data).toEqual([]);
+    expect((await ds.getLogRowContext(logRow({}), {}, query)).data).toEqual([]);
+    expect(runSql).not.toHaveBeenCalled();
+  });
+
+  it('turns StarRocks errors into an error the modal shows', async () => {
+    runSql.mockImplementation(() => of({ data: [], errors: [{ message: 'Access denied' }] }));
+    await expect(ds.getLogRowContext(logRow({ k8s_pod_uid: 'u' }), {}, query)).rejects.toThrow('Access denied');
+  });
+
+  it('the context header names the pod column that is matched', () => {
+    const ui = ds.getLogRowContextUi(logRow({ k8s_pod_uid: 'u-1', k8s_pod_name: 'p-1' })) as unknown as {
+      props: { podColumn: string; labels: Record<string, string> };
+    };
+    expect(ui.props.podColumn).toBe('k8s_pod_uid');
+    expect(ui.props.labels.k8s_pod_name).toBe('p-1');
+    const byName = ds.getLogRowContextUi(logRow({ k8s_pod_name: 'p-1' })) as unknown as {
+      props: { podColumn: string };
+    };
+    expect(byName.props.podColumn).toBe('k8s_pod_name');
+  });
+});
+
+describe('runLogsQuery uses the result cache', () => {
+  const range = { from: dateTime(1_000_000), to: dateTime(4_600_000), raw: { from: 'now-1h', to: 'now' } };
+  const volume: LogsAppQuery = { refId: 'A', kind: 'volume', spec: emptySpec(VIEW), params: { withLevel: false } };
+
+  it('answers the same query and range from the cache; another range runs again', async () => {
+    runSql.mockImplementation(() =>
+      of({
+        data: [
+          toDataFrame({
+            fields: [
+              { name: 't', values: [1000] },
+              { name: 'g', values: ['all'] },
+              { name: 'c', values: [3] },
+            ],
+          }),
+        ],
+      })
+    );
+    const first = await new Promise((resolve) => runLogsQuery(volume, range).subscribe({ next: resolve }));
+    const second = await new Promise((resolve) => runLogsQuery(volume, range).subscribe({ next: resolve }));
+    expect(runSql).toHaveBeenCalledTimes(1);
+    expect(second).toEqual(first);
+    const later = { ...range, to: dateTime(4_700_000) };
+    await new Promise((resolve) => runLogsQuery(volume, later).subscribe({ next: resolve }));
+    expect(runSql).toHaveBeenCalledTimes(2);
+  });
+
+  it('passes the level sampling to the SQL', async () => {
+    const sampled: LogsAppQuery = { ...volume, params: { withLevel: true, sample: 10 } };
+    await new Promise((resolve) => runLogsQuery(sampled, range).subscribe({ next: resolve }));
+    expect(runSql.mock.calls[0][0]).toContain('COUNT(*) * 10');
+  });
+});
````

### 25/44 `src/datasource/frames.nanos.test.ts` (new file)

unit tests: sub-millisecond order

PATCH-BLOCK 25/44 src/datasource/frames.nanos.test.ts old=none new=4b0442e6d378776992e52bccbc6c5307092460ae sha256=95feb0597b42c55eee04c1aa4962a54431fdb4a655ecd35587cf650c3697321e
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/frames.nanos.test.ts b/plugins/kotak-starrocks-logs-app/src/datasource/frames.nanos.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4b0442e6d378776992e52bccbc6c5307092460ae
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/frames.nanos.test.ts
@@ -0,0 +1,59 @@
+import { createDataFrame, FieldType } from '@grafana/data';
+
+import { resolveConfig, resolveTenant } from '../config/config';
+import { concatFrames, subMillisecondNanos, toLogsFrame } from './frames';
+
+describe('sub-millisecond order (42 % of lines share a millisecond on UAT)', () => {
+  it('reads the nanoseconds within the millisecond from the exact text', () => {
+    expect(subMillisecondNanos('2026-11-24 22:37:43.157123')).toBe(123_000);
+    expect(subMillisecondNanos('2026-11-24 22:37:43.157')).toBe(0);
+    expect(subMillisecondNanos('2026-11-24 22:37:43.1')).toBe(0);
+    expect(subMillisecondNanos('2026-11-24 22:37:43')).toBe(0);
+    expect(subMillisecondNanos(undefined)).toBe(0);
+  });
+
+  it('the logs frame timestamp carries nanos (Grafana sorts by them)', () => {
+    const { config } = resolveConfig({});
+    const frame = createDataFrame({
+      fields: [
+        { name: '__ms', type: FieldType.number, values: [1000, 1000] },
+        { name: '__ts', type: FieldType.string, values: ['1970-01-01 00:00:01.000900', '1970-01-01 00:00:01.000100'] },
+        { name: 'message', type: FieldType.string, values: ['b', 'a'] },
+        { name: 'detected_level', type: FieldType.string, values: ['info', 'info'] },
+      ],
+    });
+    const f = toLogsFrame(frame, { tenant: resolveTenant(config, 'v'), refId: 'A' });
+    expect(f.fields[0].name).toBe('timestamp');
+    expect(f.fields[0].nanos).toEqual([900_000, 100_000]);
+  });
+});
+
+describe('concatFrames (windows of a newest-first search)', () => {
+  const a = createDataFrame({
+    refId: 'A',
+    fields: [
+      { name: 'x', values: [1, 2] },
+      { name: 'y', values: ['a', 'b'] },
+    ],
+  });
+  const b = createDataFrame({
+    fields: [
+      { name: 'x', values: [3] },
+      { name: 'y', values: ['c'] },
+    ],
+  });
+  const other = createDataFrame({ fields: [{ name: 'z', values: [9] }] });
+
+  it('joins rows in order and keeps the first frame refId', () => {
+    const j = concatFrames([a, b]);
+    expect(j.fields[0].values).toEqual([1, 2, 3]);
+    expect(j.fields[1].values).toEqual(['a', 'b', 'c']);
+    expect(j.refId).toBe('A');
+    expect(j.length).toBe(3);
+  });
+
+  it('returns a single frame as it is, and skips frames of another shape', () => {
+    expect(concatFrames([a])).toBe(a);
+    expect(concatFrames([a, other, b]).fields[0].values).toEqual([1, 2, 3]);
+  });
+});
````

### 26/44 `src/datasource/frames.ts` (modified)

sub-millisecond order of lines in the logs panel (`nanos`)

PATCH-BLOCK 26/44 src/datasource/frames.ts old=ba45284778b135a699373c08b5da994f6573fcf7 new=d259421e2dcbe34c6e6d64e376d854122f193afc sha256=586f4caf618908e74d4da25d12b3e4ac1374e15ce699fdcee84279fcdaf7964f
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/frames.ts b/plugins/kotak-starrocks-logs-app/src/datasource/frames.ts
index ba45284778b135a699373c08b5da994f6573fcf7..d259421e2dcbe34c6e6d64e376d854122f193afc 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/frames.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/frames.ts
@@ -33,6 +33,16 @@ export function traceLink(trace: TraceConfig): DataLink {
   };
 }
 
+/** Nanoseconds within the millisecond of a "YYYY-MM-DD HH:MM:SS.ffffff" text (0 when there are none). */
+export function subMillisecondNanos(tsRaw: unknown): number {
+  const m = /\.(\d+)/.exec(str(tsRaw));
+  if (!m) {
+    return 0;
+  }
+  const micros = Number(m[1].padEnd(6, '0').slice(0, 6));
+  return (micros % 1000) * 1000;
+}
+
 export interface LogsFrameOptions {
   tenant: ResolvedTenant;
   refId: string;
@@ -72,7 +82,14 @@ export function toLogsFrame(frame: DataFrame, opts: LogsFrameOptions): DataFrame
   });
 
   const fields: Field[] = [
-    { name: 'timestamp', type: FieldType.time, config: {}, values: rows.map((i) => ts[i]) },
+    {
+      name: 'timestamp',
+      type: FieldType.time,
+      config: {},
+      values: rows.map((i) => ts[i]),
+      // sub-millisecond part from the exact text, so lines within one millisecond keep their order
+      nanos: rows.map((i) => subMillisecondNanos(tsRaw[i])),
+    },
     { name: 'body', type: FieldType.string, config: {}, values: rows.map((i) => str(msg[i])) },
     { name: 'severity', type: FieldType.string, config: {}, values: rows.map((i) => str(lvl[i]) || 'unknown') },
     // stable across responses (timestamp + pod + message), so "load more" merges overlapping lines
````

### 27/44 `src/datasource/hints.test.ts` (new file)

unit tests: SQL hint per view

PATCH-BLOCK 27/44 src/datasource/hints.test.ts old=none new=8b18bdf8a0fe11c72622920ce5f1d35a8bff4a4e sha256=35f00f32091dd74ef2457bf5b0ed46396bdb681a411af25c00616ea8ed3633fb
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/hints.test.ts b/plugins/kotak-starrocks-logs-app/src/datasource/hints.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8b18bdf8a0fe11c72622920ce5f1d35a8bff4a4e
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/hints.test.ts
@@ -0,0 +1,39 @@
+import { setAppConfig } from '../config/config';
+import { appQueryHint, sessionZone, setSessionZone } from './api';
+
+jest.mock('@grafana/runtime', () => ({ getDataSourceSrv: () => ({ getList: () => [] }), getBackendSrv: () => ({}) }));
+
+describe('SET_VAR hint per data source and view', () => {
+  beforeEach(() => setAppConfig({}));
+
+  it('auto: the zone detected for that view, plus the query timeout', () => {
+    setSessionZone('ds1', 'vw_a', '+00:00');
+    setSessionZone('ds1', 'vw_b', '+05:30');
+    expect(appQueryHint({ datasource: 'ds1', view: 'vw_a' })).toBe(
+      "/*+ SET_VAR(time_zone = '+00:00', query_timeout = 120) */"
+    );
+    expect(appQueryHint({ datasource: 'ds1', view: 'vw_b' })).toContain("time_zone = '+05:30'");
+    // another data source, same view name: not detected yet = the session zone
+    expect(appQueryHint({ datasource: 'ds2', view: 'vw_a' })).toBe('/*+ SET_VAR(query_timeout = 120) */');
+    expect(sessionZone('ds1', undefined)).toBeUndefined();
+  });
+
+  it('the default data source is keyed by its uid', () => {
+    setAppConfig({ datasourceUid: 'main' });
+    setSessionZone(undefined, 'vw_x', '+00:00');
+    expect(sessionZone('main', 'vw_x')).toBe('+00:00');
+    expect(sessionZone('', 'vw_x')).toBe('+00:00');
+  });
+
+  it('timeZone "session" never sets one; an explicit zone is always used', () => {
+    setSessionZone('ds1', 'vw_a', '+00:00');
+    setAppConfig({ timeZone: 'session' });
+    expect(appQueryHint({ datasource: 'ds1', view: 'vw_a' })).toBe('/*+ SET_VAR(query_timeout = 120) */');
+    setAppConfig({ timeZone: 'Asia/Kolkata', queryTimeoutSeconds: 0 });
+    expect(appQueryHint({ datasource: 'ds9', view: 'vw_z' })).toBe("/*+ SET_VAR(time_zone = 'Asia/Kolkata') */");
+  });
+
+  it('a per-statement timeout overrides the setting (probes use 30 s)', () => {
+    expect(appQueryHint({ timeoutSeconds: 30 })).toBe('/*+ SET_VAR(query_timeout = 30) */');
+  });
+});
````

### 28/44 `src/datasource/probes.test.ts` (new file)

unit tests: time zone and oldest-log probes

PATCH-BLOCK 28/44 src/datasource/probes.test.ts old=none new=e7aef3a4cac95604be64119c4e1cc3d69b4f1737 sha256=5e691b39be0d7cc52ffc5c12883f7242c06d91531ba1684d589a279dcf935e18
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/probes.test.ts b/plugins/kotak-starrocks-logs-app/src/datasource/probes.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e7aef3a4cac95604be64119c4e1cc3d69b4f1737
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/probes.test.ts
@@ -0,0 +1,125 @@
+import { DataFrame, toDataFrame } from '@grafana/data';
+
+import { setAppConfig } from '../config/config';
+import { getOldestCache, getTimeModeCache, setOldestCache } from '../state/storage';
+
+const runSqlOnce = jest.fn();
+const setSessionZone = jest.fn();
+jest.mock('./api', () => ({
+  runSqlOnce: (...args: unknown[]) => runSqlOnce(...args),
+  setSessionZone: (...args: unknown[]) => setSessionZone(...args),
+  stringColumn: (frame: DataFrame | undefined, name: string) =>
+    (frame?.fields.find((f) => f.name === name)?.values ?? []).map((v) => (v == null ? '' : String(v))),
+}));
+
+import { detectTimeMode, ensureSessionZone } from './timeZone';
+import { fetchOldestLog } from './oldest';
+
+const t = (text: string) => [toDataFrame({ fields: [{ name: 't', values: [text] }] })];
+const off = (minutes: number) => [
+  toDataFrame({
+    fields: [
+      { name: 'tz', values: ['x'] },
+      { name: 'off', values: [minutes] },
+    ],
+  }),
+];
+const iso = (ms: number) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '000');
+
+beforeEach(() => {
+  runSqlOnce.mockReset();
+  setSessionZone.mockReset();
+  window.localStorage.clear();
+  setAppConfig({});
+});
+
+describe('time zone probe per view (datasource/timeZone.ts)', () => {
+  it('an instant column (Iceberg timestamptz): +1 h under +01:00 → statements run in +00:00, cached per browser', async () => {
+    const now = Date.now();
+    runSqlOnce
+      .mockResolvedValueOnce(t(iso(now - 5000)))
+      .mockResolvedValueOnce(t(iso(now - 5000 + 3_600_000)))
+      .mockResolvedValueOnce(off(330));
+    await ensureSessionZone('vw_a', 'ds1');
+    expect(setSessionZone).toHaveBeenCalledWith('ds1', 'vw_a', '+00:00');
+    // the probes: newest line text in +00:00 and +01:00, then the session's own offset (no zone)
+    expect(runSqlOnce.mock.calls[0][4]).toMatchObject({ timeZone: '+00:00', timeoutSeconds: 30 });
+    expect(runSqlOnce.mock.calls[1][4]).toMatchObject({ timeZone: '+01:00' });
+    expect(runSqlOnce.mock.calls[2][4]).toMatchObject({ timeZone: null });
+    expect(getTimeModeCache('ds1', 'vw_a')?.mode).toEqual({ kind: 'aware' });
+    // second time: from the cache, no queries
+    runSqlOnce.mockClear();
+    expect(await detectTimeMode('vw_a', 'ds1')).toEqual({ kind: 'aware' });
+    expect(runSqlOnce).not.toHaveBeenCalled();
+  });
+
+  it('a wall-clock column in IST with an IST session → +05:30', async () => {
+    const wall = Date.now() - 30_000 + 330 * 60_000;
+    runSqlOnce
+      .mockResolvedValueOnce(t(iso(wall)))
+      .mockResolvedValueOnce(t(iso(wall)))
+      .mockResolvedValueOnce(off(330));
+    await ensureSessionZone('vw_b', 'ds1');
+    expect(setSessionZone).toHaveBeenCalledWith('ds1', 'vw_b', '+05:30');
+  });
+
+  it('no recent lines → the session zone (not cached, tried again next time)', async () => {
+    runSqlOnce.mockResolvedValueOnce([toDataFrame({ fields: [{ name: 't', values: [] }] })]);
+    runSqlOnce.mockResolvedValueOnce([toDataFrame({ fields: [{ name: 't', values: [] }] })]);
+    runSqlOnce.mockResolvedValueOnce(off(0));
+    await ensureSessionZone('vw_c', 'ds1');
+    expect(setSessionZone).toHaveBeenCalledWith('ds1', 'vw_c', undefined);
+    expect(getTimeModeCache('ds1', 'vw_c')).toBeUndefined();
+  });
+
+  it('a failing probe leaves the session zone and does not break the page', async () => {
+    runSqlOnce.mockRejectedValue(new Error('denied'));
+    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
+    await expect(ensureSessionZone('vw_d', 'ds1')).resolves.toBeUndefined();
+    expect(setSessionZone).toHaveBeenCalledWith('ds1', 'vw_d', undefined);
+    warn.mockRestore();
+  });
+
+  it('timeZone other than "auto": no probe at all', async () => {
+    setAppConfig({ timeZone: '+00:00' });
+    await ensureSessionZone('vw_e', 'ds1');
+    expect(runSqlOnce).not.toHaveBeenCalled();
+  });
+});
+
+describe('oldest log of a view (datasource/oldest.ts)', () => {
+  it('runs the LIMIT 1 probes, then MIN over one hour; caches the result per browser', async () => {
+    const now = Date.UTC(2026, 10, 25, 6, 0);
+    const oldest = now - 3 * 3_600_000 - 1234;
+    runSqlOnce.mockImplementation(async (sql: string) => {
+      const before = /< FROM_UNIXTIME\((\d+)\) LIMIT 1/.exec(sql);
+      if (before) {
+        return [toDataFrame({ fields: [{ name: 'x', values: oldest < Number(before[1]) * 1000 ? [1] : [] }] })];
+      }
+      return [toDataFrame({ fields: [{ name: 'oldest', values: [oldest] }] })];
+    });
+    expect(await fetchOldestLog('vw_o', 'ds1', now)).toBe(oldest);
+    expect(runSqlOnce.mock.calls.every((c) => c[4].view === 'vw_o' && c[4].timeoutSeconds === 30)).toBe(true);
+    expect(getOldestCache('ds1', 'vw_o')).toEqual({ oldestMs: oldest, checkedAt: now });
+    runSqlOnce.mockClear();
+    expect(await fetchOldestLog('vw_o', 'ds1', now + 60_000)).toBe(oldest);
+    expect(runSqlOnce).not.toHaveBeenCalled();
+  });
+
+  it('a cache older than 6 hours is refreshed; an empty view is remembered as null', async () => {
+    setOldestCache('ds1', 'vw_e', { oldestMs: 1, checkedAt: 0 });
+    runSqlOnce.mockResolvedValue([toDataFrame({ fields: [{ name: 'x', values: [] }] })]);
+    expect(await fetchOldestLog('vw_e', 'ds1', 7 * 3_600_000)).toBeUndefined();
+    expect(getOldestCache('ds1', 'vw_e')?.oldestMs).toBeNull();
+  });
+
+  it('two callers at once share one search', async () => {
+    let calls = 0;
+    runSqlOnce.mockImplementation(async () => {
+      calls++;
+      return [toDataFrame({ fields: [{ name: 'x', values: [] }] })];
+    });
+    await Promise.all([fetchOldestLog('vw_s', 'ds2', 1000), fetchOldestLog('vw_s', 'ds2', 1000)]);
+    expect(calls).toBe(1);
+  });
+});
````

### 29/44 `src/datasource/query.test.ts` (new file)

unit tests: panel queries, SQL per query kind

PATCH-BLOCK 29/44 src/datasource/query.test.ts old=none new=7c0a68b8a761fc1c2da3672c142c8fa5bd455354 sha256=168bed8e10b3826ace12b8e06ef9def3a676d88ca6d5da2203a650e12863ef24
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/query.test.ts b/plugins/kotak-starrocks-logs-app/src/datasource/query.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7c0a68b8a761fc1c2da3672c142c8fa5bd455354
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/query.test.ts
@@ -0,0 +1,117 @@
+import { of } from 'rxjs';
+
+import { DataQueryRequest, LoadingState, dateTime, toDataFrame } from '@grafana/data';
+
+import { emptySpec } from '../state/types';
+import { clearQueryCache } from './queryCache';
+import { BuildContext, resolvePatterns } from './testUtils';
+import { buildSql, ensureRuntimeDataSource, LogsAppQuery, StarRocksLogsDataSource } from './StarRocksLogsDataSource';
+
+jest.mock('@grafana/scenes', () => ({ RuntimeDataSource: class {} }));
+jest.mock('./timeZone', () => ({ ensureSessionZone: async () => undefined }));
+jest.mock('./ContextScope', () => ({ ContextScope: () => null }));
+const runSql = jest.fn();
+jest.mock('./api', () => ({
+  runSql: (...args: unknown[]) => runSql(...args),
+  fetchColumns: async () => [
+    'observed_timestamp',
+    'message',
+    'level',
+    'k8s_service_name',
+    'k8s_namespace_name',
+    'k8s_pod_uid',
+  ],
+}));
+
+const VIEW = 'vw_eks_app_logs_app_1'; // tenant app_1
+const range = {
+  from: dateTime(Date.UTC(2026, 10, 25, 3)),
+  to: dateTime(Date.UTC(2026, 10, 25, 4)),
+  raw: { from: 'now-1h', to: 'now' },
+};
+
+function request(targets: LogsAppQuery[]): DataQueryRequest<LogsAppQuery> {
+  return { targets, range, requestId: 'r' } as unknown as DataQueryRequest<LogsAppQuery>;
+}
+
+beforeEach(() => {
+  runSql.mockReset();
+  clearQueryCache();
+});
+
+describe('runtime data source: what the panels get', () => {
+  const ds = new StarRocksLogsDataSource();
+
+  it('no target with a view: done, no query', async () => {
+    const res = await new Promise((resolve) =>
+      ds.query(request([{ refId: 'A', kind: 'logs', spec: emptySpec('') }])).subscribe(resolve)
+    );
+    expect(res).toEqual({ data: [], state: LoadingState.Done });
+    expect(runSql).not.toHaveBeenCalled();
+  });
+
+  it('several targets are combined; one error makes the panel show the error', async () => {
+    runSql
+      .mockReturnValueOnce(
+        of({
+          data: [
+            toDataFrame({
+              fields: [
+                { name: 't', values: [1] },
+                { name: 'g', values: ['all'] },
+                { name: 'c', values: [2] },
+              ],
+            }),
+          ],
+        })
+      )
+      .mockReturnValueOnce(of({ data: [], errors: [{ message: 'denied' }] }));
+    const targets: LogsAppQuery[] = [
+      { refId: 'A', kind: 'volume', spec: emptySpec(VIEW), params: { withLevel: false } },
+      { refId: 'B', kind: 'volume', spec: emptySpec(VIEW), params: { withLevel: true } },
+    ];
+    const res = await new Promise<{ state: LoadingState; errors?: Array<{ message?: string; refId?: string }> }>(
+      (resolve) => ds.query(request(targets)).subscribe((r) => resolve(r as never))
+    );
+    expect(res.state).toBe(LoadingState.Error);
+    expect(res.errors?.[0]).toMatchObject({ message: 'denied', refId: 'B' });
+  });
+
+  it('testDatasource is always fine; the data source registers once', async () => {
+    expect(await ds.testDatasource()).toEqual({ status: 'success', message: 'ok' });
+    const register = jest.fn();
+    ensureRuntimeDataSource(register);
+    ensureRuntimeDataSource(register);
+    expect(register).toHaveBeenCalledTimes(1);
+  });
+});
+
+describe('buildSql: every query kind', () => {
+  const ctx: BuildContext = resolvePatterns(VIEW);
+  const q = (kind: LogsAppQuery['kind'], params = {}): LogsAppQuery => ({
+    refId: 'A',
+    kind,
+    spec: emptySpec(VIEW),
+    params,
+  });
+
+  it.each([
+    ['serviceVolume', {}, 'GROUP BY t, v, lvl'],
+    ['serviceVolume', { withLevel: true, sample: 10 }, 'COUNT(*) * 10'],
+    ['serviceSamples', { values: ['a', 'b'], perValue: 3 }, 'UNION ALL'],
+    ['volume', { withLevel: false }, "'all' AS g"],
+    ['logs', { limit: 50, sort: 'asc' }, 'ORDER BY `observed_timestamp` ASC\nLIMIT 50'],
+    ['table', {}, 'LIMIT 1000'],
+    ['labelOverview', { labels: ['k8s_service_name', 'k8s_namespace_name'] }, 'GROUPING SETS'],
+    ['valueBreakdown', { label: 'k8s_namespace_name' }, '`k8s_namespace_name` AS v'],
+    ['fieldBreakdown', { field: 'status' }, 'regexp_extract(`message`'],
+    ['patterns', {}, "WHEN `message` LIKE '%timed out%' THEN 'Timeout'"],
+  ] as const)('%s %j', (kind, params, expected) => {
+    expect(buildSql(q(kind, params), ctx, range)).toContain(expected);
+  });
+
+  it('line queries carry exact microsecond bounds of the request range', () => {
+    const sql = buildSql(q('logs'), ctx, range);
+    expect(sql).toContain(`microseconds_add(FROM_UNIXTIME(${Date.UTC(2026, 10, 25, 3) / 1000}), 0)`);
+  });
+});
````

### 30/44 `src/datasource/queryCache.test.ts` (new file)

unit tests: result cache

PATCH-BLOCK 30/44 src/datasource/queryCache.test.ts old=none new=9e3e4bb7fda3c71f92897641415bf2d793b1e1fc sha256=0ab3503158479828f15c2e8cc469484ae010d7f548f43234479f065d45c3fad0
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/queryCache.test.ts b/plugins/kotak-starrocks-logs-app/src/datasource/queryCache.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9e3e4bb7fda3c71f92897641415bf2d793b1e1fc
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/queryCache.test.ts
@@ -0,0 +1,53 @@
+import { DataQueryResponse, LoadingState, toDataFrame } from '@grafana/data';
+
+import { clearQueryCache, getCached, putCached, queryCacheSize } from './queryCache';
+
+function response(values: number[], state = LoadingState.Done): DataQueryResponse {
+  return { data: [toDataFrame({ fields: [{ name: 'v', values }] })], state };
+}
+
+beforeEach(() => clearQueryCache());
+
+describe('query result cache (back navigation without re-running queries)', () => {
+  it('returns a finished response for the same key within 5 minutes, and nothing after', () => {
+    putCached('k', response([1, 2]), 1000);
+    expect(getCached('k', 1000 + 4 * 60_000)?.data[0].fields[0].values).toEqual([1, 2]);
+    expect(getCached('k', 1000 + 5 * 60_000 + 1)).toBeUndefined();
+    expect(queryCacheSize()).toBe(0);
+  });
+
+  it('keeps only finished, successful responses', () => {
+    putCached('loading', response([1], LoadingState.Loading));
+    putCached('streaming', response([1], LoadingState.Streaming));
+    putCached('error', { ...response([1]), error: { message: 'x' } });
+    putCached('errors', { ...response([1]), errors: [{ message: 'x' }] });
+    expect(queryCacheSize()).toBe(0);
+  });
+
+  it('hands out copies: a panel that changes its frames does not change the cache', () => {
+    putCached('k', response([1, 2]));
+    const a = getCached('k')!;
+    (a.data[0].fields[0].values as number[]).push(3);
+    expect(getCached('k')!.data[0].fields[0].values).toEqual([1, 2]);
+  });
+
+  it('copies nanos too', () => {
+    const r = response([1]);
+    r.data[0].fields[0].nanos = [5];
+    putCached('k', r);
+    const a = getCached('k')!;
+    a.data[0].fields[0].nanos![0] = 9;
+    expect(getCached('k')!.data[0].fields[0].nanos).toEqual([5]);
+  });
+
+  it('holds at most 40 entries, dropping the least recently used', () => {
+    for (let i = 0; i < 40; i++) {
+      putCached(`k${i}`, response([i]));
+    }
+    getCached('k0'); // used: moves to the end
+    putCached('k40', response([40]));
+    expect(queryCacheSize()).toBe(40);
+    expect(getCached('k0')).toBeDefined();
+    expect(getCached('k1')).toBeUndefined();
+  });
+});
````

### 31/44 `src/datasource/queryCache.ts` (new file)

results kept 5 minutes (40 entries) in the browser tab

PATCH-BLOCK 31/44 src/datasource/queryCache.ts old=none new=b5e7556214509fc21eba830dbab3c5b8efd7cf3a sha256=f6538b43b1b4790e74d8dd570d5d2e6bfcd4f326f6de56a94044318dfaa69f6c
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/queryCache.ts b/plugins/kotak-starrocks-logs-app/src/datasource/queryCache.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b5e7556214509fc21eba830dbab3c5b8efd7cf3a
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/queryCache.ts
@@ -0,0 +1,68 @@
+import { DataFrame, DataQueryResponse, LoadingState } from '@grafana/data';
+
+/**
+ * Finished query results, kept for a few minutes under the exact query and time range. Going back to a screen
+ * (browser Back, a tab, the grid) shows its last results at once instead of re-running queries that take
+ * seconds on the shared cluster. A refresh evaluates the time range again (another key) and clears the cache;
+ * a relative range moves on by itself, so only re-visits within the same range value hit.
+ */
+const TTL_MS = 5 * 60_000;
+const MAX_ENTRIES = 40;
+
+interface Entry {
+  at: number;
+  response: DataQueryResponse;
+}
+
+const entries = new Map<string, Entry>();
+
+function cloneFrame(f: DataFrame): DataFrame {
+  // panels (infinite scroll's merge in particular) may change frames in place; the cache keeps its own copy
+  return {
+    ...f,
+    fields: f.fields.map((x) => ({ ...x, values: [...x.values], ...(x.nanos ? { nanos: [...x.nanos] } : {}) })),
+  };
+}
+
+function cloneResponse(r: DataQueryResponse): DataQueryResponse {
+  return { ...r, data: (r.data as DataFrame[]).map(cloneFrame) };
+}
+
+export function getCached(key: string, now = Date.now()): DataQueryResponse | undefined {
+  const e = entries.get(key);
+  if (!e) {
+    return undefined;
+  }
+  if (now - e.at > TTL_MS) {
+    entries.delete(key);
+    return undefined;
+  }
+  // most recently used last
+  entries.delete(key);
+  entries.set(key, e);
+  return cloneResponse(e.response);
+}
+
+/** Keeps only finished, successful responses. */
+export function putCached(key: string, response: DataQueryResponse, now = Date.now()) {
+  if (response.state !== LoadingState.Done || response.error || (response.errors?.length ?? 0) > 0) {
+    return;
+  }
+  entries.delete(key);
+  entries.set(key, { at: now, response: cloneResponse(response) });
+  while (entries.size > MAX_ENTRIES) {
+    const oldest = entries.keys().next().value;
+    if (oldest === undefined) {
+      break;
+    }
+    entries.delete(oldest);
+  }
+}
+
+export function clearQueryCache() {
+  entries.clear();
+}
+
+export function queryCacheSize(): number {
+  return entries.size;
+}
````

### 32/44 `src/datasource/runSql.test.ts` (new file)

unit tests: `/api/ds/query` calls and errors

PATCH-BLOCK 32/44 src/datasource/runSql.test.ts old=none new=57665ccb8dbdaa9304ddd8e31fcf9aa494301062 sha256=291e6e13dc3929cb389954b9422e19e2475303c8d00e8ff2b5c8e3982566b324
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/runSql.test.ts b/plugins/kotak-starrocks-logs-app/src/datasource/runSql.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..57665ccb8dbdaa9304ddd8e31fcf9aa494301062
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/runSql.test.ts
@@ -0,0 +1,146 @@
+import { of, throwError, lastValueFrom } from 'rxjs';
+
+import { dateTime } from '@grafana/data';
+
+import { setAppConfig } from '../config/config';
+import { fetchColumns, fetchViews, runSql, runSqlOnce, setSessionZone, stringColumn } from './api';
+
+const fetch = jest.fn();
+jest.mock('@grafana/runtime', () => {
+  const actual = jest.requireActual('@grafana/runtime');
+  return {
+    ...actual,
+    getBackendSrv: () => ({ fetch: (...args: unknown[]) => fetch(...args) }),
+    getDataSourceSrv: () => ({ getList: () => [] }),
+  };
+});
+
+const range = {
+  from: dateTime(1_700_000_000_000),
+  to: dateTime(1_700_003_600_000),
+  raw: { from: 'now-1h', to: 'now' },
+};
+
+/** What /api/ds/query returns for one table frame (results are keyed by the query's refId). */
+function okResponse(fields: Array<{ name: string; values: unknown[] }>, refId = 'A') {
+  return {
+    status: 200,
+    data: {
+      results: {
+        [refId]: {
+          frames: [
+            {
+              schema: {
+                fields: fields.map((f) => ({
+                  name: f.name,
+                  type: typeof f.values[0] === 'number' ? 'number' : 'string',
+                })),
+              },
+              data: { values: fields.map((f) => f.values) },
+            },
+          ],
+        },
+      },
+    },
+  };
+}
+
+beforeEach(() => {
+  fetch.mockReset();
+  setAppConfig({ datasourceUid: 'main' });
+});
+
+describe('runSql: one statement through /api/ds/query as the signed-in user', () => {
+  it('posts the SQL to the chosen kotak-starrocks-datasource with the time range and the app hint', async () => {
+    fetch.mockReturnValue(of(okResponse([{ name: 'x', values: [1] }])));
+    setSessionZone('ds2', 'vw_a', '+00:00');
+    await lastValueFrom(
+      runSql('SELECT x FROM t', { refId: 'A', range, datasource: 'ds2', view: 'vw_a', requestId: 'r1' })
+    );
+    const req = fetch.mock.calls[0][0];
+    expect(req.url).toBe('/api/ds/query');
+    expect(req.method).toBe('POST');
+    expect(req.requestId).toBe('r1');
+    expect(req.showErrorAlert).toBe(false);
+    expect(req.data.from).toBe('1700000000000');
+    expect(req.data.to).toBe('1700003600000');
+    const q = req.data.queries[0];
+    expect(q.datasource).toEqual({ type: 'kotak-starrocks-datasource', uid: 'ds2' });
+    expect(q.format).toBe('table');
+    expect(q.rawSql).toBe("SELECT /*+ SET_VAR(time_zone = '+00:00', query_timeout = 120) */ x FROM t");
+  });
+
+  it('uses the default data source; an explicit zone (probes) or none replaces the view zone', async () => {
+    fetch.mockReturnValue(of(okResponse([{ name: 'x', values: [1] }])));
+    await lastValueFrom(runSql('SELECT 1', { refId: 'A', range, timeZone: '+01:00', timeoutSeconds: 30 }));
+    let q = fetch.mock.calls[0][0].data.queries[0];
+    expect(q.datasource.uid).toBe('main');
+    expect(q.rawSql).toBe("SELECT /*+ SET_VAR(time_zone = '+01:00', query_timeout = 30) */ 1");
+    await lastValueFrom(runSql('SELECT 1', { refId: 'A', range, timeZone: null }));
+    q = fetch.mock.calls[1][0].data.queries[0];
+    expect(q.rawSql).toBe('SELECT /*+ SET_VAR(query_timeout = 120) */ 1');
+    await lastValueFrom(runSql('SHOW TABLES', { refId: 'A', range }));
+    expect(fetch.mock.calls[2][0].data.queries[0].rawSql).toBe('SHOW TABLES');
+  });
+
+  it('a failed query (HTTP 4xx/5xx) comes back as errors with an explanation, not an exception', async () => {
+    fetch.mockReturnValue(
+      throwError(() => ({
+        status: 400,
+        data: { results: { A: { error: 'db query error: Error 5204 (42000): Access denied', status: 400 } } },
+      }))
+    );
+    const res = await lastValueFrom(runSql('SELECT 1', { refId: 'A', range }));
+    expect(res.errors?.[0].message).toMatch(/^Access denied by Ranger \(5204\)/);
+    await expect(runSqlOnce('SELECT 1', range)).rejects.toThrow(/5204/);
+  });
+
+  it('runSqlOnce returns the frames; stringColumn reads a column as text', async () => {
+    fetch.mockReturnValue(
+      of(
+        okResponse([
+          { name: 'v', values: ['a', null] },
+          { name: 'n', values: [1, 2] },
+        ])
+      )
+    );
+    const frames = await runSqlOnce('SELECT v, n FROM t', range);
+    expect(stringColumn(frames[0], 'v')).toEqual(['a', '']);
+    expect(stringColumn(frames[0])).toEqual(['a', '']);
+    expect(stringColumn(undefined, 'v')).toEqual([]);
+  });
+});
+
+describe('view list and columns', () => {
+  it('lists only views with the data source prefix, sorted (SHOW TABLES, Ranger-filtered)', async () => {
+    fetch.mockReturnValue(
+      of(okResponse([{ name: 'Tables', values: ['vw_eks_app_logs_b', 'other', 'vw_eks_app_logs_a'] }], 'views'))
+    );
+    expect(await fetchViews(range)).toEqual(['vw_eks_app_logs_a', 'vw_eks_app_logs_b']);
+    expect(fetch.mock.calls[0][0].data.queries[0].rawSql).toBe("SHOW TABLES LIKE 'vw_eks_app_logs_%'");
+  });
+
+  it('reads the columns from SELECT * LIMIT 0 once per data source and view; a failure is retried', async () => {
+    fetch.mockReturnValueOnce(
+      throwError(() => ({ status: 500, data: { results: { columns: { error: 'boom', status: 500 } } } }))
+    );
+    await expect(fetchColumns('vw_c', range, 'dsx')).rejects.toThrow('boom');
+    fetch.mockReturnValue(
+      of(
+        okResponse(
+          [
+            { name: 'observed_timestamp', values: [] },
+            { name: 'message', values: [] },
+          ],
+          'columns'
+        )
+      )
+    );
+    expect(await fetchColumns('vw_c', range, 'dsx')).toEqual(['observed_timestamp', 'message']);
+    expect(await fetchColumns('vw_c', range, 'dsx')).toEqual(['observed_timestamp', 'message']);
+    expect(fetch).toHaveBeenCalledTimes(2);
+    expect(fetch.mock.calls[1][0].data.queries[0].rawSql).toBe(
+      'SELECT /*+ SET_VAR(query_timeout = 120) */ * FROM `vw_c` LIMIT 0'
+    );
+  });
+});
````

### 33/44 `src/datasource/testUtils.ts` (new file)

test helpers

PATCH-BLOCK 33/44 src/datasource/testUtils.ts old=none new=9988966a62aa6f00420b40efe888d101a497b3e1 sha256=13ff02777c1ace79fc650d9b2b0a16e4ce58e56f9da60a72eedb29f2a12a9ad2
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/testUtils.ts b/plugins/kotak-starrocks-logs-app/src/datasource/testUtils.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9988966a62aa6f00420b40efe888d101a497b3e1
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/testUtils.ts
@@ -0,0 +1,15 @@
+import { resolveConfig, resolveTenant } from '../config/config';
+import { BuildContext } from '../sql/builder';
+
+export type { BuildContext };
+
+/** A build context for tenant app_1 with one LIKE pattern, for tests. */
+export function resolvePatterns(view: string): BuildContext {
+  const { config } = resolveConfig({ tenants: { app_1: { patterns: [{ name: 'Timeout', like: '%timed out%' }] } } });
+  return {
+    tenant: resolveTenant(config, view),
+    columns: ['observed_timestamp', 'message', 'level', 'k8s_service_name', 'k8s_namespace_name', 'k8s_pod_uid'],
+    labels: ['k8s_service_name', 'k8s_namespace_name'],
+    fields: ['k8s_pod_uid'],
+  };
+}
````

### 34/44 `src/datasource/windowedSearch.test.ts` (modified)

unit tests: windowed search (updated)

PATCH-BLOCK 34/44 src/datasource/windowedSearch.test.ts old=84e6b6e295b22e4535730e476e8b1554248a6fcb new=69eae448431e9fbcb68a7be8073c7dd56f1b6e97 sha256=13974a4ee7f4f86c42bf312464ecf9fa9d43eef90f71d7d5daf802e9a8dc7bac
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/windowedSearch.test.ts b/plugins/kotak-starrocks-logs-app/src/datasource/windowedSearch.test.ts
index 84e6b6e295b22e4535730e476e8b1554248a6fcb..69eae448431e9fbcb68a7be8073c7dd56f1b6e97 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/windowedSearch.test.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/windowedSearch.test.ts
@@ -3,6 +3,7 @@ import { Observable, of, toArray, firstValueFrom, Subject } from 'rxjs';
 import { DataQueryResponse, LoadingState, TimeRange, dateTime, toDataFrame } from '@grafana/data';
 
 import { runLogsQuery, searchProgressOf, LogsAppQuery } from './StarRocksLogsDataSource';
+import { clearQueryCache } from './queryCache';
 import { emptySpec } from '../state/types';
 
 // only the data source's own code is under test: no Grafana runtime, no Scenes
@@ -10,6 +11,7 @@ jest.mock('@grafana/scenes', () => ({ RuntimeDataSource: class {} }));
 
 const runSql = jest.fn();
 jest.mock('./timeZone', () => ({ ensureSessionZone: async () => undefined }));
+jest.mock('./ContextScope', () => ({ ContextScope: () => null }));
 jest.mock('./api', () => ({
   runSql: (...args: unknown[]) => runSql(...args),
   fetchColumns: async () => ['observed_timestamp', 'message', 'level', 'k8s_service_name', 'k8s_pod_uid'],
@@ -57,7 +59,10 @@ function textQuery(limit: number): LogsAppQuery {
   return { refId: 'A', kind: 'logs', spec, params: { limit, sort: 'desc' } };
 }
 
-beforeEach(() => runSql.mockReset());
+beforeEach(() => {
+  runSql.mockReset();
+  clearQueryCache();
+});
 
 describe('windowed text search in the data source', () => {
   it('stops at the line limit: the newest window is enough when it has the lines', async () => {
````

### 35/44 `src/sql/builder.test.ts` (modified)

unit tests: SQL (updated)

PATCH-BLOCK 35/44 src/sql/builder.test.ts old=f64c52a6f53025f2bb31003b92d42bdac0115e69 new=d88ebc00e611af5aec106328ba8f077ab69f01f8 sha256=5c4610e72c2766850164dc44d855894764630fa8e19442fd94ecac70dde44f44
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/sql/builder.test.ts b/plugins/kotak-starrocks-logs-app/src/sql/builder.test.ts
index f64c52a6f53025f2bb31003b92d42bdac0115e69..d88ebc00e611af5aec106328ba8f077ab69f01f8 100644
--- a/plugins/kotak-starrocks-logs-app/src/sql/builder.test.ts
+++ b/plugins/kotak-starrocks-logs-app/src/sql/builder.test.ts
@@ -100,11 +100,16 @@ describe('level expression', () => {
     expect(levelExpr(c.tenant)).toContain("ELSE 'unknown' END");
   });
 
-  it('extracts the level from the message with the default regexes for message tenants', () => {
-    const expr = levelExpr(ctx().tenant);
+  it('message tenants: the level column where the pipeline filled it, else the message (default regexes)', () => {
+    const c = ctx();
+    const expr = levelExpr(c.tenant, c);
+    expect(expr).toContain("CASE WHEN trim(`level`) != '' THEN lower(trim(`level`)) ELSE lower(coalesce(");
     expect(expr).toContain('regexp_extract(`message`');
-    expect(expr).toContain('FATAL|ERROR|WARN');
-    expect(expr).not.toContain('`level`');
+    expect(expr).toContain('FATAL|ERROR|ERRO|WARN');
+    // a view without the level column: message only
+    const noLevel = levelExpr(c.tenant, { columns: c.columns.filter((x) => x !== 'level') });
+    expect(noLevel).not.toContain('`level`');
+    expect(noLevel).toContain('regexp_extract(`message`');
   });
 });
 
````

### 36/44 `src/sql/builder.ts` (modified)

level from the column where filled, else the message, aggregated with WHERE + UNION ALL; hash sampling; top-N lines with the level computed on the returned rows; level filters split by source; Show context tie-break

PATCH-BLOCK 36/44 src/sql/builder.ts old=3e54f260f74d19355203bf89d9d86eec473f05ad new=15aa9b20459efbb62e6cfdcd1be258212496494d sha256=17acc1c428c97dfc629b34a9ec03218ab85dd80aac465b2a937855dfab3a9bba
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/sql/builder.ts b/plugins/kotak-starrocks-logs-app/src/sql/builder.ts
index 3e54f260f74d19355203bf89d9d86eec473f05ad..15aa9b20459efbb62e6cfdcd1be258212496494d 100644
--- a/plugins/kotak-starrocks-logs-app/src/sql/builder.ts
+++ b/plugins/kotak-starrocks-logs-app/src/sql/builder.ts
@@ -189,21 +189,133 @@ export function pickBucketSeconds(rangeMs: number, maxPoints = 120): number {
   return BUCKETS.find((b) => b >= ideal) ?? Math.ceil(ideal / 86400) * 86400;
 }
 
-/** Raw (not normalised) level value, lower case. */
-export function levelRawExpr(tenant: ResolvedTenant): string {
-  if (tenant.level.source === 'column') {
-    return `lower(trim(${quoteIdent(LEVEL_COLUMN)}))`;
-  }
+/** Normalises a lower-case raw level value: error | warn | info | debug | unknown. */
+function normaliseLevel(raw: string): string {
+  const whens = Object.entries(LEVEL_ALIASES)
+    .flatMap(([level, aliases]) => aliases.map((a) => `WHEN '${a}' THEN '${level}'`))
+    .join(' ');
+  return `(CASE ${raw} ${whens} ELSE 'unknown' END)`;
+}
+
+const LEVEL_COL = quoteIdent(LEVEL_COLUMN);
+
+/** Raw level from the `level` column, lower case. */
+function columnLevelRaw(): string {
+  return `lower(trim(${LEVEL_COL}))`;
+}
+
+/** Raw level read from the message with the tenant's regexes (first match wins), lower case. */
+function messageLevelRaw(tenant: ResolvedTenant): string {
   const tries = tenant.level.regex.map((re) => `nullif(regexp_extract(${M}, ${lit(re)}, 1), '')`);
   return `lower(coalesce(${[...tries, "''"].join(', ')}))`;
 }
 
+/** The `level` column is filled on this row. */
+export function levelFilledCond(): string {
+  return `trim(${LEVEL_COL}) != ''`;
+}
+
+/** The `level` column is empty (or NULL) on this row: the level has to come from the message. */
+export function levelEmptyCond(): string {
+  return `(${LEVEL_COL} IS NULL OR trim(${LEVEL_COL}) = '')`;
+}
+
+/** Whether a "message" tenant's view also has the level column (then filled rows use it). */
+function hasLevelColumn(ctx?: Pick<BuildContext, 'columns'>): boolean {
+  return ctx === undefined || ctx.columns.includes(LEVEL_COLUMN);
+}
+
+/**
+ * Raw (not normalised) level value, lower case. "column" tenants read the level column. "message" tenants read
+ * the level column where the pipeline filled it, and the message (tenant regexes) where it is empty, so they keep
+ * working, faster, once the pipeline starts filling it. In aggregations use levelSplit instead: StarRocks
+ * evaluates both CASE branches on every row (measured on UAT: 17.1 s vs 6.0 s with a WHERE split).
+ */
+export function levelRawExpr(tenant: ResolvedTenant, ctx?: Pick<BuildContext, 'columns'>): string {
+  if (tenant.level.source === 'column') {
+    return columnLevelRaw();
+  }
+  if (!hasLevelColumn(ctx)) {
+    return messageLevelRaw(tenant);
+  }
+  return `(CASE WHEN ${levelFilledCond()} THEN ${columnLevelRaw()} ELSE ${messageLevelRaw(tenant)} END)`;
+}
+
 /** Normalised level: error | warn | info | debug | unknown. A simple CASE evaluates the raw value once. */
-export function levelExpr(tenant: ResolvedTenant): string {
-  const whens = Object.entries(LEVEL_ALIASES)
-    .flatMap(([level, aliases]) => aliases.map((a) => `WHEN '${a}' THEN '${level}'`))
-    .join(' ');
-  return `(CASE ${levelRawExpr(tenant)} ${whens} ELSE 'unknown' END)`;
+export function levelExpr(tenant: ResolvedTenant, ctx?: Pick<BuildContext, 'columns'>): string {
+  return normaliseLevel(levelRawExpr(tenant, ctx));
+}
+
+/**
+ * For aggregations by level: one SELECT per way of getting the level, each with its own row condition, to be
+ * joined with UNION ALL (the regexp then runs only on rows without a filled level column).
+ */
+export function levelSplit(tenant: ResolvedTenant, ctx: BuildContext): Array<{ expr: string; cond?: string }> {
+  if (tenant.level.source === 'column') {
+    return [{ expr: normaliseLevel(columnLevelRaw()) }];
+  }
+  if (!hasLevelColumn(ctx)) {
+    return [{ expr: normaliseLevel(messageLevelRaw(tenant)) }];
+  }
+  return [
+    { expr: normaliseLevel(columnLevelRaw()), cond: levelFilledCond() },
+    { expr: normaliseLevel(messageLevelRaw(tenant)), cond: levelEmptyCond() },
+  ];
+}
+
+/** Column used to spread a hash sample evenly over pods and time. */
+function sampleKey(ctx: BuildContext): string {
+  const pod = ['k8s_pod_uid', 'k8s_pod_name'].find((c) => ctx.columns.includes(c));
+  return pod ? `${quoteIdent(pod)}, ${T}` : T;
+}
+
+/**
+ * Keeps about 1 in n rows, spread evenly (hash of pod and exact time; sampling by time alone is biased because
+ * lines arrive in bursts: 12.9 % kept instead of 10 % on UAT). Counts are multiplied by n.
+ */
+export function sampleCond(ctx: BuildContext, n: number): string {
+  return `MOD(ABS(murmur_hash3_32(${sampleKey(ctx)})), ${Math.max(1, Math.floor(n))}) = 0`;
+}
+
+/**
+ * GROUP BY bucket (and grouping columns) and level, with the level split (levelSplit) and optional sampling.
+ * `select` gives the grouping columns other than the level (already aliased), `groupBy` their aliases.
+ */
+function countByLevel(
+  spec: QuerySpec,
+  ctx: BuildContext,
+  opts: { select: string[]; groupBy: string[]; levelAlias: string; withLevel: boolean; sample?: number }
+): string {
+  const n = opts.sample && opts.sample > 1 ? Math.floor(opts.sample) : 1;
+  const sample = n > 1 ? [sampleCond(ctx, n)] : [];
+  const count = n > 1 ? `COUNT(*) * ${n}` : 'COUNT(*)';
+  // split by level source when levels are shown or filtered: each branch reads the level one way only
+  const parts: Array<{ out: string; levelBy?: string; cond?: string }> =
+    opts.withLevel || activeLevels(spec).length > 0
+      ? levelSplit(ctx.tenant, ctx).map((p) => ({
+          out: opts.withLevel ? p.expr : `'all'`,
+          levelBy: p.expr,
+          cond: p.cond,
+        }))
+      : [{ out: `'all'` }];
+  const groupBy = [...opts.groupBy, opts.levelAlias].join(', ');
+  const selects = parts.map((p) =>
+    [
+      `SELECT ${[...opts.select, `${p.out} AS ${opts.levelAlias}`, `${count} AS c`].join(', ')}`,
+      from(spec.view),
+      `WHERE ${whereClause(spec, ctx, { before: [...(p.cond ? [p.cond] : []), ...sample], levelBy: p.levelBy })}`,
+      `GROUP BY ${groupBy}`,
+    ].join('\n')
+  );
+  if (selects.length === 1) {
+    return `${selects[0]}\nORDER BY t`;
+  }
+  return [
+    `SELECT ${[...opts.groupBy, opts.levelAlias, 'SUM(c) AS c'].join(', ')}`,
+    `FROM (\n${selects.join('\nUNION ALL\n')}\n) u`,
+    `GROUP BY ${groupBy}`,
+    `ORDER BY t`,
+  ].join('\n');
 }
 
 function labelCond(key: string, filters: LabelFilter[]): string[] {
@@ -265,10 +377,20 @@ export function patternCond(p: PatternConfig): string {
 interface WhereOptions {
   skipPatterns?: boolean;
   extra?: string[];
+  /** cheap row conditions placed right after the time filter, before any regexp (level source, sample) */
+  before?: string[];
+  /** level expression for a level filter (a levelSplit branch); default levelExpr (CASE: column, else message) */
+  levelBy?: string;
+}
+
+/** The level filter of a spec, or none when no level or every level is selected. */
+function activeLevels(spec: QuerySpec): string[] {
+  const levels = spec.levels.filter((l) => (LEVELS as readonly string[]).includes(l));
+  return levels.length > 0 && levels.length < LEVELS.length ? levels : [];
 }
 
 export function whereClause(spec: QuerySpec, ctx: BuildContext, opts: WhereOptions = {}): string {
-  const conds: string[] = [timeFilter()];
+  const conds: string[] = [timeFilter(), ...(opts.before ?? [])];
   const byKey = new Map<string, LabelFilter[]>();
   for (const f of spec.filters) {
     if (!isIdentifier(f.key) || !ctx.columns.includes(f.key)) {
@@ -278,9 +400,9 @@ export function whereClause(spec: QuerySpec, ctx: BuildContext, opts: WhereOptio
   }
   byKey.forEach((fs, key) => conds.push(...labelCond(key, fs)));
 
-  const levels = spec.levels.filter((l) => (LEVELS as readonly string[]).includes(l));
-  if (levels.length > 0 && levels.length < LEVELS.length) {
-    conds.push(`${levelExpr(ctx.tenant)} IN (${levels.map(lit).join(', ')})`);
+  const levels = activeLevels(spec);
+  if (levels.length > 0) {
+    conds.push(`${opts.levelBy ?? levelExpr(ctx.tenant, ctx)} IN (${levels.map(lit).join(', ')})`);
   }
   spec.lineFilters.filter((f) => f.value !== '').forEach((f) => conds.push(lineFilterCond(f)));
   spec.fieldFilters.filter((f) => f.key !== '').forEach((f) => conds.push(fieldFilterCond(f)));
@@ -319,12 +441,58 @@ export function lineColumns(ctx: BuildContext): string[] {
   return Array.from(new Set([...ctx.labels, ...ctx.fields])).filter((c) => ctx.columns.includes(c) && !skip.has(c));
 }
 
+/** Columns read inside the top-N of a lines query: no expression, so nothing is computed for dropped rows. */
+function rawLineColumns(ctx: BuildContext, extra: string[] = []): string[] {
+  const level = ctx.columns.includes(LEVEL_COLUMN) || ctx.tenant.level.source === 'column' ? [LEVEL_COLUMN] : [];
+  return Array.from(new Set([TIME_COLUMN, MESSAGE_COLUMN, ...level, ...lineColumns(ctx), ...extra])).map(quoteIdent);
+}
+
+/**
+ * WHERE clauses of a lines query: one, or for a level filter on a "message" tenant with a level column, one per
+ * level source (column rows filtered on the column, the others on the message regexp; see levelSplit).
+ */
+function linesWheres(spec: QuerySpec, ctx: BuildContext, extra: string[]): string[] {
+  const split = levelSplit(ctx.tenant, ctx);
+  if (activeLevels(spec).length === 0 || split.length === 1) {
+    return [whereClause(spec, ctx, { extra })];
+  }
+  return split.map((p) => whereClause(spec, ctx, { before: [p.cond!], extra, levelBy: p.expr }));
+}
+
+/**
+ * Top-N lines: the newest (or oldest) rows on the raw columns, then the level (a regexp per line for "message"
+ * tenants), __ms and __ts computed on those rows only (UAT: 0.11 s for 1 h and 6 h, any range, with the time
+ * column untouched in WHERE and ORDER BY). Several WHERE branches are joined with UNION ALL, each with its own
+ * top-N, and cut to the top-N again.
+ */
+function topLines(
+  view: string,
+  ctx: BuildContext,
+  wheres: string[],
+  orderBy: string,
+  limit: number,
+  opts: { innerExtra?: string[]; outerExtra?: string[] } = {}
+): string {
+  const n = Math.max(1, Math.floor(limit));
+  const raw = rawLineColumns(ctx, opts.innerExtra).join(', ');
+  const branches = wheres.map((w) =>
+    [`SELECT ${raw}`, from(view), `WHERE ${w}`, `ORDER BY ${orderBy}`, `LIMIT ${n}`].join('\n')
+  );
+  const source = branches.length === 1 ? branches[0] : branches.map((b) => `(${b})`).join('\nUNION ALL\n');
+  return [
+    `SELECT ${[lineSelect(ctx), ...(opts.outerExtra ?? [])].join(', ')}`,
+    `FROM (\n${source}\n) l`,
+    `ORDER BY ${orderBy}`,
+    `LIMIT ${n}`,
+  ].join('\n');
+}
+
 function lineSelect(ctx: BuildContext): string {
   return [
     `${timeMsExpr(T)} AS __ms`,
     `CAST(${T} AS VARCHAR) AS __ts`,
     M,
-    `${levelExpr(ctx.tenant)} AS detected_level`,
+    `${levelExpr(ctx.tenant, ctx)} AS detected_level`,
     ...lineColumns(ctx).map(quoteIdent),
   ].join(', ');
 }
@@ -350,22 +518,25 @@ export function labelValuesQuery(spec: QuerySpec, ctx: BuildContext, key: string
   ].join('\n');
 }
 
-/** Service grid: counts per bucket, label value and level, all values in one scan. */
+/**
+ * Service grid: counts per bucket, label value and level, all values in one scan (two with a level split).
+ * `sample` keeps about 1 in n rows and multiplies the counts (for a level split from the message).
+ */
 export function serviceVolumeQuery(
   spec: QuerySpec,
   ctx: BuildContext,
   label: string,
   bucket: number,
-  withLevel = true
+  withLevel = true,
+  sample?: number
 ): string {
-  const lvl = withLevel ? levelExpr(ctx.tenant) : `'all'`;
-  return [
-    `SELECT ${bucketExpr(bucket)} AS t, ${quoteIdent(label)} AS v, ${lvl} AS lvl, COUNT(*) AS c`,
-    from(spec.view),
-    `WHERE ${whereClause(spec, ctx)}`,
-    `GROUP BY t, v, lvl`,
-    `ORDER BY t`,
-  ].join('\n');
+  return countByLevel(spec, ctx, {
+    select: [`${bucketExpr(bucket)} AS t`, `${quoteIdent(label)} AS v`],
+    groupBy: ['t', 'v'],
+    levelAlias: 'lvl',
+    withLevel,
+    sample,
+  });
 }
 
 /** Newest lines for each of the given label values, as one UNION ALL of top-N queries. */
@@ -378,14 +549,12 @@ export function serviceSamplesQuery(
 ): string {
   const col = quoteIdent(label);
   return values
-    .map((v) =>
-      [
-        `(SELECT ${lineSelect(ctx)}, ${col} AS __value`,
-        from(spec.view),
-        `WHERE ${whereClause(spec, ctx, { extra: [`${col} = ${lit(v)}`] })}`,
-        `ORDER BY ${T} DESC`,
-        `LIMIT ${Math.max(1, Math.floor(perValue))})`,
-      ].join('\n')
+    .map(
+      (v) =>
+        `(${topLines(spec.view, ctx, linesWheres(spec, ctx, [`${col} = ${lit(v)}`]), `${T} DESC`, perValue, {
+          innerExtra: [label],
+          outerExtra: [`${col} AS __value`],
+        })})`
     )
     .join('\nUNION ALL\n');
 }
@@ -398,25 +567,27 @@ export function logsQuery(
   bounds?: { fromMs: number; toMs: number }
 ): string {
   const extra = bounds ? preciseTimeBounds(bounds.fromMs, bounds.toMs) : [];
-  return [
-    `SELECT ${lineSelect(ctx)}`,
-    from(spec.view),
-    `WHERE ${whereClause(spec, ctx, { extra })}`,
-    `ORDER BY ${T} ${sort === 'asc' ? 'ASC' : 'DESC'}`,
-    `LIMIT ${Math.max(1, Math.floor(limit))}`,
-  ].join('\n');
+  return topLines(spec.view, ctx, linesWheres(spec, ctx, extra), `${T} ${sort === 'asc' ? 'ASC' : 'DESC'}`, limit);
 }
 
-/** Log volume by level for the Logs tab histogram ('all' when the level split is skipped). */
-export function volumeQuery(spec: QuerySpec, ctx: BuildContext, bucket: number, withLevel = true): string {
-  const lvl = withLevel ? levelExpr(ctx.tenant) : `'all'`;
-  return [
-    `SELECT ${bucketExpr(bucket)} AS t, ${lvl} AS g, COUNT(*) AS c`,
-    from(spec.view),
-    `WHERE ${whereClause(spec, ctx)}`,
-    `GROUP BY t, g`,
-    `ORDER BY t`,
-  ].join('\n');
+/**
+ * Log volume by level for the Logs tab histogram ('all' when the level split is skipped). `sample` keeps about 1
+ * in n rows and multiplies the counts.
+ */
+export function volumeQuery(
+  spec: QuerySpec,
+  ctx: BuildContext,
+  bucket: number,
+  withLevel = true,
+  sample?: number
+): string {
+  return countByLevel(spec, ctx, {
+    select: [`${bucketExpr(bucket)} AS t`],
+    groupBy: ['t'],
+    levelAlias: 'g',
+    withLevel,
+    sample,
+  });
 }
 
 /**
@@ -514,8 +685,10 @@ export function oldestInRangeQuery(view: string, fromMs: number, toMs: number):
 }
 
 /**
- * Lines of the same pod before (backward) or after (forward) a line, within one hour. Uses the exact
- * microsecond timestamp of the line. Timestamps are not unique, so lines with the same timestamp are left out.
+ * Lines of the same pod before (backward) or after (forward) a line, within one hour, nearest first. Uses the
+ * exact microsecond timestamp of the line. Timestamps are not unique: on UAT 42 % of lines share their exact
+ * microsecond with another line of the same pod (always a different message), so lines are ordered by time,
+ * then message, and the lines tied with the anchor are on the right side of it.
  */
 export function contextQuery(
   view: string,
@@ -524,18 +697,24 @@ export function contextQuery(
   pod: string,
   tsRaw: string,
   direction: 'backward' | 'forward',
-  limit: number
+  limit: number,
+  message?: string
 ): string {
   const ts = `CAST(${lit(tsRaw)} AS DATETIME)`;
-  const range =
-    direction === 'backward'
-      ? `${T} < ${ts} AND ${T} >= DATE_SUB(${ts}, INTERVAL 1 HOUR)`
-      : `${T} > ${ts} AND ${T} <= DATE_ADD(${ts}, INTERVAL 1 HOUR)`;
-  return [
-    `SELECT ${lineSelect(ctx)}`,
-    from(view),
-    `WHERE ${quoteIdent(podColumn)} = ${lit(pod)} AND ${range}`,
-    `ORDER BY ${T} ${direction === 'backward' ? 'DESC' : 'ASC'}`,
-    `LIMIT ${Math.max(1, Math.floor(limit))}`,
-  ].join('\n');
+  const back = direction === 'backward';
+  const cmp = back ? '<' : '>';
+  const position =
+    message === undefined
+      ? `${T} ${cmp} ${ts}`
+      : `(${T} ${cmp} ${ts} OR (${T} = ${ts} AND ${M} ${cmp} ${lit(message)}))`;
+  const bound = back ? `${T} >= DATE_SUB(${ts}, INTERVAL 1 HOUR)` : `${T} <= DATE_ADD(${ts}, INTERVAL 1 HOUR)`;
+  const dir = back ? 'DESC' : 'ASC';
+  return topLines(
+    view,
+    ctx,
+    [`${quoteIdent(podColumn)} = ${lit(pod)} AND ${position} AND ${bound}`],
+    `${T} ${dir}${message === undefined ? '' : `, ${M} ${dir}`}`,
+    limit,
+    { innerExtra: [podColumn] }
+  );
 }
````

### 37/44 `src/sql/levels.test.ts` (new file)

unit tests: level rules on UAT line shapes, split, sampling, top-N shape, ties

PATCH-BLOCK 37/44 src/sql/levels.test.ts old=none new=f098e794896c19ee88b0f5666598d80803c9c64f sha256=c359244f5c50c0c5ff0f5a5599e8216e7160cebba914b268b1653386ae6725c5
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/sql/levels.test.ts b/plugins/kotak-starrocks-logs-app/src/sql/levels.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f098e794896c19ee88b0f5666598d80803c9c64f
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/sql/levels.test.ts
@@ -0,0 +1,335 @@
+import { DEFAULT_MESSAGE_LEVEL_REGEX, LEVEL_ALIASES } from '../constants';
+import { resolveConfig, resolveTenant } from '../config/config';
+import { toJsRegex } from '../datasource/frames';
+import { emptySpec } from '../state/types';
+import {
+  BuildContext,
+  contextQuery,
+  levelEmptyCond,
+  logsQuery,
+  serviceSamplesQuery,
+  levelExpr,
+  levelFilledCond,
+  levelSplit,
+  sampleCond,
+  serviceVolumeQuery,
+  volumeQuery,
+  whereClause,
+} from './builder';
+
+const VIEW = 'vw_eks_app_logs_app_1961_observability';
+const COLUMNS = ['observed_timestamp', 'message', 'level', 'k8s_service_name', 'k8s_pod_name', 'k8s_pod_uid'];
+
+function ctx(source: 'message' | 'column', columns = COLUMNS): BuildContext {
+  const { config } = resolveConfig({ tenants: { app_1961_observability: { level: { source } } } });
+  return { tenant: resolveTenant(config, VIEW), columns, labels: ['k8s_service_name'], fields: ['k8s_pod_name'] };
+}
+
+/** What the SQL level expression computes for a line, in JavaScript: first matching rule, then the aliases. */
+function levelOf(message: string): string {
+  let raw = '';
+  for (const re of DEFAULT_MESSAGE_LEVEL_REGEX) {
+    const m = toJsRegex(re).exec(message);
+    if (m && m[1]) {
+      raw = m[1].toLowerCase();
+      break;
+    }
+  }
+  const hit = Object.entries(LEVEL_ALIASES).find(([, aliases]) => aliases.includes(raw));
+  return hit ? hit[0] : 'unknown';
+}
+
+describe('default message level rules (shapes measured on UAT observability)', () => {
+  it.each([
+    // proxy, nginx error log: 58 % of proxy lines, the level in lower-case brackets
+    ['2026/11/24 22:37:42 [info] 140700#0: *21193563 client 10.0.0.1 closed keepalive connection', 'info'],
+    ['2026/11/24 22:37:43 [warn] 140700#0: *733 a client request body is buffered to a temporary file', 'warn'],
+    ['2026/11/24 22:37:43 [error] 1#0: *9 upstream timed out', 'error'],
+    ['2026/11/24 22:37:43 [crit] 1#0: *9 something', 'error'],
+    ['2026/11/24 22:37:43 [notice] 1#0: signal process started', 'info'],
+    // proxy, access log: no level word; the HTTP status class
+    ['10.0.0.1 - - [24/Nov/2026:22:37:43 +0000] "POST /v1/logs HTTP/1.1" 200 0 "-" "OpenTelemetry Collector"', 'info'],
+    ['10.0.0.1 - - [24/Nov/2026:22:37:43 +0000] "GET /status HTTP/2.0" 304 0 "-" "kong"', 'info'],
+    ['10.0.0.1 - - [24/Nov/2026:22:37:43 +0000] "GET /x HTTP/1.1" 404 12 "-" "curl"', 'warn'],
+    ['10.0.0.1 - - [24/Nov/2026:22:37:43 +0000] "POST /v1/traces HTTP/1.1" 503 0 "-" "otel"', 'error'],
+    // grafana, distributor: logfmt
+    ['logger=ngalert.scheduler t=2026-11-24T22:39:44.08Z level=debug msg="Rule evaluated"', 'debug'],
+    ['ts=2026-11-24T22:39:44.2880Z caller=push.go:211 level=error user=x msg="detected an error"', 'error'],
+    ['level=warn ts=2026-11-24T22:39:44Z msg="slow request"', 'warn'],
+    // JSON and severity keys
+    ['{"level":"error","msg":"boom"}', 'error'],
+    ['{"severity": "WARNING", "message": "disk"}', 'warn'],
+    ['lvl=info msg=started', 'info'],
+    // vector, flink: upper-case words
+    [
+      '2026-11-24T22:39:44.085277Z DEBUG sink{component_kind="sink"}: hyper::client::pool: reuse idle connection',
+      'debug',
+    ],
+    ['2026-11-24 22:39:44,123 INFO  org.apache.flink.runtime.Something - started', 'info'],
+    // logrus text format
+    ['ERRO[0000] failed to sync', 'error'],
+    // otc-container: zap console encoder, the level between tabs
+    ['2026-11-24T22:39:44.085Z\terror\tgrpc/server.go:42\tfailed\t{"kind": "exporter"}', 'error'],
+    ['2026-11-24T22:39:44.085Z\tinfo\tservice.go:10\tEverything is ready.', 'info'],
+    // aws-cluster-autoscaler: glog
+    ['E1125 04:09:43.511       1 static_autoscaler.go:300] Failed to scale up', 'error'],
+    ['I1125 04:09:43.511       1 main.go:10] started', 'info'],
+    ['W1125 04:09:43.511       1 main.go:10] slow', 'warn'],
+  ])('%s → %s', (line, level) => {
+    expect(levelOf(line)).toBe(level);
+  });
+
+  it.each([
+    // stack-trace continuation lines carry no level
+    ['github.com/foo/bar.(*Server).Run(0xc000123)'],
+    ['\t/go/src/app/main.go:42 +0x1d'],
+    ['goroutine 1 [running]:'],
+    // lower-case words in free text are not levels
+    ['user asked for the info page and got an error message'],
+  ])('%s stays unknown', (line) => {
+    expect(levelOf(line)).toBe('unknown');
+  });
+
+  it('every default rule is valid RE2-compatible JavaScript with one capture group', () => {
+    const { errors } = resolveConfig({
+      tenants: { x: { level: { source: 'message', regex: DEFAULT_MESSAGE_LEVEL_REGEX } } },
+    });
+    expect(errors).toEqual([]);
+  });
+});
+
+describe('level split for aggregations (UNION ALL, not CASE)', () => {
+  it('column tenants: one branch from the column', () => {
+    const parts = levelSplit(ctx('column').tenant, ctx('column'));
+    expect(parts).toHaveLength(1);
+    expect(parts[0].expr).toContain('lower(trim(`level`))');
+    expect(parts[0].cond).toBeUndefined();
+  });
+
+  it('message tenants with a level column: filled rows from the column, the others from the message', () => {
+    const c = ctx('message');
+    const [col, msg] = levelSplit(c.tenant, c);
+    expect(col.cond).toBe(levelFilledCond());
+    expect(col.expr).not.toContain('regexp_extract');
+    expect(msg.cond).toBe(levelEmptyCond());
+    expect(msg.expr).toContain('regexp_extract(`message`');
+    expect(levelEmptyCond()).toBe("(`level` IS NULL OR trim(`level`) = '')");
+  });
+
+  it('message tenants without a level column: one branch from the message', () => {
+    const c = ctx(
+      'message',
+      COLUMNS.filter((x) => x !== 'level')
+    );
+    expect(levelSplit(c.tenant, c)).toHaveLength(1);
+    expect(levelExpr(c.tenant, c)).not.toContain('`level`');
+  });
+
+  it('volume query: two GROUP BYs joined with UNION ALL and summed', () => {
+    const c = ctx('message');
+    const sql = volumeQuery(emptySpec(VIEW), c, 300, true);
+    expect(sql.startsWith('SELECT t, g, SUM(c) AS c\nFROM (\nSELECT')).toBe(true);
+    expect(sql.match(/UNION ALL/g)).toHaveLength(1);
+    expect(sql).toContain(`AND ${levelFilledCond()}`);
+    expect(sql).toContain(`AND ${levelEmptyCond()}`);
+    expect(sql.endsWith(') u\nGROUP BY t, g\nORDER BY t')).toBe(true);
+    // every branch keeps the time filter (partition pruning)
+    expect(sql.match(/\$__timeFilter\(`observed_timestamp`\)/g)).toHaveLength(2);
+  });
+
+  it('service grid: the same split with the label column; no split for column tenants or without levels', () => {
+    const c = ctx('message');
+    const split = serviceVolumeQuery(emptySpec(VIEW), c, 'k8s_service_name', 300, true);
+    expect(split).toContain('SELECT t, v, lvl, SUM(c) AS c');
+    expect(split).toContain('GROUP BY t, v, lvl');
+    const column = serviceVolumeQuery(emptySpec(VIEW), ctx('column'), 'k8s_service_name', 300, true);
+    expect(column).not.toContain('UNION ALL');
+    const plain = serviceVolumeQuery(emptySpec(VIEW), c, 'k8s_service_name', 300, false);
+    expect(plain).not.toContain('UNION ALL');
+    expect(plain).toContain("'all' AS lvl");
+    expect(plain).not.toContain('regexp_extract');
+  });
+
+  it('a level filter on a message tenant uses the column-else-message expression', () => {
+    const c = ctx('message');
+    const w = whereClause({ ...emptySpec(VIEW), levels: ['error'] }, c);
+    expect(w).toContain(`CASE WHEN ${levelFilledCond()} THEN lower(trim(\`level\`)) ELSE`);
+    expect(w).toContain("IN ('error')");
+  });
+});
+
+describe('sampling (estimated level counts over long ranges)', () => {
+  it('hashes pod and exact time, keeps 1 in n, and multiplies the counts', () => {
+    const c = ctx('message');
+    expect(sampleCond(c, 10)).toBe('MOD(ABS(murmur_hash3_32(`k8s_pod_uid`, `observed_timestamp`)), 10) = 0');
+    const sql = volumeQuery(emptySpec(VIEW), c, 300, true, 10);
+    expect(sql.match(/murmur_hash3_32/g)).toHaveLength(2);
+    expect(sql).toContain('COUNT(*) * 10 AS c');
+    expect(sql).not.toMatch(/COUNT\(\*\) AS c/);
+  });
+
+  it('falls back to the pod name, then to time only', () => {
+    const noUid = ctx(
+      'message',
+      COLUMNS.filter((x) => x !== 'k8s_pod_uid')
+    );
+    expect(sampleCond(noUid, 10)).toContain('murmur_hash3_32(`k8s_pod_name`, `observed_timestamp`)');
+    const noPod = ctx('message', ['observed_timestamp', 'message', 'level']);
+    expect(sampleCond(noPod, 5)).toBe('MOD(ABS(murmur_hash3_32(`observed_timestamp`)), 5) = 0');
+  });
+
+  it('no sampling for n <= 1', () => {
+    const sql = volumeQuery(emptySpec(VIEW), ctx('column'), 300, true, 1);
+    expect(sql).not.toContain('murmur_hash3_32');
+    expect(sql).toContain('COUNT(*) AS c');
+  });
+});
+
+describe('show context tie-break (same pod, same microsecond)', () => {
+  const c = ctx('column');
+  const ts = '2026-11-24 22:37:43.157123';
+
+  it('backward: older lines, and same-microsecond lines whose message sorts before, nearest first', () => {
+    const sql = contextQuery(VIEW, c, 'k8s_pod_uid', 'u1', ts, 'backward', 100, 'b message');
+    expect(sql).toContain(
+      "(`observed_timestamp` < CAST('2026-11-24 22:37:43.157123' AS DATETIME) OR (`observed_timestamp` = CAST('2026-11-24 22:37:43.157123' AS DATETIME) AND `message` < 'b message'))"
+    );
+    expect(sql).toContain('ORDER BY `observed_timestamp` DESC, `message` DESC');
+    expect(sql).toContain('`observed_timestamp` >= DATE_SUB(');
+    expect(sql).toContain("`k8s_pod_uid` = 'u1'");
+  });
+
+  it('forward: newer lines, and same-microsecond lines whose message sorts after', () => {
+    const sql = contextQuery(VIEW, c, 'k8s_pod_uid', 'u1', ts, 'forward', 100, "it's");
+    expect(sql).toContain("AND `message` > 'it\\'s'))");
+    expect(sql).toContain('ORDER BY `observed_timestamp` ASC, `message` ASC');
+    expect(sql).toContain('`observed_timestamp` <= DATE_ADD(');
+  });
+
+  it('without a message: strict time comparison only', () => {
+    const sql = contextQuery(VIEW, c, 'k8s_pod_name', 'p', ts, 'backward', 10);
+    expect(sql).toContain("`observed_timestamp` < CAST('2026-11-24 22:37:43.157123' AS DATETIME) AND");
+    expect(sql).toContain('ORDER BY `observed_timestamp` DESC\n');
+  });
+
+  it('a message with $ cannot expand into a macro', () => {
+    const sql = contextQuery(VIEW, c, 'k8s_pod_uid', 'u1', ts, 'forward', 10, 'cost $__interval');
+    expect(sql).not.toContain('$__interval');
+    expect(sql).toContain("concat('cost ', '$', '__interval')");
+  });
+});
+
+describe('top-N lines: the level is computed on the returned rows only (UAT H.6)', () => {
+  /** inner (top-N on raw columns) and outer (expressions) parts of a lines query */
+  function parts(sql: string) {
+    const start = sql.indexOf('FROM (\n') + 'FROM ('.length;
+    const end = sql.lastIndexOf('\n) l\n');
+    return { outer: sql.slice(0, start) + sql.slice(end), inner: sql.slice(start, end).trim() };
+  }
+
+  it('logs: raw columns inside ORDER BY ... LIMIT, the level regexp and the times outside', () => {
+    const c = ctx('message');
+    const sql = logsQuery(emptySpec(VIEW), c, 1000, 'desc');
+    const { inner, outer } = parts(sql);
+    expect(inner).toContain(
+      'SELECT `observed_timestamp`, `message`, `level`, `k8s_service_name`, `k8s_pod_name`\nFROM `vw_eks_app_logs_app_1961_observability`'
+    );
+    expect(inner).toContain('ORDER BY `observed_timestamp` DESC\nLIMIT 1000');
+    expect(inner).not.toContain('regexp_extract');
+    expect(inner).not.toContain('UNIX_TIMESTAMP');
+    expect(outer).toContain('regexp_extract(`message`');
+    expect(outer).toContain('AS detected_level');
+    expect(outer).toContain('AS __ms');
+    expect(sql.endsWith(') l\nORDER BY `observed_timestamp` DESC\nLIMIT 1000')).toBe(true);
+    expect(sql).not.toContain('UNION ALL');
+  });
+
+  it('a level filter on a message tenant: one top-N per level source, no CASE in WHERE', () => {
+    const c = ctx('message');
+    const sql = logsQuery({ ...emptySpec(VIEW), levels: ['error'] }, c, 100, 'asc');
+    const branches = parts(sql).inner.split('\nUNION ALL\n');
+    expect(branches).toHaveLength(2);
+    const [col, msg] = branches;
+    // the level source right after the time filter, before the level filter
+    expect(col).toContain(`WHERE $__timeFilter(\`observed_timestamp\`)\n  AND ${levelFilledCond()}\n  AND (CASE lower`);
+    expect(col).not.toContain('regexp_extract');
+    expect(col).toMatch(/lower\(trim\(`level`\)\).*IN \('error'\)/s);
+    expect(msg).toContain(
+      `WHERE $__timeFilter(\`observed_timestamp\`)\n  AND ${levelEmptyCond()}\n  AND (CASE lower(coalesce(`
+    );
+    expect(msg).toContain('regexp_extract(`message`');
+    for (const b of branches) {
+      expect(b).toMatch(/^\(SELECT /);
+      expect(b).toContain('ORDER BY `observed_timestamp` ASC\nLIMIT 100)');
+      expect(b).not.toContain('CASE WHEN');
+    }
+    expect(sql.endsWith(') l\nORDER BY `observed_timestamp` ASC\nLIMIT 100')).toBe(true);
+  });
+
+  it('column tenants and message tenants without a level column: one top-N even with a level filter', () => {
+    const levels = { ...emptySpec(VIEW), levels: ['warn'] };
+    expect(logsQuery(levels, ctx('column'), 10, 'desc')).not.toContain('UNION ALL');
+    const noLevel = ctx(
+      'message',
+      COLUMNS.filter((x) => x !== 'level')
+    );
+    const sql = logsQuery(levels, noLevel, 10, 'desc');
+    expect(sql).not.toContain('UNION ALL');
+    expect(parts(sql).inner).not.toContain('`level`');
+  });
+
+  it('service samples: one top-N per value, the value column read inside and returned as __value', () => {
+    const c = ctx('message');
+    const sql = serviceSamplesQuery(emptySpec(VIEW), c, 'k8s_service_name', ['a', 'b'], 10);
+    const values = sql.split(/\n\) l\nORDER BY `observed_timestamp` DESC\nLIMIT 10\)\nUNION ALL\n/);
+    expect(values).toHaveLength(2);
+    expect(sql).toContain("`k8s_service_name` = 'a'");
+    expect(sql).toContain("`k8s_service_name` = 'b'");
+    expect(sql.match(/`k8s_service_name` AS __value/g)).toHaveLength(2);
+    expect(sql.match(/LIMIT 10/g)).toHaveLength(4);
+  });
+
+  it('show context: the pod column is read inside, the level computed outside', () => {
+    const sql = contextQuery(
+      VIEW,
+      ctx('message'),
+      'k8s_pod_uid',
+      'u1',
+      '2026-11-24 22:37:43.157123',
+      'backward',
+      50,
+      'm'
+    );
+    const { inner, outer } = parts(sql);
+    expect(inner).toContain('`k8s_pod_uid`');
+    expect(inner).not.toContain('regexp_extract');
+    expect(outer).toContain('regexp_extract');
+    expect(sql.endsWith(') l\nORDER BY `observed_timestamp` DESC, `message` DESC\nLIMIT 50')).toBe(true);
+  });
+});
+
+describe('aggregations with a level filter (UAT H.5)', () => {
+  it('a level filter without the level split: still split by level source, each branch filtering its own way', () => {
+    const c = ctx('message');
+    const sql = volumeQuery({ ...emptySpec(VIEW), levels: ['error', 'warn'] }, c, 300, false);
+    const branches = sql.split('\nUNION ALL\n');
+    expect(branches).toHaveLength(2);
+    expect(branches[0]).toContain("'all' AS g");
+    expect(branches[0]).not.toContain('regexp_extract');
+    expect(branches[1]).toContain('regexp_extract(`message`');
+    expect(sql).not.toContain('CASE WHEN');
+  });
+
+  it('with the level split, the filter uses the branch expression too', () => {
+    const c = ctx('message');
+    const sql = serviceVolumeQuery({ ...emptySpec(VIEW), levels: ['error'] }, c, 'k8s_service_name', 300, true);
+    expect(sql).not.toContain('CASE WHEN');
+    expect(sql.match(/IN \('error'\)/g)).toHaveLength(2);
+  });
+
+  it('no level filter and no split: one plain GROUP BY', () => {
+    const sql = volumeQuery(emptySpec(VIEW), ctx('message'), 300, false);
+    expect(sql).not.toContain('UNION ALL');
+    expect(sql).not.toContain('regexp_extract');
+  });
+});
````

### 38/44 `src/state/storage.more.test.ts` (new file)

unit tests: browser storage

PATCH-BLOCK 38/44 src/state/storage.more.test.ts old=none new=2eab383532a14f4490bef6bc94b512b37dade8e5 sha256=747d5f33aced91a9589b2844f79bb46c11fe1963beb1697b984aa7378377807a
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/state/storage.more.test.ts b/plugins/kotak-starrocks-logs-app/src/state/storage.more.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2eab383532a14f4490bef6bc94b512b37dade8e5
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/state/storage.more.test.ts
@@ -0,0 +1,48 @@
+import {
+  getOldestCache,
+  getTimeModeCache,
+  getVolumeVisible,
+  setOldestCache,
+  setTimeModeCache,
+  setVolumeVisible,
+} from './storage';
+
+beforeEach(() => window.localStorage.clear());
+
+describe('per-browser caches and settings', () => {
+  it('oldest log per data source and view; invalid stored values are ignored', () => {
+    setOldestCache('ds', 'v', { oldestMs: 5, checkedAt: 9 });
+    expect(getOldestCache('ds', 'v')).toEqual({ oldestMs: 5, checkedAt: 9 });
+    expect(getOldestCache('ds', 'other')).toBeUndefined();
+    window.localStorage.setItem(
+      'kotak-starrocks-logs-app:oldest:ds:bad',
+      JSON.stringify({ oldestMs: 'x', checkedAt: 1 })
+    );
+    expect(getOldestCache('ds', 'bad')).toBeUndefined();
+    setOldestCache('ds', 'empty', { oldestMs: null, checkedAt: 1 });
+    expect(getOldestCache('ds', 'empty')?.oldestMs).toBeNull();
+  });
+
+  it('time column kind per view; unknown and malformed entries are not used', () => {
+    setTimeModeCache('ds', 'v', { mode: { kind: 'naive', offsetMinutes: 330 }, checkedAt: 1 });
+    expect(getTimeModeCache('ds', 'v')?.mode).toEqual({ kind: 'naive', offsetMinutes: 330 });
+    window.localStorage.setItem(
+      'kotak-starrocks-logs-app:tz:ds:u',
+      JSON.stringify({ mode: { kind: 'unknown' }, checkedAt: 1 })
+    );
+    expect(getTimeModeCache('ds', 'u')).toBeUndefined();
+    window.localStorage.setItem(
+      'kotak-starrocks-logs-app:tz:ds:n',
+      JSON.stringify({ mode: { kind: 'naive' }, checkedAt: 1 })
+    );
+    expect(getTimeModeCache('ds', 'n')).toBeUndefined();
+  });
+
+  it('the volume chart is shown unless hidden', () => {
+    expect(getVolumeVisible()).toBe(true);
+    setVolumeVisible(false);
+    expect(getVolumeVisible()).toBe(false);
+    setVolumeVisible(true);
+    expect(getVolumeVisible()).toBe(true);
+  });
+});
````

### 39/44 `src/state/storage.ts` (modified)

Volume switch remembered per browser

PATCH-BLOCK 39/44 src/state/storage.ts old=0f5b8956c900c861ff8f5ee36f8a86c5b2e75cdb new=7eed603ace3f87ec0c3febed4f2626ac1630cd1a sha256=fe6f8a880fb51b54669c4da268e2cd09b8e41c80d52478da80e09f8524b845e8
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/state/storage.ts b/plugins/kotak-starrocks-logs-app/src/state/storage.ts
index 0f5b8956c900c861ff8f5ee36f8a86c5b2e75cdb..7eed603ace3f87ec0c3febed4f2626ac1630cd1a 100644
--- a/plugins/kotak-starrocks-logs-app/src/state/storage.ts
+++ b/plugins/kotak-starrocks-logs-app/src/state/storage.ts
@@ -91,3 +91,12 @@ export function getTimeModeCache(ds: string, view: string): TimeModeCache | unde
 export function setTimeModeCache(ds: string, view: string, value: TimeModeCache) {
   write(`tz:${ds}:${view}`, value);
 }
+
+/** Logs tab: volume chart shown (default) or hidden, per browser. */
+export function getVolumeVisible(): boolean {
+  return read<boolean>('volume', true) !== false;
+}
+
+export function setVolumeVisible(visible: boolean) {
+  write('volume', visible);
+}
````

### 40/44 `src/state/types.ts` (modified)

`sample` parameter of volume queries

PATCH-BLOCK 40/44 src/state/types.ts old=4bc0b1c48164a7a1835b086e22db9b7597ddb0c0 new=e67492fe71a0ec86ab01816452774b486c49ac92 sha256=b7b1af3451a1a928dc090c5f1429ed58611e5ae70f0f85815972960cc87c4960
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/state/types.ts b/plugins/kotak-starrocks-logs-app/src/state/types.ts
index 4bc0b1c48164a7a1835b086e22db9b7597ddb0c0..e67492fe71a0ec86ab01816452774b486c49ac92 100644
--- a/plugins/kotak-starrocks-logs-app/src/state/types.ts
+++ b/plugins/kotak-starrocks-logs-app/src/state/types.ts
@@ -62,6 +62,8 @@ export interface QueryParams {
   topN?: number;
   /** volume queries: split by level (false skips the message scan for message-derived levels) */
   withLevel?: boolean;
+  /** volume queries: keep about 1 in n rows (hash sample) and multiply the counts */
+  sample?: number;
 }
 
 export function emptySpec(view: string, datasource = ''): QuerySpec {
````

### 41/44 `src/state/url.more.test.ts` (new file)

unit tests: URL encoding

PATCH-BLOCK 41/44 src/state/url.more.test.ts old=none new=778bd72d4a69868d16069f97f3c164d809b1af73 sha256=91bb0a73cae325b8b4650c7c9852959f2d69a80c6528470bf0508584113d7345
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/state/url.more.test.ts b/plugins/kotak-starrocks-logs-app/src/state/url.more.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..778bd72d4a69868d16069f97f3c164d809b1af73
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/state/url.more.test.ts
@@ -0,0 +1,41 @@
+import {
+  asArray,
+  decodeAll,
+  decodeField,
+  decodeFilter,
+  decodeLine,
+  decodePattern,
+  encodeField,
+  encodeFilter,
+  encodeLine,
+  encodePattern,
+} from './url';
+
+describe('URL state encoding (shareable links)', () => {
+  it('round-trips every filter kind, including separators and unicode in values', () => {
+    const label = { key: 'k8s_service_name', op: '!=' as const, value: 'a|b c/ä' };
+    expect(decodeFilter(encodeFilter(label))).toEqual(label);
+    const line = { op: 'exclude' as const, value: 'x|y "z"', caseSensitive: true, regex: true };
+    expect(decodeLine(encodeLine(line))).toEqual(line);
+    const pattern = { name: 'Health | check', op: 'include' as const };
+    expect(decodePattern(encodePattern(pattern))).toEqual(pattern);
+    const field = { key: 'status', op: '=' as const, value: '5|00' };
+    expect(decodeField(encodeField(field))).toEqual(field);
+  });
+
+  it('rejects unknown operators and malformed values', () => {
+    expect(decodeFilter('k|>|1')).toBeUndefined();
+    expect(decodeFilter('only-key')).toBeUndefined();
+    expect(decodeLine('maybe|1|0|x')).toBeUndefined();
+    expect(decodePattern('both|x')).toBeUndefined();
+    expect(decodeField('k|~|v')).toBeUndefined();
+  });
+
+  it('reads single values, lists and empty values; drops undecodable entries', () => {
+    expect(asArray(undefined)).toEqual([]);
+    expect(asArray(null)).toEqual([]);
+    expect(asArray('a')).toEqual(['a']);
+    expect(asArray(['a', 'b'])).toEqual(['a', 'b']);
+    expect(decodeAll(['k|=|v', 'bad'], decodeFilter)).toEqual([{ key: 'k', op: '=', value: 'v' }]);
+  });
+});
````

### 42/44 `tests/e2e/drilldown.spec.ts` (modified)

browser tests (40), local test stack only; not run by the pipeline

PATCH-BLOCK 42/44 tests/e2e/drilldown.spec.ts old=7a3eb03347b03e93d0c90a1eb15bc43f8511bdab new=ebe4e0cbb83a59151ee4dcd53833e5a2749b308a sha256=c46445da9259fd432b5f9b42071819191f0adbb138daaba32828455c829daaae
````diff
diff --git a/plugins/kotak-starrocks-logs-app/tests/e2e/drilldown.spec.ts b/plugins/kotak-starrocks-logs-app/tests/e2e/drilldown.spec.ts
index 7a3eb03347b03e93d0c90a1eb15bc43f8511bdab..ebe4e0cbb83a59151ee4dcd53833e5a2749b308a 100644
--- a/plugins/kotak-starrocks-logs-app/tests/e2e/drilldown.spec.ts
+++ b/plugins/kotak-starrocks-logs-app/tests/e2e/drilldown.spec.ts
@@ -453,7 +453,8 @@ test.describe('as kmbl3e2e (two granted views)', () => {
     await page.screenshot({ path: `${SHOTS}/09-long-text-search.png` });
     await page.getByRole('button', { name: 'Load volume' }).click();
     await expect(page.getByTestId('volume-deferred')).toHaveCount(0);
-    await expect(page.getByText('Log volume', { exact: true })).toBeVisible();
+    // 6 hours of a tenant whose level comes from the message: estimated from a sample
+    await expect(page.getByTestId('volume-panel')).toContainText('Log volume (≈ estimated from 1 in 10 lines)');
     await expect(logsMain(page)).toContainText('upstream timed out');
   });
 
@@ -596,6 +597,147 @@ test.describe('as kmbl3e2e (two granted views)', () => {
   });
 });
 
+test.describe('0.0.1: journey, loading, levels, context (laptop size)', () => {
+  test.use({ viewport: { width: 1440, height: 900 } });
+  test.beforeEach(async ({ page }) => {
+    await login(page, 'kmbl3e2e');
+  });
+
+  test('pickers stay where they are between the grid and the logs; Oldest log sits in the bar under them', async ({
+    page,
+  }) => {
+    await page.goto(appUrl({ view: OBS }));
+    await expect(page.getByTestId('service-row-apilog')).toBeVisible();
+    const pick = () => page.getByTestId('datasource-picker').boundingBox();
+    const onGrid = await pick();
+    const bar = page.getByTestId('page-bar');
+    await expect(bar.getByTestId('show-logs')).toBeVisible();
+    await expect(bar.getByTestId('oldest-log')).toContainText('Oldest log');
+    await page.getByTestId('show-logs-apilog').click();
+    await expect(bar.getByTestId('back-to-services')).toBeVisible();
+    const onLogs = await pick();
+    expect(Math.abs(onGrid!.x - onLogs!.x)).toBeLessThan(1);
+    expect(Math.abs(onGrid!.y - onLogs!.y)).toBeLessThan(1);
+    // the bar is below the pickers' row
+    const barBox = await bar.boundingBox();
+    expect(barBox!.y).toBeGreaterThan(onLogs!.y + onLogs!.height - 1);
+    await page.screenshot({ path: `${SHOTS}/20-header-1440.png` });
+  });
+
+  test('the Logs tab fits the window: only the lines scroll, not the page', async ({ page }) => {
+    await page.goto(appUrl({ view: OBS, filter: filter('k8s_service_name', '=', 'apilog') }));
+    await expect(logsMain(page).locator('tr').first()).toBeVisible();
+    await page.waitForTimeout(500);
+    const overflow = await page.evaluate(() => {
+      const el = document.scrollingElement ?? document.body;
+      return el.scrollHeight - el.clientHeight;
+    });
+    expect(overflow).toBeLessThanOrEqual(1);
+    const panel = await logsMain(page).boundingBox();
+    expect(panel!.height).toBeGreaterThan(250);
+    // hiding the volume gives the lines more room, and is remembered
+    await page.getByTestId('toggle-volume').click({ force: true });
+    await expect(page.getByTestId('volume-panel')).toHaveCount(0);
+    const bigger = await logsMain(page).boundingBox();
+    expect(bigger!.height).toBeGreaterThan(panel!.height + 100);
+    await page.reload();
+    await expect(logsMain(page).locator('tr').first()).toBeVisible();
+    await expect(page.getByTestId('volume-panel')).toHaveCount(0);
+    await page.getByTestId('toggle-volume').click({ force: true });
+    await expect(page.getByTestId('volume-panel')).toBeVisible();
+    await page.screenshot({ path: `${SHOTS}/21-logs-1440.png` });
+  });
+
+  test('while queries run: the refresh button spins (tooltip "Cancel all queries"), "Loading" with Cancel in the bar', async ({
+    page,
+  }) => {
+    await page.route('**/api/ds/query**', async (route) => {
+      if ((route.request().postData() ?? '').includes('GROUP BY t, v, lvl')) {
+        await new Promise((r) => setTimeout(r, 4000));
+      }
+      await route.continue();
+    });
+    await page.goto(appUrl({ view: OBS }));
+    await expect(page.getByTestId('grid-loading')).toBeVisible();
+    await expect(page.getByTestId('running-indicator')).toBeVisible();
+    await page.getByTestId('data-testid RefreshPicker run button').hover();
+    await expect(page.getByText('Cancel all queries')).toBeVisible();
+    await page.screenshot({ path: `${SHOTS}/22-running.png` });
+    await page.getByTestId('cancel-queries').click();
+    await expect(page.getByTestId('running-indicator')).toHaveCount(0);
+  });
+
+  test('going back to the grid shows it at once from the cache (no volume query again)', async ({ page }) => {
+    let volumeQueries = 0;
+    page.on('request', (r) => {
+      if (r.url().includes('/api/ds/query') && (r.postData() ?? '').includes('GROUP BY t, v, lvl')) {
+        volumeQueries++;
+      }
+    });
+    await page.goto(appUrl({ view: OBS }));
+    await expect(page.getByTestId('service-row-apilog')).toBeVisible();
+    expect(volumeQueries).toBe(1);
+    await page.getByTestId('show-logs-apilog').click();
+    await expect(logsMain(page).locator('tr').first()).toBeVisible();
+    await page.goBack();
+    await expect(page.getByTestId('service-row-apilog')).toBeVisible({ timeout: 3000 });
+    expect(volumeQueries).toBe(1);
+  });
+
+  test('levels read from the message: plain grid by default, split on request; estimated beyond an hour', async ({
+    page,
+  }) => {
+    await page.goto(appUrl({ view: OBS }));
+    const proxy = page.getByTestId('service-row-proxy');
+    await expect(proxy).toContainText('all');
+    await page.getByTestId('grid-levels').click({ force: true });
+    await expect(page).toHaveURL(/levelsplit=1/);
+    // access logs get a level from the HTTP status class
+    await expect(proxy).toContainText('info');
+    await expect(page.getByText(/estimated/)).toHaveCount(0);
+    await page.goto(appUrl({ view: OBS, levelsplit: '1', from: 'now-3h', to: 'now' }));
+    await expect(page.getByText('≈ estimated (1 in 10 lines)')).toBeVisible();
+    await expect(page.getByTestId('service-row-proxy')).toContainText('info');
+    await page.screenshot({ path: `${SHOTS}/23-grid-levels-sampled.png` });
+    // the Logs tab volume of one service: estimated over 3 hours, exact over 1 hour
+    await page.goto(appUrl({ view: OBS, filter: filter('k8s_service_name', '=', 'proxy'), from: 'now-3h', to: 'now' }));
+    await expect(page.getByText('Log volume (≈ estimated from 1 in 10 lines)')).toBeVisible();
+    await page.goto(appUrl({ view: OBS, filter: filter('k8s_service_name', '=', 'proxy'), from: 'now-1h', to: 'now' }));
+    await expect(page.getByText('Log volume', { exact: true })).toBeVisible();
+  });
+
+  test('the 24-hour limit is a notice under the header, not a toast over the time picker', async ({ page }) => {
+    await page.goto(appUrl({ view: OBS, from: 'now-7d', to: 'now' }));
+    const notice = page.getByTestId('range-capped');
+    await expect(notice).toContainText('Time range limited to 24 hours');
+    const time = await page.getByTestId('data-testid TimePicker Open Button').boundingBox();
+    const box = await notice.boundingBox();
+    expect(box!.y).toBeGreaterThan(time!.y + time!.height - 1);
+    await notice.getByLabel('Dismiss').click();
+    await expect(notice).toHaveCount(0);
+  });
+
+  test('show context: which pod is matched, and the pin keeps the line in view until unpinned', async ({ page }) => {
+    await page.goto(appUrl({ view: OBS, filter: filter('k8s_service_name', '=', 'apilog') }));
+    const row = logsMain(page).locator('tr').nth(10);
+    await row.hover();
+    await row.getByLabel('Show context').click();
+    const modal = page.getByRole('dialog');
+    await expect(modal.getByTestId('context-scope')).toContainText('k8s_pod_uid=');
+    await expect(modal.getByTestId('context-scope')).toContainText('k8s_service_name="apilog"');
+    const entry = modal.getByTestId('entry-row');
+    const position = () => entry.evaluate((el) => getComputedStyle(el).position);
+    await expect.poll(position).toBe('sticky');
+    await entry.hover();
+    await entry.getByLabel('Unpin line').last().click();
+    await expect.poll(position).toBe('static');
+    await entry.hover();
+    await entry.getByLabel('Pin line').last().click();
+    await expect.poll(position).toBe('sticky');
+    await page.screenshot({ path: `${SHOTS}/24-context-scope.png` });
+  });
+});
+
 test('another user sees only their own view', async ({ page }) => {
   await login(page, 'kmbl3other');
   await page.goto(APP);
````

### 43/44 `tests/smoke/iceberg.test.ts` (modified)

API tests on real Iceberg tables (16), local test stack only

PATCH-BLOCK 43/44 tests/smoke/iceberg.test.ts old=f328cfda30f650713df98666bd8b171a85c8046b new=953f44dcaaead78ce12522d85ce2e1af8d29cb68 sha256=8dd6f3daabe1991b37d95cc1cc60f3a477d0eea31f276530df6e23435bccb63a
````diff
diff --git a/plugins/kotak-starrocks-logs-app/tests/smoke/iceberg.test.ts b/plugins/kotak-starrocks-logs-app/tests/smoke/iceberg.test.ts
index f328cfda30f650713df98666bd8b171a85c8046b..953f44dcaaead78ce12522d85ce2e1af8d29cb68 100644
--- a/plugins/kotak-starrocks-logs-app/tests/smoke/iceberg.test.ts
+++ b/plugins/kotak-starrocks-logs-app/tests/smoke/iceberg.test.ts
@@ -145,6 +145,16 @@ run('real Iceberg tables on the UAT StarRocks version (session Asia/Kolkata)', (
         expect(found).toBe(Number(expected));
       });
 
+      it('level split and the 10 % hash sample work on Iceberg (murmur_hash3_32 over the instant)', async () => {
+        const { config } = resolveConfig({ tenants: { default: { level: { source: 'message' } } } });
+        const mc: BuildContext = { ...ctx(view), tenant: resolveTenant(config, view, DS.uid) };
+        const full = await q(volumeQuery(otel(view, { filters: [] }), mc, 3600, true), 'now-6h', 'now+1h');
+        const sampled = await q(volumeQuery(otel(view, { filters: [] }), mc, 3600, true, 10), 'now-6h', 'now+1h');
+        const total = (rows: Array<Record<string, unknown>>) => rows.reduce((a, r) => a + Number(r.c), 0);
+        expect(total(full)).toBeGreaterThan(1000);
+        expect(Math.abs(total(sampled) - total(full)) / total(full)).toBeLessThan(0.15);
+      });
+
       it('partition pruning: a one-hour line query reads one or two of the hourly partitions', async () => {
         const [newest] = await q(logsQuery(otel(view), ctx(view), 1, 'desc'), 'now-12h', 'now+12h');
         const to = Number(newest.__ms);
````

### 44/44 `tests/smoke/smoke.test.ts` (modified)

API tests (37), local test stack only; not run by the pipeline

PATCH-BLOCK 44/44 tests/smoke/smoke.test.ts old=1498392c2b8a41595a9def1301dd15138e5ffdae new=5b9361de416dbc20a43c812f21483f0b3663d5fa sha256=b37d5d2ba7a200b41ff0c01fb477206841a2e58fa41cb3fe492ba0f1f2115842
````diff
diff --git a/plugins/kotak-starrocks-logs-app/tests/smoke/smoke.test.ts b/plugins/kotak-starrocks-logs-app/tests/smoke/smoke.test.ts
index 1498392c2b8a41595a9def1301dd15138e5ffdae..5b9361de416dbc20a43c812f21483f0b3663d5fa 100644
--- a/plugins/kotak-starrocks-logs-app/tests/smoke/smoke.test.ts
+++ b/plugins/kotak-starrocks-logs-app/tests/smoke/smoke.test.ts
@@ -10,6 +10,7 @@ import {
   contextQuery,
   fieldBreakdownQuery,
   labelOverviewQuery,
+  levelExpr,
   logsQuery,
   oldestInRangeQuery,
   patternsQuery,
@@ -442,6 +443,99 @@ describe('cancelling', () => {
   }, 30_000);
 });
 
+describe('0.0.1 SQL on StarRocks (level split, sampling, HTTP status levels, context ties)', () => {
+  const c = ctx(OBS);
+  const sumBy = (rows: Array<Record<string, unknown>>, key: string) => {
+    const m: Record<string, number> = {};
+    rows.forEach((r) => (m[String(r[key])] = (m[String(r[key])] ?? 0) + Number(r.c)));
+    return m;
+  };
+
+  it('the UNION ALL level split counts exactly what one CASE expression counts', async () => {
+    const split = await e2e.sql(volumeQuery(spec(OBS), c, 3600, true), 'now-6h', 'now');
+    const caseSql = [
+      `SELECT (UNIX_TIMESTAMP(observed_timestamp) DIV 3600) * 3600 AS t, ${levelExpr(c.tenant, c)} AS g, COUNT(*) AS c`,
+      `FROM ${OBS} WHERE $__timeFilter(observed_timestamp) GROUP BY t, g`,
+    ].join('\n');
+    const single = await e2e.sql(caseSql, 'now-6h', 'now');
+    expect(sumBy(split, 'g')).toEqual(sumBy(single, 'g'));
+    expect(Object.keys(sumBy(split, 'g')).length).toBeGreaterThan(2);
+  });
+
+  it('a level column tenant (cmm) needs no split, and the split SQL on it gives the same counts', async () => {
+    const cc = ctx(CMM);
+    const column = await e2e.sql(volumeQuery(spec(CMM), cc, 3600, true), 'now-6h', 'now');
+    const asMessage = {
+      ...cc,
+      tenant: { ...cc.tenant, level: { source: 'message' as const, regex: c.tenant.level.regex } },
+    };
+    const split = await e2e.sql(volumeQuery(spec(CMM), asMessage, 3600, true), 'now-6h', 'now');
+    // every cmm row has a filled level column, so the message branch adds nothing
+    expect(sumBy(split, 'g')).toEqual(sumBy(column, 'g'));
+  });
+
+  it('a level filter on lines: one top-N per level source gives exactly the lines of one CASE query (mixed level column)', async () => {
+    // cmm read as a "message" tenant: most rows have the level column, about 1 in 13 has it empty
+    const cc = ctx(CMM);
+    const asMessage = {
+      ...cc,
+      tenant: { ...cc.tenant, level: { source: 'message' as const, regex: c.tenant.level.regex } },
+    };
+    const filtered = spec(CMM, { levels: ['error', 'unknown'] });
+    const key = (r: Record<string, unknown>) => `${r.__ts}|${r.k8s_pod_uid}|${r.message}`;
+    const oneCase = (limit: number) =>
+      [
+        'SELECT CAST(observed_timestamp AS VARCHAR) AS __ts, k8s_pod_uid, message',
+        `FROM ${CMM} WHERE $__timeFilter(observed_timestamp)`,
+        `  AND ${levelExpr(asMessage.tenant, asMessage)} IN ('error', 'unknown')`,
+        `ORDER BY observed_timestamp DESC LIMIT ${limit}`,
+      ].join('\n');
+    // every matching line (the limit is above the match count)
+    const split = await e2e.sql(logsQuery(filtered, asMessage, 8000, 'desc'), 'now-6h', 'now');
+    const single = await e2e.sql(oneCase(8000), 'now-6h', 'now');
+    expect(split.length).toBeGreaterThan(1000);
+    expect(split.length).toBeLessThan(8000);
+    expect(split.map(key).sort()).toEqual(single.map(key).sort());
+    // both branches contribute: filled ERROR / fatal rows and empty-level rows
+    const levels = new Set(split.map((r) => r.detected_level));
+    expect(levels).toEqual(new Set(['error', 'unknown']));
+    // the top 50: the same newest times, in order
+    const top = await e2e.sql(logsQuery(filtered, asMessage, 50, 'desc'), 'now-6h', 'now');
+    const topCase = await e2e.sql(oneCase(50), 'now-6h', 'now');
+    expect(top.map((r) => r.__ts)).toEqual(topCase.map((r) => r.__ts));
+  });
+
+  it('the 10 % hash sample estimates the counts within 15 %', async () => {
+    const full = await e2e.sql(volumeQuery(spec(OBS), c, 3600, true), 'now-6h', 'now');
+    const sampled = await e2e.sql(volumeQuery(spec(OBS), c, 3600, true, 10), 'now-6h', 'now');
+    const total = (rows: Array<Record<string, unknown>>) => rows.reduce((a, r) => a + Number(r.c), 0);
+    expect(Math.abs(total(sampled) - total(full)) / total(full)).toBeLessThan(0.15);
+    sampled.forEach((r) => expect(Number(r.c) % 10).toBe(0));
+  });
+
+  it('proxy access logs get their level from the HTTP status class', async () => {
+    const proxy = spec(OBS, { filters: [{ key: 'k8s_service_name', op: '=', value: 'proxy' }] });
+    const levels = sumBy(await e2e.sql(volumeQuery(proxy, c, 3600, true), 'now-6h', 'now'), 'g');
+    expect(levels.info).toBeGreaterThan(0);
+    expect((levels.warn ?? 0) + (levels.error ?? 0)).toBeGreaterThan(0);
+    expect(levels.unknown ?? 0).toBeLessThan(0.05 * Object.values(levels).reduce((a, b) => a + b, 0));
+  });
+
+  it('show context: lines tied on the exact microsecond are ordered by message on the right side of the anchor', async () => {
+    const [b] = await e2e.sql(
+      `SELECT CAST(observed_timestamp AS VARCHAR) AS __ts, message FROM ${OBS} WHERE k8s_pod_name = 'tie-pod-0' AND message = 'tie line B'`
+    );
+    const ts = String(b.__ts);
+    const back = await e2e.sql(contextQuery(OBS, c, 'k8s_pod_name', 'tie-pod-0', ts, 'backward', 10, 'tie line B'));
+    expect(back.map((r) => r.message)).toEqual(['tie line A', 'tie before']);
+    const fwdFromA = await e2e.sql(contextQuery(OBS, c, 'k8s_pod_name', 'tie-pod-0', ts, 'forward', 10, 'tie line A'));
+    expect(fwdFromA.map((r) => r.message)).toEqual(['tie line B', 'tie after']);
+    // the old strict comparison loses the tied line
+    const strict = await e2e.sql(contextQuery(OBS, c, 'k8s_pod_name', 'tie-pod-0', ts, 'backward', 10));
+    expect(strict.map((r) => r.message)).toEqual(['tie before']);
+  });
+});
+
 describe('level column tenant (cmm)', () => {
   it('normalises Warning, fatal, notice and empty level values', async () => {
     const rows = await e2e.sql(volumeQuery(spec(CMM), ctx(CMM), 3600));
````
