# Logs Drilldown (StarRocks): upgrade 0.1.0 → 0.3.0 (self-contained, for the org PC)

## For the person giving this file to Claude

1. The file is about 230 KB (4,700 lines). Copy it as **raw text** (from a text editor or GitHub's "Raw"
   view), not from a rendered preview.
   The patch lines must stay exactly as they are. Don't send it as a chat message or an email body, because
   those wrap long lines. Paste it into a text editor, or attach it as a file.
2. On the org PC, save it as for example `~/plugin-poc/LOGS_APP_UPGRADE_0.3.0.md`.
3. Start Claude Code in the org plugin repo and say:
   *"Read ~/plugin-poc/LOGS_APP_UPGRADE_0.3.0.md and follow the instructions for the agent in it."*

The file holds both pending changes as one patch:
- 0.2.0: Data source drop-down next to View.
- 0.3.0:
  - the Logs Drilldown look;
  - Include / Remove;
  - a values drop-down;
  - infinite scroll;
  - the view selected automatically;
  - quick ranges up to 24 hours;
  - the name "Logs Drilldown (StarRocks)".

The patch has 41 per-file blocks and is checked by sha256. The only things left out are the 10 PNG screenshots
under `docs/screenshots/`, which are binary documentation images.

---

# Instructions for the agent

You are upgrading **`kotak-starrocks-logs-app`** from **0.1.0** (rolled out) to **0.3.0** in the org repos.
This PC cannot reach the GitHub repo, so this one file carries everything you need:
- these instructions;
- an extractor script;
- the patch, as 41 per-file blocks.

The patch is `git diff 60b0353 ad77cf6 -- plugins/kotak-starrocks-logs-app`, without the PNG screenshots.
It was tested upstream against Grafana 12.0.1-security-01, the unchanged `kotak-starrocks-datasource` and
StarRocks 4.0.10 with two databases. Results: 58 unit, 21 API and 28 browser end-to-end tests pass. The patch
also applies cleanly to an unmodified 0.1.0 folder and turns it into exactly the 0.3.0 folder.

Work step by step. Stop at every **CHECKPOINT** and wait for the user to reply "continue".

**How to read this file:**
- It is long; the patch blocks are at the end, under "Patch blocks".
- Read up to that heading.
- Do **not** read the patch blocks into your context, and never retype them. The extractor writes them to
  disk byte for byte.
- Open a single block only when you need it to resolve a conflict.

## What changes where (all inside `plugins/kotak-starrocks-logs-app/`)

| # | File | Change | What |
|---|---|---|---|
| 1 | `CHANGELOG.md` | modified | docs: 0.2.0 and 0.3.0 entries |
| 2 | `CLAUDE.md` | modified | agent notes: every query targets `QuerySpec.datasource` |
| 3 | `README.md` | modified | docs: feature table (header, Include, Add label, infinite scroll), `datasources` setting, test counts |
| 4 | `dev/e2e/provisioning/datasources/datasources.yaml` | modified | local test stack only: a second StarRocks data source |
| 5 | `dev/e2e/provisioning/plugins/kotak-starrocks-logs-app.yaml` | modified | local test stack only: generated provisioning with `datasources` |
| 6 | `dev/e2e/seed.py` | modified | local test stack only: second database, user `kmbl3db2only` |
| 7 | `dev/e2e/tenants/loki-datasources.yml` | modified | local test stack only: second StarRocks data source for the generator |
| 8 | `dev/e2e/tenants/tenants-overrides.yml` | modified | local test stack only: a `<datasourceUid>/<app_id>` tenant |
| 9 | `docs/DESIGN.md` | modified | docs: data sources per database, screens and URL state, infinite scroll |
| 10 | `docs/ORG_AGENT_PROMPT_2_DATASOURCE_PICKER.md` | new file | new doc: org prompt for 0.2.0 (superseded; kept for reference) |
| 11 | `docs/ORG_AGENT_PROMPT_3_UPGRADE_0.3.0.md` | new file | new doc: the same upgrade for people who can reach GitHub |
| 12 | `docs/ROLLOUT.md` | modified | docs: adding another StarRocks database, new name, UAT checks |
| 13 | `package-lock.json` | modified | version 0.3.0 (the two root entries only; no dependency changes) |
| 14 | `package.json` | modified | version 0.3.0 |
| 15 | `scripts/e2e.sh` | modified | local test stack only: generator run with `--pin-datasources` |
| 16 | `scripts/gen-tenants-from-loki.py` | modified | generator: finds every StarRocks data source per org; `--pin-datasources` |
| 17 | `src/README.md` | modified | name |
| 18 | `src/components/App.tsx` | modified | page title "Logs Drilldown (StarRocks)", no big page header |
| 19 | `src/components/AppConfig.tsx` | modified | configuration page: "Test: list my views" per data source; new keys in the help text |
| 20 | `src/components/FiltersBar.tsx` | modified | logs page: "Log levels" select, line search, filter chips |
| 21 | `src/components/LogsExploration.tsx` | modified | root screen: header (label filters left; data source, view, time, refresh right), data source picker, view auto-selection, "service" / Add label tabs, URL state and history |
| 22 | `src/components/LogsTabScene.tsx` | modified | Logs tab: Explore link uses the selected data source; panel title "Logs" |
| 23 | `src/components/ServiceSelectionScene.tsx` | modified | service grid: search dropdown, page size and pages, favourites, Include / Remove, Show logs, legend table |
| 24 | `src/components/api.ts` | modified | interface between screens (label filter variable, Include / Remove, display names) |
| 25 | `src/components/panels.tsx` | modified | logs panel with infinite scrolling; legend table option |
| 26 | `src/config/config.test.ts` | modified | unit tests: `datasources`, per-database tenants |
| 27 | `src/config/config.ts` | modified | `datasources` setting, `viewPrefixFor`, `<datasourceUid>/<app_id>` tenants |
| 28 | `src/constants.ts` | modified | app title, time picker quick ranges (5 minutes to 24 hours) |
| 29 | `src/datasource/StarRocksLogsDataSource.ts` | modified | queries go to the selected data source; logs pages with exact time bounds |
| 30 | `src/datasource/api.test.ts` | modified | unit tests: data source list and per-data-source calls |
| 31 | `src/datasource/api.ts` | modified | list the StarRocks data sources; every call takes the data source uid |
| 32 | `src/datasource/frames.test.ts` | modified | unit tests: stable line ids |
| 33 | `src/datasource/frames.ts` | modified | stable line ids (infinite scroll merges pages by id) |
| 34 | `src/plugin.json` | modified | plugin name "Logs Drilldown (StarRocks)" (id unchanged) |
| 35 | `src/sql/builder.test.ts` | modified | unit tests: exact time bounds |
| 36 | `src/sql/builder.ts` | modified | exact microsecond bounds for logs pages |
| 37 | `src/state/storage.test.ts` | new file | new: unit tests for storage.ts |
| 38 | `src/state/storage.ts` | new file | new: last data source / view and favourites (browser localStorage) |
| 39 | `src/state/types.ts` | modified | `QuerySpec.datasource` |
| 40 | `tests/e2e/drilldown.spec.ts` | modified | browser tests (28), local test stack only; not run by the pipeline |
| 41 | `tests/smoke/smoke.test.ts` | modified | API tests (21), local test stack only; not run by the pipeline |

**Not changed:**
- `plugins/kotak-starrocks-datasource/`;
- `pipelines/`;
- the repository root;
- the zip layout;
- npm dependencies (the lock file only changes its version lines);
- every 0.1.0 settings key.

Existing provisioning files, overrides and settings files keep working as they are.

## What the user will see in 0.3.0

| Area | Behaviour |
|---|---|
| Name | **Logs Drilldown (StarRocks)** on the Drilldown card, in the menu and in the breadcrumb. The plugin id is unchanged. |
| Header | Left: "Filter by label values" box. Pick a label, then an operator, then a value from a **drop-down of that label's values** in the time range. Right: **Data source** (one `kotak-starrocks-datasource` instance per StarRocks database), **View**, time range (quick ranges **5 minutes … 24 hours**) and refresh. On narrow windows the right group wraps under the filters. |
| Service grid | Only the "service" tab plus **+ Add label**, which adds closable tabs for other labels. "Search services" drop-down with line counts. "Showing N of M" with page size (10/20/50/100) and pages. Each row has ★ favourite, **Include** (adds the filter and the button turns into **Remove**) and Show logs. The legend table shows totals per level. "Show logs" above the grid opens the logs of the current filters. |
| Logs page | "Log levels" select next to the line search. **Infinite scroll**: scrolling to the end loads the next `lineLimit` lines, with no gaps or repeated lines. |
| View selection | A view the user can read is always selected: the URL's view, else the last view used in this browser, else the first. Fixes "Select a view / Opening view…" staying on screen. |
| Navigation | Browser Back/Forward works between grid, logs and tabs. Label filters are stored in the URL as `var-filters`. 0.1.0 links with `filter=` still open. |

**New optional settings (from 0.2.0), all optional:**
- `datasources`: allowlist and order for the Data source picker.
  - It takes `[uid, …]` or `[{uid, viewPrefix}, …]`.
  - When it is absent, the picker shows every `kotak-starrocks-datasource` instance in the org.
  - `datasourceUid` stays the default choice.
- `tenants` keys may also be `<datasourceUid>/<app_id>`, for settings that apply in one database only. Lookup
  goes field by field: `<datasourceUid>/<app_id>`, then `<app_id>`, then `default`.
- `scripts/gen-tenants-from-loki.py --pin-datasources` writes the org's StarRocks data sources as
  `datasources`.

## INPUTS (ask the user for any that are missing)

```
THIS_FILE            = <path where this .md file was saved>
ORG_PLUGIN_REPO      = <path of kotak-custom-grafana-plugins>   BASE_BRANCH = <branch that has app 0.1.0>
DEPLOY_CONFIG_REPO   = <path of obser-aws-deploy-config>        BASE_BRANCH = <branch with the 0.1.0 rollout>
HANDOFF_FILE         = <path of HANDOFF.md>
SECOND_DATABASE      = <name of another StarRocks database with vw_eks_app_logs_* views, or "none yet">
```

## Rules

1. Ask before every outward or irreversible action: push, PR, creating or running pipelines, publishing to the
   feed, `grafana-plugin-upload.yml`, `grafana-deploy.yml`, messages to other teams. The user runs pipelines
   and kubectl.
2. New branches only. Work in a detached worktree; push HEAD to the branch, and the user pulls. One PR per repo
   at the end.
3. Do not change the data source plugin, `pipelines/` or the repository root. The app's own files change only
   through this patch, plus the README edit in step 2.
4. No tokens, secrets or real user IDs in files or git (write `kmbl…`).
5. Do not invent values. Write unknown ones as `TODO(<owner>)` and list them as open items.
6. Log what was done and decided in `HANDOFF_FILE` (section "Logs Drilldown rollout"). Keep replies terse.

## Step 0: extract and check the patch

1. Create `/tmp/logs-app-upgrade/` and save the Python block under **Extractor** (below) as
   `/tmp/logs-app-upgrade/extract_logs_patch.py`, exactly as shown. On Windows use a temp folder and `python`
   instead of `python3`.
2. Run `python3 /tmp/logs-app-upgrade/extract_logs_patch.py <THIS_FILE> /tmp/logs-app-upgrade/patches`.
3. Expect `41 of 41 blocks, 0 bad`, and a whole-patch sha256 equal to the `WHOLE-PATCH` line under the
   extractor. The output is one file per block plus `logs-app-0.1.0-to-0.3.0.patch`, which is all blocks in
   order.
4. Any `BAD` block means the copy changed the text (wrapped lines, changed quotes, missing lines). Ask the user
   to copy the file again as raw text. Do not repair blocks by hand.

## Step 1: which of these files the org has changed since 0.1.0

1. In `ORG_PLUGIN_REPO`, on `BASE_BRANCH`, run
   `python3 /tmp/logs-app-upgrade/extract_logs_patch.py <THIS_FILE> /tmp/logs-app-upgrade/patches <ORG_PLUGIN_REPO>`.
2. Each line gives the file's state, from `git hash-object` compared with the 0.1.0 and 0.3.0 blob ids in the
   blocks:

   | State | Meaning |
   |---|---|
   | `as 0.1.0` | applies cleanly |
   | `as 0.3.0` | already there |
   | `CHANGED by the org` | needs a 3-way merge |
   | `missing` | the file is not in the repo |
   | `absent (new file)` | expected for the 2 new source files and the 2 new docs |

3. For each `CHANGED` or `missing` file, show `git log --oneline -- <file>` and summarise the org's change.
4. If the app is not at `plugins/kotak-starrocks-logs-app/` in this repo, stop and tell the user. The patch
   paths would need `git apply --directory=…`.
5. If **every** file shows `CHANGED`, the cause is probably line endings. Run
   `git ls-files --eol plugins/kotak-starrocks-logs-app | head`, report the result and wait.

**CHECKPOINT 1**: the user reviews the list.

## Step 2: apply the patch on a new branch

1. In `ORG_PLUGIN_REPO`, create a new branch `feature/starrocks-logs-0.3.0` from `BASE_BRANCH`, in a detached
   worktree as the rules say.
2. Run `git apply --3way --check /tmp/logs-app-upgrade/patches/logs-app-0.1.0-to-0.3.0.patch`, then the same
   command without `--check`.
   - For each of the 4 new files, git prints "does not exist in index" or "cannot read the current contents of
     '…'", sometimes followed by "Falling back to direct application". This is expected and harmless: the
     files are created anyway.
   - `as 0.1.0` files apply cleanly.
   - `CHANGED` files are merged 3-way. This needs the 0.1.0 version in the repo history: each block's `index`
     line and `old=` id name it, and `git cat-file -e <old>` checks it is there.
   - Conflicts: keep the org-side intent and the 0.3.0 behaviour. Show every resolution as a diff.
   - If the 0.1.0 blob is not in history, apply that file's block on its own with
     `git apply --3way /tmp/logs-app-upgrade/patches/NN-….patch`. If that fails, use `--reject` and resolve
     the `.rej` hunks by hand, reading only that block.
3. README: the sentence "Screenshots from the end-to-end run" links five new images that this file does not
   carry: `00-layout.png`, `00-quick-ranges.png`, `02c-include.png`, `02d-add-label.png` and
   `02e-values-dropdown.png`. Remove those five links and keep the others.
4. Check: run the extractor again with the repo argument. Every file must show `as 0.3.0`, except files the org
   had changed and `README.md` (step 3).
5. `git status`: only files under `plugins/kotak-starrocks-logs-app/` have changed.

**CHECKPOINT 2**: the user reviews `git status`, the check output and any conflict resolutions.

## Step 3: build locally

1. Run `scripts/build-plugin.sh plugins/kotak-starrocks-logs-app`. Expect 58 unit tests passing and
   `PASS package/kotak-starrocks-logs-app-0.3.0.zip`.
2. No new npm dependencies are needed (same mirror as 0.1.0).
3. `tests/e2e` and `tests/smoke` need the local Docker test stack (Grafana, StarRocks, mock IDAM). They are not
   part of the pipeline; don't run them here.

**CHECKPOINT 3**: report the results. Then the user runs the app pipeline; the data source pipeline is not
triggered because of its path filters. Publish `kotak-starrocks-logs-app` 0.3.0 to the feed only after
approval. Commit with a message that says what changed (0.2.0 data source picker plus 0.3.0, applied from
the self-contained upgrade file), and push only after approval.

## Step 4: deploy-config (UAT)

On a new branch from `BASE_BRANCH` of `DEPLOY_CONFIG_REPO`:

1. `pipelines/grafana-plugin-upload.yml`: add `kotak-starrocks-logs-app-0.3.0|0.3.0`. Keep the 0.1.0 value for
   rollback. The user runs the upload for UAT.
2. `envs/uat-obs1-common/grafana-values.yml`, `s3-sync-init`: change the app's copy line from 0.1.0 to 0.3.0.
   Confirm in the values file that an old version folder cannot linger (the pod filesystem is rebuilt on
   restart). The new name comes from `plugin.json`, so the pod restart from the deploy is enough.
3. Provisioning file: **no change needed**, and
   `[navigation.app_sections] kotak-starrocks-logs-app = drilldown 5` stays. Optional:
   - fix the picker list and order with `datasources: [app-logs-starrocks-db, …]`, or re-run the generator with
     `--pin-datasources`, keeping the existing overrides and settings files;
   - add `<datasourceUid>/<app_id>` tenant entries only where a tenant differs between databases.
4. If `SECOND_DATABASE` is not "none yet", follow `plugins/kotak-starrocks-logs-app/docs/ROLLOUT.md` →
   "Adding another StarRocks database" (it is in the repo after step 2).
   - Add a second `kotak-starrocks-datasource` entry in each org that has the first one: a new `name`, `uid`
     and `jsonData.database`, with the rest copied from the existing entry.
   - The views and Ranger policies in that database belong to the StarRocks team. List them as a
     prerequisite; do not assume them.

**CHECKPOINT 4**: the user reviews the diff and runs `grafana-deploy.yml` for UAT.

## Step 5: verify in UAT (with the user)

| # | Check | Expected |
|---|---|---|
| 1 | Menu → Drilldown | card and menu entry "Logs Drilldown (StarRocks)" |
| 2 | Open the app with no URL parameters | a view the user can read is selected at once (no "Select a view / Opening view…"); the URL has `ds=` and `view=` |
| 3 | Header | label filter box on the left; Data source, View, time and refresh on the right (on narrow windows they wrap below, right-aligned) |
| 4 | Time picker | quick ranges Last 5 minutes … Last 24 hours, nothing longer |
| 5 | Tabs above the grid | only "service" and "+ Add label"; Add label gives a closable tab for that label |
| 6 | Service row | ★, Include (the filter appears in the label box and the button becomes Remove), Show logs |
| 7 | Label filter box | after picking a label and an operator, a drop-down of its values |
| 8 | "Search services" | typing filters the rows; the drop-down lists matches with line counts |
| 9 | Logs | scrolling to the end loads the next lines (more than `lineLimit`) |
| 10 | Back / Forward, old 0.1.0 links | return to the previous screen; an old link with `filter=` opens the same logs |
| 11 | Data source picker | with one database, works as in 0.1.0; with two, switching changes views and data |
| 12 | Labels, Fields, Patterns, View trace, Show context | unchanged |
| 13 | Configuration page (admin) → "Test: list my views" | one line per data source, with the admin's views |

**CHECKPOINT 5**: write the results to `HANDOFF_FILE`.

## Step 6: prod and wrap up

Prod: after UAT sign-off, repeat the same steps with prod values. Prepare them; the user runs them. Open one PR
per repo that describes what changed and how it was verified. Open items to list:
- second-database views and Ranger policies (StarRocks team);
- whether to pin `datasources`;
- per-database tenant entries, if any;
- the 10 screenshots under `docs/screenshots/`, which are not carried by this file.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Extractor reports `BAD` blocks or fewer than 41 blocks | the copy changed or cut the file (a wrapped line is enough) | copy it again as raw text; never fix blocks by hand |
| `git apply --3way` prints "Applied patch to '…' with conflicts" | the org changed lines next to or on the patched ones | resolve the `<<<<<<< ours` / `>>>>>>> theirs` markers (ours = org, theirs = 0.3.0), show the diff, `git add` the file |
| Every file shows `CHANGED by the org` | line endings (CRLF) in the repo or working tree | `git ls-files --eol`; then try `git apply --3way --ignore-whitespace` and report |
| `git apply` says "does not match index" or "patch does not apply" for a file | the org changed it and its 0.1.0 blob is not in history | apply that file's block alone with `--reject`; resolve the `.rej` by hand |
| Card still says "StarRocks Logs Drilldown" | old zip, or the pod was not restarted | check the `s3-sync-init` log for 0.3.0; restart the pod |
| Data source drop-down is empty: "No kotak-starrocks-datasource data source is available" | no instance in this org, or `datasources` lists uids that do not exist here | check the org's data sources; fix or remove `datasources` |
| A data source shows "StarRocks refused the connection … invalid connection" | the user has no access in that database (login checks the default database) | expected for people without grants there; use Ranger if they should have access |
| "No log views available" | no `<viewPrefix>*` views the user may read | Ranger, or a different `viewPrefix` |
| Values drop-down is empty for a label | no rows in the time range under the other filters | widen the range or remove filters |
| Infinite scroll stops | no older lines in the range | expected; widen the time range |
| Config warning "is not an app_id or <datasourceUid>/<app_id>" | bad tenant key | fix the key |

## Extractor

Save exactly as `/tmp/logs-app-upgrade/extract_logs_patch.py`:

```python
#!/usr/bin/env python3
"""Extracts and checks the patch blocks of the Logs Drilldown (StarRocks) upgrade file.

  python3 extract_logs_patch.py <md file> <out dir>             write the patches and check their sha256
  python3 extract_logs_patch.py <md file> <out dir> <org repo>  also compare the repo's files with 0.1.0/0.3.0
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
            state = {old: 'as 0.1.0', new: 'as 0.3.0'}.get(h, 'CHANGED by the org (neither 0.1.0 nor 0.3.0)')
        status += '  ' + state.ljust(46)
    print(status, path)
    name = '%02d-%s.patch' % (int(num), path.replace('/', '_'))
    with open(os.path.join(out, name), 'w', encoding='utf-8', newline='\n') as f:
        f.write(patch)
with open(os.path.join(out, 'logs-app-0.1.0-to-0.3.0.patch'), 'w', encoding='utf-8', newline='\n') as f:
    f.write(whole)
expected = int(blocks[0][1]) if blocks else -1
total = hashlib.sha256(whole.encode('utf-8')).hexdigest()
m = re.search(r'^WHOLE-PATCH sha256=(\w+)$', text, re.M)
print('%d of %d blocks, %d bad; whole patch sha256 %s (%s)' % (
    len(blocks), expected, bad, total, 'matches' if m and m.group(1) == total else 'DOES NOT MATCH'))
sys.exit(0 if blocks and len(blocks) == expected and bad == 0 and m and m.group(1) == total else 1)
```

WHOLE-PATCH sha256=7089d703960a63d92fb5d6f7f639d727a0050f7141ed32f79616330578a83f29

## Patch blocks

41 blocks in `git diff` order. Each has a heading, one `PATCH-BLOCK` line (number, path inside the app
folder, 0.1.0 blob id, 0.3.0 blob id, sha256 of the block) and the diff. Paths in the diffs are relative to the
repository root (`plugins/kotak-starrocks-logs-app/…`).

### 1/41 `CHANGELOG.md` (modified)

docs: 0.2.0 and 0.3.0 entries

PATCH-BLOCK 1/41 CHANGELOG.md old=12dc11a50cfb77064ba73c7eed6042ca98ada8c9 new=d031e66919d1bb6339fac8fca211e14347278ae9 sha256=4ecac6ea347517dec7872cbdff95db8569b078415919a2ec503c7068dc8f6e90
````diff
diff --git a/plugins/kotak-starrocks-logs-app/CHANGELOG.md b/plugins/kotak-starrocks-logs-app/CHANGELOG.md
index 12dc11a..d031e66 100644
--- a/plugins/kotak-starrocks-logs-app/CHANGELOG.md
+++ b/plugins/kotak-starrocks-logs-app/CHANGELOG.md
@@ -1,5 +1,36 @@
 # Changelog
 
+## 0.3.0
+
+- Name: **Logs Drilldown (StarRocks)** (plugin id unchanged).
+- Header like Logs Drilldown: "Filter by label values" combobox on the left (label and field columns,
+  `=` `!=` `=|` `!=|` `=~` `!~`, a dropdown of the label's values in the time range), Data source and View
+  pickers, time range and refresh on the right. Quick ranges: 5 minutes to 24 hours.
+- Service grid: "service" tab plus **Add label** (closable tabs; no label tabs by default), "Search services"
+  dropdown with line counts, "Showing N of M" with page size (10/20/50/100) and pages, volume legend as a
+  table with totals per level, ★ favourites (per browser, listed first), **Include / Remove** per value,
+  "Show logs" per value and above the grid (logs of the current filters).
+- Logs page: "Log levels" select next to the line search.
+- **Infinite scroll**: scrolling to the end of the logs loads the next `lineLimit` lines. Line ids are stable
+  and each page has exact microsecond bounds, so pages join without gaps or repeats.
+- A view is always selected: an invalid or empty `view` in the URL falls back to the last view used in this
+  browser, then the first view; the URL can no longer clear the selection (fixes "Opening view…" staying up).
+- Browser Back/Forward between the grid, logs and tabs. Label filters are in the URL as `var-filters`;
+  0.1.0/0.2.0 links with `filter=` still open.
+- Settings: unchanged, every 0.1.0/0.2.0 key works as before.
+
+## 0.2.0
+
+- Data source picker next to the view picker: each `kotak-starrocks-datasource` instance is one StarRocks
+  database; views, columns and filters belong to the selected one (URL key `ds`).
+- Optional `datasources` setting (allowlist and order, optional per-database `viewPrefix`); default: every
+  instance of the plugin type in the org. `datasourceUid` is the default choice.
+- Tenant settings can be scoped to one database with `<datasourceUid>/<app_id>` keys (field-by-field
+  fallback to `<app_id>` and `default`).
+- Without an explicit choice, the app falls back to the next data source where the user can see views.
+- `gen-tenants-from-loki.py --pin-datasources` writes the org's StarRocks data sources as the list.
+- Fully backward compatible with 0.1.0 settings.
+
 ## 0.1.0
 
 - First version: view picker, service grid, Logs tab (volume, Logs/Table/JSON, line search, level and label
````

### 2/41 `CLAUDE.md` (modified)

agent notes: every query targets `QuerySpec.datasource`

PATCH-BLOCK 2/41 CLAUDE.md old=fcbb3cd753fe8dc253182265f0278bdf9c881daa new=dbfb37d7150af61a5fed784eb8fcb8d700b6b617 sha256=88ea9ba7067a89590641329c51a7a9047cd10ac0f35ab389bfe9ee36894eb3ef
````diff
diff --git a/plugins/kotak-starrocks-logs-app/CLAUDE.md b/plugins/kotak-starrocks-logs-app/CLAUDE.md
index fcbb3cd..dbfb37d 100644
--- a/plugins/kotak-starrocks-logs-app/CLAUDE.md
+++ b/plugins/kotak-starrocks-logs-app/CLAUDE.md
@@ -6,13 +6,15 @@ to `/api/ds/query` addressed to that datasource, which forwards the user's IDAM
 
 Read first: `README.md` (features, config), `docs/DESIGN.md` (constraints, SQL per feature, guardrails),
 `docs/ROLLOUT.md` (deploy-config changes), `docs/MONOREPO.md` (same repo/pipelines as the datasource),
-`docs/ORG_AGENT_PROMPT.md` (step-by-step org rollout).
+`docs/ORG_AGENT_PROMPT.md` (step-by-step org rollout), `docs/ORG_AGENT_PROMPT_2_DATASOURCE_PICKER.md` (edit 2).
 
 Rules:
 - All SQL goes through `src/sql/builder.ts`: identifiers via `quoteIdent`, values via `lit` (it splits `$`
   out of literals because the datasource expands macros everywhere). Substring search uses `containsCond`
   (LIKE, or `instr()` when the text has `%`, `_` or `\`: StarRocks 4.0 LIKE-escape bug).
 - Never use information_schema / DESCRIBE / SHOW COLUMNS (Ranger denies them).
+- Every query targets the data source in `QuerySpec.datasource` (one kotak-starrocks-datasource instance per
+  StarRocks database); pass it to `runSql` / `fetchViews` / `fetchColumns` / `buildContext`.
 - Grafana 12.0.1: keep `@grafana/*` at 12.0.1 and `@grafana/scenes` at 6.20.2 (6.21+ needs `@grafana/i18n`).
 - Do not edit `.config/` (scaffolded). Never print tokens.
 
````

### 3/41 `README.md` (modified)

docs: feature table (header, Include, Add label, infinite scroll), `datasources` setting, test counts

PATCH-BLOCK 3/41 README.md old=b49c67e4e2cc131c24ddc1a3bcaaa0fea3495be0 new=04d9f582bb8be25f9785ef9101066066eb7f979c sha256=9c752e621eae4ac27771a28207274376c30c785dd74fcab7774ea43f0ae33721
````diff
diff --git a/plugins/kotak-starrocks-logs-app/README.md b/plugins/kotak-starrocks-logs-app/README.md
index b49c67e..04d9f58 100644
--- a/plugins/kotak-starrocks-logs-app/README.md
+++ b/plugins/kotak-starrocks-logs-app/README.md
@@ -1,4 +1,4 @@
-# kotak-starrocks-logs-app — StarRocks Logs Drilldown
+# kotak-starrocks-logs-app — Logs Drilldown (StarRocks)
 
 A Grafana app plugin that gives the StarRocks log views (`vw_eks_app_logs_<app_id>`) the Loki Logs
 Drilldown experience, without writing SQL. It does **not** change `kotak-starrocks-datasource`: every query
@@ -7,21 +7,26 @@ Ranger decide what each person sees, exactly as for dashboards.
 
 | Logs Drilldown feature | Here |
 |---|---|
-| Data source picker | **View picker**: `SHOW TABLES LIKE 'vw_eks_app_logs_%'`, filtered by Ranger |
-| Service grid (volume + newest lines per service), search, label tabs | Yes: one `GROUP BY` for all volumes, one `UNION ALL` for the visible page's lines |
-| Logs tab: volume by level, lines, newest/oldest, wrap, line limit | Yes (Grafana's Logs panel) |
+| Header: label filters left; data source, time range and refresh right | Yes: "Filter by label values" combobox (labels, operators, a dropdown of values) on the left; **Data source** (one `kotak-starrocks-datasource` instance per StarRocks database) **+ View** (`SHOW TABLES LIKE 'vw_eks_app_logs_%'`, filtered by Ranger) + time (quick ranges up to 24 hours) + refresh on the right |
+| Service grid: volume by level with totals + newest lines per service, "Search services" dropdown, page size and pages | Yes: one `GROUP BY` for all volumes, one `UNION ALL` for the visible page's lines |
+| ★ Favourites, **Include / Remove**, Show logs on each service | Yes (favourites per browser, listed first) |
+| "service" tab + **Add label** (closable tabs for other labels) | Yes |
+| Logs tab: volume by level, lines, newest/oldest, wrap | Yes (Grafana's Logs panel) |
+| **Infinite scroll**: the next lines load at the end of the list | Yes: pages of `lineLimit` lines with exact µs bounds, no gaps or repeats |
 | Logs / Table / JSON views | Yes |
 | Search in log lines: include / exclude, match case, regex | Yes |
-| Label and level filters; filter buttons in log details | Yes |
+| Label filters, "Log levels" select; filter buttons in log details | Yes |
 | Trace links → Explore with the trace | Yes: per-tenant regex + Tempo uid |
 | Show context | Yes: same pod, ±1 h (Grafana's context modal) |
 | Labels tab, Fields tab (incl. key=value / JSON fields in lines) | Yes, with Include / Exclude |
 | Patterns tab | Yes: **per-tenant configured patterns** (one scan), "(unmatched)" share, "Suggest patterns" from a sample |
-| Open in Explore, share link (state in the URL) | Yes (Explore shows the SQL result as a table) |
+| Open in Explore, share link (state in the URL), browser Back/Forward | Yes (Explore shows the SQL result as a table) |
 | Level | Per tenant: the `level` column, or extracted from the message (observability) |
 
-Not in this version: favourites, add-to-dashboard, alerts and an "Open in StarRocks drilldown" button
-inside Explore.
+Not in this version: add-to-dashboard, alerts and an "Open in StarRocks drilldown" button inside Explore.
+
+The app remembers, per browser, the last data source and view (opened by default next time) and the favourite
+values per view and label.
 
 ## How it works
 
@@ -39,17 +44,22 @@ flowchart LR
   literals so the datasource's macro engine cannot touch user text.
 - `src/datasource/StarRocksLogsDataSource.ts` is the runtime data source every panel queries; it also
   implements "show context".
-- `src/components/*` are the Scenes screens. All state is in the URL.
+- `src/components/*` are the Scenes screens. All state is in the URL (label filters as `var-filters`, like
+  Logs Drilldown; links from 0.1.0/0.2.0 with `filter=` still open).
 - Long text scans are guarded (`maxScanHours`): the user sees a notice and can shorten the range or run anyway.
 
-Screenshots from the end-to-end run (synthetic data): [service grid](docs/screenshots/02-service-grid.png),
+Screenshots from the end-to-end run (synthetic data): [header and service grid](docs/screenshots/00-layout.png),
+[Include](docs/screenshots/02c-include.png), [Add label](docs/screenshots/02d-add-label.png),
+[values dropdown](docs/screenshots/02e-values-dropdown.png), [quick ranges](docs/screenshots/00-quick-ranges.png),
 [log details with trace link](docs/screenshots/03-log-details-trace-link.png),
 [show context](docs/screenshots/05-show-context.png), [labels](docs/screenshots/06-labels-tab.png),
 [patterns](docs/screenshots/08-patterns-tab.png).
 
 More in [docs/DESIGN.md](docs/DESIGN.md). Rollout in [docs/ROLLOUT.md](docs/ROLLOUT.md). Building it from the
 same repository and pipelines as the datasource: [docs/MONOREPO.md](docs/MONOREPO.md). Step-by-step rollout for
-the Claude session on the org PC: [docs/ORG_AGENT_PROMPT.md](docs/ORG_AGENT_PROMPT.md).
+the Claude session on the org PC: [docs/ORG_AGENT_PROMPT.md](docs/ORG_AGENT_PROMPT.md) (0.1.0), then
+[docs/ORG_AGENT_PROMPT_3_UPGRADE_0.3.0.md](docs/ORG_AGENT_PROMPT_3_UPGRADE_0.3.0.md) (0.1.0 → 0.3.0 in one patch:
+data source picker and the Logs Drilldown look). Prompt 2 (0.2.0 only) is superseded by prompt 3.
 
 ## Configuration (app jsonData)
 
@@ -64,13 +74,16 @@ apps:
   - type: kotak-starrocks-logs-app
     org_id: 3
     jsonData:
-      datasourceUid: app-logs-starrocks-db      # the kotak-starrocks-datasource instance to use
+      datasourceUid: app-logs-starrocks-db      # data source selected by default
+      # datasources: [app-logs-starrocks-db, { uid: app-logs-starrocks-db2, viewPrefix: vw_eks_app_logs_ }]
+      #   optional picker allowlist/order; default: every kotak-starrocks-datasource instance in the org
       viewPrefix: vw_eks_app_logs_
       defaultTimeRange: now-15m
       maxScanHours: 6                           # text scans over longer ranges ask first
-      lineLimit: 1000
+      lineLimit: 1000                           # lines per page; scrolling to the end loads the next page
       # labels / fields: optional column lists (defaults: k8s_* and friends)
-      tenants:                                  # keyed by app_id = view name without the prefix
+      tenants:                                  # keyed by app_id = view name without the prefix,
+                                                # or <datasourceUid>/<app_id> for one database only
         default:
           level: { source: column }             # read the level column (normalised)
         app_1961_observability:
@@ -83,6 +96,10 @@ apps:
 
 - `level.regex` (message source, optional): RE2 regexes tried in order; the first capture group is the level.
   The defaults handle `level=info`, `"level":"info"`, bare `ERROR`/`WARN`/… and glog `E1118 …` prefixes.
+- Several StarRocks databases: add one `kotak-starrocks-datasource` instance per database (each has its own
+  `database` setting); they appear in the app's Data source picker. Views, columns and filters belong to the
+  selected data source (URL key `ds`). Without an explicit choice the app opens `datasourceUid`, or the next
+  data source where the user can see views.
 - `patterns[].like` is a SQL LIKE pattern (`%` wildcard). Prefer `regex` when the text itself contains `%`,
   `_` or `\` (StarRocks 4.0 does not honour an escaped `\%` at the end of a LIKE pattern).
 
@@ -92,7 +109,7 @@ Node 22 and npm. No backend, no Go.
 
 ```bash
 npm ci
-npm run typecheck && npm run lint && npm run test:ci     # 45 unit tests
+npm run typecheck && npm run lint && npm run test:ci     # 58 unit tests
 npm run build                                             # → dist/
 ./scripts/package.sh && ./scripts/verify-package.sh       # → package/kotak-starrocks-logs-app-<version>.zip
 ```
@@ -101,18 +118,19 @@ npm run build                                             # → dist/
 
 `scripts/e2e.sh` runs Grafana 12.0.1-security-01 with this app and the **built, unchanged**
 `kotak-starrocks-datasource` (`DATASOURCE_DIST`, default `../kotak-starrocks-datasource/dist`, the sibling folder in this repository), a mock IDAM,
-and StarRocks 4.0.10 seeded with an `eks_app_logs`-shaped table, three tenant views and native JWT users
-with per-view grants (standing in for Ranger).
+and StarRocks 4.0.10 seeded with two databases (two data source instances), each with an `eks_app_logs`-shaped
+table and tenant views, and native JWT users with per-view grants (standing in for Ranger).
 
 ```bash
 npm run build
 ./scripts/e2e.sh up        # generates the app provisioning from dev/e2e/tenants/ (like deploy-config), seeds,
                            # Grafana http://localhost:23000 ("Sign in with IDAM", user e.g. kmbl3e2e)
-./scripts/e2e.sh smoke     # 16 API checks: every query kind on StarRocks, per-user views, escaping
-./scripts/e2e.sh test      # 17 browser tests (Playwright, in mcr.microsoft.com/playwright:v1.52.0-noble;
+./scripts/e2e.sh smoke     # 21 API checks: every query kind on StarRocks, per-user views, two databases, escaping,
+                           # infinite-scroll pages join without gaps
+./scripts/e2e.sh test      # 28 browser tests (Playwright, in mcr.microsoft.com/playwright:v1.52.0-noble;
                            # PLAYWRIGHT_LOCAL=1 runs them on the host if Chromium's libraries are installed)
 ./scripts/e2e.sh down
 ```
 
-Test users: `kmbl3e2e` (observability + cmm views), `kmbl3other` (dpdpa view), `kmbl3none` (no views),
-`kmbl3admin` (Grafana admin, observability view).
+Test users: `kmbl3e2e` (db1: observability + cmm; db2: observability + payments), `kmbl3other` (db1: dpdpa),
+`kmbl3db2only` (db2: payments), `kmbl3none` (no views), `kmbl3admin` (Grafana admin, db1: observability).
````

### 4/41 `dev/e2e/provisioning/datasources/datasources.yaml` (modified)

local test stack only: a second StarRocks data source

PATCH-BLOCK 4/41 dev/e2e/provisioning/datasources/datasources.yaml old=ad49590045f31300d8f04ebf5de6db248f8a3754 new=01d58ef4d086eb56093dc2694f5389cf3c8c4619 sha256=eeaec33c44d12088b2d6ceeee2f4b3e4a2b74526ed6b862cb6034ec57a875d56
````diff
diff --git a/plugins/kotak-starrocks-logs-app/dev/e2e/provisioning/datasources/datasources.yaml b/plugins/kotak-starrocks-logs-app/dev/e2e/provisioning/datasources/datasources.yaml
index ad49590..01d58ef 100644
--- a/plugins/kotak-starrocks-logs-app/dev/e2e/provisioning/datasources/datasources.yaml
+++ b/plugins/kotak-starrocks-logs-app/dev/e2e/provisioning/datasources/datasources.yaml
@@ -16,6 +16,22 @@ datasources:
       connMaxIdleSeconds: 60
       # the local StarRocks container has no TLS; never set this in a real environment
       allowPlaintext: true
+  # a second StarRocks database = a second instance of the same plugin, scoped to that database
+  - name: app-logs-starrocks-db2
+    uid: e2e-ds-starrocks-logs2
+    type: kotak-starrocks-datasource
+    access: proxy
+    orgId: 1
+    url: starrocks:9030
+    editable: false
+    jsonData:
+      database: obs2_logs2_uat
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

### 5/41 `dev/e2e/provisioning/plugins/kotak-starrocks-logs-app.yaml` (modified)

local test stack only: generated provisioning with `datasources`

PATCH-BLOCK 5/41 dev/e2e/provisioning/plugins/kotak-starrocks-logs-app.yaml old=04a3356f764f2d96749f5fbc9b86ba5b145a1f5e new=fa5322551e834d5b434810e27a09d7bcb6691462 sha256=dcf4dab960cbf6457325ced7f73086751d5dc07160eb9e7058e4f8f17eaf3d56
````diff
diff --git a/plugins/kotak-starrocks-logs-app/dev/e2e/provisioning/plugins/kotak-starrocks-logs-app.yaml b/plugins/kotak-starrocks-logs-app/dev/e2e/provisioning/plugins/kotak-starrocks-logs-app.yaml
index 04a3356..fa53225 100644
--- a/plugins/kotak-starrocks-logs-app/dev/e2e/provisioning/plugins/kotak-starrocks-logs-app.yaml
+++ b/plugins/kotak-starrocks-logs-app/dev/e2e/provisioning/plugins/kotak-starrocks-logs-app.yaml
@@ -1,12 +1,16 @@
 # Generated by scripts/gen-tenants-from-loki.py; do not edit by hand.
 # org 1: app_1961_observability <- obs_public_logs (trace link from Loki: no)
 # org 1: app_01996_frontlineplatforms_cmm <- cmm_public_logs (trace link from Loki: yes)
+# org 1: StarRocks data sources ['e2e-ds-starrocks-logs', 'e2e-ds-starrocks-logs2'], default e2e-ds-starrocks-logs
 apiVersion: 1
 apps:
 - type: kotak-starrocks-logs-app
   org_id: 1
   jsonData:
     datasourceUid: e2e-ds-starrocks-logs
+    datasources:
+    - e2e-ds-starrocks-logs
+    - e2e-ds-starrocks-logs2
     viewPrefix: vw_eks_app_logs_
     defaultTimeRange: now-1h
     maxScanHours: 3
@@ -40,3 +44,6 @@ apps:
           regex: Connection refused to [a-z0-9-]+:[0-9]+
         - name: Health check
           like: '%/healthz%'
+      e2e-ds-starrocks-logs2/app_1961_observability:
+        level:
+          source: column
````

### 6/41 `dev/e2e/seed.py` (modified)

local test stack only: second database, user `kmbl3db2only`

PATCH-BLOCK 6/41 dev/e2e/seed.py old=620941fb712ff4ef4d5ab447a17700170ab84b75 new=73bfb10752f412c56a42119301f4499b10dd7a0c sha256=b4ccc225020c41ea240e7a48f48f6a4cd675c84120fb5827c48513c22fa34814
````diff
diff --git a/plugins/kotak-starrocks-logs-app/dev/e2e/seed.py b/plugins/kotak-starrocks-logs-app/dev/e2e/seed.py
index 620941f..73bfb10 100644
--- a/plugins/kotak-starrocks-logs-app/dev/e2e/seed.py
+++ b/plugins/kotak-starrocks-logs-app/dev/e2e/seed.py
@@ -1,7 +1,8 @@
 #!/usr/bin/env python3
-"""Prints SQL that (re)creates the local e2e data: an eks_app_logs-shaped table (same 21 columns as the UAT
-Iceberg table), per-tenant views like vw_eks_app_logs_<app_id>, and native StarRocks users authenticated with
-the mock IDAM's JWTs, each granted SELECT on some views (stands in for Ranger).
+"""Prints SQL that (re)creates the local e2e data: two databases (one per kotak-starrocks-datasource
+instance), each with an eks_app_logs-shaped table (same 21 columns as the UAT Iceberg table) and per-tenant
+views like vw_eks_app_logs_<app_id>, and native StarRocks users authenticated with the mock IDAM's JWTs, each
+granted SELECT on some views (stands in for Ranger).
 
   python3 dev/e2e/seed.py [hours] | mysql -h127.0.0.1 -P29030 -uroot
 
@@ -14,7 +15,6 @@ import sys
 HOURS = float(sys.argv[1]) if len(sys.argv) > 1 else 4.0
 RNG = random.Random(1961)
 NOW = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
-DB = "obs2_logs1_uat"
 JWT = (
     '{"jwks_url": "http://idam:8080/idam/jwks", "principal_field": "sub", '
     '"required_issuer": "http://idam:8080/idam", "required_audience": "grafana-e2e"}'
@@ -113,12 +113,27 @@ def cmm_line(ts):
     return f"{ts:%Y-%m-%d %H:%M:%S} {thread} c.k.cmm.OrderController - created order id={RNG.randint(1000, 9999)} amount={RNG.randint(1, 900)}{trace}", level
 
 
+def archive_line(ts):
+    if RNG.random() < 0.1:
+        return f"segment upload failed for partition {RNG.randint(1, 99)}: timeout after {RNG.randint(5, 30)}s", "ERROR"
+    if RNG.random() < 0.2:
+        return f"compaction slow: {RNG.randint(100, 900)} files pending", "WARN"
+    return f"compacted segment {RNG.randint(1000, 9999)} in {RNG.randint(5, 900)}ms", "INFO"
+
+
+def payments_line(ts):
+    level = RNG.choice(["INFO", "INFO", "INFO", "WARN", "ERROR"])
+    if level == "ERROR":
+        return f"charge declined for order {RNG.randint(1000, 9999)} reason=insufficient_funds", level
+    return f"charge captured order={RNG.randint(1000, 9999)} amount={RNG.randint(1, 900)}", level
+
+
 def dpdpa_line(ts):
     level = RNG.choice(["INFO", "INFO", "WARN", "ERROR"])
     return f"{ts:%Y-%m-%d %H:%M:%S} consent {RNG.choice(['granted', 'revoked'])} for principal {hexid(12)}", level
 
 
-TENANTS = {
+TENANTS_DB1 = {
     "app_1961_observability": {
         "rows": 40000, "tenant": "observability",
         "services": [
@@ -143,11 +158,34 @@ TENANTS = {
     },
 }
 
-# user -> views (app_ids) it may read
+# second database: the same tenant (observability, but with the level column filled) and a new tenant
+TENANTS_DB2 = {
+    "app_1961_observability": {
+        "rows": 6000, "tenant": "observability",
+        "services": [
+            ("archive-compactor", "observability", "statefulset", 2, archive_line, 0.7),
+            ("cold-reader", "observability", "deployment", 2, archive_line, 0.3),
+        ],
+    },
+    "app_04000_payments": {
+        "rows": 4000, "tenant": "payments",
+        "services": [("payments-api", "payments", "deployment", 2, payments_line, 1.0)],
+    },
+}
+
+DATABASES = {"obs2_logs1_uat": TENANTS_DB1, "obs2_logs2_uat": TENANTS_DB2}
+
+# user -> (database, app_id) views it may read
 GRANTS = {
-    "kmbl3e2e": ["app_1961_observability", "app_01996_frontlineplatforms_cmm"],
-    "kmbl3admin": ["app_1961_observability"],
-    "kmbl3other": ["app_03123_dpdpa"],
+    "kmbl3e2e": [
+        ("obs2_logs1_uat", "app_1961_observability"),
+        ("obs2_logs1_uat", "app_01996_frontlineplatforms_cmm"),
+        ("obs2_logs2_uat", "app_1961_observability"),
+        ("obs2_logs2_uat", "app_04000_payments"),
+    ],
+    "kmbl3admin": [("obs2_logs1_uat", "app_1961_observability")],
+    "kmbl3other": [("obs2_logs1_uat", "app_03123_dpdpa")],
+    "kmbl3db2only": [("obs2_logs2_uat", "app_04000_payments")],
     "kmbl3none": [],
 }
 
@@ -181,25 +219,26 @@ def rows_for(app_id, spec):
 
 def main():
     w = sys.stdout.write
-    w(f"CREATE DATABASE IF NOT EXISTS {DB};\nUSE {DB};\nDROP TABLE IF EXISTS eks_app_logs;\n")
     cols = ",\n  ".join(
         f"{c} DATETIME" if c == "observed_timestamp" else (f"{c} VARCHAR(65533)" if c == "message" else f"{c} VARCHAR(512)")
         for c in COLUMNS
     )
-    w(f"CREATE TABLE eks_app_logs (\n  {cols}\n) DUPLICATE KEY(app_env, app_id)\n"
-      "DISTRIBUTED BY HASH(app_id) BUCKETS 3 PROPERTIES (\"replication_num\" = \"1\");\n")
-    for app_id, spec in TENANTS.items():
-        rows = rows_for(app_id, spec)
-        for i in range(0, len(rows), 2000):
-            batch = rows[i:i + 2000]
-            w("INSERT INTO eks_app_logs VALUES\n" + ",\n".join("(" + ", ".join(q(v) for v in r) + ")" for r in batch) + ";\n")
-        w(f"DROP VIEW IF EXISTS vw_eks_app_logs_{app_id};\n")
-        w(f"CREATE VIEW vw_eks_app_logs_{app_id} AS SELECT * FROM eks_app_logs WHERE app_id = {q(app_id)};\n")
-    for user, apps in GRANTS.items():
+    for db, tenants in DATABASES.items():
+        w(f"CREATE DATABASE IF NOT EXISTS {db};\nUSE {db};\nDROP TABLE IF EXISTS eks_app_logs;\n")
+        w(f"CREATE TABLE eks_app_logs (\n  {cols}\n) DUPLICATE KEY(app_env, app_id)\n"
+          "DISTRIBUTED BY HASH(app_id) BUCKETS 3 PROPERTIES (\"replication_num\" = \"1\");\n")
+        for app_id, spec in tenants.items():
+            rows = rows_for(app_id, spec)
+            for i in range(0, len(rows), 2000):
+                batch = rows[i:i + 2000]
+                w("INSERT INTO eks_app_logs VALUES\n" + ",\n".join("(" + ", ".join(q(v) for v in r) + ")" for r in batch) + ";\n")
+            w(f"DROP VIEW IF EXISTS vw_eks_app_logs_{app_id};\n")
+            w(f"CREATE VIEW vw_eks_app_logs_{app_id} AS SELECT * FROM eks_app_logs WHERE app_id = {q(app_id)};\n")
+    for user, views in GRANTS.items():
         w(f"DROP USER IF EXISTS '{user}'@'%';\n")
         w(f"CREATE USER '{user}'@'%' IDENTIFIED WITH authentication_jwt AS {q(JWT)};\n")
-        for app_id in apps:
-            w(f"GRANT SELECT ON VIEW {DB}.vw_eks_app_logs_{app_id} TO USER '{user}'@'%';\n")
+        for db, app_id in views:
+            w(f"GRANT SELECT ON VIEW {db}.vw_eks_app_logs_{app_id} TO USER '{user}'@'%';\n")
 
 
 if __name__ == "__main__":
````

### 7/41 `dev/e2e/tenants/loki-datasources.yml` (modified)

local test stack only: second StarRocks data source for the generator

PATCH-BLOCK 7/41 dev/e2e/tenants/loki-datasources.yml old=becad906070443d9e060dcdaba35ec6780c9b6ef new=734c2b918e82d250db61482db92cd7bf6eb006db sha256=983d3a5d8442ac2573e647111e0f8ab4d8d6435e82343e420b98bec9b7d80a17
````diff
diff --git a/plugins/kotak-starrocks-logs-app/dev/e2e/tenants/loki-datasources.yml b/plugins/kotak-starrocks-logs-app/dev/e2e/tenants/loki-datasources.yml
index becad90..734c2b9 100644
--- a/plugins/kotak-starrocks-logs-app/dev/e2e/tenants/loki-datasources.yml
+++ b/plugins/kotak-starrocks-logs-app/dev/e2e/tenants/loki-datasources.yml
@@ -30,3 +30,7 @@ datasources:
         uid: e2e-ds-starrocks-logs
         type: kotak-starrocks-datasource
         orgId: 1
+      - name: app-logs-starrocks-db2
+        uid: e2e-ds-starrocks-logs2
+        type: kotak-starrocks-datasource
+        orgId: 1
````

### 8/41 `dev/e2e/tenants/tenants-overrides.yml` (modified)

local test stack only: a `<datasourceUid>/<app_id>` tenant

PATCH-BLOCK 8/41 dev/e2e/tenants/tenants-overrides.yml old=9e959170078a8846e6edbad26ea2a426cd7f6184 new=197a8b9d84c051c4537c9866646e98ce23266de8 sha256=d6ad231b3a4bff22865704cf8a142a33f834a621f50b5ab3f0183dc20877ba4a
````diff
diff --git a/plugins/kotak-starrocks-logs-app/dev/e2e/tenants/tenants-overrides.yml b/plugins/kotak-starrocks-logs-app/dev/e2e/tenants/tenants-overrides.yml
index 9e95917..197a8b9 100644
--- a/plugins/kotak-starrocks-logs-app/dev/e2e/tenants/tenants-overrides.yml
+++ b/plugins/kotak-starrocks-logs-app/dev/e2e/tenants/tenants-overrides.yml
@@ -13,3 +13,6 @@ app_01996_frontlineplatforms_cmm:
   patterns:
     - { name: Order created, like: '%created order%' }
     - { name: Payment failed, regex: 'payment (declined|failed)' }
+# Only in the second database: the observability view there has the level column filled.
+e2e-ds-starrocks-logs2/app_1961_observability:
+  level: { source: column }
````

### 9/41 `docs/DESIGN.md` (modified)

docs: data sources per database, screens and URL state, infinite scroll

PATCH-BLOCK 9/41 docs/DESIGN.md old=c5b36eadf505540ae66756bfc8515757ec2e2968 new=34e6d41c7c05c3405553efad899f8c5cce157ce6 sha256=86200cee4156a43a8d29d62da2362c353f92eca2a73f000a641848128574d2db
````diff
diff --git a/plugins/kotak-starrocks-logs-app/docs/DESIGN.md b/plugins/kotak-starrocks-logs-app/docs/DESIGN.md
index c5b36ea..34e6d41 100644
--- a/plugins/kotak-starrocks-logs-app/docs/DESIGN.md
+++ b/plugins/kotak-starrocks-logs-app/docs/DESIGN.md
@@ -37,6 +37,22 @@ A `QuerySpec` is the view plus every filter (label filters, levels, line filters
 message-field filters). Panels send `{kind, spec, params}` to the runtime data source, which builds the SQL,
 runs it, and turns the rows into frames (log lines, per-level series, per-value series).
 
+## Data sources and databases
+
+Each `kotak-starrocks-datasource` instance is scoped to one StarRocks database (its `database` setting, which
+is also the database StarRocks checks at login). The app therefore has a **Data source picker** next to the
+view picker:
+
+- The list is `datasources` from the settings (allowlist and order), or every instance of the plugin type
+  the user can see in the org. In OSS Grafana every org user sees every data source; the picker is not an
+  access control, Ranger still is.
+- Every query carries the selected data source uid (`QuerySpec.datasource`); views, columns and filters
+  belong to it, so switching resets them. The choice is in the URL (`ds`).
+- Without a choice in the URL, the app tries `datasourceUid` first and falls back to the next data source
+  where `SHOW TABLES` returns views for the user; failures are shown next to the data source in the picker.
+- Tenant settings can be scoped to one database: `tenants["<datasourceUid>/<app_id>"]` wins field by field
+  over `tenants["<app_id>"]`, then `default`. A data source can have its own `viewPrefix`.
+
 ## SQL per feature
 
 All queries start with `WHERE $__timeFilter(observed_timestamp)` (expanded by the datasource; it lets
@@ -48,7 +64,8 @@ StarRocks prune hourly partitions; verified on UAT: 2/2521 partitions for 1 h).
 | Columns | `SELECT * FROM <view> LIMIT 0` |
 | Service grid volumes | `SELECT bucket t, <label> v, <level> lvl, COUNT(*) … GROUP BY t, v, lvl` (all services) |
 | Service grid lines | `(SELECT … WHERE <label>='a' ORDER BY ts DESC LIMIT 10) UNION ALL (…)` for the page |
-| Logs | `SELECT ts, CAST(ts AS VARCHAR) __ts, message, <level> detected_level, <columns> … ORDER BY ts DESC LIMIT n` |
+| Logs | `SELECT ts, CAST(ts AS VARCHAR) __ts, message, <level> detected_level, <columns> … AND ts >= <from µs> AND ts < <to + 1 ms µs> ORDER BY ts DESC LIMIT n` |
+| Values of a label (filter combobox) | `SELECT <col> v, COUNT(*) c … GROUP BY v ORDER BY c DESC LIMIT 200`, under the other label filters |
 | Log volume | `SELECT bucket t, <level> g, COUNT(*) … GROUP BY t, g` |
 | Labels / Fields overview | one scan: `GROUP BY GROUPING SETS ((t, a), (t, b), …)` with `GROUPING_ID` |
 | Value breakdown | `SELECT bucket t, <col> v, COUNT(*) … GROUP BY t, v` (top 30 shown) |
@@ -64,6 +81,42 @@ Line search: case-insensitive `lower(message) LIKE '%text%'` by default; `instr(
 `%`, `_` or `\` (StarRocks 4.0 does not match an escaped `\%` at the end of a LIKE pattern, found in the
 local tests); `regexp(message, '(?i)…')` for regex searches.
 
+## Screens and state
+
+- **Header** (like Logs Drilldown): left, the "Filter by label values" combobox, a Scenes `AdHocFiltersVariable`
+  (`layout: combobox`) whose keys are the view's label and field columns and whose values come from the query
+  above; right, Data source, View, time range (quick ranges 5 minutes to 24 hours) and refresh. Below about
+  1350 px of content the right group wraps under the filters.
+- **Service grid** ("selection" page): one tab per label (the service label, shown as "service", plus tabs
+  added with "Add label"); each value has its volume by level (legend table with totals), its newest lines,
+  ★, Include / Remove (a `=` filter on that label; several values of one label become `IN (…)`) and
+  Show logs. The grid ignores filters on its own label, so Include does not re-run it.
+- **Logs page** ("details"): "Log levels" select, line search, then the Logs / Labels / Fields / Patterns tabs.
+- **URL**: `ds`, `view`, `page`, `label`, `tabs`, `var-filters` (Scenes format), `level`, `line`, `pattern`,
+  `field`, `tab`, `breakdown`, `sort`, `limit`, `display`, `wrap`, `search`, `from`, `to`. Page, tab, view and
+  data source changes add browser history steps. `filter=` (0.1.0/0.2.0) is read and converted.
+- **Choosing a view**: the URL's view if the user can read it, else the last view used in this browser (same
+  data source), else the first. An empty or missing `view` in a URL update never clears the selection, and the
+  body re-selects a view if it ever finds none while views exist. Last selection and favourites are kept in
+  `localStorage` (per browser; failures are ignored).
+
+## Infinite scroll
+
+Grafana's Logs panel (`enableInfiniteScrolling`) asks the data source for more lines when the user scrolls to
+the end: for newest-first it re-runs the same query with the range `[from, time of the oldest line shown]` and
+merges the result, dropping lines whose time and `id` it already has. Two details make the pages join exactly:
+
+1. **Exact bounds.** `$__timeFilter` is truncated to whole seconds, which would repeat or skip lines inside a
+   second. The logs query therefore also has `ts >= microseconds_add(FROM_UNIXTIME(s), µs)` and
+   `ts < <to + 1 ms>` (the panel's times are milliseconds; the line at the boundary millisecond is fetched
+   again and removed by id). The macro range is widened to whole seconds around those bounds, so partition
+   pruning still applies.
+2. **Stable ids.** A line's id is `<µs timestamp>_<pod uid or name>_<FNV-1a of the message>` (with `#n` for
+   identical lines in the same microsecond), the same in every query, so the overlap is recognised.
+
+The smoke test `infinite scroll` checks on StarRocks that two pages equal one larger query (no gaps, overlap
+only at the boundary millisecond); the browser test scrolls past 1000 lines.
+
 ## Safety
 
 - Identifiers must match `^[A-Za-z_][A-Za-z0-9_]*$` and be columns of the view; everything else is a
@@ -81,11 +134,15 @@ local tests); `regexp(message, '(?i)…')` for regex searches.
 | Range > `maxScanHours`, level read from the message, no text filters | volumes run **without** the level split (cheap), with a notice and "split anyway" |
 | Range > `maxScanHours` and a line / field / pattern / message-level filter, or the Patterns tab | a notice with "Use the last N hours" and "Run anyway" (remembered for that range) |
 
-Queries per screen: service grid 2, Logs tab 2, Labels/Fields 1 (+1 sample for message fields),
-Patterns 1. Superseded requests are cancelled by Scenes.
+Queries per screen: service grid 2, Logs tab 2 (+1 per infinite-scroll page), Labels/Fields 1 (+1 sample for
+message fields), Patterns 1, values dropdown 1 when opened. Superseded requests are cancelled by Scenes. The
+time picker offers quick ranges up to 24 hours (longer ranges can still be typed; the guardrails above apply).
 
 ## Known limitations
 
+- Infinite scroll works in the Logs display; Table and JSON show the first `lineLimit` lines.
+- Favourites and the last view are per browser (`localStorage`), not per Grafana user.
+
 - "Open in Explore" opens the SQL in Explore; Explore shows a table because the datasource returns table
   frames (a logs view there would need a datasource change).
 - A user whose login fails at the datasource's default-database check gets "invalid connection" from
````

### 10/41 `docs/ORG_AGENT_PROMPT_2_DATASOURCE_PICKER.md` (new file)

new doc: org prompt for 0.2.0 (superseded; kept for reference)

PATCH-BLOCK 10/41 docs/ORG_AGENT_PROMPT_2_DATASOURCE_PICKER.md old=none new=053bc1a54546778fc9720814e329fcd4e1beaea0 sha256=ee3f1f84a8a07ceb2e6275c33955837f4d147282768a45987e5fbb98548d705d
````diff
diff --git a/plugins/kotak-starrocks-logs-app/docs/ORG_AGENT_PROMPT_2_DATASOURCE_PICKER.md b/plugins/kotak-starrocks-logs-app/docs/ORG_AGENT_PROMPT_2_DATASOURCE_PICKER.md
new file mode 100644
index 0000000..053bc1a
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/docs/ORG_AGENT_PROMPT_2_DATASOURCE_PICKER.md
@@ -0,0 +1,130 @@
+# Prompt for the org Claude session, edit 2: data source picker (app 0.2.0)
+
+> **Superseded** by [`ORG_AGENT_PROMPT_3_UPGRADE_0.3.0.md`](ORG_AGENT_PROMPT_3_UPGRADE_0.3.0.md), which upgrades
+> 0.1.0 → 0.3.0 in one patch (this data source picker plus the Logs Drilldown look). Kept for reference.
+
+Copy everything below the line into Claude Code on the org PC, after edit 1 (`ORG_AGENT_PROMPT.md`, app 0.1.0)
+is rolled out. Fill in the **INPUTS** block first.
+
+---
+
+You are applying **edit 2** to `kotak-starrocks-logs-app`: a **Data source picker** next to the View picker.
+Each `kotak-starrocks-datasource` instance is scoped to one StarRocks database, so other databases with their
+own `vw_eks_app_logs_*` views become separate data source instances, and the app lets the user pick one.
+Version 0.1.0 → **0.2.0**. Tested upstream: 51 unit, 20 API and 20 browser end-to-end tests, with two databases,
+a user who can only reach the second one, and per-database tenant settings.
+
+Work step by step. Stop at every **CHECKPOINT** and wait for the user to reply "continue".
+
+## What changed (all inside `plugins/kotak-starrocks-logs-app/`)
+
+| Area | Change |
+|---|---|
+| UI | "Data source" dropdown left of "View". Switching resets the view and filters. The choice is in the URL as `ds`. |
+| Default choice | `datasourceUid` (unchanged key). If the URL has no `ds` and the default data source gives an error or no views for the user, the app tries the next data source; failures show next to it in the dropdown. |
+| New optional setting `datasources` | Picker allowlist and order: `[uid, …]` or `[{uid, viewPrefix}, …]`. Absent = every `kotak-starrocks-datasource` instance in the org. |
+| Tenant keys | `tenants` may also use `<datasourceUid>/<app_id>` for settings that only apply in one database (field by field over `<app_id>`, then `default`). |
+| Generator | `gen-tenants-from-loki.py` finds every StarRocks data source per org; `--pin-datasources` writes them as `datasources`. |
+| Not changed | The data source plugin, `pipelines/`, all 0.1.0 settings keys, the zip layout. (The repo-root README only got a link to this file.) |
+
+**Compatibility with your earlier changes:** 0.2.0 reads every 0.1.0 setting the same way, so your existing
+provisioning file, overrides and settings files keep working unchanged. The only deploy-config change needed
+is the version (0.1.0 → 0.2.0) in the upload parameter and the `s3-sync-init` line. Your pipeline changes are
+untouched because nothing outside the app folder changed.
+
+## INPUTS (filled in by the user)
+
+```
+GITHUB_SOURCE        = <checkout of the GitHub repo, branch feature/monorepo-starrocks-logs-app>
+ORG_PLUGIN_REPO      = <path of kotak-custom-grafana-plugins>   BASE_BRANCH = <branch that has app 0.1.0>
+DEPLOY_CONFIG_REPO   = <path of obser-aws-deploy-config>        BASE_BRANCH = <branch with the 0.1.0 rollout>
+HANDOFF_FILE         = <path of HANDOFF.md>
+SECOND_DATABASE      = <name of another StarRocks database with vw_eks_app_logs_* views, or "none yet">
+```
+
+## Rules
+
+Same as edit 1 (`ORG_AGENT_PROMPT.md`, "Rules"). In short: ask before any push, PR, pipeline run, feed publish,
+upload or deploy; the user runs pipelines and kubectl; new branches only (detached worktree, push HEAD, the user
+pulls); do not change product code of the data source; no tokens or real user IDs in files; do not invent
+values (`TODO(<owner>)`); log decisions in `HANDOFF_FILE`; terse replies.
+
+## Step 1: see what you changed in the app folder since 0.1.0
+
+1. In `GITHUB_SOURCE`: `git fetch && git log --oneline -3`. Note the 0.1.0 commit (`60b0353`, "Add
+   kotak-starrocks-logs-app") and the edit 2 commit: `git log -1 --format=%h --grep='data source picker'`.
+2. In `ORG_PLUGIN_REPO` (on `BASE_BRANCH`): `git log --oneline -- plugins/kotak-starrocks-logs-app`, and compare
+   the folder with GitHub's 0.1.0 (exclude `node_modules`, `dist`, `package`, `test-results`):
+   `git -C <GITHUB_SOURCE> archive 60b0353 plugins/kotak-starrocks-logs-app | tar -x -C /tmp/app-0.1.0` then
+   `diff -r -x node_modules -x dist -x package /tmp/app-0.1.0/plugins/kotak-starrocks-logs-app plugins/kotak-starrocks-logs-app`.
+3. List each org-side difference and whether edit 2 touches the same file.
+
+**CHECKPOINT 1**: user reviews the list.
+
+## Step 2: apply edit 2 as a patch (keeps your edits)
+
+1. In `ORG_PLUGIN_REPO`: new branch `feature/starrocks-logs-ds-picker` from `BASE_BRANCH`.
+2. In `GITHUB_SOURCE`: `git diff 60b0353 <edit2-commit> -- plugins/kotak-starrocks-logs-app > /tmp/ds-picker.patch`.
+3. In `ORG_PLUGIN_REPO`: `git apply --3way /tmp/ds-picker.patch`. Resolve conflicts by keeping the org-side
+   intent and the edit 2 behaviour; show every conflict resolution as a diff. Expected and harmless: for the
+   new file `docs/ORG_AGENT_PROMPT_2_DATASOURCE_PICKER.md` git prints "does not exist in index … Falling back to
+   direct application" (verified upstream: on an unmodified 0.1.0 folder all 27 files apply cleanly).
+4. Do not touch `plugins/kotak-starrocks-datasource/`, `pipelines/` or the repo root.
+
+**CHECKPOINT 2**: user reviews `git status` and the conflict resolutions, if any.
+
+## Step 3: build locally
+
+`scripts/build-plugin.sh plugins/kotak-starrocks-logs-app` → expect 51 tests passing and
+`PASS package/kotak-starrocks-logs-app-0.2.0.zip`. No new npm dependencies were added (same mirror as 0.1.0).
+
+**CHECKPOINT 3**: report results. Then the user runs the app pipeline (the data source pipeline is not
+triggered: path filters). Publish `kotak-starrocks-logs-app` 0.2.0 to the feed only after approval.
+
+## Step 4: deploy-config (UAT)
+
+On a new branch from `BASE_BRANCH`:
+1. `pipelines/grafana-plugin-upload.yml`: add `kotak-starrocks-logs-app-0.2.0|0.2.0` (keep the 0.1.0 value for
+   rollback). The user runs the upload for UAT.
+2. `envs/uat-obs1-common/grafana-values.yml`, `s3-sync-init`: change the app's copy line from 0.1.0 to 0.2.0.
+   Check how the init container handles an older version folder already present (the pod filesystem is
+   rebuilt on restart; confirm in the values file).
+3. Provisioning file: **no change needed**. Optional:
+   - fix the picker list/order with `datasources: [app-logs-starrocks-db, …]`, or re-run the generator with
+     `--pin-datasources`, keeping your existing overrides and settings files;
+   - add `<datasourceUid>/<app_id>` tenant entries only where a tenant differs between databases.
+4. If `SECOND_DATABASE` is not "none yet": follow `docs/ROLLOUT.md` → "Adding another StarRocks database":
+   a second `kotak-starrocks-datasource` entry (new `name`, `uid`, `jsonData.database: <SECOND_DATABASE>`,
+   everything else copied from the existing entry) in each org that has the first one. The views and Ranger
+   policies in that database are the StarRocks team's; list them as a prerequisite, do not assume them.
+
+**CHECKPOINT 4**: user reviews the diff and runs `grafana-deploy.yml` for UAT.
+
+## Step 5: verify in UAT (with the user)
+
+| # | Check | Expected |
+|---|---|---|
+| 1 | Open the app | "Data source" dropdown shows the StarRocks data source(s); with one, everything works as in 0.1.0 |
+| 2 | URL | contains `ds=<uid>`; an old 0.1.0 link without `ds` still opens (default data source) |
+| 3 | Configuration page (admin) → "Test: list my views" | one line per data source with the views the admin can see |
+| 4 | With a second database | switching the data source changes the view list and the data; filters reset |
+| 5 | A user with access in only one database | lands on that database; the other shows the reason in the dropdown |
+| 6 | Logs, Labels, Fields, Patterns, View trace, Show context | unchanged from 0.1.0 |
+
+**CHECKPOINT 5**: write results to `HANDOFF_FILE`.
+
+## Step 6: prod and wrap up
+
+Prod: the same steps with prod values after UAT sign-off; prepare, the user runs. One PR per repo, describing
+what changed and how it was verified. Open items to list: second-database views and Ranger policies (StarRocks
+team), whether to pin `datasources`, per-database tenant entries if any.
+
+## Troubleshooting
+
+| Symptom | Likely cause | Fix |
+|---|---|---|
+| Data source dropdown empty, "No kotak-starrocks-datasource data source is available" | no instance in this org, or `datasources` lists uids that do not exist here | check the org's data sources; fix or remove `datasources` |
+| A data source shows "StarRocks refused the connection … invalid connection" | the user has no access in that database (login checks the default database) | expected for people without grants there; Ranger if they should have access |
+| A data source shows "no log views for you" | the database has no `<viewPrefix>*` views the user may read | Ranger; or a different `viewPrefix` for that data source in `datasources` |
+| Wrong level / trace settings in one database only | the tenant differs between databases | add a `<datasourceUid>/<app_id>` tenant entry |
+| Config warning "is not an app_id or <datasourceUid>/<app_id>" | bad tenant key | fix the key |
````

### 11/41 `docs/ORG_AGENT_PROMPT_3_UPGRADE_0.3.0.md` (new file)

new doc: the same upgrade for people who can reach GitHub

PATCH-BLOCK 11/41 docs/ORG_AGENT_PROMPT_3_UPGRADE_0.3.0.md old=none new=e12412fc52704b4e521e276832f3711de87e812b sha256=0ff242b19bf346af168c780f782f5bd3eee33062827196c47d1b4f4d7484c3a4
````diff
diff --git a/plugins/kotak-starrocks-logs-app/docs/ORG_AGENT_PROMPT_3_UPGRADE_0.3.0.md b/plugins/kotak-starrocks-logs-app/docs/ORG_AGENT_PROMPT_3_UPGRADE_0.3.0.md
new file mode 100644
index 0000000..e12412f
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/docs/ORG_AGENT_PROMPT_3_UPGRADE_0.3.0.md
@@ -0,0 +1,140 @@
+# Prompt for the org Claude session, edit 3: upgrade 0.1.0 → 0.3.0 in one patch
+
+Copy everything below the line into Claude Code on the org PC. Fill in the **INPUTS** block first.
+This replaces edit 2 (`ORG_AGENT_PROMPT_2_DATASOURCE_PICKER.md`): if 0.2.0 was never rolled out, apply this
+one only. It contains 0.2.0 (data source picker) and 0.3.0 (the Logs Drilldown look).
+
+---
+
+You are upgrading **`kotak-starrocks-logs-app`** from **0.1.0** (rolled out) to **0.3.0**, as one patch over
+the app folder. Tested upstream against Grafana 12.0.1-security-01, the unchanged `kotak-starrocks-datasource`
+and StarRocks 4.0.10 with two databases: 58 unit, 21 API and 28 browser end-to-end tests.
+
+Work step by step. Stop at every **CHECKPOINT** and wait for the user to reply "continue".
+
+## What changed (all inside `plugins/kotak-starrocks-logs-app/`)
+
+| Version | Area | Change |
+|---|---|---|
+| 0.2.0 | Data source picker | "Data source" dropdown next to "View" (one `kotak-starrocks-datasource` instance per StarRocks database); URL key `ds`. Optional `datasources` setting (allowlist/order, per-database `viewPrefix`); `<datasourceUid>/<app_id>` tenant keys; generator `--pin-datasources`. |
+| 0.3.0 | Name | **Logs Drilldown (StarRocks)** (card, menu, breadcrumb). Plugin id unchanged. |
+| 0.3.0 | Header | Left: "Filter by label values" combobox with a **dropdown of values**. Right: Data source, View, time range (quick ranges **5 minutes … 24 hours**), refresh. |
+| 0.3.0 | Service grid | Only the "service" tab plus **+ Add label** (closable tabs). "Search services" dropdown, "Showing N of M", page size, pages. Per row: ★ favourite, **Include / Remove**, Show logs; legend table with totals per level. "Show logs" above the grid shows the logs of the current filters. |
+| 0.3.0 | Logs | **Infinite scroll**: scrolling to the end loads the next `lineLimit` lines, without gaps or repeats. "Log levels" select next to the line search. |
+| 0.3.0 | View selection | Always selects a view the user can read (URL view → last view used in this browser → first view). Fixes "Select a view / Opening view…" staying up. |
+| 0.3.0 | Navigation | Browser Back/Forward between grid, logs and tabs. Label filters in the URL as `var-filters`; 0.1.0 links with `filter=` still open. |
+| — | Not changed | Every 0.1.0 settings key; the data source plugin; `pipelines/`; the zip layout; no new npm dependencies. |
+
+**Compatibility with your earlier changes:** 0.3.0 reads every 0.1.0 setting the same way, so the existing
+provisioning file, overrides and settings files keep working. Deploy-config only needs the version
+(0.1.0 → 0.3.0) in the upload parameter and the `s3-sync-init` line. Pipeline changes are untouched
+(nothing outside the app folder is in the patch).
+
+## INPUTS (filled in by the user)
+
+```
+GITHUB_SOURCE        = <checkout of the GitHub repo, branch feature/monorepo-starrocks-logs-app>
+ORG_PLUGIN_REPO      = <path of kotak-custom-grafana-plugins>   BASE_BRANCH = <branch that has app 0.1.0>
+DEPLOY_CONFIG_REPO   = <path of obser-aws-deploy-config>        BASE_BRANCH = <branch with the 0.1.0 rollout>
+HANDOFF_FILE         = <path of HANDOFF.md>
+SECOND_DATABASE      = <name of another StarRocks database with vw_eks_app_logs_* views, or "none yet">
+```
+
+## Rules
+
+Same as edit 1 (`ORG_AGENT_PROMPT.md`, "Rules"). In short: ask before any push, PR, pipeline run, feed publish,
+upload or deploy; the user runs pipelines and kubectl; new branches only (detached worktree, push HEAD, the user
+pulls); do not change product code of the data source; no tokens or real user IDs in files; do not invent
+values (`TODO(<owner>)`); log decisions in `HANDOFF_FILE`; terse replies.
+
+## Step 1: see what you changed in the app folder since 0.1.0
+
+1. In `GITHUB_SOURCE`: `git fetch && git log --oneline -6`. Note the 0.1.0 commit `60b0353` ("Add
+   kotak-starrocks-logs-app") and the 0.3.0 commit: `git log -1 --format=%h --grep='logs-app 0.3.0'`.
+2. In `ORG_PLUGIN_REPO` (on `BASE_BRANCH`): `git log --oneline -- plugins/kotak-starrocks-logs-app`, and compare
+   the folder with GitHub's 0.1.0 (exclude `node_modules`, `dist`, `package`, `test-results`):
+   `mkdir -p /tmp/app-0.1.0 && git -C <GITHUB_SOURCE> archive 60b0353 plugins/kotak-starrocks-logs-app | tar -x -C /tmp/app-0.1.0`
+   then `diff -r -x node_modules -x dist -x package -x test-results /tmp/app-0.1.0/plugins/kotak-starrocks-logs-app plugins/kotak-starrocks-logs-app`.
+3. List each org-side difference and whether the patch touches the same file
+   (`git -C <GITHUB_SOURCE> diff --stat 60b0353 <0.3.0-commit> -- plugins/kotak-starrocks-logs-app`).
+
+**CHECKPOINT 1**: user reviews the list.
+
+## Step 2: apply the patch (keeps your edits)
+
+1. In `ORG_PLUGIN_REPO`: new branch `feature/starrocks-logs-0.3.0` from `BASE_BRANCH`.
+2. In `GITHUB_SOURCE`:
+   `git diff --binary 60b0353 <0.3.0-commit> -- plugins/kotak-starrocks-logs-app > /tmp/logs-app-0.3.0.patch`
+   (`--binary` is needed: the patch adds screenshots under `docs/screenshots/`).
+3. In `ORG_PLUGIN_REPO`: `git apply --3way /tmp/logs-app-0.3.0.patch`. Resolve conflicts by keeping the
+   org-side intent and the 0.3.0 behaviour; show every resolution as a diff. Expected and harmless for each
+   new file: "error: cannot read the current contents of '…' / Falling back to direct application" (verified
+   upstream: on an unmodified 0.1.0 folder the patch applies cleanly and gives exactly the 0.3.0 folder).
+4. Do not touch `plugins/kotak-starrocks-datasource/`, `pipelines/` or the repo root.
+
+**CHECKPOINT 2**: user reviews `git status` and the conflict resolutions, if any.
+
+## Step 3: build locally
+
+`scripts/build-plugin.sh plugins/kotak-starrocks-logs-app` → expect 58 tests passing and
+`PASS package/kotak-starrocks-logs-app-0.3.0.zip`. Same npm mirror and lock file dependencies as 0.1.0.
+
+**CHECKPOINT 3**: report results. Then the user runs the app pipeline (the data source pipeline is not
+triggered: path filters). Publish `kotak-starrocks-logs-app` 0.3.0 to the feed only after approval.
+
+## Step 4: deploy-config (UAT)
+
+On a new branch from `BASE_BRANCH`:
+1. `pipelines/grafana-plugin-upload.yml`: add `kotak-starrocks-logs-app-0.3.0|0.3.0` (keep the 0.1.0 value for
+   rollback). The user runs the upload for UAT.
+2. `envs/uat-obs1-common/grafana-values.yml`, `s3-sync-init`: change the app's copy line from 0.1.0 to 0.3.0.
+   Confirm in the values file that an old version folder cannot linger (the pod filesystem is rebuilt on
+   restart). The new name comes from `plugin.json`, so the pod restart from the deploy is enough.
+3. Provisioning file: **no change needed**. `[navigation.app_sections] kotak-starrocks-logs-app = drilldown 5`
+   stays. Optional:
+   - fix the picker list/order with `datasources: [app-logs-starrocks-db, …]`, or re-run the generator with
+     `--pin-datasources`, keeping your existing overrides and settings files;
+   - add `<datasourceUid>/<app_id>` tenant entries only where a tenant differs between databases.
+4. If `SECOND_DATABASE` is not "none yet": follow `docs/ROLLOUT.md` → "Adding another StarRocks database"
+   (a second `kotak-starrocks-datasource` entry with a new `name`, `uid` and `jsonData.database`, the rest copied
+   from the existing entry, in each org that has the first one). The views and Ranger policies in that
+   database belong to the StarRocks team; list them as a prerequisite, do not assume them.
+
+**CHECKPOINT 4**: user reviews the diff and runs `grafana-deploy.yml` for UAT.
+
+## Step 5: verify in UAT (with the user)
+
+| # | Check | Expected |
+|---|---|---|
+| 1 | Menu → Drilldown | card and menu entry "Logs Drilldown (StarRocks)" |
+| 2 | Open the app (no URL parameters) | a view the user can read is selected at once (no "Select a view / Opening view…"); URL has `ds=` and `view=` |
+| 3 | Header | label filter box left; Data source, View, time, refresh right (on narrow windows they wrap below, right-aligned) |
+| 4 | Time picker | quick ranges Last 5 minutes … Last 24 hours, nothing longer |
+| 5 | Tabs above the grid | only "service" and "+ Add label"; Add label → a closable tab for that label |
+| 6 | Service row | ★, Include (→ filter appears in the label box, button becomes Remove), Show logs |
+| 7 | Label filter box | pick a label and operator → a dropdown of its values |
+| 8 | "Search services" | typing filters the rows; the dropdown lists matches with line counts |
+| 9 | Logs | scroll to the end → the next lines load (more than `lineLimit`) |
+| 10 | Back / Forward, old 0.1.0 links | return to the previous screen; an old link with `filter=` opens the same logs |
+| 11 | Data source picker | with one database, as in 0.1.0; with two, switching changes views and data |
+| 12 | Labels, Fields, Patterns, View trace, Show context | unchanged |
+
+**CHECKPOINT 5**: write results to `HANDOFF_FILE`.
+
+## Step 6: prod and wrap up
+
+Prod: the same steps with prod values after UAT sign-off; prepare, the user runs. One PR per repo describing
+what changed and how it was verified. Open items: second-database views and Ranger policies (StarRocks team),
+whether to pin `datasources`, per-database tenant entries if any.
+
+## Troubleshooting
+
+| Symptom | Likely cause | Fix |
+|---|---|---|
+| Card still says "StarRocks Logs Drilldown" | old zip or the pod was not restarted | check the `s3-sync-init` log for 0.3.0; restart the pod |
+| Data source dropdown empty, "No kotak-starrocks-datasource data source is available" | no instance in this org, or `datasources` lists uids that do not exist here | check the org's data sources; fix or remove `datasources` |
+| A data source shows "StarRocks refused the connection … invalid connection" | the user has no access in that database (login checks the default database) | expected for people without grants there; Ranger if they should have access |
+| "No log views available" | no `<viewPrefix>*` views the user may read | Ranger; or a different `viewPrefix` |
+| Values dropdown empty for a label | no rows in the time range under the other filters | widen the range or remove filters |
+| Infinite scroll stops early | the range has no older lines | expected; widen the time range |
+| Config warning "is not an app_id or <datasourceUid>/<app_id>" | bad tenant key | fix the key |
````

### 12/41 `docs/ROLLOUT.md` (modified)

docs: adding another StarRocks database, new name, UAT checks

PATCH-BLOCK 12/41 docs/ROLLOUT.md old=11a6d471c3efd49710a487f8ecbd37f953b244b6 new=2459533c0fd52e7e5e1ee1621c5678d7d0edd75e sha256=8436465a94814cb601568c972ecfb09854bb8a28d479610f0dd9428e12c02b21
````diff
diff --git a/plugins/kotak-starrocks-logs-app/docs/ROLLOUT.md b/plugins/kotak-starrocks-logs-app/docs/ROLLOUT.md
index 11a6d47..2459533 100644
--- a/plugins/kotak-starrocks-logs-app/docs/ROLLOUT.md
+++ b/plugins/kotak-starrocks-logs-app/docs/ROLLOUT.md
@@ -32,6 +32,15 @@ python3 scripts/gen-tenants-from-loki.py envs/<env>/grafana-values.yml \
 (observability), trace regexes for tenants without a Loki derived field, and patterns. Run it in the
 deploy-config pipeline (or as a check that fails when the committed file differs) so the two never drift.
 
+## Adding another StarRocks database
+
+1. StarRocks/Ranger: the database has its `vw_eks_app_logs_<app_id>` views and per-view Ranger policies.
+2. deploy-config: add a second `kotak-starrocks-datasource` entry in the same org(s), same settings as the
+   existing one except `name`, `uid` and `jsonData.database`. Nothing else changes for the data source plugin.
+3. The app shows it in its Data source picker automatically. To fix the list and order, add `datasources`
+   (or re-run the generator with `--pin-datasources`). Add `<datasourceUid>/<app_id>` tenant entries only if a
+   tenant needs different settings in that database (for example a different level source).
+
 ## 1. Build and upload
 
 1. Build: `npm ci && npm run typecheck && npm run lint && npm run test:ci && npm run build &&
@@ -46,7 +55,7 @@ deploy-config pipeline (or as a check that fails when the committed file differs
 grafana.ini:
   plugins:
     allow_loading_unsigned_plugins: kotak-starrocks-datasource,kotak-starrocks-logs-app
-  # shows "StarRocks Logs Drilldown" as a card on the Drilldown page next to Metrics / Logs / Traces
+  # shows "Logs Drilldown (StarRocks)" as a card on the Drilldown page next to Metrics / Logs / Traces
   navigation.app_sections:
     kotak-starrocks-logs-app: drilldown 5
 ```
@@ -87,21 +96,25 @@ extraConfigmapMounts:
 
 Without the provisioning file the app still works (it is `autoEnabled`) with defaults
 (`datasourceUid: app-logs-starrocks-db`, levels from the column, no trace links, no patterns); a Grafana
-admin can then set the JSON on Administration → Plugins → StarRocks Logs Drilldown → Configuration.
+admin can then set the JSON on Administration → Plugins → Logs Drilldown (StarRocks) → Configuration.
 
 3. Run `pipelines/grafana-deploy.yml` (the init container runs on pod start).
 
 ## 3. Check
 
 - `kubectl -n <ns> logs <grafana-pod> -c s3-sync-init` shows the new plugin copied.
-- Drilldown page shows the StarRocks card; the view picker lists only the user's views.
+- Drilldown page shows the "Logs Drilldown (StarRocks)" card; the app opens on a view the user can read
+  (the last one used in that browser, else the first), and the View picker lists only the user's views.
+- On the service grid: Include adds a filter in the "Filter by label values" box; the values dropdown in that
+  box lists values; scrolling to the end of the logs loads more than `lineLimit` lines.
 - On the configuration page, "Effective configuration" shows the tenants and no warnings.
 - A trace link from the observability view opens Explore with the Tempo data source.
 
 ## Load on StarRocks
 
 Per screen the app issues 1–3 queries (service grid: 2; Logs tab: 2; Labels/Fields/Patterns: 1 each),
-plus one per filter value lookup. On the UAT observability view (5.6 M rows/hour) newest-N queries take
+plus one per filter value lookup and one per infinite-scroll page (a newest-N query, cheap). The time picker's
+quick ranges stop at 24 hours. On the UAT observability view (5.6 M rows/hour) newest-N queries take
 ~0.15 s at any range, 1 h aggregates ~0.2 s, 24 h aggregates 3–4 s, and 24 h text scans 9–11 s on the single
 CN. Ask the StarRocks team for a resource group / concurrency limit for interactive Grafana users before a
 wide rollout.
````

### 13/41 `package-lock.json` (modified)

version 0.3.0 (the two root entries only; no dependency changes)

PATCH-BLOCK 13/41 package-lock.json old=41a35890b3fe6453fa6f335255cff14594bcbfa7 new=94194b83785de022008a50929b8f59704a392aa3 sha256=55af8a6ead6f816b2753de2228785f93afa45cc90e78f34d43d229f64ecd7a27
````diff
diff --git a/plugins/kotak-starrocks-logs-app/package-lock.json b/plugins/kotak-starrocks-logs-app/package-lock.json
index 41a3589..94194b8 100644
--- a/plugins/kotak-starrocks-logs-app/package-lock.json
+++ b/plugins/kotak-starrocks-logs-app/package-lock.json
@@ -1,12 +1,12 @@
 {
   "name": "kotak-starrocks-logs-app",
-  "version": "0.1.0",
+  "version": "0.3.0",
   "lockfileVersion": 3,
   "requires": true,
   "packages": {
     "": {
       "name": "kotak-starrocks-logs-app",
-      "version": "0.1.0",
+      "version": "0.3.0",
       "license": "AGPL-3.0-only",
       "dependencies": {
         "@emotion/css": "11.13.5",
````

### 14/41 `package.json` (modified)

version 0.3.0

PATCH-BLOCK 14/41 package.json old=33a193adf9fb3aa785f758e3befc6d65b626823a new=3a5077d4a097a7cd3095dcabc200e52a94a27dfd sha256=e029df2041107ec03a155422914a11ce581dffa3ded388e11acfaf0cf26dd3ec
````diff
diff --git a/plugins/kotak-starrocks-logs-app/package.json b/plugins/kotak-starrocks-logs-app/package.json
index 33a193a..3a5077d 100644
--- a/plugins/kotak-starrocks-logs-app/package.json
+++ b/plugins/kotak-starrocks-logs-app/package.json
@@ -1,6 +1,6 @@
 {
   "name": "kotak-starrocks-logs-app",
-  "version": "0.1.0",
+  "version": "0.3.0",
   "description": "Logs Drilldown for StarRocks log views. Queries run through kotak-starrocks-datasource as the signed-in user.",
   "private": true,
   "scripts": {
````

### 15/41 `scripts/e2e.sh` (modified)

local test stack only: generator run with `--pin-datasources`

PATCH-BLOCK 15/41 scripts/e2e.sh old=6948e1b0365761f60ae054617b135fe0e531067f new=9c748c58b9d2d4d0cd3d41c144f5f5671d58b367 sha256=cc29e1758ec20cd79b583c9da84cd162d182392bd479df9029e9ce6a90c1003b
````diff
diff --git a/plugins/kotak-starrocks-logs-app/scripts/e2e.sh b/plugins/kotak-starrocks-logs-app/scripts/e2e.sh
index 6948e1b..9c748c5 100755
--- a/plugins/kotak-starrocks-logs-app/scripts/e2e.sh
+++ b/plugins/kotak-starrocks-logs-app/scripts/e2e.sh
@@ -25,7 +25,9 @@ sr() { "${COMPOSE[@]}" exec -T starrocks mysql -h127.0.0.1 -P9030 -uroot "$@"; }
 seed() {
   echo "seeding StarRocks..."
   python3 dev/e2e/seed.py "${SEED_HOURS:-4}" | sr
-  sr -N -e "SELECT app_id, COUNT(*) FROM obs2_logs1_uat.eks_app_logs GROUP BY app_id ORDER BY app_id"
+  for db in obs2_logs1_uat obs2_logs2_uat; do
+    sr -N -e "SELECT '$db', app_id, COUNT(*) FROM $db.eks_app_logs GROUP BY app_id ORDER BY app_id"
+  done
 }
 
 # The app's provisioning file is generated like in deploy-config: from Loki-style data source entries plus
@@ -34,7 +36,7 @@ tenants() {
   python3 scripts/gen-tenants-from-loki.py dev/e2e/tenants/loki-datasources.yml \
     --datasource-uid e2e-ds-starrocks-logs \
     --overrides dev/e2e/tenants/tenants-overrides.yml \
-    --settings dev/e2e/tenants/app-settings.yml > dev/e2e/provisioning/plugins/kotak-starrocks-logs-app.yaml
+    --settings dev/e2e/tenants/app-settings.yml --pin-datasources > dev/e2e/provisioning/plugins/kotak-starrocks-logs-app.yaml
   echo "generated dev/e2e/provisioning/plugins/kotak-starrocks-logs-app.yaml"
 }
 
````

### 16/41 `scripts/gen-tenants-from-loki.py` (modified)

generator: finds every StarRocks data source per org; `--pin-datasources`

PATCH-BLOCK 16/41 scripts/gen-tenants-from-loki.py old=79ce835b153257d2b594d557f005a5059031e639 new=f511423fe5c8915c2aac8ecbd2b4021f262c22ce sha256=3bda753d350ad34599da671a2b24aeff156d16db08eb073b977a0ec40f144cc5
````diff
diff --git a/plugins/kotak-starrocks-logs-app/scripts/gen-tenants-from-loki.py b/plugins/kotak-starrocks-logs-app/scripts/gen-tenants-from-loki.py
index 79ce835..f511423 100644
--- a/plugins/kotak-starrocks-logs-app/scripts/gen-tenants-from-loki.py
+++ b/plugins/kotak-starrocks-logs-app/scripts/gen-tenants-from-loki.py
@@ -15,6 +15,12 @@ tenant's trace setting.
 Loki data source has none); its "default" entry becomes tenants.default. --settings adds the other jsonData
 keys (maxScanHours, defaultTimeRange, ...). Only orgs that have a kotak-starrocks-datasource get an entry.
 
+Several StarRocks databases: each is its own kotak-starrocks-datasource entry in the values file. Per org,
+datasourceUid is --datasource-uid when that data source exists in the org, else the org's first one;
+--pin-datasources also writes the explicit "datasources" list (picker allowlist and order). Without it the
+app offers every kotak-starrocks-datasource instance of the org. Overrides may use "<datasourceUid>/<app_id>"
+keys for settings that only apply in one database.
+
 After Loki is removed, keep the generated file and edit it directly (it is then the only source).
 """
 import argparse
@@ -56,9 +62,10 @@ def trace_setting(ds):
     return None
 
 
-def build(values, datasource_uid, overrides, defaults, settings=None):
+def build(values, datasource_uid, overrides, defaults, settings=None, pin_datasources=False):
     sources = list(walk_datasources(values))
-    orgs = sorted({ds.get("orgId", 1) for ds in sources if ds.get("type") == "kotak-starrocks-datasource"})
+    starrocks = [ds for ds in sources if ds.get("type") == "kotak-starrocks-datasource"]
+    orgs = sorted({ds.get("orgId", 1) for ds in starrocks})
     per_org = {org: {} for org in orgs}
     report = []
     for ds in sources:
@@ -84,7 +91,14 @@ def build(values, datasource_uid, overrides, defaults, settings=None):
                 tenants[app_id] = merged
         for app_id, extra in overrides.items():
             tenants.setdefault(app_id, extra)
-        json_data = {"datasourceUid": datasource_uid, **(settings or {}), "tenants": tenants}
+        uids = [ds.get("uid") for ds in starrocks if ds.get("orgId", 1) == org and ds.get("uid")]
+        default_uid = datasource_uid if datasource_uid in uids else uids[0]
+        report.append(f"# org {org}: StarRocks data sources {uids}, default {default_uid}")
+        json_data = {"datasourceUid": default_uid}
+        if pin_datasources:
+            json_data["datasources"] = uids
+        json_data.update(settings or {})
+        json_data["tenants"] = tenants
         apps.append({"type": "kotak-starrocks-logs-app", "org_id": org, "jsonData": json_data})
     return {"apiVersion": 1, "apps": apps}, report
 
@@ -95,6 +109,7 @@ def main():
     ap.add_argument("--datasource-uid", default="app-logs-starrocks-db")
     ap.add_argument("--overrides", help="YAML: {app_id: {level: ..., patterns: [...], trace: {...}}}")
     ap.add_argument("--settings", help="YAML: other jsonData keys, e.g. {maxScanHours: 6}")
+    ap.add_argument("--pin-datasources", action="store_true", help="write the org's StarRocks data sources as the picker list")
     args = ap.parse_args()
     with open(args.values) as f:
         values = yaml.safe_load(f)
@@ -107,7 +122,7 @@ def main():
         with open(args.settings) as f:
             settings = yaml.safe_load(f) or {}
     defaults = overrides.pop("default", None) or {"level": {"source": "column"}}
-    doc, report = build(values, args.datasource_uid, overrides, defaults, settings)
+    doc, report = build(values, args.datasource_uid, overrides, defaults, settings, args.pin_datasources)
     sys.stdout.write("# Generated by scripts/gen-tenants-from-loki.py; do not edit by hand.\n")
     sys.stdout.write("\n".join(report) + "\n")
     yaml.safe_dump(doc, sys.stdout, sort_keys=False, default_flow_style=False, width=200)
````

### 17/41 `src/README.md` (modified)

name

PATCH-BLOCK 17/41 src/README.md old=ff4ee263c995c33e782007a0f912362ecb81cc9c new=d30007ab5191d0c74112cb2667e005e9cac07ef2 sha256=c58e8102fe60a263d808ae67bc764759531784a0c379648852f16d7e727aa347
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/README.md b/plugins/kotak-starrocks-logs-app/src/README.md
index ff4ee26..d30007a 100644
--- a/plugins/kotak-starrocks-logs-app/src/README.md
+++ b/plugins/kotak-starrocks-logs-app/src/README.md
@@ -1,4 +1,4 @@
-# StarRocks Logs Drilldown
+# Logs Drilldown (StarRocks)
 
 Explore StarRocks log views (`vw_eks_app_logs_*`) like Grafana Logs Drilldown, without writing SQL:
 
````

### 18/41 `src/components/App.tsx` (modified)

page title "Logs Drilldown (StarRocks)", no big page header

PATCH-BLOCK 18/41 src/components/App.tsx old=c32b8cfb6e1f4e64ac8bf0d9a6d0fee9c70b181b new=b5fac39ddf5c1611c8cdb8c23c8f1c59e6747584 sha256=a2b4cfbffbc0dcd53bf6652dbf4edb8f0de8be866ca8b1647ef7ebdc2b66d782
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/App.tsx b/plugins/kotak-starrocks-logs-app/src/components/App.tsx
index c32b8cf..b5fac39 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/App.tsx
+++ b/plugins/kotak-starrocks-logs-app/src/components/App.tsx
@@ -13,7 +13,7 @@ import {
   useSceneApp,
 } from '@grafana/scenes';
 
-import { EXPLORE_ROUTE, PLUGIN_BASE_URL } from '../constants';
+import { APP_TITLE, EXPLORE_ROUTE, PLUGIN_BASE_URL } from '../constants';
 import { AppJsonData, getAppConfig, setAppConfig } from '../config/config';
 import { ensureRuntimeDataSource } from '../datasource/StarRocksLogsDataSource';
 import { LogsExploration } from './LogsExploration';
@@ -39,15 +39,15 @@ function getSceneApp(): SceneApp {
     urlSyncOptions: { updateUrlOnInit: true, createBrowserHistorySteps: true },
     pages: [
       new SceneAppPage({
-        title: 'StarRocks Logs',
-        subTitle:
-          'Explore StarRocks log views without writing SQL. Queries run as you, so you only see views you have access to.',
+        // title in the breadcrumb and browser tab only; the page itself starts with the filters, like Logs Drilldown
+        title: APP_TITLE,
+        renderTitle: () => null,
         url: EXPLORE_ROUTE,
         routePath: 'explore/*',
         getScene: getExploreScene,
       }),
       new SceneAppPage({
-        title: 'StarRocks Logs',
+        title: APP_TITLE,
         url: PLUGIN_BASE_URL,
         routePath: '*',
         getScene: () => new EmbeddedScene({ body: new SceneReactObject({ component: RedirectToExplore }) }),
````

### 19/41 `src/components/AppConfig.tsx` (modified)

configuration page: "Test: list my views" per data source; new keys in the help text

PATCH-BLOCK 19/41 src/components/AppConfig.tsx old=569cb90913a0bf4a954e735bc08a689b1b8a24c8 new=bea937c249662743ab8bd87eaf40232c3617dc97 sha256=cf9cb0213a91b77232a83b3558891674bd393aa251b95ef3924f01145c991692
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/AppConfig.tsx b/plugins/kotak-starrocks-logs-app/src/components/AppConfig.tsx
index 569cb90..bea937c 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/AppConfig.tsx
+++ b/plugins/kotak-starrocks-logs-app/src/components/AppConfig.tsx
@@ -7,10 +7,11 @@ import { Alert, Button, Field, TextArea, useStyles2 } from '@grafana/ui';
 
 import { PLUGIN_ID } from '../constants';
 import { AppJsonData, resolveConfig, setAppConfig } from '../config/config';
-import { fetchViews } from '../datasource/api';
+import { fetchViews, listDatasources } from '../datasource/api';
 
 const EXAMPLE: AppJsonData = {
   datasourceUid: 'app-logs-starrocks-db',
+  datasources: ['app-logs-starrocks-db', { uid: 'app-logs-starrocks-db2', viewPrefix: 'vw_eks_app_logs_' }],
   viewPrefix: 'vw_eks_app_logs_',
   maxScanHours: 6,
   tenants: {
@@ -24,7 +25,7 @@ const EXAMPLE: AppJsonData = {
 };
 
 /**
- * Configuration page (Administration > Plugins > StarRocks Logs Drilldown). Shows the effective
+ * Configuration page (Administration > Plugins > Logs Drilldown (StarRocks)). Shows the effective
  * configuration and its validation errors. Settings are normally provisioned from deploy-config
  * (provisioning/plugins); saving here changes them until the next provisioning run.
  */
@@ -62,19 +63,26 @@ export function AppConfig({ plugin }: PluginConfigPageProps<AppPluginMeta<AppJso
 
   const testViews = async () => {
     setAppConfig(parsed);
-    try {
-      const list = await fetchViews(rangeUtil.convertRawToRange({ from: 'now-15m', to: 'now' }));
-      setViews(list.length > 0 ? list.join(', ') : '(none)');
-    } catch (e) {
-      setViews(`error: ${e instanceof Error ? e.message : String(e)}`);
-    }
+    const range = rangeUtil.convertRawToRange({ from: 'now-15m', to: 'now' });
+    const lines = await Promise.all(
+      listDatasources().map(async (ds) => {
+        try {
+          const list = await fetchViews(range, ds.uid);
+          return `${ds.name}: ${list.length > 0 ? list.join(', ') : '(none)'}`;
+        } catch (e) {
+          return `${ds.name}: error: ${e instanceof Error ? e.message : String(e)}`;
+        }
+      })
+    );
+    setViews(lines.length > 0 ? lines.join('\n') : `(no ${config.datasource.type} data source visible)`);
   };
 
   return (
     <div className={styles.wrapper} data-testid="app-config">
       <p>
-        The app sends SQL through the StarRocks data source <code>{config.datasource.uid}</code> as the signed-in user.
-        Settings are usually provisioned from deploy-config; edits saved here are replaced by the next provisioning run.
+        The app sends SQL through the StarRocks data source chosen in its picker (default{' '}
+        <code>{config.datasource.uid}</code>; one data source per database) as the signed-in user. Settings are usually
+        provisioned from deploy-config; edits saved here are replaced by the next provisioning run.
       </p>
       {(parseError || errors.length > 0) && (
         <Alert severity="warning" title="Configuration problems (invalid entries are ignored)">
@@ -88,7 +96,7 @@ export function AppConfig({ plugin }: PluginConfigPageProps<AppPluginMeta<AppJso
       )}
       <Field
         label="jsonData"
-        description="Keys: datasourceUid, viewPrefix, serviceLabel, defaultTimeRange, maxScanHours, lineLimit, labels, fields, tenants"
+        description="Keys: datasourceUid, datasources, viewPrefix, serviceLabel, defaultTimeRange, maxScanHours, lineLimit, labels, fields, tenants (app_id or <datasourceUid>/<app_id>)"
       >
         <TextArea rows={24} value={text} onChange={(e) => setText(e.currentTarget.value)} className={styles.mono} />
       </Field>
@@ -104,8 +112,10 @@ export function AppConfig({ plugin }: PluginConfigPageProps<AppPluginMeta<AppJso
         </Button>
       </div>
       {views && (
-        <Alert severity="info" title="Views visible to you">
-          {views}
+        <Alert severity="info" title="Views visible to you, per data source">
+          <pre className={styles.mono} data-testid="config-views">
+            {views}
+          </pre>
         </Alert>
       )}
       {saveError && (
````

### 20/41 `src/components/FiltersBar.tsx` (modified)

logs page: "Log levels" select, line search, filter chips

PATCH-BLOCK 20/41 src/components/FiltersBar.tsx old=17118fc17b6b0e832703f445950c26819d96b4a4 new=d955d9bf36071af77386d76c944fdae259f3aa6f sha256=2e2132b772d5b7afc5fe9a5bf7c92f97cae69d61c89bf1c567e45004e2be0d1c
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/FiltersBar.tsx b/plugins/kotak-starrocks-logs-app/src/components/FiltersBar.tsx
index 17118fc..d955d9b 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/FiltersBar.tsx
+++ b/plugins/kotak-starrocks-logs-app/src/components/FiltersBar.tsx
@@ -1,57 +1,37 @@
 import { css } from '@emotion/css';
 import { useState } from 'react';
 
-import { GrafanaTheme2, SelectableValue } from '@grafana/data';
-import { sceneGraph } from '@grafana/scenes';
-import { AsyncSelect, Button, Input, Select, ToolbarButton, useStyles2 } from '@grafana/ui';
+import { GrafanaTheme2 } from '@grafana/data';
+import { Button, Icon, Input, MultiSelect, ToolbarButton, useStyles2 } from '@grafana/ui';
 
 import { LEVELS } from '../constants';
-import { runSqlOnce, stringColumn } from '../datasource/api';
-import { labelValuesQuery } from '../sql/builder';
-import { LabelOp } from '../state/types';
 import type { LogsExploration } from './LogsExploration';
-import { Chip, LevelDot } from './ui';
+import { Chip } from './ui';
 
-const OPS: Array<SelectableValue<LabelOp>> = [
-  { label: '=', value: '=' },
-  { label: '!=', value: '!=' },
-  { label: '=~', value: '=~', description: 'matches regex' },
-  { label: '!~', value: '!~', description: 'does not match regex' },
-];
-
-/** Filters above the tabs: column filters, levels, line search, and pattern / message-field filters. */
+/**
+ * Filters under the label filters on the logs page, like Logs Drilldown: "Log levels", line search, and
+ * chips for line / pattern / message-field filters.
+ */
 export function DetailsHeader({ model }: { model: LogsExploration }) {
   const styles = useStyles2(getStyles);
-  const { filters, levels, lineFilters, patternFilters, fieldFilters } = model.useState();
+  const { levels, lineFilters, patternFilters, fieldFilters } = model.useState();
   return (
     <div className={styles.wrapper}>
       <div className={styles.row}>
-        <span className={styles.label}>Labels</span>
-        {filters.map((f, i) => (
-          <Chip key={`${f.key}${f.op}${f.value}`} onRemove={() => model.removeFilter(i)} testId="filter-chip">
-            {f.key} {f.op} {f.value}
-          </Chip>
-        ))}
-        <AddFilter model={model} />
-      </div>
-      <div className={styles.row}>
-        <span className={styles.label}>Levels</span>
-        {LEVELS.map((l) => (
-          <Button
-            key={l}
-            size="sm"
-            variant={levels.includes(l) ? 'primary' : 'secondary'}
-            fill={levels.includes(l) ? 'solid' : 'outline'}
-            onClick={() => model.toggleLevel(l)}
-            data-testid={`level-${l}`}
-          >
-            <span className={styles.level}>
-              <LevelDot level={l} /> {l}
-            </span>
-          </Button>
-        ))}
+        <div className={styles.levels} data-testid="log-levels">
+          <MultiSelect<string>
+            aria-label="Log levels"
+            placeholder="All levels"
+            prefix={<Icon name="filter" />}
+            options={LEVELS.map((l) => ({ label: l, value: l }))}
+            value={levels}
+            onChange={(opts) => model.setLevelsExact(opts.map((o) => o.value!).filter(Boolean))}
+            isClearable
+            width={36}
+          />
+        </div>
+        <LineFilterInput model={model} />
       </div>
-      <LineFilterInput model={model} />
       {(lineFilters.length > 0 || patternFilters.length > 0 || fieldFilters.length > 0) && (
         <div className={styles.row}>
           {lineFilters.map((f, i) => (
@@ -76,71 +56,6 @@ export function DetailsHeader({ model }: { model: LogsExploration }) {
   );
 }
 
-function AddFilter({ model }: { model: LogsExploration }) {
-  const styles = useStyles2(getStyles);
-  const { ctx } = model.useState();
-  const [key, setKey] = useState<string | undefined>();
-  const [op, setOp] = useState<LabelOp>('=');
-  const [value, setValue] = useState<SelectableValue<string> | null>(null);
-  if (!ctx) {
-    return null;
-  }
-  const keys = [...ctx.labels, ...ctx.fields].map((k) => ({ label: k, value: k }));
-  const loadValues = async (input: string) => {
-    if (!key) {
-      return [];
-    }
-    const frames = await runSqlOnce(
-      labelValuesQuery(model.getSpec(), ctx, key, 200),
-      sceneGraph.getTimeRange(model).state.value,
-      'values'
-    );
-    const values = stringColumn(frames[0], 'v');
-    const counts = stringColumn(frames[0], 'c');
-    return values
-      .map((v, i) => ({ label: v, value: v, description: `${counts[i]} lines` }))
-      .filter((o) => input === '' || o.label.toLowerCase().includes(input.toLowerCase()));
-  };
-  const add = () => {
-    if (key && value?.value !== undefined) {
-      model.addFilter({ key, op, value: value.value });
-      setValue(null);
-    }
-  };
-  return (
-    <span className={styles.add} data-testid="add-filter">
-      <Select
-        width={26}
-        placeholder="Add filter: label"
-        options={keys}
-        value={key ?? null}
-        onChange={(o) => {
-          setKey(o.value);
-          setValue(null);
-        }}
-        aria-label="Filter label"
-      />
-      <Select width={8} options={OPS} value={op} onChange={(o) => setOp(o.value!)} aria-label="Filter operator" />
-      <AsyncSelect
-        key={key ?? 'none'}
-        width={32}
-        placeholder="value"
-        disabled={!key}
-        defaultOptions={!!key}
-        cacheOptions
-        loadOptions={loadValues}
-        allowCustomValue
-        value={value}
-        onChange={(o) => setValue(o)}
-        aria-label="Filter value"
-      />
-      <Button size="sm" icon="plus" onClick={add} disabled={!key || !value} aria-label="Add filter">
-        Add
-      </Button>
-    </span>
-  );
-}
-
 function LineFilterInput({ model }: { model: LogsExploration }) {
   const styles = useStyles2(getStyles);
   const [text, setText] = useState('');
@@ -153,10 +68,9 @@ function LineFilterInput({ model }: { model: LogsExploration }) {
     }
   };
   return (
-    <div className={styles.row}>
-      <span className={styles.label}>Line</span>
+    <div className={styles.line}>
       <Input
-        width={50}
+        width={60}
         placeholder="Search in log lines"
         value={text}
         onChange={(e) => setText(e.currentTarget.value)}
@@ -196,8 +110,7 @@ function LineFilterInput({ model }: { model: LogsExploration }) {
 const getStyles = (theme: GrafanaTheme2) => ({
   wrapper: css({ display: 'flex', flexDirection: 'column', gap: theme.spacing(1) }),
   row: css({ display: 'flex', alignItems: 'center', gap: theme.spacing(1), flexWrap: 'wrap' }),
-  label: css({ color: theme.colors.text.secondary, width: 52 }),
-  add: css({ display: 'inline-flex', alignItems: 'center', gap: theme.spacing(0.5) }),
-  level: css({ display: 'inline-flex', alignItems: 'center', gap: theme.spacing(0.5) }),
+  levels: css({ flex: '0 0 auto' }),
+  line: css({ display: 'flex', alignItems: 'center', gap: theme.spacing(1), flex: '1 1 480px', minWidth: 0 }),
   toggles: css({ display: 'inline-flex', gap: 2 }),
 });
````

### 21/41 `src/components/LogsExploration.tsx` (modified)

root screen: header (label filters left; data source, view, time, refresh right), data source picker, view auto-selection, "service" / Add label tabs, URL state and history

PATCH-BLOCK 21/41 src/components/LogsExploration.tsx old=0c36021c4e64eee2f78fab93b05b6d47c1726bd0 new=4fc116e0aeef7b10fda0350218100986b13eace3 sha256=421e7fd9f6156556faa91c7f61b0291c2c7039afc649a3850a1de6b2ee85b3aa
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/LogsExploration.tsx b/plugins/kotak-starrocks-logs-app/src/components/LogsExploration.tsx
index 0c36021..4fc116e 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/LogsExploration.tsx
+++ b/plugins/kotak-starrocks-logs-app/src/components/LogsExploration.tsx
@@ -1,7 +1,9 @@
 import { css } from '@emotion/css';
+import { useState } from 'react';
 
 import { GrafanaTheme2, rangeUtil } from '@grafana/data';
 import {
+  AdHocFiltersVariable,
   SceneComponentProps,
   SceneObject,
   SceneObjectBase,
@@ -13,13 +15,14 @@ import {
   SceneTimePicker,
   sceneGraph,
 } from '@grafana/scenes';
-import { Alert, Button, Select, Tab, TabsBar, useStyles2 } from '@grafana/ui';
+import { Alert, Button, IconButton, InlineField, Select, Tab, TabsBar, useStyles2 } from '@grafana/ui';
 
-import { LEVELS } from '../constants';
-import { getAppConfig, getAppConfigErrors } from '../config/config';
-import { fetchViews } from '../datasource/api';
+import { LEVELS, QUICK_RANGES, RUNTIME_DS } from '../constants';
+import { getAppConfig, getAppConfigErrors, viewPrefixFor } from '../config/config';
+import { fetchViews, listDatasources, runSqlOnce, StarRocksDatasource, stringColumn } from '../datasource/api';
 import { buildContext } from '../datasource/StarRocksLogsDataSource';
-import { BuildContext, needsMessageScan } from '../sql/builder';
+import { BuildContext, labelValuesQuery, needsMessageScan } from '../sql/builder';
+import { getLastSelection, setLastSelection } from '../state/storage';
 import {
   asArray,
   decodeAll,
@@ -28,12 +31,19 @@ import {
   decodeLine,
   decodePattern,
   encodeField,
-  encodeFilter,
   encodeLine,
   encodePattern,
 } from '../state/url';
-import { LabelFilter, LineFilter, MessageFieldFilter, PatternFilter, QuerySpec } from '../state/types';
-import { Display, ExplorationApi, Tab as TabName } from './api';
+import {
+  emptySpec,
+  LabelFilter,
+  LabelOp,
+  LineFilter,
+  MessageFieldFilter,
+  PatternFilter,
+  QuerySpec,
+} from '../state/types';
+import { Display, displayLabel, ExplorationApi, isExplorationApi, Tab as TabName } from './api';
 import { BreakdownScene, MESSAGE_FIELD_PREFIX } from './BreakdownScene';
 import { DetailsHeader } from './FiltersBar';
 import { LogsTabScene } from './LogsTabScene';
@@ -41,14 +51,28 @@ import { PatternsTabScene } from './PatternsTabScene';
 import { ServiceSelectionScene } from './ServiceSelectionScene';
 import { ErrorBox, Loading, ScanGuard } from './ui';
 
+type AdHocFilter = AdHocFiltersVariable['state']['filters'][number];
+type Page = 'selection' | 'details';
+
 export interface LogsExplorationState extends SceneObjectState {
+  /** selected kotak-starrocks-datasource instance (one StarRocks database) */
+  datasource?: string;
+  datasources?: StarRocksDatasource[];
+  /** why a data source could not be used (no access, no views), shown in the picker */
+  datasourceProblems?: Record<string, string>;
   view?: string;
   views?: string[];
   viewsError?: string;
   ctx?: BuildContext;
   ctxError?: string;
+  /** the value grid ("selection") or the logs of the current filters ("details") */
+  page: Page;
+  /** label of the value grid (default: serviceLabel, shown as "service") */
   primaryLabel?: string;
-  filters: LabelFilter[];
+  /** extra label tabs added with "Add label" */
+  labelTabs: string[];
+  /** "Filter by label values" combobox; source of truth for label filters (URL: var-filters) */
+  labelFilters: AdHocFiltersVariable;
   levels: string[];
   lineFilters: LineFilter[];
   patternFilters: PatternFilter[];
@@ -66,9 +90,13 @@ export interface LogsExplorationState extends SceneObjectState {
   controls: SceneObject[];
 }
 
+// "filter" is the 0.1.0/0.2.0 URL format for label filters; it is read and converted, never written.
 const URL_KEYS = [
+  'ds',
   'view',
+  'page',
   'label',
+  'tabs',
   'filter',
   'level',
   'line',
@@ -83,10 +111,69 @@ const URL_KEYS = [
   'search',
 ];
 const TABS: TabName[] = ['logs', 'labels', 'fields', 'patterns'];
+// =| and !=| (one of / not one of) are expanded to several = / != filters
+const LABEL_OPS: string[] = ['=', '!=', '=|', '!=|', '=~', '!~'];
+
+function toAdHoc(f: LabelFilter): AdHocFilter {
+  return { key: f.key, operator: f.op, value: f.value, keyLabel: f.key, valueLabels: [f.value] };
+}
+
+function findExploration(obj: SceneObject): LogsExploration | undefined {
+  let cur: SceneObject | undefined = obj;
+  while (cur) {
+    if (isExplorationApi(cur)) {
+      return cur as unknown as LogsExploration;
+    }
+    cur = cur.parent;
+  }
+  return undefined;
+}
+
+/** "Filter by label values" combobox; only operators that work on text columns (no < or >). */
+class LabelFiltersVariable extends AdHocFiltersVariable {
+  _getOperators() {
+    return super._getOperators().filter((o) => o.value !== undefined && LABEL_OPS.includes(o.value));
+  }
+}
+
+/** The same "Filter by label values" combobox as Logs Drilldown, fed with the view's columns and values. */
+function createLabelFiltersVariable(): AdHocFiltersVariable {
+  return new LabelFiltersVariable({
+    name: 'filters',
+    label: 'Labels',
+    layout: 'combobox',
+    applyMode: 'manual',
+    datasource: RUNTIME_DS,
+    filters: [],
+    allowCustomValue: true,
+    supportsMultiValueOperators: true,
+    getTagKeysProvider: async (variable) => {
+      const ctx = findExploration(variable)?.getContext();
+      const keys = ctx ? [...ctx.labels, ...ctx.fields] : [];
+      return { replace: true, values: keys.map((k) => ({ text: k, value: k })) };
+    },
+    getTagValuesProvider: async (variable, filter) => {
+      const ex = findExploration(variable);
+      const ctx = ex?.getContext();
+      if (!ex || !ctx || !filter.key) {
+        return { replace: true, values: [] };
+      }
+      // values of this label under the other filters (not those on the same label)
+      const spec = { ...ex.getSpec(), filters: ex.getLabelFilters().filter((f) => f.key !== filter.key) };
+      const frames = await runSqlOnce(
+        labelValuesQuery(spec, ctx, filter.key, 200),
+        sceneGraph.getTimeRange(ex).state.value,
+        'values',
+        spec.datasource
+      );
+      return { replace: true, values: stringColumn(frames[0], 'v').map((v) => ({ text: v, value: v })) };
+    },
+  });
+}
 
 /**
- * Root of the drilldown. Owns all state that is in the URL (view, filters, tab, display options) and builds
- * the body: the service grid when no filter is set, otherwise the Logs / Labels / Fields / Patterns tabs.
+ * Root of the drilldown. Owns the URL state (data source, view, page, filters, tab, display options) and
+ * builds the body: the value grid ("selection") or the Logs / Labels / Fields / Patterns tabs ("details").
  */
 export class LogsExploration extends SceneObjectBase<LogsExplorationState> implements ExplorationApi {
   static Component = LogsExplorationRenderer;
@@ -97,7 +184,9 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
 
   constructor(state: Partial<LogsExplorationState> = {}) {
     super({
-      filters: [],
+      page: 'selection',
+      labelTabs: [],
+      labelFilters: createLabelFiltersVariable(),
       levels: [],
       lineFilters: [],
       patternFilters: [],
@@ -107,34 +196,50 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
       display: 'logs',
       wrap: false,
       search: '',
-      controls: [new SceneTimePicker({}), new SceneRefreshPicker({})],
+      controls: [new SceneTimePicker({ quickRanges: QUICK_RANGES }), new SceneRefreshPicker({})],
       ...state,
     });
     this.addActivationHandler(() => {
       const tr = sceneGraph.getTimeRange(this);
-      const sub = tr.subscribeToState(() => {
+      const timeSub = tr.subscribeToState(() => {
         if (this.computeGuardSignature() !== this.guardSignature) {
           this.rebuild();
         }
       });
+      const filterSub = this.state.labelFilters.subscribeToState((s, prev) => {
+        if (s.filters !== prev.filters) {
+          this.onLabelFiltersChanged(prev.filters, s.filters);
+        }
+      });
       if (this.state.views === undefined) {
-        this.loadViews();
+        this.loadDatasources();
       } else {
         this.rebuild();
       }
-      return () => sub.unsubscribe();
+      return () => {
+        timeSub.unsubscribe();
+        filterSub.unsubscribe();
+      };
     });
   }
 
   // ---- URL state ----
 
+  /** Navigation (page, tab, view, data source) adds a browser history step, so Back returns to it. */
+  private navigate(change: () => void) {
+    this._urlSync.performBrowserHistoryAction(change);
+  }
+
   getUrlState(): SceneObjectUrlValues {
     const s = this.state;
     const list = (a: string[]) => (a.length > 0 ? a : null);
     return {
+      ds: s.datasource ?? null,
       view: s.view ?? null,
+      page: s.page === 'details' ? 'details' : null,
       label: s.primaryLabel ?? null,
-      filter: list(s.filters.map(encodeFilter)),
+      tabs: list(s.labelTabs),
+      filter: null,
       level: list(s.levels),
       line: list(s.lineFilters.map(encodeLine)),
       pattern: list(s.patternFilters.map(encodePattern)),
@@ -152,17 +257,29 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
   updateFromUrl(values: SceneObjectUrlValues) {
     const one = (k: string) => {
       const v = asArray(values[k] as string | string[] | null | undefined);
-      return v.length > 0 ? v[0] : undefined;
+      return v.length > 0 && v[0] !== '' ? v[0] : undefined;
     };
     const next: Partial<LogsExplorationState> = {};
-    if ('view' in values) {
+    // A URL without ds/view never clears them: they are picked automatically (and written back to the URL),
+    // and a URL update can race with that pick.
+    if (one('ds')) {
+      next.datasource = one('ds');
+    }
+    if (one('view')) {
       next.view = one('view');
     }
+    if ('page' in values) {
+      next.page = one('page') === 'details' ? 'details' : 'selection';
+    }
     if ('label' in values) {
       next.primaryLabel = one('label');
     }
-    if ('filter' in values) {
-      next.filters = decodeAll(values.filter as string[], decodeFilter);
+    if ('tabs' in values) {
+      next.labelTabs = asArray(values.tabs as string[]).filter((t) => t !== '');
+    }
+    const legacyFilters = decodeAll(values.filter as string[], decodeFilter);
+    if (legacyFilters.length > 0) {
+      next.page = 'details';
     }
     if ('level' in values) {
       next.levels = asArray(values.level as string[]).filter((l) => (LEVELS as readonly string[]).includes(l));
@@ -200,10 +317,16 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
     if ('search' in values) {
       next.search = one('search') ?? '';
     }
+    const dsChanged = next.datasource !== undefined && next.datasource !== this.state.datasource;
     const viewChanged = next.view !== undefined && next.view !== this.state.view;
     this.setState(next);
+    if (legacyFilters.length > 0) {
+      this.state.labelFilters.updateFilters(legacyFilters.map(toAdHoc));
+    }
     if (this.isActive) {
-      if (viewChanged && next.view) {
+      if (dsChanged && next.datasource) {
+        this.loadViews(next.datasource);
+      } else if (viewChanged && next.view) {
         this.loadContext(next.view);
       } else {
         this.rebuild();
@@ -213,18 +336,78 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
 
   // ---- loading ----
 
-  private async loadViews() {
+  /**
+   * Lists the StarRocks data sources and picks one: the one in the URL if any (no fallback: the user chose
+   * it), otherwise the last one used, the configured default, then any data source where the user can see
+   * views (people with access to one database only land on it).
+   */
+  private async loadDatasources() {
+    const list = listDatasources();
+    this.setState({ datasources: list, datasourceProblems: {} });
+    if (list.length === 0) {
+      const type = getAppConfig().datasource.type;
+      this.setState({ views: [], viewsError: `No ${type} data source is available to you in this organization.` });
+      this.rebuild();
+      return;
+    }
+    const chosen = this.state.datasource;
+    if (chosen && list.some((d) => d.uid === chosen)) {
+      await this.loadViews(chosen);
+      return;
+    }
+    const preferred = [getLastSelection().ds, getAppConfig().datasource.uid];
+    const uids = list.map((d) => d.uid);
+    const order = Array.from(new Set([...preferred.filter((u): u is string => !!u && uids.includes(u)), ...uids]));
+    const problems: Record<string, string> = {};
+    for (const uid of order) {
+      try {
+        const views = await fetchViews(sceneGraph.getTimeRange(this).state.value, uid);
+        if (views.length > 0) {
+          this.setState({ datasource: uid, datasourceProblems: problems });
+          await this.applyViews(views);
+          return;
+        }
+        problems[uid] = 'no log views for you';
+      } catch (e) {
+        problems[uid] = e instanceof Error ? e.message : String(e);
+      }
+    }
+    // nothing usable: show the first data source and why it failed
+    this.setState({ datasource: order[0], datasourceProblems: problems });
+    await this.loadViews(order[0]);
+  }
+
+  private async loadViews(datasource: string) {
+    const req = ++this.ctxRequest;
+    this.setState({ views: undefined, viewsError: undefined, ctx: undefined, ctxError: undefined });
+    this.rebuild();
     try {
-      const views = await fetchViews(sceneGraph.getTimeRange(this).state.value);
-      const view = this.state.view && views.includes(this.state.view) ? this.state.view : views[0];
-      this.setState({ views, view, viewsError: undefined });
-      if (view) {
-        await this.loadContext(view);
-      } else {
-        this.rebuild();
+      const views = await fetchViews(sceneGraph.getTimeRange(this).state.value, datasource);
+      if (req === this.ctxRequest) {
+        await this.applyViews(views);
       }
     } catch (e) {
-      this.setState({ views: [], viewsError: e instanceof Error ? e.message : String(e) });
+      if (req === this.ctxRequest) {
+        this.setState({ views: [], viewsError: e instanceof Error ? e.message : String(e) });
+        this.rebuild();
+      }
+    }
+  }
+
+  /** Picks the view: the one in the URL, else the last one used in this data source, else the first. */
+  private async applyViews(views: string[]) {
+    const last = getLastSelection();
+    let view = views[0];
+    if (this.state.view && views.includes(this.state.view)) {
+      view = this.state.view;
+    } else if (last.ds === this.state.datasource && last.view && views.includes(last.view)) {
+      view = last.view;
+    }
+    this.setState({ views, view, viewsError: undefined });
+    if (view) {
+      setLastSelection(this.state.datasource, view);
+      await this.loadContext(view);
+    } else {
       this.rebuild();
     }
   }
@@ -234,7 +417,7 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
     this.setState({ ctx: undefined, ctxError: undefined });
     this.rebuild();
     try {
-      const ctx = await buildContext(view, sceneGraph.getTimeRange(this).state.value);
+      const ctx = await buildContext(view, sceneGraph.getTimeRange(this).state.value, this.state.datasource ?? '');
       if (req === this.ctxRequest) {
         this.setState({ ctx });
       }
@@ -248,13 +431,69 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
     }
   }
 
+  // ---- label filters ----
+
+  getLabelFiltersVariable() {
+    return this.state.labelFilters;
+  }
+
+  getLabelFilters(): LabelFilter[] {
+    return this.state.labelFilters.state.filters
+      .filter((f) => !f.hidden && f.key && LABEL_OPS.includes(f.operator))
+      .flatMap((f): LabelFilter[] => {
+        if (f.operator === '=|' || f.operator === '!=|') {
+          const op: LabelOp = f.operator === '=|' ? '=' : '!=';
+          return (f.values ?? [f.value]).map((value) => ({ key: f.key, op, value }));
+        }
+        return [{ key: f.key, op: f.operator as LabelOp, value: f.value }];
+      });
+  }
+
+  private setLabelFilters(filters: LabelFilter[]) {
+    this.state.labelFilters.updateFilters(filters.map(toAdHoc));
+  }
+
+  private onLabelFiltersChanged(prev: AdHocFilter[], next: AdHocFilter[]) {
+    if (this.state.page === 'selection') {
+      // Include / Remove on the grid's own label: the grid stays the same, its rows update themselves
+      const primary = this.primaryLabel();
+      const others = (fs: AdHocFilter[]) =>
+        JSON.stringify(fs.filter((f) => f.key !== primary).map((f) => [f.key, f.operator, f.value]));
+      if (others(prev) === others(next)) {
+        return;
+      }
+    }
+    this.setState({ breakdown: undefined });
+    this.rebuild();
+  }
+
+  addFilter(f: LabelFilter) {
+    const cur = this.getLabelFilters();
+    const exists = cur.some((x) => x.key === f.key && x.value === f.value && x.op === f.op);
+    const others = cur.filter((x) => !(x.key === f.key && x.value === f.value));
+    this.setLabelFilters(exists ? others : [...others, f]);
+  }
+
+  removeLabelFilter(key: string, value: string) {
+    this.setLabelFilters(this.getLabelFilters().filter((f) => !(f.key === key && f.value === value)));
+  }
+
+  hasFilter(key: string, value: string, op: LabelFilter['op'] = '=') {
+    return this.getLabelFilters().some((f) => f.key === key && f.value === value && f.op === op);
+  }
+
   // ---- ExplorationApi ----
 
+  primaryLabel(): string {
+    return this.state.primaryLabel ?? getAppConfig().serviceLabel;
+  }
+
   getSpec(): QuerySpec {
     const s = this.state;
     return {
+      datasource: s.datasource ?? '',
       view: s.view ?? '',
-      filters: s.filters,
+      filters: this.getLabelFilters(),
       levels: s.levels,
       lineFilters: s.lineFilters,
       patternFilters: s.patternFilters,
@@ -262,6 +501,15 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
     };
   }
 
+  /** The value grid uses only label filters, and not those on its own label (it shows every value). */
+  private selectionSpec(): QuerySpec {
+    const primary = this.primaryLabel();
+    return {
+      ...emptySpec(this.state.view ?? '', this.state.datasource ?? ''),
+      filters: this.getLabelFilters().filter((f) => f.key !== primary),
+    };
+  }
+
   getContext() {
     return this.state.ctx;
   }
@@ -277,48 +525,63 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
   }
 
   isDetails() {
-    return this.state.filters.length > 0;
-  }
-
-  setView(view: string) {
-    if (view === this.state.view) {
-      return;
-    }
-    this.setState({ view, ...this.clearedFilters(), breakdown: undefined, tab: 'logs', search: '' });
-    this.loadContext(view);
+    return this.state.page === 'details';
   }
 
   private clearedFilters() {
-    return { filters: [], levels: [], lineFilters: [], patternFilters: [], fieldFilters: [] };
+    return { levels: [], lineFilters: [], patternFilters: [], fieldFilters: [] };
   }
 
-  addFilter(f: LabelFilter) {
-    const others = this.state.filters.filter((x) => !(x.key === f.key && x.value === f.value));
-    const exists = this.state.filters.some((x) => x.key === f.key && x.value === f.value && x.op === f.op);
-    this.setState({ filters: exists ? others : [...others, f] });
-    this.afterFilterChange();
-  }
-
-  removeFilter(i: number) {
-    const filters = this.state.filters.filter((_, n) => n !== i);
-    this.setState(filters.length === 0 ? { ...this.clearedFilters(), breakdown: undefined } : { filters });
-    this.afterFilterChange();
+  /** Switch database: views, columns and filters belong to the data source, so they are reset. */
+  setDatasource(uid: string) {
+    if (uid === this.state.datasource) {
+      return;
+    }
+    this.navigate(() =>
+      this.setState({
+        datasource: uid,
+        view: undefined,
+        page: 'selection',
+        ...this.clearedFilters(),
+        breakdown: undefined,
+        tab: 'logs',
+        search: '',
+        primaryLabel: undefined,
+        labelTabs: [],
+      })
+    );
+    this.setLabelFilters([]);
+    this.loadViews(uid);
   }
 
-  hasFilter(key: string, value: string, op: LabelFilter['op'] = '=') {
-    return this.state.filters.some((f) => f.key === key && f.value === value && f.op === op);
+  setView(view: string) {
+    if (view === this.state.view) {
+      return;
+    }
+    this.navigate(() =>
+      this.setState({
+        view,
+        page: 'selection',
+        ...this.clearedFilters(),
+        breakdown: undefined,
+        tab: 'logs',
+        search: '',
+      })
+    );
+    this.setLabelFilters([]);
+    setLastSelection(this.state.datasource, view);
+    this.loadContext(view);
   }
 
   setLevels(levels: string[]) {
     const cur = this.state.levels;
     const same = cur.length === levels.length && levels.every((l) => cur.includes(l));
-    this.setState({ levels: same || levels.length >= LEVELS.length ? [] : levels });
-    this.afterFilterChange();
+    this.setLevelsExact(same ? [] : levels);
   }
 
-  toggleLevel(level: string) {
-    const cur = this.state.levels;
-    this.setState({ levels: cur.includes(level) ? cur.filter((l) => l !== level) : [...cur, level] });
+  /** From the "Log levels" select: exactly these levels (none or all = no filter). */
+  setLevelsExact(levels: string[]) {
+    this.setState({ levels: levels.length >= LEVELS.length ? [] : levels });
     this.afterFilterChange();
   }
 
@@ -373,7 +636,7 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
   }
 
   setTab(tab: TabName) {
-    this.setState({ tab, breakdown: undefined });
+    this.navigate(() => this.setState({ tab, breakdown: undefined }));
     this.rebuild();
   }
 
@@ -382,26 +645,46 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
     this.rebuild();
   }
 
+  /** "Show logs" on a value: that value only (for its label), other filters kept. */
   selectValue(label: string, value: string) {
-    this.setState({
-      ...this.clearedFilters(),
-      filters: [{ key: label, op: '=', value }],
-      tab: 'logs',
-      breakdown: undefined,
-    });
+    const filters = this.getLabelFilters().filter((f) => !(f.key === label && f.op === '='));
+    this.navigate(() => this.setState({ page: 'details', tab: 'logs', breakdown: undefined }));
+    this.setLabelFilters([...filters, { key: label, op: '=', value }]);
+    this.rebuild();
+  }
+
+  /** "Show logs" above the grid: the logs of the current filters. */
+  showLogs() {
+    this.navigate(() => this.setState({ page: 'details', tab: 'logs', breakdown: undefined }));
     this.rebuild();
   }
 
-  clearAll() {
-    this.setState({ ...this.clearedFilters(), breakdown: undefined, tab: 'logs' });
+  backToSelection() {
+    this.navigate(() => this.setState({ page: 'selection', breakdown: undefined }));
     this.rebuild();
   }
 
   setPrimaryLabel(label: string) {
-    this.setState({ primaryLabel: label === getAppConfig().serviceLabel ? undefined : label, search: '' });
+    const primaryLabel = label === getAppConfig().serviceLabel ? undefined : label;
+    this.navigate(() => this.setState({ primaryLabel, search: '' }));
     this.rebuild();
   }
 
+  addLabelTab(label: string) {
+    if (label !== getAppConfig().serviceLabel && !this.state.labelTabs.includes(label)) {
+      this.setState({ labelTabs: [...this.state.labelTabs, label] });
+    }
+    this.setPrimaryLabel(label);
+  }
+
+  removeLabelTab(label: string) {
+    const wasActive = this.primaryLabel() === label;
+    this.setState({ labelTabs: this.state.labelTabs.filter((t) => t !== label) });
+    if (wasActive) {
+      this.setPrimaryLabel(getAppConfig().serviceLabel);
+    }
+  }
+
   setSearch(search: string) {
     this.setState({ search });
     if (this.state.body instanceof ServiceSelectionScene) {
@@ -474,8 +757,10 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
   private buildBody(): SceneObject {
     const s = this.state;
     const config = getAppConfig();
+    const dsName = s.datasources?.find((d) => d.uid === s.datasource)?.name ?? s.datasource ?? '';
     if (s.viewsError) {
-      return this.message('error', 'Could not list your StarRocks log views', s.viewsError);
+      const others = (s.datasources?.length ?? 0) > 1 ? ' Try another data source.' : '';
+      return this.message('error', `Could not list your StarRocks log views in ${dsName}`, `${s.viewsError}${others}`);
     }
     if (s.views === undefined) {
       return new SceneReactObject({ reactNode: <Loading text="Loading your views…" /> });
@@ -484,13 +769,19 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
       return this.message(
         'info',
         'No log views available',
-        `StarRocks returned no views matching ${config.viewPrefix}* for your account. Ask for access to your team's log view.`
+        `StarRocks returned no views matching ${viewPrefixFor(config, s.datasource)}* in ${dsName} for your account. Ask for access to your team's log view${(s.datasources?.length ?? 0) > 1 ? ', or pick another data source' : ''}.`
       );
     }
+    if (!s.view || !s.views.includes(s.view)) {
+      // never stay without a view while the user has some: pick one
+      const views = s.views;
+      queueMicrotask(() => this.applyViews(views));
+      return new SceneReactObject({ reactNode: <Loading text="Opening view…" /> });
+    }
     if (s.ctxError) {
       return this.message('error', `Could not open ${s.view}`, s.ctxError);
     }
-    if (!s.view || !s.ctx) {
+    if (!s.ctx) {
       return new SceneReactObject({ reactNode: <Loading text="Opening view…" /> });
     }
     const spec = this.getSpec();
@@ -501,8 +792,8 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
 
     if (!this.isDetails()) {
       return new ServiceSelectionScene({
-        spec,
-        label: s.primaryLabel ?? config.serviceLabel,
+        spec: this.selectionSpec(),
+        label: this.primaryLabel(),
         search: s.search,
         withLevel: !levelSkipped,
         levelNotice: levelSkipped,
@@ -540,14 +831,11 @@ export class LogsExploration extends SceneObjectBase<LogsExplorationState> imple
 function LogsExplorationRenderer({ model }: SceneComponentProps<LogsExploration>) {
   const styles = useStyles2(getStyles);
   const state = model.useState();
-  const { views, view, body, controls, ctx, tab, primaryLabel } = state;
-  const config = getAppConfig();
+  const { views, view, body, controls, ctx, tab, datasources, datasource, datasourceProblems, labelFilters, page } =
+    state;
+  const { filters } = labelFilters.useState();
   const errors = getAppConfigErrors();
-  const details = model.isDetails();
-  const label = primaryLabel ?? config.serviceLabel;
-  const labelTabs = Array.from(new Set([config.serviceLabel, 'k8s_namespace_name', label])).filter(
-    (l) => !ctx || ctx.labels.includes(l)
-  );
+  const details = page === 'details';
 
   return (
     <div className={styles.wrapper}>
@@ -560,33 +848,67 @@ function LogsExplorationRenderer({ model }: SceneComponentProps<LogsExploration>
           </ul>
         </Alert>
       )}
-      <div className={styles.topRow}>
-        <span className={styles.label}>View</span>
-        <Select
-          width={48}
-          aria-label="View"
-          data-testid="view-picker"
-          isLoading={views === undefined}
-          options={(views ?? []).map((v) => ({ label: v, value: v }))}
-          value={view ?? null}
-          onChange={(o) => o.value && model.setView(o.value)}
-          placeholder="Select a view"
-        />
-        {details && (
-          <Button
-            size="md"
-            variant="secondary"
-            icon="arrow-left"
-            onClick={() => model.clearAll()}
-            data-testid="back-to-services"
-          >
-            All values of {label}
-          </Button>
-        )}
-        <div className={styles.spacer} />
-        {controls.map((c) => (
-          <c.Component key={c.state.key} model={c} />
-        ))}
+      <div className={styles.header}>
+        <div className={styles.left}>
+          <div className={styles.caption}>Labels</div>
+          <div className={styles.filterRow}>
+            <div className={styles.filters} data-testid="label-filters">
+              <labelFilters.Component model={labelFilters} />
+            </div>
+            {details ? (
+              <Button
+                variant="secondary"
+                icon="arrow-left"
+                onClick={() => model.backToSelection()}
+                data-testid="back-to-services"
+              >
+                Back to {displayLabel(model.primaryLabel())} values
+              </Button>
+            ) : (
+              <Button
+                variant={filters.length > 0 ? 'primary' : 'secondary'}
+                fill="outline"
+                onClick={() => model.showLogs()}
+                data-testid="show-logs"
+              >
+                Show logs
+              </Button>
+            )}
+          </div>
+        </div>
+        <div className={styles.right}>
+          <InlineField label="Data source">
+            <Select
+              width={22}
+              aria-label="Data source"
+              data-testid="datasource-picker"
+              isLoading={datasources === undefined}
+              options={(datasources ?? []).map((d) => ({
+                label: d.name,
+                value: d.uid,
+                description: datasourceProblems?.[d.uid],
+              }))}
+              value={datasource ?? null}
+              onChange={(o) => o.value && model.setDatasource(o.value)}
+              placeholder="Select a data source"
+            />
+          </InlineField>
+          <InlineField label="View">
+            <Select
+              width={34}
+              aria-label="View"
+              data-testid="view-picker"
+              isLoading={views === undefined}
+              options={(views ?? []).map((v) => ({ label: v, value: v }))}
+              value={view ?? null}
+              onChange={(o) => o.value && model.setView(o.value)}
+              placeholder="Select a view"
+            />
+          </InlineField>
+          {controls.map((c) => (
+            <c.Component key={c.state.key} model={c} />
+          ))}
+        </div>
       </div>
 
       {details ? (
@@ -608,42 +930,85 @@ function LogsExplorationRenderer({ model }: SceneComponentProps<LogsExploration>
                         ? ctx?.tenant.patterns.length
                         : undefined
                 }
-                data-testid={`tab-${t}`}
               />
             ))}
           </TabsBar>
         </>
       ) : (
-        view &&
-        ctx && (
-          <TabsBar>
-            {labelTabs.map((l) => (
-              <Tab
-                key={l}
-                label={l}
-                active={label === l}
-                onChangeTab={() => model.setPrimaryLabel(l)}
-                data-testid={`label-tab-${l}`}
-              />
-            ))}
-            <div className={styles.addLabel}>
-              <Select
-                width={28}
-                aria-label="Group by another label"
-                placeholder="+ Add label"
-                options={ctx.labels.filter((l) => !labelTabs.includes(l)).map((l) => ({ label: l, value: l }))}
-                value={null}
-                onChange={(o) => o.value && model.setPrimaryLabel(o.value)}
-              />
-            </div>
-          </TabsBar>
-        )
+        view && ctx && <LabelTabs model={model} />
       )}
       <div className={styles.body}>{body && <body.Component model={body} />}</div>
     </div>
   );
 }
 
+/** "service" tab, tabs added with "Add label" (closable), like Logs Drilldown. */
+function LabelTabs({ model }: { model: LogsExploration }) {
+  const styles = useStyles2(getStyles);
+  const { ctx, labelTabs } = model.useState();
+  const [adding, setAdding] = useState(false);
+  if (!ctx) {
+    return null;
+  }
+  const service = getAppConfig().serviceLabel;
+  const active = model.primaryLabel();
+  const tabs = Array.from(new Set([service, ...labelTabs, active])).filter((l) => ctx.labels.includes(l));
+  const remaining = ctx.labels.filter((l) => !tabs.includes(l));
+  return (
+    <TabsBar>
+      {tabs.map((l) => (
+        <Tab
+          key={l}
+          label={displayLabel(l)}
+          active={active === l}
+          onChangeTab={() => model.setPrimaryLabel(l)}
+          suffix={
+            l === service
+              ? undefined
+              : ({ className }: { className?: string }) => (
+                  <IconButton
+                    className={className}
+                    name="times"
+                    size="sm"
+                    aria-label={`Remove ${l} tab`}
+                    onClick={(e) => {
+                      e.stopPropagation();
+                      model.removeLabelTab(l);
+                    }}
+                  />
+                )
+          }
+        />
+      ))}
+      <div className={styles.addLabel}>
+        {adding ? (
+          <Select
+            width={30}
+            autoFocus
+            isOpen
+            openMenuOnFocus
+            aria-label="Search labels"
+            placeholder="Search labels"
+            options={remaining.map((l) => ({ label: l, value: l }))}
+            onChange={(o) => {
+              setAdding(false);
+              if (o.value) {
+                model.addLabelTab(o.value);
+              }
+            }}
+            onBlur={() => setAdding(false)}
+            onCloseMenu={() => setAdding(false)}
+          />
+        ) : (
+          <Button fill="text" icon="plus-circle" onClick={() => setAdding(true)} data-testid="add-label">
+            Add label
+          </Button>
+        )}
+      </div>
+    </TabsBar>
+  );
+}
+
 const getStyles = (theme: GrafanaTheme2) => ({
   // minWidth 0: long unwrapped log lines must not widen the page beyond the viewport
   wrapper: css({
@@ -654,9 +1019,34 @@ const getStyles = (theme: GrafanaTheme2) => ({
     minWidth: 0,
     width: '100%',
   }),
-  topRow: css({ display: 'flex', alignItems: 'center', gap: theme.spacing(1), flexWrap: 'wrap' }),
-  label: css({ color: theme.colors.text.secondary }),
-  spacer: css({ flex: 1 }),
+  header: css({
+    display: 'flex',
+    alignItems: 'flex-end',
+    justifyContent: 'space-between',
+    gap: theme.spacing(2),
+    flexWrap: 'wrap',
+  }),
+  // the pickers sit to the right of the label filters when there is room (about 1350 px of content), else
+  // they wrap under them, right-aligned; the filter box never gets narrower than 280 px
+  left: css({
+    display: 'flex',
+    flexDirection: 'column',
+    gap: theme.spacing(0.5),
+    flex: '1 1 440px',
+    minWidth: 'min-content',
+  }),
+  caption: css({ fontSize: theme.typography.bodySmall.fontSize, color: theme.colors.text.secondary }),
+  filterRow: css({ display: 'flex', alignItems: 'center', gap: theme.spacing(1) }),
+  filters: css({ flex: 1, minWidth: 280, maxWidth: 900 }),
+  // stays right-aligned when a narrow window wraps it under the label filters
+  right: css({
+    display: 'flex',
+    alignItems: 'center',
+    justifyContent: 'flex-end',
+    gap: theme.spacing(1),
+    flexWrap: 'wrap',
+    marginLeft: 'auto',
+  }),
   addLabel: css({ marginLeft: theme.spacing(1), alignSelf: 'center' }),
   body: css({ paddingTop: theme.spacing(1), minWidth: 0 }),
 });
````

### 22/41 `src/components/LogsTabScene.tsx` (modified)

Logs tab: Explore link uses the selected data source; panel title "Logs"

PATCH-BLOCK 22/41 src/components/LogsTabScene.tsx old=894d7b84af7a76fee94f72117f0860b133c9b320 new=ad73925eed2ac8e2dd5103c9d5ca427b3aaefe69 sha256=a3c9d4617e6d9636909e487f92feaab87cb5cfa4778a6adf6827f86a0b946c8b
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/LogsTabScene.tsx b/plugins/kotak-starrocks-logs-app/src/components/LogsTabScene.tsx
index 894d7b8..ad73925 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/LogsTabScene.tsx
+++ b/plugins/kotak-starrocks-logs-app/src/components/LogsTabScene.tsx
@@ -68,7 +68,8 @@ export class LogsTabScene extends SceneObjectBase<LogsTabState> {
       main = logsPanel(api, queryRunner('logs', spec, { limit, sort }), {
         sort,
         wrap,
-        title: `Logs (newest ${limit})`,
+        // the line limit is the page size: scrolling to the end loads the next page
+        title: 'Logs',
       });
     }
     this.setState({ volume, main });
@@ -86,7 +87,9 @@ export class LogsTabScene extends SceneObjectBase<LogsTabState> {
       ctx,
       tr.value
     );
-    const { datasource } = getAppConfig();
+    const config = getAppConfig();
+    // the data source selected in the app (each one is a different StarRocks database)
+    const datasource = { type: config.datasource.type, uid: this.state.spec.datasource || config.datasource.uid };
     const panes = {
       a: {
         datasource: datasource.uid,
````

### 23/41 `src/components/ServiceSelectionScene.tsx` (modified)

service grid: search dropdown, page size and pages, favourites, Include / Remove, Show logs, legend table

PATCH-BLOCK 23/41 src/components/ServiceSelectionScene.tsx old=6fa158c4acf1bab7096f07d329b9332a05236332 new=edf5193c25a3663d07bed1f9e870a9b85b9d324c sha256=ca95c1bce3b08f835b32b4d0591c4756f94b931375c37b989d55db088c3ead6c
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/ServiceSelectionScene.tsx b/plugins/kotak-starrocks-logs-app/src/components/ServiceSelectionScene.tsx
index 6fa158c..edf5193 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/ServiceSelectionScene.tsx
+++ b/plugins/kotak-starrocks-logs-app/src/components/ServiceSelectionScene.tsx
@@ -10,11 +10,12 @@ import {
   VizPanel,
   sceneGraph,
 } from '@grafana/scenes';
-import { Alert, Button, Icon, Input, Select, useStyles2 } from '@grafana/ui';
+import { Alert, Button, Icon, IconButton, Pagination, Select, Tooltip, useStyles2 } from '@grafana/ui';
 
 import { runLogsQuery } from '../datasource/StarRocksLogsDataSource';
+import { getFavorites, toggleFavorite } from '../state/storage';
 import { QuerySpec } from '../state/types';
-import { getExploration } from './api';
+import { displayLabel, getExploration } from './api';
 import { barsPanel, queryRunner, staticData } from './panels';
 import { ErrorBox, Loading, SampleList } from './ui';
 
@@ -24,6 +25,7 @@ interface ServiceValue {
 }
 
 export interface ServiceSelectionState extends SceneObjectState {
+  /** label filters except those on `label` (the grid shows every value of its own label) */
   spec: QuerySpec;
   label: string;
   search: string;
@@ -32,6 +34,7 @@ export interface ServiceSelectionState extends SceneObjectState {
   page: number;
   pageSize: number;
   values?: ServiceValue[];
+  favorites: string[];
   panels: VizPanel[];
   samples: Record<string, DataFrame>;
   samplesLoading?: boolean;
@@ -39,24 +42,29 @@ export interface ServiceSelectionState extends SceneObjectState {
   $data: SceneQueryRunner;
 }
 
+export const PAGE_SIZES = [10, 20, 50, 100];
+const DEFAULT_PAGE_SIZE = 20;
+
 /**
- * Landing view after a view is picked: one row per value of the grouping label (k8s_service_name by default)
- * with its log volume by level and its newest lines. Volumes for all values come from one GROUP BY query;
- * the newest lines for the visible page come from one UNION ALL query.
+ * Landing view after a view is picked, like Logs Drilldown's service selection: one row per value of the
+ * grouping label (the service by default) with its volume by level, favourite / Include / Show logs buttons
+ * and its newest lines. Volumes for all values come from one GROUP BY query; the newest lines of the
+ * visible page come from one UNION ALL query.
  */
 export class ServiceSelectionScene extends SceneObjectBase<ServiceSelectionState> {
   static Component = ServiceSelectionRenderer;
   private samplesSub?: Unsubscribable;
 
   constructor(
-    state: Omit<ServiceSelectionState, '$data' | 'panels' | 'samples' | 'page' | 'pageSize'> &
+    state: Omit<ServiceSelectionState, '$data' | 'panels' | 'samples' | 'page' | 'pageSize' | 'favorites'> &
       Partial<ServiceSelectionState>
   ) {
     super({
       page: 0,
-      pageSize: 10,
+      pageSize: DEFAULT_PAGE_SIZE,
       panels: [],
       samples: {},
+      favorites: getFavorites(state.spec.datasource, state.spec.view, state.label),
       $data: queryRunner('serviceVolume', state.spec, { label: state.label, withLevel: state.withLevel }),
       ...state,
     });
@@ -84,9 +92,14 @@ export class ServiceSelectionScene extends SceneObjectBase<ServiceSelectionState
       const v = String(f.meta?.custom?.value ?? '');
       totals.set(v, (totals.get(v) ?? 0) + Number(f.meta?.custom?.total ?? 0));
     }
+    // favourites first (as of loading: starring a value does not move rows around), then by volume
+    const fav = new Set(this.state.favorites);
     const values = Array.from(totals.entries())
       .map(([value, total]) => ({ value, total }))
-      .sort((a, b) => b.total - a.total || a.value.localeCompare(b.value));
+      .sort(
+        (a, b) =>
+          Number(fav.has(b.value)) - Number(fav.has(a.value)) || b.total - a.total || a.value.localeCompare(b.value)
+      );
     this.setState({ values });
     this.buildPage();
   }
@@ -102,6 +115,9 @@ export class ServiceSelectionScene extends SceneObjectBase<ServiceSelectionState
   }
 
   setSearch(search: string) {
+    if (search === this.state.search) {
+      return;
+    }
     this.setState({ search, page: 0 });
     this.buildPage();
   }
@@ -111,12 +127,16 @@ export class ServiceSelectionScene extends SceneObjectBase<ServiceSelectionState
     this.buildPage();
   }
 
+  toggleFavorite(value: string) {
+    const { spec, label } = this.state;
+    this.setState({ favorites: toggleFavorite(spec.datasource, spec.view, label, value) });
+  }
+
   private buildPage() {
     const data = this.state.$data.state.data;
     if (!data) {
       return;
     }
-    const { label } = this.state;
     const panels = this.visible().map(({ value, total }) =>
       barsPanel(
         value === '' ? '(empty)' : value,
@@ -125,19 +145,9 @@ export class ServiceSelectionScene extends SceneObjectBase<ServiceSelectionState
           data.timeRange
         ),
         {
-          legend: false,
+          legendTable: true,
           description: `${total.toLocaleString()} lines`,
-          headerActions: (
-            <Button
-              size="sm"
-              variant="primary"
-              fill="outline"
-              data-testid={`show-logs-${value}`}
-              onClick={() => getExploration(this).selectValue(label, value)}
-            >
-              Show logs
-            </Button>
-          ),
+          headerActions: <RowActions scene={this} value={value} />,
         }
       )
     );
@@ -177,7 +187,46 @@ export class ServiceSelectionScene extends SceneObjectBase<ServiceSelectionState
   }
 }
 
-const PAGE_SIZES = [10, 20, 50].map((n) => ({ label: String(n), value: n }));
+/** Buttons in a row's header: favourite, Include / Remove (label filter), Show logs. */
+function RowActions({ scene, value }: { scene: ServiceSelectionScene; value: string }) {
+  const styles = useStyles2(getStyles);
+  const api = getExploration(scene);
+  const { label, favorites } = scene.useState();
+  // re-render when the label filters change (Include here, or the combobox)
+  api.getLabelFiltersVariable().useState();
+  const included = api.hasFilter(label, value, '=');
+  const favorite = favorites.includes(value);
+  return (
+    <span className={styles.actions}>
+      <IconButton
+        name={favorite ? 'favorite' : 'star'}
+        className={favorite ? styles.favorite : undefined}
+        tooltip={favorite ? 'Remove from favourites' : 'Add to favourites (shown first)'}
+        onClick={() => scene.toggleFavorite(value)}
+        data-testid={`favorite-${value}`}
+      />
+      <Button
+        size="sm"
+        variant="secondary"
+        fill="outline"
+        tooltip={included ? `Remove ${displayLabel(label)} = ${value} from the filters` : `Filter by ${value}`}
+        onClick={() => (included ? api.removeLabelFilter(label, value) : api.addFilter({ key: label, op: '=', value }))}
+        data-testid={`include-${value}`}
+      >
+        {included ? 'Remove' : 'Include'}
+      </Button>
+      <Button
+        size="sm"
+        variant="primary"
+        fill="outline"
+        onClick={() => api.selectValue(label, value)}
+        data-testid={`show-logs-${value}`}
+      >
+        Show logs
+      </Button>
+    </span>
+  );
+}
 
 function ServiceSelectionRenderer({ model }: SceneComponentProps<ServiceSelectionScene>) {
   const styles = useStyles2(getStyles);
@@ -187,46 +236,54 @@ function ServiceSelectionRenderer({ model }: SceneComponentProps<ServiceSelectio
   const filtered = model.filtered();
   const visible = model.visible();
   const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
+  const name = displayLabel(label);
 
   const header = (
     <div className={styles.header}>
-      <Input
-        width={40}
-        prefix={<Icon name="search" />}
-        placeholder={`Search ${label} values`}
-        value={search}
-        onChange={(e) => getExploration(model).setSearch(e.currentTarget.value)}
-        data-testid="service-search"
-      />
-      <span className={styles.muted}>
-        Showing {visible.length} of {filtered.length}
-      </span>
-      <Select
-        width={10}
-        options={PAGE_SIZES}
-        value={pageSize}
-        onChange={(o) => model.setPage(0, o.value!)}
-        aria-label="Page size"
-      />
-      <Button
-        size="sm"
-        variant="secondary"
-        icon="angle-left"
-        disabled={page === 0}
-        onClick={() => model.setPage(page - 1)}
-        aria-label="Previous page"
-      />
-      <span className={styles.muted}>
-        {page + 1} / {pages}
+      <div className={styles.search} data-testid="service-search">
+        <Select
+          aria-label="Search values"
+          placeholder={`Search ${name === 'service' ? 'services' : `${name} values`}`}
+          prefix={<Icon name="search" />}
+          isClearable
+          options={filtered.slice(0, 200).map((v) => ({
+            label: v.value === '' ? '(empty)' : v.value,
+            value: v.value,
+            description: `${v.total.toLocaleString()} lines`,
+          }))}
+          value={null}
+          inputValue={search}
+          onInputChange={(text, meta) => {
+            if (meta.action === 'input-change') {
+              getExploration(model).setSearch(text);
+            }
+          }}
+          onChange={(o) => getExploration(model).setSearch(o?.value ?? '')}
+          noOptionsMessage={`No ${name} values match`}
+        />
+      </div>
+      <span className={styles.showing}>
+        Showing
+        <Select
+          width={9}
+          aria-label="Page size"
+          options={PAGE_SIZES.map((n) => ({ label: String(n), value: n }))}
+          value={pageSize}
+          onChange={(o) => o.value && model.setPage(0, o.value)}
+        />
+        of {filtered.length}
+        <Tooltip content={`Sorted by log volume in the time range; favourites (★) first.`}>
+          <Icon name="info-circle" className={styles.muted} />
+        </Tooltip>
       </span>
-      <Button
-        size="sm"
-        variant="secondary"
-        icon="angle-right"
-        disabled={page + 1 >= pages}
-        onClick={() => model.setPage(page + 1)}
-        aria-label="Next page"
-      />
+      <div className={styles.pagination}>
+        <Pagination
+          currentPage={page + 1}
+          numberOfPages={pages}
+          onNavigate={(p) => model.setPage(p - 1)}
+          hideWhenSinglePage
+        />
+      </div>
     </div>
   );
 
@@ -241,7 +298,7 @@ function ServiceSelectionRenderer({ model }: SceneComponentProps<ServiceSelectio
   if (data.state === LoadingState.Error) {
     return (
       <ErrorBox
-        title="Could not load the service volumes"
+        title={`Could not load the ${name} volumes`}
         error={data.errors?.[0]?.message ?? data.error?.message ?? 'error'}
       />
     );
@@ -255,7 +312,11 @@ function ServiceSelectionRenderer({ model }: SceneComponentProps<ServiceSelectio
           see levels.
         </Alert>
       )}
-      {filtered.length === 0 && <div className={styles.muted}>No logs in the selected time range.</div>}
+      {filtered.length === 0 && (
+        <div className={styles.muted}>
+          {search !== '' ? `No ${name} values match "${search}".` : 'No logs in the selected time range.'}
+        </div>
+      )}
       {visible.map((v, i) => {
         const panel = panels[i];
         return (
@@ -267,6 +328,11 @@ function ServiceSelectionRenderer({ model }: SceneComponentProps<ServiceSelectio
           </div>
         );
       })}
+      {pages > 1 && (
+        <div className={styles.footer}>
+          <Pagination currentPage={page + 1} numberOfPages={pages} onNavigate={(p) => model.setPage(p - 1)} />
+        </div>
+      )}
     </div>
   );
 }
@@ -275,13 +341,25 @@ const getStyles = (theme: GrafanaTheme2) => ({
   header: css({
     display: 'flex',
     alignItems: 'center',
-    gap: theme.spacing(1),
+    gap: theme.spacing(2),
     marginBottom: theme.spacing(1),
     flexWrap: 'wrap',
   }),
+  search: css({ flex: '1 1 320px', maxWidth: 520 }),
+  showing: css({
+    display: 'inline-flex',
+    alignItems: 'center',
+    gap: theme.spacing(1),
+    color: theme.colors.text.secondary,
+    whiteSpace: 'nowrap',
+  }),
+  pagination: css({ marginLeft: 'auto' }),
+  footer: css({ display: 'flex', justifyContent: 'flex-end', marginTop: theme.spacing(1) }),
   muted: css({ color: theme.colors.text.secondary }),
-  row: css({ display: 'flex', gap: theme.spacing(1), height: 200, marginBottom: theme.spacing(1), minWidth: 0 }),
-  volume: css({ width: '38%', minWidth: 280, height: '100%' }),
+  actions: css({ display: 'inline-flex', alignItems: 'center', gap: theme.spacing(1) }),
+  favorite: css({ color: theme.colors.warning.main }),
+  row: css({ display: 'flex', gap: theme.spacing(1), height: 220, marginBottom: theme.spacing(1), minWidth: 0 }),
+  volume: css({ width: '42%', minWidth: 320, height: '100%' }),
   lines: css({
     flex: 1,
     minWidth: 0,
````

### 24/41 `src/components/api.ts` (modified)

interface between screens (label filter variable, Include / Remove, display names)

PATCH-BLOCK 24/41 src/components/api.ts old=2fc3c42e6bd60687060c66c1756ff704684c97ea new=73003a5a36342df12fb6ac9406dff410c38a6167 sha256=86f6d0139fcc0c16f0ab2ca671e980224ea9a4cd278ab1a260474e0d45b91f6e
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/api.ts b/plugins/kotak-starrocks-logs-app/src/components/api.ts
index 2fc3c42..73003a5 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/api.ts
+++ b/plugins/kotak-starrocks-logs-app/src/components/api.ts
@@ -1,5 +1,6 @@
-import { SceneObject } from '@grafana/scenes';
+import { AdHocFiltersVariable, SceneObject } from '@grafana/scenes';
 
+import { getAppConfig } from '../config/config';
 import { BuildContext } from '../sql/builder';
 import { LabelFilter, LineFilter, MessageFieldFilter, PatternFilter, QuerySpec } from '../state/types';
 
@@ -14,7 +15,12 @@ export interface ExplorationApi {
   getDisplay(): { display: Display; sort: 'desc' | 'asc'; limit: number; wrap: boolean };
   setDisplay(d: Partial<{ display: Display; sort: 'desc' | 'asc'; limit: number; wrap: boolean }>): void;
   addFilter(f: LabelFilter): void;
+  removeLabelFilter(key: string, value: string): void;
   hasFilter(key: string, value: string, op?: LabelFilter['op']): boolean;
+  /** the "Filter by label values" combobox (source of truth for label filters) */
+  getLabelFiltersVariable(): AdHocFiltersVariable;
+  /** go from the value grid to the logs with the current filters */
+  showLogs(): void;
   setLevels(levels: string[]): void;
   addLineFilter(f: LineFilter): void;
   togglePatternFilter(name: string, op: PatternFilter['op']): void;
@@ -42,3 +48,8 @@ export function getExploration(obj: SceneObject): ExplorationApi {
   }
   throw new Error('LogsExploration not found');
 }
+
+/** Name shown for a label: the service label is "service", like Logs Drilldown. */
+export function displayLabel(label: string): string {
+  return label === getAppConfig().serviceLabel ? 'service' : label;
+}
````

### 25/41 `src/components/panels.tsx` (modified)

logs panel with infinite scrolling; legend table option

PATCH-BLOCK 25/41 src/components/panels.tsx old=5de74be819f1dd60eb6cd1987520da0445408623 new=5773be5d36008cfe5b99e32e3919e044a8edcb2b sha256=5065355ea2323bc4d4f7b0f77bd1a144cdb0ac54afeb231da6168a186b4fbe0c
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/components/panels.tsx b/plugins/kotak-starrocks-logs-app/src/components/panels.tsx
index 5de74be..5773be5 100644
--- a/plugins/kotak-starrocks-logs-app/src/components/panels.tsx
+++ b/plugins/kotak-starrocks-logs-app/src/components/panels.tsx
@@ -38,7 +38,13 @@ export function staticData(frames: DataFrame[], timeRange: TimeRange): SceneData
 export function barsPanel(
   title: string,
   data: SceneDataProvider | undefined,
-  opts: { headerActions?: VizPanel['state']['headerActions']; legend?: boolean; description?: string } = {}
+  opts: {
+    headerActions?: VizPanel['state']['headerActions'];
+    legend?: boolean;
+    /** legend as a table on the right with the total per series (service rows, like Logs Drilldown) */
+    legendTable?: boolean;
+    description?: string;
+  } = {}
 ): VizPanel {
   const b = PanelBuilders.timeseries()
     .setTitle(title)
@@ -47,12 +53,12 @@ export function barsPanel(
     .setCustomFieldConfig('lineWidth', 0)
     .setCustomFieldConfig('pointSize', 0)
     .setCustomFieldConfig('stacking', { mode: StackingMode.Normal, group: 'A' })
-    .setOption('legend', {
-      showLegend: opts.legend ?? true,
-      displayMode: LegendDisplayMode.List,
-      placement: 'bottom',
-      calcs: [],
-    })
+    .setOption(
+      'legend',
+      opts.legendTable
+        ? { showLegend: true, displayMode: LegendDisplayMode.Table, placement: 'right', calcs: ['sum'] }
+        : { showLegend: opts.legend ?? true, displayMode: LegendDisplayMode.List, placement: 'bottom', calcs: [] }
+    )
     .setOption('tooltip', { mode: TooltipDisplayMode.Multi, sort: SortOrder.Descending })
     .setMin(0)
     .setOverrides((o) => {
@@ -97,7 +103,8 @@ export function logsPanel(
     .setOption('wrapLogMessage', opts.wrap)
     .setOption('prettifyLogMessage', false)
     .setOption('enableLogDetails', true)
-    .setOption('enableInfiniteScrolling', false)
+    // scrolling to the end loads the next lines (the panel re-queries with a narrower time range)
+    .setOption('enableInfiniteScrolling', true)
     .setOption('showLabels', false)
     .setOption('showCommonLabels', false)
     .setOption('showLogContextToggle', true)
````

### 26/41 `src/config/config.test.ts` (modified)

unit tests: `datasources`, per-database tenants

PATCH-BLOCK 26/41 src/config/config.test.ts old=0f598fd1508b771d5c455ea61adc95e3ee789818 new=a3961e340df722572f127569f256f36d98c73685 sha256=ddd5061dc842a30c26c295d1a41d01e16d988859320804c340ffd8fe5cfb9dae
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/config/config.test.ts b/plugins/kotak-starrocks-logs-app/src/config/config.test.ts
index 0f598fd..a3961e3 100644
--- a/plugins/kotak-starrocks-logs-app/src/config/config.test.ts
+++ b/plugins/kotak-starrocks-logs-app/src/config/config.test.ts
@@ -1,5 +1,5 @@
 import { DEFAULT_MESSAGE_LEVEL_REGEX } from '../constants';
-import { DEFAULT_CONFIG, resolveConfig, resolveTenant, tenantKeyForView } from './config';
+import { DEFAULT_CONFIG, resolveConfig, resolveTenant, tenantKeyForView, viewPrefixFor } from './config';
 
 describe('resolveConfig', () => {
   it('uses defaults for empty jsonData', () => {
@@ -77,3 +77,53 @@ describe('resolveTenant', () => {
     expect(other.level).toEqual({ source: 'column', regex: [] });
   });
 });
+
+describe('several data sources (one per StarRocks database)', () => {
+  it('parses the datasources list: uids, {uid, viewPrefix}, and reports bad entries', () => {
+    const { config, errors } = resolveConfig({
+      datasourceUid: 'db1',
+      datasources: [
+        'db1',
+        { uid: 'db2', viewPrefix: 'vw_other_' },
+        'db1',
+        { uid: 'bad uid' },
+        { uid: 'db3', viewPrefix: 'x-y' },
+      ],
+    });
+    expect(config.datasource.uid).toBe('db1');
+    expect(config.datasources).toEqual([{ uid: 'db1' }, { uid: 'db2', viewPrefix: 'vw_other_' }]);
+    expect(errors).toHaveLength(3);
+  });
+
+  it('defaults to an empty list (= every instance of the plugin type)', () => {
+    expect(resolveConfig({}).config.datasources).toEqual([]);
+  });
+
+  it('uses the data source view prefix to find the tenant', () => {
+    const { config } = resolveConfig({
+      datasources: ['db1', { uid: 'db2', viewPrefix: 'vw_other_' }],
+      tenants: { app_7: { level: { source: 'message' } } },
+    });
+    expect(viewPrefixFor(config, 'db2')).toBe('vw_other_');
+    expect(viewPrefixFor(config, 'db1')).toBe('vw_eks_app_logs_');
+    expect(resolveTenant(config, 'vw_other_app_7', 'db2').key).toBe('app_7');
+    expect(resolveTenant(config, 'vw_other_app_7', 'db2').level.source).toBe('message');
+  });
+
+  it('prefers <datasourceUid>/<app_id> settings field by field, then app_id, then default', () => {
+    const { config, errors } = resolveConfig({
+      tenants: {
+        default: { patterns: [{ name: 'd', like: '%d%' }] },
+        app_1: { level: { source: 'message' }, trace: { regex: 't=(\\w+)', tempoUid: 'tempo' } },
+        'db2/app_1': { level: { source: 'column' } },
+        'not valid/x': {},
+      },
+    });
+    expect(errors).toEqual(['tenants: "not valid/x" is not an app_id or <datasourceUid>/<app_id>']);
+    const inDb2 = resolveTenant(config, 'vw_eks_app_logs_app_1', 'db2');
+    expect(inDb2.level.source).toBe('column');
+    expect(inDb2.trace?.tempoUid).toBe('tempo');
+    expect(inDb2.patterns).toEqual([{ name: 'd', like: '%d%' }]);
+    expect(resolveTenant(config, 'vw_eks_app_logs_app_1', 'db1').level.source).toBe('message');
+  });
+});
````

### 27/41 `src/config/config.ts` (modified)

`datasources` setting, `viewPrefixFor`, `<datasourceUid>/<app_id>` tenants

PATCH-BLOCK 27/41 src/config/config.ts old=e487726c1e57b0291881b1779cc57b7e22b12966 new=51bdcf606486118180bc984c9936ec0243994c91 sha256=b7009b7abe656a7035969adbe8b3dfa96a3ce0970e46493bcda846da008b2e37
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/config/config.ts b/plugins/kotak-starrocks-logs-app/src/config/config.ts
index e487726..51bdcf6 100644
--- a/plugins/kotak-starrocks-logs-app/src/config/config.ts
+++ b/plugins/kotak-starrocks-logs-app/src/config/config.ts
@@ -29,10 +29,24 @@ export interface TenantConfig {
   patterns?: PatternConfig[];
 }
 
+/** One StarRocks data source (one database) offered in the app's data source picker. */
+export interface DatasourceEntry {
+  uid: string;
+  /** views of this data source are named <viewPrefix><app_id>; default: the top-level viewPrefix */
+  viewPrefix?: string;
+}
+
 /** jsonData of the app (provisioned through provisioning/plugins or edited on the configuration page). */
 export interface AppJsonData {
+  /** the data source selected by default */
   datasourceUid?: string;
   datasourceType?: string;
+  /**
+   * Data sources offered in the picker, in this order (uids, or {uid, viewPrefix}). Each
+   * kotak-starrocks-datasource instance is scoped to one database. Default: every instance of
+   * datasourceType that the user can see.
+   */
+  datasources?: Array<string | DatasourceEntry>;
   viewPrefix?: string;
   serviceLabel?: string;
   defaultTimeRange?: string;
@@ -40,7 +54,10 @@ export interface AppJsonData {
   lineLimit?: number;
   labels?: string[];
   fields?: string[];
-  /** keyed by app_id (the view name without the prefix); "default" applies to every tenant */
+  /**
+   * keyed by app_id (the view name without the prefix), or <datasourceUid>/<app_id> for settings that only
+   * apply in one data source; "default" applies to every tenant
+   */
   tenants?: Record<string, TenantConfig>;
 }
 
@@ -52,7 +69,10 @@ export interface ResolvedTenant {
 }
 
 export interface ResolvedConfig {
+  /** default data source and the plugin type of all data sources the app uses */
   datasource: { uid: string; type: string };
+  /** explicit list for the picker; empty = every instance of datasource.type */
+  datasources: DatasourceEntry[];
   viewPrefix: string;
   serviceLabel: string;
   defaultTimeRange: string;
@@ -65,6 +85,7 @@ export interface ResolvedConfig {
 
 export const DEFAULT_CONFIG: ResolvedConfig = {
   datasource: { uid: 'app-logs-starrocks-db', type: 'kotak-starrocks-datasource' },
+  datasources: [],
   viewPrefix: 'vw_eks_app_logs_',
   serviceLabel: 'k8s_service_name',
   defaultTimeRange: 'now-15m',
@@ -77,6 +98,9 @@ export const DEFAULT_CONFIG: ResolvedConfig = {
 
 const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
 const PREFIX = /^[A-Za-z0-9_]+$/;
+const DS_UID = /^[A-Za-z0-9._-]{1,128}$/;
+// app_id, or <datasourceUid>/<app_id>
+const TENANT_KEY = /^(?:[A-Za-z0-9._-]{1,128}\/)?[A-Za-z0-9_]+$/;
 
 export function isIdentifier(s: unknown): s is string {
   return typeof s === 'string' && IDENT.test(s);
@@ -109,7 +133,7 @@ function asList(v: string | string[] | undefined): string[] {
 export function resolveConfig(jsonData?: AppJsonData | null): { config: ResolvedConfig; errors: string[] } {
   const j = jsonData ?? {};
   const errors: string[] = [];
-  const c: ResolvedConfig = { ...DEFAULT_CONFIG, tenants: {} };
+  const c: ResolvedConfig = { ...DEFAULT_CONFIG, datasources: [], tenants: {} };
 
   if (j.datasourceUid !== undefined) {
     if (typeof j.datasourceUid === 'string' && j.datasourceUid.trim() !== '') {
@@ -121,6 +145,34 @@ export function resolveConfig(jsonData?: AppJsonData | null): { config: Resolved
   if (typeof j.datasourceType === 'string' && j.datasourceType.trim() !== '') {
     c.datasource = { ...c.datasource, type: j.datasourceType.trim() };
   }
+  if (j.datasources !== undefined) {
+    if (!Array.isArray(j.datasources)) {
+      errors.push('datasources must be a list of data source uids');
+    } else {
+      for (const d of j.datasources) {
+        const entry: DatasourceEntry | undefined =
+          typeof d === 'string' ? { uid: d } : d && typeof d === 'object' && typeof d.uid === 'string' ? d : undefined;
+        if (!entry || !DS_UID.test(entry.uid)) {
+          errors.push(`datasources: ${JSON.stringify(d)} is not a data source uid`);
+          continue;
+        }
+        if (
+          entry.viewPrefix !== undefined &&
+          !(typeof entry.viewPrefix === 'string' && PREFIX.test(entry.viewPrefix))
+        ) {
+          errors.push(
+            `datasources.${entry.uid}.viewPrefix "${entry.viewPrefix}" may only contain letters, digits and _`
+          );
+          continue;
+        }
+        if (c.datasources.some((x) => x.uid === entry.uid)) {
+          errors.push(`datasources: "${entry.uid}" is listed twice`);
+          continue;
+        }
+        c.datasources.push(entry.viewPrefix ? { uid: entry.uid, viewPrefix: entry.viewPrefix } : { uid: entry.uid });
+      }
+    }
+  }
   if (j.viewPrefix !== undefined) {
     if (typeof j.viewPrefix === 'string' && PREFIX.test(j.viewPrefix)) {
       c.viewPrefix = j.viewPrefix;
@@ -174,8 +226,8 @@ export function resolveConfig(jsonData?: AppJsonData | null): { config: Resolved
   }
 
   for (const [key, t] of Object.entries(j.tenants ?? {})) {
-    if (key !== 'default' && !PREFIX.test(key)) {
-      errors.push(`tenants: "${key}" is not an app_id`);
+    if (key !== 'default' && !TENANT_KEY.test(key)) {
+      errors.push(`tenants: "${key}" is not an app_id or <datasourceUid>/<app_id>`);
       continue;
     }
     c.tenants[key] = validateTenant(key, t ?? {}, errors);
@@ -245,12 +297,21 @@ export function tenantKeyForView(view: string, prefix: string): string {
   return view.startsWith(prefix) ? view.slice(prefix.length) : view;
 }
 
-/** Merges the "default" tenant with the view's tenant. */
-export function resolveTenant(config: ResolvedConfig, view: string): ResolvedTenant {
-  const key = tenantKeyForView(view, config.viewPrefix);
+/** View name prefix of a data source (its own, or the top-level viewPrefix). */
+export function viewPrefixFor(config: ResolvedConfig, datasourceUid?: string): string {
+  return config.datasources.find((d) => d.uid === datasourceUid)?.viewPrefix ?? config.viewPrefix;
+}
+
+/**
+ * Settings for a view: each field comes from tenants["<datasourceUid>/<app_id>"], then tenants["<app_id>"],
+ * then tenants.default.
+ */
+export function resolveTenant(config: ResolvedConfig, view: string, datasourceUid?: string): ResolvedTenant {
+  const key = tenantKeyForView(view, viewPrefixFor(config, datasourceUid));
   const d = config.tenants.default ?? {};
   const t = config.tenants[key] ?? {};
-  const level = t.level ?? d.level ?? { source: 'column' };
+  const s = (datasourceUid && config.tenants[`${datasourceUid}/${key}`]) || {};
+  const level = s.level ?? t.level ?? d.level ?? { source: 'column' };
   const regex = level.source === 'message' ? asList(level.regex) : [];
   return {
     key,
@@ -258,8 +319,8 @@ export function resolveTenant(config: ResolvedConfig, view: string): ResolvedTen
       source: level.source,
       regex: level.source === 'message' && regex.length === 0 ? DEFAULT_MESSAGE_LEVEL_REGEX : regex,
     },
-    trace: t.trace ?? d.trace,
-    patterns: t.patterns ?? d.patterns ?? [],
+    trace: s.trace ?? t.trace ?? d.trace,
+    patterns: s.patterns ?? t.patterns ?? d.patterns ?? [],
   };
 }
 
````

### 28/41 `src/constants.ts` (modified)

app title, time picker quick ranges (5 minutes to 24 hours)

PATCH-BLOCK 28/41 src/constants.ts old=11ca464b2db42c122d9b28d4132b8bd9a485e4a9 new=3b0a4688f10c0d3660074d1535cd88bff2cd99da sha256=be5b27a669846b973b8f70aee51be4bf8add0a26da64b1b880d518036682ef69
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/constants.ts b/plugins/kotak-starrocks-logs-app/src/constants.ts
index 11ca464..3b0a468 100644
--- a/plugins/kotak-starrocks-logs-app/src/constants.ts
+++ b/plugins/kotak-starrocks-logs-app/src/constants.ts
@@ -1,4 +1,18 @@
 export const PLUGIN_ID = 'kotak-starrocks-logs-app';
+export const APP_TITLE = 'Logs Drilldown (StarRocks)';
+
+// Time picker quick ranges: up to 24 hours (longer ranges scan a lot of data on the shared cluster; an
+// absolute range can still be typed, and the scan guard applies).
+export const QUICK_RANGES = [
+  { from: 'now-5m', to: 'now', display: 'Last 5 minutes' },
+  { from: 'now-15m', to: 'now', display: 'Last 15 minutes' },
+  { from: 'now-30m', to: 'now', display: 'Last 30 minutes' },
+  { from: 'now-1h', to: 'now', display: 'Last 1 hour' },
+  { from: 'now-3h', to: 'now', display: 'Last 3 hours' },
+  { from: 'now-6h', to: 'now', display: 'Last 6 hours' },
+  { from: 'now-12h', to: 'now', display: 'Last 12 hours' },
+  { from: 'now-24h', to: 'now', display: 'Last 24 hours' },
+];
 export const PLUGIN_BASE_URL = `/a/${PLUGIN_ID}`;
 export const EXPLORE_ROUTE = `${PLUGIN_BASE_URL}/explore`;
 
````

### 29/41 `src/datasource/StarRocksLogsDataSource.ts` (modified)

queries go to the selected data source; logs pages with exact time bounds

PATCH-BLOCK 29/41 src/datasource/StarRocksLogsDataSource.ts old=835704599c9bc1a4c2a6f45c8d810f2746aa0c42 new=7b39a416caf303e2a95205373a6f27779915606d sha256=9c05dd1775ee776165195290bfdf43c6928db50be419ec573aba718259c50da1
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/StarRocksLogsDataSource.ts b/plugins/kotak-starrocks-logs-app/src/datasource/StarRocksLogsDataSource.ts
index 8357045..7b39a41 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/StarRocksLogsDataSource.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/StarRocksLogsDataSource.ts
@@ -39,6 +39,7 @@ import {
   serviceVolumeQuery,
   valueBreakdownQuery,
   volumeQuery,
+  widenToSeconds,
 } from '../sql/builder';
 import { QueryKind, QueryParams, QuerySpec } from '../state/types';
 import { fetchColumns, runSql } from './api';
@@ -69,14 +70,14 @@ const ALL_COLUMNS = [
   ...DEFAULT_FIELDS,
 ];
 
-export async function buildContext(view: string, range: TimeRange): Promise<BuildContext> {
+export async function buildContext(view: string, range: TimeRange, datasource = ''): Promise<BuildContext> {
   const config = getAppConfig();
-  let columns = await fetchColumns(view, range);
+  let columns = await fetchColumns(view, range, datasource);
   if (columns.length === 0) {
     columns = ALL_COLUMNS;
   }
   return {
-    tenant: resolveTenant(config, view),
+    tenant: resolveTenant(config, view, datasource || config.datasource.uid),
     columns,
     labels: config.labels.filter((c) => columns.includes(c)),
     fields: config.fields.filter((c) => columns.includes(c)),
@@ -101,7 +102,11 @@ export function buildSql(q: LogsAppQuery, ctx: BuildContext, range: TimeRange):
       return volumeQuery(q.spec, ctx, bucket, p.withLevel ?? true);
     case 'logs':
     case 'table':
-      return logsQuery(q.spec, ctx, p.limit ?? config.lineLimit, p.sort ?? 'desc');
+      // exact bounds: "load more" (infinite scrolling) asks for lines older/newer than a loaded line
+      return logsQuery(q.spec, ctx, p.limit ?? config.lineLimit, p.sort ?? 'desc', {
+        fromMs: range.from.valueOf(),
+        toMs: range.to.valueOf(),
+      });
     case 'labelOverview':
       return labelOverviewQuery(q.spec, ctx, p.labels ?? ctx.labels, bucket);
     case 'valueBreakdown':
@@ -144,12 +149,19 @@ function errorResponse(refId: string, err: unknown): DataQueryResponse {
   return { data: [], errors: [e], error: e, state: LoadingState.Error };
 }
 
+function widenedRange(range: TimeRange): TimeRange {
+  const w = widenToSeconds(range.from.valueOf(), range.to.valueOf());
+  return { from: dateTime(w.fromMs), to: dateTime(w.toMs), raw: { from: dateTime(w.fromMs), to: dateTime(w.toMs) } };
+}
+
 /** Runs one structured query and returns frames ready for the panels. */
 export function runLogsQuery(q: LogsAppQuery, range: TimeRange, requestId?: string): Observable<DataQueryResponse> {
-  return from(buildContext(q.spec.view, range)).pipe(
+  return from(buildContext(q.spec.view, range, q.spec.datasource)).pipe(
     switchMap((ctx) => {
       const sql = buildSql(q, ctx, range);
-      return runSql(sql, { refId: q.refId, range, requestId }).pipe(
+      // line queries have exact bounds in the SQL; widen the range for $__timeFilter to whole seconds
+      const sqlRange = q.kind === 'logs' || q.kind === 'table' ? widenedRange(range) : range;
+      return runSql(sql, { datasource: q.spec.datasource, refId: q.refId, range: sqlRange, requestId }).pipe(
         map((res): DataQueryResponse => {
           const err = res.errors?.[0] ?? res.error;
           if (err) {
@@ -220,9 +232,10 @@ export class StarRocksLogsDataSource extends RuntimeDataSource<LogsAppQuery> {
       to: dateTime(center + 3600_000),
       raw: { from: dateTime(center - 3600_000), to: dateTime(center + 3600_000) },
     };
-    const ctx = await buildContext(view, range);
+    const datasource = query?.spec?.datasource ?? '';
+    const ctx = await buildContext(view, range, datasource);
     const sql = contextQuery(view, ctx, podColumn, pod, tsRaw, direction, options?.limit ?? 50);
-    const res = await lastValueFrom(runSql(sql, { refId: `context-${direction}`, range }));
+    const res = await lastValueFrom(runSql(sql, { datasource, refId: `context-${direction}`, range }));
     const err = res.errors?.[0] ?? res.error;
     if (err) {
       throw new Error(err.message);
````

### 30/41 `src/datasource/api.test.ts` (modified)

unit tests: data source list and per-data-source calls

PATCH-BLOCK 30/41 src/datasource/api.test.ts old=8bc22aaf6a3ba4a32c27816840fc76e74daddf9c new=a570e4396521be59a5eca8c9349d5df4165c6993 sha256=460e09e9a67b05693e049805fb3142236ee02e563739ae327f594fa9e51b89c0
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/api.test.ts b/plugins/kotak-starrocks-logs-app/src/datasource/api.test.ts
index 8bc22aa..a570e43 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/api.test.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/api.test.ts
@@ -1,6 +1,21 @@
-import { friendlyError } from './api';
+import { setAppConfig } from '../config/config';
+import { friendlyError, listDatasources } from './api';
 
-jest.mock('@grafana/runtime', () => ({}));
+const instances = [
+  { uid: 'db2', name: 'logs-db2', type: 'kotak-starrocks-datasource' },
+  { uid: 'db1', name: 'logs-db1', type: 'kotak-starrocks-datasource' },
+];
+
+// like Grafana 12.0: the built-in "-- Grafana --" data source is appended unless pluginId is given
+const grafanaBuiltIn = { uid: 'grafana', name: '-- Grafana --', type: 'grafana' };
+jest.mock('@grafana/runtime', () => ({
+  getDataSourceSrv: () => ({
+    getList: ({ pluginId, type }: { pluginId?: string; type?: string }) => [
+      ...instances.filter((i) => (pluginId ?? type) === undefined || i.type === (pluginId ?? type)),
+      ...(pluginId ? [] : [grafanaBuiltIn]),
+    ],
+  }),
+}));
 
 describe('friendlyError', () => {
   it('explains Ranger and login rejections and keeps the original text', () => {
@@ -13,3 +28,18 @@ describe('friendlyError', () => {
     expect(friendlyError('something else')).toBe('something else');
   });
 });
+
+describe('listDatasources', () => {
+  it('offers every instance of the plugin type, by name, when no list is configured (never "-- Grafana --")', () => {
+    setAppConfig({});
+    expect(listDatasources().map((d) => d.uid)).toEqual(['db1', 'db2']);
+  });
+
+  it('follows the configured list and order, skipping data sources the user cannot see', () => {
+    setAppConfig({ datasources: ['db2', 'missing', 'db1'] });
+    expect(listDatasources()).toEqual([
+      { uid: 'db2', name: 'logs-db2' },
+      { uid: 'db1', name: 'logs-db1' },
+    ]);
+  });
+});
````

### 31/41 `src/datasource/api.ts` (modified)

list the StarRocks data sources; every call takes the data source uid

PATCH-BLOCK 31/41 src/datasource/api.ts old=2d9cfa71bded60f35047e70e57972fbd6a0031ec new=918305444891319b0578ef1a2da19b9aaf991a5f sha256=ad5ffb9c6787d13982496cd09e0f5c98bedb9e3b1489b3142a44c51981e45b0c
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/api.ts b/plugins/kotak-starrocks-logs-app/src/datasource/api.ts
index 2d9cfa7..9183054 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/api.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/api.ts
@@ -1,25 +1,63 @@
 import { Observable, catchError, firstValueFrom, map, of } from 'rxjs';
 
 import { DataFrame, DataQueryResponse, TimeRange } from '@grafana/data';
-import { BackendDataSourceResponse, FetchResponse, getBackendSrv, toDataQueryResponse } from '@grafana/runtime';
+import {
+  BackendDataSourceResponse,
+  FetchResponse,
+  getBackendSrv,
+  getDataSourceSrv,
+  toDataQueryResponse,
+} from '@grafana/runtime';
 
-import { getAppConfig } from '../config/config';
+import { getAppConfig, viewPrefixFor } from '../config/config';
 import { columnsQuery, viewsQuery } from '../sql/builder';
 
+export interface StarRocksDatasource {
+  uid: string;
+  name: string;
+}
+
+/**
+ * The kotak-starrocks-datasource instances offered in the picker: the configured list (in its order), or
+ * every instance of the plugin type the user can see. Each instance is scoped to one StarRocks database.
+ */
+export function listDatasources(): StarRocksDatasource[] {
+  const { datasource, datasources } = getAppConfig();
+  // pluginId, not type: Grafana 12.0 getList() appends "-- Grafana --" unless pluginId (or alerting) is set
+  const all = getDataSourceSrv()
+    .getList({ pluginId: datasource.type })
+    .filter((ds) => ds.type === datasource.type)
+    .map((ds) => ({ uid: ds.uid, name: ds.name }));
+  if (datasources.length === 0) {
+    return all.sort((a, b) => a.name.localeCompare(b.name));
+  }
+  return datasources
+    .map((d) => all.find((x) => x.uid === d.uid))
+    .filter((x): x is StarRocksDatasource => x !== undefined);
+}
+
 /**
- * Runs SQL through the configured kotak-starrocks-datasource via Grafana's /api/ds/query. Grafana's OAuth
+ * Runs SQL through a kotak-starrocks-datasource instance via Grafana's /api/ds/query. Grafana's OAuth
  * middleware attaches the signed-in user's IDAM token, so StarRocks and Ranger see the user, exactly as for
  * dashboard panels. The datasource's frontend is bypassed on purpose: the SQL is sent as built, without
  * template-variable interpolation.
  */
 export function runSql(
   sql: string,
-  opts: { refId: string; range: TimeRange; requestId?: string; maxDataPoints?: number; intervalMs?: number }
+  opts: {
+    /** data source uid; default: the configured default data source */
+    datasource?: string;
+    refId: string;
+    range: TimeRange;
+    requestId?: string;
+    maxDataPoints?: number;
+    intervalMs?: number;
+  }
 ): Observable<DataQueryResponse> {
   const { datasource } = getAppConfig();
   const query = {
     refId: opts.refId,
-    datasource,
+    datasource: { type: datasource.type, uid: opts.datasource || datasource.uid },
     rawSql: sql,
     format: 'table',
     rawQuery: true,
@@ -55,8 +93,13 @@ export function runSql(
   }
 }
 
-export async function runSqlOnce(sql: string, range: TimeRange, refId = 'A'): Promise<DataFrame[]> {
-  const res = await firstValueFrom(runSql(sql, { refId, range }));
+export async function runSqlOnce(
+  sql: string,
+  range: TimeRange,
+  refId = 'A',
+  datasource?: string
+): Promise<DataFrame[]> {
+  const res = await firstValueFrom(runSql(sql, { refId, range, datasource }));
   const err = res.errors?.[0] ?? res.error;
   if (err) {
     throw new Error(err.message ?? 'query failed');
@@ -87,10 +130,10 @@ export function stringColumn(frame: DataFrame | undefined, name?: string): strin
   return (field?.values ?? []).map((v) => (v === null || v === undefined ? '' : String(v)));
 }
 
-/** Views (vw_eks_app_logs_*) this user can see. SHOW TABLES is filtered by Ranger. */
-export async function fetchViews(range: TimeRange): Promise<string[]> {
-  const { viewPrefix } = getAppConfig();
-  const frames = await runSqlOnce(viewsQuery(viewPrefix), range, 'views');
+/** Views (vw_eks_app_logs_*) of a data source's database that this user can see (SHOW TABLES, Ranger-filtered). */
+export async function fetchViews(range: TimeRange, datasource?: string): Promise<string[]> {
+  const viewPrefix = viewPrefixFor(getAppConfig(), datasource);
+  const frames = await runSqlOnce(viewsQuery(viewPrefix), range, 'views', datasource);
   return stringColumn(frames[0])
     .filter((v) => v.startsWith(viewPrefix))
     .sort();
@@ -99,12 +142,15 @@ export async function fetchViews(range: TimeRange): Promise<string[]> {
 const columnCache = new Map<string, Promise<string[]>>();
 
 /** Column names of a view. DESCRIBE is denied by Ranger, so this uses SELECT * ... LIMIT 0. */
-export function fetchColumns(view: string, range: TimeRange): Promise<string[]> {
-  let p = columnCache.get(view);
+export function fetchColumns(view: string, range: TimeRange, datasource?: string): Promise<string[]> {
+  const key = `${datasource ?? ''}/${view}`;
+  let p = columnCache.get(key);
   if (!p) {
-    p = runSqlOnce(columnsQuery(view), range, 'columns').then((frames) => (frames[0]?.fields ?? []).map((f) => f.name));
-    p.catch(() => columnCache.delete(view));
-    columnCache.set(view, p);
+    p = runSqlOnce(columnsQuery(view), range, 'columns', datasource).then((frames) =>
+      (frames[0]?.fields ?? []).map((f) => f.name)
+    );
+    p.catch(() => columnCache.delete(key));
+    columnCache.set(key, p);
   }
   return p;
 }
````

### 32/41 `src/datasource/frames.test.ts` (modified)

unit tests: stable line ids

PATCH-BLOCK 32/41 src/datasource/frames.test.ts old=4a737033e3e0a750adedb389ea7f7aa85218ad47 new=d7d0481b890d7412049eb88c7663800dafe7db76 sha256=d027820ac2756ce3dc82361de9a90949726132e0befb4df5b3af1ba2271a416f
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/frames.test.ts b/plugins/kotak-starrocks-logs-app/src/datasource/frames.test.ts
index 4a73703..d7d0481 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/frames.test.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/frames.test.ts
@@ -2,6 +2,8 @@ import { DataFrameType, FieldType, createDataFrame, dateTime } from '@grafana/da
 
 import { resolveConfig, resolveTenant } from '../config/config';
 import {
+  fnv1a,
+  stableIds,
   toLabelOverviewFrames,
   toLogsFrame,
   toPatternFrames,
@@ -121,3 +123,19 @@ describe('series frames', () => {
     expect(toPatternFrames(src, range, 60, 'A').map((f) => f.name)).toEqual([UNMATCHED, 'timeout']);
   });
 });
+
+describe('line ids', () => {
+  it('are stable across queries (infinite scroll merges pages by id) and unique within a frame', () => {
+    const a = toLogsFrame(lines, { tenant: tenant(false), refId: 'A' });
+    const b = toLogsFrame(lines, { tenant: tenant(false), refId: 'B' });
+    const ids = a.fields.find((f) => f.name === 'id')!.values;
+    expect(b.fields.find((f) => f.name === 'id')!.values).toEqual(ids);
+    expect(ids[0]).toBe(`1970-01-01 00:00:02.000123_u1_${fnv1a(lines.fields[2].values[0])}`);
+    expect(new Set(ids).size).toBe(ids.length);
+  });
+
+  it('suffix duplicates', () => {
+    expect(stableIds(['x', 'y', 'x', 'x'])).toEqual(['x', 'y', 'x#1', 'x#2']);
+    expect(fnv1a('')).toBe('811c9dc5');
+  });
+});
````

### 33/41 `src/datasource/frames.ts` (modified)

stable line ids (infinite scroll merges pages by id)

PATCH-BLOCK 33/41 src/datasource/frames.ts old=0308647f75d54187afedb17becdaebb9d50666af new=b8a375c8537475ce54629782a20dea38921b92c5 sha256=f569beca0a036c6b439569e0c750823de8ddecae4fe15433616732229e82286c
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/datasource/frames.ts b/plugins/kotak-starrocks-logs-app/src/datasource/frames.ts
index 0308647..b8a375c 100644
--- a/plugins/kotak-starrocks-logs-app/src/datasource/frames.ts
+++ b/plugins/kotak-starrocks-logs-app/src/datasource/frames.ts
@@ -73,11 +73,12 @@ export function toLogsFrame(frame: DataFrame, opts: LogsFrameOptions): DataFrame
     { name: 'timestamp', type: FieldType.time, config: {}, values: rows.map((i) => ts[i]) },
     { name: 'body', type: FieldType.string, config: {}, values: rows.map((i) => str(msg[i])) },
     { name: 'severity', type: FieldType.string, config: {}, values: rows.map((i) => str(lvl[i]) || 'unknown') },
+    // stable across responses (timestamp + pod + message), so "load more" merges overlapping lines
     {
       name: 'id',
       type: FieldType.string,
       config: {},
-      values: rows.map((i, n) => `${str(tsRaw[i])}_${labels[n][POD_UID_COLUMN] ?? ''}_${n}`),
+      values: stableIds(rows.map((i, n) => lineKey(tsRaw[i], labels[n], msg[i]))),
     },
     { name: 'labels', type: FieldType.other, config: {}, values: labels },
     // exact microsecond timestamp, used by "show context"; not shown in log details
@@ -113,6 +114,30 @@ export function toLogsFrame(frame: DataFrame, opts: LogsFrameOptions): DataFrame
   });
 }
 
+/** 32-bit FNV-1a hash as hex. */
+export function fnv1a(text: string): string {
+  let h = 0x811c9dc5;
+  for (let i = 0; i < text.length; i++) {
+    h ^= text.charCodeAt(i);
+    h = Math.imul(h, 0x01000193);
+  }
+  return (h >>> 0).toString(16).padStart(8, '0');
+}
+
+function lineKey(tsRaw: unknown, labels: Record<string, string>, message: unknown): string {
+  return `${str(tsRaw)}_${labels[POD_UID_COLUMN] ?? labels.k8s_pod_name ?? ''}_${fnv1a(str(message))}`;
+}
+
+/** Identical keys (same line twice in the same microsecond) get a #n suffix so ids stay unique. */
+export function stableIds(keys: string[]): string[] {
+  const seen = new Map<string, number>();
+  return keys.map((k) => {
+    const n = seen.get(k) ?? 0;
+    seen.set(k, n + 1);
+    return n === 0 ? k : `${k}#${n}`;
+  });
+}
+
 /** Distinct values of __value in a samples result, in order of appearance. */
 export function groupValuesOf(frame: DataFrame): string[] {
   return Array.from(new Set(col(frame, '__value').map(str)));
````

### 34/41 `src/plugin.json` (modified)

plugin name "Logs Drilldown (StarRocks)" (id unchanged)

PATCH-BLOCK 34/41 src/plugin.json old=665421d01825f6a8d68a37c861ecef0ce294e2d8 new=97154e538ec9696240718ead5afeabce27c226a1 sha256=864b50ac97e0df4115766bc571066ac05a1369ed1b6121ad65d7757d2ab36287
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/plugin.json b/plugins/kotak-starrocks-logs-app/src/plugin.json
index 665421d..97154e5 100644
--- a/plugins/kotak-starrocks-logs-app/src/plugin.json
+++ b/plugins/kotak-starrocks-logs-app/src/plugin.json
@@ -1,7 +1,7 @@
 {
   "$schema": "https://raw.githubusercontent.com/grafana/grafana/main/docs/sources/developers/plugins/plugin.schema.json",
   "type": "app",
-  "name": "StarRocks Logs Drilldown",
+  "name": "Logs Drilldown (StarRocks)",
   "id": "kotak-starrocks-logs-app",
   "autoEnabled": true,
   "info": {
@@ -22,7 +22,7 @@
   "includes": [
     {
       "type": "page",
-      "name": "StarRocks Logs",
+      "name": "Logs Drilldown (StarRocks)",
       "path": "/a/%PLUGIN_ID%/explore",
       "role": "Viewer",
       "addToNav": true,
````

### 35/41 `src/sql/builder.test.ts` (modified)

unit tests: exact time bounds

PATCH-BLOCK 35/41 src/sql/builder.test.ts old=dcb0753ca84701ed2ff6a754b867c2cc7a2b08fc new=bc901ede96b119f51e98f9dfd20de17b0bb17ef8 sha256=721ca56247cd8d6c06d78e096393c83e65845e8d835de3d97b4fe834c17212fe
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/sql/builder.test.ts b/plugins/kotak-starrocks-logs-app/src/sql/builder.test.ts
index dcb0753..bc901ed 100644
--- a/plugins/kotak-starrocks-logs-app/src/sql/builder.test.ts
+++ b/plugins/kotak-starrocks-logs-app/src/sql/builder.test.ts
@@ -13,11 +13,13 @@ import {
   needsMessageScan,
   patternsQuery,
   pickBucketSeconds,
+  preciseTimeBounds,
   quoteIdent,
   serviceSamplesQuery,
   serviceVolumeQuery,
   volumeQuery,
   whereClause,
+  widenToSeconds,
 } from './builder';
 
 const VIEW = 'vw_eks_app_logs_app_1961_observability';
@@ -210,6 +212,25 @@ describe('queries', () => {
     expect(q).toContain('LIMIT 1000');
   });
 
+  it('logs query with bounds adds exact microsecond bounds (infinite scroll pages must not skip or repeat lines)', () => {
+    // 2026-11-20 10:00:00.250 .. 10:05:00.999
+    const q = logsQuery(spec(), ctx(), 1000, 'desc', { fromMs: 1_763_632_800_250, toMs: 1_763_633_100_999 });
+    expect(q).toContain('$__timeFilter(`observed_timestamp`)');
+    expect(q).toContain('`observed_timestamp` >= microseconds_add(FROM_UNIXTIME(1763632800), 250000)');
+    // the end is inclusive to the millisecond: < end + 1 ms
+    expect(q).toContain('`observed_timestamp` < microseconds_add(FROM_UNIXTIME(1763633101), 0)');
+  });
+
+  it('precise bounds and the widened macro range', () => {
+    expect(preciseTimeBounds(1000.7, 2999)).toEqual([
+      '`observed_timestamp` >= microseconds_add(FROM_UNIXTIME(1), 0)',
+      '`observed_timestamp` < microseconds_add(FROM_UNIXTIME(3), 0)',
+    ]);
+    // the macro truncates to seconds, so its range is widened to whole seconds around [from, to + 1 ms)
+    expect(widenToSeconds(1250, 4999)).toEqual({ fromMs: 1000, toMs: 5000 });
+    expect(widenToSeconds(1250, 5000)).toEqual({ fromMs: 1000, toMs: 6000 });
+  });
+
   it('label overview uses GROUPING SETS over present labels', () => {
     const q = labelOverviewQuery(spec(), ctx(), ['k8s_service_name', 'k8s_namespace_name', 'missing'], 300);
     expect(q).toContain('GROUPING_ID(`k8s_service_name`, `k8s_namespace_name`) AS gid');
````

### 36/41 `src/sql/builder.ts` (modified)

exact microsecond bounds for logs pages

PATCH-BLOCK 36/41 src/sql/builder.ts old=bfbf26f8bbd5164dcb4b60121fba0ffc027ee25f new=4ef9eb80ba4ce66b2b6fb353bd3e0d37c416f5f4 sha256=2ea8250b02b876ccc7f99af86322ede33b2e94d44e198dc8c3e28ade7517701d
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/sql/builder.ts b/plugins/kotak-starrocks-logs-app/src/sql/builder.ts
index bfbf26f..4ef9eb8 100644
--- a/plugins/kotak-starrocks-logs-app/src/sql/builder.ts
+++ b/plugins/kotak-starrocks-logs-app/src/sql/builder.ts
@@ -71,6 +71,25 @@ export function timeFilter(): string {
   return `$__timeFilter(${T})`;
 }
 
+/**
+ * Exact time bounds for line queries, in addition to $__timeFilter (which the datasource truncates to whole
+ * seconds; at ~1.6k lines/s that would skip lines when "load more" asks for lines older than the oldest one
+ * shown). Inclusive of the whole millisecond at both ends: lines equal to a loaded line are merged by id.
+ * FROM_UNIXTIME uses the session time zone, like the macro.
+ */
+export function preciseTimeBounds(fromMs: number, toMs: number): string[] {
+  const at = (ms: number) => {
+    const s = Math.floor(ms / 1000);
+    return `microseconds_add(FROM_UNIXTIME(${s}), ${(ms - s * 1000) * 1000})`;
+  };
+  return [`${T} >= ${at(Math.floor(fromMs))}`, `${T} < ${at(Math.floor(toMs) + 1)}`];
+}
+
+/** Time range to send with a line query so that $__timeFilter covers the exact bounds (whole seconds). */
+export function widenToSeconds(fromMs: number, toMs: number): { fromMs: number; toMs: number } {
+  return { fromMs: Math.floor(fromMs / 1000) * 1000, toMs: Math.ceil((Math.floor(toMs) + 1) / 1000) * 1000 };
+}
+
 export function bucketExpr(bucketSeconds: number): string {
   const b = Math.max(1, Math.floor(bucketSeconds));
   return `(UNIX_TIMESTAMP(${T}) DIV ${b}) * ${b}`;
@@ -285,11 +304,18 @@ export function serviceSamplesQuery(
     .join('\nUNION ALL\n');
 }
 
-export function logsQuery(spec: QuerySpec, ctx: BuildContext, limit: number, sort: 'desc' | 'asc'): string {
+export function logsQuery(
+  spec: QuerySpec,
+  ctx: BuildContext,
+  limit: number,
+  sort: 'desc' | 'asc',
+  bounds?: { fromMs: number; toMs: number }
+): string {
+  const extra = bounds ? preciseTimeBounds(bounds.fromMs, bounds.toMs) : [];
   return [
     `SELECT ${lineSelect(ctx)}`,
     from(spec.view),
-    `WHERE ${whereClause(spec, ctx)}`,
+    `WHERE ${whereClause(spec, ctx, { extra })}`,
     `ORDER BY ${T} ${sort === 'asc' ? 'ASC' : 'DESC'}`,
     `LIMIT ${Math.max(1, Math.floor(limit))}`,
   ].join('\n');
````

### 37/41 `src/state/storage.test.ts` (new file)

new: unit tests for storage.ts

PATCH-BLOCK 37/41 src/state/storage.test.ts old=none new=636a65f9c3b89bba74e9f6f01ff3f285103602ff sha256=c12dab85cd07d2b03f173204e2203fb0205555f33e0e0d5dca170a0ea62f2b9e
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/state/storage.test.ts b/plugins/kotak-starrocks-logs-app/src/state/storage.test.ts
new file mode 100644
index 0000000..636a65f
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/state/storage.test.ts
@@ -0,0 +1,28 @@
+import { getFavorites, getLastSelection, setLastSelection, toggleFavorite } from './storage';
+
+describe('storage', () => {
+  beforeEach(() => window.localStorage.clear());
+
+  it('remembers the last data source and view', () => {
+    expect(getLastSelection()).toEqual({});
+    setLastSelection('ds1', 'vw_eks_app_logs_a');
+    expect(getLastSelection()).toEqual({ ds: 'ds1', view: 'vw_eks_app_logs_a' });
+  });
+
+  it('toggles favourites per data source, view and label', () => {
+    expect(toggleFavorite('ds1', 'v', 'k8s_service_name', 'api')).toEqual(['api']);
+    expect(toggleFavorite('ds1', 'v', 'k8s_service_name', 'web')).toEqual(['api', 'web']);
+    expect(getFavorites('ds2', 'v', 'k8s_service_name')).toEqual([]);
+    expect(toggleFavorite('ds1', 'v', 'k8s_service_name', 'api')).toEqual(['web']);
+  });
+
+  it('never throws when storage is broken', () => {
+    window.localStorage.setItem('kotak-starrocks-logs-app:last', '{not json');
+    expect(getLastSelection()).toEqual({});
+    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
+      throw new Error('quota');
+    });
+    expect(() => setLastSelection('a', 'b')).not.toThrow();
+    spy.mockRestore();
+  });
+});
````

### 38/41 `src/state/storage.ts` (new file)

new: last data source / view and favourites (browser localStorage)

PATCH-BLOCK 38/41 src/state/storage.ts old=none new=0145b7badf9a1b42162ff281243bad8cd92aae55 sha256=a0db5f74bb0cfe05c1ecf587a1366a99cb0a7d0576fabfc8bc16c5eaa360c504
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/state/storage.ts b/plugins/kotak-starrocks-logs-app/src/state/storage.ts
new file mode 100644
index 0000000..0145b7b
--- /dev/null
+++ b/plugins/kotak-starrocks-logs-app/src/state/storage.ts
@@ -0,0 +1,51 @@
+/**
+ * Per-browser conveniences kept in localStorage: the last data source and view the user opened, and their
+ * favourite values per view and label. Reads and writes never throw (private windows, blocked storage).
+ */
+const PREFIX = 'kotak-starrocks-logs-app';
+
+function read<T>(key: string, fallback: T): T {
+  try {
+    const raw = window.localStorage.getItem(`${PREFIX}:${key}`);
+    return raw ? (JSON.parse(raw) as T) : fallback;
+  } catch {
+    return fallback;
+  }
+}
+
+function write(key: string, value: unknown) {
+  try {
+    window.localStorage.setItem(`${PREFIX}:${key}`, JSON.stringify(value));
+  } catch {
+    // ignore: storage unavailable
+  }
+}
+
+export interface LastSelection {
+  ds?: string;
+  view?: string;
+}
+
+export function getLastSelection(): LastSelection {
+  return read<LastSelection>('last', {});
+}
+
+export function setLastSelection(ds: string | undefined, view: string | undefined) {
+  write('last', { ds, view });
+}
+
+function favKey(ds: string, view: string, label: string) {
+  return `fav:${ds}:${view}:${label}`;
+}
+
+export function getFavorites(ds: string, view: string, label: string): string[] {
+  const v = read<unknown>(favKey(ds, view, label), []);
+  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
+}
+
+export function toggleFavorite(ds: string, view: string, label: string, value: string): string[] {
+  const cur = getFavorites(ds, view, label);
+  const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
+  write(favKey(ds, view, label), next);
+  return next;
+}
````

### 39/41 `src/state/types.ts` (modified)

`QuerySpec.datasource`

PATCH-BLOCK 39/41 src/state/types.ts old=23dd973e6e07818f8508be16cc2bac9f190d2c0a new=4bc0b1c48164a7a1835b086e22db9b7597ddb0c0 sha256=66c1ef762346dfffb700d2ca65d4a8fd40da35e079abea1d88a3de0091953871
````diff
diff --git a/plugins/kotak-starrocks-logs-app/src/state/types.ts b/plugins/kotak-starrocks-logs-app/src/state/types.ts
index 23dd973..4bc0b1c 100644
--- a/plugins/kotak-starrocks-logs-app/src/state/types.ts
+++ b/plugins/kotak-starrocks-logs-app/src/state/types.ts
@@ -30,6 +30,8 @@ export interface MessageFieldFilter {
 
 /** Everything that narrows the rows of a view, independent of the time range. */
 export interface QuerySpec {
+  /** uid of the kotak-starrocks-datasource instance (one StarRocks database); '' = the default one */
+  datasource: string;
   view: string;
   filters: LabelFilter[];
   levels: string[];
@@ -62,6 +64,6 @@ export interface QueryParams {
   withLevel?: boolean;
 }
 
-export function emptySpec(view: string): QuerySpec {
-  return { view, filters: [], levels: [], lineFilters: [], patternFilters: [], fieldFilters: [] };
+export function emptySpec(view: string, datasource = ''): QuerySpec {
+  return { datasource, view, filters: [], levels: [], lineFilters: [], patternFilters: [], fieldFilters: [] };
 }
````

### 40/41 `tests/e2e/drilldown.spec.ts` (modified)

browser tests (28), local test stack only; not run by the pipeline

PATCH-BLOCK 40/41 tests/e2e/drilldown.spec.ts old=8b8a4ec48272cd65e1cf64d347d4c23dc120018c new=b0b502537faa6ecfa0ba4b840b6721013d61cfbb sha256=f1c72710e0b1d2bb5ed87c7ffbdcdd4c07bcdfb928d1960cac22d46ffef90b34
````diff
diff --git a/plugins/kotak-starrocks-logs-app/tests/e2e/drilldown.spec.ts b/plugins/kotak-starrocks-logs-app/tests/e2e/drilldown.spec.ts
index 8b8a4ec..b0b5025 100644
--- a/plugins/kotak-starrocks-logs-app/tests/e2e/drilldown.spec.ts
+++ b/plugins/kotak-starrocks-logs-app/tests/e2e/drilldown.spec.ts
@@ -1,13 +1,16 @@
 import { expect, Page, test } from '@playwright/test';
 
 /**
- * Browser end-to-end tests of the StarRocks Logs Drilldown app in Grafana 12.0.1 with the unchanged
+ * Browser end-to-end tests of the Logs Drilldown (StarRocks) app in Grafana 12.0.1 with the unchanged
  * kotak-starrocks-datasource, mock IDAM sign-in and seeded StarRocks (scripts/e2e.sh up).
  */
 
 const APP = '/a/kotak-starrocks-logs-app/explore';
 const OBS = 'vw_eks_app_logs_app_1961_observability';
 const CMM = 'vw_eks_app_logs_app_01996_frontlineplatforms_cmm';
+const PAYMENTS = 'vw_eks_app_logs_app_04000_payments';
+const DS1 = 'e2e-ds-starrocks-logs';
+const DS2 = 'e2e-ds-starrocks-logs2';
 const SHOTS = 'test-results/screenshots';
 
 async function login(page: Page, user: string) {
@@ -30,8 +33,23 @@ function appUrl(params: Record<string, string | string[]>) {
   return `${APP}?${sp.toString()}`;
 }
 
+// 0.1.0/0.2.0 link format (still read, converted to var-filters)
 const filter = (key: string, op: string, value: string) => [key, op, value].map(encodeURIComponent).join('|');
+// 0.3.0 format, written by the label filter combobox
+const varFilter = (key: string, op: string, value: string) => [key, op, value].join('|');
 const logsMain = (page: Page) => page.getByTestId('logs-main');
+const labelFilters = (page: Page) => page.getByTestId('label-filters');
+const pills = (page: Page) => page.getByRole('button', { name: /^Edit filter with key/ });
+const serviceRows = (page: Page) => page.locator('[data-testid^="service-row-"]');
+
+/** Picks options in the "Log levels" select. */
+async function chooseLevels(page: Page, levels: string[]) {
+  await page.getByLabel('Log levels').click();
+  for (const l of levels) {
+    await page.getByRole('option', { name: l, exact: true }).click();
+  }
+  await page.keyboard.press('Escape');
+}
 
 test.describe('as kmbl3e2e (two granted views)', () => {
   test.beforeEach(async ({ page }) => {
@@ -40,13 +58,55 @@ test.describe('as kmbl3e2e (two granted views)', () => {
 
   test('the app is a card on the Drilldown page and opens', async ({ page }) => {
     await page.goto('/drilldown');
-    const card = page.getByRole('link', { name: /StarRocks Logs Drilldown/ });
+    const card = page.getByRole('link', { name: /Logs Drilldown \(StarRocks\)/ });
     await expect(card).toBeVisible();
     await card.click();
     await expect(page).toHaveURL(/\/a\/kotak-starrocks-logs-app/);
+    // opened by client-side navigation: the first view the user can read must be selected automatically
+    await expect(page.getByTestId('service-row-cmm-api')).toBeVisible();
+    await expect(page).toHaveURL(/view=vw_eks_app_logs_/);
     await page.screenshot({ path: `${SHOTS}/01-drilldown-card.png` });
   });
 
+  test('layout: label filters left; data source, view, time and refresh right; quick ranges up to 24 hours', async ({
+    page,
+  }) => {
+    await page.setViewportSize({ width: 1920, height: 1080 });
+    await page.goto(APP);
+    await expect(page.getByTestId('service-row-cmm-api')).toBeVisible();
+    const filters = await labelFilters(page).boundingBox();
+    const ds = await page.getByTestId('datasource-picker').boundingBox();
+    const view = await page.getByTestId('view-picker').boundingBox();
+    const time = await page.getByTestId('data-testid TimePicker Open Button').boundingBox();
+    expect(filters && ds && view && time).toBeTruthy();
+    expect(filters!.x).toBeLessThan(ds!.x);
+    expect(ds!.x).toBeLessThan(view!.x);
+    expect(view!.x).toBeLessThan(time!.x);
+    // one row at 1920 px with the menu docked: the pickers sit next to the label filters, not under them
+    expect(Math.abs(filters!.y + filters!.height - (ds!.y + ds!.height))).toBeLessThan(12);
+    // only the "service" tab and "Add label"; no other label tabs by default
+    await expect(page.getByRole('tab')).toHaveCount(1);
+    await expect(page.getByRole('tab', { name: 'service' })).toBeVisible();
+    await expect(page.getByTestId('add-label')).toBeVisible();
+    await page.screenshot({ path: `${SHOTS}/00-layout.png` });
+
+    await page.getByTestId('data-testid TimePicker Open Button').click();
+    await expect(page.getByText('Last 24 hours', { exact: true })).toBeVisible();
+    await expect(page.getByText('Last 5 minutes', { exact: true })).toBeVisible();
+    await expect(page.getByText('Last 2 days', { exact: true })).toHaveCount(0);
+    await expect(page.getByText('Last 7 days', { exact: true })).toHaveCount(0);
+    await page.screenshot({ path: `${SHOTS}/00-quick-ranges.png` });
+    await page.getByText('Last 3 hours', { exact: true }).click();
+    await expect(page).toHaveURL(/from=now-3h/);
+    // a narrow window: the pickers wrap under the label filters, right-aligned, nothing overlaps
+    await page.setViewportSize({ width: 1280, height: 900 });
+    const f2 = await labelFilters(page).boundingBox();
+    const ds2 = await page.getByTestId('datasource-picker').boundingBox();
+    expect(ds2!.y).toBeGreaterThan(f2!.y + f2!.height - 1);
+    expect(f2!.width).toBeGreaterThanOrEqual(279);
+    await page.screenshot({ path: `${SHOTS}/00-layout-narrow.png` });
+  });
+
   test('the view picker lists exactly the views this user is granted', async ({ page }) => {
     await page.goto(APP);
     const picker = page.getByLabel('View', { exact: true });
@@ -59,36 +119,209 @@ test.describe('as kmbl3e2e (two granted views)', () => {
     await page.keyboard.press('Escape');
   });
 
-  test('service grid: volume and newest lines for every service, search, Show logs', async ({ page }) => {
+  test('data source picker: both StarRocks databases, switching changes the views, kept in the URL', async ({
+    page,
+  }) => {
+    await page.goto(APP);
+    // default data source, first view (sorted): cmm
+    await expect(page.getByTestId('service-row-cmm-api')).toBeVisible();
+    await expect(page).toHaveURL(new RegExp(`ds=${DS1}`));
+    const dsPicker = page.getByLabel('Data source', { exact: true });
+    await dsPicker.click();
+    const options = page.getByRole('option');
+    await expect(options).toHaveCount(2);
+    await expect(options.nth(0)).toContainText('app-logs-starrocks-db');
+    await expect(options.nth(1)).toContainText('app-logs-starrocks-db2');
+    await options.nth(1).click();
+    await expect(page).toHaveURL(new RegExp(`ds=${DS2}`));
+    // first view of the second database (sorted): payments
+    await expect(page.getByTestId('service-row-payments-api')).toBeVisible();
+    await page.getByLabel('View', { exact: true }).click();
+    await expect(page.getByRole('option')).toHaveCount(2);
+    await page.getByRole('option', { name: OBS }).click();
+    await expect(page.getByTestId('service-row-archive-compactor')).toBeVisible();
+    await expect(page.getByTestId('service-row-cmm-api')).toHaveCount(0);
+    await page.screenshot({ path: `${SHOTS}/11-datasource-picker.png` });
+    await page.reload();
+    await expect(page.getByTestId('service-row-archive-compactor')).toBeVisible();
+    await expect(page.getByText('app-logs-starrocks-db2').first()).toBeVisible();
+  });
+
+  test('per-database tenant settings: the level comes from the column in the second database', async ({ page }) => {
+    await page.goto(
+      appUrl({ ds: DS2, view: OBS, filter: filter('k8s_service_name', '=', 'archive-compactor'), level: 'error' })
+    );
+    await expect(logsMain(page)).toContainText('segment upload failed');
+    await expect(logsMain(page)).not.toContainText('compacted segment');
+  });
+
+  test('service grid: volume and newest lines for every service, search values dropdown, Show logs', async ({
+    page,
+  }) => {
     await page.goto(appUrl({ view: OBS }));
-    for (const s of ['proxy', 'apilog', 'otel-collector', 'vector', 'loki-gateway']) {
-      await expect(page.getByTestId(`service-row-${s}`)).toBeVisible();
+    for (const svc of ['proxy', 'apilog', 'otel-collector', 'vector', 'loki-gateway']) {
+      await expect(page.getByTestId(`service-row-${svc}`)).toBeVisible();
     }
     await expect(page.getByTestId('service-row-proxy').getByTestId('service-samples')).toContainText(
       'kong-ingress-controller'
     );
+    await expect(page.getByText(/^Showing/)).toContainText('of');
     await page.screenshot({ path: `${SHOTS}/02-service-grid.png`, fullPage: true });
 
-    await page.getByTestId('service-search').fill('otel');
+    // typing filters the grid and the dropdown lists the matching values with their line counts
+    await page.getByLabel('Search values').click();
+    await page.keyboard.type('otel');
+    await expect(page.getByRole('option', { name: /otel-collector/ })).toBeVisible();
+    await expect(page.getByRole('option', { name: /otel-collector/ })).toContainText('lines');
     await expect(page.getByTestId('service-row-proxy')).toHaveCount(0);
     await expect(page.getByTestId('service-row-otel-collector')).toBeVisible();
+    await page.screenshot({ path: `${SHOTS}/02b-search-values.png` });
+    // picking a value from the dropdown keeps only that one
+    await page.getByRole('option', { name: /otel-collector/ }).click();
+    await expect(serviceRows(page)).toHaveCount(1);
 
     await page.getByTestId('show-logs-otel-collector').click();
-    await expect(page.getByTestId('filter-chip')).toContainText('k8s_service_name = otel-collector');
-    await expect(page).toHaveURL(/filter=k8s_service_name/);
+    await expect(labelFilters(page)).toContainText('k8s_service_name = otel-collector');
+    await expect(page).toHaveURL(
+      /var-filters=k8s_service_name%7C%3D%7Cotel-collector|var-filters=k8s_service_name\|=\|otel-collector/
+    );
+    await expect(page).toHaveURL(/page=details/);
     await expect(logsMain(page)).toContainText('request completed');
   });
 
+  test('Include on a service row adds a label filter and becomes Remove; Show logs above the grid', async ({
+    page,
+  }) => {
+    await page.goto(appUrl({ view: OBS }));
+    await expect(page.getByTestId('service-row-vector')).toBeVisible();
+    await page.getByTestId('include-vector').click();
+    await expect(page.getByTestId('include-vector')).toHaveText('Remove');
+    await expect(labelFilters(page)).toContainText('k8s_service_name = vector');
+    // the grid stays: every service is still listed
+    await expect(page.getByTestId('service-row-proxy')).toBeVisible();
+    await page.getByTestId('include-proxy').click();
+    await expect(pills(page)).toHaveCount(2);
+    await page.screenshot({ path: `${SHOTS}/02c-include.png` });
+    await page.getByTestId('include-proxy').click();
+    await expect(page.getByTestId('include-proxy')).toHaveText('Include');
+    await expect(pills(page)).toHaveCount(1);
+
+    // Show logs above the grid: the logs of the current filters
+    await page.getByTestId('show-logs').click();
+    await expect(page).toHaveURL(/page=details/);
+    await expect(logsMain(page)).toContainText('reconciled');
+    await expect(logsMain(page)).not.toContainText('kong-ingress-controller');
+    await page.getByTestId('back-to-services').click();
+    await expect(page.getByTestId('include-vector')).toHaveText('Remove');
+  });
+
+  test('Add label: a closable tab with the values of that label', async ({ page }) => {
+    await page.goto(appUrl({ view: OBS }));
+    await expect(page.getByTestId('service-row-proxy')).toBeVisible();
+    await page.getByTestId('add-label').click();
+    await page.getByLabel('Search labels').fill('namespace');
+    await page.getByRole('option', { name: 'k8s_namespace_name', exact: true }).click();
+    await expect(page.getByRole('tab', { name: /k8s_namespace_name/ })).toBeVisible();
+    await expect(page.getByTestId('service-row-monitoring')).toBeVisible();
+    await expect(page).toHaveURL(/label=k8s_namespace_name/);
+    await expect(page).toHaveURL(/tabs=k8s_namespace_name/);
+    await page.screenshot({ path: `${SHOTS}/02d-add-label.png` });
+    // Include on this tab filters by namespace
+    await page.getByTestId('include-monitoring').click();
+    await expect(labelFilters(page)).toContainText('k8s_namespace_name = monitoring');
+    // back to the service tab: only the services in the included namespace
+    await page.getByRole('tab', { name: 'service' }).click();
+    await expect(page.getByTestId('service-row-otel-collector')).toBeVisible();
+    await expect(page.getByTestId('service-row-loki-gateway')).toBeVisible();
+    await expect(page.getByTestId('service-row-proxy')).toHaveCount(0);
+    // close the added tab
+    await page.getByRole('tab', { name: /k8s_namespace_name/ }).click();
+    await expect(page.getByTestId('service-row-monitoring')).toBeVisible();
+    await page.getByRole('button', { name: 'Remove k8s_namespace_name tab' }).click();
+    await expect(page.getByRole('tab')).toHaveCount(1);
+    await expect(page.getByTestId('service-row-otel-collector')).toBeVisible();
+  });
+
+  test('label filter combobox: labels, then a dropdown of values', async ({ page }) => {
+    await page.goto(appUrl({ view: OBS }));
+    await expect(page.getByTestId('service-row-proxy')).toBeVisible();
+    await labelFilters(page).getByPlaceholder('Filter by label values').click();
+    await page.keyboard.type('k8s_namespace');
+    await page.getByRole('option', { name: 'k8s_namespace_name', exact: true }).click();
+    await page.getByRole('option', { name: /^= Equals/ }).click();
+    // values of the label in the selected time range
+    await expect(page.getByRole('option', { name: 'monitoring', exact: true })).toBeVisible();
+    await page.screenshot({ path: `${SHOTS}/02e-values-dropdown.png` });
+    await page.getByRole('option', { name: 'monitoring', exact: true }).click();
+    await expect(labelFilters(page)).toContainText('k8s_namespace_name = monitoring');
+    await expect(page).toHaveURL(/var-filters=k8s_namespace_name/);
+  });
+
+  test('favourites are listed first', async ({ page }) => {
+    await page.goto(appUrl({ view: OBS }));
+    await expect(page.getByTestId('service-row-proxy')).toBeVisible();
+    const first = await serviceRows(page).first().getAttribute('data-testid');
+    expect(first).not.toBe('service-row-loki-gateway');
+    await page.getByTestId('favorite-loki-gateway').click();
+    await page.reload();
+    await expect(page.getByTestId('service-row-loki-gateway')).toBeVisible();
+    await expect(serviceRows(page).first()).toHaveAttribute('data-testid', 'service-row-loki-gateway');
+  });
+
+  test('a view is always selected: invalid or missing view in the URL, last view remembered', async ({ page }) => {
+    await page.goto(appUrl({ ds: DS1, view: 'vw_eks_app_logs_does_not_exist' }));
+    await expect(page.getByTestId('service-row-cmm-api')).toBeVisible();
+    await expect(page).toHaveURL(new RegExp(`view=${CMM}`));
+    await page.goto(appUrl({ view: OBS }));
+    await expect(page.getByTestId('service-row-proxy')).toBeVisible();
+    // opening the app again without a view: the last view used
+    await page.goto(APP);
+    await expect(page.getByTestId('service-row-proxy')).toBeVisible();
+    await expect(page).toHaveURL(new RegExp(`view=${OBS}`));
+    // an empty view parameter does not clear the selection
+    await page.goto(appUrl({ ds: DS1, view: '' }));
+    await expect(page.getByTestId('service-row-proxy')).toBeVisible();
+  });
+
+  test('logs: scrolling to the end loads the next lines (infinite scroll)', async ({ page }) => {
+    await page.goto(appUrl({ view: OBS, page: 'details' }));
+    const rows = logsMain(page).locator('tr');
+    await expect(rows.first()).toBeVisible();
+    await expect.poll(() => rows.count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(1000);
+    const before = await rows.count();
+    expect(before).toBeLessThanOrEqual(1000);
+    const box = await logsMain(page).boundingBox();
+    await page.mouse.move(box!.x + box!.width / 2, box!.y + Math.min(box!.height, 600) / 2);
+    await expect
+      .poll(
+        async () => {
+          await page.mouse.wheel(0, 50_000);
+          return rows.count();
+        },
+        { timeout: 60_000, intervals: [1000] }
+      )
+      .toBeGreaterThan(1000);
+    await page.screenshot({ path: `${SHOTS}/12-infinite-scroll.png` });
+    // the pages join without duplicates: ids are stable and the bounds are exact
+    const texts = await rows.evaluateAll((trs) => trs.map((tr) => tr.textContent ?? ''));
+    expect(new Set(texts).size).toBeGreaterThan(1000);
+  });
+
   test('logs tab: level filter, line search, log details filter, trace link to Explore', async ({ page }) => {
     await page.goto(appUrl({ view: OBS, filter: filter('k8s_service_name', '=', 'otel-collector') }));
     await expect(logsMain(page)).toContainText('traceid=');
 
-    // level read from the message (logfmt level=error)
-    await page.getByTestId('level-error').click();
+    // level read from the message (logfmt level=error), chosen in "Log levels"
+    await chooseLevels(page, ['error']);
     await expect(page).toHaveURL(/level=error/);
     await expect(logsMain(page)).toContainText('upstream timed out');
     await expect(logsMain(page)).not.toContainText('request completed');
-    await page.getByTestId('level-error').click();
+    await page
+      .getByTestId('log-levels')
+      .getByRole('button', { name: /Remove error|Remove/ })
+      .first()
+      .click();
+    await expect(page).not.toHaveURL(/level=error/);
 
     // line search, case-insensitive by default
     await page.getByTestId('line-filter-input').fill('SLOW REQUEST');
@@ -121,7 +354,7 @@ test.describe('as kmbl3e2e (two granted views)', () => {
       .getByRole('button', { name: /Filter for value/ })
       .first()
       .click();
-    await expect(page.getByTestId('filter-chip')).toHaveCount(2);
+    await expect(pills(page)).toHaveCount(2);
   });
 
   test('show context opens the context modal with lines of the same pod', async ({ page }) => {
@@ -154,7 +387,7 @@ test.describe('as kmbl3e2e (two granted views)', () => {
     await page.getByTestId('select-k8s_namespace_name').click();
     await expect(page.getByTestId('include-monitoring')).toBeVisible();
     await page.getByTestId('include-monitoring').click();
-    await expect(page.getByTestId('filter-chip').filter({ hasText: 'k8s_namespace_name = monitoring' })).toBeVisible();
+    await expect(labelFilters(page)).toContainText('k8s_namespace_name = monitoring');
   });
 
   test('fields tab: columns and key=value fields found in the lines', async ({ page }) => {
@@ -216,13 +449,38 @@ test.describe('as kmbl3e2e (two granted views)', () => {
   });
 
   test('state is in the URL: reload keeps filters, back returns to the service grid', async ({ page }) => {
-    await page.goto(appUrl({ view: OBS, filter: filter('k8s_service_name', '=', 'vector'), level: 'error' }));
-    await expect(page.getByTestId('filter-chip')).toContainText('vector');
+    await page.goto(
+      appUrl({
+        view: OBS,
+        page: 'details',
+        'var-filters': varFilter('k8s_service_name', '=', 'vector'),
+        level: 'error',
+      })
+    );
+    await expect(labelFilters(page)).toContainText('k8s_service_name = vector');
+    await expect(page.getByTestId('log-levels')).toContainText('error');
     await page.reload();
-    await expect(page.getByTestId('filter-chip')).toContainText('vector');
-    await expect(page.getByTestId('level-error')).toBeVisible();
+    await expect(labelFilters(page)).toContainText('vector');
+    await expect(page.getByTestId('log-levels')).toContainText('error');
     await page.getByTestId('back-to-services').click();
     await expect(page.getByTestId('service-row-proxy')).toBeVisible();
+    await expect(page.getByTestId('include-vector')).toHaveText('Remove');
+    // browser back returns to the logs (vector, errors only)
+    await page.goBack();
+    await expect(page).toHaveURL(/page=details/);
+    await expect(logsMain(page)).toContainText('failed to sync pod');
+    await expect(logsMain(page)).not.toContainText('reconciled');
+    // and forward to the grid again
+    await page.goForward();
+    await expect(page.getByTestId('service-row-proxy')).toBeVisible();
+  });
+
+  test('old links (filter=...) still open the logs of that filter', async ({ page }) => {
+    await page.goto(appUrl({ view: OBS, filter: filter('k8s_service_name', '=', 'vector') }));
+    await expect(labelFilters(page)).toContainText('k8s_service_name = vector');
+    await expect(logsMain(page)).toContainText('reconciled');
+    await expect(page).toHaveURL(/var-filters=/);
+    await expect(page).not.toHaveURL(/[?&]filter=/);
   });
 });
 
@@ -234,6 +492,17 @@ test('another user sees only their own view', async ({ page }) => {
   await expect(page.getByRole('option')).toHaveCount(1);
 });
 
+test('a user with access to the second database only lands on it', async ({ page }) => {
+  await login(page, 'kmbl3db2only');
+  await page.goto(APP);
+  await expect(page.getByTestId('service-row-payments-api')).toBeVisible();
+  await expect(page).toHaveURL(new RegExp(`ds=${DS2}`));
+  await expect(page).toHaveURL(new RegExp(`view=${PAYMENTS}`));
+  // the first data source is still offered, marked with why it could not be used
+  await page.getByLabel('Data source', { exact: true }).click();
+  await expect(page.getByRole('option').first()).toContainText(/refused|invalid connection|denied/i);
+});
+
 test('a user with no grants gets an explanation, not data', async ({ page }) => {
   await login(page, 'kmbl3none');
   await page.goto(APP);
````

### 41/41 `tests/smoke/smoke.test.ts` (modified)

API tests (21), local test stack only; not run by the pipeline

PATCH-BLOCK 41/41 tests/smoke/smoke.test.ts old=ddf21f2a6b6d6b70e1dbdc28a8455cb8f73d2a94 new=9f144f8a3e92408f4905855634295672194645cf sha256=a62248eea624c8fa87384d7e145c621b598c791e5cdb6274fb3176642d984c35
````diff
diff --git a/plugins/kotak-starrocks-logs-app/tests/smoke/smoke.test.ts b/plugins/kotak-starrocks-logs-app/tests/smoke/smoke.test.ts
index ddf21f2..9f144f8 100644
--- a/plugins/kotak-starrocks-logs-app/tests/smoke/smoke.test.ts
+++ b/plugins/kotak-starrocks-logs-app/tests/smoke/smoke.test.ts
@@ -16,12 +16,16 @@ import {
   valueBreakdownQuery,
   viewsQuery,
   volumeQuery,
+  widenToSeconds,
 } from '../../src/sql/builder';
 import { DEFAULT_FIELDS, DEFAULT_LABELS } from '../../src/constants';
 import { emptySpec, QuerySpec } from '../../src/state/types';
 
 const GRAFANA = process.env.GRAFANA_URL ?? 'http://localhost:23000';
 const DS = { uid: 'e2e-ds-starrocks-logs', type: 'kotak-starrocks-datasource' };
+// second StarRocks database = second instance of the data source plugin
+const DS2 = { uid: 'e2e-ds-starrocks-logs2', type: 'kotak-starrocks-datasource' };
+const PAYMENTS = 'vw_eks_app_logs_app_04000_payments';
 const OBS = 'vw_eks_app_logs_app_1961_observability';
 const CMM = 'vw_eks_app_logs_app_01996_frontlineplatforms_cmm';
 const DPDPA = 'vw_eks_app_logs_app_03123_dpdpa';
@@ -40,6 +44,8 @@ const JSON_DATA: AppJsonData = {
         { name: 'Health check', like: '%/healthz%' },
       ],
     },
+    // only in the second database: there the observability view has the level column filled
+    'e2e-ds-starrocks-logs2/app_1961_observability': { level: { source: 'column' } },
   },
 };
 
@@ -77,14 +83,14 @@ class Session {
   }
 
   /** Runs SQL as this user; returns rows as objects, or throws with the datasource error. */
-  async sql(rawSql: string, from = 'now-6h', to = 'now'): Promise<Array<Record<string, unknown>>> {
+  async sql(rawSql: string, from = 'now-6h', to = 'now', ds = DS): Promise<Array<Record<string, unknown>>> {
     const res = await fetch(`${GRAFANA}/api/ds/query`, {
       method: 'POST',
       headers: { cookie: this.header(), 'content-type': 'application/json' },
       body: JSON.stringify({
         from,
         to,
-        queries: [{ refId: 'A', datasource: DS, rawSql, format: 'table', rawQuery: true }],
+        queries: [{ refId: 'A', datasource: ds, rawSql, format: 'table', rawQuery: true }],
       }),
     });
     const body = await res.json();
@@ -113,13 +119,18 @@ const COLUMNS = [
   ...DEFAULT_FIELDS,
 ];
 
-function ctx(view: string): BuildContext {
+function ctx(view: string, ds = DS): BuildContext {
   const { config } = resolveConfig(JSON_DATA);
-  return { tenant: resolveTenant(config, view), columns: COLUMNS, labels: DEFAULT_LABELS, fields: DEFAULT_FIELDS };
+  return {
+    tenant: resolveTenant(config, view, ds.uid),
+    columns: COLUMNS,
+    labels: DEFAULT_LABELS,
+    fields: DEFAULT_FIELDS,
+  };
 }
 
-function spec(view: string, p: Partial<QuerySpec> = {}): QuerySpec {
-  return { ...emptySpec(view), ...p };
+function spec(view: string, p: Partial<QuerySpec> = {}, ds = DS): QuerySpec {
+  return { ...emptySpec(view, ds.uid), ...p };
 }
 
 const e2e = new Session('kmbl3e2e');
@@ -181,6 +192,32 @@ describe('every query kind runs on StarRocks (observability view, level from mes
     expect(rows[0]).toHaveProperty('k8s_pod_uid');
   });
 
+  it('infinite scroll: the next page (up to the oldest line shown) joins the first, no gaps, overlap deduped', async () => {
+    // what the Logs panel does: page 1 over [from, to]; page 2 over [from, oldest line of page 1 in ms]
+    const toMs = Date.now();
+    const fromMs = toMs - 3_600_000;
+    const page = async (to: number, limit: number) => {
+      const w = widenToSeconds(fromMs, to);
+      return e2e.sql(logsQuery(spec(OBS), c, limit, 'desc', { fromMs, toMs: to }), String(w.fromMs), String(w.toMs));
+    };
+    const key = (r: Record<string, unknown>) => `${r.__ts}|${r.k8s_pod_uid}|${r.message}`;
+    const p1 = await page(toMs, 1000);
+    expect(p1).toHaveLength(1000);
+    const oldest1 = Number(p1[999].observed_timestamp);
+    const p2 = await page(oldest1, 1000);
+    expect(p2).toHaveLength(1000);
+    // page 2 starts within the last millisecond of page 1 (the overlap is removed by line id)
+    expect(Number(p2[0].observed_timestamp)).toBeLessThanOrEqual(oldest1 + 1);
+    const merged = new Map([...p1, ...p2].map((r) => [key(r), r]));
+    expect(merged.size).toBeGreaterThan(1500);
+    // no gap: every line of one 2500-line query down to page 2's oldest millisecond is in the two pages
+    const oldest2 = Number(p2[999].observed_timestamp);
+    const all = await page(toMs, 2500);
+    const expected = all.filter((r) => Number(r.observed_timestamp) > oldest2);
+    expect(expected.length).toBeGreaterThan(1500);
+    expect(expected.filter((r) => !merged.has(key(r)))).toEqual([]);
+  });
+
   it('glog, logfmt, JSON and upper-case levels are normalised', async () => {
     const rows = await e2e.sql(
       volumeQuery(spec(OBS, { filters: [{ key: 'k8s_service_name', op: '=', value: 'vector' }] }), c, 3600)
@@ -317,3 +354,35 @@ describe('level column tenant (cmm)', () => {
     expect(levels).toEqual(new Set(['error', 'warn', 'info', 'debug', 'unknown']));
   });
 });
+
+describe('a second StarRocks database through a second data source instance', () => {
+  it('kmbl3e2e sees the views of the second database there', async () => {
+    const rows = await e2e.sql(viewsQuery('vw_eks_app_logs_'), 'now-6h', 'now', DS2);
+    expect(rows.map((r) => Object.values(r)[0]).sort()).toEqual([PAYMENTS, OBS]);
+  });
+
+  it('the same view name in another database is different data', async () => {
+    const rows = await e2e.sql(
+      serviceVolumeQuery(spec(OBS, {}, DS2), ctx(OBS, DS2), 'k8s_service_name', 3600),
+      'now-6h',
+      'now',
+      DS2
+    );
+    expect(new Set(rows.map((r) => r.v))).toEqual(new Set(['archive-compactor', 'cold-reader']));
+  });
+
+  it('per-database tenant settings: level from the column in db2, from the message in db1', async () => {
+    expect(ctx(OBS, DS2).tenant.level.source).toBe('column');
+    expect(ctx(OBS, DS).tenant.level.source).toBe('message');
+    const rows = await e2e.sql(volumeQuery(spec(OBS, {}, DS2), ctx(OBS, DS2), 3600), 'now-6h', 'now', DS2);
+    expect(new Set(rows.map((r) => r.g))).toEqual(new Set(['error', 'warn', 'info']));
+  });
+
+  it('a user granted only in db2 is refused by db1 and sees only their view in db2', async () => {
+    const db2only = new Session('kmbl3db2only');
+    await db2only.login();
+    await expect(db2only.sql(viewsQuery('vw_eks_app_logs_'))).rejects.toThrow(/invalid connection|denied|privilege/i);
+    const rows = await db2only.sql(viewsQuery('vw_eks_app_logs_'), 'now-6h', 'now', DS2);
+    expect(rows.map((r) => Object.values(r)[0])).toEqual([PAYMENTS]);
+  });
+});
````

<!-- end of patch blocks -->
