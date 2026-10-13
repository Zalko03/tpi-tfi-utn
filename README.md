# cafe-gestion

Sistema de gestión para una cafetería: costeo de recetas, control de caja/ventas y cálculo de rentabilidad.
Trabajo Final Integrador — Programación IV, UTN FRRe.

---

## Arquitectura

| Servicio | Tecnología | Rol |
|---|---|---|
| `backend-django` | Django 5 + DRF + PostgreSQL 16 | Núcleo transaccional: usuarios, insumos, recetas, ventas, caja, costeo |
| `backend-node` | Express + Mongoose + MongoDB 7 + Socket.IO | Historial de precios, snapshots de costeo, tablero en vivo |
| `ai-service` | FastAPI + Ollama / Gemini API *(TP 3)* | Extracción de precios desde listas de proveedores; resumen semanal |
| `web` | HTML + JS *(TP 3)* | Cliente mínimo de demostración |
| `infra` | Docker Compose *(TP 4)* | Orquestación de todos los servicios |

---

## Requisitos para desarrollo local

- Python 3.11+
- Node 20 LTS
- PostgreSQL 16
- MongoDB 7
- Git

---

## Puesta en marcha (desarrollo local, Windows / PowerShell)

### Requisitos
- Python 3.11 o superior
- Node 20 o superior
- PostgreSQL 16 o superior
- Git

MongoDB todavía no hace falta: se incorpora en el TP 1.

### 1. Variables de entorno
Desde la raíz del repositorio:

```powershell
Copy-Item .env.example .env
```

Abrí `.env` y completá `POSTGRES_PASSWORD` con una clave **propia para el proyecto** (no la del usuario `postgres`). Evitá los caracteres `#`, `'`, `"`, `$` y los espacios. El archivo `.env` no se versiona: cada integrante tiene el suyo.

### 2. Base de datos PostgreSQL
Conectate como administrador (pgAdmin → Query Tool sobre la base `postgres`, o `psql`) y ejecutá **por separado** estas dos sentencias, con la misma clave que pusiste en `.env`:

```sql
CREATE USER cafe_user WITH PASSWORD 'tu-clave-del-proyecto' CREATEDB;
```

```sql
CREATE DATABASE cafe_gestion OWNER cafe_user;
```

`CREATEDB` es necesario para que los tests de Django puedan crear su base temporal más adelante.

### 3. backend-django

```powershell
cd backend-django
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py runserver
```

Si PowerShell bloquea `Activate.ps1`, ejecutá los comandos con el Python del entorno sin activarlo:
`.\.venv\Scripts\python.exe -m pip install -r requirements.txt` y `.\.venv\Scripts\python.exe manage.py runserver`.

En otra terminal, comprobá que responde:

```powershell
Invoke-RestMethod http://localhost:8000/health
```

Debe devolver `estado: ok` y `servicio: backend-django`.

Tests:

```powershell
pytest
```

Notas:
- `runserver` consulta la base al arrancar, por eso necesita el paso 2 hecho y el `.env` completo. El endpoint `/health` en sí **no** consulta la base.
- El aviso de "migraciones sin aplicar" es normal por ahora: todavía no hay modelos.

### 4. backend-node

```powershell
cd backend-node
npm ci
npm run dev
```

En otra terminal:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

Debe devolver `estado: ok` y `servicio: backend-node`. El puerto se define con `NODE_PORT` en `.env` (3000 por defecto).

Tests:

```powershell
npm test
```

Jest muestra un `ExperimentalWarning: VM Modules`. Es esperable: se necesita para usar ES Modules con Jest y no afecta el resultado.