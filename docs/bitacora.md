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

