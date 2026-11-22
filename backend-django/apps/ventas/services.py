"""Servicio de ventas, congelamiento de snapshots de costo y reportes agregados."""

import logging
import uuid
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from django.db.models import Count, DecimalField, ExpressionWrapper, F, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.caja.models import TurnoCaja
from apps.comun.notificaciones_node import notificar_evento_node
from apps.insumos.services import (
    descontar_stock_por_venta,
    devolver_stock_por_anulacion_venta,
    notificar_stock_bajo_alertas,
)
from apps.recetas.models import Producto
from apps.ventas.models import Venta, VentaItem

logger = logging.getLogger(__name__)


def _construir_payload_evento_venta(venta: Venta, items: list | None = None) -> dict:
    """Construye el payload de venta para difusión en vivo en backend-node."""
    if items is None:
        items = list(venta.items.select_related("producto").all())

    items_payload = [
        {
            "productoId": item.producto_id,
            "productoNombre": item.producto.nombre if item.producto_id else "",
            "cantidad": str(item.cantidad),
            "precioUnitario": str(item.precio_unitario),
            "costoUnitarioSnapshot": str(item.costo_unitario_snapshot),
        }
        for item in items
    ]

    total_dec = (
        venta.total if isinstance(venta.total, Decimal) else Decimal(str(venta.total or "0.00"))
    )
    costo_dec = (
        venta.costo_total_snapshot
        if isinstance(venta.costo_total_snapshot, Decimal)
        else Decimal(str(venta.costo_total_snapshot or "0.0000"))
    )
    ganancia_dec = (total_dec - costo_dec).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

    turno = getattr(venta, "turno_caja", None)
    usuario_turno = getattr(turno, "usuario", None) if turno is not None else None

    payload = {
        "ventaId": venta.id,
        "turnoId": venta.turno_caja_id,
        "usuarioNombre": getattr(usuario_turno, "username", None),
        "fecha": venta.fecha.isoformat() if venta.fecha else None,
        "estado": venta.estado,
        "origen": venta.origen,
        "medio_pago": venta.medio_pago,
        "metodoPago": venta.medio_pago,
        "total": str(total_dec),
        "costoTotalSnapshot": str(costo_dec),
        "gananciaBruta": str(ganancia_dec),
        "cantidadItems": len(items_payload),
        "items": items_payload,
    }
    if venta.estado == "ANULADA":
        payload.update(
            {
                "anuladaEn": venta.anulada_en.isoformat() if venta.anulada_en else None,
                "anuladaPorId": venta.anulada_por_id,
                "anuladaPorNombre": getattr(venta.anulada_por, "username", None),
                "motivoAnulacion": venta.motivo_anulacion,
            }
        )
    return payload


def _notificar_venta_en_vivo(evento: str, venta: Venta, items: list | None = None) -> None:
    """Notifica a Node luego de confirmar la transacción; nunca falla la operación principal."""
    try:
        payload = _construir_payload_evento_venta(venta, items=items)
        notificar_evento_node(evento, payload)
    except Exception:
        logger.exception("Error inesperado al notificar %s de venta #%s", evento, venta.id)


@transaction.atomic
def _persistir_venta_atomica(
    items_data: list[dict],
    medio_pago: str = "EFECTIVO",
    origen: str = "propio",
    turno_caja=None,
    fecha=None,
    id_operacion=None,
) -> tuple[Venta, bool, list[VentaItem]]:
    """Persiste una venta y sus ítems en una transacción atómica."""
    id_operacion_uuid = None
    if id_operacion is not None and str(id_operacion).strip() != "":
        try:
            id_operacion_uuid = (
                id_operacion
                if isinstance(id_operacion, uuid.UUID)
                else uuid.UUID(str(id_operacion))
            )
        except (ValueError, TypeError, AttributeError) as exc:
            raise ValidationError(
                {"id_operacion": "El identificador de la operación no es válido."}
            ) from exc

        venta_existente = (
            Venta.objects.prefetch_related("items__producto")
            .filter(id_operacion=id_operacion_uuid)
            .first()
        )
        if venta_existente is not None:
            return venta_existente, False, [], []

    if not items_data:
        raise ValueError("La venta debe contener al menos un producto.")

    if turno_caja is not None and getattr(turno_caja, "estado", None) != "ABIERTO":
        raise ValidationError(
            {"turno_caja": "No se puede registrar una venta en un turno de caja cerrado."}
        )

    try:
        with transaction.atomic():
            venta = Venta.objects.create(
                turno_caja=turno_caja,
                medio_pago=medio_pago,
                origen=origen,
                id_operacion=id_operacion_uuid,
                total=Decimal("0.00"),
                costo_total_snapshot=Decimal("0.0000"),
            )
    except IntegrityError:
        if id_operacion_uuid is not None:
            venta_existente = (
                Venta.objects.prefetch_related("items__producto")
                .filter(id_operacion=id_operacion_uuid)
                .first()
            )
            if venta_existente is not None:
                return venta_existente, False, [], []
        raise

    if fecha:
        venta.fecha = fecha

    total_cobrado = Decimal("0.00")
    total_costo = Decimal("0.0000")
    items_creados: list[VentaItem] = []

    for item in items_data:
        producto_id = item.get("producto_id")
        try:
            cantidad = Decimal(str(item.get("cantidad", 1)))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise ValidationError(
                {"items_entrada": "La cantidad a vender debe ser un número válido."}
            ) from exc
        if cantidad <= Decimal("0"):
            raise ValueError("La cantidad a vender debe ser mayor a cero.")

        try:
            producto = Producto.objects.select_for_update().get(id=producto_id, estado_activo=True)
        except (Producto.DoesNotExist, ValueError, TypeError) as exc:
            raise ValidationError(
                {"items_entrada": f"El producto {producto_id} no existe o se encuentra inactivo."}
            ) from exc

        precio_bd = (
            producto.precio_venta
            if isinstance(producto.precio_venta, Decimal)
            else Decimal(str(producto.precio_venta))
        )
        if precio_bd <= Decimal("0.00"):
            raise ValidationError(
                {
                    "items_entrada": (
                        f"El producto '{producto.nombre}' tiene un precio de venta inválido ($0.00 o menor)."
                    )
                }
            )
        precio_raw = item.get("precio_unitario")
        if precio_raw not in (None, ""):
            try:
                precio_cliente = Decimal(str(precio_raw))
            except (InvalidOperation, TypeError, ValueError) as exc:
                raise ValueError(
                    f"El precio unitario ingresado para el producto {producto.id} no es válido."
                ) from exc

            if precio_cliente != precio_bd:
                diferencia = precio_bd - precio_cliente
                logger.warning(
                    "Diferencia de precio en venta #%s: producto_id=%s producto=%r "
                    "origen=%s precio_cliente=%s precio_bd=%s diferencia=%s",
                    venta.id,
                    producto.id,
                    producto.nombre,
                    origen,
                    precio_cliente,
                    precio_bd,
                    diferencia,
                    extra={
                        "venta_id": venta.id,
                        "producto_id": producto.id,
                        "producto_nombre": producto.nombre,
                        "origen": origen,
                        "precio_cliente": str(precio_cliente),
                        "precio_bd": str(precio_bd),
                        "diferencia": str(diferencia),
                    },
                )

        # El precio unitario se calcula siempre desde la BD (NORMAS.md §3).
        precio_unitario = precio_bd
        costo_snapshot = producto.costo_total_calculado

        venta_item = VentaItem.objects.create(
            venta=venta,
            producto=producto,
            cantidad=cantidad,
            precio_unitario=precio_unitario,
            costo_unitario_snapshot=costo_snapshot,
        )
        items_creados.append(venta_item)

        total_cobrado += precio_unitario * cantidad
        total_costo += costo_snapshot * cantidad

    venta.total = total_cobrado
    venta.costo_total_snapshot = total_costo
    venta.save(update_fields=["total", "costo_total_snapshot", "fecha"])

    usuario_venta = getattr(turno_caja, "usuario", None) if turno_caja is not None else None
    alertas_stock_bajo = descontar_stock_por_venta(
        venta=venta,
        items_venta=items_creados,
        usuario=usuario_venta,
    )

    return venta, True, items_creados, alertas_stock_bajo


def registrar_venta(
    items_data: list[dict],
    medio_pago: str = "EFECTIVO",
    origen: str = "propio",
    turno_caja=None,
    fecha=None,
    id_operacion=None,
) -> Venta:
    """
    Registra una venta cobrada en caja. Congela el costo unitario vigente
    de cada producto (HU4 / CA4.2), descuenta el stock de insumos por receta
    (HU12 / CA12.1) y notifica a Node si algún insumo quedó bajo mínimo (CA12.2).
    Soporta idempotencia vía id_operacion.
    """
    venta, fue_creada, items_creados, alertas_stock_bajo = _persistir_venta_atomica(
        items_data=items_data,
        medio_pago=medio_pago,
        origen=origen,
        turno_caja=turno_caja,
        fecha=fecha,
        id_operacion=id_operacion,
    )
    if fue_creada:
        _notificar_venta_en_vivo("venta.registrada", venta, items=items_creados)
        if alertas_stock_bajo:
            notificar_stock_bajo_alertas(alertas_stock_bajo)
    return venta


@transaction.atomic
def _persistir_anulacion_atomica(
    venta: Venta,
    usuario,
    motivo: str = "",
    permiso_verificado: bool = False,
) -> Venta:
    """Persiste la anulación lógica de una venta dentro de una transacción atómica."""
    if not permiso_verificado:
        if (
            usuario is None
            or not getattr(usuario, "is_authenticated", False)
            or not getattr(usuario, "is_active", False)
        ):
            raise PermissionDenied("No tenés permisos para realizar esta acción")
        if not getattr(usuario, "is_superuser", False):
            perfil = getattr(usuario, "perfil", None)
            if not perfil or not perfil.tiene_permiso("ventas.anular_ticket"):
                raise PermissionDenied("No tenés permisos para realizar esta acción")

    venta_bloqueada = Venta.objects.select_for_update().get(pk=venta.pk)
    if venta_bloqueada.estado == "ANULADA":
        raise ValidationError(["Esta venta ya se encuentra anulada."])

    if venta_bloqueada.turno_caja_id is not None:
        turno_actual = TurnoCaja.objects.select_for_update().get(pk=venta_bloqueada.turno_caja_id)
        if turno_actual.estado != "ABIERTO":
            raise ValidationError(
                ["No se puede anular una venta porque el turno de caja ya está cerrado."]
            )

    motivo_limpio = str(motivo or "").strip()[:255]
    venta_bloqueada.estado = "ANULADA"
    venta_bloqueada.anulada_en = timezone.now()
    venta_bloqueada.anulada_por = (
        usuario if usuario is not None and getattr(usuario, "pk", None) is not None else None
    )
    venta_bloqueada.motivo_anulacion = motivo_limpio
    venta_bloqueada.save(update_fields=["estado", "anulada_en", "anulada_por", "motivo_anulacion"])
    devolver_stock_por_anulacion_venta(
        venta=venta_bloqueada,
        usuario=venta_bloqueada.anulada_por,
    )
    return venta_bloqueada


def anular_venta(
    venta: Venta,
    usuario,
    motivo: str = "",
    permiso_verificado: bool = False,
) -> Venta:
    """
    Anula una venta emitida sin borrar el registro contable.
    Regla conservadora: no se permite anular si el turno de caja de la venta ya fue cerrado.
    """
    venta_anulada = _persistir_anulacion_atomica(
        venta=venta,
        usuario=usuario,
        motivo=motivo,
        permiso_verificado=permiso_verificado,
    )
    _notificar_venta_en_vivo("venta.anulada", venta_anulada)
    return venta_anulada


def construir_queryset_reporte_ventas_por_producto(fecha_inicio=None, fecha_fin=None):
    """
    Construye el QuerySet agregado en SQL (GROUP BY producto) filtrado por fecha de venta.
    Aprovecha idx_venta_fecha en Venta e idx_ventaitem_venta_prod en VentaItem (T3.4).
    """
    qs = VentaItem.objects.filter(venta__estado="EMITIDA")
    if fecha_inicio is not None:
        qs = qs.filter(venta__fecha__gte=fecha_inicio)
    if fecha_fin is not None:
        qs = qs.filter(venta__fecha__lte=fecha_fin)

    campo_monetario = DecimalField(max_digits=16, decimal_places=4)

    return (
        qs.values("producto_id", "producto__nombre")
        .annotate(
            unidades_vendidas=Sum("cantidad"),
            ingresos_totales=Sum(
                ExpressionWrapper(
                    F("cantidad") * F("precio_unitario"),
                    output_field=campo_monetario,
                )
            ),
            costo_total_congelado=Sum(
                ExpressionWrapper(
                    F("cantidad") * F("costo_unitario_snapshot"),
                    output_field=campo_monetario,
                )
            ),
        )
        .order_by("-unidades_vendidas", "producto__nombre")
    )


def obtener_reporte_ventas_por_producto(fecha_inicio=None, fecha_fin=None) -> list[dict]:
    """
    Retorna el reporte consolidado de ventas por producto en una única consulta SQL
    agregada, calculando ganancia bruta con el costo congelado al vender (§3 del plan).
    """
    filas = construir_queryset_reporte_ventas_por_producto(
        fecha_inicio=fecha_inicio, fecha_fin=fecha_fin
    )

    resultado = []
    for fila in filas:
        unidades = Decimal(str(fila["unidades_vendidas"] or "0.00")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        ingresos = Decimal(str(fila["ingresos_totales"] or "0.00")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        costo = Decimal(str(fila["costo_total_congelado"] or "0.0000")).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        )
        ganancia = (ingresos - costo).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

        resultado.append(
            {
                "producto_id": fila["producto_id"],
                "producto_nombre": fila["producto__nombre"],
                "unidades_vendidas": str(unidades),
                "ingresos_totales": str(ingresos),
                "costo_total_congelado": str(costo),
                "ganancia_bruta": str(ganancia),
            }
        )

    return resultado


def obtener_ganancia_diaria(fecha_inicio=None, fecha_fin=None) -> dict:
    """
    Calcula la ganancia diaria (HU10 / CA10.1):
    Ganancia diaria = Σ (precio_unitario - costo_unitario_snapshot) * cantidad
    sobre los ítems vendidos, usando estrictamente el costo congelado al vender.
    """
    qs_items = VentaItem.objects.filter(venta__estado="EMITIDA")
    qs_ventas = Venta.objects.filter(estado="EMITIDA")

    if fecha_inicio is not None:
        qs_items = qs_items.filter(venta__fecha__gte=fecha_inicio)
        qs_ventas = qs_ventas.filter(fecha__gte=fecha_inicio)
    if fecha_fin is not None:
        qs_items = qs_items.filter(venta__fecha__lte=fecha_fin)
        qs_ventas = qs_ventas.filter(fecha__lte=fecha_fin)

    campo_monetario = DecimalField(max_digits=16, decimal_places=4)

    agregado = qs_items.aggregate(
        unidades_totales=Sum("cantidad"),
        ingresos_totales=Sum(
            ExpressionWrapper(
                F("cantidad") * F("precio_unitario"),
                output_field=campo_monetario,
            )
        ),
        costo_total_congelado=Sum(
            ExpressionWrapper(
                F("cantidad") * F("costo_unitario_snapshot"),
                output_field=campo_monetario,
            )
        ),
    )

    cantidad_tickets = qs_ventas.count()
    unidades = Decimal(str(agregado["unidades_totales"] or "0.00")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    ingresos = Decimal(str(agregado["ingresos_totales"] or "0.00")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    costo_congelado = Decimal(str(agregado["costo_total_congelado"] or "0.0000")).quantize(
        Decimal("0.0001"), rounding=ROUND_HALF_UP
    )
    ganancia_bruta = (ingresos - costo_congelado).quantize(
        Decimal("0.0001"), rounding=ROUND_HALF_UP
    )

    if ingresos > Decimal("0.00"):
        margen_promedio = (ganancia_bruta / ingresos).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        )
    else:
        margen_promedio = Decimal("0.0000")

    filas_por_dia = (
        qs_ventas.annotate(dia=TruncDate("fecha"))
        .values("dia")
        .annotate(
            tickets=Count("id"),
            ingresos_dia=Sum("total"),
            costo_dia=Sum("costo_total_snapshot"),
        )
        .order_by("-dia")
    )

    desglose_por_dia = []
    for fila in filas_por_dia:
        ing_d = Decimal(str(fila["ingresos_dia"] or "0.00")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        cos_d = Decimal(str(fila["costo_dia"] or "0.0000")).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        )
        gan_d = (ing_d - cos_d).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        desglose_por_dia.append(
            {
                "fecha": fila["dia"].isoformat() if fila["dia"] else None,
                "cantidad_tickets": fila["tickets"],
                "ingresos_totales": str(ing_d),
                "costo_total_congelado": str(cos_d),
                "ganancia_bruta": str(gan_d),
            }
        )

    return {
        "cantidad_tickets": cantidad_tickets,
        "unidades_vendidas": str(unidades),
        "ingresos_totales": str(ingresos),
        "costo_total_congelado": str(costo_congelado),
        "ganancia_bruta_diaria": str(ganancia_bruta),
        "margen_bruto_promedio": str(margen_promedio),
        "desglose_por_dia": desglose_por_dia,
    }


def obtener_ranking_productos(fecha_inicio=None, fecha_fin=None, limite: int = 10) -> dict:
    """
    Calcula el ranking de productos más y menos vendidos en un rango de fechas (HU10 / CA10.2).
    Incluye en 'menos_vendidos' también los productos activos que tuvieron 0 ventas en el período
    para visibilizar ítems sin rotación.
    """
    limite_limpio = max(1, int(limite or 10))
    vendidos = obtener_reporte_ventas_por_producto(fecha_inicio=fecha_inicio, fecha_fin=fecha_fin)

    mapa_vendidos = {item["producto_id"]: item for item in vendidos}
    productos_activos = Producto.objects.filter(estado_activo=True).only("id", "nombre")

    todos_los_productos = list(vendidos)
    for prod in productos_activos:
        if prod.id not in mapa_vendidos:
            todos_los_productos.append(
                {
                    "producto_id": prod.id,
                    "producto_nombre": prod.nombre,
                    "unidades_vendidas": "0.00",
                    "ingresos_totales": "0.00",
                    "costo_total_congelado": "0.0000",
                    "ganancia_bruta": "0.0000",
                }
            )

    mas_vendidos = sorted(
        todos_los_productos,
        key=lambda x: (-Decimal(x["unidades_vendidas"]), x["producto_nombre"]),
    )[:limite_limpio]

    menos_vendidos = sorted(
        todos_los_productos,
        key=lambda x: (Decimal(x["unidades_vendidas"]), x["producto_nombre"]),
    )[:limite_limpio]

    return {
        "mas_vendidos": mas_vendidos,
        "menos_vendidos": menos_vendidos,
        "ranking": mas_vendidos,
        "total_productos_evaluados": len(todos_los_productos),
    }


def calcular_punto_equilibrio_y_metas(
    costos_fijos,
    costos_variables=None,
    ventas=None,
    dias_operativos: int = 26,
    dias_semana: int = 6,
    fecha_inicio=None,
    fecha_fin=None,
) -> dict:
    """
    Calcula el Punto de Equilibrio en pesos y las metas diaria y semanal (HU11 / CA11.1 y CA11.2):
    - PE ($) = costos_fijos / (1 - (costos_variables / ventas))
    - Meta diaria = PE mensual / dias_operativos
    - Meta semanal = meta_diaria * dias_semana
    """
    try:
        cf = Decimal(str(costos_fijos))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError("El monto de los costos fijos debe ser un número válido.") from exc

    if cf <= Decimal("0"):
        raise ValueError("Los costos fijos deben ser mayores a cero.")

    try:
        dias_op = int(dias_operativos)
        dias_sem = int(dias_semana)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            "Los días operativos y los días por semana deben ser números enteros mayores a cero."
        ) from exc

    if dias_op <= 0 or dias_sem <= 0:
        raise ValueError("Los días operativos y los días por semana deben ser mayores a cero.")

    if costos_variables is None or ventas is None:
        resumen_periodo = obtener_ganancia_diaria(fecha_inicio=fecha_inicio, fecha_fin=fecha_fin)
        ventas_dec = (
            Decimal(str(ventas))
            if ventas is not None
            else Decimal(resumen_periodo["ingresos_totales"])
        )
        costos_var_dec = (
            Decimal(str(costos_variables))
            if costos_variables is not None
            else Decimal(resumen_periodo["costo_total_congelado"])
        )
    else:
        try:
            ventas_dec = Decimal(str(ventas))
            costos_var_dec = Decimal(str(costos_variables))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise ValueError("Los costos variables y las ventas deben ser montos válidos.") from exc

    if ventas_dec <= Decimal("0"):
        raise ValueError(
            "El monto de ventas debe ser mayor a cero para calcular el punto de equilibrio."
        )
    if costos_var_dec < Decimal("0"):
        raise ValueError("Los costos variables no pueden ser negativos.")
    if costos_var_dec >= ventas_dec:
        raise ValueError(
            "Los costos variables igualan o superan a las ventas; no existe punto de equilibrio positivo."
        )

    razon_costo_variable = costos_var_dec / ventas_dec
    margen_contribucion = Decimal("1") - razon_costo_variable

    pe_mensual = (cf / margen_contribucion).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    meta_diaria = (pe_mensual / Decimal(str(dias_op))).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    meta_semanal = (meta_diaria * Decimal(str(dias_sem))).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    porcentaje_alcance = ((ventas_dec / pe_mensual) * Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    return {
        "costos_fijos": str(cf.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        "costos_variables": str(costos_var_dec.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        "ventas_referencia": str(ventas_dec.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        "margen_contribucion": str(
            margen_contribucion.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        ),
        "punto_equilibrio_mensual": str(pe_mensual),
        "dias_operativos": dias_op,
        "dias_semana": dias_sem,
        "meta_diaria": str(meta_diaria),
        "meta_semanal": str(meta_semanal),
        "porcentaje_cumplimiento_pe": str(porcentaje_alcance),
    }
