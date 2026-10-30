"""Punto de entrada de la aplicación FastAPI para ai-service."""
from fastapi import FastAPI
from app.excepciones import registrar_manejadores_excepciones
from app.routers.ia import router as router_ia
from app.routers.salud import router as router_salud


def crear_aplicacion() -> FastAPI:
    """Crea y configura la instancia de FastAPI con manejadores de error y routers."""
    app = FastAPI(
        title="Cafe Gestión — Servicio de Inteligencia Artificial (ai-service)",
        description=(
            "Microservicio FastAPI para extracción estructurada de listas de precios de proveedores "
            "(HU7) y generación de resúmenes semanales de rendimiento (HU13), con validación "
            "estricta en Pydantic v2, prompts versionados y patrón Adapter (Gemini API / Ollama)."
        ),
        version="1.0.0",
    )

    registrar_manejadores_excepciones(app)
    app.include_router(router_salud)
    app.include_router(router_ia)
    return app


app = crear_aplicacion()
