## Project knowledge

This repository is a **Grafana backend datasource plugin**, `kotak-starrocks-datasource`. It queries StarRocks
as the signed-in Grafana user by forwarding that user's IDAM JWT.

Before doing anything, read:
1. `docs/AGENT_GUIDE.md`: what is implemented and verified, the rules (§0), build/test, and deployment
   through `obser-aws-deploy-config`.
2. `docs/QUESTIONS.md`: open dependencies on the IDAM and StarRocks teams. Do not guess those values.
3. `.config/AGENTS/instructions.md`: generic Grafana plugin rules. Do not edit `.config/`.

Quick commands:
- `npm ci && npm run typecheck && npm run lint && npm run test:ci`
- `go vet ./... && go test -race ./pkg/...`
- `npm run build && mage -v build:linux build:linuxARM64 && ./scripts/package.sh`
- `./scripts/e2e.sh up|test|refresh|down` runs Grafana 12.0.1 + a mock IDAM + StarRocks 4.0.10 locally.

Never log or print tokens. Never turn off TLS outside `dev/e2e`. Keep the `go.mod` replace for
`third_party/go-sql-driver-mysql`.
