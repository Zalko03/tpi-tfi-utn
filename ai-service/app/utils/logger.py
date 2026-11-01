"""
Utilidad de logging estructurado JSON con correlación para ai-service (TP 4).
"""

import json
import logging
import re
from datetime import datetime, timezone

PATRONES_SENSIBLES = [
    (
        re.compile(
            r'("?(?:key|api_key|token|password|secret)"?\s*[:=]\s*)"?[^"\'\s,{}]+"?',
            re.IGNORECASE,
        ),
        r'\1"********"',
    ),
]


def sanitizar_mensaje_ia(mensaje: str) -> str:
    """Enmascara API keys y datos sensibles en las cadenas de logs."""
    if not isinstance(mensaje, str):
        return mensaje
    for patron, reemplazo in PATRONES_SENSIBLES:
        mensaje = patron.sub(reemplazo, mensaje)
    return mensaje


class FormateadorJsonIA(logging.Formatter):
    """
    Formateador de logs estructurados en JSON para ai-service.
    """

    def format(self, record: logging.LogRecord) -> str:
        mensaje_original = record.getMessage()
        mensaje_sanitizado = sanitizar_mensaje_ia(mensaje_original)

        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "nivel": record.levelname,
            "servicio": "ai-service",
            "logger": record.name,
            "mensaje": mensaje_sanitizado,
            "correlation_id": getattr(record, "correlation_id", None) or "",
        }

        if record.exc_info:
            payload["excepcion"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False)
