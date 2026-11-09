"""Router de estado de salud (/health y /health/profundo)."""

from typing import Any, Dict

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import config
from app.schemas.comun import RespuestaSalud

router = APIRouter(tags=["Salud"])


class RespuestaSaludProfunda(BaseModel):
    estado: str
    servicio: str
    proveedor: str
    version_prompt: str
    timeout_segundos: float
    max_reintentos: int
    modelo: str


@router.get(
    "/health",
    response_model=RespuestaSalud,
    summary="Verificar estado de salud de ai-service",
    description="Responde el estado operativo del microservicio sin invocar al proveedor externo de IA.",
)
async def obtener_estado_salud() -> RespuestaSalud:
    return RespuestaSalud(estado="ok", servicio="ai-service")


@router.get(
    "/health/profundo",
    response_model=RespuestaSaludProfunda,
    summary="Verificar configuración y salud profunda de ai-service",
    description="Devuelve el estado operativo junto con la configuración activa del adapter de IA.",
)
async def obtener_estado_salud_profundo() -> Dict[str, Any]:
    if config.proveedor_activo == "groq":
        modelo_activo = config.groq_modelo
    elif config.proveedor_activo == "gemini":
        modelo_activo = config.gemini_modelo
    else:
        modelo_activo = config.ollama_modelo
    return {
        "estado": "ok",
        "servicio": "ai-service",
        "proveedor": config.proveedor_activo,
        "version_prompt": config.version_prompt_activa,
        "timeout_segundos": config.timeout_segundos,
        "max_reintentos": config.max_reintentos,
        "modelo": modelo_activo,
    }
