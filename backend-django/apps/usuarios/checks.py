"""System checks de seguridad para la app de usuarios."""

from django.conf import settings
from django.core.checks import Error, register


@register()
def verificar_demo_acceso_rapido_seguro(app_configs, **kwargs):
    """Impide arrancar con acceso rápido de demostración activo cuando DEBUG está apagado."""
    errores = []
    if getattr(settings, "DEMO_ACCESO_RAPIDO", False) and not getattr(settings, "DEBUG", False):
        errores.append(
            Error(
                "DEMO_ACCESO_RAPIDO no puede estar habilitado cuando DEBUG es False.",
                hint="Configurá DEMO_ACCESO_RAPIDO=false fuera de una demostración local.",
                id="usuarios.E001",
            )
        )
    return errores
