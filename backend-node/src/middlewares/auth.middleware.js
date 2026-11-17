import jwt from 'jsonwebtoken';
import { obtenerClavePublicaJwt } from '../config/env.js';

const decodificarTokenAcceso = (cabeceraAuth) => {
    if (!cabeceraAuth || typeof cabeceraAuth !== 'string') {
        return { ok: false, codigo: 'NO_PROVISTO' };
    }

    const partes = cabeceraAuth.trim().split(' ');
    if (partes.length !== 2 || partes[0] !== 'Bearer' || !partes[1]) {
        return { ok: false, codigo: 'FORMATO_INVALIDO' };
    }

    const token = partes[1];
    const clavePublica = obtenerClavePublicaJwt();

    if (!clavePublica) {
        return { ok: false, codigo: 'SIN_CLAVE_PUBLICA' };
    }

    try {
        const decoded = jwt.verify(token, clavePublica, {
            algorithms: ['RS256'],
            issuer: 'cafe-gestion-django',
        });

        if (decoded.token_type !== 'access') {
            return { ok: false, codigo: 'TIPO_INVALIDO' };
        }

        const subNormalizado =
            decoded.sub !== undefined && decoded.sub !== null && String(decoded.sub).trim() !== ''
                ? Number.isNaN(Number(decoded.sub))
                    ? decoded.sub
                    : Number(decoded.sub)
                : undefined;
        const id = decoded.user_id ?? subNormalizado;

        return { ok: true, decoded, id };
    } catch (error) {
        return { ok: false, codigo: 'ERROR_VERIFICACION', error };
    }
};

/**
 * Función pura que extrae el ID de usuario desde una cabecera Authorization Bearer
 * verificando criptográficamente el JWT RS256. Retorna null si falta o es inválido.
 */
export const obtenerUsuarioIdDeToken = (cabecera) => {
    const resultado = decodificarTokenAcceso(cabecera);
    if (!resultado.ok) {
        return null;
    }
    const { id } = resultado;
    if (id === undefined || id === null || id === '') {
        return null;
    }
    return id;
};

/**
 * Middleware que valida criptográficamente el token de autenticación JWT asimétrico (RS256).
 * Verifica firma con la clave pública RSA, expiración (exp), emisor (iss = 'cafe-gestion-django')
 * y que el tipo de token sea de acceso (token_type = 'access') en memoria local sin consultar a Django.
 * Inyecta los datos decodificados en req.usuario.
 */
export const verificarToken = (req, res, next) => {
    const cabeceraAuth = req.headers.authorization || req.header('Authorization');
    const resultado = decodificarTokenAcceso(cabeceraAuth);

    if (!resultado.ok) {
        if (resultado.codigo === 'NO_PROVISTO') {
            return res.status(401).json({
                mensaje: 'Token de autenticación no provisto',
                detalles: null,
            });
        }
        if (resultado.codigo === 'FORMATO_INVALIDO') {
            return res.status(401).json({
                mensaje: 'Formato de autorización inválido. Debe ser: Bearer <token>',
                detalles: null,
            });
        }
        if (resultado.codigo === 'SIN_CLAVE_PUBLICA') {
            return res.status(500).json({
                mensaje: 'Error de configuración de seguridad en el servidor',
                detalles: 'Clave pública RSA no disponible para validación de tokens',
            });
        }
        if (resultado.codigo === 'TIPO_INVALIDO') {
            return res.status(401).json({
                mensaje: 'Tipo de token inválido. Se requiere un token de acceso',
                detalles: null,
            });
        }

        const error = resultado.error;
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({
                mensaje: 'Token de autenticación expirado',
                detalles: null,
            });
        }

        if (error instanceof jwt.JsonWebTokenError) {
            if (error.message.includes('issuer invalid')) {
                return res.status(401).json({
                    mensaje: 'Emisor de token inválido',
                    detalles: null,
                });
            }
            if (error.message.includes('invalid signature')) {
                return res.status(401).json({
                    mensaje: 'Firma de token inválida',
                    detalles: null,
                });
            }
            if (error.message.includes('invalid algorithm')) {
                return res.status(401).json({
                    mensaje: 'Algoritmo de firma no permitido. Solo se acepta RS256',
                    detalles: null,
                });
            }
            return res.status(401).json({
                mensaje: 'Token de autenticación inválido o malformado',
                detalles: null,
            });
        }

        return res.status(401).json({
            mensaje: 'No fue posible validar el token de autenticación',
            detalles: null,
        });
    }

    const { decoded, id } = resultado;
    req.usuario = {
        id,
        username: decoded.username,
        email: decoded.email,
        rol: decoded.rol,
        permisos: Array.isArray(decoded.permisos) ? decoded.permisos : [],
        ...decoded,
    };

    return next();
};

/**
 * Middleware para validar autorización granular sobre req.usuario.
 * Comprueba que el permiso requerido esté presente en req.usuario.permisos,
 * o que el rol sea DUENIO (acceso irrestricto según docs/seguridad.md).
 */
export const verificarPermiso = (permisoRequerido) => {
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({
                mensaje: 'Usuario no autenticado',
                detalles: null,
            });
        }

        const tienePermiso =
            req.usuario.rol === 'DUENIO' ||
            (Array.isArray(req.usuario.permisos) &&
                req.usuario.permisos.includes(permisoRequerido));

        if (!tienePermiso) {
            return res.status(403).json({
                mensaje: 'No tiene permisos para realizar esta acción',
                detalles: `Se requiere el permiso '${permisoRequerido}'`,
            });
        }

        return next();
    };
};

/**
 * Middleware para validar roles específicos (según convenciones-node.md).
 */
export const verificarRol = (...rolesPermitidos) => {
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({
                mensaje: 'Usuario no autenticado',
                detalles: null,
            });
        }

        if (req.usuario.rol === 'DUENIO' || rolesPermitidos.includes(req.usuario.rol)) {
            return next();
        }

        return res.status(403).json({
            mensaje: 'No tiene permisos para realizar esta acción',
            detalles: `Rol '${req.usuario.rol}' no autorizado`,
        });
    };
};
