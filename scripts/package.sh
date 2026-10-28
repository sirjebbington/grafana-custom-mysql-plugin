#!/usr/bin/env bash
# Packages dist/ as package/<id>-<version>.zip with a top-level <id>/ folder, the layout Grafana expects under
# its plugins directory and the layout the org's S3 init container copies (see docs/AGENT_GUIDE.md §7).
#
# Run after:  npm run build && mage -v build:linux build:linuxARM64  [&& npm run sign]
# Signing writes dist/MANIFEST.txt; do not change dist/ after signing or the signature breaks.
set -euo pipefail
cd "$(dirname "$0")/.."

ID=$(python3 -c 'import json; print(json.load(open("src/plugin.json"))["id"])')
VERSION=$(python3 -c 'import json; print(json.load(open("package.json"))["version"])')
EXE=$(python3 -c 'import json; print(json.load(open("src/plugin.json"))["executable"])')

for f in plugin.json module.js "${EXE}_linux_amd64"; do
  [ -e "dist/$f" ] || { echo "missing dist/$f: build first" >&2; exit 1; }
done
if [ -f dist/MANIFEST.txt ]; then
  echo "dist/MANIFEST.txt present: package is signed"
else
  echo "WARNING: dist/MANIFEST.txt missing: package is unsigned and needs allow_loading_unsigned_plugins=$ID" >&2
fi

rm -rf package
mkdir -p "package/stage/$ID"
cp -R dist/. "package/stage/$ID/"
chmod 0755 "package/stage/$ID/${EXE}"_linux_*
(cd package/stage && zip -qr "../$ID-$VERSION.zip" "$ID")
rm -rf package/stage
(cd package && sha256sum "$ID-$VERSION.zip" > "$ID-$VERSION.zip.sha256")
echo "built package/$ID-$VERSION.zip"
unzip -l "package/$ID-$VERSION.zip" | sed -n '1,30p'
