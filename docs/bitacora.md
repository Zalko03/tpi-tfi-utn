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
Fecha: 2026-10-29
Tarea: T3.2 — Node consume `ai-service` (`POST /api/importaciones` 202 asíncrono) y persistencia de trazabilidad en MongoDB
Rama: feature/t3.2-node-consume-ia
Cambios realizados:
- En `backend-node`:
  - `src/config/env.js`: incorporación de `aiServiceUrl` (`AI_SERVICE_URL`, por defecto `http://localhost:8001`).
  - `src/clients/ai.client.js`: cliente HTTP `extraerPreciosIA` hacia `POST /v1/extraer-precios` de `ai-service` con `AbortSignal.timeout(12000)`, traducción de `snake_case` a `camelCase` en un único punto, validación estricta de esquema (`validarItemExtraido` y `validarYNormalizarSalidaIA`) y retorno de estado de contingencia ante errores de red o respuestas inválidas.
  - `src/models/ImportacionIA.js`: esquema Mongoose para la colección `importaciones_ia` registrando `usuarioId`, `entrada` (`textoLista`, `proveedorNombre`), `salida` (`proveedorDetectado`, `envioDetectado`, `moneda`, `items`, `advertencias`), `estado` (`PENDIENTE`, `PROCESANDO`, `LISTA`, `CONTINGENCIA`, `APROBADA`, `RECHAZADA`, `FALLIDA`), `versionPrompt`, `proveedorIa`, `latenciaMs`, `contingencia` y `mensajeError`. Los importes y cantidades se almacenan como cadenas decimales exactas (`String`) para evitar pérdida de precisión por punto flotante.
  - `src/repositories/importacionIA.repository.js`: funciones de acceso a datos `crearImportacion`, `obtenerImportacionPorId`, `actualizarImportacionPorId` y `listarImportaciones` con paginación estándar `{ datos, pagina, limite, total }`.
  - `src/services/importacionIA.service.js`: servicio `iniciarImportacionPrecios` que crea el registro en estado `PENDIENTE`, dispara `procesarImportacionEnSegundoPlano` mediante `setImmediate` sin bloquear el hilo de respuesta HTTP y actualiza el documento en MongoDB al finalizar.
  - `src/controllers/importacionIA.controller.js` y `src/routes/importacionIA.routes.js`: endpoints `POST /`, `GET /` y `GET /:id` protegidos con `verificarToken` y `verificarPermiso('ia.importar_listas')`, montados en `app.js` bajo `/api/importaciones` y `/importaciones`.
- Suite de pruebas en Jest (81 tests totales en verde, 14 suites):
  - `tests/unit/aiClient.unit.test.js`: 6 tests unitarios verificando validación de ítems, normalización `snake_case` → `camelCase`, preservación de strings decimales y contingencia ante caída de `ai-service`.
  - `tests/integration/importacionIA.integration.test.js`: 6 tests de integración verificando rechazo 401 sin token, rechazo 403 sin `ia.importar_listas`, rechazo 400 ante datos inválidos, respuesta inmediata HTTP 202 Accepted, persistencia completa en MongoDB (`LISTA` y `CONTINGENCIA`), listado paginado y error 404.
- Documentación:
  - Actualización de `docs/CONNECTIONS.md`, `docs/seguridad.md` y `docs/bitacora.md`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Clientes HTTP / PWA ↔ `backend-node` (`POST /api/importaciones`, `GET /api/importaciones`, `GET /api/importaciones/:id` con permiso `ia.importar_listas`).
- `backend-node` (`ai.client.js`) ↔ `ai-service` (`POST /v1/extraer-precios` con timeout y degradación).
- `backend-node` ↔ MongoDB (nueva colección `importaciones_ia`).
Problemas y decisiones técnicas:
- **Procesamiento asíncrono no bloqueante (HTTP 202):** Cumpliendo CA7.1 y el paso 1 del flujo de arquitectura, el endpoint registra la solicitud en estado `PENDIENTE`, responde `202 Accepted` de inmediato con el `importacionId` y delega la llamada a `ai-service` a `procesarImportacionEnSegundoPlano`.
- **Doble validación de salida de IA:** Además de la validación con Pydantic v2 en `ai-service`, `ai.client.js` verifica en Node que cada ítem recibido tenga cantidad y precio positivos y unidad válida antes de guardarlo en MongoDB (cumpliendo `convenciones-node.md` §8).
Archivos tocados:
- `backend-node/app.js`
- `backend-node/src/config/env.js`
- `backend-node/src/clients/ai.client.js`
- `backend-node/src/models/ImportacionIA.js`
- `backend-node/src/repositories/importacionIA.repository.js`
- `backend-node/src/services/importacionIA.service.js`
- `backend-node/src/controllers/importacionIA.controller.js`
- `backend-node/src/routes/importacionIA.routes.js`
- `backend-node/tests/unit/aiClient.unit.test.js`
- `backend-node/tests/integration/importacionIA.integration.test.js`
- `docs/CONNECTIONS.md`
- `docs/seguridad.md`
- `docs/bitacora.md`
Cómo probarlo:
- En `backend-node/`: ejecutar `npm test` (14 suites, 81 tests en verde).
- Ejecutar únicamente los tests de importación con IA: `npx jest tests/unit/aiClient.unit.test.js tests/integration/importacionIA.integration.test.js`.

---
Fecha: 2026-10-29
Tarea: T3.1 — Construcción de `ai-service` en FastAPI con esquemas Pydantic v2, prompts versionados y patrón Adapter (Gemini API / Ollama)
Rama: feature/t3.1-ai-service-fastapi
Cambios realizados:
- Creación del microservicio `ai-service/` siguiendo la estructura de `.agents/rules/convenciones-python.md` (§4):
  - `app/main.py` y `app/routers/salud.py`: inicialización de la aplicación FastAPI con documentación OpenAPI y endpoint `GET /health` (`{"estado": "ok", "servicio": "ai-service"}`).
  - `app/excepciones.py`: manejadores personalizados para `RequestValidationError`, `StarletteHTTPException`, `ErrorDominioIA` y excepciones no controladas, garantizando el contrato único de errores `{ "mensaje": "...", "detalles": ... }` de `docs/api-errores.md` (convirtiendo el 422 por defecto de FastAPI en HTTP 400 Bad Request para paridad con Django y Express).
  - `app/schemas/`: esquemas Pydantic v2 con ejemplos OpenAPI (`json_schema_extra`) para `POST /v1/extraer-precios` (`SolicitudExtraccionPrecios`, `ItemPrecioExtraido`, `SalidaIAExtraccionPrecios`, `RespuestaExtraccionPrecios`) y `POST /v1/resumen-semanal` (`SolicitudResumenSemanal`, `ProductoRendimientoEntrada`, `SugerenciaRotacionItem`, `SalidaIAResumenSemanal`, `RespuestaResumenSemanal`). Uso estricto de `Decimal` para montos y cantidades, y normalización de unidades compatibles con `backend-django`.
  - `app/prompts/v1/` y `app/services/prompts.py`: prompts versionados (`extraer_precios.txt` y `resumen_semanal.txt`) con cargador protegido contra *path traversal*.
  - `app/services/proveedor_ia.py`: interfaz abstracta `ProveedorIA` e implementaciones `GeminiAdapter` (proveedor externo principal por REST HTTPS con cabecera `x-goog-api-key`) y `OllamaAdapter` (soporte local opcional en `/api/chat`), seleccionables mediante `AI_PROVIDER`.
  - `app/services/extraccion.py`, `app/services/resumen.py` y `app/routers/ia.py`: servicios de negocio que ejecutan las llamadas con timeout (`AI_TIMEOUT_SECONDS`), reintentos acotados (`AI_MAX_RETRIES`), validación estricta de salida con Pydantic v2 y retorno automático de respuesta de contingencia (`contingencia: true`) ante caídas o respuestas inválidas de la IA.
- Suite de pruebas automatizadas en `pytest` (57 tests en verde):
  - `app/tests/unit/test_unit_schemas.py`: validaciones de `Decimal`, normalización de unidades y rechazo de montos/cantidades no positivas.
  - `app/tests/unit/test_unit_prompts.py`: lectura de prompts v1 y bloqueo de *path traversal*.
  - `app/tests/unit/test_unit_adapters_y_servicios.py`: pruebas aisladas de `GeminiAdapter`, `OllamaAdapter`, separación de `system` y `user`, reintentos y activación de contingencia ante timeouts o fallos de esquema.
  - `app/tests/api/test_api_endpoints.py`: pruebas de contrato HTTP 200/400/404 y presencia de ejemplos en `/openapi.json`.
- Documentación y configuración:
  - Creación de `docs/adr/0002-adaptador-proveedor-ia.md` registrando formalmente la decisión del patrón Adapter y el uso de Gemini API para mitigar el límite de 8 GB de RAM del comercio.
  - Actualización de `.env.example`, `docs/arquitectura.md`, `docs/ARCHITECTURE.md` y `docs/CONNECTIONS.md`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- `backend-node` / Clientes internos ↔ `ai-service` (`GET /health`, `POST /v1/extraer-precios`, `POST /v1/resumen-semanal` en puerto 8001).
- `ai-service` (`ProveedorIA`) ↔ Proveedor de IA (`GeminiAdapter` HTTPS / `OllamaAdapter` HTTP 11434).
Problemas y decisiones técnicas:
- **Prevención de Prompt Injection (datos separados de instrucciones):** Cumpliendo `.agents/rules/convenciones-python.md` (§4), el texto de la lista del proveedor nunca se concatena dentro de las instrucciones del prompt; las instrucciones viajan en `system_instruction` / `role: "system"` y la entrada del usuario se envía por separado como un JSON de datos en `role: "user"`.
- **Clave de API en cabecera y no en URL:** En `GeminiAdapter`, `GEMINI_API_KEY` se transmite mediante la cabecera `x-goog-api-key` en lugar del query param `?key=`, evitando que trazas de red o excepciones de `httpx` filtren el secreto en los logs.
- **Uso directo de `httpx` asíncrono en el Adapter:** Permite manejar timeouts exactos y mantener dependencias livianas sin arrastrar SDKs pesados con extensiones nativas de gRPC.
Archivos tocados:
- `.env.example`
- `ai-service/requirements.txt`
- `ai-service/pytest.ini`
- `ai-service/app/*`
- `docs/adr/0002-adaptador-proveedor-ia.md`
- `docs/arquitectura.md`
- `docs/ARCHITECTURE.md`
- `docs/CONNECTIONS.md`
- `docs/bitacora.md`
Cómo probarlo:
- En `ai-service/`: ejecutar `.\.venv\Scripts\python.exe -m pytest -v` (57 tests en verde).
- Levantar el servidor de desarrollo: `cd ai-service; .\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8001` y abrir `http://localhost:8001/docs` para inspeccionar el esquema OpenAPI con sus ejemplos interactivos.
- Verificar el endpoint de salud: `GET http://localhost:8001/health`.

---
Fecha: 2026-10-28
Tarea: T2.7 — Revisión de secretos, auditoría cruzada de seguridad y cierre formal del TP 2
Rama: feature/t2.7-auditoria-secretos-cierre-tp2
Cambios realizados:
- Auditoría estática y escaneo de secretos sobre código fuente e historial completo de Git:
  - Verificación de 0 archivos `.env` versionados tanto en el árbol de trabajo actual como en la totalidad del historial de commits (`git log --all --full-history`).
  - Verificación de 0 claves privadas RSA versionadas en el repositorio. Los archivos locales `private.pem` y `public.pem` se encuentran correctamente ignorados por `.gitignore` (`backend-django/config/keys/`, `backend-node/config/keys/`, `*.pem`, `*.key`).
  - Confirmación de uso de generación efímera en memoria para pruebas automáticas (`generar_par_rsa_strings()` en pytest y `crypto.generateKeyPairSync` en Jest), garantizando suites 100% aisladas e independientes de claves fijas en disco.
  - Verificación de ausencia de datos reales del negocio gastronómico (precios, teléfonos o datos personales reales), empleando datos anonimizados.
- Verificación y refuerzo de paridad en `.env.example`:
  - Documentación de correspondencia 1:1 de variables consumidas por Django y Node.
  - Inclusión de variable opcional `USE_SQLITE=False` para tests aislados y desarrollo ligero sin PostgreSQL.
  - Documentación de inyección directa de claves PEM en strings para entornos CI/CD (`DJANGO_JWT_PRIVATE_KEY` / `DJANGO_JWT_PUBLIC_KEY`).
  - Unificación explícita de `CORS_ALLOWED_ORIGINS` para ambos backends (con alias de compatibilidad `CLIENT_ORIGIN` en Node).
- Redacción del informe de auditoría cruzada en `docs/auditoria-seguridad-tp2.md`:
  - Registro de metodología de auditoría y comandos de escaneo ejecutados.
  - Tabla comparativa de paridad de variables de entorno.
  - Matriz de riesgos mitigados (R1 a R8): Criptografía asimétrica JWT RS256 ([ADR-0001](file:///home/evilkitty/Escritorio/tfi/tpi-tfi-utn/docs/adr/0001-autenticacion-jwt-rs256.md)), escalada de privilegios y autorización a nivel de objeto, regla de supervivencia del Dueño contra orfandad administrativa, principio de arqueo ciego para cajeros en cierre de turno, inyección NoSQL en MongoDB mediante middleware `sanitizarNoSql`, fuerza bruta y DoS mitigados con Throttling en DRF y `express-rate-limit`, lista blanca de CORS restrictiva sin comodín `*`, y sanitización activa de logs en consola y logger.
  - Resumen de cobertura de pruebas de seguridad: 387 tests automatizados en verde (318 Django + 69 Node).
  - Plan de remediación y recomendaciones para TP 3 y TP 4 (rotación de claves, secret scanning en CI/CD y handshake seguro en WebSockets).
- Vinculación del informe desde `docs/seguridad.md` (§7).
- Cierre formal del hito **TP 2 (Autenticación y Seguridad)**.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Auditoría y validación de conexiones 10, 11, 12 y 13 con cero hallazgos críticos de seguridad.
Problemas y decisiones técnicas:
- **Aislamiento criptográfico en testing:** Se constató que las suites de pruebas no requieren claves fijas en disco ni secretos preconfigurados, lo que previene filtraciones accidentales al correr tests o construir entornos de CI.
- **Transparencia en configuración:** Se consolidaron todas las variables en un único `.env.example` comentado, manteniendo valores de plantilla (`cambia-esto`) para asegurar clonado limpio reproducible.
Archivos tocados:
- `.env.example`
- `docs/auditoria-seguridad-tp2.md`
- `docs/seguridad.md`
- `docs/bitacora.md`
Cómo probarlo:
- Escaneo estático en Git: `git log --all --full-history -- "**/.*env*" "*env*"` (verifica que ningún `.env` fue versionado).
- Escaneo de claves privadas: `git log -p -S "BEGIN " --all` (0 claves privadas en historial).
- Verificación de exclusión en `.gitignore`: `git check-ignore backend-django/config/keys/private.pem backend-django/config/keys/public.pem`.
- Ejecutar tests en `backend-django/`: `USE_SQLITE=True .venv/bin/pytest -v` (318 tests en verde).
- Ejecutar tests en `backend-node/`: `npm test` (69 tests en verde, 12 suites).
- Inspección del informe de auditoría: `docs/auditoria-seguridad-tp2.md`.


---
Fecha: 2026-10-28
Tarea: T2.6 — Pruebas Negativas Sistemáticas por Permiso y protección completa de endpoints
Rama: feature/t2.6-tests-negativos-permisos
Cambios realizados:
- En `backend-django`:
  - Protección completa de todos los ViewSets de negocio aplicando verificación granular con `TienePermiso`, `PermisoObjetoTurnoCaja` y `PermisoObjetoVenta` según la matriz de `docs/seguridad.md` (§2 y §5):
    - `ProveedorViewSet` e `InsumoViewSet`: `insumos.ver` (list/retrieve), `insumos.crear` (create), `insumos.editar` (update/partial_update), `insumos.eliminar` (destroy).
    - `CompraViewSet`: `compras.ver` (list/retrieve), `compras.registrar` (create/update/destroy).
    - `ProductoViewSet` y `RecetaItemViewSet`: `recetas.ver` (list/retrieve), `recetas.crear` (create), `recetas.editar` (update/partial_update), `recetas.eliminar` (destroy), `recetas.ver_costos` (recalcular y costo).
    - Endpoint dedicado `GET /api/productos/:id/costo/` para inspección protegida de márgenes y costo total.
    - Enmascaramiento contable en `ProductoSerializer`: si el usuario carece de `recetas.ver_costos`, los campos `costo_total_calculado`, `ganancia_bruta`, `margen_bruto` e `insumo_costo_unitario` se serializan como `None`.
    - `TurnoCajaViewSet`: `caja.abrir_turno` (create/list), `caja.cerrar_turno` y `PermisoObjetoTurnoCaja` (cerrar), `caja.gestionar_turnos_ajenos` (update/destroy). Enrutamiento dual retrocompatible para `/api/turnos/` y `/api/caja/turnos/`.
    - Implementación del principio de **Arqueo Ciego** en `TurnoCajaViewSet.cerrar` y `TurnoCajaSerializer`: si el usuario no posee `caja.ver_efectivo_esperado` (rol CAJERO por defecto), los campos `efectivo_esperado` y `diferencia` se retornan como `None`.
    - `MovimientoCajaViewSet`: `caja.registrar_movimiento` (create/list/retrieve) y `caja.gestionar_turnos_ajenos` (update/destroy). Enrutamiento dual para `/api/movimientos-caja/` y `/api/caja/movimientos-caja/`.
    - `VentaViewSet`: `ventas.cobrar_ticket` (create con validación de turno abierto del propio cajero en `VentaSerializer`), `ventas.ver_historial_propio` (list/retrieve), `ventas.anular_ticket` (anular, update, destroy). Filtrado de queryset por operador en `list` y validación de objeto `PermisoObjetoVenta` en `retrieve`.
    - Adaptación de fixtures existentes en `apps/comun/tests/test_api_endpoints.py` para autenticar peticiones con usuario con permisos vigentes.
- En `backend-node`:
  - Protección de rutas en `src/routes/snapshotCosteo.routes.js` con middlewares `verificarToken` y `verificarPermiso('recetas.ver_costos')`.
  - Actualización de fixtures de autenticación en `src/tests/error.middleware.test.js`.
- Suite exhaustiva de pruebas (387 tests totales en verde: 318 Django, 69 Node):
  - **Tests unitarios puros (`tests/unit/`)**:
    - `backend-django/apps/usuarios/tests/unit/test_unit_permisos_drf.py` (198 tests): evaluación de `has_permission` para los 30 permisos del catálogo en múltiples estados (habilitado, inhabilitado, no autenticado, inactivo, superuser, fallback a JWT), tests de `EsDuenio` y `EsEncargadoODuenio`, tests de objeto para `PermisoObjetoTurnoCaja` y `PermisoObjetoVenta`, y tests de serializadores para arqueo ciego y ocultamiento de costos sin BD.
    - `backend-node/tests/unit/verificarPermiso.unit.test.js` (17 tests): parametrización exhaustiva verificando rechazo con 403 Forbidden y contrato `{ mensaje, detalles }` ante la ausencia de permisos del catálogo.
  - **Tests de integración y API (`tests/api/` y `tests/integration/`)**:
    - `backend-django/apps/comun/tests/api/test_api_permisos_negativos.py` (37 tests): verificación sistemática de HTTP 403 Forbidden y contrato de error en todos los endpoints de negocio (insumos, proveedores, compras, recetas, productos/costos, ventas, turnos de caja, movimientos, personal y auditoría), overrides booleanos individuales y validaciones de objeto y arqueo ciego.
    - `backend-node/tests/integration/rutasProtegidas.integration.test.js` (16 tests): cobertura completa para endpoints protegidos `/api/productos/:id/resumen-costo`, `/api/historial-precios` y `/api/snapshots-costeo`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Conexión 11 actualizada: `/api/snapshots-costeo` añadido a rutas con autorización granular en Node.
- Conexión 13 incorporada: `backend-django` (Autorización Granular y Objeto T2.6) formalizando el control sistemático de acceso en todos los módulos transaccionales.
Problemas y decisiones técnicas:
- **Diferenciación entre listado y detalle en reglas de objeto:** Para que los cajeros solo vean sus propios turnos y ventas en listados sin causar errores 404 en operaciones específicas, `get_queryset` aplica filtro por operador únicamente en `action == "list"`, mientras que las acciones individuales (`retrieve`, `cerrar`, `anular`) evalúan las clases de objeto (`PermisoObjetoTurnoCaja`, `PermisoObjetoVenta`), respondiendo exactamente con HTTP 403 Forbidden si el objeto pertenece a otro usuario.
- **Arqueo Ciego en Serializador y Acción:** Se garantizó que el saldo teórico esperado y la diferencia no se filtren ni en la respuesta inmediata del cierre ni en la consulta posterior del turno por parte de usuarios sin `caja.ver_efectivo_esperado`.
Archivos tocados:
- `backend-django/apps/usuarios/permissions.py`
- `backend-django/apps/insumos/views.py`
- `backend-django/apps/recetas/views.py`
- `backend-django/apps/recetas/serializers.py`
- `backend-django/apps/caja/views.py`
- `backend-django/apps/caja/serializers.py`
- `backend-django/apps/caja/urls.py`
- `backend-django/apps/ventas/views.py`
- `backend-django/apps/ventas/serializers.py`
- `backend-django/apps/comun/tests/test_api_endpoints.py`
- `backend-django/apps/usuarios/tests/unit/test_unit_permisos_drf.py`
- `backend-django/apps/comun/tests/api/test_api_permisos_negativos.py`
- `backend-node/src/routes/snapshotCosteo.routes.js`
- `backend-node/src/tests/error.middleware.test.js`
- `backend-node/tests/unit/verificarPermiso.unit.test.js`
- `backend-node/tests/integration/rutasProtegidas.integration.test.js`
- `docs/CONNECTIONS.md`
- `docs/bitacora.md`
Cómo probarlo:
- En `backend-django/`: ejecutar `USE_SQLITE=True .venv/bin/pytest -v` (318 tests en verde).
- En `backend-django/`: ejecutar solo tests unitarios de permisos: `USE_SQLITE=True .venv/bin/pytest apps/usuarios/tests/unit/test_unit_permisos_drf.py -v`.
- En `backend-django/`: ejecutar solo tests negativos de endpoints: `USE_SQLITE=True .venv/bin/pytest apps/comun/tests/api/test_api_permisos_negativos.py -v`.
- En `backend-node/`: ejecutar `npm test` (69 tests en verde, 12 suites).
- En `backend-node/`: ejecutar solo tests unitarios de permisos: `npm test -- tests/unit/verificarPermiso.unit.test.js`.
- En `backend-node/`: ejecutar solo tests de rutas protegidas: `npm test -- tests/integration/rutasProtegidas.integration.test.js`.

---
Fecha: 2026-10-28
Tarea: T2.5 — Endurecimiento de seguridad (Hardening) en backend-django y backend-node
Rama: feature/t2.5-endurecimiento-seguridad
Cambios realizados:
- En `backend-django`:
  - Instalación y configuración de `django-cors-headers` (>=4.9.0) con lista blanca explícita de orígenes (`CORS_ALLOWED_ORIGINS`) leída desde el entorno, deshabilitando completamente el comodín '*' (`CORS_ALLOW_ALL_ORIGINS = False`).
  - Configuración de Throttling perimetral en Django REST Framework:
    - `LoginRateThrottle` (`AnonRateThrottle`, scope: `login`) aplicado sobre `POST /api/auth/token/` para mitigar ataques de fuerza bruta y adivinación de credenciales.
    - `RecalculoRateThrottle` (`UserRateThrottle`, scope: `recalcular`) aplicado sobre `POST /api/productos/:id/recalcular/` para limitar el uso de endpoints de cómputo intensivo.
    - Adaptación del manejador de excepciones unificado en `apps/comun/excepciones.py` para devolver HTTP 429 Too Many Requests con el mensaje estandarizado `"Demasiadas peticiones. Intente nuevamente en unos minutos"` y el tiempo de espera en `detalles`.
  - Configuración de logging de seguridad en `apps/comun/logging.py` con el filtro `FiltroSanitizacionSeguridad` para enmascarar automáticamente credenciales, contraseñas, tokens y cabeceras `Authorization: Bearer` en las salidas de consola y logs del servidor.
- En `backend-node`:
  - Instalación y configuración de `express-rate-limit` (^7.5.0) en `src/middlewares/rateLimit.middleware.js`:
    - `limitadorGeneral`: rate limit perimetral para la API con respuesta uniforme HTTP 429.
    - `limitadorConsultasCostosas`: limitador restrictivo montado sobre `GET /api/productos/:id/resumen-costo`.
    - `crearLimitadorTest`: helper configurable para tests aislados.
  - Endurecimiento de CORS en `src/middlewares/cors.middleware.js`:
    - Validación contra lista blanca en `src/config/env.js` (`obtenerOrigenesPermitidos`), rechazando orígenes no autorizados con HTTP 403 y prohibiendo el comodín '*'.
  - Cabeceras HTTP seguras con `helmet` en `app.js` (Content Security Policy, X-Content-Type-Options: nosniff, X-Frame-Options, HidePoweredBy).
  - Middleware de prevención de inyección NoSQL en `src/middlewares/nosqlSanitize.middleware.js`:
    - Inspección recursiva de `body`, `query` y `params` para detectar y bloquear operadores MongoDB (`$` o `.`), respondiendo con HTTP 400 Bad Request y formato estandarizado.
  - Validación estricta de parámetros en `src/routes/productoResumen.routes.js` con `express-validator` (verificando que `:id` sea numérico).
  - Utilidad de sanitización de logs en `src/utils/sanitizarLogs.js` (`enmascararDatosSensibles`).
- Suite de pruebas completa (139 tests totales en verde: 83 Django, 56 Node):
  - **Tests unitarios puros (`tests/unit/`)**:
    - `backend-node/tests/unit/nosqlSanitize.unit.test.js` (8 tests): detección de operadores `$`, subdocumentos `.`, arrays, rechazo con 400 en body/query y paso de peticiones limpias.
    - `backend-node/tests/unit/sanitizarLogs.unit.test.js` (4 tests): enmascaramiento recursivo de credenciales en objetos, anidados y arrays.
    - `backend-node/tests/unit/corsWhitelist.unit.test.js` (3 tests): autorización de orígenes en lista blanca, rechazo 403 a orígenes foráneos y soporte a peticiones sin Origin.
    - `backend-node/tests/unit/rateLimit.unit.test.js` (2 tests): comportamiento de rate limiter y respuesta HTTP 429 al superar el límite.
    - `backend-django/apps/comun/tests/unit/test_unit_throttling.py` (4 tests): verificación de scopes, tasas y resolución de IPs remotas.
    - `backend-django/apps/comun/tests/unit/test_unit_logging_sanitizer.py` (4 tests): enmascaramiento de passwords, cabeceras Bearer, tokens refresh y preservación de mensajes limpios.
  - **Tests de integración / API**:
    - `backend-node/tests/integration/seguridadHardening.integration.test.js` (5 tests): cabeceras Helmet, autorización y rechazo CORS, bloqueo NoSQL 400 y validación de parámetros.
    - `backend-django/apps/comun/tests/api/test_api_hardening.py` (3 tests): emisión de CORS para orígenes autorizados, rechazo para orígenes no permitidos y bloqueo 429 con formato unificado al superar el umbral de login.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Perímetro de transporte endurecido: Clientes HTTP / PWA ↔ `backend-django` / `backend-node` protegido con CORS sin comodín, Rate Limiting perimetral, cabeceras Helmet, filtro anti-inyección NoSQL y sanitización de secretos en logs.
Problemas y decisiones técnicas:
- **Rechazo explícito vs sanitización silenciosa en NoSQL:** En lugar de mutar silenciosamente el payload removiendo claves maliciosas, se optó por rechazar inmediatamente la petición con HTTP 400 y formato unificado de error, alertando al cliente y dejando trazas de seguridad claras.
- **Respeto riguroso de `docs/api-errores.md` en HTTP 429:** Tanto en Django como en Express, la superación de límites de tasa devuelve `{ "mensaje": "Demasiadas peticiones. Intente nuevamente en unos minutos", "detalles": ... }`, garantizando uniformidad en el consumo desde el cliente frontend.
- **Separación estricta de tests unitarios vs integración:** Las pruebas de middlewares y utilidades (sanitizador NoSQL, sanitizador de logs, helpers de throttling) se ubicaron estrictamente en carpetas `unit/`, sin dependencias de base de datos ni transporte HTTP real.
Archivos tocados:
- `.env.example`
- `backend-django/requirements.txt`
- `backend-django/config/settings/base.py`
- `backend-django/apps/comun/throttling.py`
- `backend-django/apps/comun/logging.py`
- `backend-django/apps/comun/excepciones.py`
- `backend-django/apps/usuarios/views.py`
- `backend-django/apps/recetas/views.py`
- `backend-django/apps/comun/tests/unit/test_unit_throttling.py`
- `backend-django/apps/comun/tests/unit/test_unit_logging_sanitizer.py`
- `backend-django/apps/comun/tests/api/test_api_hardening.py`
- `backend-node/package.json`
- `backend-node/package-lock.json`
- `backend-node/app.js`
- `backend-node/src/config/env.js`
- `backend-node/src/middlewares/cors.middleware.js`
- `backend-node/src/middlewares/rateLimit.middleware.js`
- `backend-node/src/middlewares/nosqlSanitize.middleware.js`
- `backend-node/src/utils/sanitizarLogs.js`
- `backend-node/src/routes/productoResumen.routes.js`
- `backend-node/tests/unit/nosqlSanitize.unit.test.js`
- `backend-node/tests/unit/sanitizarLogs.unit.test.js`
- `backend-node/tests/unit/corsWhitelist.unit.test.js`
- `backend-node/tests/unit/rateLimit.unit.test.js`
- `backend-node/tests/integration/seguridadHardening.integration.test.js`
- `docs/CONNECTIONS.md`
- `docs/bitacora.md`
Cómo probarlo:
- En `backend-django/`: ejecutar `USE_SQLITE=True .venv/bin/pytest -v` (83 tests en verde).
- En `backend-django/`: ejecutar solo tests unitarios: `USE_SQLITE=True .venv/bin/pytest apps/comun/tests/unit/ -v`.
- En `backend-django/`: ejecutar solo tests de API: `USE_SQLITE=True .venv/bin/pytest apps/comun/tests/api/ -v`.
- En `backend-node/`: ejecutar `npm test` (56 tests en verde, 12 suites).
- En `backend-node/`: ejecutar solo tests unitarios: `npx jest tests/unit/`.
- En `backend-node/`: ejecutar solo tests de integración: `npx jest tests/integration/`.

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

