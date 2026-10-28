"""
Excepciones de dominio para el módulo de usuarios y seguridad.
Heredan de ValidationError de DRF para integrarse con el manejador de
excepciones unificado (docs/api-errores.md).
"""

from rest_framework.exceptions import ValidationError


class ErrorReglaNegocio(ValidationError):
    """Excepción base de dominio para violaciones de reglas del negocio."""

    def __init__(self, detalle: str):
        super().__init__(detail={"mensaje": detalle, "detalles": None})


class ErrorSupervivenciaDuenio(ErrorReglaNegocio):
    """
    Excepción de dominio lanzada cuando una operación intenta desactivar, degradar
    o revocar permisos críticos al último Dueño activo del sistema (docs/seguridad.md §3).
    """

    pass
