/**
 * Utilidad de sanitización de datos sensibles en logs.
 * Previene la fuga de credenciales, contraseñas y tokens criptográficos en consolas y archivos.
 * Tarea T2.5 y docs/seguridad.md.
 */

const CAMPOS_SENSIBLES = new Set([
    'password',
    'contrasenia',
    'clave',
    'token',
    'access',
    'refresh',
    'authorization',
    'secret',
    'secret_key',
    'jwt',
    'private_key',
]);

/**
 * Enmascara recursivamente cualquier campo sensible presente en un objeto o array.
 * @param {any} dato - Entrada a sanitizar.
 * @returns {any} - Copia sanitizada con valores reemplazados por '********'.
 */
export const enmascararDatosSensibles = (dato) => {
    if (!dato || typeof dato !== 'object') {
        return dato;
    }

    if (Array.isArray(dato)) {
        return dato.map(enmascararDatosSensibles);
    }

    const resultado = {};
    for (const [clave, valor] of Object.entries(dato)) {
        const claveNormalizada = clave.toLowerCase();
        if (CAMPOS_SENSIBLES.has(claveNormalizada)) {
            resultado[clave] = '********';
        } else if (typeof valor === 'object' && valor !== null) {
            resultado[clave] = enmascararDatosSensibles(valor);
        } else {
            resultado[clave] = valor;
        }
    }

    return resultado;
};
