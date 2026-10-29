"""Servicio de negocio para extracción de precios de proveedores (HU7)."""
import asyncio
from decimal import Decimal
import json
import time
from typing import Optional
from pydantic import ValidationError
from app.config import config
from app.schemas.extraccion import (
    RespuestaExtraccionPrecios,
    SalidaIAExtraccionPrecios,
    SolicitudExtraccionPrecios,
)
from app.services.prompts import cargar_prompt
from app.services.proveedor_ia import ErrorProveedorIA, ProveedorIA, obtener_proveedor_ia

MENSAJE_CONTINGENCIA_EXTRACCION = (
    "El servicio de IA no se encuentra disponible o devolvió un formato no válido. "
    "Por favor, realice la carga de precios de forma manual o mediante importación CSV."
)


def construir_respuesta_contingencia_extraccion(
    solicitud: SolicitudExtraccionPrecios,
    proveedor_ia: str,
    latencia_ms: int,
    motivo: str,
) -> RespuestaExtraccionPrecios:
    """Construye la respuesta degradada segura cuando el proveedor de IA falla o no valida."""
    return RespuestaExtraccionPrecios(
        proveedor_detectado=solicitud.proveedor_nombre,
        envio_detectado=Decimal("0.00"),
        moneda="ARS",
        items=[],
        advertencias=[motivo],
        version_prompt=solicitud.version_prompt,
        proveedor_ia=proveedor_ia,
        latencia_ms=max(0, latencia_ms),
        contingencia=True,
        mensaje_contingencia=MENSAJE_CONTINGENCIA_EXTRACCION,
    )


async def extraer_precios_de_lista(
    solicitud: SolicitudExtraccionPrecios,
    adaptador: Optional[ProveedorIA] = None,
) -> RespuestaExtraccionPrecios:
    """
    Orquesta la extracción de precios:
    1. Carga el prompt versionado.
    2. Empaqueta el texto del usuario estrictamente como datos (sin concatenar en el prompt).
    3. Invoca al adaptador con timeout y reintentos acotados.
    4. Valida la salida con Pydantic v2 o devuelve la respuesta de contingencia.
    """
    inicio = time.perf_counter()
    nombre_proveedor = adaptador.nombre if adaptador else config.proveedor_activo

    try:
        instrucciones_sistema = cargar_prompt("extraer_precios", solicitud.version_prompt)
    except (FileNotFoundError, ValueError) as exc:
        latencia_ms = int((time.perf_counter() - inicio) * 1000)
        return construir_respuesta_contingencia_extraccion(
            solicitud=solicitud,
            proveedor_ia=nombre_proveedor,
            latencia_ms=latencia_ms,
            motivo=str(exc),
        )

    try:
        proveedor = adaptador or obtener_proveedor_ia()
        nombre_proveedor = proveedor.nombre
    except ErrorProveedorIA as exc:
        latencia_ms = int((time.perf_counter() - inicio) * 1000)
        return construir_respuesta_contingencia_extraccion(
            solicitud=solicitud,
            proveedor_ia=nombre_proveedor,
            latencia_ms=latencia_ms,
            motivo=str(exc),
        )

    # El texto del usuario se pasa como un objeto de datos estructurado independiente
    datos_usuario = json.dumps(
        {
            "proveedor_informado": solicitud.proveedor_nombre,
            "texto_lista_precios": solicitud.texto_lista,
        },
        ensure_ascii=False,
    )

    timeout = config.timeout_segundos
    max_reintentos = config.max_reintentos
    ultimo_error = "Error desconocido al consultar el proveedor de IA."

    for _intento in range(max_reintentos + 1):
        try:
            salida_cruda = await asyncio.wait_for(
                proveedor.generar_json(
                    instrucciones_sistema=instrucciones_sistema,
                    datos_usuario=datos_usuario,
                    timeout=timeout,
                ),
                timeout=timeout,
            )
            salida_validada = SalidaIAExtraccionPrecios.model_validate(salida_cruda)
            latencia_ms = int((time.perf_counter() - inicio) * 1000)

            return RespuestaExtraccionPrecios(
                proveedor_detectado=(
                    salida_validada.proveedor_detectado or solicitud.proveedor_nombre
                ),
                envio_detectado=salida_validada.envio_detectado,
                moneda=salida_validada.moneda,
                items=salida_validada.items,
                advertencias=salida_validada.advertencias,
                version_prompt=solicitud.version_prompt,
                proveedor_ia=nombre_proveedor,
                latencia_ms=max(0, latencia_ms),
                contingencia=False,
                mensaje_contingencia=None,
            )
        except asyncio.TimeoutError:
            ultimo_error = f"Tiempo de espera agotado ({timeout}s) al invocar a '{nombre_proveedor}'."
        except ValidationError as exc:
            ultimo_error = (
                f"La respuesta de '{nombre_proveedor}' no superó la validación de esquema Pydantic: "
                f"{exc.error_count()} error(es)."
            )
        except ErrorProveedorIA as exc:
            ultimo_error = str(exc)
        except Exception:
            ultimo_error = f"Error inesperado en el adaptador '{nombre_proveedor}'."

    latencia_ms = int((time.perf_counter() - inicio) * 1000)
    return construir_respuesta_contingencia_extraccion(
        solicitud=solicitud,
        proveedor_ia=nombre_proveedor,
        latencia_ms=latencia_ms,
        motivo=ultimo_error,
    )
