import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { entorno } from '../config/env.js';
import { obtenerUsuarioIdDeToken } from './auth.middleware.js';

/**
 * Middleware de Rate Limiting para backend-node según T2.5 y docs/api-errores.md.
 */

const esTest = entorno === 'test';
const VENTANA_15_MIN_MS = 15 * 60 * 1000;
const cacheUsuarioPorRequest = new WeakMap();

const manejarExcesoPeticiones = (req, res) => {
    res.status(429).json({
        mensaje: 'Demasiadas peticiones. Intente nuevamente en unos minutos',
        detalles: null,
    });
};

const resolverUsuarioIdRequest = (req) => {
    if (cacheUsuarioPorRequest.has(req)) {
        return cacheUsuarioPorRequest.get(req);
    }
    const cabecera = req.headers?.authorization || req.header?.('Authorization');
    const usuarioId = obtenerUsuarioIdDeToken(cabecera);
    cacheUsuarioPorRequest.set(req, usuarioId);
    return usuarioId;
};

const clavePorUsuarioOIp = (req) => {
    const usuarioId = resolverUsuarioIdRequest(req);
    if (usuarioId !== null) {
        return `usuario:${usuarioId}`;
    }
    return ipKeyGenerator(req.ip || '127.0.0.1');
};

/**
 * Fábrica del limitador general que distingue usuarios autenticados (JWT válido) e IP.
 */
export const crearLimitadorGeneral = ({
    limiteAutenticado = esTest ? 1000 : 600,
    limiteAnonimo = esTest ? 1000 : 100,
    windowMs = VENTANA_15_MIN_MS,
} = {}) => {
    return rateLimit({
        windowMs,
        limit: (req) =>
            resolverUsuarioIdRequest(req) !== null ? limiteAutenticado : limiteAnonimo,
        keyGenerator: clavePorUsuarioOIp,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: manejarExcesoPeticiones,
    });
};

export const limitadorGeneral = crearLimitadorGeneral();

/**
 * Fábrica de limitador específico para endpoints de IA por usuario o IP.
 */
export const crearLimitadorIA = ({
    limite = esTest ? 500 : 20,
    windowMs = VENTANA_15_MIN_MS,
} = {}) => {
    return rateLimit({
        windowMs,
        limit: limite,
        keyGenerator: clavePorUsuarioOIp,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: manejarExcesoPeticiones,
    });
};

export const limitadorIA = crearLimitadorIA();

export const limitadorConsultasCostosas = rateLimit({
    windowMs: VENTANA_15_MIN_MS,
    limit: esTest ? 500 : 30, // 30 reqs por ventana para endpoints costosos
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: manejarExcesoPeticiones,
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
        handler: manejarExcesoPeticiones,
    });
};
