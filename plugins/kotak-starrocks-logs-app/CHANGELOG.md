# Changelog

## 0.4.0

- **Correct times on any StarRocks session zone.** Line times are computed by StarRocks
  (`UNIX_TIMESTAMP`, epoch ms) instead of being read as UTC by the data source. With the UAT FE in
  Asia/Kolkata, 0.3.0 showed every line 5 h 30 min late and "load more" asked for the wrong lines.
- **Time zone detected per view** (`timeZone: "auto"`, the default): two tiny probes tell an Iceberg
  `timestamptz` column (statements then run with `time_zone '+00:00'`) from a wall-clock `timestamp` column
  (statements run in the zone of its wall clock: UTC or the session zone). Override with `timeZone`
  (`"session"`, `"+00:00"`, `"Asia/Kolkata"`, …). Every statement carries a `SET_VAR` hint with the zone and
  `query_timeout` (`queryTimeoutSeconds`, default 120).
- **Text searches over long ranges are no longer blocked on the Logs tab**: the lines are searched newest
  first in windows (1, 2, 4, 8 h, on hourly partition boundaries) and the search stops at the line limit.
  Lines appear window by window, with progress and a Stop button. Above `maxScanHours` only the volume chart
  waits for "Load volume"; Labels, Fields and Patterns still ask first.
- **Time range limited to 24 hours** (`maxRangeHours`): typed ranges, links and zoom out are cut to their
  last 24 hours, with a notice.
- **Oldest log** at the top right: the time of the view's oldest line, found with LIMIT 1 probes (no scan of
  the whole view) and cached per browser for 6 hours. A time range before it says so and offers the first
  hours of logs.
- Cancelling: a newer selection, leaving the page or Stop cancels the request; StarRocks stops the query
  when the connection closes (verified on 4.1.6), and `query_timeout` is a backstop.
- StarRocks 4.1 "no grant in this database" (5203 on DATABASE) is explained in plain words.
- Local test stack: StarRocks 4.1.6 (the UAT version), session in Asia/Kolkata, `VIEW_TIME` modes, and real
  Iceberg tables (`scripts/e2e.sh iceberg`, `iceberg-smoke`).
- Settings: new optional `maxRangeHours`, `queryTimeoutSeconds`, `timeZone`; every 0.3.0 key works as before.

## 0.3.0

- Name: **Logs Drilldown (StarRocks)** (plugin id unchanged).
- Header like Logs Drilldown: "Filter by label values" combobox on the left (label and field columns,
  `=` `!=` `=|` `!=|` `=~` `!~`, a dropdown of the label's values in the time range), Data source and View
  pickers, time range and refresh on the right. Quick ranges: 5 minutes to 24 hours.
- Service grid: "service" tab plus **Add label** (closable tabs; no label tabs by default), "Search services"
  dropdown with line counts, "Showing N of M" with page size (10/20/50/100) and pages, volume legend as a
  table with totals per level, ★ favourites (per browser, listed first), **Include / Remove** per value,
  "Show logs" per value and above the grid (logs of the current filters).
- Logs page: "Log levels" select next to the line search.
- **Infinite scroll**: scrolling to the end of the logs loads the next `lineLimit` lines. Line ids are stable
  and each page has exact microsecond bounds, so pages join without gaps or repeats.
- A view is always selected: an invalid or empty `view` in the URL falls back to the last view used in this
  browser, then the first view; the URL can no longer clear the selection (fixes "Opening view…" staying up).
- Browser Back/Forward between the grid, logs and tabs. Label filters are in the URL as `var-filters`;
  0.1.0/0.2.0 links with `filter=` still open.
- Settings: unchanged, every 0.1.0/0.2.0 key works as before.

## 0.2.0

- Data source picker next to the view picker: each `kotak-starrocks-datasource` instance is one StarRocks
  database; views, columns and filters belong to the selected one (URL key `ds`).
- Optional `datasources` setting (allowlist and order, optional per-database `viewPrefix`); default: every
  instance of the plugin type in the org. `datasourceUid` is the default choice.
- Tenant settings can be scoped to one database with `<datasourceUid>/<app_id>` keys (field-by-field
  fallback to `<app_id>` and `default`).
- Without an explicit choice, the app falls back to the next data source where the user can see views.
- `gen-tenants-from-loki.py --pin-datasources` writes the org's StarRocks data sources as the list.
- Fully backward compatible with 0.1.0 settings.

## 0.1.0

- First version: view picker, service grid, Logs tab (volume, Logs/Table/JSON, line search, level and label
  filters, log details with filter buttons, show context, trace links to Tempo), Labels and Fields tabs,
  per-tenant Patterns tab with "Suggest patterns", per-tenant level source, scan guard, configuration page.
