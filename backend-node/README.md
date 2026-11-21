# `backend-node` — Subdominio Documental, Tiempo Real y Orquestación

Servicio intermedio del sistema **Sapori Stock** (`cafe-gestion`), construido con **Node.js 20 LTS**, **Express 5**, **Mongoose 9**, **MongoDB 7** y **Socket.IO 4** usando ES Modules nativos (`"type": "module"`).

---

## Responsabilidades

1. **Subdominio documental inmutable en MongoDB (`append-only`):**
   - `historial_precios` (`HistorialPrecio`): trazabilidad de cambios de costo por insumo/producto.
   - `snapshots_costeo` (`SnapshotCosteo`): desglose variable de recetas en el tiempo.
   - `importaciones_ia` (`ImportacionIA`): entrada, salida tipada, proveedor de IA, latencia, versión de prompt y estado (`PENDIENTE`, `PROCESANDO`, `LISTA`, `CONTINGENCIA`, `APROBADA`, `RECHAZADA`, `FALLIDA`) sin almacenar bytes crudos de imágenes (solo `imagenHash`, `imagenTamanoBytes` e `imagenMime`).
2. **Orquestación de IA con Human-in-the-Loop:**
   - Recibe listas de precios (`POST /api/importaciones` con respuesta inmediata `202 Accepted`), invoca a `ai-service` en segundo plano (`src/clients/ai.client.js`), valida la salida y emite `importacion.lista` por Socket.IO.
   - Tras aprobación humana (`POST /api/importaciones/:id/aprobar`), reenvía el JWT RS256 a Django (`POST /api/compras/confirmar-importacion/`), traduce `snake_case` ↔ `camelCase` en un único punto (`src/clients/django.client.js`), persiste historial/snapshots en MongoDB y emite `costo.actualizado`.
   - Expone el proxy validado de consultoría semanal (`POST /v1/resumen-semanal`).
3. **Tablero en tiempo real con Socket.IO autenticado:**
   - Valida el handshake con JWT RS256 (`autenticarSocketJwt`) usando únicamente la clave pública de Django (Node jamás emite tokens ni tiene `/login`).
   - Gestiona presencia activa (`presencia.actualizada`), salas (`local`, `turno:{id}`, `permiso:recetas.ver_costos`, `permiso:caja.ver_efectivo_esperado`, `permiso:ventas_arqueo_y_costos`, `rol:stock_alertas`) y eventos filtrados (`venta.registrada`, `venta.anulada`, `costo.actualizado`, `stock.bajo`, `importacion.lista`).
   - Recibe notificaciones internas autenticadas desde Django en `POST /api/internos/eventos` mediante cabecera `X-Clave-Interna` comparada en tiempo constante (`crypto.timingSafeEqual` sobre SHA-256).
4. **Resiliencia y seguridad perimetral:** consulta consolidada degradada (`GET /api/productos/:id/resumen-costo`), `helmet` con CSP, CORS con lista blanca sin `*`, rate limiting diferenciado, sanitización NoSQL (`$` y `.`) y logs JSON sanitizados con `X-Request-ID`. En entorno local sirve además la PWA estática en `/app` y `/carta.html`.

---

## Árbol de Carpetas

```text
backend-node/
├── app.js                            # Configuración Express, Helmet, CORS, rate limit, rutas y errorHandler
├── server.js                         # Conexión a MongoDB, arranque HTTP e inicialización de Socket.IO
├── Dockerfile                        # Imagen multietapa (node:20-alpine, usuario node no-root)
├── eslint.config.js                  # Reglas ESLint
├── jest.config.js                    # Jest con ES Modules nativos (--experimental-vm-modules)
├── jest.setup.js                     # Claves efímeras/configuración base para tests aislados
├── package.json
├── src/
│   ├── config/
│   │   ├── db.js                     # Conexión Mongoose a MongoDB 7
│   │   └── env.js                    # Variables de entorno, CORS whitelist, clave interna y JWT_PUBLIC_KEY
│   ├── clients/
│   │   ├── ai.client.js              # Consumo HTTP a ai-service (12s texto / 25s imagen) + contingencia
│   │   └── django.client.js          # Consumo HTTP a Django (3s lectura / 5s lote) + traducción snake_case
│   ├── controllers/                  # Controladores HTTP (delgados)
│   │   ├── eventosInternos.controller.js
│   │   ├── health.controller.js
│   │   ├── historialPrecio.controller.js
│   │   ├── importacionIA.controller.js
│   │   ├── productoResumen.controller.js
│   │   ├── resumenSemanal.controller.js
│   │   └── snapshotCosteo.controller.js
│   ├── middlewares/
│   │   ├── auth.middleware.js        # verificarToken (RS256), verificarPermiso, verificarRol
│   │   ├── authInterna.middleware.js # verificarClaveInterna (X-Clave-Interna + timingSafeEqual)
│   │   ├── correlationId.middleware.js
│   │   ├── cors.middleware.js
│   │   ├── error.middleware.js       # Formato único { mensaje, detalles }
│   │   ├── nosqlSanitize.middleware.js
│   │   ├── rateLimit.middleware.js
│   │   └── validarCampos.middleware.js
│   ├── models/                       # Esquemas Mongoose
│   │   ├── HistorialPrecio.js
│   │   ├── ImportacionIA.js
│   │   └── SnapshotCosteo.js
│   ├── repositories/                 # Acceso encapsulado a Mongoose
│   │   ├── historialPrecio.repository.js
│   │   ├── importacionIA.repository.js
│   │   └── snapshotCosteo.repository.js
│   ├── routes/                       # Rutas Express + checks express-validator
│   │   ├── eventosInternos.routes.js # POST /api/internos/eventos
│   │   ├── health.routes.js          # GET /health y /health/profundo
│   │   ├── historialPrecio.routes.js # GET/POST /api/historial-precios
│   │   ├── importacionIA.routes.js   # CRUD/aprobar/rechazar /api/importaciones (y /importaciones)
│   │   ├── productoResumen.routes.js # GET /api/productos/:id/resumen-costo
│   │   ├── resumenSemanal.routes.js  # POST /v1/resumen-semanal
│   │   └── snapshotCosteo.routes.js  # GET/POST /api/snapshots-costeo
│   ├── services/                     # Lógica de negocio y despacho de eventos
│   │   ├── eventosInternos.service.js
│   │   ├── historialPrecio.service.js
│   │   ├── importacionIA.service.js
│   │   ├── resumenSemanal.service.js
│   │   └── snapshotCosteo.service.js
│   ├── sockets/
│   │   ├── emitter.js                # Emisión filtrada por salas y permisos
│   │   ├── index.js                  # Servidor Socket.IO, salas y presencia
│   │   └── middleware/
│   │       └── auth.socket.middleware.js
│   ├── utils/
│   │   ├── logger.js                 # Logger JSON estructurado
│   │   └── sanitizarLogs.js          # Enmascaramiento de tokens/claves
│   └── tests/                        # Suites históricas de salud, historial, errorHandler y djangoClient
└── tests/
    ├── helpers/auth.helper.js        # Generador RSA/JWT para pruebas
    ├── unit/                         # 14 suites unitarias (JWT, permisos, CORS, NoSQL, PWA, clientes, etc.)
    └── integration/                  # 9 suites de integración (Socket.IO, IA, eventos internos, fallos, etc.)
```

---

## Comandos

### Entorno local (desarrollo)

```bash
cd backend-node
npm ci

# Modo desarrollo con nodemon en :3000
npm run dev

# Modo producción
npm start
```

> Requiere MongoDB accesible en `MONGO_URI` (por defecto `mongodb://localhost:27017/cafe_gestion`) y la clave pública RSA de Django (`JWT_PUBLIC_KEY`, `JWT_PUBLIC_KEY_PATH` o `backend-django/config/keys/public.pem`).

### Pruebas, linter y formato

```bash
cd backend-node

# Suite completa (27 suites, 244 tests pasando sin requerir MongoDB externo activo salvo test de integración mockeado)
npm test

# Linter ESLint (0 errores)
npm run lint

# Verificar formato con Prettier
npm run format
```

### Contenedor Docker

```bash
docker compose up -d --build backend-node
```
