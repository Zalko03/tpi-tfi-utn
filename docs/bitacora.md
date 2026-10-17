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

