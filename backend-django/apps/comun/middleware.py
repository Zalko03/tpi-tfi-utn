"""
Middleware para propagación y rastreo de Correlation ID (X-Request-ID) entre servicios (TP 4).
"""

import contextvars
import uuid

# ContextVar para acceder al correlation_id actual desde cualquier punto del hilo/corutina
CORRELATION_ID_ACTUAL = contextvars.ContextVar("correlation_id_actual", default="")


def obtener_correlation_id() -> str:
    """Retorna el correlation_id asociado a la petición en curso o vacío si no hay."""
    return CORRELATION_ID_ACTUAL.get()


class CorrelationIdMiddleware:
    """
    Lee o genera una cabecera X-Request-ID única para cada petición HTTP.
    La inyecta en el contexto de logging y en la respuesta HTTP saliente.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        correlation_id = (
            request.META.get("HTTP_X_REQUEST_ID")
            or request.META.get("HTTP_X_CORRELATION_ID")
            or str(uuid.uuid4())
        )

        # Asignar al objeto request y al contextvar de ejecución
        request.correlation_id = correlation_id
        token = CORRELATION_ID_ACTUAL.set(correlation_id)

        try:
            response = self.get_response(request)
        finally:
            CORRELATION_ID_ACTUAL.reset(token)

        # Inyectar el correlation ID en la respuesta HTTP saliente
        response["X-Request-ID"] = correlation_id
        return response
