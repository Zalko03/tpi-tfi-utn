# Ensayo de Fallos y Degradación Elegante — `cafe-gestion`

> **TP 3 · Tarea T3.7.** Documentación del ensayo sistemático de fallos apagando o aislando cada componente del sistema (`ai-service`, `backend-django`, `backend-node`, `MongoDB` y el transporte WebSocket) y verificando el comportamiento observado frente al criterio de cátedra: *"¿qué se rompe si saco esta pieza y qué sigue funcionando?"*.

---

## 1. Matriz Resumen de Escenarios Ensayados

| # | Componente apagado / fallando | Acción ejecutada durante el corte | Respuesta observada | Qué se degrada | Qué sigue funcionando sin interrupción | Recuperación al volver a encender |
|---|---|---|---|---|---|---|
| **E1** | **`ai-service` (FastAPI 8001)** o proveedor externo (Gemini / Ollama) | `POST /api/importaciones` con lista de precios en texto libre | `HTTP 202 Accepted` inmediato; en segundo plano pasa a `estado: "CONTINGENCIA"` (`contingencia: true`) en MongoDB y emite `importacion.lista` por Socket.IO | Extracción automática por IA | Ventas en caja, turnos, recálculo de recetas y **carga manual o por CSV** de compras en Django (`POST /api/compras/`) | La siguiente solicitud `POST /api/importaciones` vuelve a extraer ítems con IA (`estado: "LISTA"`) sin reiniciar Node |
| **E2** | **`backend-django` (DRF 8000)** durante consulta consolidada | `GET /api/productos/:id/resumen-costo` en `backend-node` | `HTTP 200 OK` en ≤ 3000 ms con `producto: { degradado: true }` + `historialReciente` y `ultimoSnapshot` desde MongoDB | Costo vigente en vivo desde PostgreSQL | Consulta de evolución histórica de precios (`historial_precios`), último desglose de receta (`snapshots_costeo`) y tablero Socket.IO | La siguiente petición `GET /api/productos/:id/resumen-costo` devuelve `degradado: false` con los datos frescos de Django |
| **E3** | **`backend-django` (DRF 8000)** durante aprobación humana de lista IA | `POST /api/importaciones/:id/aprobar` en `backend-node` | `HTTP 502 Bad Gateway` con formato único `{ mensaje, detalles }`; el documento en MongoDB **conserva `estado: "LISTA"`** | Confirmación inmediata del lote de compras | La propuesta extraída por la IA no se pierde ni queda en estado inconsistente; no se crean compras parciales (`@transaction.atomic`) | El dueño vuelve a pulsar **"Aprobar"** y la operación completa con `HTTP 200 OK` y `estado: "APROBADA"` |
| **E4** | **`backend-node` (Express + Socket.IO 3000)** | Cobro de tickets (`POST /api/ventas/`), alta manual de compras (`POST /api/compras/`) y apertura/cierre de turnos en Django; PWA abierta en navegador | Django responde `200/201` con normalidad; en la PWA la insignia cambia a `Tiempo Real: Desconectado (reconectando...)` | Avisos en tiempo real por Socket.IO, historial documental e importación con IA | **Todo el núcleo contable y operativo del local** (login JWT, ventas en caja, lector de código de barras, stock y costeo de recetas en PostgreSQL); la PWA mantiene su cáscara en caché gracias al Service Worker (`sw.js`) | El cliente Socket.IO reconecta automáticamente (`reconnection: true`, backoff 300–3000 ms), reingresa a la sala `local` y actualiza presencia |
| **E5** | **`MongoDB` (27017)** | Peticiones a endpoints documentales de Node (`/api/importaciones`, `/api/historial-precios`) y ventas en Django | `errorHandler` en Node captura `MongoNetworkError` y responde `HTTP 500` con `{ mensaje, detalles }` sin caer el proceso (`GET /health` sigue `200 OK`); Django opera al 100 % | Persistencia y lectura de historial documental, snapshots y trazabilidad de IA | **Todo el núcleo transaccional en PostgreSQL** (ventas, caja, compras, insumos y recálculo de recetas) | Mongoose restablece el pool de conexiones automáticamente cuando MongoDB vuelve a aceptar conexiones |

---

## 2. Detalle Técnico por Escenario

### Escenario 1 — Apagado de `ai-service` (Puerto 8001) o caída de internet hacia el proveedor de IA

- **Cómo se provoca el fallo:**
  Detener el proceso de FastAPI (`uvicorn app.main:app --port 8001`) o desconectar el acceso al proveedor de IA, y enviar desde el cliente PWA o por HTTP:
  ```http
  POST http://localhost:3000/api/importaciones
  Authorization: Bearer <token_jwt>
  Content-Type: application/json

  {
    "proveedorNombre": "Mayorista Ensayo T3.7",
    "textoLista": "Café en grano 1 kg $22000\nAzúcar 10 kg $14000"
  }
  ```
- **Lo observado paso a paso:**
  1. `backend-node` registra la solicitud en `importaciones_ia` con `estado: "PENDIENTE"` y responde en menos de 25 ms con `HTTP 202 Accepted` (`{ importacionId, estado: "PENDIENTE", versionPrompt: "v1" }`), cumpliendo `CA7.1`.
  2. En segundo plano, `extraerPreciosIA` (`backend-node/src/clients/ai.client.js`) intenta conectar con `http://localhost:8001/v1/extraer-precios` con `AbortSignal.timeout(12000)`.
  3. Ante `ECONNREFUSED` (o timeout si `ai-service` tarda más de 12 s), `ai.client.js` no lanza una excepción no controlada: retorna el objeto normalizado de contingencia:
     ```json
     {
       "contingencia": true,
       "mensajeContingencia": "El servicio de IA no está disponible temporalmente. Puede continuar con la carga manual o por CSV.",
       "salida": { "items": [] }
     }
     ```
  4. `procesarImportacionEnSegundoPlano` actualiza el documento en MongoDB a `estado: "CONTINGENCIA"` (`contingencia: true`) y emite por Socket.IO el evento `importacion.lista` a la sala `local`.
  5. En la interfaz PWA (`web/`), el tablero muestra la alerta amarilla `"Importación IA en modo contingencia"`, indicando al operador que cargue la factura mediante el formulario manual/CSV sin detener la caja.

---

### Escenario 2 — Apagado de `backend-django` (Puerto 8000) durante lectura consolidada

- **Cómo se provoca el fallo:**
  Detener `python manage.py runserver` en `backend-django` y consultar en `backend-node`:
  ```http
  GET http://localhost:3000/api/productos/701/resumen-costo
  Authorization: Bearer <token_jwt>
  ```
- **Lo observado paso a paso:**
  1. El middleware `verificarToken` de Node valida la firma RS256 del JWT **en memoria local** usando `JWT_PUBLIC_KEY`, sin necesitar que Django esté encendido.
  2. `obtenerResumenCostoProducto` ejecuta en paralelo (`Promise.all`) la lectura en MongoDB (`HistorialPrecio` y `SnapshotCosteo`) y la petición HTTP a Django (`obtenerProductoDjango` con `AbortSignal.timeout(3000)`).
  3. Al fallar la conexión con Django (`ECONNREFUSED` o timeout de 3 s), `obtenerProductoDjango` devuelve el objeto de fallback degradado y Node responde `HTTP 200 OK`:
     ```json
     {
       "producto": {
         "degradado": true,
         "id": 701,
         "mensaje": "No se pudo comunicar con el núcleo transaccional Django",
         "error": "fetch failed: connect ECONNREFUSED 127.0.0.1:8000"
       },
       "historialReciente": [
         {
           "productoId": 701,
           "costoAnterior": "800.0000",
           "costoNuevo": "950.0000"
         }
       ],
       "ultimoSnapshot": {
         "productoId": 701,
         "costoTotal": "950.0000",
         "margenBruto": "0.6800"
       }
     }
     ```

---

### Escenario 3 — Apagado de `backend-django` (Puerto 8000) durante aprobación humana (`CA7.3`)

- **Cómo se provoca el fallo:**
  Con una importación ya extraída en estado `LISTA` en MongoDB, detener `backend-django` y pulsar **"Aprobar y Recalcular Recetas"** (`POST /api/importaciones/:id/aprobar`).
- **Lo observado paso a paso:**
  1. `confirmarImportacionComprasDjango` falla al intentar contactar `POST http://localhost:8000/api/compras/confirmar-importacion/`.
  2. `backend-node` responde con `HTTP 502 Bad Gateway` respetando `docs/api-errores.md`:
     ```json
     {
       "mensaje": "No se pudo comunicar con el núcleo transaccional Django para confirmar las compras",
       "detalles": "fetch failed: connect ECONNREFUSED 127.0.0.1:8000"
     }
     ```
  3. Al inspeccionar MongoDB (`GET /api/importaciones/:id`), el documento **permanece en `estado: "LISTA"`** (no se marca como `APROBADA` ni se pierde la propuesta).
  4. Al volver a encender `backend-django` y reintentar `POST /api/importaciones/:id/aprobar`, Django ejecuta `@transaction.atomic`, crea las compras con envío prorrateado, recalcula las recetas, y Node guarda `HistorialPrecio` + `SnapshotCosteo`, emitiendo `costo.actualizado` y pasando la importación a `APROBADA`.

---

### Escenario 4 — Apagado de `backend-node` (Puerto 3000) y corte de WebSocket

- **Cómo se provoca el fallo:**
  Detener el servidor de Node mientras el cajero opera la caja y tiene el tablero abierto.
- **Lo observado paso a paso:**
  1. En el navegador (`web/`), el evento `disconnect` de Socket.IO cambia de inmediato la insignia superior a `Tiempo Real: Desconectado (reconectando...)`.
  2. El cajero continúa cobrando ventas en `POST http://localhost:8000/api/ventas/`: Django procesa cada venta con su `costo_unitario_snapshot` en PostgreSQL sin ninguna dependencia hacia Node.
  3. Al volver a iniciar `backend-node`, el cliente Socket.IO (configurado con `reconnection: true`, `reconnectionDelay: 300`, `reconnectionDelayMax: 3000`) completa nuevamente el handshake JWT RS256, vuelve a unirse automáticamente a la sala `local` y emite `presencia.actualizada`.

---

### Escenario 5 — Fallo de conexión o consulta en `MongoDB` (Puerto 27017)

- **Cómo se provoca el fallo:**
  Detener el servicio de MongoDB o simular caída de conexión (`MongoNetworkError`) durante una consulta a `/api/importaciones`.
- **Lo observado paso a paso:**
  1. El middleware centralizado `errorHandler` (`backend-node/src/middlewares/error.middleware.js`) intercepta la excepción y devuelve `HTTP 500 Internal Server Error` con el formato único `{ "mensaje": "Error interno del servidor", "detalles": ... }`.
  2. El proceso de Node no colapsa (`GET /health` continúa devolviendo `200 OK` con `{ "estado": "ok", "servicio": "backend-node" }`) y los canales de Socket.IO en memoria siguen activos.
  3. En paralelo, `backend-django` y `PostgreSQL` no sufren ningún impacto: las ventas, compras y recálculos de costos siguen funcionando con normalidad.

---

## 3. Verificación Automatizada Reproducible

Todos los escenarios de fallo y recuperación se encuentran automatizados en la suite de integración:

```powershell
npm --prefix backend-node test -- tests/integration/ensayoFallos.integration.test.js
```

Y las pruebas de contingencia del adaptador de IA (timeouts, HTTP 500 del modelo y JSON malformado) se verifican en `ai-service`:

```powershell
.\ai-service\.venv\Scripts\python.exe -m pytest ai-service/app/tests/unit/test_unit_adapters_y_servicios.py -v
```
