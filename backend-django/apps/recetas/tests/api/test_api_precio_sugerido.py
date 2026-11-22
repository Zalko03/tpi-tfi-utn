"""Pruebas de API para precio sugerido y precios de competencia por producto (HU9)."""

from decimal import Decimal

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.insumos.models import Insumo
from apps.recetas.models import PrecioCompetencia, Producto, RecetaItem
from apps.recetas.services import actualizar_costo_y_margen_producto
from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO, ROL_ENCARGADO
from apps.usuarios.services import crear_personal


@pytest.mark.django_db
class TestApiPrecioSugerido:
    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def duenio(self):
        return crear_personal(
            datos_usuario={"username": "duenio_hu9_api", "password": "password123"},
            rol=ROL_DUENIO,
        )

    @pytest.fixture
    def encargado(self):
        return crear_personal(
            datos_usuario={"username": "encargado_hu9_api", "password": "password123"},
            rol=ROL_ENCARGADO,
        )

    @pytest.fixture
    def cajero(self):
        return crear_personal(
            datos_usuario={"username": "cajero_hu9_api", "password": "password123"},
            rol=ROL_CAJERO,
        )

    @pytest.fixture
    def producto_latte(self):
        cafe = Insumo.objects.create(
            nombre="Café HU9 API",
            unidad_base="g",
            costo_unitario=Decimal("50.0000"),
        )
        producto = Producto.objects.create(
            nombre="Café Latte HU9",
            precio_venta=Decimal("2600.00"),
            minutos_mano_obra=Decimal("0.00"),
            descartables=Decimal("0.00"),
            margen_objetivo=Decimal("0.4000"),
            redondeo_multiplo=50,
        )
        RecetaItem.objects.create(
            producto=producto,
            insumo=cafe,
            cantidad=Decimal("20.0000"),
            unidad="g",
        )
        actualizar_costo_y_margen_producto(producto)
        return producto

    def test_flujo_completo_precio_sugerido_y_competencia_no_cambia_precio_solo(
        self, client, duenio, producto_latte
    ):
        client.force_authenticate(user=duenio)

        # 1. Sin competencia: costo 1000 / (1 - 0.40) = 1666.67 -> múltiplo 50 = 1650.00
        res_sug = client.get(f"/api/productos/{producto_latte.id}/precio-sugerido/")
        assert res_sug.status_code == status.HTTP_200_OK
        data_sug = res_sug.json()
        assert data_sug["precio_base_redondeado"] == "1650.00"
        assert data_sug["precio_sugerido"] == "1650.00"
        assert data_sug["acotado_por"] == "NINGUNO"

        # 2. Simulación por query params con redondeo $100: 1000 / (1 - 0.40) = 1666.67 -> 1700.00
        res_sim = client.get(
            f"/api/productos/{producto_latte.id}/precio-sugerido/?margen_objetivo=0.40&redondeo_multiplo=100"
        )
        assert res_sim.status_code == status.HTTP_200_OK
        assert res_sim.json()["precio_sugerido"] == "1700.00"

        # 3. Cargar referencias de competencia manualmente (2800 y 3200 -> min 2800, prom 3000)
        res_comp_1 = client.post(
            "/api/precios-competencia/",
            {
                "producto": producto_latte.id,
                "nombre_competidor": "Cafetería Plaza",
                "precio": "2800.00",
            },
            format="json",
        )
        assert res_comp_1.status_code == status.HTTP_201_CREATED

        res_comp_2 = client.post(
            "/api/precios-competencia/",
            {
                "producto": producto_latte.id,
                "precio": "3200.00",
            },
            format="json",
        )
        assert res_comp_2.status_code == status.HTTP_201_CREATED
        assert res_comp_2.json()["nombre_competidor"] == "Referencia de mercado"

        # 4. Actualizar margen objetivo a 0.70 (1000 / 0.30 = 3333.33 -> 3350) -> acotado por promedio 3000
        res_patch = client.patch(
            f"/api/productos/{producto_latte.id}/",
            {"margen_objetivo": "0.7000", "redondeo_multiplo": 50},
            format="json",
        )
        assert res_patch.status_code == status.HTTP_200_OK
        prod_data = res_patch.json()
        assert prod_data["precio_venta"] == "2600.00"
        assert prod_data["precio_sugerido"] == "3000.00"
        assert prod_data["sugerencia_precio"]["acotado_por"] == "PROMEDIO"
        assert prod_data["sugerencia_precio"]["competencia_minimo"] == "2800.00"
        assert prod_data["sugerencia_precio"]["competencia_promedio"] == "3000.00"

        # Verificar en BD que precio_venta jamás cambió automáticamente
        producto_latte.refresh_from_db()
        assert producto_latte.precio_venta == Decimal("2600.00")

        # 5. Eliminar una referencia de competencia
        res_del = client.delete(f"/api/precios-competencia/{res_comp_1.json()['id']}/")
        assert res_del.status_code == status.HTTP_204_NO_CONTENT
        assert PrecioCompetencia.objects.filter(producto=producto_latte).count() == 1

    def test_validaciones_retornan_400_en_formato_unico(self, client, duenio, producto_latte):
        client.force_authenticate(user=duenio)

        res_margen = client.patch(
            f"/api/productos/{producto_latte.id}/",
            {"margen_objetivo": "1.0000"},
            format="json",
        )
        assert res_margen.status_code == status.HTTP_400_BAD_REQUEST
        assert "mensaje" in res_margen.json()
        assert "detalles" in res_margen.json()

        res_mult = client.patch(
            f"/api/productos/{producto_latte.id}/",
            {"redondeo_multiplo": 25},
            format="json",
        )
        assert res_mult.status_code == status.HTTP_400_BAD_REQUEST
        assert "mensaje" in res_mult.json()

        res_comp = client.post(
            "/api/precios-competencia/",
            {"producto": producto_latte.id, "precio": "0.00"},
            format="json",
        )
        assert res_comp.status_code == status.HTTP_400_BAD_REQUEST
        assert "mensaje" in res_comp.json()

        res_query = client.get(
            f"/api/productos/{producto_latte.id}/precio-sugerido/?margen_objetivo=1.0"
        )
        assert res_query.status_code == status.HTTP_400_BAD_REQUEST
        assert "mensaje" in res_query.json()

    def test_cajero_no_ve_sugerido_ni_competencia_y_encargado_si(
        self, client, cajero, encargado, producto_latte
    ):
        PrecioCompetencia.objects.create(
            producto=producto_latte,
            nombre_competidor="Local Test",
            precio=Decimal("2900.00"),
        )

        client.force_authenticate(user=cajero)
        res_prod_caj = client.get(f"/api/productos/{producto_latte.id}/")
        assert res_prod_caj.status_code == status.HTTP_200_OK
        data_caj = res_prod_caj.json()
        assert data_caj["precio_sugerido"] is None
        assert data_caj["sugerencia_precio"] is None
        assert data_caj["margen_objetivo"] is None
        assert data_caj["redondeo_multiplo"] is None
        assert data_caj["precios_competencia"] == []

        assert (
            client.get(f"/api/productos/{producto_latte.id}/precio-sugerido/").status_code
            == status.HTTP_403_FORBIDDEN
        )
        assert client.get("/api/precios-competencia/").status_code == status.HTTP_403_FORBIDDEN

        client.force_authenticate(user=encargado)
        res_enc = client.get(f"/api/productos/{producto_latte.id}/precio-sugerido/")
        assert res_enc.status_code == status.HTTP_200_OK
        assert res_enc.json()["precio_sugerido"] == "2900.00"
