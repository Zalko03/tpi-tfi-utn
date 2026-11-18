"""
Pruebas de API para el endpoint público de la carta digital por QR (GET /api/carta-publica/).
Verifica acceso anónimo, exclusión de inactivos, ausencia de costos/recetas y rate limiting (429).
"""

from decimal import Decimal

import pytest
from django.core.cache import cache
from rest_framework import status
from rest_framework.settings import api_settings
from rest_framework.test import APIClient

from apps.insumos.models import Insumo
from apps.recetas.models import Producto, RecetaItem
from apps.recetas.services import actualizar_costo_y_margen_producto


@pytest.mark.django_db
class TestApiCartaPublica:
    @pytest.fixture(autouse=True)
    def limpiar_cache_throttle(self):
        cache.clear()
        yield
        cache.clear()

    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def catalogo_mixto(self):
        insumo = Insumo.objects.create(
            nombre="Grano Arábica Carta",
            unidad_base="g",
            costo_unitario=Decimal("32.5000"),
        )
        activo_b = Producto.objects.create(
            nombre="Medialuna Artesanal",
            codigo_barras="7790009000002",
            precio_venta=Decimal("1900.00"),
            minutos_mano_obra=Decimal("2.00"),
            costo_hora_mano_obra=Decimal("2800.00"),
            descartables=Decimal("50.00"),
            estado_activo=True,
        )
        activo_a = Producto.objects.create(
            nombre="Café Flat White",
            codigo_barras="7790009000001",
            precio_venta=Decimal("3800.00"),
            minutos_mano_obra=Decimal("1.50"),
            costo_hora_mano_obra=Decimal("2800.00"),
            descartables=Decimal("90.00"),
            estado_activo=True,
        )
        inactivo = Producto.objects.create(
            nombre="Alfajor Oculto",
            codigo_barras="7790009000003",
            precio_venta=Decimal("2200.00"),
            minutos_mano_obra=Decimal("1.00"),
            costo_hora_mano_obra=Decimal("2800.00"),
            descartables=Decimal("40.00"),
            estado_activo=False,
        )
        RecetaItem.objects.create(
            producto=activo_a,
            insumo=insumo,
            cantidad=Decimal("18.0000"),
            unidad="g",
        )
        actualizar_costo_y_margen_producto(activo_a)
        actualizar_costo_y_margen_producto(activo_b)
        actualizar_costo_y_margen_producto(inactivo)
        return {"activo_a": activo_a, "activo_b": activo_b, "inactivo": inactivo}

    def test_get_carta_publica_responde_200_sin_autenticacion(self, client, catalogo_mixto):
        res = client.get("/api/carta-publica/")

        assert res.status_code == status.HTTP_200_OK
        body = res.json()
        assert body["total"] == 2
        assert len(body["datos"]) == 2
        # Ordenado alfabéticamente por nombre
        assert [p["nombre"] for p in body["datos"]] == [
            "Café Flat White",
            "Medialuna Artesanal",
        ]
        assert body["datos"][0]["precio_venta"] == "3800.00"
        assert body["datos"][0]["id"] == catalogo_mixto["activo_a"].id

    def test_get_carta_publica_excluye_productos_inactivos(self, client, catalogo_mixto):
        res = client.get("/api/carta-publica/")

        assert res.status_code == status.HTTP_200_OK
        nombres = [item["nombre"] for item in res.json()["datos"]]
        assert "Alfajor Oculto" not in nombres
        assert catalogo_mixto["inactivo"].id not in [item["id"] for item in res.json()["datos"]]

    def test_get_carta_publica_no_expone_costos_margenes_mano_obra_ni_insumos(
        self, client, catalogo_mixto
    ):
        res = client.get("/api/carta-publica/")

        assert res.status_code == status.HTTP_200_OK
        campos_prohibidos = {
            "costo_total_calculado",
            "ganancia_bruta",
            "margen_bruto",
            "minutos_mano_obra",
            "costo_hora_mano_obra",
            "descartables",
            "receta",
            "receta_items",
            "insumos",
            "codigo_barras",
            "estado_activo",
        }
        for item in res.json()["datos"]:
            assert set(item.keys()) == {"id", "nombre", "precio_venta"}
            assert campos_prohibidos.isdisjoint(item.keys())

        texto_crudo = res.content.decode("utf-8")
        assert "Grano Arábica Carta" not in texto_crudo
        assert "costo_total_calculado" not in texto_crudo
        assert "margen_bruto" not in texto_crudo

    def test_get_carta_publica_rechaza_escritura_para_anonimos(self, client):
        res_post = client.post(
            "/api/carta-publica/",
            {"nombre": "Intento Público", "precio_venta": "100.00"},
            format="json",
        )
        assert res_post.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    def test_get_carta_publica_throttle_devuelve_429_al_superar_limite(
        self, client, catalogo_mixto
    ):
        cache.clear()
        tasa_original = api_settings.DEFAULT_THROTTLE_RATES.get("carta_publica")
        try:
            api_settings.DEFAULT_THROTTLE_RATES["carta_publica"] = "2/min"

            r1 = client.get("/api/carta-publica/")
            r2 = client.get("/api/carta-publica/")
            r3 = client.get("/api/carta-publica/")

            assert r1.status_code == status.HTTP_200_OK
            assert r2.status_code == status.HTTP_200_OK
            assert r3.status_code == status.HTTP_429_TOO_MANY_REQUESTS
            body_429 = r3.json()
            assert (
                body_429["mensaje"]
                == "Demasiados intentos seguidos. Probá de nuevo en unos minutos"
            )
            assert "espera_segundos" in (body_429.get("detalles") or {})
        finally:
            if tasa_original is not None:
                api_settings.DEFAULT_THROTTLE_RATES["carta_publica"] = tasa_original
            cache.clear()
