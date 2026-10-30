"""
Pruebas de API para el endpoint POST /api/compras/confirmar-importacion/ (T3.3).
Verifica permisos (Dueño 201, Cajero 403, Anónimo 401) y formato unificado de errores (400).
"""

from decimal import Decimal
import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.insumos.models import Compra, Insumo, Proveedor
from apps.recetas.models import Producto, RecetaItem
from apps.recetas.services import actualizar_costo_y_margen_producto
from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO
from apps.usuarios.services import crear_personal


@pytest.mark.django_db
class TestApiConfirmarImportacion:
    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def duenio(self):
        return crear_personal(
            datos_usuario={"username": "duenio_api_ci", "password": "password123"},
            rol=ROL_DUENIO,
        )

    @pytest.fixture
    def cajero(self):
        return crear_personal(
            datos_usuario={"username": "cajero_api_ci", "password": "password123"},
            rol=ROL_CAJERO,
        )

    @pytest.fixture
    def escenario_catalogo(self):
        proveedor = Proveedor.objects.create(nombre="Distribuidora Litoral")
        cafe = Insumo.objects.create(
            nombre="Café Tostado Brasil",
            unidad_base="g",
            costo_unitario=Decimal("20.0000"),
        )
        latte = Producto.objects.create(
            nombre="Latte Clásico",
            precio_venta=Decimal("3200.00"),
            minutos_mano_obra=Decimal("3.00"),
            costo_hora_mano_obra=Decimal("2400.00"),
            descartables=Decimal("80.00"),
        )
        RecetaItem.objects.create(
            producto=latte,
            insumo=cafe,
            cantidad=Decimal("18.0000"),
            unidad="g",
        )
        actualizar_costo_y_margen_producto(latte)
        return {"proveedor": proveedor, "cafe": cafe, "latte": latte}

    def test_api_confirmar_importacion_exito_duenio(
        self, client, duenio, escenario_catalogo
    ):
        """POST /api/compras/confirmar-importacion/ con Dueño responde 201 y recalcula."""
        client.force_authenticate(user=duenio)
        payload = {
            "proveedor_nombre": "Distribuidora Litoral",
            "envio": "1000.00",
            "items": [
                {
                    "nombre_insumo": "Café Tostado Brasil",
                    "cantidad": "1.0000",
                    "unidad": "kg",
                    "precio_total": "29000.00",
                    "iva_incluido": True,
                    "alicuota": "21.00",
                }
            ],
        }

        res = client.post("/api/compras/confirmar-importacion/", payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED
        data = res.json()
        assert "compras_creadas" in data
        assert "productos_recalculados" in data
        assert len(data["compras_creadas"]) == 1
        assert data["compras_creadas"][0]["costo_unitario_calculado"] == "30.0000"
        assert len(data["productos_recalculados"]) == 1
        assert data["productos_recalculados"][0]["costo_nuevo"] == "740.0000"

    def test_api_confirmar_importacion_rechaza_cajero_403(
        self, client, cajero, escenario_catalogo
    ):
        """Test negativo: Cajero sin 'compras.registrar' recibe 403 con formato único."""
        client.force_authenticate(user=cajero)
        payload = {
            "proveedor_nombre": "Distribuidora Litoral",
            "envio": "0.00",
            "items": [
                {
                    "nombre_insumo": "Café Tostado Brasil",
                    "cantidad": "1.0000",
                    "unidad": "kg",
                    "precio_total": "29000.00",
                }
            ],
        }

        res = client.post("/api/compras/confirmar-importacion/", payload, format="json")
        assert res.status_code == status.HTTP_403_FORBIDDEN
        data = res.json()
        assert "mensaje" in data
        assert "detalles" in data
        assert Compra.objects.count() == 0

    def test_api_confirmar_importacion_rechaza_anonimo_401(self, client):
        """Petición sin autenticación recibe 401."""
        res = client.post(
            "/api/compras/confirmar-importacion/",
            {"items": []},
            format="json",
        )
        assert res.status_code == status.HTTP_401_UNAUTHORIZED

    def test_api_confirmar_importacion_rechaza_datos_invalidos_400(
        self, client, duenio
    ):
        """Datos inválidos responden 400 con el contrato de error unificado."""
        client.force_authenticate(user=duenio)
        res = client.post(
            "/api/compras/confirmar-importacion/",
            {"proveedor_nombre": "", "items": []},
            format="json",
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        data = res.json()
        assert "mensaje" in data
        assert "detalles" in data
