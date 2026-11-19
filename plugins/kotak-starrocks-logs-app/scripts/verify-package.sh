#!/usr/bin/env bash
# Checks a packaged plugin zip before it is published: layout, plugin ID, type and version, checksum, and for
# backend plugins both Linux binaries. Exits non-zero on any problem. Use it as a pipeline gate.
#
#   ./scripts/verify-package.sh [package/<id>-<version>.zip]
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/plugin-meta.sh

ZIP=${1:-package/${PLUGIN_ID}-${PLUGIN_VERSION}.zip}
[ -f "$ZIP" ] || { echo "FAIL: $ZIP not found" >&2; exit 1; }
fail=0
check() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fail=1; fi; }

if [ -f "$ZIP.sha256" ]; then
  check "checksum matches $ZIP.sha256" "(cd \"$(dirname "$ZIP")\" && sha256sum -c --status \"$(basename "$ZIP").sha256\")"
fi
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
if command -v unzip >/dev/null; then unzip -q "$ZIP" -d "$TMP"; else python3 -m zipfile -e "$ZIP" "$TMP"; fi
P="$TMP/$PLUGIN_ID"

check "single top-level folder named $PLUGIN_ID" "[ \"\$(ls -A \"$TMP\")\" = \"$PLUGIN_ID\" ]"
for f in plugin.json module.js LICENSE "img/logo.svg"; do
  check "contains $PLUGIN_ID/$f" "[ -f \"$P/$f\" ]"
done
check "plugin.json id is $PLUGIN_ID" "grep -q '\"id\": *\"$PLUGIN_ID\"' \"$P/plugin.json\""
check "plugin.json type is $PLUGIN_TYPE" "grep -q '\"type\": *\"$PLUGIN_TYPE\"' \"$P/plugin.json\""
check "plugin.json version is $PLUGIN_VERSION (no %VERSION% placeholder)" "grep -q '\"version\": *\"$PLUGIN_VERSION\"' \"$P/plugin.json\""
check "no unreplaced %PLACEHOLDERS% in plugin.json" "! grep -q '%[A-Z_]*%' \"$P/plugin.json\""
check "no source maps" "[ -z \"\$(find \"$P\" -name '*.map')\" ]"
if [ "$PLUGIN_TYPE" = app ]; then
  check "app is autoEnabled (on in every org without provisioning)" "grep -q '\"autoEnabled\": *true' \"$P/plugin.json\""
fi
if [ "$PLUGIN_BACKEND" = true ]; then
  for arch in amd64 arm64; do
    bin="$P/${PLUGIN_EXE}_linux_${arch}"
    check "contains ${PLUGIN_EXE}_linux_${arch}" "[ -f \"$bin\" ]"
  done
else
  check "frontend-only: no backend binaries" "[ -z \"\$(find \"$P\" -name 'gpx_*')\" ]"
fi
if [ -f "$P/MANIFEST.txt" ]; then echo "info signed (MANIFEST.txt present)"; else echo "info unsigned (needs allow_loading_unsigned_plugins)"; fi

[ $fail -eq 0 ] && echo "PASS $ZIP" || { echo "FAILED $ZIP" >&2; exit 1; }
