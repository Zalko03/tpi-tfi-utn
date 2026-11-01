/**
 * Utilidad de logging estructurado JSON con correlación y sanitización (TP 4).
 */
import { enmascararDatosSensibles } from './sanitizarLogs.js';

export const formatearLogJson = ({
    nivel = 'INFO',
    mensaje = '',
    correlationId = null,
    metadatos = {},
}) => {
    const sanitizado = enmascararDatosSensibles(metadatos);

    const logObjeto = {
        timestamp: new Date().toISOString(),
        nivel: String(nivel).toUpperCase(),
        servicio: 'backend-node',
        mensaje: String(mensaje),
        correlationId: correlationId || null,
        metadatos: sanitizado && Object.keys(sanitizado).length > 0 ? sanitizado : undefined,
    };

    return JSON.stringify(logObjeto);
};

export const logger = {
    info: (mensaje, opts = {}) => {
        // eslint-disable-next-line no-console
        console.info(formatearLogJson({ nivel: 'INFO', mensaje, ...opts }));
    },
    warn: (mensaje, opts = {}) => {
        // eslint-disable-next-line no-console
        console.warn(formatearLogJson({ nivel: 'WARN', mensaje, ...opts }));
    },
    error: (mensaje, opts = {}) => {
        // eslint-disable-next-line no-console
        console.error(formatearLogJson({ nivel: 'ERROR', mensaje, ...opts }));
    },
};
