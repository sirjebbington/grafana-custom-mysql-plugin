# 10. Performance and guardrails

[Index](README.md) · Previous: [Security](09-security.md) · Next: [When things go wrong](11-failure-modes.md)

## The environment it was designed for

UAT, measured on 2026-11-18:

- **One compute node** (6 CPU, 50 GiB), shared-data mode with the data cache on;
- no query queue and no resource groups; `query_timeout` 300 s;
- observability view: about **5.6 million rows per hour**, 146 million per day.

So the design keeps **few queries per screen**, avoids reading the `message` column unless asked, and
guards long text scans.

## Three kinds of query, three costs

| Kind of query | Examples | Cost driver |
|---|---|---|
| **Newest N** (`ORDER BY ts DESC LIMIT n`) | log lines, grid samples, context | small; partitions are read newest first |
| **Aggregation over the range** | volumes, label overview, breakdowns, values drop-down | rows in range, columns read; not the message |
| **Text scan** | line search, field filters and breakdowns, patterns, message levels | reads every message in range |

Measured on UAT (observability view):

| Query | Time |
|---|---|
| newest 1000 lines, 1 h or 24 h | about 0.15 s |
| aggregation, 1 h | about 0.2 s |
| aggregation, 24 h | 2.7 to 3.8 s |
| text scan with no match, 1 h | about 0.5 s |
| text scan with no match, 24 h | 9 to 11 s |
| partitions read for 1 h | 2 of 2521 |

## Queries per screen

| Screen | Queries |
|---|---|
| First open | `SHOW TABLES` (per data source tried), `LIMIT 0` columns (cached), then the grid |
| Service grid | 2: volume `GROUP BY` for all values; newest-lines `UNION ALL` for the visible page |
| Grid page change | 1 (newest lines of the new page) |
| Logs tab | 2: volume, lines |
| Infinite scroll | 1 per page |
| Labels tab | 1 (overview); 1 when a label is selected |
| Fields tab | 2 (overview, sample of `lineLimit` lines); 1 per field breakdown |
| Patterns tab | 1; Suggest adds 1 (2000 lines) |
| Values drop-down | 1 each time a key is picked |
| Show context | 2 on open, 1 per load more |
| Time range change / refresh | the current screen's queries again |

Superseded requests are cancelled by Scenes. Out-of-date answers for the data source, view and columns
are ignored using request numbers.

## Built-in guardrails

### Partition pruning, always

Every range query has `$__timeFilter(observed_timestamp)`, and context queries have constant bounds on the
same column. StarRocks reads only the hourly partitions in range.

### At most 120 buckets

Bucket sizes are picked so a chart has at most 120 points ([Time](06-time.md#5-buckets-for-charts)). Result
sets stay small whatever the range.

### The scan guard (`maxScanHours`, default 6)

If the range is longer than `maxScanHours` and a query needs to read message text, the app shows a notice
instead of running it. The cases:

| Screen | Guarded when |
|---|---|
| Logs tab | a line, field or pattern filter, or a level filter on a message tenant |
| Labels / Fields tab | the same, or a breakdown of a field inside the message |
| Patterns tab | always, when the tenant has patterns (counting reads every line) |

The notice offers:

- **Use the last N hours**: sets the range to `now-<maxScanHours>h`;
- **Run anyway**: runs the query. This is remembered for that exact range (raw `from|to`) until the range
  changes.

### Level split skipped on long ranges (message tenants)

For a tenant whose level comes from the message, volumes on a range longer than `maxScanHours` are drawn as
one **"all"** series. Splitting by level would need the regexes on every message. A notice offers
**Split by level anyway**.

### Quick ranges stop at 24 hours

Longer ranges must be typed, and the guard still applies.

### Limits on result size

- Lines per query: the line limit (10 to 5000, default 1000).
- Values drop-down: 200 values. Grid samples: 10 lines per value on the visible page only.
- Value breakdowns: the browser keeps the top 30 (the query itself groups all values in range).
- Grafana's data source row limit applies on top: `[dataproxy] row_limit`, 1,000,000 by default.

### Fewer round trips

- The column list is cached per data source and view, and shared by all panels.
- The label overview is one `GROUPING SETS` scan for all columns, not one query per column.
- Grid samples are one `UNION ALL`, not one query per service.
- Patterns are one `CASE` scan for all patterns, not one query per pattern.

## Connections and IDAM load

- Per user and data source, up to **5** pooled connections. They close after 60 s idle (below the NLB's
  idle timeout of about 350 s), and the pool is retired when the token changes.
- **Each new connection is a StarRocks JWT login, and StarRocks fetches IDAM's JWKS on every login.** IDAM
  JWKS load is therefore about the number of new connections:
  - a user's first burst opens up to 5;
  - every token refresh (about hourly with ID tokens) opens new ones;
  - idle gaps over 60 s open new ones.
- A grid page with 2 queries, or a Logs tab with 2, fits within the 5 connections.

## Tuning knobs

| Knob | Where | Effect |
|---|---|---|
| `maxScanHours` | app settings | when text scans need confirmation |
| `lineLimit` | app settings | default page size |
| `defaultTimeRange` | app settings | first range users see (keep it short) |
| `labels` / `fields` | app settings | fewer columns, a smaller overview and smaller line rows |
| `maxConnsPerUser`, `connMaxIdleSeconds` | data source settings | connection reuse vs. pool size |
| resource group for Grafana users | StarRocks | protects the cluster from many concurrent users |

## Recommendations before a wide rollout

1. Ask the StarRocks team for a **resource group** (or concurrency limit) for interactive Grafana users.
2. Keep `defaultTimeRange` at 15 minutes to 1 hour.
3. Consider a longer `connMaxIdleSeconds` (for example 300 s) to cut JWT logins and JWKS fetches.
4. Check the session time zone once ([Time](06-time.md#4-time-zones-the-one-assumption-that-must-hold)).
