"""Esquemas Pydantic v2 para la generación del resumen semanal de rendimiento (HU13)."""
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProductoRendimientoEntrada(BaseModel):
    """Datos agregados de ventas y margen de un producto durante el período consultado."""

    nombre: str = Field(..., min_length=1, max_length=150, description="Nombre del producto de cafetería.")
    unidades_vendidas: int = Field(..., ge=0, description="Cantidad de unidades vendidas en la semana.")
    ingresos_totales: Decimal = Field(..., ge=Decimal("0"), description="Monto bruto vendido del producto.")
    ganancia_bruta: Decimal = Field(..., description="Ganancia bruta acumulada (precio - costo congelado).")
    margen_bruto_pct: Decimal = Field(
        ...,
        description="Porcentaje de margen bruto promedio del producto (ej. 58.50).",
    )

    @field_validator("nombre")
    @classmethod
    def limpiar_nombre(cls, valor: str) -> str:
        limpio = valor.strip()
        if not limpio:
            raise ValueError("El nombre del producto no puede estar vacío.")
        return limpio


class SolicitudResumenSemanal(BaseModel):
    """Datos semanales consolidados enviados a ai-service para redactar el resumen y sugerencias."""

    fecha_desde: str = Field(..., min_length=8, max_length=20, description="Fecha de inicio del período (YYYY-MM-DD).")
    fecha_hasta: str = Field(..., min_length=8, max_length=20, description="Fecha de cierre del período (YYYY-MM-DD).")
    total_ventas: Decimal = Field(..., ge=Decimal("0"), description="Facturación bruta total del período.")
    ganancia_bruta_total: Decimal = Field(..., description="Ganancia bruta total acumulada del período.")
    cantidad_tickets: int = Field(..., ge=0, description="Cantidad de tickets emitidos en la semana.")
    productos: list[ProductoRendimientoEntrada] = Field(
        ...,
        min_length=1,
        description="Desglose de rendimiento por producto del menú.",
    )
    alertas_insumos: list[str] = Field(
        default_factory=list,
        description="Alertas previas sobre incrementos de costos de insumos o stock mínimo.",
    )
    version_prompt: str = Field(
        default="v1",
        pattern=r"^v\d+$",
        description="Versión del prompt a utilizar (por defecto 'v1').",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "fecha_desde": "2026-10-20",
                "fecha_hasta": "2026-10-27",
                "total_ventas": "685000.00",
                "ganancia_bruta_total": "412000.00",
                "cantidad_tickets": 215,
                "productos": [
                    {
                        "nombre": "Café Latte Mediano",
                        "unidades_vendidas": 110,
                        "ingresos_totales": "330000.00",
                        "ganancia_bruta": "214500.00",
                        "margen_bruto_pct": "65.00",
                    },
                    {
                        "nombre": "Tostado de Jamón y Queso",
                        "unidades_vendidas": 45,
                        "ingresos_totales": "225000.00",
                        "ganancia_bruta": "101250.00",
                        "margen_bruto_pct": "45.00",
                    },
                ],
                "alertas_insumos": ["Leche entera subió un 12% en la última compra"],
                "version_prompt": "v1",
            }
        }
    )


class SugerenciaRotacionItem(BaseModel):
    """Sugerencia accionable sobre un producto del menú."""

    producto: str = Field(..., min_length=1, description="Producto sobre el cual se sugiere accionar.")
    accion_sugerida: str = Field(..., min_length=1, description="Acción recomendada (promocionar, ajustar precio, rotar).")
    motivo: str = Field(..., min_length=1, description="Justificación basada en volumen y margen.")


class SalidaIAResumenSemanal(BaseModel):
    """Esquema estricto para validar el JSON crudo devuelto por el proveedor de IA en el resumen."""

    resumen_ejecutivo: str = Field(..., min_length=10)
    productos_destacados: list[str] = Field(default_factory=list)
    sugerencias_rotacion: list[SugerenciaRotacionItem] = Field(default_factory=list)
    alertas_costos: list[str] = Field(default_factory=list)


class RespuestaResumenSemanal(BaseModel):
    """Respuesta completa del endpoint POST /v1/resumen-semanal."""

    resumen_ejecutivo: str = Field(..., description="Síntesis en español del desempeño semanal del negocio.")
    productos_destacados: list[str] = Field(
        default_factory=list,
        description="Productos con mejor desempeño en volumen o contribución.",
    )
    sugerencias_rotacion: list[SugerenciaRotacionItem] = Field(
        default_factory=list,
        description="Recomendaciones de ajuste de carta, promociones o precios.",
    )
    alertas_costos: list[str] = Field(
        default_factory=list,
        description="Advertencias sobre márgenes comprimidos o costos de insumos.",
    )
    version_prompt: str = Field(..., description="Versión del prompt utilizada.")
    proveedor_ia: str = Field(..., description="Proveedor de IA que generó el análisis.")
    latencia_ms: int = Field(..., ge=0, description="Tiempo de procesamiento en milisegundos.")
    contingencia: bool = Field(
        default=False,
        description="True si se devolvió una respuesta de contingencia por indisponibilidad de la IA.",
    )
    mensaje_contingencia: Optional[str] = Field(
        default=None,
        description="Detalle de contingencia cuando el servicio de IA no pudo responder.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "resumen_ejecutivo": (
                    "Durante la semana del 2026-10-20 al 2026-10-27 se registraron 215 tickets por un total "
                    "de $685000.00 y una ganancia bruta de $412000.00. El Café Latte Mediano lideró la "
                    "contribución con 65.00% de margen."
                ),
                "productos_destacados": ["Café Latte Mediano"],
                "sugerencias_rotacion": [
                    {
                        "producto": "Tostado de Jamón y Queso",
                        "accion_sugerida": "Revisar costo de insumos o ajustar precio sugerido",
                        "motivo": "Presenta buen volumen (45 unidades) pero un margen bruto menor (45.00%).",
                    }
                ],
                "alertas_costos": ["Atención: Leche entera subió un 12% en la última compra."],
                "version_prompt": "v1",
                "proveedor_ia": "gemini",
                "latencia_ms": 920,
                "contingencia": False,
                "mensaje_contingencia": None,
            }
        }
    )
