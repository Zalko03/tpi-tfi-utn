from django.apps import AppConfig


class UsuariosConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.usuarios"
    verbose_name = "Usuarios y Seguridad"

    def ready(self):
        from apps.usuarios import checks  # noqa: F401
