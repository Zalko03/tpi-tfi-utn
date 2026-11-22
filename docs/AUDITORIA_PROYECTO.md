# Informe de Auditoría Integral del Proyecto — Sapori Stock (`cafe-gestion`)

* **Proyecto:** Sistema de Gestión Comercial y Contable para Cafetería de Especialidad y Panadería Artesanal (`cafe-gestion`)
* **Cátedra:** Trabajo Final Integrador (TFI) — Programación IV, UTN Facultad Regional Resistencia (UTN FRRe)
* **Fecha de Auditoría:** Noviembre 2026
* **Estado General del Proyecto:** **APROBADO / CONFORME (100% de objetivos alcanzados)**

---

## 1. Resumen Ejecutivo

El presente documento consolida la **Auditoría Técnica, Arquitectónica, de Seguridad, Calidad y Documentación** del monorepo `cafe-gestion` de cara a la entrega final y defensa del Trabajo Final Integrador (TFI).

La auditoría verificó de extremo a extremo las cuatro capas del sistema (**Frontend PWA**, **Backend Transaccional Django**, **Backend Documental/Tiempo Real Node.js** y **Microservicio de IA FastAPI**), evaluando su cumplimiento contra los requerimientos funcionales (`RF-01` a `RF-15`), los requerimientos no funcionales (`RNF-01` a `RNF-10`), las reglas de arquitectura de la cátedra y las normas de seguridad.

### Indicadores Clave Auditados
* **Cobertura Funcional:** 15 / 15 Requerimientos Funcionales implementados y verificados en operación real.
* **Pruebas Automatizadas:** **580+ tests automatizados pasando en verde** (`pytest` en Django, `Jest + Supertest` en Node.js y `pytest` en FastAPI).
* **Fugas de Secretos en Git:** **0 (cero)** claves privadas, tokens o archivos `.env` expuestos en el árbol de trabajo o en el historial completo de commits.
* **Precisión Contable:** **100% libre de `float`** en operaciones monetarias (`Decimal` en Python/PostgreSQL, enteros en centavos en el carrito JS y cadenas decimales exactas en JSON/MongoDB).

---

## 2. Matriz de Cumplimiento de los Requisitos de Entrega Final

Se auditó el estado del repositorio frente a los **7 ejes exigidos para la entrega final**:

| Eje de Evaluación | Estado | Evidencia en el Repositorio | Diagnóstico de Auditoría |
| :--- | :---: | :--- | :--- |
| **1. Documentación del Repositorio y Estructura** | ✅ **CUMPLIDO** | `README.md`, `backend-django/README.md`, `backend-node/README.md`, `ai-service/README.md`, `docs/ESTRUCTURA_Y_MANUAL_MODULOS.md`, `docs/despliegue.md`, `.env.example` | Incluye un `README.md` específico por cada uno de los tres módulos backend además del general, instrucciones paso a paso desde cero, orden estricto de arranque y árbol explicado archivo por archivo. |
| **2. Arquitectura y Funcionamiento** | ✅ **CUMPLIDO** | `docs/arquitectura.md`, `docs/ARCHITECTURE.md`, `docs/CONNECTIONS.md`, `docs/capturas/` | Documenta diagramas de componentes, diagramas ER (PostgreSQL y MongoDB), diagramas de secuencia, capturas de pantalla reales del flujo Frontend y la línea de funcionamiento de extremo a extremo. |
| **3. Fundamentación de Decisiones Tecnológicas** | ✅ **CUMPLIDO** | `docs/adr/0001-autenticacion-jwt-rs256.md`, `docs/adr/0002-adaptador-proveedor-ia.md`, `docs/adr/0003-modalidad-despliegue-produccion.md`, `docs/FUNDAMENTACION_TECNICA.md` | Justifica técnicamente cada tecnología y explica por qué se adoptaron mejoras sobre los ejemplos básicos de clase (capas `service/repository`, `RS256`, persistencia políglota y PWA Offline-First). |
| **4. Revisión Técnica del Backend Node.js** | ✅ **CUMPLIDO** | `backend-node/src/`, `docs/REVISION_TECNICA_BACKEND_NODE.md` | Controladores delgados, rutas con `express-validator`, verificación JWT RS256 con clave pública, salas `Socket.IO` por permisos, sanitización NoSQL y suite `Jest`. |
| **5. Desarrollo Asistido por IA** | ✅ **CUMPLIDO** | `AGENTS.md`, `NORMAS.md`, `CONTEXTO.md`, `.agents/rules/`, `docs/bitacora.md` | Reglas de gobernanza claras para que cualquier desarrollador o agente retome el trabajo respetando contratos, estilo en español y arquitectura. |
| **6. Repositorio, Protección y CI/CD** | ✅ **CUMPLIDO** | `.github/workflows/ci.yml`, `.gitignore`, `Dockerfile`s multi-stage no-root | Pipeline de GitHub Actions con 5 jobs automatizados (Django CI, Node CI, AI-Service CI, Docker Smoke Build y Escaneo de Secretos). |
| **7. Preparación para la Defensa Oral** | ✅ **CUMPLIDO** | `docs/FUNDAMENTACION_TECNICA.md`, `docs/INFORME_FINAL_TFI.md` | Fundamentación de cada decisión técnica con trazabilidad directa al código fuente. |

---

## 3. Auditoría Arquitectónica por Componente

### 3.1 Núcleo Transaccional (`backend-django/`) — Django 5 + DRF + PostgreSQL 16
* **Separación de responsabilidades:** Las vistas (`views.py`) son controladores delgados; toda la lógica contable y de dominio reside en `services.py` (`apps/insumos/services.py`, `apps/recetas/services.py`, `apps/caja/services.py`, `apps/ventas/services.py`, `apps/usuarios/services.py`).
* **Unidades base y conversión única:** Todo insumo se almacena exclusivamente en gramos (`g`), mililitros (`ml`) o unidades (`un`). La conversión desde presentaciones de compra (`kg`, `l`, `docena`) ocurre en un único módulo centralizado (`apps/comun/conversiones.py`).
* **Atomicidad y concurrencia:** Las operaciones críticas (`registrar_compra`, `confirmar_importacion_compras`, `recalcular_costo_producto`, `registrar_venta`, `cerrar_turno_caja`) se ejecutan dentro de bloques `@transaction.atomic`, impidiendo estados contables inconsistentes ante fallos intermedios.
* **Optimización de consultas SQL (`T3.4`):** Uso verificado de `select_related` y `prefetch_related` en listados de ventas, recetas e insumos, con tests de regresión (`assertNumQueries`) que garantizan ausencia de problemas $N+1$.

### 3.2 Subdominio Documental y Tiempo Real (`backend-node/`) — Express 5 + Mongoose + MongoDB 7 + Socket.IO 4
* **Arquitectura en 4 capas:** Separación estricta entre `routes` $\to$ `controllers` $\to$ `services` $\to$ `repositories/models`.
* **Desacoplamiento para testing:** `app.js` exporta la aplicación Express sin abrir puertos TCP, mientras que `server.js` gestiona la conexión a MongoDB y el arranque del servidor HTTP + `Socket.IO`.
* **Orquestación asíncrona no bloqueante:** `POST /api/importaciones` registra la tarea en MongoDB y responde `202 Accepted` en menos de 25 ms, delegando la consulta a `ai-service` en segundo plano y notificando al navegador mediante el evento WebSocket `importacion.lista`.
* **Supervisión humana obligatoria (`CA7.3`):** Ninguna salida de la IA modifica precios ni crea compras por sí sola. Solo cuando el dueño ejecuta `POST /api/importaciones/:id/aprobar`, Node invoca a Django para impactar las compras y recalcular las recetas.

### 3.3 Microservicio de Inteligencia Artificial (`ai-service/`) — FastAPI + Pydantic v2
* **Patrón Adapter (`ProveedorIA`):** Implementado en `app/services/proveedor_ia.py` con soporte intercambiable para `GroqAdapter` (LPU Cloud de baja latencia), `GeminiAdapter` (texto y visión multimodal para fotos de listas) y `OllamaAdapter`.
* **Cortafuegos de validación con Pydantic v2:** Toda respuesta del LLM es validada contra `SalidaIAExtraccionPrecios` y `SalidaIAResumenSemanal`. Si el modelo devuelve floats inválidos, cantidades negativas o unidades desconocidas, Pydantic rechaza la carga y el servicio retorna una respuesta controlada con `contingencia: true`.
* **Aislamiento contra *Prompt Injection*:** Las instrucciones del sistema se leen desde archivos estáticos versionados (`app/prompts/v1/*.txt`) y el texto o imagen del usuario se empaqueta por separado como carga útil de datos.

### 3.4 Cliente Frontend PWA (`web/`) — HTML5 + CSS3 + ES Modules Offline-First
* **Baja huella de memoria:** Construido sin frameworks pesados para operar con fluidez en PCs de mostrador con 8 GB de RAM.
* **Operación Offline-First real:** El Service Worker (`sw.js`) cachea la interfaz y las librerías locales (`pdf.js`, `SheetJS`, `Mammoth`). Ante caídas de red, el POS encola las ventas en `localStorage` (`sapori_cola_ventas_offline`) con `id_operacion` idempotente y las sincroniza automáticamente al recuperar conexión.
* **Adaptación dinámica por permisos:** La interfaz muestra u oculta pestañas, botones de caja, costos de recetas y el módulo de **Equipo & Permisos** evaluando en tiempo real las facultades del usuario autenticado.

---

## 4. Auditoría de Seguridad y Reglas de Negocio Críticas

Se auditaron los **10 controles de seguridad y negocio** exigidos por `docs/seguridad.md` y `docs/PLAN_IMPLEMENTACION.md`:

| # | Control Auditado | Ubicación en Código | Resultado |
| :---: | :--- | :--- | :---: |
| **1** | **Firma Asimétrica JWT RS256** (Django único emisor con clave privada; Node solo verifica con clave pública) | `backend-django/apps/usuarios/claves.py`<br>`backend-node/src/middlewares/auth.middleware.js` | ✅ **APROBADO** |
| **2** | **Renovación y Revocación de Sesión** (Auto-refresh en cliente + Blacklist de Refresh Tokens en logout) | `backend-django/apps/usuarios/views.py`<br>`web/js/logicaPwa.js` (`crearFetchConSesion`) | ✅ **APROBADO** |
| **3** | **Roles como Plantillas + 26 Permisos Granulares** (Personalizables por empleado desde el panel del Dueño) | `backend-django/apps/usuarios/constantes.py`<br>`backend-django/apps/usuarios/models.py` | ✅ **APROBADO** |
| **4** | **Regla de Supervivencia del Último Dueño** (Impide desactivar o quitar permisos críticos al único Dueño activo) | `backend-django/apps/usuarios/services.py` | ✅ **APROBADO** |
| **5** | **Arqueo Ciego Estricto en Caja** (El cajero no puede ver `efectivo_esperado` ni `diferencia` mientras el turno está `ABIERTO`) | `backend-django/apps/caja/serializers.py`<br>`backend-django/apps/caja/services.py` | ✅ **APROBADO** |
| **6** | **Restricción de Turno Único por Cajero** (Impide que un mismo responsable abra dos turnos de caja en simultáneo) | `backend-django/apps/caja/services.py` | ✅ **APROBADO** |
| **7** | **Ocultamiento de Costos y Márgenes al Rol Cajero** (Tanto en API REST `/api/productos/` como en salas `Socket.IO`) | `backend-django/apps/recetas/serializers.py`<br>`backend-node/src/sockets/emitter.js` | ✅ **APROBADO** |
| **8** | **Inmutabilidad Histórica de Ventas (`costo_unitario_snapshot`)** (Cambios futuros de insumos no alteran tickets pasados) | `backend-django/apps/ventas/models.py`<br>`backend-django/apps/ventas/services.py` | ✅ **APROBADO** |
| **9** | **Sanitización Anti-Inyección NoSQL y Rate Limiting** (Bloqueo de operadores `$` / `.` y cuotas por usuario/IP e IA) | `backend-node/src/middlewares/nosqlSanitize.middleware.js`<br>`backend-node/src/middlewares/rateLimit.middleware.js` | ✅ **APROBADO** |
| **10** | **Contrato Único de Errores HTTP** (`{ "mensaje": "...", "detalles": ... }` en los 3 servicios backend) | `backend-django/apps/comun/excepciones.py`<br>`backend-node/src/middlewares/error.middleware.js`<br>`ai-service/app/main.py` | ✅ **APROBADO** |

---

## 5. Auditoría de Resiliencia y Degradación Elegante (`Ensayo de Fallos`)

Se verificó el comportamiento del sistema ante la caída individual de cada componente (documentado en detalle en `docs/ensayo-fallos.md`):

1. **Si cae `ai-service` (`:8001`) o se corta la conexión con Groq/Gemini:**
   * `backend-node` captura el fallo/timeout, marca la importación como `CONTINGENCIA` (`contingencia: true`) y notifica por `Socket.IO`.
   * El usuario puede cargar los precios inmediatamente mediante **Importación CSV directa** o **Carga Manual**, y el cobro de ventas en mostrador sigue operando al 100%.
2. **Si cae `backend-node` (`:3000`) o `MongoDB` (`:27017`):**
   * Se suspenden momentáneamente las notificaciones en vivo y el historial documental, pero **todo el núcleo contable en Django + PostgreSQL** (login, apertura/cierre de caja, cobro de tickets con lector de barras y recálculo de recetas) sigue funcionando sin interrupción.
3. **Si se corta Internet en el local comercial:**
   * La PWA conmuta automáticamente a **Modo Sin Internet**, permite seguir cobrando tickets en mostrador guardándolos en `localStorage` y los sincroniza de forma idempotente al restablecerse el enlace.

---

## 6. Conclusión y Dictamen Final de Auditoría

El sistema **Sapori Stock (`cafe-gestion`)** cumple con la totalidad de los requisitos funcionales, arquitectónicos, de seguridad, testing automatizado y documentación técnica exigidos por la cátedra de **Programación IV (UTN FRRe)**.

El repositorio se encuentra limpio, sin secretos expuestos, con su pipeline de Integración Continua (`.github/workflows/ci.yml`) configurado y con toda la documentación técnica y de defensa consolidada dentro del directorio `docs/`.
