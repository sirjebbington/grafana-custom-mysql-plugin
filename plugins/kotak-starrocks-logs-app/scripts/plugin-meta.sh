# Sourced by the build scripts: reads plugin metadata without needing python or jq. Works for backend
# plugins (src/plugin.json has "backend": true and "executable") and frontend-only plugins (apps).
# Sets PLUGIN_ID, PLUGIN_TYPE, PLUGIN_VERSION (from package.json), PLUGIN_BACKEND (true|false) and
# PLUGIN_EXE (executable base name, empty for frontend-only plugins).
json_field() { sed -n "s/^[[:space:]]*\"$2\":[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$1" | head -n1; }
json_bool() { sed -n "s/^[[:space:]]*\"$2\":[[:space:]]*\(true\|false\).*/\1/p" "$1" | head -n1; }
PLUGIN_ID=$(json_field src/plugin.json id)
PLUGIN_TYPE=$(json_field src/plugin.json type)
PLUGIN_EXE=$(json_field src/plugin.json executable)
PLUGIN_VERSION=$(json_field package.json version)
PLUGIN_BACKEND=$(json_bool src/plugin.json backend)
PLUGIN_BACKEND=${PLUGIN_BACKEND:-false}
if [ -z "$PLUGIN_ID" ] || [ -z "$PLUGIN_TYPE" ] || [ -z "$PLUGIN_VERSION" ]; then
  echo "could not read id/type from src/plugin.json or version from package.json" >&2
  exit 1
fi
if [ "$PLUGIN_BACKEND" = true ] && [ -z "$PLUGIN_EXE" ]; then
  echo "src/plugin.json has backend: true but no executable" >&2
  exit 1
fi
