# Formato Único de Errores de API — `cafe-gestion`

Este documento define el contrato obligatorio de respuestas de error para todos los servicios del proyecto (`backend-django`, `backend-node`, y en TP 3 `ai-service`).

---

## 1. Esquema JSON de Respuesta

Toda respuesta HTTP con código de estado de error ($4xx$ o $5xx$) **debe** responder un objeto JSON con la siguiente estructura:

```json
{
  "mensaje": "Descripción clara y legible para el usuario o cliente",
  "detalles": null
}
```

### Campos:
- **`mensaje`** (`string`, obligatorio): Texto explicativo en español que describe qué falló.
- **`detalles`** (`any`, opcional/nullable): Puede ser `null`, un array de strings (ej. listado de validaciones fallidas), o un objeto clave-valor indicando los campos que no superaron las reglas de validación.

---

## 2. Códigos HTTP Estándar

| Código | Significado | Cuándo se usa | Ejemplo de `mensaje` |
|---|---|---|---|
| **400** | Bad Request / Datos inválidos | Error de validación de campos, reglas de negocio violadas (ej. división por cero, cantidad $\le 0$). | `"Datos de entrada inválidos"` |
| **401** | Unauthorized | Token ausente, expirado o con firma inválida. | `"Token de autenticación no provisto o vencido"` |
| **403** | Forbidden | Usuario autenticado pero sin permisos para la acción o sobre el objeto. | `"No tiene permisos para realizar esta acción"` |
| **404** | Not Found | El recurso solicitado no existe en la base de datos. | `"Recurso no encontrado"` |
| **429** | Too Many Requests | Se superó el límite de peticiones (rate limiting). | `"Demasiadas peticiones. Intente nuevamente en unos minutos"` |
| **500** | Internal Server Error | Excepción no controlada en el servidor (sin exponer trazas internas ni datos sensibles). | `"Ocurrió un error interno en el servidor"` |
| **502** | Bad Gateway | Falla al comunicarse con un servicio dependiente (ej. Node llamando a Django o FastAPI). | `"El servicio externo no se encuentra disponible"` |

---

## 3. Ejemplos de Respuesta

### Error de Validación (400)
```json
{
  "mensaje": "La cantidad del insumo debe ser mayor a cero",
  "detalles": {
    "cantidad": ["Asegúrese de que este valor sea mayor que 0."]
  }
}
```

### Recurso no encontrado (404)
```json
{
  "mensaje": "El insumo solicitado no existe",
  "detalles": null
}
```

### Falla de servicio dependiente (502)
```json
{
  "mensaje": "No se pudo consultar el servicio de recetas en Django",
  "detalles": "Tiempo de espera agotado tras 3000ms"
}
```
