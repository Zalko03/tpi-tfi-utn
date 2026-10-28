# CONNECTIONS.md - Registro Vivo de Conexiones

## Conexiones Activas (TP 1 — Núcleo de Datos y APIs CRUD, TP 2 — Autenticación y Seguridad)

| Origen | Destino | Protocolo / Transporte | Propósito | Manejo de Fallo / Tolerancia |
|---|---|---|---|---|
| `backend-django` | PostgreSQL (5432) | TCP / psycopg3 | Persistencia transaccional ACID: Proveedores, Insumos, Compras, Productos, Recetas, Ventas, Turnos, Usuarios y Perfiles. | Transacciones atómicas (`@transaction.atomic`); fallback de desarrollo/test a SQLite si se configura `USE_SQLITE=True`. |
| `backend-node` | MongoDB (27017) | Mongoose / Mongo Wire | Persistencia documental append-only: colecciones `historial_precios` y `snapshots_costeo`. | Reconexión automática de Mongoose; los errores 500 se capturan en `error.middleware.js`. |
| `backend-node` (`django.client.js`) | `backend-django` (`/api/productos/:id/`) | HTTP / JSON | Consulta de catálogo y costo actual de producto para generar resumen consolidado. | Timeout de 3000ms con `AbortSignal.timeout(3000)`. Fallback elegante con objeto `{ degradado: true }` sin tirar la API de Node. |
| `backend-django` (Emisor SimpleJWT RS256) | Clientes HTTP / `backend-node` | Criptografía asimétrica (JWT RS256) | Emisión central de access tokens (15m) y refresh tokens (24h) con claims de rol y permisos granulares (ADR-0001). | Verificación autónoma offline en Node con clave pública sin pegarle a PostgreSQL. Expiración breve de 15 min y bloqueo inmediato al refrescar. |
| Clientes HTTP / PWA | `backend-node` (`verificarToken` / `verificarPermiso`) | HTTP Bearer Header / RS256 | Autenticación y autorización granular en memoria local sobre endpoints protegidos (`/api/productos/:id/resumen-costo`, `/api/historial-precios`). | Respuestas de error unificadas (401 Unauthorized / 403 Forbidden) según `docs/api-errores.md`; validación offline con clave pública RSA sin depender de conexión con Django. |
