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
- **Tests (563 pruebas en verde)**:
  - Django: `cd backend-django && pytest` (370 tests)
  - Node: `cd backend-node && npm test` (130 tests)
  - AI Service: `cd ai-service && pytest` (63 tests)
  - Linters: `ruff check backend-django/ ai-service/` | `cd backend-node && npm run lint`

## 5. Estado Actual
- **Rama actual**: `feature/pos-comercial-sapori-stock`.
- **Qué está hecho**: TP 0 al 4 completados y mergeados en `main`. Documentación IEEE 830 e informe final TFI listos. Rediseño frontend completo nivel producto comercial (POS, caja, compras IA, ingeniería de recetas, finanzas, personal) sin jerga técnica.
- **Qué falta**: Merge de la rama actual a `main`. Trabajos futuros del informe (descuento físico automático de stock por receta y facturación electrónica).
