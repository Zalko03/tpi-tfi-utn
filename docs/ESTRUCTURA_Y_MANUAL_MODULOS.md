# Manual de Estructura y Componentes por Módulo

Este documento responde al **Punto 1 de los Requisitos de Entrega Final**: presenta el README y la documentación detallada de la estructura de carpetas, archivos, módulos y responsabilidades para cada una de las ramas/componentes del sistema (**Backend Django**, **Backend Node.js** y **Frontend PWA + Microservicio IA**), junto con las instrucciones completas de instalación y el orden exacto de ejecución desde cero.

---

## 1. Instrucciones de Instalación y Orden Exacto de Ejecución desde Cero

### 1.1 Requisitos Previos
- **Python 3.11 o superior** (para `backend-django` y `ai-service`).
- **Node.js 20 LTS o superior** y `npm` (para `backend-node` y servidor local de `web`).
- **PostgreSQL 16** (o activar `USE_SQLITE=True` en desarrollo local rápido).
- **MongoDB 7.0** (para las colecciones documentales de `backend-node`).
- **Docker y Docker Compose v2** (opcional pero recomendado para levantar todo el ecosistema con un solo comando).

### 1.2 Configuración de Variables de Entorno
1. Copiar la plantilla `.env.example` de la raíz del proyecto a `.env`:
   ```bash
   cp .env.example .env
   ```
2. Copiar la plantilla `ai-service/.env.example` a `ai-service/.env`:
   ```bash
   cp ai-service/.env.example ai-service/.env
   ```
3. Variables principales a verificar en `.env`:
   - `DJANGO_SECRET_KEY`: clave secreta del núcleo Django.
   - `USE_SQLITE`: `True` para desarrollo local sin instalar PostgreSQL, o `False` para usar PostgreSQL (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`).
   - `MONGO_URI`: cadena de conexión a MongoDB (`mongodb://localhost:27017/cafe_historial`).
   - `JWT_PRIVATE_KEY_PATH` y `JWT_PUBLIC_KEY_PATH`: rutas a las claves RSA asimétricas (2048 bits) con las que Django firma tokens y Node los verifica.
   - `AI_PROVIDER`: `groq`, `gemini` u `ollama` (con su respectiva `GROQ_API_KEY` o `GEMINI_API_KEY`).

### 1.3 Orden Exacto de Arranque de los Servicios
El sistema tiene dependencias estrictas de arranque que deben respetarse en este orden:

1. **Paso 1 — Bases de Datos (`PostgreSQL` en puerto `5432` y `MongoDB` en puerto `27017`):**
   Deben estar escuchando conexiones antes de iniciar los backends.
2. **Paso 2 — Núcleo Transaccional (`backend-django` en puerto `8000`):**
   Es el **emisor maestro de tokens JWT RS256** y la fuente de verdad contable. Debe levantarse primero para aplicar migraciones y estar disponible cuando `backend-node` o el Frontend necesiten autenticar o consultar productos/insumos.
   ```bash
   cd backend-django
   python -m venv .venv
   # En Windows: .\.venv\Scripts\activate | En Linux/Mac: source .venv/bin/activate
   pip install -r requirements.txt
   python manage.py migrate
   SEED_DEMO_PASSWORD="clave_demo_segura" python manage.py seed_demo
   python manage.py runserver 8000
   ```
3. **Paso 3 — Microservicio de Inteligencia Artificial (`ai-service` en puerto `8001`):**
   Debe estar activo antes de que `backend-node` procese listas de precios o resúmenes semanales.
   ```bash
   cd ai-service
   python -m venv .venv
   # En Windows: .\.venv\Scripts\activate | En Linux/Mac: source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
   ```
4. **Paso 4 — Backend Documental y Tiempo Real (`backend-node` en puerto `3000`):**
   Se conecta a MongoDB, carga la clave pública RSA para validar los JWT emitidos por Django, levanta el servidor WebSocket (`Socket.IO`) y se comunica con `backend-django` (`:8000`) y `ai-service` (`:8001`).
   ```bash
   cd backend-node
   npm ci
   npm run dev
   ```
5. **Paso 5 — Cliente Frontend PWA (servido por Node en `http://localhost:3000/app/` o vía Nginx en puerto `80`):**
   Consume la API REST de Django (`:8000`), la API REST de Node (`:3000`) y se suscribe en tiempo real al canal `Socket.IO` de Node (`:3000`).
   No necesita un comando aparte: con Node levantado (paso 4), abrir `http://localhost:3000/app/`.

*(Si se utiliza Docker Compose mediante `docker compose up -d --build`, el archivo `docker-compose.yml` garantiza automáticamente este mismo orden exacto mediante condiciones `depends_on: { condition: service_healthy }`).*

---

## 2. Rama / Módulo 1: Backend Transaccional (`backend-django/`)

### 2.1 Responsabilidad General
Es el núcleo contable y transaccional del sistema (Django 5 + Django REST Framework + PostgreSQL). Garantiza propiedades **ACID** sobre el dinero, las recetas, las compras de insumos, las ventas de mostrador, el arqueo ciego de turnos de caja y la emisión de credenciales JWT firmadas con clave privada RSA (**RS256**).

### 2.2 Estructura de Carpetas y Archivos (`backend-django/`)
```text
backend-django/
├── manage.py                       # Punto de entrada CLI de Django (migraciones, seed_demo, servidor)
├── requirements.txt                # Dependencias Python (Django 5, DRF, SimpleJWT, cryptography, psycopg)
├── pytest.ini / conftest.py        # Configuración y fixtures globales de pruebas con pytest
├── Dockerfile                      # Imagen multi-stage de producción con Gunicorn y usuario no-root
├── config/                         # Configuración global del proyecto Django
│   ├── urls.py                     # Enrutador raíz (/health, /api/health, /api/*)
│   ├── wsgi.py / asgi.py           # Puntos de montaje para servidores de aplicaciones
│   ├── keys/                       # Par de claves RSA (private.pem y public.pem) ignoradas por Git
│   └── settings/
│       ├── base.py                 # Configuración compartida (DRF, SimpleJWT RS256, CORS, Logging JSON)
│       └── dev.py                  # Sobrescrituras para entorno de desarrollo
└── apps/                           # Aplicaciones modulares de dominio
    ├── comun/                      # Utilidades transversales a todo el backend
    │   ├── conversiones.py         # Único servicio que convierte kg->g, l->ml, docena->un en Decimal
    │   ├── excepciones.py          # Manejador global que formatea todo error en { mensaje, detalles }
    │   ├── paginacion.py           # Paginador estándar en español ({ datos, pagina, limite, total })
    │   ├── middleware.py           # Propagación de X-Request-ID para trazabilidad distribuida
    │   ├── logging.py              # Formateador JSON y filtro sanitizador de contraseñas/tokens
    │   ├── throttling.py           # Limitadores de tasa para login y recálculo masivo
    │   └── management/commands/
    │       └── seed_demo.py        # Carga inicial idempotente de usuarios, insumos, productos y recetas
    ├── usuarios/                   # Autenticación JWT RS256, Roles, Permisos Granulares y Auditoría
    │   ├── constantes.py           # Catálogo de 26 permisos granulares y plantillas por rol (DUENIO, ENCARGADO, CAJERO)
    │   ├── models.py               # PerfilUsuario (rol + overrides JSON) y RegistroAuditoria inmutable
    │   ├── claves.py               # Carga o generación de claves RSA 2048 bits para RS256
    │   ├── tokens.py               # Serializers SimpleJWT que inyectan rol y permisos_activos en el JWT
    │   ├── permissions.py          # Clases DRF TienePermiso, EsDuenio, PermisoObjetoTurnoCaja
    │   ├── services.py             # Alta, baja lógica, reactivación y regla de supervivencia del último Dueño
    │   ├── serializers.py          # Validación de entrada/salida de usuarios y permisos
    │   ├── views.py                # Controladores delgados (LoginView, RefreshView, LogoutView, UsuarioViewSet)
    │   └── urls.py                 # Rutas /api/auth/token/* y /api/usuarios/*
    ├── insumos/                    # Proveedores, Insumos y Compras
    │   ├── models.py               # Modelos Proveedor, Insumo (unidad base g/ml/un) y Compra
    │   ├── services.py             # Registro de compra, extracción de IVA, prorrateo de envío y actualización de costo
    │   ├── serializers.py          # Validación Decimal de compras y lote de confirmación de importación IA
    │   ├── views.py                # ProveedorViewSet, InsumoViewSet, CompraViewSet (/confirmar-importacion/)
    │   └── urls.py                 # Rutas /api/proveedores/, /api/insumos/, /api/compras/
    ├── recetas/                    # Carta de Productos y Recetas con Costeo Dinámico
    │   ├── models.py               # Producto (con codigo_barras) y RecetaItem (insumo + cantidad en unidad base)
    │   ├── services.py             # Cálculo exacto del costo de receta, margen bruto y recálculo en cascada
    │   ├── serializers.py          # Ocultamiento dinámico de costos al rol CAJERO y exposición a DUENIO/ENCARGADO
    │   ├── views.py                # ProductoViewSet, RecetaItemViewSet y acción /recalcular/
    │   └── urls.py                 # Rutas /api/productos/ y /api/recetas-items/
    ├── caja/                       # Turnos de Caja y Arqueo Ciego
    │   ├── models.py               # TurnoCaja (ABIERTO/CERRADO) y MovimientoCaja (INGRESO/EGRESO)
    │   ├── services.py             # Apertura única por cajero, cálculo de efectivo esperado y arqueo ciego al cerrar
    │   ├── serializers.py          # Ocultamiento de efectivo_esperado mientras el turno sigue ABIERTO
    │   ├── views.py                # TurnoCajaViewSet (/abrir/, /cerrar/) y MovimientoCajaViewSet
    │   └── urls.py                 # Rutas /api/turnos-caja/ y /api/movimientos-caja/
    ├── ventas/                     # Punto de Venta (POS) y Reportes Financieros
    │   ├── models.py               # Venta (con id_operacion idempotente) y VentaItem (con costo_unitario_snapshot)
    │   ├── services.py             # Cobro transaccional validando turno abierto y congelando costo histórico
    │   ├── reportes.py             # Cálculo de ganancia bruta, punto de equilibrio y progreso de meta mensual
    │   ├── serializers.py          # Validación de items_entrada y medio de pago
    │   ├── views.py                # VentaViewSet (/anular/) y ReportesFinancierosView (/api/reportes/financieros/)
    │   └── urls.py                 # Rutas /api/ventas/ y /api/reportes/*
    └── salud/                      # Observabilidad y Healthchecks
        ├── views.py                # Liveness (/health) y Readiness con chequeo de BD (/api/health/profundo/)
        └── urls.py                 # Rutas de monitoreo
```

---

## 3. Rama / Módulo 2: Backend Documental y Tiempo Real (`backend-node/`)

### 3.1 Responsabilidad General
Construido con **Node.js 20 + Express 5 + Mongoose + MongoDB 7 + Socket.IO 4**. Se encarga de tres responsabilidades que no pertenecen al modelo relacional:
1. **Persistencia documental de auditoría e históricos de alta frecuencia:** `HistorialPrecio`, `SnapshotCosteo` e `ImportacionIA`.
2. **Orquestación asíncrona de Inteligencia Artificial:** recibe listas de precios (en texto o foto base64), responde `202 Accepted` sin bloquear al usuario, invoca a `ai-service`, guarda la trazabilidad en MongoDB y coordina la aprobación humana contra Django.
3. **Eventos en Tiempo Real (`Socket.IO`):** mantiene conexiones WebSocket autenticadas con JWT RS256 y distribuye eventos en vivo segregados por salas de permisos.

### 3.2 Estructura de Carpetas y Archivos (`backend-node/`)
```text
backend-node/
├── app.js                          # Configura Express (Helmet, CORS, RateLimit, NoSQL Sanitize, Rutas y ErrorHandler)
├── server.js                       # Conecta a MongoDB, inicializa Socket.IO sobre el servidor HTTP y abre el puerto 3000
├── package.json                    # Configuración ES Modules ("type": "module"), scripts (dev, start, test, lint)
├── Dockerfile                      # Contenedor Node 20 Alpine endurecido sin privilegios root
├── src/
│   ├── config/
│   │   ├── env.js                  # Lectura centralizada de variables de entorno y carga de clave pública RSA
│   │   └── db.js                   # Conexión resiliente a MongoDB mediante Mongoose
│   ├── models/                     # Esquemas Mongoose con timestamps y borrado lógico (estadoActivo)
│   │   ├── HistorialPrecio.js      # Registro cronológico de variaciones de costo (costoAnterior -> costoNuevo)
│   │   ├── SnapshotCosteo.js       # Fotografía completa del desglose de ingredientes y margen de una receta
│   │   └── ImportacionIA.js        # Ciclo de vida de una lista procesada por IA (PENDIENTE, LISTA, APROBADA, RECHAZADA, CONTINGENCIA)
│   ├── repositories/               # Única capa que ejecuta consultas directas sobre los modelos de Mongoose
│   │   ├── historialPrecio.repository.js
│   │   ├── snapshotCosteo.repository.js
│   │   └── importacionIA.repository.js
│   ├── services/                   # Lógica de negocio pura (independiente de req y res)
│   │   ├── historialPrecio.service.js
│   │   ├── snapshotCosteo.service.js
│   │   ├── productoResumen.service.js
│   │   ├── importacionIA.service.js # Orquestación de los 5 pasos del flujo de importación IA y aprobación humana
│   │   └── resumenSemanal.service.js
│   ├── controllers/                # Controladores delgados: extraen datos de req, invocan al service y devuelven HTTP
│   │   ├── health.controller.js
│   │   ├── historialPrecio.controller.js
│   │   ├── snapshotCosteo.controller.js
│   │   ├── productoResumen.controller.js
│   │   ├── importacionIA.controller.js
│   │   └── resumenSemanal.controller.js
│   ├── routes/                     # Definición de endpoints REST + validaciones express-validator + middlewares JWT
│   │   ├── health.routes.js
│   │   ├── historialPrecio.routes.js
│   │   ├── snapshotCosteo.routes.js
│   │   ├── productoResumen.routes.js
│   │   ├── importacionIA.routes.js
│   │   └── resumenSemanal.routes.js
│   ├── middlewares/                # Seguridad transversal y validación de contratos
│   │   ├── auth.middleware.js      # verificarToken (RS256 con clave pública), verificarRol y verificarPermiso
│   │   ├── validarCampos.middleware.js # Recolecta errores de express-validator en formato único { mensaje, detalles }
│   │   ├── nosqlSanitize.middleware.js # Bloquea inyecciones NoSQL ($gt, $ne, claves con $) en body/query/params
│   │   ├── rateLimit.middleware.js # Limitador general por usuario/IP y limitador estricto para endpoints de IA
│   │   ├── cors.middleware.js      # Lista blanca estricta de orígenes permitidos
│   │   ├── correlationId.middleware.js # Inyección y propagación de cabecera X-Request-ID
│   │   └── error.middleware.js     # Manejador global de errores sin exposición de stacktraces
│   ├── clients/                    # Clientes HTTP internos con propagación de X-Request-ID y timeout
│   │   ├── django.client.js        # Consume /api/productos/, /api/insumos/ y /api/compras/confirmar-importacion/
│   │   └── ai.client.js            # Consume /v1/extraer-precios y /v1/resumen-semanal del microservicio FastAPI
│   ├── sockets/                    # Motor de tiempo real con Socket.IO
│   │   ├── index.js                # Inicialización, gestión de presencia activa y validación de sala turno:{id}
│   │   ├── emitter.js              # Emisores tipados: venta.registrada, costo.actualizado, stock.bajo, importacion.lista
│   │   └── middleware/
│   │       └── auth.socket.middleware.js # Autenticación obligatoria del handshake WebSocket con JWT RS256
│   └── utils/
│       └── logger.js               # Logger estructurado JSON con enmascaramiento de secretos
└── tests/                          # Suite automatizada con Jest y Supertest
    ├── unit/                       # Pruebas unitarias de servicios, middlewares y sanitización
    └── integration/                # Pruebas de integración de rutas HTTP, autenticación RS256 y salas Socket.IO
```

---

## 4. Rama / Módulo 3: Cliente Frontend PWA (`web/`) y Microservicio IA (`ai-service/`)

### 4.1 Estructura del Cliente Frontend PWA (`web/`)
Implementado con **HTML5 semántico, CSS3 moderno y JavaScript ES Modules puro** (sin frameworks pesados para respetar el presupuesto de memoria de 8 GB de RAM del local), con soporte de instalación de escritorio y operación sin internet (**Offline-First**).

```text
web/
├── index.html                      # Aplicación de página única (POS, Turnos, Compras IA/CSV, Recetas, Reportes, Equipo)
├── manifest.webmanifest            # Metadatos de instalación PWA para escritorio y tablets de mostrador
├── sw.js                           # Service Worker que cachea assets estáticos y librerías locales para uso sin internet
├── nginx.conf                      # Configuración del Reverse Proxy perimetral (/api/ -> Django, /socket.io/ -> Node)
├── css/
│   └── estilos.css                 # Sistema de diseño editorial Impeccable UI con variables CSS y modo responsivo
├── js/
│   ├── app.js                      # Controlador de interfaz, eventos DOM, conexión Socket.IO, sesión JWT y fetch con auto-refresh
│   └── logicaPwa.js                # Lógica pura testeable: carrito en centavos, cola offline, permisos por rol, parseo CSV/PDF/Excel/Word y sonidos
└── vendor/                         # Librerías locales cacheadas offline (sin depender de CDNs externos)
    ├── pdfjs/                      # Extracción local de texto desde archivos .pdf en el navegador
    ├── sheetjs/                    # Lectura local de planillas Excel (.xlsx / .xls)
    └── mammoth/                    # Extracción local de texto desde documentos Word (.docx)
```

### 4.2 Estructura del Microservicio de IA (`ai-service/`)
Construido con **FastAPI + Pydantic v2**. Su única misión es transformar entradas no estructuradas (texto libre de WhatsApp/PDF o fotos de listas de precios) en estructuras JSON estrictamente validadas con tipos `Decimal`.

```text
ai-service/
├── requirements.txt                # Dependencias (FastAPI, Uvicorn, Pydantic v2, httpx)
├── Dockerfile                      # Contenedor Python 3.12 slim no-root
└── app/
    ├── main.py                     # Instancia FastAPI, middlewares de correlación y manejadores de error formato único
    ├── config.py                   # Configuración de proveedor activo (groq, gemini, ollama), timeouts y reintentos
    ├── routers/
    │   ├── salud.py                # Endpoints /health y /health/profundo
    │   └── ia.py                   # Endpoints POST /v1/extraer-precios y POST /v1/resumen-semanal
    ├── schemas/
    │   ├── comun.py                # Esquema RespuestaError ({ mensaje, detalles })
    │   ├── extraccion.py           # Validación Pydantic v2 en Decimal, normalización de unidades y rechazo de floats/negativos
    │   └── resumen.py              # Esquemas de entrada y salida del consultor gerencial
    ├── services/
    │   ├── proveedor_ia.py         # Patrón Adapter: interfaz ProveedorIA + GroqAdapter, GeminiAdapter y OllamaAdapter
    │   ├── prompts.py              # Cargador seguro de instrucciones de sistema versionadas
    │   ├── extraccion.py           # Orquestación con aislamiento anti-prompt-injection y fallback de contingencia
    │   └── resumen.py              # Generación de resumen ejecutivo semanal con contingencia determinista
    ├── prompts/
    │   └── v1/                     # Prompts versionados separados de los datos del usuario
    │       ├── extraer_precios.txt
    │       └── resumen_semanal.txt
    └── tests/                      # Pruebas unitarias y de contrato con pytest
```
