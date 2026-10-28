#!/bin/bash
set -eo pipefail

if [ -z "$1" ]; then
    echo "Usage: ./restore.sh <path_to_backup_file.sql.gz>"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: File $BACKUP_FILE not found."
    exit 1
fi

echo "[!] Warning: This will overwrite the current database!"
read -p "Type 'RESTORE' to proceed: " CONFIRM

if [ "$CONFIRM" != "RESTORE" ]; then
    echo "Aborted."
    exit 0
fi

echo "[+] Dropping public schema and restoring from ${BACKUP_FILE}..."
docker compose -f /opt/nexusedge-erp/docker-compose.yml exec -T db psql -U nexus_db_admin -d nexus_erp_production -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
gunzip -c "${BACKUP_FILE}" | docker compose -f /opt/nexusedge-erp/docker-compose.yml exec -T db psql -U nexus_db_admin -d nexus_erp_production

echo "[✓] Restoration completed successfully."
