"""
Filtro de logging para sanitización de datos sensibles y formateador estructurado JSON (T2.5 y TP 4).
"""

import json
import logging
import re
from datetime import datetime, timezone

PATRONES_SENSIBLES = [
    (
        re.compile(
            r'("?(?:password|contrasenia|clave|refresh|access|secret|token)"?\s*[:=]\s*)"?[^"\'\s,{}]+"?',
            re.IGNORECASE,
        ),
        r'\1"********"',
    ),
    (
        re.compile(r"(Bearer\s+)[A-Za-z0-9\-_\.]+", re.IGNORECASE),
        r"\1********",
    ),
]


def sanitizar_mensaje(mensaje: str) -> str:
    """Enmascara contraseñas, tokens y claves sensibles en una cadena de texto."""
    if not isinstance(mensaje, str):
        return mensaje
    for patron, reemplazo in PATRONES_SENSIBLES:
        mensaje = patron.sub(reemplazo, mensaje)
    return mensaje


class FiltroSanitizacionSeguridad(logging.Filter):
    """
    Enmascara credenciales, contraseñas, tokens y cabeceras sensibles en los logs.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = sanitizar_mensaje(record.msg)
        return True


class FormateadorJson(logging.Formatter):
    """
    Formateador de logs estructurados en JSON con metadatos de trazabilidad y sanitización (TP 4).
    """

    def format(self, record: logging.LogRecord) -> str:
        # Obtener correlation_id desde ContextVar de comun.middleware si está disponible
        correlation_id = ""
        try:
            from apps.comun.middleware import obtener_correlation_id

            correlation_id = obtener_correlation_id()
        except ImportError:
            pass

        # Obtener y sanitizar mensaje
        mensaje_original = record.getMessage()
        mensaje_sanitizado = sanitizar_mensaje(mensaje_original)

        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "nivel": record.levelname,
            "servicio": "backend-django",
            "logger": record.name,
            "mensaje": mensaje_sanitizado,
            "correlation_id": correlation_id or getattr(record, "correlation_id", None) or "",
        }

        if record.exc_info:
            payload["excepcion"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False)
