"""
Pruebas de API para endpoints de reportes financieros y operativos (T3.8 y docs/seguridad.md §5.1):
- GET /api/ventas/ganancia-diaria/ (requiere 'reportes.ver_financieros')
- GET /api/ventas/ranking-productos/ (requiere 'reportes.ver_operativos')
- GET y POST /api/ventas/punto-equilibrio/ (requiere 'reportes.ver_financieros')
Verifica autorizaciones por rol (Dueño 200, Encargado 200/403, Cajero 403) y validaciones (400).
"""

from decimal import Decimal
import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.recetas.models import Producto
from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO, ROL_ENCARGADO
from apps.usuarios.services import crear_personal
from apps.ventas.services import registrar_venta


@pytest.mark.django_db
class TestApiReportes:
    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def duenio(self):
        return crear_personal(
            datos_usuario={"username": "duenio_api_rep", "password": "password123"},
            rol=ROL_DUENIO,
        )

    @pytest.fixture
    def encargado(self):
        return crear_personal(
            datos_usuario={"username": "encargado_api_rep", "password": "password123"},
            rol=ROL_ENCARGADO,
        )

    @pytest.fixture
    def cajero(self):
        return crear_personal(
            datos_usuario={"username": "cajero_api_rep", "password": "password123"},
            rol=ROL_CAJERO,
        )

    @pytest.fixture
    def catalogo_con_ventas(self):
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
        registrar_venta(
            items_data=[
                {"producto_id": p1.id, "cantidad": 2},
                {"producto_id": p2.id, "cantidad": 1},
            ],
            medio_pago="EFECTIVO",
        )
        return p1, p2

    # =========================================================================
    # 1. GET /api/ventas/ganancia-diaria/ (reportes.ver_financieros)
    # =========================================================================

    def test_api_ganancia_diaria_duenio_200(self, client, duenio, catalogo_con_ventas):
        """Dueño posee 'reportes.ver_financieros' y accede al reporte."""
        client.force_authenticate(user=duenio)
        resp = client.get("/api/ventas/ganancia-diaria/")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["cantidad_tickets"] == 1
        assert resp.data["ingresos_totales"] == "7000.00"
        assert resp.data["costo_total_congelado"] == "2200.0000"
        assert resp.data["ganancia_bruta_diaria"] == "4800.0000"

    def test_api_ganancia_diaria_encargado_rechazo_403(self, client, encargado):
        """Encargado NO tiene 'reportes.ver_financieros' y recibe 403 con formato único."""
        client.force_authenticate(user=encargado)
        resp = client.get("/api/ventas/ganancia-diaria/")
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert "mensaje" in resp.data
        assert "detalles" in resp.data

    def test_api_ganancia_diaria_cajero_rechazo_403(self, client, cajero):
        """Cajero sin permisos financieros recibe 403."""
        client.force_authenticate(user=cajero)
        resp = client.get("/api/ventas/ganancia-diaria/")
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_api_ganancia_diaria_rango_fechas_invalido_400(self, client, duenio):
        """Si fecha_inicio es posterior a fecha_fin, responde 400."""
        client.force_authenticate(user=duenio)
        resp = client.get(
            "/api/ventas/ganancia-diaria/?fecha_inicio=2026-12-01&fecha_fin=2026-01-01"
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    # =========================================================================
    # 2. GET /api/ventas/ranking-productos/ (reportes.ver_operativos)
    # =========================================================================

    def test_api_ranking_productos_encargado_200(
        self, client, encargado, catalogo_con_ventas
    ):
        """Encargado posee 'reportes.ver_operativos' y puede consultar el ranking."""
        client.force_authenticate(user=encargado)
        resp = client.get("/api/ventas/ranking-productos/?limite=2")
        assert resp.status_code == status.HTTP_200_OK
        assert "mas_vendidos" in resp.data
        assert "menos_vendidos" in resp.data
        assert len(resp.data["mas_vendidos"]) <= 2

    def test_api_ranking_productos_duenio_200(
        self, client, duenio, catalogo_con_ventas
    ):
        """Dueño puede consultar el ranking con HTTP 200."""
        client.force_authenticate(user=duenio)
        resp = client.get("/api/ventas/ranking-productos/")
        assert resp.status_code == status.HTTP_200_OK

    def test_api_ranking_productos_cajero_rechazo_403(self, client, cajero):
        """Cajero no tiene 'reportes.ver_operativos' y recibe 403."""
        client.force_authenticate(user=cajero)
        resp = client.get("/api/ventas/ranking-productos/")
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_api_ranking_productos_limite_invalido_400(self, client, duenio):
        """Límite no numérico responde 400 Bad Request."""
        client.force_authenticate(user=duenio)
        resp = client.get("/api/ventas/ranking-productos/?limite=abc")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    # =========================================================================
    # 3. GET y POST /api/ventas/punto-equilibrio/ (reportes.ver_financieros)
    # =========================================================================

    def test_api_punto_equilibrio_post_duenio_200(self, client, duenio):
        """Dueño calcula PE por POST con parámetros explícitos y recibe 200."""
        client.force_authenticate(user=duenio)
        resp = client.post(
            "/api/ventas/punto-equilibrio/",
            {
                "costos_fijos": "1200000.00",
                "costos_variables": "800000.00",
                "ventas": "2000000.00",
                "dias_operativos": 25,
                "dias_semana": 6,
            },
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["margen_contribucion"] == "0.6000"
        assert resp.data["punto_equilibrio_mensual"] == "2000000.00"
        assert resp.data["meta_diaria"] == "80000.00"
        assert resp.data["meta_semanal"] == "480000.00"

    def test_api_punto_equilibrio_get_duenio_200(
        self, client, duenio, catalogo_con_ventas
    ):
        """Dueño calcula PE por GET usando ventas de la base y query params."""
        client.force_authenticate(user=duenio)
        resp = client.get("/api/ventas/punto-equilibrio/?costos_fijos=700000.00")
        assert resp.status_code == status.HTTP_200_OK
        # Ventas $7000, Costo $2200 -> Margen contribución = 4800 / 7000 = 0.6857
        # PE = 700000 / (48/70) = 1020833.33
        assert resp.data["ventas_referencia"] == "7000.00"
        assert resp.data["costos_variables"] == "2200.00"
        assert resp.data["punto_equilibrio_mensual"] == "1020833.33"

    def test_api_punto_equilibrio_encargado_rechazo_403(self, client, encargado):
        """Encargado no posee 'reportes.ver_financieros' y recibe 403."""
        client.force_authenticate(user=encargado)
        resp = client.post(
            "/api/ventas/punto-equilibrio/",
            {"costos_fijos": "500000.00"},
            format="json",
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_api_punto_equilibrio_cajero_rechazo_403(self, client, cajero):
        """Cajero recibe 403 al intentar calcular punto de equilibrio."""
        client.force_authenticate(user=cajero)
        resp = client.get("/api/ventas/punto-equilibrio/?costos_fijos=500000.00")
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_api_punto_equilibrio_sin_costos_fijos_400(self, client, duenio):
        """Omitir costos_fijos responde 400 Bad Request."""
        client.force_authenticate(user=duenio)
        resp = client.post("/api/ventas/punto-equilibrio/", {}, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_api_punto_equilibrio_costos_variables_superan_ventas_400(
        self, client, duenio
    ):
        """Cuando costos variables >= ventas responde 400 con mensaje explicativo."""
        client.force_authenticate(user=duenio)
        resp = client.post(
            "/api/ventas/punto-equilibrio/",
            {
                "costos_fijos": "500000.00",
                "costos_variables": "300000.00",
                "ventas": "200000.00",
            },
            format="json",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "mensaje" in resp.data
