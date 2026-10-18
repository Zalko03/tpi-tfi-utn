"""Servicios de costeo de recetas, márgenes y propagación de costos."""
from decimal import Decimal, ROUND_HALF_UP
from apps.insumos.services import convertir_a_unidad_base


def calcular_costo_producto(producto) -> Decimal:
    """
    Calcula el costo total de un producto:
    costo_total = sum(cantidad_base * costo_unitario_insumo) + mano_obra + descartables
    """
    costo_insumos = Decimal("0.0000")

    items = producto.receta_items.select_related("insumo").all()
    for item in items:
        insumo = item.insumo
        cant_base = convertir_a_unidad_base(
            cantidad=item.cantidad,
            unidad_origen=item.unidad,
            unidad_base=insumo.unidad_base,
        )
        costo_linea = cant_base * insumo.costo_unitario
        costo_insumos += costo_linea

    # Mano de obra: (minutos * costo_hora) / 60
    minutos = Decimal(str(producto.minutos_mano_obra or 0))
    costo_hora = Decimal(str(producto.costo_hora_mano_obra or 0))
    costo_mo = (minutos * costo_hora) / Decimal("60") if minutos > 0 else Decimal("0.0000")

    descartables = Decimal(str(producto.descartables or 0))

    costo_total = costo_insumos + costo_mo + descartables
    return costo_total.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def calcular_margen_y_ganancia(precio_venta: Decimal, costo_total: Decimal) -> tuple[Decimal, Decimal]:
    """
    Calcula la ganancia bruta y el margen bruto:
    ganancia_bruta = precio_venta - costo_total
    margen_bruto = ganancia_bruta / precio_venta
    """
    precio = Decimal(str(precio_venta or 0))
    costo = Decimal(str(costo_total or 0))

    ganancia = precio - costo
    if precio > Decimal("0"):
        margen = (ganancia / precio).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    else:
        margen = Decimal("0.0000")

    ganancia_redondeada = ganancia.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    return ganancia_redondeada, margen


def actualizar_costo_y_margen_producto(producto):
    """Calcula y actualiza los campos calculados del producto en la base de datos."""
    costo_total = calcular_costo_producto(producto)
    ganancia, margen = calcular_margen_y_ganancia(producto.precio_venta, costo_total)

    producto.costo_total_calculado = costo_total
    producto.ganancia_bruta = ganancia
    producto.margen_bruto = margen
    producto.save(update_fields=[
        "costo_total_calculado",
        "ganancia_bruta",
        "margen_bruto",
        "actualizado_en",
    ])
    return producto


def recalcular_recetas_por_insumo(insumo_id: int) -> list[dict]:
    """
    Recalcula el costo y margen de todos los productos que usan el insumo.
    Retorna un resumen de productos recalculados (útil para historial y sockets).
    """
    from apps.recetas.models import Producto

    productos_afectados = Producto.objects.filter(
        receta_items__insumo_id=insumo_id,
        estado_activo=True,
    ).distinct()

    resumen = []
    for prod in productos_afectados:
        costo_anterior = prod.costo_total_calculado
        actualizar_costo_y_margen_producto(prod)
        resumen.append({
            "producto_id": prod.id,
            "nombre": prod.nombre,
            "costo_anterior": str(costo_anterior),
            "costo_nuevo": str(prod.costo_total_calculado),
            "margen_nuevo": str(prod.margen_bruto),
        })

    return resumen
