"""Tests de API sobre los endpoints de ai-service (/health, /v1/extraer-precios, /v1/resumen-semanal)."""

import base64
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.services.proveedor_ia import ErrorProveedorIA, GroqAdapter
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

    def test_post_extraer_precios_con_groq_api_key_vacia_entra_en_contingencia(self, monkeypatch):
        """Simula GROQ_API_KEY='' (vacía): responde contingencia explícita sin fingir IA."""
        monkeypatch.setenv("AI_PROVIDER", "groq")
        monkeypatch.setenv("GROQ_API_KEY", "")

        respuesta = cliente.post(
            "/v1/extraer-precios",
            json={
                "texto_lista": "Café Tostado 5 kg: $115000\nLeche Entera 12 l: $16200",
                "proveedor_nombre": "Mayorista Sin Key",
            },
        )

        assert respuesta.status_code == 200
        datos = respuesta.json()
        assert datos["contingencia"] is True
        assert datos["proveedor_ia"] == "contingencia"
        assert "No se pudo usar la IA, revisá la configuración" in (
            datos["mensaje_contingencia"] or ""
        )
        assert any("GROQ_API_KEY" in adv for adv in datos["advertencias"])

    def test_post_extraer_precios_datos_invalidos_responde_400_formato_unico(self):
        respuesta = cliente.post(
            "/v1/extraer-precios",
            json={"texto_lista": ""},
        )
        assert respuesta.status_code == 400
        cuerpo = respuesta.json()
        assert cuerpo["mensaje"] == "Datos de entrada inválidos"
        assert "texto_lista" in cuerpo["detalles"]

    def test_post_extraer_precios_rechaza_pdf_binario_sin_extraer_400(self):
        respuesta = cliente.post(
            "/v1/extraer-precios",
            json={
                "texto_lista": "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>",
                "origen_archivo": "pdf",
            },
        )
        assert respuesta.status_code == 400
        cuerpo = respuesta.json()
        assert cuerpo["mensaje"] == "Datos de entrada inválidos"
        assert "texto_lista" in cuerpo["detalles"]

    def test_post_extraer_precios_con_imagen_exitoso_y_contingencia_sin_clave(self, monkeypatch):
        img_b64 = base64.b64encode(b"\xff\xd8\xff\xe0foto-lista").decode("ascii")

        respuesta_http_mock = MagicMock()
        respuesta_http_mock.raise_for_status = MagicMock()
        respuesta_http_mock.json.return_value = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": (
                            '{"proveedor_detectado": "Foto Mayorista", "envio_detectado": "0.00", '
                            '"moneda": "ARS", "items": [{"nombre_insumo": "Café en grano", '
                            '"cantidad": "1", "unidad": "kg", "precio_total": "24000.00"}], '
                            '"advertencias": []}'
                        ),
                    }
                }
            ]
        }
        cliente_mock = AsyncMock()
        cliente_mock.post.return_value = respuesta_http_mock
        cliente_mock.__aenter__.return_value = cliente_mock
        cliente_mock.__aexit__.return_value = None

        adaptador_groq = GroqAdapter(api_key="gsk-test-vision", fallback_demo=False)
        with (
            patch("app.services.extraccion.obtener_proveedor_ia", return_value=adaptador_groq),
            patch("httpx.AsyncClient", return_value=cliente_mock),
        ):
            res_ok = cliente.post(
                "/v1/extraer-precios",
                json={
                    "proveedor_nombre": "Foto Mayorista",
                    "origen_archivo": "imagen",
                    "imagen_base64": img_b64,
                    "imagen_mime": "image/jpeg",
                },
            )

        assert res_ok.status_code == 200
        datos_ok = res_ok.json()
        assert datos_ok["contingencia"] is False
        assert datos_ok["proveedor_ia"] == "groq"
        assert len(datos_ok["items"]) == 1
        assert datos_ok["items"][0]["nombre_insumo"] == "Café en grano"
        assert datos_ok["items"][0]["precio_total"] == "24000.00"
        cuerpo_enviado = cliente_mock.post.call_args.kwargs["json"]
        assert "foto" in cuerpo_enviado["messages"][0]["content"].lower()

        # Sin clave devuelve contingencia honesta sin inventar ítems
        monkeypatch.setenv("AI_PROVIDER", "groq")
        monkeypatch.setenv("GROQ_API_KEY", "")
        res_sin_clave = cliente.post(
            "/v1/extraer-precios",
            json={
                "proveedor_nombre": "Foto Mayorista",
                "origen_archivo": "imagen",
                "imagen_base64": img_b64,
                "imagen_mime": "image/jpeg",
            },
        )
        assert res_sin_clave.status_code == 200
        datos_sin_clave = res_sin_clave.json()
        assert datos_sin_clave["contingencia"] is True
        assert datos_sin_clave["items"] == []
        assert datos_sin_clave["proveedor_ia"] == "contingencia"

    def test_post_extraer_precios_imagen_invalida_responde_400(self):
        respuesta = cliente.post(
            "/v1/extraer-precios",
            json={
                "origen_archivo": "imagen",
                "imagen_base64": "no-valido!!!",
                "imagen_mime": "image/gif",
            },
        )
        assert respuesta.status_code == 400
        cuerpo = respuesta.json()
        assert cuerpo["mensaje"] == "Datos de entrada inválidos"
        assert "imagen_base64" in cuerpo["detalles"]
        assert "imagen_mime" in cuerpo["detalles"]

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
