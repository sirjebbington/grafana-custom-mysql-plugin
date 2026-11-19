## Project knowledge

This repository holds two Grafana plugins in sub-folders. Work inside the folder you are changing and read
its own `CLAUDE.md` first:

- `plugins/kotak-starrocks-datasource/`: backend data source that queries StarRocks as the signed-in IDAM user.
  Production code; change it only when the task is about the data source.
- `plugins/kotak-starrocks-logs-app/`: frontend-only Logs Drilldown app that queries through the data source.
  Never requires data source changes.

Repository rules:
- Keep both plugins in sub-folders (a plugin at the root breaks the other's webpack build).
- `pipelines/` holds the shared parametrized build template (`pluginDir`, `hasBackend`) and one pipeline per plugin.
- `scripts/build-plugin.sh <plugin folder>` runs the same steps locally.
- Never commit tokens, `dev/jwt/` keys, reference photos, or real user IDs (write `kmbl…`).
