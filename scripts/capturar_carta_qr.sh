#!/usr/bin/env bash
# ==============================================================================
# Script de Evidencias Visuales para Carta Pública y Código QR (T5 / T6)
# Uso: ./scripts/capturar_carta_qr.sh [carpeta_salida]
# Variables opcionales: CARTA_URL, DJANGO_URL, ORIGIN_QR, PATHNAME_QR
# ==============================================================================

set -euo pipefail

DIRECTORIO_RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SALIDA_DIR="${1:-${HOME}/Escritorio/capturas-presentacion/qr-carta}"
CARTA_URL="${CARTA_URL:-http://localhost:3000/app/carta.html}"
DJANGO_URL="${DJANGO_URL:-http://localhost:8000}"
ORIGIN_QR="${ORIGIN_QR:-http://localhost:3000}"
PATHNAME_QR="${PATHNAME_QR:-/app/}"

mkdir -p "${SALIDA_DIR}"

echo "==> [$(date +'%T')] Generando evidencias de Carta Digital y QR en: ${SALIDA_DIR}"

# 1. Verificación del endpoint público anónimo en Django
echo "--> Verificando ${DJANGO_URL}/api/carta-publica/..."
HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' "${DJANGO_URL}/api/carta-publica/" || true)"
if [[ "${HTTP_CODE}" != "200" ]]; then
    echo "    ERROR: ${DJANGO_URL}/api/carta-publica/ respondió HTTP ${HTTP_CODE}." >&2
    echo "    Levantá Django y Node antes de capturar la carta en vivo." >&2
    exit 1
fi
echo "    Endpoint público OK (HTTP 200)."

# 2. Generación de código QR SVG ISO/IEC 18004 usando el módulo puro del proyecto
echo "--> Generando qr-carta-ejemplo.svg con web/js/logicaPwa.js..."
(
    cd "${DIRECTORIO_RAIZ}"
    ORIGIN_QR="${ORIGIN_QR}" PATHNAME_QR="${PATHNAME_QR}" node --input-type=module -e "
        import { construirUrlCartaPublica, generarSvgQrCarta } from './web/js/logicaPwa.js';
        const url = construirUrlCartaPublica(process.env.ORIGIN_QR, process.env.PATHNAME_QR);
        process.stdout.write(generarSvgQrCarta(url, { tamanoPx: 260, nivel: 'M' }));
    " > "${SALIDA_DIR}/qr-carta-ejemplo.svg"
)
echo "    Guardado: ${SALIDA_DIR}/qr-carta-ejemplo.svg"

# 3. Detección de navegador headless disponible para capturas PNG
NAVEGADOR=""
for candidato in brave-browser chromium chromium-browser google-chrome; do
    if command -v "${candidato}" >/dev/null 2>&1; then
        NAVEGADOR="${candidato}"
        break
    fi
done

if [[ -z "${NAVEGADOR}" ]]; then
    echo "    AVISO: No se encontró navegador Chromium/Brave para capturas PNG." >&2
    exit 0
fi

echo "--> Capturando ${CARTA_URL} con ${NAVEGADOR} (Desktop 1280x900)..."
"${NAVEGADOR}" --headless=new --disable-gpu --no-sandbox \
    --window-size=1280,900 --virtual-time-budget=3000 \
    --screenshot="${SALIDA_DIR}/01-carta-publica-desktop.png" \
    "${CARTA_URL}" >/dev/null 2>&1

echo "--> Capturando ${CARTA_URL} con ${NAVEGADOR} (Mobile 390x844)..."
"${NAVEGADOR}" --headless=new --disable-gpu --no-sandbox \
    --window-size=390,844 --virtual-time-budget=3000 \
    --screenshot="${SALIDA_DIR}/02-carta-publica-mobile.png" \
    "${CARTA_URL}" >/dev/null 2>&1

echo "==> Evidencias generadas correctamente en ${SALIDA_DIR}:"
ls -lh "${SALIDA_DIR}"
