"""
Tests de integración para endpoints de salud profunda y trazabilidad X-Request-ID (TP 4).
"""

import pytest


@pytest.mark.django_db
def test_health_profundo_responde_ok_con_datos_de_conexion(client):
    respuesta = client.get("/health/profundo")

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["estado"] == "ok"
    assert datos["servicio"] == "backend-django"
    assert "checks" in datos
    assert datos["checks"]["database"]["estado"] == "ok"
    assert "latencia_ms" in datos["checks"]["database"]
    assert "X-Request-ID" in respuesta.headers


@pytest.mark.django_db
def test_api_health_profundo_funciona_bajo_prefijo_api(client):
    respuesta = client.get("/api/health/profundo")

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["estado"] == "ok"
    assert datos["servicio"] == "backend-django"


def test_todas_las_respuestas_propagan_x_request_id(client):
    custom_id = "test-req-tracing-12345"
    respuesta = client.get("/health", HTTP_X_REQUEST_ID=custom_id)

    assert respuesta.status_code == 200
    assert respuesta.headers.get("X-Request-ID") == custom_id
