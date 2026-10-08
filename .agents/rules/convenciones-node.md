# Convenciones de código — `backend-node/`

Estas reglas replican el estilo del proyecto de referencia de la cátedra (UTN-prog-iv-example) para que el código sea fácil de leer para el equipo.
Si algo de esta regla choca con `AGENTS.md`, manda `AGENTS.md`. Si algo no está cubierto acá, **copiá el patrón del proyecto de referencia**, no inventes uno nuevo.

## 1. Formato y sintaxis
- ES Modules (`"type": "module"`): `import` / `export`, nunca `require`.
- Imports locales con ruta relativa **y extensión `.js`**: `import { Producto } from '../models/Producto.js';`
- Comillas simples, punto y coma al final, **4 espacios** de sangría.
- `async/await` con `try/catch`. Funciones flecha: `export const crearProducto = async (req, res) => { ... };`
- Nombres, mensajes de error y comentarios **en español**. Comentarios cortos y solo donde el "por qué" no sea obvio.
- Variables y funciones en `camelCase`; verbo + sustantivo: `crearProducto`, `obtenerProductoPorId`, `actualizarProducto`, `borrarProducto`, `verificarToken`.
- Constantes de enumeración (estados, roles, categorías) en MAYÚSCULAS: `'ADMIN'`, `'PERIFERICOS'`.
- Sin código muerto, sin funciones vacías, sin bloques de líneas en blanco, sin `console.log` de datos sensibles.

## 2. Estructura y nombres de archivos

```
backend-node/
├── app.js                  # arma y exporta la app Express (middlewares globales + prefijos de rutas)
├── server.js               # conecta a Mongo y escucha el puerto (único desvío respecto del ejemplo: permite testear app.js con supertest)
├── package.json            # "type": "module"; scripts: dev (nodemon), start, test (jest)
├── .env.example
└── src/
    ├── config/             # db.js, variables de entorno
    ├── routes/             # <recursos-plural>.routes.js
    ├── controllers/        # <recurso>.controller.js
    ├── services/           # <recurso>.service.js        (lógica de negocio)   ← agregado por la Guía
    ├── repositories/       # <recurso>.repository.js     (acceso a Mongoose)   ← agregado por la Guía
    ├── clients/            # django.client.js            (consumo de la API de Django)
    ├── sockets/            # index.js, <evento>.socket.js (Socket.IO)
    ├── models/             # PascalCase singular: HistorialPrecio.js
    ├── middlewares/        # <nombre>.middleware.js
    ├── mocks/              # datos de prueba/seed ANONIMIZADOS + colección de peticiones
    └── tests/              # <recurso>.service.test.js, etc.
```

- Cada archivo va en la carpeta de su responsabilidad. No mezclar datos de ejemplo con lógica.
- Sin carpeta `src/example/` en este proyecto.
- Capitalización: modelos en PascalCase (`Producto.js`), el resto en minúsculas con punto (`producto.controller.js`). Sin duplicados que difieran solo en mayúsculas.
- Nunca editar `node_modules` ni `package-lock.json` a mano; las dependencias se cambian con `npm`.

## 3. Capas (cada una hace una sola cosa)
- **routes**: declara endpoint → middlewares → controlador. Exporta `export default router;`.
- **controller**: lee `req`, llama al servicio, responde. **Sin lógica de negocio ni consultas a Mongoose.**
- **service**: reglas de negocio. No conoce `req` ni `res`.
- **repository**: único lugar que usa los modelos de Mongoose.
- Exportaciones: controladores, servicios y middlewares → **nombradas**; routers → **por defecto**; modelos → nombrada (`export const Producto = mongoose.model(...)`).

## 4. Rutas HTTP
- Se montan en `app.js` con prefijo en plural: `app.use('/api/historial-precios', historialPreciosRoutes);`
- En el router solo va el segmento final: `router.get('/:id', obtenerPorId);`
- Verbos: `POST /` crear, `GET /` listar (con paginación), `GET /:id`, `PUT /:id` actualizar, `PATCH /:id/<campo>` cambio parcial, `DELETE /:id` **borrado lógico**.
- Las rutas HTTP no son rutas de carpetas: no confundirlas.

## 5. Modelos Mongoose
- Variable del esquema `productoSchema`; modelo exportado con nombre en PascalCase singular.
- Validaciones con mensaje: `required: [true, 'El nombre es obligatorio']`, `min`, `enum`, `match`, `trim`, `lowercase`/`uppercase`.
- `{ timestamps: true }` en todos los esquemas.
- Borrado lógico con `estadoActivo: { type: Boolean, default: true }`.
- Referencias con `type: mongoose.Schema.Types.ObjectId, ref: '...'`.
- Dinero: `Decimal128` o enteros en centavos; **nunca** `Number` con decimales para precios.

## 6. Validación y respuestas
- Validación de entrada en el router con `express-validator`: arrays `checks<Recurso>` (opcionales) y `checks<Recurso>Obligatorios`, seguidos de `validarCampos`.
- Se valida una **lista blanca de campos**; no se pasa `req.body` crudo a `Model.create` / `findByIdAndUpdate`.
- Éxito: `res.status(200|201).json(objeto)`.
- Errores, **siempre con el mismo formato** (definido en `docs/api-errores.md`): `{ mensaje: 'Texto claro', detalles: ... }`. Códigos: 400 datos inválidos, 401 sin/vencido token, 403 sin permiso, 404 no encontrado, 429 límite, 502 falla de un servicio externo, 500 error interno (sin filtrar mensajes internos).
- Listados: `?pagina=1&limite=10`, filtros por query, respuesta con `{ datos, pagina, limite, total }`.

## 7. Seguridad (patrón del ejemplo, con ajustes del plan)
- `helmet()`, `cors` con lista blanca de orígenes, `morgan('dev')`, `express-rate-limit` global y más estricto en endpoints costosos.
- Middlewares: `verificarToken` (valida el JWT) y `verificarRol(...roles)` que se encadenan: `router.post('/', verificarToken, verificarRol('DUENIO'), crear);`
- **Node NO emite tokens ni tiene `/login`**: el único emisor es Django. Node valida con la clave pública (`JWT_PUBLIC_KEY`), no con un `JWT_SECRET` compartido.
- Secretos solo en `.env` (ignorado por Git). Toda variable nueva se documenta en `.env.example` sin valor real.

## 8. Qué NO copiar del proyecto de referencia
- Controladores con lógica y consultas mezcladas.
- Formatos de error distintos (`detalle`, `detalles`, `error`).
- `Model.create(req.body)` sin lista blanca de campos.
- Insertar en la base la salida de una IA **sin validarla**, o armar prompts concatenando texto del usuario sin sanearlo.
- Funciones de relleno (`registrarUsuario2`), líneas en blanco en bloque, `src/example/`.
- Arrancar el servidor al importar `app.js` (rompe los tests).

## 9. Lista de comprobación antes de cada commit
- [ ] El archivo está en la carpeta correcta y el nombre coincide con los imports (capitalización incluida).
- [ ] Imports locales con ruta relativa correcta y terminados en `.js`.
- [ ] Exportaciones coinciden con cómo se importan.
- [ ] Ruta nueva declarada en su router y montada en `app.js`.
- [ ] Controlador delgado: la lógica está en el servicio, el acceso a datos en el repositorio.
- [ ] Errores con el formato único. Sin secretos ni datos reales.
- [ ] Tests nuevos en verde y `npm run dev` arranca.
