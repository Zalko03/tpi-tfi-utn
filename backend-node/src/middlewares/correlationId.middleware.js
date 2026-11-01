/**
 * Middleware para propagación y rastreo de Correlation ID (X-Request-ID) en Node (TP 4).
 */
import crypto from 'crypto';

export const correlationIdMiddleware = (req, res, next) => {
    const headerExistente = req.headers['x-request-id'] || req.headers['x-correlation-id'];
    const correlationId =
        typeof headerExistente === 'string' && headerExistente.trim().length > 0
            ? headerExistente.trim()
            : crypto.randomUUID();

    req.id = correlationId;
    req.correlationId = correlationId;
    res.setHeader('X-Request-ID', correlationId);

    next();
};
