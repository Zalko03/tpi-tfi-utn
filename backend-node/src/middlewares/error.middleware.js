/**
 * Middleware central de manejo de errores según docs/api-errores.md.
 * Siempre responde con { mensaje, detalles }.
 */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
    const statusCode = err.status || err.statusCode || 500;
    const mensaje = err.message || 'Ocurrió un error interno en el servidor';
    const detalles = err.detalles || (err.errors ? err.errors : null);

    res.status(statusCode).json({
        mensaje,
        detalles: detalles || null,
    });
};
