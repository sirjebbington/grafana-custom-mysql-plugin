#!/usr/bin/env bash
# Builds the backend binaries with plain `go build`. Equivalent to `mage build:linux build:linuxARM64`:
# same build tag, linker flags and build-info stamping as grafana-plugin-sdk-go/build (v0.277.0 common.go).
# Use it where mage is not available, e.g. offline build servers. When vendor/ exists, Go builds from it
# without network access.
#
#   ./scripts/build-backend.sh              # linux/amd64 and linux/arm64
#   ./scripts/build-backend.sh amd64        # selected architectures
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/plugin-meta.sh

ARCHES=("$@")
[ ${#ARCHES[@]} -gt 0 ] || ARCHES=(amd64 arm64)

# Never download a different Go toolchain implicitly; go.mod needs >= 1.24.3
export GOTOOLCHAIN=${GOTOOLCHAIN:-local}

BUILD_TIME_MS=$(( $(date +%s) * 1000 ))
BUILD_INFO="{\"time\":${BUILD_TIME_MS},\"pluginID\":\"${PLUGIN_ID}\",\"version\":\"${PLUGIN_VERSION}\"}"
LDFLAGS="-w -s -extldflags \"-static\""
LDFLAGS+=" -X 'github.com/grafana/grafana-plugin-sdk-go/build.buildInfoJSON=${BUILD_INFO}'"
LDFLAGS+=" -X 'main.pluginID=${PLUGIN_ID}' -X 'main.version=${PLUGIN_VERSION}'"

mkdir -p dist
for arch in "${ARCHES[@]}"; do
  out="dist/${PLUGIN_EXE}_linux_${arch}"
  echo "building ${out} (go $(go env GOVERSION), $( [ -d vendor ] && echo vendored || echo module mode ))"
  CGO_ENABLED=0 GOOS=linux GOARCH="$arch" go build -o "$out" -tags arrow_json_stdlib -ldflags "$LDFLAGS" ./pkg
done
