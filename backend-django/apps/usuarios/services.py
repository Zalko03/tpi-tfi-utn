"""
Servicios de lógica de negocio para la administración de personal, roles,
permisos granulares, protección del último Dueño y auditoría (docs/seguridad.md).
"""

import logging
from typing import Any, Dict, Optional

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework.exceptions import PermissionDenied

from apps.usuarios.constantes import (
    PERMISOS_CATALOGO,
    PERMISOS_CRITICOS_ADMINISTRACION,
    ROL_CAJERO,
    ROL_DUENIO,
    ROLES_CHOICES,
)
from apps.usuarios.exceptions import ErrorReglaNegocio, ErrorSupervivenciaDuenio
from apps.usuarios.models import PerfilUsuario, RegistroAuditoria

logger = logging.getLogger(__name__)
User = get_user_model()


def validar_claves_permisos(permisos_dict: Dict[str, Any]) -> None:
    """Valida que todas las claves del diccionario correspondan al catálogo oficial."""
    claves_validas = set(PERMISOS_CATALOGO)
    claves_invalidas = set(permisos_dict.keys()) - claves_validas
    if claves_invalidas:
        raise ErrorReglaNegocio(
            f"Las siguientes claves de permisos no pertenecen al catálogo: {', '.join(sorted(claves_invalidas))}"
        )


def contar_duenios_activos(excluir_usuario_id: Optional[int] = None) -> int:
    """Retorna la cantidad de usuarios activos con rol DUENIO en el sistema."""
    qs = User.objects.filter(is_active=True, perfil__rol=ROL_DUENIO)
    if excluir_usuario_id is not None:
        qs = qs.exclude(id=excluir_usuario_id)
    return qs.count()


def invalidar_tokens_usuario(usuario: Any) -> int:
    """
    Envía a la lista negra (Blacklist) todos los tokens vigentes del usuario.
    Retorna la cantidad de tokens bloqueados.
    """
    try:
        from rest_framework_simplejwt.token_blacklist.models import (
            BlacklistedToken,
            OutstandingToken,
        )

        tokens = OutstandingToken.objects.filter(user=usuario)
        bloqueados = 0
        for token_obj in tokens:
            _, created = BlacklistedToken.objects.get_or_create(token=token_obj)
            if created:
                bloqueados += 1
        return bloqueados
    except Exception as e:
        logger.warning(
            "No se pudieron invalidar tokens para el usuario %s: %s", usuario.id, e
        )
        return 0


@transaction.atomic
def crear_personal(
    datos_usuario: Dict[str, Any],
    rol: str = ROL_CAJERO,
    permisos: Optional[Dict[str, bool]] = None,
    creado_por: Optional[Any] = None,
) -> Any:
    """
    Da de alta un nuevo integrante del personal con su rol plantilla y ajustes
    individuales de permisos (HU6).
    """
    username = datos_usuario.get("username")
    password = datos_usuario.get("password")
    email = datos_usuario.get("email", "")
    first_name = datos_usuario.get("first_name", "")
    last_name = datos_usuario.get("last_name", "")

    if not username:
        raise ErrorReglaNegocio("El nombre de usuario (username) es obligatorio.")
    if not password:
        raise ErrorReglaNegocio("La contraseña inicial es obligatoria.")
    if User.objects.filter(username=username).exists():
        raise ErrorReglaNegocio(
            f"El nombre de usuario '{username}' ya se encuentra registrado."
        )

    roles_validos = dict(ROLES_CHOICES).keys()
    if rol not in roles_validos:
        raise ErrorReglaNegocio(
            f"Rol inválido: '{rol}'. Opciones válidas: {', '.join(roles_validos)}."
        )

    permisos = permisos or {}
    validar_claves_permisos(permisos)

    # Jerarquía: un operador no puede otorgar permisos que él no posee
    if creado_por and not creado_por.is_superuser:
        perfil_creador = getattr(creado_por, "perfil", None)
        if perfil_creador:
            permisos_creador = perfil_creador.obtener_permisos_completos()
            perfil_temp = PerfilUsuario(rol=rol, permisos=permisos)
            permisos_a_otorgar = perfil_temp.obtener_permisos_activos()
            for perm in permisos_a_otorgar:
                if not permisos_creador.get(perm, False):
                    raise PermissionDenied(
                        f"No puede otorgar el permiso '{perm}' porque no lo posee en su cuenta."
                    )

    usuario = User.objects.create_user(
        username=username,
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
        is_active=True,
    )

    PerfilUsuario.objects.create(
        usuario=usuario,
        rol=rol,
        permisos=permisos,
    )

    RegistroAuditoria.objects.create(
        usuario_modificado=usuario,
        modificado_por=creado_por
        if (creado_por and creado_por.is_authenticated)
        else None,
        accion="ALTA_USUARIO",
        detalles={
            "username": usuario.username,
            "rol": rol,
            "permisos_personalizados": permisos,
        },
    )

    return usuario


@transaction.atomic
def actualizar_personal(
    usuario_id: int,
    datos_usuario: Optional[Dict[str, Any]] = None,
    rol: Optional[str] = None,
    permisos: Optional[Dict[str, bool]] = None,
    modificado_por: Optional[Any] = None,
) -> Any:
    """
    Actualiza datos de perfil, rol o permisos granulares de un usuario existente,
    haciendo cumplir la jerarquía de privilegios y la protección del último Dueño activo.
    """
    try:
        usuario = User.objects.select_related("perfil").get(id=usuario_id)
    except User.DoesNotExist:
        raise ErrorReglaNegocio("El usuario especificado no existe.")

    perfil = usuario.perfil
    detalles_cambio: Dict[str, Any] = {}

    # 1. Modificación de datos básicos de Django User
    if datos_usuario:
        for campo in ("email", "first_name", "last_name"):
            if campo in datos_usuario:
                valor_nuevo = datos_usuario[campo]
                setattr(usuario, campo, valor_nuevo)
                detalles_cambio[campo] = valor_nuevo
        usuario.save()

    # 2. Modificación de rol con protección del último Dueño
    if rol and rol != perfil.rol:
        roles_validos = dict(ROLES_CHOICES).keys()
        if rol not in roles_validos:
            raise ErrorReglaNegocio(f"Rol inválido: '{rol}'.")

        if perfil.rol == ROL_DUENIO and rol != ROL_DUENIO:
            if contar_duenios_activos(excluir_usuario_id=usuario.id) == 0:
                raise ErrorSupervivenciaDuenio(
                    "No se puede cambiar el rol del único Dueño activo en el sistema."
                )

        detalles_cambio["rol_anterior"] = perfil.rol
        detalles_cambio["rol_nuevo"] = rol
        perfil.rol = rol

    # 3. Ajuste de permisos granulares
    if permisos is not None:
        validar_claves_permisos(permisos)

        # Regla de supervivencia: protección contra remoción de permisos críticos del último Dueño
        if (
            perfil.rol == ROL_DUENIO
            and contar_duenios_activos(excluir_usuario_id=usuario.id) == 0
        ):
            permisos_criticos_revocados = [
                perm
                for perm, activo in permisos.items()
                if perm in PERMISOS_CRITICOS_ADMINISTRACION and activo is False
            ]
            if permisos_criticos_revocados:
                raise ErrorSupervivenciaDuenio(
                    "No se pueden revocar permisos administrativos críticos al único Dueño activo en el sistema: "
                    + ", ".join(sorted(permisos_criticos_revocados))
                )

        # Regla jerárquica: no otorgar permisos que el operador no posee
        if modificado_por and not modificado_por.is_superuser:
            perfil_operador = getattr(modificado_por, "perfil", None)
            if perfil_operador:
                permisos_operador = perfil_operador.obtener_permisos_completos()
                for clave, valor in permisos.items():
                    if valor and not permisos_operador.get(clave, False):
                        raise PermissionDenied(
                            f"No puede otorgar el permiso '{clave}' porque no lo posee en su cuenta."
                        )

        # Merge de personalizaciones existentes con las nuevas
        nuevos_permisos = dict(perfil.permisos)
        nuevos_permisos.update(permisos)
        detalles_cambio["permisos_modificados"] = permisos
        perfil.permisos = nuevos_permisos

    perfil.save()

    accion_auditoria = "MODIFICACION_USUARIO"
    if "rol_nuevo" in detalles_cambio:
        accion_auditoria = "CAMBIO_ROL"
    elif "permisos_modificados" in detalles_cambio:
        accion_auditoria = "AJUSTE_PERMISOS"

    RegistroAuditoria.objects.create(
        usuario_modificado=usuario,
        modificado_por=modificado_por
        if (modificado_por and modificado_por.is_authenticated)
        else None,
        accion=accion_auditoria,
        detalles=detalles_cambio,
    )

    return usuario


@transaction.atomic
def desactivar_personal(
    usuario_id: int,
    motivo: str = "",
    desactivado_por: Optional[Any] = None,
) -> Any:
    """
    Desactiva lógicamente a un usuario (is_active = False), invalida sus tokens
    en la lista negra y protege al último Dueño activo (docs/seguridad.md §3 y §4).
    """
    try:
        usuario = User.objects.select_related("perfil").get(id=usuario_id)
    except User.DoesNotExist:
        raise ErrorReglaNegocio("El usuario especificado no existe.")

    if not usuario.is_active:
        return usuario  # Ya se encuentra inactivo

    # Regla de supervivencia del último Dueño activo
    perfil = getattr(usuario, "perfil", None)
    if perfil and perfil.rol == ROL_DUENIO:
        if contar_duenios_activos(excluir_usuario_id=usuario.id) == 0:
            raise ErrorSupervivenciaDuenio(
                "No se puede desactivar al único Dueño activo en el sistema."
            )

    usuario.is_active = False
    usuario.save(update_fields=["is_active"])

    tokens_revocados = invalidar_tokens_usuario(usuario)

    RegistroAuditoria.objects.create(
        usuario_modificado=usuario,
        modificado_por=desactivado_por
        if (desactivado_por and desactivado_por.is_authenticated)
        else None,
        accion="DESACTIVACION",
        detalles={
            "motivo": motivo or "Desactivación administrativa de personal",
            "tokens_revocados": tokens_revocados,
        },
    )

    return usuario


@transaction.atomic
def activar_personal(
    usuario_id: int,
    activado_por: Optional[Any] = None,
) -> Any:
    """Reactiva un usuario desactivado lógicamente."""
    try:
        usuario = User.objects.select_related("perfil").get(id=usuario_id)
    except User.DoesNotExist:
        raise ErrorReglaNegocio("El usuario especificado no existe.")

    if usuario.is_active:
        return usuario

    usuario.is_active = True
    usuario.save(update_fields=["is_active"])

    RegistroAuditoria.objects.create(
        usuario_modificado=usuario,
        modificado_por=activado_por
        if (activado_por and activado_por.is_authenticated)
        else None,
        accion="ACTIVACION",
        detalles={"mensaje": "Reactivación de cuenta de usuario"},
    )

    return usuario
