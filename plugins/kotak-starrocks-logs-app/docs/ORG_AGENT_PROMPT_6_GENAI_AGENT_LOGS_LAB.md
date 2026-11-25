# Org prompt 6: GenAI `agent_logs` discovery for Logs Drilldown (read-only, StarRocks MCP)

You have the StarRocks MCP. Your job is to **gather facts only**. The facts decide how the Grafana app
"Logs Drilldown (StarRocks)" can show the GenAI agent logs: through a view the GenAI/StarRocks team would create,
or through a plugin change. **Do not change anything** (details under Rules).

## Background

- **The app:** it sends SQL through the `kotak-starrocks-datasource` as the signed-in user (IDAM token). Ranger
  decides what each user sees. The app lists its log sources with `SHOW TABLES LIKE 'vw_eks_app_logs_%'`.
  Each source must have these columns (names fixed in the app):
  - `observed_timestamp` (DATETIME): every query filters, sorts and buckets on it, so it must be the partition
    column, for pruning.
  - `message` (VARCHAR): the log line.
  - `level` (VARCHAR, optional; else the level is parsed from `message`).
  - Labels (low cardinality; the grid groups by `k8s_service_name`): `k8s_namespace_name`,
    `k8s_container_name`, `k8s_deployment_name`, `k8s_node_name`, `app_env`, `tenant_name`, ….
  - Fields: `k8s_pod_name`, `k8s_pod_uid` (Show context = same pod).
- **The new data source:** `genai-starrocks-db` (Grafana orgs 2 and 3), database
  `iceberg_glue_catalog.obs2_genai1_uat`. The GenAI team granted the table `agent_logs` directly; there is no
  view yet.
- **`DESCRIBE agent_logs`** (raw OpenTelemetry logs):
  - `tenant` VARCHAR, partition key
  - `event_time` DATETIME, partition key
  - `event_time_unix_nano` BIGINT, `observed_time_unix_nano` BIGINT
  - `trace_id` VARCHAR, `span_id` VARCHAR, `trace_flags` INT
  - `severity_text` VARCHAR, `severity_number` INT
  - `body`, `resource_attributes`, `scope`, `attributes`: VARIANT
  - `resource_schema_url` VARCHAR
- **VARIANT functions on 4.1.6:** `get_variant_string|int|double|bool|date|datetime|time(v, path)`,
  `variant_query(v, path)`, `variant_typeof(v)`.
- **Context:** if a GenAI router team guide exists in your workspace (for example `GENAI-ROUTER-TEAM-GUIDE.md`),
  read it first.

## Rules

1. **Read-only.**
   - No `CREATE` (not even temporary views or tables), `ALTER`, `DROP`, `INSERT`, `GRANT`, `REFRESH` or
     `SET GLOBAL`. Statement hints (`/*+ SET_VAR(...) */`) are fine.
   - If something seems to need a change, write the SQL in the report as a **proposal**; never run it.
2. **One query at a time, bounded.**
   - Every query on `agent_logs` filters `event_time` to a window.
   - Start with 1 hour; 6 hours at most without asking.
   - Add `LIMIT` to row queries, and `query_timeout = 120` in the hint.
   - Ask the user before anything wider, before the timing section, and before any metadata table scan that
     could be large.
3. **Mask data.**
   - Never paste raw log text or attribute values that could hold personal data, tokens, session or user IDs.
   - Show message *shapes*: digits → `0`, hex/UUID → `<id>`, emails → `<email>`, long free text → `<text>`.
   - Service, namespace, tenant and severity values may be shown. Real user IDs are written `kmbl…`.
4. **Ask before outward actions.** No messages to other teams.
5. **Report as you go.** Write everything to `~/GENAI_AGENT_LOGS_LAB.md`. Keep chat replies short.

## Step 0: find "now" in the data

- Run:
  `SELECT event_time FROM agent_logs WHERE event_time >= DATE_SUB(NOW(), INTERVAL 2 DAY) ORDER BY event_time DESC LIMIT 1`.
- Call the result **T0**. Use explicit windows `[T0 - 1h, T0]` (and later `[T0 - 6h, T0]`) in every query, so
  the session zone cannot shift the window.
- If this returns nothing, report it and stop.

## A. Environment

1. `SELECT current_version()` and `@@time_zone`.
2. `SHOW TABLES` in the database (names only). Do any views exist? Any `vw_eks_app_logs_*`?
3. Try `SHOW CREATE TABLE agent_logs`; it may be denied. Report the partition spec (identity or transform of
   `tenant` and `event_time`) from it, or from `agent_logs$partitions` with a small `LIMIT`.
4. Without creating anything: `SHOW GRANTS` for the MCP user. Could it create a view in this database?

## B. Volume and tenants (window 1 h, then 6 h)

1. Rows per hour, and rows per `tenant`.
2. Number of distinct tenants.
3. The oldest data, without a `MIN()` over the whole table:
   - "any row before X?" probes with `LIMIT 1` at 1, 2, 4, 8 … days back; or
   - the `$partitions` bounds, if readable.

## C. Time column

1. Is `event_time` an instant (Iceberg `timestamptz`) or wall-clock time?
   - Read the 3 newest rows as `CAST(event_time AS VARCHAR)` twice: with `SET_VAR(time_zone = '+00:00')` and
     with `SET_VAR(time_zone = '+05:30')`.
   - If the text differs by 5:30, it's an instant.
2. Compare `UNIX_TIMESTAMP(event_time)` (under `'+00:00'`) with `event_time_unix_nano / 1e9` and
   `observed_time_unix_nano / 1e9`.
   - Typical difference, and what % of rows have `event_time_unix_nano = 0` (unset in OTel).
   - Which time should the app show?
3. Precision: are there microseconds?
4. Ties: what % of rows share their exact `event_time` with another row of the same service and pod?

## D. Message (`body`)

1. Distribution of `variant_typeof(body)` over 1 h.
2. If string:
   - does `get_variant_string(body, '$')` return the text?
   - length percentiles (p50, p95, max);
   - 10 masked shapes.
3. If object: its top-level keys and their frequency, and which key holds the human-readable text.
4. Does `CAST(body AS VARCHAR)` work, and what does it return for strings: quoted or not?

## E. Level

1. Counts per `severity_text` (exact values) and per `severity_number` range:
   1–4 trace, 5–8 debug, 9–12 info, 13–16 warn, 17–24 error/fatal.
2. % with `severity_text` empty or NULL.
3. Do text and number agree?

## F. Attributes: candidate labels and fields

1. For `resource_attributes`, `attributes` and `scope`:
   - list the keys present and how often each is filled, in a sample of about 1000 rows from 1 h;
   - find a way to list keys, e.g. `variant_query(x, '$')` on a few rows, then test candidate keys; report what
     works.
2. Find the path syntax that works for dotted keys: `'$."service.name"'`, `'$.service.name'` or
   `'$["service.name"]'`. Report the one that returns values.
3. Check these keys and add any others found:
   - `service.name`, `service.namespace`, `service.version`
   - `k8s.namespace.name`, `k8s.pod.name`, `k8s.pod.uid`, `k8s.container.name`, `k8s.deployment.name`,
     `k8s.node.name`
   - `host.name`, `deployment.environment`
   - `gen_ai.*`, agent / model / session keys
4. For each useful key, the number of distinct values in 1 h:
   - labels: up to about 200;
   - fields: higher cardinality;
   - never use as a label: IDs such as session or request.
5. `trace_id` / `span_id`: % filled and format (32 hex?), for Tempo links.

## G. Timings (ask first; one query at a time, 1 h then 6 h, cold and warm)

1. **How to simulate the view without creating it:** use a subquery or CTE,
   `WITH v AS (SELECT event_time AS observed_timestamp, <message expr> AS message, <level expr> AS level,
   <label exprs> FROM agent_logs WHERE tenant = '<t>')`, then run the app's query shapes on `v`.
2. Run `EXPLAIN VERBOSE` once. Does the scan still prune partitions on `event_time` and `tenant` through the
   alias (partitions=x/y)?
3. Time these query shapes:
   1. **Newest 1000:** raw columns inside `ORDER BY observed_timestamp DESC LIMIT 1000`; message, level and
      labels computed outside.
   2. **Grid:** `COUNT(*)` per 1-minute bucket per service label (no level).
   3. **Grid split by level:** the same, also grouped by level.
   4. **Text search:** newest 1000 where `LOCATE(LOWER('<common word>'), LOWER(message)) > 0`.
   5. **Label values:** distinct service names with counts.
   6. **Show context:** one pod, ±1 h around a row, `ORDER BY observed_timestamp, message LIMIT 100`.
4. Note the cost of reading the VARIANT columns compared with plain columns.

## H. Proposal (do not execute)

1. Write the `CREATE VIEW vw_eks_app_logs_<app_id> AS SELECT …` you would recommend. Use the expressions that
   worked above:
   - `event_time AS observed_timestamp`
   - message
   - `level` from `severity_text`, else from `severity_number`
   - `k8s_service_name` and the other labels and fields, from the attributes
   - `WHERE tenant = '<tenant>'`
   - name: one view per tenant/app, or a single view if there is one tenant.
2. List what is still unknown, and for whom:
   - GenAI team: meaning of `tenant`, retention, which time to show;
   - Ranger admins: grants on the new view.

## Output: `~/GENAI_AGENT_LOGS_LAB.md`

- **Top of the file:** a "Key facts" table with about 15 lines, easy to photograph:
  - version and session zone;
  - partition spec;
  - rows per hour and tenants;
  - `event_time` kind (instant or wall clock);
  - body type mix;
  - severity filled %;
  - path syntax that works;
  - `service.name` / pod UID filled %;
  - tie %;
  - pruning through the alias (yes/no);
  - timings G.1–G.6 at 1 h and 6 h;
  - whether the MCP user could create a view.
- **Then:** sections A–H, with the exact SQL of each query (masked results) and "not run, because …" where
  something was denied or skipped.

**CHECKPOINT** after Step 0 + A, after F, and before G: show a short summary and wait for "continue".
