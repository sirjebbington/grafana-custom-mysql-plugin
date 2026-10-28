#!/usr/bin/env bash
# Builds and verifies the plugin zip with NO network access, from a bundle made by make-offline-bundle.sh
# (or any checkout that has vendor/ and either a prebuilt frontend in dist/ or an npm-cache/ directory).
#
# Needs: Go >= 1.24.3, bash, coreutils, zip (or python3), file (optional, for the static-binary check).
#        Node.js 22 + npm only when the frontend is rebuilt from npm-cache/.
#
#   ./scripts/build-offline.sh                  # tests, build, package, verify
#   SKIP_TESTS=1 ./scripts/build-offline.sh
#   REBUILD_FRONTEND=1 ./scripts/build-offline.sh   # rebuild dist/ from npm-cache/ even if it is prebuilt
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/plugin-meta.sh

export GOFLAGS=-mod=vendor GOPROXY=off GOTOOLCHAIN=local
[ -f vendor/modules.txt ] || { echo "vendor/ is missing: create the bundle with scripts/make-offline-bundle.sh" >&2; exit 1; }

if [ -f dist/module.js ] && [ -z "${REBUILD_FRONTEND:-}" ]; then
  echo "frontend: using prebuilt dist/"
elif [ -d npm-cache ]; then
  command -v npm >/dev/null || { echo "npm (Node.js 22) is required to rebuild the frontend" >&2; exit 1; }
  echo "frontend: installing from npm-cache/ (offline) and building"
  npm ci --offline --cache "$PWD/npm-cache" --no-audit --no-fund
  [ -n "${SKIP_TESTS:-}" ] || npm run test:ci
  npm run build
else
  echo "no prebuilt frontend (dist/module.js) and no npm-cache/: re-create the bundle" >&2
  exit 1
fi

if [ -z "${SKIP_TESTS:-}" ]; then
  go vet ./...
  go test ./pkg/...
fi
./scripts/build-backend.sh
./scripts/package.sh
./scripts/verify-package.sh
