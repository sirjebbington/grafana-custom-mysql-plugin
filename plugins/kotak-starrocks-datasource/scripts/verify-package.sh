#!/usr/bin/env bash
# Checks a packaged plugin zip before it is published: layout, plugin ID and version, both Linux binaries
# (statically linked, executable), checksum. Exits non-zero on any problem. Use it as a pipeline gate.
#
#   ./scripts/verify-package.sh [package/<id>-<version>.zip]
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/plugin-meta.sh

ZIP=${1:-package/${PLUGIN_ID}-${PLUGIN_VERSION}.zip}
[ -f "$ZIP" ] || { echo "FAIL: $ZIP not found" >&2; exit 1; }
fail=0
check() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fail=1; fi; }

# Reads the Unix mode stored in the zip entry. Extracted files can't be used for this: Python's zipfile
# does not restore permissions on extraction.
zip_entry_executable() {
  if command -v unzip >/dev/null; then
    unzip -Z "$ZIP" "$1" 2>/dev/null | grep -q '^-..x'
  else
    python3 - "$ZIP" "$1" <<'PY'
import sys, zipfile
info = zipfile.ZipFile(sys.argv[1]).getinfo(sys.argv[2])
sys.exit(0 if (info.external_attr >> 16) & 0o100 else 1)
PY
  fi
}

if [ -f "$ZIP.sha256" ]; then
  check "checksum matches $ZIP.sha256" "(cd \"$(dirname "$ZIP")\" && sha256sum -c --status \"$(basename "$ZIP").sha256\")"
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
if command -v unzip >/dev/null; then
  unzip -q "$ZIP" -d "$TMP"
else
  python3 -m zipfile -e "$ZIP" "$TMP"
fi
P="$TMP/$PLUGIN_ID"

check "single top-level folder named $PLUGIN_ID" "[ \"\$(ls -A \"$TMP\")\" = \"$PLUGIN_ID\" ]"
for f in plugin.json module.js LICENSE "img/logo.svg"; do
  check "contains $PLUGIN_ID/$f" "[ -f \"$P/$f\" ]"
done
check "plugin.json id is $PLUGIN_ID" "grep -q '\"id\": *\"$PLUGIN_ID\"' \"$P/plugin.json\""
check "plugin.json version is $PLUGIN_VERSION (no %VERSION% placeholder)" "grep -q '\"version\": *\"$PLUGIN_VERSION\"' \"$P/plugin.json\""
check "plugin.json alerting is false" "grep -q '\"alerting\": *false' \"$P/plugin.json\""
for arch in amd64 arm64; do
  bin="$P/${PLUGIN_EXE}_linux_${arch}"
  check "contains ${PLUGIN_EXE}_linux_${arch}" "[ -f \"$bin\" ]"
  check "${PLUGIN_EXE}_linux_${arch} is executable in the zip" "zip_entry_executable \"$PLUGIN_ID/${PLUGIN_EXE}_linux_${arch}\""
  if ! command -v file >/dev/null; then
    echo "skip ${PLUGIN_EXE}_linux_${arch} static ELF check ('file' not installed)"
  elif [ -f "$bin" ]; then
    check "${PLUGIN_EXE}_linux_${arch} is a static ELF for $arch" \
      "file \"$bin\" | grep -q 'statically linked' && file \"$bin\" | grep -qE '$( [ "$arch" = amd64 ] && echo x86-64 || echo aarch64 )'"
  fi
done
if [ -f "$P/MANIFEST.txt" ]; then echo "info signed (MANIFEST.txt present)"; else echo "info unsigned (needs allow_loading_unsigned_plugins)"; fi

[ $fail -eq 0 ] && echo "PASS $ZIP" || { echo "FAILED $ZIP" >&2; exit 1; }
