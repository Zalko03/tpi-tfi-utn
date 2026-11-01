import { describe, it, expect, jest } from '@jest/globals';
import { correlationIdMiddleware } from '../../src/middlewares/correlationId.middleware.js';

describe('Unit Tests: correlationIdMiddleware (TP 4)', () => {
    it('genera un nuevo UUID v4 y lo adjunta a req y res cuando no hay cabecera previa', () => {
        const req = { headers: {} };
        const headersSet = {};
        const res = {
            setHeader: (clave, valor) => {
                headersSet[clave] = valor;
            },
        };
        let nextLlamado = false;
        const next = () => {
            nextLlamado = true;
        };

        correlationIdMiddleware(req, res, next);

        expect(nextLlamado).toBe(true);
        expect(req.id).toBeDefined();
        expect(req.correlationId).toBe(req.id);
        expect(headersSet['X-Request-ID']).toBe(req.id);
        // Validar formato UUID v4
        expect(req.id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
    });

    it('respeta y propaga la cabecera X-Request-ID preexistente', () => {
        const req = { headers: { 'x-request-id': 'req-cliente-propio-12345' } };
        const headersSet = {};
        const res = {
            setHeader: (clave, valor) => {
                headersSet[clave] = valor;
            },
        };
        let nextLlamado = false;
        const next = () => {
            nextLlamado = true;
        };

        correlationIdMiddleware(req, res, next);

        expect(nextLlamado).toBe(true);
        expect(req.id).toBe('req-cliente-propio-12345');
        expect(headersSet['X-Request-ID']).toBe('req-cliente-propio-12345');
    });

    it('respeta la cabecera x-correlation-id alternativa', () => {
        const req = { headers: { 'x-correlation-id': 'corr-upstream-67890' } };
        const headersSet = {};
        const res = {
            setHeader: (clave, valor) => {
                headersSet[clave] = valor;
            },
        };
        const next = jest.fn();

        correlationIdMiddleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.id).toBe('corr-upstream-67890');
        expect(headersSet['X-Request-ID']).toBe('corr-upstream-67890');
    });
});
