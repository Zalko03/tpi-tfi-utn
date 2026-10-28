"""
Filtro de logging para sanitización de datos sensibles y secretos (T2.5).
"""

import logging
import re

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


class FiltroSanitizacionSeguridad(logging.Filter):
    """
    Enmascara credenciales, contraseñas, tokens y cabeceras sensibles en los logs.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            mensaje = record.msg
            for patron, reemplazo in PATRONES_SENSIBLES:
                mensaje = patron.sub(reemplazo, mensaje)
            record.msg = mensaje
        return True
