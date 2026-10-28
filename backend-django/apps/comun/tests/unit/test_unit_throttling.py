"""
Pruebas unitarias puras para clases de Throttling (Rate Limiting).
Tarea T2.5 y docs/seguridad.md.
"""

from rest_framework.test import APIRequestFactory, APISimpleTestCase

from apps.comun.throttling import LoginRateThrottle, RecalculoRateThrottle


class TestUnitThrottling(APISimpleTestCase):
    def test_login_rate_throttle_posee_scope_correcto(self):
        throttle = LoginRateThrottle()
        self.assertEqual(throttle.scope, "login")

    def test_recalculo_rate_throttle_posee_scope_correcto(self):
        throttle = RecalculoRateThrottle()
        self.assertEqual(throttle.scope, "recalcular")

    def test_login_rate_throttle_obtiene_tasa_configurada(self):
        throttle = LoginRateThrottle()
        tasa = throttle.get_rate()
        self.assertIsNotNone(tasa)
        self.assertIn("/minute", tasa)

    def test_identificacion_cache_format(self):
        throttle = LoginRateThrottle()
        factory = APIRequestFactory()
        request = factory.get("/", REMOTE_ADDR="192.168.1.50")
        ident = throttle.get_ident(request)
        self.assertEqual(ident, "192.168.1.50")
