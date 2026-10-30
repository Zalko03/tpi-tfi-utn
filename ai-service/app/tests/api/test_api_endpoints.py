"""Tests de API sobre los endpoints de ai-service (/health, /v1/extraer-precios, /v1/resumen-semanal)."""
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app
from app.services.proveedor_ia import ErrorProveedorIA
from app.tests.unit.test_unit_adapters_y_servicios import AdaptadorMockExitoso

cliente = TestClient(app)


class TestApiEndpointsAIService:
    """Pruebas de contrato HTTP, OpenAPI y manejo unificado de errores."""

    def test_health_responde_200_ok(self):
        respuesta = cliente.get("/health")
        assert respuesta.status_code == 200
        assert respuesta.json() == {"estado": "ok", "servicio": "ai-service"}

    def test_ruta_inexistente_responde_404_con_formato_unico_error(self):
        respuesta = cliente.get("/v1/ruta-que-no-existe")
        assert respuesta.status_code == 404
        cuerpo = respuesta.json()
        assert set(cuerpo.keys()) == {"mensaje", "detalles"}
        assert cuerpo["mensaje"] == "Recurso no encontrado"
        assert cuerpo["detalles"] is None

    def test_post_extraer_precios_exitoso(self):
        adaptador_mock = AdaptadorMockExitoso(
            respuesta={
                "proveedor_detectado": "Distribuidora Centro",
                "envio_detectado": "2000.00",
                "moneda": "ARS",
                "items": [
                    {
                        "nombre_insumo": "Chocolate amargo cobertura",
                        "cantidad": "2",
                        "unidad": "kg",
                        "precio_total": "24000.00",
                        "iva_incluido": True,
                        "alicuota": "21.00",
                        "confianza": "0.96",
                        "texto_original": "Chocolate amargo x 2 kg: $24000",
                    }
                ],
                "advertencias": [],
            }
        )
        with patch("app.services.extraccion.obtener_proveedor_ia", return_value=adaptador_mock):
            respuesta = cliente.post(
                "/v1/extraer-precios",
                json={
                    "texto_lista": "Chocolate amargo x 2 kg: $24000 - Envío $2000",
                    "proveedor_nombre": "Distribuidora Centro",
                },
            )

        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["contingencia"] is False
        assert datos["proveedor_detectado"] == "Distribuidora Centro"
        assert datos["envio_detectado"] == "2000.00"
        assert len(datos["items"]) == 1
        assert datos["items"][0]["nombre_insumo"] == "Chocolate amargo cobertura"
        assert datos["items"][0]["precio_total"] == "24000.00"

    def test_post_extraer_precios_contingencia_cuando_proveedor_falla(self):
        with patch(
            "app.services.extraccion.obtener_proveedor_ia",
            side_effect=ErrorProveedorIA("Sin conexión con proveedor externo"),
        ):
            respuesta = cliente.post(
                "/v1/extraer-precios",
                json={
                    "texto_lista": "Leche entera 12 litros $14400",
                    "proveedor_nombre": "Lácteos Sur",
                },
            )

        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["contingencia"] is True
        assert datos["items"] == []
        assert datos["mensaje_contingencia"] is not None

    def test_post_extraer_precios_datos_invalidos_responde_400_formato_unico(self):
        respuesta = cliente.post(
            "/v1/extraer-precios",
            json={"texto_lista": ""},
        )
        assert respuesta.status_code == 400
        cuerpo = respuesta.json()
        assert cuerpo["mensaje"] == "Datos de entrada inválidos"
        assert "texto_lista" in cuerpo["detalles"]

    def test_post_resumen_semanal_exitoso(self):
        adaptador_mock = AdaptadorMockExitoso(
            respuesta={
                "resumen_ejecutivo": "Semana sólida con crecimiento en tickets y margen saludable.",
                "productos_destacados": ["Flat White"],
                "sugerencias_rotacion": [
                    {
                        "producto": "Alfajor Artesanal",
                        "accion_sugerida": "Destacar en mostrador de caja",
                        "motivo": "Buen margen bruto (62%) pero baja rotación semanal.",
                    }
                ],
                "alertas_costos": [],
            }
        )
        with patch("app.services.resumen.obtener_proveedor_ia", return_value=adaptador_mock):
            respuesta = cliente.post(
                "/v1/resumen-semanal",
                json={
                    "fecha_desde": "2026-10-20",
                    "fecha_hasta": "2026-10-27",
                    "total_ventas": "320000.00",
                    "ganancia_bruta_total": "198400.00",
                    "cantidad_tickets": 110,
                    "productos": [
                        {
                            "nombre": "Flat White",
                            "unidades_vendidas": 70,
                            "ingresos_totales": "210000.00",
                            "ganancia_bruta": "136500.00",
                            "margen_bruto_pct": "65.00",
                        }
                    ],
                },
            )

        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["contingencia"] is False
        assert datos["productos_destacados"] == ["Flat White"]
        assert len(datos["sugerencias_rotacion"]) == 1

    def test_post_resumen_semanal_datos_invalidos_responde_400_formato_unico(self):
        respuesta = cliente.post(
            "/v1/resumen-semanal",
            json={
                "fecha_desde": "2026-10-20",
                "fecha_hasta": "2026-10-27",
                "total_ventas": "-100.00",
                "ganancia_bruta_total": "0.00",
                "cantidad_tickets": 10,
                "productos": [],
            },
        )
        assert respuesta.status_code == 400
        cuerpo = respuesta.json()
        assert cuerpo["mensaje"] == "Datos de entrada inválidos"
        assert isinstance(cuerpo["detalles"], dict)

    def test_openapi_incluye_endpoints_y_ejemplos(self):
        respuesta = cliente.get("/openapi.json")
        assert respuesta.status_code == 200
        esquema = respuesta.json()
        assert "/v1/extraer-precios" in esquema["paths"]
        assert "/v1/resumen-semanal" in esquema["paths"]
        componentes = esquema["components"]["schemas"]
        assert "example" in componentes["SolicitudExtraccionPrecios"]
        assert "example" in componentes["RespuestaExtraccionPrecios"]
        assert "example" in componentes["SolicitudResumenSemanal"]
        assert "example" in componentes["RespuestaResumenSemanal"]
