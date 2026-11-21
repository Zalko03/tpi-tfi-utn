# `backend-django` — Núcleo Transaccional y Contable

Servicio principal del sistema **Sapori Stock** (`cafe-gestion`), construido con **Python 3.13**, **Django 5.2**, **Django REST Framework** y **PostgreSQL 16** (con soporte opcional de SQLite para desarrollo y CI mediante `USE_SQLITE=True`).

---

## Responsabilidades

1. **Fuente de verdad contable y transaccional (ACID):** persiste proveedores, insumos, compras, configuración fiscal del local, movimientos de stock, productos, recetas, precios de competencia, ventas, turnos de caja, movimientos de efectivo, usuarios y auditoría.
2. **Ingeniería de costos y precios:**
   - Conversión a unidades base (`g`, `ml`, `un`), prorrateo proporcional de envío en compras e inclusión/exclusión de IVA según la condición fiscal declarada (`ConfiguracionLocal`: `NO_DECLARADA`, `RESPONSABLE_INSCRIPTO`, `MONOTRIBUTISTA`, `EXENTO`).
   - Cálculo y recálculo automático de recetas (`costo_total_calculado`, `ganancia_bruta`, `margen_bruto`) usando `Decimal` (nunca `float`).
   - Cálculo de precio sugerido (`costo ÷ (1 − margen_objetivo)`) redondeado a `$50` o `$100` y acotado por referencias manuales de competencia (`PrecioCompetencia`), sin modificar `precio_venta` automáticamente.
3. **Stock real y trazabilidad:** control de `stock_actual` y `stock_minimo` en unidad base con `MovimientoStock` (`COMPRA`, `VENTA_RECETA`, `ANULACION_VENTA`, `AJUSTE_MANUAL`) mediante `select_for_update()` atómico.
4. **POS, ventas y arqueo ciego de caja:** registro idempotente de ventas (`id_operacion`), precio calculado en servidor, congelamiento de costo (`costo_unitario_snapshot`), anulación lógica (`EMITIDA` / `ANULADA`), turnos con arqueo ciego para cajeros (`caja.ver_efectivo_esperado`), reportes de ganancia diaria, ranking y punto de equilibrio.
5. **Seguridad y emisión única de JWT RS256:** emisión, refresco con rotación y blacklist de tokens RS256 (`SimpleJWT`), 3 roles plantilla (`DUENIO`, `ENCARGADO`, `CAJERO`) con **30 permisos granulares booleanos** y protección del último Dueño activo.
6. **Carta Digital Pública (HU15):** endpoint anónimo `GET /api/carta-publica/` con throttle dedicado (`60/minute`) y serializador estricto (`id`, `nombre`, `precio_venta`).
7. **Notificaciones internas hacia `backend-node`:** envío no bloqueante (`POST /api/internos/eventos` con `X-Clave-Interna` y `X-Request-ID`) al registrar/anular ventas, detectar `stock.bajo` o recalcular costos por cambio de condición fiscal.

---

## Árbol de Carpetas

```text
backend-django/
├── Dockerfile                        # Imagen multietapa (python:3.13-slim, usuario appuser no-root)
├── manage.py
├── pytest.ini                        # DJANGO_SETTINGS_MODULE = config.settings.dev
├── requirements.txt                  # Django 5.2.18, DRF, SimpleJWT, psycopg3, django-filter, gunicorn
├── config/
│   ├── __init__.py
│   ├── urls.py                       # Montaje raíz (/health, /api/health, /api/*)
│   ├── wsgi.py
│   ├── keys/                         # Claves RSA locales (no versionar privadas reales)
│   └── settings/
│       ├── __init__.py
│       ├── base.py                   # Configuración compartida, JWT RS256, CORS, throttling y logging JSON
│       └── dev.py                    # Ajustes de desarrollo
└── apps/
    ├── comun/                        # Infraestructura transversal
    │   ├── excepciones.py            # manejador_excepciones_api -> { mensaje, detalles }
    │   ├── filtros.py                # Validación de rangos de fechas
    │   ├── logging.py                # FiltroSanitizacionSeguridad y FormateadorJson
    │   ├── middleware.py             # CorrelationIdMiddleware (X-Request-ID)
    │   ├── notificaciones_node.py    # Cliente HTTP interno hacia backend-node
    │   ├── paginacion.py             # PaginacionEstandar -> { datos, pagina, limite, total }
    │   ├── throttling.py             # LoginRateThrottle, RecalculoRateThrottle, CartaPublicaRateThrottle
    │   └── tests/                    # Tests de endpoints transversales, hardening, permisos negativos y T3.4
    ├── usuarios/                     # Auth RS256, roles plantilla, 30 permisos, auditoría y acceso demo
    │   ├── checks.py                 # System check usuarios.E001 (bloquea demo rápido con DEBUG=False)
    │   ├── claves.py                 # Carga/resolución de claves RSA
    │   ├── constantes.py             # PERMISOS_CATALOGO (30) y ROLES_PLANTILLAS
    │   ├── models.py                 # PerfilUsuario y RegistroAuditoria
    │   ├── permissions.py            # Permisos DRF granulares y de objeto
    │   ├── serializers.py
    │   ├── services.py               # crear/actualizar/desactivar/activar personal, supervivencia último Dueño
    │   ├── tokens.py                 # CustomTokenObtainPairSerializer / CustomTokenRefreshSerializer
    │   ├── urls.py                   # /api/auth/*, /api/usuarios/*, /api/usuarios/auditoria/*
    │   ├── views.py
    │   ├── migrations/
    │   └── tests/                    # Unitarios (RS256, permisos, supervivencia) y API (auth, personal, demo)
    ├── insumos/                      # Proveedores, insumos, compras, condición fiscal y stock real
    │   ├── management/commands/
    │   │   ├── seed_demo.py          # Datos demo anonimizados e idempotentes (--video)
    │   │   └── seed_rendimiento.py   # Generador volumétrico (50.000 ventas para T3.4)
    │   ├── migrations/               # 0001_initial .. 0003_movimientostock_insumo_stock_actual_and_more
    │   ├── models.py                 # Proveedor, Insumo, Compra, ConfiguracionLocal, HistorialCondicionFiscal, MovimientoStock
    │   ├── serializers.py
    │   ├── services.py               # Conversión de unidades, prorrateo, IVA fiscal, stock y trazabilidad
    │   ├── urls.py                   # /api/proveedores/, /api/insumos/, /api/compras/, /api/configuracion-fiscal/*
    │   ├── views.py
    │   └── tests/
    ├── recetas/                      # Productos, recetas, costeo, precio sugerido y carta pública
    │   ├── migrations/               # 0001_initial .. 0003_producto_margen_objetivo_...
    │   ├── models.py                 # Producto, RecetaItem, PrecioCompetencia
    │   ├── serializers.py
    │   ├── services.py               # Prefetch optimizado, costeo, recálculo en lote, precio sugerido
    │   ├── urls.py                   # /api/productos/, /api/recetas-items/, /api/precios-competencia/, /api/carta-publica/
    │   ├── views.py
    │   └── tests/
    ├── caja/                         # Turnos de caja y movimientos de efectivo
    │   ├── migrations/
    │   ├── models.py                 # TurnoCaja (calcular_efectivo_esperado), MovimientoCaja
    │   ├── serializers.py
    │   ├── services.py               # abrir_turno, validar_movimiento_en_turno, registrar_movimiento_caja
    │   ├── urls.py                   # /api/turnos/, /api/caja/turnos/, /api/caja/movimientos/
    │   ├── views.py
    │   └── tests/
    ├── ventas/                       # POS, anulación, snapshots de costo y reportes financieros
    │   ├── migrations/               # 0001_initial .. 0005_venta_anulada_en_...
    │   ├── models.py                 # Venta, VentaItem
    │   ├── serializers.py
    │   ├── services.py               # registrar_venta, anular_venta, ganancia_diaria, ranking, punto_equilibrio
    │   ├── urls.py                   # /api/ventas/
    │   ├── views.py
    │   └── tests/
    └── salud/                        # Liveness y readiness (/health, /api/health, /api/health/profundo/)
        ├── services.py
        ├── urls.py
        ├── views.py
        └── tests/
```

---

## Endpoints Principales

| Grupo | Rutas principales |
|---|---|
| **Salud** | `GET /health/`, `GET /api/health/`, `GET /api/health/profundo/` |
| **Autenticación y Personal** | `POST /api/auth/token/`, `POST /api/auth/token/refresh/`, `POST /api/auth/logout/`, `GET/POST /api/auth/demo/`, `CRUD /api/usuarios/`, `POST /api/usuarios/:id/ajustar-permisos/`, `GET /api/usuarios/auditoria/` |
| **Insumos, Compras, Stock y Fiscal** | `CRUD /api/proveedores/`, `CRUD /api/insumos/`, `POST /api/insumos/:id/ajustar-stock/`, `GET /api/insumos/stock-bajo/`, `GET /api/insumos/movimientos-stock/`, `GET /api/insumos/movimientos/`, `CRUD /api/compras/`, `POST /api/compras/confirmar-importacion/`, `GET/PUT/PATCH /api/configuracion-fiscal/`, `GET /api/configuracion-fiscal/estado/`, `GET /api/configuracion-fiscal/historial/` |
| **Recetas, Sugerido y Carta** | `CRUD /api/productos/`, `GET /api/productos/:id/precio-sugerido/`, `POST /api/productos/recalcular/`, `CRUD /api/recetas-items/`, `CRUD /api/precios-competencia/`, `GET /api/carta-publica/` |
| **Caja y Ventas** | `CRUD /api/caja/turnos/`, `POST /api/caja/turnos/:id/cerrar/`, `CRUD /api/caja/movimientos/`, `CRUD /api/ventas/`, `POST /api/ventas/:id/anular/`, `GET /api/ventas/ganancia-diaria/`, `GET /api/ventas/ranking-productos/`, `GET/POST /api/ventas/punto-equilibrio/`, `GET /api/ventas/reporte-por-producto/` |

Todos los errores responden con el contrato único `{ "mensaje": "...", "detalles": ... }` definido en [`docs/api-errores.md`](../docs/api-errores.md).

---

## Comandos

### Entorno local (desarrollo)

```bash
cd backend-django
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Aplicar migraciones (con PostgreSQL o USE_SQLITE=True en .env)
.venv/bin/python manage.py migrate

# Levantar servidor de desarrollo en :8000
.venv/bin/python manage.py runserver 8000
```

### Generación de claves JWT RS256 (si aún no existen)

```bash
mkdir -p backend-django/config/keys
openssl genrsa -out backend-django/config/keys/private.pem 2048
openssl rsa -in backend-django/config/keys/private.pem -pubout -out backend-django/config/keys/public.pem
```

### Seed de demostración y rendimiento

```bash
cd backend-django
DJANGO_DEBUG=True SEED_DEMO_PASSWORD="<clave-demo>" .venv/bin/python manage.py seed_demo --video
.venv/bin/python manage.py seed_rendimiento --ventas 50000 --productos 40 --lote 5000
```

### Pruebas y linter

```bash
# Suite completa (570 tests: 348 unit + 216 api + 6 optimización)
# Nota: si tu .env local tiene DEMO_ACCESO_RAPIDO=true, pasá DEMO_ACCESO_RAPIDO=false
cd backend-django
DEMO_ACCESO_RAPIDO=false .venv/bin/python -m pytest -q

# Solo unitarias o solo API
.venv/bin/python -m pytest -q apps/*/tests/unit/
DEMO_ACCESO_RAPIDO=false .venv/bin/python -m pytest -q apps/*/tests/api/

# Linter y formato desde la raíz del repo
cd ..
.venv/bin/ruff check backend-django/
.venv/bin/ruff format --check backend-django/
```

### Contenedor Docker

```bash
docker compose up -d --build backend-django
```
