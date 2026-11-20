"""
Ensayo automático E2E del flujo de demostración (T10).

Recorre contra servidores locales ya levantados los pasos del guion de video
(docs/PRESENTACION_Y_EVIDENCIAS.md y T6): login por rol, costeo de producto,
turno de caja, cobro POS, anulación de venta, cierre con arqueo ciego,
reportes de los últimos 7 días y carta digital pública.
"""

from __future__ import annotations

import argparse
import http.client
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

ZONA_ARGENTINA = ZoneInfo("America/Argentina/Buenos_Aires")
URL_DJANGO_POR_DEFECTO = "http://localhost:8000"
URL_NODE_POR_DEFECTO = "http://localhost:3000"
_URLOPEN_ORIGINAL = urllib.request.urlopen


class ErrorPasoEnsayo(RuntimeError):
    """Error controlado durante la ejecución de un paso del ensayo."""


@dataclass
class ResultadoPaso:
    """Resultado individual de un paso del flujo de demostración."""

    numero: int
    nombre: str
    ok: bool
    detalle: str


class _SinRedirecciones(urllib.request.HTTPRedirectHandler):
    """Evita seguir redirecciones 3xx automáticamente para no degradar POST a GET."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, msg, headers, fp)


class ClienteApi:
    """Cliente HTTP mínimo sobre stdlib para interactuar con Django y Node."""

    def __init__(self, timeout_segundos: float = 10.0) -> None:
        self.timeout_segundos = timeout_segundos
        self.peticiones_node_anon = 0
        self.peticiones_node_auth = 0
        self._opener = urllib.request.build_opener(_SinRedirecciones())

    def peticion_json(
        self,
        metodo: str,
        url: str,
        cuerpo: dict | None = None,
        token: str | None = None,
        estados_esperados: tuple[int, ...] = (200,),
        es_node: bool = False,
    ) -> tuple[int, dict | list]:
        """Ejecuta una petición JSON y valida el código HTTP esperado."""
        estado, texto = self.peticion_texto(
            metodo=metodo,
            url=url,
            cuerpo=cuerpo,
            token=token,
            estados_esperados=estados_esperados,
            es_node=es_node,
        )
        try:
            datos = json.loads(texto) if texto else {}
        except json.JSONDecodeError as exc:
            raise ErrorPasoEnsayo(
                f"{metodo} {url} devolvió respuesta no JSON (HTTP {estado})."
            ) from exc
        return estado, datos

    def peticion_texto(
        self,
        metodo: str,
        url: str,
        cuerpo: dict | None = None,
        token: str | None = None,
        estados_esperados: tuple[int, ...] = (200,),
        es_node: bool = False,
    ) -> tuple[int, str]:
        """Ejecuta una petición HTTP y retorna (status, body_text)."""
        cabeceras = {"Accept": "application/json, text/html;q=0.9"}
        data_bytes = None
        if cuerpo is not None:
            cabeceras["Content-Type"] = "application/json"
            data_bytes = json.dumps(cuerpo).encode("utf-8")
        if token:
            cabeceras["Authorization"] = f"Bearer {token}"

        if es_node:
            if token:
                self.peticiones_node_auth += 1
            else:
                self.peticiones_node_anon += 1

        try:
            req = urllib.request.Request(
                url=url,
                data=data_bytes,
                headers=cabeceras,
                method=metodo.upper(),
            )
            if urllib.request.urlopen is _URLOPEN_ORIGINAL:
                resp_cm = self._opener.open(req, timeout=self.timeout_segundos)
            else:
                resp_cm = urllib.request.urlopen(req, timeout=self.timeout_segundos)
            with resp_cm as resp:
                estado = resp.status
                texto = resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            estado = exc.code
            try:
                texto = exc.read().decode("utf-8", errors="replace")
            except (TimeoutError, http.client.HTTPException, OSError):
                texto = ""
        except urllib.error.URLError as exc:
            raise ErrorPasoEnsayo(f"No se pudo conectar con {url}: {exc.reason}") from exc
        except (TimeoutError, http.client.HTTPException, OSError, ValueError) as exc:
            raise ErrorPasoEnsayo(
                f"Error de transporte o tiempo de espera en {metodo.upper()} {url}: {exc}"
            ) from exc

        if estado not in estados_esperados:
            resumen = _extraer_mensaje_error(texto)
            raise ErrorPasoEnsayo(
                f"{metodo} {url} respondió HTTP {estado} (esperado {estados_esperados}): {resumen}"
            )
        return estado, texto


def _extraer_mensaje_error(texto: str) -> str:
    """Extrae el mensaje de error siguiendo docs/api-errores.md sin volcar datos sensibles."""
    try:
        data = json.loads(texto)
        if isinstance(data, dict) and "mensaje" in data:
            return str(data["mensaje"])
    except json.JSONDecodeError:
        pass
    limpio = " ".join(texto.split())
    return limpio[:180] if limpio else "sin detalle"


def _a_decimal(valor: object, nombre_campo: str) -> Decimal:
    """Convierte un valor de respuesta a Decimal de forma segura."""
    try:
        return Decimal(str(valor))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ErrorPasoEnsayo(
            f"El campo '{nombre_campo}' no tiene un formato numérico válido."
        ) from exc


def _validar_url_http(
    valor: str | None,
    nombre_variable: str,
    por_defecto: str,
    permitir_por_defecto: bool = False,
) -> str:
    """Valida que la URL base esté definida (o confirmada), use http/https y tenga host válido."""
    if valor is None or valor.strip() == "":
        if not permitir_por_defecto:
            raise ErrorPasoEnsayo(
                f"Falta definir {nombre_variable}. Para no mutar por accidente la base real "
                "backend-django/db.sqlite3, indicá explícitamente DJANGO_URL y NODE_URL "
                "(por ejemplo hacia servidores de prueba aislados) o pasá --confirmo-base-real "
                "si querés usar los valores por defecto (http://localhost:8000 y http://localhost:3000)."
            )
        return por_defecto

    candidata = valor.strip()
    try:
        partes = urllib.parse.urlsplit(candidata)
        puerto = partes.port
    except ValueError as exc:
        raise ErrorPasoEnsayo(
            f"{nombre_variable} inválida ('{valor}'): URL malformada ({exc})."
        ) from exc

    if partes.scheme not in {"http", "https"} or not bool(partes.netloc) or not partes.hostname:
        raise ErrorPasoEnsayo(
            f"{nombre_variable} inválida ('{valor}'): debe usar http:// o https:// con un host válido."
        )
    if puerto is not None and puerto <= 0:
        raise ErrorPasoEnsayo(f"{nombre_variable} inválida ('{valor}'): puerto inválido.")
    return candidata.rstrip("/")


def _validar_politica_node(valor: str | None) -> str:
    """Valida que VERIFICAR_NODE sea explícitamente 'auto', '1' o '0'."""
    if valor is None or valor == "":
        return "auto"

    politica = valor.strip().lower()
    if politica not in {"auto", "1", "0"}:
        raise ErrorPasoEnsayo(
            f"VERIFICAR_NODE inválido ('{valor}'): valores permitidos: auto, 1 o 0."
        )
    return politica


def _obtener_credenciales() -> tuple[str, str]:
    """Lee contraseñas desde variables de entorno sin escribir secretos en código."""
    clave_compartida = os.environ.get("SEED_DEMO_PASSWORD", "").strip()
    clave_duenio = os.environ.get("DEMO_DUENIO_PASSWORD", "").strip() or clave_compartida
    clave_cajero = os.environ.get("DEMO_CAJERO_PASSWORD", "").strip() or clave_compartida
    if not clave_duenio or not clave_cajero:
        raise ErrorPasoEnsayo(
            "Faltan las contraseñas en variables de entorno. Definí "
            "SEED_DEMO_PASSWORD (o DEMO_DUENIO_PASSWORD y DEMO_CAJERO_PASSWORD) "
            "antes de correr el ensayo."
        )
    return clave_duenio, clave_cajero


def _paso_login(
    cliente: ClienteApi,
    django_url: str,
    clave_duenio: str,
    clave_cajero: str,
) -> tuple[str, str]:
    """Paso 1: Login JWT RS256 de duenio_demo y cajero_demo (2 peticiones en total)."""
    _, data_duenio = cliente.peticion_json(
        "POST",
        f"{django_url}/api/auth/token/",
        cuerpo={"username": "duenio_demo", "password": clave_duenio},
        estados_esperados=(200,),
    )
    token_duenio = data_duenio.get("access")
    usuario_duenio = data_duenio.get("usuario") or {}
    if not token_duenio or usuario_duenio.get("rol") != "DUENIO":
        raise ErrorPasoEnsayo("El login de duenio_demo no devolvió rol DUENIO y token.")
    permisos_duenio = set(usuario_duenio.get("permisos") or [])
    for perm in ("recetas.ver_costos", "ventas.anular_ticket", "reportes.ver_financieros"):
        if perm not in permisos_duenio:
            raise ErrorPasoEnsayo(f"Al usuario duenio_demo le falta el permiso '{perm}'.")

    _, data_cajero = cliente.peticion_json(
        "POST",
        f"{django_url}/api/auth/token/",
        cuerpo={"username": "cajero_demo", "password": clave_cajero},
        estados_esperados=(200,),
    )
    token_cajero = data_cajero.get("access")
    usuario_cajero = data_cajero.get("usuario") or {}
    if not token_cajero or usuario_cajero.get("rol") != "CAJERO":
        raise ErrorPasoEnsayo("El login de cajero_demo no devolvió rol CAJERO y token.")
    permisos_cajero = set(usuario_cajero.get("permisos") or [])
    if "ventas.cobrar_ticket" not in permisos_cajero:
        raise ErrorPasoEnsayo("Al usuario cajero_demo le falta 'ventas.cobrar_ticket'.")
    if "caja.ver_efectivo_esperado" in permisos_cajero:
        raise ErrorPasoEnsayo(
            "Violación de arqueo ciego: cajero_demo tiene 'caja.ver_efectivo_esperado'."
        )

    return str(token_duenio), str(token_cajero)


def _paso_costeo_producto(
    cliente: ClienteApi,
    django_url: str,
    node_url: str,
    verificar_node: bool,
    token_duenio: str,
) -> tuple[int, str]:
    """Paso 2: Consultar catálogo con costos y detalle de costeo de un producto."""
    _, lista = cliente.peticion_json(
        "GET",
        f"{django_url}/api/productos/?estado_activo=true&limite=50",
        token=token_duenio,
        estados_esperados=(200,),
    )
    productos = lista.get("datos") or []
    if not productos:
        raise ErrorPasoEnsayo("No hay productos activos cargados para revisar costeo.")

    elegido = next(
        (p for p in productos if "latte" in str(p.get("nombre", "")).lower()),
        productos[0],
    )
    prod_id = int(elegido["id"])
    prod_nombre = str(elegido["nombre"])

    _, detalle_costo = cliente.peticion_json(
        "GET",
        f"{django_url}/api/productos/{prod_id}/costo/",
        token=token_duenio,
        estados_esperados=(200,),
    )
    costo_total = _a_decimal(detalle_costo.get("costo_total_calculado"), "costo_total_calculado")
    if costo_total <= Decimal("0"):
        raise ErrorPasoEnsayo(
            f"El producto '{prod_nombre}' (#{prod_id}) tiene costo_total_calculado <= 0."
        )

    detalle_node = ""
    if verificar_node:
        _, snapshots_node = cliente.peticion_json(
            "GET",
            f"{node_url}/api/snapshots-costeo/?productoId={prod_id}&limite=5",
            token=token_duenio,
            estados_esperados=(200,),
            es_node=True,
        )
        if not isinstance(snapshots_node.get("datos"), list):
            raise ErrorPasoEnsayo(
                f"Node devolvió formato inválido en snapshots-costeo para producto #{prod_id}."
            )
        detalle_node = f" + Node snapshots OK ({len(snapshots_node['datos'])})"

    return prod_id, (
        f"'{prod_nombre}' (#{prod_id}): costo ${costo_total}, "
        f"margen {detalle_costo.get('margen_bruto')}{detalle_node}"
    )


def _paso_abrir_turno(
    cliente: ClienteApi,
    django_url: str,
    token_cajero: str,
) -> tuple[int, str]:
    """Paso 3: Reutilizar el turno abierto de cajero_demo o abrir uno nuevo."""
    _, turnos = cliente.peticion_json(
        "GET",
        f"{django_url}/api/turnos/?estado=ABIERTO",
        token=token_cajero,
        estados_esperados=(200,),
    )
    abiertos = turnos.get("datos") or []
    if abiertos:
        turno_id = int(abiertos[0]["id"])
        return turno_id, f"Turno #{turno_id} ya estaba abierto (reutilizado)"

    _, creado = cliente.peticion_json(
        "POST",
        f"{django_url}/api/turnos/",
        cuerpo={"efectivo_inicial": "10000.00"},
        token=token_cajero,
        estados_esperados=(201,),
    )
    turno_id = int(creado["id"])
    return turno_id, f"Turno #{turno_id} abierto con efectivo inicial $10000.00"


def _elegir_producto_pos(
    cliente: ClienteApi,
    django_url: str,
    token_cajero: str,
) -> tuple[int, str]:
    """Obtiene un producto activo visible en POS verificando que no exponga costos al cajero."""
    _, lista = cliente.peticion_json(
        "GET",
        f"{django_url}/api/productos/?estado_activo=true&limite=50",
        token=token_cajero,
        estados_esperados=(200,),
    )
    productos = lista.get("datos") or []
    if not productos:
        raise ErrorPasoEnsayo("No hay productos activos disponibles en POS.")

    elegido = next(
        (p for p in productos if "espresso" in str(p.get("nombre", "")).lower()),
        productos[0],
    )
    if elegido.get("costo_total_calculado") is not None:
        raise ErrorPasoEnsayo("El catálogo POS expuso 'costo_total_calculado' al rol CAJERO.")
    if _a_decimal(elegido.get("precio_venta"), "precio_venta") <= Decimal("0"):
        raise ErrorPasoEnsayo("El producto elegido en POS tiene precio_venta <= 0.")

    return int(elegido["id"]), str(elegido["nombre"])


def _paso_cobrar_venta(
    cliente: ClienteApi,
    django_url: str,
    token_cajero: str,
    turno_id: int,
    prod_id: int,
    prod_nombre: str,
) -> tuple[int, Decimal, str]:
    """Paso 4: Cobrar una venta en el turno abierto usando id_operacion único."""
    _, venta = cliente.peticion_json(
        "POST",
        f"{django_url}/api/ventas/",
        cuerpo={
            "turno_caja": turno_id,
            "medio_pago": "EFECTIVO",
            "origen": "propio",
            "id_operacion": str(uuid.uuid4()),
            "items": [{"producto_id": prod_id, "cantidad": "1"}],
        },
        token=token_cajero,
        estados_esperados=(201,),
    )
    if venta.get("estado") != "EMITIDA":
        raise ErrorPasoEnsayo(f"La venta #{venta.get('id')} no quedó en estado EMITIDA.")
    total = _a_decimal(venta.get("total"), "total")
    if total <= Decimal("0"):
        raise ErrorPasoEnsayo("La venta cobrada devolvió total <= 0.")
    venta_id = int(venta["id"])
    return venta_id, total, f"Venta #{venta_id} cobrada (1x {prod_nombre}, total ${total})"


def _paso_anular_otra_venta(
    cliente: ClienteApi,
    django_url: str,
    token_cajero: str,
    token_duenio: str,
    turno_id: int,
    prod_id: int,
    estado_limpieza: dict[str, int] | None = None,
) -> str:
    """Paso 5: Registrar una segunda venta de prueba en efectivo y anularla con permiso de dueño."""
    _, venta_temp = cliente.peticion_json(
        "POST",
        f"{django_url}/api/ventas/",
        cuerpo={
            "turno_caja": turno_id,
            "medio_pago": "EFECTIVO",
            "origen": "propio",
            "id_operacion": str(uuid.uuid4()),
            "items": [{"producto_id": prod_id, "cantidad": "1"}],
        },
        token=token_cajero,
        estados_esperados=(201,),
    )
    venta_id = int(venta_temp["id"])

    try:
        _, anulada = cliente.peticion_json(
            "POST",
            f"{django_url}/api/ventas/{venta_id}/anular/",
            cuerpo={"motivo": "Ensayo automático E2E: anulación de ticket de prueba"},
            token=token_duenio,
            estados_esperados=(200,),
        )
        if anulada.get("estado") != "ANULADA":
            raise ErrorPasoEnsayo(f"La venta #{venta_id} no quedó en estado ANULADA.")
    except (ErrorPasoEnsayo, KeyError, AttributeError, TypeError, ValueError) as exc:
        limpiada = False
        try:
            _, resp_limpieza = cliente.peticion_json(
                "POST",
                f"{django_url}/api/ventas/{venta_id}/anular/",
                cuerpo={"motivo": "Limpieza automática tras falla parcial en Paso 5"},
                token=token_duenio,
                estados_esperados=(200,),
            )
            limpiada = isinstance(resp_limpieza, dict) and resp_limpieza.get("estado") == "ANULADA"
        except (ErrorPasoEnsayo, KeyError, AttributeError, TypeError, ValueError):
            limpiada = False

        if estado_limpieza is not None:
            estado_limpieza["venta_huerfana_id"] = 0 if limpiada else venta_id
        sufijo = (
            f" (se anuló venta temporal #{venta_id} en limpieza)"
            if limpiada
            else f" (venta temporal #{venta_id} quedó sin anular; se evita cerrar el turno)"
        )
        if isinstance(exc, ErrorPasoEnsayo):
            raise ErrorPasoEnsayo(f"{exc}{sufijo}") from exc
        raise ErrorPasoEnsayo(
            f"Respuesta JSON inesperada al anular venta #{venta_id} "
            f"({type(exc).__name__}: {exc}){sufijo}"
        ) from exc
    return f"Venta #{venta_id} anulada correctamente por duenio_demo"


def _paso_cerrar_turno(
    cliente: ClienteApi,
    django_url: str,
    token_cajero: str,
    token_duenio: str,
    turno_id: int,
    total_venta_emitida: Decimal,
) -> str:
    """Paso 6: Cerrar el turno como cajero (arqueo ciego) y validar auditoría como dueño."""
    efectivo_declarado = f"{(Decimal('10000.00') + total_venta_emitida):.2f}"
    _, cierre = cliente.peticion_json(
        "POST",
        f"{django_url}/api/turnos/{turno_id}/cerrar/",
        cuerpo={"efectivo_contado": efectivo_declarado},
        token=token_cajero,
        estados_esperados=(200,),
    )
    if cierre.get("estado") != "CERRADO":
        raise ErrorPasoEnsayo(f"El turno #{turno_id} no quedó en estado CERRADO.")
    if cierre.get("efectivo_esperado") is not None or cierre.get("diferencia") is not None:
        raise ErrorPasoEnsayo(
            "Violación de arqueo ciego al cerrar turno: el cajero recibió esperado/diferencia."
        )

    _, turno_duenio = cliente.peticion_json(
        "GET",
        f"{django_url}/api/turnos/{turno_id}/",
        token=token_duenio,
        estados_esperados=(200,),
    )
    if turno_duenio.get("estado") != "CERRADO":
        raise ErrorPasoEnsayo("La vista de gerencia no refleja el turno como CERRADO.")
    if turno_duenio.get("efectivo_esperado") is None or turno_duenio.get("diferencia") is None:
        raise ErrorPasoEnsayo(
            "El dueño no recibió efectivo_esperado/diferencia al auditar el cierre."
        )

    efectivo_inicial = _a_decimal(turno_duenio.get("efectivo_inicial"), "efectivo_inicial")
    ventas_efectivo = _a_decimal(turno_duenio.get("ventas_efectivo_total"), "ventas_efectivo_total")
    efectivo_esperado = _a_decimal(turno_duenio.get("efectivo_esperado"), "efectivo_esperado")
    efectivo_contado = _a_decimal(turno_duenio.get("efectivo_contado"), "efectivo_contado")
    diferencia = _a_decimal(turno_duenio.get("diferencia"), "diferencia")

    movimientos = turno_duenio.get("movimientos") or []
    entradas = sum(
        (
            _a_decimal(m.get("monto"), "movimiento.monto")
            for m in movimientos
            if m.get("tipo") == "ENTRADA"
        ),
        Decimal("0.00"),
    )
    salidas = sum(
        (
            _a_decimal(m.get("monto"), "movimiento.monto")
            for m in movimientos
            if m.get("tipo") == "SALIDA"
        ),
        Decimal("0.00"),
    )
    esperado_calculado = efectivo_inicial + ventas_efectivo + entradas - salidas
    if efectivo_esperado != esperado_calculado:
        raise ErrorPasoEnsayo(
            f"Inconsistencia en efectivo_esperado del turno #{turno_id}: "
            f"reportado ${efectivo_esperado}, calculado ${esperado_calculado}."
        )
    if diferencia != efectivo_contado - efectivo_esperado:
        raise ErrorPasoEnsayo(
            f"Inconsistencia en diferencia de caja del turno #{turno_id}: "
            f"reportado ${diferencia}, esperado ${efectivo_contado - efectivo_esperado}."
        )
    if total_venta_emitida > Decimal("0") and ventas_efectivo < total_venta_emitida:
        raise ErrorPasoEnsayo(
            f"Las ventas en efectivo del turno #{turno_id} (${ventas_efectivo}) "
            f"son menores a la venta emitida (${total_venta_emitida})."
        )

    return (
        f"Turno #{turno_id} cerrado (arqueo ciego OK; esperado gerencia "
        f"${efectivo_esperado}, dif ${diferencia})"
    )


def _paso_reportes_ultimos_7_dias(
    cliente: ClienteApi,
    django_url: str,
    token_duenio: str,
    total_venta_emitida: Decimal,
) -> str:
    """Paso 7: Consultar reportes financieros, ranking, trazabilidad y punto de equilibrio."""
    hoy = datetime.now(ZONA_ARGENTINA).date()
    hace_6_dias = hoy - timedelta(days=6)
    query = urllib.parse.urlencode(
        {
            "fecha_desde": hace_6_dias.isoformat(),
            "fecha_hasta": hoy.isoformat(),
        }
    )

    _, ganancia = cliente.peticion_json(
        "GET",
        f"{django_url}/api/ventas/ganancia-diaria/?{query}",
        token=token_duenio,
        estados_esperados=(200,),
    )
    tickets = int(ganancia.get("cantidad_tickets", 0))
    ingresos = _a_decimal(ganancia.get("ingresos_totales"), "ingresos_totales")
    if tickets < 1 or ingresos <= Decimal("0"):
        raise ErrorPasoEnsayo(
            "El reporte ganancia-diaria de últimos 7 días no devolvió ventas emitidas."
        )
    if total_venta_emitida > Decimal("0") and ingresos < total_venta_emitida:
        raise ErrorPasoEnsayo(
            f"El neto de ganancia-diaria (${ingresos}) es menor a la venta emitida (${total_venta_emitida})."
        )

    _, ranking = cliente.peticion_json(
        "GET",
        f"{django_url}/api/ventas/ranking-productos/?{query}&limite=10",
        token=token_duenio,
        estados_esperados=(200,),
    )
    if not (ranking.get("mas_vendidos") or []):
        raise ErrorPasoEnsayo("El ranking de productos devolvió 'mas_vendidos' vacío.")

    _, por_prod = cliente.peticion_json(
        "GET",
        f"{django_url}/api/ventas/reporte-por-producto/?{query}",
        token=token_duenio,
        estados_esperados=(200,),
    )
    filas_prod = por_prod.get("datos") or []
    if not filas_prod:
        raise ErrorPasoEnsayo("El reporte por producto devolvió lista vacía.")
    suma_por_producto = sum(
        (_a_decimal(fila.get("ingresos_totales"), "ingresos_totales") for fila in filas_prod),
        Decimal("0.00"),
    )
    if abs(suma_por_producto - ingresos) > Decimal("0.01"):
        raise ErrorPasoEnsayo(
            f"Inconsistencia entre ganancia-diaria (${ingresos}) y suma por producto (${suma_por_producto})."
        )

    _, movs = cliente.peticion_json(
        "GET",
        f"{django_url}/api/insumos/movimientos/?{query}",
        token=token_duenio,
        estados_esperados=(200,),
    )
    if not isinstance(movs.get("datos"), list):
        raise ErrorPasoEnsayo("El reporte de movimientos teóricos de insumos no es una lista.")

    _, pe = cliente.peticion_json(
        "POST",
        f"{django_url}/api/ventas/punto-equilibrio/",
        cuerpo={
            "costos_fijos": "500000",
            "fecha_desde": hace_6_dias.isoformat(),
            "fecha_hasta": hoy.isoformat(),
        },
        token=token_duenio,
        estados_esperados=(200,),
    )
    if _a_decimal(pe.get("punto_equilibrio_mensual"), "punto_equilibrio_mensual") <= Decimal("0"):
        raise ErrorPasoEnsayo("El cálculo de punto de equilibrio devolvió monto <= 0.")

    return (
        f"Rango {hace_6_dias.isoformat()}..{hoy.isoformat()}: {tickets} tickets, "
        f"ingresos ${ingresos}, PE mensual ${pe.get('punto_equilibrio_mensual')}"
    )


def _paso_carta_publica(
    cliente: ClienteApi,
    django_url: str,
    node_url: str,
    verificar_node: bool,
) -> str:
    """Paso 8: Consultar carta digital pública anónima y salud/HTML en Node si aplica."""
    _, carta = cliente.peticion_json(
        "GET",
        f"{django_url}/api/carta-publica/",
        token=None,
        estados_esperados=(200,),
    )
    items = carta.get("datos") or []
    if not items:
        raise ErrorPasoEnsayo("La carta pública devolvió 0 productos activos.")

    claves_permitidas = {"id", "nombre", "precio_venta"}
    for item in items:
        claves = set(item.keys())
        if not claves.issubset(claves_permitidas) or "nombre" not in claves:
            raise ErrorPasoEnsayo(f"La carta pública expuso campos no permitidos: {sorted(claves)}")

    extra_node = ""
    if verificar_node:
        _, salud = cliente.peticion_json(
            "GET",
            f"{node_url}/health",
            token=None,
            estados_esperados=(200,),
            es_node=True,
        )
        if not isinstance(salud, dict):
            raise ErrorPasoEnsayo("El endpoint /health de Node no devolvió JSON válido.")
        _, html = cliente.peticion_texto(
            "GET",
            f"{node_url}/carta.html",
            token=None,
            estados_esperados=(200,),
            es_node=True,
        )
        if "carta" not in html.lower():
            raise ErrorPasoEnsayo("Node /carta.html no devolvió el HTML esperado.")
        extra_node = " + Node /health y /carta.html OK"

    return f"{len(items)} productos públicos sin costos expuestos{extra_node}"


def _node_disponible(cliente: ClienteApi, node_url: str) -> bool:
    """Comprueba con una única petición si Node está escuchando en NODE_URL."""
    try:
        cliente.peticion_texto(
            "GET",
            f"{node_url}/health",
            estados_esperados=(200,),
            es_node=True,
        )
        return True
    except ErrorPasoEnsayo:
        return False


def ejecutar_ensayo(
    django_url: str | None = None,
    node_url: str | None = None,
    modo_node: str | None = None,
    confirmo_base_real: bool = False,
) -> int:
    """Ejecuta el flujo completo e imprime el resumen con ✅ / ❌ por paso."""
    try:
        django_base = _validar_url_http(
            django_url if django_url is not None else os.environ.get("DJANGO_URL"),
            "DJANGO_URL",
            URL_DJANGO_POR_DEFECTO,
            permitir_por_defecto=confirmo_base_real,
        )
        node_base = _validar_url_http(
            node_url if node_url is not None else os.environ.get("NODE_URL"),
            "NODE_URL",
            URL_NODE_POR_DEFECTO,
            permitir_por_defecto=confirmo_base_real,
        )
        politica_node = _validar_politica_node(
            modo_node if modo_node is not None else os.environ.get("VERIFICAR_NODE")
        )
        clave_duenio, clave_cajero = _obtener_credenciales()
    except ErrorPasoEnsayo as exc:
        print(f"❌ Configuración inválida: {exc}")
        return 1

    print("=================================================================")
    print("  Sapori Stock — Ensayo automático del flujo demo (T10)")
    print("=================================================================")
    print(f"Django URL : {django_base}")
    print(f"Node URL   : {node_base} (modo VERIFICAR_NODE={politica_node})")
    print("Nota       : pensado para correr sobre base de prueba post-T7,")
    print("             NO contra backend-django/db.sqlite3 real.")
    print("")

    cliente = ClienteApi()
    resultados: list[ResultadoPaso] = []

    verificar_node = False
    if politica_node == "1":
        verificar_node = True
    elif politica_node == "auto":
        verificar_node = _node_disponible(cliente, node_base)
        if not verificar_node:
            print(
                f"⚠️  Node no responde en {node_base}; se omiten comprobaciones de Node "
                "(usá VERIFICAR_NODE=1 para exigirlas)."
            )
            print("")

    token_duenio = ""
    token_cajero = ""
    turno_id = 0
    prod_pos_id = 0
    prod_pos_nombre = ""
    total_venta_emitida = Decimal("0.00")

    def correr_paso(numero: int, nombre: str, fn) -> bool:
        try:
            detalle = fn()
            resultados.append(ResultadoPaso(numero, nombre, True, detalle))
            return True
        except ErrorPasoEnsayo as exc:
            resultados.append(ResultadoPaso(numero, nombre, False, str(exc)))
            return False
        except (KeyError, AttributeError, TypeError, ValueError) as exc:
            resultados.append(
                ResultadoPaso(
                    numero,
                    nombre,
                    False,
                    f"Respuesta JSON inesperada del servidor ({type(exc).__name__}: {exc}).",
                )
            )
            return False

    # 1. Login de duenio_demo y cajero_demo
    def _step1() -> str:
        nonlocal token_duenio, token_cajero
        token_duenio, token_cajero = _paso_login(cliente, django_base, clave_duenio, clave_cajero)
        return "duenio_demo (DUENIO) y cajero_demo (CAJERO) autenticados"

    if correr_paso(1, "Login duenio_demo y cajero_demo", _step1):
        # 2. Ver costeo de un producto
        correr_paso(
            2,
            "Ver costeo de un producto",
            lambda: _paso_costeo_producto(
                cliente, django_base, node_base, verificar_node, token_duenio
            )[1],
        )

        # 3. Abrir turno del cajero (si no hay uno)
        def _step3() -> str:
            nonlocal turno_id
            turno_id, msg = _paso_abrir_turno(cliente, django_base, token_cajero)
            return msg

        if correr_paso(3, "Abrir turno del cajero (o reutilizar abierto)", _step3):
            # 4. Cobrar una venta
            def _step4() -> str:
                nonlocal prod_pos_id, prod_pos_nombre, total_venta_emitida
                prod_pos_id, prod_pos_nombre = _elegir_producto_pos(
                    cliente, django_base, token_cajero
                )
                _, total_venta_emitida, msg = _paso_cobrar_venta(
                    cliente,
                    django_base,
                    token_cajero,
                    turno_id,
                    prod_pos_id,
                    prod_pos_nombre,
                )
                return msg

            if correr_paso(4, "Cobrar una venta en POS", _step4):
                estado_limpieza = {"venta_huerfana_id": 0}
                # 5. Anular otra venta
                correr_paso(
                    5,
                    "Anular otra venta en el turno abierto",
                    lambda: _paso_anular_otra_venta(
                        cliente,
                        django_base,
                        token_cajero,
                        token_duenio,
                        turno_id,
                        prod_pos_id,
                        estado_limpieza=estado_limpieza,
                    ),
                )

                # 6. Cerrar el turno solo si no quedó venta huérfana sin anular
                if estado_limpieza["venta_huerfana_id"]:
                    resultados.append(
                        ResultadoPaso(
                            6,
                            "Cerrar el turno (arqueo ciego + auditoría dueño)",
                            False,
                            f"Omitido para no cerrar el turno #{turno_id} con la venta huérfana "
                            f"#{estado_limpieza['venta_huerfana_id']} sin anular.",
                        )
                    )
                else:
                    correr_paso(
                        6,
                        "Cerrar el turno (arqueo ciego + auditoría dueño)",
                        lambda: _paso_cerrar_turno(
                            cliente,
                            django_base,
                            token_cajero,
                            token_duenio,
                            turno_id,
                            total_venta_emitida,
                        ),
                    )
            else:
                resultados.append(
                    ResultadoPaso(
                        6,
                        "Cerrar el turno (arqueo ciego + auditoría dueño)",
                        False,
                        f"Omitido porque falló el cobro en Paso 4 (el turno #{turno_id} permanece abierto).",
                    )
                )

        # 7. Reportes "últimos 7 días"
        correr_paso(
            7,
            "Reportes últimos 7 días (ganancia, ranking, movimientos, PE)",
            lambda: _paso_reportes_ultimos_7_dias(
                cliente, django_base, token_duenio, total_venta_emitida
            ),
        )

    # 8. Carta pública (se intenta incluso si falló algún paso autenticado)
    correr_paso(
        8,
        "Carta digital pública anónima",
        lambda: _paso_carta_publica(cliente, django_base, node_base, verificar_node),
    )

    print("Resumen por paso:")
    print("-----------------------------------------------------------------")
    for res in resultados:
        icono = "✅" if res.ok else "❌"
        print(f"  {icono} Paso {res.numero}: {res.nombre}")
        print(f"     -> {res.detalle}")
    print("-----------------------------------------------------------------")
    print(
        f"Peticiones a Node en esta corrida: {cliente.peticiones_node_auth} autenticadas "
        f"(límite 600/15m) + {cliente.peticiones_node_anon} a rutas públicas/salud "
        "(sin cupo de limitadorGeneral)."
    )
    print(
        "Aviso de idempotencia: cada corrida deja 1 venta EMITIDA, 1 venta ANULADA y "
        "cierra el turno usado; en la siguiente corrida abre un turno nuevo automáticamente "
        "sin colisionar."
    )

    hubo_fallos = any(not r.ok for r in resultados)
    if hubo_fallos or len(resultados) < 8:
        print("\n❌ Ensayo finalizado CON ERRORES.")
        return 1

    print("\n✅ Ensayo completo OK (8/8 pasos superados).")
    return 0


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada CLI con guarda explícita contra la base local por defecto."""
    parser = argparse.ArgumentParser(
        description="Ensayo automático E2E del flujo demo contra servidores levantados."
    )
    parser.add_argument(
        "--confirmo-base-real",
        action="store_true",
        help="Permite usar http://localhost:8000 y http://localhost:3000 sin definir DJANGO_URL ni NODE_URL.",
    )
    args = parser.parse_args(argv)
    return ejecutar_ensayo(confirmo_base_real=args.confirmo_base_real)


if __name__ == "__main__":
    sys.exit(main())
