import http from 'http';
import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { io as ioClient } from 'socket.io-client';
import request from 'supertest';
import app from '../../app.js';
import { HistorialPrecio } from '../../src/models/HistorialPrecio.js';
import { ImportacionIA } from '../../src/models/ImportacionIA.js';
import { SnapshotCosteo } from '../../src/models/SnapshotCosteo.js';
import { procesarImportacionEnSegundoPlano } from '../../src/services/importacionIA.service.js';
import {
    inicializarSocketIO,
    obtenerOpcionesClienteReconexion,
} from '../../src/sockets/index.js';
import { generarTokenTest } from '../helpers/auth.helper.js';

describe('Ensayo Sistemático de Fallos y Degradación Elegante (T3.7)', () => {
    const fetchOriginal = global.fetch;
    let servidorHttp;
    let ioServer;
    let urlBaseSocket;
    let tokenDuenio;

    beforeAll(async () => {
        const uriTest = process.env.MONGO_URI || 'mongodb://localhost:27017/cafe_gestion_test';
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(uriTest);
        }

        tokenDuenio = generarTokenTest({
            user_id: 77,
            username: 'duenio_ensayo',
            rol: 'DUENIO',
            permisos: ['ia.importar_listas', 'compras.registrar', 'recetas.ver_costos', 'insumos.ver'],
        });

        servidorHttp = http.createServer(app);
        ioServer = inicializarSocketIO(servidorHttp);

        await new Promise((resolve) => {
            servidorHttp.listen(0, '127.0.0.1', () => {
                const { port } = servidorHttp.address();
                urlBaseSocket = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    afterEach(async () => {
        global.fetch = fetchOriginal;
        jest.restoreAllMocks();
        if (mongoose.connection.readyState !== 0) {
            await ImportacionIA.deleteMany({ usuarioId: 77 });
            await HistorialPrecio.deleteMany({ productoId: { $in: [701, 702] } });
            await SnapshotCosteo.deleteMany({ productoId: { $in: [701, 702] } });
        }
    });

    afterAll(async () => {
        if (ioServer) {
            await new Promise((resolve) => ioServer.close(resolve));
        }
        if (servidorHttp && servidorHttp.listening) {
            await new Promise((resolve) => servidorHttp.close(resolve));
        }
        if (mongoose.connection.readyState !== 0) {
            await ImportacionIA.deleteMany({ usuarioId: 77 });
            await HistorialPrecio.deleteMany({ productoId: { $in: [701, 702] } });
            await SnapshotCosteo.deleteMany({ productoId: { $in: [701, 702] } });
            await mongoose.disconnect();
        }
    });

    it('Escenario 1 (ai-service apagado): POST /api/importaciones responde 202, activa CONTINGENCIA en Mongo y notifica por Socket.IO sin bloquear', async () => {
        // Simulamos que ai-service (puerto 8001) está apagado (ECONNREFUSED)
        global.fetch = jest
            .fn()
            .mockRejectedValue(new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:8001'));

        const clienteSocket = ioClient(
            urlBaseSocket,
            obtenerOpcionesClienteReconexion(tokenDuenio, { forceNew: true })
        );

        await new Promise((resolve, reject) => {
            clienteSocket.once('connect', resolve);
            clienteSocket.once('connect_error', reject);
        });

        const promesaAvisoSocket = new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error('Timeout esperando evento importacion.lista en contingencia')),
                2000
            );
            clienteSocket.once('importacion.lista', (payload) => {
                clearTimeout(timer);
                resolve(payload);
            });
        });

        const res = await request(app)
            .post('/api/importaciones')
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send({
                proveedorNombre: 'Mayorista Ensayo T3.7',
                textoLista: 'Café en grano 1 kg $22000\nAzúcar 10 kg $14000',
            });

        expect(res.status).toBe(202);
        const importacionId = res.body.importacionId;

        await procesarImportacionEnSegundoPlano(importacionId, {
            proveedorNombre: 'Mayorista Ensayo T3.7',
            textoLista: 'Café en grano 1 kg $22000\nAzúcar 10 kg $14000',
            versionPrompt: 'v1',
        });

        const eventoRecibido = await promesaAvisoSocket;
        clienteSocket.disconnect();

        expect(eventoRecibido).toMatchObject({
            importacionId,
            estado: 'CONTINGENCIA',
            contingencia: true,
            cantidadItems: 0,
        });

        const docEnMongo = await ImportacionIA.findById(importacionId);
        expect(docEnMongo.estado).toBe('CONTINGENCIA');
        expect(docEnMongo.contingencia).toBe(true);
        expect(docEnMongo.mensajeError).toContain('manual o por CSV');
    });

    it('Escenario 2 (backend-django apagado en lectura): GET /api/productos/:id/resumen-costo responde 200 con degradado=true y datos históricos de MongoDB', async () => {
        await HistorialPrecio.create({
            productoId: 701,
            insumoId: 10,
            costoAnterior: '800.0000',
            costoNuevo: '950.0000',
            motivo: 'Compra previa almacenada en MongoDB',
        });

        await SnapshotCosteo.create({
            productoId: 701,
            costoTotal: '950.0000',
            margenBruto: '0.6800',
            costoManoObra: '100.0000',
            costoDescartables: '50.0000',
            desgloseInsumos: [
                {
                    insumoId: 10,
                    nombre: 'Café Tostado',
                    cantidad: '18.0000',
                    unidad: 'g',
                    costoUnitario: '44.4444',
                    costoLinea: '800.0000',
                },
            ],
        });

        // Simulamos que backend-django (puerto 8000) está apagado
        global.fetch = jest
            .fn()
            .mockRejectedValue(new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:8000'));

        const res = await request(app)
            .get('/api/productos/701/resumen-costo')
            .set('Authorization', `Bearer ${tokenDuenio}`);

        expect(res.status).toBe(200);
        expect(res.body.producto).toMatchObject({
            degradado: true,
            id: 701,
            mensaje: 'No se pudo comunicar con el núcleo transaccional Django',
        });
        expect(res.body.historialReciente).toHaveLength(1);
        expect(res.body.historialReciente[0].costoNuevo).toBe('950.0000');
        expect(res.body.ultimoSnapshot).not.toBeNull();
        expect(res.body.ultimoSnapshot.costoTotal).toBe('950.0000');
    });

    it('Escenario 3 (backend-django apagado al aprobar y recuperación posterior): devuelve 502 preservando estado LISTA y completa aprobación al recuperar Django', async () => {
        const importacion = await ImportacionIA.create({
            usuarioId: 77,
            entrada: {
                textoLista: 'Cacao Amargo 1 kg $19000',
                proveedorNombre: 'Distribuidora Cacao',
            },
            salida: {
                proveedorDetectado: 'Distribuidora Cacao',
                envioDetectado: '1000.00',
                moneda: 'ARS',
                items: [
                    {
                        nombreInsumo: 'Cacao Amargo',
                        cantidad: '1',
                        unidad: 'kg',
                        precioTotal: '19000.00',
                        ivaIncluido: true,
                        alicuota: '21.00',
                        confianza: '0.96',
                    },
                ],
                advertencias: [],
            },
            estado: 'LISTA',
        });

        // Intento 1: Django apagado -> debe responder 502 y conservar estado LISTA
        global.fetch = jest
            .fn()
            .mockRejectedValue(new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:8000'));

        const resFallo = await request(app)
            .post(`/api/importaciones/${importacion._id}/aprobar`)
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send({});

        expect(resFallo.status).toBe(502);
        expect(resFallo.body).toHaveProperty('mensaje');
        expect(resFallo.body).toHaveProperty('detalles');

        const docTrasFallo = await ImportacionIA.findById(importacion._id);
        expect(docTrasFallo.estado).toBe('LISTA');

        // Intento 2: Django vuelve a estar en línea -> el reintento de aprobación se completa con 200 OK
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 201,
            json: async () => ({
                mensaje: 'Importación registrada tras recuperación',
                proveedor_id: 8,
                proveedor_nombre: 'Distribuidora Cacao',
                envio_total: '1000.00',
                compras_creadas: [
                    {
                        compra_id: 88,
                        insumo_id: 21,
                        insumo_nombre: 'Cacao Amargo',
                        unidad_base: 'g',
                        cantidad: '1.0000',
                        unidad: 'kg',
                        precio_total: '19000.00',
                        envio_prorrateado: '1000.00',
                        iva_incluido: true,
                        alicuota: '21.00',
                        costo_unitario_anterior: '15.0000',
                        costo_unitario_calculado: '20.0000',
                    },
                ],
                productos_recalculados: [
                    {
                        producto_id: 702,
                        insumo_id: 21,
                        nombre: 'Mocaccino Doble',
                        costo_anterior: '920.0000',
                        costo_nuevo: '1020.0000',
                        margen_nuevo: '0.6600',
                        costo_mano_obra: '120.0000',
                        costo_descartables: '80.0000',
                        desglose_insumos: [
                            {
                                insumo_id: 21,
                                nombre: 'Cacao Amargo',
                                cantidad: '20.0000',
                                unidad: 'g',
                                costo_unitario: '20.0000',
                                costo_linea: '400.0000',
                            },
                        ],
                    },
                ],
            }),
        });

        const resRecuperado = await request(app)
            .post(`/api/importaciones/${importacion._id}/aprobar`)
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send({});

        expect(resRecuperado.status).toBe(200);
        expect(resRecuperado.body.importacion.estado).toBe('APROBADA');
        expect(resRecuperado.body.comprasCreadas).toHaveLength(1);
    });

    it('Escenario 4 (Fallo inesperado en operación de MongoDB): errorHandler responde 500 con formato único sin caer el proceso Node (/health sigue 200)', async () => {
        jest.spyOn(ImportacionIA, 'find').mockImplementationOnce(() => {
            throw new Error('MongoNetworkError: connection closed unexpectedly');
        });

        const resError = await request(app)
            .get('/api/importaciones')
            .set('Authorization', `Bearer ${tokenDuenio}`);

        expect(resError.status).toBe(500);
        expect(resError.body).toHaveProperty('mensaje');
        expect(resError.body).toHaveProperty('detalles');

        // El proceso Express sigue saludable tras el fallo de la consulta
        const resHealth = await request(app).get('/health');
        expect(resHealth.status).toBe(200);
        expect(resHealth.body).toEqual({
            estado: 'ok',
            servicio: 'backend-node',
        });
    });
});
