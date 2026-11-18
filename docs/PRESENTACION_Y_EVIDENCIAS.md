# Presentación Final, Evidencias Visuales y Guion de Video (T6) — Sapori Stock

> **TFI — Tecnicatura Universitaria en Programación (UTN FRRe)**  
> **Nota de trazabilidad:** En `/home/evilkitty/orq/tareas/` no existe un archivo `T6_capturas_presentacion.txt`; la consigna vigente de T6 en esa carpeta es `T6_guion_video.txt`, complementada por el repositorio de capturas en `~/Escritorio/capturas-presentacion/` (`CAMBIOS.md`, `pruebas-ia/DESCRIPCION.md` y `qr-carta/`). Este documento consolida en un solo lugar la guía de ejecución, el inventario de evidencias visuales (IA y QR), el guion de 2 minutos y los resultados verificados de las pruebas.

---

## 1. Alcance Real del Sistema (Qué hace y qué NO promete)

**Sapori Stock** (`cafe-gestion`) reemplaza el Excel manual de una cafetería de especialidad mediante una arquitectura local-first y multi-servicio:

- **Sí implementado y verificado:**
  - **Costeo dinámico de recetas:** conversión automática a unidades base (`g`, `ml`, `un`), prorrateo proporcional de envío en compras, suma de insumos + mano de obra + descartables (ejemplo verificado en `CAMBIOS.md`: Café Latte = `$ 812,00` de insumos + `$ 83,33` de mano de obra + `$ 80,00` de descartables = **`$ 975,33`** por porción) e historial inmutable en MongoDB (`historial_precios` y `snapshots_costeo`).
  - **Importación híbrida con IA y contingencia sin IA:** lectura de CSV, Excel (`.xlsx`), Word (`.docx`), PDF (extracción local en navegador con `pdf.js`), texto libre y fotos (JPG/PNG/WEBP con Groq Vision `qwen/qwen3.8-27b` o Gemini), siempre con aprobación humana explícita antes de impactar costos. Si la IA falla o no hay clave, funciona en modo contingencia honesta y la importación directa de planillas sigue operativa.
  - **Punto de Venta (POS) y Arqueo Ciego:** búsqueda rápida y lector de códigos de barras HID, ventas con precios calculados exclusivamente en backend Django, anulación lógica (`EMITIDA` / `ANULADA` con `POST /api/ventas/:id/anular/`), cola offline en `localStorage` (`sapori_cola_ventas_offline`) y arqueo ciego estricto donde el rol `CAJERO` no ve `efectivo_esperado` ni `ventas_efectivo_total`.
  - **Reportes, Punto de Equilibrio y Consultoría IA:** filtro por rango de fechas, ranking de productos, consumo teórico de ingredientes por ventas, ganancia bruta del período, punto de equilibrio, consultor de insumos a reponer (`POST /v1/resumen-semanal`) y auditoría de cierre de caja.
  - **Equipo y Permisos:** JWT RS256 asimétrico, roles `DUENIO`, `ENCARGADO` y `CAJERO` como plantillas de permisos granulares por persona y protección del último dueño/superusuario activo.
  - **Carta Digital Pública por QR (HU15 / T5):** botón y modal QR en Recetas (`#btn-qr-carta-publica` y `#modal-qr-carta`, solo con permiso `recetas.editar`) con codificador SVG puro **ISO/IEC 18004** (`generarMatrizQr` y `generarSvgQrCarta` en `web/js/logicaPwa.js`) y vista pública mobile-first `web/carta.html` (`GET /api/carta-publica/` anónimo con `CartaPublicaRateThrottle`).
- **Fuera de alcance (NO prometer en la presentación):**
  - **No hay descuento físico automático de stock** (el sistema calcula **consumo teórico** según recetas vendidas).
  - **No hay cobro/pago con QR** (el QR abre la Carta Digital pública de solo lectura).

---

## 2. Cómo Correr el Sistema Paso a Paso

> **Seguridad:** nunca leer ni versionar `.env`. Partir siempre de `.env.example` con credenciales de prueba locales.

### Opción A — Docker Compose (entorno completo en un comando)

```bash
cp .env.example .env
# Completar claves locales / GROQ_API_KEY o GEMINI_API_KEY si se probará IA en nube
./scripts/desplegar.sh
# o directamente:
docker compose up -d --build
```

- **Web / POS:** `http://localhost` (puerto `80` vía Nginx `web-proxy`)
- **Carta Digital Pública:** `http://localhost/carta.html` (o `http://localhost/app/carta.html`)
- **Salud general:** `http://localhost/healthz` | `http://localhost/api/health/profundo/` | `http://localhost/health/profundo/`

### Opción B — Desarrollo Local (sin Docker, 3 terminales)

1. **Backend Django (`:8000`):**
   ```bash
   cd backend-django
   .venv/bin/python manage.py migrate
   .venv/bin/python manage.py runserver 8000
   ```
2. **Backend Node (`:3000`, sirve también la PWA en `/app/`):**
   ```bash
   cd backend-node
   npm run dev
   ```
3. **AI Service (`:8001`):**
   ```bash
   cd ai-service
   .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8001
   ```
4. **Accesos locales:**
   - **Aplicación comercial:** `http://localhost:3000/app/`
   - **Carta pública QR:** `http://localhost:3000/app/carta.html` (y `http://localhost:3000/carta.html` al iniciar Node con el código actual)

### Regenerar capturas y SVG de Carta Pública / QR

Con Django (`:8000`) y Node (`:3000`) activos, ejecutar:

```bash
./scripts/capturar_carta_qr.sh
```

El script verifica HTTP 200 en `/api/carta-publica/`, genera `qr-carta-ejemplo.svg` usando `web/js/logicaPwa.js` y captura `carta.html` en viewport Desktop (`1280×900`) y Mobile (`390×844`) dentro de `~/Escritorio/capturas-presentacion/qr-carta/`.

---

## 3. Inventario Consolidado de Evidencias Visuales

Ubicación base en equipo de presentación: `~/Escritorio/capturas-presentacion/` (con datos ficticios de demostración).

### 3.1. Flujo Principal del Sistema (`~/Escritorio/capturas-presentacion/`)

| Archivo | Vista / Rol | Qué demuestra |
|---|---|---|
| `01-login.png` | Pantalla de ingreso | Login limpio (usuario y contraseña con botón de ver/ocultar), sin opciones técnicas expuestas antes de autenticar. |
| `02-costeo.png` | Costeo e Insumos (Dueño) | Conversión a unidad base, costos calculados separados de entradas editables. |
| `02b-carta-receta.png` | Recetas y Carta (Dueño) | Desglose completo de Café Latte: insumos (`$ 812`) + mano de obra (`$ 83,33`) + descartables (`$ 80`) = **`$ 975,33`** por porción. |
| `03-importacion-excel.png` | Compras e Importación | Carga de planilla Excel sin IA (`5 renglones listos para revisar`) y vista previa antes de confirmar precios. |
| `04-pos-carrito.png` | Punto de Venta (Cajero) | Menú filtrado por rol, carta real sin costos/márgenes, buscador/lector de códigos y carrito listo para cobrar. |
| `05-cierre-caja.png` | Cierre de Caja (Cajero) | Arqueo ciego estricto: el cajero declara el efectivo contado sin ver saldo esperado ni movimientos ajenos. |
| `05b-caja-gerencia.png` | Caja y Gerencia (Dueño) | Control de diferencias, resumen del turno abierto (5 tickets) y auditoría gerencial. |
| `06-reportes.png` | Reportes y Finanzas | Filtro por fechas, totales del período, consumo teórico de ingredientes y ganancia bruta. |
| `07-ranking.png` | Ranking y Punto de Equilibrio | Productos más vendidos y cálculo de punto de equilibrio. |

### 3.2. Módulo IA con Groq Cloud Real (`~/Escritorio/capturas-presentacion/pruebas-ia/`)

Ver detalle completo en `~/Escritorio/capturas-presentacion/pruebas-ia/DESCRIPCION.md` (sesión `duenio_demo`, `ai-service` en `:8001`, `GROQ_MODEL=openai/gpt-oss-120b` y `GROQ_VISION_MODEL=qwen/qwen3.8-27b`, datos inventados):

| Archivo | Caso probado | Qué demuestra |
|---|---|---|
| `01-ia-csv-propuesta.png` | Planilla CSV + IA | Estado `LISTA` con `Proveedor IA: groq`, flete prorrateado `$ 1.800,00` y 3 ítems normalizados. |
| `02-ia-excel-propuesta.png` | Archivo `.xlsx` + IA | Propuesta `LISTA` por `groq` con flete `$ 1.500,00` y 2 ítems. |
| `03-ia-word-propuesta.png` | Documento `.docx` + IA | Lectura del `.docx` y propuesta `LISTA` con flete `$ 2.200,00` y 2 ítems. |
| `04-ia-texto-libre-propuesta.png` | Texto libre de proveedor | Separación estricta de nombre, cantidad y unidad en 4 ítems (`Distribuidora Central de Café`, flete `$ 4.500,00`). |
| `05-ia-foto-propuesta.png` | Foto PNG + Groq Vision | Miniatura de imagen legible y extracción multimodal (`qwen/qwen3.8-27b`) sin mezclar cantidad/unidad en el nombre. |
| `06-ia-propuesta-aprobada.png` | Aprobación humana | Toast verde de impacto real: 4 insumos/compras actualizados y 1 receta recalculada. |
| `07-ia-consultar-insumos.png` | Consultor IA de insumos | `POST /v1/resumen-semanal` con dictamen de ventas, insumos de mayor impacto y plan de acción. |
| `08-ia-auditar-caja.png` | Auditoría IA de turno | Dictamen de conciliación del Turno #1 en curso. |

### 3.3. Módulo QR Carta Pública — HU15 / T5 (`~/Escritorio/capturas-presentacion/qr-carta/`)

| Archivo / Vista | Qué muestra | Estado |
|---|---|---|
| `qr-carta/01-carta-publica-desktop.png` | Vista `web/carta.html` en Desktop (`1280×900`) consumiendo `GET /api/carta-publica/` sin login (11 productos activos con precio en ARS, buscador y hora de consulta). | Capturado en vivo |
| `qr-carta/02-carta-publica-mobile.png` | Vista `web/carta.html` en Mobile (`390×844`) responsive sin desbordes horizontales. | Capturado en vivo |
| `qr-carta/qr-carta-ejemplo.svg` | Código QR ISO/IEC 18004 generado por `generarSvgQrCarta()` apuntando a `http://localhost:3000/app/carta.html`. | Generado por script |
| Vista Recetas + Modal `#modal-qr-carta` | En `#vista-recetas`, el botón `#btn-qr-carta-publica` (visible solo con `recetas.editar`) abre `#modal-qr-carta` con el QR SVG, copia de URL, descarga `.svg` e impresión de cartel. | Captura manual con sesión de Dueño/Encargado (no automatizada sin credenciales) |

---

## 4. Guion de Video de Presentación (2 minutos — Tarea T6)

- **Duración objetivo:** 2:00 minutos (~264 palabras locutadas, español rioplatense).
- **Aclaraciones respetadas:** no menciona control físico de stock (solo consumo teórico) ni cobros/pagos con QR.

| Tiempo | Escena | Captura (`~/Escritorio/capturas-presentacion/`) | Locución |
|---|---|---|---|
| **0:00 – 0:15** | 1. El problema | `01-login.png` | ¿Alguna vez manejaste los costos de una cafetería en un Excel? Cuando cargás el precio de un bulto en la celda de costo, las fórmulas se rompen sin aviso y creés que ganás plata cuando en realidad perdés. Para resolver eso creamos Sapori Stock. |
| **0:15 – 0:38** | 2. Costeo dinámico | `02-costeo.png` → `02b-carta-receta.png` | En Recetas y Costeo cada insumo se convierte a su unidad base y la receta suma todo sola. Por ejemplo, nuestro Café Latte suma 812 pesos de insumos, 83 con 33 de mano de obra y 80 de descartables: 975 pesos con 33 por porción, con margen calculado al instante. |
| **0:38 – 1:00** | 3. Importación de proveedor | `03-importacion-excel.png` → `pruebas-ia/05-ia-foto-propuesta.png` → `pruebas-ia/06-ia-propuesta-aprobada.png` | Cuando llega una lista nueva de proveedor, podés subir un Excel, CSV, Word, PDF o incluso una foto. Si usás inteligencia artificial, te arma la propuesta con el envío prorrateado y vos decidís aprobarla: recién ahí actualiza costos y recalcula todas las recetas. |
| **1:00 – 1:24** | 4. Punto de venta y arqueo ciego | `04-pos-carrito.png` → `05-cierre-caja.png` → `05b-caja-gerencia.png` | En mostrador, el cajero busca productos o usa lector de códigos de barras, cobra incluso sin internet y cierra su turno con arqueo ciego: declara lo que contó sin ver el saldo esperado. El dueño después revisa las diferencias en gerencia. |
| **1:24 – 1:42** | 5. Reportes y punto de equilibrio | `06-reportes.png` → `07-ranking.png` (+ `pruebas-ia/07-ia-consultar-insumos.png`) | En Reportes filtrás por fecha, consultás el ranking de productos, el consumo teórico de ingredientes, la ganancia bruta del período y el punto de equilibrio para saber cuánto necesitás vender. |
| **1:42 – 1:54** | 6. Equipo, permisos y QR | `qr-carta/01-carta-publica-desktop.png` → `qr-carta/02-carta-publica-mobile.png` | Cada empleado entra con su usuario y permisos por rol: el cajero ve solo caja y ventas, mientras el encargado o el dueño gestionan recetas y pueden generar el QR de la carta pública actualizada. |
| **1:54 – 2:00** | 7. Cierre | `01-login.png` | Sapori Stock corre en la compu del local sin depender de internet para vender. Menos planillas rotas y números claros todos los días. |

---

## 5. Resultados Verificados de Pruebas y Linters

Ejecución verificada en la rama `feat/presentacion-evidencias` (encadenada desde `feat/qr-carta-publica`):

| Suite / Herramienta | Comando | Resultado observado |
|---|---|---|
| **Django (pytest)** | `backend-django/.venv/bin/pytest backend-django/ -q` | `460 passed in 66.74s` |
| **AI Service (pytest)** | `ai-service/.venv/bin/pytest ai-service/ -q` | `87 passed in 0.91s` |
| **Python Lint & Format (ruff)** | `.venv/bin/ruff check backend-django/ ai-service/` y `ruff format --check` | `All checks passed!`, `154 files already formatted` |
| **Backend Node (Jest)** | `cd backend-node && npm test` | `25 passed, 25 total` suites / `218 passed, 218 total` tests |
| **Backend Node (ESLint)** | `cd backend-node && npm run lint` | `0` errores / salida limpia |
| **Sintaxis Frontend (`web/`)** | `node --check web/js/{app,logicaPwa,carta}.js web/sw.js` | Exit `0` en los 4 archivos |
