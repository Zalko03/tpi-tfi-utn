"""
Serializers personalizados para SimpleJWT RS256 con enriquecimiento de claims
de rol y permisos (ADR-0001 y docs/seguridad.md §4).
"""

from typing import Any, Dict

from django.contrib.auth import get_user_model
from rest_framework_simplejwt.exceptions import (
    AuthenticationFailed,
    InvalidToken,
    TokenError,
)
from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)
from rest_framework_simplejwt.settings import api_settings

User = get_user_model()


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Emite pares de tokens JWT firmados con RS256 conteniendo claims
    estándar RFC 7519 y claims de dominio (rol y array de permisos).
    """

    @classmethod
    def get_token(cls, user: Any):
        token = super().get_token(user)

        # Claims estándar requeridos por ADR-0001
        token["iss"] = "cafe-gestion-django"
        token["sub"] = str(user.id)
        token["user_id"] = user.id
        token["username"] = user.username
        token["email"] = user.email or ""

        # Claims de dominio (rol y array de permisos granulares)
        perfil = getattr(user, "perfil", None)
        if perfil:
            token["rol"] = perfil.rol
            token["permisos"] = perfil.obtener_permisos_activos()
        else:
            token["rol"] = "DUENIO" if user.is_superuser else "CAJERO"
            token["permisos"] = []

        return token

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        data = super().validate(attrs)

        user = self.user
        if not user.is_active:
            raise AuthenticationFailed("La cuenta del usuario ha sido desactivada.")

        perfil = getattr(user, "perfil", None)
        rol = perfil.rol if perfil else ("DUENIO" if user.is_superuser else "CAJERO")
        permisos = perfil.obtener_permisos_activos() if perfil else []

        data["usuario"] = {
            "id": user.id,
            "username": user.username,
            "email": user.email or "",
            "first_name": user.first_name or "",
            "last_name": user.last_name or "",
            "rol": rol,
            "permisos": permisos,
        }
        return data


class CustomTokenRefreshSerializer(TokenRefreshSerializer):
    """
    Refresca el access token verificando el estado de actividad del usuario
    en la base de datos y recalculando sus claims vigentes de rol y permisos.
    """

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        try:
            refresh = self.token_class(attrs["refresh"])
        except TokenError as e:
            raise InvalidToken(e.args[0])

        user_id = refresh.payload.get(api_settings.USER_ID_CLAIM, None)
        if not user_id:
            raise InvalidToken(
                "El token no contiene un identificador de usuario válido."
            )

        try:
            user = User.objects.select_related("perfil").get(
                **{api_settings.USER_ID_FIELD: user_id}
            )
        except User.DoesNotExist:
            raise AuthenticationFailed(
                "No existe un usuario activo asociado a este token."
            )

        if not user.is_active:
            raise AuthenticationFailed("La cuenta del usuario ha sido desactivada.")

        # Generar access token con claims vigentes de la base de datos
        access = refresh.access_token
        access["iss"] = "cafe-gestion-django"
        access["sub"] = str(user.id)
        access["user_id"] = user.id
        access["username"] = user.username
        access["email"] = user.email or ""

        perfil = getattr(user, "perfil", None)
        if perfil:
            access["rol"] = perfil.rol
            access["permisos"] = perfil.obtener_permisos_activos()
        else:
            access["rol"] = "DUENIO" if user.is_superuser else "CAJERO"
            access["permisos"] = []

        data = {"access": str(access)}

        if api_settings.ROTATE_REFRESH_TOKENS:
            if api_settings.BLACKLIST_AFTER_ROTATION:
                try:
                    refresh.blacklist()
                except AttributeError:
                    pass

            refresh.set_jti()
            refresh.set_exp()
            refresh.set_iat()

            refresh["iss"] = "cafe-gestion-django"
            refresh["sub"] = str(user.id)
            refresh["user_id"] = user.id
            refresh["username"] = user.username
            refresh["email"] = user.email or ""
            if perfil:
                refresh["rol"] = perfil.rol
                refresh["permisos"] = perfil.obtener_permisos_activos()

            refresh.outstand()
            data["refresh"] = str(refresh)

        return data
