# SheetJS (xlsx) — Build vendored para navegador

- **Versión exacta:** `0.20.3`
- **Archivo:** `xlsx.full.min.js`
- **Origen oficial:** `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js` (`https://cdn.sheetjs.com/`)
- **Fecha de descarga:** `2026-11-16`
- **SHA-256:** `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`

## Motivo de seguridad (por qué no se instala vía npm)

El paquete `xlsx` publicado en el registro público de `npm` quedó congelado en la versión `0.18.5`, la cual presenta vulnerabilidades conocidas de severidad alta (**CVE-2023-30533** de Prototype Pollution y **CVE-2024-22363** de ReDoS).

Siguiendo las recomendaciones oficiales de SheetJS, se descarga e incluye el build compilado desde el CDN/tarball oficial (`https://cdn.sheetjs.com/`) en su versión `0.20.3` dentro de `web/vendor/sheetjs/` para operar **100% offline-first** desde el Service Worker sin peticiones externas en tiempo de ejecución.
