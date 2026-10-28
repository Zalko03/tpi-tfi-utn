import { describe, it, expect, jest } from '@jest/globals';
import { configurarCors } from '../../src/middlewares/cors.middleware.js';

describe('Unit Tests - Política de CORS restrictiva (cors.middleware)', () => {
    const origenesPrueba = ['http://localhost:5173', 'http://localhost:3000'];
    const corsMiddleware = configurarCors(origenesPrueba);

    it('permite peticiones sin cabecera Origin (mismo origen, curl o servidor interno)', (done) => {
        const req = {
            method: 'GET',
            headers: {},
        };
        const res = {
            setHeader: jest.fn(),
            getHeader: jest.fn(),
        };

        corsMiddleware(req, res, (err) => {
            expect(err).toBeUndefined();
            done();
        });
    });

    it('permite orígenes explícitamente autorizados en la lista blanca', (done) => {
        const req = {
            method: 'GET',
            headers: {
                origin: 'http://localhost:5173',
            },
        };
        const res = {
            setHeader: jest.fn(),
            getHeader: jest.fn(),
        };

        corsMiddleware(req, res, (err) => {
            expect(err).toBeUndefined();
            expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://localhost:5173');
            done();
        });
    });

    it('rechaza orígenes no permitidos con error HTTP 403', (done) => {
        const req = {
            method: 'GET',
            headers: {
                origin: 'http://sitio-malicioso.com',
            },
        };
        const res = {
            setHeader: jest.fn(),
            getHeader: jest.fn(),
        };

        corsMiddleware(req, res, (err) => {
            expect(err).toBeInstanceOf(Error);
            expect(err.status).toBe(403);
            expect(err.message).toContain('no está autorizado por la política CORS');
            done();
        });
    });
});
