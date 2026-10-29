#!/bin/bash
set -eo pipefail

# ==============================================================================
# GA-ERP Automated PostgreSQL Backup Engine
# Script: /opt/nexusedge-erp/docker/scripts/backup.sh
# ==============================================================================

PROJECT_DIR="/opt/nexusedge-erp"
BACKUP_DIR="${PROJECT_DIR}/backups"
ENV_FILE="${PROJECT_DIR}/.env"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/ga_erp_db_${TIMESTAMP}.sql.gz"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
LOG_PREFIX="[$(date +"%Y-%m-%d %H:%M:%S")]"

echo "${LOG_PREFIX} === GA-ERP Daily Backup Job Initiated ==="

# 1. Verify environment and prerequisites
if [ ! -f "${ENV_FILE}" ]; then
    echo "${LOG_PREFIX} [ERROR] Environment file ${ENV_FILE} not found. Aborting." >&2
    exit 1
fi

mkdir -p "${BACKUP_DIR}"

# 2. Extract database credentials from .env
POSTGRES_USER=$(grep -E '^POSTGRES_USER=' "${ENV_FILE}" | cut -d '=' -f2- | tr -d '"\r')
POSTGRES_DB=$(grep -E '^POSTGRES_DB=' "${ENV_FILE}" | cut -d '=' -f2- | tr -d '"\r')

if [ -z "${POSTGRES_USER}" ] || [ -z "${POSTGRES_DB}" ]; then
    echo "${LOG_PREFIX} [ERROR] Failed to extract POSTGRES_USER or POSTGRES_DB from .env. Aborting." >&2
    exit 1
fi

# 3. Verify database container is running and healthy
CONTAINER_STATUS=$(docker inspect -f '{{.State.Health.Status}}' nexusedge-db 2>/dev/null || echo "not_found")
if [ "${CONTAINER_STATUS}" != "healthy" ]; then
    echo "${LOG_PREFIX} [ERROR] Container nexusedge-db status is '${CONTAINER_STATUS}' (expected 'healthy'). Aborting." >&2
    exit 1
fi

# 4. Stream atomic snapshot via pg_dump
echo "${LOG_PREFIX} [INFO] Streaming database snapshot for database: ${POSTGRES_DB}..."
docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T db \
    pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --clean --if-exists | gzip -9 > "${BACKUP_FILE}"

# 5. Integrity verification
if [ ! -s "${BACKUP_FILE}" ]; then
    echo "${LOG_PREFIX} [ERROR] Backup archive ${BACKUP_FILE} is empty or missing! Aborting." >&2
    rm -f "${BACKUP_FILE}"
    exit 1
fi

if ! gzip -t "${BACKUP_FILE}" 2>/dev/null; then
    echo "${LOG_PREFIX} [ERROR] Gzip integrity check failed for ${BACKUP_FILE}!" >&2
    rm -f "${BACKUP_FILE}"
    exit 1
fi

FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "${LOG_PREFIX} [SUCCESS] Snapshot verified successfully. Size: ${FILE_SIZE}"

# 6. Generate SHA-256 Checksum
sha256sum "${BACKUP_FILE}" > "${CHECKSUM_FILE}"
echo "${LOG_PREFIX} [INFO] SHA-256 Checksum recorded."

# 7. Enforce 14-Day Retention Window
echo "${LOG_PREFIX} [INFO] Enforcing 14-day retention policy on ${BACKUP_DIR}..."
PURGED_FILES=$(find "${BACKUP_DIR}" -type f \( -name "*.sql.gz" -o -name "*.sha256" \) -mtime +14 -print)

if [ -n "${PURGED_FILES}" ]; then
    echo "${LOG_PREFIX} [INFO] Purging archives older than 14 days:"
    echo "${PURGED_FILES}"
    find "${BACKUP_DIR}" -type f \( -name "*.sql.gz" -o -name "*.sha256" \) -mtime +14 -delete
else
    echo "${LOG_PREFIX} [INFO] No archives exceeded 14-day retention."
fi

# 8. Report disk usage summary
CURRENT_BACKUP_COUNT=$(find "${BACKUP_DIR}" -type f -name "*.sql.gz" | wc -l)
TOTAL_BACKUP_USAGE=$(du -sh "${BACKUP_DIR}" | cut -f1)
echo "${LOG_PREFIX} [SUMMARY] Active snapshots: ${CURRENT_BACKUP_COUNT} | Total storage: ${TOTAL_BACKUP_USAGE}"
echo "${LOG_PREFIX} === GA-ERP Daily Backup Job Finished Successfully ==="
