"""Tests unitarios aislados de adaptadores (Gemini/Ollama) y servicios con contingencia."""
import asyncio
from decimal import Decimal
import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
import httpx
import pytest
from app.schemas.extraccion import SolicitudExtraccionPrecios
from app.schemas.resumen import ProductoRendimientoEntrada, SolicitudResumenSemanal
from app.services.extraccion import extraer_precios_de_lista
from app.services.proveedor_ia import (
    ErrorProveedorIA,
    GeminiAdapter,
    OllamaAdapter,
    ProveedorIA,
    extraer_objeto_json,
    obtener_proveedor_ia,
)
from app.services.resumen import generar_resumen_semanal


class AdaptadorMockExitoso(ProveedorIA):
    """Adaptador doble de prueba que registra las llamadas recibidas."""

    def __init__(self, respuesta: dict[str, Any], nombre_prov: str = "gemini") -> None:
        self.respuesta = respuesta
        self._nombre = nombre_prov
        self.instrucciones_recibidas: list[str] = []
        self.datos_recibidos: list[str] = []

    @property
    def nombre(self) -> str:
        return self._nombre

    async def generar_json(
        self,
        instrucciones_sistema: str,
        datos_usuario: str,
        timeout: float,
    ) -> dict[str, Any]:
        self.instrucciones_recibidas.append(instrucciones_sistema)
        self.datos_recibidos.append(datos_usuario)
        return self.respuesta


class AdaptadorMockConFallosPrevios(ProveedorIA):
    """Adaptador que falla N veces antes de devolver una respuesta válida."""

    def __init__(self, fallos_iniciales: int, respuesta_final: dict[str, Any]) -> None:
        self.fallos_restantes = fallos_iniciales
        self.respuesta_final = respuesta_final
        self.intentos = 0

    @property
    def nombre(self) -> str:
        return "gemini"

    async def generar_json(
        self,
        instrucciones_sistema: str,
        datos_usuario: str,
        timeout: float,
    ) -> dict[str, Any]:
        self.intentos += 1
        if self.fallos_restantes > 0:
            self.fallos_restantes -= 1
            raise ErrorProveedorIA("Fallo temporal simulado de red")
        return self.respuesta_final


class AdaptadorMockTimeout(ProveedorIA):
    """Adaptador que simula demora excesiva superando el timeout."""

    @property
    def nombre(self) -> str:
        return "ollama"

    async def generar_json(
        self,
        instrucciones_sistema: str,
        datos_usuario: str,
        timeout: float,
    ) -> dict[str, Any]:
        await asyncio.sleep(timeout + 0.5)
        return {}


class TestUnitExtraerObjetoJson:
    """Pruebas unitarias del parser de respuestas JSON de IA."""

    def test_parsea_json_puro_correctamente(self):
        resultado = extraer_objeto_json('{"moneda": "ARS", "items": []}')
        assert resultado == {"moneda": "ARS", "items": []}

    def test_limpia_bloques_markdown_json(self):
        texto = '```json\n{"proveedor_detectado": "Litoral", "items": []}\n```'
        resultado = extraer_objeto_json(texto)
        assert resultado["proveedor_detectado"] == "Litoral"

    def test_falla_con_json_invalido(self):
        with pytest.raises(ErrorProveedorIA, match="no es JSON válido"):
            extraer_objeto_json("{json_roto:")

    def test_falla_si_raiz_no_es_diccionario(self):
        with pytest.raises(ErrorProveedorIA, match="debe ser un objeto"):
            extraer_objeto_json("[1, 2, 3]")


class TestUnitAdapters:
    """Pruebas unitarias de los adaptadores GeminiAdapter y OllamaAdapter."""

    async def test_gemini_adapter_falla_sin_api_key(self):
        adaptador = GeminiAdapter(api_key="", modelo="gemini-1.5-flash")
        with pytest.raises(ErrorProveedorIA, match="GEMINI_API_KEY no está configurada"):
            await adaptador.generar_json("instrucciones", "datos", timeout=2.0)

    async def test_gemini_adapter_envia_header_y_separa_system_de_user(self):
        adaptador = GeminiAdapter(
            api_key="clave-ficticia-test",
            modelo="gemini-1.5-flash",
            base_url="https://api.ejemplo.test/v1beta",
        )
        respuesta_http_mock = MagicMock()
        respuesta_http_mock.raise_for_status = MagicMock()
        respuesta_http_mock.json.return_value = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": '{"moneda": "ARS", "items": []}'}
                        ]
                    }
                }
            ]
        }

        cliente_mock = AsyncMock()
        cliente_mock.post.return_value = respuesta_http_mock
        cliente_mock.__aenter__.return_value = cliente_mock
        cliente_mock.__aexit__.return_value = None

        with patch("httpx.AsyncClient", return_value=cliente_mock):
            resultado = await adaptador.generar_json(
                instrucciones_sistema="INSTRUCCION_FIJA",
                datos_usuario="DATOS_DEL_USUARIO",
                timeout=3.0,
            )

        assert resultado == {"moneda": "ARS", "items": []}
        llamada = cliente_mock.post.call_args
        url_llamada = llamada.args[0]
        headers_llamada = llamada.kwargs["headers"]
        json_llamada = llamada.kwargs["json"]

        # Verifica que la API key no viaje en la URL sino en la cabecera x-goog-api-key
        assert "clave-ficticia-test" not in url_llamada
        assert headers_llamada["x-goog-api-key"] == "clave-ficticia-test"
        # Verifica separación entre instrucciones del sistema y datos del usuario
        assert json_llamada["system_instruction"]["parts"][0]["text"] == "INSTRUCCION_FIJA"
        assert json_llamada["contents"][0]["parts"][0]["text"] == "DATOS_DEL_USUARIO"

    async def test_ollama_adapter_envia_mensajes_separados_system_y_user(self):
        adaptador = OllamaAdapter(
            base_url="http://localhost:11434",
            modelo="llama3.2:1b",
        )
        respuesta_http_mock = MagicMock()
        respuesta_http_mock.raise_for_status = MagicMock()
        respuesta_http_mock.json.return_value = {
            "message": {
                "role": "assistant",
                "content": '{"moneda": "ARS", "items": []}',
            }
        }

        cliente_mock = AsyncMock()
        cliente_mock.post.return_value = respuesta_http_mock
        cliente_mock.__aenter__.return_value = cliente_mock
        cliente_mock.__aexit__.return_value = None

        with patch("httpx.AsyncClient", return_value=cliente_mock):
            resultado = await adaptador.generar_json(
                instrucciones_sistema="SISTEMA_OLLAMA",
                datos_usuario="USUARIO_OLLAMA",
                timeout=3.0,
            )

        assert resultado == {"moneda": "ARS", "items": []}
        json_llamada = cliente_mock.post.call_args.kwargs["json"]
        assert json_llamada["messages"][0] == {"role": "system", "content": "SISTEMA_OLLAMA"}
        assert json_llamada["messages"][1] == {"role": "user", "content": "USUARIO_OLLAMA"}

    def test_fabrica_obtener_proveedor_ia_selecciona_correctamente(self):
        assert isinstance(obtener_proveedor_ia("gemini"), GeminiAdapter)
        assert isinstance(obtener_proveedor_ia("ollama"), OllamaAdapter)
        with pytest.raises(ErrorProveedorIA, match="no soportado"):
            obtener_proveedor_ia("proveedor_inexistente")


class TestUnitServiciosConContingencia:
    """Pruebas unitarias de los servicios de extracción y resumen semanal."""

    async def test_extraccion_exitosa_no_concatena_texto_usuario_en_prompt(self):
        texto_usuario = "Café Colombia 1 kg $22000"
        adaptador = AdaptadorMockExitoso(
            respuesta={
                "proveedor_detectado": "Tostadores Unidos",
                "envio_detectado": "1500.00",
                "moneda": "ARS",
                "items": [
                    {
                        "nombre_insumo": "Café Colombia",
                        "cantidad": "1",
                        "unidad": "kg",
                        "precio_total": "22000.00",
                        "iva_incluido": True,
                        "alicuota": "21.00",
                        "confianza": "0.99",
                        "texto_original": texto_usuario,
                    }
                ],
                "advertencias": [],
            }
        )
        solicitud = SolicitudExtraccionPrecios(texto_lista=texto_usuario)
        respuesta = await extraer_precios_de_lista(solicitud, adaptador=adaptador)

        assert respuesta.contingencia is False
        assert respuesta.mensaje_contingencia is None
        assert len(respuesta.items) == 1
        assert respuesta.items[0].precio_total == Decimal("22000.00")
        # Regla crítica: el texto del usuario jamás debe concatenarse en las instrucciones del prompt
        assert texto_usuario not in adaptador.instrucciones_recibidas[0]
        datos_enviados = json.loads(adaptador.datos_recibidos[0])
        assert datos_enviados["texto_lista_precios"] == texto_usuario

    async def test_extraccion_reintenta_ante_fallo_temporal_y_recupera(self, monkeypatch):
        monkeypatch.setenv("AI_MAX_RETRIES", "2")
        adaptador = AdaptadorMockConFallosPrevios(
            fallos_iniciales=1,
            respuesta_final={
                "proveedor_detectado": "Proveedor Sur",
                "envio_detectado": "0.00",
                "moneda": "ARS",
                "items": [
                    {
                        "nombre_insumo": "Azúcar blanca",
                        "cantidad": "10",
                        "unidad": "kg",
                        "precio_total": "9500.00",
                    }
                ],
                "advertencias": [],
            },
        )
        solicitud = SolicitudExtraccionPrecios(texto_lista="Azúcar 10 kg $9500")
        respuesta = await extraer_precios_de_lista(solicitud, adaptador=adaptador)

        assert respuesta.contingencia is False
        assert adaptador.intentos == 2
        assert len(respuesta.items) == 1

    async def test_extraccion_devuelve_contingencia_si_salida_ia_no_valida_pydantic(self, monkeypatch):
        monkeypatch.setenv("AI_MAX_RETRIES", "0")
        # La IA devuelve un precio negativo inválido
        adaptador = AdaptadorMockExitoso(
            respuesta={
                "items": [
                    {
                        "nombre_insumo": "Leche",
                        "cantidad": "0",
                        "unidad": "ml",
                        "precio_total": "-500",
                    }
                ]
            }
        )
        solicitud = SolicitudExtraccionPrecios(
            texto_lista="Leche rota",
            proveedor_nombre="Lácteos Del Valle",
        )
        respuesta = await extraer_precios_de_lista(solicitud, adaptador=adaptador)

        assert respuesta.contingencia is True
        assert respuesta.items == []
        assert respuesta.proveedor_detectado == "Lácteos Del Valle"
        assert respuesta.mensaje_contingencia is not None
        assert "validación de esquema Pydantic" in respuesta.advertencias[0]

    async def test_extraccion_devuelve_contingencia_ante_timeout(self, monkeypatch):
        monkeypatch.setenv("AI_TIMEOUT_SECONDS", "0.1")
        monkeypatch.setenv("AI_MAX_RETRIES", "1")
        adaptador = AdaptadorMockTimeout()
        solicitud = SolicitudExtraccionPrecios(texto_lista="Lista lenta 1 kg $5000")

        respuesta = await extraer_precios_de_lista(solicitud, adaptador=adaptador)
        assert respuesta.contingencia is True
        assert respuesta.proveedor_ia == "ollama"
        assert "Tiempo de espera agotado" in respuesta.advertencias[0]

    async def test_resumen_semanal_exitoso(self):
        adaptador = AdaptadorMockExitoso(
            respuesta={
                "resumen_ejecutivo": (
                    "Excelente semana operativa con alta rotación de cafetería clásica y buen margen general."
                ),
                "productos_destacados": ["Capuchino Italiano"],
                "sugerencias_rotacion": [
                    {
                        "producto": "Medialuna de Manteca",
                        "accion_sugerida": "Armar combo desayuno con Capuchino",
                        "motivo": "Alto volumen de ventas con oportunidad de subir ticket promedio.",
                    }
                ],
                "alertas_costos": ["Vigilar costo de manteca en próximas compras."],
            }
        )
        solicitud = SolicitudResumenSemanal(
            fecha_desde="2026-10-20",
            fecha_hasta="2026-10-27",
            total_ventas="450000.00",
            ganancia_bruta_total="270000.00",
            cantidad_tickets=180,
            productos=[
                ProductoRendimientoEntrada(
                    nombre="Capuchino Italiano",
                    unidades_vendidas=95,
                    ingresos_totales="285000.00",
                    ganancia_bruta="185250.00",
                    margen_bruto_pct="65.00",
                )
            ],
        )
        respuesta = await generar_resumen_semanal(solicitud, adaptador=adaptador)
        assert respuesta.contingencia is False
        assert "Capuchino Italiano" in respuesta.productos_destacados
        assert len(respuesta.sugerencias_rotacion) == 1

    async def test_resumen_semanal_contingencia_cuando_ia_falla(self, monkeypatch):
        monkeypatch.setenv("AI_MAX_RETRIES", "0")
        adaptador = AdaptadorMockConFallosPrevios(fallos_iniciales=5, respuesta_final={})
        solicitud = SolicitudResumenSemanal(
            fecha_desde="2026-10-20",
            fecha_hasta="2026-10-27",
            total_ventas="450000.00",
            ganancia_bruta_total="270000.00",
            cantidad_tickets=180,
            productos=[
                ProductoRendimientoEntrada(
                    nombre="Latte Vainilla",
                    unidades_vendidas=60,
                    ingresos_totales="180000.00",
                    ganancia_bruta="108000.00",
                    margen_bruto_pct="60.00",
                )
            ],
            alertas_insumos=["Suba en jarabe de vainilla"],
        )
        respuesta = await generar_resumen_semanal(solicitud, adaptador=adaptador)

        assert respuesta.contingencia is True
        assert respuesta.mensaje_contingencia is not None
        assert "Latte Vainilla" in respuesta.productos_destacados
        assert "Suba en jarabe de vainilla" in respuesta.alertas_costos
