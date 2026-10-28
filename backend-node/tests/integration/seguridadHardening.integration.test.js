import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import app from '../../app.js';
import { generarTokenTest } from '../helpers/auth.helper.js';

describe('Integration Tests - Endurecimiento de Seguridad (T2.5) en Express', () => {
    it('Helmet emite cabeceras de seguridad HTTP (X-Content-Type-Options, etc.)', async () => {
        const res = await request(app).get('/health');

        expect(res.status).toBe(200);
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBeDefined();
    });

    it('CORS autoriza origen listado en la lista blanca y emite Access-Control-Allow-Origin', async () => {
        const res = await request(app)
            .get('/health')
            .set('Origin', 'http://localhost:5173');

        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('CORS rechaza origen no listado con HTTP 403 y formato unificado de error', async () => {
        const res = await request(app)
            .get('/health')
            .set('Origin', 'http://sitio-no-autorizado.com');

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('mensaje');
        expect(res.body.mensaje).toContain('no está autorizado por la política CORS');
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('Sanitización NoSQL intercepta y rechaza peticiones con operadores ($) con HTTP 400', async () => {
        const tokenDuenio = generarTokenTest({
            userId: 1,
            rol: 'DUENIO',
            permisos: ['insumos.ver'],
        });

        const res = await request(app)
            .post('/api/historial-precios')
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send({
                productoId: { $gt: 0 },
                costoAnterior: 100,
                costoNuevo: 120,
            });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({
            mensaje: 'Datos de entrada inválidos',
            detalles: "Intento de inyección NoSQL detectado: clave no permitida '$gt'",
        });
    });

    it('Validación estricta de parámetros en endpoint costoso rechaza id no numérico con HTTP 400', async () => {
        const tokenDuenio = generarTokenTest({
            userId: 1,
            rol: 'DUENIO',
            permisos: ['recetas.ver_costos'],
        });

        const res = await request(app)
            .get('/api/productos/abc-invalido/resumen-costo')
            .set('Authorization', `Bearer ${tokenDuenio}`);

        expect(res.status).toBe(400);
        expect(res.body.mensaje).toBe('Datos de entrada inválidos');
        expect(res.body.detalles).toEqual(expect.arrayContaining([expect.stringContaining('id')]));
    });
});
