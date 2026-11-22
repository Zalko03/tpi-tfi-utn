# backend-django — Núcleo Transaccional y Contable (Sapori Stock)

Servicio backend principal desarrollado con **Django 5.2**, **Django REST Framework (DRF)** y **PostgreSQL 16**. Constituye la única fuente de verdad transaccional (ACID) para la identidad de usuarios, roles y permisos granulares, inventario de insumos, ingeniería de costos de recetas, turnos de caja con arqueo ciego y punto de venta (POS).

---

## 1. Responsabilidades Principales

- **Autenticación y Seguridad Asimétrica (`apps/usuarios`):**
  - Emisión y rotación de JSON Web Tokens firmados con criptografía asimétrica **RSA 2048 bits (`RS256`)** (ver [ADR-0001](../docs/adr/0001-autenticacion-jwt-rs256.md)).
  - Modelo híbrido de autorización: **3 roles base como plantillas** (`DUENIO`, `ENCARGADO`, `CAJERO`) + **26 permisos booleanos granulares** personalizables por empleado y registro de auditoría (`RegistroAuditoria`).
- **Insumos, Proveedores y Compras (`apps/insumos`):**
  - Gestión de proveedores e insumos normalizados a unidades base estrictas (`g`, `ml`, `un`).
  - Registro atómico de compras individuales y lotes confirmados desde la importación con IA, con desglose de IVA, prorrateo proporcional de costo de envío y actualización automática de costos unitarios.
- **Ingeniería de Recetas y Recálculo en Cascada (`apps/recetas`):**
  - Composición de productos de la carta mediante ítems de receta (`RecetaItem`).
  - Cálculo exacto en `Decimal` del costo total de elaboración y margen bruto, disparando recálculos automáticos cada vez que cambia el precio de un insumo.
- **Caja Diaria y Arqueo Ciego (`apps/caja`):**
  - Apertura de turno, movimientos manuales de ingreso/egreso y cierre de turno bajo regla de **arqueo ciego** (el sistema oculta el `efectivo_esperado` mientras el turno permanece `ABIERTO` y solo revela la diferencia tras registrar el `efectivo_declarado`).
- **Ventas, POS y Reportes Gerenciales (`apps/ventas`):**
  - Registro transaccional de ventas con **idempotencia por `id_operacion`** (soporte para sincronización de cola offline de la PWA) y congelamiento histórico de costo en `costo_unitario_snapshot`.
  - Reportes de ganancia real diaria, ranking de rotación de productos y cálculo matemático de punto de equilibrio y metas.

---

## 2. Estructura del Módulo

```text
backend-django/
├── manage.py
├── pytest.ini
├── requirements.txt
├── Dockerfile
├── config/
│   ├── settings/
│   │   ├── base.py          # Configuración compartida, DRF, SimpleJWT RS256 y throttling
│   │   ├── dev.py           # Entorno de desarrollo local
│   │   └── prod.py          # Endurecimiento de seguridad para producción
│   ├── urls.py              # Enrutador raíz (/api/* y /health)
│   └── wsgi.py / asgi.py
└── apps/
    ├── comun/               # Conversión de unidades (g/ml/un), paginación, manejo único de errores y middlewares
    ├── usuarios/            # Login JWT RS256, gestión de personal, permisos granulares y seed_demo
    ├── insumos/             # Modelos, serializers y services.py de Proveedores, Insumos y Compras
    ├── recetas/             # Modelos, serializers y services.py de Productos y RecetaItem
    ├── caja/                # TurnoCaja, MovimientoCaja y lógica de arqueo ciego
    ├── ventas/              # Venta, VentaItem, idempotencia offline y reportes financieros
    └── salud/               # Healthcheck superficial (/health) y profundo (/api/health/profundo/)
```

Para el detalle archivo por archivo, consultar [docs/ESTRUCTURA_Y_MANUAL_MODULOS.md](../docs/ESTRUCTURA_Y_MANUAL_MODULOS.md).

---

## 3. Instalación y Ejecución Local

### Requisitos previos
- Python 3.11+ (recomendado 3.13)
- PostgreSQL 16 (o `USE_SQLITE=True` en `.env` para desarrollo rápido y pruebas aisladas)

### Pasos de configuración
```bash
cd backend-django
python -m venv .venv
# En Linux/macOS:
source .venv/bin/activate
# En Windows (PowerShell):
.\.venv\Scripts\Activate.ps1

pip install -r requirements.txt
python manage.py migrate
```

### Carga de datos de demostración (solo en desarrollo con `DJANGO_DEBUG=True`)
```bash
SEED_DEMO_PASSWORD="<clave-demo-local>" python manage.py seed_demo
```

### Levantar el servidor
```bash
python manage.py runserver 8000
```

---

## 4. Pruebas Automatizadas, Cobertura y Calidad de Código

La suite cuenta con **412 pruebas automatizadas** (unitarias de servicios, integración de endpoints DRF, seguridad de permisos y control de consultas $N+1$ con `assertNumQueries`).

```bash
# Ejecutar toda la suite de tests
USE_SQLITE=True pytest

# Ejecutar tests con reporte de cobertura de código (coverage)
USE_SQLITE=True pytest --cov=apps --cov-report=term-missing

# Verificar estilo y formato con Ruff
ruff check .
ruff format --check .
```
