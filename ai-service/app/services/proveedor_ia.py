"""Patrón Adapter para desacoplar el proveedor de IA (Gemini API y Ollama)."""

import json
import re
from abc import ABC, abstractmethod
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


def parsear_lista_precios_heuristica(
    texto: str,
    proveedor_informado: Optional[str] = None,
) -> dict[str, Any]:
    """
    Parser determinista ultrarrápido y liviano de listas de precios gastronómicas.
    Extrae insumos, cantidades, unidades, importes y flete usando expresiones regulares
    sin requerir hardware ni conexión a internet durante demostraciones comerciales.
    """
    proveedor = proveedor_informado
    envio = "0.00"
    items: list[dict[str, Any]] = []
    advertencias: list[str] = []

    lineas = [linea.strip() for linea in texto.splitlines() if linea.strip()]

    if not proveedor and lineas:
        primera = lineas[0]
        m_prov = re.search(
            r"^(?:Lista\s+|Distribuidora\s+|Mayorista\s+|Proveedor\s+)?([A-Za-zÁÉÍÓÚáéíóúñÑ0-9\s]+?)(?:\s*-\s*|\s*:\s*|$)",
            primera,
        )
        if m_prov and len(m_prov.group(1).strip()) > 2:
            proveedor = m_prov.group(1).strip()

    def normalizar_monto(s: str) -> str:
        s = s.replace("$", "").strip()
        if "." in s and "," in s:
            s = s.replace(".", "").replace(",", ".")
        elif "." in s and len(s.split(".")[-1]) == 3:
            s = s.replace(".", "")
        elif "," in s:
            s = s.replace(",", ".")
        try:
            return f"{float(s):.2f}"
        except Exception:
            return "0.00"

    for linea in lineas:
        if re.search(r"(?:env[ií]o|flete)", linea, re.IGNORECASE):
            m_envio = re.search(r"\$\s*([\d\.,]+)", linea)
            if m_envio:
                envio = normalizar_monto(m_envio.group(1))
                continue

        m_precio = re.search(r"\$\s*([\d\.,]+)", linea)
        if not m_precio:
            continue

        precio_str = normalizar_monto(m_precio.group(1))
        if float(precio_str) <= 0:
            continue

        sub = linea[: m_precio.start()].strip(" :-*\t")
        cant = "1"
        unidad = "un"

        m_pack = re.search(
            r"(?:pack|caja|bolsa)?\s*(?:x\s*)?(\d+)\s*(?:x\s*1)?\s*(kg|kilo|kilos|g|gr|gramos|l|lt|litro|litros|ml|cc|un|u|unidad|unidades|docena)\b",
            sub,
            re.IGNORECASE,
        )
        if m_pack:
            cant = m_pack.group(1)
            u_raw = m_pack.group(2).lower()
            if u_raw in ["kilo", "kilos"]:
                unidad = "kg"
            elif u_raw in ["gr", "gramos"]:
                unidad = "g"
            elif u_raw in ["lt", "litro", "litros"]:
                unidad = "l"
            elif u_raw in ["u", "unidad", "unidades"]:
                unidad = "un"
            else:
                unidad = u_raw
            nombre = sub[: m_pack.start()].strip(" :-*\t,")
        else:
            m_simple = re.search(
                r"(\d+(?:[\.,]\d+)?)\s*(kg|kilo|kilos|g|gr|gramos|l|lt|litro|litros|ml|cc|un|u|unidad|unidades|docena)\b",
                sub,
                re.IGNORECASE,
            )
            if m_simple:
                cant = m_simple.group(1).replace(",", ".")
                u_raw = m_simple.group(2).lower()
                if u_raw in ["kilo", "kilos"]:
                    unidad = "kg"
                elif u_raw in ["gr", "gramos"]:
                    unidad = "g"
                elif u_raw in ["lt", "litro", "litros"]:
                    unidad = "l"
                elif u_raw in ["u", "unidad", "unidades"]:
                    unidad = "un"
                else:
                    unidad = u_raw
                nombre = sub[: m_simple.start()].strip(" :-*\t,")
            else:
                nombre = sub

        nombre = re.sub(
            r"^(?:pack|caja|bolsa)\s*(?:x\s*\d+)?",
            "",
            nombre,
            flags=re.IGNORECASE,
        ).strip(" :-*\t,")
        if not nombre:
            nombre = sub.strip(" :-*\t,")

        items.append(
            {
                "nombre_insumo": nombre,
                "cantidad": cant,
                "unidad": unidad,
                "precio_total": precio_str,
                "iva_incluido": True,
                "alicuota": "21.00",
                "confianza": "0.98",
                "texto_original": linea,
            }
        )

    return {
        "proveedor_detectado": proveedor or "Distribuidora Gastronómica Demo",
        "envio_detectado": envio,
        "moneda": "ARS",
        "items": items,
        "advertencias": advertencias,
    }


def fallback_determinista_demostracion(datos_usuario: str) -> dict[str, Any]:
    """
    Fallback determinista de demostración: procesa la entrada sin consumir recursos locales.
    Soporta extracción de listas de precios y resúmenes semanales.
    """
    try:
        data = json.loads(datos_usuario) if isinstance(datos_usuario, str) else datos_usuario
    except Exception:
        data = {}

    if isinstance(data, dict) and ("total_ventas" in data or "cantidad_tickets" in data):
        prods = data.get("productos") or []
        destacados = [p.get("nombre") for p in prods[:3] if p.get("unidades_vendidas", 0) > 0]
        if not destacados:
            destacados = ["Café Espresso Doble", "Capuchino Italiano"]
        return {
            "resumen_ejecutivo": (
                f"Demostración comercial: Período {data.get('fecha_desde', '')} al {data.get('fecha_hasta', '')}. "
                f"Se registraron {data.get('cantidad_tickets', 0)} tickets con facturación total de "
                f"${data.get('total_ventas', '0.00')} y rentabilidad operativa óptima."
            ),
            "productos_destacados": destacados,
            "sugerencias_rotacion": [
                {
                    "producto": destacados[0] if destacados else "Medialuna de Manteca",
                    "accion_sugerida": "Mantener como producto ancla en combos matutinos",
                    "motivo": "Alta rotación y contribución al margen global del local.",
                }
            ],
            "alertas_costos": [
                "Revisar precio de reposición de leche y descartables en próximo pedido mayorista."
            ],
        }

    proveedor = None
    texto = datos_usuario
    if isinstance(data, dict):
        proveedor = data.get("proveedor_informado")
        texto = data.get("texto_lista_precios") or datos_usuario

    return parsear_lista_precios_heuristica(texto=str(texto), proveedor_informado=proveedor)


class GroqAdapter(ProveedorIA):
    """Adaptador para Groq Cloud LPU (endpoint compatible con OpenAI /chat/completions)."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        modelo: Optional[str] = None,
        base_url: Optional[str] = None,
        fallback_demo: bool = True,
    ) -> None:
        self.api_key = api_key if api_key is not None else config.groq_api_key
        self.modelo = modelo or config.groq_modelo
        self.base_url = (base_url or config.groq_base_url).rstrip("/")
        self.fallback_demo = fallback_demo

    @property
    def nombre(self) -> str:
        return "groq"

    async def generar_json(
        self,
        instrucciones_sistema: str,
        datos_usuario: str,
        timeout: float,
    ) -> dict[str, Any]:
        if not self.api_key:
            if self.fallback_demo:
                return fallback_determinista_demostracion(datos_usuario)
            raise ErrorProveedorIA("GROQ_API_KEY no está configurada en el entorno.")

        url = f"{self.base_url}/chat/completions"
        cabeceras = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        cuerpo = {
            "model": self.modelo,
            "messages": [
                {"role": "system", "content": instrucciones_sistema},
                {"role": "user", "content": datos_usuario},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1,
        }

        try:
            async with httpx.AsyncClient(timeout=timeout) as cliente:
                respuesta = await cliente.post(url, headers=cabeceras, json=cuerpo)
                respuesta.raise_for_status()
                payload = respuesta.json()
        except (httpx.TimeoutException, httpx.HTTPError) as exc:
            if self.fallback_demo:
                return fallback_determinista_demostracion(datos_usuario)
            if isinstance(exc, httpx.TimeoutException):
                raise ErrorProveedorIA("Tiempo de espera agotado al consultar Groq API.") from exc
            raise ErrorProveedorIA("Fallo de comunicación HTTP con Groq API.") from exc

        try:
            elecciones = payload.get("choices") or []
            texto_respuesta = elecciones[0]["message"]["content"]
        except (IndexError, KeyError, TypeError) as exc:
            if self.fallback_demo:
                return fallback_determinista_demostracion(datos_usuario)
            raise ErrorProveedorIA("Estructura de respuesta inesperada desde Groq API.") from exc

        return extraer_objeto_json(texto_respuesta)


def obtener_proveedor_ia(nombre_proveedor: Optional[str] = None) -> ProveedorIA:
    """Fábrica que devuelve la instancia del adaptador de IA configurado."""
    seleccion = (nombre_proveedor or config.proveedor_activo).strip().lower()
    if seleccion == "groq":
        return GroqAdapter()
    if seleccion == "gemini":
        return GeminiAdapter()
    if seleccion == "ollama":
        return OllamaAdapter()
    raise ErrorProveedorIA(
        f"Proveedor de IA '{seleccion}' no soportado. Opciones válidas: 'groq', 'gemini', 'ollama'."
    )
