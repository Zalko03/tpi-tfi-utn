"""
Suite de pruebas para la optimización de las 3 consultas críticas en PostgreSQL (T3.4):
1. Listado de productos con costo sin N+1 (Prefetch + select_related).
2. Reporte agregado de ventas por producto filtrado por fecha con índices B-Tree.
3. Recálculo en lote (bulk_update + Prefetch + índice compuesto) de productos afectados.
"""

from datetime import timedelta
from decimal import Decimal
from io import StringIO
import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.insumos.models import Insumo
from apps.recetas.models import Producto, RecetaItem
from apps.recetas.services import (
    listar_productos_con_costos_optimizado,
    obtener_desglose_costeo_producto,
    recalcular_recetas_por_insumo,
)
from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO
from apps.usuarios.services import crear_personal
from apps.ventas.models import Venta, VentaItem
from apps.ventas.services import (
    construir_queryset_reporte_ventas_por_producto,
    obtener_reporte_ventas_por_producto,
)


@pytest.mark.django_db
class TestOptimizacionConsultasT34:
    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def duenio(self):
        return crear_personal(
            datos_usuario={"username": "duenio_opt", "password": "password123"},
            rol=ROL_DUENIO,
        )

    @pytest.fixture
    def cajero(self):
        return crear_personal(
            datos_usuario={"username": "cajero_opt", "password": "password123"},
            rol=ROL_CAJERO,
        )

    def test_indices_declarados_en_modelos_venta_y_receta(self):
        """Verifica que los índices de T3.4 existan en Venta, VentaItem, Producto y RecetaItem."""
        indices_venta = {idx.name for idx in Venta._meta.indexes}
        indices_venta_item = {idx.name for idx in VentaItem._meta.indexes}
        indices_receta_item = {idx.name for idx in RecetaItem._meta.indexes}
        indices_producto = {idx.name for idx in Producto._meta.indexes}

        assert "idx_venta_fecha" in indices_venta
        assert "idx_venta_fecha_id_desc" in indices_venta
        assert "idx_ventaitem_venta_prod" in indices_venta_item
        assert "idx_ventaitem_prod_venta" in indices_venta_item
        assert "idx_recetaitem_insumo_prod" in indices_receta_item
        assert "idx_producto_activo_nombre" in indices_producto

    def test_consulta_1_listado_productos_elimina_n_mas_1(
        self, django_assert_num_queries
    ):
        """
        Consultar 15 productos con múltiples ítems de receta e insumos y calcular su
        desglose ejecuta exactamente 2 consultas SQL (1 para productos, 1 para receta_items + insumos),
        en lugar de 1 + 15 = 16 consultas (N+1).
        """
        insumo_a = Insumo.objects.create(
            nombre="Café Grano Opt",
            unidad_base="g",
            costo_unitario=Decimal("25.0000"),
        )
        insumo_b = Insumo.objects.create(
            nombre="Leche Entera Opt",
            unidad_base="ml",
            costo_unitario=Decimal("1.5000"),
        )

        for i in range(15):
            prod = Producto.objects.create(
                nombre=f"Producto N1 Test {i:02d}",
                precio_venta=Decimal("3200.00"),
                minutos_mano_obra=Decimal("2.00"),
                costo_hora_mano_obra=Decimal("2400.00"),
                descartables=Decimal("50.00"),
            )
            RecetaItem.objects.create(
                producto=prod,
                insumo=insumo_a,
                cantidad=Decimal("18.0000"),
                unidad="g",
            )
            RecetaItem.objects.create(
                producto=prod,
                insumo=insumo_b,
                cantidad=Decimal("150.0000"),
                unidad="ml",
            )

        with django_assert_num_queries(2):
            productos = list(
                listar_productos_con_costos_optimizado(solo_activos=True)
            )
            assert len(productos) == 15
            for prod in productos:
                desglose = obtener_desglose_costeo_producto(prod)
                assert len(desglose["desglose_insumos"]) == 2

    def test_consulta_2_reporte_ventas_por_producto_una_sola_query_y_filtro_fecha(
        self, django_assert_num_queries
    ):
        """
        El reporte de ventas por producto se resuelve en 1 única consulta SQL agregada (GROUP BY)
        y filtra estrictamente por el rango de fechas solicitado.
        """
        ahora = timezone.now()
        hace_dos_dias = ahora - timedelta(days=2)
        hace_cuarenta_dias = ahora - timedelta(days=40)

        prod_1 = Producto.objects.create(
            nombre="Espresso Reporte",
            precio_venta=Decimal("2000.00"),
            costo_total_calculado=Decimal("600.0000"),
        )
        prod_2 = Producto.objects.create(
            nombre="Capuccino Reporte",
            precio_venta=Decimal("3000.00"),
            costo_total_calculado=Decimal("1000.0000"),
        )

        # Venta reciente dentro del rango
        v_reciente = Venta.objects.create(
            fecha=hace_dos_dias,
            medio_pago="EFECTIVO",
            total=Decimal("7000.00"),
            costo_total_snapshot=Decimal("2200.0000"),
        )
        VentaItem.objects.create(
            venta=v_reciente,
            producto=prod_1,
            cantidad=Decimal("2.00"),
            precio_unitario=Decimal("2000.00"),
            costo_unitario_snapshot=Decimal("600.0000"),
        )
        VentaItem.objects.create(
            venta=v_reciente,
            producto=prod_2,
            cantidad=Decimal("1.00"),
            precio_unitario=Decimal("3000.00"),
            costo_unitario_snapshot=Decimal("1000.0000"),
        )

        # Venta antigua fuera del rango de 7 días
        v_antigua = Venta.objects.create(
            fecha=hace_cuarenta_dias,
            medio_pago="EFECTIVO",
            total=Decimal("10000.00"),
            costo_total_snapshot=Decimal("3000.0000"),
        )
        VentaItem.objects.create(
            venta=v_antigua,
            producto=prod_1,
            cantidad=Decimal("5.00"),
            precio_unitario=Decimal("2000.00"),
            costo_unitario_snapshot=Decimal("600.0000"),
        )

        with django_assert_num_queries(1):
            reporte = obtener_reporte_ventas_por_producto(
                fecha_inicio=ahora - timedelta(days=7),
                fecha_fin=ahora,
            )

        assert len(reporte) == 2
        assert reporte[0]["producto_id"] == prod_1.id
        assert reporte[0]["unidades_vendidas"] == "2.00"
        assert reporte[0]["ingresos_totales"] == "4000.00"
        assert reporte[0]["costo_total_congelado"] == "1200.0000"
        assert reporte[0]["ganancia_bruta"] == "2800.0000"

        plan = construir_queryset_reporte_ventas_por_producto(
            fecha_inicio=ahora - timedelta(days=7),
            fecha_fin=ahora,
        ).explain()
        assert isinstance(plan, str) and len(plan) > 0

    def test_consulta_3_recalculo_productos_afectados_en_3_queries_con_bulk_update(
        self, django_assert_num_queries
    ):
        """
        Recalcular 12 productos que usan un mismo insumo ejecuta exactamente 3 consultas SQL
        (1 SELECT productos, 1 SELECT receta_items + insumo, 1 bulk UPDATE productos)
        en lugar de 1 + 2*12 = 25 consultas.
        """
        cafe = Insumo.objects.create(
            nombre="Café Recálculo Masivo",
            unidad_base="g",
            costo_unitario=Decimal("20.0000"),
        )
        leche = Insumo.objects.create(
            nombre="Leche Recálculo Masivo",
            unidad_base="ml",
            costo_unitario=Decimal("1.0000"),
        )

        for i in range(12):
            prod = Producto.objects.create(
                nombre=f"Bebida Café {i:02d}",
                precio_venta=Decimal("3500.00"),
                minutos_mano_obra=Decimal("2.00"),
                costo_hora_mano_obra=Decimal("2400.00"),
                descartables=Decimal("60.00"),
                costo_total_calculado=Decimal("700.0000"),
            )
            RecetaItem.objects.create(
                producto=prod,
                insumo=cafe,
                cantidad=Decimal("20.0000"),
                unidad="g",
            )
            RecetaItem.objects.create(
                producto=prod,
                insumo=leche,
                cantidad=Decimal("100.0000"),
                unidad="ml",
            )

        # Aumentamos el costo del café a $30/g
        cafe.costo_unitario = Decimal("30.0000")
        cafe.save(update_fields=["costo_unitario"])

        with django_assert_num_queries(3):
            resumen = recalcular_recetas_por_insumo(cafe.id)

        assert len(resumen) == 12
        # Nuevo costo: (20 * 30 = 600) + (100 * 1 = 100) + MO (80) + Desc (60) = 840.0000
        assert resumen[0]["costo_anterior"] == "700.0000"
        assert resumen[0]["costo_nuevo"] == "840.0000"

    def test_endpoint_reporte_por_producto_permisos_y_validaciones(
        self, client, duenio, cajero
    ):
        """
        Verifica el endpoint GET /api/ventas/reporte-por-producto/:
        - 403 Forbidden para Cajero sin 'reportes.ver_operativos' (test negativo).
        - 400 Bad Request si fecha_inicio > fecha_fin.
        - 200 OK con formato { datos, total } para Dueño.
        """
        client.force_authenticate(user=cajero)
        res_403 = client.get("/api/ventas/reporte-por-producto/")
        assert res_403.status_code == status.HTTP_403_FORBIDDEN
        assert "mensaje" in res_403.json()

        client.force_authenticate(user=duenio)
        res_400 = client.get(
            "/api/ventas/reporte-por-producto/?fecha_inicio=2026-10-20&fecha_fin=2026-10-10"
        )
        assert res_400.status_code == status.HTTP_400_BAD_REQUEST
        assert "mensaje" in res_400.json()

        res_200 = client.get(
            "/api/ventas/reporte-por-producto/?fecha_inicio=2026-01-01&fecha_fin=2026-12-31"
        )
        assert res_200.status_code == status.HTTP_200_OK
        data = res_200.json()
        assert "datos" in data
        assert "total" in data

    def test_comando_seed_rendimiento_ejecuta_correctamente(self):
        """Verifica que el comando seed_rendimiento genere lotes y ejecute EXPLAIN."""
        out = StringIO()
        call_command(
            "seed_rendimiento",
            ventas=120,
            productos=6,
            lote=100,
            stdout=out,
        )
        salida = out.getvalue()
        assert "Seed masivo completado: 120 ventas insertadas" in salida
        assert "[Consulta 1 - Listado productos sin N+1]" in salida
        assert "[Consulta 2 - Reporte ventas por fecha]" in salida
        assert "[Consulta 3 - Recálculo productos afectados]" in salida
