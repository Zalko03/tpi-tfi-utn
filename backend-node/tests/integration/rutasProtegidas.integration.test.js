import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../app.js';
import { HistorialPrecio } from '../../src/models/HistorialPrecio.js';
import { generarTokenTest } from '../helpers/auth.helper.js';

describe('Integración: Rutas Protegidas de backend-node (docs/seguridad.md §5.2 y T2.4)', () => {
    let tokenDuenio;
    let tokenCajeroSinCostosNiInsumos;
    let tokenEncargadoConPermisos;

    beforeAll(async () => {
        const uriTest = process.env.MONGO_URI || 'mongodb://localhost:27017/cafe_gestion_test';
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(uriTest);
        }

        tokenDuenio = generarTokenTest({
            user_id: 1,
            username: 'duenio',
            rol: 'DUENIO',
            permisos: [],
        });

        tokenCajeroSinCostosNiInsumos = generarTokenTest({
            user_id: 2,
            username: 'cajero1',
            rol: 'CAJERO',
            permisos: ['ventas.cobrar_ticket', 'caja.abrir_turno'],
        });

        tokenEncargadoConPermisos = generarTokenTest({
            user_id: 3,
            username: 'encargado1',
            rol: 'ENCARGADO',
            permisos: ['recetas.ver_costos', 'insumos.ver'],
        });
    });

    afterAll(async () => {
        if (mongoose.connection.readyState !== 0) {
            await HistorialPrecio.deleteMany({ motivo: 'Test Integracion Rutas' });
            await mongoose.disconnect();
        }
    });

    describe('GET /api/productos/:id/resumen-costo (requiere recetas.ver_costos)', () => {
        it('debe responder 401 Unauthorized si la petición no incluye token', async () => {
            const res = await request(app)
                .get('/api/productos/1/resumen-costo')
                .set('Accept', 'application/json');

            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('mensaje', 'Token de autenticación no provisto');
        });

        it('debe responder 403 Forbidden si el usuario no tiene el permiso recetas.ver_costos', async () => {
            const res = await request(app)
                .get('/api/productos/1/resumen-costo')
                .set('Authorization', `Bearer ${tokenCajeroSinCostosNiInsumos}`)
                .set('Accept', 'application/json');

            expect(res.status).toBe(403);
            expect(res.body).toHaveProperty('mensaje', 'No tiene permisos para realizar esta acción');
            expect(res.body.detalles).toContain('recetas.ver_costos');
        });

        it('debe responder 200 OK cuando el usuario tiene permiso recetas.ver_costos', async () => {
            const res = await request(app)
                .get('/api/productos/1/resumen-costo')
                .set('Authorization', `Bearer ${tokenEncargadoConPermisos}`)
                .set('Accept', 'application/json');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('producto');
            expect(res.body.producto).toHaveProperty('id', 1);
            expect(res.body).toHaveProperty('historialReciente');
        });

        it('debe responder 200 OK cuando el usuario es DUENIO', async () => {
            const res = await request(app)
                .get('/api/productos/1/resumen-costo')
                .set('Authorization', `Bearer ${tokenDuenio}`)
                .set('Accept', 'application/json');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('producto');
            expect(res.body.producto).toHaveProperty('id', 1);
        });
    });

    describe('GET y POST /api/historial-precios (requiere insumos.ver)', () => {
        it('debe responder 401 si no hay token en GET /api/historial-precios', async () => {
            const res = await request(app)
                .get('/api/historial-precios')
                .set('Accept', 'application/json');

            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('mensaje', 'Token de autenticación no provisto');
        });

        it('debe responder 403 si el cajero intenta consultar historial sin insumos.ver', async () => {
            const res = await request(app)
                .get('/api/historial-precios')
                .set('Authorization', `Bearer ${tokenCajeroSinCostosNiInsumos}`)
                .set('Accept', 'application/json');

            expect(res.status).toBe(403);
            expect(res.body.detalles).toContain('insumos.ver');
        });

        it('debe responder 200 OK al listar historial con token que contiene insumos.ver', async () => {
            const res = await request(app)
                .get('/api/historial-precios')
                .set('Authorization', `Bearer ${tokenEncargadoConPermisos}`)
                .set('Accept', 'application/json');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('datos');
        });

        it('debe responder 401 si se intenta POST /api/historial-precios sin token', async () => {
            const res = await request(app)
                .post('/api/historial-precios')
                .send({
                    productoId: 200,
                    costoAnterior: '100.00',
                    costoNuevo: '120.00',
                    motivo: 'Test Integracion Rutas',
                })
                .set('Accept', 'application/json');

            expect(res.status).toBe(401);
        });

        it('debe responder 403 si se intenta POST /api/historial-precios sin insumos.ver', async () => {
            const res = await request(app)
                .post('/api/historial-precios')
                .set('Authorization', `Bearer ${tokenCajeroSinCostosNiInsumos}`)
                .send({
                    productoId: 200,
                    costoAnterior: '100.00',
                    costoNuevo: '120.00',
                    motivo: 'Test Integracion Rutas',
                })
                .set('Accept', 'application/json');

            expect(res.status).toBe(403);
        });

        it('debe registrar y responder 201 Created cuando tiene permiso insumos.ver', async () => {
            const res = await request(app)
                .post('/api/historial-precios')
                .set('Authorization', `Bearer ${tokenEncargadoConPermisos}`)
                .send({
                    productoId: 201,
                    costoAnterior: '150.0000',
                    costoNuevo: '180.0000',
                    motivo: 'Test Integracion Rutas',
                })
                .set('Accept', 'application/json');

            expect(res.status).toBe(201);
            expect(res.body.productoId).toBe(201);
        });
    });
});
