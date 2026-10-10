# Arquitectura — Sistema de gestión para cafetería

> TP 0 · Tarea T0.3. Basado solo en `docs/PLAN_IMPLEMENTACION.md` (§2, §3, §6), `docs/PROPUESTA.md` y `.agents/rules/`.
> Criterio de la guía para cada pieza: *"¿qué se rompe si la saco?"*

---

## 1. Mapa tecnológico

| Pieza | Responsabilidad en este sistema | Qué se rompe si se saca | Justificación |
|---|---|---|---|
| **Django 5 + DRF + PostgreSQL 16** | Núcleo transaccional: usuarios y roles, proveedores, insumos, compras, productos, recetas, ventas, turnos de caja. Calcula costos y márgenes y es el único emisor de JWT. | Todo: es la fuente de verdad contable. | El dinero y las relaciones entre entidades necesitan transacciones ACID y restricciones; una base relacional es lo natural. |
| **Express + Mongoose + MongoDB 7** | Subdominio documental: `historial_precios`, `snapshots_costeo`, `importaciones_ia`. Orquesta la importación con IA y sirve el tiempo real. | El historial, los snapshots y la trazabilidad de la IA; la importación deja de orquestarse. | Son datos de alto volumen, solo se agregan y tienen forma variable; en SQL serían tablas ruidosas sin necesidad de joins. |
| **FastAPI + Pydantic v2 + proveedor de IA** (adapter: Ollama y opcionalmente Gemini) | Extrae precios desde el texto de una lista de proveedor a JSON tipado y, como historia Could, genera el resumen semanal. | Cada lista de precios vuelve a cargarse a mano, que es el dolor principal del dueño. | La IA tiene un propósito concreto y acotado; el adapter permite cambiar de proveedor sin tocar el resto, y Pydantic valida toda salida antes de usarla. |
| **Socket.IO** (dentro de Node) | Tablero en vivo: ventas, ganancia, alertas de stock y de margen bajo, aviso de importación lista. Salas por local y por turno, autenticado con el JWT. | El tablero en vivo y los avisos de caja. | Los avisos tienen que llegar sin recargar la página; reutiliza el proceso de Node y no agrega otro servicio. |

El cliente web es un cliente mínimo (HTML + JS) y Django Admin hace de back-office; el frontend es de libre elección según lo confirmado con los docentes.

---

## 2. Diagrama de componentes

```mermaid
flowchart LR
    web["Cliente web"]
    admin["Django Admin"]
    django["Django y DRF"]
    node["Node: Express y Socket.IO"]
    ai["ai-service: FastAPI"]
    prov["Proveedor de IA: Ollama o Gemini"]
    pg[("PostgreSQL")]
    mongo[("MongoDB")]

    web -->|"REST: login y negocio, recibe JWT"| django
    web -->|"REST y WebSocket con JWT"| node
    admin --> django
    node -->|"REST via django.client.js"| django
    node -->|"REST: extraer precios"| ai
    ai -->|"adapter de proveedor"| prov
    django --> pg
    node --> mongo
```

Quién llama a quién:

- El cliente web inicia sesión en **Django**, que emite el JWT. Con ese token consume la API de Django y se conecta a **Node** (REST y Socket.IO).
- **Node** nunca emite tokens: solo los valida con la clave pública. Consume a Django mediante `src/clients/django.client.js` y a `ai-service` para la extracción de precios.
- **ai-service** solo habla con el proveedor de IA. No accede a Django ni a MongoDB.
- Cada servicio de datos es dueño de su base: Django de PostgreSQL y Node de MongoDB. Nadie más accede directo.
- Django avisa a Node cuando un costo se recalcula o se registra una venta; el medio de ese aviso está **pendiente** (ver §6).

---

## 3. Flujo de importación de precios con IA

Es el flujo de punta a punta del plan (§2). La aprobación humana es obligatoria: sin ella no se crea ninguna compra ni cambia ningún costo (CA7.3).

```mermaid
sequenceDiagram
    actor Dueno as Dueño
    participant Web as Cliente web
    participant Node as Node
    participant IA as ai-service y proveedor de IA
    participant Mongo as MongoDB
    participant Django as Django
    participant PG as PostgreSQL

    Dueno->>Web: Pega la lista del proveedor
    Web->>Node: POST importación
    Node-->>Web: 202 recibido, sin bloquear
    Node->>IA: Extraer precios del texto

    alt Salida válida
        IA-->>Node: JSON validado con Pydantic
        Node->>Mongo: Guarda entrada, salida, latencia y versión de prompt
        Node-->>Web: Socket.IO: importación lista, revisá los cambios
        Dueno->>Web: Revisa la propuesta de precios

        alt El dueño aprueba
            Web->>Node: Aprobar importación
            Node->>Django: Crear compra con el precio nuevo
            Django->>PG: Guarda la compra
            Django->>PG: Recalcula el costo de las recetas afectadas
            Django-->>Node: Aviso: costos actualizados
            Node->>Mongo: Guarda historial de precios y snapshot de costeo
            Node-->>Web: Socket.IO: costo actualizado y alerta si el margen baja del objetivo
        else El dueño no aprueba
            Web->>Node: Rechazar importación
            Node->>Mongo: Marca la importación como rechazada
            Note over Node,Django: No se crea compra ni cambia ningún costo
        end
    else La IA falla o devuelve salida inválida
        IA-->>Node: Error, timeout o salida que no valida
        Node->>Mongo: Guarda la entrada y el error
        Node-->>Web: Socket.IO: respuesta de contingencia
        Web-->>Dueno: Carga manual o por CSV de los precios
    end
```

Los cinco pasos del plan quedan así: (1) el `POST` responde 202; (2) Node llama a la IA, valida y guarda en Mongo; (3) Node emite el aviso por Socket.IO; (4) el dueño aprueba y Node llama a Django; (5) Django recalcula las recetas, avisa a Node y este guarda historial y snapshot. La rama de contingencia no toca ventas ni costeo.

