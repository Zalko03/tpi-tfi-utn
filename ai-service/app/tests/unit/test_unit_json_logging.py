"""
Tests unitarios puros para formateador JSON y sanitización de logs en ai-service (TP 4).
"""

import json
import logging

from app.utils.logger import FormateadorJsonIA, sanitizar_mensaje_ia


def test_formateador_json_ia_genera_estructura_valida():
    formateador = FormateadorJsonIA()
    record = logging.LogRecord(
        name="ai_logger",
        level=logging.INFO,
        pathname="extraccion.py",
        lineno=45,
        msg="Inferencia completada en %d ms",
        args=(120,),
        exc_info=None,
    )
    record.correlation_id = "corr-test-ai-123"

    salida = formateador.format(record)
    datos = json.loads(salida)

    assert datos["nivel"] == "INFO"
    assert datos["servicio"] == "ai-service"
    assert datos["mensaje"] == "Inferencia completada en 120 ms"
    assert datos["correlation_id"] == "corr-test-ai-123"
    assert "timestamp" in datos


def test_sanitizar_mensaje_ia_enmascara_api_keys():
    texto = 'Llamada HTTP a Gemini con api_key: "AIzaSySecretApiKey12345" y token="abc"'
    sanitizado = sanitizar_mensaje_ia(texto)

    assert "AIzaSySecretApiKey12345" not in sanitizado
    assert "********" in sanitizado
