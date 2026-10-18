"""Servicio de ventas y congelamiento de snapshots de costo."""
from decimal import Decimal
from django.db import transaction
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

        producto = Producto.objects.select_for_update().get(id=producto_id, estado_activo=True)
        precio_unitario = Decimal(str(item.get("precio_unitario", producto.precio_venta)))
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
