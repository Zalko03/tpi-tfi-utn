"""Tests del comando `crear_superadmin` (la única forma de crear un superadmin)."""

from unittest import mock

import pytest
from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command

from apps.usuarios.models import RegistroAuditoria

User = get_user_model()
CLAVE = "claveSegura123!"


def _correr(username, *claves, **kwargs):
    with mock.patch("getpass.getpass", side_effect=list(claves)):
        call_command("crear_superadmin", username, **kwargs)


@pytest.mark.django_db
class TestComandoCrearSuperadmin:
    def test_crea_superadmin_con_auditoria(self):
        _correr("jefe", CLAVE, CLAVE, email="jefe@cafe.local")
        usuario = User.objects.get(username="jefe")
        assert usuario.is_superuser and usuario.is_active
        assert usuario.check_password(CLAVE)
        registro = RegistroAuditoria.objects.get(usuario_modificado=usuario)
        assert registro.accion == "ALTA_USUARIO"
        assert registro.detalles["origen"] == "comando"
        assert CLAVE not in str(registro.detalles)

    def test_claves_distintas_no_crea_nada(self):
        with pytest.raises(CommandError, match="no coinciden"):
            _correr("jefe", CLAVE, "otraCosa123!")
        assert not User.objects.filter(username="jefe").exists()

    def test_clave_debil_no_crea_nada(self):
        with pytest.raises(CommandError):
            _correr("jefe", "1234", "1234")
        assert not User.objects.filter(username="jefe").exists()

    def test_usuario_existente_no_se_modifica(self):
        User.objects.create_user(username="jefe", password="vieja-clave-99")
        with pytest.raises(CommandError, match="ya existe"):
            _correr("jefe", CLAVE, CLAVE)
        usuario = User.objects.get(username="jefe")
        assert usuario.is_superuser is False
        assert usuario.check_password("vieja-clave-99")
