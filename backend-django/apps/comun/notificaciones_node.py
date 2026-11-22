"""Cliente HTTP interno para notificar eventos de dominio a backend-node (HU8).

Por qué el envío va en segundo plano: los avisos se mandan después del commit, en el mismo
hilo que atiende el cobro. Si Node está dormido o caído (Render gratis lo apaga sin tráfico),
cada aviso espera hasta NODE_EVENTOS_TIMEOUT_SECONDS y un cobro con alertas de stock podía
tardar varios segundos. Ahora la petición se arma en el hilo del request (ahí vive el
correlation id, que es un ContextVar y no pasa a otros hilos) y se encola en un único hilo
de fondo. Un solo hilo mantiene el orden de llegada (venta.registrada antes que stock.bajo).

El aviso sigue siendo "best-effort": si Node no responde se registra un warning y no se reintenta.
Con NODE_EVENTOS_EN_SEGUNDO_PLANO=False el envío es síncrono (lo usan los tests).
"""

import json
import logging
import threading
import urllib.error
import urllib.request
from concurrent.futures import Future, ThreadPoolExecutor

from django.conf import settings

from apps.comun.middleware import obtener_correlation_id

logger = logging.getLogger(__name__)

_ejecutor: ThreadPoolExecutor | None = None
_lock_ejecutor = threading.Lock()


def _obtener_ejecutor() -> ThreadPoolExecutor:
    """Crea el hilo de envío la primera vez que se usa (no al importar el módulo)."""
    global _ejecutor
    with _lock_ejecutor:
        if _ejecutor is None:
            _ejecutor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="aviso-node")
        return _ejecutor


def _construir_peticion(evento: str, datos: dict) -> tuple[urllib.request.Request, float] | None:
    """Valida la configuración y arma la petición. Devuelve None si no corresponde enviar."""
    base_url = str(getattr(settings, "NODE_BASE_URL", "") or "").strip().rstrip("/")
    clave_interna = str(getattr(settings, "EVENTOS_INTERNOS_CLAVE", "") or "").strip()
    if not base_url or not clave_interna:
        logger.debug(
            "Notificación en vivo omitida (%s): NODE_BASE_URL o EVENTOS_INTERNOS_CLAVE sin configurar.",
            evento,
        )
        return None

    if not base_url.startswith(("http://", "https://")):
        logger.warning(
            "NODE_BASE_URL inválida para notificación %s; debe iniciar con http:// o https://.",
            evento,
        )
        return None

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
    return req, timeout


def _enviar_peticion(req: urllib.request.Request, evento: str, timeout: float) -> bool:
    """Hace el POST a Node. Nunca lanza: ante cualquier fallo registra un aviso y devuelve False."""
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
    except Exception:
        # En segundo plano nadie atrapa la excepción: se registra para no perderla en silencio.
        logger.exception("Error inesperado al notificar %s a backend-node", evento)
        return False


def notificar_evento_node(evento: str, datos: dict) -> bool | Future:
    """
    Envía una notificación interna POST a backend-node para difusión por Socket.IO.

    - Sin configuración (NODE_BASE_URL / EVENTOS_INTERNOS_CLAVE) devuelve False y no envía.
    - En segundo plano (por defecto) devuelve el Future del envío sin esperar a Node.
    - En modo síncrono devuelve True/False según la respuesta de Node.
    Nunca interrumpe la operación transaccional en Django.
    """
    peticion = _construir_peticion(evento, datos)
    if peticion is None:
        return False
    req, timeout = peticion

    if not getattr(settings, "NODE_EVENTOS_EN_SEGUNDO_PLANO", True):
        return _enviar_peticion(req, evento, timeout)

    try:
        return _obtener_ejecutor().submit(_enviar_peticion, req, evento, timeout)
    except RuntimeError as exc:
        # El ejecutor ya se cerró (apagado del proceso): se descarta el aviso.
        logger.warning("Notificación %s descartada: %s", evento, exc)
        return False
