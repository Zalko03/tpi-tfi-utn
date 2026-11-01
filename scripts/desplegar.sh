#!/usr/bin/env bash
# ==============================================================================
# Script de Despliegue Automatizado y Verificación de Salud - TP 4
# Uso: ./scripts/desplegar.sh
# ==============================================================================

set -euo pipefail

DIRECTORIO_RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${DIRECTORIO_RAIZ}"

echo "==> [$(date +'%T')] Iniciando despliegue de cafe-gestion..."

# 1. Verificar archivo de entorno
if [ ! -f ".env" ]; then
    echo "AVISO: No se encontró archivo .env. Creando a partir de .env.example..."
    cp .env.example .env
fi

# 2. Validar sintaxis de docker-compose
echo "--> Validando configuración de Docker Compose..."
docker compose config >/dev/null
echo "    Sintaxis de Docker Compose válida."

# 3. Compilar y levantar contenedores
echo "--> Levantando servicios en modo detached..."
docker compose up -d --build

# 4. Esperar y verificar estado de salud
echo "--> Esperando que los healthchecks alcancen estado saludable..."
MAX_INTENTOS=12
INTENTO=1
while [ ${INTENTO} -le ${MAX_INTENTOS} ]; do
    UNHEALTHY=$(docker compose ps --format '{{.Service}}: {{.Health}}' | grep -v 'healthy' || true)
    if [ -z "${UNHEALTHY}" ]; then
        echo "==> [$(date +'%T')] Todos los servicios se encuentran saludables (healthy)!"
        break
    fi
    echo "    Intento ${INTENTO}/${MAX_INTENTOS}: Esperando servicios... (${UNHEALTHY})"
    sleep 5
    INTENTO=$((INTENTO + 1))
done

docker compose ps
echo "==> [$(date +'%T')] Despliegue completado. Accedé a la aplicación en http://localhost"
