"""
Vistas de comprobación de salud básica (liveness) y profunda (readiness) para backend-django.
"""

from datetime import datetime, timezone

from django.http import JsonResponse
from django.views.decorators.http import require_GET

from .services import verificar_salud_base_datos


@require_GET
def obtener_estado(request):
    """Indica únicamente que el proceso HTTP de Django está vivo (Liveness probe)."""
    return JsonResponse({"estado": "ok", "servicio": "backend-django"})


@require_GET
def obtener_estado_profundo(request):
    """
    Comprobación exhaustiva de dependencias críticas (Readiness probe):
    verifica la conexión y latencia de la base de datos (PostgreSQL / SQLite).
    """
    resultado_db = verificar_salud_base_datos()
    es_saludable = resultado_db.get("estado") == "ok"

    codigo_http = 200 if es_saludable else 503
    payload = {
        "estado": "ok" if es_saludable else "error",
        "servicio": "backend-django",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {
            "database": resultado_db,
        },
    }
    return JsonResponse(payload, status=codigo_http)
