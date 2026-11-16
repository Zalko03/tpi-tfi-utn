"""Comando seed_demo: puebla la base de datos con catálogo gastronómico realista y datos de muestra."""

import os
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.caja.models import MovimientoCaja, TurnoCaja
from apps.insumos.models import Compra, Insumo, Proveedor
from apps.insumos.services import registrar_compra_y_actualizar_costo
from apps.recetas.models import Producto, RecetaItem
from apps.recetas.services import actualizar_costo_y_margen_producto
from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO, ROL_ENCARGADO
from apps.usuarios.models import PerfilUsuario
from apps.ventas.models import Venta
from apps.ventas.services import registrar_venta


class Command(BaseCommand):
    help = "Puebla la base de datos con catálogo de cafetería de especialidad y datos anonimizados de demostración"

    def add_arguments(self, parser):
        parser.add_argument(
            "--force-production",
            action="store_true",
            help="Permite ejecutar seed_demo incluso cuando DEBUG=False.",
        )

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

        self.stdout.write(self.style.NOTICE("Iniciando seed_demo gastronómico enriquecido..."))

        password_demo = os.environ.get("SEED_DEMO_PASSWORD", "").strip()
        if not password_demo:
            self.stdout.write(
                self.style.WARNING(
                    "SEED_DEMO_PASSWORD no definida; los usuarios demo se crearán con contraseña inusable."
                )
            )

        # 0. Usuarios de demostración (Dueño, Encargado y Cajero)
        usuarios_demo = [
            ("duenio_demo", "Dueño", "Demo", "duenio@cafedemo.local", ROL_DUENIO),
            ("encargado_demo", "Encargado", "Demo", "encargado@cafedemo.local", ROL_ENCARGADO),
            ("cajero_demo", "Cajero", "Demo", "cajero@cafedemo.local", ROL_CAJERO),
        ]
        usuarios_instancias = {}
        for username, first_name, last_name, email, rol in usuarios_demo:
            u, _ = User.objects.get_or_create(
                username=username,
                defaults={
                    "first_name": first_name,
                    "last_name": last_name,
                    "email": email,
                    "is_active": True,
                },
            )
            if password_demo:
                u.set_password(password_demo)
            else:
                u.set_unusable_password()
            u.is_active = True
            u.save()
            perfil, _ = PerfilUsuario.objects.get_or_create(usuario=u)
            perfil.rol = rol
            perfil.save()
            usuarios_instancias[rol] = u

        self.stdout.write(
            self.style.SUCCESS(
                "Usuarios de prueba listos (duenio_demo, encargado_demo, cajero_demo)."
            )
        )

        # 1. Proveedores
        prov_cafe, _ = Proveedor.objects.get_or_create(nombre="Distribuidora Central de Café")
        prov_lacteos, _ = Proveedor.objects.get_or_create(nombre="Lácteos del Valle")
        prov_molino, _ = Proveedor.objects.get_or_create(nombre="Molino Harinero del Sur")
        prov_descartables, _ = Proveedor.objects.get_or_create(
            nombre="Envases y Descartables San Jorge"
        )
        prov_chocolates, _ = Proveedor.objects.get_or_create(
            nombre="Chocolates y Especialidades Andinas"
        )

        # 2. Insumos (12 insumos de cafetería y panadería con casos críticos de costo)
        definiciones_insumos = [
            ("Café Especialidad Colombia", "g", Decimal("28.0000")),
            (
                "Café Geisha Panamá Lote Especial",
                "g",
                Decimal("85.0000"),
            ),  # Stock Crítico / Alto costo
            ("Leche Barista Entera", "ml", Decimal("1.4000")),
            ("Bebida de Almendras Barista", "ml", Decimal("3.2000")),
            ("Harina de Trigo 000 Orgánica", "g", Decimal("1.8000")),
            ("Harina de Mandioca", "g", Decimal("4.5000")),
            ("Manteca Calidad Extra 82%", "g", Decimal("14.0000")),  # Stock Crítico / Suba reciente
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

        # 3. Compras con cálculo y prorrateo (idempotente)
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

        # 4. Productos de Carta y Recetas Gastronómicas (10 productos)
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
            # Asegurar sincronización de código de barras y precio
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

        # 5. Turno de Caja Abierto y Movimientos de Caja Chica (sin forzar id=1)
        cajero_user = usuarios_instancias.get(ROL_CAJERO)
        turno = (
            TurnoCaja.objects.filter(usuario=cajero_user, estado="ABIERTO")
            .order_by("-apertura", "-id")
            .first()
        )
        if turno is None:
            turno = TurnoCaja.objects.create(
                usuario=cajero_user,
                efectivo_inicial=Decimal("10000.00"),
                apertura=timezone.now(),
                estado="ABIERTO",
            )

        # Movimientos de caja chica (idempotente)
        movimientos_data = [
            (
                "ENTRADA",
                Decimal("5000.00"),
                "Ingreso cambio chico en billetes de baja denominación",
            ),
            (
                "SALIDA",
                Decimal("2500.00"),
                "Compra hielo de urgencia en comercio vecino - Caja chica",
            ),
            ("SALIDA", Decimal("1500.00"), "Flete reposición rápida descartables"),
        ]
        for tipo, monto, motivo in movimientos_data:
            MovimientoCaja.objects.get_or_create(
                turno_caja=turno,
                tipo=tipo,
                monto=monto,
                motivo=motivo,
            )

        # 6. Registro de Ventas iniciales en diversos medios de pago (idempotente)
        if not Venta.objects.filter(turno_caja=turno).exists():
            ventas_data = [
                (
                    [
                        {
                            "producto_id": productos_dict["Café Espresso"].id,
                            "cantidad": Decimal("2"),
                        },
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
                        {
                            "producto_id": productos_dict["Flat White Especial"].id,
                            "cantidad": Decimal("2"),
                        },
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
                            "producto_id": productos_dict[
                                "Tostado Jamón y Queso en Pan de Masa Madre"
                            ].id,
                            "cantidad": Decimal("1"),
                        },
                    ],
                    "EFECTIVO",
                ),
                (
                    [
                        {
                            "producto_id": productos_dict["Capuccino Italiano"].id,
                            "cantidad": Decimal("1"),
                        },
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

        # Recalcular efectivo esperado del turno tras ventas y movimientos
        turno.efectivo_esperado = turno.calcular_efectivo_esperado()
        turno.save(update_fields=["efectivo_esperado"])

        self.stdout.write(
            self.style.SUCCESS(
                f"seed_demo completado con éxito: {len(definiciones_productos)} productos, "
                f"{len(definiciones_insumos)} insumos, turno #{turno.id} con ventas en EFECTIVO/TRANSFERENCIA/TARJETA "
                f"y movimientos registrados."
            )
        )
