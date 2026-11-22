"""Tests unitarios de notificación interna Django -> Node al registrar o anular ventas (HU8)."""

import io
import json
import urllib.error
import urllib.request
import uuid
from decimal import Decimal

import pytest
from django.test import override_settings
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.caja.models import TurnoCaja
from apps.comun.notificaciones_node import notificar_evento_node
from apps.recetas.models import Producto
from apps.usuarios.constantes import ROL_CAJERO, ROL_ENCARGADO
from apps.usuarios.services import crear_personal
from apps.ventas.models import Venta
from apps.ventas.services import anular_venta, registrar_venta


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
class TestUnitNotificacionVentasNode:
    @pytest.fixture
    def producto(self):
        return Producto.objects.create(
            nombre="Latte Tiempo Real",
            precio_venta=Decimal("3500.00"),
            costo_total_calculado=Decimal("1000.0000"),
            estado_activo=True,
        )

    @pytest.fixture
    def cajero(self):
        return crear_personal(
            datos_usuario={"username": "cajero_notif", "password": "password123"},
            rol=ROL_CAJERO,
        )

    @pytest.fixture
    def encargado(self):
        return crear_personal(
            datos_usuario={"username": "encargado_notif", "password": "password123"},
            rol=ROL_ENCARGADO,
        )

    def test_notificar_evento_node_omite_si_falta_configuracion(self, monkeypatch):
        llamadas = []
        monkeypatch.setattr(urllib.request, "urlopen", lambda *a, **kw: llamadas.append((a, kw)))

        with override_settings(NODE_BASE_URL="", EVENTOS_INTERNOS_CLAVE="clave-test"):
            assert notificar_evento_node("venta.registrada", {"ventaId": 1}) is False

        with override_settings(NODE_BASE_URL="http://localhost:3000", EVENTOS_INTERNOS_CLAVE=""):
            assert notificar_evento_node("venta.registrada", {"ventaId": 1}) is False

        assert llamadas == []

    @override_settings(
        NODE_BASE_URL="http://127.0.0.1:3000",
        EVENTOS_INTERNOS_CLAVE="clave-interna-unit",
        NODE_EVENTOS_TIMEOUT_SECONDS=1.5,
    )
    def test_registrar_venta_notifica_a_node_y_no_duplica_en_reintento_idempotente(
        self, monkeypatch, cajero, producto
    ):
        peticiones = []

        def fake_urlopen(req, timeout=None):
            peticiones.append(
                {
                    "url": req.full_url,
                    "method": req.get_method(),
                    "headers": dict(req.header_items()),
                    "body": json.loads(req.data.decode("utf-8")),
                    "timeout": timeout,
                }
            )
            return _RespuestaHttpMock(202)

        monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("2000.00"))
        op_id = uuid.uuid4()

        venta = registrar_venta(
            items_data=[{"producto_id": producto.id, "cantidad": 2}],
            medio_pago="EFECTIVO",
            turno_caja=turno,
            id_operacion=op_id,
        )
        # Reintento idempotente: no debe volver a emitir evento en vivo
        venta_repetida = registrar_venta(
            items_data=[{"producto_id": producto.id, "cantidad": 2}],
            medio_pago="EFECTIVO",
            turno_caja=turno,
            id_operacion=op_id,
        )

        assert venta_repetida.id == venta.id
        assert len(peticiones) == 1
        req = peticiones[0]
        assert req["url"] == "http://127.0.0.1:3000/api/internos/eventos"
        assert req["method"] == "POST"
        assert req["timeout"] == 1.5
        assert req["headers"]["X-clave-interna"] == "clave-interna-unit"
        assert req["body"]["evento"] == "venta.registrada"
        assert req["body"]["datos"]["ventaId"] == venta.id
        assert req["body"]["datos"]["turnoId"] == turno.id
        assert req["body"]["datos"]["total"] == "7000.00"
        assert req["body"]["datos"]["costoTotalSnapshot"] == "2000.0000"
        assert req["body"]["datos"]["gananciaBruta"] == "5000.0000"
        assert req["body"]["datos"]["items"][0]["costoUnitarioSnapshot"] == "1000.0000"

    @override_settings(
        NODE_BASE_URL="http://127.0.0.1:3000",
        EVENTOS_INTERNOS_CLAVE="clave-interna-unit",
    )
    def test_anular_venta_notifica_a_node_con_motivo_y_responsable(
        self, monkeypatch, cajero, encargado, producto
    ):
        peticiones = []

        def fake_urlopen(req, timeout=None):
            peticiones.append(json.loads(req.data.decode("utf-8")))
            return _RespuestaHttpMock(202)

        monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("1000.00"))
        venta = registrar_venta(
            items_data=[{"producto_id": producto.id, "cantidad": 1}],
            medio_pago="TARJETA",
            turno_caja=turno,
        )
        anular_venta(venta, encargado, motivo="Producto equivocado")

        assert len(peticiones) == 2
        assert peticiones[0]["evento"] == "venta.registrada"
        ev_anul = peticiones[1]
        assert ev_anul["evento"] == "venta.anulada"
        assert ev_anul["datos"]["ventaId"] == venta.id
        assert ev_anul["datos"]["estado"] == "ANULADA"
        assert ev_anul["datos"]["motivoAnulacion"] == "Producto equivocado"
        assert ev_anul["datos"]["anuladaPorId"] == encargado.id
        assert ev_anul["datos"]["anuladaPorNombre"] == encargado.username
        assert ev_anul["datos"]["total"] == "3500.00"
        assert ev_anul["datos"]["costoTotalSnapshot"] == "1000.0000"

    @override_settings(
        NODE_BASE_URL="http://127.0.0.1:3000",
        EVENTOS_INTERNOS_CLAVE="clave-interna-unit",
    )
    @pytest.mark.parametrize(
        "error_node",
        [
            urllib.error.URLError("Connection refused"),
            TimeoutError("timed out"),
            urllib.error.HTTPError(
                url="http://127.0.0.1:3000/api/internos/eventos",
                code=500,
                msg="Error interno",
                hdrs=None,
                fp=io.BytesIO(b"{}"),
            ),
        ],
    )
    def test_si_node_no_responde_venta_y_anulacion_igual_se_guardan(
        self, monkeypatch, cajero, encargado, producto, error_node
    ):
        def fake_urlopen_falla(req, timeout=None):
            raise error_node

        monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen_falla)

        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("1500.00"))
        venta = registrar_venta(
            items_data=[{"producto_id": producto.id, "cantidad": 2}],
            medio_pago="EFECTIVO",
            turno_caja=turno,
        )

        assert Venta.objects.filter(pk=venta.pk, estado="EMITIDA").exists()
        assert venta.total == Decimal("7000.00")

        anulada = anular_venta(venta, encargado, motivo="Falla tolerada")
        anulada.refresh_from_db()
        assert anulada.estado == "ANULADA"
        assert anulada.motivo_anulacion == "Falla tolerada"

    @override_settings(
        NODE_BASE_URL="http://127.0.0.1:3000",
        EVENTOS_INTERNOS_CLAVE="clave-interna-unit",
    )
    def test_si_falla_validacion_o_permiso_no_notifica_a_node(self, monkeypatch, cajero, producto):
        peticiones = []
        monkeypatch.setattr(
            urllib.request, "urlopen", lambda req, timeout=None: peticiones.append(req)
        )

        turno_cerrado = TurnoCaja.objects.create(
            usuario=cajero, efectivo_inicial=Decimal("1000.00"), estado="CERRADO"
        )
        with pytest.raises(ValidationError):
            registrar_venta(
                items_data=[{"producto_id": producto.id, "cantidad": 1}],
                turno_caja=turno_cerrado,
            )

        turno_abierto = TurnoCaja.objects.create(
            usuario=cajero, efectivo_inicial=Decimal("1000.00"), estado="ABIERTO"
        )
        venta = registrar_venta(
            items_data=[{"producto_id": producto.id, "cantidad": 1}],
            turno_caja=turno_abierto,
        )
        peticiones.clear()

        with pytest.raises(PermissionDenied):
            anular_venta(venta, cajero, motivo="Sin permiso")

        assert peticiones == []
