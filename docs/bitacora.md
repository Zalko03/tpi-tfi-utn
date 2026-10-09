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
