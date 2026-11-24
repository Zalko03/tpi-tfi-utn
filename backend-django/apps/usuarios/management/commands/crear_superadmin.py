"""
Crea el superadmin del sistema. Es la única forma de crearlo: la web nunca puede
marcar a alguien como superadmin.

Uso: python manage.py crear_superadmin <usuario> [--email correo]
La contraseña se pide por teclado sin mostrarla (nunca como argumento, para que no
quede en el historial de la terminal ni en los logs).
"""

import getpass

from django.core.management.base import BaseCommand, CommandError

from apps.usuarios.exceptions import ErrorReglaNegocio
from apps.usuarios.services import crear_superadmin


class Command(BaseCommand):
    help = "Crea el superadmin pidiendo la contraseña por teclado."

    def add_arguments(self, parser):
        parser.add_argument("username", help="Nombre de usuario del superadmin.")
        parser.add_argument("--email", default="", help="Correo (opcional).")

    def handle(self, *args, **opciones):
        clave = getpass.getpass("Contraseña: ")
        repetida = getpass.getpass("Repetí la contraseña: ")
        if clave != repetida:
            raise CommandError("Las contraseñas no coinciden. No se creó nada.")
        try:
            usuario = crear_superadmin(opciones["username"], clave, opciones["email"])
        except ErrorReglaNegocio as error:
            raise CommandError(error.detail["mensaje"]) from error
        self.stdout.write(self.style.SUCCESS(f"✅ Superadmin '{usuario.username}' creado."))
