"""Servicios de lógica de negocio para conversión de unidades, costeo de insumos y compras."""
from decimal import Decimal, ROUND_HALF_UP

FACTORES_CONVERSION = {
    # Masa -> base 'g'
    ("g", "g"): Decimal("1"),
    ("kg", "g"): Decimal("1000"),
    ("kilo", "g"): Decimal("1000"),
    ("mg", "g"): Decimal("0.001"),
    # Volumen -> base 'ml'
    ("ml", "ml"): Decimal("1"),
    ("cc", "ml"): Decimal("1"),
    ("l", "ml"): Decimal("1000"),
    ("litro", "ml"): Decimal("1000"),
    ("lt", "ml"): Decimal("1000"),
    # Conteo -> base 'un'
    ("un", "un"): Decimal("1"),
    ("u", "un"): Decimal("1"),
    ("unidad", "un"): Decimal("1"),
    ("docena", "un"): Decimal("12"),
}


def normalizar_unidad(unidad: str) -> str:
    """Normaliza cadenas de unidad a minúsculas y sin espacios."""
    if not unidad:
        return ""
    return str(unidad).strip().lower()


def convertir_a_unidad_base(cantidad: Decimal, unidad_origen: str, unidad_base: str) -> Decimal:
    """
    Convierte una cantidad expresada en unidad_origen a la unidad_base del insumo.
    Lanza ValueError si la cantidad no es positiva o si las unidades son incompatibles.
    """
    if cantidad is None or Decimal(str(cantidad)) <= 0:
        raise ValueError("La cantidad debe ser mayor a cero.")

    origen = normalizar_unidad(unidad_origen)
    base = normalizar_unidad(unidad_base)

    clave = (origen, base)
    if clave not in FACTORES_CONVERSION:
        raise ValueError(
            f"No se puede convertir de '{unidad_origen}' a la unidad base '{unidad_base}'. "
            "Las unidades deben pertenecer a la misma magnitud (masa: g/kg, volumen: ml/l, o unidades: un/docena)."
        )

    factor = FACTORES_CONVERSION[clave]
    return (Decimal(str(cantidad)) * factor).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def calcular_costo_unitario(
    precio_total: Decimal,
    cantidad: Decimal,
    unidad: str,
    unidad_base: str,
    envio: Decimal = Decimal("0.00"),
    iva_incluido: bool = True,
    alicuota: Decimal = Decimal("21.00"),
    costear_con_iva: bool = True,
) -> Decimal:
    """
    Calcula el costo por unidad base (g, ml o un) considerando IVA y flete prorrateado.
    Evita divisiones por cero y distorsiones por compras por lote.
    """
    precio = Decimal(str(precio_total))
    cant = Decimal(str(cantidad))
    costo_envio = Decimal(str(envio or 0))
    tasa_iva = Decimal(str(alicuota or 0))

    if cant <= Decimal("0"):
        raise ValueError("La cantidad debe ser mayor a cero para calcular el costo.")
    if precio < Decimal("0"):
        raise ValueError("El precio total no puede ser negativo.")
    if costo_envio < Decimal("0"):
        raise ValueError("El costo de envío no puede ser negativo.")

    # 1. Tratamiento del IVA
    if costear_con_iva:
        if iva_incluido:
            monto_base = precio
        else:
            monto_base = precio * (Decimal("1") + (tasa_iva / Decimal("100")))
    else:
        if iva_incluido:
            divisor_iva = Decimal("1") + (tasa_iva / Decimal("100"))
            monto_base = precio / divisor_iva if divisor_iva > 0 else precio
        else:
            monto_base = precio

    # 2. Total de la compra incluyendo envío
    costo_total_compra = monto_base + costo_envio

    # 3. Conversión a unidad base
    cantidad_base = convertir_a_unidad_base(cant, unidad, unidad_base)
    if cantidad_base <= Decimal("0"):
        raise ValueError("La cantidad convertida a la unidad base debe ser mayor a cero.")

    costo_unitario = costo_total_compra / cantidad_base
    return costo_unitario.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def prorratear_envio(lineas: list[dict], costo_envio_total: Decimal) -> list[Decimal]:
    """
    Prorratea el envío total entre múltiples líneas de compra en proporción
    al valor monetario de cada línea (§3 del plan).
    Cada dict en lineas debe tener 'precio_total'.
    """
    envio_total = Decimal(str(costo_envio_total or 0))
    if envio_total <= Decimal("0") or not lineas:
        return [Decimal("0.00") for _ in lineas]

    suma_valores = sum(Decimal(str(item.get("precio_total", 0))) for item in lineas)
    if suma_valores <= Decimal("0"):
        # Reparto parejo si todos los precios son 0
        porcion = (envio_total / Decimal(len(lineas))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return [porcion for _ in lineas]

    prorrateos = []
    acumulado = Decimal("0.00")
    for i, item in enumerate(lineas):
        if i == len(lineas) - 1:
            # Ajuste de centavos en la última línea
            prorrateos.append(envio_total - acumulado)
        else:
            valor = Decimal(str(item.get("precio_total", 0)))
            proporcion = (envio_total * valor) / suma_valores
            redondeado = proporcion.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            prorrateos.append(redondeado)
            acumulado += redondeado

    return prorrateos


def registrar_compra_y_actualizar_costo(
    proveedor,
    insumo,
    precio_total: Decimal,
    cantidad: Decimal,
    unidad: str,
    envio: Decimal = Decimal("0.00"),
    iva_incluido: bool = True,
    alicuota: Decimal = Decimal("21.00"),
    costear_con_iva: bool = True,
    fecha=None,
):
    """
    Persiste una Compra, actualiza el costo_unitario vigente del Insumo
    y propaga el recálculo a las recetas afectadas.
    """
    from apps.insumos.models import Compra

    costo_unit = calcular_costo_unitario(
        precio_total=precio_total,
        cantidad=cantidad,
        unidad=unidad,
        unidad_base=insumo.unidad_base,
        envio=envio,
        iva_incluido=iva_incluido,
        alicuota=alicuota,
        costear_con_iva=costear_con_iva,
    )

    datos = {
        "proveedor": proveedor,
        "insumo": insumo,
        "precio_total": Decimal(str(precio_total)),
        "cantidad": Decimal(str(cantidad)),
        "unidad": unidad,
        "envio": Decimal(str(envio or 0)),
        "iva_incluido": iva_incluido,
        "alicuota": Decimal(str(alicuota or 0)),
        "costo_unitario_calculado": costo_unit,
    }
    if fecha:
        datos["fecha"] = fecha

    compra = Compra.objects.create(**datos)

    # Actualizar insumo
    insumo.costo_unitario = costo_unit
    insumo.save(update_fields=["costo_unitario", "actualizado_en"])

    # Recalcular recetas afectadas de forma explícita (T1.8)
    try:
        from apps.recetas.services import recalcular_recetas_por_insumo
        recalcular_recetas_por_insumo(insumo.id)
    except ImportError:
        pass

    return compra
