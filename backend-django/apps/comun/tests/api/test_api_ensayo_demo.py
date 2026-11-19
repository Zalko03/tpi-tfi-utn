"""Tests E2E del script de ensayo automático del flujo demo (T10)."""

import http.client
import importlib.util
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

import pytest
from django.core.cache import cache
from django.core.management import call_command
from django.db.models import Sum
from django.test import override_settings

from apps.caja.models import TurnoCaja
from apps.comun.filtros import extraer_rango_fechas
from apps.ventas.models import Venta
from apps.ventas.services import obtener_ganancia_diaria

RUTA_SCRIPT_ENSAYO = Path(__file__).resolve().parents[5] / "scripts" / "ensayo_demo.py"


def _cargar_modulo_ensayo():
    """Importa scripts/ensayo_demo.py sin requerir paquete Python en scripts/."""
    import sys

    if "ensayo_demo" in sys.modules:
        return sys.modules["ensayo_demo"]
    spec = importlib.util.spec_from_file_location("ensayo_demo", RUTA_SCRIPT_ENSAYO)
    modulo = importlib.util.module_from_spec(spec)
    assert spec is not None and spec.loader is not None
    sys.modules["ensayo_demo"] = modulo
    spec.loader.exec_module(modulo)
    return modulo


@pytest.mark.django_db(transaction=True)
class TestEnsayoFlujoDemo:
    @override_settings(DEBUG=True)
    def test_ensayo_demo_completo_y_doble_corrida_contra_live_server(
        self, live_server, monkeypatch, capsys
    ):
        """
        Verifica que scripts/ensayo_demo.py recorra los 8 pasos del guion
        contra un servidor HTTP real sobre base aislada (sin tocar db.sqlite3)
        y pueda ejecutarse dos veces seguidas sin errores ni colisiones.
        """
        cache.clear()
        clave_prueba = "ClaveDemoEnsayoT10!"
        monkeypatch.setenv("SEED_DEMO_PASSWORD", clave_prueba)
        monkeypatch.delenv("DEMO_DUENIO_PASSWORD", raising=False)
        monkeypatch.delenv("DEMO_CAJERO_PASSWORD", raising=False)

        call_command("seed_demo", "--video")
        modulo = _cargar_modulo_ensayo()

        # Primera corrida: reutiliza el turno abierto de seed_demo --video y lo cierra al final.
        codigo_1 = modulo.ejecutar_ensayo(
            django_url=live_server.url,
            modo_node="0",
        )
        salida_1 = capsys.readouterr().out
        assert codigo_1 == 0
        assert "✅ Ensayo completo OK (8/8 pasos superados)." in salida_1
        for nro in range(1, 9):
            assert f"✅ Paso {nro}:" in salida_1
        assert "reutilizado" in salida_1

        # Segunda corrida consecutiva: no hay turno abierto, así que abre uno nuevo y lo cierra.
        codigo_2 = modulo.ejecutar_ensayo(
            django_url=live_server.url,
            modo_node="0",
        )
        salida_2 = capsys.readouterr().out
        assert codigo_2 == 0
        assert "✅ Ensayo completo OK (8/8 pasos superados)." in salida_2
        assert "abierto con efectivo inicial" in salida_2
        assert TurnoCaja.objects.filter(estado="ABIERTO").count() == 0
        assert Venta.objects.filter(estado="ANULADA").count() >= 3

        # Contraste numérico del último turno cerrado (abierto en la 2da corrida):
        # efectivo_esperado == efectivo_inicial + venta emitida en efectivo (excluyendo la anulada).
        ultimo_turno = TurnoCaja.objects.filter(estado="CERRADO").order_by("-id").first()
        assert ultimo_turno is not None
        assert ultimo_turno.efectivo_inicial == Decimal("10000.00")
        assert ultimo_turno.movimientos.count() == 0

        ventas_emitidas_efectivo = ultimo_turno.ventas.filter(
            estado="EMITIDA", medio_pago="EFECTIVO"
        )
        ventas_anuladas_turno = ultimo_turno.ventas.filter(estado="ANULADA")
        assert ventas_emitidas_efectivo.count() == 1
        assert ventas_anuladas_turno.count() == 1

        venta_emitida = ventas_emitidas_efectivo.first()
        venta_anulada = ventas_anuladas_turno.first()
        assert venta_emitida is not None and venta_anulada is not None
        assert venta_emitida.total > Decimal("0.00")
        assert venta_anulada.total > Decimal("0.00")
        assert ultimo_turno.efectivo_esperado == (
            ultimo_turno.efectivo_inicial + venta_emitida.total
        )
        assert ultimo_turno.efectivo_esperado < (
            ultimo_turno.efectivo_inicial + venta_emitida.total + venta_anulada.total
        )

        # Consistencia de ganancia-diaria en los últimos 7 días con ventas no anuladas.
        hoy = date.today()
        dt_desde, dt_hasta = extraer_rango_fechas(
            {
                "fecha_desde": (hoy - timedelta(days=6)).isoformat(),
                "fecha_hasta": hoy.isoformat(),
            }
        )
        resumen_7d = obtener_ganancia_diaria(fecha_inicio=dt_desde, fecha_fin=dt_hasta)
        qs_emitidas_7d = Venta.objects.filter(
            estado="EMITIDA",
            fecha__gte=dt_desde,
            fecha__lte=dt_hasta,
        )
        neto_emitidas_7d = qs_emitidas_7d.aggregate(total=Sum("total"))["total"] or Decimal("0.00")
        assert Decimal(resumen_7d["ingresos_totales"]) > Decimal("0.00")
        assert Decimal(resumen_7d["ingresos_totales"]) == neto_emitidas_7d
        assert resumen_7d["cantidad_tickets"] == qs_emitidas_7d.count()

    def test_ensayo_demo_falla_si_faltan_contrasenas_en_entorno(self, monkeypatch, capsys):
        """Sin variables de entorno de contraseña debe fallar de forma explícita."""
        monkeypatch.delenv("SEED_DEMO_PASSWORD", raising=False)
        monkeypatch.delenv("DEMO_DUENIO_PASSWORD", raising=False)
        monkeypatch.delenv("DEMO_CAJERO_PASSWORD", raising=False)

        modulo = _cargar_modulo_ensayo()
        codigo = modulo.ejecutar_ensayo(
            django_url="http://127.0.0.1:59999",
            modo_node="0",
        )
        salida = capsys.readouterr().out
        assert codigo == 1
        assert "❌ Configuración inválida:" in salida

    @override_settings(DEBUG=True)
    def test_ensayo_demo_marca_fallo_si_node_es_obligatorio_y_no_responde(
        self, live_server, monkeypatch, capsys
    ):
        """Con VERIFICAR_NODE=1 y Node caído, debe marcar ❌ en los pasos de Node."""
        cache.clear()
        monkeypatch.setenv("SEED_DEMO_PASSWORD", "ClaveDemoEnsayoT10!")
        call_command("seed_demo", "--video")

        modulo = _cargar_modulo_ensayo()
        codigo = modulo.ejecutar_ensayo(
            django_url=live_server.url,
            node_url="http://127.0.0.1:59998",
            modo_node="1",
        )
        salida = capsys.readouterr().out
        assert codigo == 1
        assert "❌ Paso 2:" in salida
        assert "❌ Paso 8:" in salida
        assert "❌ Ensayo finalizado CON ERRORES." in salida


class TestValidacionesEnsayoDemo:
    @pytest.mark.parametrize("variable", ["DJANGO_URL", "NODE_URL"])
    @pytest.mark.parametrize(
        "url_invalida",
        [
            "file:///etc/passwd",
            "ftp://localhost:8000",
            "http://",
            "localhost:8000",
            "http://[::1",
            "http://:8000",
            "   ",
        ],
    )
    def test_rechaza_urls_invalidas(self, monkeypatch, capsys, variable, url_invalida):
        """Rechaza esquemas no HTTP(S), URLs sin host o malformadas con código 1."""
        monkeypatch.setenv("SEED_DEMO_PASSWORD", "ClaveDemoEnsayoT10!")
        monkeypatch.setenv(variable, url_invalida)

        modulo = _cargar_modulo_ensayo()
        codigo = modulo.ejecutar_ensayo(modo_node="0")
        salida = capsys.readouterr().out

        assert codigo == 1
        assert "❌ Configuración inválida:" in salida
        assert variable in salida

    @pytest.mark.parametrize("valor_invalido", ["invalido", "2", "true", "si", "   "])
    def test_rechaza_verificar_node_invalido(self, monkeypatch, capsys, valor_invalido):
        """VERIFICAR_NODE fuera de {auto, 1, 0} debe fallar sin caer en '0'."""
        monkeypatch.setenv("SEED_DEMO_PASSWORD", "ClaveDemoEnsayoT10!")
        monkeypatch.setenv("VERIFICAR_NODE", valor_invalido)

        modulo = _cargar_modulo_ensayo()
        codigo = modulo.ejecutar_ensayo(
            django_url="http://127.0.0.1:59999",
            node_url="http://127.0.0.1:59998",
        )
        salida = capsys.readouterr().out

        assert codigo == 1
        assert "❌ Configuración inválida:" in salida
        assert "VERIFICAR_NODE" in salida

    @pytest.mark.parametrize(
        "error_transporte",
        [
            TimeoutError("tiempo de espera agotado"),
            http.client.RemoteDisconnected("conexión cerrada"),
            OSError("fallo de red"),
            ValueError("url o cabecera inválida"),
        ],
    )
    def test_captura_timeouts_y_errores_transporte_como_fallo_de_paso(
        self, monkeypatch, capsys, error_transporte
    ):
        """Timeouts y errores de transporte en ClienteApi reportan ❌ sin traceback."""
        monkeypatch.setenv("SEED_DEMO_PASSWORD", "ClaveDemoEnsayoT10!")
        modulo = _cargar_modulo_ensayo()

        def _fallar_urlopen(*args, **kwargs):
            raise error_transporte

        monkeypatch.setattr(modulo.urllib.request, "urlopen", _fallar_urlopen)

        codigo = modulo.ejecutar_ensayo(
            django_url="http://127.0.0.1:59999",
            node_url="http://127.0.0.1:59998",
            modo_node="0",
        )
        salida = capsys.readouterr().out

        assert codigo == 1
        assert "❌ Paso 1:" in salida
        assert "❌ Paso 8:" in salida
        assert "❌ Ensayo finalizado CON ERRORES." in salida
