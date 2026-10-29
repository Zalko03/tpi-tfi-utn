import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { entorno } from './src/config/env.js';
import healthRoutes from './src/routes/health.routes.js';
import historialPreciosRoutes from './src/routes/historialPrecio.routes.js';
import snapshotCosteoRoutes from './src/routes/snapshotCosteo.routes.js';
import productoResumenRoutes from './src/routes/productoResumen.routes.js';
import importacionIARoutes from './src/routes/importacionIA.routes.js';
import { corsRestringido } from './src/middlewares/cors.middleware.js';
import { sanitizarNoSql } from './src/middlewares/nosqlSanitize.middleware.js';
import { limitadorGeneral } from './src/middlewares/rateLimit.middleware.js';
import { errorHandler } from './src/middlewares/error.middleware.js';

const app = express();

// Endurecimiento de cabeceras HTTP con Helmet (T2.5)
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:'],
            },
        },
        crossOriginEmbedderPolicy: false,
    })
);

// Política de CORS restrictiva sin comodín '*' (T2.5)
app.use(corsRestringido);

// Rate limiting perimetral general (T2.5)
app.use(limitadorGeneral);

// Logging seguro: en test se omite para no ensuciar la salida
if (entorno !== 'test') {
    app.use(morgan('dev'));
}

// Parseo de JSON en body
app.use(express.json());

// Sanitización y prevención activa de inyecciones NoSQL ($ o .) (T2.5)
app.use(sanitizarNoSql);

app.use('/health', healthRoutes);
app.use('/api/historial-precios', historialPreciosRoutes);
app.use('/api/snapshots-costeo', snapshotCosteoRoutes);
app.use('/api/productos', productoResumenRoutes);
app.use('/api/importaciones', importacionIARoutes);
app.use('/importaciones', importacionIARoutes);

// Manejador centralizado de errores con formato único (docs/api-errores.md)
app.use(errorHandler);

export default app;
