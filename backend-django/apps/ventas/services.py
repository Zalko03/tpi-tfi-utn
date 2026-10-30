"""Servicio de ventas, congelamiento de snapshots de costo y reportes agregados."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from django.db import transaction
from django.db.models import Count, DecimalField, ExpressionWrapper, F, Sum
from django.db.models.functions import TruncDate
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


def obtener_ganancia_diaria(fecha_inicio=None, fecha_fin=None) -> dict:
    """
    Calcula la ganancia diaria (HU10 / CA10.1):
    Ganancia diaria = Σ (precio_unitario - costo_unitario_snapshot) * cantidad
    sobre los ítems vendidos, usando estrictamente el costo congelado al vender.
    """
    qs_items = VentaItem.objects.all()
    qs_ventas = Venta.objects.all()

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
    costo_congelado = Decimal(
        str(agregado["costo_total_congelado"] or "0.0000")
    ).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
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
        gan_d = (ing_d - cos_d).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        )
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


def obtener_ranking_productos(
    fecha_inicio=None, fecha_fin=None, limite: int = 10
) -> dict:
    """
    Calcula el ranking de productos más y menos vendidos en un rango de fechas (HU10 / CA10.2).
    Incluye en 'menos_vendidos' también los productos activos que tuvieron 0 ventas en el período
    para visibilizar ítems sin rotación.
    """
    limite_limpio = max(1, int(limite or 10))
    vendidos = obtener_reporte_ventas_por_producto(
        fecha_inicio=fecha_inicio, fecha_fin=fecha_fin
    )

    mapa_vendidos = {item["producto_id"]: item for item in vendidos}
    productos_activos = Producto.objects.filter(estado_activo=True).only(
        "id", "nombre"
    )

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
        raise ValueError("El monto de costos_fijos debe ser un número decimal válido.") from exc

    if cf <= Decimal("0"):
        raise ValueError("Los costos_fijos deben ser mayores a cero.")

    try:
        dias_op = int(dias_operativos)
        dias_sem = int(dias_semana)
    except (TypeError, ValueError) as exc:
        raise ValueError("dias_operativos y dias_semana deben ser números enteros positivos.") from exc

    if dias_op <= 0 or dias_sem <= 0:
        raise ValueError("dias_operativos y dias_semana deben ser mayores a cero.")

    if costos_variables is None or ventas is None:
        resumen_periodo = obtener_ganancia_diaria(
            fecha_inicio=fecha_inicio, fecha_fin=fecha_fin
        )
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
            raise ValueError(
                "costos_variables y ventas deben ser montos decimales válidos."
            ) from exc

    if ventas_dec <= Decimal("0"):
        raise ValueError(
            "El monto de ventas debe ser mayor a cero para calcular el punto de equilibrio."
        )
    if costos_var_dec < Decimal("0"):
        raise ValueError("Los costos_variables no pueden ser negativos.")
    if costos_var_dec >= ventas_dec:
        raise ValueError(
            "Los costos_variables igualan o superan a las ventas (margen de contribución <= 0); no existe punto de equilibrio positivo."
        )

    razon_costo_variable = costos_var_dec / ventas_dec
    margen_contribucion = Decimal("1") - razon_costo_variable

    pe_mensual = (cf / margen_contribucion).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
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
        "costos_variables": str(
            costos_var_dec.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        ),
        "ventas_referencia": str(
            ventas_dec.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        ),
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
