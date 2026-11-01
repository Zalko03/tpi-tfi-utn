#!/usr/bin/env bash
# ==============================================================================
# Script de Respaldo Automatizado (PostgreSQL + MongoDB) - TP 4
# Uso: ./scripts/backup.sh
# ==============================================================================

set -euo pipefail

DIRECTORIO_RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CARPETA_BACKUP="${DIRECTORIO_RAIZ}/backups"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
DESTINO_TEMP="${CARPETA_BACKUP}/temp_${TIMESTAMP}"
ARCHIVO_FINAL="${CARPETA_BACKUP}/backup_cafe_gestion_${TIMESTAMP}.tar.gz"

mkdir -p "${DESTINO_TEMP}"
echo "==> [$(date +'%T')] Iniciando respaldo del sistema cafe-gestion..."

# 1. Respaldo de PostgreSQL 16
echo "--> Respaldando base transaccional PostgreSQL..."
if docker ps --format '{{.Names}}' | grep -q "cafe-postgres"; then
    docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-cafe_user}" "${POSTGRES_DB:-cafe_gestion}" > "${DESTINO_TEMP}/postgres_dump.sql"
    echo "    PostgreSQL respaldado vía Docker Compose."
elif command -v pg_dump >/dev/null 2>&1; then
    pg_dump -h "${POSTGRES_HOST:-localhost}" -U "${POSTGRES_USER:-cafe_user}" "${POSTGRES_DB:-cafe_gestion}" > "${DESTINO_TEMP}/postgres_dump.sql"
    echo "    PostgreSQL respaldado vía comando local pg_dump."
else
    echo "    AVISO: No se encontró instancia activa de PostgreSQL para volcar."
    touch "${DESTINO_TEMP}/postgres_no_disponible.txt"
fi

# 2. Respaldo de MongoDB 7
echo "--> Respaldando base documental MongoDB..."
if docker ps --format '{{.Names}}' | grep -q "cafe-mongodb"; then
    docker compose exec -T mongodb mongodump --db="${POSTGRES_DB:-cafe_gestion}" --archive > "${DESTINO_TEMP}/mongo_dump.archive"
    echo "    MongoDB respaldado vía Docker Compose."
elif command -v mongodump >/dev/null 2>&1; then
    mongodump --uri="${MONGO_URI:-mongodb://localhost:27017/cafe_gestion}" --archive > "${DESTINO_TEMP}/mongo_dump.archive"
    echo "    MongoDB respaldado vía comando local mongodump."
else
    echo "    AVISO: No se encontró instancia activa de MongoDB para volcar."
    touch "${DESTINO_TEMP}/mongo_no_disponible.txt"
fi

# 3. Empaquetar y comprimir
echo "--> Comprimiendo archivo de respaldo..."
tar -czf "${ARCHIVO_FINAL}" -C "${CARPETA_BACKUP}" "temp_${TIMESTAMP}"
rm -rf "${DESTINO_TEMP}"

TAMANIO="$(du -h "${ARCHIVO_FINAL}" | cut -f1)"
echo "==> [$(date +'%T')] Respaldo completado exitosamente: ${ARCHIVO_FINAL} (${TAMANIO})"
