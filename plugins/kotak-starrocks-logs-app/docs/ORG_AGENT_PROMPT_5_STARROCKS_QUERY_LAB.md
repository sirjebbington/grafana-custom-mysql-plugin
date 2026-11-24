# Task: measure the Grafana plugin's queries on UAT StarRocks, and write a findings file

You have two things here: the internal **Log Analytics UI** repository, and a **StarRocks MCP** connected to UAT
StarRocks. A separate Claude session, on a machine without access to either, builds the Grafana app plugin
"Logs Drilldown (StarRocks)" (`kotak-starrocks-logs-app`, now 0.4.0 in UAT). It needs **measured facts** about
UAT StarRocks and the data, so it can make the plugin fast and correct. Run the experiments below with the
MCP, read the UI code where asked, and write ONE Markdown file with the results. The other session sees only
your file.

## Rules (read first)

1. **Read-only.** Only `SELECT`, `EXPLAIN`, `SHOW` and `ADMIN SHOW … CONFIG`. No `CREATE`, `INSERT`, `ALTER`,
   `DROP`, `SET GLOBAL`, `REFRESH`, `KILL` (of others' queries), `ANALYZE TABLE`. Do not change the UI
   repository.
2. **Protect the shared cluster.** UAT has a small compute cluster that other people use.
   - Put `/*+ SET_VAR(query_timeout = 120) */` right after `SELECT` in every query.
   - Run one query at a time, never in parallel.
   - Always include a time filter, unless a step says otherwise.
   - Ask the user before any query over more than 6 hours on the observability view, and before any step
     marked **(ask)**.
   - If a query takes more than 60 seconds, do not repeat it; record the time instead.
3. **Timings.** For each timed query, record:
   - the elapsed time the MCP reports (or wall-clock time around the call), run twice: first ("cold") and
     second ("warm");
   - the rows returned;
   - where `EXPLAIN VERBOSE` is asked for, the `partitions=k/N` line of the Iceberg scan.
4. **Redact.**
   - No passwords, tokens, keys, host names or IPs (write `<ip>`, `<host>`), and no real user IDs (write `kmbl…`).
   - Never copy real log lines. When you need to show what lines look like, give their **shape** with values
     masked, e.g. `<date> <time> [info] <pid>#0: *<n> client <ip> closed keepalive connection`.
   - Table, view, column and service names are fine.
5. **Cite UI code** as `path:line`. Mark guesses as **(inferred)**. If you could not run something, write
   **Not run** and why.
6. Write `~/STARROCKS_QUERY_LAB.md`, outside the repository. Use plain Markdown, no images, about 60 KB at
   most. It will be **photographed or copied**, so use short tables and put the 15 most important numbers in
   section 0.

## Placeholders used below

- `OBS` = `vw_eks_app_logs_app_1961_observability` (the observability view). `BIG2`, `BIG3` = the two other
  views with the most lines in the last hour (find them in step B.3).
- `A`, `B` = epoch seconds of the range start and end. For "last N hours", use `B = UNIX_TIMESTAMP()` rounded
  down to a minute, and `A = B - N*3600`.
- The plugin sends `$__timeFilter(observed_timestamp)`; the data source expands it to
  `observed_timestamp BETWEEN FROM_UNIXTIME(A) AND FROM_UNIXTIME(B)`. Write the expanded form.
- `LVL_MSG` = how the plugin currently gets the level from the message (observability tenant):

  ```sql
  (CASE lower(coalesce(
     nullif(regexp_extract(message, '(?i)\\blevel["\']?\\s*[=:]\\s*["\']?([a-z]+)', 1), ''),
     nullif(regexp_extract(message, '\\b(FATAL|ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\\b', 1), ''),
     nullif(regexp_extract(message, '^([IWEF])[0-9]{4} ', 1), ''), ''))
   WHEN 'error' THEN 'error' WHEN 'err' THEN 'error' WHEN 'fatal' THEN 'error' WHEN 'critical' THEN 'error'
   WHEN 'e' THEN 'error' WHEN 'f' THEN 'error' WHEN 'warn' THEN 'warn' WHEN 'warning' THEN 'warn' WHEN 'w' THEN 'warn'
   WHEN 'info' THEN 'info' WHEN 'notice' THEN 'info' WHEN 'i' THEN 'info' WHEN 'debug' THEN 'debug'
   WHEN 'trace' THEN 'debug' WHEN 'd' THEN 'debug' ELSE 'unknown' END)
  ```
- `LVL_COL` = `(CASE lower(trim(level)) WHEN 'error' THEN 'error' WHEN 'warn' THEN 'warn' WHEN 'warning' THEN 'warn' WHEN 'info' THEN 'info' WHEN 'debug' THEN 'debug' ELSE 'unknown' END)`
- `TS_MS` = `(UNIX_TIMESTAMP(observed_timestamp) * 1000 + MILLISECONDS_DIFF(observed_timestamp, DATE_TRUNC('second', observed_timestamp)))`

## A. Environment

| # | Statement | Record |
|---|---|---|
| A.1 | `SELECT current_version(), CURRENT_USER(), CURRENT_ROLE(), @@time_zone, @@system_time_zone, @@query_timeout` | the MCP's identity and session. The plugin runs as each end user through Ranger; note whether the MCP user is an engineer or admin. |
| A.2 | `SHOW VARIABLES LIKE '%datacache%'`, `SHOW VARIABLES LIKE 'pipeline_dop'`, `SHOW VARIABLES LIKE '%incremental_scan%'`, `SHOW VARIABLES LIKE 'enable_view_based_mv_rewrite'` | values |
| A.3 | `ADMIN SHOW FRONTEND CONFIG LIKE '%kill_after_disconnect%'` | `true`/`false` (or "denied") |
| A.4 | `SHOW COMPUTE NODES` or `SHOW BACKENDS` (whichever works) | count, CPU cores, memory (no host names) |
| A.5 | `SHOW RESOURCE GROUPS ALL` | names and limits, or "none" / "denied" |

## B. Table, views and partitions

1. `SHOW CREATE TABLE <catalog>.<db>.eks_app_logs`, using the catalog and database behind the views. Record:
   - the type of `observed_timestamp`: is it an Iceberg `timestamptz` (with zone) or a `timestamp`?
   - the partition spec;
   - the file format and compression;
   - any sort order.
2. `SHOW CREATE VIEW OBS` and one other view: the full view SQL.
3. Lines in the last hour per view: run `SELECT /*+ … */ COUNT(*) FROM <view> WHERE observed_timestamp BETWEEN FROM_UNIXTIME(A) AND FROM_UNIXTIME(B)` with 1 hour for each view listed by `SHOW TABLES LIKE 'vw_eks_app_logs_%'`. Name `BIG2` and `BIG3`.
4. Iceberg metadata, if readable: `SELECT * FROM <catalog>.<db>.eks_app_logs$partitions LIMIT 5`. If it works:
   - for `app_id = 'app_1961_observability'` over the last 6 hours, give `record_count` and `file_count` per
     hour partition;
   - say whether a **normal user** could read it, or only the MCP user.
5. Same for `$files` (files per hour partition and average size, last 3 hours only). These numbers decide
   whether partition and file pruning helps.

## C. The time column

1. The plugin's probe: run `SELECT /*+ SET_VAR(time_zone='+00:00', query_timeout=60) */ CAST(observed_timestamp AS VARCHAR) t, message FROM OBS WHERE observed_timestamp >= DATE_SUB(NOW(), INTERVAL 1 DAY) AND k8s_service_name = 'otel-collector' ORDER BY observed_timestamp DESC LIMIT 1`.
   - Then run it again with `'+01:00'`.
   - Then run it again with no time_zone hint.
   - Record the three `t` values and the time written inside that message (masked, keep only its timestamp).
     This tells whether StarRocks shows the column as an instant (timestamptz) or as stored text.
2. **Batch granularity.** Many lines in the plugin show the same millisecond. For OBS over 1 minute
   (`B-60..B`), record:
   - the count of lines;
   - `COUNT(DISTINCT observed_timestamp)` (exact microseconds) and `COUNT(DISTINCT DATE_TRUNC('second', observed_timestamp))`;
   - the largest number of lines sharing one exact `observed_timestamp`
     (`… GROUP BY observed_timestamp ORDER BY COUNT(*) DESC LIMIT 5`);
   - the same per `k8s_pod_uid` (largest tie for one pod).
3. Is there any other time column or field with the event time (not the collector's)? Check the table
   columns, and whether most messages carry their own timestamp (give shapes per top service).

## D. Log level

The plugin is configured to read the observability tenant's level from the message text. That is slow (a
regexp per line) and misses nginx-style `[info]` / `[warn]` / `[error]`, so the proxy service shows only
"unknown". Find out from the data, not from assumptions, **whether and since when** each view's `level` column
is filled. Measure, over the **last 1 hour** for OBS, BIG2 and BIG3:

1. `SELECT COUNT(*), SUM(level IS NOT NULL AND trim(level) != ''), SUM(level_parser IS NOT NULL AND trim(level_parser) != '')`.
   - Also give the top 15 values of `level` and of `level_parser`, with counts.
   - State plainly, per view: is the level filled by the pipeline (yes, partly or no)?
2. For OBS, per `k8s_service_name` (top 15 by lines): the share of lines where `LVL_MSG` is 'unknown', and
   the share where `level` is non-empty.
3. For OBS lines where `LVL_MSG` is 'unknown': the top 20 message **shapes** (masked) per top service.
4. Coverage of these candidate rules, tried in this order. For each rule, give the share of OBS lines it
   matches first, and the share left unknown at the end:

   Each rule is an RE2 regex whose first group is the level word. In a StarRocks string literal, double
   every backslash.

   ```
   json        "(?:level|severity|lvl)"\s*:\s*"([A-Za-z]+)"
   logfmt      \b(?:level|lvl|severity)=["']?([A-Za-z]+)
   nginx       \[(emerg|alert|crit|error|warn|notice|info|debug)\]
   upper word  \b(FATAL|ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\b
   glog        ^([IWEF])[0-9]{4}
   ```

   (glog: the regex ends with one space after `{4}`.)

5. **Cost** (cold and warm), 1 hour and 6 hours:
   - `SELECT … COUNT(*) FROM OBS WHERE <time> GROUP BY <LVL_MSG>`;
   - the same with `LVL_COL`;
   - the same with the 5-rule set above.
6. **Since when.** For OBS, find when `level` started (or stopped) being filled. Go one hour at a time
   backwards from now, at most 48 hours, with
   `SELECT SUM(trim(level) != '') FROM OBS WHERE <that hour>`. Stop at the first hour whose answer differs
   from the current one, and report the boundary hour.
7. **Ask the user** whether they plan to change the observability pipeline's level setting.
   - If they change it during this session, wait until they say new data has arrived.
   - Then re-run D.1, D.6, and D.5 / E.1 / E.6 over the newest hour, and record before and after.
8. **Mixed data.** After a switch, older hours have no `level` and newer hours do. Measure the cost of a
   "column, else message" level (1 hour and 6 hours, cold and warm), compared with `LVL_COL` and `LVL_MSG`:
   `(CASE WHEN trim(level) != '' THEN <LVL_COL> ELSE <LVL_MSG> END)`.
   Does StarRocks skip the regexp for rows that have a level (is the cost close to `LVL_COL`)?

## E. Timings of the plugin's queries

Run each over **1 hour** first, then **6 hours**; 12 and 24 hours only on BIG2 or BIG3 **(ask)** for OBS. Record
cold and warm times, rows returned, and for E.1, E.4 and E.5 also `EXPLAIN VERBOSE` partitions.

| # | What the plugin uses it for | SQL (`<time>` = expanded `$__timeFilter`) |
|---|---|---|
| E.1 | service grid, levels | `SELECT (UNIX_TIMESTAMP(observed_timestamp) DIV 300)*300 t, k8s_service_name v, <LVL_MSG> lvl, COUNT(*) c FROM OBS WHERE <time> GROUP BY t, v, lvl` |
| E.2 | service grid, no levels | the same with `'all' AS lvl` |
| E.3 | totals per service only | `SELECT k8s_service_name v, COUNT(*) c FROM OBS WHERE <time> GROUP BY v ORDER BY c DESC` |
| E.4 | newest 1000 lines of a service | `SELECT TS_MS __ms, CAST(observed_timestamp AS VARCHAR) __ts, message, <LVL_MSG> detected_level, k8s_pod_uid FROM OBS WHERE <time> AND k8s_service_name='proxy' ORDER BY observed_timestamp DESC LIMIT 1000` |
| E.5 | text search over the whole range | E.4 plus `AND lower(message) LIKE '%timeout%'`: 1 h, 6 h and 24 h **(ask)**. The plugin now searches the newest hour first, so also give the 1-hour time. |
| E.6 | volume of one service | `SELECT (UNIX_TIMESTAMP(observed_timestamp) DIV 300)*300 t, <LVL_MSG> g, COUNT(*) c FROM OBS WHERE <time> AND k8s_service_name='proxy' GROUP BY t, g` |
| E.7 | show context | pick a pod uid and a `__ts` from E.4: `SELECT TS_MS __ms, message FROM OBS WHERE k8s_pod_uid='<uid>' AND observed_timestamp < CAST('<__ts>' AS DATETIME) AND observed_timestamp >= DATE_SUB(CAST('<__ts>' AS DATETIME), INTERVAL 1 HOUR) ORDER BY observed_timestamp DESC LIMIT 100` (also the `>` / ASC version) |
| E.8 | label values drop-down | `SELECT k8s_pod_name v, COUNT(*) c FROM OBS WHERE <time> AND k8s_pod_name != '' GROUP BY v ORDER BY c DESC LIMIT 200` |
| E.9 | Labels tab overview | `SELECT t, k8s_service_name, k8s_namespace_name, GROUPING_ID(k8s_service_name, k8s_namespace_name) gid, COUNT(*) c FROM (SELECT (UNIX_TIMESTAMP(observed_timestamp) DIV 300)*300 t, k8s_service_name, k8s_namespace_name FROM OBS WHERE <time>) s GROUP BY GROUPING SETS ((t, k8s_service_name), (t, k8s_namespace_name))` |
| E.10 | "Oldest log" probe | `SELECT 1 x FROM OBS WHERE observed_timestamp < FROM_UNIXTIME(<now - 1 day>) LIMIT 1`, and with `<now - 6 days>` |
| E.11 | oldest line overall | `EXPLAIN SELECT MIN(observed_timestamp) FROM OBS`, **EXPLAIN only**. Then, **(ask)**, time it on the smallest view only. |
| E.12 | newest line (the time zone probe) | C.1's query; record its time |

## F. What could make it fast (check, do not create)

1. **Pre-aggregation.** Could the StarRocks team keep an async materialized view of 5-minute counts per
   `app_id`, `k8s_service_name` and level over the Iceberg table, with query rewrite for the views?
   - Check `SHOW GRANTS` (what the MCP user may create).
   - Check whether any MV exists already (`SHOW MATERIALIZED VIEWS` in the databases you can see).
   - Note anything in the UI repository or docs about MVs.
   - Do not create one.
2. **Profile.** For E.1 (6 hours), get the query profile if the MCP allows it: run with
   `SET_VAR(enable_profile=true)`, then `SHOW PROFILELIST` and `ANALYZE PROFILE FROM '<query_id>'`. Record:
   - the top 5 operators by time;
   - rows scanned;
   - bytes read;
   - the data cache hit ratio.
3. **Sampling or coarser data.** Does StarRocks support any sampling on Iceberg here (`TABLESAMPLE`)? Try it on
   1 hour, if the syntax is accepted.
4. **Data cache.** Run E.2 (1 h) three times; does the time drop (cache warm)?

## G. UI code (Log Analytics)

Only things the plugin will copy. Cite `path:line`.

1. **Show context.** Answer these:
   - how the identifier chips at the top are chosen (`k8s_namespace_name`, `k8s_pod_name`, `k8s_pod_uid`,
     `k8s_service_name`), and whether they can be toggled;
   - the exact queries, limits and ordering;
   - how "Center matched line" works;
   - how lines with the same timestamp are handled;
   - the time precision shown (the UI shows microseconds).
2. **Histogram.** Bucket sizes, how levels are coloured, and what the UI shows for proxy lines (which have no
   `level`).
3. **Oldest Record.** Where it sits in the layout, and when it is computed.
4. **Loading and cancel.** How the UI shows that a query is running ("Searching logs…", the red "Cancel
   query" button), and anything that keeps the page usable meanwhile.
5. **Speed.** Anything that makes the UI faster than the plugin for the same range. The required
   namespace filter? The default `LIMIT 100`? Anything else?

## Output: `~/STARROCKS_QUERY_LAB.md`

Use these sections:
- 0. Fifteen key numbers and conclusions.
- A–G as above, with the tables filled in.
- H. Recommendations for the plugin, most valuable first, each with the measured gain.
- I. Open questions, and who can answer them.

When done, tell the user the file path and its size.
