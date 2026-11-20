# 11. When things go wrong

[Index](README.md) · Previous: [Performance](10-performance.md) · Next: [Decisions](12-decisions.md)

The app adds an explanation to the StarRocks errors users are likely to hit (`friendlyError` in
`datasource/api.ts`), and shows the original message after it.

## Sign-in, access and data sources

### "Could not list your StarRocks log views … StarRocks refused the connection … invalid connection"

- **Cause**: the StarRocks login failed. Usually the user has **no privilege on anything** in the data
  source's database; StarRocks checks the default database at login. Less often, IDAM rejected the token.
- **Where**: the body, and next to that data source in the picker.
- **Fix**: a Ranger policy on the user's view in that database. If the token is the problem, sign out and
  in.

### "No log views available"

- **Cause**: `SHOW TABLES LIKE '<viewPrefix>%'` returned nothing for the user.
- **Fix**: Ranger access to the team's view, or a `viewPrefix` that matches the database's views.

### "Access denied by Ranger (5204)"

- **Cause**: a query on a view the user cannot read, for example an old shared link.
- **Fix**: Ranger, if they should have access.

### "Sign in with IDAM … no IDAM token on this request"

- **Cause**: signed in without IDAM (basic-auth admin, service account), or OAuth pass-through off on the
  data source.
- **Fix**: sign in through IDAM; check `oauthPassThru` on the data source.

### "The IDAM token has expired and Grafana could not refresh it"

- **Cause**: IDAM did not return a new token on refresh.
- **Fix**: sign out and in.

### Data source drop-down empty: "No kotak-starrocks-datasource data source is available"

- **Cause**: there is no instance in this org, or `datasources` lists uids that do not exist here.
- **Fix**: the org's data source provisioning, or `datasources`.

## Screens

### Stuck on "Opening view…" (0.1.0/0.2.0)

- **Cause**: a URL update cleared the view while the app was picking it.
- **Fixed in 0.3.0**: empty URL values are ignored, and the body re-picks a view when it finds none.

### "Could not open <view>"

- **Cause**: the `SELECT * … LIMIT 0` column query failed (permissions changed, or the view was dropped).
- **Fix**: retry, or switch views. The failed lookup is not cached.

### A configuration warning on top of the app

- **Cause**: an invalid settings entry. It is ignored, and the message names the key.
- **Fix**: correct the provisioning file. The configuration page validates live.

### "This query scans log text over a long time range"

- **Cause**: the scan guard (range longer than `maxScanHours` with a text filter, or the Patterns tab).
- **Fix**: "Use the last N hours", or "Run anyway" for this range.

### "Volumes are not split by level for this range"

- **Cause**: a tenant with levels from the message, on a range longer than `maxScanHours`.
- **Fix**: shorten the range, or "Split by level anyway".

## Data looks wrong

### All times shifted by a few hours

- **Cause**: the StarRocks session time zone is not UTC
  ([Time](06-time.md#4-time-zones-the-one-assumption-that-must-hold)).
- **Fix**: set the data source's `timezone` to `+00:00`, and check with `SELECT @@time_zone`.

### Every line is "unknown" level

- **Cause**: the tenant's level source is wrong: the `level` column is empty but the source is `column`,
  or the message regexes do not match the format.
- **Fix**: `level: {source: message}`, with `regex` if the defaults do not fit.

### No "View trace" link

- **Cause**: no `trace` setting for the tenant; the regex does not match; or Tempo is in another org.
- **Fix**: add or fix `tenants.<app_id>.trace`. Regenerate from Loki if a derived field exists there.

### Patterns tab: large "(unmatched)"

- **Cause**: the list does not cover the common lines.
- **Fix**: use **Suggest patterns**, and add entries. Put specific patterns before general ones (first
  match wins).

### A pattern with `%`, `_` or `\` in its text never matches

- **Cause**: StarRocks 4.0 does not honour an escaped `\%` at the end of a LIKE pattern.
- **Fix**: write that pattern as a `regex`.

### Show context is empty

- **Cause**: the line has neither `k8s_pod_uid` nor `k8s_pod_name`; or nothing else from that pod within
  one hour.
- **Expected**: other lines with exactly the same microsecond as the anchor are not shown.

### Infinite scroll stops

- **Cause**: the oldest line is within 1 s of the range start, or there are no older lines in the range.
- **Fix**: widen the range. Table and JSON never scroll for more.

### Rows below the visible area show a raw number for the time

- **Cause**: Grafana's Logs panel draws off-screen rows as cheap placeholders until the user scrolls.
- **Expected**: Grafana behaviour, not visible in normal use.

## After an upgrade

### Card still says the old name

- **Cause**: an old zip, or the pod was not restarted.
- **Fix**: check the `s3-sync-init` log for the new version, then restart the pod.

### Old links do not open the logs

- **Expected**: 0.1.0/0.2.0 links with `filter=` are converted and open the logs page. If not, the view or
  data source in the link may not exist for this user.

## Where to look

| Question | Place |
|---|---|
| Which SQL ran? | Logs tab → Open in Explore; or browser developer tools → Network → `/api/ds/query` (`rawSql`) |
| What did StarRocks say? | the error box shows the original message after the explanation |
| Which settings are in effect? | Administration → Plugins → Logs Drilldown (StarRocks) → Configuration |
| Which views can I read? | the configuration page's **Test: list my views**, or `SHOW TABLES` in Explore |
| Login problems | StarRocks FE log (`Set database … failed during negotiate`); Grafana server log |
