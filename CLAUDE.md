## Project knowledge

This repository is a **Grafana backend datasource plugin**, `kotak-starrocks-datasource`. It queries StarRocks
as the signed-in Grafana user by forwarding that user's IDAM JWT.

Before doing anything, read:
1. `docs/AGENT_GUIDE.md`: what is implemented and verified, the rules (§0), build/test, and deployment
   through `obser-aws-deploy-config`.
2. `docs/QUESTIONS.md`: open dependencies on the IDAM and StarRocks teams. Do not guess those values.
   - `docs/BUILD_PIPELINE_GUIDE.md`: read this instead of §4 and §9 of the agent guide when the task is
     build pipelines or offline builds.
3. `.config/AGENTS/instructions.md`: generic Grafana plugin rules. Do not edit `.config/`.
4. `docs/IMPLEMENTATION_EXPLAINED.md`: how the whole system works, bottom to top, the UAT status and an
   error-to-owner troubleshooting table. Update its §0 and §13 when the status changes.
5. `docs/research/` (optional): design history and evidence. `06-starrocks-jwt-auth-source-analysis.md`
   explains why the driver is patched.

Quick commands:
- `npm ci && npm run typecheck && npm run lint && npm run test:ci`
- `go vet ./... && go test -race ./pkg/...`
- `npm run build && ./scripts/build-backend.sh && ./scripts/package.sh && ./scripts/verify-package.sh`
  (`mage -v build:linux build:linuxARM64` is equivalent to `build-backend.sh`)
- Offline: `./scripts/make-offline-bundle.sh` on a connected machine, then `./scripts/build-offline.sh` on the server
- `./scripts/e2e.sh up|test|refresh|down` runs Grafana 12.0.1 + a mock IDAM + StarRocks 4.0.10 locally.

Never log or print tokens. Never turn off TLS outside `dev/e2e`. Keep the `go.mod` replace for
`third_party/go-sql-driver-mysql`.
