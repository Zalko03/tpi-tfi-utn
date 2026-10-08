# Proyecto: sistema de gestión para cafetería (TFI Programación IV, UTN FRRe)

## Contexto
Monorepo: backend-django (Django 5 + DRF + PostgreSQL), backend-node (Express + Mongoose + MongoDB + Socket.IO),
ai-service (FastAPI + proveedor de IA, desde TP3), web (cliente mínimo), infra (Docker), docs.
Fuente de verdad del alcance: docs/PROPUESTA.md y docs/PLAN_IMPLEMENTACION.md. No agregues tecnologías fuera de esas.

## Reglas de trabajo (obligatorias)
1. Trabajá UNA tarea por sesión (ej. T1.3). Si no está en el plan, preguntá antes.
2. Creá la rama `feature/<id>-<slug>` desde main. NUNCA hagas push a main, ni merge, ni force push.
3. Commits pequeños (2–5 por tarea), Conventional Commits en español. Cada commit debe dejar el proyecto funcionando.
4. Lógica de negocio en servicios, no en vistas/controladores. Controladores delgados.
5. Escribí tests junto con el código (pytest / Jest). No marques la tarea como lista si fallan.
6. NUNCA escribas secretos reales. Solo `.env.example`. Nunca leas ni imprimas `.env`.
7. NUNCA incluyas datos reales del local (precios reales, teléfonos, nombres). Usá datos inventados.
8. Todo error de API usa el formato único definido en docs/api-errores.md.
9. Al terminar: actualizá docs/bitacora.md (qué hiciste, por qué, qué archivos, cómo probarlo) y detenete.
   El equipo debe poder explicar cada línea: dejá comentarios solo donde el "por qué" no sea obvio y explicá decisiones en la bitácora.
10. Si hay ambigüedad de negocio, usá docs/PLAN_IMPLEMENTACION.md §3 (reglas de negocio) o preguntá. No inventes fórmulas.
11. Estilo de código: en backend-node/ seguí `.agents/rules/convenciones-node.md` (replica el proyecto de referencia de la cátedra);
    en backend-django/ y ai-service/ seguí `.agents/rules/convenciones-python.md`. Si un patrón no está cubierto, copiá el del proyecto
    de referencia en vez de inventar uno nuevo. Código en español, controladores delgados, un único formato de error.

## Convenciones generales
- Python 3.11+, ruff + black, pytest. Node 20 LTS, ESLint + Prettier, Jest.
- Dinero: Decimal en Python, enteros en centavos o Decimal128 en Mongo. Nunca float.
- Unidades base: g, ml, un. Convertir en un único servicio.
