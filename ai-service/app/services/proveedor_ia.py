"""Patrón Adapter para desacoplar el proveedor de IA (Gemini API y Ollama)."""
from abc import ABC, abstractmethod
import json
import re
from typing import Any, Optional
import httpx
from app.config import config


class ErrorProveedorIA(Exception):
    """Error producido al comunicarse con el proveedor de IA o al parsear su salida."""


def extraer_objeto_json(texto_crudo: str) -> dict[str, Any]:
    """
    Limpia bloques Markdown opcionales (```json ... ```) y decodifica un diccionario JSON.
    Lanza ErrorProveedorIA si la salida no es un objeto JSON válido.
    """
    if not texto_crudo or not isinstance(texto_crudo, str):
        raise ErrorProveedorIA("El proveedor de IA devolvió una respuesta vacía.")

    limpio = texto_crudo.strip()
    bloque_md = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", limpio, flags=re.DOTALL)
    if bloque_md:
        limpio = bloque_md.group(1).strip()

    try:
        datos = json.loads(limpio)
    except json.JSONDecodeError as exc:
        raise ErrorProveedorIA(f"La salida de la IA no es JSON válido: {exc.msg}") from exc

    if not isinstance(datos, dict):
        raise ErrorProveedorIA("La salida JSON de la IA debe ser un objeto (dict) en la raíz.")

    return datos


class ProveedorIA(ABC):
    """Interfaz común que debe implementar cualquier adaptador de proveedor de IA."""

    @property
    @abstractmethod
    def nombre(self) -> str:
        """Identificador corto del proveedor ('gemini', 'ollama', etc.)."""

    @abstractmethod
    async def generar_json(
        self,
        instrucciones_sistema: str,
        datos_usuario: str,
        timeout: float,
    ) -> dict[str, Any]:
        """
        Envía las instrucciones del sistema y los datos del usuario por separado
        (sin concatenarlos) y devuelve el diccionario JSON de respuesta.
        """


class GeminiAdapter(ProveedorIA):
    """Adaptador para Google Gemini API (REST v1beta generateContent)."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        modelo: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> None:
        self.api_key = api_key if api_key is not None else config.gemini_api_key
        self.modelo = modelo or config.gemini_modelo
        self.base_url = (base_url or config.gemini_base_url).rstrip("/")

    @property
    def nombre(self) -> str:
        return "gemini"

    async def generar_json(
        self,
        instrucciones_sistema: str,
        datos_usuario: str,
        timeout: float,
    ) -> dict[str, Any]:
        if not self.api_key:
            raise ErrorProveedorIA("GEMINI_API_KEY no está configurada en el entorno.")

        url = f"{self.base_url}/models/{self.modelo}:generateContent"
        # La clave viaja por cabecera HTTP (x-goog-api-key) para no exponerla en URLs de logs
        cabeceras = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key,
        }
        # Las instrucciones del sistema y los datos del usuario viajan en estructuras separadas
        cuerpo = {
            "system_instruction": {
                "parts": [{"text": instrucciones_sistema}],
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": datos_usuario}],
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.1,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=timeout) as cliente:
                respuesta = await cliente.post(url, headers=cabeceras, json=cuerpo)
                respuesta.raise_for_status()
                payload = respuesta.json()
        except httpx.TimeoutException as exc:
            raise ErrorProveedorIA("Tiempo de espera agotado al consultar Gemini API.") from exc
        except httpx.HTTPError as exc:
            raise ErrorProveedorIA("Fallo de comunicación HTTP con Gemini API.") from exc

        try:
            candidatos = payload.get("candidates") or []
            partes = candidatos[0]["content"]["parts"]
            texto_respuesta = partes[0]["text"]
        except (IndexError, KeyError, TypeError) as exc:
            raise ErrorProveedorIA("Estructura de respuesta inesperada desde Gemini API.") from exc

        return extraer_objeto_json(texto_respuesta)


class OllamaAdapter(ProveedorIA):
    """Adaptador para servidor Ollama local o remoto (/api/chat)."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        modelo: Optional[str] = None,
    ) -> None:
        self.base_url = (base_url or config.ollama_base_url).rstrip("/")
        self.modelo = modelo or config.ollama_modelo

    @property
    def nombre(self) -> str:
        return "ollama"

    async def generar_json(
        self,
        instrucciones_sistema: str,
        datos_usuario: str,
        timeout: float,
    ) -> dict[str, Any]:
        url = f"{self.base_url}/api/chat"
        cuerpo = {
            "model": self.modelo,
            "format": "json",
            "stream": False,
            "messages": [
                {"role": "system", "content": instrucciones_sistema},
                {"role": "user", "content": datos_usuario},
            ],
            "options": {
                "temperature": 0.1,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=timeout) as cliente:
                respuesta = await cliente.post(url, json=cuerpo)
                respuesta.raise_for_status()
                payload = respuesta.json()
        except httpx.TimeoutException as exc:
            raise ErrorProveedorIA("Tiempo de espera agotado al consultar Ollama.") from exc
        except httpx.HTTPError as exc:
            raise ErrorProveedorIA("Fallo de comunicación HTTP con Ollama.") from exc

        try:
            texto_respuesta = payload["message"]["content"]
        except (KeyError, TypeError) as exc:
            raise ErrorProveedorIA("Estructura de respuesta inesperada desde Ollama.") from exc

        return extraer_objeto_json(texto_respuesta)


def obtener_proveedor_ia(nombre_proveedor: Optional[str] = None) -> ProveedorIA:
    """Fábrica que devuelve la instancia del adaptador de IA configurado."""
    seleccion = (nombre_proveedor or config.proveedor_activo).strip().lower()
    if seleccion == "gemini":
        return GeminiAdapter()
    if seleccion == "ollama":
        return OllamaAdapter()
    raise ErrorProveedorIA(
        f"Proveedor de IA '{seleccion}' no soportado. Opciones válidas: 'gemini', 'ollama'."
    )
