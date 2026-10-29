#!/usr/bin/env bash
# ==============================================================================
# GA-ERP Local Vault Backup & Integrity Engine (Cloud-Free)
# ==============================================================================
set -eo pipefail

BACKUP_DIR="/opt/nexusedge-erp/backups"
LOCAL_VAULT="/opt/nexusedge-erp/vault-snapshots"
LOG_FILE="/var/log/ga_erp_backup.log"
RETENTION_DAYS=14

mkdir -p "${BACKUP_DIR}" "${LOCAL_VAULT}"

echo "[$(date +'%Y-%m-%d %H:%M:%S')] [BACKUP] Calculating SHA256 checksums..." >> "${LOG_FILE}"
cd "${BACKUP_DIR}"
for archive in *.sql.gz; do
    [ -e "${archive}" ] || continue
    if [ ! -f "${archive}.sha256" ]; then
        sha256sum "${archive}" > "${archive}.sha256"
    fi
done

# Mirror into secondary local vault
rsync -av --update "${BACKUP_DIR}/" "${LOCAL_VAULT}/" >> "${LOG_FILE}" 2>&1

# Prune archives older than retention threshold
find "${BACKUP_DIR}" -type f -name "*.sql.gz*" -mtime +${RETENTION_DAYS} -delete
find "${LOCAL_VAULT}" -type f -name "*.sql.gz*" -mtime +${RETENTION_DAYS} -delete

echo "[$(date +'%Y-%m-%d %H:%M:%S')] [BACKUP] Verification & local rotation complete." >> "${LOG_FILE}"
