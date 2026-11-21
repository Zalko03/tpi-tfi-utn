"""Pruebas unitarias para la configuración y el check de seguridad de DEMO_ACCESO_RAPIDO."""

from django.core.checks import Error, run_checks
from django.test import override_settings

from config.settings.base import _a_booleano


class TestUnitDemoAccesoConfigYCheck:
    def test_demo_acceso_rapido_apagado_por_defecto_sin_variable(self, monkeypatch):
        monkeypatch.delenv("DEMO_ACCESO_RAPIDO", raising=False)
        import os

        assert _a_booleano(os.environ.get("DEMO_ACCESO_RAPIDO", "false")) is False

    @override_settings(DEMO_ACCESO_RAPIDO=True, DEBUG=False)
    def test_check_da_error_si_demo_activo_con_debug_false(self):
        errores = run_checks()
        errores_demo = [e for e in errores if e.id == "usuarios.E001"]
        assert len(errores_demo) == 1
        assert isinstance(errores_demo[0], Error)
        assert "DEBUG" in errores_demo[0].msg

    @override_settings(DEMO_ACCESO_RAPIDO=True, DEBUG=True)
    def test_check_no_da_error_si_demo_activo_con_debug_true(self):
        errores = run_checks()
        errores_demo = [e for e in errores if e.id == "usuarios.E001"]
        assert errores_demo == []

    @override_settings(DEMO_ACCESO_RAPIDO=False, DEBUG=False)
    def test_check_no_da_error_si_demo_apagado_con_debug_false(self):
        errores = run_checks()
        errores_demo = [e for e in errores if e.id == "usuarios.E001"]
        assert errores_demo == []
