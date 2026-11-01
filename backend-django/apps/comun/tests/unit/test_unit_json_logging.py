"""
Tests unitarios puros para FormateadorJson de logs estructurados (TP 4).
No interactúa con base de datos.
"""

import json
import logging

from apps.comun.logging import FormateadorJson, sanitizar_mensaje
from apps.comun.middleware import CORRELATION_ID_ACTUAL


def test_formateador_json_genera_json_valido_con_campos_estandar():
    formateador = FormateadorJson()
    record = logging.LogRecord(
        name="test_logger",
        level=logging.INFO,
        pathname="test.py",
        lineno=10,
        msg="Operación ejecutada exitosamente con id %s",
        args=(42,),
        exc_info=None,
    )

    salida = formateador.format(record)
    datos = json.loads(salida)

    assert datos["nivel"] == "INFO"
    assert datos["servicio"] == "backend-django"
    assert datos["logger"] == "test_logger"
    assert datos["mensaje"] == "Operación ejecutada exitosamente con id 42"
    assert "timestamp" in datos
    assert "correlation_id" in datos


def test_formateador_json_incluye_correlation_id_activo():
    formateador = FormateadorJson()
    token = CORRELATION_ID_ACTUAL.set("test-corr-abc-999")

    try:
        record = logging.LogRecord(
            name="test_corr",
            level=logging.WARNING,
            pathname="test.py",
            lineno=20,
            msg="Mensaje con correlación",
            args=(),
            exc_info=None,
        )
        datos = json.loads(formateador.format(record))
        assert datos["correlation_id"] == "test-corr-abc-999"
    finally:
        CORRELATION_ID_ACTUAL.reset(token)


def test_formateador_json_sanitiza_secretos_en_el_mensaje():
    formateador = FormateadorJson()
    record = logging.LogRecord(
        name="seguridad",
        level=logging.INFO,
        pathname="auth.py",
        lineno=15,
        msg='Intento de login con password="SuperSecretPassword123" y token: "eyJhbGciOi..."',
        args=(),
        exc_info=None,
    )

    salida = formateador.format(record)
    assert "SuperSecretPassword123" not in salida
    assert "********" in salida


def test_sanitizar_mensaje_enmascara_bearer_token():
    texto = (
        "Petición saliente con Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig hacia nodo"
    )
    sanitizado = sanitizar_mensaje(texto)

    assert sanitizado == "Petición saliente con Bearer ******** hacia nodo"
    assert "eyJhbGci" not in sanitizado
