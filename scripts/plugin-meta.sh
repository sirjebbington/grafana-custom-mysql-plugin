# Sourced by the build scripts: reads plugin metadata without needing python or jq.
# Sets PLUGIN_ID, PLUGIN_EXE (executable base name) and PLUGIN_VERSION (from package.json).
json_field() { sed -n "s/^[[:space:]]*\"$2\":[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$1" | head -n1; }
PLUGIN_ID=$(json_field src/plugin.json id)
PLUGIN_EXE=$(json_field src/plugin.json executable)
PLUGIN_VERSION=$(json_field package.json version)
if [ -z "$PLUGIN_ID" ] || [ -z "$PLUGIN_EXE" ] || [ -z "$PLUGIN_VERSION" ]; then
  echo "could not read id/executable from src/plugin.json or version from package.json" >&2
  exit 1
fi
