"""Pruebas de API para creación de ventas (POST /api/ventas/)."""

import logging
import uuid
from decimal import Decimal

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.caja.models import TurnoCaja
from apps.recetas.models import Producto
from apps.usuarios.constantes import ROL_CAJERO
from apps.usuarios.services import crear_personal
from apps.ventas.models import Venta


@pytest.mark.django_db
class TestApiVentasCreate:
    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def cajero(self):
        return crear_personal(
            datos_usuario={"username": "cajero_api_ventas", "password": "password123"},
            rol=ROL_CAJERO,
        )

    @pytest.fixture
    def turno_cajero(self, cajero):
        return TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("5000.00"))

    @pytest.fixture
    def producto(self):
        return Producto.objects.create(
            nombre="Flat White API",
            precio_venta=Decimal("2800.00"),
            costo_total_calculado=Decimal("900.0000"),
            estado_activo=True,
        )

    def test_api_crear_venta_ignora_precio_unitario_manipulado(
        self, client, cajero, turno_cajero, producto, caplog
    ):
        """
        POST /api/ventas/ ignora cualquier precio_unitario manipulado (menor o mayor)
        y registra los ítems y el total exclusivamente con producto.precio_venta de BD.
        """
        client.force_authenticate(user=cajero)
        payload = {
            "turno_caja": turno_cajero.id,
            "medio_pago": "EFECTIVO",
            "origen": "propio",
            "items_entrada": [
                {"producto_id": producto.id, "cantidad": "1.00", "precio_unitario": "1.00"},
                {"producto_id": producto.id, "cantidad": "2.00", "precio_unitario": "99999.00"},
            ],
        }

        with caplog.at_level(logging.WARNING, logger="apps.ventas.services"):
            resp = client.post("/api/ventas/", payload, format="json")

        assert resp.status_code == status.HTTP_201_CREATED, resp.data
        assert resp.data["total"] == "8400.00"
        assert [item["precio_unitario"] for item in resp.data["items"]] == ["2800.00", "2800.00"]

        warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
        assert len(warnings) == 2
        assert warnings[0].precio_cliente == "1.00"
        assert warnings[0].precio_bd == "2800.00"
        assert warnings[1].precio_cliente == "99999.00"
        assert warnings[1].precio_bd == "2800.00"

    def test_api_crear_venta_offline_con_precio_desactualizado_no_rechaza_y_loguea(
        self, client, cajero, turno_cajero, producto, caplog
    ):
        """
        Una venta offline sincronizada tras un aumento de precio no se rechaza,
        cobra producto.precio_venta de BD y registra la diferencia en log estructurado.
        """
        producto.precio_venta = Decimal("3100.00")
        producto.save(update_fields=["precio_venta"])

        client.force_authenticate(user=cajero)
        payload = {
            "turno_caja": turno_cajero.id,
            "medio_pago": "EFECTIVO",
            "origen": "offline",
            "items_entrada": [
                {"producto_id": producto.id, "cantidad": "3.00", "precio_unitario": "2800.00"}
            ],
        }

        with caplog.at_level(logging.WARNING, logger="apps.ventas.services"):
            resp = client.post("/api/ventas/", payload, format="json")

        assert resp.status_code == status.HTTP_201_CREATED, resp.data
        assert resp.data["origen"] == "offline"
        assert resp.data["total"] == "9300.00"
        assert resp.data["items"][0]["precio_unitario"] == "3100.00"

        warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
        assert len(warnings) == 1
        rec = warnings[0]
        assert rec.producto_id == producto.id
        assert rec.producto_nombre == "Flat White API"
        assert rec.origen == "offline"
        assert rec.precio_cliente == "2800.00"
        assert rec.precio_bd == "3100.00"
        assert rec.diferencia == "300.00"

    def test_api_crear_venta_acepta_precio_unitario_null_y_omitido(
        self, client, cajero, turno_cajero, producto
    ):
        """Acepta ítems sin precio_unitario o con precio_unitario=null."""
        client.force_authenticate(user=cajero)
        payload = {
            "turno_caja": turno_cajero.id,
            "medio_pago": "TARJETA",
            "items": [
                {"producto": producto.id, "cantidad": "1.00", "precio_unitario": None},
                {"producto": producto.id, "cantidad": "1.00"},
            ],
        }

        resp = client.post("/api/ventas/", payload, format="json")

        assert resp.status_code == status.HTTP_201_CREATED, resp.data
        assert resp.data["total"] == "5600.00"
        assert [item["precio_unitario"] for item in resp.data["items"]] == ["2800.00", "2800.00"]

    def test_api_crear_venta_idempotente_con_mismo_id_operacion(
        self, client, cajero, turno_cajero, producto
    ):
        """Dos POST /api/ventas/ con el mismo id_operacion crean 1 sola venta."""
        client.force_authenticate(user=cajero)
        op_id = str(uuid.uuid4())
        payload = {
            "id_operacion": op_id,
            "turno_caja": turno_cajero.id,
            "medio_pago": "EFECTIVO",
            "origen": "offline",
            "items_entrada": [{"producto_id": producto.id, "cantidad": "2.00"}],
        }

        resp_1 = client.post("/api/ventas/", payload, format="json")
        resp_2 = client.post("/api/ventas/", payload, format="json")

        assert resp_1.status_code == status.HTTP_201_CREATED, resp_1.data
        assert resp_2.status_code == status.HTTP_201_CREATED, resp_2.data
        assert resp_1.data["id"] == resp_2.data["id"]
        assert resp_1.data["id_operacion"] == op_id
        assert Venta.objects.filter(id_operacion=op_id).count() == 1

    def test_api_rechaza_venta_producto_precio_cero_o_inexistente_con_400(
        self, client, cajero, turno_cajero
    ):
        """Producto con precio_venta <= 0 o inexistente devuelve 400 de validación limpio."""
        prod_cero = Producto.objects.create(
            nombre="Producto Cero API",
            precio_venta=Decimal("0.00"),
            costo_total_calculado=Decimal("100.0000"),
            estado_activo=True,
        )
        client.force_authenticate(user=cajero)

        resp_cero = client.post(
            "/api/ventas/",
            {
                "turno_caja": turno_cajero.id,
                "medio_pago": "EFECTIVO",
                "items_entrada": [{"producto_id": prod_cero.id, "cantidad": "1.00"}],
            },
            format="json",
        )
        assert resp_cero.status_code == status.HTTP_400_BAD_REQUEST
        assert "mensaje" in resp_cero.data

        resp_inexistente = client.post(
            "/api/ventas/",
            {
                "turno_caja": turno_cajero.id,
                "medio_pago": "EFECTIVO",
                "items_entrada": [{"producto_id": 999999, "cantidad": "1.00"}],
            },
            format="json",
        )
        assert resp_inexistente.status_code == status.HTTP_400_BAD_REQUEST
        assert "mensaje" in resp_inexistente.data

    def test_api_rechaza_venta_en_turno_cerrado_con_400(self, client, cajero, producto):
        """Enviar turno_caja en estado CERRADO responde 400 Bad Request."""
        turno_cerrado = TurnoCaja.objects.create(
            usuario=cajero,
            efectivo_inicial=Decimal("5000.00"),
            estado="CERRADO",
        )
        client.force_authenticate(user=cajero)

        resp = client.post(
            "/api/ventas/",
            {
                "turno_caja": turno_cerrado.id,
                "medio_pago": "EFECTIVO",
                "items_entrada": [{"producto_id": producto.id, "cantidad": "1.00"}],
            },
            format="json",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "mensaje" in resp.data
        assert Venta.objects.filter(turno_caja=turno_cerrado).count() == 0
