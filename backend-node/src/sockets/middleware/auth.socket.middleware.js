import jwt from 'jsonwebtoken';
import { obtenerClavePublicaJwt } from '../../config/env.js';

/**
 * Crea un error de autenticación para el handshake de Socket.IO
 * respetando el contrato { mensaje, detalles } de docs/api-errores.md.
 */
const crearErrorHandshake = (mensaje, detalles = null, codigo = 401) => {
    const error = new Error(mensaje);
    error.data = {
        mensaje,
        detalles,
        codigo,
    };
    return error;
};

/**
 * Extrae el token JWT del handshake de Socket.IO:
 * 1. socket.handshake.auth.token
 * 2. Cabecera socket.handshake.headers.authorization ('Bearer <token>')
 */
export const extraerTokenHandshake = (socket) => {
    const tokenAuth = socket?.handshake?.auth?.token;
    if (typeof tokenAuth === 'string' && tokenAuth.trim().length > 0) {
        const limpio = tokenAuth.trim();
        return limpio.startsWith('Bearer ') ? limpio.slice(7).trim() : limpio;
    }

    const cabecera = socket?.handshake?.headers?.authorization;
    if (typeof cabecera === 'string' && cabecera.trim().length > 0) {
        const partes = cabecera.trim().split(' ');
        if (partes.length === 2 && partes[0] === 'Bearer' && partes[1]) {
            return partes[1].trim();
        }
    }

    return null;
};

/**
 * Middleware de handshake de Socket.IO (T3.5 y docs/seguridad.md §5.2):
 * Valida la firma RS256 con JWT_PUBLIC_KEY, vigencia temporal, emisor,
 * tipo 'access' y estado activo del usuario. Rechaza conexiones no autenticadas.
 */
export const autenticarSocketJwt = (socket, next) => {
    const token = extraerTokenHandshake(socket);

    if (!token) {
        return next(crearErrorHandshake('Token de autenticación no provisto en el handshake'));
    }

    const clavePublica = obtenerClavePublicaJwt();
    if (!clavePublica) {
        return next(
            crearErrorHandshake(
                'Error de configuración de seguridad en el servidor',
                'Clave pública RSA no disponible',
                500
            )
        );
    }

    try {
        const decoded = jwt.verify(token, clavePublica, {
            algorithms: ['RS256'],
            issuer: 'cafe-gestion-django',
        });

        if (decoded.token_type !== 'access') {
            return next(
                crearErrorHandshake('Tipo de token inválido. Se requiere un token de acceso')
            );
        }

        if (decoded.is_active === false || decoded.estado_activo === false) {
            return next(crearErrorHandshake('La cuenta de usuario se encuentra inactiva', null, 403));
        }

        socket.usuario = {
            id: decoded.user_id || (decoded.sub ? Number(decoded.sub) : undefined),
            username: decoded.username,
            email: decoded.email,
            rol: decoded.rol,
            permisos: Array.isArray(decoded.permisos) ? decoded.permisos : [],
        };

        return next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            return next(crearErrorHandshake('Token de autenticación expirado'));
        }
        return next(crearErrorHandshake('Token de autenticación inválido o firma no verificada'));
    }
};
