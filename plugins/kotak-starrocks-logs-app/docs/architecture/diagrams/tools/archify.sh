#!/usr/bin/env bash
# Runs Archify (https://github.com/tt-a1i/archify) in the Playwright image, which has Node and Chromium for
# Archify's browser check. Run from a work folder that holds <NN-name>/candidate.json.
#   ARCHIFY_HOME=~/project1/archify REPO_ROOT=~/kotak-starrocks-datasource \
#     tools/archify.sh finalize sequence 05-context/candidate.json 05-context/context.html --repo-root /repo --quality showcase --json
set -euo pipefail
: "${ARCHIFY_HOME:?checkout of the archify repository}" "${REPO_ROOT:?checkout of this repository}"
export DOCKER_CONFIG=$(mktemp -d)   # avoids the desktop credential helper in WSL
mkdir -p "$PWD/.ctmp/home"
exec docker run --rm --user "$(id -u):$(id -g)" -e HOME=/ctmp/home -e TMPDIR=/ctmp \
  -e ARCHIFY_CHROME=/ms-playwright/chromium-1169/chrome-linux/chrome -e ARCHIFY_CHROME_NO_SANDBOX=1 \
  -e ARCHIFY_UPDATE_CHECK_DISABLED=1 \
  -v "$ARCHIFY_HOME":/archify:ro -v "$PWD":/work -v "$PWD/.ctmp":/ctmp -v "$REPO_ROOT":/repo:ro \
  -w /work mcr.microsoft.com/playwright:v1.52.0-noble node /archify/archify/bin/archify.mjs "$@"
