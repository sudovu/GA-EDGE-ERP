#!/usr/bin/env bash
set -eo pipefail
BACKUP_DIR="/opt/nexusedge-erp/backups"
LOCAL_VAULT="/opt/nexusedge-erp/vault-snapshots"
LOG_FILE="/var/log/ga_erp_backup.log"
RETENTION_DAYS=14

mkdir -p "${BACKUP_DIR}" "${LOCAL_VAULT}"

echo "[$(date +'%Y-%m-%d %H:%M:%S %Z')] [LOCAL-VAULT] Generating SHA-256 digests..." >> "${LOG_FILE}"
cd "${BACKUP_DIR}"
for archive in *.sql.gz; do
    [ -e "${archive}" ] || continue
    if [ ! -f "${archive}.sha256" ]; then
        sha256sum "${archive}" > "${archive}.sha256"
    fi
done

echo "[$(date +'%Y-%m-%d %H:%M:%S %Z')] [LOCAL-VAULT] Mirroring snapshots to vault..." >> "${LOG_FILE}"
rsync -av --update "${BACKUP_DIR}/" "${LOCAL_VAULT}/" >> "${LOG_FILE}" 2>&1

echo "[$(date +'%Y-%m-%d %H:%M:%S %Z')] [LOCAL-VAULT] Pruning archives older than ${RETENTION_DAYS} days..." >> "${LOG_FILE}"
find "${BACKUP_DIR}" -type f -name "*.sql.gz*" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
find "${LOCAL_VAULT}" -type f -name "*.sql.gz*" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true

echo "[$(date +'%Y-%m-%d %H:%M:%S %Z')] [LOCAL-VAULT] Snapshot rotation complete." >> "${LOG_FILE}"
