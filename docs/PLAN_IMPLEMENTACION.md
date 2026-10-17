# Plan de implementación — Sistema de gestión para cafetería

> Proyecto: reemplazar el Excel manual del dueño por un sistema que costea recetas, controla caja/ventas y calcula rentabilidad.
> Se construye **a la vez** como TFI de Programación IV (UTN FRRe), por lo que la arquitectura y los hitos siguen la Guía del TP.
> Nombre de trabajo del repo: `cafe-gestion` (neutral; no uses el nombre real del local si el repo es público).

---

## 0. Supuestos (corregir si algo es falso)

1. El TP 0 todavía no está cerrado o hay margen para ajustarlo. **El tema debe ser aprobado por ambos docentes.**
2. **POS actual (Abarrotes):** la intención es reemplazarlo, pero el dueño no lo habló y puede preferir conservarlo. Por eso el **valor central del MVP es el costeo** (insumos → recetas → costos/márgenes → historial), que no depende del POS. Ventas y caja se construyen igual (la Guía necesita un núcleo transaccional), pero `Venta` lleva un campo `origen` (`propio` / `importado`) para poder cargar ventas desde un export del POS si el dueño decide quedarse con él. Hay que preguntarle al dueño si el POS exporta ventas (CSV/Excel).
2b. **IVA:** según la entrevista, algunos proveedores trabajan con IVA y otros no; la categoría fiscal del dueño no se mencionó y la facturación no es necesaria por ahora. Se modela por compra (`iva_incluido`, `alicuota`) y con un parámetro global `costear_con_iva` (por defecto **sí**: el costo es lo que realmente se paga). No se asume nada sobre responsable inscripto.
2c. **IA diferida:** no se toca hasta el TP 3. Se usará una **interfaz de proveedor de IA** en `ai-service` (adapter): soporta proveedor externo (Gemini API, modelos baratos en tokens) y Ollama. **Los docentes confirmaron que se puede usar el proveedor de IA que prefiramos (incluido Gemini) y que el frontend es de libre elección; dejarlo registrado en un ADR.** Para no saturar el equipo del comercio, **no se correrá Ollama local** en la PC del dueño (se consumirá Gemini API con degradación a carga manual/CSV si no hay internet). La clave va solo en `.env` y nunca se envían datos identificables del local.
2d. **Hardware del dueño (~8 GB de RAM) y modalidad de despliegue:** se confirma la modalidad **PC Local con Docker Compose** (respaldada por la **sección 3.5 de la Guía** de cátedra) para asegurar alta disponibilidad en el local ante cortes de internet. Para operar de forma estable dentro de los **8 GB de RAM** del equipo se aplican tres medidas de mitigación: (1) **no correr Ollama local** (uso de proveedor de IA externo vía adapter), (2) **limitar la memoria de MongoDB** en Docker Compose (acotando el caché de WiredTiger y el límite de RAM del contenedor), y (3) descartar clientes pesados en Electron a favor de una PWA. Ver T4.4.
3. Equipo de 2 personas (A = línea Python / miércoles, B = línea JavaScript / jueves). La guía exige 2 o 3.
4. Se usa Antigravity como asistente: **hay que declararlo en el README** y cada integrante debe poder explicar cualquier línea en la defensa.
5. **Frontend y operación en caja:** confirmado con los docentes que el frontend es de libre elección. Se adopta una **PWA instalable** en el escritorio para la caja y gestión sobre la red local (LAN) junto con Django Admin como back-office, garantizando experiencia de aplicación de escritorio y operación continua sin internet sin el consumo de memoria de Electron. Además, se contempla una **Carta Digital pública por QR** (Should) de solo lectura en la nube con sincronización unidireccional.

---

## 1. Lo que muestra el Excel del dueño (qué copiar y qué evitar)

**Estructura actual (hojas):** tabla de precios · Costeo (recetas) · Costos bolsas de café · Precios · Stock · proveedores · competencia · costeo ferias.

**Lógica que ya funciona y hay que replicar**
- Receta = insumos con cantidad y unidad (café 0.060 kg, leche 0.290 l, hielo, azúcar en sobres) + **mano de obra** (minutos × $2.500/hora ÷ 60) + **descartables**.
- `ganancia = precio_venta − costo_total`; `margen_bruto = ganancia / precio_venta` (verificado: $2.500 con costo $1.092,79 → 56 %).
- Precio por pack/kilo/litro → costo unitario. Café en bolsas de 125/250/500 g y a granel por kg.
- Stock valorizado (kg × precio/kg → "total invertido").
- Competencia: precio de cada local, **promedio** y **mínimo** por producto (columnas "PvP Prom" y "PvP Min").
- Precio sugerido de proveedor = costo × 1,25 (ej. 1670 → 2087,5).
- Costos incluyen IVA discriminado (ej. $47.795 con $8.295 de IVA = 17,36 %).

**Fallas del Excel que el sistema debe resolver**
- `#REF!`, `#DIV/0!`, `#VALOR!` en costos y márgenes. Según el dueño, **tocó algo de la hoja y se rompieron los resultados**: las fórmulas dependen de celdas y hojas enlazadas a mano, y un cambio accidental se propaga sin aviso. El sistema debe evitarlo: costos y márgenes calculados por código (no editables a mano), validación de datos al cargar (no permitir cantidades vacías ni divisiones por cero), historial de cambios para ver quién modificó qué y poder revertir, y datos de entrada separados de los resultados calculados.
- Márgenes absurdos (−700 %, −2900 %, −2150 %): según el dueño, **hizo un re-stock** y cargó en la celda de costo el total de la compra (ej. chipa: costo 8000 = lo pagado por todo el lote, precio 1000 = una unidad). La hoja comparó el costo del lote completo con el precio de una sola unidad. → El sistema separa **compra** (monto total pagado + cantidad + unidad) de **costo unitario** (calculado = total ÷ cantidad), de modo que un re-stock es un evento normal y nunca distorsiona los márgenes.
- Precios duplicados en varias hojas, actualizados a mano.
- Productos sin categoría o sin costo cargado.
- Envío no prorrateado (ej. proveedor de café con "envío $25.000").
- Datos personales (teléfonos de proveedores) mezclados con la hoja de costos.

> **Regla de datos:** no se versiona el Excel real ni teléfonos de proveedores. `docs/dominio/seed/` usa datos **anonimizados/inventados** con el mismo formato.

---

## 2. Dominio y mapa tecnológico (TP 0)

Criterio de la guía: *"¿qué se rompe si la saco?"*

| Pieza | Responsabilidad en el sistema | Qué se rompe si se saca |
|---|---|---|
| **Django 5 + DRF + PostgreSQL 16** | Núcleo transaccional: usuarios y roles, proveedores, insumos, compras/presentaciones, productos, recetas, ventas, turnos de caja, costos fijos, metas. Cálculo de costos y márgenes. | Todo: es la fuente de verdad contable (necesita ACID y relaciones). |
| **Express + Mongoose + MongoDB 7** | Subdominio documental: `historial_precios` (cada cambio de costo, alto volumen, append-only), `snapshots_costeo` (desglose de una receta en el tiempo, estructura variable), `importaciones_ia` (entrada/salida/latencia/versión de prompt), `menu_digital` (carta flexible, Could). | El historial y los snapshots no tienen forma fija ni requieren joins: en SQL serían tablas ruidosas. |
| **FastAPI + Pydantic v2 + Ollama** | IA con propósito: (1) **extraer precios** desde texto de lista de proveedor (pegado de WhatsApp/PDF) a JSON tipado; (2) **resumen semanal** del rendimiento del menú con sugerencias de rotación. | Se vuelve a cargar a mano cada lista de precios (el dolor principal del dueño). |
| **Socket.IO (en Node)** | Tablero en vivo: ventas del día, ganancia acumulada, alertas de stock mínimo, aviso de "costo actualizado / margen bajo", importación lista. Salas por local y por turno de caja, autenticado con el JWT. | Se pierde el tablero en vivo y los avisos de caja. |

**Flujo de integración (el "flujo de punta a punta" que pide el TP 3)**
1. El dueño pega una lista de proveedor → `POST` a **Node** (responde 202, no bloquea).
2. Node llama a **FastAPI/Ollama**, valida con Pydantic, guarda entrada/salida/latencia/versión de prompt en **Mongo**.
3. Node emite por **Socket.IO**: "importación lista, revisá los cambios".
4. El dueño aprueba (humano en el circuito) → Node llama a **Django** → crea compra/precio nuevo.
5. Django **recalcula costos de todas las recetas** que usan ese insumo y avisa a Node → se guarda `historial_precios` + `snapshot` y se emite alerta si algún margen cae bajo el objetivo.

**Degradación documentada:** si Ollama cae → carga manual/CSV; si Node cae → Django sigue vendiendo, sin historial en vivo; si Mongo cae → se pierde historial temporalmente, no las ventas.

---

## 3. Reglas de negocio (fuente: lo dicho por el dueño + Excel)

- **Costo unitario de insumo** = (precio_pack ± IVA según configuración + envío prorrateado) ÷ (cantidad_pack convertida a unidad base: g, ml o un).
- **Prorrateo de envío** = envío ÷ total de unidades base de la compra, repartido proporcional al valor de cada línea.
- **Costo de producto** = Σ(cantidad × costo_unitario) + minutos × (costo_hora ÷ 60) + descartables. Se recalcula al cambiar cualquier insumo.
- **Margen bruto** = (precio − costo) ÷ precio. **Ganancia** = precio − costo. (El Excel la llama "ganancia neta": renombrar a *ganancia bruta* para no confundir con la neta tras costos fijos.)
- **Precio sugerido** = redondeo( costo ÷ (1 − margen_objetivo) ), acotado por el promedio/mínimo de competencia; redondeo a múltiplos de $50 o $100 configurable.
- **Punto de equilibrio** (corrección sobre lo que resumió Gemini: no se "suman" costos fijos y variables):
  `PE ($) = costos_fijos ÷ (1 − costos_variables ÷ ventas)`; es decir, costos fijos ÷ margen de contribución %.
  **Meta diaria** = PE mensual ÷ días operativos; **meta semanal** = meta diaria × días de la semana.
- **Ganancia diaria** = Σ(precio − costo vigente al momento de la venta) de los tickets. El costo se **congela en cada venta** (`VentaItem.costo_unitario_snapshot`) para que un cambio de precio no reescriba el pasado.
- **Caja**: efectivo esperado = apertura + ventas en efectivo + entradas − salidas; diferencia = contado − esperado. Las transferencias se registran aparte.

### Roles (matriz preliminar → `docs/seguridad.md` antes de codificar el TP 2)

Inspirada en los permisos del POS actual (Ventas / Productos / Inventario / Clientes / Otros), donde el dueño da de alta cajeros y tilda sus permisos.

**El dueño crea personal nuevo y define sus permisos.** Los roles (Dueño / Encargado / Cajero) funcionan como **plantillas**: al crear un usuario, el dueño elige un rol, que precarga los permisos de la tabla, y luego puede **tildar o destildar permisos individuales** para esa persona (por ejemplo, un cajero que además pueda registrar entradas de efectivo).
- Los permisos son granulares (`cobrar_ticket`, `anular_ticket`, `abrir_cerrar_caja`, `ver_costos`, `gestionar_insumos`, etc.) y se guardan por usuario.
- Solo el **Dueño** crea, edita, desactiva usuarios y cambia permisos. Nadie puede otorgar permisos que no tiene, y no se puede desactivar o degradar al último Dueño.
- Los usuarios se **desactivan**, no se borran (borrado lógico), para conservar el historial de ventas y turnos.
- Cada cambio de permisos queda en un registro de auditoría. Como el token de acceso dura pocos minutos, el cambio rige a partir del siguiente refresco.

| Permiso | Dueño | Encargado | Cajero |
|---|---|---|---|
| Cobrar ticket, ver historial propio | ✔ | ✔ | ✔ |
| Aplicar descuentos / anular ticket | ✔ | ✔ | ✖ |
| Abrir/cerrar caja, ver diferencia | ✔ | ✔ | solo su turno (sin ver esperado) |
| Registrar entradas/salidas de efectivo | ✔ | ✔ | ✖ |
| CRUD insumos, compras, recetas | ✔ | ✔ (sin borrar) | ✖ |
| Ver costos y márgenes | ✔ | ✔ | ✖ |
| Importar listas con IA / aprobar precios | ✔ | ✖ | ✖ |
| Ganancia del día, PE, metas, reportes | ✔ | ✖ | ✖ |
| Crear personal, asignar rol y ajustar permisos individuales | ✔ | ✖ | ✖ |

---

## 4. Estructura del repositorio

```
cafe-gestion/
├── AGENTS.md                  # reglas para Antigravity (ver §7)
├── .agents/
│   ├── rules/                 # reglas por tema (≤12.000 caracteres c/u)
│   │   ├── convenciones-node.md     # estilo del proyecto de referencia de la cátedra
│   │   └── convenciones-python.md   # equivalente para Django/FastAPI (propuesta)
│   └── workflows/             # /tarea, /cierre-clase
├── backend-django/            # Django 5 + DRF (PostgreSQL)
├── backend-node/              # Express + Mongoose + Socket.IO (+ GraphQL en TP4)
├── ai-service/                # FastAPI + Ollama (se crea en TP3)
├── web/                       # cliente mínimo de demostración (TP3)
├── infra/                     # docker-compose, scripts (TP4)
├── docs/
│   ├── PROPUESTA.md
│   ├── arquitectura.md        # mapa tecnológico + diagramas Mermaid
│   ├── adr/                   # ADR-001-... (contexto, decisión, alternativas, consecuencias)
│   ├── dominio/               # análisis del Excel + seed anonimizado
│   ├── integracion.md  seguridad.md  optimizacion.md
│   └── bitacora.md            # qué hizo la IA, por tarea (para README y defensa)
├── .env.example               # nunca valores reales
└── README.md                  # puesta en marcha + declaración de uso de IA
```

---

## 5. Flujo de trabajo Git y con el agente

La guía manda: **sin push directo a `main`, todo por pull request con al menos una revisión**, commits de todos los integrantes, cero secretos (ni en el historial).

- **Una tarea = una rama = 2 a 5 commits = un PR** (tareas de 1–2 horas). Rama: `feature/T1.3-recetas-costeo`.
- **Conventional Commits:** `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`. Mensaje en español, imperativo, una idea por commit.
- El agente **commitea en su rama y se detiene**; **nunca** hace push a `main` ni mergea. El humano revisa el diff, empuja y abre el PR; **el otro integrante lo revisa** (así ambos conocen todo el código, que es lo que se evalúa en la defensa).
- Proteger `main` en GitHub (Settings → Branches): requiere PR + 1 aprobación + CI verde (desde TP4).
- Roles rotativos registrados en el tablero: *responsable de repositorio* y *responsable de integración* (en TP 3 deben ser personas distintas).
- Reparto: **A** = Django + FastAPI (miércoles). **B** = Node + Mongo + Socket.IO (jueves). Cada uno revisa los PR del otro. Los TP 0, 3 y TFI se corrigen en conjunto.
- **Ritmo por clase:** al empezar cada clase se eligen del backlog las tareas de esa semana; al terminar se hace `/cierre-clase` (actualiza `bitacora.md`, README y el tablero) y el push de lo nuevo.
- **Secretos:** `.env` en `.gitignore` desde el primer commit; el agente solo escribe `.env.example`. Si se filtra algo, rotar la credencial (borrar el archivo no limpia el historial).
- **Datos del local:** nada real (precios, teléfonos, nombres) en el repo.

---

## 6. Plan por entrega (cada ítem = una tarea para el agente)

Fechas tomadas de la guía (verificar el calendario vigente). *Def. de hecho (DoD) de toda tarea:* tests relevantes en verde, README/docs actualizados, sin secretos, commit(s) en rama, resumen en `docs/bitacora.md`.

### TP 0 — Propuesta y repositorio (Unidad 1 · clases 1–5 · 10 %)
- **T0.1** Monorepo (`backend-django`, `backend-node`, `docs`), `.gitignore`, `.env.example`, README base.
- **T0.2** `docs/PROPUESTA.md`: problema y usuarios (≤1 pág.), historias MoSCoW, **fuera de alcance**, modelo de dominio (Mermaid), 3 riesgos con mitigación.
- **T0.3** `docs/arquitectura.md`: mapa tecnológico (§2) con justificación de 1–2 líneas por pieza.
- **T0.4** Entornos reproducibles: Django 5 con endpoint `/health`, `requirements.txt`; Express con `/health`, `package.json`. Verificación cruzada: el otro clona limpio y sigue el README.
- **T0.5** `docs/git-flow.md`, plantilla de PR, tablero con las historias cargadas *(humano)*, protección de `main` *(humano)*.
- **T0.6** `docs/dominio/excel-analisis.md` (resumen de §1) + seed anonimizado.

**Historias priorizadas (propuesta para el TP 0)**

| # | Historia | MoSCoW |
|---|---|---|
| HU1 | Como dueño cargo insumos con presentación (pack, cantidad, unidad, precio, IVA, envío) y obtengo el costo unitario | Must |
| HU2 | Como dueño armo recetas y veo el costo y margen de cada producto | Must |
| HU3 | Al cambiar el precio de un insumo se recalculan todas las recetas y queda historial | Must |
| HU4 | Como cajero registro una venta de productos (incluyendo búsqueda o lectura por `codigo_barras`) con medio de pago | Must |
| HU5 | Como encargado abro y cierro caja y veo la diferencia | Must |
| HU6 | Como dueño creo una cuenta para cada integrante del personal (nombre completo, usuario y clave inicial), le asigno un rol y ajusto sus permisos (dueño/encargado/cajero como plantillas) | Must |
| HU7 | Como dueño pego una lista de proveedor y la IA propone los precios a actualizar | Must (mínimo viable, exigido por la arquitectura) |
| HU8 | Tablero en vivo de ventas/ganancia/alertas | Must (mínimo viable) |
| HU9 | Precio sugerido con margen objetivo y competencia | Should |
| HU10 | Ranking de productos más/menos vendidos y ganancia diaria | Should |
| HU11 | Punto de equilibrio y metas diaria/semanal | Should |
| HU12 | Stock de insumos descontado por receta + alertas de mínimo | Should |
| HU14 | Como dueño indico mi condición fiscal y el sistema calcula el costo con o sin IVA según corresponda | Should |
| HU15 | Carta Digital pública por QR (separada de HU13, sincronización unidireccional) | Should |
| HU13 | Resumen semanal con IA | Could |
| — | Facturación fiscal, multi-sucursal, pagos online, app de escritorio nativa en Electron, sincronización bidireccional compleja, importar del POS Abarrotes | **Fuera de alcance** (la arquitectura no lo bloquea) |

### TP 1 — Núcleo de datos y APIs CRUD (Unidad 2 · clases 5–12 · 20 %)
**Django + DRF + PostgreSQL**
- **T1.1** Modelos `Proveedor`, `Insumo` (unidad base), `Compra`/`Presentacion`; migraciones.
- **T1.2** Servicio de conversión de unidades y **costo unitario con prorrateo de envío** (lógica fuera de la vista) + tests con casos del Excel (re-stock: compra de un lote completo vs. precio de una unidad; el costo unitario debe salir de dividir el total por la cantidad).
- **T1.3** `Producto`, `RecetaItem` (relación muchos-a-muchos con `through`), servicio de costeo + mano de obra/descartables + tests.
- **T1.4** ViewSets y Routers; paginación; filtro por 3 campos; ordenamiento; validaciones de negocio en Serializers.
- **T1.5** Exception handler propio (**formato de error único definido primero** en `docs/api-errores.md`).
- **T1.6** `Venta` (con campo `origen`), `VentaItem` (con snapshot de costo), `TurnoCaja`, `MovimientoCaja` + endpoints básicos. *Se hace después de T1.1–T1.5 y T1.8: el costeo es lo prioritario.*
- **T1.7** Comando `seed_demo` con datos anonimizados.
- **T1.8** Propagación: al guardar una compra se recalcula el costo de las recetas afectadas (servicio, no signal oculto).

**Express + Mongoose + MongoDB**
- **T1.9** Colecciones `historial_precios` y `snapshots_costeo` (esquemas, índices, validaciones), capas controlador → servicio → repositorio.
- **T1.10** Middleware de errores (mismo formato) y logging; paginación y búsqueda por texto; `.env`.
- **T1.11** **Integración:** endpoint de Node que consume Django (ej. costo actual de un producto + su historial) con timeout, manejo de fallo y respuesta degradada → `docs/integracion.md`.

**Verificación**
- **T1.12** Colección de peticiones versionada (`.http` o Postman), 4 tests por servicio (pytest / Jest) sobre reglas de negocio.
- **T1.13** Verificación en clon limpio; ajustar README.

### TP 2 — Autenticación y seguridad (Unidad 3 · clases 13–16 · 15 %)
- **T2.1** `docs/seguridad.md` con matriz de roles (§3) **antes de codificar**; ADR del esquema de claves JWT (recomendado: **RS256**: solo Django tiene la clave privada; Node valida con la pública).
- **T2.2** Django: registro/login/refresh con SimpleJWT, acceso corto (≈5–15 min) y refresh largo, blacklist en logout, claims `rol` y `sub`; **un solo emisor de tokens**.
- **T2.3** Roles propios del dominio como plantillas, **permisos granulares por usuario**, permisos DRF personalizados y **autorización a nivel de objeto** (cajero solo ve su turno/ventas). Incluye el CRUD de personal (solo Dueño): alta con rol + ajuste de permisos, desactivación, protección del último Dueño y auditoría de cambios. Los permisos viajan en el JWT (claim `permisos`) para que Node los valide.
- **T2.4** Express: middleware de validación del JWT emitido por Django + autorización por rol.
- **T2.5** Endurecimiento: CORS por origen (sin comodín), rate limiting en login y en un endpoint costoso, `helmet`, validación (zod/express-validator), sanitización NoSQL, logs de seguridad sin datos sensibles.
- **T2.6** Un test **negativo** por cada permiso (verifica el rechazo).
- **T2.7** Revisión de secretos (incluido historial) y preparación de la auditoría cruzada (informe de 1 página + plan de remediación).

### TP 3 — IA, poliglota y tiempo real (Unidad 4 · clases 19–24 · 25 %)
- **T3.1** `ai-service` FastAPI: `POST /v1/extraer-precios` y `POST /v1/resumen-semanal`; esquemas Pydantic v2; **prompts versionados** (`prompts/v1/`); timeout, reintentos acotados, respuesta de contingencia; OpenAPI con ejemplos. Adapter con proveedor externo (Gemini API) y soporte opcional de Ollama.
- **T3.2** Node consume la IA: `POST /importaciones` (202, asíncrono), valida salida, guarda entrada/salida/latencia/versión de prompt en Mongo.
- **T3.3** Aprobación humana → Node llama a Django → compra nueva → recálculo de costos (flujo del §2).
- **T3.4** PostgreSQL: corregir **3 consultas problemáticas** (listado de productos con costo = N+1 con `prefetch_related`; reporte de ventas por producto con índice por fecha; recálculo de productos afectados) con `EXPLAIN ANALYZE` antes/después sobre seed grande (p. ej. 50.000 ventas) → `docs/optimizacion.md`.
- **T3.5** Socket.IO en Node: handshake con JWT (rechaza no autenticados), salas `local` y `turno:{id}`, eventos reales (`venta.registrada`, `costo.actualizado`, `stock.bajo`, `importacion.lista`), presencia, reconexión automática.
- **T3.6** Cliente mínimo PWA en `web/` (tablero + importación + caja) y diagrama de secuencia Mermaid.
- **T3.7** Ensayo de fallos: apagar cada componente, documentar lo observado.
- **T3.8** (Should) Reportes: ganancia diaria, ranking de productos, punto de equilibrio y metas (HU10–HU11).

### TP 4 — Docker, CI/CD, implementación, OpenAPI y GraphQL (Unidad 5 · clases 25–28 · 15 %)
- **T4.1** Dockerfile por servicio (multietapa, usuario no root, versiones fijadas, `.dockerignore`).
- **T4.2** `docker-compose.yml`: Django, Node, ai-service, PostgreSQL, MongoDB (con límite de memoria configurado); healthchecks, redes, volúmenes; **un solo comando** desde clon limpio.
- **T4.3** GitHub Actions: instalación, lint, tests de ambos servicios, build de imágenes, badge; demostrar que falla con un test roto.
- **T4.4** Modalidad de implementación (ADR): **PC Local con Docker Compose** (respaldada por la sección 3.5 de la Guía), garantizando operación continua de caja y stock ante cortes de internet mediante la **PWA instalable** en red local (LAN). Para el equipo de **8 GB de RAM** del local se aplican las medidas de mitigación definidas en §0 (2d): no correr Ollama local (se consume Gemini API mediante el adapter, con degradación a carga manual/CSV sin internet) y limitar la memoria de MongoDB en Docker Compose.
- **T4.5** OpenAPI: `drf-spectacular` en Django, Swagger UI en Express.
- **T4.6** GraphQL en Node (Apollo): 3 queries + 1 mutation con resolvers que usan más de una fuente (ej. `productoConCostoEHistorial`, `resumenDelDia`, `menuDigital`; mutation `actualizarPrecioInsumo`) + justificación escrita frente a REST.
- **T4.7** Tags de Git y **rollback documentado y probado una vez**.

### TP 5 — TFI (Unidad 6 · clases 30–34 · 15 %)
- **T5.1** Congelar funcionalidad 2 semanas antes; todas las historias *Must* completas; un usuario demo por rol.
- **T5.2** Cobertura ≥ 60 % sobre lógica de negocio (pytest-cov, Jest) con informe versionado; pruebas unitarias, de integración y **un caso extremo a extremo**; lint sin errores.
- **T5.3** Informe PDF con la estructura obligatoria (resumen, proyecto, planificación real vs. ejecutada, desarrollo con ADRs, conclusiones, bibliografía APA) + manual de usuario breve.
- **T5.4** Retrospectiva escrita, presentación de ≤ 8 diapositivas, ensayo cronometrado (8 min, demo en vivo).
- *Could si sobra tiempo:* HU13 (resumen semanal con IA).

---

## 7. Archivos para cargar en Antigravity

Antigravity lee reglas del workspace en `.agents/rules/` (también `AGENTS.md`/`GEMINI.md` en la raíz); cada archivo de reglas tiene un **límite de 12.000 caracteres**, así que conviene separar por tema. Los workflows se guardan como Markdown y se invocan con `/nombre`. Verificá en tu versión la carpeta exacta (antes era `.agent/`).

### `AGENTS.md` (raíz)

```markdown
# Proyecto: sistema de gestión para cafetería (TFI Programación IV, UTN FRRe)

## Contexto
Monorepo: backend-django (Django 5 + DRF + PostgreSQL), backend-node (Express + Mongoose + MongoDB + Socket.IO),
ai-service (FastAPI + Ollama, desde TP3), web (cliente mínimo), infra (Docker), docs.
Fuente de verdad del alcance: docs/PROPUESTA.md y docs/PLAN_IMPLEMENTACION.md. No agregues tecnologías fuera de esas.

## Reglas de trabajo (obligatorias)
1. Trabajá UNA tarea por sesión (ej. T1.3). Si no está en el plan, preguntá antes.
2. Creá la rama `feature/<id>-<slug>` desde main. NUNCA hagas push a main, ni merge, ni force push.
3. Commits pequeños (2–5 por tarea), Conventional Commits en español. Cada commit debe dejar el proyecto funcionando.
4. Lógica de negocio en servicios, no en vistas/controladores. Controladores delgados.
5. Escribí tests junto con el código (pytest / Jest). No marques la tarea como lista si fallan.
6. NUNCA escribas secretos reales. Solo `.env.example`. Nunca leas ni imprimas `.env`.
7. NUNCA incluyas datos reales del local (precios reales, teléfonos, nombres). Usá datos inventados.
8. Todo error de API usa el formato único definido en docs/api-errores.md.
9. Al terminar: actualizá docs/bitacora.md (qué hiciste, por qué, qué archivos, cómo probarlo) y detenete.
   El equipo debe poder explicar cada línea: dejá comentarios solo donde el "por qué" no sea obvio y explicá decisiones en la bitácora.
10. Si hay ambigüedad de negocio, usá docs/PLAN_IMPLEMENTACION.md §3 (reglas de negocio) o preguntá. No inventes fórmulas.
11. Estilo de código: en backend-node/ seguí `.agents/rules/convenciones-node.md` (replica el proyecto de referencia de la cátedra);
    en backend-django/ y ai-service/ seguí `.agents/rules/convenciones-python.md`. Si un patrón no está cubierto, copiá el del proyecto
    de referencia en vez de inventar uno nuevo. Código en español, controladores delgados, un único formato de error.

## Convenciones
- Python 3.11+, ruff + black, pytest. Node 20 LTS, ESLint + Prettier, Jest.
- Dinero: Decimal en Python, enteros en centavos o Decimal128 en Mongo. Nunca float.
- Unidades base: g, ml, un. Convertir en un único servicio.
```

### Workflow `/tarea` (`.agents/workflows/tarea.md`)

```markdown
# /tarea <ID>
Descripción: ejecutar una tarea del plan de punta a punta sin salirse del alcance.
1. Leé AGENTS.md y la sección de la tarea en docs/PLAN_IMPLEMENTACION.md.
2. Mostrame un plan de 5–8 líneas (archivos a tocar, tests a escribir) y esperá mi OK.
3. Creá la rama feature/<ID>-<slug>.
4. Implementá en pasos chicos; tras cada paso corré los tests y hacé un commit.
5. Corré lint + tests completos del servicio afectado.
6. Actualizá docs/bitacora.md y el README si cambió la puesta en marcha.
7. Mostrame `git log --oneline` de la rama y un resumen de cómo probarlo. NO hagas push.
```

### Workflow `/cierre-clase`
```markdown
# /cierre-clase
1. Listá las tareas completadas desde el último cierre (git log) y las pendientes del TP actual.
2. Actualizá docs/bitacora.md, la sección de estado del README y docs/adr/ si hubo decisiones.
3. Verificá que no haya secretos (buscá patrones de claves/tokens) y que .env.example esté al día.
4. Prepará el resumen para el PR/tablero. NO hagas push.
```

### Primer prompt para pegar en Antigravity
> Leé `AGENTS.md` y `docs/PLAN_IMPLEMENTACION.md`. Ejecutá `/tarea T0.1`. Mostrame primero el plan y esperá mi confirmación.

---

## 8. Riesgos principales

| Riesgo | Mitigación |
|---|---|
| El agente avanza demasiado y nadie entiende el código (se considera "no entregado") | Una tarea por sesión, PR revisado por el otro integrante, bitácora, rotar quién explica cada módulo |
| Alcance excesivo (el dueño pide mucho) | "Fuera de alcance" explícito y vinculante tras la defensa del TP 0 |
| Ollama no corre en las máquinas del aula/despliegue | Modelo pequeño, contingencia obligatoria, probar en una PC distinta |
| Secretos o datos reales en el repo | `.gitignore` primero, revisión en `/cierre-clase`, datos anonimizados |
| Dos emisores de JWT inconsistentes | Solo Django emite; Node solo valida |
| Retraso acumulado (los TP son acumulativos) | Congelar funcionalidad 2 semanas antes del TFI; implementar temprano y con poco |

---

## 9. Pendientes
- **Cursada:** el calendario de clases varía (se saltean o postergan temas). El plan se organiza **por entrega (TP) y por tema**, no por número de clase: antes de cada clase se eligen las tareas del backlog que correspondan a lo que efectivamente se dio.
- Aprobación del tema por ambos docentes (a confirmar antes de cerrar el TP 0).
- **Preguntas para el dueño** (ver §3b): ¿Seguirá usando el POS Abarrotes para cobrar? Si sí, ¿puede sacar las ventas a Excel/CSV?
- ✅ **Resuelto con los docentes:** se puede usar el proveedor de IA que prefiramos (Gemini es válido) y el frontend es de libre elección. Registrarlo en un ADR.
- ✅ **Datos:** todo anonimizado en Git. No se versionan capturas del Excel/POS, el audio ni su transcripción, ni el nombre real del local.

### 3b. El POS Abarrotes: qué hay que saber del dueño
| Escenario | Qué hace el dueño | Qué construimos |
|---|---|---|
| A. Reemplaza el POS | Cobra en nuestro sistema | Pantalla de ventas y caja propia (HU4–HU5 completas) |
| B. Conserva el POS | Sigue cobrando en Abarrotes | Importación de ventas desde un export (CSV/Excel); `Venta.origen = importado` |
| C. Sin datos de ventas | — | Carga manual de totales por producto/día (mínimo) |
En cualquiera de los tres, el **costeo funciona igual**; lo que cambia es de dónde salen las ventas para calcular ganancia diaria, ranking y punto de equilibrio.
