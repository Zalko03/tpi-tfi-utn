"""
Comando seed_rendimiento (T3.4):
Puebla un volumen masivo de datos anonimizados (por defecto 50.000 ventas, 40 productos
y 25 insumos) utilizando inserción por lotes (bulk_create) para evaluar planes de
ejecución EXPLAIN ANALYZE y tiempos de respuesta de las 3 consultas críticas.
"""

from datetime import timedelta
from decimal import Decimal
import time
from django.core.management.base import BaseCommand
from django.db import connection
from django.utils import timezone

from apps.insumos.models import Insumo, Proveedor
from apps.recetas.models import Producto, RecetaItem
from apps.recetas.services import (
    listar_productos_con_costos_optimizado,
    recalcular_recetas_por_insumo,
)
from apps.ventas.models import Venta, VentaItem
from apps.ventas.services import construir_queryset_reporte_ventas_por_producto


class Command(BaseCommand):
    help = "Genera un seed masivo (por defecto 50.000 ventas) y mide las 3 consultas de T3.4"

    def add_arguments(self, parser):
        parser.add_argument(
            "--ventas",
            type=int,
            default=50000,
            help="Cantidad de ventas a generar en lotes (default: 50000)",
        )
        parser.add_argument(
            "--productos",
            type=int,
            default=40,
            help="Cantidad de productos con receta a asegurar (default: 40)",
        )
        parser.add_argument(
            "--lote",
            type=int,
            default=5000,
            help="Tamaño de batch_size para bulk_create (default: 5000)",
        )

    def handle(self, *args, **options):
        total_ventas = max(100, int(options["ventas"]))
        total_productos = max(5, int(options["productos"]))
        tam_lote = max(500, int(options["lote"]))

        inicio_global = time.perf_counter()
        self.stdout.write(
            self.style.NOTICE(
                f"Iniciando seed_rendimiento (ventas={total_ventas}, productos={total_productos})..."
            )
        )

        # 1. Proveedor e insumos base
        Proveedor.objects.get_or_create(nombre="Mayorista Rendimiento T3.4")
        unidades = ["g", "ml", "un"]
        insumos = []
        for idx in range(1, 26):
            insumo, _ = Insumo.objects.get_or_create(
                nombre=f"Insumo Benchmark {idx:02d}",
                defaults={
                    "unidad_base": unidades[idx % 3],
                    "costo_unitario": Decimal(str(10 + idx)),
                },
            )
            insumos.append(insumo)

        insumo_cafe_base = insumos[0]

        # 2. Productos y recetas (todos usan insumo_cafe_base + otros 2 insumos)
        productos = []
        for idx in range(1, total_productos + 1):
            prod, _ = Producto.objects.get_or_create(
                nombre=f"Producto Benchmark {idx:03d}",
                defaults={
                    "codigo_barras": f"779999{idx:04d}",
                    "precio_venta": Decimal("3500.00"),
                    "minutos_mano_obra": Decimal("2.00"),
                    "costo_hora_mano_obra": Decimal("2400.00"),
                    "descartables": Decimal("60.00"),
                    "costo_total_calculado": Decimal("950.0000"),
                    "ganancia_bruta": Decimal("2550.0000"),
                    "margen_bruto": Decimal("0.7286"),
                },
            )
            productos.append(prod)

            for offset in (0, (idx % 10) + 1, (idx % 12) + 11):
                ins_receta = insumos[offset]
                RecetaItem.objects.get_or_create(
                    producto=prod,
                    insumo=ins_receta,
                    defaults={
                        "cantidad": Decimal("15.0000"),
                        "unidad": ins_receta.unidad_base,
                    },
                )

        # 3. Generación masiva de ventas e ítems por lotes
        ahora = timezone.now()
        medios = ["EFECTIVO", "TRANSFERENCIA", "TARJETA"]
        ventas_creadas = 0

        while ventas_creadas < total_ventas:
            actual = min(tam_lote, total_ventas - ventas_creadas)
            lote_ventas = []
            for i in range(actual):
                num = ventas_creadas + i
                fecha_venta = ahora - timedelta(
                    days=num % 180, minutes=(num * 7) % 1440
                )
                lote_ventas.append(
                    Venta(
                        fecha=fecha_venta,
                        medio_pago=medios[num % 3],
                        origen="propio",
                        total=Decimal("7000.00"),
                        costo_total_snapshot=Decimal("1900.0000"),
                    )
                )
            ventas_insertadas = Venta.objects.bulk_create(
                lote_ventas, batch_size=tam_lote
            )

            lote_items = []
            for idx_v, venta_obj in enumerate(ventas_insertadas):
                prod_obj = productos[(ventas_creadas + idx_v) % len(productos)]
                lote_items.append(
                    VentaItem(
                        venta=venta_obj,
                        producto=prod_obj,
                        cantidad=Decimal("2.00"),
                        precio_unitario=prod_obj.precio_venta,
                        costo_unitario_snapshot=prod_obj.costo_total_calculado,
                    )
                )
            VentaItem.objects.bulk_create(lote_items, batch_size=tam_lote)
            ventas_creadas += actual

        duracion_seed = (time.perf_counter() - inicio_global) * 1000
        self.stdout.write(
            self.style.SUCCESS(
                f"Seed masivo completado: {ventas_creadas} ventas insertadas en {duracion_seed:.1f} ms."
            )
        )

        # 4. Ejecución y plan de las 3 consultas optimizadas
        es_postgres = connection.vendor == "postgresql"
        opciones_explain = {"analyze": True, "buffers": True} if es_postgres else {}

        # Consulta 1: Listado de productos con costo (Prefetch + select_related)
        t0 = time.perf_counter()
        qs_c1 = listar_productos_con_costos_optimizado(solo_activos=True)
        lista_c1 = list(qs_c1)
        _ = [
            [it.insumo.nombre for it in p.receta_items.all()] for p in lista_c1
        ]
        ms_c1 = (time.perf_counter() - t0) * 1000
        plan_c1 = qs_c1.explain(**opciones_explain)

        # Consulta 2: Reporte de ventas por producto en los últimos 30 días
        t0 = time.perf_counter()
        qs_c2 = construir_queryset_reporte_ventas_por_producto(
            fecha_inicio=ahora - timedelta(days=30),
            fecha_fin=ahora,
        )
        _ = list(qs_c2)
        ms_c2 = (time.perf_counter() - t0) * 1000
        plan_c2 = qs_c2.explain(**opciones_explain)

        # Consulta 3: Recálculo masivo de productos afectados por insumo
        t0 = time.perf_counter()
        resumen_c3 = recalcular_recetas_por_insumo(insumo_cafe_base.id)
        ms_c3 = (time.perf_counter() - t0) * 1000

        self.stdout.write(
            f"\n[Consulta 1 - Listado productos sin N+1] {len(lista_c1)} productos en {ms_c1:.2f} ms\n{plan_c1}"
        )
        self.stdout.write(
            f"\n[Consulta 2 - Reporte ventas por fecha] en {ms_c2:.2f} ms\n{plan_c2}"
        )
        self.stdout.write(
            f"\n[Consulta 3 - Recálculo productos afectados] {len(resumen_c3)} productos recalculados en {ms_c3:.2f} ms"
        )
