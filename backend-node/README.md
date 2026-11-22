# backend-node — Subdominio Documental, Orquestación IA y Tiempo Real (Sapori Stock)

Servicio backend desarrollado con **Node.js 20 LTS**, **Express 5**, **Mongoose (MongoDB 7)** y **Socket.IO 4**. Administra la persistencia documental inmutable de auditoría de costos, orquesta de forma asíncrona el flujo de importación de listas de precios con Inteligencia Artificial bajo supervisión humana (*Human-in-the-Loop*) y distribuye eventos en tiempo real al salón.

---

## 1. Responsabilidades Principales

- **Persistencia Documental de Auditoría (`MongoDB`):**
  - `HistorialPrecio`: Serie cronológica inmutable (*append-only*) de variaciones de costos de productos.
  - `SnapshotCosteo`: Fotografía documental anidada de la composición exacta de ingredientes, costos unitarios y margen bruto tras cada recálculo de receta.
  - `ImportacionIA`: Trazabilidad completa de cada lista de precios procesada (entrada cruda, propuesta estructurada por la IA, proveedor de IA, versión del prompt, latencia en ms y estado del circuito de aprobación).
- **Orquestación de IA con Revisión Humana (`src/services/importacionIA.service.js`):**
  - Recibe listas de precios en texto, CSV, PDF o imagen (`POST /api/importaciones`), responde `202 Accepted` y delega la extracción a `ai-service`.
  - Si `ai-service` no está disponible o falla, activa la degradación elegante a estado `CONTINGENCIA` permitiendo la carga manual sin interrumpir la operación.
  - Al aprobarse la propuesta (`POST /api/importaciones/:id/aprobar`), coordina la confirmación transaccional con `backend-django`, persiste los snapshots en MongoDB y notifica por WebSockets.
- **Eventos en Tiempo Real por Salas de Permisos (`src/sockets/`):**
  - Autenticación del handshake de `Socket.IO` verificando el token JWT con la clave pública RSA (`RS256`).
  - Segmentación en salas (`local`, `rol:<ROL>`, `permiso:recetas.ver_costos`) para emitir `venta.registrada`, `stock.bajo`, `importacion.lista` y `costo.actualizado` respetando la confidencialidad de los costos.

---

## 2. Estructura del Módulo

```text
backend-node/
├── server.js                # Punto de entrada: conecta MongoDB, inicializa Socket.IO y abre el puerto HTTP
├── package.json             # Dependencias y scripts (start, dev, test, test:coverage, lint)
├── Dockerfile
├── src/
│   ├── app.js               # Pipeline de middlewares Express (Helmet, CORS, RateLimit, NoSQL Sanitize) y rutas
│   ├── config/              # Variables de entorno (env.js), conexión Mongoose (database.js) y clave pública RSA
│   ├── middlewares/         # verificarToken (RS256), verificarPermiso, validarCampos, rateLimit, correlationId
│   ├── models/              # Esquemas Mongoose: HistorialPrecio, SnapshotCosteo, ImportacionIA (Decimal128)
│   ├── repositories/        # Capa de acceso a datos en MongoDB desacoplada de la lógica de negocio
│   ├── services/            # Lógica de negocio y orquestación (importacionIA, resumenSemanal, historial, snapshot)
│   ├── controllers/         # Controladores HTTP delgados con respuestas estandarizadas
│   ├── routes/              # Definición de endpoints y reglas de express-validator
│   ├── clients/             # Clientes HTTP resilientes hacia backend-django y ai-service
│   └── sockets/             # Servidor Socket.IO, autenticación de handshake y salas por permiso
└── tests/
    ├── unit/                # 14 suites unitarias puras (JWT, permisos, sanitización, clientes, lógica PWA)
    └── integration/         # 11 suites de integración con Supertest y MongoDB
```

Para la revisión técnica exhaustiva de controladores, rutas y seguridad, consultar [docs/REVISION_TECNICA_BACKEND_NODE.md](../docs/REVISION_TECNICA_BACKEND_NODE.md).

---

## 3. Instalación y Ejecución Local

### Requisitos previos
- Node.js 20 LTS+
- MongoDB 7.0 ejecutándose en `localhost:27017`

### Pasos de configuración
```bash
cd backend-node
npm install
```

### Levantar el servidor
```bash
# Modo desarrollo (con recarga automática vía nodemon)
npm run dev

# Modo producción
npm start
```

---

## 4. Pruebas Automatizadas, Cobertura y Calidad de Código

La suite cuenta con **211 pruebas automatizadas en 25 suites** ejecutadas con **Jest** y **Supertest**.

```bash
# Ejecutar todas las suites unitarias y de integración
npm test

# Ejecutar tests generando tabla y reporte de cobertura de código (coverage)
npm run test:coverage

# Ejecutar verificación estática de código con ESLint
npm run lint

# Verificar formato con Prettier
npm run format
```
