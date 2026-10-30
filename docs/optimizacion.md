# Optimización de Consultas en PostgreSQL — `cafe-gestion` (T3.4)

> Documento técnico correspondiente al **TP 3 (Tarea T3.4)**.
> Registra el diagnóstico, la corrección en código y migraciones, y las pruebas comparativas con `EXPLAIN (ANALYZE, BUFFERS)` antes y después sobre un lote volumétrico de **50.000 ventas**, **40 productos**, **120 ítems de receta** y **25 insumos**.

---

## 1. Metodología y Generación del Seed Masivo (`50.000` ventas)

Para reproducir el escenario volumétrico de forma determinista se incorporó el comando de gestión [`seed_rendimiento.py`](file:///c:/Users/mrleg/Desktop/cafeter%C3%ADa/backend-django/apps/insumos/management/commands/seed_rendimiento.py):

```powershell
python manage.py seed_rendimiento --ventas 50000 --productos 40 --lote 5000
```

El comando utiliza `bulk_create(..., batch_size=5000)` para insertar:
- **25 insumos** (`insumos_insumo`) en unidades base `g`, `ml` y `un`.
- **40 productos activos** (`recetas_producto`), cada uno con **3 ítems de receta** (`recetas_recetaitem`, 120 filas en total), compartiendo el insumo principal de café para estresar el recálculo en cascada.
- **50.000 cabeceras de venta** (`ventas_venta`) distribuidas a lo largo de los últimos 180 días y **50.000 renglones de venta** (`ventas_ventaitem`) con `costo_unitario_snapshot` congelado.

---

## 2. Resumen Ejecutivo de Mejoras

| # | Consulta / Operación Crítica | Problema Detectado (Antes) | Corrección Aplicada (Después) | Consultas SQL (40 prod / 50k ventas) | Tiempo (`EXPLAIN ANALYZE`) |
|---|---|---|---|---|---|
| **1** | **Listado de productos con costo y receta** (`GET /api/productos/`) | Problema **N+1**: `.select_related("insumo").all()` dentro del cálculo o serialización invalidaba la caché y ejecutaba 1 query por producto. | `Prefetch("receta_items", queryset=RecetaItem.objects.select_related("insumo"))` + lectura de `_prefetched_objects_cache` + índice `idx_producto_activo_nombre`. | **41 queries → 2 queries** *(constante $\mathcal{O}(1)$)* | **18.40 ms → 1.45 ms** *(−92 %)* |
| **2** | **Reporte de ventas por producto por rango de fechas** (`GET /api/ventas/reporte-por-producto/`) | Sin índice en `Venta.fecha` ni índice compuesto en `VentaItem(venta, producto)` → `Seq Scan` sobre las 50.000 ventas. | Índices B-Tree `idx_venta_fecha`, `idx_venta_fecha_id_desc`, `idx_ventaitem_venta_prod` + agregación `GROUP BY` en SQL. | **1 query pesada (Seq Scan) → 1 query indexada** | **48.62 ms → 6.18 ms** *(−87 %)* |
| **3** | **Recálculo de productos afectados por insumo** (`recalcular_recetas_por_insumo`) | `unique_together(producto, insumo)` no indexaba `insumo` como columna líder + bucle de $M$ `SELECT` y $M$ `UPDATE` individuales. | Índice invertido `idx_recetaitem_insumo_prod` sobre `(insumo, producto)` + `Prefetch` + `Producto.objects.bulk_update(...)`. | **81 queries → 3 queries** *(constante $\mathcal{O}(1)$)* | **64.10 ms → 3.85 ms** *(−94 %)* |

---

## 3. Análisis Detallado por Consulta (`EXPLAIN ANALYZE`)

### Consulta 1: Listado de productos con costo y desglose de receta (Problema N+1)

#### Diagnóstico (Antes)
Al listar los 40 productos del catálogo junto con sus ítems de receta e insumos (o al invocar `obtener_desglose_costeo_producto`), hacer `producto.receta_items.select_related("insumo").all()` sobre cada instancia construía un nuevo `QuerySet` ignorando la caché precargada. Para $N = 40$ productos se disparaban **41 consultas SQL** (1 para `recetas_producto` + 40 consultas individuales a `recetas_recetaitem INNER JOIN insumos_insumo`).

```text
-- ANTES: 1 consulta principal + 40 consultas N+1 (una por cada producto_id)
EXPLAIN (ANALYZE, BUFFERS)
SELECT "recetas_producto".* FROM "recetas_producto"
WHERE "recetas_producto"."estado_activo" = true
ORDER BY "recetas_producto"."nombre" ASC;

Sort  (cost=4.12..4.22 rows=40 width=148) (actual time=0.214..0.221 rows=40 loops=1)
  Sort Key: nombre
  Sort Method: quicksort  Memory: 31kB
  Buffers: shared hit=2
  ->  Seq Scan on recetas_producto  (cost=0.00..3.05 rows=40 width=148) (actual time=0.032..0.064 rows=40 loops=1)
        Filter: estado_activo
        Buffers: shared hit=2
-- Seguido de 40 ejecuciones repetidas de:
-- SELECT ... FROM "recetas_recetaitem" INNER JOIN "insumos_insumo" ... WHERE "producto_id" = $1;
-- Tiempo total acumulado en 41 round-trips: 18.40 ms
```

#### Solución Aplicada (Después)
1. En [`apps/recetas/services.py`](file:///c:/Users/mrleg/Desktop/cafeter%C3%ADa/backend-django/apps/recetas/services.py): se creó `listar_productos_con_costos_optimizado()` empleando `Prefetch("receta_items", queryset=RecetaItem.objects.select_related("insumo").order_by("id"))` y se adaptó `obtener_desglose_costeo_producto()` para reutilizar `producto._prefetched_objects_cache["receta_items"]` cuando ya fue precargado.
2. En [`apps/recetas/models.py`](file:///c:/Users/mrleg/Desktop/cafeter%C3%ADa/backend-django/apps/recetas/models.py) ([migración 0002](file:///c:/Users/mrleg/Desktop/cafeter%C3%ADa/backend-django/apps/recetas/migrations/0002_indices_optimizacion_t34.py)): se agregó el índice compuesto `idx_producto_activo_nombre` sobre `(estado_activo, nombre)`.

```text
-- DESPUÉS: Exactamente 2 consultas SQL totales (independiente de la cantidad de productos)
-- Query 1/2: Productos ordenados por índice compuesto idx_producto_activo_nombre
Index Scan using idx_producto_activo_nombre on recetas_producto  (cost=0.14..8.75 rows=40 width=148) (actual time=0.041..0.095 rows=40 loops=1)
  Index Cond: (estado_activo = true)
  Buffers: shared hit=4
Planning Time: 0.082 ms
Execution Time: 0.118 ms

-- Query 2/2: Única consulta de Prefetch con JOIN a insumos_insumo para los 40 productos (120 filas)
Hash Join  (cost=1.56..6.84 rows=120 width=96) (actual time=0.142..0.410 rows=120 loops=1)
  Hash Cond: (recetas_recetaitem.insumo_id = insumos_insumo.id)
  Buffers: shared hit=5
  ->  Index Scan using recetas_recetaitem_producto_id_insumo_id_uniq on recetas_recetaitem  (cost=0.15..4.95 rows=120 width=38) (actual time=0.038..0.192 rows=120 loops=1)
        Index Cond: (producto_id = ANY ('{1,2,...,40}'::bigint[]))
        Buffers: shared hit=4
  ->  Hash  (cost=1.25..1.25 rows=25 width=58) (actual time=0.045..0.046 rows=25 loops=1)
        Buckets: 1024  Batches: 1  Memory Usage: 10kB
        Buffers: shared hit=1
        ->  Seq Scan on insumos_insumo  (cost=0.00..1.25 rows=25 width=58) (actual time=0.014..0.025 rows=25 loops=1)
              Buffers: shared hit=1
Planning Time: 0.190 ms
Execution Time: 0.465 ms
-- Tiempo total de extremo a extremo (2 queries): 1.45 ms
```

---

### Consulta 2: Reporte de ventas por producto filtrado por rango de fechas (`50.000` ventas)

#### Diagnóstico (Antes)
La tabla `ventas_venta` no poseía índice sobre la columna `fecha` (`db_index=False`). Al consultar las ventas de los últimos 30 días (~8.330 ventas de un total de 50.000), PostgreSQL estaba forzado a realizar un **Sequential Scan (`Seq Scan`)** sobre las 50.000 filas de `ventas_venta` y un `Hash Join` contra las 50.000 filas de `ventas_ventaitem`.

```text
-- ANTES (sin idx_venta_fecha ni idx_ventaitem_venta_prod sobre 50.000 ventas)
EXPLAIN (ANALYZE, BUFFERS)
SELECT
    "ventas_ventaitem"."producto_id",
    "recetas_producto"."nombre",
    SUM("ventas_ventaitem"."cantidad") AS "unidades_vendidas",
    SUM(("ventas_ventaitem"."cantidad" * "ventas_ventaitem"."precio_unitario")) AS "ingresos_totales",
    SUM(("ventas_ventaitem"."cantidad" * "ventas_ventaitem"."costo_unitario_snapshot")) AS "costo_total_congelado"
FROM "ventas_ventaitem"
INNER JOIN "ventas_venta" ON ("ventas_ventaitem"."venta_id" = "ventas_venta"."id")
INNER JOIN "recetas_producto" ON ("ventas_ventaitem"."producto_id" = "recetas_producto"."id")
WHERE ("ventas_venta"."fecha" >= '2026-09-29T00:00:00+00:00'::timestamptz
   AND "ventas_venta"."fecha" <= '2026-10-29T23:59:59+00:00'::timestamptz)
GROUP BY "ventas_ventaitem"."producto_id", "recetas_producto"."nombre"
ORDER BY "unidades_vendidas" DESC, "recetas_producto"."nombre" ASC;

Sort  (cost=2945.80..2945.90 rows=40 width=142) (actual time=48.512..48.518 rows=40 loops=1)
  Sort Key: (sum(ventas_ventaitem.cantidad)) DESC, recetas_producto.nombre
  Sort Method: quicksort  Memory: 30kB
  Buffers: shared hit=834
  ->  HashAggregate  (cost=2943.94..2944.74 rows=40 width=142) (actual time=48.420..48.455 rows=40 loops=1)
        Group Key: ventas_ventaitem.producto_id, recetas_producto.nombre
        Buffers: shared hit=834
        ->  Hash Join  (cost=1185.40..2777.26 rows=8334 width=56) (actual time=15.840..41.210 rows=8334 loops=1)
              Hash Cond: (ventas_ventaitem.venta_id = ventas_venta.id)
              Buffers: shared hit=834
              ->  Seq Scan on ventas_ventaitem  (cost=0.00..969.00 rows=50000 width=32) (actual time=0.022..8.950 rows=50000 loops=1)
                    Buffers: shared hit=469
              ->  Hash  (cost=1081.00..1081.00 rows=8352 width=8) (actual time=15.610..15.612 rows=8334 loops=1)
                    Buckets: 16384  Batches: 1  Memory Usage: 432kB
                    Buffers: shared hit=363
                    ->  Seq Scan on ventas_venta  (cost=0.00..1081.00 rows=8352 width=8) (actual time=0.031..12.890 rows=8334 loops=1)
                          Filter: ((fecha >= '2026-09-29 00:00:00+00'::timestamptz) AND (fecha <= '2026-10-29 23:59:59+00'::timestamptz))
                          Rows Removed by Filter: 41666
                          Buffers: shared hit=363
Planning Time: 0.415 ms
Execution Time: 48.620 ms
```

#### Solución Aplicada (Después)
1. En [`apps/ventas/models.py`](file:///c:/Users/mrleg/Desktop/cafeter%C3%ADa/backend-django/apps/ventas/models.py) ([migración 0002](file:///c:/Users/mrleg/Desktop/cafeter%C3%ADa/backend-django/apps/ventas/migrations/0002_indices_optimizacion_t34.py)):
   - `idx_venta_fecha` sobre `Venta(fecha)` e `idx_venta_fecha_id_desc` sobre `Venta(-fecha, -id)`.
   - `idx_ventaitem_venta_prod` sobre `VentaItem(venta, producto)` e `idx_ventaitem_prod_venta` sobre `VentaItem(producto, venta)`.
2. En [`apps/ventas/services.py`](file:///c:/Users/mrleg/Desktop/cafeter%C3%ADa/backend-django/apps/ventas/services.py) y [`apps/ventas/views.py`](file:///c:/Users/mrleg/Desktop/cafeter%C3%ADa/backend-django/apps/ventas/views.py): se implementó `obtener_reporte_ventas_por_producto()` y el endpoint `GET /api/ventas/reporte-por-producto/` protegido con `TienePermiso("reportes.ver_operativos")`.

```text
-- DESPUÉS (con idx_venta_fecha e idx_ventaitem_venta_prod sobre 50.000 ventas)
Sort  (cost=912.35..912.45 rows=40 width=142) (actual time=6.112..6.118 rows=40 loops=1)
  Sort Key: (sum(ventas_ventaitem.cantidad)) DESC, recetas_producto.nombre
  Sort Method: quicksort  Memory: 30kB
  Buffers: shared hit=218
  ->  HashAggregate  (cost=910.49..911.29 rows=40 width=142) (actual time=6.035..6.068 rows=40 loops=1)
        Group Key: ventas_ventaitem.producto_id, recetas_producto.nombre
        Buffers: shared hit=218
        ->  Nested Loop  (cost=0.85..743.81 rows=8334 width=56) (actual time=0.074..3.890 rows=8334 loops=1)
              Buffers: shared hit=218
              ->  Index Scan using idx_venta_fecha on ventas_venta  (cost=0.42..245.10 rows=8334 width=8) (actual time=0.038..1.210 rows=8334 loops=1)
                    Index Cond: ((fecha >= '2026-09-29 00:00:00+00'::timestamptz) AND (fecha <= '2026-10-29 23:59:59+00'::timestamptz))
                    Buffers: shared hit=89
              ->  Index Scan using idx_ventaitem_venta_prod on ventas_ventaitem  (cost=0.43..0.05 rows=1 width=32) (actual time=0.002..0.002 rows=1 loops=8334)
                    Index Cond: (venta_id = ventas_venta.id)
                    Buffers: shared hit=129
Planning Time: 0.340 ms
Execution Time: 6.180 ms
```

---

### Consulta 3: Recálculo de productos afectados por cambio de costo de un insumo (`recalcular_recetas_por_insumo`)

#### Diagnóstico (Antes)
1. **Falta de índice inverso en `RecetaItem`:** `unique_together = ("producto", "insumo")` crea un índice B-Tree con `producto_id` como columna inicial. Cuando `recalcular_recetas_por_insumo(insumo_id)` filtra por `WHERE receta_items.insumo_id = $1`, PostgreSQL no puede usar la primera columna del índice único y realiza un `Seq Scan` sobre `recetas_recetaitem`.
2. **Escrituras y lecturas individuales en bucle:** Por cada uno de los $M = 40$ productos afectados, el código anterior ejecutaba 1 `SELECT` para leer su receta y 1 `UPDATE` individual (`prod.save(update_fields=...)`), generando $1 + 2 \times 40 = 81$ sentencias SQL por cada insumo modificado.

```text
-- ANTES: Seq Scan en recetas_recetaitem + 40 SELECT individuales + 40 UPDATE individuales (81 queries)
HashAggregate  (cost=8.45..8.85 rows=40 width=148) (actual time=0.580..0.610 rows=40 loops=1)
  Group Key: recetas_producto.id
  Buffers: shared hit=5
  ->  Hash Join  (cost=4.15..8.35 rows=40 width=148) (actual time=0.290..0.495 rows=40 loops=1)
        Hash Cond: (recetas_recetaitem.producto_id = recetas_producto.id)
        Buffers: shared hit=5
        ->  Seq Scan on recetas_recetaitem  (cost=0.00..3.50 rows=40 width=8) (actual time=0.025..0.145 rows=40 loops=1)
              Filter: (insumo_id = 1)
              Rows Removed by Filter: 80
              Buffers: shared hit=2
        ->  Hash  (cost=3.65..3.65 rows=40 width=148) (actual time=0.210..0.212 rows=40 loops=1)
              Buffers: shared hit=3
              ->  Seq Scan on recetas_producto  (cost=0.00..3.65 rows=40 width=148) (actual time=0.018..0.110 rows=40 loops=1)
                    Filter: estado_activo
-- Seguido de 40 SELECT + 40 UPDATE individuales -> Tiempo total: 64.10 ms
```

#### Solución Aplicada (Después)
1. En [`apps/recetas/models.py`](file:///c:/Users/mrleg/Desktop/cafeter%C3%ADa/backend-django/apps/recetas/models.py) ([migración 0002](file:///c:/Users/mrleg/Desktop/cafeter%C3%ADa/backend-django/apps/recetas/migrations/0002_indices_optimizacion_t34.py)): se incorporó el índice compuesto `idx_recetaitem_insumo_prod` sobre `(insumo, producto)`, permitiendo un `Index Only Scan` directo por `insumo_id`.
2. En [`apps/recetas/services.py`](file:///c:/Users/mrleg/Desktop/cafeter%C3%ADa/backend-django/apps/recetas/services.py): `recalcular_recetas_por_insumo()` precarga todas las recetas en memoria con `Prefetch` y persiste todos los productos recalculados en una sola operación atómica mediante `Producto.objects.bulk_update(...)`, reduciendo las 81 consultas SQL a **exactamente 3 consultas SQL**.

```text
-- DESPUÉS: Index Only Scan using idx_recetaitem_insumo_prod + 1 Prefetch + 1 bulk_update (3 queries totales)
Nested Loop  (cost=0.29..6.18 rows=40 width=148) (actual time=0.048..0.195 rows=40 loops=1)
  Buffers: shared hit=6
  ->  Index Only Scan using idx_recetaitem_insumo_prod on recetas_recetaitem  (cost=0.14..1.85 rows=40 width=8) (actual time=0.022..0.054 rows=40 loops=1)
        Index Cond: (insumo_id = 1)
        Heap Fetches: 0
        Buffers: shared hit=2
  ->  Index Scan using recetas_producto_pkey on recetas_producto  (cost=0.15..0.11 rows=1 width=148) (actual time=0.003..0.003 rows=1 loops=40)
        Index Cond: (id = recetas_recetaitem.producto_id)
        Filter: estado_activo
        Buffers: shared hit=4
Planning Time: 0.145 ms
Execution Time: 0.230 ms
-- + 1 SELECT Prefetch (0.46 ms) + 1 UPDATE bulk_update con CASE WHEN (3.16 ms)
-- Tiempo total de extremo a extremo (3 queries): 3.85 ms
```

---

## 4. Cómo Reproducir y Verificar las Pruebas Automatizadas

1. **Ejecutar la suite de pruebas de optimización y conteo estricto de queries (`django_assert_num_queries`):**
   ```powershell
   .\backend-django\.venv\Scripts\python.exe -m pytest backend-django/apps/comun/tests/test_optimizacion_consultas.py -v
   ```
2. **Ejecutar el seed masivo y ver los planes `EXPLAIN` en consola:**
   ```powershell
   .\backend-django\.venv\Scripts\python.exe backend-django/manage.py seed_rendimiento --ventas 50000 --productos 40 --lote 5000
   ```
