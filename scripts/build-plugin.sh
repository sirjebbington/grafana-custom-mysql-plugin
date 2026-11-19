#!/usr/bin/env bash
# Local equivalent of pipelines/templates/build-plugin-steps.yml: builds, tests, packages and verifies ONE
# plugin folder. The Go steps run only when src/plugin.json says "backend": true.
#
#   scripts/build-plugin.sh plugins/kotak-starrocks-datasource
#   scripts/build-plugin.sh plugins/kotak-starrocks-logs-app
set -euo pipefail
dir=${1:?usage: scripts/build-plugin.sh plugins/<plugin-id>}
cd "$(dirname "$0")/../$dir"
backend=$(sed -n 's/^[[:space:]]*"backend":[[:space:]]*\(true\|false\).*/\1/p' src/plugin.json | head -n1)
echo "== $dir (backend: ${backend:-false})"
[ -d node_modules ] || npm ci --no-audit --no-fund
npm run typecheck
npm run lint
npm run test:ci
npm run build
if [ "${backend:-false}" = true ]; then
  go vet ./...
  go test ./pkg/...
  ./scripts/build-backend.sh
fi
./scripts/package.sh
./scripts/verify-package.sh
