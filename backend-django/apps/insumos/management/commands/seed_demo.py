"""Comando seed_demo: puebla la base de datos con catálogo gastronómico realista y datos de muestra."""

import os
import uuid
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.caja.models import MovimientoCaja, TurnoCaja
from apps.insumos.models import Compra, Insumo, Proveedor
from apps.insumos.services import registrar_compra_y_actualizar_costo
from apps.recetas.models import Producto, RecetaItem
from apps.recetas.services import actualizar_costo_y_margen_producto
from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO, ROL_ENCARGADO
from apps.usuarios.models import PerfilUsuario
from apps.ventas.models import Venta
from apps.ventas.services import anular_venta, registrar_venta


def _uuid_seed_video(clave: str) -> uuid.UUID:
    """Genera un UUID v5 determinístico para garantizar idempotencia en ventas de demo."""
    return uuid.uuid5(uuid.NAMESPACE_DNS, f"sapori-seed-video:{clave}")


def _fecha_historica_local(ahora, dias_atras: int, hora: int, minuto: int = 0):
    """Devuelve un datetime aware en horario local para un día histórico específico."""
    local_ahora = timezone.localtime(ahora)
    return (local_ahora - timedelta(days=dias_atras)).replace(
        hour=hora,
        minute=minuto,
        second=0,
        microsecond=0,
    )


def _fecha_hoy_pasada(ahora, minutos_atras: int):
    """Devuelve un datetime aware de hoy nunca posterior a ahora ni anterior a las 00:00 locales."""
    local_ahora = timezone.localtime(ahora)
    inicio_hoy = local_ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    return max(inicio_hoy, local_ahora - timedelta(minutes=minutos_atras))


def _asegurar_usuarios_demo(stdout, style, password_demo: str) -> dict[str, User]:
    """
    Crea los usuarios de demostración si no existen.
    Nunca borra usuarios ni sobrescribe contraseñas o permisos ya configurados.
    """
    usuarios_demo = [
        ("duenio_demo", "Dueño", "Demo", "duenio@cafedemo.local", ROL_DUENIO),
        ("encargado_demo", "Encargado", "Demo", "encargado@cafedemo.local", ROL_ENCARGADO),
        ("cajero_demo", "Cajero", "Demo", "cajero@cafedemo.local", ROL_CAJERO),
    ]
    usuarios_instancias = {}
    for username, first_name, last_name, email, rol in usuarios_demo:
        u, creado = User.objects.get_or_create(
            username=username,
            defaults={
                "first_name": first_name,
                "last_name": last_name,
                "email": email,
                "is_active": True,
            },
        )
        if creado:
            if password_demo:
                u.set_password(password_demo)
            else:
                u.set_unusable_password()
            u.save(update_fields=["password"])

        perfil, perfil_creado = PerfilUsuario.objects.get_or_create(
            usuario=u,
            defaults={"rol": rol},
        )
        if not perfil_creado and not perfil.rol:
            perfil.rol = rol
            perfil.save(update_fields=["rol", "actualizado_en"])

        usuarios_instancias[rol] = u

    stdout.write(
        style.SUCCESS("Usuarios de prueba listos (duenio_demo, encargado_demo, cajero_demo).")
    )
    return usuarios_instancias


def _asegurar_insumos_y_compras() -> dict[str, Insumo]:
    """Crea proveedores, insumos y compras iniciales de forma idempotente."""
    prov_cafe, _ = Proveedor.objects.get_or_create(nombre="Distribuidora Central de Café")
    prov_lacteos, _ = Proveedor.objects.get_or_create(nombre="Lácteos del Valle")
    prov_molino, _ = Proveedor.objects.get_or_create(nombre="Molino Harinero del Sur")
    prov_descartables, _ = Proveedor.objects.get_or_create(
        nombre="Envases y Descartables San Jorge"
    )
    prov_chocolates, _ = Proveedor.objects.get_or_create(
        nombre="Chocolates y Especialidades Andinas"
    )

    definiciones_insumos = [
        ("Café Especialidad Colombia", "g", Decimal("28.0000")),
        ("Café Geisha Panamá Lote Especial", "g", Decimal("85.0000")),
        ("Leche Barista Entera", "ml", Decimal("1.4000")),
        ("Bebida de Almendras Barista", "ml", Decimal("3.2000")),
        ("Harina de Trigo 000 Orgánica", "g", Decimal("1.8000")),
        ("Harina de Mandioca", "g", Decimal("4.5000")),
        ("Manteca Calidad Extra 82%", "g", Decimal("14.0000")),
        ("Queso Criollo", "g", Decimal("9.5000")),
        ("Chocolate Cobertura Semiamargo 70%", "g", Decimal("22.0000")),
        ("Azúcar Mascabo Natural", "g", Decimal("2.5000")),
        ("Vaso Polipapel 240ml", "un", Decimal("80.0000")),
        ("Bolsa Kraft Panadería", "un", Decimal("45.0000")),
    ]

    insumos_dict = {}
    for nombre_insumo, unidad_base, costo_inicial in definiciones_insumos:
        insumo, creado = Insumo.objects.get_or_create(
            nombre=nombre_insumo,
            defaults={"unidad_base": unidad_base, "costo_unitario": costo_inicial},
        )
        if (
            not creado
            and insumo.costo_unitario != costo_inicial
            and not Compra.objects.filter(insumo=insumo).exists()
        ):
            insumo.costo_unitario = costo_inicial
            insumo.unidad_base = unidad_base
            insumo.save(update_fields=["costo_unitario", "unidad_base", "actualizado_en"])
        insumos_dict[nombre_insumo] = insumo

    compras_a_registrar = [
        (
            prov_cafe,
            insumos_dict["Café Especialidad Colombia"],
            Decimal("26000.00"),
            Decimal("1"),
            "kg",
            Decimal("2000.00"),
        ),
        (
            prov_cafe,
            insumos_dict["Café Geisha Panamá Lote Especial"],
            Decimal("40000.00"),
            Decimal("500"),
            "g",
            Decimal("2500.00"),
        ),
        (
            prov_lacteos,
            insumos_dict["Leche Barista Entera"],
            Decimal("14000.00"),
            Decimal("10"),
            "l",
            Decimal("0.00"),
        ),
        (
            prov_lacteos,
            insumos_dict["Bebida de Almendras Barista"],
            Decimal("16000.00"),
            Decimal("5"),
            "l",
            Decimal("0.00"),
        ),
        (
            prov_lacteos,
            insumos_dict["Manteca Calidad Extra 82%"],
            Decimal("28000.00"),
            Decimal("2"),
            "kg",
            Decimal("0.00"),
        ),
        (
            prov_lacteos,
            insumos_dict["Queso Criollo"],
            Decimal("28500.00"),
            Decimal("3"),
            "kg",
            Decimal("0.00"),
        ),
        (
            prov_molino,
            insumos_dict["Harina de Trigo 000 Orgánica"],
            Decimal("18000.00"),
            Decimal("10"),
            "kg",
            Decimal("0.00"),
        ),
        (
            prov_molino,
            insumos_dict["Harina de Mandioca"],
            Decimal("22500.00"),
            Decimal("5"),
            "kg",
            Decimal("0.00"),
        ),
        (
            prov_molino,
            insumos_dict["Azúcar Mascabo Natural"],
            Decimal("12500.00"),
            Decimal("5"),
            "kg",
            Decimal("0.00"),
        ),
        (
            prov_chocolates,
            insumos_dict["Chocolate Cobertura Semiamargo 70%"],
            Decimal("44000.00"),
            Decimal("2"),
            "kg",
            Decimal("0.00"),
        ),
        (
            prov_descartables,
            insumos_dict["Vaso Polipapel 240ml"],
            Decimal("8000.00"),
            Decimal("100"),
            "un",
            Decimal("0.00"),
        ),
        (
            prov_descartables,
            insumos_dict["Bolsa Kraft Panadería"],
            Decimal("4500.00"),
            Decimal("100"),
            "un",
            Decimal("0.00"),
        ),
    ]

    for prov, ins, precio, cant, unidad, envio in compras_a_registrar:
        if not Compra.objects.filter(insumo=ins).exists():
            registrar_compra_y_actualizar_costo(
                proveedor=prov,
                insumo=ins,
                precio_total=precio,
                cantidad=cant,
                unidad=unidad,
                envio=envio,
                iva_incluido=True,
            )

    return insumos_dict


def _asegurar_productos_y_recetas(
    insumos_dict: dict[str, Insumo],
    incluir_margen_bajo: bool = False,
) -> dict[str, Producto]:
    """Crea o actualiza el catálogo de productos con sus recetas y recalcula costos y márgenes."""
    definiciones_productos = [
        {
            "nombre": "Café Espresso",
            "codigo_barras": "7790001000011",
            "precio_venta": Decimal("2200.00"),
            "minutos_mo": Decimal("1.00"),
            "costo_hora_mo": Decimal("2500.00"),
            "descartables": Decimal("0.00"),
            "receta": [
                (insumos_dict["Café Especialidad Colombia"], Decimal("18.0000"), "g"),
            ],
        },
        {
            "nombre": "Café Latte",
            "codigo_barras": "7790001000028",
            "precio_venta": Decimal("3800.00"),
            "minutos_mo": Decimal("2.00"),
            "costo_hora_mo": Decimal("2500.00"),
            "descartables": Decimal("80.00"),
            "receta": [
                (insumos_dict["Café Especialidad Colombia"], Decimal("18.0000"), "g"),
                (insumos_dict["Leche Barista Entera"], Decimal("220.0000"), "ml"),
            ],
        },
        {
            "nombre": "Flat White Especial",
            "codigo_barras": "7790001000035",
            "precio_venta": Decimal("4200.00"),
            "minutos_mo": Decimal("2.00"),
            "costo_hora_mo": Decimal("2500.00"),
            "descartables": Decimal("80.00"),
            "receta": [
                (insumos_dict["Café Especialidad Colombia"], Decimal("20.0000"), "g"),
                (insumos_dict["Leche Barista Entera"], Decimal("160.0000"), "ml"),
            ],
        },
        {
            "nombre": "Filtrado Geisha Origen Único",
            "codigo_barras": "7790001000059",
            "precio_venta": Decimal("7500.00"),
            "minutos_mo": Decimal("4.00"),
            "costo_hora_mo": Decimal("2500.00"),
            "descartables": Decimal("80.00"),
            "receta": [
                (insumos_dict["Café Geisha Panamá Lote Especial"], Decimal("22.0000"), "g"),
            ],
        },
        {
            "nombre": "Capuccino Italiano",
            "codigo_barras": "7790001000066",
            "precio_venta": Decimal("4100.00"),
            "minutos_mo": Decimal("2.50"),
            "costo_hora_mo": Decimal("2500.00"),
            "descartables": Decimal("80.00"),
            "receta": [
                (insumos_dict["Café Especialidad Colombia"], Decimal("18.0000"), "g"),
                (insumos_dict["Leche Barista Entera"], Decimal("150.0000"), "ml"),
                (insumos_dict["Chocolate Cobertura Semiamargo 70%"], Decimal("5.0000"), "g"),
            ],
        },
        {
            "nombre": "Cold Brew con Almendras",
            "codigo_barras": "7790001000073",
            "precio_venta": Decimal("4600.00"),
            "minutos_mo": Decimal("1.50"),
            "costo_hora_mo": Decimal("2500.00"),
            "descartables": Decimal("80.00"),
            "receta": [
                (insumos_dict["Café Especialidad Colombia"], Decimal("25.0000"), "g"),
                (insumos_dict["Bebida de Almendras Barista"], Decimal("180.0000"), "ml"),
            ],
        },
        {
            "nombre": "Chipá Tradicional (Porción x4)",
            "codigo_barras": "7790001000042",
            "precio_venta": Decimal("2600.00"),
            "minutos_mo": Decimal("1.50"),
            "costo_hora_mo": Decimal("2500.00"),
            "descartables": Decimal("45.00"),
            "receta": [
                (insumos_dict["Harina de Mandioca"], Decimal("80.0000"), "g"),
                (insumos_dict["Queso Criollo"], Decimal("60.0000"), "g"),
                (insumos_dict["Manteca Calidad Extra 82%"], Decimal("20.0000"), "g"),
            ],
        },
        {
            "nombre": "Croissant Artesanal de Manteca",
            "codigo_barras": "7790001000080",
            "precio_venta": Decimal("3200.00"),
            "minutos_mo": Decimal("3.00"),
            "costo_hora_mo": Decimal("2500.00"),
            "descartables": Decimal("45.00"),
            "receta": [
                (insumos_dict["Harina de Trigo 000 Orgánica"], Decimal("90.0000"), "g"),
                (insumos_dict["Manteca Calidad Extra 82%"], Decimal("55.0000"), "g"),
                (insumos_dict["Azúcar Mascabo Natural"], Decimal("15.0000"), "g"),
            ],
        },
        {
            "nombre": "Cookie Doble Chocolate 70%",
            "codigo_barras": "7790001000097",
            "precio_venta": Decimal("2900.00"),
            "minutos_mo": Decimal("2.00"),
            "costo_hora_mo": Decimal("2500.00"),
            "descartables": Decimal("45.00"),
            "receta": [
                (insumos_dict["Harina de Trigo 000 Orgánica"], Decimal("60.0000"), "g"),
                (insumos_dict["Manteca Calidad Extra 82%"], Decimal("30.0000"), "g"),
                (insumos_dict["Chocolate Cobertura Semiamargo 70%"], Decimal("45.0000"), "g"),
                (insumos_dict["Azúcar Mascabo Natural"], Decimal("30.0000"), "g"),
            ],
        },
        {
            "nombre": "Tostado Jamón y Queso en Pan de Masa Madre",
            "codigo_barras": "7790001000103",
            "precio_venta": Decimal("4800.00"),
            "minutos_mo": Decimal("3.50"),
            "costo_hora_mo": Decimal("2500.00"),
            "descartables": Decimal("45.00"),
            "receta": [
                (insumos_dict["Harina de Trigo 000 Orgánica"], Decimal("120.0000"), "g"),
                (insumos_dict["Queso Criollo"], Decimal("70.0000"), "g"),
                (insumos_dict["Manteca Calidad Extra 82%"], Decimal("15.0000"), "g"),
            ],
        },
    ]

    if incluir_margen_bajo:
        # Margen ~19,86% (< 30%) para disparar la alerta visual y en tiempo real de margen crítico.
        definiciones_productos.append(
            {
                "nombre": "Brownie Intenso Chocolate 70%",
                "codigo_barras": "7790001000110",
                "precio_venta": Decimal("2800.00"),
                "minutos_mo": Decimal("3.00"),
                "costo_hora_mo": Decimal("2500.00"),
                "descartables": Decimal("45.00"),
                "receta": [
                    (insumos_dict["Chocolate Cobertura Semiamargo 70%"], Decimal("65.0000"), "g"),
                    (insumos_dict["Manteca Calidad Extra 82%"], Decimal("35.0000"), "g"),
                    (insumos_dict["Harina de Trigo 000 Orgánica"], Decimal("30.0000"), "g"),
                    (insumos_dict["Azúcar Mascabo Natural"], Decimal("40.0000"), "g"),
                ],
            }
        )

    productos_dict = {}
    for p_data in definiciones_productos:
        prod, _ = Producto.objects.get_or_create(
            nombre=p_data["nombre"],
            defaults={
                "codigo_barras": p_data["codigo_barras"],
                "precio_venta": p_data["precio_venta"],
                "minutos_mano_obra": p_data["minutos_mo"],
                "costo_hora_mano_obra": p_data["costo_hora_mo"],
                "descartables": p_data["descartables"],
                "estado_activo": True,
            },
        )
        prod.codigo_barras = p_data["codigo_barras"]
        prod.precio_venta = p_data["precio_venta"]
        prod.minutos_mano_obra = p_data["minutos_mo"]
        prod.costo_hora_mano_obra = p_data["costo_hora_mo"]
        prod.descartables = p_data["descartables"]
        prod.estado_activo = True
        prod.save()

        for ins, cantidad, unidad in p_data["receta"]:
            RecetaItem.objects.update_or_create(
                producto=prod,
                insumo=ins,
                defaults={"cantidad": cantidad, "unidad": unidad},
            )
        actualizar_costo_y_margen_producto(prod)
        productos_dict[p_data["nombre"]] = prod

    return productos_dict


def _asegurar_turno_abierto_y_movimientos(cajero_user: User, ahora) -> TurnoCaja:
    """Obtiene o crea el turno abierto de cajero_demo con sus movimientos de caja chica."""
    turno = (
        TurnoCaja.objects.filter(usuario=cajero_user, estado="ABIERTO")
        .order_by("-apertura", "-id")
        .first()
    )
    if turno is None:
        turno = TurnoCaja.objects.create(
            usuario=cajero_user,
            efectivo_inicial=Decimal("10000.00"),
            apertura=_fecha_hoy_pasada(ahora, 45),
            estado="ABIERTO",
        )

    movimientos_data = [
        (
            "ENTRADA",
            Decimal("5000.00"),
            "Ingreso cambio chico en billetes de baja denominación",
            _fecha_hoy_pasada(ahora, 40),
        ),
        (
            "SALIDA",
            Decimal("2500.00"),
            "Compra hielo de urgencia en comercio vecino - Caja chica",
            _fecha_hoy_pasada(ahora, 30),
        ),
        (
            "SALIDA",
            Decimal("1500.00"),
            "Flete reposición rápida descartables",
            _fecha_hoy_pasada(ahora, 20),
        ),
    ]
    for tipo, monto, motivo, fecha_mov in movimientos_data:
        MovimientoCaja.objects.get_or_create(
            turno_caja=turno,
            tipo=tipo,
            monto=monto,
            motivo=motivo,
            defaults={"fecha": fecha_mov},
        )

    return turno


def _asegurar_turno_cerrado_video(
    *,
    cajero_user: User,
    apertura,
    cierre,
    efectivo_inicial: Decimal,
    movimientos: list[tuple[str, Decimal, str, object]],
    ventas_spec: list[tuple[str, list[dict], str, object]],
    ajuste_arqueo: Decimal,
) -> TurnoCaja:
    """
    Crea de manera idempotente un turno cerrado histórico con sus movimientos de caja chica
    y ventas emitidas dentro de la ventana del turno.
    """
    motivo_identificador = movimientos[0][2]
    existente = (
        TurnoCaja.objects.filter(
            usuario=cajero_user,
            estado="CERRADO",
            movimientos__motivo=motivo_identificador,
        )
        .order_by("-id")
        .first()
    )
    if existente is not None:
        return existente

    turno = TurnoCaja.objects.create(
        usuario=cajero_user,
        efectivo_inicial=efectivo_inicial,
        apertura=apertura,
        estado="ABIERTO",
    )

    for tipo, monto, motivo, fecha_mov in movimientos:
        MovimientoCaja.objects.get_or_create(
            turno_caja=turno,
            tipo=tipo,
            monto=monto,
            motivo=motivo,
            defaults={"fecha": fecha_mov},
        )

    for clave_venta, items, medio_pago, fecha_venta in ventas_spec:
        registrar_venta(
            items_data=items,
            medio_pago=medio_pago,
            turno_caja=turno,
            fecha=fecha_venta,
            id_operacion=_uuid_seed_video(clave_venta),
        )

    esperado = turno.calcular_efectivo_esperado()
    contado = esperado + ajuste_arqueo
    turno.efectivo_esperado = esperado
    turno.efectivo_contado = contado
    turno.diferencia = contado - esperado
    turno.estado = "CERRADO"
    turno.cierre = cierre
    turno.save(
        update_fields=[
            "efectivo_esperado",
            "efectivo_contado",
            "diferencia",
            "estado",
            "cierre",
        ]
    )
    return turno


def _poblar_escenario_estandar(
    turno: TurnoCaja,
    productos_dict: dict[str, Producto],
) -> None:
    """Carga las 7 ventas iniciales del modo estándar de seed_demo si el turno está vacío."""
    if Venta.objects.filter(turno_caja=turno).exists():
        return

    ventas_data = [
        (
            [
                {"producto_id": productos_dict["Café Espresso"].id, "cantidad": Decimal("2")},
                {
                    "producto_id": productos_dict["Chipá Tradicional (Porción x4)"].id,
                    "cantidad": Decimal("1"),
                },
            ],
            "EFECTIVO",
        ),
        (
            [
                {"producto_id": productos_dict["Café Latte"].id, "cantidad": Decimal("1")},
                {
                    "producto_id": productos_dict["Croissant Artesanal de Manteca"].id,
                    "cantidad": Decimal("1"),
                },
            ],
            "TRANSFERENCIA",
        ),
        (
            [
                {"producto_id": productos_dict["Flat White Especial"].id, "cantidad": Decimal("2")},
                {
                    "producto_id": productos_dict["Cookie Doble Chocolate 70%"].id,
                    "cantidad": Decimal("2"),
                },
            ],
            "TARJETA",
        ),
        (
            [
                {
                    "producto_id": productos_dict["Filtrado Geisha Origen Único"].id,
                    "cantidad": Decimal("1"),
                },
                {
                    "producto_id": productos_dict["Tostado Jamón y Queso en Pan de Masa Madre"].id,
                    "cantidad": Decimal("1"),
                },
            ],
            "EFECTIVO",
        ),
        (
            [
                {"producto_id": productos_dict["Capuccino Italiano"].id, "cantidad": Decimal("1")},
                {
                    "producto_id": productos_dict["Cookie Doble Chocolate 70%"].id,
                    "cantidad": Decimal("1"),
                },
            ],
            "TARJETA",
        ),
        (
            [
                {
                    "producto_id": productos_dict["Cold Brew con Almendras"].id,
                    "cantidad": Decimal("2"),
                },
            ],
            "TRANSFERENCIA",
        ),
        (
            [
                {"producto_id": productos_dict["Café Latte"].id, "cantidad": Decimal("1")},
                {
                    "producto_id": productos_dict["Chipá Tradicional (Porción x4)"].id,
                    "cantidad": Decimal("1"),
                },
            ],
            "EFECTIVO",
        ),
    ]

    for items, medio_pago in ventas_data:
        registrar_venta(
            items_data=items,
            medio_pago=medio_pago,
            turno_caja=turno,
        )


def _poblar_escenario_video(
    *,
    cajero_user: User,
    duenio_user: User,
    turno_abierto: TurnoCaja,
    productos_dict: dict[str, Producto],
    ahora,
) -> None:
    """
    Puebla de forma idempotente el escenario completo para la grabación del video:
    - 2 turnos cerrados del cajero_demo con movimientos de caja chica y ventas
    - Ventas repartidas en los últimos 14 días (últimos 7 días + semana previa)
    - 1 venta anulada en el turno abierto de hoy
    """

    def item(nombre_prod: str, cantidad: str) -> dict:
        return {"producto_id": productos_dict[nombre_prod].id, "cantidad": Decimal(cantidad)}

    # 1. Turno cerrado #1 (hace 11 días, arqueo exacto $0,00)
    _asegurar_turno_cerrado_video(
        cajero_user=cajero_user,
        apertura=_fecha_historica_local(ahora, 11, 8, 30),
        cierre=_fecha_historica_local(ahora, 11, 16, 30),
        efectivo_inicial=Decimal("8000.00"),
        movimientos=[
            (
                "ENTRADA",
                Decimal("3000.00"),
                "Fondo de cambio inicial - Turno mañana",
                _fecha_historica_local(ahora, 11, 8, 50),
            ),
            (
                "SALIDA",
                Decimal("1800.00"),
                "Compra servilletas y azúcar de reposición - Caja chica",
                _fecha_historica_local(ahora, 11, 12, 15),
            ),
        ],
        ventas_spec=[
            (
                "t1-v1",
                [item("Café Espresso", "2"), item("Chipá Tradicional (Porción x4)", "1")],
                "EFECTIVO",
                _fecha_historica_local(ahora, 11, 9, 45),
            ),
            (
                "t1-v2",
                [item("Café Latte", "2"), item("Croissant Artesanal de Manteca", "1")],
                "TRANSFERENCIA",
                _fecha_historica_local(ahora, 11, 11, 30),
            ),
            (
                "t1-v3",
                [item("Capuccino Italiano", "1"), item("Cookie Doble Chocolate 70%", "2")],
                "EFECTIVO",
                _fecha_historica_local(ahora, 11, 14, 20),
            ),
        ],
        ajuste_arqueo=Decimal("0.00"),
    )

    # 2. Turno cerrado #2 (hace 4 días, dentro de "Últimos 7 días", con diferencia de -$200)
    _asegurar_turno_cerrado_video(
        cajero_user=cajero_user,
        apertura=_fecha_historica_local(ahora, 4, 8, 30),
        cierre=_fecha_historica_local(ahora, 4, 16, 30),
        efectivo_inicial=Decimal("10000.00"),
        movimientos=[
            (
                "ENTRADA",
                Decimal("4000.00"),
                "Refuerzo de efectivo para fin de semana",
                _fecha_historica_local(ahora, 4, 8, 45),
            ),
            (
                "SALIDA",
                Decimal("2200.00"),
                "Compra leche entera de emergencia - Caja chica",
                _fecha_historica_local(ahora, 4, 13, 10),
            ),
        ],
        ventas_spec=[
            (
                "t2-v1",
                [item("Café Latte", "3"), item("Croissant Artesanal de Manteca", "2")],
                "EFECTIVO",
                _fecha_historica_local(ahora, 4, 9, 30),
            ),
            (
                "t2-v2",
                [
                    item("Filtrado Geisha Origen Único", "1"),
                    item("Tostado Jamón y Queso en Pan de Masa Madre", "1"),
                ],
                "TARJETA",
                _fecha_historica_local(ahora, 4, 12, 15),
            ),
            (
                "t2-v3",
                [item("Flat White Especial", "2"), item("Brownie Intenso Chocolate 70%", "1")],
                "EFECTIVO",
                _fecha_historica_local(ahora, 4, 15, 0),
            ),
        ],
        ajuste_arqueo=Decimal("-200.00"),
    )

    # 3. Ventas históricas distribuidas en el resto de los últimos 14 días.
    # Cold Brew con Almendras se vende solo hace 10 días para figurar "sin rotación" en los últimos 7 días.
    ventas_historicas_14d = [
        (
            "d13-v1",
            _fecha_historica_local(ahora, 13, 11, 20),
            "EFECTIVO",
            [item("Café Espresso", "3"), item("Chipá Tradicional (Porción x4)", "2")],
        ),
        (
            "d12-v1",
            _fecha_historica_local(ahora, 12, 10, 45),
            "TARJETA",
            [item("Café Latte", "2"), item("Croissant Artesanal de Manteca", "2")],
        ),
        (
            "d10-v1",
            _fecha_historica_local(ahora, 10, 15, 10),
            "TRANSFERENCIA",
            [item("Cold Brew con Almendras", "2"), item("Cookie Doble Chocolate 70%", "1")],
        ),
        (
            "d09-v1",
            _fecha_historica_local(ahora, 9, 13, 30),
            "EFECTIVO",
            [
                item("Flat White Especial", "2"),
                item("Tostado Jamón y Queso en Pan de Masa Madre", "1"),
            ],
        ),
        (
            "d08-v1",
            _fecha_historica_local(ahora, 8, 11, 50),
            "TARJETA",
            [item("Capuccino Italiano", "2"), item("Chipá Tradicional (Porción x4)", "1")],
        ),
        (
            "d07-v1",
            _fecha_historica_local(ahora, 7, 10, 15),
            "EFECTIVO",
            [item("Café Latte", "2"), item("Café Espresso", "2")],
        ),
        (
            "d06-v1",
            _fecha_historica_local(ahora, 6, 11, 0),
            "TRANSFERENCIA",
            [item("Café Latte", "3"), item("Croissant Artesanal de Manteca", "2")],
        ),
        (
            "d05-v1",
            _fecha_historica_local(ahora, 5, 14, 20),
            "EFECTIVO",
            [item("Flat White Especial", "2"), item("Cookie Doble Chocolate 70%", "2")],
        ),
        (
            "d03-v1",
            _fecha_historica_local(ahora, 3, 12, 40),
            "TARJETA",
            [
                item("Capuccino Italiano", "2"),
                item("Tostado Jamón y Queso en Pan de Masa Madre", "2"),
            ],
        ),
        (
            "d02-v1",
            _fecha_historica_local(ahora, 2, 10, 30),
            "EFECTIVO",
            [item("Café Espresso", "4"), item("Chipá Tradicional (Porción x4)", "2")],
        ),
        (
            "d01-v1",
            _fecha_historica_local(ahora, 1, 16, 10),
            "TRANSFERENCIA",
            [item("Café Latte", "2"), item("Brownie Intenso Chocolate 70%", "2")],
        ),
    ]

    for clave, fecha_v, medio_pago, items in ventas_historicas_14d:
        registrar_venta(
            items_data=items,
            medio_pago=medio_pago,
            turno_caja=None,
            fecha=fecha_v,
            id_operacion=_uuid_seed_video(clave),
        )

    # 4. Ventas de hoy en el turno abierto de cajero_demo (idempotentes por id_operacion)
    ventas_hoy = [
        (
            "hoy-v1",
            _fecha_hoy_pasada(ahora, 25),
            "EFECTIVO",
            [item("Café Latte", "2"), item("Croissant Artesanal de Manteca", "1")],
        ),
        (
            "hoy-v2",
            _fecha_hoy_pasada(ahora, 15),
            "TRANSFERENCIA",
            [item("Flat White Especial", "1"), item("Chipá Tradicional (Porción x4)", "2")],
        ),
        (
            "hoy-v3",
            _fecha_hoy_pasada(ahora, 10),
            "TARJETA",
            [item("Capuccino Italiano", "1"), item("Cookie Doble Chocolate 70%", "1")],
        ),
    ]

    for clave, fecha_v, medio_pago, items in ventas_hoy:
        registrar_venta(
            items_data=items,
            medio_pago=medio_pago,
            turno_caja=turno_abierto,
            fecha=fecha_v,
            id_operacion=_uuid_seed_video(clave),
        )

    # 5. Venta anulada de demostración (si no existe o no está anulada aún)
    venta_a_anular = registrar_venta(
        items_data=[item("Filtrado Geisha Origen Único", "1"), item("Café Espresso", "1")],
        medio_pago="EFECTIVO",
        turno_caja=turno_abierto,
        fecha=_fecha_hoy_pasada(ahora, 5),
        id_operacion=_uuid_seed_video("hoy-anulada"),
    )
    if venta_a_anular.estado != "ANULADA":
        anular_venta(
            venta=venta_a_anular,
            usuario=duenio_user,
            motivo="Error de carga en mostrador - pedido duplicado",
            permiso_verificado=True,
        )


class Command(BaseCommand):
    help = "Puebla la base de datos con catálogo de cafetería de especialidad y datos anonimizados de demostración"

    def add_arguments(self, parser):
        parser.add_argument(
            "--force-production",
            action="store_true",
            help="Permite ejecutar seed_demo incluso cuando DEBUG=False.",
        )
        parser.add_argument(
            "--video",
            action="store_true",
            help=(
                "Agrega de forma idempotente historial de 14 días, 2 turnos cerrados, "
                "1 venta anulada y un producto con margen crítico (< 30%) para grabación/demo."
            ),
        )

    @transaction.atomic
    def handle(self, *args, **options):
        permitir_produccion = options.get("force_production", False) or (
            os.environ.get("SEED_DEMO_ALLOW_PRODUCTION", "").strip().lower()
            in ("1", "true", "yes", "si", "sí")
        )
        if not getattr(settings, "DEBUG", False) and not permitir_produccion:
            raise CommandError(
                "seed_demo está bloqueado cuando DEBUG=False. "
                "Solo debe ejecutarse en desarrollo o pasando --force-production explícitamente."
            )

        modo_video = bool(options.get("video", False))
        self.stdout.write(
            self.style.NOTICE(
                "Iniciando seed_demo gastronómico enriquecido"
                + (" (modo --video)..." if modo_video else "...")
            )
        )

        password_demo = os.environ.get("SEED_DEMO_PASSWORD", "").strip()
        if not password_demo:
            self.stdout.write(
                self.style.WARNING(
                    "SEED_DEMO_PASSWORD no definida; los usuarios nuevos se crearán sin contraseña usable "
                    "(los existentes conservan su contraseña)."
                )
            )

        usuarios_instancias = _asegurar_usuarios_demo(self.stdout, self.style, password_demo)
        insumos_dict = _asegurar_insumos_y_compras()
        productos_dict = _asegurar_productos_y_recetas(
            insumos_dict,
            incluir_margen_bajo=modo_video,
        )

        ahora = timezone.now()
        cajero_user = usuarios_instancias[ROL_CAJERO]
        duenio_user = usuarios_instancias[ROL_DUENIO]
        turno = _asegurar_turno_abierto_y_movimientos(cajero_user, ahora)

        if modo_video:
            _poblar_escenario_video(
                cajero_user=cajero_user,
                duenio_user=duenio_user,
                turno_abierto=turno,
                productos_dict=productos_dict,
                ahora=ahora,
            )
        else:
            _poblar_escenario_estandar(turno, productos_dict)

        turno.efectivo_esperado = turno.calcular_efectivo_esperado()
        turno.save(update_fields=["efectivo_esperado"])

        self.stdout.write(
            self.style.SUCCESS(
                f"seed_demo completado con éxito: {len(productos_dict)} productos, "
                f"{len(insumos_dict)} insumos, turno #{turno.id} con ventas en "
                "EFECTIVO/TRANSFERENCIA/TARJETA y movimientos registrados"
                + (" (incluye datos --video)." if modo_video else ".")
            )
        )
