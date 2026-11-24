"""
Tests de API para "cambiar mi clave" (/api/auth/cambiar-clave/) y "restablecer clave"
(/api/usuarios/{id}/restablecer-clave/): permisos por rol, validación, auditoría y
cierre de sesiones por blacklist.
"""

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO, ROL_ENCARGADO
from apps.usuarios.models import PedidoRestablecimientoClave, RegistroAuditoria
from apps.usuarios.services import crear_personal, crear_superadmin

User = get_user_model()
CLAVE = "claveSegura123!"
NUEVA = "OtraClaveLarga#7"


def _crear(username, rol):
    return crear_personal(datos_usuario={"username": username, "password": CLAVE}, rol=rol)


def _cliente(username, clave=CLAVE):
    datos = _login(username, clave).json()
    cliente = APIClient()
    cliente.credentials(HTTP_AUTHORIZATION=f"Bearer {datos['access']}")
    return cliente, datos["refresh"]


def _refresh_valido(refresh):
    res = APIClient().post("/api/auth/token/refresh/", {"refresh": refresh}, format="json")
    return res.status_code == 200


@pytest.fixture(autouse=True)
def _sin_limite_de_intentos():
    """Estos tests inician sesión muchas veces: se vacía el contador del throttle de login."""
    cache.clear()
    yield
    cache.clear()


def _login(username, clave=CLAVE):
    cache.clear()
    return APIClient().post(
        "/api/auth/token/", {"username": username, "password": clave}, format="json"
    )


@pytest.fixture
def personal(db):
    return {
        "super": crear_superadmin("super_api", CLAVE),
        "duenio": _crear("duenio_clave", ROL_DUENIO),
        "duenio2": _crear("duenio_dos", ROL_DUENIO),
        "encargado": _crear("encargado_clave", ROL_ENCARGADO),
        "cajero": _crear("cajero_clave", ROL_CAJERO),
    }


@pytest.mark.django_db
class TestCambiarMiClave:
    URL = "/api/auth/cambiar-clave/"

    def _payload(self, actual=CLAVE, nueva=NUEVA, repetida=None):
        return {
            "clave_actual": actual,
            "clave_nueva": nueva,
            "clave_nueva_repetida": nueva if repetida is None else repetida,
        }

    def test_sin_sesion_responde_401(self, personal):
        res = APIClient().post(self.URL, self._payload(), format="json")
        assert res.status_code == 401

    def test_cambio_exitoso_cierra_otras_sesiones_y_devuelve_tokens(self, personal):
        cliente, refresh_viejo = _cliente("cajero_clave")
        _, refresh_otro_dispositivo = _cliente("cajero_clave")

        res = cliente.post(self.URL, self._payload(), format="json")

        assert res.status_code == 200
        data = res.json()
        assert data["access"] and data["refresh"]
        assert data["usuario"]["username"] == "cajero_clave"
        assert not _refresh_valido(refresh_viejo)
        assert not _refresh_valido(refresh_otro_dispositivo)
        assert _refresh_valido(data["refresh"])
        assert _login("cajero_clave", CLAVE).status_code == 401
        assert _login("cajero_clave", NUEVA).status_code == 200

    def test_auditoria_no_guarda_la_clave(self, personal):
        cliente, _ = _cliente("cajero_clave")
        cliente.post(self.URL, self._payload(), format="json")
        registro = RegistroAuditoria.objects.get(accion="CAMBIO_CLAVE")
        assert registro.usuario_modificado == personal["cajero"]
        assert registro.modificado_por == personal["cajero"]
        assert NUEVA not in str(registro.detalles)
        assert CLAVE not in str(registro.detalles)

    def test_clave_actual_incorrecta_responde_400_y_no_cambia(self, personal):
        cliente, refresh = _cliente("cajero_clave")
        res = cliente.post(self.URL, self._payload(actual="noEsLaMia99"), format="json")
        assert res.status_code == 400
        assert res.json()["detalles"]["mensaje"] == "La contraseña actual no es correcta."
        assert _refresh_valido(refresh)
        assert _login("cajero_clave", CLAVE).status_code == 200

    def test_repetida_distinta_responde_400(self, personal):
        cliente, _ = _cliente("cajero_clave")
        res = cliente.post(self.URL, self._payload(repetida="OtraCosa#99"), format="json")
        assert res.status_code == 400
        assert "no coinciden" in str(res.json()["detalles"])

    @pytest.mark.parametrize(
        "clave_debil", ["corta1!", "12345678901", "password123", "cajero_clave1"]
    )
    def test_clave_debil_responde_400(self, personal, clave_debil):
        cliente, _ = _cliente("cajero_clave")
        res = cliente.post(self.URL, self._payload(nueva=clave_debil), format="json")
        assert res.status_code == 400
        assert _login("cajero_clave", CLAVE).status_code == 200

    def test_igual_a_la_actual_responde_400(self, personal):
        cliente, _ = _cliente("cajero_clave")
        res = cliente.post(self.URL, self._payload(nueva=CLAVE), format="json")
        assert res.status_code == 400
        assert "distinta" in res.json()["detalles"]["mensaje"]


@pytest.mark.django_db
class TestRestablecerClave:
    def _url(self, usuario):
        return f"/api/usuarios/{usuario.id}/restablecer-clave/"

    def _payload(self, nueva=NUEVA):
        return {"clave_nueva": nueva, "clave_nueva_repetida": nueva}

    @pytest.mark.parametrize(
        "operador, objetivo, esperado",
        [
            ("super_api", "duenio", 200),
            ("super_api", "encargado", 200),
            ("super_api", "cajero", 200),
            ("duenio_clave", "encargado", 200),
            ("duenio_clave", "cajero", 200),
            ("duenio_clave", "duenio2", 403),
            ("duenio_clave", "super", 403),
            ("duenio_clave", "duenio", 403),
            ("super_api", "super", 403),
            ("encargado_clave", "cajero", 403),
            ("cajero_clave", "encargado", 403),
        ],
    )
    def test_matriz_de_permisos(self, personal, operador, objetivo, esperado):
        cliente, _ = _cliente(operador)
        res = cliente.post(self._url(personal[objetivo]), self._payload(), format="json")
        assert res.status_code == esperado
        username = personal[objetivo].username
        assert (_login(username, NUEVA).status_code == 200) == (esperado == 200)

    def test_restablecer_cierra_sesiones_y_audita(self, personal):
        _, refresh_cajero = _cliente("cajero_clave")
        cliente, _ = _cliente("duenio_clave")

        res = cliente.post(self._url(personal["cajero"]), self._payload(), format="json")

        assert res.status_code == 200
        assert not _refresh_valido(refresh_cajero)
        registro = RegistroAuditoria.objects.get(accion="RESTABLECIMIENTO_CLAVE")
        assert registro.usuario_modificado == personal["cajero"]
        assert registro.modificado_por == personal["duenio"]
        assert registro.detalles["sesiones_cerradas"] >= 1
        assert NUEVA not in str(registro.detalles)

    def test_permiso_granular_no_alcanza_para_un_encargado(self, personal):
        """Aunque se le den los permisos de personal, un encargado no restablece claves."""
        perfil = personal["encargado"].perfil
        perfil.permisos = {"personal.editar": True, "personal.ver": True}
        perfil.save()
        cliente, _ = _cliente("encargado_clave")
        res = cliente.post(self._url(personal["cajero"]), self._payload(), format="json")
        assert res.status_code == 403

    def test_clave_debil_responde_400(self, personal):
        cliente, _ = _cliente("duenio_clave")
        res = cliente.post(self._url(personal["cajero"]), self._payload("1234"), format="json")
        assert res.status_code == 400

    def test_usuario_inexistente_responde_error(self, personal):
        cliente, _ = _cliente("super_api")
        res = cliente.post("/api/usuarios/99999/restablecer-clave/", self._payload(), format="json")
        assert res.status_code in (400, 404)


@pytest.mark.django_db
class TestAltaConClaveValidada:
    def test_alta_desde_api_rechaza_clave_corta(self, personal):
        cliente, _ = _cliente("duenio_clave")
        res = cliente.post(
            "/api/usuarios/",
            {"username": "nuevo_cajero", "password": "abc12", "rol": ROL_CAJERO},
            format="json",
        )
        assert res.status_code == 400
        assert not User.objects.filter(username="nuevo_cajero").exists()

    def test_api_no_permite_marcar_superadmin(self, personal):
        cliente, _ = _cliente("duenio_clave")
        res = cliente.post(
            "/api/usuarios/",
            {"username": "colado", "password": NUEVA, "rol": ROL_CAJERO, "is_superuser": True},
            format="json",
        )
        assert res.status_code == 201
        assert User.objects.get(username="colado").is_superuser is False


@pytest.mark.django_db
class TestOlvideMiClave:
    URL = "/api/auth/olvide-clave/"

    def test_misma_respuesta_exista_o_no_el_usuario(self, personal):
        existe = APIClient().post(self.URL, {"username": "cajero_clave"}, format="json")
        no_existe = APIClient().post(self.URL, {"username": "nadie_aca"}, format="json")
        assert existe.status_code == no_existe.status_code == 200
        assert existe.json() == no_existe.json()
        assert PedidoRestablecimientoClave.objects.count() == 1

    def test_crea_un_solo_pedido_pendiente_y_audita(self, personal):
        for _ in range(3):
            APIClient().post(self.URL, {"username": "CAJERO_clave"}, format="json")
        pedidos = PedidoRestablecimientoClave.objects.filter(usuario=personal["cajero"])
        assert pedidos.count() == 1
        assert RegistroAuditoria.objects.filter(accion="PEDIDO_RESTABLECIMIENTO").count() == 1

    def test_usuario_inactivo_no_genera_pedido(self, personal):
        cajero = personal["cajero"]
        cajero.is_active = False
        cajero.save()
        res = APIClient().post(self.URL, {"username": "cajero_clave"}, format="json")
        assert res.status_code == 200
        assert not PedidoRestablecimientoClave.objects.exists()

    def test_sin_usuario_responde_400(self, personal):
        res = APIClient().post(self.URL, {"username": ""}, format="json")
        assert res.status_code == 400

    def test_el_duenio_ve_el_pedido_y_al_restablecer_queda_atendido(self, personal):
        APIClient().post(self.URL, {"username": "cajero_clave"}, format="json")
        cliente, _ = _cliente("duenio_clave")

        filas = cliente.get("/api/usuarios/?limite=50").json()["datos"]
        fila = next(f for f in filas if f["username"] == "cajero_clave")
        assert fila["pedido_clave_pendiente"] is not None
        otra = next(f for f in filas if f["username"] == "encargado_clave")
        assert otra["pedido_clave_pendiente"] is None

        cliente.post(
            f"/api/usuarios/{personal['cajero'].id}/restablecer-clave/",
            {"clave_nueva": NUEVA, "clave_nueva_repetida": NUEVA},
            format="json",
        )
        pedido = PedidoRestablecimientoClave.objects.get(usuario=personal["cajero"])
        assert pedido.atendido is True
        assert pedido.atendido_por == personal["duenio"]

    def test_limite_de_intentos(self, personal):
        from rest_framework.settings import api_settings

        original = api_settings.DEFAULT_THROTTLE_RATES.get("login")
        api_settings.DEFAULT_THROTTLE_RATES["login"] = "2/min"
        try:
            cache.clear()
            codigos = [
                APIClient().post(self.URL, {"username": "x"}, format="json").status_code
                for _ in range(3)
            ]
        finally:
            api_settings.DEFAULT_THROTTLE_RATES["login"] = original
            cache.clear()
        assert codigos[-1] == 429
