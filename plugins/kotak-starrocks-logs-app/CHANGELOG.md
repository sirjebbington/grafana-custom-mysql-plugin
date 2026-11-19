# Changelog

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
