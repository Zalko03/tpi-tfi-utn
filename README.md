# cafe-gestion

Sistema de gestión para una cafetería: costeo de recetas, control de caja/ventas y cálculo de rentabilidad.
Trabajo Final Integrador — Programación IV, UTN FRRe.

---

## Arquitectura

| Servicio | Tecnología | Rol |
|---|---|---|
| `backend-django` | Django 5 + DRF + PostgreSQL 16 | Núcleo transaccional: usuarios, insumos, recetas, ventas, caja, costeo |
| `backend-node` | Express + Mongoose + MongoDB 7 + Socket.IO | Historial de precios, snapshots de costeo, tablero en vivo |
| `ai-service` | FastAPI + Ollama / Gemini API *(TP 3)* | Extracción de precios desde listas de proveedores; resumen semanal |
| `web` | HTML + JS *(TP 3)* | Cliente mínimo de demostración |
| `infra` | Docker Compose *(TP 4)* | Orquestación de todos los servicios |

---

## Requisitos para desarrollo local

- Python 3.11+
- Node 20 LTS
- PostgreSQL 16
- MongoDB 7
- Git

---

## Puesta en marcha (desarrollo local)

> Las instrucciones detalladas se irán completando a medida que avancen los TPs.

### 1. Clonar y configurar variables de entorno

```bash
git clone <url-del-repo>
cd cafe-gestion

# Copiar la plantilla y completar los valores locales
cp .env.example .env
# Editar .env con tus credenciales de desarrollo (NUNCA subas este archivo)
```

### 2. Backend Django

```bash
cd backend-django
python -m venv .venv
# Windows: .venv\Scripts\activate  |  Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
# Verificar: GET http://localhost:8000/health
```

### 3. Backend Node

```bash
cd backend-node
npm install
npm run dev
# Verificar: GET http://localhost:3000/health
```

---

## Estructura del repositorio

```
cafe-gestion/
├── AGENTS.md               # Reglas de trabajo para el asistente de IA
├── .env.example            # Plantilla de variables de entorno (sin valores reales)
├── .gitignore
├── README.md
├── backend-django/         # Django 5 + DRF + PostgreSQL
├── backend-node/           # Express + Mongoose + Socket.IO
├── docs/
│   ├── PLAN_IMPLEMENTACION.md
│   ├── adr/                # Architectural Decision Records
│   ├── dominio/
│   │   └── seed/           # Datos anonimizados/inventados para pruebas
│   └── bitacora.md         # Registro de decisiones y trabajo por tarea
└── .agents/
    ├── rules/              # Convenciones de código (Node y Python)
    └── workflows/          # Comandos del asistente (/tarea, /cierre-clase)
```

---

## Equipo

| Integrante | Línea principal |
|---|---|
| mrleg | Django + FastAPI (miércoles) |
| Evilkitty | Node + MongoDB + Socket.IO (jueves) |

Ambos integrantes revisan los PR del otro. Los TP 0, 3 y TFI se corrigen en conjunto.

---

## Uso de inteligencia artificial

Este proyecto usa **Google Antigravity (AGY)** como asistente de desarrollo.
Las reglas de uso están en [`AGENTS.md`](AGENTS.md) y en la bitácora [`docs/bitacora.md`](docs/bitacora.md).

Compromisos del equipo:
- Cada integrante puede explicar cualquier línea de código en la defensa.
- El asistente opera una tarea por sesión, en una rama separada.
- Los commits son del equipo humano (el asistente prepara, el humano empuja y abre el PR).
- El otro integrante revisa el PR antes del merge.
- No se versiona ningún dato real del local (precios, nombres, teléfonos de proveedores).
- No se versiona ningún secreto; solo `.env.example` con valores ficticios.
