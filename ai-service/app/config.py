"""Configuración centralizada de variables de entorno para ai-service."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Carga el archivo .env de la raíz del monorepo si existe
RUTA_RAIZ_MONOREPO = Path(__file__).resolve().parent.parent.parent
load_dotenv(RUTA_RAIZ_MONOREPO / ".env")


class ConfiguracionIA:
    """Parámetros de configuración leídos en tiempo de ejecución desde el entorno."""

    @property
    def proveedor_activo(self) -> str:
        return os.getenv("AI_PROVIDER", "gemini").strip().lower()

    @property
    def gemini_api_key(self) -> str:
        return os.getenv("GEMINI_API_KEY", "").strip()

    @property
    def gemini_modelo(self) -> str:
        return os.getenv("GEMINI_MODEL", "gemini-1.5-flash").strip()

    @property
    def gemini_base_url(self) -> str:
        return os.getenv(
            "GEMINI_BASE_URL",
            "https://generativelanguage.googleapis.com/v1beta",
        ).strip().rstrip("/")

    @property
    def ollama_base_url(self) -> str:
        return os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").strip().rstrip("/")

    @property
    def ollama_modelo(self) -> str:
        return os.getenv("OLLAMA_MODEL", "llama3.2:1b").strip()

    @property
    def timeout_segundos(self) -> float:
        valor = os.getenv("AI_TIMEOUT_SECONDS", "10.0")
        try:
            return max(0.1, float(valor))
        except ValueError:
            return 10.0

    @property
    def max_reintentos(self) -> int:
        valor = os.getenv("AI_MAX_RETRIES", "2")
        try:
            return max(0, int(valor))
        except ValueError:
            return 2

    @property
    def version_prompt_activa(self) -> str:
        return os.getenv("AI_PROMPT_VERSION", "v1").strip()


config = ConfiguracionIA()
