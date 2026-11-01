"""
Tests de integración para endpoints de salud y observabilidad en ai-service (TP 4).
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_profundo_responde_configuracion_operativa():
    respuesta = client.get("/health/profundo")

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["estado"] == "ok"
    assert datos["servicio"] == "ai-service"
    assert "proveedor" in datos
    assert "version_prompt" in datos
    assert "timeout_segundos" in datos
    assert "modelo" in datos
    assert "X-Request-ID" in respuesta.headers


def test_health_propaga_x_request_id_entrante():
    custom_id = "req-tracing-ai-service-54321"
    respuesta = client.get("/health", headers={"X-Request-ID": custom_id})

    assert respuesta.status_code == 200
    assert respuesta.headers["X-Request-ID"] == custom_id
    assert respuesta.json() == {"estado": "ok", "servicio": "ai-service"}
