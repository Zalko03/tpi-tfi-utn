import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// Claves efímeras compartidas o generadas para tests
let clavePublica = globalThis.__TEST_JWT_PUBLIC_KEY__;
let clavePrivada = globalThis.__TEST_JWT_PRIVATE_KEY__;

if (!clavePublica || !clavePrivada) {
    const par = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
        },
    });
    clavePublica = par.publicKey;
    clavePrivada = par.privateKey;
    process.env.JWT_PUBLIC_KEY = clavePublica;
    globalThis.__TEST_JWT_PUBLIC_KEY__ = clavePublica;
    globalThis.__TEST_JWT_PRIVATE_KEY__ = clavePrivada;
}

export const clavePublicaTest = clavePublica;
export const clavePrivadaTest = clavePrivada;

/**
 * Genera un token JWT RS256 firmado con la clave privada de prueba.
 */
export const generarTokenTest = (overrides = {}, clave = clavePrivada, opts = {}) => {
    const payload = {
        iss: 'cafe-gestion-django',
        sub: '1',
        user_id: 1,
        username: 'usuario_test',
        email: 'test@cafe.local',
        rol: 'DUENIO',
        permisos: ['recetas.ver_costos', 'insumos.ver'],
        token_type: 'access',
        ...overrides,
    };

    const signOptions = {
        algorithm: 'RS256',
        expiresIn: '15m',
        ...opts,
    };

    return jwt.sign(payload, clave, signOptions);
};

/**
 * Genera un nuevo par RSA independiente (por ejemplo para probar firmas ajenas).
 */
export const generarOtroParRsa = () => {
    return crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
        },
    });
};
