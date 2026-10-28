import rateLimit from 'express-rate-limit';
import { entorno } from '../config/env.js';

/**
 * Middleware de Rate Limiting para backend-node según T2.5 y docs/api-errores.md.
 */

const esTest = entorno === 'test';

export const limitadorGeneral = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    limit: esTest ? 1000 : 100, // En producción 100 reqs por ventana
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            mensaje: 'Demasiadas peticiones. Intente nuevamente en unos minutos',
            detalles: null,
        });
    },
});

export const limitadorConsultasCostosas = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: esTest ? 500 : 30, // 30 reqs por ventana para endpoints costosos
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            mensaje: 'Demasiadas peticiones. Intente nuevamente en unos minutos',
            detalles: null,
        });
    },
});

/**
 * Fábrica de limitador para tests unitarios o de integración específicos.
 */
export const crearLimitadorTest = (max = 2, windowMs = 60000) => {
    return rateLimit({
        windowMs,
        limit: max,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (req, res) => {
            res.status(429).json({
                mensaje: 'Demasiadas peticiones. Intente nuevamente en unos minutos',
                detalles: null,
            });
        },
    });
};
