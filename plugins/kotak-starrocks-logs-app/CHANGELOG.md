# Changelog

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
