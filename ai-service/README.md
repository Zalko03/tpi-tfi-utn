# ai-service — Microservicio de Inteligencia Artificial y Consultoría Operativa (Sapori Stock)

Microservicio independiente desarrollado con **FastAPI**, **Pydantic v2** y **Python 3.13**. Aísla toda la comunicación con modelos de lenguaje (LLMs) detrás del **Patrón Adapter** y valida estrictamente cada salida con esquemas tipados antes de que los datos ingresen al flujo contable del sistema.

---

## 1. Responsabilidades Principales

- **Extracción Multimodal de Listas de Precios (`POST /v1/extraer-precios`):**
  - Procesa texto desestructurado (mensajes de WhatsApp, contenido extraído de PDF/Excel/Word) o **fotografías de listas y facturas de proveedores** (visión multimodal en base64).
  - Normaliza unidades de medida dispares (`kilo -> kg`, `litro -> l`, `docena/unidad -> un`) y valida cantidades y precios mediante `Decimal` en Pydantic v2.
- **Consultoría Operativa y Auditoría con IA:**
  - `POST /v1/resumen-semanal`: Generación de informe ejecutivo semanal combinando indicadores de ventas, márgenes y variaciones de costos.
  - `POST /v1/analizar-stock`: Diagnóstico de insumos en nivel crítico y recomendaciones de reposición.
  - `POST /v1/auditar-caja`: Evaluación analítica de cierres de turno y desvíos de arqueo ciego.
- **Patrón Adapter e Independencia de Proveedor (ADR-0002):**
  - Soporta conmutación transparente por variables de entorno (`AI_PROVIDER`) entre:
    - **`GroqAdapter` (`groq`):** Inferencia LPU Cloud ultrarrápida (Llama 3.3 70B / Llama 4 Scout Vision) con 0 MB de consumo de RAM local.
    - **`GeminiAdapter` (`gemini`):** Google Gemini (`gemini-2.5-flash`) con soporte nativo multimodal y `response_schema`.
    - **`OllamaAdapter` (`ollama`):** Inferencia 100% local para entornos desconectados con hardware dedicado.
- **Degradación Elegante y Fallback Determinista:**
  - Si el proveedor externo excede el timeout, agota cuota o devuelve un JSON que no supera la validación de Pydantic v2, el servicio activa el modo de contingencia determinista sin derribar la operación del comercio.

---

## 2. Estructura del Módulo

```text
ai-service/
├── Dockerfile
├── pytest.ini
├── requirements.txt
└── app/
    ├── main.py              # Instancia FastAPI, middleware X-Request-ID y manejador único de errores
    ├── config.py            # Configuración centralizada desde variables de entorno
    ├── adapters/
    │   ├── base.py          # Interfaz abstracta AIProviderAdapter y excepción AIProviderError
    │   ├── factory.py       # Fábrica que instancia el adaptador según AI_PROVIDER
    │   ├── groq_adapter.py  # Adaptador para Groq Cloud (texto y visión)
    │   ├── gemini_adapter.py# Adaptador para Google Gemini API (texto y visión)
    │   └── ollama_adapter.py# Adaptador para servidor local Ollama
    ├── prompts/
    │   └── v1/              # Prompts de sistema versionados y separados de los datos del usuario
    ├── routers/             # Endpoints (/v1/extraer-precios, /v1/resumen-semanal, /v1/analizar-stock, /v1/auditar-caja, /health)
    ├── schemas/             # Contratos Pydantic v2 con validación estricta de tipos Decimal y unidades
    ├── services/            # Orquestación de extracción, sanitización anti-Prompt Injection y fallback determinista
    └── tests/               # 67+ pruebas unitarias y de integración con mocks deterministas
```

Para más información sobre las decisiones de diseño de este servicio, consultar [docs/adr/0002-adaptador-proveedor-ia.md](../docs/adr/0002-adaptador-proveedor-ia.md) y [docs/ESTRUCTURA_Y_MANUAL_MODULOS.md](../docs/ESTRUCTURA_Y_MANUAL_MODULOS.md).

---

## 3. Instalación y Ejecución Local

### Requisitos previos
- Python 3.11+ (recomendado 3.13)
- Clave de API configurada en el archivo `.env` de la raíz (`GROQ_API_KEY` o `GEMINI_API_KEY`)

### Pasos de configuración
```bash
cd ai-service
python -m venv .venv
# En Linux/macOS:
source .venv/bin/activate
# En Windows (PowerShell):
.\.venv\Scripts\Activate.ps1

pip install -r requirements.txt
```

### Levantar el servidor
```bash
uvicorn app.main:app --port 8001 --reload
```

---

## 4. Pruebas Automatizadas, Cobertura y Calidad de Código

La suite cuenta con **67 pruebas automatizadas** que verifican los adaptadores, la validación de esquemas Pydantic v2 ante respuestas malformadas o alucinaciones, el manejo de imágenes y los circuitos de contingencia.

```bash
# Ejecutar toda la suite de tests
pytest

# Ejecutar tests con reporte de cobertura de código (coverage)
pytest --cov=app --cov-report=term-missing

# Verificar estilo y formato con Ruff
ruff check .
ruff format --check .
```
