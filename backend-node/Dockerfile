# Multi-stage Dockerfile para backend-node (Express + Mongoose + Socket.IO)
# Etapa 1: Dependencias de producción
FROM node:20-alpine AS builder

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Etapa 2: Runner final
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NODE_PORT=3000

# Usar el usuario sin privilegios 'node' incluido por defecto en alpine
USER node

# Copiar dependencias de producción y código fuente con ownership de node
COPY --chown=node:node --from=builder /build/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node server.js app.js ./
COPY --chown=node:node src/ ./src/

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
