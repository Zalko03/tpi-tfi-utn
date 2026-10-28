# Bitácora de Desarrollo - cafe-gestion

## Plantilla por Sesión / Tarea
---
Fecha: YYYY-MM-DD
Tarea: [Ej. T1.1 - Configuración inicial de modelos]
Rama: feature/...
Cambios realizados:
- 
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- 
Problemas y decisiones técnicas:
- 
Archivos tocados:
- 
Cómo probarlo:
- 
---

## Historial de Sesiones
(Las entradas nuevas se agregan arriba)

---
Fecha: 2026-10-28
Tarea: T2.4 — Middleware de validación JWT RS256 y autorización granular en backend-node
Rama: feature/t2.4-node-middleware-jwt
Cambios realizados:
- En `backend-node`:
  - Instalación de dependencia `jsonwebtoken` (^9.0.3) para verificación criptográfica asimétrica de tokens.
  - Configuración y lectura de la clave pública RSA en `src/config/env.js` mediante la función `obtenerClavePublicaJwt()`, resolviendo por orden de prioridad: contenido PEM directo (`process.env.JWT_PUBLIC_KEY`), archivo específico (`process.env.JWT_PUBLIC_KEY_PATH`), o rutas por defecto (`config/keys/public.pem`). Documentación en `.env.example`.
  - Middleware `verificarToken` en `src/middlewares/auth.middleware.js`:
    - Valida criptográficamente la firma RS256 contra la clave pública RSA en memoria local (sin consultar a Django).
    - Valida vigencia temporal (`exp`), emisor (`iss = 'cafe-gestion-django'`), y tipo de token (`token_type = 'access'`).
    - Protección estricta contra ataques de confusión de algoritmos especificando `algorithms: ['RS256']`.
    - Inyecta el usuario decodificado en `req.usuario` (`id`, `username`, `email`, `rol`, `permisos`).
  - Middleware `verificarPermiso(permisoRequerido)` y `verificarRol(...roles)` en `src/middlewares/auth.middleware.js`:
    - Valida la presencia del permiso en `req.usuario.permisos`.
    - Admite acceso irrestricto automático si el usuario tiene rol `DUENIO` (según matriz de `docs/seguridad.md`).
    - Respuestas de error estandarizadas 401 Unauthorized y 403 Forbidden siguiendo estrictamente `docs/api-errores.md`.
  - Protección de rutas HTTP según `docs/seguridad.md` (§5.2):
    - `GET /api/productos/:id/resumen-costo`: protegido con `verificarToken` y `verificarPermiso('recetas.ver_costos')`.
    - `/api/historial-precios` (`GET` y `POST`): protegido con `verificarToken` y `verificarPermiso('insumos.ver')`.
- Suite de pruebas completa en Jest (34 tests en verde, 7 suites):
  - **Tests unitarios puros aislados en `tests/unit/` (18 tests)**:
    - `tests/unit/verificarToken.unit.test.js`: token válido RS256 adjunta `req.usuario` y llama a `next()`; rechazo 401 sin cabecera Authorization; rechazo 401 por formato malformado; rechazo 401 por expiración; rechazo 401 por emisor `iss` incorrecto; rechazo 401 por `token_type` "refresh"; rechazo 401 por firma con clave privada ajena; rechazo 401 por ataque de confusión de algoritmo HS256; rechazo 500 por clave pública no configurada.
    - `tests/unit/verificarPermiso.unit.test.js`: pasa con `next()` ante permiso presente; pasa con `next()` si el rol es `DUENIO` aun sin el permiso explícito en el array; rechaza con 403 cuando el usuario es `CAJERO` y no tiene `recetas.ver_costos`; rechaza con 401 si falta `req.usuario`; pruebas complementarias de `verificarRol`.
  - **Tests de integración / API (16 tests)**:
    - `tests/integration/rutasProtegidas.integration.test.js`: validación de rechazo 401 sin token, 403 con token insuficiente y 200/201 con token autorizado para `/api/productos/:id/resumen-costo` y `/api/historial-precios`.
    - Actualización de `src/tests/error.middleware.test.js` y `src/tests/historialPrecio.test.js` con tokens firmados vía `tests/helpers/auth.helper.js`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Clientes HTTP / PWA ↔ `backend-node`: validación autónoma offline en memoria de firma RS256, expiración, emisor y permisos granulares sobre endpoints protegidos con formato unificado de error.
Problemas y decisiones técnicas:
- **Separación rigurosa de tests unitarios vs integración:** Se aisló la lógica de middlewares en `tests/unit/` utilizando mocks puros de `req`, `res`, `next` y pares de claves RSA generados en memoria con `crypto.generateKeyPairSync`, garantizando que la suite unitaria no dependa de MongoDB, Express ni red.
- **Defensa en profundidad en JWT:** Se fuerza `algorithms: ['RS256']` para neutralizar ataques de confusión donde un atacante firma HMAC con la clave pública, y se valida explícitamente `token_type === 'access'` para evitar el uso accidental o malicioso de refresh tokens en peticiones HTTP.
- **Acceso irrestricto del Dueño:** Conforme a la regla de negocio y matriz de `docs/seguridad.md`, el Dueño posee acceso operativo global, permitiendo el paso tanto si posee el permiso individual como por rol jerárquico.
Archivos tocados:
- `.env.example`
- `backend-node/package.json`
- `backend-node/package-lock.json`
- `backend-node/src/config/env.js`
- `backend-node/src/middlewares/auth.middleware.js`
- `backend-node/src/routes/historialPrecio.routes.js`
- `backend-node/src/routes/productoResumen.routes.js`
- `backend-node/jest.config.js`
- `backend-node/jest.setup.js`
- `backend-node/tests/helpers/auth.helper.js`
- `backend-node/tests/unit/verificarToken.unit.test.js`
- `backend-node/tests/unit/verificarPermiso.unit.test.js`
- `backend-node/tests/integration/rutasProtegidas.integration.test.js`
- `backend-node/src/tests/error.middleware.test.js`
- `backend-node/src/tests/historialPrecio.test.js`
- `docs/CONNECTIONS.md`
- `docs/bitacora.md`
Cómo probarlo:
- En `backend-node/`: ejecutar `npm test` para correr la totalidad de los tests (34 tests en verde).
- En `backend-node/`: ejecutar solo los tests unitarios: `npx jest tests/unit/` (18 tests en verde).
- En `backend-node/`: ejecutar solo los tests de integración: `npx jest tests/integration/` y `npx jest src/tests/`.

---
Fecha: 2026-10-28
Tarea: T2.2 y T2.3 — Implementación de SimpleJWT RS256, roles como plantillas, permisos granulares y suite de tests unitarios
Rama: feature/t2.2-t2.3-auth-jwt-permisos
Cambios realizados:
- En `apps.usuarios`:
  - Definición de constantes, catálogo de 30 permisos granulares y plantillas de roles (`DUENIO`, `ENCARGADO`, `CAJERO`) en `constantes.py` conforme a `docs/seguridad.md`.
  - Definición de excepciones de dominio `ErrorReglaNegocio` y `ErrorSupervivenciaDuenio` en `exceptions.py`.
  - Modelo `PerfilUsuario` (extensión OneToOne de `User`) con rol plantilla y campo `permisos` JSON para sobreescrituras individuales booleanas. Métodos de dominio: `obtener_permisos_completos()`, `tiene_permiso()` y `obtener_permisos_activos()`.
  - Modelo inmutable `RegistroAuditoria` para trazabilidad de altas, modificaciones, cambios de rol, ajustes de permisos y estados de actividad.
  - Servicios de dominio en `services.py`: `crear_personal`, `actualizar_personal`, `desactivar_personal` (desactivación lógica `is_active=False` con revocación en lista negra de tokens), `activar_personal` e `invalidar_tokens_usuario`.
  - Implementación estricta de la regla de supervivencia del último Dueño activo: bloqueo con excepción de dominio ante intentos de desactivación, degradación de rol a Cajero/Encargado o remoción de permisos administrativos críticos (`personal.*`).
  - Serializers DRF en `serializers.py` y `tokens.py`: `CustomTokenObtainPairSerializer` y `CustomTokenRefreshSerializer` inyectando todos los claims del ADR-0001 (`iss`, `sub`, `user_id`, `username`, `email`, `rol`, `permisos`).
  - Generador y cargador de claves criptográficas RSA 2048-bit en `claves.py` con par de desarrollo local en `config/keys/` ignorado por Git.
  - Vistas y ViewSets delgados en `views.py` (`LoginView`, `RefreshView`, `LogoutView`, `UsuarioViewSet`, `RegistroAuditoriaViewSet`) y URLs en `urls.py`.
  - Permisos DRF personalizados en `permissions.py`: `TienePermiso`, `EsDuenio`, `EsEncargadoODuenio`, `PermisoObjetoTurnoCaja` y `PermisoObjetoVenta`.
  - Migración inicial `0001_initial.py` para `apps.usuarios`.
- Suite de pruebas exhaustiva en pytest (72 tests totales en verde):
  - **Tests unitarios aislados** (35 tests):
    - `test_unit_roles_permisos.py`: 8 tests unitarios validando plantillas por rol, overrides booleanos individuales, usuario inactivo, superuser y catálogo.
    - `test_unit_supervivencia_duenio.py`: 14 tests unitarios validando regla de supervivencia del último Dueño activo (desactivación, degradación, revocación de permisos críticos, múltiples dueños, auditoría).
    - `test_unit_jwt_rs256.py`: 8 tests unitarios validando cabecera RS256, firma criptográfica con clave privada, verificación con pública, fallo con clave ajena, claims exactos del ADR-0001, tiempos de vida y fallback de claves.
    - `test_unit_bloqueo_inactivo.py`: 5 tests unitarios validando bloqueo de login y refresh para `is_active=False`, e invalidación en blacklist.
  - **Tests de integración / API** (12 tests):
    - `test_api_auth.py`: 5 tests sobre `/api/auth/token/`, `/api/auth/token/refresh/` y `/api/auth/token/blacklist/`.
    - `test_api_personal.py`: 7 tests sobre `/api/usuarios/`, acciones personalizadas y autorización por permisos y objeto.
- Documentación:
  - `.env.example`: actualización con variables `DJANGO_JWT_PRIVATE_KEY_PATH` y `DJANGO_JWT_PUBLIC_KEY_PATH`.
  - `docs/CONNECTIONS.md`: registro del contrato de emisión centralizada JWT RS256 Django ↔ Node/Clientes.
  - `docs/ARCHITECTURE.md`: incorporación de autenticación asimétrica y modelo de usuarios a los puntos críticos.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Contrato criptográfico asimétrico: Django emite access tokens firmados con clave privada RSA; Node y clientes validan offline con clave pública sin pegarle a PostgreSQL.
Problemas y decisiones técnicas:
- **Diferenciación estricta de tests unitarios vs API:** Se estructuraron carpetas `tests/unit/` y `tests/api/` para que la evaluación académica de tests unitarios verifique la lógica de dominio y servicios de forma aislada sin dependencias de transporte HTTP.
- **Protección multidimensional del último Dueño:** La supervivencia no solo previene marcar `is_active=False`, sino también la degradación del rol (`rol != ROL_DUENIO`) y la revocación de permisos administrativos críticos (`personal.*`) que dejarían al sistema en orfandad operativa.
- **Revocación atómica en blacklist:** Al desactivar a un usuario, todos sus refresh tokens pendientes pasan inmediatamente a `BlacklistedToken`, y el serializador de refresh valida tanto la blacklist como el flag `is_active` en PostgreSQL.
Archivos tocados:
- `.env.example`
- `backend-django/requirements.txt`
- `backend-django/config/settings/base.py`
- `backend-django/config/urls.py`
- `backend-django/apps/usuarios/*`
- `docs/CONNECTIONS.md`
- `docs/ARCHITECTURE.md`
- `docs/bitacora.md`
Cómo probarlo:
- En `backend-django/`: ejecutar `USE_SQLITE=True .venv/bin/pytest -v` (72 tests en verde).
- En `backend-django/`: ejecutar específicamente la suite unitaria: `USE_SQLITE=True .venv/bin/pytest apps/usuarios/tests/unit/ -v` (35 tests unitarios en verde).
- En `backend-django/`: ejecutar la suite de integración de API: `USE_SQLITE=True .venv/bin/pytest apps/usuarios/tests/api/ -v` (12 tests de API en verde).

---
Fecha: 2026-10-18
Tarea: T2.1 - Especificación de seguridad, matriz de roles y ADR de autenticación asimétrica JWT RS256
Rama: feature/t2.1-seguridad-matriz-jwt
Cambios realizados:
- Creación de `docs/seguridad.md`:
  - Definición del modelo de roles como plantillas operativas (`DUENIO`, `ENCARGADO`, `CAJERO`) con permisos granulares booleanos por usuario.
  - Catálogo exhaustivo de permisos granulares por módulo (`ventas`, `caja`, `insumos`, `compras`, `recetas`, `reportes`, `ia`, `personal`, `auditoria`).
  - Reglas de negocio de seguridad: jerarquía de administración exclusiva del Dueño, imposibilidad de otorgar permisos no poseídos, regla de supervivencia del último Dueño activo y arqueo ciego para cajeros.
  - Esquema de desactivación lógica (`is_active = False`) sin borrado físico para salvaguardar la integridad referencial y la trazabilidad histórica de ventas, caja, compras y auditoría.
  - Matriz de endpoints protegidos para Django y Node.
- Creación de `docs/adr/0001-autenticacion-jwt-rs256.md`:
  - Registro formal de la decisión arquitectónica de autenticación asimétrica mediante el algoritmo RS256.
  - Django como único emisor y custodio de la clave privada RSA.
  - Node como validador autónomo con clave pública RSA en memoria sin consultas a la base de usuarios de PostgreSQL ni latencia inter-proceso.
  - Especificación exhaustiva del payload del JWT (claims estándar RFC 7519, `user_id`, `username`, `email`, `rol` y array `permisos`).
  - Políticas de expiración corta (access tokens de 15 min), refresh tokens (24 h) con rotación y lista negra, y gestión de claves en variables de entorno sin versionar secretos en Git.
- Actualización de `docs/arquitectura.md`: registro de la decisión como Aceptada vinculando a `ADR-0001`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Sin nuevas conexiones físicas de red en esta tarea de documentación/arquitectura. Se estableció el contrato criptográfico para la validación de tokens en `backend-node` y `backend-django` para las tareas T2.2 a T2.4.
Problemas y decisiones técnicas:
- **Autonomía y resiliencia en Node sin consultas síncronas:** El esquema asimétrico RS256 permite que `backend-node` valide tokens y autorice sockets en microsegundos sin pegarle a PostgreSQL ni generar un punto de falla si Django está ocupado.
- **Ventana de exposición acotada:** Dado que la validación en Node es local, los cambios de permisos o desactivaciones de usuarios se reflejan en el siguiente refresco del token de acceso (máximo 15 minutos).
- **Trazabilidad estricta y protección contable:** Se descartó el borrado físico de usuarios para evitar rupturas de FK en `Venta`, `TurnoCaja` y `MovimientoCaja`.
Archivos tocados:
- `docs/seguridad.md`
- `docs/adr/0001-autenticacion-jwt-rs256.md`
- `docs/arquitectura.md`
- `docs/bitacora.md`
Cómo probarlo:
- Inspeccionar `docs/seguridad.md` y verificar la coherencia de la matriz de roles y permisos con las reglas de negocio de `docs/PLAN_IMPLEMENTACION.md` (§3).
- Inspeccionar `docs/adr/0001-autenticacion-jwt-rs256.md` y comprobar la validez del esquema asimétrico RS256 y la especificación del payload del JWT.

---
Fecha: 2026-10-18
Tarea: Cierre y validación final de TP 1 — Núcleo de datos y APIs CRUD
Rama: feature/tp1-cierre-bitacora
Cambios realizados:
- Fusión y sincronización exitosa del PR #6 (`feature/tp1-nucleo-crud`) en `main`.
- Estado de pruebas automáticas: 24/24 en Django (`pytest`) y 6/6 en Node (`Jest`) en verde.
- Ejecución de `seed_demo` para poblar insumos, compras de prueba y recetas.
- Verificación manual en navegador de la Browsable API de DRF (`/api/insumos/`, `/api/productos/`, `/api/compras/`).
- Verificación de integración en Node (`/api/productos/1/resumen-costo`): consumo correcto del backend Django en puerto 8000, cálculo exacto de costos (insumos $504 + mano de obra $41.67 = $545.67) y margen bruto ($1654.33, 75.2%).
- Conclusión: Núcleo funcional y persistencia relacional/documental del TP 1 completados y operativos.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Sin nuevas conexiones; se validaron las existentes entre `backend-django` (PostgreSQL 5432), `backend-node` (MongoDB 27017) y la integración Node ↔ Django (`/api/productos/:id/`).
Problemas y decisiones técnicas:
- **Validación end-to-end de consistencia:** Se constató el funcionamiento integrado en entornos locales con datos sembrados vía `seed_demo`, asegurando que tanto la persistencia relacional (Django/PostgreSQL) como documental (Node/MongoDB) responden con el contrato unificado de datos y cálculos precisos de costeo.
Archivos tocados:
- `docs/bitacora.md`
Cómo probarlo:
- En `backend-django`: ejecutar `pytest` (24 pruebas en verde).
- En `backend-django`: ejecutar `python manage.py seed_demo`.
- En `backend-node`: ejecutar `npm test` (6 pruebas en verde).
- Acceder desde el navegador a la Browsable API en `http://localhost:8000/api/insumos/`, `http://localhost:8000/api/productos/` y `http://localhost:8000/api/compras/`.
- Consultar `http://localhost:3000/api/productos/1/resumen-costo` en Node y verificar el desglose de costos (insumos $504 + mano de obra $41.67 = $545.67) y margen bruto ($1654.33, 75.2%).
---
Fecha: 2026-10-17
Tarea: TP 1 — Núcleo de datos y APIs CRUD (T1.1 a T1.13)
Rama: feature/tp1-nucleo-crud
Cambios realizados:
- Inicialización del repositorio Git, configuración de branch base `main` y creación de rama aislada de trabajo `feature/tp1-nucleo-crud` (sin merge a main).
- Definición formal del contrato único de errores HTTP en `docs/api-errores.md` (`{ "mensaje": "...", "detalles": ... }`).
- En `backend-django`:
  - Incorporación de dependencias `djangorestframework` y `django-filter` en `requirements.txt`.
  - Configuración de paginación estándar `{ datos, pagina, limite, total }` y manejador de excepciones unificado en `apps/comun/`.
  - Creación de app `apps.insumos`: modelos `Proveedor`, `Insumo` (unidades base g, ml, un) y `Compra`; servicios de conversión de unidades, prorrateo de envío proporcional al valor de compra y cálculo seguro de costo unitario; ViewSets y Serializers con validaciones para evitar `#DIV/0!` y re-stocks distorsionados.
  - Creación de app `apps.recetas`: modelos `Producto` (con `codigo_barras`) y `RecetaItem`; servicios de cálculo de costo total (insumos + mano de obra + descartables), ganancia bruta, margen bruto y recálculo explícito ante cambios de insumos (`recalcular_recetas_por_insumo`).
  - Creación de app `apps.caja`: modelos `TurnoCaja` y `MovimientoCaja`; servicio/acción de cierre de caja calculando efectivo esperado y diferencia.
  - Creación de app `apps.ventas`: modelos `Venta` (con `origen` propio/importado) y `VentaItem`; servicio de registro atómico con congelamiento de `costo_unitario_snapshot` para auditoría contable histórica.
  - Comando de gestión `python manage.py seed_demo` con catálogo de cafetería anonimizado.
  - Migraciones completas generadas y aplicadas.
  - 24 tests automatizados en `pytest` cubriendo conversión de unidades, casos del Excel, congelamiento de costos en ventas y contrato de endpoints.
- En `backend-node`:
  - Instalación de `mongoose` y `express-validator`.
  - Conexión a MongoDB en `src/config/db.js`.
  - Creación de modelos Mongoose `HistorialPrecio` y `SnapshotCosteo`.
  - Arquitectura en capas: repositorios, servicios y controladores para historial y snapshots.
  - Middleware de errores unificado `src/middlewares/error.middleware.js` y validación de campos.
  - Cliente HTTP tolerante a fallos `src/clients/django.client.js` hacia Django con timeout acotado (3000ms) y respuesta degradada (`docs/integracion.md`).
  - Endpoint integrado `GET /api/productos/:id/resumen-costo`.
  - 6 tests automatizados en `Jest` cubriendo middleware de errores, cliente degradado, salud y persistencia en MongoDB.
- Creación de colección versionada de peticiones HTTP en `docs/api/requests.http`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- `backend-django` ↔ `PostgreSQL` (5432, base `cafe_gestion` con soporte configurable para test/desarrollo).
- `backend-node` ↔ `MongoDB` (27017, base `cafe_gestion`).
- `backend-node` ↔ `backend-django` (`/api/productos/:id/` con timeout y degradación elegante).
Problemas y decisiones técnicas:
- **Prevención de distorsiones contables por re-stock:** se separó la compra (total pagado por lote + cantidad) del costo unitario base (total / cantidad convertida), resolviendo la falla de márgenes negativos del Excel del dueño.
- **Congelamiento de costo en ventas:** cada ticket guarda el costo vigente al momento de la transacción en `costo_unitario_snapshot`, evitando que un cambio futuro de costos reescriba la rentabilidad pasada.
- **Tolerancia a fallos en la integración Node ↔ Django:** si Django cae o sufre retrasos, el endpoint de Node no colapsa; retorna el historial de Mongo con un estado degradado explícito.
Archivos tocados:
- `docs/api-errores.md`
- `docs/integracion.md`
- `docs/CONNECTIONS.md`
- `docs/bitacora.md`
- `docs/api/requests.http`
- `backend-django/requirements.txt`
- `backend-django/config/settings/base.py`
- `backend-django/config/urls.py`
- `backend-django/apps/comun/*`
- `backend-django/apps/insumos/*`
- `backend-django/apps/recetas/*`
- `backend-django/apps/caja/*`
- `backend-django/apps/ventas/*`
- `backend-node/package.json`
- `backend-node/server.js`
- `backend-node/app.js`
- `backend-node/src/config/*`
- `backend-node/src/models/*`
- `backend-node/src/repositories/*`
- `backend-node/src/services/*`
- `backend-node/src/controllers/*`
- `backend-node/src/routes/*`
- `backend-node/src/middlewares/*`
- `backend-node/src/clients/*`
- `backend-node/src/tests/*`
Cómo probarlo:
- En `backend-django`: ejecutar `pytest` (24 tests en verde).
- En `backend-django`: ejecutar `python manage.py seed_demo`.
- En `backend-node`: ejecutar `npm test` (6 tests en verde).
- Ejecutar las peticiones de `docs/api/requests.http` para verificar endpoints de ambos servicios.
---
Fecha: 2026-10-16
Tarea: T0.7 - Resolución de arquitectura local, hardware del local y cliente PWA
Rama: feature/t0.7-arquitectura-local-pwa
Cambios realizados:
- En `docs/PROPUESTA.md`: se incorporó el requisito no funcional de alta disponibilidad ante cortes de internet mediante operación en red local (LAN); se agregó el atributo `codigo_barras` al modelo `PRODUCTO` y el criterio CA4.4 en la HU4 para lectura por código de barras en caja; se desglosó la HU13 separando la Carta Digital pública por QR (HU15, pasa a prioridad *Should*) del resumen semanal con IA (HU13, se mantiene en *Could*); y se explicitó en "Fuera de alcance" que no se desarrollará una app nativa en Electron ni sincronización bidireccional compleja (nube ↔ local).
- En `docs/PLAN_IMPLEMENTACION.md`: se actualizaron los supuestos de la sección 0 y la planificación en la sección 6 confirmando la modalidad de despliegue **PC Local con Docker Compose** (respaldada por la sección 3.5 de la Guía de cátedra), la adopción de una **PWA instalable** para la operación de caja y las medidas de mitigación para el equipo de 8 GB de RAM del comercio.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Sin cambios en código de servicios; se documenta la sincronización unidireccional de `menu_digital` hacia la Carta Digital pública y la entrada por lector HID para `Producto.codigo_barras`.
Problemas y decisiones técnicas:
- **PWA instalable vs. Electron:** el equipo del local cuenta con ~8 GB de RAM, donde ya deben convivir Docker Compose, PostgreSQL, MongoDB, Django, Node y `ai-service`. Empaquetar el cliente en Electron implicaría levantar una instancia dedicada de Chromium + Node con un alto costo de memoria RAM y mayor carga de mantenimiento. Una PWA instalable brinda experiencia de aplicación de escritorio y funcionamiento en red local (LAN) reutilizando el navegador sin sobrecargar el hardware.
- **Tolerancia a cortes de internet (operación local) y mitigación de RAM:** toda la operatoria crítica (caja, ventas, stock, recetas y costeo) corre en la PC local del comercio con Docker Compose (sección 3.5 de la Guía), evitando que un corte de internet detenga las ventas. Para no saturar los 8 GB de RAM: (1) no se ejecuta Ollama local en la PC del comercio, consumiendo Gemini API mediante el adapter con degradación elegante a carga manual/CSV si cae internet, y (2) se limita el consumo de memoria de MongoDB en Docker Compose.
- **Soporte para lector de código de barras:** se incorpora el campo `codigo_barras` en `Producto` (HU4) para integrarse de forma directa con lectores estándar por emulación de teclado (HID) en la interfaz de caja, agilizando el cobro sin requerir drivers propietarios.
Archivos tocados:
- `docs/PROPUESTA.md`
- `docs/PLAN_IMPLEMENTACION.md`
- `docs/bitacora.md`
Cómo probarlo:
- Ejecutar `git diff docs/PROPUESTA.md docs/PLAN_IMPLEMENTACION.md docs/bitacora.md` para verificar los cambios documentales y comprobar en un visor Markdown que el diagrama `erDiagram` de `docs/PROPUESTA.md` (con `codigo_barras` en `PRODUCTO`) renderiza correctamente.
---

