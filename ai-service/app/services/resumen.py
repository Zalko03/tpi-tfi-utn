"""Servicio de negocio para generación de resumen semanal con IA (HU13)."""
import asyncio
import json
import time
from typing import Optional
from pydantic import ValidationError
from app.config import config
from app.schemas.resumen import (
    RespuestaResumenSemanal,
    SalidaIAResumenSemanal,
    SolicitudResumenSemanal,
)
from app.services.prompts import cargar_prompt
from app.services.proveedor_ia import ErrorProveedorIA, ProveedorIA, obtener_proveedor_ia

MENSAJE_CONTINGENCIA_RESUMEN = (
    "El proveedor de IA no se encuentra disponible en este momento. "
    "Las métricas de ventas y costos siguen operativas en el tablero principal."
)


def construir_respuesta_contingencia_resumen(
    solicitud: SolicitudResumenSemanal,
    proveedor_ia: str,
    latencia_ms: int,
    motivo: str,
) -> RespuestaResumenSemanal:
    """Construye un resumen determinístico de contingencia sin interrumpir la operación."""
    productos_ordenados = sorted(
        solicitud.productos,
        key=lambda p: p.unidades_vendidas,
        reverse=True,
    )
    destacados = [p.nombre for p in productos_ordenados[:3] if p.unidades_vendidas > 0]
    resumen_fallback = (
        f"Resumen de contingencia ({solicitud.fecha_desde} a {solicitud.fecha_hasta}): "
        f"Se registraron {solicitud.cantidad_tickets} tickets por un total de "
        f"${solicitud.total_ventas} y una ganancia bruta de ${solicitud.ganancia_bruta_total}."
    )
    return RespuestaResumenSemanal(
        resumen_ejecutivo=resumen_fallback,
        productos_destacados=destacados,
        sugerencias_rotacion=[],
        alertas_costos=list(solicitud.alertas_insumos) + [f"Aviso técnico: {motivo}"],
        version_prompt=solicitud.version_prompt,
        proveedor_ia=proveedor_ia,
        latencia_ms=max(0, latencia_ms),
        contingencia=True,
        mensaje_contingencia=MENSAJE_CONTINGENCIA_RESUMEN,
    )


async def generar_resumen_semanal(
    solicitud: SolicitudResumenSemanal,
    adaptador: Optional[ProveedorIA] = None,
) -> RespuestaResumenSemanal:
    """
    Orquesta la generación del resumen semanal:
    1. Carga el prompt versionado.
    2. Serializa las métricas como datos estructurados separados de las instrucciones.
    3. Invoca al adaptador con timeout y reintentos acotados.
    4. Valida con Pydantic v2 o devuelve el resumen de contingencia.
    """
    inicio = time.perf_counter()
    nombre_proveedor = adaptador.nombre if adaptador else config.proveedor_activo

    try:
        instrucciones_sistema = cargar_prompt("resumen_semanal", solicitud.version_prompt)
    except (FileNotFoundError, ValueError) as exc:
        latencia_ms = int((time.perf_counter() - inicio) * 1000)
        return construir_respuesta_contingencia_resumen(
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
        return construir_respuesta_contingencia_resumen(
            solicitud=solicitud,
            proveedor_ia=nombre_proveedor,
            latencia_ms=latencia_ms,
            motivo=str(exc),
        )

    datos_usuario = json.dumps(
        solicitud.model_dump(mode="json", exclude={"version_prompt"}),
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
            salida_validada = SalidaIAResumenSemanal.model_validate(salida_cruda)
            latencia_ms = int((time.perf_counter() - inicio) * 1000)

            return RespuestaResumenSemanal(
                resumen_ejecutivo=salida_validada.resumen_ejecutivo,
                productos_destacados=salida_validada.productos_destacados,
                sugerencias_rotacion=salida_validada.sugerencias_rotacion,
                alertas_costos=salida_validada.alertas_costos,
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
    return construir_respuesta_contingencia_resumen(
        solicitud=solicitud,
        proveedor_ia=nombre_proveedor,
        latencia_ms=latencia_ms,
        motivo=ultimo_error,
    )
