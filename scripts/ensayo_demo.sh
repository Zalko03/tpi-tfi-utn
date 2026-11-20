#!/usr/bin/env bash
# ==============================================================================
# Ensayo automático del flujo de demostración (T10)
#
# Recorre contra servidores locales YA levantados el guion completo del video
# usando la API (sin tocar la base real ni guardar contraseñas en el script).
#
# Variables requeridas:
#   SEED_DEMO_PASSWORD (o DEMO_DUENIO_PASSWORD y DEMO_CAJERO_PASSWORD)
#   DJANGO_URL         (requerida salvo --confirmo-base-real; ej. http://127.0.0.1:8001)
#   NODE_URL           (requerida salvo --confirmo-base-real; ej. http://127.0.0.1:3001)
#
# Variables opcionales:
#   VERIFICAR_NODE     (auto | 1 | 0; por defecto: auto)
#   --confirmo-base-real (flag para confirmar uso de http://localhost:8000 y :3000)
# ==============================================================================

set -euo pipefail

DIRECTORIO_RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${SEED_DEMO_PASSWORD:-}" ]] && { [[ -z "${DEMO_DUENIO_PASSWORD:-}" ]] || [[ -z "${DEMO_CAJERO_PASSWORD:-}" ]]; }; then
    echo "❌ Falta configurar las contraseñas en variables de entorno." >&2
    echo "   Ejemplo: SEED_DEMO_PASSWORD=\"<tu-clave-demo>\" DJANGO_URL=http://127.0.0.1:8001 NODE_URL=http://127.0.0.1:3001 ./scripts/ensayo_demo.sh" >&2
    exit 1
fi

PYTHON_BIN="${PYTHON_BIN:-}"
if [[ -z "${PYTHON_BIN}" ]]; then
    if [[ -x "${DIRECTORIO_RAIZ}/backend-django/.venv/bin/python" ]]; then
        PYTHON_BIN="${DIRECTORIO_RAIZ}/backend-django/.venv/bin/python"
    elif command -v python3 >/dev/null 2>&1; then
        PYTHON_BIN="$(command -v python3)"
    else
        echo "❌ No se encontró Python 3 para ejecutar scripts/ensayo_demo.py." >&2
        exit 1
    fi
fi

exec "${PYTHON_BIN}" "${DIRECTORIO_RAIZ}/scripts/ensayo_demo.py" "$@"
