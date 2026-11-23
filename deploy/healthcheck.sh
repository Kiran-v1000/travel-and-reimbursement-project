#!/usr/bin/env bash
# Minimal uptime check for cron (every 5 minutes). Exits non-zero and prints a reason when the
# API or its database is unhealthy, so cron mails the output to MAILTO.
#
#   */5 * * * * /opt/voyage/deploy/healthcheck.sh https://travel.utthunga.com
set -euo pipefail

base="${1:-http://127.0.0.1:4010}"
body="$(curl --silent --show-error --max-time 10 "$base/api/health" || true)"

if [[ "$body" != *'"status":"ok"'* ]]; then
  echo "[$(date -Is)] Voyage health check FAILED for $base: ${body:-no response}"
  exit 1
fi
