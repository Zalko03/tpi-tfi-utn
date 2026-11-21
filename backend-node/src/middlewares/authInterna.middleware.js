import crypto from 'crypto';
import { obtenerClaveInternaEventos } from '../config/env.js';

/**
 * Verifica la clave compartida entre servicios internos (Django -> Node)
 * mediante comparación en tiempo constante sobre el digest SHA-256.
 */
export const verificarClaveInterna = (req, res, next) => {
    const claveEsperada = obtenerClaveInternaEventos();
    if (!claveEsperada) {
        return res.status(500).json({
            mensaje: 'La clave interna de eventos no está configurada en el servidor',
            detalles: null,
        });
    }

    const cabecera = req.headers['x-clave-interna'] || req.header('X-Clave-Interna');
    const claveRecibida = typeof cabecera === 'string' ? cabecera.trim() : '';
    if (!claveRecibida) {
        return res.status(401).json({
            mensaje: 'Clave interna de autenticación no provista',
            detalles: null,
        });
    }

    const hashEsperado = crypto.createHash('sha256').update(claveEsperada, 'utf8').digest();
    const hashRecibido = crypto.createHash('sha256').update(claveRecibida, 'utf8').digest();

    if (!crypto.timingSafeEqual(hashEsperado, hashRecibido)) {
        return res.status(401).json({
            mensaje: 'Clave interna de autenticación inválida',
            detalles: null,
        });
    }

    return next();
};
