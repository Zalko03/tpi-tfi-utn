"""Tests de API para el acceso rápido de demostración (/api/auth/demo/)."""

import jwt
import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.settings import api_settings
from rest_framework.test import APIClient

from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO, ROL_ENCARGADO
from apps.usuarios.services import crear_personal, desactivar_personal

User = get_user_model()


@pytest.mark.django_db
class TestApiDemoAcceso:
    @pytest.fixture(autouse=True)
    def limpiar_cache(self):
        cache.clear()
        yield
        cache.clear()

    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def usuarios_demo(self):
        duenio = crear_personal(
            datos_usuario={
                "username": "duenio_demo",
                "password": "claveDemoTemp!1",
                "email": "duenio@cafedemo.local",
                "first_name": "Dueño",
                "last_name": "Demo",
            },
            rol=ROL_DUENIO,
        )
        encargado = crear_personal(
            datos_usuario={
                "username": "encargado_demo",
                "password": "claveDemoTemp!1",
                "email": "encargado@cafedemo.local",
                "first_name": "Encargado",
                "last_name": "Demo",
            },
            rol=ROL_ENCARGADO,
        )
        cajero = crear_personal(
            datos_usuario={
                "username": "cajero_demo",
                "password": "claveDemoTemp!1",
                "email": "cajero@cafedemo.local",
                "first_name": "Cajero",
                "last_name": "Demo",
            },
            rol=ROL_CAJERO,
        )
        return {"duenio": duenio, "encargado": encargado, "cajero": cajero}

    # Se fuerza la configuración: el .env local de una demo puede tener DEMO_ACCESO_RAPIDO=true.
    @override_settings(DEMO_ACCESO_RAPIDO=False)
    def test_disponible_false_con_variable_apagada(self, client):
        assert settings.DEMO_ACCESO_RAPIDO is False
        res = client.get("/api/auth/demo/")
        assert res.status_code == 200
        assert res.json() == {"disponible": False}

    @override_settings(DEMO_ACCESO_RAPIDO=False, DEBUG=True)
    def test_post_retorna_404_con_variable_apagada(self, client, usuarios_demo):
        res = client.post("/api/auth/demo/", {"perfil": "duenio"}, format="json")
        assert res.status_code == 404
        assert res.json() == {
            "mensaje": "Recurso no encontrado",
            "detalles": None,
        }

        res_invalido = client.post("/api/auth/demo/", {"perfil": "invalido"}, format="json")
        assert res_invalido.status_code == 404

    @override_settings(DEMO_ACCESO_RAPIDO=True, DEBUG=False)
    def test_retorna_no_disponible_y_404_con_variable_prendida_pero_debug_false(
        self, client, usuarios_demo
    ):
        res_get = client.get("/api/auth/demo/")
        assert res_get.status_code == 200
        assert res_get.json() == {"disponible": False}

        res_post = client.post("/api/auth/demo/", {"perfil": "duenio"}, format="json")
        assert res_post.status_code == 404
        assert res_post.json() == {
            "mensaje": "Recurso no encontrado",
            "detalles": None,
        }

    @override_settings(DEMO_ACCESO_RAPIDO=True, DEBUG=True)
    def test_get_disponible_true_cuando_demo_y_debug_activos(self, client):
        res = client.get("/api/auth/demo/")
        assert res.status_code == 200
        assert res.json() == {"disponible": True}

    @override_settings(DEMO_ACCESO_RAPIDO=True, DEBUG=True)
    @pytest.mark.parametrize(
        ("perfil", "username_esperado", "rol_esperado"),
        [
            ("duenio", "duenio_demo", ROL_DUENIO),
            ("encargado", "encargado_demo", ROL_ENCARGADO),
            ("cajero", "cajero_demo", ROL_CAJERO),
        ],
    )
    def test_post_demo_emite_tokens_validos_y_sirve_para_me(
        self, client, usuarios_demo, perfil, username_esperado, rol_esperado
    ):
        res = client.post("/api/auth/demo/", {"perfil": perfil}, format="json")
        assert res.status_code == 200
        data = res.json()

        assert "access" in data
        assert "refresh" in data
        assert "usuario" in data

        # Misma estructura exacta que POST /api/auth/token/
        res_login_normal = client.post(
            "/api/auth/token/",
            {"username": username_esperado, "password": "claveDemoTemp!1"},
            format="json",
        )
        assert res_login_normal.status_code == 200
        data_normal = res_login_normal.json()
        assert set(data.keys()) == set(data_normal.keys())
        assert data["usuario"] == data_normal["usuario"]
        assert data["usuario"]["username"] == username_esperado
        assert data["usuario"]["rol"] == rol_esperado

        decoded = jwt.decode(
            data["access"],
            settings.JWT_PUBLIC_KEY,
            algorithms=["RS256"],
            issuer="cafe-gestion-django",
        )
        assert decoded["username"] == username_esperado
        assert decoded["rol"] == rol_esperado

        # El token emitido funciona en GET /api/usuarios/me/
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {data['access']}")
        res_me = client.get("/api/usuarios/me/")
        assert res_me.status_code == 200
        assert res_me.json()["username"] == username_esperado
        assert res_me.json()["rol"] == rol_esperado

    @override_settings(DEMO_ACCESO_RAPIDO=True, DEBUG=True)
    @pytest.mark.parametrize(
        "payload",
        [
            {},
            {"perfil": ""},
            {"perfil": "otro"},
            {"perfil": "gerente"},
            {"perfil": None},
        ],
    )
    def test_post_perfil_invalido_retorna_400(self, client, usuarios_demo, payload):
        res = client.post("/api/auth/demo/", payload, format="json")
        assert res.status_code == 400
        data = res.json()
        assert data["mensaje"] == "Datos de entrada inválidos"
        assert "perfil" in data["detalles"]

    @override_settings(DEMO_ACCESO_RAPIDO=True, DEBUG=True)
    @pytest.mark.parametrize("perfil_prohibido", ["admin", "admin_demo", "duenio_demo", "root"])
    def test_post_imposible_pedir_admin_u_otro_usuario(
        self, client, usuarios_demo, perfil_prohibido
    ):
        User.objects.get_or_create(
            username="admin",
            defaults={"is_superuser": True, "is_staff": True, "is_active": True},
        )
        User.objects.get_or_create(
            username="admin_demo",
            defaults={"is_superuser": True, "is_staff": True, "is_active": True},
        )
        res = client.post("/api/auth/demo/", {"perfil": perfil_prohibido}, format="json")
        assert res.status_code == 400

    @override_settings(DEMO_ACCESO_RAPIDO=True, DEBUG=True)
    def test_post_usuario_demo_inactivo_retorna_404(self, client, usuarios_demo):
        desactivar_personal(
            usuarios_demo["cajero"].id,
            motivo="Baja de prueba",
            desactivado_por=usuarios_demo["duenio"],
        )
        res = client.post("/api/auth/demo/", {"perfil": "cajero"}, format="json")
        assert res.status_code == 404
        assert res.json() == {
            "mensaje": "Recurso no encontrado",
            "detalles": None,
        }

    @override_settings(DEMO_ACCESO_RAPIDO=True, DEBUG=True)
    def test_post_usuario_demo_inexistente_retorna_404(self, client):
        res = client.post("/api/auth/demo/", {"perfil": "cajero"}, format="json")
        assert res.status_code == 404
        assert res.json() == {
            "mensaje": "Recurso no encontrado",
            "detalles": None,
        }

    @override_settings(DEMO_ACCESO_RAPIDO=True, DEBUG=True)
    def test_post_aplica_login_rate_throttle(self, client, usuarios_demo):
        tasa_original = api_settings.DEFAULT_THROTTLE_RATES.get("login")
        try:
            api_settings.DEFAULT_THROTTLE_RATES["login"] = "2/min"
            # GET no consume la cuota de LoginRateThrottle
            assert client.get("/api/auth/demo/").status_code == 200
            assert client.get("/api/auth/demo/").status_code == 200

            r1 = client.post("/api/auth/demo/", {"perfil": "cajero"}, format="json")
            r2 = client.post("/api/auth/demo/", {"perfil": "cajero"}, format="json")
            r3 = client.post("/api/auth/demo/", {"perfil": "cajero"}, format="json")
            assert r1.status_code == 200
            assert r2.status_code == 200
            assert r3.status_code == 429
            assert (
                r3.json()["mensaje"]
                == "Demasiados intentos seguidos. Probá de nuevo en unos minutos"
            )
        finally:
            if tasa_original is not None:
                api_settings.DEFAULT_THROTTLE_RATES["login"] = tasa_original
