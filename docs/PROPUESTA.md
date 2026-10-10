# Propuesta — Sistema de gestión para cafetería

> TP 0 · Tarea T0.2. Fuente de verdad del alcance junto con `docs/PLAN_IMPLEMENTACION.md`.
> Este documento no contiene nombres, teléfonos ni precios reales del local.

---

## 1. Problema y usuarios

### Problema

Una cafetería gestiona hoy **costos, precios, stock y caja en un Excel manual**. Ese archivo funciona como fuente de verdad, pero tiene fallas que afectan decisiones del negocio:

- **Resultados rotos sin aviso:** las fórmulas dependen de celdas y hojas enlazadas a mano; un cambio accidental produce errores (`#REF!`, `#DIV/0!`) que se propagan.
- **Márgenes absurdos tras un re-stock:** al cargar en la celda de costo el total pagado por un lote, la hoja lo compara con el precio de una sola unidad.
- **Datos duplicados:** los precios se repiten en varias hojas y se actualizan a mano, sin historial de quién cambió qué.
- **Costos incompletos:** el envío no se prorratea, y hay productos sin categoría o sin costo cargado.
- **Actualización de precios de proveedores manual:** cada lista nueva se vuelve a cargar a mano.

El sistema propuesto reemplaza el Excel por una aplicación que **costea recetas por código** (no editable a mano), separa la **compra** (total pagado, cantidad y unidad) del **costo unitario** (calculado), conserva el **historial de cambios** y controla ventas y caja.

> **Valor central del MVP:** el costeo (insumos → recetas → costos y márgenes → historial). No depende de qué sistema use el local para cobrar.

### Usuarios

| Rol | Qué necesita del sistema |
|---|---|
| **Dueño** | Conocer costos y márgenes, actualizar precios de proveedores, ver la ganancia y crear al personal definiendo sus permisos. |
| **Encargado** | Mantener insumos, compras y recetas; abrir y cerrar caja; aplicar descuentos o anular tickets. |
| **Cajero** | Cobrar tickets con medio de pago y operar su propio turno de caja. |

Los tres roles funcionan como **plantillas de permisos**: el dueño elige un rol al crear a una persona y puede tildar o destildar permisos individuales.
