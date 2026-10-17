import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { entorno } from './src/config/env.js';
import healthRoutes from './src/routes/health.routes.js';
import historialPreciosRoutes from './src/routes/historialPrecio.routes.js';
import snapshotCosteoRoutes from './src/routes/snapshotCosteo.routes.js';
import productoResumenRoutes from './src/routes/productoResumen.routes.js';
import { errorHandler } from './src/middlewares/error.middleware.js';

const app = express();

app.use(helmet());
// CORS abierto por ahora; la lista blanca de orígenes llega en T2.5.
app.use(cors());
// En test se omite el log para no ensuciar la salida de Jest.
if (entorno !== 'test') {
    app.use(morgan('dev'));
}
app.use(express.json());

app.use('/health', healthRoutes);
app.use('/api/historial-precios', historialPreciosRoutes);
app.use('/api/snapshots-costeo', snapshotCosteoRoutes);
app.use('/api/productos', productoResumenRoutes);

app.use(errorHandler);

export default app;
