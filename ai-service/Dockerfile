# Multi-stage Dockerfile para ai-service (FastAPI + Pydantic v2 + Proveedor IA)
# Etapa 1: Builder
FROM python:3.13-slim AS builder

WORKDIR /build

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Etapa 2: Runner final
FROM python:3.13-slim AS runner

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/install/bin:$PATH" \
    PYTHONPATH="/install/lib/python3.13/site-packages:$PYTHONPATH"

# Copiar paquetes instalados desde builder
COPY --from=builder /install /install

# Crear usuario y grupo sin privilegios (no-root)
RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -s /bin/bash -m appuser

# Copiar el código de la aplicación
COPY --chown=appuser:appgroup ./app /app/app

USER appuser

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request, sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8001/health').getcode() == 200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
