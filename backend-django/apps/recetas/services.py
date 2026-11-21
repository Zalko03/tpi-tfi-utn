"""Servicios de costeo de recetas, márgenes y propagación de costos."""

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from django.db.models import Prefetch
from django.utils import timezone

from apps.insumos.services import convertir_a_unidad_base

MULTIPLOS_REDONDEO_PERMITIDOS = (50, 100)
MARGEN_OBJETIVO_DEFECTO = Decimal("0.3000")


def listar_productos_carta_publica():
    """Devuelve los productos activos ordenados alfabéticamente para la carta pública (HU15)."""
    from apps.recetas.models import Producto

    return Producto.objects.filter(estado_activo=True).order_by("nombre")


def listar_productos_con_costos_optimizado(
    solo_activos: bool = False,
    incluir_competencia: bool = False,
):
    """
    Construye el QuerySet de productos precargando receta_items e insumos asociados
    en una única consulta adicional (Prefetch + select_related), eliminando el problema N+1 (T3.4).
    Opcionalmente precarga los precios de competencia para sugerencia de precios (HU9).
    """
    from apps.recetas.models import PrecioCompetencia, Producto, RecetaItem

    prefetches = [
        Prefetch(
            "receta_items",
            queryset=RecetaItem.objects.select_related("insumo").order_by("id"),
        )
    ]
    if incluir_competencia:
        prefetches.append(
            Prefetch(
                "precios_competencia",
                queryset=PrecioCompetencia.objects.order_by("precio", "nombre_competidor", "id"),
            )
        )

    qs = Producto.objects.prefetch_related(*prefetches)
    if solo_activos:
        qs = qs.filter(estado_activo=True)
    return qs


def obtener_desglose_costeo_producto(producto) -> dict:
    """
    Construye el desglose detallado de costos de un producto (insumos, mano de obra
    y descartables) para snapshots documentales y auditoría de recetas.
    Reutiliza la caché de prefetch_related si está disponible para evitar consultas N+1.
    """
    desglose_insumos = []
    costo_insumos = Decimal("0.0000")

    cache_prefetch = getattr(producto, "_prefetched_objects_cache", {})
    if "receta_items" in cache_prefetch:
        items = producto.receta_items.all()
    else:
        items = producto.receta_items.select_related("insumo").all()

    for item in items:
        insumo = item.insumo
        cant_base = convertir_a_unidad_base(
            cantidad=item.cantidad,
            unidad_origen=item.unidad,
            unidad_base=insumo.unidad_base,
        )
        costo_linea = (cant_base * insumo.costo_unitario).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        )
        costo_insumos += costo_linea
        desglose_insumos.append(
            {
                "insumo_id": insumo.id,
                "nombre": insumo.nombre,
                "cantidad": str(item.cantidad),
                "unidad": item.unidad,
                "costo_unitario": str(insumo.costo_unitario),
                "costo_linea": str(costo_linea),
            }
        )

    minutos = Decimal(str(producto.minutos_mano_obra or 0))
    costo_hora = Decimal(str(producto.costo_hora_mano_obra or 0))
    costo_mo = (
        ((minutos * costo_hora) / Decimal("60")).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        if minutos > 0
        else Decimal("0.0000")
    )
    descartables = Decimal(str(producto.descartables or 0)).quantize(
        Decimal("0.0001"), rounding=ROUND_HALF_UP
    )
    costo_total = (costo_insumos + costo_mo + descartables).quantize(
        Decimal("0.0001"), rounding=ROUND_HALF_UP
    )

    return {
        "desglose_insumos": desglose_insumos,
        "costo_mano_obra": str(costo_mo),
        "costo_descartables": str(descartables),
        "costo_total": costo_total,
    }


def calcular_costo_producto(producto) -> Decimal:
    """
    Calcula el costo total de un producto:
    costo_total = sum(cantidad_base * costo_unitario_insumo) + mano_obra + descartables
    """
    return obtener_desglose_costeo_producto(producto)["costo_total"]


def calcular_margen_y_ganancia(
    precio_venta: Decimal, costo_total: Decimal
) -> tuple[Decimal, Decimal]:
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
    producto.save(
        update_fields=[
            "costo_total_calculado",
            "ganancia_bruta",
            "margen_bruto",
            "actualizado_en",
        ]
    )
    return producto


def recalcular_recetas_por_insumo(insumo_id: int) -> list[dict]:
    """
    Recalcula el costo y margen de todos los productos activos que usan el insumo (T3.4):
    - Aprovecha idx_recetaitem_insumo_prod para localizar los productos afectados.
    - Precarga receta_items + insumo en memoria con Prefetch + select_related (sin N+1).
    - Persiste todos los productos afectados en una única sentencia SQL mediante bulk_update.
    """
    from apps.recetas.models import Producto, RecetaItem

    productos_afectados = list(
        Producto.objects.filter(
            receta_items__insumo_id=insumo_id,
            estado_activo=True,
        )
        .prefetch_related(
            Prefetch(
                "receta_items",
                queryset=RecetaItem.objects.select_related("insumo").order_by("id"),
            )
        )
        .distinct()
    )

    if not productos_afectados:
        return []

    ahora = timezone.now()
    resumen = []

    for prod in productos_afectados:
        costo_anterior = prod.costo_total_calculado
        desglose = obtener_desglose_costeo_producto(prod)
        ganancia, margen = calcular_margen_y_ganancia(prod.precio_venta, desglose["costo_total"])
        prod.costo_total_calculado = desglose["costo_total"]
        prod.ganancia_bruta = ganancia
        prod.margen_bruto = margen
        prod.actualizado_en = ahora

        resumen.append(
            {
                "producto_id": prod.id,
                "insumo_id": insumo_id,
                "nombre": prod.nombre,
                "costo_anterior": str(costo_anterior),
                "costo_nuevo": str(prod.costo_total_calculado),
                "margen_nuevo": str(prod.margen_bruto),
                "costo_mano_obra": desglose["costo_mano_obra"],
                "costo_descartables": desglose["costo_descartables"],
                "desglose_insumos": desglose["desglose_insumos"],
            }
        )

    Producto.objects.bulk_update(
        productos_afectados,
        [
            "costo_total_calculado",
            "ganancia_bruta",
            "margen_bruto",
            "actualizado_en",
        ],
    )

    return resumen


def redondear_a_multiplo(valor: Decimal, multiplo: int = 50) -> Decimal:
    """
    Redondea un importe monetario al múltiplo configurado ($50 o $100) usando ROUND_HALF_UP (HU9).
    """
    try:
        multiplo_int = int(multiplo)
    except (TypeError, ValueError) as exc:
        raise ValueError("El múltiplo de redondeo debe ser $50 o $100.") from exc

    if multiplo_int not in MULTIPLOS_REDONDEO_PERMITIDOS:
        raise ValueError("El múltiplo de redondeo debe ser $50 o $100.")

    try:
        monto = Decimal(str(valor))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError("El importe a redondear no es válido.") from exc

    if monto < Decimal("0"):
        raise ValueError("El importe a redondear no puede ser negativo.")

    multiplo_dec = Decimal(str(multiplo_int))
    unidades = (monto / multiplo_dec).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return (unidades * multiplo_dec).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calcular_precio_sugerido(
    costo_total: Decimal,
    margen_objetivo: Decimal = MARGEN_OBJETIVO_DEFECTO,
    redondeo_multiplo: int = 50,
    precios_competencia: list[Decimal] | None = None,
) -> dict:
    """
    Calcula el precio sugerido de un producto (HU9, CA9.1 y CA9.2):
    1. Precio base = redondeo(costo / (1 - margen_objetivo), múltiplo $50 o $100).
    2. Si existen precios de competencia cargados, acota el precio sugerido entre
       el mínimo y el promedio de la competencia (PvP Min <= sugerido <= PvP Prom).
    """
    try:
        costo = Decimal(str(costo_total if costo_total is not None else "0"))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError("El costo del producto no es válido.") from exc

    if costo < Decimal("0"):
        raise ValueError("El costo total no puede ser negativo.")

    try:
        margen = Decimal(
            str(margen_objetivo if margen_objetivo is not None else MARGEN_OBJETIVO_DEFECTO)
        )
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError("El margen objetivo no es válido.") from exc

    if margen < Decimal("0") or margen >= Decimal("1"):
        raise ValueError("El margen objetivo debe ser mayor o igual a 0% y menor al 100%.")

    try:
        multiplo = int(redondeo_multiplo if redondeo_multiplo is not None else 50)
    except (TypeError, ValueError) as exc:
        raise ValueError("El múltiplo de redondeo debe ser $50 o $100.") from exc

    if multiplo not in MULTIPLOS_REDONDEO_PERMITIDOS:
        raise ValueError("El múltiplo de redondeo debe ser $50 o $100.")

    if costo > Decimal("0"):
        precio_teorico = costo / (Decimal("1") - margen)
    else:
        precio_teorico = Decimal("0.00")

    precio_base_redondeado = redondear_a_multiplo(precio_teorico, multiplo)

    precios_validos: list[Decimal] = []
    for p in precios_competencia or []:
        try:
            valor_comp = Decimal(str(p))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise ValueError("Uno de los precios de competencia no es válido.") from exc
        if valor_comp <= Decimal("0"):
            raise ValueError("Todos los precios de competencia deben ser mayores a cero.")
        precios_validos.append(valor_comp.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

    if precios_validos:
        competencia_minimo = min(precios_validos).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        competencia_promedio = (sum(precios_validos) / Decimal(len(precios_validos))).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )

        if precio_base_redondeado > competencia_promedio:
            precio_sugerido = competencia_promedio
            acotado_por = "PROMEDIO"
        elif precio_base_redondeado < competencia_minimo:
            precio_sugerido = competencia_minimo
            acotado_por = "MINIMO"
        else:
            precio_sugerido = precio_base_redondeado
            acotado_por = "NINGUNO"
    else:
        competencia_minimo = None
        competencia_promedio = None
        precio_sugerido = precio_base_redondeado
        acotado_por = "NINGUNO"

    ganancia_sugerida, margen_sugerido = calcular_margen_y_ganancia(precio_sugerido, costo)

    return {
        "costo_total": str(costo.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)),
        "margen_objetivo": str(margen.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)),
        "redondeo_multiplo": multiplo,
        "precio_teorico": str(precio_teorico.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        "precio_base_redondeado": str(precio_base_redondeado),
        "precio_sugerido": str(precio_sugerido),
        "competencia_cantidad": len(precios_validos),
        "competencia_minimo": str(competencia_minimo) if competencia_minimo is not None else None,
        "competencia_promedio": (
            str(competencia_promedio) if competencia_promedio is not None else None
        ),
        "acotado_por": acotado_por,
        "ganancia_con_sugerido": str(ganancia_sugerida),
        "margen_con_sugerido": str(margen_sugerido),
        "alerta_bajo_costo": precio_sugerido < costo,
    }


def obtener_sugerencia_precio_producto(
    producto,
    margen_objetivo: Decimal | None = None,
    redondeo_multiplo: int | None = None,
) -> dict:
    """
    Calcula la sugerencia de precio de un producto sin alterar su precio_venta vigente.
    Reutiliza precios_competencia precargados en memoria si están disponibles.
    """
    margen_eff = producto.margen_objetivo if margen_objetivo is None else margen_objetivo
    multiplo_eff = producto.redondeo_multiplo if redondeo_multiplo is None else redondeo_multiplo

    cache_prefetch = getattr(producto, "_prefetched_objects_cache", {})
    if "precios_competencia" in cache_prefetch:
        items_comp = producto.precios_competencia.all()
    else:
        items_comp = producto.precios_competencia.order_by("precio", "nombre_competidor", "id")

    precios_comp = [item.precio for item in items_comp]

    resultado = calcular_precio_sugerido(
        costo_total=producto.costo_total_calculado,
        margen_objetivo=margen_eff,
        redondeo_multiplo=multiplo_eff,
        precios_competencia=precios_comp,
    )
    return {
        "producto_id": producto.id,
        "nombre": producto.nombre,
        "precio_venta_actual": str(
            Decimal(str(producto.precio_venta or 0)).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
        ),
        **resultado,
    }
