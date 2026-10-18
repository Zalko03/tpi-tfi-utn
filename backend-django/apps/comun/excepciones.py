"""Manejador unificado de excepciones para DRF respetando docs/api-errores.md."""
import logging
from django.conf import settings
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def manejador_excepciones_api(exc, context):
    """
    Transforma cualquier excepción manejada por DRF o excepción no controlada
    en el contrato JSON único: { "mensaje": "...", "detalles": ... }.
    """
    response = exception_handler(exc, context)

    if response is not None:
        mensaje = "Ocurrió un error en la solicitud"
        detalles = None

        if response.status_code == 404 or isinstance(exc, exceptions.NotFound):
            mensaje = "Recurso no encontrado"
            detalles = None
        elif isinstance(exc, exceptions.ValidationError):
            mensaje = "Datos de entrada inválidos"
            detalles = response.data
            if isinstance(response.data, dict) and "non_field_errors" in response.data:
                mensaje = " ".join(response.data["non_field_errors"])
            elif isinstance(response.data, list) and response.data:
                mensaje = str(response.data[0])
        elif isinstance(exc, exceptions.PermissionDenied):
            mensaje = "No tiene permisos para realizar esta acción"
            detalles = None
        elif isinstance(exc, (exceptions.NotAuthenticated, exceptions.AuthenticationFailed)):
            mensaje = "Credenciales de autenticación no provistas o inválidas"
            detalles = None
        elif isinstance(exc, exceptions.Throttled):
            mensaje = f"Límite de solicitudes superado. Intente en {exc.wait} segundos"
            detalles = None
        elif isinstance(response.data, dict) and "detail" in response.data:
            mensaje = str(response.data["detail"])
            detalles = None

        response.data = {
            "mensaje": mensaje,
            "detalles": detalles,
        }
        return response

    # Excepción no controlada (HTTP 500)
    logger.exception("Error interno no controlado: %s", exc)
    contenido = {
        "mensaje": "Ocurrió un error interno en el servidor",
        "detalles": str(exc) if getattr(settings, "DEBUG", False) else None,
    }
    return Response(contenido, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
