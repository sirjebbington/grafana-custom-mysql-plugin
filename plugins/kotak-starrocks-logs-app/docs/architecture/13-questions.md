# 13. Questions and answers

[Index](README.md) · Previous: [Decisions](12-decisions.md) · Next: [Glossary](14-glossary.md)

Questions likely in an architecture discussion, from basic to deep. Each answer is short, with a link to
the detail.

## Basics

**Q1. What is it, in one sentence?**
A Grafana app that gives StarRocks log views the Loki Logs Drilldown experience: services, volumes,
filters, log lines, context, trace links, labels, fields and patterns, all without SQL, and all running as
the signed-in user.

**Q2. Why not just use Loki's Logs Drilldown?**
The logs are moving to StarRocks (Iceberg), and Logs Drilldown only speaks LogQL to Loki. Loki will be
removed once the migration is complete.

**Q3. Why not just use Explore with SQL?**
Most users do not write SQL, and Explore shows StarRocks results as a table. The app gives the familiar
drilldown screens and writes the SQL for them.

**Q4. Is it a data source plugin?**
No. It is an **app plugin**, frontend only. It uses the existing `kotak-starrocks-datasource` for every
query. ([Big picture](01-big-picture.md))

**Q5. What did you have to change in Grafana, the data source or StarRocks?**
Nothing. Grafana gets the plugin zip and a few config lines (unsigned allowlist, Drilldown section,
provisioning file). The data source, StarRocks and Ranger are unchanged.

**Q6. Who can see what?**
Exactly what Ranger lets them see. The views list is `SHOW TABLES` as the user, and every query runs as
the user. ([Security](09-security.md))

## Architecture and identity

**Q7. Walk me through one query.**
Panel, then runtime data source (builds the SQL), then `POST /api/ds/query`. Grafana attaches the user's
IDAM token; `kotak-starrocks-datasource` logs in to StarRocks with the token as the password and expands
`$__timeFilter`; StarRocks checks Ranger and runs it; rows come back as a frame; the browser shapes them
for the panel. ([Big picture](01-big-picture.md#one-query-step-by-step))

**Q8. Why can't the app have its own backend?**
Grafana forwards the user's OAuth token only to **data source** requests. An app backend would get no user
token, so it could not log in to StarRocks as the user. ([Decisions D2](12-decisions.md))

**Q9. Isn't sending SQL from the browser dangerous?**
No more than Explore. Any user can already type any SQL there, and it runs as them under Ranger. The app
cannot do more than the user. The builder still escapes everything, so filters cannot be turned into other
SQL. ([Security](09-security.md))

**Q10. What is the "runtime data source"?**
A data source object that exists only inside the app's page. Panels send it `{kind, spec}`; it builds the
SQL, calls `/api/ds/query`, and turns rows into frames. It is registered with Scenes and with Grafana core,
because the core Logs panel looks data sources up there for context and infinite scroll.

**Q11. How does StarRocks know the user?**
The data source opens a MySQL connection with username = the token's `sub` claim and password = the JWT,
over TLS. StarRocks verifies the JWT with IDAM's JWKS, then Ranger applies that user's policies.

**Q12. Are connections shared between users?**
Never. There is one small pool per user: up to 5 connections, closed after 60 s idle, retired when the
token changes.

**Q13. What happens when the token expires mid-session?**
Grafana refreshes it before forwarding. The data source sees a new token and retires the old pool; new
connections log in with the new token. If IDAM refuses the refresh, the user gets "sign out and in".

## Queries and data

**Q14. How many queries does a screen send?**
Service grid 2, Logs tab 2, Labels 1, Fields 2, Patterns 1, plus 1 per infinite-scroll page, values
drop-down or context step. ([Performance](10-performance.md#queries-per-screen))

**Q15. How do you get the column list if DESCRIBE is denied?**
`SELECT * FROM <view> LIMIT 0`: StarRocks returns the field names and no rows. The result is cached per
data source and view.

**Q16. How does the service grid show every service with one query?**
`GROUP BY bucket, service, level` over the range. The browser splits the result into one chart per
service. The newest lines for the visible services come from one `UNION ALL` of top-10 queries.
([Queries](05-queries.md))

**Q17. How do the Labels tab overviews avoid one query per column?**
`GROUP BY GROUPING SETS ((t, col1), (t, col2), …)` with `GROUPING_ID` tells which column each row belongs
to. ([Labels](08-labels-fields-patterns.md))

**Q18. How is the level computed?**
Per tenant: the `level` column normalised with a `CASE` (error, warn, info, debug, unknown), or a word
extracted from the message with ordered regexes, for observability. ([Queries](05-queries.md#the-level-expression))

**Q19. What does Include do in the grid?**
It adds `service = value` to the filter box. The grid stays (it ignores filters on its own label). Several
Includes on one label mean "any of them" (`IN`). Show logs then opens the logs for the current filters.

**Q20. How is search in log lines done?**
`lower(message) LIKE '%text%'` by default; case-sensitive LIKE with `Aa`; `regexp()` with `.*`; `instr()`
when the text has `%`, `_` or `\`. Exclude wraps it in `NOT`.

**Q21. Why `instr()` and not an escaped LIKE?**
StarRocks 4.0 does not match an escaped `\%` at the end of a LIKE pattern; it was found in testing.
`instr()` is exact.

**Q22. Can a user's filter value break the SQL?**
No. Values are escaped literals, names must be real columns, and `$` is split into `concat('…','$','…')`
because the data source expands macros even inside quotes.

**Q23. Where do the values in the filter drop-down come from?**
A live `GROUP BY` of that column in the time range, under the other filters, top 200 by count.

## Time

**Q24. How is the time range applied?**
`$__timeFilter(observed_timestamp)` becomes `BETWEEN FROM_UNIXTIME(from) AND FROM_UNIXTIME(to)` in whole
seconds. It lets StarRocks prune hourly partitions. ([Time](06-time.md))

**Q25. What about time zones?**
`observed_timestamp` is UTC, and `FROM_UNIXTIME` uses the session zone, so the StarRocks session must be
UTC (the data source's `timezone` setting, or the FE default). The browser displays times in the user's
Grafana zone.

**Q26. How precise are timestamps?**
Microseconds in StarRocks. Panels use milliseconds, so the app keeps the exact text in a hidden `__ts`
field for context and line ids.

**Q27. How are chart buckets chosen?**
The smallest round size giving at most 120 buckets: 10 s for 15 minutes, 30 s for an hour, 15 minutes for
a day. Empty buckets are filled with zeros.

**Q28. Why only 24 hours in the quick ranges?**
Cost on a shared single-node cluster. Longer ranges can still be typed, and text scans over `maxScanHours`
ask first.

## Features

**Q29. How does Show context pick the lines before and after?**
From the clicked line it takes the exact `__ts` text and the pod (uid, else name). It queries the same pod
for `ts < __ts` within 1 hour, newest first, 100 lines; and `ts > __ts` within 1 hour, oldest first, 100
lines. Scrolling loads 100 more from the outermost line shown.
([Show context](07-logs-context-scroll.md#show-context))

**Q30. Does context respect my filters?**
No, on purpose. It shows everything that pod logged around the line, as in Loki.

**Q31. How does infinite scroll get the next 1000 without gaps?**
Grafana asks for `[range start, oldest line shown]`. The app's SQL uses exact bounds (`ts < oldest + 1 ms`,
microsecond precision), so the boundary millisecond is fetched again. Grafana drops the repeats by
time + id, and the ids are stable across queries. ([Infinite scroll](07-logs-context-scroll.md#infinite-scroll))

**Q32. Why not just `OFFSET 1000`?**
New lines keep arriving, so offsets shift between pages. Offsets also make StarRocks sort and skip
everything before. Time-based paging is stable and cheap.

**Q33. How do trace links work?**
Per tenant there is a regex and a Tempo uid (usually generated from Loki's derived field). The regex runs
on each line in the browser, and the match becomes a `traceID` field with an internal link to Tempo.

**Q34. How do patterns work without server-side pattern detection?**
Each tenant has a configured list of named LIKE or regex patterns, all counted in one `CASE` query. The
first match wins, and the rest is "(unmatched)". "Suggest patterns" runs Drain in the browser on 2000
lines to propose entries.

**Q35. Where do the "fields in log lines" come from?**
From the newest `lineLimit` lines, parsed in the browser (JSON top level, or logfmt `key=value`). A
field's breakdown is then a server-side `regexp_extract` over the whole range.

**Q36. What are favourites and where are they stored?**
★ on a grid row. They are stored in browser localStorage per data source, view and label tab, and listed
first next time.

## Security

**Q37. Could someone see another team's logs by editing the URL?**
No. The view would not be listed, and a direct query fails with Ranger error 5204.

**Q38. Are the tenant settings a security risk?**
No. They are display settings (level source, trace link, patterns), applied only after Ranger has decided
what the user can read.

**Q39. Does the app ever see the token?**
No. Grafana attaches it server-side, and the data source uses it as the connection password.

**Q40. What about Tempo and Loki access?**
In OSS Grafana, data sources are readable by all org Viewers. That was accepted for Tempo; Loki will be
removed after the migration.

## Performance and scale

**Q41. What protects StarRocks from expensive queries?**
- every query has a time filter (partition pruning);
- at most 120 buckets;
- quick ranges stop at 24 h;
- a scan guard above `maxScanHours` for text scans;
- the level split is skipped for message tenants on long ranges;
- line limits;
- one aggregated query per element. ([Performance](10-performance.md))

**Q42. How fast is it?**
On UAT's observability view (5.6 M rows/h): newest 1000 lines about 0.15 s at any range; 1 h aggregates
about 0.2 s; 24 h aggregates 3 to 4 s; 24 h text scans 9 to 11 s.

**Q43. What happens with 50 concurrent users?**
Each user's queries run on their own connections (up to 5 each). The cluster sees roughly 2 queries per
screen change per user. The main risk is concurrent 24 h aggregations, hence the recommendation for a
StarRocks resource group.

**Q44. Does it load IDAM?**
Each new StarRocks connection fetches IDAM's JWKS (StarRocks does not cache it). Load scales with new
connections: first bursts, token refreshes, and idle gaps over 60 s. Raising the idle time cuts it.

## Operations and configuration

**Q45. How is it deployed?**
Like the data source: zip, then feed, then S3, then `s3-sync-init` at pod start. Plus three Grafana
settings: unsigned allowlist, the Drilldown app section, and the provisioning file. ([Going live](02-going-live.md))

**Q46. Where are the tenant settings defined?**
In a provisioning file in deploy-config, one entry per org. It is generated from the Loki data sources
plus an overrides file. After Loki is removed, it is edited directly.

**Q47. What if a setting is wrong?**
That entry alone is dropped and reported on the app and the configuration page; the rest keeps working.

**Q48. How do you add a second StarRocks database?**
Add another `kotak-starrocks-datasource` entry with that `database`. It appears in the Data source picker
automatically.

**Q49. How is it tested?**
- 58 unit tests (SQL builder, frames, settings, storage);
- 21 API tests that run every query kind on real StarRocks as different users;
- 28 browser tests in Grafana 12.0.1.

The test stack has two databases, a mock IDAM, and native JWT users with per-view grants standing in for
Ranger.

**Q50. How do you upgrade?**
New zip version, version bump in `s3-sync-init`, pod restart. Settings stay compatible, and old links
still open.

## Trade-offs and what-ifs

**Q51. What is the biggest assumption?**
The StarRocks session time zone is UTC. It is the same assumption dashboards make. Check it once per
environment.

**Q52. What does the app not do that Loki's Logs Drilldown does?**
- automatic server-side patterns (configured instead);
- add-to-dashboard and alerts;
- a logs view in Explore (Explore shows a table).

**Q53. What would change if the data source could be modified?**
It could return log frames and implement Explore's logs hooks: context, volume, filter toggles. "Open in
Explore" would then show logs. The app would keep working as it is.

**Q54. What if a view's schema changes?**
Columns come from `LIMIT 0` at open time, filters on missing columns are dropped, and configured `labels`
and `fields` are kept only if they exist in the view.

**Q55. Could this move to Grafana 13?**
Yes, after re-pinning `@grafana/*` and Scenes (Scenes 6.21+ needs `@grafana/i18n`, which 13.x has). The
architecture does not depend on 12.0.

**Q56. Why are timestamps not unique, and why does it matter?**
Many lines share a microsecond on busy services, and there is no row id. Paging and context therefore use
exact bounds plus content-based ids, never offsets or timestamp equality.

**Q57. What is the failure mode if StarRocks is slow?**
Panels show loading, and superseded queries are cancelled when the user changes something. The query
timeout is StarRocks' (300 s on UAT). Errors show in the panel with an explanation.

**Q58. Why Archify diagrams with PNG copies?**
Archify checks the diagrams and links boxes to source lines in its interactive HTML. GitHub's mobile app
renders PNG images reliably, but not interactive HTML.
