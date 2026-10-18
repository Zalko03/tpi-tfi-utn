"""Comando seed_demo: puebla la base de datos con datos de muestra anonimizados de cafetería."""
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.insumos.models import Proveedor, Insumo
from apps.insumos.services import registrar_compra_y_actualizar_costo
from apps.recetas.models import Producto, RecetaItem
from apps.recetas.services import actualizar_costo_y_margen_producto
from apps.caja.models import TurnoCaja
from apps.ventas.services import registrar_venta


class Command(BaseCommand):
    help = "Puebla la base de datos con datos anonimizados de cafetería (T1.7)"

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Iniciando seed_demo..."))

        # 1. Proveedores
        prov_cafe, _ = Proveedor.objects.get_or_create(nombre="Distribuidora Central de Café")
        prov_lacteos, _ = Proveedor.objects.get_or_create(nombre="Lácteos del Valle")
        prov_molino, _ = Proveedor.objects.get_or_create(nombre="Molino Harinero del Sur")
        prov_descartables, _ = Proveedor.objects.get_or_create(nombre="Envases y Descartables San Jorge")

        # 2. Insumos
        insumo_cafe, _ = Insumo.objects.get_or_create(
            nombre="Café Especialidad Colombia",
            defaults={"unidad_base": "g", "costo_unitario": Decimal("28.0000")},
        )
        insumo_leche, _ = Insumo.objects.get_or_create(
            nombre="Leche Barista Entera",
            defaults={"unidad_base": "ml", "costo_unitario": Decimal("1.4000")},
        )
        insumo_mandioca, _ = Insumo.objects.get_or_create(
            nombre="Harina de Mandioca",
            defaults={"unidad_base": "g", "costo_unitario": Decimal("4.0000")},
        )
        insumo_queso, _ = Insumo.objects.get_or_create(
            nombre="Queso Criollo",
            defaults={"unidad_base": "g", "costo_unitario": Decimal("9.0000")},
        )
        insumo_vaso, _ = Insumo.objects.get_or_create(
            nombre="Vaso Polipapel 240ml",
            defaults={"unidad_base": "un", "costo_unitario": Decimal("80.0000")},
        )

        # 3. Compras con cálculo y prorrateo
        registrar_compra_y_actualizar_costo(
            proveedor=prov_cafe,
            insumo=insumo_cafe,
            precio_total=Decimal("26000.00"),
            cantidad=Decimal("1"),
            unidad="kg",
            envio=Decimal("2000.00"),
            iva_incluido=True,
        )
        registrar_compra_y_actualizar_costo(
            proveedor=prov_lacteos,
            insumo=insumo_leche,
            precio_total=Decimal("14000.00"),
            cantidad=Decimal("10"),
            unidad="l",
            envio=Decimal("0.00"),
            iva_incluido=True,
        )
        registrar_compra_y_actualizar_costo(
            proveedor=prov_descartables,
            insumo=insumo_vaso,
            precio_total=Decimal("8000.00"),
            cantidad=Decimal("100"),
            unidad="un",
            envio=Decimal("0.00"),
            iva_incluido=True,
        )

        # 4. Productos y Recetas
        espresso, _ = Producto.objects.get_or_create(
            nombre="Café Espresso",
            defaults={
                "codigo_barras": "7790001001",
                "precio_venta": Decimal("2200.00"),
                "minutos_mano_obra": Decimal("1.00"),
                "costo_hora_mano_obra": Decimal("2500.00"),
                "descartables": Decimal("0.00"),
            },
        )
        RecetaItem.objects.get_or_create(
            producto=espresso,
            insumo=insumo_cafe,
            defaults={"cantidad": Decimal("18.0000"), "unidad": "g"},
        )
        actualizar_costo_y_margen_producto(espresso)

        latte, _ = Producto.objects.get_or_create(
            nombre="Café Latte",
            defaults={
                "codigo_barras": "7790001002",
                "precio_venta": Decimal("3800.00"),
                "minutos_mano_obra": Decimal("2.00"),
                "costo_hora_mano_obra": Decimal("2500.00"),
                "descartables": Decimal("80.00"),
            },
        )
        RecetaItem.objects.get_or_create(
            producto=latte,
            insumo=insumo_cafe,
            defaults={"cantidad": Decimal("18.0000"), "unidad": "g"},
        )
        RecetaItem.objects.get_or_create(
            producto=latte,
            insumo=insumo_leche,
            defaults={"cantidad": Decimal("220.0000"), "unidad": "ml"},
        )
        actualizar_costo_y_margen_producto(latte)

        chipa, _ = Producto.objects.get_or_create(
            nombre="Chipá Tradicional (Porción x4)",
            defaults={
                "codigo_barras": "7790001003",
                "precio_venta": Decimal("1800.00"),
                "minutos_mano_obra": Decimal("1.50"),
                "costo_hora_mano_obra": Decimal("2500.00"),
                "descartables": Decimal("30.00"),
            },
        )
        RecetaItem.objects.get_or_create(
            producto=chipa,
            insumo=insumo_mandioca,
            defaults={"cantidad": Decimal("80.0000"), "unidad": "g"},
        )
        RecetaItem.objects.get_or_create(
            producto=chipa,
            insumo=insumo_queso,
            defaults={"cantidad": Decimal("60.0000"), "unidad": "g"},
        )
        actualizar_costo_y_margen_producto(chipa)

        # 5. Turno de Caja y Ventas con snapshot congelado
        turno, _ = TurnoCaja.objects.get_or_create(
            id=1,
            defaults={"efectivo_inicial": Decimal("10000.00"), "apertura": timezone.now()},
        )
        registrar_venta(
            items_data=[
                {"producto_id": espresso.id, "cantidad": Decimal("2")},
                {"producto_id": chipa.id, "cantidad": Decimal("1")},
            ],
            medio_pago="EFECTIVO",
            turno_caja=turno,
        )
        registrar_venta(
            items_data=[
                {"producto_id": latte.id, "cantidad": Decimal("1")},
            ],
            medio_pago="TRANSFERENCIA",
            turno_caja=turno,
        )

        self.stdout.write(self.style.SUCCESS("seed_demo completado con éxito."))
