import request from 'supertest';
import app from '../../app.js';

describe('GET /health y endpoints de observabilidad (TP 4)', () => {
    it('responde 200 con el estado del servicio sin conectar a Mongo', async () => {
        const respuesta = await request(app).get('/health');

        expect(respuesta.status).toBe(200);
        expect(respuesta.body).toEqual({ estado: 'ok', servicio: 'backend-node' });
    });

    it('no expone el encabezado X-Powered-By (helmet activo)', async () => {
        const respuesta = await request(app).get('/health');

        expect(respuesta.headers['x-powered-by']).toBeUndefined();
    });

    it('genera e inyecta la cabecera X-Request-ID en la respuesta', async () => {
        const respuesta = await request(app).get('/health');

        expect(respuesta.headers['x-request-id']).toBeDefined();
        expect(respuesta.headers['x-request-id']).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
    });

    it('preserva la cabecera X-Request-ID cuando es enviada por el cliente', async () => {
        const customId = 'req-trace-test-node-9999';
        const respuesta = await request(app)
            .get('/health')
            .set('X-Request-ID', customId);

        expect(respuesta.headers['x-request-id']).toBe(customId);
    });

    it('GET /health/profundo responde con el diagnóstico de conexiones', async () => {
        const respuesta = await request(app).get('/health/profundo');

        // Dependiendo del estado de Mongo en local puede ser 200 o 503
        expect([200, 503]).toContain(respuesta.status);
        expect(respuesta.body).toHaveProperty('servicio', 'backend-node');
        expect(respuesta.body).toHaveProperty('checks');
        expect(respuesta.body.checks).toHaveProperty('mongodb');
        expect(respuesta.body.checks).toHaveProperty('django');
        expect(respuesta.headers['x-request-id']).toBeDefined();
    });
});
