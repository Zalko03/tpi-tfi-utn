# cafe-gestion

Sistema de gestión integral para cafetería de especialidad: costeo dinámico de recetas, arqueo y control de caja/ventas, importación de listas de proveedores con inteligencia artificial y tablero reactivo en tiempo real.
Trabajo Final Integrador — Programación IV, UTN FRRe.

---

## Estado del Proyecto

* **TP 0:** Fundaciones del monorepo, convenciones y arquitectura base. (Completado)
* **TP 1:** Núcleo de datos transaccional (Django + PostgreSQL) y documental (Node + MongoDB). (Completado)
* **TP 2:** Autenticación asimétrica con JWT RS256, roles y permisos granulares, arqueo ciego y endurecimiento perimetral. (Completado)
* **TP 3:** Microservicio de IA (`ai-service` FastAPI + Gemini/Ollama), eventos en tiempo real con Socket.IO y cliente PWA en LAN. (Completado)
* **TP 4:** Contenedorización multi-stage, Docker Compose, CI/CD con GitHub Actions, observabilidad (`X-Request-ID`), logging JSON estructurado y scripts de respaldo. (Completado)

---

## Arquitectura de Servicios

| Servicio | Tecnología | Rol Principal | Puerto Local |
|---|---|---|---|
| `web` (PWA) | HTML5, CSS3, JS ES Modules, Service Worker | Interfaz de caja rápida con lector HID, tablero en vivo e importación de precios | 80 (vía Nginx) |
| `web-proxy` | Nginx 1.27 Alpine (no-root) | Reverse proxy perimetral, compresión Gzip y entrega de la PWA estática | 80 |
| `backend-django` | Django 5 + DRF + PostgreSQL 16 + Gunicorn 23 | Núcleo contable y transaccional: insumos, recetas, compras, ventas, caja y emisor de JWT RS256 | 8000 (interno) |
| `backend-node` | Express 5 + Mongoose + MongoDB 7 + Socket.IO 4 | Subdominio documental (`historial_precios`, `snapshots_costeo`), salas de WebSocket y orquestación de IA | 3000 (interno) |
| `ai-service` | FastAPI + Pydantic v2 + Gemini API / Ollama | Extracción inteligente de insumos y precios de listas desestructuradas y resumen semanal | 8001 (interno) |
| `postgres` | PostgreSQL 16 Alpine | Base de datos relacional transaccional (volumen `postgres_data`) | 5432 (interno) |
| `mongodb` | MongoDB 7.0 | Base de datos documental para auditoría e historial (volumen `mongo_data`) | 27017 (interno) |

---

## Puesta en Marcha con Docker Compose (Un solo comando)

Modalidad oficial para producción en la PC local del comercio (respaldada por la sección 3.5 de la Guía y ADR 0003):

### 1. Clonar el repositorio y preparar variables de entorno
```bash
git clone https://github.com/tu-usuario/tpi-tfi-utn.git
cd tpi-tfi-utn
cp .env.example .env
```
*(Opcional: configurar `GEMINI_API_KEY` en `.env` si se dispone de conexión para inferencia con IA).*

### 2. Ejecutar el script automatizado de despliegue
```bash
./scripts/desplegar.sh
```
O directamente con Docker Compose:
```bash
docker compose up -d --build
```

### 3. Acceder al sistema
* **PWA / Tablero y Caja:** [http://localhost](http://localhost) (o desde la red Wi-Fi del comercio con la IP local).
* **Diagnóstico de salud general:** [http://localhost/healthz](http://localhost/healthz)
* **Diagnóstico profundo Django:** [http://localhost/api/health/profundo/](http://localhost/api/health/profundo/)
* **Diagnóstico profundo Node:** [http://localhost/health/profundo/](http://localhost/health/profundo/)

---

## Puesta en Marcha para Desarrollo Local (Sin Docker)

### 1. Variables de entorno locales
Copiar `.env.example` a `.env` y activar `USE_SQLITE=True` para desarrollo sin depender del servicio PostgreSQL del host:
```bash
cp .env.example .env
echo "USE_SQLITE=True" >> .env
```

### 2. backend-django
```bash
cd backend-django
python3 -m venv .venv
source .venv/bin/activate # En Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

### 3. backend-node
```bash
cd backend-node
npm ci
npm run dev
```

### 4. ai-service
```bash
cd ai-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8001 --reload
```

---

## Suites de Pruebas y Linters

El proyecto cuenta con **563 tests automatizados** distribuidos entre pruebas unitarias puras y de integración, ejecutadas en el pipeline de GitHub Actions (`.github/workflows/ci.yml`):

* **backend-django:** 370 tests pasando (pytest + pytest-django)
  ```bash
  backend-django/.venv/bin/pytest backend-django/
  ```
* **backend-node:** 130 tests pasando (Jest con soporte ES Modules)
  ```bash
  cd backend-node && npm test
  ```
* **ai-service:** 63 tests pasando (pytest + anyio)
  ```bash
  ai-service/.venv/bin/pytest ai-service/
  ```
* **Verificación de Linters y Estilo:**
  * Python (Ruff): `.venv/bin/ruff check backend-django/ ai-service/`
  * Node.js (ESLint): `cd backend-node && npm run lint`

---

## Operación y Mantenimiento

* **Generar respaldo (PostgreSQL + MongoDB):**
  ```bash
  ./scripts/backup.sh
  ```
* **Restaurar respaldo:**
  ```bash
  ./scripts/restore.sh backups/backup_cafe_gestion_YYYYMMDD_HHMMSS.tar.gz
  ```
* **Manual de Despliegue y Plan de Rollback:** Consultar `docs/despliegue.md`.
