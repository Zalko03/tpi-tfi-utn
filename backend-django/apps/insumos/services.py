"""Servicios de lógica de negocio para conversión de unidades, costeo de insumos, compras y condición fiscal."""

import logging
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone

from apps.comun.notificaciones_node import notificar_evento_node
from apps.insumos.models import (
    CONDICION_EXENTO,
    CONDICION_MONOTRIBUTISTA,
    CONDICION_NO_DECLARADA,
    CONDICION_RESPONSABLE_INSCRIPTO,
    CONDICIONES_FISCALES_CHOICES,
    CONDICIONES_FISCALES_DECLARABLES,
)

logger = logging.getLogger(__name__)

MENSAJE_AVISO_CONDICION_NO_DECLARADA = (
    "Todavía no declaraste la condición fiscal del local. "
    "Por ahora los costos se calculan incluyendo IVA (lo que realmente pagás)."
)

ETIQUETAS_CONDICION_FISCAL = dict(CONDICIONES_FISCALES_CHOICES)

OPCIONES_CONDICION_FISCAL = [
    {
        "valor": CONDICION_RESPONSABLE_INSCRIPTO,
        "etiqueta": "Responsable Inscripto",
        "costear_con_iva": False,
        "descripcion": (
            "Calculamos tus costos sin IVA, porque el IVA de las compras te queda como crédito fiscal."
        ),
    },
    {
        "valor": CONDICION_MONOTRIBUTISTA,
        "etiqueta": "Monotributista",
        "costear_con_iva": True,
        "descripcion": (
            "Calculamos tus costos con IVA incluido, porque es lo que pagás al proveedor."
        ),
    },
    {
        "valor": CONDICION_EXENTO,
        "etiqueta": "IVA Exento",
        "costear_con_iva": True,
        "descripcion": (
            "Calculamos tus costos con IVA incluido, porque no se discrimina ni recupera."
        ),
    },
]

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

MAPA_UNIDAD_A_BASE = {origen: base for (origen, base) in FACTORES_CONVERSION.keys()}


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
            f"La unidad '{unidad_origen}' no es válida. Usá g, kg, mg, ml, cc, l, un o docena."
        )
    return MAPA_UNIDAD_A_BASE[origen]


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
            redondeado = proporcion.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            prorrateos.append(redondeado)
            acumulado += redondeado

    return prorrateos


def resolver_costear_con_iva_por_condicion(condicion_fiscal: str | None) -> bool:
    """
    Determina si los costos unitarios deben incluir IVA según la condición fiscal (HU14):
    - Responsable Inscripto: False (excluye IVA).
    - Monotributista, IVA Exento o Sin declarar (por defecto §0 2b): True (incluye IVA).
    """
    return condicion_fiscal != CONDICION_RESPONSABLE_INSCRIPTO


def obtener_criterio_iva_vigente() -> dict:
    """
    Consulta la configuración fiscal vigente del local (solo lectura).
    Si aún no fue declarada, aplica el criterio por defecto (costear_con_iva=True)
    e incluye el aviso obligatorio (CA14.2).
    """
    from apps.insumos.models import ConfiguracionLocal

    config = ConfiguracionLocal.objects.select_related("actualizado_por").order_by("id").first()
    condicion = config.condicion_fiscal if config else CONDICION_NO_DECLARADA
    declarada = condicion != CONDICION_NO_DECLARADA
    costear_con_iva = resolver_costear_con_iva_por_condicion(condicion)

    return {
        "condicion_fiscal": condicion,
        "condicion_fiscal_etiqueta": ETIQUETAS_CONDICION_FISCAL.get(condicion, "Sin declarar"),
        "declarada": declarada,
        "costear_con_iva": costear_con_iva,
        "aviso": None if declarada else MENSAJE_AVISO_CONDICION_NO_DECLARADA,
        "actualizado_en": config.actualizado_en.isoformat()
        if (config and config.actualizado_en)
        else None,
        "actualizado_por_username": (
            config.actualizado_por.username if (config and config.actualizado_por) else None
        ),
    }


def listar_historial_condicion_fiscal(limite: int = 20) -> list[dict]:
    """Devuelve el historial de cambios de condición fiscal ordenado del más reciente al más antiguo."""
    from apps.insumos.models import HistorialCondicionFiscal

    registros = HistorialCondicionFiscal.objects.select_related("modificado_por").all()[:limite]
    return [
        {
            "id": reg.id,
            "condicion_anterior": reg.condicion_anterior,
            "condicion_anterior_etiqueta": ETIQUETAS_CONDICION_FISCAL.get(
                reg.condicion_anterior, reg.condicion_anterior
            ),
            "condicion_nueva": reg.condicion_nueva,
            "condicion_nueva_etiqueta": ETIQUETAS_CONDICION_FISCAL.get(
                reg.condicion_nueva, reg.condicion_nueva
            ),
            "costear_con_iva_anterior": reg.costear_con_iva_anterior,
            "costear_con_iva_nuevo": reg.costear_con_iva_nuevo,
            "insumos_recalculados": reg.insumos_recalculados,
            "productos_recalculados": reg.productos_recalculados,
            "detalles": reg.detalles or {},
            "modificado_por_username": (
                reg.modificado_por.username if reg.modificado_por else None
            ),
            "fecha": reg.fecha.isoformat() if reg.fecha else None,
        }
        for reg in registros
    ]


def obtener_detalle_configuracion_fiscal(limite_historial: int = 20) -> dict:
    """Retorna la configuración fiscal completa, opciones disponibles e historial reciente."""
    estado = obtener_criterio_iva_vigente()
    return {
        **estado,
        "opciones": OPCIONES_CONDICION_FISCAL,
        "historial": listar_historial_condicion_fiscal(limite=limite_historial),
    }


@transaction.atomic
def registrar_compra_y_actualizar_costo(
    proveedor,
    insumo,
    precio_total: Decimal,
    cantidad: Decimal,
    unidad: str,
    envio: Decimal = Decimal("0.00"),
    iva_incluido: bool = True,
    alicuota: Decimal = Decimal("21.00"),
    costear_con_iva: bool | None = None,
    fecha=None,
):
    """
    Persiste una Compra, actualiza el costo_unitario vigente y stock_actual del Insumo,
    registra el movimiento real de ingreso en MovimientoStock
    y propaga el recálculo a las recetas afectadas.
    Si no se especifica costear_con_iva, aplica la condición fiscal vigente del local.
    """
    from apps.insumos.models import Compra, Insumo, MovimientoStock

    insumo_bloqueado = Insumo.objects.select_for_update().get(pk=insumo.pk)

    criterio_fiscal = None
    if costear_con_iva is None:
        criterio_fiscal = obtener_criterio_iva_vigente()
        costear_con_iva_aplicado = criterio_fiscal["costear_con_iva"]
        aviso_fiscal = criterio_fiscal["aviso"]
    else:
        costear_con_iva_aplicado = bool(costear_con_iva)
        aviso_fiscal = None

    cantidad_base = convertir_a_unidad_base(
        cantidad=Decimal(str(cantidad)),
        unidad_origen=unidad,
        unidad_base=insumo_bloqueado.unidad_base,
    )

    costo_unit = calcular_costo_unitario(
        precio_total=precio_total,
        cantidad=cantidad,
        unidad=unidad,
        unidad_base=insumo_bloqueado.unidad_base,
        envio=envio,
        iva_incluido=iva_incluido,
        alicuota=alicuota,
        costear_con_iva=costear_con_iva_aplicado,
    )

    datos = {
        "proveedor": proveedor,
        "insumo": insumo_bloqueado,
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

    stock_anterior = insumo_bloqueado.stock_actual
    stock_posterior = (stock_anterior + cantidad_base).quantize(
        Decimal("0.0001"), rounding=ROUND_HALF_UP
    )

    insumo_bloqueado.costo_unitario = costo_unit
    insumo_bloqueado.stock_actual = stock_posterior
    insumo_bloqueado.save(update_fields=["costo_unitario", "stock_actual", "actualizado_en"])

    # Mantiene sincronizada la instancia recibida en memoria para quienes la lean luego
    insumo.costo_unitario = costo_unit
    insumo.stock_actual = stock_posterior

    MovimientoStock.objects.create(
        insumo=insumo_bloqueado,
        tipo="INGRESO",
        subtipo="COMPRA",
        cantidad_base=cantidad_base,
        stock_anterior=stock_anterior,
        stock_posterior=stock_posterior,
        compra=compra,
        fecha=compra.fecha,
        motivo=f"Compra a {proveedor.nombre} ({cantidad} {unidad})",
    )

    # Recalcular recetas afectadas de forma explícita (T1.8)
    productos_recalculados = []
    try:
        from apps.recetas.services import recalcular_recetas_por_insumo

        productos_recalculados = recalcular_recetas_por_insumo(insumo_bloqueado.id)
    except ImportError:
        pass

    compra._productos_recalculados = productos_recalculados
    compra._costear_con_iva_aplicado = costear_con_iva_aplicado
    compra._aviso_fiscal = aviso_fiscal
    return compra


def _resolver_proveedor_importacion(
    proveedor_id: int | None = None, proveedor_nombre: str | None = None
):
    """Resuelve o da de alta el proveedor para una importación aprobada."""
    from apps.insumos.models import Proveedor

    if proveedor_id is not None:
        proveedor = Proveedor.objects.filter(id=proveedor_id, estado_activo=True).first()
        if not proveedor:
            raise ValueError(f"El proveedor con ID {proveedor_id} no existe o está inactivo.")
        return proveedor

    nombre_limpio = str(proveedor_nombre or "").strip()
    if not nombre_limpio:
        raise ValueError("Elegí o escribí un proveedor para registrar las compras.")

    proveedor = Proveedor.objects.filter(nombre__iexact=nombre_limpio).first()
    if proveedor:
        if not proveedor.estado_activo:
            raise ValueError(f"El proveedor '{proveedor.nombre}' se encuentra inactivo.")
        return proveedor

    return Proveedor.objects.create(nombre=nombre_limpio, estado_activo=True)


def _resolver_insumo_importacion(item: dict):
    """Resuelve un insumo existente por ID o nombre, o lo crea con su unidad base."""
    from apps.insumos.models import Insumo

    insumo_id = item.get("insumo_id") or item.get("insumo")
    if insumo_id is not None:
        insumo = Insumo.objects.filter(id=insumo_id, estado_activo=True).first()
        if not insumo:
            raise ValueError(f"El insumo con ID {insumo_id} no existe o está inactivo.")
        return insumo

    nombre_limpio = str(item.get("nombre_insumo") or "").strip()
    if not nombre_limpio:
        raise ValueError("Cada ítem debe indicar un insumo.")

    insumo = Insumo.objects.filter(nombre__iexact=nombre_limpio).first()
    if insumo:
        if not insumo.estado_activo:
            raise ValueError(f"El insumo '{insumo.nombre}' se encuentra inactivo.")
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
    costear_con_iva: bool | None = None,
) -> dict:
    """
    Registra de forma atómica un lote de compras aprobadas por el humano (T3.3):
    1. Resuelve el proveedor y cada insumo.
    2. Prorratea el envío total proporcionalmente al precio de cada línea (§3).
    3. Crea cada Compra y actualiza el costo_unitario del Insumo según la condición fiscal vigente.
    4. Recalcula todas las recetas afectadas y retorna tanto las compras como el
       desglose completo de productos recalculados para que Node persista
       historial_precios y snapshots_costeo.
    """
    if not items or not isinstance(items, list):
        raise ValueError("La lista de ítems a importar no puede estar vacía.")

    envio_dec = Decimal(str(envio_total or "0.00"))
    if envio_dec < Decimal("0"):
        raise ValueError("El costo de envío no puede ser negativo.")

    criterio_fiscal = obtener_criterio_iva_vigente()
    costear_con_iva_aplicado = (
        criterio_fiscal["costear_con_iva"] if costear_con_iva is None else bool(costear_con_iva)
    )

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
            costear_con_iva=costear_con_iva_aplicado,
        )

        productos_recalculados.extend(getattr(compra, "_productos_recalculados", []))

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
                "stock_actual": str(insumo.stock_actual),
            }
        )

    return {
        "proveedor_id": proveedor.id,
        "proveedor_nombre": proveedor.nombre,
        "envio_total": str(envio_dec.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        "condicion_fiscal": criterio_fiscal["condicion_fiscal"],
        "costear_con_iva": costear_con_iva_aplicado,
        "aviso_fiscal": criterio_fiscal["aviso"] if costear_con_iva is None else None,
        "compras_creadas": compras_creadas,
        "productos_recalculados": productos_recalculados,
    }


def _recalcular_costos_por_condicion_fiscal(costear_con_iva: bool) -> dict:
    """
    Recalcula el costo_unitario de cada insumo activo a partir de su última compra
    según el criterio de IVA vigente y propaga el recálculo a los productos afectados.
    """
    from apps.insumos.models import Compra, Insumo
    from apps.recetas.models import Producto, RecetaItem
    from apps.recetas.services import calcular_margen_y_ganancia, obtener_desglose_costeo_producto

    ahora = timezone.now()
    ultimas_compras_por_insumo = {}
    compras_qs = (
        Compra.objects.filter(insumo__estado_activo=True)
        .select_related("insumo")
        .order_by("insumo_id", "-fecha", "-id")
    )
    for compra in compras_qs:
        if compra.insumo_id not in ultimas_compras_por_insumo:
            ultimas_compras_por_insumo[compra.insumo_id] = compra

    insumos_a_actualizar = []
    insumos_detalle = []

    for insumo_id, compra in ultimas_compras_por_insumo.items():
        insumo = compra.insumo
        try:
            nuevo_costo = calcular_costo_unitario(
                precio_total=compra.precio_total,
                cantidad=compra.cantidad,
                unidad=compra.unidad,
                unidad_base=insumo.unidad_base,
                envio=compra.envio,
                iva_incluido=compra.iva_incluido,
                alicuota=compra.alicuota,
                costear_con_iva=costear_con_iva,
            )
        except ValueError:
            continue

        if nuevo_costo != insumo.costo_unitario:
            costo_anterior = insumo.costo_unitario
            insumo.costo_unitario = nuevo_costo
            insumo.actualizado_en = ahora
            insumos_a_actualizar.append(insumo)
            insumos_detalle.append(
                {
                    "insumo_id": insumo_id,
                    "nombre": insumo.nombre,
                    "costo_anterior": str(costo_anterior),
                    "costo_nuevo": str(nuevo_costo),
                }
            )

    if insumos_a_actualizar:
        Insumo.objects.bulk_update(insumos_a_actualizar, ["costo_unitario", "actualizado_en"])

    if not insumos_a_actualizar:
        return {"insumos": [], "productos": []}

    ids_insumos = [ins.id for ins in insumos_a_actualizar]
    productos_afectados = list(
        Producto.objects.filter(
            receta_items__insumo_id__in=ids_insumos,
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

    productos_detalle = []
    if productos_afectados:
        for prod in productos_afectados:
            costo_anterior = prod.costo_total_calculado
            desglose = obtener_desglose_costeo_producto(prod)
            ganancia, margen = calcular_margen_y_ganancia(
                prod.precio_venta, desglose["costo_total"]
            )
            prod.costo_total_calculado = desglose["costo_total"]
            prod.ganancia_bruta = ganancia
            prod.margen_bruto = margen
            prod.actualizado_en = ahora

            productos_detalle.append(
                {
                    "producto_id": prod.id,
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

    return {"insumos": insumos_detalle, "productos": productos_detalle}


@transaction.atomic
def _persistir_cambio_condicion_fiscal(condicion_nueva: str, usuario=None) -> dict:
    """Guarda la condición fiscal del local, recalcula insumos/recetas y registra historial."""
    from apps.insumos.models import ConfiguracionLocal, HistorialCondicionFiscal

    if condicion_nueva not in CONDICIONES_FISCALES_DECLARABLES:
        raise ValueError(
            "Elegí una condición fiscal válida (Responsable Inscripto, Monotributista o IVA Exento)."
        )

    config = ConfiguracionLocal.objects.select_for_update().order_by("id").first()
    if config is None:
        config = ConfiguracionLocal.objects.create(
            condicion_fiscal=CONDICION_NO_DECLARADA,
        )

    condicion_anterior = config.condicion_fiscal
    costear_anterior = config.costear_con_iva

    if condicion_nueva == condicion_anterior:
        return {
            "cambio_realizado": False,
            "condicion_anterior": condicion_anterior,
            "condicion_nueva": condicion_nueva,
            "costear_con_iva": costear_anterior,
            "insumos_recalculados": [],
            "productos_recalculados": [],
        }

    config.condicion_fiscal = condicion_nueva
    config.actualizado_por = (
        usuario if (usuario and getattr(usuario, "is_authenticated", False)) else None
    )
    config.save(update_fields=["condicion_fiscal", "actualizado_por", "actualizado_en"])
    costear_nuevo = config.costear_con_iva

    if costear_nuevo != costear_anterior:
        recalculo = _recalcular_costos_por_condicion_fiscal(costear_nuevo)
    else:
        recalculo = {"insumos": [], "productos": []}

    insumos_recalculados = recalculo["insumos"]
    productos_recalculados = recalculo["productos"]

    HistorialCondicionFiscal.objects.create(
        condicion_anterior=condicion_anterior,
        condicion_nueva=condicion_nueva,
        costear_con_iva_anterior=costear_anterior,
        costear_con_iva_nuevo=costear_nuevo,
        insumos_recalculados=len(insumos_recalculados),
        productos_recalculados=len(productos_recalculados),
        detalles={
            "insumos": insumos_recalculados,
            "productos": [
                {
                    "producto_id": p["producto_id"],
                    "nombre": p["nombre"],
                    "costo_anterior": p["costo_anterior"],
                    "costo_nuevo": p["costo_nuevo"],
                    "margen_nuevo": p["margen_nuevo"],
                }
                for p in productos_recalculados
            ],
        },
        modificado_por=config.actualizado_por,
    )

    return {
        "cambio_realizado": True,
        "condicion_anterior": condicion_anterior,
        "condicion_nueva": condicion_nueva,
        "costear_con_iva": costear_nuevo,
        "insumos_recalculados": insumos_recalculados,
        "productos_recalculados": productos_recalculados,
    }


def _notificar_recalculo_fiscal_node(resultado_cambio: dict) -> None:
    """Notifica a backend-node los productos recalculados tras un cambio fiscal (best-effort)."""
    productos = resultado_cambio.get("productos_recalculados") or []
    if not productos:
        return

    etiqueta_ant = ETIQUETAS_CONDICION_FISCAL.get(
        resultado_cambio["condicion_anterior"], resultado_cambio["condicion_anterior"]
    )
    etiqueta_nueva = ETIQUETAS_CONDICION_FISCAL.get(
        resultado_cambio["condicion_nueva"], resultado_cambio["condicion_nueva"]
    )
    payload = {
        "motivo": f"Cambio de condición fiscal ({etiqueta_ant} → {etiqueta_nueva})",
        "condicionFiscal": resultado_cambio["condicion_nueva"],
        "costearConIva": resultado_cambio["costear_con_iva"],
        "productosRecalculados": [
            {
                "productoId": p["producto_id"],
                "nombre": p["nombre"],
                "costoAnterior": p["costo_anterior"],
                "costoNuevo": p["costo_nuevo"],
                "margenNuevo": p["margen_nuevo"],
                "costoManoObra": p["costo_mano_obra"],
                "costoDescartables": p["costo_descartables"],
                "desgloseInsumos": [
                    {
                        "insumoId": d["insumo_id"],
                        "nombre": d["nombre"],
                        "cantidad": d["cantidad"],
                        "unidad": d["unidad"],
                        "costoUnitario": d["costo_unitario"],
                        "costoLinea": d["costo_linea"],
                    }
                    for d in p["desglose_insumos"]
                ],
            }
            for p in productos
        ],
    }
    try:
        notificar_evento_node("costos.recalculados", payload)
    except Exception:
        logger.exception("Error inesperado al notificar recálculo fiscal a backend-node")


def actualizar_condicion_fiscal(condicion_nueva: str, usuario=None) -> dict:
    """
    Actualiza la condición fiscal del local, recalcula insumos/productos afectados,
    registra el historial en PostgreSQL y notifica a Node tras confirmar la transacción (HU14).
    """
    resultado = _persistir_cambio_condicion_fiscal(condicion_nueva=condicion_nueva, usuario=usuario)
    if resultado["cambio_realizado"] and resultado["productos_recalculados"]:
        _notificar_recalculo_fiscal_node(resultado)

    detalle = obtener_detalle_configuracion_fiscal()
    return {
        **detalle,
        "cambio_realizado": resultado["cambio_realizado"],
        "insumos_recalculados": len(resultado["insumos_recalculados"]),
        "productos_recalculados": len(resultado["productos_recalculados"]),
    }


def _convertir_seguro_a_base(cantidad: Decimal, unidad: str, unidad_base: str) -> Decimal:
    """Convierte a unidad base si es compatible; si no, retorna la cantidad original."""
    try:
        return convertir_a_unidad_base(cantidad, unidad, unidad_base)
    except ValueError:
        return Decimal(str(cantidad)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def construir_payload_stock_bajo(insumo) -> dict:
    """Construye el payload estándar de alerta de stock bajo para Socket.IO (CA12.2)."""
    return {
        "insumoId": insumo.id,
        "nombre": insumo.nombre,
        "stockActual": str(insumo.stock_actual),
        "stockMinimo": str(insumo.stock_minimo),
        "unidadBase": insumo.unidad_base,
    }


def notificar_stock_bajo_alertas(alertas: list[dict]) -> None:
    """Notifica a backend-node las alertas de stock bajo fuera de la transacción (best-effort)."""
    for alerta in alertas or []:
        try:
            notificar_evento_node("stock.bajo", alerta)
        except Exception:
            logger.exception(
                "Error inesperado al notificar stock.bajo para insumo #%s",
                alerta.get("insumoId"),
            )


def descontar_stock_por_venta(venta, items_venta: list, usuario=None) -> list[dict]:
    """
    Descuenta del stock_actual de cada insumo las cantidades requeridas por la receta
    de los productos vendidos en unidad base (CA12.1) y registra MovimientoStock.
    Debe ejecutarse dentro de una transacción atómica.
    Retorna los payloads de alerta 'stock.bajo' para los insumos que quedaron bajo mínimo.
    """
    from apps.insumos.models import Insumo, MovimientoStock
    from apps.recetas.models import RecetaItem

    if not items_venta:
        return []

    cantidad_por_producto: dict[int, Decimal] = {}
    for item_venta in items_venta:
        prod_id = item_venta.producto_id
        if not prod_id:
            continue
        cant = (
            item_venta.cantidad
            if isinstance(item_venta.cantidad, Decimal)
            else Decimal(str(item_venta.cantidad))
        )
        cantidad_por_producto[prod_id] = cantidad_por_producto.get(prod_id, Decimal("0")) + cant

    if not cantidad_por_producto:
        return []

    receta_items = list(
        RecetaItem.objects.filter(producto_id__in=cantidad_por_producto.keys())
        .select_related("insumo")
        .order_by("insumo_id", "id")
    )
    if not receta_items:
        return []

    consumo_por_insumo: dict[int, Decimal] = {}
    for r_item in receta_items:
        cant_vendida = cantidad_por_producto.get(r_item.producto_id, Decimal("0"))
        if cant_vendida <= Decimal("0"):
            continue
        cant_base = convertir_a_unidad_base(
            cantidad=r_item.cantidad * cant_vendida,
            unidad_origen=r_item.unidad,
            unidad_base=r_item.insumo.unidad_base,
        )
        consumo_por_insumo[r_item.insumo_id] = (
            consumo_por_insumo.get(r_item.insumo_id, Decimal("0")) + cant_base
        )

    if not consumo_por_insumo:
        return []

    # Bloqueo determinístico por id ascendente para prevenir deadlocks en PostgreSQL
    ids_ordenados = sorted(consumo_por_insumo.keys())
    insumos_bloqueados = list(
        Insumo.objects.select_for_update().filter(id__in=ids_ordenados).order_by("id")
    )

    ahora = timezone.now()
    movimientos_a_crear = []
    alertas_stock_bajo = []
    usuario_valido = (
        usuario if (usuario is not None and getattr(usuario, "pk", None) is not None) else None
    )

    for insumo in insumos_bloqueados:
        consumo = consumo_por_insumo[insumo.id].quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        if consumo <= Decimal("0"):
            continue
        stock_anterior = insumo.stock_actual
        stock_posterior = (stock_anterior - consumo).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        )
        insumo.stock_actual = stock_posterior
        insumo.actualizado_en = ahora

        movimientos_a_crear.append(
            MovimientoStock(
                insumo=insumo,
                tipo="EGRESO",
                subtipo="VENTA_RECETA",
                cantidad_base=consumo,
                stock_anterior=stock_anterior,
                stock_posterior=stock_posterior,
                venta=venta,
                usuario=usuario_valido,
                fecha=venta.fecha,
                motivo=f"Consumo por venta #{venta.id}",
            )
        )

        if insumo.stock_bajo:
            alertas_stock_bajo.append(construir_payload_stock_bajo(insumo))

    if insumos_bloqueados:
        Insumo.objects.bulk_update(insumos_bloqueados, ["stock_actual", "actualizado_en"])
    if movimientos_a_crear:
        MovimientoStock.objects.bulk_create(movimientos_a_crear)

    return alertas_stock_bajo


def devolver_stock_por_anulacion_venta(venta, usuario=None) -> list[int]:
    """
    Devuelve al stock_actual de cada insumo las cantidades previamente descontadas
    por una venta al momento de anularla, registrando MovimientoStock (ANULACION_VENTA).
    Debe ejecutarse dentro de una transacción atómica.
    """
    from apps.insumos.models import Insumo, MovimientoStock

    if MovimientoStock.objects.filter(
        venta=venta, tipo="INGRESO", subtipo="ANULACION_VENTA"
    ).exists():
        return []

    egresos = list(
        MovimientoStock.objects.filter(
            venta=venta,
            tipo="EGRESO",
            subtipo="VENTA_RECETA",
        ).order_by("insumo_id", "id")
    )
    if not egresos:
        return []

    devolucion_por_insumo: dict[int, Decimal] = {}
    for mov in egresos:
        devolucion_por_insumo[mov.insumo_id] = (
            devolucion_por_insumo.get(mov.insumo_id, Decimal("0")) + mov.cantidad_base
        )

    ids_ordenados = sorted(devolucion_por_insumo.keys())
    insumos_bloqueados = list(
        Insumo.objects.select_for_update().filter(id__in=ids_ordenados).order_by("id")
    )

    ahora = timezone.now()
    fecha_anul = venta.anulada_en or ahora
    usuario_valido = (
        usuario if (usuario is not None and getattr(usuario, "pk", None) is not None) else None
    )
    movimientos_a_crear = []

    for insumo in insumos_bloqueados:
        devolucion = devolucion_por_insumo[insumo.id].quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        )
        if devolucion <= Decimal("0"):
            continue
        stock_anterior = insumo.stock_actual
        stock_posterior = (stock_anterior + devolucion).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        )
        insumo.stock_actual = stock_posterior
        insumo.actualizado_en = ahora

        movimientos_a_crear.append(
            MovimientoStock(
                insumo=insumo,
                tipo="INGRESO",
                subtipo="ANULACION_VENTA",
                cantidad_base=devolucion,
                stock_anterior=stock_anterior,
                stock_posterior=stock_posterior,
                venta=venta,
                usuario=usuario_valido,
                fecha=fecha_anul,
                motivo=f"Devolución por anulación de venta #{venta.id}",
            )
        )

    if insumos_bloqueados:
        Insumo.objects.bulk_update(insumos_bloqueados, ["stock_actual", "actualizado_en"])
    if movimientos_a_crear:
        MovimientoStock.objects.bulk_create(movimientos_a_crear)

    return ids_ordenados


@transaction.atomic
def _persistir_ajuste_stock_atomico(
    insumo_id: int,
    tipo: str,
    cantidad: Decimal,
    unidad: str | None = None,
    motivo: str = "",
    usuario=None,
) -> dict:
    from apps.insumos.models import Insumo, MovimientoStock

    tipo_norm = str(tipo or "").strip().upper()
    if tipo_norm not in ("INGRESO", "EGRESO"):
        raise ValueError("El tipo de ajuste debe ser INGRESO o EGRESO.")

    insumo = Insumo.objects.select_for_update().filter(id=insumo_id, estado_activo=True).first()
    if insumo is None:
        raise ValueError(f"El insumo con ID {insumo_id} no existe o está inactivo.")

    unidad_origen = normalizar_unidad(unidad) or insumo.unidad_base
    cantidad_base = convertir_a_unidad_base(
        cantidad=Decimal(str(cantidad)),
        unidad_origen=unidad_origen,
        unidad_base=insumo.unidad_base,
    )

    stock_anterior = insumo.stock_actual
    delta = cantidad_base if tipo_norm == "INGRESO" else -cantidad_base
    stock_posterior = (stock_anterior + delta).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

    insumo.stock_actual = stock_posterior
    insumo.save(update_fields=["stock_actual", "actualizado_en"])

    usuario_valido = (
        usuario if (usuario is not None and getattr(usuario, "pk", None) is not None) else None
    )
    motivo_limpio = str(motivo or "").strip()[:255] or "Ajuste manual de inventario"

    movimiento = MovimientoStock.objects.create(
        insumo=insumo,
        tipo=tipo_norm,
        subtipo="AJUSTE_MANUAL",
        cantidad_base=cantidad_base,
        stock_anterior=stock_anterior,
        stock_posterior=stock_posterior,
        usuario=usuario_valido,
        motivo=motivo_limpio,
    )

    alerta_payload = (
        construir_payload_stock_bajo(insumo)
        if tipo_norm == "EGRESO" and insumo.stock_bajo
        else None
    )
    return {
        "insumo": insumo,
        "movimiento": movimiento,
        "alerta_payload": alerta_payload,
    }


def ajustar_stock_insumo(
    insumo_id: int,
    tipo: str,
    cantidad: Decimal,
    unidad: str | None = None,
    motivo: str = "",
    usuario=None,
) -> dict:
    """
    Registra un ajuste manual de stock (INGRESO o EGRESO) sobre un insumo activo
    y emite alerta 'stock.bajo' si tras un egreso quedó por debajo de su mínimo.
    """
    resultado = _persistir_ajuste_stock_atomico(
        insumo_id=insumo_id,
        tipo=tipo,
        cantidad=cantidad,
        unidad=unidad,
        motivo=motivo,
        usuario=usuario,
    )
    if resultado["alerta_payload"] is not None:
        notificar_stock_bajo_alertas([resultado["alerta_payload"]])

    insumo = resultado["insumo"]
    return {
        "insumo": insumo,
        "movimiento": resultado["movimiento"],
        "alerta_stock_bajo": insumo.stock_bajo,
    }


def listar_insumos_stock_bajo():
    """Retorna insumos activos cuyo stock_actual está por debajo de un stock_minimo > 0."""
    from django.db.models import F

    from apps.insumos.models import Insumo

    return Insumo.objects.filter(
        estado_activo=True,
        stock_minimo__gt=Decimal("0.0000"),
        stock_actual__lt=F("stock_minimo"),
    ).order_by("nombre")


def listar_movimientos_stock_reales(
    fecha_desde=None,
    fecha_hasta=None,
    insumo_id: int | None = None,
    tipo: str | None = None,
    subtipo: str | None = None,
    limite: int = 100,
):
    """Consulta los movimientos reales persistidos en MovimientoStock."""
    from apps.insumos.models import MovimientoStock

    qs = MovimientoStock.objects.select_related("insumo", "usuario", "compra", "venta").all()
    if fecha_desde is not None:
        qs = qs.filter(fecha__gte=fecha_desde)
    if fecha_hasta is not None:
        qs = qs.filter(fecha__lte=fecha_hasta)
    if insumo_id is not None:
        qs = qs.filter(insumo_id=insumo_id)
    if tipo:
        qs = qs.filter(tipo=str(tipo).strip().upper())
    if subtipo:
        qs = qs.filter(subtipo=str(subtipo).strip().upper())
    # Tope de 500 filas: el historial completo se recorre filtrando por fechas, no con un límite enorme.
    return qs[: min(500, max(1, int(limite or 100)))]


def obtener_movimientos_stock_trazabilidad(
    fecha_desde=None,
    fecha_hasta=None,
    insumo_id: int | None = None,
    tipo: str | None = None,
    incluir_costos: bool = True,
) -> list[dict]:
    """
    Construye la trazabilidad de movimientos de insumos/stock combinando:
    - INGRESO (COMPRA): compras registradas a proveedores (Compra).
    - EGRESO (VENTA_RECETA): consumo por recetas de ítems de ventas EMITIDAS (VentaItem -> RecetaItem).
    - INGRESO / EGRESO (AJUSTE_MANUAL): ajustes manuales de inventario (MovimientoStock).
    """
    from apps.insumos.models import Compra, MovimientoStock
    from apps.ventas.models import VentaItem

    tipo_norm = str(tipo or "").strip().upper()
    movimientos: list[dict] = []

    if tipo_norm in ("", "INGRESO"):
        qs_compras = Compra.objects.select_related("proveedor", "insumo").all()
        if fecha_desde is not None:
            qs_compras = qs_compras.filter(fecha__gte=fecha_desde)
        if fecha_hasta is not None:
            qs_compras = qs_compras.filter(fecha__lte=fecha_hasta)
        if insumo_id is not None:
            qs_compras = qs_compras.filter(insumo_id=insumo_id)

        for compra in qs_compras:
            cant_base = _convertir_seguro_a_base(
                compra.cantidad, compra.unidad, compra.insumo.unidad_base
            )
            movimientos.append(
                {
                    "id": f"compra-{compra.id}",
                    "origen_id": compra.id,
                    "fecha": compra.fecha.isoformat(),
                    "tipo": "INGRESO",
                    "subtipo": "COMPRA",
                    "insumo_id": compra.insumo_id,
                    "insumo_nombre": compra.insumo.nombre,
                    "cantidad": str(compra.cantidad),
                    "unidad": compra.unidad,
                    "cantidad_base": str(cant_base),
                    "unidad_base": compra.insumo.unidad_base,
                    "monto": str(compra.precio_total) if incluir_costos else None,
                    "detalle": f"Compra a {compra.proveedor.nombre}",
                    "usuario_nombre": "Gerencia / Compras",
                }
            )

    if tipo_norm in ("", "EGRESO"):
        qs_items = (
            VentaItem.objects.filter(venta__estado="EMITIDA")
            .select_related(
                "venta",
                "venta__turno_caja__usuario",
                "producto",
            )
            .prefetch_related("producto__receta_items__insumo")
        )

        if fecha_desde is not None:
            qs_items = qs_items.filter(venta__fecha__gte=fecha_desde)
        if fecha_hasta is not None:
            qs_items = qs_items.filter(venta__fecha__lte=fecha_hasta)
        if insumo_id is not None:
            qs_items = qs_items.filter(producto__receta_items__insumo_id=insumo_id).distinct()

        for venta_item in qs_items:
            venta = venta_item.venta
            usuario_nombre = (
                venta.turno_caja.usuario.username
                if venta.turno_caja and venta.turno_caja.usuario
                else "Mostrador"
            )
            for receta_item in venta_item.producto.receta_items.all():
                if insumo_id is not None and receta_item.insumo_id != insumo_id:
                    continue
                cant_consumida = (receta_item.cantidad * venta_item.cantidad).quantize(
                    Decimal("0.0001"), rounding=ROUND_HALF_UP
                )
                cant_base = _convertir_seguro_a_base(
                    cant_consumida, receta_item.unidad, receta_item.insumo.unidad_base
                )
                costo_consumo = (
                    (cant_base * receta_item.insumo.costo_unitario).quantize(
                        Decimal("0.01"), rounding=ROUND_HALF_UP
                    )
                    if incluir_costos
                    else None
                )
                movimientos.append(
                    {
                        "id": f"venta-{venta.id}-item-{venta_item.id}-receta-{receta_item.id}",
                        "origen_id": venta.id,
                        "fecha": venta.fecha.isoformat(),
                        "tipo": "EGRESO",
                        "subtipo": "VENTA_RECETA",
                        "insumo_id": receta_item.insumo_id,
                        "insumo_nombre": receta_item.insumo.nombre,
                        "cantidad": str(cant_consumida),
                        "unidad": receta_item.unidad,
                        "cantidad_base": str(cant_base),
                        "unidad_base": receta_item.insumo.unidad_base,
                        "monto": str(costo_consumo) if costo_consumo is not None else None,
                        "detalle": (
                            f"Consumo venta #{venta.id} "
                            f"({venta_item.cantidad}x {venta_item.producto.nombre})"
                        ),
                        "usuario_nombre": usuario_nombre,
                    }
                )

    qs_ajustes = MovimientoStock.objects.filter(subtipo="AJUSTE_MANUAL").select_related(
        "insumo", "usuario"
    )
    if tipo_norm in ("INGRESO", "EGRESO"):
        qs_ajustes = qs_ajustes.filter(tipo=tipo_norm)
    if fecha_desde is not None:
        qs_ajustes = qs_ajustes.filter(fecha__gte=fecha_desde)
    if fecha_hasta is not None:
        qs_ajustes = qs_ajustes.filter(fecha__lte=fecha_hasta)
    if insumo_id is not None:
        qs_ajustes = qs_ajustes.filter(insumo_id=insumo_id)

    for ajuste in qs_ajustes:
        movimientos.append(
            {
                "id": f"ajuste-{ajuste.id}",
                "origen_id": ajuste.id,
                "fecha": ajuste.fecha.isoformat(),
                "tipo": ajuste.tipo,
                "subtipo": ajuste.subtipo,
                "insumo_id": ajuste.insumo_id,
                "insumo_nombre": ajuste.insumo.nombre,
                "cantidad": str(ajuste.cantidad_base),
                "unidad": ajuste.insumo.unidad_base,
                "cantidad_base": str(ajuste.cantidad_base),
                "unidad_base": ajuste.insumo.unidad_base,
                "monto": None,
                "detalle": ajuste.motivo or "Ajuste manual de inventario",
                "usuario_nombre": ajuste.usuario.username if ajuste.usuario else "Gerencia",
            }
        )

    movimientos.sort(key=lambda m: (m["fecha"], str(m["id"])), reverse=True)
    return movimientos
