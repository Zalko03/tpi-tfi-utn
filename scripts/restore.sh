#!/usr/bin/env bash
# ==============================================================================
# Script de Restauración Automatizada (PostgreSQL + MongoDB) - TP 4
# Uso: ./scripts/restore.sh backups/backup_cafe_gestion_YYYYMMDD_HHMMSS.tar.gz
# ==============================================================================

set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "Uso: $0 <ruta_al_archivo_backup.tar.gz>"
    exit 1
fi

ARCHIVO_BACKUP="$1"
if [ ! -f "${ARCHIVO_BACKUP}" ]; then
    echo "ERROR: El archivo '${ARCHIVO_BACKUP}' no existe."
    exit 1
fi

CARPETA_TEMP="$(mktemp -d)"
trap 'rm -rf "${CARPETA_TEMP}"' EXIT

echo "==> [$(date +'%T')] Descomprimiendo respaldo ${ARCHIVO_BACKUP}..."
tar -xzf "${ARCHIVO_BACKUP}" -C "${CARPETA_TEMP}"

CARPETA_CONTENIDO="$(find "${CARPETA_TEMP}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"

# 1. Restaurar PostgreSQL
SQL_FILE="${CARPETA_CONTENIDO}/postgres_dump.sql"
if [ -f "${SQL_FILE}" ]; then
    echo "--> Restaurando base PostgreSQL desde ${SQL_FILE}..."
    if docker ps --format '{{.Names}}' | grep -q "cafe-postgres"; then
        docker compose exec -T postgres psql -U "${POSTGRES_USER:-cafe_user}" -d "${POSTGRES_DB:-cafe_gestion}" < "${SQL_FILE}"
        echo "    PostgreSQL restaurado exitosamente vía Docker Compose."
    elif command -v psql >/dev/null 2>&1; then
        psql -h "${POSTGRES_HOST:-localhost}" -U "${POSTGRES_USER:-cafe_user}" -d "${POSTGRES_DB:-cafe_gestion}" < "${SQL_FILE}"
        echo "    PostgreSQL restaurado exitosamente vía psql local."
    fi
else
    echo "    (Sin dump de PostgreSQL en este archivo de respaldo)"
fi

# 2. Restaurar MongoDB
MONGO_FILE="${CARPETA_CONTENIDO}/mongo_dump.archive"
if [ -f "${MONGO_FILE}" ]; then
    echo "--> Restaurando base MongoDB desde ${MONGO_FILE}..."
    if docker ps --format '{{.Names}}' | grep -q "cafe-mongodb"; then
        docker compose exec -T mongodb mongorestore --archive < "${MONGO_FILE}"
        echo "    MongoDB restaurado exitosamente vía Docker Compose."
    elif command -v mongorestore >/dev/null 2>&1; then
        mongorestore --uri="${MONGO_URI:-mongodb://localhost:27017/cafe_gestion}" --archive < "${MONGO_FILE}"
        echo "    MongoDB restaurado exitosamente vía mongorestore local."
    fi
else
    echo "    (Sin dump de MongoDB en este archivo de respaldo)"
fi

echo "==> [$(date +'%T')] Proceso de restauración finalizado exitosamente."
