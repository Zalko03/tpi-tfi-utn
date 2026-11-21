"""Cliente HTTP interno para notificar eventos de dominio a backend-node (HU8)."""

import json
import logging
import urllib.error
import urllib.request

from django.conf import settings

from apps.comun.middleware import obtener_correlation_id

logger = logging.getLogger(__name__)


def notificar_evento_node(evento: str, datos: dict) -> bool:
    """
    Envía una notificación interna POST a backend-node para difusión por Socket.IO.
    Ante ausencia de configuración, timeout o fallo de red, registra un aviso y retorna False
    sin interrumpir la operación transaccional en Django.
    """
    base_url = str(getattr(settings, "NODE_BASE_URL", "") or "").strip().rstrip("/")
    clave_interna = str(getattr(settings, "EVENTOS_INTERNOS_CLAVE", "") or "").strip()
    if not base_url or not clave_interna:
        logger.debug(
            "Notificación en vivo omitida (%s): NODE_BASE_URL o EVENTOS_INTERNOS_CLAVE sin configurar.",
            evento,
        )
        return False

    if not base_url.startswith(("http://", "https://")):
        logger.warning(
            "NODE_BASE_URL inválida para notificación %s; debe iniciar con http:// o https://.",
            evento,
        )
        return False

    timeout = float(getattr(settings, "NODE_EVENTOS_TIMEOUT_SECONDS", 2.0) or 2.0)
    url = f"{base_url}/api/internos/eventos"
    cuerpo = json.dumps({"evento": evento, "datos": datos}, ensure_ascii=False).encode("utf-8")

    cabeceras = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Clave-Interna": clave_interna,
    }
    correlation_id = obtener_correlation_id()
    if correlation_id:
        cabeceras["X-Request-ID"] = correlation_id

    req = urllib.request.Request(url=url, data=cuerpo, headers=cabeceras, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            codigo = getattr(resp, "status", None) or resp.getcode()
            if 200 <= int(codigo) < 300:
                return True
            logger.warning(
                "backend-node respondió estado inesperado %s al notificar %s",
                codigo,
                evento,
            )
            return False
    except urllib.error.HTTPError as exc:
        logger.warning(
            "backend-node rechazó la notificación %s con HTTP %s",
            evento,
            exc.code,
        )
        return False
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        logger.warning(
            "No se pudo notificar %s a backend-node (%s); la operación local continúa.",
            evento,
            exc,
        )
        return False
