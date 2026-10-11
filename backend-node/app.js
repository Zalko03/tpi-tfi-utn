import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { entorno } from './src/config/env.js';
import healthRoutes from './src/routes/health.routes.js';

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

export default app;
