"""Router de estado de salud (/health)."""
from fastapi import APIRouter
from app.schemas.comun import RespuestaSalud

router = APIRouter(tags=["Salud"])


@router.get(
    "/health",
    response_model=RespuestaSalud,
    summary="Verificar estado de salud de ai-service",
    description="Responde el estado operativo del microservicio sin invocar al proveedor externo de IA.",
)
async def obtener_estado_salud() -> RespuestaSalud:
    return RespuestaSalud(estado="ok", servicio="ai-service")
