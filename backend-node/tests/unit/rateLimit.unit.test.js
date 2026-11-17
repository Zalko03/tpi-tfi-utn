import { describe, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import {
    generarOtroParRsa,
    generarTokenTest,
} from '../helpers/auth.helper.js';
import { obtenerUsuarioIdDeToken } from '../../src/middlewares/auth.middleware.js';
import {
    crearLimitadorGeneral,
    crearLimitadorIA,
    crearLimitadorTest,
} from '../../src/middlewares/rateLimit.middleware.js';

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

    it('obtenerUsuarioIdDeToken devuelve id con JWT válido y null con cabecera ausente, falsa o expirada', () => {
        const tokenValido = generarTokenTest({ user_id: 42, sub: '42' });
        expect(obtenerUsuarioIdDeToken(`Bearer ${tokenValido}`)).toBe(42);

        const tokenSoloSub = generarTokenTest({ user_id: undefined, sub: '77' });
        expect(obtenerUsuarioIdDeToken(`Bearer ${tokenSoloSub}`)).toBe(77);

        expect(obtenerUsuarioIdDeToken(undefined)).toBeNull();
        expect(obtenerUsuarioIdDeToken('')).toBeNull();
        expect(obtenerUsuarioIdDeToken('Token abc')).toBeNull();
        expect(obtenerUsuarioIdDeToken('Bearer no-es-un-jwt')).toBeNull();

        const otroPar = generarOtroParRsa();
        const tokenFirmaAjena = generarTokenTest({ user_id: 99 }, otroPar.privateKey);
        expect(obtenerUsuarioIdDeToken(`Bearer ${tokenFirmaAjena}`)).toBeNull();

        const tokenExpirado = generarTokenTest(
            { user_id: 42 },
            undefined,
            { expiresIn: '-10s' }
        );
        expect(obtenerUsuarioIdDeToken(`Bearer ${tokenExpirado}`)).toBeNull();

        const tokenRefresh = generarTokenTest({ user_id: 42, token_type: 'refresh' });
        expect(obtenerUsuarioIdDeToken(`Bearer ${tokenRefresh}`)).toBeNull();
    });

    it('limitador general separa cupos por usuario autenticado y usa cupo por IP para tokens inválidos o anónimos', async () => {
        const app = express();
        app.set('trust proxy', 0);
        app.use(
            crearLimitadorGeneral({
                limiteAutenticado: 3,
                limiteAnonimo: 1,
                windowMs: 60000,
            })
        );
        app.get('/api/recurso', (req, res) => res.json({ ok: true }));

        const tokenUser1 = generarTokenTest({ user_id: 101, sub: '101' });
        const tokenUser2 = generarTokenTest({ user_id: 102, sub: '102' });
        const otroPar = generarOtroParRsa();
        const tokenFirmaInvalida = generarTokenTest({ user_id: 103 }, otroPar.privateKey);

        // Usuario 1 consume sus 3 peticiones y la 4ta se bloquea
        for (let i = 0; i < 3; i += 1) {
            const r = await request(app)
                .get('/api/recurso')
                .set('Authorization', `Bearer ${tokenUser1}`);
            expect(r.status).toBe(200);
        }
        const rUser1Bloqueado = await request(app)
            .get('/api/recurso')
            .set('Authorization', `Bearer ${tokenUser1}`);
        expect(rUser1Bloqueado.status).toBe(429);
        expect(rUser1Bloqueado.body).toEqual({
            mensaje: 'Demasiadas peticiones. Intente nuevamente en unos minutos',
            detalles: null,
        });

        // Usuario 2 desde la misma IP conserva su propio cupo de 3
        for (let i = 0; i < 3; i += 1) {
            const r = await request(app)
                .get('/api/recurso')
                .set('Authorization', `Bearer ${tokenUser2}`);
            expect(r.status).toBe(200);
        }

        // Token con firma inválida usa el cupo anónimo por IP (límite 1, nunca el cupo autenticado)
        const rFirmaInvalida1 = await request(app)
            .get('/api/recurso')
            .set('Authorization', `Bearer ${tokenFirmaInvalida}`);
        expect(rFirmaInvalida1.status).toBe(200);

        const rFirmaInvalida2 = await request(app)
            .get('/api/recurso')
            .set('Authorization', `Bearer ${tokenFirmaInvalida}`);
        expect(rFirmaInvalida2.status).toBe(429);
    });

    it('limitadorIA bloquea con HTTP 429 y formato único al superar el límite', async () => {
        const app = express();
        const limitadorIaPrueba = crearLimitadorIA({ limite: 2, windowMs: 60000 });
        app.post('/api/importaciones', limitadorIaPrueba, (req, res) =>
            res.status(202).json({ ok: true })
        );

        const tokenUser1 = generarTokenTest({ user_id: 201, sub: '201' });
        const tokenUser2 = generarTokenTest({ user_id: 202, sub: '202' });

        expect(
            (
                await request(app)
                    .post('/api/importaciones')
                    .set('Authorization', `Bearer ${tokenUser1}`)
            ).status
        ).toBe(202);
        expect(
            (
                await request(app)
                    .post('/api/importaciones')
                    .set('Authorization', `Bearer ${tokenUser1}`)
            ).status
        ).toBe(202);

        const resBloqueado = await request(app)
            .post('/api/importaciones')
            .set('Authorization', `Bearer ${tokenUser1}`);
        expect(resBloqueado.status).toBe(429);
        expect(resBloqueado.body).toEqual({
            mensaje: 'Demasiadas peticiones. Intente nuevamente en unos minutos',
            detalles: null,
        });

        // Otro usuario mantiene su cupo de IA intacto
        const resOtroUsuario = await request(app)
            .post('/api/importaciones')
            .set('Authorization', `Bearer ${tokenUser2}`);
        expect(resOtroUsuario.status).toBe(202);
    });

    it('rutas montadas antes del limitador (/app y /health) no gastan cupo ni devuelven cabeceras RateLimit', async () => {
        const app = express();
        app.get('/app/index.html', (_req, res) => res.status(200).send('<html></html>'));
        app.get('/health', (_req, res) => res.status(200).json({ ok: true }));
        app.use(crearLimitadorGeneral({ limiteAutenticado: 2, limiteAnonimo: 1, windowMs: 60000 }));
        app.get('/api/datos', (_req, res) => res.status(200).json({ ok: true }));

        // Agotamos el cupo anónimo en /api/datos
        expect((await request(app).get('/api/datos')).status).toBe(200);
        expect((await request(app).get('/api/datos')).status).toBe(429);

        // /app/index.html y /health siguen respondiendo 200 sin cabeceras RateLimit
        for (let i = 0; i < 3; i += 1) {
            const resApp = await request(app).get('/app/index.html');
            expect(resApp.status).toBe(200);
            expect(resApp.headers.ratelimit).toBeUndefined();
            expect(resApp.headers['ratelimit-limit']).toBeUndefined();

            const resHealth = await request(app).get('/health');
            expect(resHealth.status).toBe(200);
            expect(resHealth.headers.ratelimit).toBeUndefined();
            expect(resHealth.headers['ratelimit-limit']).toBeUndefined();
        }
    });

    it('con trust proxy = 0 la IP no se toma de X-Forwarded-For', async () => {
        const app = express();
        app.set('trust proxy', 0);
        const ipsObservadas = [];
        app.use(crearLimitadorGeneral({ limiteAutenticado: 5, limiteAnonimo: 1, windowMs: 60000 }));
        app.get('/api/ip-check', (req, res) => {
            ipsObservadas.push(req.ip);
            res.json({ ip: req.ip });
        });

        const r1 = await request(app)
            .get('/api/ip-check')
            .set('X-Forwarded-For', '203.0.113.50');
        expect(r1.status).toBe(200);
        expect(ipsObservadas[0]).not.toBe('203.0.113.50');

        // Otra cabecera X-Forwarded-For distinta debe seguir chocando contra la misma IP real
        const r2 = await request(app)
            .get('/api/ip-check')
            .set('X-Forwarded-For', '198.51.100.10');
        expect(r2.status).toBe(429);
    });
});
