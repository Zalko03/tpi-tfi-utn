import { jest } from '@jest/globals';
import {
    obtenerOpcionesClienteReconexion,
    validarAccesoSalaTurno,
} from '../../src/sockets/index.js';
import {
    autenticarSocketJwt,
    extraerTokenHandshake,
} from '../../src/sockets/middleware/auth.socket.middleware.js';
import { generarOtroParRsa, generarTokenTest } from '../helpers/auth.helper.js';

describe('Middleware y Helpers de Socket.IO (T3.5)', () => {
    describe('extraerTokenHandshake', () => {
        it('extrae el token directamente desde socket.handshake.auth.token', () => {
            const socket = {
                handshake: {
                    auth: { token: 'token.jwt.ejemplo' },
                    headers: {},
                },
            };

            expect(extraerTokenHandshake(socket)).toBe('token.jwt.ejemplo');
        });

        it('limpia el prefijo Bearer si viene dentro de socket.handshake.auth.token', () => {
            const socket = {
                handshake: {
                    auth: { token: 'Bearer token.jwt.prefijo' },
                    headers: {},
                },
            };

            expect(extraerTokenHandshake(socket)).toBe('token.jwt.prefijo');
        });

        it('extrae el token desde socket.handshake.headers.authorization si auth.token no está presente', () => {
            const socket = {
                handshake: {
                    auth: {},
                    headers: { authorization: 'Bearer token.desde.header' },
                },
            };

            expect(extraerTokenHandshake(socket)).toBe('token.desde.header');
        });

        it('devuelve null cuando no se provee ningún token en el handshake', () => {
            expect(extraerTokenHandshake({ handshake: { auth: {}, headers: {} } })).toBeNull();
            expect(extraerTokenHandshake({})).toBeNull();
        });
    });

    describe('autenticarSocketJwt', () => {
        it('autentica un socket con token RS256 válido y adjunta socket.usuario', () => {
            const token = generarTokenTest({
                user_id: 7,
                username: 'encargado_noche',
                email: 'encargado@cafe.local',
                rol: 'ENCARGADO',
                permisos: ['recetas.ver_costos', 'insumos.ver'],
            });

            const socket = {
                handshake: {
                    auth: { token },
                    headers: {},
                },
            };
            const next = jest.fn();

            autenticarSocketJwt(socket, next);

            expect(next).toHaveBeenCalledWith();
            expect(socket.usuario).toEqual({
                id: 7,
                username: 'encargado_noche',
                email: 'encargado@cafe.local',
                rol: 'ENCARGADO',
                permisos: ['recetas.ver_costos', 'insumos.ver'],
            });
        });

        it('rechaza el handshake si no se envía token', () => {
            const socket = { handshake: { auth: {}, headers: {} } };
            const next = jest.fn();

            autenticarSocketJwt(socket, next);

            expect(next).toHaveBeenCalledTimes(1);
            const error = next.mock.calls[0][0];
            expect(error).toBeInstanceOf(Error);
            expect(error.data).toEqual({
                mensaje: 'Token de autenticación no provisto en el handshake',
                detalles: null,
                codigo: 401,
            });
        });

        it('rechaza el handshake si el token es de tipo refresh en vez de access', () => {
            const tokenRefresh = generarTokenTest({ token_type: 'refresh' });
            const socket = { handshake: { auth: { token: tokenRefresh }, headers: {} } };
            const next = jest.fn();

            autenticarSocketJwt(socket, next);

            const error = next.mock.calls[0][0];
            expect(error.data).toMatchObject({
                mensaje: 'Tipo de token inválido. Se requiere un token de acceso',
                codigo: 401,
            });
        });

        it('rechaza el handshake si el usuario se encuentra inactivo', () => {
            const tokenInactivo = generarTokenTest({ is_active: false });
            const socket = { handshake: { auth: { token: tokenInactivo }, headers: {} } };
            const next = jest.fn();

            autenticarSocketJwt(socket, next);

            const error = next.mock.calls[0][0];
            expect(error.data).toMatchObject({
                mensaje: 'La cuenta de usuario se encuentra inactiva',
                codigo: 403,
            });
        });

        it('rechaza el handshake si el token está expirado o firmado con otra clave RSA', () => {
            const tokenExpirado = generarTokenTest({}, undefined, { expiresIn: '-10s' });
            const socketExp = { handshake: { auth: { token: tokenExpirado }, headers: {} } };
            const nextExp = jest.fn();

            autenticarSocketJwt(socketExp, nextExp);
            expect(nextExp.mock.calls[0][0].data).toMatchObject({
                mensaje: 'Token de autenticación expirado',
                codigo: 401,
            });

            const otroPar = generarOtroParRsa();
            const tokenFirmaAjena = generarTokenTest({}, otroPar.privateKey);
            const socketAjeno = { handshake: { auth: { token: tokenFirmaAjena }, headers: {} } };
            const nextAjeno = jest.fn();

            autenticarSocketJwt(socketAjeno, nextAjeno);
            expect(nextAjeno.mock.calls[0][0].data).toMatchObject({
                mensaje: 'Token de autenticación inválido o firma no verificada',
                codigo: 401,
            });
        });
    });

    describe('validarAccesoSalaTurno', () => {
        it('permite unirse al titular del turno aunque sea CAJERO sin permisos de turnos ajenos', () => {
            const usuarioCajero = {
                id: 12,
                rol: 'CAJERO',
                permisos: ['ventas.crear'],
            };

            const res = validarAccesoSalaTurno(usuarioCajero, { turnoId: 45, titularId: 12 });
            expect(res).toEqual({
                permitido: true,
                codigo: 200,
                sala: 'turno:45',
            });
        });

        it('rechaza con 403 a un CAJERO que intenta unirse al turno de otro cajero', () => {
            const usuarioCajero = {
                id: 12,
                rol: 'CAJERO',
                permisos: ['ventas.crear'],
            };

            const res = validarAccesoSalaTurno(usuarioCajero, { turnoId: 99, titularId: 25 });
            expect(res.permitido).toBe(false);
            expect(res.codigo).toBe(403);
            expect(res.mensaje).toContain('turno de caja ajeno');
        });

        it('permite unirse a cualquier turno a un DUENIO o usuario con permiso caja.gestionar_turnos_ajenos', () => {
            const duenio = { id: 1, rol: 'DUENIO', permisos: [] };
            const encargadoConPermiso = {
                id: 8,
                rol: 'ENCARGADO',
                permisos: ['caja.gestionar_turnos_ajenos'],
            };

            expect(validarAccesoSalaTurno(duenio, { turnoId: 99, titularId: 25 }).permitido).toBe(
                true
            );
            expect(
                validarAccesoSalaTurno(encargadoConPermiso, { turnoId: 99, titularId: 25 })
                    .permitido
            ).toBe(true);
        });

        it('rechaza con 400 cuando turnoId está vacío o ausente', () => {
            const duenio = { id: 1, rol: 'DUENIO', permisos: [] };
            const res = validarAccesoSalaTurno(duenio, { turnoId: '   ' });
            expect(res.permitido).toBe(false);
            expect(res.codigo).toBe(400);
        });
    });

    describe('obtenerOpcionesClienteReconexion', () => {
        it('devuelve configuración con reconexión automática habilitada y handshake auth.token', () => {
            const opciones = obtenerOpcionesClienteReconexion('jwt.test.token', {
                reconnectionDelay: 100,
            });

            expect(opciones.auth).toEqual({ token: 'jwt.test.token' });
            expect(opciones.reconnection).toBe(true);
            expect(opciones.reconnectionAttempts).toBeGreaterThanOrEqual(5);
            expect(opciones.reconnectionDelay).toBe(100);
            expect(opciones.transports).toContain('websocket');
        });
    });
});
