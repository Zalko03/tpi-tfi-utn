"""
Middleware para propagación y rastreo de Correlation ID (X-Request-ID) en ai-service (FastAPI).
"""

import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        header_existente = request.headers.get("x-request-id") or request.headers.get(
            "x-correlation-id"
        )
        correlation_id = (
            header_existente.strip()
            if header_existente and header_existente.strip()
            else str(uuid.uuid4())
        )

        request.state.correlation_id = correlation_id

        response: Response = await call_next(request)
        response.headers["X-Request-ID"] = correlation_id
        return response
