"""Tests de API para stock real, alertas de mínimo y movimientos de inventario (HU12)."""

import json
import urllib.request
from decimal import Decimal

import pytest
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.caja.models import TurnoCaja
from apps.insumos.models import Insumo, Proveedor
from apps.recetas.models import Producto, RecetaItem
from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO, ROL_ENCARGADO
from apps.usuarios.services import crear_personal


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
class TestApiStockInsumos:
    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def duenio(self):
        return crear_personal(
            datos_usuario={"username": "duenio_stock_api", "password": "password123"},
            rol=ROL_DUENIO,
        )

    @pytest.fixture
    def encargado(self):
        return crear_personal(
            datos_usuario={"username": "encargado_stock_api", "password": "password123"},
            rol=ROL_ENCARGADO,
        )

    @pytest.fixture
    def cajero(self):
        return crear_personal(
            datos_usuario={"username": "cajero_stock_api", "password": "password123"},
            rol=ROL_CAJERO,
        )

    @override_settings(
        NODE_BASE_URL="http://127.0.0.1:3000",
        EVENTOS_INTERNOS_CLAVE="clave-api-stock",
    )
    def test_flujo_completo_compra_venta_alerta_y_anulacion_por_api(
        self, monkeypatch, client, duenio, encargado, cajero
    ):
        peticiones_node = []

        def fake_urlopen(req, timeout=None):
            peticiones_node.append(json.loads(req.data.decode("utf-8")))
            return _RespuestaHttpMock(202)

        monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

        proveedor = Proveedor.objects.create(nombre="Proveedor Stock API")

        # 1. Crear insumo con stock mínimo = 950 g
        client.force_authenticate(user=duenio)
        res_ins = client.post(
            "/api/insumos/",
            {"nombre": "Café API Stock", "unidad_base": "g", "stock_minimo": "950.0000"},
            format="json",
        )
        assert res_ins.status_code == status.HTTP_201_CREATED
        insumo_id = res_ins.json()["id"]
        assert res_ins.json()["stock_actual"] == "0.0000"
        assert res_ins.json()["stock_minimo"] == "950.0000"

        # 2. Registrar compra de 1 kg -> stock pasa a 1000.0000 g (no alerta)
        res_compra = client.post(
            "/api/compras/",
            {
                "proveedor": proveedor.id,
                "insumo": insumo_id,
                "precio_total": "25000.00",
                "cantidad": "1",
                "unidad": "kg",
            },
            format="json",
        )
        assert res_compra.status_code == status.HTTP_201_CREATED

        res_get = client.get(f"/api/insumos/{insumo_id}/")
        assert res_get.status_code == status.HTTP_200_OK
        assert res_get.json()["stock_actual"] == "1000.0000"
        assert res_get.json()["stock_bajo"] is False

        # 3. Crear producto con receta de 30g por unidad
        prod = Producto.objects.create(
            nombre="Espresso Stock API",
            precio_venta=Decimal("2500.00"),
            costo_total_calculado=Decimal("750.0000"),
            estado_activo=True,
        )
        RecetaItem.objects.create(
            producto=prod, insumo_id=insumo_id, cantidad=Decimal("30.0000"), unidad="g"
        )

        # 4. Cajero cobra 2 unidades (-60 g -> 940 g < mínimo 950 g) -> dispara stock.bajo
        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("5000.00"))
        client.force_authenticate(user=cajero)
        res_venta = client.post(
            "/api/ventas/",
            {
                "turno_caja": turno.id,
                "medio_pago": "EFECTIVO",
                "items_entrada": [{"producto_id": prod.id, "cantidad": "2.00"}],
            },
            format="json",
        )
        assert res_venta.status_code == status.HTTP_201_CREATED
        venta_id = res_venta.json()["id"]

        assert [p["evento"] for p in peticiones_node] == ["venta.registrada", "stock.bajo"]
        assert peticiones_node[1]["datos"]["insumoId"] == insumo_id
        assert peticiones_node[1]["datos"]["stockActual"] == "940.0000"

        # 5. Encargado consulta stock bajo y movimientos reales
        client.force_authenticate(user=encargado)
        res_bajos = client.get("/api/insumos/stock-bajo/")
        assert res_bajos.status_code == status.HTTP_200_OK
        assert res_bajos.json()["total"] == 1
        assert res_bajos.json()["datos"][0]["id"] == insumo_id

        # 6. Encargado anula la venta -> stock vuelve a 1000.0000 g
        res_anul = client.post(
            f"/api/ventas/{venta_id}/anular/",
            {"motivo": "Ticket de prueba"},
            format="json",
        )
        assert res_anul.status_code == status.HTTP_200_OK

        res_get_2 = client.get(f"/api/insumos/{insumo_id}/")
        assert res_get_2.json()["stock_actual"] == "1000.0000"
        assert res_get_2.json()["stock_bajo"] is False

        res_movs = client.get(f"/api/insumos/movimientos-stock/?insumo={insumo_id}")
        assert res_movs.status_code == status.HTTP_200_OK
        subtipos = [m["subtipo"] for m in res_movs.json()["datos"]]
        assert subtipos == ["ANULACION_VENTA", "VENTA_RECETA", "COMPRA"]

    def test_validaciones_y_permisos_negativos_stock(self, client, duenio, cajero):
        insumo = Insumo.objects.create(
            nombre="Leche API Permisos",
            unidad_base="ml",
            stock_actual=Decimal("1000.0000"),
        )

        # Cajero sin permisos -> 403 con formato único en endpoints de stock
        client.force_authenticate(user=cajero)
        for metodo, url, payload in (
            ("get", "/api/insumos/stock-bajo/", None),
            ("get", "/api/insumos/movimientos-stock/", None),
            (
                "post",
                f"/api/insumos/{insumo.id}/ajustar-stock/",
                {"tipo": "INGRESO", "cantidad": "10"},
            ),
            ("patch", f"/api/insumos/{insumo.id}/", {"stock_minimo": "100"}),
        ):
            res = getattr(client, metodo)(url, payload, format="json")
            assert res.status_code == status.HTTP_403_FORBIDDEN
            assert "mensaje" in res.json()
            assert "detalles" in res.json()

        # Dueño con datos inválidos -> 400 con formato único
        client.force_authenticate(user=duenio)
        res_min_neg = client.patch(
            f"/api/insumos/{insumo.id}/",
            {"stock_minimo": "-10.00"},
            format="json",
        )
        assert res_min_neg.status_code == status.HTTP_400_BAD_REQUEST
        assert "mensaje" in res_min_neg.json()

        res_aj_cero = client.post(
            f"/api/insumos/{insumo.id}/ajustar-stock/",
            {"tipo": "EGRESO", "cantidad": "0"},
            format="json",
        )
        assert res_aj_cero.status_code == status.HTTP_400_BAD_REQUEST
        assert "mensaje" in res_aj_cero.json()
