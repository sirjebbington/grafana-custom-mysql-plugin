#!/usr/bin/env bash
# Prepares a source bundle that builds on a Linux server WITHOUT internet access (scripts/build-offline.sh).
# Run on a Linux x86_64 machine that can reach the Go module proxy and the npm registry (or their mirrors).
#
#   ./scripts/make-offline-bundle.sh                    # source + vendor/ + prebuilt frontend in dist/
#   ./scripts/make-offline-bundle.sh --with-npm-cache   # also an npm cache, so the server can rebuild the frontend
#
# Output: offline-bundle/<id>-<version>-offline-src.tar.gz and .sha256. Nothing is added to the working tree
# (vendoring goes straight into the bundle). On the server:
#   tar xzf <id>-<version>-offline-src.tar.gz && cd <id>-<version> && ./scripts/build-offline.sh
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/plugin-meta.sh

WITH_NPM_CACHE=false
[ "${1:-}" = "--with-npm-cache" ] && WITH_NPM_CACHE=true

NAME="$PLUGIN_ID-$PLUGIN_VERSION"
OUT=offline-bundle
# stage outside the repo: webpack would otherwise pick up the staged copy of src/module.ts
STAGE_ROOT=$(mktemp -d)
trap 'rm -rf "$STAGE_ROOT"' EXIT
STAGE="$STAGE_ROOT/$NAME"
rm -rf "$OUT"
mkdir -p "$STAGE" "$OUT"

# 1. source files: tracked files in a git checkout, otherwise everything except local and generated dirs
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git ls-files -z | tar --null -T - -cf - | tar -xf - -C "$STAGE"
else
  tar --exclude=./node_modules --exclude=./dist --exclude=./package --exclude=./offline-bundle \
      --exclude=./dev/jwt --exclude=./vendor --exclude=./.git -cf - . | tar -xf - -C "$STAGE"
fi

# 2. Go dependencies, including the patched driver from third_party/ (go.mod replace)
go mod vendor -o "$STAGE/vendor"

# 3. frontend dependencies and build
if $WITH_NPM_CACHE; then
  npm ci --cache "$STAGE/npm-cache" --no-audit --no-fund
else
  npm ci --no-audit --no-fund
fi
npm run build
# prebuilt frontend only; backend binaries are built on the server
mkdir -p "$STAGE/dist"
tar -C dist --exclude='gpx_*' --exclude=go_plugin_build_manifest --exclude=MANIFEST.txt -cf - . | tar -xf - -C "$STAGE/dist"

# 4. archive
tar -C "$STAGE_ROOT" -czf "$OUT/$NAME-offline-src.tar.gz" "$NAME"
(cd "$OUT" && sha256sum "$NAME-offline-src.tar.gz" > "$NAME-offline-src.tar.gz.sha256")
ls -lh "$OUT"
