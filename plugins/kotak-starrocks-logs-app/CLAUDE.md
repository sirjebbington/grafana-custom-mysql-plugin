## Project knowledge

`kotak-starrocks-logs-app` is a **frontend-only Grafana app plugin** (Scenes): a Logs Drilldown for the
StarRocks log views `vw_eks_app_logs_<app_id>`. It never changes `kotak-starrocks-datasource`; it sends SQL
to `/api/ds/query` addressed to that datasource, which forwards the user's IDAM token (per-user Ranger).

Read first: `README.md` (features, config), `docs/DESIGN.md` (constraints, SQL per feature, guardrails),
`docs/ROLLOUT.md` (deploy-config changes), `docs/MONOREPO.md` (same repo/pipelines as the datasource),
`docs/ORG_AGENT_PROMPT.md` (step-by-step org rollout).

Rules:
- All SQL goes through `src/sql/builder.ts`: identifiers via `quoteIdent`, values via `lit` (it splits `$`
  out of literals because the datasource expands macros everywhere). Substring search uses `containsCond`
  (LIKE, or `instr()` when the text has `%`, `_` or `\`: StarRocks 4.0 LIKE-escape bug).
- Never use information_schema / DESCRIBE / SHOW COLUMNS (Ranger denies them).
- Grafana 12.0.1: keep `@grafana/*` at 12.0.1 and `@grafana/scenes` at 6.20.2 (6.21+ needs `@grafana/i18n`).
- Do not edit `.config/` (scaffolded). Never print tokens.

Commands:
- `npm ci && npm run typecheck && npm run lint && npm run test:ci && npm run build`
- `./scripts/package.sh && ./scripts/verify-package.sh`
- `./scripts/e2e.sh up | smoke | test | down` (needs the datasource's built dist/, see README)
