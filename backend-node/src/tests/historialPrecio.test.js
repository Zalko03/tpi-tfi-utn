import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../app.js';
import { HistorialPrecio } from '../models/HistorialPrecio.js';

describe('Historial de Precios en MongoDB (T1.9)', () => {
    beforeAll(async () => {
        const uriTest = process.env.MONGO_URI || 'mongodb://localhost:27017/cafe_gestion_test';
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(uriTest);
        }
    });

    afterAll(async () => {
        if (mongoose.connection.readyState !== 0) {
            await HistorialPrecio.deleteMany({ motivo: 'Test Jest' });
            await mongoose.disconnect();
        }
    });

    it('debe registrar un cambio de precio y listarlo con paginación', async () => {
        const nuevoHistorial = {
            productoId: 101,
            insumoId: 5,
            costoAnterior: '1200.0000',
            costoNuevo: '1450.0000',
            motivo: 'Test Jest',
        };

        const resCrear = await request(app)
            .post('/api/historial-precios')
            .send(nuevoHistorial)
            .set('Accept', 'application/json');

        expect(resCrear.status).toBe(201);
        expect(resCrear.body).toHaveProperty('_id');
        expect(resCrear.body.productoId).toBe(101);

        const resListar = await request(app)
            .get('/api/historial-precios?productoId=101')
            .set('Accept', 'application/json');

        expect(resListar.status).toBe(200);
        expect(resListar.body).toHaveProperty('datos');
        expect(resListar.body.total).toBeGreaterThanOrEqual(1);
    });
});
