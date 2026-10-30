"""
Pruebas automatizadas para T3.8 (Should):
- HU10: Ganancia diaria con costo congelado (CA10.1) y Ranking de productos más/menos vendidos (CA10.2).
- HU11: Punto de equilibrio (CA11.1) y metas diaria y semanal (CA11.2).
- Verificación de permisos granulares ('reportes.ver_financieros' y 'reportes.ver_operativos').
"""

from decimal import Decimal
import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.recetas.models import Producto
from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO, ROL_ENCARGADO
from apps.usuarios.services import crear_personal
from apps.ventas.services import (
    calcular_punto_equilibrio_y_metas,
    obtener_ganancia_diaria,
    obtener_ranking_productos,
    registrar_venta,
)


@pytest.mark.django_db
class TestReportesHU10YHU11:
    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def duenio(self):
        return crear_personal(
            datos_usuario={"username": "duenio_rep", "password": "password123"},
            rol=ROL_DUENIO,
        )

    @pytest.fixture
    def encargado(self):
        return crear_personal(
            datos_usuario={"username": "encargado_rep", "password": "password123"},
            rol=ROL_ENCARGADO,
        )

    @pytest.fixture
    def cajero(self):
        return crear_personal(
            datos_usuario={"username": "cajero_rep", "password": "password123"},
            rol=ROL_CAJERO,
        )

    @pytest.fixture
    def catalogo_productos(self):
        p1 = Producto.objects.create(
            nombre="Espresso Doble",
            precio_venta=Decimal("2000.00"),
            costo_total_calculado=Decimal("600.0000"),
            estado_activo=True,
        )
        p2 = Producto.objects.create(
            nombre="Capuccino Especial",
            precio_venta=Decimal("3000.00"),
            costo_total_calculado=Decimal("1000.0000"),
            estado_activo=True,
        )
        p3 = Producto.objects.create(
            nombre="Té en Hebras",
            precio_venta=Decimal("1800.00"),
            costo_total_calculado=Decimal("400.0000"),
            estado_activo=True,
        )
        return p1, p2, p3

    def test_ganancia_diaria_usa_costo_congelado_y_no_se_altera_ante_subas_posteriores_ca10_1(
        self, client, duenio, encargado, catalogo_productos
    ):
        """
        CA10.1: La ganancia diaria es la suma de (precio - costo congelado) de los ítems vendidos.
        Un cambio posterior en el costo del producto no altera la ganancia histórica.
        """
        p1, p2, _ = catalogo_productos

        # Venta 1: 2 Espressos ($2000 c/u, costo $600 c/u -> ganancia $2800)
        #        + 1 Capuccino ($3000, costo $1000 -> ganancia $2000)
        registrar_venta(
            items_data=[
                {"producto_id": p1.id, "cantidad": 2},
                {"producto_id": p2.id, "cantidad": 1},
            ],
            medio_pago="EFECTIVO",
        )

        # Ahora sube el costo del Espresso de $600 a $1500
        p1.costo_total_calculado = Decimal("1500.0000")
        p1.save(update_fields=["costo_total_calculado"])

        resumen = obtener_ganancia_diaria()
        assert resumen["cantidad_tickets"] == 1
        assert resumen["unidades_vendidas"] == "3.00"
        assert resumen["ingresos_totales"] == "7000.00"
        assert resumen["costo_total_congelado"] == "2200.0000"
        assert resumen["ganancia_bruta_diaria"] == "4800.0000"
        assert len(resumen["desglose_por_dia"]) == 1

        # Verificar endpoint HTTP: Encargado (sin reportes.ver_financieros) recibe 403
        client.force_authenticate(user=encargado)
        resp_403 = client.get("/api/ventas/ganancia-diaria/")
        assert resp_403.status_code == status.HTTP_403_FORBIDDEN
        assert "mensaje" in resp_403.data

        # Dueño recibe 200 OK
        client.force_authenticate(user=duenio)
        resp_200 = client.get("/api/ventas/ganancia-diaria/")
        assert resp_200.status_code == status.HTTP_200_OK
        assert resp_200.data["ganancia_bruta_diaria"] == "4800.0000"

    def test_ranking_productos_mas_y_menos_vendidos_incluyendo_sin_rotacion_ca10_2(
        self, client, duenio, encargado, cajero, catalogo_productos
    ):
        """
        CA10.2: El ranking ordena por cantidad vendida (más vendidos y menos vendidos),
        incluyendo productos activos con 0 ventas en 'menos_vendidos'.
        """
        p1, p2, p3 = catalogo_productos

        registrar_venta(
            items_data=[
                {"producto_id": p2.id, "cantidad": 5},
                {"producto_id": p1.id, "cantidad": 2},
            ],
            medio_pago="EFECTIVO",
        )

        ranking_data = obtener_ranking_productos(limite=3)
        assert ranking_data["mas_vendidos"][0]["producto_id"] == p2.id
        assert ranking_data["mas_vendidos"][0]["unidades_vendidas"] == "5.00"
        assert ranking_data["mas_vendidos"][1]["producto_id"] == p1.id
        assert ranking_data["mas_vendidos"][1]["unidades_vendidas"] == "2.00"

        # El menos vendido debe ser p3 (Té en Hebras) con 0.00 unidades
        assert ranking_data["menos_vendidos"][0]["producto_id"] == p3.id
        assert ranking_data["menos_vendidos"][0]["unidades_vendidas"] == "0.00"

        # Cajero recibe 403 Forbidden
        client.force_authenticate(user=cajero)
        resp_403 = client.get("/api/ventas/ranking-productos/")
        assert resp_403.status_code == status.HTTP_403_FORBIDDEN

        # Encargado (con reportes.ver_operativos) recibe 200 OK
        client.force_authenticate(user=encargado)
        resp_200 = client.get("/api/ventas/ranking-productos/?limite=2")
        assert resp_200.status_code == status.HTTP_200_OK
        assert len(resp_200.data["mas_vendidos"]) == 2
        assert resp_200.data["mas_vendidos"][0]["producto_nombre"] == "Capuccino Especial"

    def test_punto_equilibrio_y_metas_diaria_y_semanal_ca11_1_y_ca11_2(
        self, client, duenio, cajero, catalogo_productos
    ):
        """
        CA11.1: PE ($) = costos_fijos / (1 - costos_variables / ventas).
        CA11.2: Meta diaria = PE mensual / dias_operativos; Meta semanal = meta_diaria * dias_semana.
        """
        # Caso 1: Cálculo explícito
        # costos_fijos = $1.200.000, costos_variables = $800.000, ventas = $2.000.000
        # margen_contribucion = 1 - (800000 / 2000000) = 0.60
        # PE mensual = 1200000 / 0.60 = $2.000.000,00
        # Meta diaria (25 días) = $80.000,00; Meta semanal (6 días) = $480.000,00
        resultado = calcular_punto_equilibrio_y_metas(
            costos_fijos=Decimal("1200000.00"),
            costos_variables=Decimal("800000.00"),
            ventas=Decimal("2000000.00"),
            dias_operativos=25,
            dias_semana=6,
        )

        assert resultado["margen_contribucion"] == "0.6000"
        assert resultado["punto_equilibrio_mensual"] == "2000000.00"
        assert resultado["meta_diaria"] == "80000.00"
        assert resultado["meta_semanal"] == "480000.00"
        assert resultado["porcentaje_cumplimiento_pe"] == "100.00"

        # Caso 2: Tomando ventas y costos variables directamente de los tickets registrados
        p1, _, _ = catalogo_productos
        # 10 Espressos a $2000 ($20.000 ventas) y costo $600 ($6.000 costo variable -> margen 0.70)
        registrar_venta(
            items_data=[{"producto_id": p1.id, "cantidad": 10}],
            medio_pago="EFECTIVO",
        )

        client.force_authenticate(user=duenio)
        resp_post = client.post(
            "/api/ventas/punto-equilibrio/",
            {
                "costos_fijos": "700000.00",
                "dias_operativos": 25,
                "dias_semana": 5,
            },
            format="json",
        )
        assert resp_post.status_code == status.HTTP_200_OK
        assert resp_post.data["ventas_referencia"] == "20000.00"
        assert resp_post.data["costos_variables"] == "6000.00"
        assert resp_post.data["margen_contribucion"] == "0.7000"
        assert resp_post.data["punto_equilibrio_mensual"] == "1000000.00"
        assert resp_post.data["meta_diaria"] == "40000.00"
        assert resp_post.data["meta_semanal"] == "200000.00"

        # Caso 3: Validación de error 400 cuando costos_variables >= ventas
        resp_400 = client.post(
            "/api/ventas/punto-equilibrio/",
            {
                "costos_fijos": "500000.00",
                "costos_variables": "250000.00",
                "ventas": "200000.00",
            },
            format="json",
        )
        assert resp_400.status_code == status.HTTP_400_BAD_REQUEST
        assert "mensaje" in resp_400.data

        # Caso 4: Cajero no autorizado recibe 403 Forbidden
        client.force_authenticate(user=cajero)
        resp_403 = client.get("/api/ventas/punto-equilibrio/?costos_fijos=500000")
        assert resp_403.status_code == status.HTTP_403_FORBIDDEN
