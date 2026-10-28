"""
Tests unitarios aislados para el bloqueo de login, denegación de refresh
e invalidación en lista negra (blacklist) para usuarios inactivos (docs/seguridad.md §4).
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.exceptions import AuthenticationFailed as DrfAuthenticationFailed
from rest_framework_simplejwt.exceptions import (
    AuthenticationFailed,
    InvalidToken,
    TokenError,
)
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)

from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO
from apps.usuarios.services import (
    crear_personal,
    desactivar_personal,
    invalidar_tokens_usuario,
)
from apps.usuarios.tokens import (
    CustomTokenObtainPairSerializer,
    CustomTokenRefreshSerializer,
)

User = get_user_model()


@pytest.mark.django_db
class TestUnitBloqueoInactivo:
    """Pruebas unitarias de bloqueo de emisión y refresco para usuarios con is_active = False."""

    @pytest.fixture
    def user_duenio(self):
        return crear_personal(
            datos_usuario={
                "username": "duenio_auth_unit",
                "password": "claveSegura123!",
                "email": "duenio@cafe.local",
            },
            rol=ROL_DUENIO,
        )

    @pytest.fixture
    def user_cajero(self):
        return crear_personal(
            datos_usuario={
                "username": "cajero_auth_unit",
                "password": "claveSegura123!",
                "email": "cajero@cafe.local",
            },
            rol=ROL_CAJERO,
        )

    def test_login_serializer_rechaza_usuario_inactivo(self, user_cajero, user_duenio):
        """Un usuario con is_active = False no puede autenticarse ni emitir tokens."""
        desactivar_personal(
            user_cajero.id, motivo="Baja laboral", desactivado_por=user_duenio
        )
        user_cajero.refresh_from_db()
        assert user_cajero.is_active is False

        serializer = CustomTokenObtainPairSerializer(
            data={"username": "cajero_auth_unit", "password": "claveSegura123!"}
        )

        with pytest.raises((DrfAuthenticationFailed, AuthenticationFailed)) as exc_info:
            serializer.is_valid(raise_exception=True)

        assert (
            "cuenta" in str(exc_info.value).lower()
            or "activa" in str(exc_info.value).lower()
            or "credenciales" in str(exc_info.value).lower()
        )

    def test_refresh_serializer_bloquea_token_en_blacklist_tras_desactivacion(
        self, user_cajero, user_duenio
    ):
        """Al desactivar un usuario con desactivar_personal, su refresh previo se revoca en blacklist."""
        token_refresh = CustomTokenObtainPairSerializer.get_token(user_cajero)
        token_refresh.outstand()  # Registrado en tokens emitidos
        refresh_str = str(token_refresh)

        # Desactivamos al cajero, lo que revoca sus OutstandingTokens en Blacklist
        desactivar_personal(
            user_cajero.id, motivo="Baja inmediata", desactivado_por=user_duenio
        )
        user_cajero.refresh_from_db()
        assert user_cajero.is_active is False

        # Intentar refrescar el token debe ser rechazado por estar en Blacklist
        refresh_serializer = CustomTokenRefreshSerializer(data={"refresh": refresh_str})
        with pytest.raises((InvalidToken, TokenError)):
            refresh_serializer.is_valid(raise_exception=True)

    def test_refresh_serializer_bloquea_usuario_inactivo_sin_blacklist(
        self, user_cajero
    ):
        """Si un token válido no pasó por blacklist pero el usuario fue desactivado, el refresh lo rechaza."""
        token_refresh = CustomTokenObtainPairSerializer.get_token(user_cajero)
        refresh_str = str(token_refresh)

        # Desactivamos directamente el usuario en BD sin pasar por invalidar_tokens_usuario
        user_cajero.is_active = False
        user_cajero.save(update_fields=["is_active"])

        refresh_serializer = CustomTokenRefreshSerializer(data={"refresh": refresh_str})
        with pytest.raises((AuthenticationFailed, DrfAuthenticationFailed)) as exc_info:
            refresh_serializer.is_valid(raise_exception=True)

        assert "desactivada" in str(exc_info.value) or "inactiva" in str(exc_info.value)

    def test_refresh_serializer_falla_si_usuario_no_existe(self):
        """Si el ID del usuario en el token ya no existe en la base de datos, el refresh falla."""
        usuario_temp = User.objects.create_user(username="temp_del", password="pass")
        token_refresh = CustomTokenObtainPairSerializer.get_token(usuario_temp)
        refresh_str = str(token_refresh)
        usuario_temp.delete()

        refresh_serializer = CustomTokenRefreshSerializer(data={"refresh": refresh_str})
        with pytest.raises((AuthenticationFailed, DrfAuthenticationFailed)) as exc_info:
            refresh_serializer.is_valid(raise_exception=True)

        assert "No existe un usuario activo" in str(exc_info.value)

    def test_invalidar_tokens_usuario_agrega_a_blacklist(self, user_cajero):
        """La función invalidar_tokens_usuario traslada los OutstandingTokens a BlacklistedToken."""
        token_refresh = CustomTokenObtainPairSerializer.get_token(user_cajero)
        token_refresh.outstand()

        assert OutstandingToken.objects.filter(user=user_cajero).exists() is True

        bloqueados = invalidar_tokens_usuario(user_cajero)
        assert bloqueados >= 1

        for out_token in OutstandingToken.objects.filter(user=user_cajero):
            assert BlacklistedToken.objects.filter(token=out_token).exists() is True
