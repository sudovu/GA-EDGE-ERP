#!/bin/bash
set -eo pipefail

BACKUP_DIR="/opt/nexusedge-erp/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/backup_nexusedge_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[+] Starting PostgreSQL consistent snapshot..."
docker compose -f /opt/nexusedge-erp/docker-compose.yml exec -T db pg_dump -U nexus_db_admin nexus_erp_production | gzip > "${BACKUP_FILE}"

echo "[✓] Backup completed successfully: ${BACKUP_FILE}"
# Keep only last 14 daily snapshots
find "${BACKUP_DIR}" -type f -name "*.sql.gz" -mtime +14 -exec rm {} \;
