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
