"""
Tests de API e integración para endpoints de autenticación SimpleJWT RS256:
/api/auth/token/, /api/auth/token/refresh/ y /api/auth/token/blacklist/.
"""

import jwt
import pytest
from django.conf import settings
from rest_framework.test import APIClient

from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO
from apps.usuarios.services import crear_personal, desactivar_personal


@pytest.mark.django_db
class TestApiAuthEndpoints:
    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def duenio(self):
        return crear_personal(
            datos_usuario={
                "username": "duenio_api",
                "password": "claveSegura123!",
                "email": "duenio_api@cafe.local",
            },
            rol=ROL_DUENIO,
        )

    @pytest.fixture
    def cajero(self):
        return crear_personal(
            datos_usuario={
                "username": "cajero_api",
                "password": "claveSegura123!",
                "email": "cajero_api@cafe.local",
            },
            rol=ROL_CAJERO,
        )

    def test_login_exitoso_retorna_200_con_tokens_y_usuario(self, client, duenio):
        """POST /api/auth/token/ responde 200 con access, refresh y perfil del usuario."""
        res = client.post(
            "/api/auth/token/",
            {"username": "duenio_api", "password": "claveSegura123!"},
            format="json",
        )
        assert res.status_code == 200
        data = res.json()
        assert "access" in data
        assert "refresh" in data
        assert "usuario" in data
        assert data["usuario"]["username"] == "duenio_api"
        assert data["usuario"]["rol"] == ROL_DUENIO
        assert len(data["usuario"]["permisos"]) == 30

        # Verificación criptográfica con la clave pública de Django
        decoded = jwt.decode(
            data["access"],
            settings.JWT_PUBLIC_KEY,
            algorithms=["RS256"],
            issuer="cafe-gestion-django",
        )
        assert decoded["user_id"] == duenio.id
        assert decoded["rol"] == ROL_DUENIO

    def test_login_credenciales_invalidas_retorna_401(self, client, duenio):
        """POST /api/auth/token/ con contraseña incorrecta responde 401 con formato unificado."""
        res = client.post(
            "/api/auth/token/",
            {"username": "duenio_api", "password": "claveErronea"},
            format="json",
        )
        assert res.status_code == 401
        data = res.json()
        assert "mensaje" in data
        assert "detalles" in data

    def test_login_usuario_inactivo_retorna_401(self, client, duenio, cajero):
        """POST /api/auth/token/ para un usuario desactivado responde 401."""
        desactivar_personal(cajero.id, motivo="Baja", desactivado_por=duenio)

        res = client.post(
            "/api/auth/token/",
            {"username": "cajero_api", "password": "claveSegura123!"},
            format="json",
        )
        assert res.status_code == 401
        data = res.json()
        assert "mensaje" in data

    def test_refresh_token_exitoso_emite_nuevo_access_token(self, client, cajero):
        """POST /api/auth/token/refresh/ genera un nuevo access token RS256 con claims vigentes."""
        res_login = client.post(
            "/api/auth/token/",
            {"username": "cajero_api", "password": "claveSegura123!"},
            format="json",
        )
        refresh_token = res_login.json()["refresh"]

        res_refresh = client.post(
            "/api/auth/token/refresh/",
            {"refresh": refresh_token},
            format="json",
        )
        assert res_refresh.status_code == 200
        data = res_refresh.json()
        assert "access" in data

        decoded = jwt.decode(
            data["access"],
            settings.JWT_PUBLIC_KEY,
            algorithms=["RS256"],
            issuer="cafe-gestion-django",
        )
        assert decoded["username"] == "cajero_api"
        assert decoded["rol"] == ROL_CAJERO

    def test_logout_envia_refresh_token_a_blacklist(self, client, cajero):
        """POST /api/auth/token/blacklist/ revoca el token impidiendo su uso posterior."""
        res_login = client.post(
            "/api/auth/token/",
            {"username": "cajero_api", "password": "claveSegura123!"},
            format="json",
        )
        refresh_token = res_login.json()["refresh"]

        res_logout = client.post(
            "/api/auth/token/blacklist/",
            {"refresh": refresh_token},
            format="json",
        )
        assert res_logout.status_code == 200

        # Intento de refresco con token en lista negra falla
        res_fallido = client.post(
            "/api/auth/token/refresh/",
            {"refresh": refresh_token},
            format="json",
        )
        assert res_fallido.status_code in (400, 401)
