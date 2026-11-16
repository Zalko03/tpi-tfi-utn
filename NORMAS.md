# Normas de Desarrollo del Proyecto

## 1. Commits y Git
- **Conventional Commits en español**: usar formato `feat(alcance): ...`, `fix(alcance): ...`, `docs:`, `test:`, `refactor:`.
- **Commits atómicos**: cambios pequeños, enfocados y funcionales por cada commit.
- **Seguridad en repositorios**: nunca commitear archivos `.env` reales, credenciales hardcodeadas ni symlinks recursivos.

## 2. Arquitectura y Fronteras de Servicios
- **`web/`**: SPA/PWA en vanilla JS, HTML y CSS; sin frameworks pesados.
- **`backend-django/`**: núcleo transaccional, lógica de dominio, permisos y PostgreSQL.
- **`backend-node/`**: gateway BFF, eventos en tiempo real con Socket.IO, MongoDB y proxy a IA.
- **`ai-service/`**: microservicio FastAPI + Groq para extracción de listas y resúmenes.
- **Fronteras estrictas**: no mezclar responsabilidades ni saltarse la aprobación de Node hacia Django.

## 3. Reglas de Negocio y Seguridad
- **Dinero y stock**: manejar siempre con `Decimal` en Python; nunca usar `float` para montos.
- **Arqueo ciego estricto**: el rol `CAJERO` nunca debe recibir `efectivo_esperado` ni `ventas_efectivo_total`.
- **Ventas POS**: el precio unitario nunca puede quedar en `$0.00` ni depender de fallbacks silenciosos (`|| 1` o apertura automática ficticia).
- **Ventas**: el backend (Django) calcula el precio unitario siempre desde la base de datos; nunca confía en el precio que envía el cliente/PWA. Si el precio enviado no coincide con el de la base, se ignora o se rechaza.
- **Cola offline**: eliminar cada venta sincronizada individualmente al confirmarse para evitar cobros duplicados.
- **XSS y sanitización**: escapar todo texto externo, CSV o generado por IA antes de insertar en el DOM (`escaparHtml` / `textContent`).
- **Autenticación y CORS**: nunca guardar contraseñas en texto plano ni habilitar CORS de `localhost` fuera de entornos con `DEBUG=True`.

## 4. Calidad, Tests y Linters (obligatorio antes de cerrar tarea)
- **Django**: `backend-django/.venv/bin/pytest backend-django/`
- **Node**: `cd backend-node && npm test && npm run lint`
- **AI-Service**: `ai-service/.venv/bin/pytest ai-service/`
- **Python lint**: `.venv/bin/ruff check backend-django/ ai-service/`
- **Cobertura**: toda funcionalidad nueva o bugfix debe incluir su test correspondiente.
