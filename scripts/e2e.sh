#!/usr/bin/env bash
# End-to-end test of the plugin inside Grafana 12.0.1-security-01, with a real OAuth login against a mock
# IDAM (OIDC) and StarRocks 4.0.10 verifying the forwarded JWT. No browser needed: the login is done with curl.
#
#   npm run build && mage -v build:linux     # the plugin must be built into dist/ first
#   ./scripts/e2e.sh up        # start StarRocks, mock IDAM and Grafana; create the StarRocks JWT integrations
#   ./scripts/e2e.sh test      # OAuth login, Save & test, a query, and the no-token case
#   ./scripts/e2e.sh refresh   # wait for the ID token to expire (120s) and check Grafana refreshes it
#   ./scripts/e2e.sh down      # stop and remove everything
#
# Grafana: http://localhost:13000 (admin/admin, or "Sign in with IDAM").  StarRocks: 127.0.0.1:19030 (root, no password).
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f dev/e2e/docker-compose.yaml)
GRAFANA=http://localhost:13000
DS_UID=e2e-ds-kotak-starrocks-public
JAR=dev/e2e/.cookies
EXPECTED_USER=kmbl3e2e

sr() { "${COMPOSE[@]}" exec -T starrocks mysql -h127.0.0.1 -P9030 -uroot -N -e "$1"; }

json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

up() {
  [ -f dev/jwt/jwks.json ] || go run ./tools/devjwt keygen -dir dev/jwt
  if [ ! -f dist/plugin.json ] || ! ls dist/gpx_kotak_starrocks_linux_* >/dev/null 2>&1; then
    echo "dist/ is incomplete: run 'npm run build' and 'mage -v build:linux' first" >&2
    exit 1
  fi
  "${COMPOSE[@]}" up -d

  echo "waiting for StarRocks FE..."
  until sr "SELECT 1" >/dev/null 2>&1; do sleep 5; done

  local existing
  existing=$(sr "SHOW SECURITY INTEGRATIONS" | awk '{print $1}')
  # tokens from tools/devjwt (Go integration test)
  if ! grep -qx local_jwt <<<"$existing"; then
    sr 'CREATE SECURITY INTEGRATION local_jwt PROPERTIES ("type" = "authentication_jwt", "jwks_url" = "jwks.json", "principal_field" = "sub", "required_issuer" = "https://local-idam/", "required_audience" = "grafana-local")'
  fi
  # tokens from the mock IDAM, forwarded by Grafana
  if ! grep -qx e2e_jwt <<<"$existing"; then
    sr 'CREATE SECURITY INTEGRATION e2e_jwt PROPERTIES ("type" = "authentication_jwt", "jwks_url" = "http://idam:8080/idam/jwks", "principal_field" = "sub", "required_issuer" = "http://idam:8080/idam", "required_audience" = "grafana-e2e")'
  fi
  # runtime setting; not persisted across FE restarts, so it is applied on every "up"
  sr 'ADMIN SET FRONTEND CONFIG ("authentication_chain" = "native,e2e_jwt,local_jwt")'
  sr 'SHOW SECURITY INTEGRATIONS'

  echo "waiting for Grafana..."
  until curl -sf "$GRAFANA/api/health" >/dev/null; do sleep 2; done
  curl -sf -u admin:admin "$GRAFANA/api/plugins/kotak-starrocks-datasource/settings" | json 'd["id"], d["info"]["version"], "signature:", d["signature"]'
  echo "ready"
}

login() {
  rm -f "$JAR"
  # 1. Grafana redirects to the IDAM authorize URL and sets its oauth_state cookie
  local authorize callback
  authorize=$(curl -sS -c "$JAR" -b "$JAR" -o /dev/null -w '%{redirect_url}' "$GRAFANA/login/generic_oauth")
  # 2. the mock IDAM signs in without a form and redirects back with an authorization code
  callback=$(curl -sS -c "$JAR" -b "$JAR" -o /dev/null -w '%{redirect_url}' "$authorize")
  # 3. Grafana exchanges the code for access, ID and refresh tokens and starts a session
  curl -sS -c "$JAR" -b "$JAR" -o /dev/null "$callback"
  local who
  who=$(curl -sSf -b "$JAR" "$GRAFANA/api/user" | json 'd["login"]')
  echo "signed in to Grafana as: $who"
  [ "$who" = "$EXPECTED_USER" ]
}

health() {
  curl -sS -b "$JAR" "$GRAFANA/api/datasources/uid/$DS_UID/health"
}

query() {
  curl -sS -b "$JAR" -H 'Content-Type: application/json' -X POST "$GRAFANA/api/ds/query" \
    -d '{"from":"now-1h","to":"now","queries":[{"refId":"A","datasource":{"uid":"'"$DS_UID"'"},"rawSql":"SELECT CURRENT_USER() AS who","format":"table"}]}'
}

check_query() {
  local out
  out=$(query)
  echo "$out" | json 'd["results"]["A"].get("error") or d["results"]["A"]["frames"][0]["data"]["values"]'
  grep -q "$EXPECTED_USER" <<<"$out"
}

test_e2e() {
  login

  echo "--- Save & test as the IDAM user"
  local h
  h=$(health)
  echo "$h"
  grep -q '"status":"OK"' <<<"$h"

  echo "--- query as the IDAM user"
  check_query

  echo "--- Save & test as basic-auth admin (no IDAM token: must fail clearly)"
  h=$(curl -sS -u admin:admin "$GRAFANA/api/datasources/uid/$DS_UID/health")
  echo "$h"
  grep -q 'no IDAM token' <<<"$h"

  echo "--- sessions seen by StarRocks"
  sr "SHOW PROCESSLIST" | awk '{print $2, $3, $5}' | sort | uniq -c
  echo "PASS"
}

refresh() {
  [ -f "$JAR" ] || login
  echo "first query"
  check_query
  echo "waiting 130s for the 120s ID token to expire..."
  sleep 130
  echo "query after expiry (Grafana must refresh the token and forward the new ID token)"
  check_query
  "${COMPOSE[@]}" logs grafana 2>&1 | grep -E 'Retiring StarRocks connection pool|Opened StarRocks connection pool' | tail -4 || true
  echo "PASS"
}

case "${1:-}" in
  up) up ;;
  test) test_e2e ;;
  refresh) refresh ;;
  down) "${COMPOSE[@]}" down -v; rm -f "$JAR" ;;
  logs) "${COMPOSE[@]}" logs -f grafana ;;
  *) echo "usage: $0 up|test|refresh|down|logs" >&2; exit 2 ;;
esac
