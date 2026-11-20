# 8. Labels, Fields and Patterns tabs

[Index](README.md) · Previous: [Logs, context, scrolling](07-logs-context-scroll.md) · Next: [Security](09-security.md)

All three tabs use the **current filters** and time range. Changing a filter from inside a tab returns the
tab to its overview.

## Labels tab

**Overview: one panel per label column**, each with its top 5 values over time.

- **One query for all columns**: `GROUP BY GROUPING SETS ((t, col1), (t, col2), …)`, plus
  `GROUPING_ID(col1, col2, …) AS gid` ([SQL](05-queries.md#labels-or-fields-overview-kind-labeloverview)).
  StarRocks scans the filtered rows once and aggregates per column.
- **Which column a row belongs to.** In `GROUPING_ID(c0 … cn-1)`, bit `n-1-k` is **0** when column `k` is
  part of that row's grouping set. The browser finds the `k` whose bit is 0, and reads that column's value.
  Rows with an empty value are skipped.
- Per column, the browser keeps the **top 5 values** by total, and counts distinct values. That count is
  the panel description ("N distinct values; top 5 shown").
- Columns with more than one value are listed first.

**Select** on a panel opens that column's **value breakdown**: the top 30 values by total, one panel each
(kind `valueBreakdown`). Each has:

- **Include**: adds `col = value`;
- **Exclude**: adds `col != value`.

## Fields tab

Two sections:

1. **Columns**: the same overview as Labels, for the field-like columns (`k8s_pod_name`, `k8s_pod_uid`,
   `k8s_pod_start_time`, `log_file_path` by default). **Select** works the same way.
2. **Fields in log lines**: `key=value` and JSON fields found **inside the message**.
   - The app fetches the newest `lineLimit` lines (a normal `logs` query) and parses each message **in the
     browser** (`patterns/messageFields.ts`):
     - a message that is a JSON object yields its top-level strings, numbers and booleans;
     - otherwise, logfmt-style `key=value` and `key="quoted value"` pairs.
   - A table lists each field with:
     - the **share of sampled lines** that have it;
     - its **distinct count** (counted up to 1000);
     - its **top 5 values**, with `+` (include) and `−` (exclude).
   - `+` / `−` add a **message field filter**, which becomes a regex condition on `message`
     ([SQL](05-queries.md#message-field-filters-status500-inside-the-line)).
   - **Breakdown** charts that field's values over the **whole range**, server-side, with
     `regexp_extract(message, …, 2)` (kind `fieldBreakdown`), top 30 values.

The field list comes from a **sample**, but the breakdown counts are over **all lines** in the range.

## Patterns tab

### Why configured patterns, not automatic ones

Loki computes patterns on the server. StarRocks has nothing equivalent, and masking digits on UAT gave
676 thousand groups for 1.16 million lines, which is useless. So patterns are **named lists per tenant**,
in the settings:

```yaml
patterns:
  - { name: Upstream timed out, like: '%upstream timed out%' }
  - { name: Connection refused, regex: 'Connection refused to [a-z0-9-]+:[0-9]+' }
```

### What the tab shows

- **One query** counts every pattern per time bucket, with a `CASE` that has one `WHEN` per pattern
  ([SQL](05-queries.md#patterns-kind-patterns)).
  - **First match wins.** A line matching two patterns counts only for the first, so put specific
    patterns before general ones.
  - `ELSE ''` becomes **(unmatched)**: what no pattern covers. A large share means the list needs more
    entries.
  - Pattern filters are **not** applied to this query, so the table keeps showing all patterns while some
    are included or excluded. Other filters do apply.
- A **bar chart** of pattern volume, and a **table** with, per pattern:
  - its definition (`LIKE …` or `regex …`);
  - total lines, share, and a trend sparkline;
  - **Include** / **Exclude** toggles.
- Include several patterns and a line must match **any** of them. Each exclude removes its matches.
- With no patterns configured, the tab explains where to add them (`tenants.<app_id>.patterns`).

### Suggest patterns

This helps write the list. It runs **in the browser**, on a sample:

1. It fetches the newest **2000** lines under the current filters, with pattern filters removed.
2. It groups them with a small **Drain** algorithm (`patterns/drain.ts`; He et al., ICWS 2017):
   - **tokenise** on whitespace (up to 64 tokens);
   - **mask** tokens that look variable, and turn them into `<*>`: numbers, durations, percentages,
     versions, hex ids of 8 or more characters, UUIDs, IPs with optional port, and anything with 3 or
     more digits. In `key=value`, only the value is masked;
   - **bucket** lines by token count and first token;
   - **join** the most similar template in the bucket when at least 50% of positions match. Differing
     positions become `<*>`. At most 500 templates are kept.
3. It shows the top 30 templates, with their count **in the sample**.
4. Each template becomes a config entry:
   - a `LIKE` pattern: `<*>` becomes `%`, and `%`, `_` and `\` are escaped;
   - or a regex when the literal text contains `%`, `_` or `\`, because StarRocks 4.0's LIKE escaping is
     unreliable;
   - with a short name from the first words.

   Entries can be copied one by one, or as "top 10 as config".

Suggestions are a starting point. The counts are sample counts, and an admin decides what goes into the
settings.

## Values drop-down in the filter box

Not a tab, but the same idea: when a label is picked in the filter box, its **200 most frequent values**
in the range, under the other filters, are listed
([SQL](05-queries.md#values-drop-down-label-filter-box)).
