import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { entorno, nodeTrustProxySaltos } from './src/config/env.js';
import healthRoutes from './src/routes/health.routes.js';
import historialPreciosRoutes from './src/routes/historialPrecio.routes.js';
import snapshotCosteoRoutes from './src/routes/snapshotCosteo.routes.js';
import productoResumenRoutes from './src/routes/productoResumen.routes.js';
import importacionIARoutes from './src/routes/importacionIA.routes.js';
import resumenSemanalRoutes from './src/routes/resumenSemanal.routes.js';
import { corsRestringido } from './src/middlewares/cors.middleware.js';
import { sanitizarNoSql } from './src/middlewares/nosqlSanitize.middleware.js';
import { limitadorGeneral } from './src/middlewares/rateLimit.middleware.js';
import { errorHandler } from './src/middlewares/error.middleware.js';
import { correlationIdMiddleware } from './src/middlewares/correlationId.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rutaClienteWeb = path.resolve(__dirname, '../web');

const app = express();
app.set('trust proxy', nodeTrustProxySaltos);

// Trazabilidad y correlación distribuida de peticiones (TP 4)
app.use(correlationIdMiddleware);

// Endurecimiento de cabeceras HTTP con Helmet (T2.5)
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:'],
                connectSrc: [
                    "'self'",
                    'http://localhost:8000',
                    'http://localhost:3000',
                    'ws://localhost:3000',
                    'http://127.0.0.1:8000',
                    'http://127.0.0.1:3000',
                    'ws://127.0.0.1:3000',
                ],
            },
        },
        crossOriginEmbedderPolicy: false,
    })
);

// Política de CORS restrictiva sin comodín '*' (T2.5)
app.use(corsRestringido);

// Logging seguro: en test se omite para no ensuciar la salida
if (entorno !== 'test') {
    app.use(morgan('dev'));
}

// Cliente mínimo PWA y chequeo de salud sin rate limiting para no gastar cupo de API
app.use('/app', express.static(rutaClienteWeb));
app.use('/health', healthRoutes);

// Rate limiting perimetral general (T2.5)
app.use(limitadorGeneral);

// Parseo de JSON en body
app.use(express.json());

// Sanitización y prevención activa de inyecciones NoSQL ($ o .) (T2.5)
app.use(sanitizarNoSql);

app.use('/api/historial-precios', historialPreciosRoutes);
app.use('/api/snapshots-costeo', snapshotCosteoRoutes);
app.use('/api/productos', productoResumenRoutes);
app.use('/api/importaciones', importacionIARoutes);
app.use('/importaciones', importacionIARoutes);
app.use('/v1/resumen-semanal', resumenSemanalRoutes);

// Manejador centralizado de errores con formato único (docs/api-errores.md)
app.use(errorHandler);

export default app;
