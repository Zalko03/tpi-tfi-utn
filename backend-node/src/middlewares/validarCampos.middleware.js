import { validationResult } from 'express-validator';
import { logger } from '../utils/logger.js';

export const validarCampos = (req, res, next) => {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
        const listaErrores = errores.array();
        logger.warn('Validación de entrada fallida', {
            correlationId: req.correlationId || null,
            metadatos: {
                ruta: req.originalUrl || req.url,
                campos: listaErrores.map((err) => ({
                    campo: err.path,
                    mensaje: err.msg,
                })),
            },
        });
        const detalles = [
            ...new Set(listaErrores.map((err) => String(err.msg || '').trim()).filter(Boolean)),
        ];
        return res.status(400).json({
            mensaje: 'Datos de entrada inválidos',
            detalles,
        });
    }
    next();
};
