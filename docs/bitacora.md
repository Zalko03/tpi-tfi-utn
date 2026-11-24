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
Fecha: 2026-11-21
Tarea: F6 — Documentación para la cátedra y actualización de matriz HU
Rama: docs/entrega-final
Cambios realizados:
- **README por módulo (`backend-django/README.md`, `backend-node/README.md`, `ai-service/README.md`, `web/README.md`):** responsabilidades, árbol de carpetas verificado contra el código real, endpoints principales y comandos de ejecución, migraciones/seed, tests y linters.
- **Documentación académica (`docs/FUNDAMENTACION_TECNICA.md`, `docs/REVISION_TECNICA_BACKEND_NODE.md`):** comparación honesta entre lo visto en clase (proyecto de referencia de la cátedra y plan original) y la implementación real; auditoría técnica de `backend-node` contra `.agents/rules/convenciones-node.md` (incluyendo desvíos justificados como `String` monetario, `verificarPermiso` y el acoplamiento menor en `productoResumen.controller.js`). La guía de preguntas para la defensa oral se conserva fuera del repositorio.
- **Matriz final de HUs (`docs/MATRIZ_HU.md`):** actualizada a **15/15 Historias de Usuario implementadas** (incorporando `HU8`, `HU9`, `HU12` y `HU14` con rutas, modelos, servicios y archivos de test verificados).
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Ninguna (solo documentación sobre código existente).
Problemas y decisiones técnicas:
- En `backend-django`, al existir `DEMO_ACCESO_RAPIDO=true` en el `.env` local de demo, el test `test_disponible_false_por_defecto` requiere correr `pytest` con `DEMO_ACCESO_RAPIDO=false` para validar el valor por defecto `False`.
- Se documentaron con transparencia las diferencias respecto del borrador de `PLAN_IMPLEMENTACION.md` (sin GraphQL/Apollo ni `drf-spectacular`; OpenAPI nativo en FastAPI `/docs`).
Archivos tocados:
- `backend-django/README.md`, `backend-node/README.md`, `ai-service/README.md`, `web/README.md`
- `docs/FUNDAMENTACION_TECNICA.md`, `docs/REVISION_TECNICA_BACKEND_NODE.md`, `docs/MATRIZ_HU.md`, `docs/bitacora.md`
Cómo probarlo:
- `cd backend-django && DEMO_ACCESO_RAPIDO=false .venv/bin/python -m pytest -q`
- `cd backend-node && npm test && npm run lint`
- `cd ai-service && .venv/bin/python -m pytest -q`
- `node --check web/js/app.js && node --check web/js/logicaPwa.js`
---

---
Fecha: 2026-11-21
Tarea: F5 — HU12: Stock real por insumo, descuento por receta, devolución al anular y alertas de stock bajo
Rama: feat/hu12-stock
Cambios realizados:
- **Django (`apps/insumos/`, `apps/ventas/`):** Se agregaron `stock_actual`, `stock_minimo` y `stock_bajo` en `Insumo`, junto con el modelo auditable `MovimientoStock` y la migración `0003_movimientostock_insumo_stock_actual_and_more.py` (sin aplicar sobre `db.sqlite3`). `registrar_compra_y_actualizar_costo` suma stock convertido a unidad base; `registrar_venta` descuenta de forma atómica cada insumo de la receta (`descontar_stock_por_venta`, bloqueando insumos en orden determinístico de ID) y emite `stock.bajo` hacia Node cuando `stock_actual < stock_minimo` (con `stock_minimo > 0`); `anular_venta` devuelve el stock descontado (`devolver_stock_por_anulacion_venta`). Se expusieron `POST /api/insumos/:id/ajustar-stock/`, `GET /api/insumos/stock-bajo/` y `GET /api/insumos/movimientos-stock/`, además de `stock_minimo` inicial en `seed_demo`.
- **Node (`backend-node/src/routes/eventosInternos.routes.js`, `src/services/eventosInternos.service.js`):** Se habilitó el evento interno `'stock.bajo'` validando `insumoId` y `nombre` y conectándolo con `emitirStockBajo` hacia la sala `rol:stock_alertas` (`DUENIO` / `ENCARGADO`).
- **Web (`web/index.html`, `web/css/estilos.css`, `web/js/logicaPwa.js`, `web/js/app.js`):** Se mostró el stock actual, stock mínimo, estado y banner de alertas en Insumos; se sumó el modal `#modal-ajustar-stock` (`insumos.editar`); se reactivó el contador `#metrica-alertas-stock` en el Tablero en Tiempo Real y se integraron alertas de stock bajo al diagnóstico de reposición IA.
- **Tests y docs:** Se agregaron pruebas unitarias y de API en Django (`test_unit_stock_services.py`, `test_unit_stock_ventas.py`, `test_api_stock.py`) y pruebas en Node/Jest (`eventosInternos.integration.test.js`, `logicaPwa.unit.test.js`), actualizando `docs/CONNECTIONS.md` y `docs/ARCHITECTURE.md`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- `backend-django` → `backend-node` (`POST /api/internos/eventos` con `evento: 'stock.bajo'` hacia `emitirStockBajo`).
- `web/` → `backend-django` (`/api/insumos/:id/ajustar-stock/`, `/api/insumos/stock-bajo/`, `/api/insumos/movimientos-stock/`).
Problemas y decisiones técnicas:
- Se permitió `stock_actual` negativo (con `stock_minimo >= 0`) para no bloquear ventas en mostrador cuando falta cargar una factura y para que al anular una venta la devolución restituya exactamente el saldo previo; los ajustes manuales y descuentos quedan auditados en `MovimientoStock`.
Archivos tocados:
- `backend-django/apps/insumos/{models.py,services.py,serializers.py,views.py,management/commands/seed_demo.py,migrations/0003_movimientostock_insumo_stock_actual_and_more.py}`
- `backend-django/apps/ventas/services.py`
- `backend-django/apps/insumos/tests/{unit/test_unit_stock_services.py,api/test_api_stock.py}`, `backend-django/apps/ventas/tests/unit/test_unit_stock_ventas.py`
- `backend-node/src/{routes/eventosInternos.routes.js,services/eventosInternos.service.js}`, `backend-node/tests/{integration/eventosInternos.integration.test.js,unit/logicaPwa.unit.test.js}`
- `web/{index.html,css/estilos.css,js/logicaPwa.js,js/app.js}`
- `docs/{CONNECTIONS.md,ARCHITECTURE.md,bitacora.md}`
Cómo probarlo:
- `cd backend-django && .venv/bin/python -m pytest -q`
- `cd backend-node && npm test && npm run lint`
- `node --check web/js/app.js && node --check web/js/logicaPwa.js`
---

---
Fecha: 2026-11-20
Tarea: Acceso rápido de demostración (1 clic en login solo en demo local)
Rama: feat/demo-acceso-rapido
Cambios realizados:
- **Django (`config/settings/base.py`, `apps/usuarios/`):** Se incorporó la variable `DEMO_ACCESO_RAPIDO` (por defecto `false`), el check `usuarios.E001` que da error si está activa con `DEBUG=False`, el servicio `autenticar_demo_rapido` (limitado a `duenio_demo`, `encargado_demo`, `cajero_demo` activos) y los endpoints `GET`/`POST /api/auth/demo/` (con `LoginRateThrottle` en `POST` y `404` cuando está deshabilitado).
- **Web (`web/js/logicaPwa.js`, `web/js/app.js`):** Al cargar la pantalla de ingreso se consulta `GET /api/auth/demo/`; si responde `disponible: true`, los tres botones de demo inician sesión en 1 clic reutilizando `aplicarSesionAutenticada` y `conCargando`; si está apagado o falla, mantienen el comportamiento actual.
- **Configuración, tests y docs:** Se documentó `DEMO_ACCESO_RAPIDO=false` en `.env.example` (sin agregarla a `docker-compose.yml` ni `render.yaml`), se sumaron pruebas pytest y Jest, y se actualizaron `docs/seguridad.md` y `docs/CONNECTIONS.md`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- `web/js/app.js` -> `backend-django` (`GET /api/auth/demo/`, `POST /api/auth/demo/`).
Archivos tocados:
- `backend-django/config/settings/base.py`, `backend-django/apps/usuarios/{apps.py,checks.py,serializers.py,services.py,tokens.py,urls.py,views.py}`
- `backend-django/apps/usuarios/tests/{unit/test_unit_demo_check.py,api/test_api_demo_acceso.py}`
- `web/js/{app.js,logicaPwa.js}`, `backend-node/tests/unit/logicaPwa.unit.test.js`
- `.env.example`, `docs/{seguridad.md,CONNECTIONS.md,bitacora.md}`
Cómo probarlo:
- `cd backend-django && .venv/bin/python -m pytest -q`
- `cd backend-node && npm test && npm run lint`
- `node --check web/js/app.js && node --check web/js/logicaPwa.js`
- `cd backend-django && .venv/bin/python manage.py check`
---

---
Fecha: 2026-11-19
Tarea: T9 (ronda de corrección post-auditoría) — Ajustes de fidelidad en `README.md` (solo documentación)
Rama: docs/matriz-hu-readme
Cambios realizados:
- **Claves RS256 en Docker (`README.md`):** Se documentó el comportamiento real verificado en `docker-compose.yml`, `backend-django/Dockerfile` y `backend-node/Dockerfile`: generar `backend-django/config/keys/{private,public}.pem` antes de construir embebe las claves en `/app/config/keys/` en Django (`COPY . /app`, sin volúmenes ni variables `DJANGO_JWT_*` en Compose), mientras que `backend-node/Dockerfile` no copia `config/` y `docker-compose.yml` no monta ni inyecta `JWT_PUBLIC_KEY`.
- **Salud de Node y `carta.html` en Docker (`README.md`):** Se quitaron `http://localhost/health/` y `http://localhost/health/profundo/` de las URLs expuestas en Docker (en `web/nginx.conf` caen en `index.html`; se verifica con `docker compose ps` / `docker compose exec backend-node ...` y en local en `:3000/health`). Se documentó que `web/Dockerfile` no copia `carta.html`, remitiendo a `http://localhost:3000/carta.html` en modo local.
- **Variables `SEED_DEMO_*` y redacción de usuarios demo (`README.md`):** Se sacaron `SEED_DEMO_PASSWORD` y `SEED_DEMO_ALLOW_PRODUCTION` de la tabla de `.env.example` (pasadas a nota breve en §3 y §4), se usó `SEED_DEMO_PASSWORD="<tu-clave-demo>"` en los comandos de ejemplo y se corrigió `"3 usuarios demo por rol"` a `"3 usuarios demo (1 por rol)"`.
Archivos tocados:
- `README.md`
- `docs/bitacora.md`
Cómo probarlo:
- Revisión manual de `README.md` contra `docker-compose.yml`, `web/nginx.conf`, `web/Dockerfile`, `backend-django/Dockerfile`, `backend-node/Dockerfile`, `.env.example` y `seed_demo.py`.
- `git diff --stat` y `git status`
---

---
Fecha: 2026-11-19
Tarea: T9 — Matriz de historias de usuario y README para la entrega (solo documentación)
Rama: docs/matriz-hu-readme
Cambios realizados:
- **Matriz de Historias de Usuario (`docs/MATRIZ_HU.md`):** Se relevó y verificó en el código fuente y suites de pruebas cada una de las 15 HU definidas en `docs/PROPUESTA.md` y `docs/PLAN_IMPLEMENTACION.md` (`HU1`–`HU15`), registrando prioridad MoSCoW, estado real (`11 Hechas`, `2 Parciales`: `HU8` y `HU14`, `2 No hechas`: `HU9` y `HU12`), ubicación exacta en código y tests que las cubren. Se dejó explícito que `HU12` (stock) no está hecha (`Insumo` no tiene stock y `/api/insumos/movimientos/` es consumo teórico), que `HU8` es parcial (`POST /api/ventas/` no emite `venta.registrada` automáticamente hacia Node), que `HU9` no está hecha, que `HU14` es parcial (`costear_con_iva` sin `condicion_fiscal`) y que `HU15` está completa incluyendo el mapa OpenStreetMap (T8).
- **README de raíz (`README.md`):** Se actualizó la guía de puesta en marcha para Docker Compose y desarrollo local sin Docker (generación de claves JWT RS256, `USE_SQLITE=True`, comandos de arranque por servicio, tabla de variables de `.env.example` sin secretos reales, carga de datos demo y escenario `--video` de T7, usuarios demo sin contraseñas remitiendo a `.env.example`, declaración de uso de IA y cifras reales verificadas: 465 tests Django + 223 Node + 87 ai-service = 775 tests).
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Ninguna (solo documentación).
Problemas y decisiones técnicas:
- Se auditaron los servicios, serializers y endpoints antes de clasificar cada HU para no marcar historias como "Hecha" por su nombre; no se modificó código ni se leyó `.env`.
Archivos tocados:
- `docs/MATRIZ_HU.md`
- `README.md`
- `docs/bitacora.md`
Cómo probarlo:
- `cd backend-django && .venv/bin/python -m pytest -q`
- `cd backend-node && npm test && npm run lint`
- `cd ai-service && .venv/bin/python -m pytest -q`
- `.venv/bin/ruff check backend-django/ ai-service/ && .venv/bin/ruff format --check backend-django/ ai-service/`
- `node --check web/js/app.js && node --check web/js/logicaPwa.js && node --check web/js/carta.js && node --check web/js/config.js && node --check web/sw.js`
---

---
Fecha: 2026-11-19
Tarea: T8 (corrección post-auditoría) — Consistencia de ubicación, privacidad de iframe, a11y, test real de SW y CONNECTIONS.md
Rama: feat/mapa-carta-publica
Cambios realizados:
- **Documentación de conexiones (`docs/CONNECTIONS.md`):** Se actualizó la referencia de caché del Service Worker a `cafe-gestion-pwa-v4` y se agregó la fila de conexión cliente `web/carta.html` → `https://www.openstreetmap.org` (iframe embebido, solo cliente, sin credenciales/claves), detallando la directiva CSP `frame-src https://www.openstreetmap.org` en `backend-node/app.js`.
- **Seguridad y accesibilidad en `web/carta.html`:** Se reemplazó `referrerpolicy="no-referrer-when-downgrade"` por `referrerpolicy="strict-origin-when-cross-origin"` en `#carta-ubicacion-iframe` y se añadió `<span class="sr-only"> (se abre en una pestaña nueva)</span>` en `#carta-ubicacion-link` reutilizando `.sr-only` de `web/css/estilos.css`.
- **Coherencia de ubicación ficticia (`web/js/config.js`):** Se actualizó `direccion` a `'Av. 25 de Mayo 100 (frente a Plaza 25 de Mayo), Resistencia, Chaco'` para alinear la dirección ficticia con las coordenadas ficticias de Plaza 25 de Mayo (`-27.4514, -58.9867`).
- **Service Worker testeable (`web/sw.js`) y tests (`backend-node/tests/`):** Se extrajo la lógica de exclusión de `web/sw.js` a la función pura `debeIgnorarPeticionSw(url, destino, origen)` con guarda sobre `self.addEventListener` y exportación CommonJS condicional; se reemplazaron las aserciones de texto plano en `clientePwa.integration.test.js` y se sumaron pruebas unitarias en `logicaPwa.unit.test.js` cubriendo recurso propio, origen externo, destino `'iframe'` y `openstreetmap.org`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- `web/carta.html` (`web/js/carta.js`) → `https://www.openstreetmap.org` (solo cliente, `frame-src` en `backend-node/app.js`, exclusión en `web/sw.js` `cafe-gestion-pwa-v4`).
Problemas y decisiones técnicas:
- Se mantuvo `web/sw.js` compatible simultáneamente con el contexto Service Worker del navegador y con `createRequire` / `vm` en Node/Jest sin introducir pasos de build.
Archivos tocados:
- `docs/CONNECTIONS.md`, `docs/bitacora.md`
- `web/carta.html`, `web/js/config.js`, `web/sw.js`
- `backend-node/tests/integration/clientePwa.integration.test.js`, `backend-node/tests/unit/logicaPwa.unit.test.js`
Cómo probarlo:
- `cd backend-node && npm test && npm run lint`
- `node --check web/js/app.js web/js/logicaPwa.js web/js/carta.js web/js/config.js web/sw.js`
- `.venv/bin/ruff check backend-django/ ai-service/ && .venv/bin/ruff format --check backend-django/ ai-service/`

---
Fecha: 2026-11-19
Tarea: T8 — Mapa embebido de OpenStreetMap en la carta pública (HU15)
Rama: feat/mapa-carta-publica
Cambios realizados:
- **Configuración externa (`web/js/config.js`):** Se creó la configuración web pública (`window.__SAPORI_CONFIG__.ubicacionLocal`) con dirección inventada en Resistencia, Chaco (`Av. San Martín 1420, Resistencia, Chaco`) y coordenadas, sin fijarlas en el código de la carta ni en el HTML.
- **Lógica pura del mapa (`web/js/logicaPwa.js`):** Se agregaron `construirUrlsMapaOpenStreetMap`, `resolverUbicacionCartaPublica` y `renderizarUbicacionCarta` para armar la URL de `https://www.openstreetmap.org/export/embed.html` (`bbox` y `marker`) y el enlace externo, ocultando la sección `#carta-donde-estamos` sin asignar `src` al iframe ni generar errores cuando faltan coordenadas válidas.
- **Vista pública, estilos, CSP y Service Worker (`web/carta.html`, `web/js/carta.js`, `web/css/estilos.css`, `backend-node/app.js`, `web/sw.js`):** Se sumó la sección "Dónde estamos" con el iframe y enlace "Abrir en el mapa" debajo de la lista de productos (adaptada a 375 px de ancho y preservando el contraste corregido en `1bdead4`), se habilitó `frameSrc: ['https://www.openstreetmap.org']` en Helmet CSP y se excluyeron iframes y peticiones externas/OpenStreetMap de la caché de `sw.js` (`cafe-gestion-pwa-v4`, precacheando `config.js`).
- **Tests (`backend-node/tests/unit/logicaPwa.unit.test.js`, `tests/integration/clientePwa.integration.test.js`, `tests/integration/seguridadHardening.integration.test.js`):** Se cubrió el armado de URLs de OpenStreetMap, el ocultamiento sin coordenadas, el servicio de `config.js` y `carta.html`, la exclusión en `sw.js` y la directiva `frame-src` en CSP.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- `web/carta.html` (iframe embebido) → `https://www.openstreetmap.org/export/embed.html` (solo cliente, sin API keys).
Problemas y decisiones técnicas:
- Se utilizó `window.__SAPORI_CONFIG__.ubicacionLocal` en `web/js/config.js` (script local `'self'` compatible con CSP) para desacoplar dirección y coordenadas del código de la carta sin agregar endpoints ni librerías externas.
Archivos tocados:
- `web/js/config.js`, `web/js/logicaPwa.js`, `web/js/carta.js`, `web/carta.html`, `web/css/estilos.css`, `web/sw.js`
- `backend-node/app.js`
- `backend-node/tests/unit/logicaPwa.unit.test.js`, `backend-node/tests/integration/clientePwa.integration.test.js`, `backend-node/tests/integration/seguridadHardening.integration.test.js`
- `docs/bitacora.md`
Cómo probarlo:
- `cd backend-node && npm test && npm run lint`
- `backend-django/.venv/bin/pytest backend-django/ -q`
- `ai-service/.venv/bin/pytest ai-service/ -q`
- `.venv/bin/ruff check backend-django/ ai-service/ && .venv/bin/ruff format --check backend-django/ ai-service/`
- `node --check web/js/app.js && node --check web/js/logicaPwa.js && node --check web/js/carta.js && node --check web/js/config.js && node --check web/sw.js`

---
Fecha: 2026-11-18
Tarea: T6 — Consolidación de presentación, evidencias visuales (IA y QR), script de capturas y guion de video
Rama: feat/presentacion-evidencias
Cambios realizados:
- Se verificó `/home/evilkitty/orq/tareas/`: no existe `T6_capturas_presentacion.txt`; la consigna presente es `T6_guion_video.txt`, junto con las capturas previas en `~/Escritorio/capturas-presentacion/` (`CAMBIOS.md`, `01`..`07` y `pruebas-ia/01`..`08`).
- Se creó `docs/PRESENTACION_Y_EVIDENCIAS.md` (y copia del guion en `/home/evilkitty/orq/resultados/T6_presentacion_y_guion.md`) con el alcance real del sistema, guía paso a paso de ejecución (Docker y local), inventario consolidado de evidencias (flujo general, módulo IA con Groq y módulo QR Carta Pública HU15), guion de 2 minutos (~264 palabras en español rioplatense, 7 escenas) y tabla de pruebas verificadas.
- Se creó `scripts/capturar_carta_qr.sh` (cero dependencias nuevas) para verificar `GET /api/carta-publica/`, exportar `qr-carta-ejemplo.svg` con `web/js/logicaPwa.js` y generar capturas Desktop (`1280×900`) y Mobile (`390×844`) de `web/carta.html` en `~/Escritorio/capturas-presentacion/qr-carta/`.
- Al inspeccionar las capturas de `carta.html`, se detectó bajo contraste en `.carta-publica-titulo` (heredaba color oscuro de la regla global `h1` sobre fondo `--color-espresso`); se corrigió en `web/css/estilos.css` aplicando `color: var(--color-crema-texto)` y se regeneraron las capturas.
- Se corrigió una condición de carrera en `backend-node/tests/integration/importacionIA.integration.test.js` moviendo el mock de `global.fetch` antes de `POST /api/importaciones` para evitar que `setImmediate` dispare `fetch` real cuando `ai-service` no está levantado.
Conexiones nuevas o modificadas (reflejadas en `docs/CONNECTIONS.md`):
- Sin cambios de contratos ni conexiones entre servicios.
Problemas y decisiones técnicas:
- La captura del modal `#modal-qr-carta` dentro de `#vista-recetas` quedó documentada como captura manual con sesión autenticada de Dueño/Encargado para no leer `.env` ni automatizar credenciales desde el script.
Archivos tocados:
- `docs/PRESENTACION_Y_EVIDENCIAS.md`, `docs/bitacora.md`
- `scripts/capturar_carta_qr.sh`
- `web/css/estilos.css`
- `backend-node/tests/integration/importacionIA.integration.test.js`
Cómo probarlo:
- `./scripts/capturar_carta_qr.sh`
- `backend-django/.venv/bin/pytest backend-django/ -q`
- `ai-service/.venv/bin/pytest ai-service/ -q`
- `.venv/bin/ruff check backend-django/ ai-service/` && `.venv/bin/ruff format --check backend-django/ ai-service/`
- `cd backend-node && npm test && npm run lint`
- `node --check web/js/app.js && node --check web/js/logicaPwa.js && node --check web/js/carta.js && node --check web/sw.js`

---
Fecha: 2026-11-18
Tarea: T5 — Carta Digital pública por QR (HU15, Opción A: QR SVG en JS puro ISO/IEC 18004)
Rama: feat/qr-carta-publica
Cambios realizados:
- **Backend Django (`backend-django/apps/comun/throttling.py`, `config/settings/base.py`, `.env.example`, `apps/recetas/`):**
  - Se agregó `CartaPublicaRateThrottle(AnonRateThrottle)` (`scope = "carta_publica"`, tasa por defecto `DJANGO_THROTTLE_CARTA_PUBLICA=60/minute`).
  - Se creó `listar_productos_carta_publica()` (`Producto.objects.filter(estado_activo=True).order_by("nombre")`), `CartaPublicaProductoSerializer` (únicamente `id`, `nombre`, `precio_venta`) y `CartaPublicaView` (`AllowAny`, `authentication_classes = []`, `throttle_classes = [CartaPublicaRateThrottle]`) montada en `GET /api/carta-publica/`.
- **Generador QR ISO/IEC 18004 en JS puro (`web/js/logicaPwa.js`):**
  - Se implementaron `puedeGestionarQrCarta(usuario)` (habilita únicamente con `recetas.editar`), `construirUrlCartaPublica(origin, pathname)` (respeta prefijo `/app/` o raíz `/`), `generarMatrizQr(texto)` (modo Byte UTF-8, Reed-Solomon GF(256) `0x11D`, versiones 1 a 10, niveles L/M, patrones de función, BCH(15,5) y selección óptima de máscara) y `generarSvgQrCarta(url, opciones)` con quiet zone de 4 módulos.
- **Página pública y Modal QR (`web/carta.html`, `web/js/carta.js`, `web/index.html`, `web/js/app.js`, `web/css/estilos.css`, `backend-node/app.js`, `web/sw.js`):**
  - Se creó `web/carta.html` + `web/js/carta.js` mobile-first, sin login y en voseo, consumiendo `GET /api/carta-publica/` con precios ARS, búsqueda en vivo, botón de actualizar, hora de consulta y estados de carga/vacío/error (sin script inline para respetar Helmet CSP).
  - En `backend-node/app.js` se expusieron `/carta.html`, `/css` y `/js` además de `/app/carta.html`; en `web/sw.js` (`cafe-gestion-pwa-v3`) se precacheó `carta.html` y `carta.js` con fallback de navegación separado de `index.html`.
  - En `#vista-recetas` se agregó `#btn-qr-carta-publica` (oculto con `hidden` sin `recetas.editar`) y el modal `#modal-qr-carta` con SVG, copia de URL, apertura en pestaña nueva, descarga SVG e impresión de cartel (`body.imprimiendo-qr-carta`).
- **Tests (`backend-django/apps/recetas/tests/api/test_api_carta_publica.py`, `apps/comun/tests/unit/test_unit_throttling.py`, `backend-node/tests/unit/logicaPwa.unit.test.js`, `tests/integration/clientePwa.integration.test.js`):**
  - Pytest cubre HTTP 200 sin login, exclusión de inactivos, ausencia de costos/márgenes/mano de obra/insumos y HTTP 429 por throttle; Jest cubre permisos, URLs, decodificación integral ISO/IEC 18004 (BCH + zigzag + Byte mode) y servicio de `carta.html`.
Conexiones nuevas o modificadas (reflejadas en `docs/CONNECTIONS.md`):
- `web/carta.html` (`web/js/carta.js`) → `backend-django` (`GET /api/carta-publica/` anónimo con `CartaPublicaRateThrottle`).
Problemas y decisiones técnicas:
- Se eligió retornar `{"datos": [...], "total": N}` en `/api/carta-publica/` para mantener consistencia con `reporte_por_producto` y evitar paginación de 10 ítems en la carta completa; `carta.js` soporta tanto array como `{datos}`.
- Se movió el JS de la carta a `web/js/carta.js` por la directiva CSP `scriptSrc: ["'self'"]` de Helmet en `backend-node/app.js`.
Archivos tocados:
- `.env.example`, `backend-django/config/settings/base.py`, `backend-django/apps/comun/throttling.py`
- `backend-django/apps/recetas/{services.py,serializers.py,views.py,urls.py}`
- `backend-django/apps/recetas/tests/api/test_api_carta_publica.py`, `backend-django/apps/comun/tests/unit/test_unit_throttling.py`
- `backend-node/app.js`, `web/{carta.html,index.html,sw.js,css/estilos.css,js/carta.js,js/logicaPwa.js,js/app.js}`
- `backend-node/tests/{unit/logicaPwa.unit.test.js,integration/clientePwa.integration.test.js}`
- `docs/{CONNECTIONS.md,ARCHITECTURE.md,seguridad.md,bitacora.md}`
Cómo probarlo:
- `backend-django/.venv/bin/pytest backend-django/`
- `ai-service/.venv/bin/pytest ai-service/`
- `.venv/bin/ruff check ai-service/ backend-django/`
- `.venv/bin/ruff format --check ai-service/ backend-django/`
- `cd backend-node && npm test && npm run lint`
- `node --check web/js/app.js && node --check web/js/logicaPwa.js && node --check web/js/carta.js && node --check web/sw.js`

---
Fecha: 2026-11-18
Tarea: T1 — Modelos de IA vigentes por defecto, timeout de 25s, prompt de extracción y pruebas reales desde la web
Rama: fix/ia-pruebas-reales
Cambios realizados:
- **Modelos por defecto vigentes y timeout de 25s (`ai-service/app/config.py`, `.env.example`, `ai-service/.env.example`, `docker-compose.yml`, `docker-compose.prod.yml`, `render.yaml`):** Actualización de `GROQ_MODEL` a `openai/gpt-oss-120b`, `GROQ_VISION_MODEL` a `qwen/qwen3.8-27b` (verificados activos en `GET https://api.groq.com/openai/v1/models`) y `GEMINI_MODEL` a `gemini-3.8-flash` (referencia: `https://ai.google.dev/gemini-api/docs/models`). Se aumentó el timeout por defecto `AI_TIMEOUT_SECONDS` de 10 a 25 segundos para evitar caídas en contingencia por latencia en modelos de razonamiento (como `gpt-oss-120b`) o visión.
- **Prompt y servicio de extracción (`ai-service/app/prompts/v1/extraer_precios.txt`, `ai-service/app/services/extraccion.py`):** En línea 2 se precisó "texto o imagen de una lista de precios". En la regla 4 se explicitó la separación de cantidad/peso/volumen comercializado de bultos ("Harina 0000 25kg" -> nombre: "Harina 0000", cantidad: 25, unidad: "kg"; "Dulce de leche repostero x 10 kg" -> nombre: "Dulce de leche repostero", cantidad: 10, unidad: "kg"), preservando la medida identitaria en descartables vendidos por pack ("Vaso Polipapel 240ml x 50 un" -> nombre: "Vaso Polipapel 240ml", cantidad: 50, unidad: "un") para no romper el matching exacto con el catálogo de insumos.
- **Tests unitarios (`ai-service/app/tests/unit/test_unit_adapters_y_servicios.py`, `test_unit_prompts.py`):** Se verificó el override de `GROQ_VISION_MODEL` con un valor no default (`qwen/qwen-vision-custom-test`) para garantizar que la variable de entorno tiene precedencia real, y se cubrieron las nuevas reglas del prompt de extracción.
- **Verificación real punta a punta (`http://localhost:3000/app/` y `uvicorn` reiniciado en puerto 8001):**
  - Se validó extracción real con Groq (`proveedor_ia=groq`, `contingencia=false`, estado `LISTA`) desde CSV («Analizar Planilla con IA»), Excel `.xlsx` («Analizar Planilla con IA»), Word `.docx`, texto libre y foto PNG inventada usando `qwen/qwen3.8-27b` (separación correcta de nombre, cantidad, unidad y flete).
  - Se probó la aprobación completa («Aprobar e Impactar Costos en Recetas», HTTP 200) y se restauró la BD SQLite local a su estado previo para no alterar los datos demo.
  - Se probó «Consultar a la IA: insumos a reponer» (`POST /v1/resumen-semanal` con Groq real `openai/gpt-oss-120b`, sin contingencia) y «Auditar Cierre de Caja y Rentabilidad del Turno con IA» (auditoría local de Turno #1). Se verificó que «Recetas & Rentabilidad» no tiene botones de IA.
  - Capturas y descripción guardadas fuera del repo en `~/Escritorio/capturas-presentacion/pruebas-ia/`.
Archivos tocados:
- `.env.example`, `ai-service/.env.example`, `docker-compose.yml`, `docker-compose.prod.yml`, `render.yaml`
- `ai-service/app/config.py`, `ai-service/app/prompts/v1/extraer_precios.txt`, `ai-service/app/services/extraccion.py`
- `ai-service/app/tests/unit/{test_unit_adapters_y_servicios.py,test_unit_prompts.py}`
- `docs/bitacora.md`
Cómo probarlo:
- `backend-django/.venv/bin/pytest backend-django/`
- `cd backend-node && npm test && npm run lint`
- `ai-service/.venv/bin/pytest ai-service/`
- `.venv/bin/ruff check backend-django/ ai-service/`
- `.venv/bin/ruff format --check backend-django/ ai-service/`
- `node --check web/js/app.js && node --check web/js/logicaPwa.js`

---
Fecha: 2026-11-18
Tarea: T3 (corrección post-auditoría) — Validación de turno abierto y titularidad en `POST /api/caja/movimientos/`
Rama: fix/movimientos-caja-cajero
Cambios realizados:
- **Servicio y validaciones de creación (`backend-django/apps/caja/services.py`, `serializers.py`, `views.py`):** Se agregó `validar_movimiento_en_turno` y `registrar_movimiento_caja` (con `@transaction.atomic` y `select_for_update()` sobre `TurnoCaja`). Al hacer `POST /api/caja/movimientos/`, se rechaza con HTTP 403 si el usuario no es superusuario ni posee `caja.gestionar_turnos_ajenos` e intenta registrar sobre un turno ajeno, y con HTTP 400 (`"No podés registrar movimientos en un turno de caja que ya está cerrado."`) si el turno está `CERRADO`.
- **Permisos de lectura (`MovimientoCajaViewSet.get_permissions`):** `list` y `retrieve` aceptan `TieneAlgunPermiso("caja.registrar_movimiento", "caja.gestionar_turnos_ajenos")`, manteniendo HTTP 403 para el cajero estándar sin esos permisos (coherente con `test_api_permisos_negativos.py` y arqueo ciego en `GET /api/caja/turnos/`), filtro por titular para cajeros con `caja.registrar_movimiento` y vista global para encargado/dueño.
- **Tests (`backend-django/apps/caja/tests/api/test_api_movimientos_caja.py`):** Se agregaron pruebas para `POST` en turno propio abierto (201), `POST` de cajero en turno ajeno (403), `POST` en turno `CERRADO` (400), `POST` de encargado en turno ajeno abierto (201) y `PATCH`/`DELETE` de cajero sobre movimientos propios y ajenos (403).
Archivos tocados:
- `backend-django/apps/caja/{services.py,serializers.py,views.py}`
- `backend-django/apps/caja/tests/api/test_api_movimientos_caja.py`
- `docs/{seguridad.md,CONNECTIONS.md,bitacora.md}`
Cómo probarlo:
- `cd backend-django && .venv/bin/python -m pytest -q`
- `cd backend-node && npm test && npm run lint`

---
Fecha: 2026-11-17
Tarea: T3 — Movimientos de caja: cada cajero ve solo los suyos (y sí ve los de su turno)
Rama: fix/movimientos-caja-cajero
Cambios realizados:
- **`MovimientoCajaViewSet.get_queryset` (`backend-django/apps/caja/views.py`):** Se filtró el queryset a `turno_caja__usuario=user` cuando el usuario autenticado no es superusuario ni posee `caja.gestionar_turnos_ajenos`, cubriendo tanto `list` como `retrieve` (retorna HTTP 404 ante movimientos de turnos ajenos).
- **`TurnoCajaSerializer.to_representation` (`backend-django/apps/caja/serializers.py`):** El cajero no veía los movimientos de caja chica en la tarjeta de Caja de la web (`web/js/app.js`, `renderizarMovimientosCaja(turno.movimientos || [])`) porque `TurnoCajaSerializer` vaciaba `ret["movimientos"] = []` al faltar `caja.ver_efectivo_esperado`. Ahora se conservan los `movimientos` cuando el usuario es titular del turno (o tiene `caja.gestionar_turnos_ajenos`), manteniendo en `None` `efectivo_inicial`, `efectivo_esperado`, `diferencia`, `ventas_efectivo_total` y `cantidad_tickets` (arqueo ciego estricto).
- **Tests:** Se agregó `backend-django/apps/caja/tests/api/test_api_movimientos_caja.py` (7 tests para cajero, cajero estándar con arqueo ciego, encargado, dueño, superusuario y serializer en turno ajeno) y se actualizó la aserción de `movimientos` del turno propio en `backend-django/apps/comun/tests/api/test_api_permisos_negativos.py`.
Conexiones nuevas o modificadas (reflejadas en `docs/CONNECTIONS.md` y `docs/seguridad.md`):
- `GET /api/caja/movimientos/` y `GET /api/caja/movimientos/:id/` quedan acotados al titular del turno salvo `caja.gestionar_turnos_ajenos`; `GET /api/caja/turnos/` devuelve `movimientos` del turno propio consumidos por `web/js/app.js` sin exponer montos del arqueo.
Problemas y decisiones técnicas:
- Un cajero sin `caja.ver_efectivo_esperado` tampoco conoce `efectivo_inicial`, `ventas_efectivo_total` ni `cantidad_tickets`, por lo que ver los `movimientos` de su propio turno no permite deducir `efectivo_esperado` y corrige la discrepancia en la tarjeta de Caja sin tocar el frontend.
Archivos tocados:
- `backend-django/apps/caja/{views.py,serializers.py}`
- `backend-django/apps/caja/tests/api/test_api_movimientos_caja.py`
- `backend-django/apps/comun/tests/api/test_api_permisos_negativos.py`
- `docs/{CONNECTIONS.md,seguridad.md,bitacora.md}`
Cómo probarlo:
- `cd backend-django && .venv/bin/python -m pytest -q`
- `cd backend-node && npm test && npm run lint`
- `node --check web/js/app.js && node --check web/js/logicaPwa.js`

---
Fecha: 2026-11-17
Tarea: T2 — Anulación real de ventas (`POST /api/ventas/{id}/anular/`)
Rama: fix/anular-venta
Cambios realizados:
- **Modelo y migración (`backend-django/apps/ventas/`):** Se agregaron `estado` (`EMITIDA` / `ANULADA`, default `EMITIDA`), `anulada_en`, `anulada_por`, `motivo_anulacion` e índice `idx_venta_estado_fecha` en `Venta` (`0005_venta_anulada_en_venta_anulada_por_venta_estado_and_more.py`), conservando las ventas sin borrado físico.
- **Servicio y API (`apps/ventas/services.py`, `serializers.py`, `views.py`):** Se implementó `anular_venta(venta, usuario, motivo)` con `@transaction.atomic` y `select_for_update()`, validando `ventas.anular_ticket` (403), doble anulación (400) y estado del turno (400 si `CERRADO`). `VentaViewSet.anular` delega en el servicio y `VentaSerializer` expone los campos de anulación como `read_only`.
- **Exclusión en caja, reportes y consumo (`apps/caja/`, `apps/ventas/`, `apps/insumos/`):** Se filtró `estado="EMITIDA"` en `TurnoCaja.calcular_efectivo_esperado`, `TurnoCajaSerializer` (`ventas_efectivo_total`, `cantidad_tickets`), `construir_queryset_reporte_ventas_por_producto` (reporte por producto y ranking), `obtener_ganancia_diaria` (y punto de equilibrio) y `obtener_movimientos_stock_trazabilidad` (consumo de insumos).
- **Web (`web/js/logicaPwa.js`, `web/js/app.js`):** En la trazabilidad de Reportes, las ventas con `estado === 'ANULADA'` se muestran marcadas con `"Anulada"` y badge `.peligro` (manteniendo `"Confidencial"` si `total` es `null`), y en la auditoría de turno (`auditarCierreCajaIA`) se excluyen del total vendido y conteo de emitidas. No se agregó botón para anular en la UI por no existir previamente (fuera de alcance de la tarea).
- **Tests:** Pruebas unitarias y de API en Django (`test_unit_anulacion_ventas.py`, `test_api_anulacion_ventas.py`) y unitarias en Jest (`logicaPwa.unit.test.js`).
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- `POST /api/ventas/:id/anular/` pasa de stub a mutación transaccional real de `Venta.estado` (`ANULADA`); `GET /api/ventas/` expone `estado`, `anulada_en`, `anulada_por`, `anulada_por_nombre` y `motivo_anulacion` consumidos por `web/js/logicaPwa.js`.
Problemas y decisiones técnicas:
- **Regla de turno cerrado:** `PLAN_IMPLEMENTACION.md` §3, `PROPUESTA.md` y `seguridad.md` §5.1 no definen si se puede anular una venta de un turno cerrado. Se eligió la regla conservadora: rechazar con HTTP 400 si `turno_caja` está `CERRADO` (para no invalidar arqueos ya cerrados); si `turno_caja` es `ABIERTO` (o `None`, p. ej. ventas importadas sin turno), se permite anular.
Archivos tocados:
- `backend-django/apps/ventas/{models.py,serializers.py,services.py,views.py,migrations/0005_venta_anulada_en_venta_anulada_por_venta_estado_and_more.py}`
- `backend-django/apps/caja/{models.py,serializers.py}`, `backend-django/apps/insumos/services.py`
- `backend-django/apps/ventas/tests/{unit/test_unit_anulacion_ventas.py,api/test_api_anulacion_ventas.py}`
- `web/js/{logicaPwa.js,app.js}`, `backend-node/tests/unit/logicaPwa.unit.test.js`
- `docs/{CONNECTIONS.md,ARCHITECTURE.md,bitacora.md}`
Cómo probarlo:
- `cd backend-django && .venv/bin/python -m pytest -q`
- `cd backend-node && npm test && npm run lint`
- `node --check web/js/app.js && node --check web/js/logicaPwa.js`

---
Fecha: 2026-11-17
Tarea: Extracción de precios con IA desde foto de lista de proveedor (Web, Node y ai-service)
Rama: feature/mejoras-profesor
Cambios realizados:
- **ai-service (`app/`):**
  - Se agregó `GROQ_VISION_MODEL` en `config.py`, `.env.example` y `ai-service/.env.example` (valor por defecto `meta-llama/llama-4-scout-17b-16e-instruct`, documentando que puede cambiar según disponibilidad).
  - Se actualizó `SolicitudExtraccionPrecios` (`schemas/extraccion.py`) para aceptar `imagen_base64` + `imagen_mime` (`image/jpeg`, `image/png`, `image/webp`, hasta 7 MB de base64 / 5 MB binarios) haciendo `texto_lista` opcional si viene imagen y exigiendo al menos uno.
  - En `proveedor_ia.py` y `extraccion.py` se implementó `generar_json_con_imagen`: Gemini envía `inline_data` y Groq envía `image_url` en data URL con `GROQ_VISION_MODEL`, reutilizando el mismo prompt (con una nota de foto adjunta) y validación Pydantic. Si falta clave o el proveedor (ej. Ollama) no soporta visión, se devuelve contingencia honesta sin inventar ítems.
- **backend-node (`app.js`, `src/`):**
  - Se elevó el límite de `express.json` a `8mb` únicamente en `/api/importaciones` y `/importaciones`, conservando el límite estándar para el resto de la API.
  - En `importacionIA.routes.js`: `textoLista` pasa a ser obligatorio solo si no viene foto; cuando llega `origenArchivo: 'imagen'` (o campos de imagen) se exige `imagenBase64` válido (≤ 7 MB) e `imagenMime` en `image/jpeg|image/png|image/webp` con mensajes simples de vos.
  - En `ImportacionIA.js`, `importacionIA.controller.js` e `importacionIA.service.js`: se admite `origenArchivo: 'imagen'` sin guardar la imagen en MongoDB (solo `imagenHash` SHA-256, `imagenTamanoBytes` e `imagenMime` para trazabilidad).
  - En `ai.client.js`: `extraerPreciosIA` reenvía `imagen_base64` e `imagen_mime` con timeout ampliado a 25000 ms para imágenes.
- **Web (`web/index.html`, `web/css/estilos.css`, `web/js/logicaPwa.js`, `web/js/app.js`):**
  - Se aceptan `.jpg`, `.jpeg`, `.png`, `.webp` en `#input-archivo-csv`, `#zona-drop-csv` y `#archivo-lista-ia`, actualizando textos visibles para mencionar "foto".
  - Se agregaron en `logicaPwa.js` validadores puros de tipo/tamaño (`esArchivoImagenImportacion`, `validarArchivoImagenImportacion`, `validarArchivoImportacionGeneral`), cálculo proporcional de reescalado (`calcularDimensionesReescaladoImagen`, lado mayor 1600 px) y `extraerBase64DeDataUrl`.
  - En `app.js`, antes de enviar, la foto se reescala en `<canvas>` (lado mayor 1600 px, JPEG calidad 0.85, fondo blanco para PNG/WEBP), se muestra miniatura + `"Foto lista para analizar con IA"` y se envía `{ proveedorNombre, origenArchivo: 'imagen', imagenBase64, imagenMime: 'image/jpeg' }` sin `textoLista` usando `fetchConSesion`.
- **Tests:**
  - `ai-service`: 85 tests en `pytest` (esquemas de imagen/tamaño/MIME, payloads HTTP simulados de Gemini/Groq y contingencia honesta sin clave o sin visión).
  - `backend-node` + `web`: 25 suites / 211 tests en Jest (`aiClient.unit.test.js`, `importacionIA.integration.test.js`, `logicaPwa.unit.test.js`) y `eslint .` limpio.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- `web/` (`<canvas>`) → `backend-node` (`POST /api/importaciones` con límite JSON `8mb` y `origenArchivo: 'imagen'`) → `ai-service` (`POST /v1/extraer-precios` con `imagen_base64`/`imagen_mime`) → Gemini (`inline_data`) / Groq (`GROQ_VISION_MODEL`, `image_url`).
Problemas y decisiones técnicas:
- Se agregó `generar_json_con_imagen` en `ProveedorIA` en lugar de alterar la firma de `generar_json` para no romper adaptadores/tests existentes ni el módulo `resumen.py`; proveedores sin soporte heredan un rechazo controlado que dispara la contingencia honesta.
- En el navegador se rellena fondo blanco en `<canvas>` antes de exportar a JPEG para que las capturas PNG con transparencia no se vuelvan negras y pierdan legibilidad.
Archivos tocados:
- `.env.example`, `ai-service/.env.example`, `ai-service/app/config.py`, `ai-service/app/routers/ia.py`, `ai-service/app/schemas/extraccion.py`, `ai-service/app/services/extraccion.py`, `ai-service/app/services/proveedor_ia.py`
- `ai-service/app/tests/unit/test_unit_schemas.py`, `ai-service/app/tests/unit/test_unit_adapters_y_servicios.py`, `ai-service/app/tests/api/test_api_endpoints.py`
- `backend-node/app.js`, `backend-node/src/routes/importacionIA.routes.js`, `backend-node/src/controllers/importacionIA.controller.js`, `backend-node/src/services/importacionIA.service.js`, `backend-node/src/models/ImportacionIA.js`, `backend-node/src/clients/ai.client.js`
- `backend-node/tests/unit/aiClient.unit.test.js`, `backend-node/tests/unit/logicaPwa.unit.test.js`, `backend-node/tests/integration/importacionIA.integration.test.js`
- `web/index.html`, `web/css/estilos.css`, `web/js/logicaPwa.js`, `web/js/app.js`
- `docs/CONNECTIONS.md`, `docs/ARCHITECTURE.md`, `docs/integracion.md`, `docs/bitacora.md`
Cómo probarlo:
- `cd backend-node && npm test`
- `cd backend-node && npm run lint`
- `cd ai-service && .venv/bin/python -m pytest -q`
- `node --check web/js/app.js && node --check web/js/logicaPwa.js`
---

---
Fecha: 2026-11-17
Tarea: Alta de empleados, baja/reactivación, cambio de rol y edición de permisos desde Equipo & Permisos
Rama: feature/mejoras-profesor
Cambios realizados:
- **Lógica pura en `web/js/logicaPwa.js`:**
  - Se definieron `GRUPOS_PERMISOS_EQUIPO` (9 áreas, 30 permisos con etiquetas simples de vos sin claves internas), `PERMISOS_CATALOGO_EQUIPO` y `ROLES_PLANTILLAS` (en espejo con `backend-django/apps/usuarios/constantes.py`).
  - Se agregaron `obtenerPlantillaRol`, `construirDictPermisosDesdeSeleccion`, `obtenerPermisosInicialesEmpleado`, `accionesEquipoVisiblesParaUsuario` y `accionesEmpleadoVisiblesParaUsuario` (bloqueando la autobaja en la propia tarjeta).
  - Se ajustó `extraerMensajeErrorApi` para rescatar `detalles.mensaje` cuando Django responde con errores de dominio (como la regla de supervivencia del último dueño).
- **Interfaz y flujo web (`web/index.html`, `web/css/estilos.css`, `web/js/app.js`):**
  - Botón "+ Agregar empleado" (solo con `personal.crear`) y modal `#modal-nuevo-empleado` con ojito de contraseña reutilizando `.btn-toggle-visibilidad` (`POST /api/usuarios/`).
  - Modal `#modal-permisos` editable con selector de rol (solo con `personal.editar`) que precarga la plantilla del rol al cambiar, casillas agrupadas por área (`PATCH` si cambia el rol + `POST ajustar-permisos` con el diccionario completo de 30 claves).
  - Modal `#modal-baja-empleado` con confirmación y motivo opcional para "Dar de baja", y botón "Reactivar" según `is_active` (solo con `personal.desactivar`, ocultos en la tarjeta del usuario logueado).
  - Todos los pedidos usan `fetchConSesion`, errores con `mensajeErrorParaUsuario` y textos simples de vos (incluyendo el aviso "Siempre queda un dueño activo").
- **Tests (`backend-node/tests/`):**
  - Se agregaron pruebas unitarias en `logicaPwa.unit.test.js` y verificaciones HTML en `clientePwa.integration.test.js`.
Archivos tocados:
- `web/index.html`, `web/css/estilos.css`, `web/js/app.js`, `web/js/logicaPwa.js`
- `backend-node/tests/unit/logicaPwa.unit.test.js`, `backend-node/tests/integration/clientePwa.integration.test.js`
- `docs/bitacora.md`
Cómo probarlo:
- `cd backend-node && npm test`
- `cd backend-node && npm run lint`
- `node --check web/js/app.js && node --check web/js/logicaPwa.js`
---

---
Fecha: 2026-11-17
Tarea: Trato de vos en la interfaz web y mensajes de validación de Node en lenguaje simple
Rama: feature/reportes-filtro-fechas
Cambios realizados:
- **Trato de vos en la interfaz (`web/index.html`, `web/js/app.js`, `web/js/logicaPwa.js`):**
  - Se pasaron a vos rioplatense los textos visibles al usuario (login, arqueo ciego, importación de listas, filtros de reportes, simulador de punto de equilibrio, ticket, alertas de turno/planilla/PDF y carta).
- **Mensajes de validación simples en Node (`backend-node/src/`):**
  - `validarCampos` ahora devuelve `detalles` solo con `err.msg` sin repetir mensajes ni exponer nombres internos de campo (`err.path`), registrando los campos fallidos en el log estructurado (`logger.warn`) para depuración.
  - Se reescribieron los `withMessage` y mensajes de error de `importacionIA`, `resumenSemanal`, `productoResumen`, `snapshotCosteo`, `historialPrecio` y `ai.client.js` en español simple, de vos y sin nombres de campos internos.
- **Tests (`backend-node/tests/`):**
  - Se agregó `tests/unit/validarCampos.unit.test.js` y se actualizaron `importacionIA.integration.test.js`, `resumenSemanal.integration.test.js` y `seguridadHardening.integration.test.js`.
Archivos tocados:
- `web/index.html`, `web/js/app.js`, `web/js/logicaPwa.js`
- `backend-node/src/middlewares/validarCampos.middleware.js`
- `backend-node/src/routes/importacionIA.routes.js`, `resumenSemanal.routes.js`, `productoResumen.routes.js`, `snapshotCosteo.routes.js`, `historialPrecio.routes.js`
- `backend-node/src/services/importacionIA.service.js`, `backend-node/src/clients/ai.client.js`
- `backend-node/tests/unit/validarCampos.unit.test.js`, `tests/integration/importacionIA.integration.test.js`, `resumenSemanal.integration.test.js`, `seguridadHardening.integration.test.js`
- `docs/bitacora.md`
Cómo probarlo:
- `cd backend-node && npm test && npm run lint` (25 suites, 181 tests passed)
- `node --check web/js/app.js && node --check web/js/logicaPwa.js`
---
Fecha: 2026-11-17
Tarea: Textos simples en pantalla, menú según permisos, aviso POS sin carta y rate limiting por usuario/IA
Rama: feature/reportes-filtro-fechas
Cambios realizados:
- **Parte 1 — Textos simples en pantalla y eliminación de acceso por token en login (`web/index.html`, `web/js/app.js`, `web/js/logicaPwa.js`):**
  - Se reemplazaron textos técnicos en barra superior, presencia, lector POS, cola offline, login, compras/importación y modal de conexión por textos claros en español para el dueño del café.
  - Se eliminó del login el bloque "Token de Acceso Directo" (`#input-token-jwt` / `#btn-toggle-token-jwt`) y la lógica de token manual en `ejecutarLogin`, manteniendo intacta la restauración de sesión vía `sessionStorage` (`cafe_jwt` / `cafe_user`).
  - Se convirtió `#btn-config-servidor-login` en un enlace discreto ("¿No podés conectarte?") y se ocultó `#btn-config-servidor-header` para cualquier rol distinto de `DUENIO` y al cerrar sesión.
  - Se creó e integró `mensajeErrorParaUsuario(status, mensajeApi)` en `web/js/logicaPwa.js` para mapear 401/403/429/400/422 y fallos de red/5xx sin exponer códigos HTTP ni tecnicismos en pantalla (dejando detalles en `console.warn`/`console.error`).
- **Parte 2 — Menú lateral según permisos (`web/js/logicaPwa.js`, `web/js/app.js`):**
  - Se exportaron `PERMISOS_POR_SECCION` y `seccionesVisiblesParaUsuario(usuario)` en `web/js/logicaPwa.js`.
  - Tras iniciar o restaurar sesión se ocultan los ítems del menú no habilitados, se redirige la sección activa si quedó oculta, `cambiarSeccion` impide abrir secciones ocultas, los atajos `F2`/`F4` respetan el permiso de `pos` y `cargarDatosIniciales` evita consultar secciones ocultas.
- **Parte 3 — Aviso de cobro bloqueado sin carta (`web/js/app.js`):**
  - `renderizarCatalogoPOS` actualiza `#estado-caja` con `"Cobro bloqueado: no hay carta cargada."` cuando la carta está vacía y vuelve a `"Listo para escanear productos o cobrar."` cuando hay productos cargados.
- **Parte 4 — Límites de peticiones y documentación (`backend-node/`, `backend-django/`, `.env.example`, `render.yaml`, `docs/seguridad.md`):**
  - En `backend-node/app.js`: se configuró `app.set('trust proxy', nodeTrustProxySaltos)` desde `NODE_TRUST_PROXY_SALTOS` (default `0`, `1` en `render.yaml`, nunca `true`) y se montaron `/app` y `/health` antes de `limitadorGeneral` para que no consuman cupo ni emitan cabeceras `RateLimit`.
  - En `backend-node/src/middlewares/auth.middleware.js` y `rateLimit.middleware.js`: se extrajo `obtenerUsuarioIdDeToken(cabecera)` reutilizando la verificación RS256; `limitadorGeneral` aplica 600 req/15 min por `usuario:<id>` autenticado y 100 req/15 min por IP (`ipKeyGenerator`) si falta token o es inválido; se creó `limitadorIA` (20 req/15 min por usuario/IP) en `POST /api/importaciones`, `POST /importaciones` y `POST /v1/resumen-semanal` (conservando `limitadorConsultasCostosas` en `productoResumen.routes.js`).
  - En `backend-django/config/settings/base.py` y `.env.example`: se actualizó `DJANGO_THROTTLE_USER` por defecto de `2000/day` a `10000/day`.
  - Se documentaron los límites en `docs/seguridad.md` (§8).
- **Tests (`backend-node/tests/`):**
  - Se actualizaron `clientePwa.integration.test.js` y `logicaPwa.unit.test.js` (errores legibles y menú por permisos) y se ampliaron `rateLimit.unit.test.js` y `seguridadHardening.integration.test.js`.
Archivos tocados:
- `web/index.html`
- `web/js/app.js`
- `web/js/logicaPwa.js`
- `backend-node/app.js`
- `backend-node/src/config/env.js`
- `backend-node/src/middlewares/auth.middleware.js`
- `backend-node/src/middlewares/rateLimit.middleware.js`
- `backend-node/src/routes/importacionIA.routes.js`
- `backend-node/src/routes/resumenSemanal.routes.js`
- `backend-node/tests/unit/logicaPwa.unit.test.js`
- `backend-node/tests/unit/rateLimit.unit.test.js`
- `backend-node/tests/integration/clientePwa.integration.test.js`
- `backend-node/tests/integration/seguridadHardening.integration.test.js`
- `backend-django/config/settings/base.py`
- `.env.example`
- `render.yaml`
- `docs/seguridad.md`
- `docs/bitacora.md`
Cómo probarlo:
- `cd backend-django && .venv/bin/python -m pytest -q` (407 passed)
- `cd backend-node && npm test && npm run lint` (24 suites, 179 tests passed)
- `node --check web/js/app.js && node --check web/js/logicaPwa.js`
- `.venv/bin/ruff check backend-django/config/settings/base.py && .venv/bin/ruff format --check backend-django/config/settings/base.py`
---
Fecha: 2026-11-16
Tarea: Corrección de `RecetaItemSerializer` (`producto`) y gestión de carta/recetas por permisos en "Recetas & Rentabilidad"
Rama: feature/reportes-filtro-fechas
Cambios realizados:
- **Backend Django (`backend-django/apps/recetas/`):**
  - En `serializers.py`: se agregó `"producto"` a `RecetaItemSerializer.Meta.fields` y se implementó `validate()` para rechazar con HTTP 400 cualquier actualización (`self.instance`) que intente cambiar el `producto` de un ítem existente.
  - En `tests/api/test_api_recetas.py`: se agregaron pruebas API verificando creación de `RecetaItem` con `recetas.crear` y recálculo automático del producto, rechazo HTTP 400 al intentar cambiar `producto` vía `PATCH`, actualización de cantidad con recálculo y rechazo HTTP 403 sin `recetas.crear`.
- **Frontend PWA (`web/`):**
  - En `web/js/logicaPwa.js`: se agregaron los helpers puros `usuarioTienePermiso`, `obtenerUnidadesCompatiblesReceta`, `calcularFactorConversionReceta` y `extraerMensajeErrorApi`.
  - En `web/index.html`, `web/css/estilos.css` y `web/js/app.js`: se incorporó en **Recetas & Rentabilidad** la gestión de la carta controlada por permisos granulares (`recetas.crear`, `recetas.editar`, `recetas.eliminar`):
    - Botón **+ Nuevo producto** y modal (`#modal-nuevo-producto`) con nombre, código de barras opcional (`null` si está vacío), precio de venta, minutos de mano de obra y costo hora (`POST /api/productos/`).
    - En el desglose de receta: formulario para agregar insumo (`POST /api/recetas-items/`), edición inline de cantidad (`PATCH /api/recetas-items/{id}/`) y botón para quitar insumo (`DELETE /api/recetas-items/{id}/`), refrescando la tabla y el desglose tras cada operación.
    - Modal para editar el precio de venta de un producto (`PATCH /api/productos/{id}/`), sin borrado de productos.
    - Todo texto proveniente de la base se renderiza escapado con `escaparHtml` o `textContent`.
- **Documentación e integridad (`web/vendor/mammoth/README.md`, `docs/CONNECTIONS.md`, `docs/bitacora.md`):**
  - Se incluyó en el commit la corrección del hash SHA-256 en `web/vendor/mammoth/README.md` y se actualizó `docs/CONNECTIONS.md` con `/api/productos/` y `/api/recetas-items/`.
- **Tests PWA (`backend-node/tests/`):**
  - Ampliación de `logicaPwa.unit.test.js` y `clientePwa.integration.test.js` cubriendo los helpers de permisos/unidades/errores y los nuevos elementos de interfaz.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Cliente Mínimo PWA (`web/`) ↔ `backend-django` (`/api/productos/`, `/api/recetas-items/`).
Problemas y decisiones técnicas:
- Se envía `codigo_barras: null` cuando el campo opcional queda vacío para no colisionar con la restricción `unique=True` de `Producto.codigo_barras`.
- En `RecetaItemSerializer.validate`, bloquear cambios de `producto` preserva la integridad de los ítems existentes sin impedir actualizaciones parciales de `cantidad` o `unidad`.
Archivos tocados:
- `backend-django/apps/recetas/serializers.py`
- `backend-django/apps/recetas/tests/api/__init__.py`
- `backend-django/apps/recetas/tests/api/test_api_recetas.py`
- `web/index.html`
- `web/css/estilos.css`
- `web/js/logicaPwa.js`
- `web/js/app.js`
- `web/vendor/mammoth/README.md`
- `backend-node/tests/unit/logicaPwa.unit.test.js`
- `backend-node/tests/integration/clientePwa.integration.test.js`
- `docs/CONNECTIONS.md`
- `docs/bitacora.md`
Cómo probarlo:
- `backend-django/.venv/bin/pytest backend-django/` (400 tests en verde)
- `cd backend-node && npm test && npm run lint` (24 suites, 167 tests en verde)
- `.venv/bin/ruff check backend-django/apps/recetas/ && .venv/bin/ruff format --check backend-django/apps/recetas/`

---
Fecha: 2026-11-16
Tarea: Preservación de números formateados en Excel (`rawNumbers: true`), test real con SheetJS v0.20.3 y verificación SHA-256 de Mammoth
Rama: feature/reportes-filtro-fechas
Cambios realizados:
- **Extracción CSV desde Excel (`web/js/logicaPwa.js`):** En `extraerCsvDeExcelBuffer`, se actualizó la llamada a `xlsx.utils.sheet_to_csv(primeraHoja, { blankrows: false, rawNumbers: true })` para evitar que formatos de miles o moneda (ej. `#,##0` o `"$"#,##0.00`) introduzcan comas o símbolos que alteren el parseo posterior en `parsearCsvProveedor`.
- **Tests unitarios y de integración real (`backend-node/tests/unit/logicaPwa.unit.test.js`):**
  - Se actualizó la aserción del mock de `sheet_to_csv` para exigir `{ blankrows: false, rawNumbers: true }`.
  - Se incorporó un test de integración real cargando `web/vendor/sheetjs/xlsx.full.min.js` (`0.20.3`) con `fs.readFileSync` + `vm.runInNewContext`, armando un libro con celdas numéricas formateadas (`18000` con `z = '#,##0'` y `14000.5` con `z = '"$"#,##0.00'`), serializando con `XLSX.write` y validando que `extraerCsvDeExcelBuffer` + `parsearCsvProveedor` devuelven exactamente 2 ítems con `precio_total` `"18000.00"` y `"14000.50"`.
- **Verificación de integridad (`web/vendor/mammoth/README.md`):** Se ejecutó `sha256sum web/vendor/mammoth/mammoth.browser.min.js` confirmando el hash completo `92914a3708cfdf1e62cb553d1856a7fedab21da83d8ee82845de2f897b368cab` ya presente en `web/vendor/mammoth/README.md`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Ninguna; se mantienen sin cambios los contratos entre cliente web y backends.
Problemas y decisiones técnicas:
- Sin `rawNumbers: true`, `sheet_to_csv` exportaba números formateados (p. ej. `"18,000"` o `"$14,000.50"`), rompiendo la normalización numérica cuando el delimitador CSV es coma (`,`). Usar `rawNumbers: true` preserva el valor numérico crudo de SheetJS sin perder compatibilidad.
Archivos tocados:
- `web/js/logicaPwa.js`
- `backend-node/tests/unit/logicaPwa.unit.test.js`
- `docs/bitacora.md`
Cómo probarlo:
- `node --check web/js/logicaPwa.js`
- `cd backend-node && npm test && npm run lint`
---

---
Fecha: 2026-11-16
Tarea: Importación offline-first de listas de proveedores en Excel (.xlsx/.xls) y Word (.docx)
Rama: feature/reportes-filtro-fechas
Cambios realizados:
- **Librerías vendored offline-first (`web/vendor/`):**
  - Se descargó e incorporó **SheetJS `0.20.3`** (`web/vendor/sheetjs/xlsx.full.min.js`) desde el CDN oficial (`https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js`) evitando la versión `0.18.5` de npm (CVE-2023-30533 y CVE-2024-22363), junto con `web/vendor/sheetjs/README.md`.
  - Se descargó e incorporó **Mammoth.js `1.13.0`** (`web/vendor/mammoth/mammoth.browser.min.js`) desde jsDelivr/npm oficial, junto con `web/vendor/mammoth/README.md`.
- **Lógica PWA (`web/js/logicaPwa.js`):**
  - Se incorporaron validación de tamaño máximo de 5 MB (`TAMANO_MAXIMO_ARCHIVO_IMPORTACION_BYTES`, `validarTamanoArchivoImportacion`) y detección de formatos (`esArchivoExcel`, `esArchivoDocx`, `esArchivoDocAntiguo` con `MENSAJE_DOC_ANTIGUO`).
  - Se implementó `extraerCsvDeExcelBuffer` para leer únicamente la primera hoja (`SheetNames[0]`) con `XLSX.utils.sheet_to_csv` y lanzar error claro si no hay hojas o está vacía, junto con `evaluarCsvPlantillaDirecta` para distinguir planillas compatibles con importación directa sin IA.
  - Se implementó `extraerTextoDeDocxBuffer` para extraer únicamente texto plano con `mammoth.extractRawText({ arrayBuffer })`, validando buffers o documentos vacíos.
- **UI y flujo cliente (`web/index.html`, `web/js/app.js`):**
  - Se cargaron ambos scripts locales en `web/index.html`, se ampliaron `accept` (`.xlsx,.xls,.docx`) y textos de ayuda en `#input-archivo-csv` y `#archivo-lista-ia`.
  - En `web/js/app.js`, `procesarArchivoImportacionSeleccionado` rechaza `.doc` antiguo con `"Guardá el archivo como .docx y volvé a subirlo"`, valida el tope de 5 MB antes de leer el archivo, enruta Excel compatible a importación directa sin IA o al editor IA si difieren las columnas, y extrae texto plano de `.docx` hacia el flujo IA igual que `.pdf` usando `textContent` / `escaparHtml`.
- **Service Worker (`web/sw.js`) y tests (`backend-node/tests/`):**
  - Se incrementó `NOMBRE_CACHE` a `cafe-gestion-pwa-v2` y se agregaron `xlsx.full.min.js` y `mammoth.browser.min.js` al precaché. Se verificó que `web/Dockerfile` copia `vendor/` completo.
  - Se agregaron tests unitarios en `backend-node/tests/unit/logicaPwa.unit.test.js` (con mocks de `XLSX` y `mammoth`) y se actualizó `backend-node/tests/integration/clientePwa.integration.test.js`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Ninguna; el cliente web envía el texto extraído por las rutas existentes (`POST /api/compras/confirmar-importacion/` o `POST /api/importaciones` con `origenArchivo: 'csv' | 'texto'`).
Problemas y decisiones técnicas:
- Se mantuvo `ultimoOrigenArchivo` en `'csv'` (para Excel convertido a CSV) y `'texto'` (para Word `.docx` en texto plano) para mantener compatibilidad estricta con el enum `['texto', 'csv', 'pdf']` de `ImportacionIA` y `importacionIA.routes.js`.
- En `esArchivoExcel` se excluyó explícitamente `.csv` cuando el navegador reporta MIME `application/vnd.ms-excel`.
Archivos tocados:
- `web/vendor/sheetjs/xlsx.full.min.js`, `web/vendor/sheetjs/README.md`
- `web/vendor/mammoth/mammoth.browser.min.js`, `web/vendor/mammoth/README.md`
- `web/js/logicaPwa.js`, `web/js/app.js`, `web/index.html`, `web/sw.js`
- `backend-node/tests/unit/logicaPwa.unit.test.js`, `backend-node/tests/integration/clientePwa.integration.test.js`
- `docs/bitacora.md`
Cómo probarlo:
- `node --check web/js/logicaPwa.js && node --check web/js/app.js && node --check web/sw.js`
- `cd backend-node && npm test && npm run lint`
---

---
Fecha: 2026-11-16
Tarea: Botones mostrar/ocultar en contraseña (`#input-password`) y token JWT (`#input-token-jwt`) del login
Rama: feature/reportes-filtro-fechas
Cambios realizados:
- **HTML (`web/index.html`):**
  - Se envolvió `#input-password` en `.input-con-icono.input-con-accion` y se agregó el botón `#btn-toggle-password` (`type="button"`, `aria-label="Mostrar contraseña"`, `aria-pressed="false"`) con íconos SVG inline de ojo abierto y ojo tachado.
  - Se configuró `#input-token-jwt` oculto por defecto (`type="password"`, `autocomplete="off"`), envuelto en `.input-con-accion` con su botón `#btn-toggle-token-jwt` (`type="button"`, `aria-label="Mostrar token JWT"`, `aria-pressed="false"`) e íconos SVG equivalentes.
- **Estilos (`web/css/estilos.css`):**
  - Se acotó `.input-con-icono svg` a hijo directo (`.input-con-icono > svg`) para no afectar el posicionamiento de los íconos de acción a la derecha.
  - Se incorporaron las clases `.input-con-accion` (con `padding-right: 2.85rem` en el `<input>`) y `.btn-toggle-visibilidad` (posicionamiento centrado a la derecha, hover, `focus-visible` y ocultamiento explícito de `svg[hidden]`).
- **Lógica de UI (`web/js/app.js`):**
  - Se implementaron los helpers reutilizables `actualizarEstadoVisibilidadCampo`, `restablecerVisibilidadCredencialesLogin`, `inicializarTogglesVisibilidad` y `limpiarCredencialesFormularioLogin` para alternar `type`, `aria-label`, `aria-pressed` y visibilidad de íconos SVG en ambos campos.
  - Se garantizó el retorno al estado oculto (`type="password"`, `aria-pressed="false"`) en inicialización, evento `reset` de `#form-login`, selección de perfiles demo, login exitoso y `cerrarSesion`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Ninguna; los cambios son estrictamente de UI/accesibilidad en el formulario de ingreso del cliente web.
Problemas y decisiones técnicas:
- Se restringió la regla `.input-con-icono svg` a `.input-con-icono > svg` para evitar que los SVG del botón de ojo heredaran `position: absolute; left: 0.9rem;` del ícono izquierdo del campo.
- Se centralizó el comportamiento de ambos toggles mediante atributos `data-target-input`, `data-label-mostrar` y `data-label-ocultar` en HTML, evitando duplicación de manejadores en `web/js/app.js`.
Archivos tocados:
- `web/index.html`
- `web/css/estilos.css`
- `web/js/app.js`
- `docs/bitacora.md`
Cómo probarlo:
- `node --check web/js/app.js`
- `cd backend-node && npm test && npm run lint`
---

---
Fecha: 2026-11-16
Tarea: Mitigación CVE-2024-4367 en pdf.js, guardia anti-doble envío CSV directo y ajuste de etiquetas de margen bruto
Rama: feature/reportes-filtro-fechas
Cambios realizados:
- **Seguridad PDF (`web/js/logicaPwa.js`):** En `extraerTextoDePdfBuffer`, se agregó `isEvalSupported: false` después de `...opciones` en la llamada a `pdfjs.getDocument(...)` para mitigar CVE-2024-4367 sin posibilidad de sobrescritura por parte del caller.
- **Guardia anti-doble envío (`web/js/app.js`):** En `confirmarCsvDirectoEnInventario`, se incorporó la bandera `confirmacionCsvDirectaEnCurso`, deshabilitación temporal de `#btn-csv-confirmar-directo` (`disabled = true` con preservación de texto) y bloque `try { ... } finally { ... }` para restaurar siempre bandera y botón incluso ante errores o retornos tempranos.
- **Etiquetas de finanzas (`web/js/app.js`):** Se actualizó `"Margen neto promedio"` a `"Margen bruto promedio"` y `"margen neto"` a `"margen bruto"` en el subtítulo de la sección Finanzas para mantener coherencia con el cálculo de margen bruto.
- **Tests (`backend-node/tests/unit/logicaPwa.unit.test.js`):** Se agregó un test unitario que verifica que `extraerTextoDePdfBuffer` pasa `isEvalSupported: false` a `pdfjs.getDocument` incluso cuando `opciones` intenta pasar `isEvalSupported: true`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Ninguna; se mantienen sin cambios los contratos de endpoints y módulos.
Problemas y decisiones técnicas:
- Se ubicó `isEvalSupported: false` al final del objeto pasado a `pdfjs.getDocument` para garantizar que ningún parámetro en `opciones` reactive `eval` al procesar PDFs externos.
- Se reconsulta `$('btn-csv-confirmar-directo')` dentro del `finally` para restaurar su estado únicamente si continúa presente en el DOM.
Archivos tocados:
- `web/js/logicaPwa.js`
- `web/js/app.js`
- `backend-node/tests/unit/logicaPwa.unit.test.js`
- `docs/bitacora.md`
Cómo probarlo:
- `cd backend-node && npm test && npm run lint`
---

---
Fecha: 2026-11-15
Tarea: Idempotencia en ventas, arqueo ciego estricto, cola offline y eliminación de credenciales hardcodeadas
Rama: feature/pos-comercial-sapori-stock
Cambios realizados:
- **Ventas e idempotencia (`backend-django`):** Se agregó `Venta.id_operacion` (`UUIDField(unique=True, null=True, blank=True)`, migración `0004_venta_id_operacion.py`) y se declaró sin `UniqueValidator` en `VentaSerializer` para que `registrar_venta` devuelva la venta existente ante reintentos idempotentes; se validó `precio_bd > Decimal("0.00")`, producto activo/existente y `turno_caja.estado == "ABIERTO"` con `ValidationError` (HTTP 400).
- **Cola offline PWA (`web/`):** `cobrarTicketVenta` y `encolarVentaOffline` adjuntan `id_operacion` UUID v4; la sincronización usa `ejecutarSincronizacionConLock` (`navigator.locks` con `ifAvailable: true` y fallback en memoria), conserva `turno_caja` abierto o usa el turno abierto del usuario actual enviando `origen: 'offline'`, y mueve errores `4xx` definitivos (excepto `401`/`408`/`429`) a `cafe_cola_ventas_rechazadas` sin trabar el resto de la cola.
- **Arqueo ciego estricto (`backend-django` y `backend-node`):** Se extrajo `usuario_tiene_permiso`; `TurnoCajaSerializer` oculta también `efectivo_inicial`, `cantidad_tickets` y `movimientos` (`[]`) sin `caja.ver_efectivo_esperado`; `VentaSerializer`/`VentaViewSet` redactan en `GET` `total`, `medio_pago`, `costo_total_snapshot` y precios de ítems (y deshabilitan filtro `medio_pago`/orden por `total`) sin ese permiso; en Socket.IO se exige rol no `CAJERO` o `turnoId` verificado en JWT para unirse a salas de turno y se emite `total`/`medio_pago` solo a `permiso:caja.ver_efectivo_esperado`.
- **Credenciales (`web/`, `seed_demo.py`, `README.md`):** Se eliminó `Demo1234!` del HTML/JS (autocompletado demo solo rellena usuario); `seed_demo` lee `SEED_DEMO_PASSWORD` (o asigna clave inusable) y bloquea ejecución con `DEBUG=False` salvo `--force-production` o `SEED_DEMO_ALLOW_PRODUCTION=True`; se retiró `seed_demo` de la guía productiva en `README.md`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- `POST /api/ventas/` admite `id_operacion` (UUID opcional); `GET /api/ventas/` y evento `venta.registrada` de Socket.IO omiten montos y medio de pago cuando el consumidor no posee `caja.ver_efectivo_esperado`.
Problemas y decisiones técnicas:
- Se declaró explícitamente `id_operacion` en `VentaSerializer` para evitar que el `UniqueValidator` automático de DRF rechace con 400 el segundo envío idempotente antes de alcanzar `registrar_venta`.
- La redacción en `VentaSerializer` se aplica en lecturas (`method != "POST"`) para preservar el comprobante inmediato de creación sin permitir reconstruir el arqueo vía `GET /api/ventas/`.
Archivos tocados:
- `backend-django/apps/ventas/{models.py,migrations/0004_venta_id_operacion.py,serializers.py,services.py,views.py}`
- `backend-django/apps/caja/{serializers.py,views.py}`, `backend-django/apps/usuarios/permissions.py`
- `backend-django/apps/insumos/management/commands/seed_demo.py`
- `backend-node/src/sockets/{emitter.js,index.js,middleware/auth.socket.middleware.js}`
- `web/index.html`, `web/js/app.js`, `web/js/logicaPwa.js`, `README.md`, `docs/bitacora.md`
- Suites de test: `test_unit_ventas_services.py`, `test_api_ventas.py`, `test_api_permisos_negativos.py`, `test_unit_seed_demo.py`, `logicaPwa.unit.test.js`, `socketAuth.unit.test.js`, `socketio.integration.test.js`
Cómo probarlo:
- `backend-django/.venv/bin/pytest backend-django/`
- `cd backend-node && npm test && npm run lint`
- `ai-service/.venv/bin/pytest ai-service/`
- `.venv/bin/ruff check backend-django/ ai-service/`
---

---
Fecha: 2026-11-15
Tarea: Enforzar `producto.precio_venta` desde BD en `ventas`, auditoría offline y revisión de descuentos
Rama: feature/pos-comercial-sapori-stock
Cambios realizados:
- Se agregó `NORMAS.md` en la raíz del repositorio con reglas de commits, fronteras de servicios, negocio/seguridad y comandos de verificación.
- En `backend-django/apps/ventas/services.py` (`registrar_venta`), se ignoró siempre el `precio_unitario` enviado por el cliente y se calculó el cobro exclusivamente desde `producto.precio_venta` (`Decimal`).
- Ante un `precio_unitario` recibido distinto de `producto.precio_venta` (ej. ventas offline sincronizadas tras cambio de precio), la venta no se rechaza, se cobra el precio vigente de BD y se registra la diferencia en un log estructurado (`logger.warning` con `venta_id`, `producto_id`, `producto_nombre`, `origen`, `precio_cliente`, `precio_bd`, `diferencia`).
- En `backend-django/apps/ventas/models.py` (`0003_alter_venta_origen`) y `serializers.py`, se incorporó `"offline"` a `Venta.ORIGENES` y `allow_null=True` en `VentaItemInputSerializer.precio_unitario`.
- Se verificó `backend-django/` y `web/` confirmando que no existen descuentos implementados en el POS ni en `Venta`/`VentaItem` (solo existe la clave de permiso `ventas.aplicar_descuento` en el catálogo RBAC).
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Sin cambios de endpoints ni contratos de respuesta; `POST /api/ventas/` continúa aceptando `precio_unitario` opcionalmente y admite ahora `origen="offline"`.
Problemas y decisiones técnicas:
- `Venta` no posee campo `observaciones`/`notas`; para no alterar contratos existentes ni agregar columnas innecesarias, la discrepancia de precio offline se audita vía `logger.warning` estructurado compatible con `FormateadorJson`.
Archivos tocados:
- `NORMAS.md`
- `backend-django/apps/ventas/models.py`, `backend-django/apps/ventas/migrations/0003_alter_venta_origen.py`, `backend-django/apps/ventas/serializers.py`, `backend-django/apps/ventas/services.py`
- `backend-django/apps/ventas/tests/unit/test_unit_ventas_services.py`, `backend-django/apps/ventas/tests/api/test_api_ventas.py`
- `docs/bitacora.md`
Cómo probarlo:
- `backend-django/.venv/bin/pytest backend-django/`
- `cd backend-node && npm test && npm run lint`
- `ai-service/.venv/bin/pytest ai-service/`
- `.venv/bin/ruff check backend-django/ ai-service/`
---

---
Fecha: 2026-11-14
Tarea: Remediación integral de hallazgos funcionales, seguridad, IA y despliegue en `feature/pos-comercial-sapori-stock`
Rama: feature/pos-comercial-sapori-stock
Cambios realizados:
- **POS, Ventas y Cola Offline:** Se corrigió el envío de precios unitarios reales desde el carrito de `web/js/app.js` y el respaldo de servidor en `registrar_venta` (`backend-django/apps/ventas/services.py`) cuando llega `0` o `None`. Se eliminaron fallbacks silenciosos (`turno || 1`, `producto || 1`, apertura automática con `$10000`) y se agregó confirmación/borrado individual en `web/js/logicaPwa.js` (`eliminarVentaOffline`) para evitar cobros duplicados tras cortes parciales.
- **Seguridad, Arqueo Ciego y XSS:** Se ocultó `ventas_efectivo_total` en `TurnoCajaSerializer` cuando el usuario no tiene permiso de arqueo esperado; se eliminaron credenciales hardcodeadas (`cafe_pwd`, `duenio_demo`/`Demo1234!`) en `web/js/app.js`, restringiendo el reingreso offline a JWT vigente en caché sin elevar roles por nombre de usuario; se incorporó `escaparHtml` en todas las tablas y reportes HTML dinámicos; y se eliminó el fallback silencioso a `confirmar-importacion` de Django o CSV previo al fallar `/aprobar` o devolver 0 ítems.
- **Consultor IA, Node y ai-service:** Se implementó `POST /v1/resumen-semanal` en `backend-node` (protegido con JWT, permiso `reportes.ver_operativos`, rate limit y `express-validator`), conectado desde `web/js/app.js` con `?limite=100` y métricas reales de `ganancia-diaria` y `ranking-productos`. Se cambió `socket.io.js` en `web/index.html` a ruta relativa `/socket.io/socket.io.js`. En `ai-service`, `normalizar_monto` y el parser heurístico usan `Decimal` en lugar de `float`, el fallback heurístico marca `contingencia: True` y los `.env.example` dejan `GROQ_API_KEY=` vacío.
- **Seed, CORS, Serializador, Symlink y README:** En `seed_demo.py` se evitó forzar `TurnoCaja(id=1)` y se protegió `costo_unitario`/compras previas si el insumo ya tenía `Compra`. En `backend-django/config/settings/base.py` los orígenes `localhost` por defecto en CORS se suman solo con `DEBUG=True`. En `VentaSerializer` la normalización de `origen` pasó a `to_internal_value`. Se removió el symlink recursivo `web/app` (agregando `location /app/` en `web/nginx.conf`) y se alineó `README.md` con `localStorage`, atajos reales (`F4`, `Enter`, `F2`, `Esc`) y conteo de 582 tests.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Nuevo endpoint autenticado `POST /v1/resumen-semanal` en `backend-node` delegando a `ai.client.js` (`POST /v1/resumen-semanal` en `ai-service`) y proxied en `web/nginx.conf`.
- Mapeo Nginx `location /app/` a `/usr/share/nginx/html/` tras eliminar el symlink `web/app`.
Problemas y decisiones técnicas:
- Se mantuvo `/app/...` en URLs de `web/index.html` usando Nginx alias para compatibilidad simultánea con Express static (`/app`) y Docker Nginx sin mantener symlinks recursivos en Git.
- Al no existir `Compra` con supplier coincidente o si existe compra previa con otro proveedor, `seed_demo.py` ahora comprueba `Compra.objects.filter(insumo=ins).exists()` antes de alterar costos.
Archivos tocados:
- `backend-django/apps/ventas/services.py`, `backend-django/apps/ventas/serializers.py`, `backend-django/apps/caja/serializers.py`, `backend-django/apps/insumos/management/commands/seed_demo.py`, `backend-django/config/settings/base.py`
- `backend-node/app.js`, `backend-node/src/routes/resumenSemanal.routes.js`, `backend-node/src/controllers/resumenSemanal.controller.js`, `backend-node/src/services/resumenSemanal.service.js`
- `ai-service/app/services/proveedor_ia.py`, `ai-service/app/services/extraccion.py`, `ai-service/app/services/resumen.py`, `.env.example`, `ai-service/.env.example`
- `web/js/app.js`, `web/js/logicaPwa.js`, `web/index.html`, `web/nginx.conf`, eliminación de `web/app`
- Tests nuevos/actualizados en Django (`test_unit_ventas_services.py`, `test_api_permisos_negativos.py`, `test_unit_seed_demo.py`), Node (`logicaPwa.unit.test.js`, `resumenSemanal.integration.test.js`) y `ai-service` (`test_unit_adapters_y_servicios.py`)
- `README.md`, `docs/CONNECTIONS.md`, `docs/ARCHITECTURE.md`, `docs/bitacora.md`
Cómo probarlo:
- `backend-django/.venv/bin/pytest backend-django/` (375 passed)
- `cd backend-node && npm test` (140 passed)
- `ai-service/.venv/bin/pytest ai-service/` (67 passed)
- `.venv/bin/ruff check backend-django/ ai-service/` y `cd backend-node && npm run lint`
---

---
Fecha: 2026-11-09
Tarea: Incorporación de GroqAdapter en ai-service (LPU Cloud) y fallback determinista de demostración
Rama: feature/pos-comercial-sapori-stock
Cambios realizados:
- Incorporación de `GroqAdapter` en `ai-service/app/services/proveedor_ia.py` siguiendo el Patrón Adapter (ADR-0002):
  - Conexión con endpoint oficial compatible con OpenAI de Groq Cloud (`https://api.groq.com/openai/v1/chat/completions`) mediante `httpx.AsyncClient` con cabecera `Authorization: Bearer <GROQ_API_KEY>` y `response_format={"type": "json_object"}`.
  - Modelo por defecto: `llama-3.3-70b-versatile` para procesamiento ultrarrápido sin consumo de hardware local en la máquina cliente.
- Implementación de `fallback_determinista_demostracion` y `parsear_lista_precios_heuristica`:
  - Mecanismo determinista inteligente de contingencia que analiza expresiones regulares y patrones gastronómicos de listas de precios (formatos WhatsApp/PDF, packs, alícuotas, fletes y montos argentinos con puntos/comas) en 1 milisegundo con 0 consumo de GPU/RAM.
  - Asegura que en entornos de demostración sin credenciales o sin internet la extracción de precios y generación de resúmenes siempre responda con éxito al instante.
- Configuración centralizada:
  - Adición de variables `GROQ_API_KEY`, `GROQ_MODEL=llama-3.3-70b-versatile` y `GROQ_BASE_URL` en `ai-service/app/config.py` y `.env.example`.
  - Soporte para `AI_PROVIDER=groq` en `/health/profundo` y fábrica `obtener_proveedor_ia`.
- Tests unitarios completos:
  - Agregadas pruebas para `GroqAdapter` en `ai-service/app/tests/unit/test_unit_adapters_y_servicios.py` validando cabeceras Bearer, payload JSON, fallback determinista y selección en fábrica.
  - 66 tests de `ai-service` pasando al 100% en 0.8s.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- `ai-service` habilitado para operar vía Groq Cloud LPU o modo fallback instantáneo conectado al endpoint `POST /v1/extraer-precios`.
Problemas y decisiones técnicas:
- **Zero-Hardware Footprint:** Groq Cloud procesa los tokens en la nube con LPUs evitando cualquier saturación de RAM en la máquina de desarrollo o del comerciante. En ausencia de clave, el parser heurístico local atiende la demo con latencia prácticamente nula.
- **Respeto a contratos existentes:** Se mantuvo estricto el esquema Pydantic v2 `SalidaIAExtraccionPrecios` y `RespuestaExtraccionPrecios`, garantizando que Node.js y el frontend reciban datos completamente normalizados y tipados.
Archivos tocados:
- `.env.example`
- `ai-service/app/config.py`
- `ai-service/app/routers/salud.py`
- `ai-service/app/services/proveedor_ia.py`
- `ai-service/app/tests/unit/test_unit_adapters_y_servicios.py`
- `docs/bitacora.md`
Cómo probarlo:
- Ejecutar `curl -s http://localhost:8001/health/profundo` verificando `"proveedor": "groq"`.
- Probar `curl -s -X POST http://localhost:8001/v1/extraer-precios -H "Content-Type: application/json" -d '{"texto_lista": "..."}'` verificando extracción inmediata (latencia 1ms, 4 ítems).
- Correr las suites de tests: `ai-service/.venv/bin/pytest ai-service/` (66 tests), `backend-django/.venv/bin/pytest backend-django/` (370 tests), `cd backend-node && npm test` (130 tests). Monorepo con 566 tests en verde.

---
Fecha: 2026-11-06
Tarea: Rediseño comercial y arquitectura frontend de nivel producto para "Sapori Stock" (Specialty Coffee POS)
Rama: main
Cambios realizados:
- Rediseño integral de la interfaz web en `web/` (`index.html`, `css/estilos.css`, `js/app.js`) transformándola en un software comercial gastronómico de alta gama (estilo Fudo / Toast POS / Square) para cafeterías de especialidad de alta demanda.
- Identidad visual gastronómica profesional: Sidebar fijo y elegante en Espresso Oscuro (`#1E1410`) con tipografía crema suave (`#F5EBE6`), área de trabajo en Leche/Crema cálido (`#F8F5F0`), tarjetas blancas puras (`#FFFFFF`), bordes sutiles (`#E6DFD5`), acentos en Caramelo/Ámbar tostado (`#C86D1F`) y estados semafóricos (Verde Esmeralda `#10B981`, Ámbar `#F59E0B`, Rojo `#EF4444`).
- Erradicación total de jerga técnica en la UI visible (eliminando menciones a POST, GET, 202, JWT, RS256, HU, CA, Socket.IO) y adopción del 100% de lenguaje de negocio gastronómico.
- Pantalla de inicio de sesión comercial con selector de demostración rápida en 1 clic para Dueño (`duenio_demo`), Encargado (`encargado_demo`) y Cajero (`cajero_demo`).
- Módulo 1 (Punto de Venta / POS): Buscador instantáneo, input activo con foco automático para lector láser de código de barras (F4), catálogo visual con emojis y avatares según el ítem, comanda con controles táctiles de cantidad, selector visual de medios de pago, cobro con F2 y modal de comprobante térmico de 80mm con opción de impresión (`window.print()`).
- Módulo 2 (Caja y Arqueo Ciego): Tarjetas de estado de turno, apertura de caja, registro de movimientos de caja chica e interfaz adaptativa por rol (Cajero opera en Arqueo Ciego con saldo esperado oculto; Dueño/Encargado auditan turnos con tabla comparativa de efectivo esperado, contado y diferencias en semáforo verde/rojo).
- Módulo 3 (Compras e Importador con IA): Extracción inteligente de listas de precios de distribuidores (WhatsApp/PDF) asistida por IA, botón para cargar ejemplo realista, panel de revisión y aprobación humana (`/api/importaciones/:id/aprobar` o rechazar), e inventario de insumos con costeo unitario base y compras manuales.
- Módulo 4 (Ingeniería de Recetas y Rentabilidad): Carta comercial con costo exacto de receta, ganancia neta en $ por unidad, barras de rentabilidad semafóricas (Saludable >= 50%, Atención 30-49%, Crítico < 30%), protección de confidencialidad para cajeros (`🔒 Confidencial`) y botón de recálculo masivo de toda la carta.
- Módulo 5 (Finanzas, Ganancia Real y Metas): KPIs ejecutivos en vivo (facturación bruta, costo de mercadería vendida congelado, ganancia neta real de bolsillo), ranking visual de productos estrella y alerta comercial de productos sin rotación (0 ventas), y simulador comercial de Punto de Equilibrio interactivo con metas diarias y semanales.
- Módulo 6 (Personal, Permisos y Monitor en Vivo): Gestión de equipo de trabajo con visor de los 30 permisos granulares categorizados, activación/desactivación de empleados y demostración interactiva de la Regla de Supervivencia del Dueño. Panel lateral deslizable con feed de eventos en vivo y contadores en tiempo real por Socket.IO.
- Compatibilidad total: Preservación de `logicaPwa.js`, enlaces `/app/manifest.webmanifest`, `/app/js/app.js` y selectores/IDs requeridos, manteniendo los 563 tests del monorepo pasando al 100% en verde.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Integración completa del cliente web en puerto 5173 hacia `http://localhost:8000` (Django REST Framework), `http://localhost:3000` (Node Express y Socket.IO) y `http://localhost:8001` (FastAPI AI Service).
- Normalización en `VentaItemInputSerializer` para admitir indistintamente `producto` y `producto_id` y tolerancia en el origen `propio`/`local`.
Problemas y decisiones técnicas:
- **Doble soporte de rutas estáticas (/app/ y raíz):** La configuración de enlace simbólico `web/app -> .` permite servir la PWA tanto bajo el prefijo `/app/` de Express en el puerto 3000 como directamente en el servidor de desarrollo en el puerto 5173 sin alterar los tests unitarios y de integración de Jest.
- **Aritmética en centavos y congelamiento de snapshots:** Se integró la lógica de centavos de `logicaPwa.js` en el cliente para no utilizar floats en montos monetarios en el frontend, delegando en el backend Django el cálculo de costos congelados en cada venta para garantizar inmutabilidad histórica.
Archivos tocados:
- `web/index.html`
- `web/css/estilos.css`
- `web/js/app.js`
- `web/app` (enlace simbólico para compatibilidad de rutas)
- `backend-django/apps/ventas/serializers.py`
- `backend-django/apps/insumos/management/commands/seed_demo.py`
- `docs/bitacora.md`
Cómo probarlo:
- Ingresar a `http://localhost:5173` en el navegador.
- Probar el ingreso rápido en 1 clic con los perfiles Dueño, Encargado y Cajero.
- En POS, agregar productos, cambiar cantidades, seleccionar medio de pago y presionar "Cobrar y Emitir Ticket (F2)" para visualizar el ticket térmico de 80mm.
- En Compras IA, presionar "Cargar Ejemplo Real de Proveedor" y "Analizar Lista con Inteligencia Artificial" para aprobar la propuesta.
- Ejecutar `cd backend-node && npm test` (130 tests), `cd backend-django && pytest` (370 tests) y `cd ai-service && pytest` (63 tests) verificando 563 tests en verde.

---
Fecha: 2026-11-03
Tarea: Alineación institucional definitiva, estandarización IEEE 830 y sincronización técnica con código real
Rama: docs/informe-final-tfi
Cambios realizados:
- Carátula institucional y Prólogo: incorporación de los datos oficiales definitivos: autores Martin Elias Alcaraz e Ignacio Ramón Zoilo, Profesor de TFI Marcos Sosa, Profesores de Programación IV Juan Manuel Goya y Gerardo Ramírez, Universidad Tecnológica Nacional, Facultad Regional Resistencia (UTN FRRe), Tecnicatura Universitaria en Programación, año 2026.
- Capítulo 2 (Metodología): estructuración rigurosa de la sección de Especificación de Requerimientos de Software conforme al estándar internacional IEEE Std 830-1998 (perspectiva del producto, clases de actores, restricciones generales de diseño, catálogo de requerimientos verificables RF-01 a RF-15 y RNF-01 a RNF-10, e interfaces externas de usuario, software y comunicación).
- Corrección de las 4 discrepancias técnicas respecto al código fuente real:
  1. Lógica real de ventas y stock: adecuación de RF-15, Tabla 8 (Tabla de Conversación 6) y Figura 5 (Diagrama de Secuencia de Cobro) reflejando que `Insumo` no modela existencias físicas ni `registrar_venta` descuenta stock físico, resaltando la validación del turno de caja del cajero, el congelamiento inmutable de `costo_unitario_snapshot` y el cálculo del efectivo esperado en caja, reservando la deducción automática de stock físico para el Capítulo 5 (Trabajos Futuros).
  2. Atributos exactos en Figura 6 (Diagrama ER PostgreSQL): campos reales en `INSUMO` (`costo_unitario`, `actualizado_en`), `COMPRA` (`cantidad`, `unidad`, `precio_total`, `envio`, `alicuota`, `fecha`, `iva_incluido`, `costo_unitario_calculado`), `TURNO_CAJA` (`apertura`, `cierre`, `efectivo_inicial`, `efectivo_contado`, `efectivo_esperado`, `diferencia`, `estado`), y desvinculación de la FK directa `usuario_id` en `VENTA` y `MOVIMIENTO_CAJA`, asociándose exclusivamente a través de `turno_caja_id`.
  3. Tipos y estructura en Figura 7 (Diagrama MongoDB): tipado de importes monetarios como `String` en `HistorialPrecio`, `SnapshotCosteo` e `ImportacionIA` para preservar precisión decimal contable, y modelado anidado de subdocumentos `entrada` y `salida` en `ImportacionIA`.
  4. Repositorio real en Anexo III: sustitución del marcador genérico por `https://github.com/Zalko03/tpi-tfi-utn.git`.
- Referencias Bibliográficas: incorporación de la norma IEEE Std 830-1998 como referencia `[18]`.
- Regeneración completa de `docs/Informe_Final_TFI_Sapori_Stock.docx` mediante `python-docx` (408 párrafos y 29 tablas).
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- No se modificaron contratos ni conexiones; se logró sincronía 1:1 entre la documentación académica y el código fuente.
Problemas y decisiones técnicas:
- **Trazabilidad 1:1 con el modelo relacional:** Ajustar las entidades de venta y movimientos de caja para que dependan de `turno_caja_id` y no de `usuario_id` directo garantiza que cualquier evaluador docente que coteje el informe con `apps/ventas/models.py` y `apps/caja/models.py` encuentre absoluta concordancia.
Archivos tocados:
- `docs/INFORME_FINAL_TFI.md`
- `docs/Informe_Final_TFI_Sapori_Stock.docx`
- `docs/bitacora.md`
Cómo probarlo:
- Inspeccionar `docs/INFORME_FINAL_TFI.md` y verificar carátula, IEEE 830, diagramas y referencias.
- Abrir `docs/Informe_Final_TFI_Sapori_Stock.docx` para comprobar la correcta maquetación institucional.

---
Fecha: 2026-11-02
Tarea: Redacción y generación del Informe Final Académico de TFI (Sapori Stock)
Rama: docs/informe-final-tfi
Cambios realizados:
- Redacción exhaustiva y rigurosa del Informe Final Académico en `docs/INFORME_FINAL_TFI.md` conforme a la estructura reglamentaria del Anexo II de la cátedra de Programación IV (UTN FRRe):
  - Carátula institucional con título oficial: "Sapori Stock: Sistema Integral Políglota de Gestión Operativa, Costeo Dinámico y Asistencia por Inteligencia Artificial para Cafetería", alumno Martin Elias Alcaraz, Tecnicatura Universitaria en Programación, 2026.
  - Prólogo, agradecimientos y Resumen (279 palabras) + Abstract en inglés (244 palabras), respetando el límite estricto de 300 palabras.
  - Índices formales de contenidos, figuras (8 figuras) y tablas (17 tablas).
  - Capítulo 1 (Introducción): estado del arte en persistencia políglota (PostgreSQL vs. MongoDB), criptografía asimétrica RS256 vs. simétrica HS256, modelo RBAC con 30 permisos booleanos granulares, mitigación OWASP, integración de LLMs con patrón Adapter y supervisión humana (*Human-in-the-Loop*), e ingeniería de costos gastronómicos (unidad base, prorrateo de flete/IVA, snapshot de costo congelado, arqueo ciego y punto de equilibrio). Objetivos general y específicos y justificación operativa en hardware acotado de 8 GB de RAM.
  - Capítulo 2 (Metodología): ciclo de vida iterativo e incremental en cuatro etapas (TP 1 a TP 4), tabla completa de requerimientos funcionales (RF-01 a RF-15) y no funcionales (RNF-01 a RNF-10), diagrama general de casos de uso en Mermaid, ocho Tablas de Conversación detalladas para flujos críticos, tres diagramas de secuencia (RS256, importación IA con aprobación humana y cobro reactivo con Socket.IO), diagramas entidad-relación relacional y documental, y análisis formal de riesgos según metodología Magerit.
  - Capítulo 3 (Herramientas y Lenguajes): análisis técnico detallado de Python 3.13, Django 5.2/DRF, PostgreSQL 16, Node.js 20 LTS, Express, MongoDB 7, FastAPI, Pydantic v2, Socket.IO, PWA con lector HID, Docker Compose, Nginx, Pytest, Jest y GitHub Actions.
  - Capítulo 4 (Resultados): contratos de integración (`CONNECTIONS.md`), trazabilidad distribuida `X-Request-ID` y logging JSON, matriz de autorización granular, optimización de consultas SQL analizadas con `EXPLAIN ANALYZE` sobre lote sintético de 50.000 ventas (−92% en productos con N+1, −87% en reporte de ventas y −94% en recálculo masivo), estrategia y desglose de las 563 pruebas automatizadas (370 Django, 130 Node, 63 FastAPI) con separación en carpetas `unit/` y `api/`/`integration/` (incluyendo 37 pruebas negativas 403), ensayo sistemático de fallos en 5 escenarios, contenedores multi-stage no-root y pipeline CI/CD de siete tareas paralelas.
  - Capítulo 5 (Conclusiones y Trabajos Futuros): balance analítico sobre resultados comprobados y cuatro líneas de investigación futura.
  - Referencias bibliográficas: 17 referencias reales en estricto formato IEEE.
  - Anexos: Anexo I (Síntesis de ADR-0001, ADR-0002 y ADR-0003), Anexo II (Catálogo de 36 endpoints y matriz de permisos) y Anexo III (Manual de despliegue y protocolos de backup/restore).
- Cumplimiento de directivas de estilo académico: números del cero al nueve con palabras en el cuerpo del texto y cifras de 10 en adelante; referencias cruzadas exhaustivas `(Véase Tabla X)`, `(Véase Figura Y)` y `(Cft. Cap. X)`.
- Conversión automatizada y generación del documento Word en `docs/Informe_Final_TFI_Sapori_Stock.docx` con estilos tipográficos profesionales, tablas coloreadas y bloques de código delimitados.
- Eliminación de scripts temporales de conversión y de la carpeta temporal `docs/referencias_catedra/`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- No se modificaron conexiones de código; se documentó íntegramente la matriz de interconexión de la arquitectura.
Problemas y decisiones técnicas:
- **Entrega multiformato (Markdown + DOCX):** Garantiza accesibilidad móvil directa en GitHub para revisión rápida desde el celular y exportación formal en Word para la instancia institucional de evaluación de la cátedra.
Archivos tocados:
- `docs/INFORME_FINAL_TFI.md`
- `docs/Informe_Final_TFI_Sapori_Stock.docx`
- `docs/bitacora.md`
Cómo probarlo:
- Inspeccionar `docs/INFORME_FINAL_TFI.md` en el repositorio o visor Markdown.
- Abrir `docs/Informe_Final_TFI_Sapori_Stock.docx` para verificar el formato institucional.
- Ejecutar la suite completa de pruebas: `pytest` en `backend-django/` (370 tests), `npm test` en `backend-node/` (130 tests) y `pytest` en `ai-service/` (63 tests), totalizando 563 tests pasando al 100%.

---
Fecha: 2026-10-30
Tarea: Estandarización y ampliación de tests unitarios y de API en backend-django (Cierre TP 3)
Rama: tp3-completo
Cambios realizados:
- Reestructuración completa y separación física en subcarpetas `tests/unit/` y `tests/api/` en todos los módulos de `backend-django` para homogeneizar la arquitectura con `backend-node` y `ai-service`:
  - `apps/insumos/tests/`:
    - `unit/test_unit_insumos_services.py`: tests unitarios puros de conversión de unidades base (g, ml, un), costeo unitario con/sin IVA y prorrateo proporcional de flete.
    - `unit/test_unit_confirmar_importacion.py`: tests unitarios del servicio `registrar_lote_compras_importacion` verificando prorrateo de envío, recálculo en cascada con desglose para snapshots, rollback atómico `@transaction.atomic` ante fallos, envío cero y validación de parámetros.
    - `api/test_api_confirmar_importacion.py`: tests de integración del endpoint `POST /api/compras/confirmar-importacion/` verificando éxito 201 para Dueño, rechazo 403 para Cajero, 401 para anónimo y 400 para payloads inválidos.
  - `apps/recetas/tests/`:
    - `unit/test_unit_costeo_services.py`: tests unitarios de cálculo de costo de productos (insumos + MO + descartables), márgenes y recálculo automático ante aumentos de insumos.
  - `apps/ventas/tests/`:
    - `unit/test_unit_ventas_services.py`: tests unitarios de creación de venta, totales y congelamiento de snapshot de costos (`CA4.2`).
    - `unit/test_unit_reportes_servicios.py`: 11 tests unitarios exhaustivos sobre las fórmulas de negocio de HU10 y HU11:
      - Ganancia diaria con costo unitario congelado (`CA10.1`), inmunidad ante subas de costos posteriores y caso borde de período sin ventas (retorno de ceros y desglose vacío).
      - Ranking de más y menos vendidos (`CA10.2`), límite configurable y detección de productos activos con 0 ventas.
      - Punto de equilibrio y metas diaria y semanal (`CA11.1` y `CA11.2`) con cálculo explícito y con agregación de tickets reales.
      - Casos borde y robustez matemática: costos fijos nulos/negativos, sin ventas en el período, costos variables superiores a ventas (margen de contribución negativo) y días operativos/semanales <= 0.
    - `api/test_api_reportes.py`: 14 tests de integración de endpoints DRF:
      - `GET /api/ventas/ganancia-diaria/`: 200 para Dueño, 403 para Encargado y Cajero, 400 para fechas inválidas.
      - `GET /api/ventas/ranking-productos/`: 200 para Dueño y Encargado (`reportes.ver_operativos`), 403 para Cajero, 400 para límite inválido.
      - `GET` y `POST /api/ventas/punto-equilibrio/`: 200 para Dueño (`reportes.ver_financieros`), 403 para Encargado y Cajero, 400 sin costos fijos o con costos variables excesivos.
  - `apps/salud/tests/`:
    - `api/test_api_health.py`: reubicación del test del endpoint `/health` y configuración de arranque en `tests/api/`.
  - `apps/comun/tests/`:
    - `api/test_api_endpoints.py`: reubicación de pruebas de paginación y contrato unificado de errores 404 en `tests/api/`.
- Conteo total de pruebas en verde en el monorepo:
  - `backend-django`: 357 tests (25 tests nuevos añadidos).
  - `backend-node`: 119 tests.
  - `ai-service`: 57 tests.
  - Total monorepo: 533 tests pasando al 100%.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Ninguna conexión de arquitectura fue alterada; se preservaron intactos todos los contratos JSON, permisos granulares y rutas de API.
Problemas y decisiones técnicas:
- **Separación física `unit/` y `api/` a nivel de filesystem:** Al organizar cada suite en su directorio específico, las herramientas de CI y los evaluadores docentes pueden ejecutar exclusivamente pruebas unitarias en memoria (`pytest apps/*/tests/unit/`) o pruebas de integración HTTP (`pytest apps/*/tests/api/`) de manera determinista e independiente.
- **Validación matemática exhaustiva de reportes:** Se reforzaron los tests con todos los casos borde posibles (costos fijos nulos/negativos, catálogo sin rotación, período sin tickets y márgenes de contribución negativos) comprobando que las excepciones se originen en los servicios y se traduzcan limpiamente en respuestas HTTP 400 por los ViewSets.
Archivos tocados:
- `backend-django/apps/insumos/tests/unit/test_unit_confirmar_importacion.py`
- `backend-django/apps/insumos/tests/unit/test_unit_insumos_services.py`
- `backend-django/apps/insumos/tests/api/test_api_confirmar_importacion.py`
- `backend-django/apps/recetas/tests/unit/test_unit_costeo_services.py`
- `backend-django/apps/ventas/tests/unit/test_unit_reportes_servicios.py`
- `backend-django/apps/ventas/tests/unit/test_unit_ventas_services.py`
- `backend-django/apps/ventas/tests/api/test_api_reportes.py`
- `backend-django/apps/salud/tests/api/test_api_health.py`
- `backend-django/apps/comun/tests/api/test_api_endpoints.py`
- `docs/bitacora.md`
Cómo probarlo:
- En `backend-django/`: `cd backend-django && USE_SQLITE=True .venv/bin/pytest` (357 tests en verde).
- En `backend-node/`: `cd backend-node && DJANGO_BASE_URL=http://localhost:59999 npm test` (119 tests en verde).
- En `ai-service/`: `cd ai-service && .venv/bin/pytest -v` (57 tests en verde).

---
Fecha: 2026-10-29
Tarea: T3.8 (Should) — Reportes financieros y operativos: ganancia diaria, ranking de productos, punto de equilibrio y metas (HU10–HU11)
Rama: feature/t3.8-reportes-ganancia-pe-metas
Cambios realizados:
- En `backend-django`:
  - `apps/ventas/services.py`:
    - `obtener_ganancia_diaria`: calcula la ganancia diaria y por rango de fechas (`CA10.1`) sumando `(precio_unitario − costo_unitario_snapshot) × cantidad` sobre `VentaItem`, garantizando que subas posteriores de insumos no reescriban la ganancia histórica, e incluye el desglose diario agrupado por `TruncDate("fecha")`.
    - `obtener_ranking_productos`: calcula el ranking de productos en un rango de fechas (`CA10.2`), devolviendo `mas_vendidos` (orden descendente por unidades vendidas) y `menos_vendidos` (orden ascendente incluyendo productos activos con `0.00` unidades vendidas para detectar ítems sin rotación).
    - `calcular_punto_equilibrio_y_metas`: implementa las fórmulas exactas de `docs/PLAN_IMPLEMENTACION.md` §3 (`CA11.1` y `CA11.2`) con `Decimal`:
      - `PE ($) = costos_fijos / (1 - (costos_variables / ventas))`
      - `meta_diaria = PE_mensual / dias_operativos`
      - `meta_semanal = meta_diaria * dias_semana`
      Permite calcular tanto con montos explícitos como tomando automáticamente `ventas` (`ingresos_totales`) y `costos_variables` (`costo_total_congelado`) de los tickets registrados en el período.
  - `apps/ventas/views.py`:
    - Incorporación de las acciones en `VentaViewSet`:
      - `GET /api/ventas/ganancia-diaria/` protegida con `TienePermiso("reportes.ver_financieros")`.
      - `GET /api/ventas/ranking-productos/` protegida con `TienePermiso("reportes.ver_operativos")`.
      - `GET` y `POST /api/ventas/punto-equilibrio/` protegida con `TienePermiso("reportes.ver_financieros")`.
- Suite de pruebas en `pytest`:
  - `backend-django/apps/ventas/tests/test_reportes_hu10_hu11.py`: 3 tests integrales verificando invariabilidad de la ganancia diaria ante aumentos posteriores de costos (`CA10.1`), ordenamiento de más y menos vendidos incluyendo productos con 0 ventas (`CA10.2`), cálculo exacto de punto de equilibrio y metas (`CA11.1`, `CA11.2`), validación HTTP 400 cuando `costos_variables >= ventas` y control de acceso 403/200 según rol y permiso.
- Documentación:
  - Actualización de `docs/seguridad.md` (§5.1) y `docs/bitacora.md`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Clientes HTTP / PWA ↔ `backend-django` (`GET /api/ventas/ganancia-diaria/`, `GET /api/ventas/ranking-productos/`, `GET|POST /api/ventas/punto-equilibrio/`).
Problemas y decisiones técnicas:
- **Inclusión de productos activos con 0 ventas en `menos_vendidos`:** Si el ranking solo consultara `VentaItem`, los productos que no se vendieron nunca en el período ni siquiera aparecerían entre los menos vendidos. Cruzar el agregado SQL con `Producto.objects.filter(estado_activo=True)` permite que el dueño identifique de inmediato qué productos de la carta tuvieron rotación cero.
- **Validación del margen de contribución en Punto de Equilibrio:** Cuando `costos_variables >= ventas`, la razón `1 - (costos_variables / ventas)` es cero o negativa, lo que matemática y financieramente significa que cada venta pierde dinero y no existe punto de equilibrio alcanzable por volumen; el servicio lo detecta y responde con un mensaje claro en HTTP 400.
Archivos tocados:
- `backend-django/apps/ventas/services.py`
- `backend-django/apps/ventas/views.py`
- `backend-django/apps/ventas/tests/test_reportes_hu10_hu11.py`
- `docs/seguridad.md`
- `docs/bitacora.md`
Cómo probarlo:
- Ejecutar las pruebas de reportes HU10 y HU11: `.\backend-django\.venv\Scripts\python.exe -m pytest backend-django/apps/ventas/tests/test_reportes_hu10_hu11.py -v`.

---
Fecha: 2026-10-29
Tarea: T3.7 — Ensayo sistemático de fallos apagando cada componente y documentación de lo observado (`docs/ensayo-fallos.md`)
Rama: feature/t3.7-ensayo-de-fallos
Cambios realizados:
- Creación del informe completo de ensayo de fallos en `docs/ensayo-fallos.md`:
  - Matriz resumen y análisis detallado paso a paso de los 5 escenarios de caída de componentes:
    1. **E1 (`ai-service` / proveedor de IA apagado):** `POST /api/importaciones` responde `HTTP 202 Accepted` sin bloquear, `ai.client.js` activa el fallback de contingencia tras el error de red/timeout, MongoDB persiste `estado: "CONTINGENCIA"` (`contingencia: true`) y Socket.IO emite `importacion.lista` indicando continuar por carga manual/CSV.
    2. **E2 (`backend-django` apagado durante consulta consolidada):** `GET /api/productos/:id/resumen-costo` valida el JWT RS256 en memoria local con `JWT_PUBLIC_KEY` (sin depender de Django) y responde `HTTP 200 OK` con `producto.degradado = true` más `historialReciente` y `ultimoSnapshot` desde MongoDB.
    3. **E3 (`backend-django` apagado durante aprobación humana `CA7.3` y posterior recuperación):** `POST /api/importaciones/:id/aprobar` responde `HTTP 502 Bad Gateway` con formato único `{ mensaje, detalles }` y **conserva la importación en estado `LISTA`**, permitiendo reintentar y completar la aprobación (`200 OK`, `estado: "APROBADA"`) cuando Django vuelve a estar en línea.
    4. **E4 (`backend-node` apagado y corte de transporte WebSocket):** `backend-django` y `PostgreSQL` mantienen 100% operativas las ventas, turnos, compras y recálculo de costos; la PWA muestra estado de reconexión y el cliente Socket.IO se reconecta automáticamente al volver Node.
    5. **E5 (`MongoDB` desconectado / error en consulta documental):** `errorHandler` captura `MongoNetworkError` devolviendo `HTTP 500` con formato único sin derribar el proceso de Node (`GET /health` sigue `200 OK`), mientras el núcleo contable en PostgreSQL sigue intacto.
- Creación de la suite reproducible de ensayo de fallos en `backend-node/tests/integration/ensayoFallos.integration.test.js` (4 tests integrales verificando E1, E2, E3 con recuperación posterior y E5, sumando 20 suites y 119 tests en verde en `backend-node`).
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Verificación empírica de los mecanismos de tolerancia a fallos de todas las conexiones activas entre `web/`, `backend-node`, `backend-django`, `ai-service`, `PostgreSQL` y `MongoDB`.
Problemas y decisiones técnicas:
- **Preservación de estado `LISTA` ante caída de Django en escrituras:** Si `backend-django` está apagado cuando el dueño aprueba una lista de precios, marcar la importación como `FALLIDA` obligaría a volver a ejecutar la extracción con IA. Mantener el documento en estado `LISTA` tras devolver `502 Bad Gateway` garantiza idempotencia operativa: apenas Django vuelve a levantar, un nuevo clic en "Aprobar" completa la transacción.
- **Validación JWT RS256 offline en Node durante caída de Django:** Gracias al esquema asimétrico RS256 (ADR-0001), `backend-node` puede seguir autenticando peticiones y handshakes de Socket.IO con su clave pública local aunque `backend-django` se encuentre temporalmente apagado.
Archivos tocados:
- `backend-node/tests/integration/ensayoFallos.integration.test.js`
- `docs/ensayo-fallos.md`
- `docs/bitacora.md`
Cómo probarlo:
- Ejecutar la suite automatizada de ensayo de fallos en Node: `npm --prefix backend-node test -- tests/integration/ensayoFallos.integration.test.js`.
- Ejecutar la suite completa de Node (20 suites, 119 tests): `npm --prefix backend-node test`.
- Consultar el documento detallado en `docs/ensayo-fallos.md`.

---
Fecha: 2026-10-29
Tarea: T3.6 — Cliente mínimo PWA en `web/` (tablero en tiempo real + importación con IA + caja rápida) y diagrama de secuencia Mermaid
Rama: feature/t3.6-cliente-pwa-tiempo-real
Cambios realizados:
- En `web/` (Cliente mínimo PWA instalable):
  - `web/manifest.webmanifest` y `web/sw.js`: configuración de PWA instalable (`display: standalone`, `start_url: /app/index.html`) y Service Worker con caché de cáscara estática (`cafe-gestion-pwa-v1`, estrategia Network-First con fallback a caché para recursos estáticos, excluyendo rutas `/api/` y `/socket.io/`).
  - `web/js/logicaPwa.js`: módulo puro con funciones de negocio del cliente:
    - `convertirMontoACentavos` y `formatearCentavosADecimal`: aritmética monetaria exacta en centavos enteros para evitar errores de punto flotante (`AGENTS.md`).
    - `buscarProductoPorCodigoOTexto`: búsqueda instantánea priorizando coincidencia exacta por `codigo_barras` (emulación de teclado HID, `CA4.4`) y luego por nombre.
    - `agregarProductoAlCarrito` y `calcularResumenCarrito`: gestión inmutable del carrito de caja y armado del payload para `POST /api/ventas/`.
    - `formatearEventoTiempoReal`: clasificación visual de los eventos de Socket.IO (`venta.registrada`, `costo.actualizado` con bandera `alertaMargenBajo`, `stock.bajo`, `importacion.lista`).
  - `web/index.html`, `web/css/estilos.css` y `web/js/app.js`: interfaz completa con autenticación JWT RS256 contra Django (`POST /api/auth/token/`), conexión y reconexión automática a Socket.IO y los tres módulos requeridos:
    1. **Tablero en Tiempo Real:** indicadores de conexión y presencia (`presencia.actualizada`), contadores en vivo y feed de eventos.
    2. **Importación de Precios con IA (HU7):** envío asíncrono `POST /api/importaciones` (`202 Accepted`), recepción de `importacion.lista`, tabla de revisión de ítems extraídos y botones de **Aprobar y Recalcular Recetas** (`POST /api/importaciones/:id/aprobar`) y **Rechazar Propuesta** (`POST /api/importaciones/:id/rechazar`).
    3. **Caja Rápida y Turno (HU4):** unión a sala `turno:{id}` (`turno:unirse`), campo para lector de código de barras HID (`Enter`), grilla rápida de productos, tabla de ticket y cobro (`POST /api/ventas/`).
- En `backend-node`:
  - `app.js`: montaje estático de `../web` bajo `/app` y ajuste de `connectSrc` en Helmet CSP para permitir llamadas locales a Django (`8000`) y Node/WebSocket (`3000`).
- Suite de pruebas en Jest (19 suites, 115 tests totales en verde):
  - `backend-node/tests/unit/logicaPwa.unit.test.js` (5 tests unitarios): aritmética en centavos sin float, búsqueda por lector HID `codigo_barras`, acumulación de carrito y formateo de los 4 eventos en tiempo real.
  - `backend-node/tests/integration/clientePwa.integration.test.js` (3 tests de integración): entrega HTTP 200 de `/app/index.html`, `/app/manifest.webmanifest`, `/app/sw.js`, `/app/css/estilos.css`, `/app/js/app.js` y `/app/js/logicaPwa.js`.
- Documentación:
  - Incorporación del diagrama de secuencia Mermaid completo del cliente PWA en `docs/arquitectura.md` (§7) y `docs/integracion.md` (§4).
  - Actualización de `docs/CONNECTIONS.md`, `docs/ARCHITECTURE.md` y `docs/bitacora.md`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Cliente Mínimo PWA (`web/`) ↔ `backend-node` (`/app`, `/api/importaciones`, Socket.IO) y `backend-django` (`/api/auth/token/`, `/api/ventas/`).
Problemas y decisiones técnicas:
- **Aritmética en centavos enteros también en el navegador:** En JavaScript, sumar `0.1 + 0.2` con `Number` produce `0.30000000000000004`. Para cumplir la regla de cero punto flotante para dinero de `AGENTS.md`, `logicaPwa.js` convierte cada precio decimal a centavos enteros antes de multiplicar o sumar subtotales en el carrito de caja.
- **Montaje de `web/` bajo `/app` en Express:** Permite abrir la PWA en `http://localhost:3000/app/index.html` compartiendo origen con Socket.IO (`/socket.io/socket.io.js`) y la API de Node sin requerir herramientas de bundling adicionales ni romper la política de CSP de Helmet.
Archivos tocados:
- `web/index.html`
- `web/manifest.webmanifest`
- `web/sw.js`
- `web/css/estilos.css`
- `web/js/logicaPwa.js`
- `web/js/app.js`
- `backend-node/app.js`
- `backend-node/tests/unit/logicaPwa.unit.test.js`
- `backend-node/tests/integration/clientePwa.integration.test.js`
- `docs/arquitectura.md`
- `docs/integracion.md`
- `docs/CONNECTIONS.md`
- `docs/ARCHITECTURE.md`
- `docs/bitacora.md`
Cómo probarlo:
- Ejecutar las pruebas unitarias y de integración del cliente PWA: `npm --prefix backend-node test -- tests/unit/logicaPwa.unit.test.js tests/integration/clientePwa.integration.test.js`.
- Ejecutar la suite completa de Node: `npm --prefix backend-node test`.
- Con `backend-node` corriendo (`npm --prefix backend-node run dev`), abrir `http://localhost:3000/app/index.html` en el navegador.

---
Fecha: 2026-10-29
Tarea: T3.5 — Socket.IO en Node: handshake con JWT RS256, salas `local` y `turno:{id}`, eventos reales (`venta.registrada`, `costo.actualizado`, `stock.bajo`, `importacion.lista`), presencia y reconexión automática
Rama: feature/t3.5-socketio-tiempo-real
Cambios realizados:
- En `backend-node`:
  - Instalación de `socket.io` y `socket.io-client`.
  - `src/sockets/middleware/auth.socket.middleware.js`: implementación de `extraerTokenHandshake` (soporta `socket.handshake.auth.token` y cabecera `Authorization: Bearer <token>`) y del middleware `autenticarSocketJwt`, que verifica la firma RS256 con `JWT_PUBLIC_KEY`, expiración, emisor `cafe-gestion-django`, `token_type === 'access'` y estado activo del usuario (`CA9.1` y `docs/seguridad.md` §5.2), rechazando conexiones no autenticadas con estructura `{ mensaje, detalles, codigo }`.
  - `src/sockets/emitter.js`: implementación de los emisores de eventos de negocio en tiempo real:
    - `emitirVentaRegistrada`: difunde `venta.registrada` hacia la sala `local` y hacia `turno:{id}` cuando se indica el turno de caja.
    - `emitirCostoActualizado`: difunde `costo.actualizado` únicamente a la sala interna `permiso:recetas.ver_costos` (usuarios con rol `DUENIO` o permiso `recetas.ver_costos`), calculando la bandera `alertaMargenBajo` cuando el nuevo margen cae por debajo del objetivo (`CA8.3`).
    - `emitirStockBajo`: difunde `stock.bajo` únicamente a la sala `rol:stock_alertas` (`DUENIO` y `ENCARGADO`).
    - `emitirImportacionLista`: difunde `importacion.lista` a la sala `local` al completarse la extracción asíncrona con IA.
  - `src/sockets/index.js`: implementación de `inicializarSocketIO`, `validarAccesoSalaTurno`, `obtenerEstadoPresencia` y `obtenerOpcionesClienteReconexion`:
    - Unión automática a `local` al conectar y asignación a salas de permisos (`permiso:recetas.ver_costos` y `rol:stock_alertas`).
    - Control de acceso sobre `turno:unirse` para la sala `turno:{id}`: solo permite unirse al titular del turno (`titularId === usuario.id`), al rol `DUENIO` o a quien posea el permiso `caja.gestionar_turnos_ajenos`, emitiendo `error:autorizacion` en caso contrario.
    - Registro y difusión en vivo de presencia (`presencia.actualizada` y `presencia:consultar`) al conectar y desconectar.
  - `src/services/importacionIA.service.js`: integración con `emitirImportacionLista` al finalizar `procesarImportacionEnSegundoPlano` y con `emitirCostoActualizado` por cada producto recalculado en `aprobarImportacionPrecios`.
  - `server.js`: creación explícita del servidor HTTP (`http.createServer(app)`) y montaje de `inicializarSocketIO(servidorHttp)`.
- Suite de pruebas en Jest (17 suites, 107 tests totales en verde):
  - `backend-node/tests/unit/socketAuth.unit.test.js` (14 tests unitarios): extracción de token desde `auth.token` y `headers.authorization`, validación RS256, rechazo por token ausente, tipo `refresh`, usuario inactivo, token expirado o clave RSA ajena, reglas de `validarAccesoSalaTurno` y opciones de reconexión automática.
  - `backend-node/tests/integration/socketio.integration.test.js` (5 tests de integración con `socket.io-client`): rechazo en el handshake sin token o con token inválido, presencia en tiempo real al conectar/desconectar, autorización de sala `turno:{id}` y recepción de `venta.registrada`, filtrado estricto por rol/permiso de `costo.actualizado` (`alertaMargenBajo: true`), `stock.bajo` e `importacion.lista`, y reconexión automática tras corte del transporte.
- Documentación:
  - Actualización de `docs/CONNECTIONS.md`, `docs/ARCHITECTURE.md` y `docs/bitacora.md`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Clientes Web / PWA ↔ `backend-node` (Socket.IO con handshake JWT RS256, salas `local` y `turno:{id}`, presencia y eventos en tiempo real).
Problemas y decisiones técnicas:
- **Aislamiento de eventos sensibles mediante salas internas de permisos:** En lugar de emitir `costo.actualizado` o `stock.bajo` a toda la sala `local` (lo que expondría costos y márgenes a cajeros sin permiso en el tráfico WebSocket), el servidor clasifica cada socket durante la conexión en salas internas (`permiso:recetas.ver_costos` y `rol:stock_alertas`) verificadas contra las claims firmadas del JWT RS256, cumpliendo `docs/seguridad.md` §5.2.
- **Emisión desacoplada y segura en tests HTTP:** Los emisores de `src/sockets/emitter.js` verifican si hay una instancia de Socket.IO activa antes de emitir (`if (!ioInstancia) return false`), permitiendo que los tests de servicios e integración con `supertest` corran sin requerir levantar un servidor WebSocket a menos que se pruebe específicamente tiempo real.
Archivos tocados:
- `backend-node/package.json`
- `backend-node/package-lock.json`
- `backend-node/server.js`
- `backend-node/src/sockets/middleware/auth.socket.middleware.js`
- `backend-node/src/sockets/emitter.js`
- `backend-node/src/sockets/index.js`
- `backend-node/src/services/importacionIA.service.js`
- `backend-node/tests/unit/socketAuth.unit.test.js`
- `backend-node/tests/integration/socketio.integration.test.js`
- `docs/CONNECTIONS.md`
- `docs/ARCHITECTURE.md`
- `docs/bitacora.md`
Cómo probarlo:
- Ejecutar los tests unitarios e integrales de Socket.IO: `npm --prefix backend-node test -- tests/unit/socketAuth.unit.test.js tests/integration/socketio.integration.test.js`.
- Ejecutar la suite completa de Node: `npm --prefix backend-node test`.

---
Fecha: 2026-10-29
Tarea: T3.4 — Optimización de 3 consultas problemáticas en PostgreSQL con `EXPLAIN ANALYZE` sobre seed de 50.000 ventas (`docs/optimizacion.md`)
Rama: feature/t3.4-optimizacion-consultas-postgres
Cambios realizados:
- En `backend-django`:
  - **Consulta 1 (Listado de productos con costo sin N+1):**
    - `apps/recetas/services.py` y `apps/recetas/views.py`: incorporación de `listar_productos_con_costos_optimizado()` con `Prefetch("receta_items", queryset=RecetaItem.objects.select_related("insumo").order_by("id"))` y reutilización de `_prefetched_objects_cache` en `obtener_desglose_costeo_producto()`, reduciendo las consultas de $1 + N$ a constante = 2 consultas SQL.
    - `apps/recetas/models.py` y migración `0002_indices_optimizacion_t34.py`: incorporación del índice compuesto `idx_producto_activo_nombre` sobre `(estado_activo, nombre)`.
  - **Consulta 2 (Reporte de ventas por producto con índice por fecha):**
    - `apps/ventas/models.py` y migración `0002_indices_optimizacion_t34.py`: creación de los índices B-Tree `idx_venta_fecha` sobre `Venta(fecha)`, `idx_venta_fecha_id_desc` sobre `Venta(-fecha, -id)`, `idx_ventaitem_venta_prod` sobre `VentaItem(venta, producto)` e `idx_ventaitem_prod_venta` sobre `VentaItem(producto, venta)`.
    - `apps/ventas/services.py` y `apps/ventas/views.py`: implementación de `construir_queryset_reporte_ventas_por_producto()`, `obtener_reporte_ventas_por_producto()` y la acción `GET /api/ventas/reporte-por-producto/` en `VentaViewSet` (protegida con `TienePermiso("reportes.ver_operativos")`), resolviendo el reporte en una única consulta agregada SQL (`GROUP BY`).
  - **Consulta 3 (Recálculo de productos afectados por insumo):**
    - `apps/recetas/models.py` y migración `0002_indices_optimizacion_t34.py`: creación del índice compuesto invertido `idx_recetaitem_insumo_prod` sobre `(insumo, producto)` para búsquedas inversas por `insumo_id` mediante `Index Only Scan`.
    - `apps/recetas/services.py`: refactorización de `recalcular_recetas_por_insumo()` combinando `Prefetch` con `Producto.objects.bulk_update(...)`, reduciendo las sentencias SQL de $1 + 2M$ a constante = 3 sentencias SQL.
  - **Seed volumétrico y comando de medición:**
    - `apps/insumos/management/commands/seed_rendimiento.py`: comando que genera por lotes (`bulk_create`) hasta 50.000 ventas, 40 productos y 25 insumos, y ejecuta `explain()` sobre las consultas críticas.
- Suite de pruebas en `pytest` (329 tests totales en verde):
  - `backend-django/apps/comun/tests/test_optimizacion_consultas.py`: 6 tests verificando presencia de índices en `_meta.indexes`, conteo exacto de queries con `django_assert_num_queries` (2 queries en listado de 15 productos, 1 query en reporte de ventas por fecha, 3 queries en recálculo masivo de 12 productos), permisos (403 negativo para Cajero y 200 para Dueño) y ejecución de `seed_rendimiento`.
- Documentación:
  - Creación de `docs/optimizacion.md` con el análisis comparativo completo de `EXPLAIN (ANALYZE, BUFFERS)` antes y después sobre 50.000 ventas.
  - Actualización de `docs/seguridad.md` y `docs/bitacora.md`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Clientes HTTP / PWA ↔ `backend-django` (`GET /api/ventas/reporte-por-producto/` protegido con `reportes.ver_operativos`).
Problemas y decisiones técnicas:
- **Reutilización explícita de `_prefetched_objects_cache`:** En Django, invocar `.select_related("insumo").all()` sobre un manager relacionado invalida la caché cargada por `prefetch_related` y dispara una nueva consulta SQL por cada objeto padre. Declarar el `select_related("insumo")` dentro de `Prefetch(...)` y consumir `.all()` cuando `"receta_items"` ya está en `_prefetched_objects_cache` elimina por completo el N+1 tanto en la API como en el servicio de costeo.
- **Índice invertido `(insumo, producto)` en `RecetaItem`:** El constraint `unique_together = ("producto", "insumo")` indexa primero `producto_id`, por lo que filtrar únicamente por `insumo_id` al recalcular costos forzaba un `Seq Scan`. El nuevo índice `idx_recetaitem_insumo_prod` coloca `insumo_id` como primera columna y permite un `Index Only Scan`.
Archivos tocados:
- `backend-django/apps/recetas/models.py`
- `backend-django/apps/recetas/migrations/0002_indices_optimizacion_t34.py`
- `backend-django/apps/recetas/services.py`
- `backend-django/apps/recetas/views.py`
- `backend-django/apps/ventas/models.py`
- `backend-django/apps/ventas/migrations/0002_indices_optimizacion_t34.py`
- `backend-django/apps/ventas/services.py`
- `backend-django/apps/ventas/views.py`
- `backend-django/apps/insumos/management/commands/seed_rendimiento.py`
- `backend-django/apps/comun/tests/test_optimizacion_consultas.py`
- `docs/optimizacion.md`
- `docs/seguridad.md`
- `docs/bitacora.md`
Cómo probarlo:
- Ejecutar los tests de optimización y conteo de queries: `.\backend-django\.venv\Scripts\python.exe -m pytest backend-django/apps/comun/tests/test_optimizacion_consultas.py -v`.
- Ejecutar el seed de rendimiento y planes `EXPLAIN`: `.\backend-django\.venv\Scripts\python.exe backend-django/manage.py seed_rendimiento --ventas 5000 --productos 40 --lote 2500` (o `--ventas 50000`).

---
Fecha: 2026-10-29
Tarea: T3.3 — Aprobación humana de precios importados (Node llama a Django → compra nueva → recálculo de costos → historial y snapshots en MongoDB)
Rama: feature/t3.3-aprobacion-humana-compra
Cambios realizados:
- En `backend-django`:
  - `apps/recetas/services.py`: incorporación de `obtener_desglose_costeo_producto` y ampliación retrocompatible de `recalcular_recetas_por_insumo` para devolver, además de `producto_id`, `nombre`, `costo_anterior`, `costo_nuevo` y `margen_nuevo`, el `insumo_id` disparador, `costo_mano_obra`, `costo_descartables` y el arreglo `desglose_insumos` requerido por `SnapshotCosteo` sin realizar consultas N+1.
  - `apps/insumos/services.py`: creación de `inferir_unidad_base` y del servicio transaccional `@transaction.atomic` `registrar_lote_compras_importacion`, que resuelve proveedor e insumos (por ID o nombre), prorratea el envío total proporcionalmente al valor de cada línea (`prorratear_envio`), persiste cada `Compra`, actualiza `Insumo.costo_unitario` y recopila las recetas recalculadas con su desglose.
  - `apps/insumos/serializers.py` y `apps/insumos/views.py`: incorporación de `ItemConfirmacionImportacionSerializer`, `ConfirmarImportacionComprasSerializer` y la acción `POST /api/compras/confirmar-importacion/` en `CompraViewSet` protegida con `TienePermiso("compras.registrar")`.
- En `backend-node`:
  - `src/clients/django.client.js`: incorporación de `normalizarRespuestaConfirmacionDjango` y `confirmarImportacionComprasDjango` con reenvío de la cabecera `Authorization: Bearer <token>`, traducción `snake_case` ↔ `camelCase` en un único punto, timeout de 5000ms y manejo de errores HTTP 400/502 según `docs/api-errores.md`.
  - `src/models/ImportacionIA.js`: incorporación de campos de auditoría de revisión humana (`aprobadoPorId`, `rechazadoPorId`, `motivoRechazo`, `comprasGeneradasIds`, `productosRecalculadosIds`).
  - `src/services/importacionIA.service.js`: implementación de `aprobarImportacionPrecios` (valida estado `LISTA`/`CONTINGENCIA`, llama a Django, persiste automáticamente en MongoDB un `HistorialPrecio` y un `SnapshotCosteo` por cada producto recalculado según CA3.2 y marca la importación como `APROBADA`) y `rechazarImportacionPrecios` (marca la importación como `RECHAZADA` sin llamar a Django ni alterar compras ni costos según CA7.3).
  - `src/controllers/importacionIA.controller.js` y `src/routes/importacionIA.routes.js`: endpoints `POST /:id/aprobar` y `POST /:id/rechazar` protegidos con `verificarToken`, `verificarPermiso('ia.importar_listas')` y validaciones `express-validator`.
- Suites de pruebas automatizadas en `pytest` y `Jest`:
  - `backend-django/apps/insumos/tests/test_confirmar_importacion.py`: 5 tests verificando prorrateo de envío y desglose de recálculo, rollback atómico `@transaction.atomic` ante unidad incompatible, éxito 201 con Dueño, rechazo negativo 403 con Cajero y rechazo 400 ante datos inválidos.
  - `backend-node/tests/unit/djangoClient.unit.test.js`: 4 tests unitarios verificando normalización `snake_case` → `camelCase`, reenvío de JWT RS256, propagación de error 400 y manejo de caída de red con 502.
  - `backend-node/tests/integration/importacionIA.integration.test.js`: ampliación con tests de aprobación humana (persistencia de `HistorialPrecio` y `SnapshotCosteo` + transición a `APROBADA`), rechazo humano (CA7.3: transición a `RECHAZADA` con 0 llamadas a Django), bloqueo 400 ante doble procesamiento y respuesta 502 conservando estado `LISTA` si Django está caído.
- Documentación:
  - Actualización de `docs/CONNECTIONS.md`, `docs/ARCHITECTURE.md`, `docs/integracion.md`, `docs/seguridad.md` y `docs/bitacora.md`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Clientes HTTP / PWA ↔ `backend-node` (`POST /api/importaciones/:id/aprobar`, `POST /api/importaciones/:id/rechazar`).
- `backend-node` (`django.client.js`) ↔ `backend-django` (`POST /api/compras/confirmar-importacion/` con reenvío de JWT RS256).
Problemas y decisiones técnicas:
- **Humano en el circuito obligatorio (CA7.3):** Ninguna propuesta de la IA modifica PostgreSQL automáticamente; solo `POST /:id/aprobar` dispara la llamada transaccional a Django, mientras que `POST /:id/rechazar` cierra el flujo en MongoDB sin tocar compras ni costos.
- **Atomicidad en Django y preservación de estado en Node:** Si una línea del lote falla en Django, `@transaction.atomic` revierte todo el lote. Si Django no está disponible cuando el humano aprueba, Node responde `502 Bad Gateway` pero mantiene la importación en estado `LISTA` para que el usuario pueda reintentar sin perder la propuesta extraída.
- **Desglose de recálculo en la misma respuesta transaccional:** Al incluir `desglose_insumos`, `costo_mano_obra` y `costo_descartables` en la salida de `recalcular_recetas_por_insumo`, Node persiste `historial_precios` y `snapshots_costeo` (CA3.2) en el acto sin hacer peticiones N+1 adicionales a Django.
Archivos tocados:
- `backend-django/apps/recetas/services.py`
- `backend-django/apps/insumos/services.py`
- `backend-django/apps/insumos/serializers.py`
- `backend-django/apps/insumos/views.py`
- `backend-django/apps/insumos/tests/test_confirmar_importacion.py`
- `backend-node/src/clients/django.client.js`
- `backend-node/src/models/ImportacionIA.js`
- `backend-node/src/services/importacionIA.service.js`
- `backend-node/src/controllers/importacionIA.controller.js`
- `backend-node/src/routes/importacionIA.routes.js`
- `backend-node/tests/unit/djangoClient.unit.test.js`
- `backend-node/tests/integration/importacionIA.integration.test.js`
- `docs/CONNECTIONS.md`
- `docs/ARCHITECTURE.md`
- `docs/integracion.md`
- `docs/seguridad.md`
- `docs/bitacora.md`
Cómo probarlo:
- En `backend-django/`: ejecutar tests de confirmación de importación con `pytest apps/insumos/tests/test_confirmar_importacion.py -v` (con `USE_SQLITE=True`).
- En `backend-node/`: ejecutar `npm test` (15 suites, 88 tests en verde).
- En `backend-node/`: ejecutar específicamente los tests de T3.2 y T3.3: `npm test -- tests/unit/djangoClient.unit.test.js tests/unit/aiClient.unit.test.js tests/integration/importacionIA.integration.test.js`.

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
Fecha: 2026-10-31
Tarea: TP 4 - Despliegue con Docker Compose, CI/CD con GitHub Actions, Observabilidad, Trazabilidad y Healthchecks Avanzados (T4.1 a T4.7)
Rama: feature/tp4-despliegue-cicd-observabilidad
Cambios realizados:
- **T4.1 Contenedorización Multi-Stage:** Se construyeron los `Dockerfile` optimizados en múltiples etapas y sus correspondientes `.dockerignore` para `backend-django` (Python 3.13-slim + Gunicorn), `backend-node` (Node 20-alpine), `ai-service` (Python 3.13-slim + FastAPI) y `web` (Nginx 1.27-alpine), garantizando ejecución con usuario no-root (`appuser`, `node`, `nginx`) y directivas `HEALTHCHECK` integradas.
- **T4.2 Orquestación con Docker Compose:** Se definieron `docker-compose.yml` y `docker-compose.prod.yml` orquestando la solución completa en un único comando. Se configuró la segmentación de redes (`red-interna` y `red-publica`), volúmenes nombrados persistentes (`postgres_data`, `mongo_data`), arranque condicional ordenado (`depends_on: { condition: service_healthy }`) y límites estrictos de memoria RAM cgroups y motor WiredTiger para convivir holgadamente en el equipo de 8 GB de RAM del local.
- **T4.3 Pipeline Automatizado de CI/CD:** Se implementó el flujo en `.github/workflows/ci.yml` con escaneo de secretos, linter de Python (`ruff`), linter de Node.js (`eslint`), ejecución paralela de las 3 suites de tests (370 en Django, 130 en Node, 63 en ai-service; 563 tests en total) y validación/build de imágenes Docker Compose.
- **T4.4 Modalidad de Despliegue (ADR 0003):** Se redactó el documento formal `docs/adr/0003-modalidad-despliegue-produccion.md` justificando la arquitectura de PC local con Docker Compose y PWA para operación ininterrumpida ante cortes de internet.
- **Observabilidad y Trazabilidad Distribuida:** Se implementaron middlewares de propagación y generación de `X-Request-ID` (UUID v4) en Django (`CorrelationIdMiddleware`), Node (`correlationIdMiddleware`) y FastAPI (`CorrelationIdMiddleware`). Se incorporó logging estructurado en formato JSON con sanitización automática de credenciales y tokens, y endpoints de salud profunda (`/health/profundo` y `/api/health/profundo/`) que comprueban conectividad y latencia con bases de datos y microservicios satélites.
- **Scripts de Operación:** Se desarrollaron los scripts con permisos de ejecución `scripts/backup.sh` (volcado automatizado comprimido de PostgreSQL y MongoDB sin sudo), `scripts/restore.sh` (recuperación de desastre) y `scripts/desplegar.sh` (puesta en marcha automatizada con verificación de healthchecks).
- **Pruebas Automatizadas Unitarias y de Integración:** Se añadieron 30 nuevos tests (unitarios puros en `unit/` y de integración en `api/` / `integration/`) elevando el total del sistema a 563 tests pasando al 100 % en verde.
- **Documentación:** Se redactó el manual operativo integral en `docs/despliegue.md`, y se actualizaron `README.md`, `docs/ARCHITECTURE.md` y `docs/CONNECTIONS.md`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- `web-proxy` (Nginx Alpine en puerto 80) -> `backend-django` (8000) en `/api/` y `backend-node` (3000) en `/socket.io/` y rutas documentales.
- Trazabilidad de peticiones mediante propagación de la cabecera `X-Request-ID` entre clientes, Nginx, Node, Django y `ai-service`.
- Scripts de backup y restore interactuando con las bases de datos PostgreSQL y MongoDB vía Docker Exec o CLI local.
Problemas y decisiones técnicas:
- **Gestión de memoria en 8 GB de RAM:** Para evitar el riesgo de bloqueo por falta de memoria (*OOM*) en la PC del comercio, se limitó la memoria de MongoDB WiredTiger a 256 MB (`--wiredTigerCacheSizeGB 0.25`), se fijaron límites de memoria cgroups en compose y se descartó la inferencia local con Ollama en la PC de caja, utilizando el adapter externo a Gemini API con contingencia automática a carga manual ante caídas de internet.
- **Trazabilidad sin acoplamiento:** El middleware de correlación genera un UUID v4 si la cabecera `X-Request-ID` no está presente o la preserva si proviene de un cliente o servicio upstream, permitiendo correlacionar logs estructurados en JSON entre Django, Node y FastAPI sin acoplamiento funcional.
- **Salud básica vs. Salud profunda:** Se mantuvo la separación estricta entre liveness probe (`/health`, rápido y sin tocar bases de datos) y readiness probe (`/health/profundo`, consulta `SELECT 1` o `readyState` y mide latencia) para evitar falsos reinicios de contenedores durante arranques en frío o picos de carga.
Archivos tocados:
- `docs/adr/0003-modalidad-despliegue-produccion.md`
- `docs/despliegue.md`
- `docs/ARCHITECTURE.md`
- `docs/CONNECTIONS.md`
- `docs/bitacora.md`
- `README.md`
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `pyproject.toml`
- `.github/workflows/ci.yml`
- `.gitignore`
- `scripts/backup.sh`
- `scripts/restore.sh`
- `scripts/desplegar.sh`
- `backend-django/Dockerfile`, `backend-django/.dockerignore`, `backend-django/requirements.txt`
- `backend-django/apps/comun/middleware.py`, `backend-django/apps/comun/logging.py`
- `backend-django/apps/comun/tests/unit/test_unit_correlation_id.py`, `backend-django/apps/comun/tests/unit/test_unit_json_logging.py`
- `backend-django/apps/salud/services.py`, `backend-django/apps/salud/views.py`, `backend-django/apps/salud/urls.py`
- `backend-django/apps/salud/tests/unit/test_unit_health_services.py`, `backend-django/apps/salud/tests/api/test_api_health_profundo.py`
- `backend-django/config/settings/base.py`, `backend-django/config/urls.py`
- `backend-node/Dockerfile`, `backend-node/.dockerignore`, `backend-node/package.json`, `backend-node/package-lock.json`, `backend-node/eslint.config.js`
- `backend-node/app.js`
- `backend-node/src/middlewares/correlationId.middleware.js`, `backend-node/src/utils/logger.js`
- `backend-node/src/controllers/health.controller.js`, `backend-node/src/routes/health.routes.js`, `backend-node/src/tests/health.test.js`
- `backend-node/src/clients/django.client.js`, `backend-node/src/clients/ai.client.js`
- `backend-node/tests/unit/correlationId.unit.test.js`, `backend-node/tests/unit/jsonLogging.unit.test.js`, `backend-node/tests/unit/healthProfundo.unit.test.js`
- `ai-service/Dockerfile`, `ai-service/.dockerignore`
- `ai-service/app/main.py`, `ai-service/app/middlewares/correlation.py`, `ai-service/app/utils/logger.py`, `ai-service/app/routers/salud.py`
- `ai-service/app/tests/unit/test_unit_correlation_id.py`, `ai-service/app/tests/unit/test_unit_json_logging.py`, `ai-service/app/tests/api/test_api_observabilidad.py`
- `web/Dockerfile`, `web/.dockerignore`, `web/nginx.conf`
Cómo probarlo:
- Ejecutar `backend-django/.venv/bin/pytest backend-django/` (370 tests pasando).
- Ejecutar `cd backend-node && npm test` (130 tests pasando).
- Ejecutar `ai-service/.venv/bin/pytest ai-service/` (63 tests pasando).
- Ejecutar `.venv/bin/ruff check backend-django/ ai-service/` y `cd backend-node && npm run lint` (0 errores).
- Validar sintaxis y configuración de Docker Compose con `docker compose config`.
- Verificar sintaxis de scripts con `bash -n scripts/*.sh`.
---
Fecha: 2026-11-09
Tarea: Evolución comercial de Sapori Stock POS — Formalidad sin emojis, Importador CSV Drag & Drop, Operación Híbrida Cloud/LAN/Offline y Despliegue (Vercel + Render + Aiven)
Rama: feature/pos-comercial-sapori-stock
Cambios realizados:
- **1. Formalidad estricta (Cero emojis en toda la interfaz):**
  - Se eliminó el 100 % de los emojis en `web/index.html`, `web/js/app.js`, `web/js/logicaPwa.js` y `web/css/estilos.css`.
  - Se reemplazaron exclusivamente por íconos vectoriales SVG monocromáticos (`stroke="currentColor"`) y etiquetas tipográficas corporativas.
- **2. Importación de archivos `.csv` / `.txt` de proveedores y precios:**
  - En el módulo de Compras e Importación de Listas se incorporó una zona *Drag & Drop* y el botón **"Descargar Plantilla CSV Modelo"** (`plantilla_lista_proveedor.csv` con columnas `insumo,cantidad,unidad,precio_total,alicuota_iva,envio`).
  - Se implementó `parsearCsvProveedor` en `web/js/logicaPwa.js` con soporte automático para coma (`,`) y punto y coma (`;`, estándar de Excel en español), previsualización tabular y botones para enviar al circuito de aprobación (`POST /api/importaciones`) o confirmar directamente en inventario (`POST /api/compras/confirmar-importacion/`) recalculando costos en cascada.
- **3. Arquitectura híbrida (Modo Web Cloud + Modo Local LAN + Contingencia Offline):**
  - Resolución dinámica de `DJANGO_API_URL` y `NODE_API_URL` en `web/js/app.js` con modal de **"Configuración de Servidor / Modo de Conexión"** accesible en el login y en la barra superior.
  - Persistencia local automática en `localStorage` del catálogo de productos y estado del turno.
  - Implementación de la **Cola de Sincronización Offline** (`localStorage` clave `sapori_cola_ventas_offline`) mediante `encolarVentaOffline`, `obtenerVentasOffline` y `limpiarColaOffline`: ante caída de red o `navigator.onLine === false`, el cajero cobra sin bloqueo, emite el Ticket Térmico de 80mm con leyenda *"Comprobante Emitido en Modo Offline - Pendiente de Sincronización"* y visualiza el indicador *"Modo Sin Internet Activo — X ventas en cola local"*.
  - Detección automática de reconexión (`window.addEventListener('online', ...)`) y botón **"Sincronizar Ventas Pendientes"** para enviar en orden las ventas encoladas a `POST /api/ventas/`.
  - Actualización de `web/sw.js` con estrategia *Network-First con Fallback a Caché* para todos los recursos de la cáscara PWA.
- **4. Configuración de despliegue Cloud (Vercel + Render + Aiven):**
  - Creación de `vercel.json` para servir la PWA (`web/`) con cabeceras de seguridad y Service Worker habilitado.
  - Creación de `render.yaml` definiendo los 3 servicios (`sapori-backend-django`, `sapori-backend-node` y `sapori-ai-service` con `AI_PROVIDER=groq`).
  - Actualización de `backend-django/config/settings/base.py` para lectura dinámica de `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` y `DATABASE_URL` (PostgreSQL en Aiven), preservando compatibilidad local.
- **5. Tests unitarios:**
  - Incorporación de pruebas unitarias en `backend-node/tests/unit/logicaPwa.unit.test.js` para `parsearCsvProveedor` (coma y punto y coma) y para la cola de ventas offline (`encolarVentaOffline`, `obtenerVentasOffline`, `limpiarColaOffline`).
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- Cliente PWA (`web/`) ↔ `backend-django` (`POST /api/compras/confirmar-importacion/`, `POST /api/ventas/` con cola offline en `localStorage`) y `backend-node` (`POST /api/importaciones`), más descriptores de despliegue `vercel.json` y `render.yaml`.
Archivos tocados:
- `web/index.html`
- `web/js/app.js`
- `web/js/logicaPwa.js`
- `web/css/estilos.css`
- `web/sw.js`
- `backend-django/config/settings/base.py`
- `backend-node/tests/unit/logicaPwa.unit.test.js`
- `vercel.json`
- `render.yaml`
- `docs/CONNECTIONS.md`
- `docs/ARCHITECTURE.md`
- `docs/bitacora.md`
Cómo probarlo:
- Ejecutar las 3 suites de pruebas (`backend-django`, `backend-node` y `ai-service`).
- Probar la interfaz en `http://localhost:5173` (o `/app/`), verificando la ausencia total de emojis, la descarga e importación de `plantilla_lista_proveedor.csv`, el modal de modo de conexión y el cobro de tickets en modo sin internet.
---
Fecha: 2026-11-09
Tarea: Corrección de alineación tabular, circuito de aprobación IA/CSV, sincronización de cola de ventas offline y auditoría E2E de las 6 secciones
Rama: feature/pos-comercial-sapori-stock
Cambios realizados:
- **1. Alineación simétrica de encabezados (`<th>`) y celdas (`<td>`) en todas las tablas:**
  - En `web/css/estilos.css`, `web/index.html` y `web/js/app.js` se aplicaron las clases explícitas `.col-texto` (`text-align: left`), `.col-centro` (`text-align: center`) y `.col-numero` (`text-align: right; font-variant-numeric: tabular-nums`) con idéntica especificidad tanto en `<th>` como en `<td>` para las tablas de Punto de Venta, Turnos de Caja, Movimientos de Caja Chica, Previsualización CSV, Revisión de Importación IA, Inventario de Insumos, Recetas y Rentabilidad, Desglose de Receta y Ticket Térmico 80mm.
- **2. Corrección de tabla vacía en el Importador IA y circuito CSV → Aprobación:**
  - Se ajustó `consultarDetalleImportacion` en `web/js/app.js` con polling automático (hasta 12 reintentos cada 350 ms mientras el documento en MongoDB esté en estado `PENDIENTE` o `PROCESANDO`) para esperar la respuesta asíncrona de `ai-service` antes de renderizar la tabla del Paso 2.
  - Se actualizó `renderizarPropuestaIAComercial` para leer `doc.salida?.items || doc.items || []`, mapear todas las variantes de nombres de campos (`nombreInsumo` / `nombre_insumo` / `insumo_nombre` / `nombre` / `insumo`, `cantidad`, `unidad`, `precioTotal` / `precio_total` / `precio`, `confianza`) y aplicar fallback determinístico mediante `extraerItemsDesdeTextoLista` en `web/js/logicaPwa.js`.
  - Se amplió `parsear_lista_precios_heuristica` en `ai-service/app/services/proveedor_ia.py` para extraer también filas con formato CSV (`insumo,cantidad,unidad,precio_total,alicuota_iva,envio`).
  - Se conectó el botón **"Enviar al Circuito de Aprobación"** del cargador CSV con el análisis y renderizado inmediato del Paso 2, y se verificó que **"Aprobar e Impactar Costos en Recetas"** (`POST /api/importaciones/:id/aprobar` con fallback transaccional a `POST /api/compras/confirmar-importacion/`) actualice insumos/compras, recalcule recetas y notifique la cantidad exacta de registros impactados.
- **3. Corrección de sincronización de ventas offline (`sapori_cola_ventas_offline`):**
  - Al pulsar **"Sincronizar Ventas Pendientes"**, `sincronizarVentasPendientes()` conmuta automáticamente el modo de conexión a Online (`local` en `localhost`), valida o renueva la sesión JWT si se había iniciado en modo contingencia (`offline-token-...`), resuelve o abre un `TurnoCaja` activo para el operador y envía cada venta encolada a `POST /api/ventas/` con el contrato exacto de `VentaSerializer` (`turno_caja`, `medio_pago`, `origen: "propio"`, `items_entrada: [{ producto_id, cantidad }]`), vaciando la cola, ocultando el banner y refrescando las métricas.
- **4. Auditoría E2E de las 6 secciones:**
  - Se agregó la acción colectiva `POST /api/productos/recalcular/` en `ProductoViewSet` (`backend-django/apps/recetas/views.py`) para el botón **"Recalcular Toda la Carta"**, además del recálculo individual `POST /api/productos/:id/recalcular/`.
  - Se normalizó el campo `tipo` en `MovimientoCajaSerializer` (`backend-django/apps/caja/serializers.py`) y en `#select-movimiento-tipo` (`web/index.html`) para soportar `ENTRADA` y `SALIDA` (y sus alias `INGRESO` / `EGRESO`), y se agregaron `usuario_nombre`, `ventas_efectivo_total` y `cantidad_tickets` a `TurnoCajaSerializer`.
  - Se verificaron de punta a punta contra los servidores activos las 6 vistas (POS online/offline/ticket 80mm, Caja apertura/movimiento/arqueo ciego, Compras CSV/IA/manual, Recetas recálculo individual y masivo, Finanzas ganancia diaria/ranking/punto de equilibrio y Personal con regla de supervivencia del Dueño).
Archivos tocados:
- `web/css/estilos.css`
- `web/index.html`
- `web/js/app.js`
- `web/js/logicaPwa.js`
- `ai-service/app/services/proveedor_ia.py`
- `backend-django/apps/caja/serializers.py`
- `backend-django/apps/recetas/views.py`
- `backend-node/tests/unit/logicaPwa.unit.test.js`
- `docs/bitacora.md`
Cómo probarlo:
- Ejecutar las 3 suites de tests (`backend-django`, `backend-node`, `ai-service`) y linters (`ruff`, `eslint`).
- Ingresar en `http://localhost:5173`, verificar la alineación de columnas en todas las tablas, subir un CSV o analizar con IA verificando las filas en el Paso 2 y su aprobación, cobrar una venta en modo offline y sincronizarla con el botón del banner superior.
---
Fecha: 2026-11-14
Tarea: Propagación de variables GroqAdapter en Docker Compose/env, ampliación de catálogo gastronómico en seed_demo y documentación técnica para entrega TFI
Rama: feature/pos-comercial-sapori-stock
Cambios realizados:
- **1. Propagación de variables de entorno para GroqAdapter:**
  - Se actualizaron `docker-compose.yml`, `docker-compose.prod.yml`, `.env.example` y se creó `ai-service/.env.example` para inyectar `GROQ_API_KEY`, `GROQ_MODEL` y `GROQ_BASE_URL` al contenedor `ai-service` junto con las configuraciones de Gemini y Ollama, estableciendo `groq` como proveedor activo por defecto.
- **2. Catálogo gastronómico de especialidad y panadería artesanal en seed_demo:**
  - Se enriqueció `backend-django/apps/insumos/management/commands/seed_demo.py` con 10 productos comerciales (espresso, latte, flat white, filtrado geisha, capuccino, cold brew, chipá, croissant artesanal, cookie doble chocolate, tostado en pan de masa madre) con códigos/SKUs de barras EAN-13, precios reales y minutos de mano de obra.
  - Se configuraron 12 insumos gastronómicos con desglose completo en recetas y dos casos clave de stock crítico (`Café Geisha Panamá Lote Especial` por costo/exclusividad y `Manteca Calidad Extra 82%` por aumento reciente) para análisis con el Consultor IA de Stock.
  - Se estructuraron compras iniciales para costeo unitario exacto, turno de caja abierto con movimientos de caja chica en efectivo (entradas y salidas) y 7 ventas registradas en diversos medios de pago (EFECTIVO, TRANSFERENCIA, TARJETA), manteniendo idempotencia estricta mediante `get_or_create` / `update_or_create`.
- **3. Documentación técnica de entrega de TFI:**
  - Se actualizaron `README.md` y `docs/despliegue.md` detallando las capacidades comerciales y de resiliencia del sistema: POS con estética editorial Impeccable UI, atajos de teclado y escáner de códigos de barras, cola offline en IndexedDB con autosincronización, importador híbrido de precios (IA multimodal + CSV determinista), Consultor IA de Stock y Arqueo de Caja con Groq LPU API y fallback local, y métricas consolidadas de calidad: 570 tests automatizados pasando.
Archivos tocados:
- `.env.example`
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `ai-service/.env.example`
- `backend-django/apps/insumos/management/commands/seed_demo.py`
- `README.md`
- `docs/despliegue.md`
- `docs/bitacora.md`
Cómo probarlo:
- En `backend-django`: ejecutar `python manage.py seed_demo`.
- Ejecutar las 3 suites de tests:
  - `backend-django/.venv/bin/pytest backend-django/` (370 tests)
  - `cd backend-node && npm test` (134 tests)
  - `ai-service/.venv/bin/pytest ai-service/` (66 tests)
- Ejecutar linters:
  - `.venv/bin/ruff check backend-django/ ai-service/`
  - `cd backend-node && npm run lint`
---
Fecha: 2026-11-16
Tarea: Filtro visual por rango de fechas (Desde / Hasta) en Reportes y Trazabilidad (Punto 1)
Rama: feature/reportes-filtro-fechas
Cambios realizados:
- **1. Backend (`backend-django`) — Filtrado inclusivo por `fecha_desde` y `fecha_hasta`:**
  - Se creó `backend-django/apps/comun/filtros.py` con utilidades reutilizables (`parsear_parametro_fecha`, `extraer_rango_fechas`, `filtrar_queryset_por_rango_fechas`) que normalizan `YYYY-MM-DD` desde `00:00:00` hasta `23:59:59.999999` en la zona horaria activa (`America/Argentina/Buenos_Aires`), manteniendo compatibilidad hacia atrás con `fecha_inicio`/`fecha_fin` y sin parámetros.
  - Se extendieron `VentaViewSet` (`/api/ventas/`, `/api/ventas/ganancia-diaria/`, `/api/ventas/ranking-productos/`, `/api/ventas/reporte-por-producto/`, `/api/ventas/punto-equilibrio/`), `CompraViewSet` (`/api/compras/`), `TurnoCajaViewSet` (`/api/caja/turnos/` por `cierre` o `apertura` si está abierto), `MovimientoCajaViewSet` (`/api/caja/movimientos/`) y `RegistroAuditoriaViewSet` (`/api/usuarios/auditoria/`).
  - Se agregó `usuario_nombre` en `VentaSerializer` y el endpoint `GET /api/insumos/movimientos/` (`obtener_movimientos_stock_trazabilidad`) que unifica ingresos por compras y egresos por consumo de recetas en ventas filtrados por rango de fechas y protegidos por `insumos.ver`.
- **2. Frontend PWA (`web/`):**
  - Se incorporó en `#vista-finanzas` (`web/index.html`, `web/css/estilos.css`) la barra de filtro con `<input type="date" id="filtro-fecha-desde">`, `<input type="date" id="filtro-fecha-hasta">`, atajos rápidos (`Hoy`, `Últimos 7 días`, `Este mes`), botones `Filtrar` y `Limpiar`, indicador de rango activo/cantidad de registros y tabla unificada de trazabilidad con pestañas (`Todos`, `Ventas`, `Movimientos de Stock`, `Cierres de Caja`).
  - Se agregaron utilidades puras en `web/js/logicaPwa.js` (`validarRangoFechas`, `estaFechaEnRango`, `filtrarRegistrosPorRangoFechas`, `construirQueryRangoFechas`, `unificarTrazabilidadRegistros`) para filtrar tanto las respuestas del backend como la cola offline/caché local, y se integró el rango seleccionado en KPIs, punto de equilibrio y botones de diagnóstico/auditoría IA.
- **3. Tests:**
  - Se agregaron pruebas de API en `backend-django/apps/comun/tests/api/test_api_filtros_fechas_trazabilidad.py` y pruebas unitarias/integración PWA en `backend-node/tests/unit/logicaPwa.unit.test.js` y `backend-node/tests/integration/clientePwa.integration.test.js`.
Archivos tocados:
- `backend-django/apps/comun/filtros.py`
- `backend-django/apps/ventas/views.py`
- `backend-django/apps/ventas/serializers.py`
- `backend-django/apps/insumos/services.py`
- `backend-django/apps/insumos/views.py`
- `backend-django/apps/caja/views.py`
- `backend-django/apps/usuarios/views.py`
- `backend-django/apps/comun/tests/api/test_api_filtros_fechas_trazabilidad.py`
- `web/index.html`
- `web/css/estilos.css`
- `web/js/logicaPwa.js`
- `web/js/app.js`
- `backend-node/tests/unit/logicaPwa.unit.test.js`
- `backend-node/tests/integration/clientePwa.integration.test.js`
- `docs/CONNECTIONS.md`
- `docs/bitacora.md`
Cómo probarlo:
- `backend-django/.venv/bin/pytest backend-django/`
- `cd backend-node && npm test`
- `.venv/bin/ruff check backend-django/ && .venv/bin/ruff format --check backend-django/ && cd backend-node && npm run lint`
---
Fecha: 2026-11-16
Tarea: Visibilidad explícita de modo contingencia / fallo de IA sin propuestas heurísticas engañosas (Punto 2)
Rama: feature/reportes-filtro-fechas
Cambios realizados:
- **1. `ai-service`:**
  - En `proveedor_ia.py`, `GroqAdapter` propaga el motivo técnico de contingencia (`GROQ_API_KEY` faltante, timeout, error HTTP o respuesta inesperada) en `advertencias` / `alertas_costos` al activar `fallback_determinista_demostracion`.
  - En `extraccion.py` y `resumen.py`, se unificaron los mensajes `MENSAJE_CONTINGENCIA_EXTRACCION` y `MENSAJE_CONTINGENCIA_RESUMEN` indicando explícitamente `"No se pudo usar la IA, revisá la configuración"`.
- **2. `backend-node`:**
  - En `src/clients/ai.client.js`: `validarYNormalizarSalidaIA` y `extraerPreciosIA` detectan `contingencia: true` o `proveedor_ia === "contingencia"`, descartan ítems heurísticos falsos (`items: []`), preservan `advertencias` y exponen `mensajeContingencia` claro; `generarResumenSemanalIA` oculta textos ficticios (`resumen_ejecutivo: null`) cuando hay contingencia o caída de red.
  - En `src/models/ImportacionIA.js`, `src/services/importacionIA.service.js` y `src/controllers/importacionIA.controller.js`: se agregaron `mensajeContingencia` y `advertencias` al esquema y a las respuestas (`POST /api/importaciones`, `GET /api/importaciones/:id` y evento `importacion.lista`), y se bloqueó con HTTP 400 aprobar importaciones en estado `CONTINGENCIA` / `FALLIDA` o con `proveedorIa === "contingencia"`.
- **3. Frontend PWA (`web/`):**
  - En `web/js/logicaPwa.js` se agregaron `MENSAJE_IA_NO_DISPONIBLE`, `evaluarEstadoImportacionIA` y `evaluarEstadoResumenIA`, y se actualizó `formatearEventoTiempoReal` para `importacion.lista` en contingencia.
  - En `web/index.html`, `web/css/estilos.css` y `web/js/app.js`: se agregó `#ia-alerta-contingencia` en el Paso 2 de importación, se eliminó la pre-renderización local/heurística (`local-csv` / `local-ia` / `extraerItemsDesdeTextoLista`), se muestra `"Analizando con IA..."` mientras está en curso, se muestra el cartel prominente `"No se pudo usar la IA, revisá la configuración"` con detalle técnico y sugerencia de CSV directo o carga manual al fallar/entrar en contingencia (deshabilitando la aprobación engañosa), y se aplicó el mismo aviso en el Consultor IA de Reportes (`/v1/resumen-semanal`).
- **4. Tests:**
  - Actualizadas y ampliadas las pruebas en `ai-service/app/tests/unit/test_unit_adapters_y_servicios.py`, `backend-node/tests/unit/aiClient.unit.test.js`, `backend-node/tests/unit/logicaPwa.unit.test.js`, `backend-node/tests/integration/importacionIA.integration.test.js`, `backend-node/tests/integration/resumenSemanal.integration.test.js` y `backend-node/tests/integration/clientePwa.integration.test.js`.
Archivos tocados:
- `ai-service/app/services/proveedor_ia.py`
- `ai-service/app/services/extraccion.py`
- `ai-service/app/services/resumen.py`
- `ai-service/app/tests/unit/test_unit_adapters_y_servicios.py`
- `backend-node/src/clients/ai.client.js`
- `backend-node/src/models/ImportacionIA.js`
- `backend-node/src/services/importacionIA.service.js`
- `backend-node/src/controllers/importacionIA.controller.js`
- `backend-node/tests/unit/aiClient.unit.test.js`
- `backend-node/tests/unit/logicaPwa.unit.test.js`
- `backend-node/tests/integration/importacionIA.integration.test.js`
- `backend-node/tests/integration/resumenSemanal.integration.test.js`
- `backend-node/tests/integration/clientePwa.integration.test.js`
- `web/index.html`
- `web/css/estilos.css`
- `web/js/logicaPwa.js`
- `web/js/app.js`
- `docs/CONNECTIONS.md`
- `docs/bitacora.md`
Cómo probarlo:
- `ai-service/.venv/bin/pytest ai-service/`
- `cd backend-node && npm test`
- `.venv/bin/ruff check ai-service/ && .venv/bin/ruff format --check ai-service/ && cd backend-node && npm run lint`
---
Fecha: 2026-11-16
Tarea: Importación directa CSV sin IA (`GROQ_API_KEY=""`) y soporte Offline-First de `.pdf` con `pdf.js` local (Punto 3)
Rama: feature/reportes-filtro-fechas
Cambios realizados:
- **Etapa A — Importación directa CSV sin IA:**
  - En `web/index.html`, `web/css/estilos.css`, `web/js/logicaPwa.js` y `web/js/app.js`: se etiquetó explícitamente el flujo como **"Importación Directa CSV (sin IA)"** y **"Previsualización de CSV"** (`#btn-csv-confirmar-directo`, `#btn-csv-desde-texto`), se añadió `evaluarTextoComoCsvDirecto` con soporte de `,`, `;` y tabulación, y se incorporó el botón directo `#btn-contingencia-usar-csv-directo` dentro de `#ia-alerta-contingencia` cuando el texto o planilla en contingencia es CSV compatible, confirmando directo contra `POST /api/compras/confirmar-importacion/` en Django sin depender de `GROQ_API_KEY`.
  - Pruebas explícitas con `GROQ_API_KEY=""` en `ai-service/app/tests/api/test_api_endpoints.py`, `backend-django/apps/insumos/tests/api/test_api_confirmar_importacion.py`, `backend-node/tests/unit/logicaPwa.unit.test.js` y `backend-node/tests/integration/clientePwa.integration.test.js`.
- **Etapa B (Punto 3) — Soporte `.pdf` con `pdf.js` local Offline-First:**
  - Se incorporaron `web/vendor/pdfjs/pdf.min.js` y `web/vendor/pdfjs/pdf.worker.min.js` (`pdfjs-dist@3.11.174`) sin CDN externos, registrados en `web/sw.js` (`RECURSOS_CASCARA`) y copiados en `web/Dockerfile`.
  - En `web/js/logicaPwa.js` y `web/js/app.js`: se lee `.pdf` como `ArrayBuffer` (nunca `FileReader.readAsText`), se extrae el texto página por página reconstruyendo renglones por coordenadas X/Y (`reconstruirLineasDeItemsPdf`, `extraerTextoDePdfBuffer`), y se detectan PDFs escaneados sin texto mostrando `"El PDF parece ser una imagen escaneada sin texto seleccionable. Convertilo a texto/CSV o usá un PDF con texto."`.
  - En `backend-node` (`importacionIA.routes.js`, `importacionIA.controller.js`, `importacionIA.model`, `importacionIA.service.js`, `ai.client.js`) y `ai-service/app/schemas/extraccion.py`: se agregó soporte opcional de `origenArchivo` / `origen_archivo` y rechazo HTTP 400 si llega binario `%PDF-` sin extraer.
  - Verificación automatizada con dos PDFs reales distintos y un tercer PDF escaneado sin texto en `logicaPwa.unit.test.js` e `importacionIA.integration.test.js`.
Conexiones nuevas o modificadas (reflejadas en docs/CONNECTIONS.md):
- `web/` carga `pdf.js` local (`/app/vendor/pdfjs/`) cacheado en `web/sw.js` y envía `origenArchivo` opcional a `POST /api/importaciones` (`backend-node` -> `ai-service`).
Archivos tocados:
- `web/vendor/pdfjs/pdf.min.js`, `web/vendor/pdfjs/pdf.worker.min.js`, `web/sw.js`, `web/Dockerfile`
- `web/index.html`, `web/css/estilos.css`, `web/js/logicaPwa.js`, `web/js/app.js`
- `backend-node/src/{routes/importacionIA.routes.js,controllers/importacionIA.controller.js,models/ImportacionIA.js,services/importacionIA.service.js,clients/ai.client.js}`
- `ai-service/app/schemas/extraccion.py`
- `backend-node/tests/{unit/logicaPwa.unit.test.js,integration/clientePwa.integration.test.js,integration/importacionIA.integration.test.js}`
- `ai-service/app/tests/api/test_api_endpoints.py`, `backend-django/apps/insumos/tests/api/test_api_confirmar_importacion.py`
- `docs/CONNECTIONS.md`, `docs/ARCHITECTURE.md`, `docs/bitacora.md`
Cómo probarlo:
- `backend-django/.venv/bin/pytest backend-django/`
- `cd backend-node && npm test && npm run lint`
- `ai-service/.venv/bin/pytest ai-service/`
- `.venv/bin/ruff check backend-django/ ai-service/ && .venv/bin/ruff format --check backend-django/ ai-service/`
---
Fecha: 2026-11-16
Tarea: Actualización de etiquetas visibles en Costeo de Recetas y Reportes (`web/index.html`)
Rama: feature/reportes-filtro-fechas
Cambios realizados:
- En `web/index.html` se actualizaron únicamente textos visibles (sin modificar lógica, clases, IDs ni atributos) para mayor claridad financiera:
  - `"Código EAN-13"` → `"Código de barras"`
  - `"Ganancia Neta ($)"` → `"Ganancia por unidad ($)"`
  - `"Margen de Rentabilidad (%)"` → `"Margen bruto (%)"`
  - `"Ganancia Neta Real de Bolsillo"` → `"Ganancia bruta del período"`
- Se verificó con búsqueda global que ningún test ni documentación técnica activa referenciara las etiquetas anteriores en la interfaz.
Archivos tocados:
- `web/index.html`
- `docs/bitacora.md`
Cómo probarlo:
- `cd backend-node && npm test` (24 suites, 158 tests en verde).
---
Fecha: 2026-11-16
Tarea: Corrección del filtro de fechas y control de concurrencia en Reportes, Trazabilidad & Finanzas
Rama: feature/reportes-filtro-fechas
Cambios realizados:
- **Disparo y validación del filtro de fechas (`web/js/app.js`, `web/js/logicaPwa.js`):**
  - Se eliminaron los listeners `change` de `#filtro-fecha-desde` y `#filtro-fecha-hasta` para evitar recargas intermedias al tipear fechas en Chrome (`0002`, `0020`, etc.).
  - El filtro ahora se aplica únicamente con el botón `#btn-filtrar-fechas`, presionando `Enter` dentro de `#filtro-fecha-desde` o `#filtro-fecha-hasta`, o mediante los atajos rápidos (`Hoy`, `Últimos 7 días`, `Este mes`, además de `Limpiar`).
  - Se amplió `validarRangoFechas` en `web/js/logicaPwa.js` para exigir fechas de calendario válidas con año entre `2000` y `2100` (`ANIO_MINIMO_FILTRO_REPORTES` / `ANIO_MAXIMO_FILTRO_REPORTES`) y `desde <= hasta`, aceptando rangos vacíos/abiertos. Ante rango inválido, se muestra aviso con `mostrarToast` sin lanzar peticiones.
- **Control de respuestas fuera de orden y manejo de fallos (`web/js/app.js`, `web/js/logicaPwa.js`):**
  - Se incorporaron las funciones puras `siguienteIdCarga` y `esCargaVigente` en `web/js/logicaPwa.js` y el contador `estadoApp.idCargaReportes` en `web/js/app.js`.
  - Tanto `cargarFinanzas` como `cargarTrazabilidadReportes` y `calcularPuntoEquilibrio` descartan cualquier respuesta obsoleta sin modificar el estado ni el DOM, y `estadoApp.trazabilidad` guarda el rango efectivo cargado para mantener consistente el indicador al cambiar de pestaña.
  - Cuando falla un `fetch` de tarjetas financieras, ranking o punto de equilibrio (`!res.ok` o error de red), se limpian las tarjetas afectadas mostrando `"-"` (en lugar de conservar valores previos) y se muestra un aviso de advertencia.
- **Tests unitarios (`backend-node/tests/unit/logicaPwa.unit.test.js`):**
  - Se agregaron pruebas unitarias para `validarRangoFechas` (fechas vacías, límites `2000`–`2100`, años inválidos como `0002`/`1999`/`2101`, `desde > hasta`, fecha inexistente) y para `siguienteIdCarga` / `esCargaVigente`.
Archivos tocados:
- `web/js/logicaPwa.js`
- `web/js/app.js`
- `backend-node/tests/unit/logicaPwa.unit.test.js`
- `docs/bitacora.md`
Cómo probarlo:
- `cd backend-node && npm test && npm run lint` (24 suites, 169 tests en verde).
- `node --check web/js/app.js && node --check web/js/logicaPwa.js`
---



Fecha: 2026-11-16
Tarea: Corrección de acceso del cajero a la carta real en POS y eliminación de catálogo de respaldo inventado
Rama: feature/reportes-filtro-fechas
Cambios realizados:
- **Por qué:** El rol `CAJERO` no posee `recetas.ver`, por lo que `GET /api/productos/` respondía HTTP 403 y el cliente web caía en `CATALOGO_RESPALDO` con 5 productos ficticios cuyos IDs no coincidían con los de la base de datos, permitiendo registrar ventas de otro producto o productos inexistentes.
- **Backend (`backend-django`):**
  - En `apps/usuarios/permissions.py`: se agregó la fábrica reutilizable `TieneAlgunPermiso(*claves_permiso)` usando `usuario_tiene_permiso` y el mismo mensaje estándar (`"No tiene permisos para realizar esta acción"`).
  - En `apps/recetas/views.py`: `ProductoViewSet.get_permissions` habilita `list` y `retrieve` para `TieneAlgunPermiso("recetas.ver", "ventas.cobrar_ticket")()`, manteniendo intactos los permisos de escritura, cálculo/costos, `RecetaItemViewSet` y los permisos por defecto de `ROL_CAJERO` en `apps/usuarios/constantes.py`.
  - En `apps/recetas/serializers.py`: `ProductoSerializer.to_representation` ahora también enmascara `costo_hora_mano_obra` y `descartables` en `None` cuando falta `recetas.ver_costos`, sin alterar la visibilidad de costos para Dueño/Encargado.
- **Frontend (`web/`):**
  - En `web/js/logicaPwa.js`: se agregaron las funciones puras `prepararCatalogoParaCache(productos)` (conserva únicamente `id`, `nombre`, `codigo_barras`, `precio_venta` y `estado_activo`, sin costos, márgenes ni recetas) y `validarCarritoContraCatalogo(carrito, catalogo)` (exige carta no vacía y coincidencia exacta de cada ítem por `id` y precio en centavos).
  - En `web/js/app.js` y `web/css/estilos.css`: se eliminó por completo `CATALOGO_RESPALDO`; `leerCacheCatalogoLocal` devuelve la última carta real sanitizada de `localStorage` o `[]`; `cargarCatalogo` guarda la versión limpia en `CLAVE_CATALOGO_CACHE` y avisa si falla el servidor o la red; `renderizarCatalogoPOS` muestra un aviso claro y deshabilita el botón de cobro cuando la carta está vacía; y `cobrarTicketVenta` valida el carrito contra la carta actual antes de cobrar tanto online como en la cola offline.
- **Tests:**
  - `backend-django/apps/usuarios/tests/unit/test_unit_permisos_drf.py`: tests unitarios de `TieneAlgunPermiso` y enmascaramiento de `costo_hora_mano_obra`/`descartables`.
  - `backend-django/apps/recetas/tests/api/test_api_recetas.py`: tests de API para `CAJERO` (200 sin costos en `GET /api/productos/` y detalle; 403 en POST/PATCH/DELETE y `GET /api/recetas-items/`) y `DUENIO` (ve costos completos).
  - `backend-django/apps/comun/tests/api/test_api_permisos_negativos.py`: actualización del test negativo de `GET /api/productos/` para verificar rechazo 403 cuando faltan tanto `recetas.ver` como `ventas.cobrar_ticket`.
  - `backend-node/tests/unit/logicaPwa.unit.test.js`: pruebas unitarias de `prepararCatalogoParaCache` y `validarCarritoContraCatalogo`.
Archivos tocados:
- `backend-django/apps/usuarios/permissions.py`
- `backend-django/apps/recetas/views.py`
- `backend-django/apps/recetas/serializers.py`
- `backend-django/apps/usuarios/tests/unit/test_unit_permisos_drf.py`
- `backend-django/apps/recetas/tests/api/test_api_recetas.py`
- `backend-django/apps/comun/tests/api/test_api_permisos_negativos.py`
- `web/js/logicaPwa.js`
- `web/js/app.js`
- `web/css/estilos.css`
- `backend-node/tests/unit/logicaPwa.unit.test.js`
- `docs/bitacora.md`
Cómo probarlo:
- `cd backend-django && .venv/bin/python -m pytest -q` (407 passed)
- `cd backend-node && npm test` (24 suites, 171 tests passed)
- `cd backend-node && npm run lint`
- `node --check web/js/app.js && node --check web/js/logicaPwa.js`
- `.venv/bin/ruff check` y `.venv/bin/ruff format --check` sobre los archivos Python modificados.
---



Fecha: 2026-11-17
Tarea: "Abrir Nuevo Turno" oculto con turno abierto y desglose de receta con mano de obra y descartables
Rama: feature/reportes-filtro-fechas
Qué se hizo y por qué:
- `accionesCajaVisiblesParaUsuario(usuario, turnoActivo)` ahora oculta "Abrir Nuevo Turno" mientras el turno activo está `ABIERTO`, aunque el usuario tenga `caja.abrir_turno`. Se aplica en `aplicarAccionesCajaVisibles()` (`web/js/app.js`), que se llama al configurar la vista por rol y cada vez que se actualiza la tarjeta del turno, así el botón vuelve al cerrar el turno. Es solo pantalla: el backend todavía no impide abrir un segundo turno (pendiente en `TurnoCajaViewSet.perform_create`).
- El desglose de receta mostraba solo los insumos (latte: $812), mientras el costo total del backend (`obtener_desglose_costeo_producto`) suma mano de obra y descartables ($975,33). La API ya mandaba `minutos_mano_obra`, `costo_hora_mano_obra` y `descartables`, así que se resolvió en el frontend: `calcularCostosExtraReceta` (`web/js/logicaPwa.js`) usa la misma fórmula (minutos × costo por hora / 60) y `mostrarDesgloseReceta` agrega los renglones "Mano de obra", "Descartables" y "Costo total por porción". Si la API ocultó los costos (sin `recetas.ver_costos`), no se muestran.
Archivos tocados:
- `web/js/logicaPwa.js`
- `web/js/app.js`
- `web/css/estilos.css`
- `backend-node/tests/unit/logicaPwa.unit.test.js`
- `docs/bitacora.md`
Cómo probarlo:
- `cd backend-node && npm test && npm run lint` (25 suites, 190 tests en verde).
- `cd backend-django && .venv/bin/python -m pytest -q` (407 passed; el backend no cambió).
- En la web: Recetas → Café Latte muestra $812 de insumos + $83,33 de mano de obra + $80 de descartables = $975,33, igual a la columna de costo de la carta. En Caja, con un turno abierto no aparece "Abrir Nuevo Turno".
---



Fecha: 2026-11-17
Tarea: El backend no deja abrir un segundo turno de caja si ya hay uno abierto
Rama: feature/reportes-filtro-fechas
Qué se hizo y por qué:
- `TurnoCajaViewSet.perform_create` no validaba nada: con la API se podían abrir varios turnos a la vez para el mismo usuario (la web solo ocultaba el botón). Se agregó `apps/caja/services.py` con `abrir_turno(serializer, usuario)`, que responde 400 con el formato único ("Ya hay un turno de caja abierto para este usuario. Cerralo antes de abrir uno nuevo.") si el responsable ya tiene un turno `ABIERTO`.
- La regla es por responsable, no por local: según PLAN_IMPLEMENTACION §3 el cajero opera "solo su turno", así que un encargado puede abrir el suyo aunque un cajero tenga uno abierto. Si se abre a nombre de otro usuario (`usuario` en el body), se valida a ese usuario.
- Para que dos pedidos simultáneos no abran dos turnos, se bloquea la fila del usuario con `select_for_update` dentro de la transacción (en PostgreSQL; SQLite ya serializa las escrituras).
- En la web, si falla la apertura se muestra el motivo de la API (`mensajeErrorParaUsuario`) en vez de "Error al abrir turno de caja.", y ante un 400 se recarga la caja para mostrar el turno abierto.
Archivos tocados:
- `backend-django/apps/caja/services.py` (nuevo)
- `backend-django/apps/caja/views.py`
- `backend-django/apps/caja/tests/api/test_api_turnos_apertura.py` (nuevo, 5 tests)
- `web/js/app.js`
- `docs/bitacora.md`
Cómo probarlo:
- `cd backend-django && .venv/bin/python -m pytest -q` (412 passed).
- `cd backend-node && npm test && npm run lint` (190 tests en verde).
- Con un turno abierto, `POST /api/caja/turnos/` con el token del mismo usuario responde 400 y no crea otro turno.
---



Fecha: 2026-11-17
Tarea: La web renueva la sesión sola y vuelve al login si no puede
Rama: feature/reportes-filtro-fechas
Qué se hizo y por qué:
- El access token dura 15 minutos y la web no lo renovaba: pasado ese tiempo todos los pedidos daban 401 y cada pantalla mostraba un aviso engañoso ("Sin conexión", "No se pudieron cargar algunas métricas", "No se pudo actualizar la carta", "No se pudo usar la IA, revisá la configuración"), sin volver al login.
- `crearFetchConSesion` (`web/js/logicaPwa.js`): agrega el token vigente; ante un 401 renueva una sola vez con el refresh (compartida entre pedidos simultáneos, porque el refresh rota y se invalida) y repite el pedido. Si no se puede renovar, cierra la sesión; si la renovación falla por red, no.
- `web/js/app.js`: el login guarda el refresh en `sessionStorage`; los 41 `fetch` autenticados pasan por `fetchConSesion` (el del login no); al renovar se reconecta Socket.IO con el token nuevo, y si Node rechaza la conexión por token vencido se renueva la sesión; "Salir" revoca el refresh en el servidor. Al cerrar por vencimiento se muestra solo "Tu sesión venció. Volvé a ingresar." (los avisos en cadena de los pedidos que estaban en camino se silencian 5 segundos).
- `docs/seguridad.md`: sección de renovación de sesión en la web.
Archivos tocados:
- `web/js/logicaPwa.js`
- `web/js/app.js`
- `backend-node/tests/unit/logicaPwa.unit.test.js` (5 tests)
- `docs/seguridad.md`
- `docs/bitacora.md`
Cómo probarlo:
- `cd backend-node && npm test && npm run lint` (195 tests en verde).
- En el navegador (Playwright, con tokens generados por `manage.py shell`): con un access vencido y un refresh válido hubo 1 solo 401 y 1 sola renovación, los reportes cargaron y la barra dijo "Conectado"; con un refresh inválido volvió al login con un único aviso; "Salir" revocó el refresh (la renovación posterior con ese refresh da 401).
---



Fecha: 2026-11-17
Tarea: Ajustes para la presentación: ticket, marca, avisos de la IA y filtro de fechas
Rama: feature/ajustes-presentacion
Qué se hizo y por qué:
- Ticket: muestra solo el local ("SAPORI CAFÉ", "Cafetería de especialidad"); se sacó "& POS", el código de barras dibujado (no era escaneable y confundía con un QR de pago) y la leyenda "emitido por Sapori Stock" (ahora "No válido como factura").
- Barra lateral: se sacó el subtítulo "Specialty Coffee POS".
- Avisos de la IA: el panel de contingencia ya no lista errores técnicos ("fetch failed", "Aviso técnico: …"); quedan en los logs de Node. El "Motivo" se oculta si repite el título.
- Filtro de fechas de Reportes: los campos son de texto con el molde "dd/mm/aaaa"; se escribe desde cero y las barras se agregan solas (`formatearEntradaFecha`); `fechaTextoAIso` / `fechaIsoATexto` convierten al formato interno aaaa-mm-dd, así que el resto del módulo no cambió. Un botón abre el calendario nativo. Una fecha incompleta o inexistente avisa al filtrar (antes, una fecha a medio tipear traía todo el historial).
- Diagnóstico de la IA (sin cambio de código): el ai-service no estaba corriendo en la PC ("fetch failed") y no hay `GROQ_API_KEY` ni `GEMINI_API_KEY` configuradas, así que la IA queda en contingencia hasta cargar una clave en `.env`.
Archivos tocados:
- `web/index.html`, `web/js/app.js`, `web/js/logicaPwa.js`, `web/css/estilos.css`
- `backend-node/tests/unit/logicaPwa.unit.test.js` (3 tests)
- `docs/bitacora.md`
Cómo probarlo:
- `cd backend-node && npm test && npm run lint` (198 tests en verde).
- Reportes: tipear 10102026 → "10/10/2026"; Filtrar aplica el rango; "17/10" avisa que no es válida.
---



Fecha: 2026-11-17
Tarea: Sonidos en acciones importantes y loaders mientras se espera al servidor (solo web)
Rama: feature/mejoras-profesor
Qué se hizo y por qué:
- Sonidos sintéticos con Web Audio API (`OscillatorNode` + `GainNode` con envolvente suave para evitar chasquidos y volumen bajo), sin archivos externos ni librerías. El `AudioContext` se crea recién en la primera interacción del usuario (`pointerdown`/`keydown`/`click`) para cumplir con la política de reproducción automática del navegador.
- Definición pura de notas (`SONIDOS`: `cobro`, `escaneo`, `error`, `caja`, `aviso`), lectura/escritura segura de preferencia de silencio en `localStorage` (`leerPreferenciaSonidosSilenciados`, `guardarPreferenciaSonidosSilenciados`) y mapeo de eventos (`obtenerSonidoParaEvento`) en `web/js/logicaPwa.js`. Conectados en cobro exitoso (online y sin internet), agregado al carrito, toasts de tipo `peligro`, apertura/cierre de turno, confirmación de precios de importación (CSV directo e IA) y alertas en vivo por Socket.IO (`stock.bajo` y `costo.actualizado` con `alertaMargenBajo`), sin sonar en toasts informativos.
- Botón `#btn-toggle-sonidos` en la barra superior (`web/index.html`) con icono de parlante, `aria-label` dinámico ("Silenciar sonidos" / "Activar sonidos") y `aria-pressed`, activado por defecto.
- Helper `conCargando(boton, accionAsync)` en `web/js/app.js`: deshabilita el botón, evita doble clic, agrega `.btn-cargando` (spinner CSS puro), `aria-busy="true"` y texto accesible `.sr-only`, restaurando siempre en `finally`. Aplicado a Ingresar, Cobrar y Emitir Ticket, Abrir/Cerrar turno, Movimiento de caja, Filtrar en Reportes, Punto de equilibrio, Consultor IA (insumos y auditoría de caja), Compras (Analizar con IA, Confirmar precios, Aprobar/Descartar IA, Compra manual), Recetas/Carta (nuevo producto, editar precio, guardar/quitar ítem, recalcular) y Equipo (agregar empleado, guardar permisos, dar de baja / reactivar).
- Indicadores de carga ("Cargando…" con spinner y filas/tarjetas esqueleto en CSS puro) en carta del POS, tabla de Recetas, tabla de Reportes y tarjetas de Equipo, limpiados siempre en `finally` al terminar o fallar, respetando `@media (prefers-reduced-motion: reduce)`.
Archivos tocados:
- `web/index.html`, `web/js/app.js`, `web/js/logicaPwa.js`, `web/css/estilos.css`
- `backend-node/tests/unit/logicaPwa.unit.test.js` (3 tests unitarios para sonidos, preferencia con errores de storage y mapeo de eventos)
- `docs/bitacora.md`
Cómo probarlo:
- `cd backend-node && npm test && npm run lint` (25 suites, 207 tests en verde).
- `node --check web/js/app.js && node --check web/js/logicaPwa.js`
---



Fecha: 2026-11-18
Tarea: T4 — Mensajes de la API de Django de vos y superusuario mostrado como Dueño
Rama: fix/textos-api-vos
Qué se hizo y por qué:
- Mensajes de error de Django pasados a vos y sin nombres internos de campos ni tecnicismos (ej. `"Ingresá el efectivo contado para cerrar la caja."`), incluyendo `apps/comun/excepciones.py` (401, 403, 429), `apps/comun/filtros.py`, `apps/caja/views.py`, `apps/usuarios/{permissions,services,tokens,views}.py`, `apps/ventas/{views,services,serializers}.py` y `apps/insumos/{views,services,serializers}.py`, manteniendo códigos HTTP y `{ mensaje, detalles }`. Se actualizó `docs/api-errores.md` y los tests que comparan textos.
- Rol de `admin` en Equipo & Permisos: se verificó (en solo lectura) que `admin` es un superusuario sin fila en `PerfilUsuario` (creado con `createsuperuser`; no hay signal que cree perfil y `seed_demo` solo crea `duenio_demo`, `encargado_demo` y `cajero_demo`). `UsuarioSerializer` devolvía `rol: null` y la web caía en el fallback `'CAJERO'`. Sin tocar la base de datos ni crear migraciones, `UsuarioSerializer` y `tokens.py` ahora devuelven `ROL_DUENIO` y el catálogo completo de permisos para todo superusuario (tenga perfil `CAJERO` o no tenga perfil) y exponen `is_superuser`; `web/js/app.js` también prioriza `u.is_superuser` para mostrar "Dueño".
Archivos tocados:
- `backend-django/apps/comun/excepciones.py`, `backend-django/apps/comun/filtros.py`
- `backend-django/apps/caja/views.py`
- `backend-django/apps/usuarios/{permissions,serializers,services,tokens,views}.py`
- `backend-django/apps/ventas/{serializers,services,views}.py`
- `backend-django/apps/insumos/{serializers,services,views}.py`
- `backend-django/apps/{comun,caja,usuarios,ventas}/tests/**`
- `web/js/app.js`, `docs/api-errores.md`, `docs/bitacora.md`
Cómo probarlo:
- `cd backend-django && .venv/bin/python -m pytest -q`
- `cd backend-node && npm test && npm run lint`
- `node --check web/js/app.js && node --check web/js/logicaPwa.js`
---

Fecha: 2026-11-18
Tarea: T4 (corrección post-auditoría) — Protección de superusuarios sin perfil, cierre de caja robusto y textos restantes
Rama: fix/textos-api-vos
Qué se hizo y por qué:
- **Protección de superusuarios y ausencia de `PerfilUsuario` (`apps/usuarios/services.py`, `tokens.py`, `web/js/app.js`):** Se evitó `RelatedObjectDoesNotExist` (500) en `actualizar_personal` y `desactivar_personal` usando `getattr(usuario, "perfil", None)`. Se bloqueó con `ErrorReglaNegocio` (`ValidationError` en voseo, HTTP 400) que se modifique el rol o permisos de un superusuario o que un usuario no-superusuario modifique o desactive a un superusuario; `contar_duenios_activos` y `desactivar_personal` ahora contabilizan superusuarios activos en la regla de supervivencia del último dueño/administrador activo. `CustomTokenObtainPairSerializer` incluye `"is_superuser"` en `data["usuario"]` para consistencia con `UsuarioSerializer`, y `web/js/app.js` bloquea la edición de rol/permisos (modal en solo lectura) y acciones de baja/reactivación por no-superusuarios cuando `is_superuser === true`.
- **Cierre de caja (`apps/caja/views.py`):** `TurnoCajaViewSet.cerrar` captura `(InvalidOperation, ValueError, TypeError)` y valores no finitos al convertir `efectivo_contado` a `Decimal`, devolviendo HTTP 400 con `"Ingresá un monto válido para el efectivo contado."`.
- **Textos visibles restantes (`apps/usuarios/views.py`):** `LogoutView` ya no expone `str(e)` de SimpleJWT en `detalles` (`"Tu sesión ya venció o no es válida."`, `detalles: None`) y `UsuarioViewSet.destroy` responde `"Usuario desactivado correctamente."` sin jerga técnica.
- **Tests:** Se agregaron pruebas para refresh de superusuario sin perfil, `is_superuser` en login, logout con token inválido, protección de superusuarios sin perfil en servicios y API, `DELETE /api/usuarios/:id/` y `efectivo_contado` inválido en cierre de caja.
Archivos tocados:
- `backend-django/apps/usuarios/{services.py,tokens.py,views.py}`
- `backend-django/apps/caja/views.py`
- `backend-django/apps/usuarios/tests/{api/test_api_auth.py,api/test_api_personal.py,unit/test_unit_supervivencia_duenio.py}`
- `backend-django/apps/caja/tests/api/test_api_turnos_apertura.py`
- `web/js/app.js`, `docs/bitacora.md`
Cómo probarlo:
- `cd backend-django && .venv/bin/python -m pytest -q`
- `cd backend-node && npm test && npm run lint`
- `node --check web/js/app.js && node --check web/js/logicaPwa.js`
---

Fecha: 2026-11-19
Tarea: T7 — Datos de demo para grabar el video (`seed_demo --video`) + correcciones post-auditoría
Rama: chore/datos-demo-video
Qué se hizo y por qué:
- Se amplió `backend-django/apps/insumos/management/commands/seed_demo.py` con el flag `--video`, manteniendo compatibilidad e idempotencia total (re-ejecutarlo no duplica registros, no borra usuarios ni cambia contraseñas existentes; todos los montos y cantidades usan `Decimal`).
- En modo `--video`: asegura 11 productos activos con receta completa (insumos, mano de obra y descartables) mediante `get_or_create` con `defaults` sin sobrescribir `precio_venta` ni `codigo_barras` de productos ya existentes; valida explícitamente que `Brownie Intenso Chocolate 70%` quede con margen crítico (`< 0.30`, ~19,86%) y emite `WARNING` si precios previos en la base superan ese umbral; crea 2 turnos cerrados (`CERRADO`, uno exacto y otro con -$200) y 1 turno abierto (`ABIERTO`) para `cajero_demo` con movimientos de caja chica; distribuye ventas idempotentes (vía `id_operacion` UUID v5 determinístico) en los últimos 14 días usando únicamente medios digitales (`TARJETA`/`TRANSFERENCIA`) en las ventas históricas sin turno (`turno_caja=None`) para no dejar cobros en `EFECTIVO` fuera de arqueo; y registra 1 venta anulada (`ANULADA`) mediante `anular_venta`.
- Validación y re-ejecución en otro día:
  - Si `cajero_demo` ya tiene un turno `ABIERTO` de un día anterior al actual, `--video` frena inmediatamente con `CommandError` indicando que debe cerrarse antes para no superponer turnos ni mezclar ventas.
  - Al volver a ejecutar `seed_demo --video` otro día (una vez cerrado el turno previo), reacomoda las fechas relativas (`fecha`, `apertura`, `cierre`, fechas de movimientos y `anulada_en`) al `ahora` actual sin duplicar registros, y re-vincula las ventas de hoy y la anulada al turno abierto vigente de hoy.
  - Nota operativa: evitar correr `seed_demo --video` entre las `00:00` y `00:45` hora local porque `_fecha_hoy_pasada` acota las marcas al inicio del día (`00:00`) y las operaciones de hoy quedarían superpuestas a la medianoche.
- Respaldo obligatorio antes de ejecutar el comando sobre la base local:
  - `mkdir -p ~/orq/backups && cp backend-django/db.sqlite3 ~/orq/backups/db.sqlite3.antes-seed-video`
- Comando exacto para poblar la base con datos de demo/video (asegurando `DEBUG=True` vía `DJANGO_DEBUG=True` y contraseña explícita):
  - `cd backend-django && DJANGO_DEBUG=True SEED_DEMO_PASSWORD="<clave_demo>" .venv/bin/python manage.py seed_demo --video`
Problemas y decisiones técnicas (incidente primera corrida de T7):
- Durante la primera corrida de T7 (previa a la ronda post-auditoría), `backend-django/db.sqlite3` recibió los datos de `seed_demo --video` sin borrar usuarios ni modificar contraseñas existentes; el respaldo previo disponible en `~/orq/backups/` data del 17/11. Se deja asentado para que Evilkitty decida si restaurar el backup del 17/11 o conservar la base actual (re-ejecutando luego el comando corregido para actualizar fechas y convertir las ventas históricas sin turno a medios digitales).
Archivos tocados:
- `backend-django/apps/insumos/management/commands/seed_demo.py`
- `backend-django/apps/insumos/tests/unit/test_unit_seed_demo.py`
- `docs/bitacora.md`
Cómo probarlo:
- `cd backend-django && .venv/bin/python -m pytest -q`
- `cd ai-service && .venv/bin/python -m pytest -q`
- `cd backend-node && npm test && npm run lint`
- `.venv/bin/ruff check backend-django/ ai-service/ && .venv/bin/ruff format --check backend-django/ ai-service/`
- `node --check web/js/app.js web/js/logicaPwa.js`
---

Fecha: 2026-11-19
Tarea: T10 — Ensayo automático E2E del flujo de demostración
Rama: test/e2e-flujo-demo
Qué se hizo y por qué:
- Se crearon `scripts/ensayo_demo.sh` y `scripts/ensayo_demo.py` (stdlib Python, sin dependencias nuevas ni Playwright porque no está instalado en el proyecto) para recorrer por API los 8 pasos del guion de presentación (`docs/PRESENTACION_Y_EVIDENCIAS.md` y T6) contra servidores locales ya levantados sobre una base de prueba poblada con `seed_demo --video` (T7), sin tocar `backend-django/db.sqlite3`.
- Contraseñas solo por variables de entorno (`SEED_DEMO_PASSWORD` o `DEMO_DUENIO_PASSWORD` + `DEMO_CAJERO_PASSWORD`), nunca escritas en código. Respeta límites de Node (`1` petición autenticada a `/api/snapshots-costeo/` sobre `600/15m` y `2` estáticas/salud en `/health` y `/carta.html` fuera del limitador sobre `100/15m`) y de Django (`2` logins sobre `10/min`).
- Re-ejecución segura: reutiliza turno abierto si existe o abre uno nuevo (`POST /api/turnos/`), cobra una venta con `id_operacion` UUID v4 fresco, registra y anula una segunda venta de prueba para no romper ventas históricas, cierra el turno verificando arqueo ciego y consulta reportes "últimos 7 días" y la carta pública anónima. Cada corrida deja 1 venta `EMITIDA`, 1 `ANULADA` y el turno cerrado en la base de prueba.
- Se agregaron tests E2E automatizados en `backend-django/apps/comun/tests/api/test_api_ensayo_demo.py` usando `live_server` sobre base de test aislada (incluyendo doble corrida consecutiva y casos negativos).
Cómo correrlo:
- Con servidores locales levantados sobre base de prueba post-T7 (recomendado en puertos de prueba, no contra la base real):
  `DJANGO_URL="http://127.0.0.1:18000" NODE_URL="http://127.0.0.1:13000" VERIFICAR_NODE=1 SEED_DEMO_PASSWORD="<clave_demo>" ./scripts/ensayo_demo.sh`
  (por defecto usa `DJANGO_URL=http://localhost:8000`, `NODE_URL=http://localhost:3000`, `VERIFICAR_NODE=auto`).
Qué tiene que aparecer si sale bien:
- Resumen con `✅` en los 8 pasos (`✅ Paso 1` a `✅ Paso 8`: login `duenio_demo`/`cajero_demo`, costeo de producto + snapshots Node, turno abierto/reutilizado, cobro POS, anulación, cierre con arqueo ciego + auditoría gerencia, reportes últimos 7 días y carta pública anónima + Node `/health` y `/carta.html`) y cierre final:
  `✅ Ensayo completo OK (8/8 pasos superados).` (código de salida `0`).
Archivos tocados:
- `scripts/ensayo_demo.sh`
- `scripts/ensayo_demo.py`
- `backend-django/apps/comun/tests/api/test_api_ensayo_demo.py`
- `docs/bitacora.md`
Cómo probarlo:
- `cd backend-django && .venv/bin/python -m pytest -q`
- `cd backend-node && npm test && npm run lint`
- `cd ai-service && .venv/bin/python -m pytest -q`
- `.venv/bin/ruff check backend-django/ ai-service/ scripts/ensayo_demo.py && .venv/bin/ruff format --check backend-django/ ai-service/ scripts/ensayo_demo.py`
- `node --check web/js/app.js && node --check web/js/logicaPwa.js`
---

Fecha: 2026-11-19
Tarea: T10 — Correcciones post-auditoría del ensayo E2E del flujo demo
Rama: test/e2e-flujo-demo
Qué se hizo y por qué:
- Validación estricta de configuración en `scripts/ensayo_demo.py`: `_validar_url_http` valida `DJANGO_URL` y `NODE_URL` con `urllib.parse.urlsplit` exigiendo `scheme in {"http", "https"}`, `netloc`/host válido y puerto válido (rechaza `file://`, `ftp://`, URLs sin host o malformadas); `_validar_politica_node` exige que `VERIFICAR_NODE` esté en `{"auto", "1", "0"}` sin caer silenciosamente en `"0"`. Ante cualquier valor inválido imprime `❌ Configuración inválida: ...` y retorna `1` sin traceback.
- Resiliencia de transporte en `ClienteApi.peticion_texto`: captura `(TimeoutError, http.client.HTTPException, OSError, ValueError)` además de `HTTPError`/`URLError` y lanza `ErrorPasoEnsayo` para reportar el paso con `❌` en lugar de abortar con traceback.
- Aserciones numéricas E2E en `scripts/ensayo_demo.py` y `backend-django/apps/comun/tests/api/test_api_ensayo_demo.py`:
  - Paso 5 registra la venta de prueba a anular en `EFECTIVO` para ejercitar su exclusión del arqueo; Paso 6 contrasta `efectivo_esperado`, `diferencia` y `ventas_efectivo_total` del turno cerrado (manteniendo idempotencia si el turno reutilizado trae movimientos/ventas previas); Paso 7 verifica `ganancia-diaria > 0`, `>= total_venta_emitida` y consistencia con la suma de `reporte-por-producto`.
  - En `test_ensayo_demo_completo_y_doble_corrida_contra_live_server` se verifica que `efectivo_esperado` del último turno cerrado coincida exactamente con `efectivo_inicial + venta_emitida.total` (excluyendo la venta anulada) y que `obtener_ganancia_diaria` en los últimos 7 días sea `> 0` y coincida con el neto y cantidad de ventas `EMITIDA`.
  - Se agregaron tests unitarios rápidos en `TestValidacionesEnsayoDemo` para URLs inválidas, `VERIFICAR_NODE` inválido y captura de timeouts/errores de transporte.
Archivos tocados:
- `scripts/ensayo_demo.py`
- `backend-django/apps/comun/tests/api/test_api_ensayo_demo.py`
- `docs/bitacora.md`
Cómo probarlo:
- `cd backend-django && .venv/bin/python -m pytest -q`
- `cd backend-node && npm test && npm run lint`
- `cd ai-service && .venv/bin/python -m pytest -q`
- `.venv/bin/ruff check backend-django/ ai-service/ scripts/ensayo_demo.py && .venv/bin/ruff format --check backend-django/ ai-service/ scripts/ensayo_demo.py`
- `bash -n scripts/ensayo_demo.sh`
---

Fecha: 2026-11-20
Tarea: T12 — Correcciones post-auditoría de Tanda 2/3 y accesibilidad pre-video (T11)
Rama: fix/post-auditoria-tanda2 (base `test/e2e-flujo-demo`)
Qué se hizo y por qué:
- **Seguridad y robustez de `scripts/ensayo_demo.py` y `scripts/ensayo_demo.sh` (A.4 + revisión):**
  - Guarda obligatoria contra `backend-django/db.sqlite3`: sin `DJANGO_URL` y `NODE_URL` explícitas (salvo flag `--confirmo-base-real`), el script rechaza ejecutar e indica qué variables o flag pasar; `scripts/ensayo_demo.sh` reenvía `"$@"`.
  - `correr_paso` captura `(KeyError, AttributeError, TypeError, ValueError)` ante JSON con forma inesperada y lo reporta como fallo controlado del paso.
  - Limpieza ante falla intermedia: si falla Paso 4 o Paso 5 luego de crear `venta_temp`, intenta anularla en limpieza y evita cerrar el turno si quedó una venta huérfana o falló el cobro.
  - Rango de últimos 7 días en Paso 7 calculado con `ZoneInfo("America/Argentina/Buenos_Aires")`, bloqueo de redirecciones `3xx` en `ClienteApi` (respetando `monkeypatch` de `urlopen` en tests) y `efectivo_contado` alineado con `10000.00 + total_venta_emitida`.
  - Tests en `backend-django/apps/comun/tests/api/test_api_ensayo_demo.py` para guarda sin URLs, `--confirmo-base-real`, wrapper `.sh`, JSON malformado/inesperado, fallas intermedias en Pasos 4 y 5, y `VERIFICAR_NODE=1` con servidor HTTP simulado.
- **Correcciones de `seed_demo.py` (A.1):**
  - `_asegurar_venta_video` no re-vincula ni altera ventas que ya pertenecen a un `TurnoCaja` `CERRADO` distinto al objetivo (protegiendo `efectivo_esperado`, `diferencia` y `anulada_en` históricos en re-ejecuciones multi-día).
  - Reactiva productos e insumos demo preexistentes con `estado_activo=False` (y precio `<= 0` en producto) para no abortar `registrar_venta`, y actualiza `unidad_base` de insumos sin compras aunque coincida `costo_unitario`.
  - Tests agregados en `backend-django/apps/insumos/tests/unit/test_unit_seed_demo.py` (arqueo cerrado multi-día, asserts de `diferencia` 0.00 y -200.00, colisión de `codigo_barras`, producto inactivo, insumo con distinta `unidad_base` y `--video` con `DEBUG=False`).
- **Correcciones de mapa y carta pública (A.2):**
  - `web/Dockerfile`: incluye `carta.html` en la imagen Nginx.
  - `web/js/logicaPwa.js`: `construirUrlsMapaOpenStreetMap` tolera `opciones = null` sin `TypeError`.
  - `web/sw.js`: fallback offline retorna `Response.error()` / `Response(503)` si no hay caché previa (evita resolver `undefined`).
  - `web/carta.html`: agrega `sandbox="allow-scripts allow-same-origin"` al `<iframe>` de OpenStreetMap.
  - `web/nginx.conf` y `vercel.json`: agregan `Content-Security-Policy` coherente con `backend-node/app.js` (`frame-src https://www.openstreetmap.org`) preservando orígenes locales (y Render en `vercel.json`).
  - Tests agregados en `backend-node/tests/unit/logicaPwa.unit.test.js` y `backend-node/tests/integration/clientePwa.integration.test.js` (bordes de coordenadas/dirección/`opciones=null`, `debeIgnorarPeticionSw` con URL vacía/inválida/subdominios OSM y CSP + `sandbox` en `/app/carta.html` y `/carta.html`).
- **Accesibilidad y UX pre-video de T11 (ítems #1–#10 marcados "antes del video (24/11)"):**
  - Sidebar responsive en `<= 768 px` (cajón deslizable `#sidebar`, botón hamburguesa `#btn-toggle-sidebar`, cierre `#btn-cerrar-sidebar`, `#sidebar-backdrop`, `Escape` y autocierre al navegar).
  - Contraste WCAG AA: `.badge-rol.*` legible en fondos claros manteniendo variante oscura en `.sidebar-comercial`; `.pildora-socket.conectado` (`#065F46`), `.demo-selector-etiqueta` y `.demo-avatar` (`#F4C095`), `.btn-sidebar-logout:hover` (`#FCA5A5`), estados `:disabled` con contraste sólido, bordes de inputs (`--color-borde-control: #8F8278`) y foco visible en buscador de `carta.html` y botones oscuros/primarios.
  - Operabilidad por teclado: radios de medio de pago accesibles en `<fieldset>` con sincronización bidireccional con `#select-metodo-pago`, tarjetas POS como `<button type="button">`, botón explícito `"Ver receta"` en tabla de Recetas, `#zona-drop-csv` con `role="button" tabindex="0"` y `Enter`/`Espacio`, y `aria-label` / `<label class="sr-only">` en botones de ícono e inputs faltantes.
  - Responsive móvil (`<= 1024 px` / `640 px` / `480 px`): mantiene `.login-demo-selector` visible bajo el formulario en móvil, evita recorte vertical en `.pantalla-login-overlay`, y adapta `#input-codigo-barras`, `.campos-dos-columnas`, modales, drawer y toasts a `375 px`.
  - Textos en español: reemplaza `"snapshots de costos unitarios"`, `err.message` crudos en toasts/dictámenes, `"Modo de conexión actualizado a: CLOUD/LOCAL/OFFLINE"` y `"Descargar SVG"` por equivalentes claros para el usuario final.
- **Ítems de T11 marcados "puede esperar" (anotados sin tocar):**
  - #11: `role="dialog"`, `aria-modal="true"`, trampa de foco y `inert`/`hidden` en `#panel-monitor-lateral` y modales.
  - #12: `tabindex="-1"` / `inert` en `.compatibilidad-tests-pwa` (`aria-hidden="true"`).
  - #13: `aria-live="polite"` en `#contenedor-toasts`, `#mensaje-auth`, `#estado-caja` y `#estado-importacion-ia`.
  - #14: `role="tab"` / `aria-selected` en pestañas de Trazabilidad y Compras.
  - #15: anglicismos/abreviaturas menores (`POS`, `ID`, `Email`, `S/C`, `TAB`, estados crudos de IA).
  - #16: `<h1>` visible al estar logueado, `<label>` explícito en `#carta-buscador`, `flex-wrap` en `.carta-publica-meta`, CSS huérfano (`estilos.css:1920-1928`) y contraste del ícono activo en sidebar oscuro.
- **Documentación (A.3):**
  - `docs/MATRIZ_HU.md`: clasifica Abarrotes como condicional Escenario B (`docs/PROPUESTA.md §3`) y expande rutas de tests a rutas literales.
  - `docs/despliegue.md`, `docs/PRESENTACION_Y_EVIDENCIAS.md` y `README.md`: alinea URLs Docker tras copiar `carta.html` en `web/Dockerfile` y actualiza los conteos reales de tests (`507` Django + `224` Node + `87` AI Service = `818`).
Archivos tocados:
- `scripts/ensayo_demo.py`, `scripts/ensayo_demo.sh`, `backend-django/apps/comun/tests/api/test_api_ensayo_demo.py`
- `backend-django/apps/insumos/management/commands/seed_demo.py`, `backend-django/apps/insumos/tests/unit/test_unit_seed_demo.py`
- `web/Dockerfile`, `web/nginx.conf`, `vercel.json`, `web/carta.html`, `web/sw.js`, `web/js/logicaPwa.js`, `web/index.html`, `web/css/estilos.css`, `web/js/app.js`
- `backend-node/tests/unit/logicaPwa.unit.test.js`, `backend-node/tests/integration/clientePwa.integration.test.js`
- `docs/MATRIZ_HU.md`, `docs/despliegue.md`, `docs/PRESENTACION_Y_EVIDENCIAS.md`, `README.md`, `docs/bitacora.md`
Cómo probarlo:
- `cd backend-django && .venv/bin/python -m pytest -q` (507 passed)
- `cd backend-node && npm test && npm run lint` (25 suites, 224 tests passed; ESLint sin errores)
- `cd ai-service && .venv/bin/python -m pytest -q` (87 passed)
- `.venv/bin/ruff check backend-django/ ai-service/ scripts/ && .venv/bin/ruff format --check backend-django/ ai-service/ scripts/`
- `node --check web/js/app.js && node --check web/js/logicaPwa.js && node --check web/js/carta.js && node --check web/sw.js`
---

## 20/11 — CSP de la web: Google Fonts y hosts de Render
- **Qué:** la CSP que se agregó en T12 a `web/nginx.conf` y `vercel.json` bloqueaba la hoja de Google Fonts (`style-src` sin `fonts.googleapis.com`, sin `font-src` para `fonts.gstatic.com`) y la web caía a Times New Roman. La de Node (`backend-node/app.js`) tenía lo mismo desde antes, y su `connect-src` no incluía los hosts de Render (la web abierta desde `/app` del Node publicado no podía hablar con Django).
- **Cambio:** las tres CSP permiten `https://fonts.googleapis.com` (estilos) y `https://fonts.gstatic.com` (fuentes), y comparten `connect-src` (Render + localhost). nginx y Vercel quedan idénticas.
- **Test:** `backend-node/tests/integration/cspConsistencia.integration.test.js` lee `vercel.json`, `web/nginx.conf` y la cabecera real de Node, y verifica fuentes, mapa, `script-src 'self'`, sin comodines e iguales entre sí.
- **Cómo probarlo:** `npm test` en `backend-node`. A mano: servir `web/` bajo `/app/` con la CSP de nginx y comprobar en la consola del navegador que `getComputedStyle(document.body).fontFamily` empieza con "Plus Jakarta Sans" (verificado).

## 20/11 — Ensayo de la demo sin romper el turno del video + botones de Equipo
- **Problema encontrado al ensayar sobre una copia de la base:** `scripts/ensayo_demo.py` reutilizaba el turno abierto que deja `seed_demo --video` (el que se prepara para grabar) y lo cerraba al final con un faltante. El historial de Reportes quedaba con un cierre de caja que no se quería mostrar.
- **Cambio:** el ensayo solo cierra los turnos que abrió él. Si el turno ya estaba abierto, el paso 6 se informa como ✅ "No se cerró el turno #N porque ya estaba abierto antes del ensayo" (queda con 1 venta de prueba y 1 anulada). El test de doble corrida verifica que el turno del video sigue ABIERTO y, para cubrir el arqueo, lo cierra a mano antes de la segunda corrida.
- **Igual conviene no correr el ensayo sobre la base con la que se graba:** usarlo en una copia (servidores en otros puertos o una copia de `db.sqlite3`).
- **Antes de `seed_demo --video` en la base local:** hay que cerrar el Turno #1 de cajero_demo (abierto desde el 16/11). El comando se niega a correr mientras haya un turno viejo abierto, y lo explica.
- **Equipo:** los botones de cada tarjeta ("Permisos", "Dar de baja", "Reactivar") ahora tienen el mismo ancho y no se parten en varios renglones.
- **Verificado** sobre una copia de la base (Django 8000 + Node 3000 con Mongo `sapori_ensayo`): `seed_demo --video` dos veces (idempotente), ensayo 8/8 dos veces, el turno del video sigue abierto, y sin URLs el ensayo se niega a correr.



Fecha: 2026-11-21
Tarea: Dirección real del local en el ticket y en la carta pública
Rama: fix/direccion-real-local
Qué se hizo y por qué:
- Evilkitty pasó la ubicación real del local (Google Maps: "Sapori Café, Mariano I. Loza 475, Goya, Corrientes") para que figure en el ticket, la carta y cualquier lugar con dirección. Coordenadas del número 475 tomadas de OpenStreetMap (Nominatim): -29.1437, -59.264.
- Ticket (`web/index.html`): "Mariano I. Loza 475 · Goya, Corrientes". Se sacó la línea con un CUIT inventado y "IVA Responsable Inscripto", porque no son datos reales del local.
- Carta pública (`web/js/config.js`): dirección y coordenadas del mapa.
- Test de `renderizarUbicacionCarta` actualizado (lee la configuración real).
Cómo probarlo:
- `cd backend-node && npm test && npm run lint` (230 tests).
- Abrir `/app/carta.html`: la sección de ubicación muestra la dirección nueva y el mapa centrado en Goya.
---

Fecha: 2026-11-21
Tarea: F2 — HU8 tablero en vivo de ventas y anulaciones
Rama: feat/hu8-ventas-en-vivo
Qué se hizo y por qué:
- **Notificación interna Django -> Node (`backend-django/apps/comun/notificaciones_node.py`, `apps/ventas/services.py`):** al registrar una venta nueva (no en reintentos idempotentes por `id_operacion`) o al anular una venta, luego de confirmar la transacción atómica en PostgreSQL, Django envía un `POST` a `{NODE_BASE_URL}/api/internos/eventos` con cabecera `X-Clave-Interna` (`EVENTOS_INTERNOS_CLAVE` desde `.env`, nunca en código) y `X-Request-ID`. Ante falla, timeout o falta de configuración de Node, registra un aviso y la operación local igual se guarda.
- **Endpoint interno y filtrado por salas en Node (`backend-node/`):** se agregó `POST /api/internos/eventos` protegido con `verificarClaveInterna` (`crypto.timingSafeEqual` sobre SHA-256) y validaciones con `express-validator` en formato único de error. En `src/sockets/index.js` y `src/sockets/emitter.js` se unificó la emisión de `venta.registrada` y `venta.anulada` filtrando estrictamente por salas: solo `permiso:recetas.ver_costos` recibe costos (`costoTotalSnapshot`, `costoUnitarioSnapshot`), solo `permiso:caja.ver_efectivo_esperado` recibe montos y medio de pago (`total`, `medio_pago`, `metodoPago`, `precioUnitario`), y `gananciaBruta` requiere ambos permisos.
- **Tablero en vivo PWA (`web/js/logicaPwa.js`, `web/js/app.js`):** se sumó el manejo de `venta.anulada` en `formatearEventoTiempoReal` y el listener Socket.IO en `app.js` para actualizar el feed, el contador y refrescar finanzas/turno sin recargar.
- **Documentación y entorno:** actualización de `.env.example`, `docker-compose.yml`, `render.yaml`, `docs/CONNECTIONS.md` y `docs/ARCHITECTURE.md`.
Cómo probarlo:
- `cd backend-node && npm test && npm run lint`
- `cd backend-django && DEMO_ACCESO_RAPIDO=false .venv/bin/python -m pytest -q`
- `node --check web/js/app.js && node --check web/js/logicaPwa.js`
---

Fecha: 2026-11-21
Tarea: F3 — HU14 condición fiscal del local y tratamiento de IVA
Rama: feat/hu14-condicion-fiscal
Qué se hizo y por qué:
- **Modelos, migración y servicios en Django (`backend-django/apps/insumos/`):** se agregaron `ConfiguracionLocal` (`NO_DECLARADA`, `RESPONSABLE_INSCRIPTO`, `MONOTRIBUTISTA`, `EXENTO`) e `HistorialCondicionFiscal` (solo migración `0002_configuracionlocal_historialcondicionfiscal.py`, sin aplicar sobre `db.sqlite3`). En `services.py`, `registrar_compra_y_actualizar_costo` y `registrar_lote_compras_importacion` toman la condición vigente: `RESPONSABLE_INSCRIPTO` calcula el costo unitario sin IVA, mientras `MONOTRIBUTISTA`, `EXENTO` y `NO_DECLARADA` (criterio por defecto) incluyen IVA y adjuntan aviso si falta declarar (CA14.1, CA14.2). Al cambiar la condición fiscal (`actualizar_condicion_fiscal`), se recalculan los insumos desde su última compra, se actualizan las recetas afectadas en lote, se guarda `HistorialCondicionFiscal` y se notifica a Node por `POST /api/internos/eventos` (`costos.recalculados`) tras confirmar la transacción (CA14.3).
- **API y permisos (`backend-django/apps/insumos/views.py`, `urls.py`, `serializers.py`):** endpoints `GET/PUT/PATCH /api/configuracion-fiscal/` y `GET /api/configuracion-fiscal/historial/` exclusivos del Dueño (`EsDuenio`), `GET /api/configuracion-fiscal/estado/` de solo lectura para personal con permisos de insumos/compras/costos, y campos `costear_con_iva` y `aviso_fiscal` en compras y recálculo. Tests unitarios, de API y negativos (`403` para Encargado y Cajero).
- **Historial documental y tiempo real (`backend-node/src/routes/eventosInternos.routes.js`, `src/services/eventosInternos.service.js`):** soporte para evento interno `costos.recalculados` que registra `HistorialPrecio` + `SnapshotCosteo` en MongoDB (si está conectado) y emite `costo.actualizado` por Socket.IO a `recetas.ver_costos`.
- **Pantalla para el dueño y avisos (`web/index.html`, `web/css/estilos.css`, `web/js/logicaPwa.js`, `web/js/app.js`):** sección "Configuración del local" visible solo para el Dueño con selector de condición fiscal e historial, banners de aviso cuando falta declarar en Compras y Recetas (con acceso directo para el Dueño) y controles de `iva_incluido` / `alicuota` en compra manual.
Cómo probarlo:
- `cd backend-node && npm test && npm run lint`
- `cd backend-django && DEMO_ACCESO_RAPIDO=false .venv/bin/python -m pytest -q`
- `.venv/bin/ruff check backend-django/`
- `node --check web/js/app.js && node --check web/js/logicaPwa.js`
---

Fecha: 2026-11-21
Tarea: F4 — HU9 precio sugerido con margen objetivo y competencia
Rama: feat/hu9-precio-sugerido
Qué se hizo y por qué:
- **Modelos y migración en Django (`backend-django/apps/recetas/models.py`):** se sumaron `margen_objetivo` (por defecto `0.3000`, 30%) y `redondeo_multiplo` (`$50` o `$100`, por defecto `50`) a `Producto`, y se creó el modelo `PrecioCompetencia` para cargar precios de referencia de competidores por producto. Se generó la migración `0003_producto_margen_objetivo_producto_redondeo_multiplo_and_more.py` sin aplicarla sobre `db.sqlite3`.
- **Servicio de cálculo (`backend-django/apps/recetas/services.py`):** se implementaron `redondear_a_multiplo`, `calcular_precio_sugerido` y `obtener_sugerencia_precio_producto`. Calcula `costo ÷ (1 − margen_objetivo)` redondeado al múltiplo de `$50` o `$100` configurado (CA9.1), acota el resultado entre el mínimo y el promedio de los precios de competencia cargados cuando existen (CA9.2) y nunca modifica `precio_venta` automáticamente. Se mantuvo `listar_productos_con_costos_optimizado` con el parámetro opcional `incluir_competencia=False` para conservar las 2 consultas SQL de T3.4 y evitar N+1 en `ProductoViewSet`.
- **API, permisos y pruebas (`backend-django/apps/recetas/` y `apps/comun/tests/api/test_api_permisos_negativos.py`):** se agregó `GET /api/productos/:id/precio-sugerido/` (permiso `recetas.ver_costos`), CRUD `/api/precios-competencia/` y los campos `precio_sugerido` y `sugerencia_precio` en `ProductoSerializer` (ocultos para quienes no tienen `recetas.ver_costos`, como Cajero). Se agregaron tests unitarios, de API y negativos (`403`).
- **Recetas en PWA (`web/index.html`, `web/css/estilos.css`, `web/js/logicaPwa.js`, `web/js/app.js`):** nueva columna "Precio sugerido" en la tabla de Recetas (enmascarada con candado para Cajero), panel de margen objetivo, redondeo `$50`/`$100`, previsualización en vivo (`calcularPrecioSugeridoLocal`) y carga/eliminación manual de precios de competencia en el detalle de la receta, más botón opcional "Usar precio sugerido" en el modal de edición manual de precio. Tests unitarios y de integración en `backend-node/tests/`.
Cómo probarlo:
- `cd backend-node && npm test && npm run lint`
- `cd backend-django && DEMO_ACCESO_RAPIDO=false .venv/bin/python -m pytest -q`
- `node --check web/js/app.js && node --check web/js/logicaPwa.js`
Fecha: 2026-11-21
Tarea: Cierre de documentación integral de entrega final, auditoría de los 8 ejes de evaluación docente y configuración de reportes de cobertura
Rama: feature/ajustes-evaluacion
Qué se hizo y por qué:
- Se elaboró el conjunto completo de documentación técnica y de defensa exigido para la entrega final dentro de `docs/`:
  - `docs/ESTRUCTURA_Y_MANUAL_MODULOS.md`: guía de instalación desde cero, orden estricto de inicio de los servicios y explicación archivo por archivo de las tres ramas/módulos del sistema.
  - `docs/REVISION_TECNICA_BACKEND_NODE.md`: análisis técnico de `backend-node` cubriendo arquitectura de capas, responsabilidades de controladores, tabla de endpoints REST, validación JWT RS256, permisos, WebSockets (`Socket.IO`) y manejo de secretos.
  - `docs/capturas/`: capturas de pantalla reales del flujo del frontend (caja, importación con IA y tablero en vivo).
  - `docs/AUDITORIA_PROYECTO.md`: informe de auditoría integral verificando requerimientos funcionales, arquitectura, seguridad, resiliencia y calidad.
  - La guía de defensa oral y las notas internas de correcciones y novedades se conservan fuera del repositorio.
- Se crearon los archivos `README.md` individuales por módulo (`backend-django/README.md`, `backend-node/README.md` y `ai-service/README.md`).
- Se incorporó la medición de cobertura de código (`pytest-cov>=5.0.0` en `backend-django/requirements.txt` y `ai-service/requirements.txt`, script `test:coverage` en `backend-node/package.json` y banderas `--cov` en `.github/workflows/ci.yml`).
- `web/dev-server.js` (servidor estático auxiliar para pruebas locales) quedó fuera de la integración: se publicaría como archivo estático y en local Node ya sirve la PWA en `http://localhost:3000/app/`.
Archivos tocados:
- `backend-django/README.md`, `backend-node/README.md`, `ai-service/README.md`
- `backend-django/requirements.txt`, `ai-service/requirements.txt`, `backend-node/package.json`, `.github/workflows/ci.yml`
- `docs/ESTRUCTURA_Y_MANUAL_MODULOS.md`, `docs/REVISION_TECNICA_BACKEND_NODE.md`, `docs/AUDITORIA_PROYECTO.md`, `docs/capturas/*`
- `docs/bitacora.md`
Cómo probarlo:
- `cd backend-django && USE_SQLITE=True pytest --cov=apps --cov-report=term-missing`
- `cd backend-node && npm run test:coverage && npm run lint`
- `cd ai-service && pytest --cov=app --cov-report=term-missing`
---

## 21/11 — Integración y auditoría de la cadena F2→F6
Rama: `integracion/entrega-final` (cadena HU8 → HU14 → HU9 → HU12 → docs + commit `ef0f6a5` de `feature/ajustes-evaluacion`).
Qué se hizo y por qué:
- **Integración:** se aplicó el commit del compañero sobre la cadena. En los README de módulo y en `REVISION_TECNICA_BACKEND_NODE.md` se conservaron las versiones de la cadena, que ya cubren HU8, HU9, HU12 y HU14, y se sumaron los comandos de cobertura.
- **Guía de defensa fuera del repo:** `docs/GUIA_DEFENSA.md` se quitó de todos los commits sin publicar y se agregó al `.gitignore` junto con las notas internas, porque el repositorio es público.
- **Tests frágiles:** `test_api_demo_acceso` leía `DEMO_ACCESO_RAPIDO` del `.env` local y fallaba en la PC de la demo; ahora fuerza la configuración. El test de importación con pdf.js real superaba los 5 s con cobertura y suites en paralelo; ahora tiene 20 s.
- **Límite de movimientos de stock:** `GET /api/insumos/movimientos-stock/?limite=` no tenía tope; ahora devuelve como máximo 500 filas (test nuevo).
- **Auditoría sin hallazgos bloqueantes:** permisos de las vistas nuevas (`EsDuenio` en condición fiscal, `recetas.*` en precios de competencia), clave interna Django→Node comparada en tiempo constante, eventos de venta filtrados por sala sin filtrar costos ni montos al cajero, descuento y devolución de stock con `select_for_update()` en orden de id e idempotentes, `makemigrations --check` sin cambios pendientes.
- **Riesgo conocido para el deploy:** las notificaciones a Node son síncronas después del commit (timeout de 2 s por llamada). Si Node está dormido, cada cobro puede tardar unos segundos más, aunque la venta se guarda igual.
Resultados verificados: Django 571 pruebas (96 % de cobertura, con `USE_SQLITE=True`), Node 244 (88,5 % de líneas), AI Service 87 (92 %). Ruff y ESLint sin errores.
Cómo probarlo:
- `cd backend-django && USE_SQLITE=True .venv/bin/python -m pytest -q --cov=apps`
- `cd backend-node && npm run test:coverage && npm run lint`
- `cd ai-service && .venv/bin/python -m pytest -q --cov=app`

---

## 21/11 — Prueba en el navegador, arreglos del frontend y avisos a Node en segundo plano
Rama: `integracion/entrega-final`. Base local respaldada (`~/orq/backups/db.sqlite3.20261121-220907.antes-integracion`) y migrada (insumos 0002 y 0003, recetas 0003).
Qué se probó en el navegador (dueño, encargado y cajero demo):
- Anduvo: login demo, apertura de turno propio, cobro con ticket (dirección real), venta y anulación en vivo en el tablero del encargado (HU8), condición fiscal con recálculo de 19 insumos y 12 recetas e historial (HU14), precio sugerido, vista previa del margen, competencia con tope al mínimo y al promedio (HU9), ajuste manual, mínimo y alerta de stock bajo en vivo (HU12), importación con IA (Groq) y carta pública. El cajero solo ve Punto de Venta y Caja; la API le devuelve los costos en `null` y 403 en insumos, competencia, finanzas y condición fiscal.
- No hay botón para anular ventas en la web: la anulación existe solo como `POST /api/ventas/{id}/anular/` (se probó por API).
Arreglos y por qué:
- **Turno ajeno en Caja:** el dueño y el encargado tomaban como propio el primer turno ABIERTO de la lista (el del cajero) y podían cobrar o cerrar caja sobre él. `seleccionarTurnoPropio` (en `logicaPwa.js`, con tests) solo considera turnos del usuario; el caché de turno de otro usuario se ignora.
- **Hora en 24 h:** Chrome formatea `es-AR` con reloj de 12 h sin "a. m./p. m." (un ticket de las 22:16 decía 10:16). Se fuerza `hourCycle: 'h23'` en ticket, caja, auditoría, tablero y carta.
- **Tablero en vivo:** montos con formato de moneda (antes "$2200.0000") y cantidades de stock legibles en el toast y el tablero (antes "492.0000 g").
- **Reportes del encargado:** sin `reportes.ver_financieros` ya no se piden ganancia diaria ni punto de equilibrio (daban 403 y el aviso "No se pudieron cargar algunas métricas" en cada venta en vivo).
- **Avisos a Node en segundo plano:** `notificar_evento_node` arma la petición en el hilo del request (el correlation id es un `ContextVar` y no pasa a otros hilos) y la encola en un `ThreadPoolExecutor` de un solo hilo, que conserva el orden (venta → stock bajo). Así un cobro no espera el timeout de 2 s por aviso si Node está dormido en Render. Se descartaron: agrupar avisos (no evita la espera), bajar el timeout (sigue demorando y pierde avisos) y un ping para mantener Node despierto (en Render gratis las 750 horas mensuales se comparten entre los tres servicios). Nueva variable `NODE_EVENTOS_EN_SEGUNDO_PLANO` (por defecto `True`); `conftest.py` la apaga para que los tests existentes sigan verificando el envío de forma síncrona, y `test_unit_notificaciones_node_segundo_plano.py` prueba el modo real (no bloquea, orden, correlation id, errores y cobro sin demora).
Archivos tocados: `web/js/app.js`, `web/js/logicaPwa.js`, `web/js/carta.js`, `backend-node/tests/unit/logicaPwa.unit.test.js`, `backend-django/apps/comun/notificaciones_node.py`, `backend-django/apps/comun/tests/unit/test_unit_notificaciones_node_segundo_plano.py`, `backend-django/config/settings/base.py`, `backend-django/conftest.py`, `.env.example`, `docs/bitacora.md`.
Resultados verificados: Django 578 pruebas (`USE_SQLITE=True`), Node 247, AI Service 87; ruff, `npm run lint` y `node --check` de la web sin errores.
Pendiente antes del deploy: el cliente Socket.IO se carga desde `/socket.io/socket.io.js`, que en Vercel no existe (lo sirve Node), así que el tablero en vivo no conectaría; además `seed_demo` define `stock_minimo` pero no `stock_actual`, por lo que tras sembrar los insumos con mínimo aparecerían en "Stock bajo".
Cómo probarlo:
- `cd backend-django && USE_SQLITE=True .venv/bin/python -m pytest -q`
- `cd backend-node && npm test -- --silent`
- `cd ai-service && .venv/bin/python -m pytest -q`

## 21/11 — Anular ventas desde la web, stock inicial de demo, Socket.IO en Vercel y revisión del deploy
Rama: `integracion/entrega-final`. Backup previo a la prueba en el navegador: `~/orq/backups/db.sqlite3.20261121-225235.antes-prueba-anular`.
Qué se hizo y por qué:
- **Anular ventas desde Reportes:** columna "Acción" en la tabla de trazabilidad con botón "Anular" solo para ventas EMITIDA de turnos abiertos y usuarios con `ventas.anular_ticket`. Abre un modal que pide motivo (3 a 255 caracteres), llama a `POST /api/ventas/{id}/anular/`, muestra el error de la API con `extraerMensajeErrorApi` y refresca reportes y tarjetas (si el backend responde 400, por ejemplo porque el turno se cerró, también refresca para que el botón desaparezca). Para saber si el turno sigue abierto, `VentaSerializer` suma el campo de solo lectura `turno_estado`. La lógica pura (`esVentaAnulable`, `puedeAnularVenta`, `registroMuestraBotonAnular`, `validarMotivoAnulacion`) está en `logicaPwa.js` con tests. El backend sigue validando permiso y turno: el botón solo evita ofrecer algo que va a fallar.
- **Stock inicial en `seed_demo`:** en una base nueva las compras de muestra ya cargaban stock; el problema era en bases creadas antes de HU12 (compras viejas, stock en 0 y mínimo en 0, como la local). Ahora el mínimo se completa si está en 0 aunque haya compras, y si el insumo nunca tuvo un INGRESO se carga un stock inicial inventado como ajuste manual ("Stock inicial de demo (seed_demo)", queda en la trazabilidad). Almendras (600/1000 ml) y vasos (20/30 un) quedan bajos a propósito para mostrar la alerta. No se toca un insumo que ya tuvo un ingreso, y correrlo dos veces no suma nada. Probado sobre una copia de la base local: `--video` frena por el Turno #1 abierto (esperado); con el turno cerrado en la copia, quedan bajos solo vasos y almendras.
- **Socket.IO en Vercel:** `index.html` cargaba `/socket.io/socket.io.js`, que solo existe si Node sirve la página. Se copió el cliente 4.8.4 (misma versión que el servidor) a `web/vendor/socket.io/` con su SHA-256 en el README; el Service Worker lo cachea (caché `v5`) y `vendorSocketIo.unit.test.js` falla si la versión o el hash no coinciden.
- **Revisión del deploy:**
  - `render.yaml` no decía `plan`: según la doc de Render, así crea instancias pagas (`0.5c-512mb`). Se agregó `plan: free` a los tres servicios.
  - Las claves JWT no están en el repo; sin `DJANGO_JWT_*` Django generaba un par efímero por worker de gunicorn (login intermitente y Node sin poder validar). Con `DEBUG` apagado ahora no arranca (`ImproperlyConfigured`), y los PEM pegados en una línea con `\n` se normalizan (Node ya lo hacía).
  - `ALLOWED_HOSTS` suma solo `RENDER_EXTERNAL_HOSTNAME`.
  - `index.html` no cargaba `config.js`; las URLs de Render quedan en `config.js` (`urlsNube`) y `app.js`/`carta.js` las leen de ahí. La CSP sigue con los nombres fijos en `vercel.json`, `web/nginx.conf` y `backend-node/app.js`.
  - `vercel.json` no tenía rewrite para `/carta.html`: el QR generado desde la raíz del sitio daba 404.
  - `docs/despliegue.md` suma la sección 8 (Render + Vercel): límites del plan gratis, claves JWT, variables por servicio, CORS, seed desde la PC (Render gratis no tiene consola), QR y verificación.
  - `DEMO_ACCESO_RAPIDO` sigue fuera de `render.yaml` (en la nube queda apagado): decisión del equipo.
Prueba en el navegador integrado (dueño demo): se abrió el Turno #7 propio, se cobró el ticket #65 (Café Espresso, $ 2.200), apareció "Anular" en su fila y en las 18 ventas del Turno #1 de `cajero_demo` (abierto), no en las 34 de turnos cerrados. Con motivo vacío frena la validación del navegador; con "ab" aparece "Escribí el motivo de la anulación". Con motivo válido la venta quedó ANULADA en la base, la fila pasó a "Venta · Anulada", el botón desapareció y la facturación bajó de $ 618.000 (64 tickets) a $ 615.800 (63). Después se cerró el Turno #7 desde Caja; el Turno #1 no se tocó. El tablero muestra "Conectado" con el cliente de `vendor/`.
Sin verificar: el registro del Service Worker falla en el navegador integrado ("unknown error when fetching the script") aunque `sw.js` responde 200 y tiene la sintaxis bien; hay que mirarlo en Chrome (DevTools → Application).
Archivos tocados: `backend-django/apps/ventas/serializers.py`, `backend-django/apps/ventas/tests/api/test_api_anulacion_ventas.py`, `backend-django/apps/insumos/management/commands/seed_demo.py`, `backend-django/apps/insumos/tests/unit/test_unit_seed_demo.py`, `backend-django/apps/usuarios/claves.py`, `backend-django/apps/usuarios/tests/unit/test_unit_jwt_rs256.py`, `backend-django/config/settings/base.py`, `web/index.html`, `web/js/app.js`, `web/js/logicaPwa.js`, `web/js/carta.js`, `web/js/config.js`, `web/sw.js`, `web/vendor/socket.io/`, `web/README.md`, `backend-node/tests/unit/logicaPwa.unit.test.js`, `backend-node/tests/unit/vendorSocketIo.unit.test.js`, `backend-node/tests/integration/clientePwa.integration.test.js`, `render.yaml`, `vercel.json`, `docs/despliegue.md`, `docs/CONNECTIONS.md`, `docs/bitacora.md`.
Resultados verificados: Django 584 pruebas (`USE_SQLITE=True`), Node 254 (28 suites), AI Service 87; `npm run lint` y ruff (`check` y `format --check`) sin errores.
Cómo probarlo:
- `cd backend-django && USE_SQLITE=True .venv/bin/python -m pytest -q`
- `cd backend-node && npm test -- --silent && npm run lint`
- `cd ai-service && .venv/bin/python -m pytest -q`
- En la web: abrir un turno propio, cobrar, ir a Reportes y anular la venta con un motivo.

## 22/11 — Botón de menú (☰) visible y sin función en pantallas anchas
Rama: `fix/web-boton-menu` (desde `main` = `580e80f`).
Qué pasaba: el botón ☰ de la barra superior está pensado solo para pantallas de hasta 768 px, donde abre el menú lateral deslizable. Tiene dos clases (`btn-icono-panel btn-hamburguesa-sidebar`); la regla que lo oculta (`.btn-hamburguesa-sidebar { display: none }`) estaba antes en `estilos.css` que `.btn-icono-panel { display: flex }`, con la misma especificidad, así que ganaba la segunda. En pantallas anchas el botón se veía y al tocarlo solo agregaba la clase `abierto` al menú, que ahí no cambia nada (el menú ya está fijo a la izquierda).
Qué se hizo: los dos selectores del botón (el que lo oculta y el de la media query que lo muestra en pantallas chicas) pasan a `.barra-superior-comercial .btn-hamburguesa-sidebar`. El Service Worker es network-first, así que no hace falta cambiar la versión de caché.
Prueba: web de la rama servida en local en el navegador integrado: a 1650 px el botón queda `display: none` (los otros botones de la barra siguen visibles); a 700 px se ve, abre el menú y la ✕ lo cierra.
Archivos tocados: `web/css/estilos.css`, `docs/bitacora.md`.
Cómo probarlo: abrir la app con la ventana ancha (el ☰ no tiene que aparecer) y achicarla a menos de 768 px (aparece y abre el menú).

## 22/11 — "¿No podés conectarte?" abría el modal tapado por el login
Rama: `fix/web-boton-menu`.
Qué pasaba: el enlace del login sí abre el modal "Conexión del sistema" (`abrirModalConfigServidor`), pero `.modal-overlay` tiene `z-index: 2000` y la pantalla de login `9999`: el modal quedaba abierto detrás y parecía que el enlace no hacía nada.
Qué se hizo: `#modal-config-servidor` pasa a `z-index: 9999`. Queda arriba del login porque viene después en el HTML, y debajo de los avisos (`.contenedor-toasts`, `10000`), que siguen viéndose al guardar. Los demás modales no cambian (solo se abren con la sesión iniciada).
Prueba: web de la rama servida en local en el navegador integrado: al tocar el enlace, el modal se ve encima del login con las direcciones cargadas y "Cancelar" lo cierra.
Sin arreglar (detalle menor): al guardar, el formulario acepta direcciones sin `http://` (por ejemplo `localhost:8000`) y las guarda tal cual.
Archivos tocados: `web/css/estilos.css`, `docs/bitacora.md`.

## 22/11 — Doble ojito en la contraseña del login
Rama: `fix/web-boton-menu`.
Qué pasaba: al pegar la contraseña con Ctrl+V en Brave aparecían dos botones para verla. El nuestro (`.btn-toggle-visibilidad`) es uno solo; el segundo lo agrega el navegador cuando la contraseña se escribe o pega a mano (no cuando se autocompleta).
Qué se hizo: `estilos.css` oculta el botón nativo con `::-ms-reveal` (Edge y derivados de Chromium que lo implementan, según la documentación de Microsoft) y `::reveal-icon` (el nombre que eligió la CSSWG en 2025). Cada uno va en su propia regla porque un selector desconocido invalida toda la regla.
Sin verificar: en el navegador integrado (Chromium 156) no aparece el botón nativo y ninguno de los dos selectores está soportado, así que no se pudo reproducir; queda por confirmar en el Brave donde se vio.
Archivos tocados: `web/css/estilos.css`, `docs/bitacora.md`.

## 22/11 — La importación con IA caía en contingencia en la nube (arranque en frío)
Rama: `fix/web-boton-menu`.
Qué pasaba: en Render gratis `sapori-ai-service` se duerme a los 15 minutos sin tráfico y tarda en despertar (medido: 12 s; puede llegar a ~1 minuto). Node espera la extracción como máximo 12 s (texto) o 25 s (foto), así que la primera importación después de un rato daba "No se pudo usar la IA, revisá la configuración". Con el servicio despierto, el mismo texto respondió bien (Groq, 2,4 s, 4 ítems y envío de $4.500).
Qué se hizo:
- `backend-node/src/clients/ai.client.js`: si el primer intento vence (`TimeoutError`/`AbortError`) o falla la red (`TypeError` de fetch), se reintenta una vez con 60 s (`timeoutReintentoIAMs`). Un error HTTP de ai-service no se reintenta. La importación ya corre en segundo plano (202 + aviso por Socket.IO), así que esperar más no traba la pantalla.
- `web/js/app.js` (`consultarDetalleImportacion`): el sondeo pasa de 40 a 180 intentos de 500 ms (~90 s) para cubrir el reintento; igual el aviso `importacion.lista` refresca la propuesta cuando llega.
Tests: 4 nuevos en `aiClient.unit.test.js` (reintento exitoso tras timeout, sin reintento ante HTTP 500, contingencia si el reintento falla, criterio de `esErrorReintentableIA`). Node: 258 tests, ESLint sin errores.
Archivos tocados: `backend-node/src/clients/ai.client.js`, `backend-node/tests/unit/aiClient.unit.test.js`, `web/js/app.js`, `docs/bitacora.md`.

## 23/11 — Scrolls propios en POS y Reportes; fuera "¿No podés conectarte?"
Rama: `fix/web-boton-menu`. Pedido después de revisar la grabación del video.
Qué pasaba y qué se hizo:
- **POS:** con muchos productos en el ticket, la columna crecía (medido: 1480 px en una grilla de 770) y estiraba toda la página, dejando espacio en blanco bajo el catálogo. La grilla ya tenía altura fija y scrolls propios, pero la fila del grid y los hijos flex no se achican por debajo de su contenido sin `min-height: 0`. Se agregó `grid-template-rows: minmax(0, 1fr)` y `min-height: 0` en columnas y zonas de scroll. Ahora la página queda en el alto de la ventana, el catálogo y los ítems del ticket scrollean por separado y el botón de cobrar sigue visible. En pantallas de hasta 1024 px (una columna) el ticket tiene `max-height: 50vh`.
- **Tablas de las secciones** (`.vista-modulo .tabla-contenedor-responsive`: historial de Reportes, carta de Recetas, caja, compras): cuadro de hasta `70vh` con scroll propio y cabecera fija. Con el cursor encima scrollea la tabla y fuera de ella la página. Se eligió 70vh en lugar de "20 filas" porque las filas del historial tienen alto variable y 20 filas pasan el alto de la pantalla (el scroll interno quedaría cortado). Medido en la nube con 202 registros: la tabla ocupa 630 px y la página bajó de ~16.000 a ~2.600 px.
- **Ranking y "sin rotación"** (Reportes): listas con `max-height: 420px` y scroll; la grilla usa `align-items: start` para que la tarjeta corta no quede como un bloque blanco estirado.
- **"¿No podés conectarte?"** se sacó del login: abría la configuración de direcciones del servidor y se confundía con recuperar la contraseña. El engranaje del dueño en la barra superior sigue abriendo ese modal.
- El menú lateral ya es `position: sticky` con alto de pantalla; con el POS sin scroll de página deja de moverse ahí.
Prueba: reglas inyectadas sobre la web publicada a 1650×900 (sesión de dueño): mediciones de arriba; después del deploy se repite sobre el CSS real.
Archivos tocados: `web/css/estilos.css`, `web/index.html`, `docs/bitacora.md`.

## 23/11 — La IA ahora lee PDF escaneados y los errores dicen la causa
Rama: `feature/ia-pdf-escaneado`.
Diagnóstico previo: ai-service y Node responden bien en local y en Render con texto y con foto (Groq, 1,5–3,5 s). Lo que fallaba era la web:
- Un PDF escaneado (sin texto seleccionable, típico de una lista sacada con el celular o el escáner) se rechazaba con "El PDF parece ser una imagen escaneada…" y nunca llegaba a la IA, aunque el modelo de visión ya estaba.
- Cualquier falla al crear la importación (sesión vencida, archivo pesado, demasiados pedidos, servidor caído o sin conexión) mostraba "No se pudo usar la IA, revisá la configuración".
Qué se hizo:
- `web/js/app.js`: si pdf.js no encuentra texto, `renderizarPdfEscaneadoComoImagen` dibuja las primeras 3 páginas una debajo de otra en un JPEG y se analiza como una foto (misma vista previa y mismo envío). El aviso indica si quedaron páginas afuera. Se extrajo `aplicarImagenImportacion` para no duplicar lo que ya hacía la foto. El archivo se vuelve a leer antes de dibujar porque pdf.js puede transferir el buffer al worker.
- `web/js/logicaPwa.js`: `calcularLienzoPdfEscaneado` (función pura) calcula la escala común: ancho máximo 1600 px, alto total máximo 4800 px y ampliación máxima ×3. `mensajeFallaImportacionIA` da el motivo según el código HTTP (401, 403, 413, 429, validación 400, 5xx) y `MENSAJE_IMPORTACION_SIN_CONEXION` cubre la falta de red. El caso en que la IA sí recibió el pedido pero cayó en contingencia sigue con el mensaje anterior.
Tests: `backend-node/tests/unit/importacionPdfEscaneado.unit.test.js` (10 casos). Suite de Node: 267 de 268. Falla `clientePwa.integration` (`/carta.html` da 404) solo en este worktree, porque su ruta pasa por la carpeta oculta `.claude` y `res.sendFile` la rechaza; en `main`, en una carpeta normal, pasa.
Prueba en navegador: Brave sin ventana con la misma CSP de la app, cargando la web de la rama. PDF escaneado de 1 página → imagen 1260×360; PDF con texto → sigue yendo por texto; PDF escaneado de 4 páginas → 1131×4800 (78 KB) con el aviso "primeras 3 de 4 páginas". Esa imagen enviada a Node local → LISTA con Groq y 4 ítems (café, leche, azúcar, vasos). Las importaciones de prueba se rechazaron con motivo "Prueba de diagnostico".
Archivos tocados: `web/js/app.js`, `web/js/logicaPwa.js`, `backend-node/tests/unit/importacionPdfEscaneado.unit.test.js`, `docs/bitacora.md`.

## 23/11 — "Ver ticket" en el historial de Reportes
Rama: `feature/ticket-historial`. Punto 2 del plan de mejoras post-entrega.
Antes, el ticket térmico solo se veía en el momento de cobrar: para reimprimir una venta vieja o revisar qué se cobró había que leer el detalle resumido de la fila.
Qué se hizo:
- `web/js/logicaPwa.js`: `armarTicketDesdeRegistroHistorial` (función pura) convierte una fila de venta del historial en los datos del ticket: número, fecha original, cajero, turno, ítems con subtotal, total, IVA incluido, medio de pago y, si está anulada, el motivo. `unificarTrazabilidadRegistros` ahora guarda en cada fila de venta la venta original (`ticketFuente`). El IVA se calcula en centavos con `calcularIvaIncluidoCentavos` (total − total/1,21, la misma fórmula del ticket al cobrar).
- Ventas sin conexión: `encolarVentaOffline` acepta una "foto" del ticket (nombres, cantidades, subtotales y cajero) y la guarda junto a la venta encolada, fuera de `payload`, para que no viaje al backend al sincronizar. Las ventas encoladas antes de este cambio no tienen foto: se busca nombre y precio en el catálogo y el cajero queda en "-".
- Si el usuario no tiene permiso para ver montos (`caja.ver_efectivo_esperado`), el backend manda total y precios en null: el ticket muestra los ítems y "-" en los montos.
- `web/js/app.js`: botón "Ver ticket" en cada fila de venta (al lado de "Anular"). El modal se separó en `pintarModalTicketTermico(ticket)`, que se usa al cobrar y desde Reportes. Desde Reportes el botón "Nueva Venta" dice "Cerrar" y no lleva el foco al lector de códigos.
- `web/index.html` y `web/css/estilos.css`: marca "ANULADA" con el motivo dentro del papel del ticket (borde punteado, también sale impresa).
Tests: `backend-node/tests/unit/ticketHistorial.unit.test.js` (7 casos: venta normal, anulada, montos ocultos, offline con foto, offline sin foto, filas que no son ventas, IVA). Suite de Node: 274 de 275; la que falla es la conocida de `/carta.html` en worktrees bajo `.claude`.
Prueba en navegador: servidor estático propio con la web de la rama que reenvía al Django local solo GET y el login demo (bloquea cualquier otra escritura). Dueño demo: 65 botones para las 65 ventas (ninguno en stock ni en cierres). Ticket #65 anulado → fecha 21/11 22:53, marca y motivo. Ticket #61 → 3 ítems que suman el total. Reimprimir llama a `window.print` y "Cerrar" cierra el modal. Dos ventas sin conexión inyectadas en la cola (con foto y sin foto) → se abren con su número temporal y la leyenda de "sin internet". La base local siguió con 65 ventas.
Archivos tocados: `web/js/logicaPwa.js`, `web/js/app.js`, `web/index.html`, `web/css/estilos.css`, `backend-node/tests/unit/ticketHistorial.unit.test.js`, `docs/bitacora.md`.

## 23/11 — Detección real de la conexión y modal de conexión simplificado
Rama: `feature/conexion-real`. Punto 6 del plan de mejoras post-entrega.
Qué pasaba: todo dependía de `navigator.onLine`, que solo dice si hay una red. Con wifi sin internet o con el servidor caído seguía en `true`: la app intentaba cobrar contra el servidor, esperaba a que fallara el pedido y recién ahí guardaba la venta en la cola. El evento `online` disparaba la sincronización aunque el servidor todavía no contestara. El modal "Conexión del sistema" mostraba un selector de 3 modos y las 2 direcciones de los servidores, que el personal no tiene por qué tocar.
Qué se hizo:
- `web/js/logicaPwa.js` (funciones puras): `verificarSaludServidor` hace un GET a `/health` de Django (la ruta de salud que ya existía, sin base de datos) con `cache: 'no-store'` y 8 s de timeout, y nunca lanza: devuelve el motivo (`timeout`, `red`, `http_503`…). `aplicarResultadoPing` lleva el estado: el corte se declara con 2 fallos seguidos (un micro-corte del wifi no manda las ventas a la cola) y avisa `corte` o `vuelta` una sola vez. `calcularEsperaProximoPing`: cada 30 s si hay conexión; si falla, 5, 10, 20, 40 y 60 s como tope. `debeTrabajarSinConexion` junta las 3 causas (modo manual, navegador sin red, servidor que no contesta).
- `web/js/app.js`: monitor de conexión (`verificarConexionAhora`) que arranca al cargar, se repite con esas esperas y pregunta enseguida al volver a la pestaña. Al cortarse, muestra el banner `banner-cola-offline` y un aviso. Al volver, si hay ventas en la cola llama a la sincronización que ya existía y, si no, reconecta el socket. El evento `online` ahora solo dispara un ping; `offline` marca el corte al instante, porque sin red seguro no hay servidor. Cobrar, cargar catálogo y turno y conectar el socket usan `sinConexionReal()`, así que con el servidor caído la venta va directo a la cola sin esperar el timeout. El botón "Sincronizar" pregunta al servidor antes de intentar. El login y el botón demo no se tocaron: siguen intentando contra el servidor.
- Banner: con conexión pero con ventas sin enviar (por ejemplo, porque falta abrir un turno) dice "N ventas guardadas sin enviar" en vez de "Sin conexión". Los textos "Sin internet:" pasaron a "Sin conexión:", porque el corte también puede ser del servidor.
- Modal (decisión del usuario): en la vista normal queda solo el interruptor "Trabajar sin conexión" con una línea de ayuda. Local o nube lo decide `resolverModoDesdeInterruptor` según dónde se abrió la página (localhost → local; el resto → nube), igual que `resolverEndpointsServidor`. El selector y las 2 direcciones siguen en el HTML dentro de `config-servidor-avanzado` y se ven abriendo la app con `?debug` (`esVistaDebugConexion`); en esa vista se guarda lo del selector, como antes. Las direcciones por defecto siguen en `config.js`.
Tests: `backend-node/tests/unit/conexionReal.unit.test.js` (18 casos: esperas, transición corte/vuelta, timeout con temporizadores falsos, 503, error de red, URL, modo del interruptor, `?debug`). Suite de Node: 292 de 293; la que falla es la conocida de `/carta.html` en worktrees bajo `.claude`.
Prueba en navegador: servidor estático propio con la web de la rama que reenvía al Django local solo GET y el login demo, y que puede simular un corte. Servidor que no contesta (como un wifi sin internet): corte a los 21 s (8 + 5 + 8), banner y aviso. Servidor caído (conexión rechazada): corte a los 5 s. Venta durante el corte (con un turno simulado solo en el caché del navegador): fue directo a la cola. Al volver: aviso, se llamó a la sincronización y frenó con "No hay un turno de caja abierto" (en la base local no hay turno abierto). Modal: interruptor prendido → modo `offline` y banner; apagado → `local` y ping; con `?debug` aparecen el selector y las direcciones. El proxy no bloqueó ninguna escritura porque no hubo ninguna, y la base local siguió con 65 ventas y 118 ítems.
Archivos tocados: `web/js/logicaPwa.js`, `web/js/app.js`, `web/index.html`, `backend-node/tests/unit/conexionReal.unit.test.js`, `docs/bitacora.md`.

## 23/11 — Superadmin y contraseñas: cambiar la propia y restablecer la de otro
Rama: `feature/superadmin-claves`. Punto 5 del plan de mejoras post-entrega (plan aprobado por el usuario antes de programar).
Qué faltaba: nadie podía cambiar su propia contraseña ni restablecer la de otra persona, y al dar de alta a alguien alcanzaba con 4 caracteres.
Qué se hizo:
- Reglas de contraseña (`config/settings/base.py`, `AUTH_PASSWORD_VALIDATORS`): mínimo 8 caracteres, que no sea una clave común, que no sea solo números y que no se parezca al usuario. Se aplican solo al fijar una clave nueva (cambio, restablecimiento, alta desde la API y superadmin). Las claves que ya existen, incluidas las demo, siguen andando. `crear_personal` las aplica solo si recibe `validar_clave=True` (lo pasa la vista de alta), para que el seed y los tests sigan usando sus claves de ejemplo.
- `POST /api/auth/cambiar-clave/` (`services.cambiar_clave_propia`): para cualquier usuario con sesión. Pide la clave actual, la nueva y su repetición. Cierra todas sus sesiones (blacklist de los refresh con `invalidar_tokens_usuario`) y devuelve un par de tokens nuevo para que el dispositivo actual siga conectado. Límite propio de 10 intentos por minuto por usuario (`CambioClaveRateThrottle`): el de login es por IP y no aplica a usuarios con sesión.
- `POST /api/usuarios/{id}/restablecer-clave/` (`services.restablecer_clave`): la regla está en `puede_restablecer_clave`. El superadmin se la restablece a cualquiera menos a sí mismo; un dueño, solo a encargados y cajeros. Depende del rol y no de un permiso granular, así no se puede delegar a un encargado. Quien restablece escribe la clave y se la pasa a la persona. Se cierran todas sus sesiones.
- Lo que queda abierto: el access token que la persona ya tenía sigue valiendo hasta que venza (15 minutos), porque Node lo valida por su cuenta con la clave pública. Cerrarlo antes obligaría a que Node consulte la blacklist; no se hizo.
- Auditoría: dos acciones nuevas, `CAMBIO_CLAVE` y `RESTABLECIMIENTO_CLAVE` (migración `usuarios/0002`, que solo cambia las opciones del campo). Guardan quién, a quién y cuántas sesiones se cerraron. La clave nunca se guarda.
- Superadmin: solo se crea con `python manage.py crear_superadmin <usuario> [--email correo]`. Pide la clave dos veces sin mostrarla (nunca como argumento, para que no quede en el historial), la valida, crea el usuario con perfil DUENIO y deja el alta en la auditoría con `origen: comando`. Si el usuario ya existe no toca nada. La API sigue sin dejar marcar `is_superuser` (es de solo lectura en el serializer; hay un test que lo prueba).
- Web: botón con candado al lado de "Salir" que abre "Cambiar mi contraseña". En Equipo & Permisos aparece el botón "Restablecer clave" en cada tarjeta, solo si corresponde (`puedeRestablecerClaveDe` en `logicaPwa.js` copia la regla del servidor, y el servidor vuelve a decidir). El superadmin aparece con la marca "Superadmin". No se hizo una pantalla aparte: el superadmin ya ve a todos en Equipo & Permisos. `validarFormularioClave` hace el chequeo rápido antes de llamar a la API. El alta pide 8 caracteres.
Tests: `apps/usuarios/tests/api/test_api_claves.py` (matriz de quién puede restablecer a quién, blacklist, auditoría sin clave, claves débiles, alta con clave corta, `is_superuser` por API) y `apps/usuarios/tests/unit/test_unit_crear_superadmin.py` (4 casos). Suite de Django: 615 pasan. Jest: `puedeRestablecerClaveDe` y `validarFormularioClave` en `logicaPwa.unit.test.js`. Suite de Node: 299 de 300; la que falla es la conocida de `/carta.html` en worktrees bajo `.claude`.
Prueba en navegador: Django de la rama en :8010 sobre una copia de `db.sqlite3` (borrada al terminar) y la web de la rama servida en :5173. Con el dueño: botón en encargado y cajeros, no en dueños ni superadmins; clave común rechazada con el mensaje de Django; restablecimiento al cajero OK y login del cajero con la clave nueva. "Cambiar mi contraseña": actual equivocada y repetición distinta rechazadas; cambio OK, el refresh viejo da 401 y la sesión sigue con los tokens nuevos. Con el superadmin: botón en todos menos en sí mismo. El encargado no ve la sección. La base real no se tocó.
Cómo probarlo: `pytest apps/usuarios -q` en `backend-django`; para crear el superadmin, `python manage.py crear_superadmin <usuario>`.
Archivos tocados: `backend-django/config/settings/base.py`, `backend-django/apps/comun/throttling.py`, `backend-django/apps/usuarios/{models,services,serializers,views,urls}.py`, `backend-django/apps/usuarios/migrations/0002_acciones_clave_auditoria.py`, `backend-django/apps/usuarios/management/commands/crear_superadmin.py`, los dos tests nuevos, `web/js/logicaPwa.js`, `web/js/app.js`, `web/index.html`, `backend-node/tests/unit/logicaPwa.unit.test.js`, `docs/bitacora.md`.

## 23/11 — IA que fallaba en la nube, "Sin conexión" trabado y botones de la cabecera
Rama: `fix/ia-arranque-cabecera`. Problemas que vio el usuario probando el deploy.
- **IA en contingencia en la nube.** Diagnóstico: ai-service en Render respondía bien (Groq, 2 s). Las importaciones fallidas guardaban "ai-service respondió con estado HTTP 502": cuando el servicio gratis de Render está dormido, su proxy contesta 502/503 mientras despierta, y Node solo reintentaba ante timeout o falla de red. Arreglo en `backend-node/src/clients/ai.client.js`: `pedirConArranqueFrio` reintenta ante timeout, falla de red o 502/503/504, con esperas de 3, 5, 10, 15 y 20 s y un tope de 80 s (el navegador consulta la importación durante unos 90 s). Un 500 o un 4xx no se reintentan. Lo usan la importación de listas y el resumen semanal (botones de Reportes). Además, `server.js` llama a `despertarAiService` al arrancar: si Node se acaba de despertar, ai-service seguramente también dormía.
- **"Sin conexión" y "Trabajando sin internet" trabados.** El monitor dejaba de pingear si `navigator.onLine` era `false`, y en algunos Linux el navegador lo reporta así teniendo internet. Ahora el ping es lo que decide: se pingea igual, y `navigator.onLine` solo marca el estado inicial (y el evento `offline` sigue marcando el corte al instante). El login, el botón demo, "Sincronizar" y "Cambiar mi contraseña" ya no miran `navigator.onLine`: si el pedido falla, el login sigue cayendo en la sesión guardada como antes. El próximo ping se programa antes de los avisos, así un error en un aviso no frena el monitor. Con 0 ventas en cola, el aviso dice "Sin conexión: las ventas se guardarán y se enviarán al volver la conexión".
- **Botones de la cabecera.** Con el aviso de conexión visible, el renglón se partía y la ruedita y la campanita quedaban abajo, a la izquierda. Ahora las píldoras de estado van en `cabecera-pildoras` (se acomodan en varios renglones) y los 3 botones de íconos en `cabecera-botones-icono`, siempre juntos arriba a la derecha. En celular el título va primero y el estado abajo, sin scroll horizontal (medido a 1920, 1280 y 375 px).
Tests: `aiClient.unit.test.js` suma 3 casos (502→503→200, agotar reintentos, un 500 no se reintenta). Suite de Node: 302 de 303; la que falla es la conocida de `/carta.html` en worktrees bajo `.claude`.
Archivos tocados: `backend-node/src/clients/ai.client.js`, `backend-node/server.js`, `backend-node/tests/unit/aiClient.unit.test.js`, `web/js/app.js`, `web/index.html`, `web/css/estilos.css`, `docs/bitacora.md`.
