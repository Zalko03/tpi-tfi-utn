"""Tests E2E del script de ensayo automático del flujo demo (T10)."""

import http.client
import importlib.util
import json
import subprocess
import threading
from datetime import datetime, timedelta
from decimal import Decimal
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from zoneinfo import ZoneInfo

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
RUTA_SCRIPT_SH = Path(__file__).resolve().parents[5] / "scripts" / "ensayo_demo.sh"


def _iniciar_servidor_node_simulado(
    snapshots_body=None,
    carta_html="<html><body><h1>Carta digital</h1></body></html>",
    health_status=200,
):
    """Levanta un servidor HTTP local mínimo simulando Node para probar VERIFICAR_NODE=1."""
    if snapshots_body is None:
        snapshots_body = {"datos": [{"id": "snap-1"}], "pagina": 1, "limite": 5, "total": 1}

    class _Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            return None

        def do_GET(self):
            if self.path == "/health":
                self.send_response(health_status)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"estado": "ok"}).encode("utf-8"))
                return
            if self.path.startswith("/api/snapshots-costeo/"):
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(snapshots_body).encode("utf-8"))
                return
            if self.path == "/carta.html":
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(carta_html.encode("utf-8"))
                return
            self.send_response(404)
            self.end_headers()

    servidor = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    hilo = threading.Thread(target=servidor.serve_forever, daemon=True)
    hilo.start()
    return servidor, f"http://127.0.0.1:{servidor.server_address[1]}"


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

        turno_video = TurnoCaja.objects.get(estado="ABIERTO")

        # Primera corrida: reutiliza el turno abierto de seed_demo --video y NO lo cierra,
        # porque es el que se prepara para grabar el video.
        codigo_1 = modulo.ejecutar_ensayo(
            django_url=live_server.url,
            node_url="http://127.0.0.1:59998",
            modo_node="0",
        )
        salida_1 = capsys.readouterr().out
        assert codigo_1 == 0
        assert "✅ Ensayo completo OK (8/8 pasos superados)." in salida_1
        for nro in range(1, 9):
            assert f"✅ Paso {nro}:" in salida_1
        assert "reutilizado" in salida_1
        assert f"No se cerró el turno #{turno_video.id}" in salida_1
        turno_video.refresh_from_db()
        assert turno_video.estado == "ABIERTO"

        # Se cierra a mano el turno del video para que la segunda corrida abra uno propio
        # y se pueda contrastar el arqueo de un turno que el ensayo abrió y cerró.
        turno_video.estado = "CERRADO"
        turno_video.save(update_fields=["estado"])

        # Segunda corrida consecutiva: no hay turno abierto, así que abre uno nuevo y lo cierra.
        codigo_2 = modulo.ejecutar_ensayo(
            django_url=live_server.url,
            node_url="http://127.0.0.1:59998",
            modo_node="0",
        )
        salida_2 = capsys.readouterr().out
        assert codigo_2 == 0
        assert "✅ Ensayo completo OK (8/8 pasos superados)." in salida_2
        assert "abierto con efectivo inicial" in salida_2
        assert TurnoCaja.objects.filter(estado="ABIERTO").count() == 0
        assert Venta.objects.filter(estado="ANULADA").count() >= 3  # 1 del seed + 1 por corrida

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
        hoy = datetime.now(ZoneInfo("America/Argentina/Buenos_Aires")).date()
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
            node_url="http://127.0.0.1:59998",
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
        monkeypatch.setenv("DJANGO_URL", "http://127.0.0.1:59999")
        monkeypatch.setenv("NODE_URL", "http://127.0.0.1:59998")
        monkeypatch.setenv(variable, url_invalida)

        modulo = _cargar_modulo_ensayo()
        codigo = modulo.ejecutar_ensayo(modo_node="0")
        salida = capsys.readouterr().out

        assert codigo == 1
        assert "❌ Configuración inválida:" in salida
        assert variable in salida

    @pytest.mark.parametrize("faltante", ["DJANGO_URL", "NODE_URL", "AMBAS"])
    def test_rechaza_ejecucion_sin_urls_explicitas(self, monkeypatch, capsys, faltante):
        """Sin DJANGO_URL y NODE_URL explícitas (y sin --confirmo-base-real) debe negarse a correr."""
        monkeypatch.setenv("SEED_DEMO_PASSWORD", "ClaveDemoEnsayoT10!")
        monkeypatch.setenv("DJANGO_URL", "http://127.0.0.1:59999")
        monkeypatch.setenv("NODE_URL", "http://127.0.0.1:59998")
        if faltante in {"DJANGO_URL", "AMBAS"}:
            monkeypatch.delenv("DJANGO_URL", raising=False)
        if faltante in {"NODE_URL", "AMBAS"}:
            monkeypatch.delenv("NODE_URL", raising=False)

        modulo = _cargar_modulo_ensayo()
        codigo = modulo.ejecutar_ensayo(modo_node="0")
        salida = capsys.readouterr().out

        assert codigo == 1
        assert "❌ Configuración inválida:" in salida
        assert "--confirmo-base-real" in salida
        assert "db.sqlite3" in salida

    def test_flag_confirmo_base_real_permite_usar_urls_por_defecto(self, monkeypatch, capsys):
        """Con --confirmo-base-real permite usar localhost:8000 y :3000 sin definir variables."""
        monkeypatch.setenv("SEED_DEMO_PASSWORD", "ClaveDemoEnsayoT10!")
        monkeypatch.delenv("DJANGO_URL", raising=False)
        monkeypatch.delenv("NODE_URL", raising=False)
        monkeypatch.setenv("VERIFICAR_NODE", "0")

        modulo = _cargar_modulo_ensayo()
        urls_llamadas = []

        def _fallar_urlopen(req, *args, **kwargs):
            urls_llamadas.append(req.full_url)
            raise OSError("conexión interceptada en test")

        monkeypatch.setattr(modulo.urllib.request, "urlopen", _fallar_urlopen)

        codigo = modulo.main(["--confirmo-base-real"])
        salida = capsys.readouterr().out

        assert codigo == 1
        assert "Django URL : http://localhost:8000" in salida
        assert "Node URL   : http://localhost:3000" in salida
        assert any(u.startswith("http://localhost:8000/") for u in urls_llamadas)

    def test_wrapper_sh_falla_sin_urls_explicitas(self):
        """scripts/ensayo_demo.sh sin DJANGO_URL/NODE_URL ni flag debe salir con código 1."""
        env_limpio = {
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "SEED_DEMO_PASSWORD": "ClaveDemoTest!1",
        }
        proc = subprocess.run(
            ["bash", str(RUTA_SCRIPT_SH)],
            env=env_limpio,
            capture_output=True,
            text=True,
            check=False,
        )
        assert proc.returncode == 1
        assert "--confirmo-base-real" in proc.stdout

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

    @pytest.mark.parametrize(
        "respuesta_inesperada",
        [
            "[]",
            '{"access": "tok", "usuario": []}',
            '{"access": "tok", "usuario": {"rol": "DUENIO", "permisos": null}}',
            "{no-es-json",
        ],
    )
    def test_captura_json_malformado_o_esquema_inesperado_en_paso(
        self, monkeypatch, capsys, respuesta_inesperada
    ):
        """JSON inválido o con forma inesperada (lista/None/sin claves) reporta ❌ sin traceback."""
        monkeypatch.setenv("SEED_DEMO_PASSWORD", "ClaveDemoEnsayoT10!")
        modulo = _cargar_modulo_ensayo()

        class _RespMock:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return respuesta_inesperada.encode("utf-8")

        monkeypatch.setattr(modulo.urllib.request, "urlopen", lambda *a, **kw: _RespMock())

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


@pytest.mark.django_db(transaction=True)
class TestEnsayoFlujoDemoNodeYResiliencia:
    @override_settings(DEBUG=True)
    def test_ensayo_completo_con_verificar_node_1_simulado(self, live_server, monkeypatch, capsys):
        """Con VERIFICAR_NODE=1 y Node simulado respondiendo 200, los 8 pasos pasan."""
        cache.clear()
        monkeypatch.setenv("DEMO_DUENIO_PASSWORD", "ClaveDemoEnsayoT10!")
        monkeypatch.setenv("DEMO_CAJERO_PASSWORD", "ClaveDemoEnsayoT10!")
        monkeypatch.delenv("SEED_DEMO_PASSWORD", raising=False)
        monkeypatch.setenv("SEED_DEMO_PASSWORD", "ClaveDemoEnsayoT10!")
        call_command("seed_demo", "--video")
        monkeypatch.delenv("SEED_DEMO_PASSWORD", raising=False)

        servidor, url_node = _iniciar_servidor_node_simulado()
        try:
            modulo = _cargar_modulo_ensayo()
            codigo = modulo.ejecutar_ensayo(
                django_url=live_server.url,
                node_url=url_node,
                modo_node="1",
            )
        finally:
            servidor.shutdown()
            servidor.server_close()

        salida = capsys.readouterr().out
        assert codigo == 0
        assert "✅ Ensayo completo OK (8/8 pasos superados)." in salida
        assert "Node snapshots OK" in salida
        assert "Node /health y /carta.html OK" in salida

    @override_settings(DEBUG=True)
    def test_falla_intermedia_paso_5_intenta_limpieza_y_evita_cerrar_turno_con_huerfana(
        self, live_server, monkeypatch, capsys
    ):
        """Si falla anular venta_temp en Paso 5 y la limpieza también falla, no cierra el turno."""
        cache.clear()
        monkeypatch.setenv("SEED_DEMO_PASSWORD", "ClaveDemoEnsayoT10!")
        call_command("seed_demo", "--video")

        modulo = _cargar_modulo_ensayo()
        llamadas_anular = []
        original_peticion_json = modulo.ClienteApi.peticion_json

        def _peticion_con_falla_anular(self, metodo, url, **kwargs):
            if "/anular/" in url:
                llamadas_anular.append(url)
                raise modulo.ErrorPasoEnsayo("Error simulado al anular venta temporal")
            return original_peticion_json(self, metodo, url, **kwargs)

        monkeypatch.setattr(modulo.ClienteApi, "peticion_json", _peticion_con_falla_anular)

        codigo = modulo.ejecutar_ensayo(
            django_url=live_server.url,
            node_url="http://127.0.0.1:59998",
            modo_node="0",
        )
        salida = capsys.readouterr().out

        assert codigo == 1
        assert len(llamadas_anular) == 2
        assert "❌ Paso 5:" in salida
        assert "❌ Paso 6:" in salida
        assert "venta huérfana" in salida
        # El turno debe permanecer ABIERTO para no consolidar una venta de prueba sin anular.
        assert TurnoCaja.objects.filter(estado="ABIERTO").count() == 1

    @override_settings(DEBUG=True)
    def test_falla_intermedia_paso_4_no_cierra_turno_abierto(
        self, live_server, monkeypatch, capsys
    ):
        """Si falla el cobro en Paso 4, Paso 6 se omite y el turno queda abierto."""
        cache.clear()
        monkeypatch.setenv("SEED_DEMO_PASSWORD", "ClaveDemoEnsayoT10!")
        call_command("seed_demo", "--video")

        modulo = _cargar_modulo_ensayo()
        original_peticion_json = modulo.ClienteApi.peticion_json

        def _peticion_con_falla_venta(self, metodo, url, **kwargs):
            if metodo == "POST" and url.endswith("/api/ventas/"):
                raise modulo.ErrorPasoEnsayo("Error simulado en cobro POS")
            return original_peticion_json(self, metodo, url, **kwargs)

        monkeypatch.setattr(modulo.ClienteApi, "peticion_json", _peticion_con_falla_venta)

        codigo = modulo.ejecutar_ensayo(
            django_url=live_server.url,
            node_url="http://127.0.0.1:59998",
            modo_node="0",
        )
        salida = capsys.readouterr().out

        assert codigo == 1
        assert "❌ Paso 4:" in salida
        assert "❌ Paso 6:" in salida
        assert "permanece abierto" in salida
        assert TurnoCaja.objects.filter(estado="ABIERTO").count() == 1
