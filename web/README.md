# `web` — Cliente PWA Comercial, Carta Pública QR y Reverse Proxy

Interfaz web instalable (**Progressive Web App**) del sistema **Sapori Stock** (`cafe-gestion`), desarrollada en **HTML5**, **CSS3** y **JavaScript ES Modules** sin frameworks pesados, junto con la configuración de **Nginx 1.27 Alpine** para servir la aplicación y enrutar el tráfico en Docker.

---

## Responsabilidades

1. **PWA operativa para el local (`index.html`, `js/app.js`, `js/logicaPwa.js`, `sw.js`):**
   - **Punto de Venta (POS):** catálogo filtrado, búsqueda rápida, lectura de códigos de barras por emulación de teclado (HID), atajos de teclado (`F2`, `F4`), cálculo de carrito en centavos enteros (sin errores de `float`), ticket térmico imprimible y cola offline en `localStorage` (`sapori_cola_ventas_offline`) sincronizada con `navigator.locks`.
   - **Caja y Arqueo Ciego:** apertura/cierre de turno, movimientos de efectivo e invisibilidad estricta del saldo esperado para cajeros.
   - **Insumos, Compras y Stock Real (HU1, HU12):** alta/edición de insumos con stock actual y mínimo, ajustes manuales de inventario, alertas de stock bajo en vivo (`stock.bajo`), compra manual con prorrateo e IVA e importación híbrida de listas de proveedores (texto libre, CSV directo, `.xlsx` con SheetJS, `.docx` con Mammoth, `.pdf` local con `pdf.js` y foto reescalada en `<canvas>` hasta 5 MB para IA).
   - **Recetas, Costeo y Precio Sugerido (HU2, HU9):** desglose de insumos + mano de obra + descartables, márgenes, columna de precio sugerido (oculto si falta `recetas.ver_costos`), referencias de competencia cargadas a mano, botón opcional "Usar precio sugerido" y generador de código QR SVG puro ISO/IEC 18004 (`generarSvgQrCarta`).
   - **Reportes, Tablero en Vivo y Consultor IA (HU8, HU10, HU11, HU13):** feed Socket.IO en tiempo real (`venta.registrada`, `venta.anulada`, `costo.actualizado`, `stock.bajo`, `importacion.lista`), ganancia diaria, ranking de productos, simulador de punto de equilibrio y metas, y resumen semanal con IA.
   - **Configuración del Local y Equipo (HU6, HU14):** pantalla exclusiva del Dueño para declarar condición fiscal e inspeccionar historial, banners de aviso cuando no está declarada, y gestión de personal con plantillas de rol y 30 permisos granulares.
2. **Carta Digital Pública por QR (`carta.html`, `js/carta.js`, `js/config.js`, HU15):**
   - Vista pública mobile-first de solo lectura (sin login ni JWT) que consulta `GET /api/carta-publica/`, permite buscar productos y muestra el mapa embebido de OpenStreetMap ("Dónde estamos") configurado en `web/js/config.js` con exclusión explícita de peticiones externas en `sw.js`.
3. **Reverse Proxy perimetral en Docker (`nginx.conf`, `Dockerfile`):**
   - Publica la PWA en el puerto `80`, inyecta cabeceras de seguridad (`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) y distribuye rutas entre `backend-django` (`/api/*`) y `backend-node` (`/socket.io/`, `/v1/resumen-semanal`, `/api/importaciones`, `/api/historial-precios`, `/api/snapshots-costeo`, `/api/productos/:id/resumen-costo`).

---

## Árbol de Carpetas

```text
web/
├── .dockerignore
├── Dockerfile                        # Imagen nginx:1.27-alpine con estáticos PWA y nginx.conf
├── nginx.conf                        # Reverse proxy, CSP, compresión Gzip y /healthz
├── manifest.webmanifest              # Metadatos instalables de la PWA
├── sw.js                             # Service Worker (caché cafe-gestion-pwa-v4, Network-First)
├── index.html                        # Shell principal de la aplicación comercial
├── carta.html                        # Carta Digital pública por QR + mapa OpenStreetMap
├── css/
│   └── estilos.css                   # Diseño responsive y estilos de ticket térmico
├── js/
│   ├── app.js                        # Orquestación de DOM, APIs, Socket.IO, POS y vistas
│   ├── logicaPwa.js                  # Lógica pura testeable (centavos, CSV, QR SVG, stock, sugerido, RBAC, cola offline)
│   ├── carta.js                      # Carga pública de productos y mapa en carta.html
│   └── config.js                     # Ubicación del local (dirección y coordenadas)
└── vendor/                           # Librerías estáticas cacheadas offline (sin CDN)
    ├── mammoth/                      # Lectura local de .docx
    ├── pdfjs/                        # Extracción local de .pdf (pdf.min.js + pdf.worker.min.js)
    └── sheetjs/                      # Lectura local de .xlsx
```

---

## Comandos

### Ejecución

- **En Docker Compose (puerto `80`):**
  ```bash
  docker compose up -d --build web
  ```
  - PWA comercial: `http://localhost` (y `http://localhost/app/`)
  - Carta pública QR: `http://localhost/carta.html`
  - Salud Nginx: `http://localhost/healthz`

- **En modo local sin Docker (servido por `backend-node` en `:3000`):**
  ```bash
  cd backend-node && npm run dev
  ```
  - PWA comercial: `http://localhost:3000/app/`
  - Carta pública QR: `http://localhost:3000/carta.html` (o `http://localhost:3000/app/carta.html`)

### Verificación de sintaxis y pruebas unitarias/integración de PWA

La lógica pura de `web/js/logicaPwa.js`, `web/sw.js` y los contratos CSP/HTML se validan con Node y Jest desde `backend-node/`:

```bash
# Verificación de sintaxis JS (desde la raíz del repo)
node --check web/js/app.js && node --check web/js/logicaPwa.js && node --check web/js/carta.js && node --check web/js/config.js && node --check web/sw.js

# Tests unitarios e integración de lógica PWA, QR, stock, sugerido y CSP
cd backend-node
npx jest tests/unit/logicaPwa.unit.test.js tests/integration/clientePwa.integration.test.js tests/integration/cspConsistencia.integration.test.js
```
