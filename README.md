# cafe-gestion

Sistema de gestión comercial y contable integral para cafetería de especialidad y panadería artesanal: costeo dinámico de recetas por lote y porción, control de arqueo ciego y caja diaria, punto de venta (POS) de alto rendimiento con interfaz editorial **Impeccable UI**, cola de ventas offline en `localStorage`, importación híbrida de listas de precios con inteligencia artificial (Groq LPU / Gemini) y contingencia determinista en CSV, y consultoría gerencial de stock crítico y auditoría en tiempo real.

Trabajo Final Integrador (TFI) — Programación IV, UTN FRRe.

---

## Estado del Proyecto y Capacidades Implementadas

* **TP 0:** Fundaciones del monorepo, convenciones y arquitectura base políglota.
* **TP 1:** Núcleo contable transaccional (Django 5 + PostgreSQL 16) y subdominio documental de auditoría (Node 20 + MongoDB 7).
* **TP 2:** Autenticación asimétrica con JWT RS256, roles granulares (Dueño, Encargado, Cajero), arqueo ciego y endurecimiento perimetral.
* **TP 3:** Microservicio de IA (`ai-service` FastAPI + Pydantic v2 + GroqAdapter / Gemini / Ollama), eventos en vivo con Socket.IO y cliente PWA offline-first.
* **TP 4 & Entrega Final TFI:**
  * **Punto de Venta Comercial (POS) de Alta Velocidad:** Búsqueda reactiva instantánea por nombre/código, soporte nativo de lector de código de barras (HID / EAN-13 / UPC), atajos de teclado para mostrador y estética visual editorial **Impeccable UI**.
  * **Modo Sin Internet y Cola Offline (`localStorage`):** Resguardo local transaccional (`sapori_cola_ventas_offline`) ante cortes de red o caídas de servidor y sincronización automática con confirmación individual al recuperar conectividad (`window.ononline`).
  * **Importador Híbrido de Listas de Precios:** Extracción multimodal con IA para listas desestructuradas (Groq / Gemini) combinado con importador CSV determinista de contingencia.
  * **Consultor IA de Stock Crítico y Auditoría de Cierre de Caja:** Diagnóstico en tiempo real para el Propietario mediante `GroqAdapter` (LPU Cloud ultrarrápido sin consumo local de CPU/RAM) con fallback determinista inmediato ante cortes o falta de credenciales.
  * **Endurecimiento, Observabilidad y Calidad:** Trazabilidad distribuida (`X-Request-ID`), logging estructurado JSON con sanitización de credenciales, respaldo automatizado y **580+ tests automatizados pasando en verde**.

---

## Arquitectura de Servicios

| Servicio | Tecnología | Rol Principal | Puerto Local |
|---|---|---|---|
| `web` (PWA) | HTML5, CSS3, JS ES Modules, `localStorage`, Service Worker | POS comercial editorial **Impeccable UI**, cola offline transaccional, lector HID, tablero en vivo y consultoría IA | 80 (vía Nginx) |
| `web-proxy` | Nginx 1.27 Alpine (no-root) | Reverse proxy perimetral, compresión Gzip, enrutamiento semántico y entrega de la PWA estática | 80 |
| `backend-django` | Django 5 + DRF + PostgreSQL 16 + Gunicorn 23 | Núcleo transaccional: insumos, recetas, compras, ventas, arqueos de caja y emisor maestro de JWT RS256 | 8000 (interno) |
| `backend-node` | Express 5 + Mongoose + MongoDB 7 + Socket.IO 4 | Subdominio documental (`historial_precios`, `snapshots_costeo`), salas WebSocket y orquestación de IA | 3000 (interno) |
| `ai-service` | FastAPI + Pydantic v2 + Groq LPU / Gemini / Ollama | Inferencia ultrarrápida con `GroqAdapter` (LPU Cloud), extracción de listas, diagnóstico de stock y fallback | 8001 (interno) |
| `postgres` | PostgreSQL 16 Alpine | Base de datos relacional ACID para contabilidad y stock (volumen persistente `postgres_data`) | 5432 (interno) |
| `mongodb` | MongoDB 7.0 (WiredTiger 0.25GB) | Base de datos documental para auditoría e historial cronológico (volumen `mongo_data`) | 27017 (interno) |

---

## Características Destacadas del Sistema

### 1. Punto de Venta (POS) Comercial e Impeccable UI
- **Estética Editorial Impeccable:** Jerarquía tipográfica refinada, paleta de café de especialidad cálida y contrastes conformes a estándares de accesibilidad WCAG AA.
- **Operación Rápida en Mostrador:** Búsqueda en vivo de productos, disparo de venta con escáner de código de barras físico o manual, y catálogo categorizado (Cafetería, Pastelería, Almacén).
- **Atajos de Teclado:** Foco directo en barra de búsqueda/lector (`F4`), agregado de ítem buscado (`Enter` en el buscador), cobro rápido (`F2`), y cierre de modales/paneles (`Esc`).

### 2. Resiliencia Offline con Cola en `localStorage`
- Ante cortes de conexión a Internet o indisponibilidad del servidor, el sistema conmuta automáticamente al **Modo Sin Internet Activo**.
- Las ventas se resguardan de forma segura en `localStorage` bajo la clave `sapori_cola_ventas_offline`, preservando productos, cantidades y medio de pago (requiere sesión JWT vigente previamente autenticada).
- Al restaurarse la conexión (`online`), el cliente sincroniza la cola confirmando y eliminando cada venta individualmente para evitar cobros duplicados ante cortes intermedios.

### 3. Importador Híbrido de Precios y Contingencia
- **Vía Inteligente (IA Multimodal):** Ingesta listas desestructuradas de proveedores (PDF/texto) reconociendo nombres, marcas, presentaciones y precios unitarios.
- **Vía Determinista (CSV Contingente):** En caso de corte de red externa o agotamiento de cuota, el importador CSV procesa las planillas de contingencia aplicando normalización de unidades y prorrateo de fletes de forma 100% determinista.

### 4. Consultor IA de Stock Crítico y Auditoría de Cierre de Caja
- **GroqAdapter (LPU Cloud):** Inferencia de baja latencia mediante modelos de última generación (Llama 3.3 70B Versatile) sin sobrecargar de cómputo el hardware del local.
- **Diagnóstico de Stock:** Identificación de insumos críticos con mayor desvío de costo o quiebre de stock, y cálculo de impacto directo en márgenes de recetas.
- **Auditoría de Caja:** Análisis del arqueo ciego, cotejo de ventas por medio de pago (Efectivo, Transferencia, Tarjeta) y detección automática de sobrantes o faltantes.
- **Fallback Determinista Local:** Si el servicio de IA no responde, el sistema genera inmediatamente un dictamen analítico en base a reglas de negocio puras.

---

## Puesta en Marcha con Docker Compose (Un solo comando)

Modalidad oficial para producción (PC local o nube, respaldada por la sección 3.5 de la Guía y ADR 0003):

### 1. Clonar el repositorio y preparar variables de entorno
```bash
git clone https://github.com/tu-usuario/tpi-tfi-utn.git
cd tpi-tfi-utn
cp .env.example .env
```
*(Configurar `GROQ_API_KEY` o `GEMINI_API_KEY` en `.env` para habilitar el Consultor IA y la extracción de listas).*

### 2. Ejecutar el script automatizado de despliegue
```bash
./scripts/desplegar.sh
```
O directamente con Docker Compose:
```bash
docker compose up -d --build
```

### 3. Cargar catálogo de demostración gastronómico
```bash
docker compose exec backend-django python manage.py seed_demo
```

### 4. Acceder al sistema
* **PWA / Tablero y POS:** [http://localhost](http://localhost) (o dominio / IP pública asignada).
* **Diagnóstico de salud general:** [http://localhost/healthz](http://localhost/healthz)
* **Diagnóstico profundo Django:** [http://localhost/api/health/profundo/](http://localhost/api/health/profundo/)
* **Diagnóstico profundo Node:** [http://localhost/health/profundo/](http://localhost/health/profundo/)

---

## Puesta en Marcha para Desarrollo Local (Sin Docker)

### 1. Variables de entorno locales
```bash
cp .env.example .env
echo "USE_SQLITE=True" >> .env
```

### 2. backend-django
```bash
cd backend-django
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 8000
```

### 3. backend-node
```bash
cd backend-node
npm ci
npm run dev
```

### 4. ai-service
```bash
cd ai-service
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8001 --reload
```

---

## Suites de Pruebas y Calidad de Código

El proyecto cuenta con **582 tests automatizados** distribuidos entre pruebas unitarias puras, integración y ensayos de resiliencia en el pipeline de GitHub Actions (`.github/workflows/ci.yml`):

* **backend-django:** **375 tests pasando** (pytest + pytest-django)
  ```bash
  backend-django/.venv/bin/pytest backend-django/
  ```
* **backend-node:** **140 tests pasando** (Jest con soporte nativo de ES Modules)
  ```bash
  cd backend-node && npm test
  ```
* **ai-service:** **67 tests pasando** (pytest + anyio/asyncio)
  ```bash
  ai-service/.venv/bin/pytest ai-service/
  ```
* **Total:** **582 tests automatizados pasando 100% en verde.**

### Verificación de Linters y Estilo
* **Python (Ruff):** `.venv/bin/ruff check backend-django/ ai-service/`
* **Node.js (ESLint):** `cd backend-node && npm run lint`

---

## Operación y Mantenimiento

* **Poblar o restaurar catálogo gastronómico demo:**
  ```bash
  python backend-django/manage.py seed_demo
  ```
* **Generar respaldo consistente (PostgreSQL + MongoDB):**
  ```bash
  ./scripts/backup.sh
  ```
* **Restaurar respaldo:**
  ```bash
  ./scripts/restore.sh backups/backup_cafe_gestion_YYYYMMDD_HHMMSS.tar.gz
  ```
* **Manual de Despliegue y Arquitectura:** Consultar `docs/despliegue.md`.
