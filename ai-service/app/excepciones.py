"""Manejadores de excepciones con formato único de error (docs/api-errores.md)."""
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ErrorDominioIA(Exception):
    """Excepción de negocio controlada dentro de ai-service."""

    def __init__(
        self,
        mensaje: str,
        detalles: object = None,
        codigo_http: int = status.HTTP_400_BAD_REQUEST,
    ) -> None:
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.detalles = detalles
        self.codigo_http = codigo_http


def _formatear_errores_validacion(exc: RequestValidationError) -> dict[str, list[str]]:
    """Convierte los errores de Pydantic v2 en un diccionario por campo en español."""
    detalles: dict[str, list[str]] = {}
    for err in exc.errors():
        ubicacion = [str(parte) for parte in err.get("loc", []) if parte != "body"]
        campo = ".".join(ubicacion) if ubicacion else "cuerpo"
        mensaje_raw = err.get("msg", "Valor inválido")
        detalles.setdefault(campo, []).append(mensaje_raw)
    return detalles


def registrar_manejadores_excepciones(app: FastAPI) -> None:
    """Registra los manejadores para asegurar que todo error 4xx/5xx cumpla docs/api-errores.md."""

    @app.exception_handler(ErrorDominioIA)
    async def manejador_error_dominio(_request: Request, exc: ErrorDominioIA) -> JSONResponse:
        return JSONResponse(
            status_code=exc.codigo_http,
            content={
                "mensaje": exc.mensaje,
                "detalles": exc.detalles,
            },
        )

    @app.exception_handler(RequestValidationError)
    async def manejador_validacion(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "mensaje": "Datos de entrada inválidos",
                "detalles": _formatear_errores_validacion(exc),
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def manejador_http_starlette(
        _request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        mensajes_por_defecto = {
            status.HTTP_400_BAD_REQUEST: "Datos de entrada inválidos",
            status.HTTP_401_UNAUTHORIZED: "Token de autenticación no provisto o vencido",
            status.HTTP_403_FORBIDDEN: "No tiene permisos para realizar esta acción",
            status.HTTP_404_NOT_FOUND: "Recurso no encontrado",
            status.HTTP_429_TOO_MANY_REQUESTS: (
                "Demasiadas peticiones. Intente nuevamente en unos minutos"
            ),
            status.HTTP_502_BAD_GATEWAY: "El servicio externo no se encuentra disponible",
        }
        detalle_exc = exc.detail
        if isinstance(detalle_exc, dict) and "mensaje" in detalle_exc:
            return JSONResponse(
                status_code=exc.status_code,
                content={
                    "mensaje": detalle_exc["mensaje"],
                    "detalles": detalle_exc.get("detalles"),
                },
            )

        mensaje = (
            str(detalle_exc)
            if isinstance(detalle_exc, str) and detalle_exc
            else mensajes_por_defecto.get(
                exc.status_code, "Ocurrió un error al procesar la solicitud"
            )
        )
        if exc.status_code == status.HTTP_404_NOT_FOUND and mensaje == "Not Found":
            mensaje = "Recurso no encontrado"

        return JSONResponse(
            status_code=exc.status_code,
            content={
                "mensaje": mensaje,
                "detalles": None,
            },
        )

    @app.exception_handler(Exception)
    async def manejador_error_interno(_request: Request, _exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "mensaje": "Ocurrió un error interno en el servidor",
                "detalles": None,
            },
        )
