#!/usr/bin/env bash
# backup.sh — Daily PostgreSQL dump + Docker volume snapshot
set -euo pipefail

BACKUP_DIR="."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_CONTAINER="gtracker_db"
DB_USER="palma"
DB_NAME="palma_assets"
RETAIN_DAYS=30          # keep 30 days of backups

echo "[$(date)] Starting backup..."

# ── 1. PostgreSQL logical dump (plain SQL, easiest to restore) ────────────────
DUMP_FILE="$BACKUP_DIR/db_${TIMESTAMP}.sql.gz"
docker exec "$DB_CONTAINER" \
    pg_dump -U "$DB_USER" "$DB_NAME" \
    | gzip > "$DUMP_FILE"

echo "[$(date)] DB dump written: $DUMP_FILE ($(du -sh $DUMP_FILE | cut -f1))"

# ── 2. Verify the dump is non-empty ──────────────────────────────────────────
if [ ! -s "$DUMP_FILE" ]; then
    echo "[$(date)] ERROR: Dump file is empty! Backup failed." >&2
    exit 1
fi

# ── 3. Rotate old backups ─────────────────────────────────────────────────────
find "$BACKUP_DIR" -name "db_*.sql.gz" -mtime +${RETAIN_DAYS} -delete
echo "[$(date)] Old backups cleaned (kept last ${RETAIN_DAYS} days)"

# ── 4. Log summary ────────────────────────────────────────────────────────────
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "db_*.sql.gz" | wc -l)
echo "[$(date)] Backup complete. Total backups on disk: $BACKUP_COUNT"