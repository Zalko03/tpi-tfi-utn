"""
Modelos de datos para el módulo de usuarios, roles como plantillas y auditoría.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.usuarios.constantes import (
    PERMISOS_CATALOGO,
    ROL_CAJERO,
    ROLES_CHOICES,
    ROLES_PLANTILLAS,
)


class PerfilUsuario(models.Model):
    """
    Extensión del modelo User para almacenar el rol plantilla y las personalizaciones
    granulares de permisos por usuario (docs/seguridad.md §1).
    """

    usuario = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="perfil",
        verbose_name="Usuario de autenticación",
    )
    rol = models.CharField(
        max_length=20,
        choices=ROLES_CHOICES,
        default=ROL_CAJERO,
        verbose_name="Rol plantilla",
    )
    permisos = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="Ajustes individuales de permisos (overrides)",
    )
    creado_en = models.DateTimeField(
        auto_now_add=True, verbose_name="Fecha de creación"
    )
    actualizado_en = models.DateTimeField(
        auto_now=True, verbose_name="Última actualización"
    )

    class Meta:
        verbose_name = "Perfil de Personal"
        verbose_name_plural = "Perfiles de Personal"

    def __str__(self) -> str:
        return f"{self.usuario.username} ({self.rol})"

    def obtener_permisos_completos(self) -> dict[str, bool]:
        """
        Retorna el diccionario consolidado de permisos:
        1. Precarga la plantilla del rol asignado.
        2. Aplica los ajustes individuales (overrides) registrados para el usuario.
        """
        plantilla = dict(ROLES_PLANTILLAS.get(self.rol, ROLES_PLANTILLAS[ROL_CAJERO]))
        if isinstance(self.permisos, dict):
            plantilla.update(self.permisos)
        return plantilla

    def tiene_permiso(self, clave_permiso: str) -> bool:
        """Verifica si el usuario posee un permiso granular activo."""
        try:
            if not self.usuario.is_active:
                return False
            if self.usuario.is_superuser:
                return True
        except Exception:
            pass
        return self.obtener_permisos_completos().get(clave_permiso, False)

    def obtener_permisos_activos(self) -> list[str]:
        """
        Retorna la lista ordenada de claves de permisos con valor True
        para incluir en el payload del JWT (claim 'permisos').
        """
        try:
            if not self.usuario.is_active:
                return []
            if self.usuario.is_superuser:
                return sorted(PERMISOS_CATALOGO)
        except Exception:
            pass
        completos = self.obtener_permisos_completos()
        return sorted([clave for clave, activo in completos.items() if activo])


class RegistroAuditoria(models.Model):
    """
    Registro inmutable de auditoría para cambios sobre personal, permisos y estados
    de actividad (docs/seguridad.md §4.2).
    """

    ACCIONES = (
        ("ALTA_USUARIO", "Alta de nuevo personal"),
        ("MODIFICACION_USUARIO", "Modificación de datos de perfil"),
        ("CAMBIO_ROL", "Cambio de rol plantilla"),
        ("AJUSTE_PERMISOS", "Ajuste individual de permisos"),
        ("DESACTIVACION", "Desactivación lógica de usuario"),
        ("ACTIVACION", "Reactivación de usuario"),
    )

    usuario_modificado = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="auditorias_recibidas",
        verbose_name="Usuario afectado",
    )
    modificado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="auditorias_realizadas",
        verbose_name="Operador responsable",
    )
    accion = models.CharField(
        max_length=50,
        choices=ACCIONES,
        verbose_name="Acción de auditoría",
    )
    detalles = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="Detalles de la modificación",
    )
    fecha = models.DateTimeField(
        default=timezone.now,
        verbose_name="Fecha y hora del cambio",
    )

    class Meta:
        verbose_name = "Registro de Auditoría de Personal"
        verbose_name_plural = "Registros de Auditoría de Personal"
        ordering = ["-fecha"]

    def __str__(self) -> str:
        operador = self.modificado_por.username if self.modificado_por else "Sistema"
        return f"[{self.fecha.strftime('%Y-%m-%d %H:%M')}] {self.accion} sobre {self.usuario_modificado.username} por {operador}"
