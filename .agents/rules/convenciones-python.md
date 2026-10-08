# Convenciones de código — `backend-django/` y `ai-service/`

> **Propuesta:** el proyecto de referencia es solo Node. Esta regla traslada su *espíritu* (español, capas separadas, un formato de error único, nombres predecibles) a Python respetando PEP 8. Confirmar con el equipo.

## 1. Formato
- Python 3.11+, 4 espacios, `ruff` + `black`. **`snake_case`** para funciones, variables y campos (PEP 8); `PascalCase` para clases.
- Nombres del dominio, mensajes y comentarios **en español**: `calcular_costo_unitario`, `Insumo`, `RecetaItem`, `TurnoCaja`.
- Verbo + sustantivo en funciones: `crear_venta`, `obtener_costo_producto`, `recalcular_recetas_afectadas`.
- Estados/roles/categorías en MAYÚSCULAS: `'DUENIO'`, `'ENCARGADO'`, `'CAJERO'`.
- Dinero: `Decimal`, nunca `float`. Unidades base: `g`, `ml`, `un` (conversión en un único servicio).

## 2. Estructura Django (una app por dominio)
```
backend-django/
├── manage.py
├── config/                 # settings (base/dev/prod), urls raíz, wsgi
└── apps/
    ├── usuarios/           # usuarios, roles, JWT
    ├── insumos/            # proveedores, insumos, compras
    ├── recetas/            # productos, recetas, costeo
    ├── ventas/             # ventas, items
    └── caja/               # turnos, movimientos
        ├── models.py       # un modelo por clase, PascalCase singular
        ├── serializers.py  # validaciones de negocio
        ├── views.py        # ViewSets delgados
        ├── services.py     # lógica de negocio (costos, prorrateo, márgenes)
        ├── permissions.py  # permisos por rol y por objeto
        ├── urls.py
        └── tests/          # test_<servicio>.py
```
- **Vistas delgadas, lógica en `services.py`.** Nada de cálculos de costo dentro de views, serializers o signals ocultos.
- Rutas en plural bajo `/api/`: `/api/insumos/`, `/api/productos/`, `/api/ventas/`.
- Borrado lógico con `estado_activo` (igual que el ejemplo de Node).

## 3. Errores y contrato JSON
- **Mismo formato de error que Node**: `{ "mensaje": "...", "detalles": ... }`, implementado con un `exception_handler` propio de DRF. Mismos códigos HTTP (400, 401, 403, 404, 429, 502, 500).
- Listados paginados con `{ datos, pagina, limite, total }` (mismo contrato que Node).
- **Claves JSON de Django en `snake_case`** (por defecto de DRF, sin dependencias extra). Node traduce a `camelCase` **en un solo lugar**: `src/clients/django.client.js`. Registrar la decisión en un ADR.

## 4. FastAPI (`ai-service/`)
```
ai-service/
└── app/
    ├── main.py             # crea la app y monta los routers
    ├── routers/            # <recurso>.py
    ├── schemas/            # modelos Pydantic v2 (entradas y salidas)
    ├── services/           # llamadas al proveedor de IA (adapter: ollama / gemini)
    ├── prompts/v1/         # prompts versionados en archivos de texto
    └── tests/
```
- Toda salida de la IA pasa por un esquema Pydantic antes de usarse; si no valida, se devuelve la respuesta de contingencia.
- El texto del usuario se pasa como **dato**, nunca se concatena dentro de las instrucciones del prompt.

## 5. Seguridad y secretos
- Django es el **único emisor de JWT** (RS256, clave privada solo en Django).
- Secretos solo en `.env`; `.env.example` sin valores reales. Sin datos reales del local.

## 6. Lista de comprobación antes de cada commit
- [ ] Lógica en `services.py`, no en vistas ni serializers.
- [ ] Errores con el formato único. Permisos probados con un test negativo.
- [ ] `ruff`/`black` sin errores; tests nuevos en verde.
- [ ] Migraciones generadas, revisadas y commiteadas junto con el modelo.
