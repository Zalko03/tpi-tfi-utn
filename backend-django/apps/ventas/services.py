"""Servicio de ventas, congelamiento de snapshots de costo y reportes agregados."""
from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction
from django.db.models import DecimalField, ExpressionWrapper, F, Sum
from apps.ventas.models import Venta, VentaItem
from apps.recetas.models import Producto


@transaction.atomic
def registrar_venta(
    items_data: list[dict],
    medio_pago: str = "EFECTIVO",
    origen: str = "propio",
    turno_caja=None,
    fecha=None,
) -> Venta:
    """
    Registra una venta cobrada en caja. Congela el costo unitario vigente
    de cada producto (HU4 / CA4.2) para que futuros cambios de precio de insumos
    no reescriban el pasado contable.
    """
    if not items_data:
        raise ValueError("La venta debe contener al menos un producto.")

    venta = Venta.objects.create(
        turno_caja=turno_caja,
        medio_pago=medio_pago,
        origen=origen,
        total=Decimal("0.00"),
        costo_total_snapshot=Decimal("0.0000"),
    )
    if fecha:
        venta.fecha = fecha

    total_cobrado = Decimal("0.00")
    total_costo = Decimal("0.0000")

    for item in items_data:
        producto_id = item.get("producto_id")
        cantidad = Decimal(str(item.get("cantidad", 1)))
        if cantidad <= Decimal("0"):
            raise ValueError("La cantidad a vender debe ser mayor a cero.")

        producto = Producto.objects.select_for_update().get(
            id=producto_id, estado_activo=True
        )
        precio_unitario = Decimal(
            str(item.get("precio_unitario", producto.precio_venta))
        )
        costo_snapshot = producto.costo_total_calculado

        VentaItem.objects.create(
            venta=venta,
            producto=producto,
            cantidad=cantidad,
            precio_unitario=precio_unitario,
            costo_unitario_snapshot=costo_snapshot,
        )

        total_cobrado += precio_unitario * cantidad
        total_costo += costo_snapshot * cantidad

    venta.total = total_cobrado
    venta.costo_total_snapshot = total_costo
    venta.save(update_fields=["total", "costo_total_snapshot", "fecha"])

    return venta


def construir_queryset_reporte_ventas_por_producto(
    fecha_inicio=None, fecha_fin=None
):
    """
    Construye el QuerySet agregado en SQL (GROUP BY producto) filtrado por fecha de venta.
    Aprovecha idx_venta_fecha en Venta e idx_ventaitem_venta_prod en VentaItem (T3.4).
    """
    qs = VentaItem.objects.all()
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


def obtener_reporte_ventas_por_producto(
    fecha_inicio=None, fecha_fin=None
) -> list[dict]:
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
        costo = Decimal(
            str(fila["costo_total_congelado"] or "0.0000")
        ).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        ganancia = (ingresos - costo).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        )

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
