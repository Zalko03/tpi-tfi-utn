# ARCHITECTURE.md - Mapa Actual del Sistema

## 1. Módulos y Servicios
- **backend-django:** Núcleo transaccional local (Insumos, Recetas, Compras, Caja, Django 5 + DRF + PostgreSQL 16 + Gunicorn 23). Corre en el servidor/PC local mediante Docker con usuario no-root. Expone `POST /api/compras/confirmar-importacion/` para registrar compras aprobadas con prorrateo de envío y recálculo atómico de recetas con desglose.
- **backend-node:** Eventos en tiempo real, orquestación de IA y proyecciones documentales (Express + Mongoose + MongoDB 7 + Socket.IO). Gestiona `historial_precios`, `snapshots_costeo`, `importaciones_ia` (`POST /api/importaciones`, `POST /api/importaciones/:id/aprobar`, `POST /api/importaciones/:id/rechazar`), canales WebSocket autenticados con JWT RS256 (salas `local` y `turno:{id}`, presencia y eventos `venta.registrada`, `costo.actualizado`, `stock.bajo`, `importacion.lista`) y la sincronización del menú digital.
- **ai-service:** Extracción de listas de proveedores y reportes (`GET /health`, `GET /health/profundo`, `POST /v1/extraer-precios`, `POST /v1/resumen-semanal` con FastAPI + Pydantic v2 + Patrón Adapter Gemini API / Ollama, TP 3 y TP 4). Con degradación elegante (`contingencia: true`) a carga manual/CSV si no hay conexión o la salida no valida.
- **web (PWA / Cliente Local & Cloud) & web-proxy:** Interfaz formal de gestión y caja instalable como PWA (`manifest.webmanifest`, `sw.js`, `index.html`, `js/app.js`, `js/logicaPwa.js`) servida localmente por Nginx Alpine en el puerto 80 o en la nube vía Vercel (`vercel.json`), conectándose a los servicios en Render (`render.yaml`), PostgreSQL en Aiven y MongoDB Atlas. Incluye resolución dinámica de endpoints, importador CSV con soporte de coma y punto y coma, y cola de sincronización offline (`sapori_cola_ventas_offline`) para cobrar tickets térmicos sin internet.
- **carta-digital (Nube / Should):** Página pública ligera de solo lectura consumida por clientes vía código QR, sincronizada unidireccional mente desde el backend local.

## 2. Decisiones Arquitectónicas Clave (ADR)
- **Operación sin internet y Despliegue Local (ADR-0003):** Todo el núcleo de caja y stock se ejecuta localmente mediante Docker Compose en PC local según sección 3.5 de la Guía de cátedra. La pérdida de conectividad externa no interrumpe las ventas ni el arqueo de caja.
- **Mitigación para 8 GB de RAM:** Se evita ejecutar Ollama local (se consume Gemini API externa para no saturar memoria), se fija el motor WiredTiger de MongoDB en 256 MB (`--wiredTigerCacheSizeGB 0.25`) y se definen límites cgroups en `docker-compose.yml` (`postgres`: 512 MB, `mongodb`: 512 MB, `django`: 512 MB, `node`: 384 MB, `ai-service`: 256 MB, `web`: 128 MB).
- **Cliente de escritorio vía PWA:** Se descarta aplicación nativa/Electron por restricción de hardware (~8 GB de RAM) y sobrecosto de mantenimiento. Se adopta PWA para ofrecer experiencia de escritorio sin consumo excesivo de memoria.
- **Lector de código de barras:** Integración directa por emulación de teclado (HID) asociada al campo `codigo_barras` en productos.
- **Autenticación Asimétrica RS256 (ADR-0001):** Django es el único emisor y custodio de la clave privada RSA. Node valida tokens en memoria de forma autónoma con la clave pública y reenvía el token del usuario a Django en acciones de confirmación humana (`confirmar-importacion`).
- **Patrón Adapter para Proveedor de IA (ADR-0002):** `ai-service` desacopla el modelo mediante la interfaz `ProveedorIA` (`GeminiAdapter` y `OllamaAdapter`), validando toda salida con Pydantic v2 y aislando los datos del usuario respecto de las instrucciones versionadas (`prompts/v1/`).
- **Observabilidad y Trazabilidad Distribuida (TP 4):** Inyección y propagación de `X-Request-ID` / Correlation ID en las peticiones a través de middlewares en Django, Node y FastAPI; logs estructurados en formato JSON sanitizado y healthchecks de liveness y readiness profunda (`/health/profundo`).

## 3. Puntos Críticos de Ruptura
- Modelos de Insumo, Producto (`codigo_barras`), Receta y PerfilUsuario en Django.
- Regla de supervivencia del último Dueño activo (protección contra bloqueo total del sistema).
- Contrato de confirmación de compras y desglose de recálculo entre `backend-node` (`src/clients/django.client.js`) y `backend-django` (`POST /api/compras/confirmar-importacion/`).
- Sincronización unidireccional de `menu_digital` hacia la nube.
- Formato único de error en API (definido en docs/api-errores.md).
- Esquemas tipados de salida de IA (`SalidaIAExtraccionPrecios` y `SalidaIAResumenSemanal` en `ai-service`).
- Orquestación y dependencia condicional de salud en Docker Compose (`depends_on: { service: { condition: service_healthy } }`).
