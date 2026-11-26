#!/usr/bin/env bash
# End-to-end test of kotak-starrocks-logs-app in Grafana 12.0.1-security-01 with the unchanged
# kotak-starrocks-datasource, a mock IDAM (OIDC) and StarRocks 4.0.10.
#
#   npm run build                 # the app must be built into dist/ first
#   ./scripts/e2e.sh up           # start everything, seed data, wait for Grafana
#   ./scripts/e2e.sh seed         # re-seed (timestamps are relative to now)
#   ./scripts/e2e.sh tenants      # regenerate the app's provisioning file from dev/e2e/tenants/
#   ./scripts/e2e.sh smoke        # API-level checks with curl (login, views per user, every query kind)
#   ./scripts/e2e.sh test         # browser tests (Playwright)
#   ./scripts/e2e.sh iceberg      # add real Iceberg tables (timestamptz and IST timestamp) + their views
#   ./scripts/e2e.sh iceberg-smoke  # API checks on those Iceberg views
#   ./scripts/e2e.sh down
#
# STARROCKS_IMAGE picks the StarRocks image (default 4.1.6, the UAT version). seed.py's FE_TIME_ZONE and
# VIEW_TIME choose the session zone and how the views show the time column (default: like UAT).
#
# DATASOURCE_DIST points at the datasource plugin's built dist/ (default: ../kotak-starrocks-datasource/dist).
# Grafana: http://localhost:23000 ("Sign in with IDAM", then any user name, e.g. kmbl3e2e). StarRocks: 127.0.0.1:29030.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f dev/e2e/docker-compose.yaml)
ICEBERG=(docker compose -f dev/e2e/docker-compose.yaml -f dev/e2e/iceberg/docker-compose.iceberg.yaml)
GRAFANA=http://localhost:23000
STATE=dev/e2e/.state
mkdir -p "$STATE"

sr() { "${COMPOSE[@]}" exec -T starrocks mysql -h127.0.0.1 -P9030 -uroot "$@"; }

seed() {
  echo "seeding StarRocks..."
  python3 dev/e2e/seed.py "${SEED_HOURS:-4}" | sr
  for db in obs2_logs1_uat obs2_logs2_uat; do
    sr -N -e "SELECT '$db', app_id, COUNT(*) FROM $db.eks_app_logs GROUP BY app_id ORDER BY app_id"
  done
  sr -N -e "SELECT 'obs2_genai1_uat', app_id, COUNT(*) FROM obs2_genai1_uat.agent_logs GROUP BY app_id ORDER BY app_id"
}

# The app's provisioning file is generated like in deploy-config: from Loki-style data source entries plus
# overrides (see dev/e2e/tenants/ and scripts/gen-tenants-from-loki.py).
tenants() {
  python3 scripts/gen-tenants-from-loki.py dev/e2e/tenants/loki-datasources.yml \
    --datasource-uid e2e-ds-starrocks-logs \
    --overrides dev/e2e/tenants/tenants-overrides.yml \
    --settings dev/e2e/tenants/app-settings.yml --pin-datasources > dev/e2e/provisioning/plugins/kotak-starrocks-logs-app.yaml
  echo "generated dev/e2e/provisioning/plugins/kotak-starrocks-logs-app.yaml"
}

up() {
  [ -f dist/plugin.json ] || { echo "dist/ is missing: run 'npm run build' first" >&2; exit 1; }
  tenants
  local ds="${DATASOURCE_DIST:-../kotak-starrocks-datasource/dist}"
  ls "$ds"/gpx_kotak_starrocks_linux_* >/dev/null 2>&1 || { echo "datasource dist not found at $ds" >&2; exit 1; }
  "${COMPOSE[@]}" up -d
  echo "waiting for StarRocks FE..."
  until sr -N -e "SELECT 1" >/dev/null 2>&1; do sleep 5; done
  until sr -N -e "SHOW BACKENDS" 2>/dev/null | grep -q true; do sleep 3; done
  seed
  echo "waiting for Grafana..."
  until curl -sf "$GRAFANA/api/health" >/dev/null; do sleep 2; done
  echo "ready: $GRAFANA"
}

# Real Iceberg tables through a REST catalog on S3 (SeaweedFS), read by StarRocks through an external catalog.
iceberg() {
  "${ICEBERG[@]}" up -d s3 iceberg-rest
  "${ICEBERG[@]}" run --rm iceberg-writer
  python3 dev/e2e/iceberg/starrocks_sql.py | sr
  sr -N -e "SELECT COUNT(*) FROM iceberg_e2e.logs.eks_app_logs; SELECT COUNT(*) FROM iceberg_e2e.logs.eks_app_logs_ntz"
}

# Signs in through the mock IDAM login form as $1 and stores the Grafana session cookie in $STATE/$1.cookies
login() {
  local user="$1" jar="$STATE/$1.cookies" authorize form_action callback
  rm -f "$jar"
  authorize=$(curl -sS -c "$jar" -b "$jar" -o /dev/null -w '%{redirect_url}' "$GRAFANA/login/generic_oauth")
  callback=$(curl -sS -c "$jar" -b "$jar" -o /dev/null -w '%{redirect_url}' \
    --data-urlencode "username=$user" --data-urlencode "claims={\"aud\":[\"grafana-e2e\"],\"email\":\"$user@kotak.com\"}" "$authorize")
  curl -sS -c "$jar" -b "$jar" -o /dev/null "$callback"
  curl -sSf -b "$jar" "$GRAFANA/api/user" | python3 -c 'import json,sys; print("signed in as", json.load(sys.stdin)["login"])'
}

case "${1:-}" in
  up) up ;;
  seed) seed ;;
  tenants) tenants ;;
  login) login "${2:?user}" ;;
  smoke) npx jest -c jest.smoke.config.js --runInBand ;;
  iceberg) iceberg ;;
  iceberg-smoke) ICEBERG=1 npx jest -c jest.smoke.config.js --runInBand tests/smoke/iceberg.test.ts ;;
  # Chromium needs system libraries the WSL host lacks, so the tests run in the matching Playwright image
  # (host network: the browser reaches Grafana on localhost:23000 and the mock IDAM on localhost:28080).
  test)
    if [ "${PLAYWRIGHT_LOCAL:-0}" = 1 ]; then
      npx playwright test "${@:2}"
    else
      docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD":/work -w /work \
        mcr.microsoft.com/playwright:v1.52.0-noble npx playwright test "${@:2}"
    fi ;;
  down) "${ICEBERG[@]}" down -v; rm -rf "$STATE" ;;
  logs) "${COMPOSE[@]}" logs -f "${2:-grafana}" ;;
  *) echo "usage: $0 up|seed|tenants|login <user>|smoke|test|iceberg|iceberg-smoke|down|logs" >&2; exit 2 ;;
esac
