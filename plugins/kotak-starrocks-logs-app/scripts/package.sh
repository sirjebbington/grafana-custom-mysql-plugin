#!/usr/bin/env bash
# Packages dist/ as package/<id>-<version>.zip with a top-level <id>/ folder: the layout Grafana expects under
# its plugins directory and the layout the org's s3-sync-init container copies. Same output contract as
# kotak-starrocks-datasource's script; the Linux binaries are only required for backend plugins.
#
# Run after: npm run build  [&& ./scripts/build-backend.sh for backend plugins]  [&& npm run sign]
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/plugin-meta.sh
ID=$PLUGIN_ID VERSION=$PLUGIN_VERSION

required=(plugin.json module.js)
[ "$PLUGIN_BACKEND" = true ] && required+=("${PLUGIN_EXE}_linux_amd64")
for f in "${required[@]}"; do
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
# source maps are not needed at runtime
find "package/stage/$ID" -name '*.map' -delete
if [ "$PLUGIN_BACKEND" = true ]; then
  chmod 0755 "package/stage/$ID/${PLUGIN_EXE}"_linux_*
fi
if command -v zip >/dev/null; then
  (cd package/stage && zip -qr "../$ID-$VERSION.zip" "$ID")
elif command -v python3 >/dev/null; then
  (cd package/stage && python3 -m zipfile -c "../$ID-$VERSION.zip" "$ID")
else
  echo "need zip or python3 to create the archive" >&2
  exit 1
fi
rm -rf package/stage
(cd package && sha256sum "$ID-$VERSION.zip" > "$ID-$VERSION.zip.sha256")
echo "built package/$ID-$VERSION.zip"
