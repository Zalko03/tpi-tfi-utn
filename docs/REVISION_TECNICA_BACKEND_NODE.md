# Revisión Técnica del Backend Node.js (`backend-node/`)

Este documento cubre íntegramente el **Punto 4 de los Requisitos de Entrega Final**: documenta la organización en capas, la responsabilidad de cada controlador, el catálogo completo de rutas REST, las validaciones de entrada, la autenticación JWT RS256, el control de permisos, el funcionamiento de WebSockets (`Socket.IO`), las pruebas automatizadas, las variables de entorno y la orquestación con Docker.

---

## 1. Estructura y Organización en Capas

El servicio `backend-node` sigue las convenciones del proyecto de referencia de la cátedra (`UTN-prog-iv-example`), extendiéndolas con una separación estricta en **4 capas de responsabilidad única** para mantener controladores delgados y código 100% testeable:

1. **Capa de Rutas (`src/routes/*.routes.js`):**
   Declara los endpoints HTTP, encadena los middlewares de seguridad (`verificarToken`, `verificarPermiso`, `limitadorIA`), aplica las reglas de validación con `express-validator` + `validarCampos` y delega la ejecución al controlador.
2. **Capa de Controladores (`src/controllers/*.controller.js`):**
   **Controladores delgados.** Únicamente leen parámetros validados desde `req`, invocan a la capa de servicios y formatean la respuesta HTTP (`res.status(...).json(...)`). No contienen lógica de negocio ni consultas directas a Mongoose.
3. **Capa de Servicios (`src/services/*.service.js`):**
   Contiene toda la lógica de negocio, la orquestación con `ai-service` y `backend-django`, y la emisión de eventos por `Socket.IO`. No conoce los objetos `req` ni `res` de Express.
4. **Capa de Repositorios y Modelos (`src/repositories/*.repository.js` y `src/models/*.js`):**
   Es el único punto del sistema que interactúa con Mongoose y MongoDB. Todos los modelos incluyen `{ timestamps: true }` y borrado lógico mediante `estadoActivo: { type: Boolean, default: true }`.

*Además, `app.js` (configuración de Express) está separado de `server.js` (conexión a MongoDB y apertura del puerto TCP) para permitir que la suite de pruebas con `Jest` y `Supertest` evalúe los endpoints en memoria sin abrir puertos de red reales.*

---

## 2. Responsabilidad de cada Controlador (`src/controllers/`)

| Controlador | Archivo | Funciones Exportadas y Responsabilidad |
| :--- | :--- | :--- |
| **Salud y Diagnóstico** | `health.controller.js` | • `obtenerSalud`: Responde `200 OK` rápido (liveness probe).<br>• `obtenerSaludProfunda`: Verifica el estado real de la conexión con MongoDB (`readyState === 1`) y responde `200 OK` o `503 Service Unavailable` (readiness probe). |
| **Importación con IA** | `importacionIA.controller.js` | • `crearImportacion`: Registra la solicitud en estado `PENDIENTE`, dispara el procesamiento asíncrono hacia `ai-service` en segundo plano y responde inmediatamente `202 Accepted`.<br>• `listarImportaciones`: Devuelve el listado paginado de importaciones filtrable por estado.<br>• `obtenerImportacionPorId`: Recupera el detalle y los ítems extraídos de una importación.<br>• `aprobarImportacion`: Envía los ítems confirmados/editados por el dueño a Django (`POST /api/compras/confirmar-importacion/`), persiste el historial de precios y los snapshots de costeo en MongoDB y emite eventos en vivo.<br>• `rechazarImportacion`: Marca la importación como `RECHAZADA` con su motivo sin alterar ningún costo ni crear compras en Django. |
| **Historial de Precios** | `historialPrecio.controller.js` | • `listarHistorial`: Consulta paginada de variaciones históricas de costo filtrable por `productoId`.<br>• `crearHistorial`: Registra un nuevo evento de variación (`costoAnterior` $\to$ `costoNuevo`). |
| **Snapshots de Costeo** | `snapshotCosteo.controller.js` | • `listarSnapshots`: Lista paginada de fotografías de costeo de recetas.<br>• `obtenerUltimo`: Devuelve el último snapshot vigente para un `productoId`.<br>• `crearSnapshot`: Persiste una nueva fotografía con el desglose de ingredientes, costo total y margen bruto. |
| **Resumen de Producto** | `productoResumen.controller.js` | • `obtenerResumen`: Vista consolidada que combina los datos actuales del producto en Django con su último snapshot de costeo y sus últimos cambios de precio en MongoDB. |
| **Consultor / Resumen Semanal** | `resumenSemanal.controller.js` | • `generarResumenSemanal`: Recibe las métricas operativas del período, consulta al microservicio `ai-service` (`POST /v1/resumen-semanal`) y retorna el diagnóstico ejecutivo y sugerencias de rotación. |

---

## 3. Catálogo de Rutas y Endpoints REST (`src/routes/`)

| Método y Ruta | Permiso / Autenticación Requerida | Código Éxito | Operación que Realiza |
| :--- | :--- | :---: | :--- |
| `GET /health` | Público (sin rate-limit) | `200` | Chequeo rápido de vida del proceso Node.js. |
| `GET /health/profundo` | Público (sin rate-limit) | `200` / `503` | Chequeo profundo de conectividad con MongoDB. |
| `POST /api/importaciones` | JWT + `ia.importar_listas` + `limitadorIA` | `202` | Inicia extracción asíncrona desde texto o foto base64. |
| `GET /api/importaciones` | JWT + `ia.importar_listas` | `200` | Lista paginada de importaciones (`?pagina=1&limite=10&estado=...`). |
| `GET /api/importaciones/:id` | JWT + `ia.importar_listas` | `200` | Obtiene la propuesta extraída por IA para revisión humana. |
| `POST /api/importaciones/:id/aprobar` | JWT + `ia.importar_listas` | `200` | Aprueba la propuesta (con o sin ediciones), impacta compras en Django y emite alertas Socket.IO. |
| `POST /api/importaciones/:id/rechazar` | JWT + `ia.importar_listas` | `200` | Rechaza la propuesta dejando constancia en MongoDB sin tocar costos. |
| `GET /api/historial-precios` | JWT + `insumos.ver` | `200` | Lista paginada del historial de variaciones de costo. |
| `POST /api/historial-precios` | JWT + `insumos.ver` | `201` | Registra un cambio histórico de costo de producto. |
| `GET /api/snapshots-costeo` | JWT + `recetas.ver_costos` | `200` | Lista paginada de snapshots de costeo de recetas. |
| `GET /api/snapshots-costeo/:id/ultimo` | JWT + `recetas.ver_costos` | `200` | Obtiene el último desglose de costeo de un producto. |
| `POST /api/snapshots-costeo` | JWT + `recetas.ver_costos` | `201` | Crea un snapshot de costeo con sus ingredientes y margen. |
| `GET /api/productos/:id/resumen` | JWT + `recetas.ver_costos` | `200` | Cruza datos transaccionales de Django con históricos de MongoDB. |
| `POST /v1/resumen-semanal` | JWT + `reportes.ver_operativos` + `limitadorIA` | `200` | Genera el diagnóstico ejecutivo semanal asistido por IA. |

---

## 4. Autenticación JWT RS256, Seguridad y Permisos

1. **Verificación Asimétrica (`RS256`) sin Secreto Compartido (`src/middlewares/auth.middleware.js`):**
   - **Node nunca emite tokens ni tiene endpoint `/login`**. El único emisor de credenciales es Django, que firma los tokens con su clave privada RSA (`private.pem`).
   - Node posee únicamente la **clave pública RSA (`public.pem`)**. El middleware `verificarToken` valida la firma criptográfica, la expiración (`exp`) y que el emisor (`iss`) sea `"cafe-gestion-django"` forzando explícitamente `algorithms: ['RS256']` (lo que bloquea ataques de confusión de algoritmo `alg: none` o `HS256`).
2. **Autorización Granular por Permisos y Roles:**
   - Una vez validado el JWT, Node extrae del payload `req.usuario = { id, username, rol, permisos }`.
   - El middleware `verificarPermiso('clave.permiso')` comprueba que el array de permisos del token incluya la facultad requerida (o que el rol sea `DUENIO`). Si falta el token responde `401`; si el token es válido pero no tiene el permiso responde `403`.
3. **Defensas Perimetrales en `app.js`:**
   - **Helmet:** Cabeceras HTTP endurecidas y `Content-Security-Policy` restrictiva.
   - **CORS con Lista Blanca (`cors.middleware.js`):** Solo acepta orígenes declarados en `CORS_ALLOWED_ORIGINS` (nunca comodín `*`).
   - **Sanitización Anti-Inyección NoSQL (`nosqlSanitize.middleware.js`):** Inspecciona recursivamente `req.body`, `req.query` y `req.params` eliminando cualquier clave que comience con `$` o contenga `.` (bloqueando payloads maliciosos como `{"$gt": ""}`).
   - **Rate Limiting (`rateLimit.middleware.js`):** Limitador general por usuario autenticado/IP y limitador estricto (`limitadorIA`) para proteger la cuota del proveedor de IA.

---

## 5. Validaciones de Datos Recibidos (`express-validator`)

Todas las rutas de escritura validan los datos antes de llegar al controlador mediante `express-validator` y el middleware `validarCampos.middleware.js`:
- **Lista blanca de campos:** Nunca se pasa `req.body` crudo a Mongoose (`Model.create`).
- **Validación de texto e imágenes en Importación IA (`importacionIA.routes.js`):**
  - Si es texto: verifica longitud entre `3` y `15.000` caracteres y rechaza binarios PDF crudos (`%PDF-`) que no hayan sido extraídos como texto.
  - Si es foto (`origenArchivo === 'imagen'`): valida que `imagenMime` sea exclusivamente `image/jpeg`, `image/png` o `image/webp`, que `imagenBase64` tenga estructura base64 pura (sin prefijo `data:`) y que su tamaño no supere los `5 MB` binarios (`7 MB` en base64).
- **Validación de precisión monetaria:** Los importes monetarios (`costoAnterior`, `costoNuevo`, `costoTotal`, `precioTotal`, `envio`) se validan y almacenan como cadenas decimales exactas (`String` / `Decimal`), nunca como `float` binario para evitar errores de redondeo de punto flotante IEEE 754.
- **Formato único de error (`docs/api-errores.md`):** Ante cualquier fallo de validación, devuelve siempre HTTP `400` con la estructura:
  ```json
  {
    "mensaje": "Texto claro en lenguaje simple para el usuario",
    "detalles": { "campo": ["Motivo específico"] }
  }
  ```

---

## 6. Funcionamiento de WebSockets (`Socket.IO`)

El motor en tiempo real vive en `src/sockets/` y comparte el mismo servidor HTTP de Express en el puerto `3000`:

1. **Autenticación en el Handshake (`auth.socket.middleware.js`):**
   Ningún cliente puede conectarse de forma anónima. Al abrir el socket, el cliente envía `auth: { token: jwt }`. El middleware verifica la firma RS256 antes de aceptar la conexión.
2. **Segregación Automática en Salas (`Rooms`) por Permisos (`src/sockets/index.js`):**
   Al conectarse un socket autenticado, el servidor lee sus claims del JWT y lo une automáticamente solo a las salas autorizadas:
   - **`local`**: Todos los usuarios autenticados (reciben presencia activa, `venta.registrada` e `importacion.lista`).
   - **`permiso:recetas.ver_costos`**: Solo usuarios con permiso de ver costos (`DUENIO` y `ENCARGADO`). Reciben `costo.actualizado` con el desglose de recálculo y alertas si el margen cae por debajo del $30\%$. Un `CAJERO` nunca es unido a esta sala y jamás recibe costos por red.
   - **`rol:stock_alertas`**: Solo `DUENIO` y `ENCARGADO` (reciben alertas `stock.bajo`).
   - **`turno:{id}`**: Sala privada por turno de caja, validada por `validarAccesoSalaTurno` (solo pueden unirse el cajero titular de ese turno, el `DUENIO` o quien posea `caja.gestionar_turnos_ajenos`).

---

## 7. Pruebas Automatizadas (`Jest` + `Supertest`)

El backend Node cuenta con pruebas unitarias y de integración ejecutables mediante `npm test`:
- **Pruebas Unitarias (`tests/unit/`):**
  - Verificación de `auth.middleware.test.js` (rechazo de tokens vencidos, sin firma RS256 o sin permiso granular).
  - Verificación de `nosqlSanitize.test.js` (bloqueo de operadores `$ne`, `$gt`, `$where`).
  - Pruebas de servicios (`importacionIA.service.test.js`, `historialPrecio.service.test.js`, `snapshotCosteo.service.test.js`) con mocks de repositorios y clientes HTTP.
- **Pruebas de Integración (`tests/integration/`):**
  - Pruebas de endpoints HTTP completos con `Supertest` contra `app.js`.
  - Pruebas de conexión, presencia, segregación de salas y rechazo de acceso a turnos ajenos en `Socket.IO` con `socket.io-client`.

---

## 8. Variables de Entorno (`.env.example`) y Docker

### 8.1 Variables de Entorno Utilizadas por `backend-node`
Ningún secreto ni clave privada se guarda en el repositorio. Se configuran mediante `.env` (basado en `.env.example`):
- `NODE_ENV`: `development`, `test` o `production`.
- `NODE_PORT`: Puerto de escucha HTTP y WebSocket (por defecto `3000`).
- `MONGO_URI`: URI de conexión a MongoDB (`mongodb://mongodb:27017/cafe_historial`).
- `DJANGO_API_URL`: URL interna del backend Django (`http://backend-django:8000`).
- `AI_SERVICE_URL`: URL interna del microservicio FastAPI (`http://ai-service:8001`).
- `JWT_PUBLIC_KEY` o `JWT_PUBLIC_KEY_PATH`: Clave pública RSA para verificar tokens RS256.
- `CORS_ALLOWED_ORIGINS`: Lista separada por comas de orígenes permitidos (`http://localhost:5173,http://localhost:3000`).

### 8.2 Orquestación con Docker Compose (`docker-compose.yml`)
El proyecto administra **6 contenedores** coordinados por healthchecks:
1. **`postgres` (`postgres:16-alpine`):** Base relacional con volumen persistente `postgres_data` y límite de `512 MB` de RAM.
2. **`mongodb` (`mongo:7.0`):** Base documental con caché WiredTiger limitada a `0.25 GB` (`--wiredTigerCacheSizeGB 0.25`) y límite de `512 MB` de RAM para cuidar equipos de 8 GB.
3. **`backend-django`:** Espera a que `postgres` esté `healthy`, ejecuta migraciones y levanta Gunicorn en el puerto interno `8000`.
4. **`ai-service`:** Levanta Uvicorn/FastAPI en el puerto interno `8001` con usuario no-root.
5. **`backend-node`:** Espera a que `mongodb`, `backend-django` y `ai-service` estén saludables y levanta Express + Socket.IO en el puerto interno `3000`.
6. **`web-proxy` (`nginx:1.27-alpine`):** Único puerto expuesto al exterior (`80`). Sirve los archivos estáticos de la PWA (`web/`), enruta `/api/` hacia Django y `/socket.io/` o `/api/importaciones` hacia Node.

**Comandos para administrar los contenedores:**
- Levantar todo el sistema: `docker compose up -d --build`
- Ver estado y salud: `docker compose ps`
- Inspeccionar logs en vivo: `docker compose logs -f backend-node`
- Detener servicios conservando datos: `docker compose down`
