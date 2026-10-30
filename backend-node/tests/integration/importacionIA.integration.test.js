import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../app.js';
import { HistorialPrecio } from '../../src/models/HistorialPrecio.js';
import { ImportacionIA } from '../../src/models/ImportacionIA.js';
import { SnapshotCosteo } from '../../src/models/SnapshotCosteo.js';
import { procesarImportacionEnSegundoPlano } from '../../src/services/importacionIA.service.js';
import { generarTokenTest } from '../helpers/auth.helper.js';

describe('Integración: Importaciones con IA y Aprobación Humana (T3.2 y T3.3)', () => {
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
            permisos: ['ia.importar_listas', 'compras.registrar'],
        });

        tokenUsuarioConPermisoIA = generarTokenTest({
            user_id: 4,
            username: 'operador_ia',
            rol: 'ENCARGADO',
            permisos: ['ia.importar_listas', 'compras.registrar'],
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
            await HistorialPrecio.deleteMany({ productoId: 901 });
            await SnapshotCosteo.deleteMany({ productoId: 901 });
        }
    });

    afterAll(async () => {
        if (mongoose.connection.readyState !== 0) {
            await ImportacionIA.deleteMany({ usuarioId: { $in: [1, 3, 4] } });
            await HistorialPrecio.deleteMany({ productoId: 901 });
            await SnapshotCosteo.deleteMany({ productoId: 901 });
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

    // =========================================================================
    // T3.3 — Aprobación y rechazo humano (Node -> Django -> Historial/Snapshot)
    // =========================================================================

    it('aprueba una importación LISTA, llama a Django, guarda historial_precios + snapshots_costeo y pasa a APROBADA (CA3.2)', async () => {
        const importacion = await ImportacionIA.create({
            usuarioId: 1,
            entrada: {
                textoLista: 'Café Tostado Brasil 1 kg $28000\nEnvío $2000',
                proveedorNombre: 'Distribuidora Litoral',
            },
            salida: {
                proveedorDetectado: 'Distribuidora Litoral',
                envioDetectado: '2000.00',
                moneda: 'ARS',
                items: [
                    {
                        nombreInsumo: 'Café Tostado Brasil',
                        cantidad: '1',
                        unidad: 'kg',
                        precioTotal: '28000.00',
                        ivaIncluido: true,
                        alicuota: '21.00',
                        confianza: '0.98',
                    },
                ],
                advertencias: [],
            },
            estado: 'LISTA',
            versionPrompt: 'v1',
            proveedorIa: 'gemini',
            latenciaMs: 410,
        });

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 201,
            json: async () => ({
                mensaje: 'Importación de compras registrada y recetas recalculadas exitosamente',
                proveedor_id: 5,
                proveedor_nombre: 'Distribuidora Litoral',
                envio_total: '2000.00',
                compras_creadas: [
                    {
                        compra_id: 42,
                        insumo_id: 11,
                        insumo_nombre: 'Café Tostado Brasil',
                        unidad_base: 'g',
                        cantidad: '1.0000',
                        unidad: 'kg',
                        precio_total: '28000.00',
                        envio_prorrateado: '2000.00',
                        iva_incluido: true,
                        alicuota: '21.00',
                        costo_unitario_anterior: '20.0000',
                        costo_unitario_calculado: '30.0000',
                    },
                ],
                productos_recalculados: [
                    {
                        producto_id: 901,
                        insumo_id: 11,
                        nombre: 'Flat White Especial',
                        costo_anterior: '860.0000',
                        costo_nuevo: '1040.0000',
                        margen_nuevo: '0.6750',
                        costo_mano_obra: '120.0000',
                        costo_descartables: '80.0000',
                        desglose_insumos: [
                            {
                                insumo_id: 11,
                                nombre: 'Café Tostado Brasil',
                                cantidad: '18.0000',
                                unidad: 'g',
                                costo_unitario: '30.0000',
                                costo_linea: '540.0000',
                            },
                        ],
                    },
                ],
            }),
        });

        const resAprobar = await request(app)
            .post(`/api/importaciones/${importacion._id}/aprobar`)
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send({});

        expect(resAprobar.status).toBe(200);
        expect(resAprobar.body.importacion.estado).toBe('APROBADA');
        expect(resAprobar.body.importacion.aprobadoPorId).toBe(1);
        expect(resAprobar.body.importacion.comprasGeneradasIds).toEqual([42]);
        expect(resAprobar.body.importacion.productosRecalculadosIds).toEqual([901]);
        expect(resAprobar.body.comprasCreadas).toHaveLength(1);
        expect(resAprobar.body.productosRecalculados).toHaveLength(1);

        // Verificar que se guardó el registro en historial_precios (CA3.2)
        const historiales = await HistorialPrecio.find({ productoId: 901 });
        expect(historiales).toHaveLength(1);
        expect(historiales[0].insumoId).toBe(11);
        expect(historiales[0].costoAnterior).toBe('860.0000');
        expect(historiales[0].costoNuevo).toBe('1040.0000');

        // Verificar que se guardó el snapshot en snapshots_costeo (CA3.2)
        const snapshots = await SnapshotCosteo.find({ productoId: 901 });
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0].costoTotal).toBe('1040.0000');
        expect(snapshots[0].margenBruto).toBe('0.6750');
        expect(snapshots[0].costoManoObra).toBe('120.0000');
        expect(snapshots[0].desgloseInsumos).toHaveLength(1);
        expect(snapshots[0].desgloseInsumos[0].costoLinea).toBe('540.0000');
    });

    it('rechaza una importación sin llamar a Django ni crear compras ni modificar costos (CA7.3)', async () => {
        const importacion = await ImportacionIA.create({
            usuarioId: 1,
            entrada: {
                textoLista: 'Azúcar 10 kg $15000',
                proveedorNombre: 'Distribuidora Dulce',
            },
            salida: {
                proveedorDetectado: 'Distribuidora Dulce',
                envioDetectado: '0.00',
                moneda: 'ARS',
                items: [
                    {
                        nombreInsumo: 'Azúcar',
                        cantidad: '10',
                        unidad: 'kg',
                        precioTotal: '15000.00',
                    },
                ],
                advertencias: [],
            },
            estado: 'LISTA',
        });

        global.fetch = jest.fn();

        const resRechazar = await request(app)
            .post(`/api/importaciones/${importacion._id}/rechazar`)
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send({ motivo: 'Precios desactualizados respecto al acuerdo telefónico' });

        expect(resRechazar.status).toBe(200);
        expect(resRechazar.body.importacion.estado).toBe('RECHAZADA');
        expect(resRechazar.body.importacion.rechazadoPorId).toBe(1);
        expect(resRechazar.body.importacion.motivoRechazo).toBe(
            'Precios desactualizados respecto al acuerdo telefónico'
        );
        expect(global.fetch).not.toHaveBeenCalled();

        // Un segundo intento de aprobar o rechazar una importación ya RECHAZADA devuelve 400
        const resDoble = await request(app)
            .post(`/api/importaciones/${importacion._id}/aprobar`)
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send({});

        expect(resDoble.status).toBe(400);
        expect(resDoble.body).toHaveProperty('mensaje');
    });

    it('devuelve 502 Bad Gateway y conserva estado LISTA si Django no está disponible al aprobar', async () => {
        const importacion = await ImportacionIA.create({
            usuarioId: 1,
            entrada: {
                textoLista: 'Leche 10 l $12000',
                proveedorNombre: 'Lácteos Sur',
            },
            salida: {
                proveedorDetectado: 'Lácteos Sur',
                envioDetectado: '0.00',
                moneda: 'ARS',
                items: [
                    {
                        nombreInsumo: 'Leche',
                        cantidad: '10',
                        unidad: 'l',
                        precioTotal: '12000.00',
                    },
                ],
                advertencias: [],
            },
            estado: 'LISTA',
        });

        global.fetch = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));

        const res = await request(app)
            .post(`/api/importaciones/${importacion._id}/aprobar`)
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send({});

        expect(res.status).toBe(502);
        expect(res.body).toHaveProperty('mensaje');
        expect(res.body).toHaveProperty('detalles');

        const docActual = await ImportacionIA.findById(importacion._id);
        expect(docActual.estado).toBe('LISTA');
    });
});
