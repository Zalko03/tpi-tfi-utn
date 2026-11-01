"""
Servicios de comprobación de salud del sistema para backend-django (TP 4).
"""

import time
from typing import Any, Dict

from django.db import connection


def verificar_salud_base_datos() -> Dict[str, Any]:
    """
    Ejecuta una consulta liviana sobre la conexión por defecto para evaluar la disponibilidad y latencia.
    """
    inicio = time.perf_counter()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        latencia_ms = round((time.perf_counter() - inicio) * 1000, 2)
        return {
            "estado": "ok",
            "latencia_ms": latencia_ms,
            "motor": connection.vendor,
        }
    except Exception as e:
        return {
            "estado": "error",
            "mensaje": str(e),
            "motor": getattr(connection, "vendor", "desconocido"),
        }
