"""Tests del envío en segundo plano de avisos Django -> Node (HU8, riesgo de Node dormido en el deploy)."""

import json
import threading
import time
import urllib.request
from decimal import Decimal

import pytest
from django.test import override_settings

from apps.caja.models import TurnoCaja
from apps.comun import notificaciones_node
from apps.comun.middleware import CORRELATION_ID_ACTUAL
from apps.comun.notificaciones_node import notificar_evento_node
from apps.recetas.models import Producto
from apps.usuarios.constantes import ROL_CAJERO
from apps.usuarios.services import crear_personal
from apps.ventas.services import registrar_venta

CONFIG_SEGUNDO_PLANO = {
    "NODE_BASE_URL": "http://127.0.0.1:3000",
    "EVENTOS_INTERNOS_CLAVE": "clave-interna-test",
    "NODE_EVENTOS_TIMEOUT_SECONDS": 2.0,
    "NODE_EVENTOS_EN_SEGUNDO_PLANO": True,
}


class _RespuestaHttpMock:
    status = 202

    def getcode(self):
        return self.status

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def _esperar_cola_vacia():
    """El ejecutor tiene un solo hilo FIFO: cuando corre esta tarea, las anteriores ya terminaron."""
    notificaciones_node._obtener_ejecutor().submit(lambda: None).result(timeout=5)


@pytest.fixture(autouse=True)
def _config_segundo_plano(settings):
    """Activa el modo real (segundo plano), que conftest.py apaga para el resto de la suite."""
    for clave, valor in CONFIG_SEGUNDO_PLANO.items():
        setattr(settings, clave, valor)


class TestUnitNotificacionesNodeSegundoPlano:
    def test_no_espera_a_node_y_envia_desde_hilo_de_fondo(self, monkeypatch):
        liberar = threading.Event()
        vistas = []

        def urlopen_lento(req, timeout=None):
            # Simula a Node dormido: no responde hasta que el test lo libera.
            liberar.wait(timeout=5)
            vistas.append(
                (threading.current_thread().name, json.loads(req.data)["evento"], timeout)
            )
            return _RespuestaHttpMock()

        monkeypatch.setattr(urllib.request, "urlopen", urlopen_lento)

        inicio = time.monotonic()
        futuro = notificar_evento_node("venta.registrada", {"ventaId": 1})
        demora = time.monotonic() - inicio

        assert demora < 0.5
        assert not futuro.done()

        liberar.set()
        assert futuro.result(timeout=5) is True
        nombre_hilo, evento, timeout = vistas[0]
        assert nombre_hilo.startswith("aviso-node")
        assert evento == "venta.registrada"
        assert timeout == 2.0

    def test_mantiene_el_orden_de_los_avisos(self, monkeypatch):
        eventos = []

        def urlopen_ok(req, timeout=None):
            eventos.append(json.loads(req.data)["evento"])
            return _RespuestaHttpMock()

        monkeypatch.setattr(urllib.request, "urlopen", urlopen_ok)

        notificar_evento_node("venta.registrada", {"ventaId": 7})
        notificar_evento_node("stock.bajo", {"insumoId": 1})
        notificar_evento_node("venta.anulada", {"ventaId": 7})
        _esperar_cola_vacia()

        assert eventos == ["venta.registrada", "stock.bajo", "venta.anulada"]

    def test_conserva_el_correlation_id_del_request(self, monkeypatch):
        cabeceras = []

        def urlopen_ok(req, timeout=None):
            cabeceras.append(dict(req.header_items()))
            return _RespuestaHttpMock()

        monkeypatch.setattr(urllib.request, "urlopen", urlopen_ok)

        token = CORRELATION_ID_ACTUAL.set("req-abc-123")
        try:
            futuro = notificar_evento_node("venta.registrada", {"ventaId": 2})
        finally:
            CORRELATION_ID_ACTUAL.reset(token)

        assert futuro.result(timeout=5) is True
        # El ContextVar no viaja al hilo de fondo: la cabecera se arma antes de encolar.
        assert cabeceras[0]["X-request-id"] == "req-abc-123"
        assert cabeceras[0]["X-clave-interna"] == "clave-interna-test"

    def test_un_error_inesperado_en_el_hilo_se_registra_y_no_se_propaga(self, monkeypatch, caplog):
        def urlopen_roto(req, timeout=None):
            raise RuntimeError("falla inesperada")

        monkeypatch.setattr(urllib.request, "urlopen", urlopen_roto)

        futuro = notificar_evento_node("stock.bajo", {"insumoId": 3})

        assert futuro.result(timeout=5) is False
        assert "Error inesperado al notificar stock.bajo" in caplog.text

    def test_sin_configuracion_no_encola_nada(self, monkeypatch):
        llamadas = []
        monkeypatch.setattr(urllib.request, "urlopen", lambda *a, **kw: llamadas.append(a))

        with override_settings(EVENTOS_INTERNOS_CLAVE=""):
            assert notificar_evento_node("venta.registrada", {"ventaId": 1}) is False
        _esperar_cola_vacia()

        assert llamadas == []

    def test_ejecutor_cerrado_descarta_el_aviso_sin_fallar(self, monkeypatch):
        class _EjecutorCerrado:
            def submit(self, *args, **kwargs):
                raise RuntimeError("cannot schedule new futures after shutdown")

        monkeypatch.setattr(notificaciones_node, "_obtener_ejecutor", lambda: _EjecutorCerrado())

        assert notificar_evento_node("venta.registrada", {"ventaId": 1}) is False


@pytest.mark.django_db
def test_cobrar_no_se_demora_aunque_node_no_responda(monkeypatch):
    """Caso del deploy: Node dormido en Render. El cobro vuelve sin esperar el timeout del aviso."""
    liberar = threading.Event()
    peticiones = []

    def urlopen_dormido(req, timeout=None):
        liberar.wait(timeout=5)
        peticiones.append(json.loads(req.data))
        return _RespuestaHttpMock()

    monkeypatch.setattr(urllib.request, "urlopen", urlopen_dormido)

    cajero = crear_personal(
        datos_usuario={"username": "cajero_segundo_plano", "password": "password123"},
        rol=ROL_CAJERO,
    )
    producto = Producto.objects.create(
        nombre="Cortado Segundo Plano",
        precio_venta=Decimal("2500.00"),
        costo_total_calculado=Decimal("800.0000"),
        estado_activo=True,
    )
    turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("1000.00"))

    inicio = time.monotonic()
    venta = registrar_venta(
        items_data=[{"producto_id": producto.id, "cantidad": 1}],
        medio_pago="EFECTIVO",
        turno_caja=turno,
    )
    demora = time.monotonic() - inicio

    assert venta.pk is not None
    assert demora < 1.0
    assert peticiones == []

    liberar.set()
    _esperar_cola_vacia()
    assert peticiones[0]["evento"] == "venta.registrada"
    assert peticiones[0]["datos"]["ventaId"] == venta.id
