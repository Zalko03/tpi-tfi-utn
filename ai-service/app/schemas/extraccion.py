"""Esquemas Pydantic v2 para la extracción de precios desde listas de proveedores (HU7)."""

import base64
import binascii
from decimal import Decimal
from typing import Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationInfo,
    field_validator,
    model_validator,
)

MIMES_IMAGEN_PERMITIDOS = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGEN_BASE64_CHARS = 7 * 1024 * 1024
MAX_IMAGEN_BYTES = 5 * 1024 * 1024

UNIDADES_PERMITIDAS = {
    "g",
    "kg",
    "mg",
    "ml",
    "cc",
    "l",
    "litro",
    "lt",
    "kilo",
    "un",
    "u",
    "unidad",
    "docena",
}
MAPEO_NORMALIZACION_UNIDADES = {
    "kilo": "kg",
    "litro": "l",
    "lt": "l",
    "u": "un",
    "unidad": "un",
}


class SolicitudExtraccionPrecios(BaseModel):
    """Entrada con el texto desestructurado o foto de la lista de precios del proveedor."""

    imagen_base64: Optional[str] = Field(
        default=None,
        max_length=MAX_IMAGEN_BASE64_CHARS,
        description="Imagen de la lista de precios codificada en base64 sin prefijo data:.",
    )
    imagen_mime: Optional[str] = Field(
        default=None,
        description="Tipo MIME de la imagen ('image/jpeg', 'image/png', 'image/webp').",
    )
    texto_lista: Optional[str] = Field(
        default=None,
        max_length=15000,
        description="Texto crudo pegado de la lista de precios del proveedor (WhatsApp, PDF, texto).",
    )
    proveedor_nombre: Optional[str] = Field(
        default=None,
        max_length=150,
        description="Nombre opcional del proveedor indicado por el usuario.",
    )
    version_prompt: str = Field(
        default="v1",
        pattern=r"^v\d+$",
        description="Versión del prompt a utilizar (por defecto 'v1').",
    )
    origen_archivo: Optional[str] = Field(
        default=None,
        max_length=20,
        description="Origen opcional del contenido ('texto', 'csv', 'pdf', 'imagen').",
    )

    @field_validator("imagen_base64")
    @classmethod
    def validar_imagen_base64(cls, valor: Optional[str]) -> Optional[str]:
        if valor is None:
            return None
        limpio = valor.strip()
        if not limpio:
            raise ValueError("La imagen en base64 no puede estar vacía.")
        if limpio.startswith("data:"):
            raise ValueError("La imagen debe enviarse en base64 sin prefijo data:.")
        if len(limpio) > MAX_IMAGEN_BASE64_CHARS:
            raise ValueError("La imagen supera el tamaño máximo permitido de 7 MB en base64.")
        try:
            decodificada = base64.b64decode(limpio, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("La imagen no tiene un formato base64 válido.") from exc
        if len(decodificada) == 0:
            raise ValueError("La imagen decodificada no puede estar vacía.")
        if len(decodificada) > MAX_IMAGEN_BYTES:
            raise ValueError("La imagen supera el tamaño máximo permitido de 5 MB.")
        return limpio

    @field_validator("imagen_mime")
    @classmethod
    def validar_imagen_mime(cls, valor: Optional[str]) -> Optional[str]:
        if valor is None:
            return None
        normalizado = valor.strip().lower()
        if normalizado not in MIMES_IMAGEN_PERMITIDOS:
            raise ValueError("El tipo de imagen debe ser image/jpeg, image/png o image/webp.")
        return normalizado

    @field_validator("texto_lista")
    @classmethod
    def validar_texto_no_vacio(cls, valor: Optional[str], info: ValidationInfo) -> Optional[str]:
        if valor is None:
            return None
        limpio = valor.strip()
        if not limpio:
            if info.data.get("imagen_base64"):
                return None
            raise ValueError("El texto de la lista de precios no puede estar vacío.")
        if limpio.startswith("%PDF-"):
            raise ValueError("El texto recibido corresponde a un PDF binario sin extraer texto.")
        if len(limpio) < 3:
            raise ValueError("El texto de la lista de precios debe tener al menos 3 caracteres.")
        return limpio

    @model_validator(mode="after")
    def validar_texto_o_imagen(self) -> "SolicitudExtraccionPrecios":
        if self.imagen_base64 and not self.imagen_mime:
            raise ValueError("Tenés que indicar imagen_mime cuando enviás una imagen.")
        if self.imagen_mime and not self.imagen_base64:
            raise ValueError("Tenés que enviar imagen_base64 cuando indicás imagen_mime.")
        if self.origen_archivo == "imagen" and not self.imagen_base64:
            raise ValueError("Si origen_archivo es 'imagen' tenés que enviar imagen_base64.")
        if not self.texto_lista and not self.imagen_base64:
            raise ValueError("Tenés que enviar el texto de la lista o una imagen.")
        return self

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "texto_lista": (
                    "Lista Mayorista Del Litoral - Octubre:\n"
                    "- Café tostado en grano bolsa 1 kg: $18500 (IVA 21% incluido)\n"
                    "- Leche entera larga vida pack 12x1 l: $14400\n"
                    "- Vasos térmicos descartables x 100 un: $8200\n"
                    "Envío a domicilio: $3500"
                ),
                "proveedor_nombre": "Mayorista Del Litoral",
                "version_prompt": "v1",
            }
        }
    )


class ItemPrecioExtraido(BaseModel):
    """Representa una línea de insumo y precio normalizada y validada desde el texto."""

    nombre_insumo: str = Field(
        ...,
        min_length=1,
        max_length=150,
        description="Nombre normalizado del insumo detectado.",
    )
    cantidad: Decimal = Field(
        ...,
        gt=Decimal("0"),
        description="Cantidad total del pack o presentación adquirida (mayor a cero).",
    )
    unidad: str = Field(
        ...,
        description="Unidad de medida normalizada ('g', 'kg', 'mg', 'ml', 'cc', 'l', 'un', 'docena').",
    )
    precio_total: Decimal = Field(
        ...,
        gt=Decimal("0"),
        description="Precio total de la presentación o pack en moneda local (Decimal, nunca float).",
    )
    iva_incluido: bool = Field(
        default=True,
        description="Indica si el precio informado incluye IVA.",
    )
    alicuota: Decimal = Field(
        default=Decimal("21.00"),
        ge=Decimal("0"),
        le=Decimal("100"),
        description="Alícuota de IVA aplicable en porcentaje (ej. 21.00, 10.50, 27.00, 0.00).",
    )
    confianza: Decimal = Field(
        default=Decimal("1.00"),
        ge=Decimal("0.00"),
        le=Decimal("1.00"),
        description="Nivel de confianza de la extracción entre 0.00 y 1.00.",
    )
    texto_original: Optional[str] = Field(
        default=None,
        description="Fragmento del texto original del cual se extrajo el ítem.",
    )

    @field_validator("nombre_insumo")
    @classmethod
    def limpiar_nombre_insumo(cls, valor: str) -> str:
        limpio = valor.strip()
        if not limpio:
            raise ValueError("El nombre del insumo no puede estar vacío.")
        return limpio

    @field_validator("unidad")
    @classmethod
    def validar_y_normalizar_unidad(cls, valor: str) -> str:
        normalizada = valor.strip().lower()
        if normalizada not in UNIDADES_PERMITIDAS:
            raise ValueError(
                f"Unidad '{valor}' no válida. Debe ser una de: g, kg, mg, ml, cc, l, un, docena."
            )
        return MAPEO_NORMALIZACION_UNIDADES.get(normalizada, normalizada)


class SalidaIAExtraccionPrecios(BaseModel):
    """Esquema estricto para validar el JSON crudo emitido por el proveedor de IA."""

    proveedor_detectado: Optional[str] = Field(default=None)
    envio_detectado: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0"))
    moneda: str = Field(default="ARS", min_length=3, max_length=5)
    items: list[ItemPrecioExtraido] = Field(default_factory=list)
    advertencias: list[str] = Field(default_factory=list)


class RespuestaExtraccionPrecios(BaseModel):
    """Respuesta completa del endpoint POST /v1/extraer-precios."""

    proveedor_detectado: Optional[str] = Field(
        default=None,
        description="Nombre del proveedor inferido o informado.",
    )
    envio_detectado: Decimal = Field(
        default=Decimal("0.00"),
        ge=Decimal("0"),
        description="Costo de envío global detectado en la lista.",
    )
    moneda: str = Field(
        default="ARS",
        description="Código de moneda de los importes extraídos.",
    )
    items: list[ItemPrecioExtraido] = Field(
        default_factory=list,
        description="Lista de insumos y precios validados.",
    )
    advertencias: list[str] = Field(
        default_factory=list,
        description="Observaciones sobre líneas dudosas o descartadas.",
    )
    version_prompt: str = Field(
        ...,
        description="Versión del prompt utilizada en la ejecución.",
    )
    proveedor_ia: str = Field(
        ...,
        description="Proveedor de IA que procesó la solicitud ('gemini', 'ollama', 'contingencia').",
    )
    latencia_ms: int = Field(
        ...,
        ge=0,
        description="Tiempo total de procesamiento en milisegundos.",
    )
    contingencia: bool = Field(
        default=False,
        description="True si el proveedor de IA falló o devolvió datos inválidos y se activó la degradación.",
    )
    mensaje_contingencia: Optional[str] = Field(
        default=None,
        description="Explicación legible para el usuario cuando contingencia es True.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "proveedor_detectado": "Mayorista Del Litoral",
                "envio_detectado": "3500.00",
                "moneda": "ARS",
                "items": [
                    {
                        "nombre_insumo": "Café tostado en grano",
                        "cantidad": "1",
                        "unidad": "kg",
                        "precio_total": "18500.00",
                        "iva_incluido": True,
                        "alicuota": "21.00",
                        "confianza": "0.98",
                        "texto_original": "- Café tostado en grano bolsa 1 kg: $18500 (IVA 21% incluido)",
                    },
                    {
                        "nombre_insumo": "Leche entera larga vida",
                        "cantidad": "12",
                        "unidad": "l",
                        "precio_total": "14400.00",
                        "iva_incluido": True,
                        "alicuota": "21.00",
                        "confianza": "0.95",
                        "texto_original": "- Leche entera larga vida pack 12x1 l: $14400",
                    },
                ],
                "advertencias": [],
                "version_prompt": "v1",
                "proveedor_ia": "gemini",
                "latencia_ms": 840,
                "contingencia": False,
                "mensaje_contingencia": None,
            }
        }
    )
