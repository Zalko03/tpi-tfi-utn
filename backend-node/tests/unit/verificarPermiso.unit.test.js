import { jest } from '@jest/globals';
import { verificarPermiso, verificarRol } from '../../src/middlewares/auth.middleware.js';

describe('Middleware Unitario verificarPermiso y verificarRol (docs/seguridad.md y T2.4)', () => {
    const crearMocks = (usuario = null) => {
        const req = {
            usuario,
        };

        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
        };

        const next = jest.fn();

        return { req, res, next };
    };

    describe('verificarPermiso', () => {
        it('debe pasar con next() cuando el permiso está en el array permisos', () => {
            const middleware = verificarPermiso('recetas.ver_costos');
            const { req, res, next } = crearMocks({
                id: 15,
                rol: 'ENCARGADO',
                permisos: ['insumos.ver', 'recetas.ver_costos'],
            });

            middleware(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(res.status).not.toHaveBeenCalled();
        });

        it('debe pasar con next() cuando el usuario tiene rol DUENIO incluso sin el permiso explícito en el array', () => {
            const middleware = verificarPermiso('recetas.ver_costos');
            const { req, res, next } = crearMocks({
                id: 1,
                rol: 'DUENIO',
                permisos: [], // El dueño tiene acceso irrestricto por matriz de seguridad
            });

            middleware(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(res.status).not.toHaveBeenCalled();
        });

        it('debe rechazar con 403 cuando el usuario es CAJERO y no tiene recetas.ver_costos', () => {
            const middleware = verificarPermiso('recetas.ver_costos');
            const { req, res, next } = crearMocks({
                id: 7,
                rol: 'CAJERO',
                permisos: ['ventas.cobrar_ticket', 'caja.abrir_turno'],
            });

            middleware(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                mensaje: 'No tiene permisos para realizar esta acción',
                detalles: "Se requiere el permiso 'recetas.ver_costos'",
            });
        });

        it('debe rechazar con 401 si no hay req.usuario (usuario no autenticado)', () => {
            const middleware = verificarPermiso('recetas.ver_costos');
            const { req, res, next } = crearMocks(null);

            middleware(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                mensaje: 'Usuario no autenticado',
                detalles: null,
            });
        });

        it('debe rechazar con 403 si req.usuario.permisos está vacío y el rol no es DUENIO', () => {
            const middleware = verificarPermiso('insumos.ver');
            const { req, res, next } = crearMocks({
                id: 8,
                rol: 'CAJERO',
                permisos: [],
            });

            middleware(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    mensaje: 'No tiene permisos para realizar esta acción',
                })
            );
        });
    });

    describe('verificarRol', () => {
        it('debe permitir acceso si el rol del usuario coincide con alguno de los roles permitidos', () => {
            const middleware = verificarRol('ENCARGADO', 'DUENIO');
            const { req, res, next } = crearMocks({
                id: 5,
                rol: 'ENCARGADO',
            });

            middleware(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(res.status).not.toHaveBeenCalled();
        });

        it('debe permitir acceso irrestricto si el rol es DUENIO aunque no esté explícito en los permitidos', () => {
            const middleware = verificarRol('ENCARGADO');
            const { req, res, next } = crearMocks({
                id: 1,
                rol: 'DUENIO',
            });

            middleware(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
        });

        it('debe responder 403 si el rol del usuario no está dentro de los permitidos', () => {
            const middleware = verificarRol('ENCARGADO');
            const { req, res, next } = crearMocks({
                id: 20,
                rol: 'CAJERO',
            });

            middleware(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                mensaje: 'No tiene permisos para realizar esta acción',
                detalles: "Rol 'CAJERO' no autorizado",
            });
        });

        it('debe responder 401 si no hay req.usuario', () => {
            const middleware = verificarRol('DUENIO');
            const { req, res, next } = crearMocks(null);

            middleware(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                mensaje: 'Usuario no autenticado',
                detalles: null,
            });
        });
    });
});
