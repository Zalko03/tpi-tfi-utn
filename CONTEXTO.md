# CONTEXTO DEL PROYECTO: Sapori Stock (cafe-gestion)

## 1. Qué es el Proyecto
Sistema de gestión y POS para cafeterías de especialidad (TFI Programación IV, UTN FRRe). Incluye costeo dinámico de recetas, ventas rápidas, arqueo ciego de caja, extracción de listas de proveedores con IA y eventos en tiempo real.

## 2. Stack y Tecnologías
- **backend-django**: Python 3.11+, Django 5 + DRF, PostgreSQL 16, Gunicorn. Núcleo transaccional, emisor JWT RS256, RBAC con 30 permisos booleanos.
- **backend-node**: Node 20 LTS, Express 5, Mongoose, MongoDB 7, Socket.IO 4. Subdominio documental (historial, snapshots), sockets en vivo y orquestación IA.
- **ai-service**: Python 3.11+, FastAPI, Pydantic v2, Google Gemini API / Ollama. Extracción de listas de insumos y reportes semanales.
- **web**: PWA estática (HTML5, Vanilla JS ES Modules, CSS3 responsive), soporte lector USB HID, atajos (F2, F4) y tickets térmicos.
- **Infra**: Nginx 1.27 (reverse proxy en puerto 80), Docker Compose multi-stage, GitHub Actions CI/CD.

## 3. Estructura Principal
- `backend-django/`: Modelos transaccionales y lógica contable (`apps/`: usuarios, insumos, productos, ventas, caja).
- `backend-node/`: Servicios documentales y WebSockets (`src/`: controllers, models, routes, sockets, services).
- `ai-service/`: Microservicio de inferencia LLM (`app/`: api, services, schemas).
- `web/`: Interfaz PWA comercial (`index.html`, `css/`, `js/`, `sw.js`).
- `docs/` y `scripts/`: Manuales, bitácora (`docs/bitacora.md`), contratos (`CONNECTIONS.md`), `desplegar.sh`, `backup.sh`.

## 4. Cómo se Corre y Cómo se Testea
- **Docker (completo)**: `cp .env.example .env && docker compose up -d --build` (Web en `http://localhost:80`).
- **Local (dev)**: Django en `:8000` (`python manage.py runserver`), Node en `:3000` (`npm run dev`), AI en `:8001` (`uvicorn app.main:app`), Web en estático/5173.
- **Tests (600 pruebas en verde)**:
  - Django: `backend-django/.venv/bin/pytest backend-django/` (390 tests)
  - Node: `cd backend-node && npm test` (143 tests)
  - AI Service: `ai-service/.venv/bin/pytest ai-service/` (67 tests)
  - Linters: `.venv/bin/ruff check backend-django/ ai-service/` && `.venv/bin/ruff format --check backend-django/ ai-service/` | `cd backend-node && npm run lint`

## 5. Estado Actual
- **Rama actual**: `main` (PR #17 `feature/pos-comercial-sapori-stock` mergeado exitosamente).
- **Qué está hecho**:
  - Rediseño comercial integral "Sapori Stock" (POS táctil/escáner, arqueo ciego estricto, compras y carga de insumos, costeo dinámico de recetas, reportes y personal).
  - Circuito de aprobación y previsualización para importaciones de insumos vía IA (Gemini/Ollama) y CSV con confirmación explícita y auditoría.
  - Idempotencia de ventas garantizada de punta a punta con `id_operacion` único persistido en backend Django y base de datos.
  - Precios calculados 100% en backend desde base de datos, blindados contra manipulación en cliente.
  - Arqueo ciego estricto: montos reales ocultos para cajeros, notificación y cálculo en backend Django con emisión de eventos Socket.IO para actualización en vivo.
  - Sincronización offline robusta en PWA con exclusión mutua vía `navigator.locks`, reintentos controlados y cola visible de transacciones rechazadas.
  - Normas de ingeniería y gobernanza (`NORMAS.md`) vigentes.
  - 600 pruebas automatizadas en verde entre las 3 suites (`390` Django + `143` Node + `67` AI Service).
- **Qué falta / Futuras etapas**: Trabajos futuros del informe (descuento físico automático de stock por receta y facturación electrónica AFIP/ARCA).
