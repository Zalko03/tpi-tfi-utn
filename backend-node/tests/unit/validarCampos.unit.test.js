import { jest } from '@jest/globals';
import { check } from 'express-validator';
import { validarCampos } from '../../src/middlewares/validarCampos.middleware.js';
import { logger } from '../../src/utils/logger.js';

const crearResMock = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('Unit Tests - Middleware validarCampos', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('invoca next() cuando no hay errores de validación', async () => {
        const req = {
            originalUrl: '/api/importaciones',
            body: { textoLista: 'Café tostado 1 kg $24000' },
        };
        await check('textoLista')
            .isString()
            .isLength({ min: 3 })
            .withMessage('La lista de precios tiene que tener entre 3 y 15.000 caracteres.')
            .run(req);

        const res = crearResMock();
        const next = jest.fn();

        validarCampos(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    it('responde 400 con detalles sin nombres de campo ni ":" y sin mensajes duplicados', async () => {
        const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        const req = {
            originalUrl: '/api/importaciones',
            correlationId: 'corr-val-1',
            body: {
                textoLista: 'a',
                proveedorId: 'abc',
                total_ventas: '',
                ganancia_bruta_total: '',
            },
        };

        await Promise.all([
            check('textoLista')
                .isLength({ min: 3 })
                .withMessage('La lista de precios tiene que tener entre 3 y 15.000 caracteres.')
                .run(req),
            check('proveedorId')
                .isInt({ min: 1 })
                .withMessage('El proveedor elegido no es válido.')
                .run(req),
            check('total_ventas')
                .notEmpty()
                .withMessage('Faltan los totales del período.')
                .run(req),
            check('ganancia_bruta_total')
                .notEmpty()
                .withMessage('Faltan los totales del período.')
                .run(req),
        ]);

        const res = crearResMock();
        const next = jest.fn();

        validarCampos(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);

        const cuerpo = res.json.mock.calls[0][0];
        expect(cuerpo.mensaje).toBe('Datos de entrada inválidos');
        expect(cuerpo.detalles).toEqual([
            'La lista de precios tiene que tener entre 3 y 15.000 caracteres.',
            'El proveedor elegido no es válido.',
            'Faltan los totales del período.',
        ]);

        const textoDetalles = cuerpo.detalles.join(' ');
        expect(textoDetalles).not.toContain('textoLista');
        expect(textoDetalles).not.toContain('proveedorId');
        expect(textoDetalles).not.toContain('total_ventas');
        expect(textoDetalles).not.toContain('ganancia_bruta_total');
        expect(textoDetalles).not.toContain(':');

        expect(warnSpy).toHaveBeenCalledWith(
            'Validación de entrada fallida',
            expect.objectContaining({
                correlationId: 'corr-val-1',
                metadatos: expect.objectContaining({
                    ruta: '/api/importaciones',
                    campos: expect.arrayContaining([
                        expect.objectContaining({ campo: 'textoLista' }),
                        expect.objectContaining({ campo: 'proveedorId' }),
                    ]),
                }),
            })
        );
    });
});
