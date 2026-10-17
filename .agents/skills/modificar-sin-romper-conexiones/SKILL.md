---
name: modificar-sin-romper-conexiones
description: Usar cada vez que se vaya a agregar, modificar o eliminar un modelo, serializer, funcion, servicio o endpoint conectado a otras partes del sistema.
---

# Skill: Modificar sin romper conexiones

## Pasos obligatorios
1. Buscar en docs/CONNECTIONS.md y docs/ARCHITECTURE.md si el elemento es consumido por otro módulo (ej. backend-node consumiendo Django o un test existente).
2. Si afecta a más de un módulo o servicio, confirmar impacto antes de ejecutar.
3. Ejecutar la modificación en código y tests.
4. Actualizar inmediatamente docs/CONNECTIONS.md y docs/ARCHITECTURE.md.
5. Registrar la conexión modificada en docs/bitacora.md.
