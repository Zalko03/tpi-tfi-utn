import { describe, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { crearLimitadorTest } from '../../src/middlewares/rateLimit.middleware.js';

describe('Unit Tests - Rate Limiting (rateLimit.middleware)', () => {
    it('permite peticiones dentro del límite establecido', async () => {
        const app = express();
        const limitador = crearLimitadorTest(2, 60000);
        app.use(limitador);
        app.get('/test', (req, res) => res.json({ ok: true }));

        const res1 = await request(app).get('/test');
        expect(res1.status).toBe(200);
    });

    it('bloquea con HTTP 429 y formato estándar al superar el límite configurado', async () => {
        const app = express();
        const limitador = crearLimitadorTest(1, 60000);
        app.use(limitador);
        app.get('/test', (req, res) => res.json({ ok: true }));

        const res1 = await request(app).get('/test');
        expect(res1.status).toBe(200);

        const res2 = await request(app).get('/test');
        expect(res2.status).toBe(429);
        expect(res2.body).toEqual({
            mensaje: 'Demasiadas peticiones. Intente nuevamente en unos minutos',
            detalles: null,
        });
    });
});
