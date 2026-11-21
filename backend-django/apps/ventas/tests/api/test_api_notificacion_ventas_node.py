"""Tests de API para notificación a Node al crear o anular ventas (HU8)."""

import json
import urllib.error
import urllib.request
from decimal import Decimal

import pytest
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.caja.models import TurnoCaja
from apps.recetas.models import Producto
from apps.usuarios.constantes import ROL_CAJERO, ROL_ENCARGADO
from apps.usuarios.services import crear_personal
from apps.ventas.models import Venta


class _RespuestaHttpMock:
    def __init__(self, status_code=202):
        self.status = status_code

    def getcode(self):
        return self.status

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


@pytest.mark.django_db
class TestApiNotificacionVentasNode:
    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def cajero(self):
        return crear_personal(
            datos_usuario={"username": "cajero_api_node", "password": "password123"},
            rol=ROL_CAJERO,
        )

    @pytest.fixture
    def encargado(self):
        return crear_personal(
            datos_usuario={"username": "encargado_api_node", "password": "password123"},
            rol=ROL_ENCARGADO,
        )

    @pytest.fixture
    def producto(self):
        return Producto.objects.create(
            nombre="Espresso Live API",
            precio_venta=Decimal("2600.00"),
            costo_total_calculado=Decimal("800.0000"),
            estado_activo=True,
        )

    @override_settings(
        NODE_BASE_URL="http://127.0.0.1:3000",
        EVENTOS_INTERNOS_CLAVE="clave-api-node-test",
    )
    def test_post_ventas_y_anular_notifican_a_node_con_correlation_id(
        self, monkeypatch, client, cajero, encargado, producto
    ):
        peticiones = []

        def fake_urlopen(req, timeout=None):
            peticiones.append(
                {
                    "headers": dict(req.header_items()),
                    "body": json.loads(req.data.decode("utf-8")),
                }
            )
            return _RespuestaHttpMock(202)

        monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("3000.00"))

        client.force_authenticate(user=cajero)
        resp_venta = client.post(
            "/api/ventas/",
            {
                "turno_caja": turno.id,
                "medio_pago": "EFECTIVO",
                "items_entrada": [{"producto_id": producto.id, "cantidad": "2.00"}],
            },
            format="json",
            HTTP_X_REQUEST_ID="req-hu8-venta-123",
        )
        assert resp_venta.status_code == status.HTTP_201_CREATED, resp_venta.data
        venta_id = resp_venta.data["id"]

        client.force_authenticate(user=encargado)
        resp_anul = client.post(
            f"/api/ventas/{venta_id}/anular/",
            {"motivo": "Cancelado por cliente"},
            format="json",
            HTTP_X_REQUEST_ID="req-hu8-anul-456",
        )
        assert resp_anul.status_code == status.HTTP_200_OK, resp_anul.data

        assert len(peticiones) == 2
        assert peticiones[0]["headers"]["X-clave-interna"] == "clave-api-node-test"
        assert peticiones[0]["headers"]["X-request-id"] == "req-hu8-venta-123"
        assert peticiones[0]["body"]["evento"] == "venta.registrada"
        assert peticiones[0]["body"]["datos"]["ventaId"] == venta_id

        assert peticiones[1]["headers"]["X-clave-interna"] == "clave-api-node-test"
        assert peticiones[1]["headers"]["X-request-id"] == "req-hu8-anul-456"
        assert peticiones[1]["body"]["evento"] == "venta.anulada"
        assert peticiones[1]["body"]["datos"]["ventaId"] == venta_id
        assert peticiones[1]["body"]["datos"]["motivoAnulacion"] == "Cancelado por cliente"

    @override_settings(
        NODE_BASE_URL="http://127.0.0.1:3000",
        EVENTOS_INTERNOS_CLAVE="clave-api-node-test",
    )
    def test_post_ventas_y_anular_responden_ok_si_node_esta_caido(
        self, monkeypatch, client, cajero, encargado, producto
    ):
        def fake_urlopen_caido(req, timeout=None):
            raise urllib.error.URLError("Connection refused")

        monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen_caido)

        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("3000.00"))

        client.force_authenticate(user=cajero)
        resp_venta = client.post(
            "/api/ventas/",
            {
                "turno_caja": turno.id,
                "medio_pago": "EFECTIVO",
                "items_entrada": [{"producto_id": producto.id, "cantidad": "1.00"}],
            },
            format="json",
        )
        assert resp_venta.status_code == status.HTTP_201_CREATED
        venta_id = resp_venta.data["id"]
        assert Venta.objects.filter(pk=venta_id, estado="EMITIDA").exists()

        client.force_authenticate(user=encargado)
        resp_anul = client.post(
            f"/api/ventas/{venta_id}/anular/",
            {"motivo": "Node apagado"},
            format="json",
        )
        assert resp_anul.status_code == status.HTTP_200_OK
        assert Venta.objects.filter(pk=venta_id, estado="ANULADA").exists()
