"""Router de inteligencia artificial (/v1/extraer-precios y /v1/resumen-semanal)."""
from fastapi import APIRouter, status
from app.schemas.comun import RespuestaError
from app.schemas.extraccion import RespuestaExtraccionPrecios, SolicitudExtraccionPrecios
from app.schemas.resumen import RespuestaResumenSemanal, SolicitudResumenSemanal
from app.services.extraccion import extraer_precios_de_lista
from app.services.resumen import generar_resumen_semanal

router = APIRouter(prefix="/v1", tags=["Inteligencia Artificial"])


@router.post(
    "/extraer-precios",
    response_model=RespuestaExtraccionPrecios,
    status_code=status.HTTP_200_OK,
    summary="Extraer insumos y precios desde texto de proveedor (HU7)",
    description=(
        "Recibe el texto desestructurado de una lista de precios de proveedor, "
        "lo procesa mediante el adaptador de IA configurado con el prompt versionado, "
        "valida cada ítem con Pydantic v2 (cantidades y precios en Decimal) y retorna "
        "la propuesta normalizada. Si el proveedor de IA falla o supera el timeout, "
        "retorna una respuesta de contingencia (`contingencia: true`) sin bloquear el sistema."
    ),
    responses={
        status.HTTP_400_BAD_REQUEST: {
            "model": RespuestaError,
            "description": "Datos de entrada inválidos según el contrato único de errores.",
        },
    },
)
async def endpoint_extraer_precios(
    solicitud: SolicitudExtraccionPrecios,
) -> RespuestaExtraccionPrecios:
    return await extraer_precios_de_lista(solicitud)


@router.post(
    "/resumen-semanal",
    response_model=RespuestaResumenSemanal,
    status_code=status.HTTP_200_OK,
    summary="Generar resumen semanal de rendimiento y rotación del menú (HU13)",
    description=(
        "Recibe las métricas consolidadas de ventas, márgenes brutos y alertas de la semana, "
        "y devuelve un resumen ejecutivo junto con sugerencias de rotación de productos "
        "validadas con Pydantic v2. Incluye respuesta de contingencia ante caídas de la IA."
    ),
    responses={
        status.HTTP_400_BAD_REQUEST: {
            "model": RespuestaError,
            "description": "Datos de entrada inválidos según el contrato único de errores.",
        },
    },
)
async def endpoint_resumen_semanal(
    solicitud: SolicitudResumenSemanal,
) -> RespuestaResumenSemanal:
    return await generar_resumen_semanal(solicitud)
