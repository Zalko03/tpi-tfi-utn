# CONNECTIONS.md - Registro Vivo de Conexiones

## Conexiones Activas (TP 1 — Núcleo de Datos y APIs CRUD)

| Origen | Destino | Protocolo / Transporte | Propósito | Manejo de Fallo / Tolerancia |
|---|---|---|---|---|
| `backend-django` | PostgreSQL (5432) | TCP / psycopg3 | Persistencia transaccional ACID: Proveedores, Insumos, Compras, Productos, Recetas, Ventas y Turnos. | Transacciones atómicas (`@transaction.atomic`); fallback de desarrollo/test a SQLite si se configura `USE_SQLITE=True`. |
| `backend-node` | MongoDB (27017) | Mongoose / Mongo Wire | Persistencia documental append-only: colecciones `historial_precios` y `snapshots_costeo`. | Reconexión automática de Mongoose; los errores 500 se capturan en `error.middleware.js`. |
| `backend-node` (`django.client.js`) | `backend-django` (`/api/productos/:id/`) | HTTP / JSON | Consulta de catálogo y costo actual de producto para generar resumen consolidado. | Timeout de 3000ms con `AbortSignal.timeout(3000)`. Fallback elegante con objeto `{ degradado: true }` sin tirar la API de Node. |
