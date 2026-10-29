"""Servicio de carga segura de prompts versionados desde disco."""
import re
from pathlib import Path

DIRECTORIO_PROMPTS = Path(__file__).resolve().parent.parent / "prompts"
PATRON_VERSION = re.compile(r"^v\d+$")
PATRON_NOMBRE = re.compile(r"^[a-z0-9_]+$")


def cargar_prompt(nombre_prompt: str, version: str = "v1") -> str:
    """
    Lee y devuelve el texto de instrucciones del sistema correspondiente al prompt y versión.
    Valida estrictamente el nombre y la versión para evitar path traversal.
    """
    version_limpia = (version or "").strip()
    nombre_limpio = (nombre_prompt or "").strip()

    if not PATRON_VERSION.match(version_limpia):
        raise ValueError(f"Versión de prompt inválida: '{version}'. Formato esperado: 'v1', 'v2', etc.")

    if not PATRON_NOMBRE.match(nombre_limpio):
        raise ValueError(f"Nombre de prompt inválido: '{nombre_prompt}'.")

    ruta_archivo = DIRECTORIO_PROMPTS / version_limpia / f"{nombre_limpio}.txt"
    if not ruta_archivo.is_file():
        raise FileNotFoundError(
            f"No se encontró el prompt '{nombre_limpio}' para la versión '{version_limpia}'."
        )

    contenido = ruta_archivo.read_text(encoding="utf-8").strip()
    if not contenido:
        raise ValueError(f"El archivo de prompt '{ruta_archivo.name}' está vacío.")

    return contenido
