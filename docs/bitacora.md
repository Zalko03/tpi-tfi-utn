# Bitácora de desarrollo — cafe-gestion

> Registro por tarea del trabajo realizado con el asistente de IA (Antigravity/AGY).
> Cada integrante debe poder explicar en la defensa cualquier línea de los archivos tocados en su sesión.

---

## T0.1 — Estructura del monorepo (2026-10-08)

**Rama:** `feature/T0.1-estructura-monorepo`

### Qué se hizo

- Se creó la rama `feature/T0.1-estructura-monorepo` desde `main`.
- Se commitearon los workflows del agente (`tarea.md`, `cierre-clase.md`) que estaban modificados localmente.
- Se agregó `.gitignore` centralizado cubriendo Python (`__pycache__`, `venv`, `.venv`, `*.py[cod]`), Node (`node_modules`), Docker, secretos (`.env` con excepción `!.env.example`) y artefactos de editor/OS.
- **fix:** se agregó sección "Claves privadas" al `.gitignore` (`*.pem`, `*.key`, `backend-django/config/keys/`, `backend-node/config/keys/`) para que el par JWT RS256 nunca entre al historial de Git (commit separado: `fix: ignorar claves privadas en .gitignore`).
- Se agregó `.env.example` con las variables de los tres servicios (`backend-django`, `backend-node`, `ai-service`) y la sección de infra (descomentada en TP4). Sin valores reales; con comentarios que explican cómo generar el par de claves JWT RS256.
- Se creó `README.md` base con tabla de arquitectura, instrucciones de puesta en marcha (completar en T0.4), estructura del repo, tabla del equipo y declaración de uso de IA (exigida por el plan).
- Se crearon los directorios del monorepo con `.gitkeep`: `backend-django/`, `backend-node/`, `docs/adr/`, `docs/dominio/seed/`. **No se crean** `ai-service/`, `web/` ni `infra/` hasta sus TPs respectivos.

### Por qué así

- `.gitignore` antes que cualquier otro archivo: garantiza que ningún `.env` real ni `node_modules` entre al repo accidentalmente (regla 6 de `AGENTS.md`).
- La excepción `!.env.example` permite versionar la plantilla sin riesgo.
- JWT con RS256 (solo Django emite, Node valida con la pública): decisión del plan (§3 de `PLAN_IMPLEMENTACION.md`), registrada en el `.env.example` con el comando de generación.
- `ai-service/`, `web/`, `infra/` se omiten intencionalmente: crear estructura vacía para código que llega en TP3/TP4 genera confusión sobre el estado de avance.

### Archivos creados/modificados

| Archivo | Estado |
|---|---|
| `.agents/workflows/tarea.md` | Modificado (frontmatter YAML agregado) |
| `.agents/workflows/cierre-clase.md` | Modificado (frontmatter YAML agregado) |
| `.gitignore` | Creado |
| `.env.example` | Creado |
| `README.md` | Creado |
| `backend-django/.gitkeep` | Creado |
| `backend-node/.gitkeep` | Creado |
| `docs/adr/.gitkeep` | Creado |
| `docs/dominio/seed/.gitkeep` | Creado |
| `docs/bitacora.md` | Creado (este archivo) |

### Cómo probarlo

```bash
# 1. Verificar que .env no está trackeado
git ls-files .env   # debe estar vacío

# 2. Verificar que .env.example sí está trackeado
git ls-files .env.example   # debe mostrar .env.example

# 3. Verificar que las carpetas existen
# Windows:
Test-Path backend-django, backend-node, docs/adr, docs/dominio/seed

# 4. Verificar que no hay secretos ni datos reales
git log --oneline feature/T0.1-estructura-monorepo
git diff main feature/T0.1-estructura-monorepo -- .env.example
# El diff de .env.example no debe tener valores reales
```

---

## T0.2 — Propuesta del proyecto (2026-10-10)

**Rama:** `feature/T0.2-propuesta`

### Qué se hizo

- Se creó la rama desde `main` actualizado (`git pull --ff-only`: ya estaba al día con el merge del PR #1).
- Se creó `docs/PROPUESTA.md` en 4 commits, uno por bloque:
  1. Problema y usuarios (sección 1).
  2. Historias HU1–HU14 con prioridad MoSCoW y 2–3 criterios de aceptación (sección 2).
  3. Fuera de alcance y modelo de dominio con diagrama Mermaid `erDiagram` (secciones 3 y 4).
  4. Riesgos y supuestos a validar (secciones 5 y 6).
- Contenido basado solo en `docs/PLAN_IMPLEMENTACION.md`. Sin nombres, teléfonos ni precios reales.

### Decisiones y por qué

- **HU14 (Should)** se agregó a pedido del equipo y se aclaró que **reemplaza al parámetro global `costear_con_iva`** del plan (§0, 2b). Mientras el dueño no declare su condición fiscal, el criterio CA14.2 aplica el valor por defecto del plan (costo con IVA), para no asumir que es responsable inscripto.
- **Criterios de aceptación** en formato Dado/Cuando/Entonces, cada uno con la regla del plan de la que deriva (§2 o §3). No se fijaron cifras: los valores concretos se definirán en los tests con datos inventados.
- **ERD:** las 10 entidades pedidas. Se agregó `Usuario → MovimientoCaja` y el atributo `medio_pago` en `Venta`. Las presentaciones de compra se modelan como atributos de `Compra` (la entidad `Presentacion` de T1.1 queda para esa tarea). Las entidades de historias Should (precios de competencia, costos fijos y metas, movimientos de stock) se mencionan en una nota pero no se dibujan.
- **Persistencia:** las 10 entidades en PostgreSQL; `historial_precios` y `snapshots_costeo` en MongoDB.
- **HU6 / Usuarios:** se precisó el alta de personal (nombre completo, usuario, clave inicial) y se reescribieron CA6.1–CA6.4; la regla del único dueño activo se conservó como CA6.5. Las cuentas se desactivan, no se borran.
- **Supuestos:** marcados como resueltos el frontend libre y el proveedor de IA externo (Gemini). Pendientes: aprobación del tema, decisión del dueño sobre el POS, exportación de ventas y condición fiscal.

### Archivos creados/modificados

| Archivo | Estado |
|---|---|
| `docs/PROPUESTA.md` | Creado |
| `docs/bitacora.md` | Modificado (esta entrada) |

### Cómo probarlo

```bash
# 1. Ver los commits de la rama
git log --oneline main..feature/T0.2-propuesta

# 2. Revisar el documento. En GitHub o en la vista previa del editor,
#    el bloque ```mermaid debe renderizar el diagrama sin errores.

# 3. Verificar que no hay datos reales (no debería devolver nada sospechoso)
git diff main feature/T0.2-propuesta --stat
```

Checklist manual: las HU1–HU13 coinciden con la tabla del plan (§6), HU14 está marcada Should, y cada historia tiene 2–3 criterios.

---

## T0.3 — Arquitectura (2026-10-10)

**Rama:** `feature/T0.3-arquitectura`

### Qué se hizo

- Se creó `docs/arquitectura.md` en 3 commits: (1) mapa tecnológico y diagrama de componentes; (2) diagrama de secuencia de la importación de precios con IA; (3) datos por base, degradación y decisiones.
- En un commit aparte se alineó la fila HU6 de `docs/PLAN_IMPLEMENTACION.md` §6 con `docs/PROPUESTA.md` (cuenta propia con nombre completo, usuario y clave inicial). No se tocó nada más del plan.

### Decisiones y por qué

- **Secuencia con rama `alt` de contingencia:** si la IA falla o devuelve una salida que no valida, Node guarda la entrada y el error, avisa y el dueño carga los precios a mano o por CSV. Una segunda rama cubre que el dueño no apruebe: no se crea compra ni cambia ningún costo.
- **Mermaid:** un diagrama por bloque, etiquetas entre comillas en el flowchart y sin caracteres especiales en los nombres de nodos. En el de secuencia las comillas se quitaron porque se mostrarían literales.
- **Decisiones pendientes** (sección 6 del documento), cada una con una "opción propuesta" marcada como no decidida:
  - Aviso de Django a Node: HTTP interno con token de servicio (a decidir en TP3).
  - Token de Node a Django: reenviar el JWT del usuario en acciones de personas y token de servicio en eventos internos (a decidir en TP2).
  - Modalidad de despliegue (T4.4).
- Decisiones tomadas, con ADR a registrar: JWT RS256 con Django como único emisor, contrato `snake_case` con traducción a `camelCase` en `django.client.js` y adapter de proveedor de IA.

### Pendiente para otra tarea

- **Falta agregar `importaciones_ia` a la tabla "Dónde se persiste cada cosa" de `docs/PROPUESTA.md` §4**, que hoy lista solo `historial_precios` y `snapshots_costeo`. `arquitectura.md` sí la incluye, según el plan §2. No se modificó la propuesta en esta tarea.

### Archivos creados/modificados

| Archivo | Estado |
|---|---|
| `docs/arquitectura.md` | Creado |
| `docs/PLAN_IMPLEMENTACION.md` | Modificado (solo la fila HU6) |
| `docs/bitacora.md` | Modificado (esta entrada) |

### Cómo probarlo

```bash
git log --oneline main..feature/T0.3-arquitectura
git diff main --stat   # solo arquitectura.md, una línea del plan y la bitácora
# Abrir docs/arquitectura.md con la vista previa de Markdown: los dos
# bloques mermaid deben renderizar sin errores.
```
---

## T0.4 — Entornos reproducibles (2026-10-10)

**Rama:** `feature/T0.4-entornos`

### Qué se hizo
- **backend-django:** proyecto Django 5.2 LTS con `config/` (settings base y dev, urls, wsgi) y `apps/salud` con `GET /health`, que responde `{"estado": "ok", "servicio": "backend-django"}` sin consultar la base. `requirements.txt` con versiones fijadas y un test con `pytest` y `pytest-django`.
- **backend-node:** proyecto Express con ES Modules. `app.js` arma y exporta la app (helmet, cors, morgan, JSON) y `server.js` solo escucha el puerto, para poder testear con supertest. `GET /health` responde `{ estado: 'ok', servicio: 'backend-node' }` sin conectar a Mongo. Dependencias con versión exacta y `package-lock.json`. 2 tests con Jest y supertest (estado del servicio y encabezado `X-Powered-By` ausente).
- **`.gitattributes`:** `* text=auto eol=lf`. Tras agregarlo, no aparecieron archivos antiguos como modificados, así que no hizo falta renormalizar.
- **README:** puesta en marcha para PowerShell, incluida la creación del usuario y la base de PostgreSQL.

### Por qué así
- **Sin DRF todavía:** `/health` usa `JsonResponse`; DRF se agrega cuando haga falta (T1.4/T1.5).
- **`python-dotenv`, `dotenv` y `psycopg[binary]`:** no estaban en el alcance, pero hacen falta para leer `.env` y para que Django configure el motor PostgreSQL.
- **`runserver` consulta la base al arrancar** (`check_migrations`), por lo que necesita PostgreSQL con credenciales válidas; `/health` en sí no la consulta. `pytest` y `manage.py check` pasan sin base. Se verificó `/health` por HTTP de dos formas: con `runserver` y la base creada, y con `wsgiref` sin base.
- **Jest con ES Modules:** el script `test` usa `node --experimental-vm-modules`, lo que genera un `ExperimentalWarning` inocuo.
- **`cors()` sin lista blanca:** es temporal; se restringe por origen en la T2.5.
- **Valores por defecto de desarrollo en Django:** la clave y los hosts de ejemplo solo se aplican con `DJANGO_DEBUG=True`. Con `DEBUG` apagado y sin `DJANGO_SECRET_KEY` o `DJANGO_ALLOWED_HOSTS`, el arranque falla con `ImproperlyConfigured` (`settings/base.py`).

### Pendientes
- Instalar y configurar **ruff, black, ESLint y Prettier** antes del TP 4 (el CI los necesita).
- Agregar `importaciones_ia` a la tabla de persistencia de `docs/PROPUESTA.md` §4 (viene de T0.3).
- Verificación cruzada: el otro integrante clona el repo desde cero, sigue solo el README y comprueba que ambos `/health` respondan.

### Registro de uso de IA
La parte de Django y la estructura de Node se hicieron con el agente de Antigravity (Claude Sonnet 5.5). Al agotarse la cuota del modelo, los commits de Node, `.gitattributes`, README y bitácora se completaron a mano, y la configuración de PostgreSQL local la hizo el integrante.

### Archivos creados/modificados
| Archivo | Estado |
|---|---|
| `backend-django/` (manage.py, config/, apps/salud/, requirements.txt, pytest.ini) | Creado |
| `backend-node/` (app.js, server.js, jest, package.json, package-lock.json, src/) | Creado |
| `backend-django/.gitkeep`, `backend-node/.gitkeep` | Eliminados |
| `.gitattributes` | Creado |
| `README.md` | Modificado (puesta en marcha) |
| `docs/bitacora.md` | Modificado (esta entrada) |

### Cómo probarlo
```powershell
# Django (con la base creada y .env completo)
cd backend-django; .\.venv\Scripts\python.exe -m pytest
# Node
cd ..\backend-node; npm test
```