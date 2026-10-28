import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { jest } from '@jest/globals';
import { verificarToken } from '../../src/middlewares/auth.middleware.js';

describe('Middleware Unitario verificarToken (docs/adr/0001-autenticacion-jwt-rs256.md y T2.4)', () => {
    let clavePrivada;
    let clavePublica;
    let parAjeno;

    beforeAll(() => {
        // Generamos un par RSA de 2048 bits para la suite unitaria
        const par = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
        clavePrivada = par.privateKey;
        clavePublica = par.publicKey;

        // Generamos un segundo par para probar firmas inválidas / ajenas
        parAjeno = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });

        process.env.JWT_PUBLIC_KEY = clavePublica;
    });

    const crearMocks = (headerAuth = null) => {
        const req = {
            headers: headerAuth ? { authorization: headerAuth } : {},
            header: function (name) {
                return this.headers[name.toLowerCase()] || this.headers[name];
            },
        };

        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
        };

        const next = jest.fn();

        return { req, res, next };
    };

    it('debe validar token RS256 válido, llamar a next() y adjuntar req.usuario', () => {
        const payloadOriginal = {
            iss: 'cafe-gestion-django',
            sub: '42',
            user_id: 42,
            username: 'encargado_tarde',
            email: 'encargado@cafe.local',
            rol: 'ENCARGADO',
            permisos: ['recetas.ver_costos', 'insumos.ver'],
            token_type: 'access',
        };

        const token = jwt.sign(payloadOriginal, clavePrivada, {
            algorithm: 'RS256',
            expiresIn: '15m',
        });

        const { req, res, next } = crearMocks(`Bearer ${token}`);

        verificarToken(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
        expect(req.usuario).toBeDefined();
        expect(req.usuario.id).toBe(42);
        expect(req.usuario.username).toBe('encargado_tarde');
        expect(req.usuario.rol).toBe('ENCARGADO');
        expect(req.usuario.permisos).toEqual(expect.arrayContaining(['recetas.ver_costos', 'insumos.ver']));
    });

    it('debe rechazar con 401 si no se envía la cabecera Authorization', () => {
        const { req, res, next } = crearMocks(null);

        verificarToken(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            mensaje: 'Token de autenticación no provisto',
            detalles: null,
        });
    });

    it('debe rechazar con 401 ante formato malformado sin Bearer o sin token', () => {
        const casos = ['TokenSolitoSinBearer', 'Basic dXNlcjpwYXNz', 'Bearer', 'Bearer  '];

        for (const caso of casos) {
            const { req, res, next } = crearMocks(caso);
            verificarToken(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    mensaje: expect.stringContaining('Formato de autorización inválido'),
                })
            );
        }
    });

    it('debe rechazar con 401 cuando el token ha expirado', () => {
        const tokenExpirado = jwt.sign(
            {
                iss: 'cafe-gestion-django',
                sub: '10',
                user_id: 10,
                rol: 'CAJERO',
                permisos: [],
                token_type: 'access',
                exp: Math.floor(Date.now() / 1000) - 30, // expiró hace 30s
            },
            clavePrivada,
            { algorithm: 'RS256' }
        );

        const { req, res, next } = crearMocks(`Bearer ${tokenExpirado}`);

        verificarToken(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            mensaje: 'Token de autenticación expirado',
            detalles: null,
        });
    });

    it('debe rechazar con 401 cuando el emisor (iss) es incorrecto', () => {
        const tokenEmisorFalso = jwt.sign(
            {
                iss: 'emisor-malicioso-no-django',
                sub: '10',
                user_id: 10,
                rol: 'DUENIO',
                permisos: ['recetas.ver_costos'],
                token_type: 'access',
            },
            clavePrivada,
            { algorithm: 'RS256', expiresIn: '15m' }
        );

        const { req, res, next } = crearMocks(`Bearer ${tokenEmisorFalso}`);

        verificarToken(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            mensaje: 'Emisor de token inválido',
            detalles: null,
        });
    });

    it('debe rechazar con 401 cuando token_type es "refresh" en vez de "access"', () => {
        const refreshToken = jwt.sign(
            {
                iss: 'cafe-gestion-django',
                sub: '10',
                user_id: 10,
                rol: 'CAJERO',
                permisos: [],
                token_type: 'refresh',
            },
            clavePrivada,
            { algorithm: 'RS256', expiresIn: '24h' }
        );

        const { req, res, next } = crearMocks(`Bearer ${refreshToken}`);

        verificarToken(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            mensaje: 'Tipo de token inválido. Se requiere un token de acceso',
            detalles: null,
        });
    });

    it('debe rechazar con 401 cuando el token fue firmado con otra clave privada RSA ajena', () => {
        const tokenClaveAjena = jwt.sign(
            {
                iss: 'cafe-gestion-django',
                sub: '99',
                user_id: 99,
                rol: 'DUENIO',
                permisos: ['recetas.ver_costos'],
                token_type: 'access',
            },
            parAjeno.privateKey,
            { algorithm: 'RS256', expiresIn: '15m' }
        );

        const { req, res, next } = crearMocks(`Bearer ${tokenClaveAjena}`);

        verificarToken(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            mensaje: 'Firma de token inválida',
            detalles: null,
        });
    });

    it('debe rechazar con 401 ante intento de ataque de confusión de algoritmo (HS256)', () => {
        // En un ataque de confusión, el atacante firma con HS256 usando la clave pública RSA como secreto HMAC
        const tokenAtaqueConfusion = jwt.sign(
            {
                iss: 'cafe-gestion-django',
                sub: '1',
                user_id: 1,
                rol: 'DUENIO',
                permisos: ['recetas.ver_costos'],
                token_type: 'access',
            },
            clavePublica,
            { algorithm: 'HS256', expiresIn: '15m' }
        );

        const { req, res, next } = crearMocks(`Bearer ${tokenAtaqueConfusion}`);

        verificarToken(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            mensaje: 'Algoritmo de firma no permitido. Solo se acepta RS256',
            detalles: null,
        });
    });

    it('debe responder con 500 si la clave pública RSA no está configurada', () => {
        const claveOriginal = process.env.JWT_PUBLIC_KEY;
        delete process.env.JWT_PUBLIC_KEY;
        const rutaOriginal = process.env.JWT_PUBLIC_KEY_PATH;
        process.env.JWT_PUBLIC_KEY_PATH = '/ruta/inexistente/clave.pem';

        try {
            const token = jwt.sign(
                {
                    iss: 'cafe-gestion-django',
                    sub: '1',
                    user_id: 1,
                    token_type: 'access',
                },
                clavePrivada,
                { algorithm: 'RS256', expiresIn: '15m' }
            );

            const { req, res, next } = crearMocks(`Bearer ${token}`);

            verificarToken(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    mensaje: expect.stringContaining('Error de configuración'),
                })
            );
        } finally {
            process.env.JWT_PUBLIC_KEY = claveOriginal;
            if (rutaOriginal) {
                process.env.JWT_PUBLIC_KEY_PATH = rutaOriginal;
            } else {
                delete process.env.JWT_PUBLIC_KEY_PATH;
            }
        }
    });
});
