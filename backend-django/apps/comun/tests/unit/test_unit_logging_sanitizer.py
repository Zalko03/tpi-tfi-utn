"""
Pruebas unitarias para el filtro de sanitización de logging (T2.5).
Verifica que ninguna contraseña, token o secreto se emita en texto plano.
"""

import logging
from unittest import TestCase

from apps.comun.logging import FiltroSanitizacionSeguridad


class TestUnitLoggingSanitizer(TestCase):
    def setUp(self):
        self.filtro = FiltroSanitizacionSeguridad()

    def test_enmascara_contrasenias_en_json_o_string(self):
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname=__file__,
            lineno=10,
            msg='Inicio de sesión fallido para usuario cajero1 con password="clave-secreta-123"',
            args=(),
            exc_info=None,
        )

        self.filtro.filter(record)
        self.assertNotIn("clave-secreta-123", record.msg)
        self.assertIn('"********"', record.msg)

    def test_enmascara_tokens_bearer(self):
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname=__file__,
            lineno=20,
            msg="Petición recibida con cabecera Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig",
            args=(),
            exc_info=None,
        )

        self.filtro.filter(record)
        self.assertNotIn("eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig", record.msg)
        self.assertIn("Bearer ********", record.msg)

    def test_enmascara_refresh_y_access_tokens(self):
        record = logging.LogRecord(
            name="test",
            level=logging.WARNING,
            pathname=__file__,
            lineno=30,
            msg='Token inválido: refresh="secreto-refresh-token-xyz"',
            args=(),
            exc_info=None,
        )

        self.filtro.filter(record)
        self.assertNotIn("secreto-refresh-token-xyz", record.msg)
        self.assertIn('"********"', record.msg)

    def test_preserva_mensajes_sin_datos_sensibles(self):
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname=__file__,
            lineno=40,
            msg="Cálculo de costos ejecutado exitosamente para producto Cafe con Leche (id=3)",
            args=(),
            exc_info=None,
        )

        self.filtro.filter(record)
        self.assertEqual(
            record.msg,
            "Cálculo de costos ejecutado exitosamente para producto Cafe con Leche (id=3)",
        )
