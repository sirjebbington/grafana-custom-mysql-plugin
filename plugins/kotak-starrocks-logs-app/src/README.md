# StarRocks Logs Drilldown

Explore StarRocks log views (`vw_eks_app_logs_*`) like Grafana Logs Drilldown, without writing SQL:

- pick a view you have access to, see every service with its log volume and newest lines;
- drill into a service: log volume by level, lines as Logs / Table / JSON, line search (include/exclude,
  case, regex), label and level filters, log details with filter buttons, show context, trace links to Tempo;
- Labels and Fields tabs: breakdowns with Include / Exclude, fields parsed from key=value and JSON lines;
- Patterns tab: per-tenant configured patterns with counts and trends, plus pattern suggestions.

Queries run through the `kotak-starrocks-datasource` data source as the signed-in user, so StarRocks and
Ranger decide which views and rows each person sees. Requires that data source (0.1.0 or later).
