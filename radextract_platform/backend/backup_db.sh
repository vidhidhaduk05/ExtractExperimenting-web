#!/usr/bin/env bash
# Nightly SQLite database backup script for RadExtract Platform
# Can be placed in /etc/cron.daily/radextract-backup or run manually

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/opt/extractexp/data/backups}"
mkdir -p "${BACKUP_DIR}"

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Starting RadExtract backup..."

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    docker compose exec -T api python backup_db.py --output-dir /data/db/backups
else
    python3 "${SCRIPT_DIR}/backup_db.py" --output-dir "${BACKUP_DIR}"
fi

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Backup completed successfully."
