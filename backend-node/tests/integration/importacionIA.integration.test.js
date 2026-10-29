import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../app.js';
import { ImportacionIA } from '../../src/models/ImportacionIA.js';
import { procesarImportacionEnSegundoPlano } from '../../src/services/importacionIA.service.js';
import { generarTokenTest } from '../helpers/auth.helper.js';

describe('Integración: Importaciones con IA (T3.2 - POST /api/importaciones 202 Asíncrono)', () => {
    const fetchOriginal = global.fetch;
    let tokenDuenio;
    let tokenUsuarioConPermisoIA;
    let tokenEncargadoSinPermisoIA;

    beforeAll(async () => {
        const uriTest = process.env.MONGO_URI || 'mongodb://localhost:27017/cafe_gestion_test';
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(uriTest);
        }

        tokenDuenio = generarTokenTest({
            user_id: 1,
            username: 'duenio_ia',
            rol: 'DUENIO',
            permisos: ['ia.importar_listas'],
        });

        tokenUsuarioConPermisoIA = generarTokenTest({
            user_id: 4,
            username: 'operador_ia',
            rol: 'ENCARGADO',
            permisos: ['ia.importar_listas'],
        });

        tokenEncargadoSinPermisoIA = generarTokenTest({
            user_id: 3,
            username: 'encargado_sin_ia',
            rol: 'ENCARGADO',
            permisos: ['insumos.ver', 'recetas.ver_costos'],
        });
    });

    afterEach(async () => {
        global.fetch = fetchOriginal;
        jest.restoreAllMocks();
        if (mongoose.connection.readyState !== 0) {
            await ImportacionIA.deleteMany({ usuarioId: { $in: [1, 3, 4] } });
        }
    });

    afterAll(async () => {
        if (mongoose.connection.readyState !== 0) {
            await ImportacionIA.deleteMany({ usuarioId: { $in: [1, 3, 4] } });
            await mongoose.disconnect();
        }
    });

    it('rechaza con 401 Unauthorized si no se envía token JWT', async () => {
        const res = await request(app)
            .post('/api/importaciones')
            .send({ textoLista: 'Café 1 kg $18500' });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('mensaje');
    });

    it('rechaza con 403 Forbidden si el usuario no posee el permiso ia.importar_listas', async () => {
        const res = await request(app)
            .post('/api/importaciones')
            .set('Authorization', `Bearer ${tokenEncargadoSinPermisoIA}`)
            .send({ textoLista: 'Café 1 kg $18500' });

        expect(res.status).toBe(403);
        expect(res.body).toEqual({
            mensaje: 'No tiene permisos para realizar esta acción',
            detalles: "Se requiere el permiso 'ia.importar_listas'",
        });
    });

    it('rechaza con 400 Bad Request y formato único si textoLista es inválido', async () => {
        const res = await request(app)
            .post('/api/importaciones')
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send({ textoLista: '  ', versionPrompt: 'invalida' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('mensaje', 'Datos de entrada inválidos');
        expect(Array.isArray(res.body.detalles)).toBe(true);
    });

    it('responde 202 Accepted sin bloquear y guarda entrada, salida, latencia y versión de prompt en Mongo', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                proveedor_detectado: 'Mayorista Del Litoral',
                envio_detectado: '2500.00',
                moneda: 'ARS',
                items: [
                    {
                        nombre_insumo: 'Café tostado en grano',
                        cantidad: '1',
                        unidad: 'kg',
                        precio_total: '18500.00',
                        iva_incluido: true,
                        alicuota: '21.00',
                        confianza: '0.97',
                        texto_original: 'Café tostado en grano 1 kg: $18500',
                    },
                ],
                advertencias: [],
                version_prompt: 'v1',
                proveedor_ia: 'gemini',
                latencia_ms: 530,
                contingencia: false,
                mensaje_contingencia: null,
            }),
        });

        const res = await request(app)
            .post('/importaciones')
            .set('Authorization', `Bearer ${tokenUsuarioConPermisoIA}`)
            .send({
                textoLista: 'Café tostado en grano 1 kg: $18500\nEnvío: $2500',
                proveedorNombre: 'Mayorista Del Litoral',
                versionPrompt: 'v1',
            });

        expect(res.status).toBe(202);
        expect(res.body).toHaveProperty('importacionId');
        expect(res.body).toHaveProperty('versionPrompt', 'v1');

        const importacionId = res.body.importacionId;

        // Ejecutamos/esperamos la finalización del procesamiento en segundo plano para verificar la persistencia completa
        await procesarImportacionEnSegundoPlano(importacionId, {
            textoLista: 'Café tostado en grano 1 kg: $18500\nEnvío: $2500',
            proveedorNombre: 'Mayorista Del Litoral',
            versionPrompt: 'v1',
        });

        const resDetalle = await request(app)
            .get(`/api/importaciones/${importacionId}`)
            .set('Authorization', `Bearer ${tokenUsuarioConPermisoIA}`);

        expect(resDetalle.status).toBe(200);
        expect(resDetalle.body.estado).toBe('LISTA');
        expect(resDetalle.body.contingencia).toBe(false);
        expect(resDetalle.body.versionPrompt).toBe('v1');
        expect(resDetalle.body.proveedorIa).toBe('gemini');
        expect(resDetalle.body.latenciaMs).toBe(530);
        expect(resDetalle.body.entrada.textoLista).toContain('Café tostado en grano');
        expect(resDetalle.body.salida.envioDetectado).toBe('2500.00');
        expect(resDetalle.body.salida.items).toHaveLength(1);
        expect(resDetalle.body.salida.items[0]).toMatchObject({
            nombreInsumo: 'Café tostado en grano',
            cantidad: '1',
            unidad: 'kg',
            precioTotal: '18500.00',
        });
    });

    it('persiste estado CONTINGENCIA en Mongo si ai-service falla o devuelve salida inválida', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('Timeout ai-service'));

        const res = await request(app)
            .post('/api/importaciones')
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send({
                textoLista: 'Leche entera 12 litros $14400',
                proveedorNombre: 'Lácteos Centro',
            });

        expect(res.status).toBe(202);
        const importacionId = res.body.importacionId;

        await procesarImportacionEnSegundoPlano(importacionId, {
            textoLista: 'Leche entera 12 litros $14400',
            proveedorNombre: 'Lácteos Centro',
            versionPrompt: 'v1',
        });

        const doc = await ImportacionIA.findById(importacionId);
        expect(doc.estado).toBe('CONTINGENCIA');
        expect(doc.contingencia).toBe(true);
        expect(doc.mensajeError).toContain('manual o por CSV');
    });

    it('permite listar importaciones paginadas y devuelve 404 ante ID inexistente', async () => {
        await ImportacionIA.create({
            usuarioId: 1,
            entrada: { textoLista: 'Harina 25 kg $19000', proveedorNombre: 'Molino Norte' },
            estado: 'LISTA',
            versionPrompt: 'v1',
            latenciaMs: 310,
        });

        const resListado = await request(app)
            .get('/api/importaciones?pagina=1&limite=10&estado=LISTA')
            .set('Authorization', `Bearer ${tokenDuenio}`);

        expect(resListado.status).toBe(200);
        expect(resListado.body).toHaveProperty('datos');
        expect(resListado.body.total).toBeGreaterThanOrEqual(1);
        expect(resListado.body.pagina).toBe(1);

        const idInexistente = new mongoose.Types.ObjectId().toString();
        const res404 = await request(app)
            .get(`/api/importaciones/${idInexistente}`)
            .set('Authorization', `Bearer ${tokenDuenio}`);

        expect(res404.status).toBe(404);
        expect(res404.body).toEqual({
            mensaje: 'La importación solicitada no existe',
            detalles: null,
        });
    });
});
