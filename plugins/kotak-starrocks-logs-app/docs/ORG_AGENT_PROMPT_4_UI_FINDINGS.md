# Task: write a findings file about this StarRocks log UI, for the Grafana plugin team

You are working in the repository of our internal web UI for querying application logs stored in StarRocks.
A separate Claude session, on another machine that cannot see this repository, is building and optimizing a
Grafana app plugin over the same logs: "Logs Drilldown (StarRocks)" (`kotak-starrocks-logs-app`). It needs to
learn what this UI does and exactly how, so it can reuse the good ideas. Study this repository and write ONE
Markdown file that answers the questions below. The other session will see only your file, so make it
explicit and self-contained.

## Rules

1. Read only. Do not change, commit, push or reformat anything in this repository. Do not install packages.
2. Do not start the UI or send any query to StarRocks yourself unless the user says yes in this session (see
   "Optional live checks").
3. Write the file outside the repository, at `~/STARROCKS_UI_FINDINGS.md` unless the user names another place.
   Do not add it to git.
4. Redact. Leave out passwords, tokens, API keys, private keys, cookies, and connection strings that contain
   credentials. Write real user IDs as `kmbl…`. Leave out personal names and emails. Replace internal IPs and
   host names with `<fe-host>` or `<backend-host>`. Never copy real log message text, because logs can hold
   customer data: invent a harmless example instead. Table, view, catalog, database and column names are fine.
5. Cite every claim as `path/to/file.ext:line` in this repository. Mark anything you infer but did not see in
   code as **(inferred)**. If you cannot find something, write **Not found** and say where you looked. Do not
   guess.
6. Keep code excerpts short (about 40 lines at most), and only for query building, time handling, validation,
   cancellation and error handling. Prefer the final SQL text, with placeholders, over the code that builds it.
7. Produce one plain Markdown file with no images, ideally under 80 KB so it can be copy-pasted. Put SQL in
   fenced sql blocks.
8. If the Grafana plugin repository is also on this PC (folder `plugins/kotak-starrocks-logs-app`), you may
   read `src/sql/builder.ts` there to compare. Read only.

## Background: what the plugin does today

- Grafana 12.0.1 OSS. The plugin is frontend-only. The browser builds SQL and sends it through Grafana to our
  MySQL-protocol data source plugin `kotak-starrocks-datasource`. That plugin logs in to StarRocks as the
  signed-in user, with the IDAM JWT as the password, and Ranger allows or denies each view per user.
- Data: one Iceberg table `eks_app_logs` holds all tenants. It is partitioned by `app_id` and
  `hour(observed_timestamp)`. Each tenant has a view `vw_eks_app_logs_<app_id>`. The table has 21 columns, all
  VARCHAR except `observed_timestamp`, which is DATETIME with microseconds, in UTC. The `message` column holds
  the log text. There is no row id.
- Time filter: `observed_timestamp BETWEEN FROM_UNIXTIME(<from s>) AND FROM_UNIXTIME(<to s>)`. Log lines come
  from `ORDER BY observed_timestamp DESC LIMIT 1000`.
- Text search uses `LIKE '%…%'`, `instr(message, '…') > 0` or `regexp()`. It reads every message in the range.
  On UAT, a 24-hour text scan of one large view takes 9 to 11 seconds on one compute node; one hour takes
  about 0.5 seconds.
- Because of that cost, the plugin blocks text searches over more than 6 hours. A text search here means a
  line search, a field inside the message, patterns, or a level read from the message. Instead of results it
  shows: "The current filters … need a full scan of the log text. The selected range is 24 hours; the
  configured limit is 6 hours." Users hit this at 12 and 24 hours. We want to remove or soften that limit by
  querying more cleverly.
- Users also report frequent SQL errors in the plugin. The user may paste them at the end of this prompt.

## What to find out and write

Use these headings and numbers exactly.

### 0. Summary

At most ten bullets: the most useful ideas for the plugin, each pointing to a section below.

### 1. The UI at a glance

- 1.1 Stack (languages, frameworks, versions), and how it is built and deployed.
- 1.2 Architecture: browser, backend (if any), StarRocks. Does it talk to StarRocks directly (MySQL protocol:
  which driver and pool settings), through a backend service, or through the StarRocks HTTP API?
- 1.3 Identity: does each query run as the signed-in user (which token, and how it is passed) or as a service
  account? How is per-tenant access enforced (Ranger, or the UI's own checks)?
- 1.4 Which catalogs, databases, tables, views or materialized views it queries. Does it use the same
  `vw_eks_app_logs_<app_id>` views, the base Iceberg table, native StarRocks tables, or something else?

### 2. Feature inventory

Give a table with these columns: feature | what the user sees | how it works | queries sent | file:line.
Include every feature, and at least these:

- 2.1 The first log date shown at the top right. Give its exact source: the SQL, an Iceberg metadata table
  such as `$partitions` or `$snapshots`, a config value, or a cache. Say when it is computed, how it is cached
  and refreshed, and what it shows when there is no data or no access. Also cover any last log date, row count
  or retention information.
- 2.2 Time range picker: presets, maximum range, default, the time zone shown to users (IST or UTC), and how
  the range becomes SQL.
- 2.3 Filters (service, namespace, pod, level, others) and text search (case sensitivity, AND/OR, regex,
  exclude), and how each becomes SQL.
- 2.4 Results: how many rows, sorting, pagination or scrolling, histograms or volume charts, row details,
  context (lines before and after), export or download.
- 2.5 Everything else: saved queries, share links, alerts, statistics.

### 3. Query building (most important)

- 3.1 For each kind of query (rows, counts or histogram, distinct values for drop-downs, first log date,
  others), give the final SQL template with placeholders.
- 3.2 Time: how the user's range becomes SQL. Cover time zone handling (session `time_zone`, `CONVERT_TZ`,
  epoch numbers, string literals), whether it relies on partition pruning, and how bounds are formatted
  (seconds, milliseconds, microseconds).
- 3.3 Text search: LIKE, ILIKE, `lower()`, `instr`, `regexp`, `MATCH` or `match_any`, ngram or bloom filter
  indexes, or anything else. Cover how `%`, `_`, `\` and quotes are escaped, and case sensitivity. Is there any
  trick that avoids reading every message?
- 3.4 Large ranges. Does it split a long range into smaller windows (for example, the newest hour first, then
  wider windows until it has enough rows)? Does it run windows in parallel, stop early, sample, cap the range,
  run asynchronous jobs or stream results? Describe the algorithm exactly, with window sizes and stop
  conditions.
- 3.5 Limits and guards: maximum time range, maximum rows, required filters, warnings or confirmations before
  expensive queries, and cost estimates (EXPLAIN, a row-count pre-check). Give the exact thresholds.
- 3.6 Session settings and hints: anything set per connection or per query, such as `SET …` or
  `/*+ SET_VAR(…) */` hints for `query_timeout`, `time_zone`, `pipeline_dop` or `enable_scan_datacache`. Say
  why each is set.
- 3.7 Pagination: offset and limit, or keyset by timestamp? How does it avoid gaps and duplicates when
  timestamps repeat?

### 4. Cancelling queries and stopping incorrect selections

The user says this UI has logic that cancels a query when the selection is incorrect. Explain exactly:

- 4.1 Which user actions cancel a running query (changing a filter, the time range or the tenant, leaving the
  page, a Cancel button), and how: debounce, `AbortController`, request ids that drop stale responses, and so on.
- 4.2 Whether the query is also stopped inside StarRocks: `KILL QUERY <id>` or `KILL <connection id>`, how the
  id is obtained (`CONNECTION_ID()`, `last_query_id()`, `SHOW PROCESSLIST`, a label or hint), closing the
  connection, or `query_timeout`. If the UI only abandons the HTTP request and the query keeps running, say so.
- 4.3 Checks that stop an incorrect query before it runs: no tenant selected, range too long, empty or too
  short search text, invalid regex, end before start, dates in the future. List each rule and its message.
- 4.4 Concurrency: how many queries one user can run at once, any queueing, and what a double click does.

### 5. Handling huge volumes

- 5.1 The largest time ranges and row counts the UI is used for, and how long typical queries take. Use any
  numbers in code, comments, tests, docs or tickets.
- 5.2 Caching: browser, backend, StarRocks query cache, data cache, reuse of results between screens.
- 5.3 Pre-aggregation: materialized views, rollups, summary tables, scheduled jobs. Give names, definitions and
  refresh schedules, and say whether StarRocks rewrites queries to them automatically.
- 5.4 UI side: virtualised lists, lazy loading, limits on rendered rows.
- 5.5 StarRocks resource limits mentioned anywhere (query queue, resource groups, `query_timeout`,
  `query_mem_limit`), and how the UI reacts when one is hit.

### 6. Errors and how the UI handles them

- 6.1 Every StarRocks or SQL error the code checks for or works around. Give the code and message text, for
  example syntax errors, 5204 Ranger denials, timeouts, memory limits, too many partitions, Iceberg file not
  found, connection resets, expired tokens. For each, say what the UI does: retry, message or fallback.
- 6.2 StarRocks quirks or bugs the code works around. Search for comments such as "workaround", "bug", "hack",
  "StarRocks", "TODO" and "FIXME".
- 6.3 Retries and timeouts: their values and where they are set.

### 7. StarRocks facts found in this repository

Version, cluster shape, catalogs, table and view DDL, partitioning, sort keys, indexes, bloom filters, Iceberg
file format and compression, retention, data cache settings: anything written in code, config, docs,
migrations or scripts. Cite each one. Add the results of the optional live checks here.

### 8. Ideas for the plugin

What the Grafana plugin should copy, most valuable first. For each idea give what to do, why, the SQL involved,
and any limit. One important limit: the plugin has no service account or admin rights. It runs every query as
the signed-in user through the data source.

### 9. Open questions

What you could not determine, and who might know.

### 10. The user's plugin errors

Only if the user pasted errors at the end of this prompt. For each one give the likely cause, whether and how
this UI avoids it, and file:line.

## Optional live checks (ask the user first)

Run these only if the user says yes. Either the user runs them in Grafana Explore (the StarRocks data source,
Code mode, Format: Table), which is the plugin's own path, and pastes the results to you; or you run them
through a read-only client that already exists. Use one small view and at most a one-hour range. Record each
statement and its redacted result in section 7. If one fails, record the error and move on.

1. `SELECT current_version();`
2. `SELECT @@time_zone, @@system_time_zone, @@query_timeout;`
3. `SELECT /*+ SET_VAR(query_timeout=30) */ 1;` (do per-query hints work?)
4. `SHOW VARIABLES LIKE '%datacache%';`
5. `EXPLAIN SELECT observed_timestamp FROM <view> WHERE observed_timestamp >= NOW() - INTERVAL 1 HOUR AND message LIKE '%error%' ORDER BY observed_timestamp DESC LIMIT 100;`
   Paste the plan. Look for partition pruning and a TopN.
6. `EXPLAIN SELECT MIN(observed_timestamp) FROM <view>;` Run EXPLAIN only, never the query itself, because it
   could read every partition. Does the plan read data files or only metadata?
7. If the UI gets the first log date from Iceberg metadata tables, run its query and say whether it works for a
   normal user or only for an admin.

## Errors the user sees in the Grafana plugin

(User: paste each exact error text here, one per line, with the tab and time range where it appeared. Write
"none" if you have none.)

When you are done, tell the user the file path and its size.
