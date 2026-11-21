# `ai-service` — Microservicio de Inteligencia Artificial

Microservicio dedicado de inferencia LLM del sistema **Sapori Stock** (`cafe-gestion`), construido con **Python 3.13**, **FastAPI**, **Pydantic v2** y **httpx**.

---

## Responsabilidades

1. **Extracción estructurada de listas de precios (`POST /v1/extraer-precios`, HU7):**
   - Recibe texto desestructurado de listas de proveedores (WhatsApp, CSV, PDF extraído, Word) o imágenes codificadas en base64 (`JPG`, `PNG`, `WEBP`).
   - Normaliza proveedor detectado, costo de envío, moneda e ítems (`nombre_insumo`, `cantidad`, `unidad`, `precio_total`, `iva_incluido`, `alicuota`, `confianza`) usando `Decimal` en las validaciones de Pydantic v2.
2. **Resumen ejecutivo semanal (`POST /v1/resumen-semanal`, HU13):**
   - Analiza métricas agregadas del período (ventas, ganancia bruta, tickets, productos destacados y alertas de insumos) y retorna resumen ejecutivo, sugerencias de rotación y alertas de costos.
3. **Desacoplamiento mediante Patrón Adapter (ADR-0002):**
   - Interfaz `ProveedorIA` con implementaciones intercambiables por variable de entorno `AI_PROVIDER`:
     - `GroqAdapter` (`groq`, predeterminado en `config.py` / `docker-compose.yml`, incluyendo visión con `GROQ_VISION_MODEL`).
     - `GeminiAdapter` (`gemini`, API REST HTTPS con cabecera `x-goog-api-key`).
     - `OllamaAdapter` (`ollama`, soporte local opcional para desarrollo).
4. **Seguridad de prompts y degradación elegante:**
   - Prompts versionados fuera del código (`app/prompts/v1/*.txt`), enviando instrucciones en canal de sistema y entradas del usuario exclusivamente en canal de usuario (prevención de *prompt injection*).
   - Si falta API key, el proveedor no soporta visión, falla la red, vence el timeout (`AI_TIMEOUT_SECONDS`) o la salida no valida contra Pydantic v2, responde HTTP `200` con `contingencia: true` sin inventar datos ni bloquear el resto del sistema.
5. **Observabilidad y contrato único:** correlación `X-Request-ID`, logs JSON sanitizados, formato único de error (`{ "mensaje", "detalles" }`), documentación OpenAPI automática en `/docs` y endpoints `/health` y `/health/profundo`.

---

## Árbol de Carpetas

```text
ai-service/
├── .dockerignore
├── .env.example                      # Plantilla de variables específicas del servicio
├── Dockerfile                        # Imagen multietapa (python:3.13-slim, usuario appuser no-root)
├── pytest.ini                        # pythonpath = ., testpaths = app/tests, asyncio_mode = auto
├── requirements.txt                  # fastapi, uvicorn, pydantic, httpx, python-dotenv, pytest, pytest-asyncio
└── app/
    ├── __init__.py
    ├── config.py                     # Lectura de .env raíz (AI_PROVIDER, claves, modelos, timeouts, reintentos)
    ├── excepciones.py                # Manejadores de error en formato único { mensaje, detalles }
    ├── main.py                       # Fábrica crear_aplicacion() y montaje de routers/middlewares
    ├── middlewares/
    │   └── correlation.py            # CorrelationIdMiddleware (X-Request-ID)
    ├── prompts/
    │   └── v1/
    │       ├── extraer_precios.txt   # Prompt versionado v1 para extracción de listas
    │       └── resumen_semanal.txt   # Prompt versionado v1 para consultoría semanal
    ├── routers/
    │   ├── __init__.py
    │   ├── ia.py                     # POST /v1/extraer-precios y POST /v1/resumen-semanal
    │   └── salud.py                  # GET /health y GET /health/profundo
    ├── schemas/
    │   ├── __init__.py
    │   ├── comun.py                  # RespuestaError, RespuestaSalud
    │   ├── extraccion.py             # Solicitud/Respuesta y SalidaIAExtraccionPrecios (Pydantic v2)
    │   └── resumen.py                # Solicitud/Respuesta y SalidaIAResumenSemanal (Pydantic v2)
    ├── services/
    │   ├── __init__.py
    │   ├── extraccion.py             # Orquestación de extracción, parseo JSON y contingencia
    │   ├── prompts.py                # Cargador de prompts versionados
    │   ├── proveedor_ia.py           # Interfaz ProveedorIA + GroqAdapter, GeminiAdapter, OllamaAdapter
    │   └── resumen.py                # Orquestación de resumen semanal y contingencia
    ├── utils/
    │   └── logger.py                 # Logging estructurado JSON sin exponer secretos
    └── tests/
        ├── __init__.py
        ├── api/                      # 14 tests de API (/v1/*, /health, observabilidad)
        │   ├── test_api_endpoints.py
        │   └── test_api_observabilidad.py
        └── unit/                     # 73 tests unitarios (schemas, prompts, adapters, logging, correlation)
            ├── test_unit_adapters_y_servicios.py
            ├── test_unit_correlation_id.py
            ├── test_unit_json_logging.py
            ├── test_unit_prompts.py
            └── test_unit_schemas.py
```

---

## Comandos

### Entorno local (desarrollo)

```bash
cd ai-service
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Levantar servidor Uvicorn en :8001
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

- Documentación interactiva Swagger UI: `http://localhost:8001/docs`
- Esquema OpenAPI: `http://localhost:8001/openapi.json`
- Salud profunda: `http://localhost:8001/health/profundo`

### Pruebas y linter

```bash
cd ai-service

# Suite completa (87 tests: 73 unitarios + 14 de API)
.venv/bin/python -m pytest -q

# Linter y formato desde la raíz del repo
cd ..
.venv/bin/ruff check ai-service/
.venv/bin/ruff format --check ai-service/
```

### Contenedor Docker

```bash
docker compose up -d --build ai-service
```
