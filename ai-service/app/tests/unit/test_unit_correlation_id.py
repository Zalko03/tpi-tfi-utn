"""
Tests unitarios puros para CorrelationIdMiddleware en ai-service (TP 4).
"""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from starlette.requests import Request
from starlette.responses import Response

from app.middlewares.correlation import CorrelationIdMiddleware


@pytest.mark.asyncio
async def test_correlation_id_genera_uuid_v4_si_no_se_provee():
    middleware = CorrelationIdMiddleware(app=MagicMock())

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/health",
        "headers": [],
    }
    request = Request(scope)

    mock_response = Response("ok")
    call_next = AsyncMock(return_value=mock_response)

    response = await middleware.dispatch(request, call_next)

    assert hasattr(request.state, "correlation_id")
    valido = uuid.UUID(request.state.correlation_id)
    assert valido.version == 4
    assert response.headers["X-Request-ID"] == request.state.correlation_id


@pytest.mark.asyncio
async def test_correlation_id_preserva_header_entrante():
    middleware = CorrelationIdMiddleware(app=MagicMock())

    custom_id = "req-ai-service-externo-999"
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/v1/extraer-precios",
        "headers": [(b"x-request-id", custom_id.encode("utf-8"))],
    }
    request = Request(scope)

    mock_response = Response("ok")
    call_next = AsyncMock(return_value=mock_response)

    response = await middleware.dispatch(request, call_next)

    assert request.state.correlation_id == custom_id
    assert response.headers["X-Request-ID"] == custom_id
