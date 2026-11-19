# cafe-gestion (Sapori Stock)

Sistema de gestión comercial y contable para cafetería de especialidad y panadería artesanal: costeo dinámico de recetas por unidad base (`g`, `ml`, `un`), prorrateo de envíos en compras, punto de venta (POS) con lectura de códigos de barras, arqueo ciego de caja, cola de ventas offline en `localStorage`, importación híbrida de listas de precios con IA (Groq LPU / Gemini / Ollama) y contingencia CSV, consultor IA de rendimiento semanal, reportes por fecha y Carta Digital pública por QR con mapa embebido de OpenStreetMap.

Trabajo Final Integrador (TFI) — Programación IV, UTN FRRe.

---

## Arquitectura de Servicios

| Servicio | Tecnología | Rol Principal | Puerto |
|---|---|---|---|
| `web` / `web-proxy` | HTML5, CSS3, JS ES Modules, Service Worker + Nginx 1.27 Alpine | PWA comercial (POS, recetas, compras, caja, reportes), Carta Digital pública (`carta.html`) con QR SVG ISO/IEC 18004 y mapa OpenStreetMap, y reverse proxy en Docker | `80` (Docker) / servido en `/app/` por Node en modo local |
| `backend-django` | Django 5 + DRF + PostgreSQL 16 (SQLite opcional en dev) + Gunicorn 23 | Núcleo transaccional: insumos, compras, recetas, ventas, turnos/movimientos de caja, roles/permisos, emisor JWT RS256 y `GET /api/carta-publica/` | `8000` |
| `backend-node` | Express 5 + Mongoose + MongoDB 7 + Socket.IO 4 | Subdominio documental (`historial_precios`, `snapshots_costeo`, `importaciones_ia`), salas Socket.IO autenticadas y orquestación hacia `ai-service` y Django | `3000` |
| `ai-service` | FastAPI + Pydantic v2 + Groq / Gemini / Ollama | `POST /v1/extraer-precios` (texto/foto) y `POST /v1/resumen-semanal`, con validación tipada y respuesta de contingencia | `8001` |
| `postgres` | PostgreSQL 16 Alpine | Base relacional ACID (volumen `postgres_data`) | `5432` (interno) |
| `mongodb` | MongoDB 7.0 (`--wiredTigerCacheSizeGB 0.25`) | Base documental para historial, snapshots e importaciones IA (volumen `mongo_data`) | `27017` (interno) |

---

## Requisitos Previos

- **Con Docker (recomendado para levantar toda la pila):** Docker Engine 24+ y Docker Compose v2.20+, OpenSSL y Git.
- **Sin Docker (modo desarrollo local):** Python 3.11+ (3.13 en CI), Node.js 20 LTS, OpenSSL, MongoDB 7 (para `backend-node`) y PostgreSQL 16 (o `USE_SQLITE=True` para desarrollo local con SQLite en Django).

---

## 1. Puesta en Marcha con Docker Compose

Modalidad oficial para PC local o despliegue completo (ver [docs/despliegue.md](docs/despliegue.md)):

### Paso 1 — Clonar e inicializar variables de entorno
```bash
git clone <URL_DEL_REPOSITORIO>
cd tpi-tfi-utn
cp .env.example .env
```
Editá `.env` con tus claves locales (por ejemplo `DJANGO_SECRET_KEY`, `POSTGRES_PASSWORD`, y `GROQ_API_KEY` o `GEMINI_API_KEY` si vas a usar IA en la nube; sin API key el sistema opera en modo contingencia).

### Paso 2 — Generar el par de claves JWT RS256
`backend-django` firma los tokens con su clave privada y `backend-node` los verifica con la clave pública:
```bash
mkdir -p backend-django/config/keys backend-node/config/keys
openssl genrsa -out backend-django/config/keys/private.pem 2048
openssl rsa -in backend-django/config/keys/private.pem -pubout -out backend-django/config/keys/public.pem
cp backend-django/config/keys/public.pem backend-node/config/keys/public.pem
```

### Paso 3 — Construir y levantar los servicios
```bash
./scripts/desplegar.sh
```
O directamente con Docker Compose:
```bash
docker compose up -d --build
```

### Paso 4 — URLs de acceso (Docker)
- **PWA / POS:** [http://localhost](http://localhost)
- **Carta Digital Pública (QR):** [http://localhost/carta.html](http://localhost/carta.html) (también en `/app/carta.html`)
- **Salud Nginx:** [http://localhost/healthz](http://localhost/healthz)
- **Salud Django:** [http://localhost/api/health/](http://localhost/api/health/) y [http://localhost/api/health/profundo/](http://localhost/api/health/profundo/)
- **Salud Node:** [http://localhost/health/](http://localhost/health/) y [http://localhost/health/profundo/](http://localhost/health/profundo/)

Para cargar datos de demo dentro del contenedor de Django (solo en entorno de prueba/demo):
```bash
docker compose exec -e SEED_DEMO_PASSWORD="<ver .env.example>" backend-django \
  python manage.py seed_demo --video --force-production
```

---

## 2. Puesta en Marcha en Modo Local (Sin Docker)

### Paso 1 — Preparar `.env` y claves JWT RS256
```bash
cp .env.example .env
```
Si querés correr Django sin PostgreSQL local, activá `USE_SQLITE=True` en `.env` (o pasalo por variable de entorno). Asegurate también de tener MongoDB corriendo en `MONGO_URI` (`mongodb://localhost:27017/cafe_gestion`) y generá las claves RS256:
```bash
mkdir -p backend-django/config/keys backend-node/config/keys
openssl genrsa -out backend-django/config/keys/private.pem 2048
openssl rsa -in backend-django/config/keys/private.pem -pubout -out backend-django/config/keys/public.pem
cp backend-django/config/keys/public.pem backend-node/config/keys/public.pem
```

### Paso 2 — Terminal 1: `backend-django` (`:8000`)
```bash
cd backend-django
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py migrate
.venv/bin/python manage.py runserver 8000
```

### Paso 3 — Terminal 2: `backend-node` (`:3000`)
```bash
cd backend-node
npm ci
npm run dev
```

### Paso 4 — Terminal 3: `ai-service` (`:8001`)
```bash
cd ai-service
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### Paso 5 — Accesos locales
- **Aplicación comercial (PWA):** [http://localhost:3000/app/](http://localhost:3000/app/)
- **Carta Digital Pública (QR):** [http://localhost:3000/carta.html](http://localhost:3000/carta.html) (también [http://localhost:3000/app/carta.html](http://localhost:3000/app/carta.html))
- **Configuración del mapa en carta pública:** editar `window.__SAPORI_CONFIG__.ubicacionLocal` en `web/js/config.js` (si `latitud` o `longitud` quedan en `null`, la sección de mapa se oculta).

---

## 3. Variables de Entorno (`.env.example`)

El repositorio incluye la plantilla [`.env.example`](.env.example) (y [`ai-service/.env.example`](ai-service/.env.example)). Nunca subas `.env` ni claves reales a Git.

| Grupo | Variables en `.env.example` | Propósito (valores de referencia sin secretos reales) |
|---|---|---|
| **Django** | `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_LOG_LEVEL` | Clave secreta de Django, modo debug (`True` en local), hosts permitidos y nivel de log (`INFO`) |
| **Base de datos Django** | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`, `USE_SQLITE` *(opcional)* | Conexión a PostgreSQL (`cafe_gestion` / `cafe_user` / `localhost:5432`) o `USE_SQLITE=True` para desarrollo local sin Postgres |
| **JWT RS256** | `DJANGO_JWT_PRIVATE_KEY_PATH`, `DJANGO_JWT_PUBLIC_KEY_PATH`, `DJANGO_JWT_PRIVATE_KEY` *(opc.)*, `DJANGO_JWT_PUBLIC_KEY` *(opc.)*, `DJANGO_ACCESS_TOKEN_MINUTES`, `DJANGO_REFRESH_TOKEN_DAYS`, `JWT_PUBLIC_KEY_PATH`, `JWT_PUBLIC_KEY` *(opc.)* | Rutas o contenido PEM para firma RS256 en Django (`config/keys/private.pem` y `public.pem`), validación en Node y vigencia (`15` min / `1` día) |
| **CORS y Throttling** | `CORS_ALLOWED_ORIGINS`, `CLIENT_ORIGIN` *(opc.)*, `DJANGO_THROTTLE_LOGIN`, `DJANGO_THROTTLE_RECALCULAR`, `DJANGO_THROTTLE_CARTA_PUBLICA`, `DJANGO_THROTTLE_ANON`, `DJANGO_THROTTLE_USER` | Lista blanca de orígenes CORS (sin `*`) y límites de tasa (`10/minute` login, `20/minute` recálculo, `60/minute` carta pública, `200/day` anónimos, `10000/day` autenticados) |
| **Node / Express** | `NODE_ENV`, `NODE_PORT`, `NODE_TRUST_PROXY_SALTOS` *(opc.)*, `MONGO_URI`, `DJANGO_BASE_URL`, `AI_SERVICE_URL` | Entorno Node (`development` en `:3000`), saltos de proxy confiables, URI de MongoDB (`mongodb://localhost:27017/cafe_gestion`), URL interna de Django (`http://localhost:8000/api`) y de `ai-service` (`http://localhost:8001`) |
| **AI Service** | `AI_SERVICE_PORT`, `AI_PROVIDER`, `AI_PROMPT_VERSION`, `AI_TIMEOUT_SECONDS`, `AI_MAX_RETRIES`, `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_VISION_MODEL`, `GROQ_BASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Puerto (`8001`), adaptador activo (`groq`, `gemini` u `ollama`), prompt (`v1`), timeouts/reintentos (`25.0` s / `2`) y credenciales/modelos de cada proveedor |
| **Docker** | `COMPOSE_PROJECT_NAME` *(opc.)* | Nombre opcional del proyecto en Docker Compose (`cafe-gestion`) |
| **Demo (`seed_demo`)** | `SEED_DEMO_PASSWORD` *(entorno al ejecutar el comando)*, `SEED_DEMO_ALLOW_PRODUCTION` *(opc.)* | Contraseña inicial para crear los usuarios demo con `manage.py seed_demo` (ver `.env.example` / entorno local; nunca se hardcodea en el código) |

---

## 4. Datos de Demostración (T7) y Usuarios Demo

El comando `seed_demo` (`backend-django/apps/insumos/management/commands/seed_demo.py`) está bloqueado si `DJANGO_DEBUG=False` (salvo `--force-production`) y es **idempotente**: no borra datos ni sobrescribe contraseñas de usuarios existentes.

Si usás SQLite local, conviene respaldar la base antes de poblarla:
```bash
mkdir -p backups
cp backend-django/db.sqlite3 backups/db.sqlite3.antes-seed
```

### Modo estándar (catálogo base + turno abierto del día)
```bash
cd backend-django
DJANGO_DEBUG=True SEED_DEMO_PASSWORD="<ver .env.example>" .venv/bin/python manage.py seed_demo
```

### Modo `--video` (escenario completo de demostración y reportes — T7)
Genera o actualiza de forma idempotente:
- 3 usuarios demo por rol, 5 proveedores, 12 insumos y 11 productos activos con receta completa (incluyendo `Brownie Intenso Chocolate 70%` con margen crítico `< 30 %`).
- 2 turnos cerrados históricos (uno con arqueo exacto y otro con diferencia `-$200,00`), 1 turno abierto actual con movimientos de caja chica, ventas distribuidas en los últimos 14 días y 1 venta anulada (`ANULADA`).
- Si `cajero_demo` tiene un turno `ABIERTO` de un día anterior, frena con `CommandError` para evitar superponer turnos entre jornadas.

```bash
cd backend-django
DJANGO_DEBUG=True SEED_DEMO_PASSWORD="<ver .env.example>" .venv/bin/python manage.py seed_demo --video
```

### Usuarios Demo

| Usuario | Rol plantilla | Contraseña | Alcance en la demo |
|---|---|---|---|
| `duenio_demo` | `DUENIO` | Ver `.env.example` *(definida vía `SEED_DEMO_PASSWORD`)* | Acceso completo: costeo, importación IA, reportes financieros, equipo/permisos y auditoría |
| `encargado_demo` | `ENCARGADO` | Ver `.env.example` *(definida vía `SEED_DEMO_PASSWORD`)* | Insumos, compras, recetas, QR de carta pública, turnos/movimientos de caja y anulación |
| `cajero_demo` | `CAJERO` | Ver `.env.example` *(definida vía `SEED_DEMO_PASSWORD`)* | POS, ventas y apertura/cierre de su propio turno con arqueo ciego estricto |

---

## 5. Suites de Pruebas y Linters

Resultados verificados en la rama actual (`docs/matriz-hu-readme`):

| Componente | Comando de verificación | Resultado verificado |
|---|---|---|
| **backend-django** | `cd backend-django && .venv/bin/python -m pytest -q` | **465 tests pasando** |
| **backend-node** | `cd backend-node && npm test` | **25 suites, 223 tests pasando** |
| **ai-service** | `cd ai-service && .venv/bin/python -m pytest -q` | **87 tests pasando** |
| **Total automatizado** | — | **775 tests en verde** |
| **Lint Python (Ruff)** | `.venv/bin/ruff check backend-django/ ai-service/` y `.venv/bin/ruff format --check backend-django/ ai-service/` | Sin errores (`All checks passed!`) |
| **Lint Node (ESLint)** | `cd backend-node && npm run lint` | `0` errores |
| **Sintaxis Web (`web/`)** | `node --check web/js/app.js && node --check web/js/logicaPwa.js && node --check web/js/carta.js && node --check web/js/config.js && node --check web/sw.js` | Exit `0` en los 5 archivos |

---

## 6. Operación, Respaldo y Documentación

- **Generar respaldo (Docker PostgreSQL + MongoDB):** `./scripts/backup.sh`
- **Restaurar respaldo:** `./scripts/restore.sh backups/backup_cafe_gestion_YYYYMMDD_HHMMSS.tar.gz`
- **Matriz de Historias de Usuario verificada en código:** [docs/MATRIZ_HU.md](docs/MATRIZ_HU.md)
- **Propuesta y alcance MoSCoW:** [docs/PROPUESTA.md](docs/PROPUESTA.md)
- **Plan de implementación y reglas de negocio:** [docs/PLAN_IMPLEMENTACION.md](docs/PLAN_IMPLEMENTACION.md)
- **Despliegue y observabilidad:** [docs/despliegue.md](docs/despliegue.md)
- **Contrato único de errores de API:** [docs/api-errores.md](docs/api-errores.md)
- **Seguridad, roles y permisos:** [docs/seguridad.md](docs/seguridad.md)
- **Conexiones entre servicios:** [docs/CONNECTIONS.md](docs/CONNECTIONS.md)
- **Presentación, evidencias y guion de video:** [docs/PRESENTACION_Y_EVIDENCIAS.md](docs/PRESENTACION_Y_EVIDENCIAS.md)
- **Bitácora de sesiones:** [docs/bitacora.md](docs/bitacora.md)

### Declaración de uso de IA en el desarrollo
Conforme a [docs/PLAN_IMPLEMENTACION.md](docs/PLAN_IMPLEMENTACION.md) (§0.4) y [docs/PROPUESTA.md](docs/PROPUESTA.md) (§5), durante la construcción del proyecto se utilizó asistencia de inteligencia artificial (Antigravity) bajo flujo de una tarea por sesión, commits incrementales, pruebas automatizadas y registro en [docs/bitacora.md](docs/bitacora.md).
