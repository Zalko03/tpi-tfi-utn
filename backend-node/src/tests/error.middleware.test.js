import request from 'supertest';
import app from '../../app.js';
import { generarTokenTest } from '../../tests/helpers/auth.helper.js';

describe('Middleware de Errores Unificado (docs/api-errores.md)', () => {
    const tokenValido = generarTokenTest({
        rol: 'DUENIO',
        permisos: ['insumos.ver', 'recetas.ver_costos'],
    });

    it('debe responder 400 con { mensaje, detalles } ante datos inválidos en POST /api/historial-precios', async () => {
        const respuesta = await request(app)
            .post('/api/historial-precios')
            .set('Authorization', `Bearer ${tokenValido}`)
            .send({}) // cuerpo vacío
            .set('Accept', 'application/json');

        expect(respuesta.status).toBe(400);
        expect(respuesta.body).toHaveProperty('mensaje', 'Datos de entrada inválidos');
        expect(respuesta.body).toHaveProperty('detalles');
        expect(Array.isArray(respuesta.body.detalles)).toBe(true);
    });

    it('debe responder 400 con { mensaje, detalles } ante datos inválidos en POST /api/snapshots-costeo', async () => {
        const respuesta = await request(app)
            .post('/api/snapshots-costeo')
            .set('Authorization', `Bearer ${tokenValido}`)
            .send({ productoId: 'no-es-numero' })
            .set('Accept', 'application/json');

        expect(respuesta.status).toBe(400);
        expect(respuesta.body).toHaveProperty('mensaje', 'Datos de entrada inválidos');
        expect(Array.isArray(respuesta.body.detalles)).toBe(true);
    });
});
