"""
Pruebas de integración / API para endurecimiento de seguridad (T2.5).
CORS por origen restrictivo y Rate Limiting en endpoints sensibles.
"""

from django.core.cache import cache
from rest_framework import status
from rest_framework.settings import api_settings
from rest_framework.test import APITestCase


class TestApiHardeningEndpoints(APITestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_cors_emite_cabecera_para_origen_permitido(self):
        response = self.client.get("/health", HTTP_ORIGIN="http://localhost:5173")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.headers.get("Access-Control-Allow-Origin"),
            "http://localhost:5173",
        )

    def test_cors_no_emite_cabecera_para_origen_no_autorizado(self):
        response = self.client.get(
            "/health", HTTP_ORIGIN="http://sitio-no-autorizado.com"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("Access-Control-Allow-Origin", response.headers)

    def test_rate_limiting_en_login_responde_429_y_formato_unificado(self):
        cache.clear()
        tasa_original = api_settings.DEFAULT_THROTTLE_RATES.get("login")
        try:
            # Forzamos una tasa estricta de 2 por minuto para verificar el bloqueo en la 3ra petición
            api_settings.DEFAULT_THROTTLE_RATES["login"] = "2/min"
            url = "/api/auth/token/"
            payload = {"username": "usuario_inexistente", "password": "password123"}

            # Petición 1: 401 Credenciales inválidas
            r1 = self.client.post(url, payload)
            self.assertEqual(r1.status_code, status.HTTP_401_UNAUTHORIZED)

            # Petición 2: 401 Credenciales inválidas
            r2 = self.client.post(url, payload)
            self.assertEqual(r2.status_code, status.HTTP_401_UNAUTHORIZED)

            # Petición 3: Debe ser bloqueada por rate limiting (429 Too Many Requests)
            r3 = self.client.post(url, payload)
            self.assertEqual(r3.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
            self.assertEqual(
                r3.data.get("mensaje"),
                "Demasiadas peticiones. Intente nuevamente en unos minutos",
            )
            self.assertIn("espera_segundos", r3.data.get("detalles", {}))
        finally:
            if tasa_original is not None:
                api_settings.DEFAULT_THROTTLE_RATES["login"] = tasa_original
            cache.clear()
