# Mammoth.js — Build vendored para navegador

- **Versión exacta:** `1.13.0`
- **Archivo:** `mammoth.browser.min.js`
- **Origen:** `https://cdn.jsdelivr.net/npm/mammoth@1.13.0/mammoth.browser.min.js` (paquete oficial `mammoth` / repositorio `mwilliamson/mammoth.js`)
- **Fecha de descarga:** `2026-11-16`
- **SHA-256:** `92914a3708cfdf1e62cb553d1856a7fedab21da83d8ee82845de2f897b368cab`

## Uso en el proyecto

Se utiliza `mammoth.extractRawText({ arrayBuffer })` exclusivamente en el navegador para extraer texto plano de documentos Word (`.docx`) de listas de precios de proveedores con enfoque **100% offline-first**, cacheados por el Service Worker (`web/sw.js`).
