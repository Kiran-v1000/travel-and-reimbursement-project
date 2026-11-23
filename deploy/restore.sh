#!/usr/bin/env bash
# Restore a backup made by backup.sh into a database.
#
#   ./restore.sh /var/backups/voyage/voyage-db-20261124-020000.dump [target_database_url]
#
# Practise this regularly against a scratch database - an untested backup is a guess.
# Restoring over the live database: stop the API first (pm2 stop voyage-api).
set -euo pipefail

dump="${1:?usage: restore.sh <dump file> [database url]}"
target="${2:-}"
if [[ -z "$target" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${APP_DIR:-/opt/voyage}/server/.env"
  set +a
  target="$DATABASE_URL"
fi
target="${target%%\?*}"

read -r -p "Restore $(basename "$dump") into ${target##*@}? This replaces existing data. Type 'restore' to continue: " answer
[[ "$answer" == "restore" ]] || { echo "Cancelled."; exit 1; }

pg_restore --clean --if-exists --no-owner --dbname="$target" "$dump"
echo "Database restored. Unpack the matching voyage-receipts-*.tar.gz into the parent of UPLOAD_DIR, then start the API."
