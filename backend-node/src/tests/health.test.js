import request from 'supertest';
import app from '../../app.js';

describe('GET /health', () => {
    it('responde 200 con el estado del servicio sin conectar a Mongo', async () => {
        const respuesta = await request(app).get('/health');

        expect(respuesta.status).toBe(200);
        expect(respuesta.body).toEqual({ estado: 'ok', servicio: 'backend-node' });
    });

    it('no expone el encabezado X-Powered-By (helmet activo)', async () => {
        const respuesta = await request(app).get('/health');

        expect(respuesta.headers['x-powered-by']).toBeUndefined();
    });
});
