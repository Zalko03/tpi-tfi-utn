"""
Serializers DRF para el módulo de personal, permisos y auditoría.
"""

from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.usuarios.constantes import (
    PERMISOS_CATALOGO,
    ROL_CAJERO,
    ROL_DUENIO,
    ROLES_CHOICES,
)
from apps.usuarios.models import PerfilUsuario, RegistroAuditoria

User = get_user_model()


class PerfilUsuarioSerializer(serializers.ModelSerializer):
    permisos_activos = serializers.SerializerMethodField()

    class Meta:
        model = PerfilUsuario
        fields = ("rol", "permisos", "permisos_activos", "creado_en", "actualizado_en")

    def get_permisos_activos(self, obj) -> list[str]:
        return obj.obtener_permisos_activos()


class UsuarioSerializer(serializers.ModelSerializer):
    rol = serializers.SerializerMethodField()
    permisos = serializers.SerializerMethodField()
    permisos_activos = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "is_superuser",
            "rol",
            "permisos",
            "permisos_activos",
            "date_joined",
        )
        read_only_fields = ("id", "date_joined", "is_active", "is_superuser")

    def get_rol(self, obj) -> str:
        if getattr(obj, "is_superuser", False):
            return ROL_DUENIO
        perfil = getattr(obj, "perfil", None)
        return perfil.rol if perfil else ROL_CAJERO

    def get_permisos(self, obj) -> dict:
        perfil = getattr(obj, "perfil", None)
        return perfil.permisos if (perfil and isinstance(perfil.permisos, dict)) else {}

    def get_permisos_activos(self, obj) -> list[str]:
        if not getattr(obj, "is_active", True):
            return []
        if getattr(obj, "is_superuser", False):
            return sorted(PERMISOS_CATALOGO)
        perfil = getattr(obj, "perfil", None)
        return perfil.obtener_permisos_activos() if perfil else []


class UsuarioCrearSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=4)
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    rol = serializers.ChoiceField(choices=ROLES_CHOICES, default=ROL_CAJERO)
    permisos = serializers.DictField(
        child=serializers.BooleanField(),
        required=False,
        default=dict,
    )

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Este nombre de usuario ya está en uso.")
        return value

    def validate_permisos(self, value):
        claves_validas = set(PERMISOS_CATALOGO)
        invalidas = set(value.keys()) - claves_validas
        if invalidas:
            raise serializers.ValidationError(
                f"Permisos no reconocidos: {', '.join(sorted(invalidas))}"
            )
        return value


class UsuarioActualizarSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    rol = serializers.ChoiceField(choices=ROLES_CHOICES, required=False)
    permisos = serializers.DictField(
        child=serializers.BooleanField(),
        required=False,
    )

    def validate_permisos(self, value):
        claves_validas = set(PERMISOS_CATALOGO)
        invalidas = set(value.keys()) - claves_validas
        if invalidas:
            raise serializers.ValidationError(
                f"Permisos no reconocidos: {', '.join(sorted(invalidas))}"
            )
        return value


class AjustarPermisosSerializer(serializers.Serializer):
    permisos = serializers.DictField(
        child=serializers.BooleanField(),
        required=True,
    )

    def validate_permisos(self, value):
        claves_validas = set(PERMISOS_CATALOGO)
        invalidas = set(value.keys()) - claves_validas
        if invalidas:
            raise serializers.ValidationError(
                f"Permisos no reconocidos: {', '.join(sorted(invalidas))}"
            )
        return value


class DesactivarUsuarioSerializer(serializers.Serializer):
    motivo = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class RegistroAuditoriaSerializer(serializers.ModelSerializer):
    usuario_modificado_username = serializers.CharField(
        source="usuario_modificado.username", read_only=True
    )
    modificado_por_username = serializers.CharField(
        source="modificado_por.username", read_only=True, default="Sistema"
    )

    class Meta:
        model = RegistroAuditoria
        fields = (
            "id",
            "usuario_modificado_id",
            "usuario_modificado_username",
            "modificado_por_id",
            "modificado_por_username",
            "accion",
            "detalles",
            "fecha",
        )
