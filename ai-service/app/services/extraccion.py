"""Servicio de negocio para extracción de precios de proveedores (HU7)."""

import asyncio
import json
import time
from decimal import Decimal
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
    "No se pudo usar la IA, revisá la configuración. "
    "Por favor, realizá la carga de precios de forma manual o mediante importación CSV."
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


def construir_instrucciones_extraccion(version_prompt: str, tiene_imagen: bool) -> str:
    """Carga el prompt versionado y agrega las pautas específicas cuando se procesa una foto."""
    instrucciones = cargar_prompt("extraer_precios", version_prompt)
    if tiene_imagen:
        instrucciones = (
            f"{instrucciones}\n\n"
            "Nota: El contenido de la lista de precios viene en una foto adjunta; "
            "extraé los ítems y precios visibles en la imagen separando siempre "
            "nombre_insumo, cantidad y unidad (no incluyas la cantidad ni la unidad "
            "dentro de nombre_insumo, ej.: 'Café en grano 5 kg' -> nombre_insumo: "
            "'Café en grano', cantidad: '5', unidad: 'kg')."
        )
    return instrucciones


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
    tiene_imagen = bool(solicitud.imagen_base64)

    try:
        instrucciones_sistema = construir_instrucciones_extraccion(
            solicitud.version_prompt,
            tiene_imagen=tiene_imagen,
        )
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
    payload_usuario: dict[str, Optional[str]] = {
        "proveedor_informado": solicitud.proveedor_nombre,
    }
    if solicitud.texto_lista:
        payload_usuario["texto_lista_precios"] = solicitud.texto_lista
    datos_usuario = json.dumps(payload_usuario, ensure_ascii=False)

    timeout = config.timeout_segundos * 2 if tiene_imagen else config.timeout_segundos
    max_reintentos = config.max_reintentos
    ultimo_error = "Error desconocido al consultar el proveedor de IA."

    for _intento in range(max_reintentos + 1):
        try:
            llamada_ia = (
                proveedor.generar_json_con_imagen(
                    instrucciones_sistema=instrucciones_sistema,
                    datos_usuario=datos_usuario,
                    imagen_base64=solicitud.imagen_base64 or "",
                    imagen_mime=solicitud.imagen_mime or "image/jpeg",
                    timeout=timeout,
                )
                if tiene_imagen
                else proveedor.generar_json(
                    instrucciones_sistema=instrucciones_sistema,
                    datos_usuario=datos_usuario,
                    timeout=timeout,
                )
            )
            salida_cruda = await asyncio.wait_for(
                llamada_ia,
                timeout=timeout,
            )
            salida_validada = SalidaIAExtraccionPrecios.model_validate(salida_cruda)
            es_contingencia = bool(salida_cruda.get("contingencia", False))
            latencia_ms = int((time.perf_counter() - inicio) * 1000)

            return RespuestaExtraccionPrecios(
                proveedor_detectado=(
                    salida_validada.proveedor_detectado or solicitud.proveedor_nombre
                ),
                envio_detectado=salida_validada.envio_detectado,
                moneda=salida_validada.moneda,
                items=salida_validada.items,
                advertencias=(
                    salida_validada.advertencias
                    if salida_validada.advertencias
                    else (
                        ["El proveedor de IA entró en modo contingencia."]
                        if es_contingencia
                        else []
                    )
                ),
                version_prompt=solicitud.version_prompt,
                proveedor_ia="contingencia" if es_contingencia else nombre_proveedor,
                latencia_ms=max(0, latencia_ms),
                contingencia=es_contingencia,
                mensaje_contingencia=(MENSAJE_CONTINGENCIA_EXTRACCION if es_contingencia else None),
            )
        except asyncio.TimeoutError:
            ultimo_error = (
                f"Tiempo de espera agotado ({timeout}s) al invocar a '{nombre_proveedor}'."
            )
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
