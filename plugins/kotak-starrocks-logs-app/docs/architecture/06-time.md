# 6. Time: from the time picker to SQL and back

[Index](README.md) · Previous: [Queries](05-queries.md) · Next: [Logs, context, scrolling](07-logs-context-scroll.md)

## The time column

- Every view has **`observed_timestamp`**, a `DATETIME` with **microseconds**, holding **UTC** wall-clock
  time. A `DATETIME` has no time zone attached.
- The Iceberg table is partitioned by `app_id` and **`hour(observed_timestamp)`**. A condition on
  `observed_timestamp` lets StarRocks read only the hours in range: 2 of 2521 partitions for 1 hour on UAT.
- Timestamps are **not unique**. Many lines share a microsecond on a busy service. This matters for paging
  and context.

## 1. The time picker

- A `SceneTimeRange` on the `EmbeddedScene` holds the range. It starts at `defaultTimeRange` (setting,
  e.g. `now-15m`), and `to` is always `now`.
- **Quick ranges** are fixed in the app: 5, 15 and 30 minutes, then 1, 3, 6, 12 and 24 hours. Longer
  ranges can still be typed as absolute or relative, and the scan guard applies to them.
- Zoom out, and the refresh picker (manual or auto interval), come from Scenes.
- The range is in the URL as `from` and `to`, e.g. `from=now-1h&to=now`. Absolute ranges are epoch ms.
- A relative range is **evaluated in the browser** when a query runs, using the browser's clock, into
  absolute `from` and `to` in milliseconds.

## 2. What goes to the server

`/api/ds/query` gets `from` and `to` as **epoch milliseconds** (strings), e.g. `1763643600000`.

## 3. The macro: `$__timeFilter`

The data source (`pkg/mysql/macros.go`) replaces `$__timeFilter(observed_timestamp)` with:

```sql
`observed_timestamp` BETWEEN FROM_UNIXTIME(1763643600) AND FROM_UNIXTIME(1763647200)
```

- The arguments are **whole seconds**. Go's `Unix()` drops the milliseconds.
- `BETWEEN` includes both ends.
- `FROM_UNIXTIME(s)` turns epoch seconds into a `DATETIME` **in the session time zone**. That is the key
  point of the next section.

## 4. Time zones: the one assumption that must hold

There are three places where a zone could apply:

| Where | What happens |
|---|---|
| StarRocks `FROM_UNIXTIME()` and `UNIX_TIMESTAMP()` | convert using the **session `time_zone`** |
| `kotak-starrocks-datasource` session | sets `time_zone` only if the data source's `timezone` setting is filled; otherwise the session starts with StarRocks' global `time_zone`, which defaults to the FE host's system zone |
| Go MySQL driver | reads `DATETIME` values **as UTC** (`Loc = UTC`) when turning rows into frames |

Since `observed_timestamp` holds UTC wall-clock time, **the session time zone must be UTC** (`+00:00`).
Otherwise every window, bucket and timestamp is shifted by the zone's offset. This is the same requirement
dashboards already have, because they use the same macro.

> **Check once per environment:** run `SELECT @@time_zone, NOW(), UTC_TIMESTAMP()` in Explore as a normal
> user. If `@@time_zone` is not UTC, set the data source's `timezone` to `+00:00`.

The browser then **shows** times in the user's Grafana time zone preference (default: the browser's zone).
Storage and queries stay UTC.

## 5. Buckets for charts

Volume charts group by a time bucket:

```sql
(UNIX_TIMESTAMP(`observed_timestamp`) DIV <b>) * <b>   -- bucket start, epoch seconds
```

The bucket size `b` is the smallest "round" size that gives **at most 120 buckets** for the range. The
choices are 1, 2, 5, 10, 15, 30 seconds; 1, 2, 5, 10, 15, 30 minutes; 1, 2, 3, 6, 12 hours; then whole days.

| Range | Bucket |
|---|---|
| 15 minutes | 10 s |
| 1 hour | 30 s |
| 6 hours | 5 min |
| 24 hours | 15 min |
| 7 days | 2 h |

The browser builds every bucket from `floor(from / b) * b` up to `to`, and fills missing ones with 0, so
stacked bars always line up.

## 6. Line timestamps: milliseconds for the panel, microseconds kept as text

A line query returns the time **twice**:

- `observed_timestamp`: a time field. Grafana panels use milliseconds, and the panel shows
  `2026-11-20 13:25:15.852`.
- `CAST(observed_timestamp AS VARCHAR) AS __ts`: the **exact** text, e.g. `2026-11-20 13:25:15.852430`.
  It is kept in a hidden field and used for:
  - **line ids** (`<__ts>_<pod>_<hash of the message>`), stable across queries;
  - **Show context**, which anchors on that exact text with no rounding;
  - the **zone-independent** comparison in context queries (`CAST('…' AS DATETIME)` compares wall-clock
    values directly).

## 7. Exact bounds on line queries

The macro is cut to whole seconds. A busy view has about 1,600 lines per second (5.6 M per hour on UAT),
so second boundaries would make paging skip or repeat lines. Line queries (`logs`, `table`) therefore add
two exact conditions:

```sql
AND `observed_timestamp` >= microseconds_add(FROM_UNIXTIME(<from s>), <from ms part × 1000>)
AND `observed_timestamp` <  microseconds_add(FROM_UNIXTIME(<to s>),   <(to ms part + 1) × 1000>)
```

The upper bound includes the **whole millisecond** `to` (it is `< to + 1 ms`). The macro range sent with
the request is **widened to whole seconds** around those bounds:

```text
from = floor(from / 1000) × 1000
to   = ceil((to + 1) / 1000) × 1000
```

- **Example, first page** (range 13:00:00.000 to 14:00:00.000 UTC):
  - exact bounds: `>= FROM_UNIXTIME(1763643600) + 0 µs` and `< FROM_UNIXTIME(1763647200) + 1000 µs`;
  - macro: `BETWEEN FROM_UNIXTIME(1763643600) AND FROM_UNIXTIME(1763647201)`.
- **Example, next page** (oldest line shown at 13:51:52.345):
  - exact upper bound: `< FROM_UNIXTIME(1763646712) + 346000 µs`;
  - macro: `… AND FROM_UNIXTIME(1763646713)`.

The macro keeps partition pruning. The exact bounds make the pages meet without gaps
([infinite scroll](07-logs-context-scroll.md#infinite-scroll)).

`microseconds_add(FROM_UNIXTIME(s), n)` was checked on StarRocks 4.0.10 to return a `DATETIME` with
microseconds.

## 8. Show context: time from the line, not from the picker

Context queries ignore the time picker. They use the line's `__ts` and a one-hour window:

```sql
`observed_timestamp` <  CAST('2026-11-20 13:25:15.852430' AS DATETIME)
AND `observed_timestamp` >= DATE_SUB(CAST('2026-11-20 13:25:15.852430' AS DATETIME), INTERVAL 1 HOUR)
```

These are constant bounds on the partition column. The request's range (line time ± 1 h) only travels
with the request; there is no macro in this SQL.

## 9. When the range changes

- Every panel re-runs with the new range. The refresh button re-runs with `now` recomputed.
- The scan guard is re-checked: range length in hours against `maxScanHours`.
- Values in the filter drop-down and the newest grid lines always use the current range.

## Quick reference

| Question | Answer |
|---|---|
| Which column is time? | `observed_timestamp` (UTC, microseconds) |
| How precise is the range filter? | macro: seconds; line queries: exact to the millisecond the panel knows, compared at microsecond precision |
| Which zone do queries use? | the StarRocks session zone, which must be UTC |
| Which zone is shown? | the user's Grafana preference |
| Longest quick range | 24 hours |
| How many chart buckets? | at most 120 |
