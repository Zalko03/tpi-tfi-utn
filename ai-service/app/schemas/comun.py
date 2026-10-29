"""Esquemas comunes de salud y respuestas de error unificadas."""
from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class RespuestaSalud(BaseModel):
    """Respuesta del endpoint de estado de salud del servicio."""

    estado: str = Field(default="ok", description="Estado operativo del servicio")
    servicio: str = Field(default="ai-service", description="Identificador del microservicio")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "estado": "ok",
                "servicio": "ai-service",
            }
        }
    )


class RespuestaError(BaseModel):
    """Contrato único de respuesta de error según docs/api-errores.md."""

    mensaje: str = Field(..., description="Descripción clara del error en español")
    detalles: Any = Field(
        default=None,
        description="Detalle adicional o diccionario de campos que fallaron la validación",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "mensaje": "Datos de entrada inválidos",
                "detalles": {
                    "texto_lista": ["El texto de la lista de precios no puede estar vacío."]
                },
            }
        }
    )
