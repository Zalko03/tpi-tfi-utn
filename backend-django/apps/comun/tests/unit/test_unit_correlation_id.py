"""
Tests unitarios puros para CorrelationIdMiddleware (TP 4).
No interactúa con base de datos ni modelos.
"""

import uuid
from unittest.mock import MagicMock

from django.http import HttpResponse
from django.test import RequestFactory

from apps.comun.middleware import CorrelationIdMiddleware, obtener_correlation_id


def test_correlation_id_genera_uuid_si_no_se_provee():
    factory = RequestFactory()
    request = factory.get("/cualquier-ruta")

    get_response = MagicMock(return_value=HttpResponse("ok"))
    middleware = CorrelationIdMiddleware(get_response)

    response = middleware(request)

    assert hasattr(request, "correlation_id")
    assert request.correlation_id != ""
    # Valida formato UUID v4
    valido = uuid.UUID(request.correlation_id)
    assert valido.version == 4
    assert response["X-Request-ID"] == request.correlation_id
    get_response.assert_called_once_with(request)


def test_correlation_id_preserva_header_entrante():
    factory = RequestFactory()
    custom_id = "req-externo-prueba-12345"
    request = factory.get("/cualquier-ruta", HTTP_X_REQUEST_ID=custom_id)

    get_response = MagicMock(return_value=HttpResponse("ok"))
    middleware = CorrelationIdMiddleware(get_response)

    response = middleware(request)

    assert request.correlation_id == custom_id
    assert response["X-Request-ID"] == custom_id


def test_correlation_id_preserva_header_correlation_id_alternativo():
    factory = RequestFactory()
    custom_id = "corr-alternativo-67890"
    request = factory.get("/cualquier-ruta", HTTP_X_CORRELATION_ID=custom_id)

    get_response = MagicMock(return_value=HttpResponse("ok"))
    middleware = CorrelationIdMiddleware(get_response)

    response = middleware(request)

    assert request.correlation_id == custom_id
    assert response["X-Request-ID"] == custom_id


def test_correlation_id_disponible_en_contexto_y_limpiado_posteriormente():
    factory = RequestFactory()
    request = factory.get("/ruta")

    id_capturado_en_handler = None

    def handler_prueba(req):
        nonlocal id_capturado_en_handler
        id_capturado_en_handler = obtener_correlation_id()
        return HttpResponse("listo")

    middleware = CorrelationIdMiddleware(handler_prueba)
    assert obtener_correlation_id() == ""

    middleware(request)

    assert id_capturado_en_handler == request.correlation_id
    # Tras finalizar la llamada, el contextvar debe quedar reseteado
    assert obtener_correlation_id() == ""
