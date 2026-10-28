/**
 * Middleware de Sanitización y Prevención de Inyecciones NoSQL para MongoDB/Mongoose.
 * Tarea T2.5 y docs/seguridad.md.
 */

/**
 * Función pura que analiza si una estructura de datos contiene claves
 * con operadores MongoDB ($) o accesos a subdocumentos (.).
 * @param {any} dato - Estructura a inspeccionar (objeto, array o primitivo).
 * @returns {string|null} - La clave infractora detectada, o null si está limpia.
 */
export const detectarClaveNoSql = (dato) => {
    if (!dato || typeof dato !== 'object') {
        return null;
    }

    if (Array.isArray(dato)) {
        for (const elemento of dato) {
            const infractor = detectarClaveNoSql(elemento);
            if (infractor) return infractor;
        }
        return null;
    }

    for (const [clave, valor] of Object.entries(dato)) {
        if (clave.startsWith('$') || clave.includes('.')) {
            return clave;
        }
        if (typeof valor === 'object' && valor !== null) {
            const infractor = detectarClaveNoSql(valor);
            if (infractor) return infractor;
        }
    }

    return null;
};

/**
 * Middleware Express para interceptar y rechazar peticiones con inyecciones NoSQL.
 */
export const sanitizarNoSql = (req, res, next) => {
    const infractorEnBody = detectarClaveNoSql(req.body);
    const infractorEnQuery = detectarClaveNoSql(req.query);
    const infractorEnParams = detectarClaveNoSql(req.params);

    const infractor = infractorEnBody || infractorEnQuery || infractorEnParams;

    if (infractor) {
        return res.status(400).json({
            mensaje: 'Datos de entrada inválidos',
            detalles: `Intento de inyección NoSQL detectado: clave no permitida '${infractor}'`,
        });
    }

    next();
};
