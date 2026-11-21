# Revisión Técnica de `backend-node` vs. Convenciones y Proyecto de Referencia

> Auditoría técnica realizada sobre el código real de `backend-node/` comparándolo contra `.agents/rules/convenciones-node.md`, `docs/api-errores.md`, `docs/seguridad.md` y el proyecto de referencia de Programación IV (`UTN-prog-iv-example`).

---

## 1. Resumen Ejecutivo

`backend-node` implementa **27 suites con 244 tests en verde** y **0 errores de ESLint**. Cumple los criterios clave de seguridad y arquitectura definidos por la cátedra (ES Modules nativos, `app.js` desacoplado de `server.js` para testing con Supertest, validación con `express-validator` y listas blancas de campos, formato único de errores, sanitización NoSQL, Helmet + CORS restrictivo y validación asimétrica JWT RS256 sin emitir tokens).

Al contrastar archivo por archivo con `.agents/rules/convenciones-node.md`, se identifican **fortalezas consolidadas**, **desvíos intencionales justificados por la evolución del sistema** y **3 observaciones puntuales** que conviene conocer para la defensa o eventual refactorización menor.

---

## 2. Matriz de Cumplimiento por Área

| Área | Regla / Referencia (`convenciones-node.md`) | Estado en código real | Evidencia |
|---|---|---|---|
| **Sintaxis y ES Modules** | `"type": "module"`, `import`/`export` con extensión `.js`, `async/await`, nombres en español | **Cumple** | `package.json`, `app.js`, `src/**/*.js` |
| **Desacople `app.js` / `server.js`** | `app.js` exporta la app Express sin abrir puerto; `server.js` conecta Mongo y escucha | **Cumple** | `backend-node/app.js`, `backend-node/server.js` |
| **Capas en módulos principales** | `routes -> controllers -> services -> repositories -> models` | **Cumple en 5 de 6** *(ver §3.1)* | `historialPrecio`, `snapshotCosteo`, `importacionIA`, `resumenSemanal`, `eventosInternos` |
| **Exportaciones** | Controladores, servicios y middlewares nombrados; routers por defecto; modelos nombrados | **Cumple** | `export default router;` en `src/routes/*.js`; `export const ...` en servicios/modelos |
| **Validación y lista blanca** | `express-validator` + `validarCampos`; prohibido `Model.create(req.body)` | **Cumple** | `src/routes/*.js`, `src/middlewares/validarCampos.middleware.js` |
| **Formato único de errores** | `{ mensaje, detalles }` en `400`, `401`, `403`, `404`, `429`, `502`, `500` | **Cumple** | `src/middlewares/error.middleware.js`, `auth.middleware.js`, `rateLimit.middleware.js` |
| **Paginación estándar** | `{ datos, pagina, limite, total }` | **Cumple** | `historialPrecio.repository.js`, `snapshotCosteo.repository.js`, `importacionIA.repository.js` |
| **Seguridad perimetral y JWT** | Solo valida RS256 (sin `/login`), Helmet, CORS whitelist sin `*`, rate limit, NoSQL sanitize | **Cumple (mejorado)** | `auth.middleware.js`, `authInterna.middleware.js`, `cors.middleware.js`, `nosqlSanitize.middleware.js` |
| **Socket.IO y salas** | Handshake JWT RS256, salas `local` y `turno:{id}`, filtrado de payload por permisos | **Cumple** | `src/sockets/index.js`, `src/sockets/emitter.js`, `auth.socket.middleware.js` |
| **Tipos monetarios en Mongoose** | `Decimal128` o centavos en `convenciones-node.md` §5 | **Desvío justificado** *(ver §3.2)* | `HistorialPrecio.js`, `SnapshotCosteo.js`, `ImportacionIA.js` |
| **Linters y tests** | ESLint + Prettier + Jest en verde | **Cumple** | `npm test` (27 suites / 244 tests), `npm run lint` (0 errores) |

---

## 3. Hallazgos Detallados y Decisiones Justificadas

### 3.1 Acoplamiento menor en `productoResumen.controller.js` (Observación de capas)
- **Qué ocurre en el código:** en `backend-node/src/controllers/productoResumen.controller.js`, la función `obtenerResumenCostoProducto` importa y orquesta directamente `obtenerProductoDjango` (`src/clients/django.client.js`), `historialRepo` (`src/repositories/historialPrecio.repository.js`) y `snapshotRepo` (`src/repositories/snapshotCosteo.repository.js`), sin pasar por un `src/services/productoResumen.service.js`.
- **Impacto:** bajo en runtime (la lógica es solo lectura en paralelo con `Promise.all` y manejo de `404`), pero rompe levemente la regla de `.agents/rules/convenciones-node.md` §3 ("controller sin consultas a repositorios").
- **Recomendación:** si se quiere alinear al 100 % en una refactorización futura, mover el `Promise.all` a `src/services/productoResumen.service.js` y dejar el controlador solo leyendo `req.params.id` y respondiendo `res.status(200|404)`.

### 3.2 Montos almacenados como `String` en Mongoose en lugar de `Decimal128`
- **Qué ocurre en el código:** en `HistorialPrecio.js`, `SnapshotCosteo.js` e `ImportacionIA.js`, los campos monetarios y de cantidad (`costoAnterior`, `costoNuevo`, `costoManoObra`, `costoDescartables`, `precioTotal`, `envioDetectado`, `cantidad`) tienen tipo `String` en Mongoose (nunca `Number` flotante).
- **Por qué se decidió así:** Django (`Decimal`) serializa importes y costos unitarios como cadenas con 2 o 4 decimales (`"975.3300"`) para evitar pérdida de precisión en JSON. Almacenarlos como `String` en documentos *append-only* preserva exactamente los dígitos de Django en las respuestas hacia la PWA sin conversiones intermedias de `Decimal128` (`$numberDecimal`), aunque sacrifica ordenamientos/agregaciones aritméticas nativas en MongoDB (que no se realizan en este subdominio porque las agregaciones viven en PostgreSQL).

### 3.3 Evolución de `verificarRol` a `verificarPermiso` y autenticación interna
- **Qué ocurre en el código:** `auth.middleware.js` conserva `verificarRol(...rolesPermitidos)` por compatibilidad con `convenciones-node.md`, pero todas las rutas protegidas (`historialPrecio.routes.js`, `snapshotCosteo.routes.js`, `productoResumen.routes.js`, `importacionIA.routes.js`, `resumenSemanal.routes.js`) utilizan `verificarPermiso('<modulo>.<accion>')`, inspeccionando el claim `permisos` del JWT RS256 emitido por Django.
- **Además**, para recibir eventos desde Django (`venta.registrada`, `venta.anulada`, `costos.recalculados`, `stock.bajo`), `eventosInternos.routes.js` incorpora `verificarClaveInterna` (`authInterna.middleware.js`) con comparación en tiempo constante (`crypto.timingSafeEqual` sobre digest SHA-256 de `EVENTOS_INTERNOS_CLAVE`).

### 3.4 Observación sobre `cors.middleware.js` y Docker Compose
- **`allowedHeaders` en CORS:** `src/middlewares/cors.middleware.js` declara `allowedHeaders: ['Content-Type', 'Authorization']`. Para las llamadas actuales de la PWA y las llamadas servidor-a-servidor de Django (`X-Clave-Interna`, `X-Request-ID`) funciona sin inconvenientes; si en el futuro el navegador enviara `X-Request-ID` en peticiones cross-origin hacia Node, habría que incluir `'X-Request-ID'` en `allowedHeaders`.
- **Clave pública RS256 en imagen Docker de Node:** como documenta el `README.md` raíz, `backend-node/Dockerfile` copia `package.json`, `server.js`, `app.js` y `src/`, pero no `config/keys/`. En Docker Compose, para validar tokens contra `backend-node` es necesario inyectar `JWT_PUBLIC_KEY` o montar `public.pem` vía volumen / override local.

### 3.5 Traducción de contrato y degradación controlada
- **Único punto de traducción `snake_case` ↔ `camelCase`:** `src/clients/django.client.js` (`normalizarRespuestaConfirmacionDjango`) concentra la conversión entre la API DRF de Django y el dominio de Node.
- **Tolerancia a fallos verificada por tests:**
  - `GET /api/productos/:id/resumen-costo`: timeout de `3000 ms` y respuesta `200 OK` con `{ producto: { degradado: true }, historialReciente, ultimoSnapshot }` si Django cae.
  - `POST /api/importaciones/:id/aprobar`: timeout de `5000 ms`, respuesta `502 Bad Gateway` preservando `estado: 'LISTA'` para reintento seguro si Django no responde.
  - `ai.client.js`: timeout de `12000 ms` (`25000 ms` para imágenes) con degradación a `CONTINGENCIA`.

---

## 4. Verificación de Calidad en `backend-node`

- **Tests ejecutados:** `cd backend-node && npm test` → **27 suites pasando, 244 tests pasando** (`14` archivos en `tests/unit/`, `9` en `tests/integration/`, `4` en `src/tests/`).
- **Linter ejecutado:** `cd backend-node && npm run lint` → **0 errores** (`eslint .`).
- **Archivos de entrada de seguridad cubiertos por tests:** `verificarToken.unit.test.js`, `verificarPermiso.unit.test.js`, `socketAuth.unit.test.js`, `corsWhitelist.unit.test.js`, `nosqlSanitize.unit.test.js`, `rateLimit.unit.test.js`, `sanitizarLogs.unit.test.js`, `seguridadHardening.integration.test.js`, `cspConsistencia.integration.test.js`, `eventosInternos.integration.test.js`, `ensayoFallos.integration.test.js`.
