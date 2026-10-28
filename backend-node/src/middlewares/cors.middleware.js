import cors from 'cors';
import { origenesPermitidos } from '../config/env.js';

/**
 * Middleware de CORS endurecido según T2.5 y docs/seguridad.md.
 * Restringe el acceso a una lista explícita de orígenes, prohibiendo el comodín '*'.
 */
export const configurarCors = (listaOrigenes = origenesPermitidos) => {
    return cors({
        origin: (origin, callback) => {
            // Permitir peticiones sin cabecera Origin (mismo origen, herramientas locales, curl o tests)
            if (!origin) {
                return callback(null, true);
            }

            if (listaOrigenes.includes(origin)) {
                return callback(null, true);
            }

            const error = new Error(`El origen ${origin} no está autorizado por la política CORS`);
            error.status = 403;
            return callback(error);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    });
};

export const corsRestringido = configurarCors();
