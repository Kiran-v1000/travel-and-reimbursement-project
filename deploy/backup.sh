#!/usr/bin/env bash
# Nightly backup: PostgreSQL dump + receipts archive, with retention and a restore-ability check.
#
#   sudo -u voyage /opt/voyage/deploy/backup.sh
#
# Reads DATABASE_URL and UPLOAD_DIR from /opt/voyage/server/.env unless they are already set.
# Copy BACKUP_DIR off the server (object storage / another site) - a backup on the same disk
# does not survive losing that disk.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/voyage}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/voyage}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [[ -z "${DATABASE_URL:-}" || -z "${UPLOAD_DIR:-}" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$APP_DIR/server/.env"
  set +a
fi
# pg_dump does not understand Prisma's connection-pool parameters.
PG_URL="${DATABASE_URL%%\?*}"

stamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
umask 077

db_file="$BACKUP_DIR/voyage-db-$stamp.dump"
files_file="$BACKUP_DIR/voyage-receipts-$stamp.tar.gz"

echo "[$(date -Is)] dumping database..."
pg_dump --format=custom --compress=6 --no-owner --file="$db_file" "$PG_URL"
# A dump that pg_restore cannot list is not a backup.
pg_restore --list "$db_file" > /dev/null

echo "[$(date -Is)] archiving receipts from $UPLOAD_DIR..."
tar -czf "$files_file" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"

echo "[$(date -Is)] removing backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name 'voyage-*' -type f -mtime +"$RETENTION_DAYS" -delete

echo "[$(date -Is)] done: $(du -h "$db_file" | cut -f1) database, $(du -h "$files_file" | cut -f1) receipts"
