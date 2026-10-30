"""Servicios de lógica de negocio para conversión de unidades, costeo de insumos y compras."""
from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction

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

MAPA_UNIDAD_A_BASE = {
    origen: base for (origen, base) in FACTORES_CONVERSION.keys()
}


def normalizar_unidad(unidad: str) -> str:
    """Normaliza cadenas de unidad a minúsculas y sin espacios."""
    if not unidad:
        return ""
    return str(unidad).strip().lower()


def inferir_unidad_base(unidad_origen: str) -> str:
    """Infiere la unidad base ('g', 'ml' o 'un') a partir de una unidad de compra."""
    origen = normalizar_unidad(unidad_origen)
    if origen not in MAPA_UNIDAD_A_BASE:
        raise ValueError(
            f"La unidad '{unidad_origen}' no es válida. Use g, kg, mg, ml, cc, l, un o docena."
        )
    return MAPA_UNIDAD_A_BASE[origen]


def convertir_a_unidad_base(
    cantidad: Decimal, unidad_origen: str, unidad_base: str
) -> Decimal:
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
    return (Decimal(str(cantidad)) * factor).quantize(
        Decimal("0.0001"), rounding=ROUND_HALF_UP
    )


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
        raise ValueError(
            "La cantidad convertida a la unidad base debe ser mayor a cero."
        )

    costo_unitario = costo_total_compra / cantidad_base
    return costo_unitario.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def prorratear_envio(
    lineas: list[dict], costo_envio_total: Decimal
) -> list[Decimal]:
    """
    Prorratea el envío total entre múltiples líneas de compra en proporción
    al valor monetario de cada línea (§3 del plan).
    Cada dict en lineas debe tener 'precio_total'.
    """
    envio_total = Decimal(str(costo_envio_total or 0))
    if envio_total <= Decimal("0") or not lineas:
        return [Decimal("0.00") for _ in lineas]

    suma_valores = sum(
        Decimal(str(item.get("precio_total", 0))) for item in lineas
    )
    if suma_valores <= Decimal("0"):
        # Reparto parejo si todos los precios son 0
        porcion = (envio_total / Decimal(len(lineas))).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
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
            redondeado = proporcion.quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
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
    productos_recalculados = []
    try:
        from apps.recetas.services import recalcular_recetas_por_insumo

        productos_recalculados = recalcular_recetas_por_insumo(insumo.id)
    except ImportError:
        pass

    compra._productos_recalculados = productos_recalculados
    return compra


def _resolver_proveedor_importacion(
    proveedor_id: int | None = None, proveedor_nombre: str | None = None
):
    """Resuelve o da de alta el proveedor para una importación aprobada."""
    from apps.insumos.models import Proveedor

    if proveedor_id is not None:
        proveedor = Proveedor.objects.filter(
            id=proveedor_id, estado_activo=True
        ).first()
        if not proveedor:
            raise ValueError(
                f"El proveedor con ID {proveedor_id} no existe o está inactivo."
            )
        return proveedor

    nombre_limpio = str(proveedor_nombre or "").strip()
    if not nombre_limpio:
        raise ValueError(
            "Se debe especificar 'proveedor_id' o 'proveedor_nombre' para registrar las compras."
        )

    proveedor = Proveedor.objects.filter(nombre__iexact=nombre_limpio).first()
    if proveedor:
        if not proveedor.estado_activo:
            raise ValueError(
                f"El proveedor '{proveedor.nombre}' se encuentra inactivo."
            )
        return proveedor

    return Proveedor.objects.create(nombre=nombre_limpio, estado_activo=True)


def _resolver_insumo_importacion(item: dict):
    """Resuelve un insumo existente por ID o nombre, o lo crea con su unidad base."""
    from apps.insumos.models import Insumo

    insumo_id = item.get("insumo_id") or item.get("insumo")
    if insumo_id is not None:
        insumo = Insumo.objects.filter(id=insumo_id, estado_activo=True).first()
        if not insumo:
            raise ValueError(
                f"El insumo con ID {insumo_id} no existe o está inactivo."
            )
        return insumo

    nombre_limpio = str(item.get("nombre_insumo") or "").strip()
    if not nombre_limpio:
        raise ValueError(
            "Cada ítem debe especificar 'insumo_id' o 'nombre_insumo'."
        )

    insumo = Insumo.objects.filter(nombre__iexact=nombre_limpio).first()
    if insumo:
        if not insumo.estado_activo:
            raise ValueError(
                f"El insumo '{insumo.nombre}' se encuentra inactivo."
            )
        return insumo

    unidad_compra = item.get("unidad")
    unidad_base = item.get("unidad_base") or inferir_unidad_base(unidad_compra)
    return Insumo.objects.create(
        nombre=nombre_limpio,
        unidad_base=unidad_base,
        estado_activo=True,
    )


@transaction.atomic
def registrar_lote_compras_importacion(
    items: list[dict],
    proveedor_id: int | None = None,
    proveedor_nombre: str | None = None,
    envio_total: Decimal = Decimal("0.00"),
    costear_con_iva: bool = True,
) -> dict:
    """
    Registra de forma atómica un lote de compras aprobadas por el humano (T3.3):
    1. Resuelve el proveedor y cada insumo.
    2. Prorratea el envío total proporcionalmente al precio de cada línea (§3).
    3. Crea cada Compra y actualiza el costo_unitario del Insumo.
    4. Recalcula todas las recetas afectadas y retorna tanto las compras como el
       desglose completo de productos recalculados para que Node persista
       historial_precios y snapshots_costeo.
    """
    if not items or not isinstance(items, list):
        raise ValueError(
            "La lista de ítems a importar no puede estar vacía."
        )

    envio_dec = Decimal(str(envio_total or "0.00"))
    if envio_dec < Decimal("0"):
        raise ValueError("El costo de envío no puede ser negativo.")

    proveedor = _resolver_proveedor_importacion(
        proveedor_id=proveedor_id, proveedor_nombre=proveedor_nombre
    )
    envios_prorrateados = prorratear_envio(items, envio_dec)

    compras_creadas = []
    productos_recalculados = []

    for item, envio_linea in zip(items, envios_prorrateados):
        insumo = _resolver_insumo_importacion(item)
        costo_insumo_anterior = insumo.costo_unitario

        precio_total = Decimal(str(item.get("precio_total")))
        cantidad = Decimal(str(item.get("cantidad")))
        unidad = normalizar_unidad(item.get("unidad"))
        iva_incluido = bool(item.get("iva_incluido", True))
        alicuota = Decimal(str(item.get("alicuota", "21.00")))

        compra = registrar_compra_y_actualizar_costo(
            proveedor=proveedor,
            insumo=insumo,
            precio_total=precio_total,
            cantidad=cantidad,
            unidad=unidad,
            envio=envio_linea,
            iva_incluido=iva_incluido,
            alicuota=alicuota,
            costear_con_iva=costear_con_iva,
        )

        productos_recalculados.extend(
            getattr(compra, "_productos_recalculados", [])
        )

        compras_creadas.append(
            {
                "compra_id": compra.id,
                "insumo_id": insumo.id,
                "insumo_nombre": insumo.nombre,
                "unidad_base": insumo.unidad_base,
                "cantidad": str(compra.cantidad),
                "unidad": compra.unidad,
                "precio_total": str(compra.precio_total),
                "envio_prorrateado": str(compra.envio),
                "iva_incluido": compra.iva_incluido,
                "alicuota": str(compra.alicuota),
                "costo_unitario_anterior": str(costo_insumo_anterior),
                "costo_unitario_calculado": str(compra.costo_unitario_calculado),
            }
        )

    return {
        "proveedor_id": proveedor.id,
        "proveedor_nombre": proveedor.nombre,
        "envio_total": str(
            envio_dec.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        ),
        "compras_creadas": compras_creadas,
        "productos_recalculados": productos_recalculados,
    }
