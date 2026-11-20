#!/usr/bin/env bash
# usage: APP_NODE_MODULES=<plugin>/node_modules tools/png.sh <diagram.html> <out.png> [width]
# Uses the app's own Playwright package (devDependency) inside the matching Playwright image.
set -euo pipefail
: "${APP_NODE_MODULES:?node_modules of plugins/kotak-starrocks-logs-app}"
TOOLS="$(cd "$(dirname "$0")" && pwd)"
export DOCKER_CONFIG=$(mktemp -d)
exec docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e NODE_PATH=/w/node_modules \
  -v "$PWD":/work -v "$TOOLS":/tools:ro -v "$APP_NODE_MODULES":/w/node_modules:ro -w /work \
  mcr.microsoft.com/playwright:v1.52.0-noble node /tools/png.js "$@"
