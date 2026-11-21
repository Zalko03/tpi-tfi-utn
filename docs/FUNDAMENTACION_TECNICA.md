# Fundamentación Técnica y Comparación con lo Visto en Clase — Sapori Stock (`cafe-gestion`)

> Documento de cierre académico para **Programación IV** y **Trabajo Final Integrador (TFI)** — UTN FRRe (Tecnicatura Universitaria en Programación).  
> Contrasta las decisiones reales implementadas en el repositorio frente a los lineamientos vistos en clase y el proyecto de referencia de la cátedra (`UTN-prog-iv-example`), verificando cada punto contra el código fuente vigente.

---

## 1. Del Proyecto de Referencia de Cátedra a la Arquitectura Políglota

En Programación IV se trabajó un patrón base en **Node.js + Express + Mongoose + MongoDB** (`UTN-prog-iv-example`, documentado en `.agents/rules/convenciones-node.md`) y una guía de entregas progresivas (TP 0 a TP 5). **Sapori Stock** adopta ese núcleo conceptual y lo extiende a una **arquitectura políglota de tres servicios + cliente PWA** porque el problema real del comercio (costeo de recetas, caja diaria y listas de proveedores) exige garantías que un único motor no resuelve con igual limpieza:

| Pieza del sistema | Motor / Stack verificado en código | Qué resuelve en el dominio | Qué se rompe si se saca |
|---|---|---|---|
| **`backend-django`** | Python 3.13 + Django 5.2 + DRF + PostgreSQL 16 (SQLite opcional en dev/CI) | Núcleo transaccional ACID: proveedores, insumos, compras con prorrateo e IVA fiscal, stock real y movimientos, recetas, precios de competencia, ventas idempotentes, turnos de caja, 30 permisos y emisión única de JWT RS256. | Todo el núcleo contable y de cobro: no hay fuente de verdad transaccional ni autenticación. |
| **`backend-node`** | Node 20 LTS + Express 5 + Mongoose 9 + MongoDB 7 + Socket.IO 4 | Subdominio documental *append-only* (`historial_precios`, `snapshots_costeo`, `importaciones_ia`), orquestación asíncrona de IA (`202 Accepted`), consulta degradada de costos y tablero en tiempo real por WebSockets. | El historial evolutivo, la auditoría de inferencias de IA y las alertas/tablero en vivo. |
| **`ai-service`** | Python 3.13 + FastAPI + Pydantic v2 + `httpx` | Extracción tipada de listas de proveedores (texto/foto) y resumen semanal mediante Patrón Adapter (`GroqAdapter`, `GeminiAdapter`, `OllamaAdapter`) con contingencia honesta. | Se vuelve a cargar cada lista de proveedor manualmente. |
| **`web` + Nginx** | HTML5, CSS3, ES Modules, Service Worker + Nginx 1.27 Alpine | PWA comercial instalable (POS con lector HID, cola offline en `localStorage`, cálculo en centavos, generación QR SVG), Carta Digital pública (`carta.html` + OpenStreetMap) y reverse proxy en puerto `80`. | Se pierde la interfaz operativa en mostrador, la operación offline y el enrutamiento unificado en Docker. |

---

## 2. Comparación Punto por Punto con lo Visto en Clase

### 2.1 Separación de capas (Controlador → Servicio → Repositorio / Modelo)

- **Visto en clase (`UTN-prog-iv-example`):** el proyecto de referencia tendía a mezclar consultas a Mongoose y reglas de negocio dentro del controlador; en la cátedra se propuso refactorizar hacia **controladores delgados**, **servicios** de dominio y **repositorios**.
- **Implementado en `backend-django/`:** todas las reglas matemáticas y transaccionales viven en `apps/*/services.py` (`calcular_costo_unitario`, `prorratear_envio`, `descontar_stock_por_venta`, `registrar_venta`, `anular_venta`, `actualizar_condicion_fiscal`, `calcular_precio_sugerido`, `crear_personal`). Los `ViewSet` y `APIView` delegan en servicios y no usan *signals* ocultos para recalcular costos.
- **Implementado en `backend-node/`:** separación estricta en `routes/ -> controllers/ -> services/ -> repositories/ -> models/` para `historialPrecio`, `snapshotCosteo`, `importacionIA`, `resumenSemanal` y `eventosInternos` (con un desvío puntual documentado en `docs/REVISION_TECNICA_BACKEND_NODE.md`: `productoResumen.controller.js` coordina directamente `django.client.js` y dos repositorios).
- **Implementado en `ai-service/`:** separación en `routers/` → `services/` → `schemas/` (Pydantic v2) → `prompts/v1/*.txt`.

### 2.2 Contrato único de errores y paginación

- **Visto en clase:** evitar respuestas heterogéneas (`error`, `detalle`, `errors`) y estandarizar listados paginados.
- **Implementado en los tres backends:**
  - Todo error HTTP (`4xx` / `5xx`) responde `{ "mensaje": "...", "detalles": ... }` según `docs/api-errores.md`, implementado de forma homogénea en `backend-django/apps/comun/excepciones.py` (`manejador_excepciones_api`), `backend-node/src/middlewares/error.middleware.js` (`errorHandler`) + `validarCampos.middleware.js`, y `ai-service/app/excepciones.py`.
  - La paginación comparte el mismo contrato `{ "datos": [...], "pagina": 1, "limite": 10, "total": N }` tanto en DRF (`apps/comun/paginacion.py`) como en los repositorios Mongoose de Node.

### 2.3 Seguridad: de JWT simétrico HS256 a RS256 + Permisos Granulares

- **Visto en clase:** en ejemplos iniciales se protege Express con un `JWT_SECRET` simétrico (`HS256`) compartido entre servicios y chequeo simple de rol (`ADMIN` / `USER`).
- **Evolución en Sapori Stock (`docs/adr/0001-autenticacion-jwt-rs256.md` y `docs/seguridad.md`):**
  - **Criptografía asimétrica RS256:** `backend-django` es el **único emisor** que custodia la clave privada RSA (`config/keys/private.pem`), emite tokens de acceso cortos (`15` min) y refresh tokens con rotación + blacklist (`1` día). `backend-node` solo conoce la clave pública y valida tokens HTTP y handshakes Socket.IO en memoria sin consultar a Django ni poder forjar tokens.
  - **Roles como plantillas + 30 permisos granulares:** `DUENIO`, `ENCARGADO` y `CAJERO` inicializan 30 permisos booleanos (`apps/usuarios/constantes.py`) ajustables por persona sin tocar código, incluyendo **arqueo ciego** (`caja.ver_efectivo_esperado`), ocultamiento de costos (`recetas.ver_costos`), autorización a nivel de objeto (cajero solo ve su turno/ventas) y regla de **supervivencia del último Dueño activo**.
  - **Endurecimiento adicional:** CORS con lista blanca sin `*`, `helmet` con CSP consistente entre Node, Nginx (`web/nginx.conf`) y Vercel (`vercel.json`), sanitización activa contra operadores NoSQL (`$` y `.` en `nosqlSanitize.middleware.js`), rate limiting diferenciado por usuario/IP, comparación en tiempo constante (`crypto.timingSafeEqual` sobre SHA-256) para `X-Clave-Interna` en eventos internos, y sanitización de secretos en logs JSON.

### 2.4 Precisión numérica en finanzas y stock

- **Visto en clase:** el riesgo de usar punto flotante binario (`Number` / `float`) en precios y totales.
- **Implementado:** `Decimal` de precisión fija en Python (`backend-django` y `ai-service`), enteros en **centavos** en el carrito de la PWA (`convertirMontoACentavos` y `formatearCentavosADecimal` en `web/js/logicaPwa.js`), y representación como **`String` decimal** en los documentos de MongoDB (`HistorialPrecio`, `SnapshotCosteo`, `ImportacionIA`) para no perder dígitos decimales en la serialización JSON entre Django y Node.

### 2.5 Inteligencia Artificial responsable (*Human-in-the-Loop*)

- **Visto en clase:** evitar que una llamada a un LLM bloquee la petición HTTP, inyecte prompts del usuario o inserte salidas sin validar en la base.
- **Implementado:**
  1. `POST /api/importaciones` en Node responde `202 Accepted` inmediato y procesa en segundo plano.
  2. `ai-service` separa las instrucciones (`prompts/v1/*.txt` en `system`) de los datos del usuario (`user`), aplica **Patrón Adapter** (`GroqAdapter` / `GeminiAdapter` / `OllamaAdapter`) y valida toda respuesta con **Pydantic v2** (`Decimal` > 0).
  3. Ante falla de red, timeout o ausencia de clave, degrada a `CONTINGENCIA` honesta sin inventar datos, manteniendo operativa la carga manual y CSV.
  4. **Ninguna compra ni costo cambia** hasta que el Dueño aprueba explícitamente (`POST /api/importaciones/:id/aprobar`).

### 2.6 Optimización SQL y Tolerancia a Fallos

- **Optimización SQL (`docs/optimizacion.md`):** sobre un seed volumétrico reproducible (`seed_rendimiento.py` con **50.000 ventas**, 40 productos, 120 ítems de receta y 25 insumos), se eliminaron el problema N+1 en `/api/productos/` (`41 → 2` consultas con `Prefetch` e índice `idx_producto_activo_nombre`), el `Seq Scan` en reportes de ventas (`idx_venta_fecha`, `idx_venta_fecha_id_desc`, `idx_ventaitem_venta_prod`) y el bucle de recálculo de recetas (`81 → 3` consultas con `idx_recetaitem_insumo_prod` y `bulk_update`).
- **Tolerancia a desconexión (`docs/ensayo-fallos.md`):** probado mediante tests de integración (`ensayoFallos.integration.test.js` y `notificaciones_node`): si cae `ai-service`, opera CSV/manual; si cae Django, Node devuelve `{ producto: { degradado: true } }` en lecturas y `502` preservando estado `LISTA` en aprobaciones; si cae Node o MongoDB, Django sigue vendiendo, descontando stock y cerrando caja en PostgreSQL.

---

## 3. Desvíos y Ajustes Respecto del Plan Original (`PLAN_IMPLEMENTACION.md`)

En defensa oral resulta clave distinguir con honestidad qué evolucionó respecto de los borradores iniciales del TP 0:

1. **PWA instalable + Nginx en lugar de Electron:** se descartó Electron por consumo de RAM (~8 GB en la PC del local) y se adoptó una PWA con Service Worker (`sw.js`), cola offline en `localStorage` y lector de códigos de barras por emulación de teclado HID.
2. **Groq / Gemini por defecto en lugar de Ollama local obligatorio (ADR-0002):** para reservar memoria a PostgreSQL, MongoDB, Django y Node dentro de ~8 GB de RAM (junto con `--wiredTigerCacheSizeGB 0.25` en MongoDB y límites `cgroups` en `docker-compose.yml`), el adapter usa proveedor en la nube por defecto y conserva `OllamaAdapter` como opción.
3. **Carta Digital pública (`HU15`):** en vez de replicar una colección `menu_digital` en MongoDB, `web/carta.html` consume directamente el endpoint anónimo `GET /api/carta-publica/` de Django con throttle y serializador mínimo (`id`, `nombre`, `precio_venta`), manteniendo independencia de la caja local.
4. **OpenAPI y GraphQL (T4.5 / T4.6 del plan):** `ai-service` expone documentación interactiva OpenAPI/Swagger UI nativa de FastAPI (`/docs` y `/openapi.json`), mientras que en `backend-django` y `backend-node` no se agregaron `drf-spectacular`, Swagger UI ni servidor GraphQL/Apollo, priorizando completar el 100 % de las 15 Historias de Usuario funcionales (incluidas `HU8`, `HU9`, `HU12`, `HU14` y `HU15`) y reforzar seguridad y pruebas.

---

## 4. Calidad Verificada en el Repositorio

### Pipeline de CI en GitHub Actions (`.github/workflows/ci.yml` — 7 jobs)

| # | Job en `ci.yml` | Qué verifica automáticamente |
|---|---|---|
| 1 | `escaneo-secretos` | Verifica que no haya archivos `.env` trackeados en Git y ejecuta `gitleaks/gitleaks-action@v2`. |
| 2 | `lint-python` | `ruff check backend-django/ ai-service/` y `ruff format --check backend-django/ ai-service/`. |
| 3 | `lint-node` | `npm run lint` (ESLint) en `backend-node/`. |
| 4 | `test-django` | Migraciones SQLite y `pytest` completo en `backend-django/`. |
| 5 | `test-node` | Servicio `mongo:7.0` y `npm test` (Jest) en `backend-node/`. |
| 6 | `test-ai-service` | `pytest` completo en `ai-service/`. |
| 7 | `build-docker` | Depende de los 3 jobs de tests; valida `docker compose config` y compila imágenes con `docker compose build`. |

### Cobertura de Pruebas Verificada en la Rama Actual

- **`backend-django`:** **570 tests pasando** (`348` unitarios + `216` API + `6` optimización SQL) con `DEMO_ACCESO_RAPIDO=false .venv/bin/python -m pytest -q`.
- **`backend-node`:** **27 suites, 244 tests pasando** (`14` unitarias + `9` integración + `4` en `src/tests/`) con `npm test`, y `0` errores en `npm run lint`.
- **`ai-service`:** **87 tests pasando** (`73` unitarios + `14` API) con `.venv/bin/python -m pytest -q`.
- **Total monorepo:** **901 pruebas automatizadas en verde**, además de `ruff check` / `ruff format --check` sin errores (`172` archivos formateados) y `node --check` exitoso en los 5 scripts de `web/`.
