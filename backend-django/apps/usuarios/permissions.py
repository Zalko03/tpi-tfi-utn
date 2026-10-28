"""
Clases de permisos DRF personalizadas para autorización basada en roles
y permisos granulares por usuario (docs/seguridad.md §1 y §5).
"""

from typing import Type

from rest_framework import permissions

from apps.usuarios.constantes import ROL_DUENIO, ROL_ENCARGADO


def TienePermiso(clave_permiso: str) -> Type[permissions.BasePermission]:
    """
    Fábrica de permisos DRF que comprueba si el usuario autenticado posee
    un permiso granular específico en su perfil activo o en el claim del token.
    """

    class _TienePermiso(permissions.BasePermission):
        message = "No tiene permisos para realizar esta acción"

        def has_permission(self, request, view):
            if not request.user or not request.user.is_authenticated:
                return False
            if not request.user.is_active:
                return False
            if request.user.is_superuser:
                return True

            perfil = getattr(request.user, "perfil", None)
            if perfil:
                return perfil.tiene_permiso(clave_permiso)

            # Verificación complementaria por claim de JWT en auth token si no hay perfil en BD
            auth = getattr(request, "auth", None)
            payload = getattr(auth, "payload", None)
            if payload is None and hasattr(auth, "get"):
                payload = auth
            token_permisos = payload.get("permisos", []) if payload else []
            return clave_permiso in token_permisos

    return _TienePermiso


class EsDuenio(permissions.BasePermission):
    """Permite el acceso exclusivamente a usuarios con rol Dueño."""

    message = "No tiene permisos para realizar esta acción"

    def has_permission(self, request, view):
        if (
            not request.user
            or not request.user.is_authenticated
            or not request.user.is_active
        ):
            return False
        if request.user.is_superuser:
            return True
        perfil = getattr(request.user, "perfil", None)
        return bool(perfil and perfil.rol == ROL_DUENIO)


class EsEncargadoODuenio(permissions.BasePermission):
    """Permite el acceso a Encargados o Dueños."""

    message = "No tiene permisos para realizar esta acción"

    def has_permission(self, request, view):
        if (
            not request.user
            or not request.user.is_authenticated
            or not request.user.is_active
        ):
            return False
        if request.user.is_superuser:
            return True
        perfil = getattr(request.user, "perfil", None)
        return bool(perfil and perfil.rol in (ROL_DUENIO, ROL_ENCARGADO))


class PermisoObjetoTurnoCaja(permissions.BasePermission):
    """
    Autorización a nivel de objeto para turnos de caja (docs/seguridad.md §5):
    - Un cajero solo puede ver o cerrar su propio turno de caja.
    - Usuarios con 'caja.gestionar_turnos_ajenos' (Dueño/Encargado) acceden a todos.
    """

    message = "No tiene permisos para acceder al turno de otro usuario"

    def has_permission(self, request, view):
        if (
            not request.user
            or not request.user.is_authenticated
            or not request.user.is_active
        ):
            return False
        return True

    def has_object_permission(self, request, view, obj):
        if (
            not request.user
            or not request.user.is_authenticated
            or not request.user.is_active
        ):
            return False
        if request.user.is_superuser:
            return True

        perfil = getattr(request.user, "perfil", None)
        if perfil and perfil.tiene_permiso("caja.gestionar_turnos_ajenos"):
            return True

        auth = getattr(request, "auth", None)
        payload = getattr(auth, "payload", None)
        if payload is None and hasattr(auth, "get"):
            payload = auth
        token_permisos = payload.get("permisos", []) if payload else []
        if "caja.gestionar_turnos_ajenos" in token_permisos:
            return True

        return obj.usuario_id == request.user.id


class PermisoObjetoVenta(permissions.BasePermission):
    """
    Autorización a nivel de objeto para ventas (docs/seguridad.md §5):
    - Con 'ventas.ver_historial_todos': acceso global.
    - Con 'ventas.ver_historial_propio' (Cajero): solo accede a ventas de sus propios turnos.
    """

    message = "No tiene permisos para consultar ventas de otros operadores"

    def has_permission(self, request, view):
        if (
            not request.user
            or not request.user.is_authenticated
            or not request.user.is_active
        ):
            return False
        return True

    def has_object_permission(self, request, view, obj):
        if (
            not request.user
            or not request.user.is_authenticated
            or not request.user.is_active
        ):
            return False
        if request.user.is_superuser:
            return True

        perfil = getattr(request.user, "perfil", None)
        if perfil and perfil.tiene_permiso("ventas.ver_historial_todos"):
            return True

        auth = getattr(request, "auth", None)
        payload = getattr(auth, "payload", None)
        if payload is None and hasattr(auth, "get"):
            payload = auth
        token_permisos = payload.get("permisos", []) if payload else []
        if "ventas.ver_historial_todos" in token_permisos:
            return True

        if obj.turno_caja and obj.turno_caja.usuario_id:
            return obj.turno_caja.usuario_id == request.user.id

        return False
