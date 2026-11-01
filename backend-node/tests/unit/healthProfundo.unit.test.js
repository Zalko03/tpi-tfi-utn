import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import { verificarEstadoConexiones } from '../../src/controllers/health.controller.js';

describe('Unit Tests: verificarEstadoConexiones para salud profunda (TP 4)', () => {
    let mockFetchOriginal;

    beforeAll(() => {
        mockFetchOriginal = global.fetch;
    });

    afterAll(() => {
        global.fetch = mockFetchOriginal;
    });

    it('retorna estado "ok" cuando Mongo está conectado y Django responde exitosamente', async () => {
        const mockMongo = { readyState: 1 };
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
        });

        const resultado = await verificarEstadoConexiones(500, mockMongo);

        expect(resultado.estado).toBe('ok');
        expect(resultado.checks.mongodb.estado).toBe('ok');
        expect(resultado.checks.django.estado).toBe('ok');
    });

    it('retorna estado "degradado" cuando Mongo está conectado pero Django falla o está inoperativo', async () => {
        const mockMongo = { readyState: 1 };
        global.fetch = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:8000'));

        const resultado = await verificarEstadoConexiones(500, mockMongo);

        expect(resultado.estado).toBe('degradado');
        expect(resultado.checks.mongodb.estado).toBe('ok');
        expect(resultado.checks.django.estado).toBe('inoperativo');
    });

    it('retorna estado "error" cuando Mongo está desconectado', async () => {
        const mockMongo = { readyState: 0 };
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
        });

        const resultado = await verificarEstadoConexiones(500, mockMongo);

        expect(resultado.estado).toBe('error');
        expect(resultado.checks.mongodb.estado).toBe('desconectado');
    });
});
