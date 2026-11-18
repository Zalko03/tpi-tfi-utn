import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../app.js';
import { HistorialPrecio } from '../../src/models/HistorialPrecio.js';
import { ImportacionIA } from '../../src/models/ImportacionIA.js';
import { SnapshotCosteo } from '../../src/models/SnapshotCosteo.js';
import { procesarImportacionEnSegundoPlano } from '../../src/services/importacionIA.service.js';
import {
    extraerTextoDePdfBuffer,
    MENSAJE_PDF_ESCANEADO,
} from '../../../web/js/logicaPwa.js';
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
        expect(res.body.detalles).toEqual([
            'La lista de precios tiene que tener entre 3 y 15.000 caracteres.',
            'La versión de las instrucciones de la IA no es válida.',
        ]);
        expect(res.body.detalles.join(' ')).not.toMatch(/textoLista|versionPrompt|:/);
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
        expect(res.body).toHaveProperty('contingencia', false);
        expect(res.body).toHaveProperty('proveedorIa', null);
        expect(res.body).toHaveProperty('mensajeContingencia', null);
        expect(res.body).toHaveProperty('advertencias', []);

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
        expect(doc.proveedorIa).toBe('contingencia');
        expect(doc.mensajeContingencia).toContain('No se pudo usar la IA, revisá la configuración');
        expect(doc.advertencias).toContain('Timeout ai-service');
        expect(doc.mensajeError).toContain('manual o por CSV');

        const resDetalle = await request(app)
            .get(`/api/importaciones/${importacionId}`)
            .set('Authorization', `Bearer ${tokenDuenio}`);

        expect(resDetalle.status).toBe(200);
        expect(resDetalle.body.estado).toBe('CONTINGENCIA');
        expect(resDetalle.body.contingencia).toBe(true);
        expect(resDetalle.body.proveedorIa).toBe('contingencia');
        expect(resDetalle.body.mensajeContingencia).toContain(
            'No se pudo usar la IA, revisá la configuración'
        );
        expect(resDetalle.body.advertencias).toContain('Timeout ai-service');
        expect(resDetalle.body.salida.items).toEqual([]);
    });

    it('expone contingencia desde ai-service (sin ítems heurísticos falsos) y bloquea aprobación engañosa', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                proveedor_detectado: 'Distribuidora Heurística',
                envio_detectado: '0.00',
                moneda: 'ARS',
                items: [
                    {
                        nombre_insumo: 'Café heurístico',
                        cantidad: '1',
                        unidad: 'kg',
                        precio_total: '21000.00',
                    },
                ],
                advertencias: ['GROQ_API_KEY no está configurada en el entorno.'],
                version_prompt: 'v1',
                proveedor_ia: 'contingencia',
                latencia_ms: 2,
                contingencia: true,
                mensaje_contingencia: 'No se pudo usar la IA, revisá la configuración.',
            }),
        });

        const res = await request(app)
            .post('/api/importaciones')
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send({
                textoLista: 'Café heurístico 1 kg $21000',
                proveedorNombre: 'Distribuidora Heurística',
            });

        expect(res.status).toBe(202);
        const importacionId = res.body.importacionId;

        await procesarImportacionEnSegundoPlano(importacionId, {
            textoLista: 'Café heurístico 1 kg $21000',
            proveedorNombre: 'Distribuidora Heurística',
            versionPrompt: 'v1',
        });

        const resDetalle = await request(app)
            .get(`/api/importaciones/${importacionId}`)
            .set('Authorization', `Bearer ${tokenDuenio}`);

        expect(resDetalle.status).toBe(200);
        expect(resDetalle.body.estado).toBe('CONTINGENCIA');
        expect(resDetalle.body.contingencia).toBe(true);
        expect(resDetalle.body.proveedorIa).toBe('contingencia');
        expect(resDetalle.body.mensajeContingencia).toContain('No se pudo usar la IA');
        expect(resDetalle.body.advertencias).toContain(
            'GROQ_API_KEY no está configurada en el entorno.'
        );
        expect(resDetalle.body.salida.items).toEqual([]);

        const resAprobar = await request(app)
            .post(`/api/importaciones/${importacionId}/aprobar`)
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send({
                items: [{ nombreInsumo: 'Café heurístico', cantidad: '1', unidad: 'kg', precioTotal: '21000.00' }],
            });

        expect(resAprobar.status).toBe(400);
        expect(resAprobar.body.mensaje).toContain('modo contingencia');
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

    it('extrae texto real de dos PDFs distintos con pdf.js local, genera propuestas distintas y rechaza PDF binario o escaneado', async () => {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const requireLocal = createRequire(import.meta.url);
        const pdfjsLocal = requireLocal(
            path.resolve(__dirname, '../../../web/vendor/pdfjs/pdf.min.js')
        );
        pdfjsLocal.GlobalWorkerOptions.workerSrc = path.resolve(
            __dirname,
            '../../../web/vendor/pdfjs/pdf.worker.min.js'
        );

        const crearPdf = (lineas) => {
            const ops = ['BT', '/F1 12 Tf'];
            let y = 760;
            for (const l of lineas) {
                const esc = l.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
                ops.push(`1 0 0 1 72 ${y} Tm (${esc}) Tj`);
                y -= 18;
            }
            ops.push('ET');
            const stream = ops.join('\n');
            const objs = [
                '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
                '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
                '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
                `4 0 obj\n<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream\nendobj\n`,
                '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
            ];
            let pdf = '%PDF-1.4\n';
            const offsets = [0];
            for (const obj of objs) {
                offsets.push(Buffer.byteLength(pdf, 'latin1'));
                pdf += obj;
            }
            const xrefPos = Buffer.byteLength(pdf, 'latin1');
            pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
            for (let i = 1; i < offsets.length; i++) {
                pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
            }
            pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
            return new Uint8Array(Buffer.from(pdf, 'latin1'));
        };

        const pdf1 = crearPdf(['Cafe Tostado 5 kg: $115000', 'Leche Entera 12 l: $16200']);
        const pdf2 = crearPdf(['Azucar Organica 10 kg: $14500', 'Cacao Amargo 2 kg: $19400']);
        const pdfEscaneado = crearPdf([]);

        const ext1 = await extraerTextoDePdfBuffer(pdf1.buffer, pdfjsLocal, { disableWorker: true });
        const ext2 = await extraerTextoDePdfBuffer(pdf2.buffer, pdfjsLocal, { disableWorker: true });
        const ext3 = await extraerTextoDePdfBuffer(pdfEscaneado.buffer, pdfjsLocal, {
            disableWorker: true,
        });

        expect(ext1.ok).toBe(true);
        expect(ext2.ok).toBe(true);
        expect(ext3.ok).toBe(false);
        expect(ext3.esEscaneado).toBe(true);
        expect(ext3.mensajeError).toBe(MENSAJE_PDF_ESCANEADO);

        // Si alguien intenta enviar %PDF- crudo sin extraer, el backend rechaza con 400
        const resBinario = await request(app)
            .post('/api/importaciones')
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send({ textoLista: '%PDF-1.4 binary raw stream' });
        expect(resBinario.status).toBe(400);
        expect(resBinario.body.detalles).toEqual([
            'No se pudo leer el texto del PDF. Probá subiéndolo de nuevo.',
        ]);

        global.fetch = jest.fn(async (_url, opciones) => {
            const body = JSON.parse(opciones.body);
            if (body.texto_lista.includes('Cafe Tostado')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        proveedor_detectado: 'Tostadero PDF 1',
                        envio_detectado: '0.00',
                        moneda: 'ARS',
                        items: [
                            {
                                nombre_insumo: 'Cafe Tostado',
                                cantidad: '5',
                                unidad: 'kg',
                                precio_total: '115000.00',
                            },
                            {
                                nombre_insumo: 'Leche Entera',
                                cantidad: '12',
                                unidad: 'l',
                                precio_total: '16200.00',
                            },
                        ],
                        advertencias: [],
                        version_prompt: 'v1',
                        proveedor_ia: 'groq',
                        latencia_ms: 180,
                        contingencia: false,
                    }),
                };
            }
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    proveedor_detectado: 'Molino PDF 2',
                    envio_detectado: '0.00',
                    moneda: 'ARS',
                    items: [
                        {
                            nombre_insumo: 'Azucar Organica',
                            cantidad: '10',
                            unidad: 'kg',
                            precio_total: '14500.00',
                        },
                        {
                            nombre_insumo: 'Cacao Amargo',
                            cantidad: '2',
                            unidad: 'kg',
                            precio_total: '19400.00',
                        },
                    ],
                    advertencias: [],
                    version_prompt: 'v1',
                    proveedor_ia: 'groq',
                    latencia_ms: 195,
                    contingencia: false,
                }),
            };
        });

        const resPost1 = await request(app)
            .post('/api/importaciones')
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send({
                textoLista: ext1.texto,
                proveedorNombre: 'Tostadero PDF 1',
                origenArchivo: 'pdf',
            });
        const resPost2 = await request(app)
            .post('/api/importaciones')
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send({
                textoLista: ext2.texto,
                proveedorNombre: 'Molino PDF 2',
                origenArchivo: 'pdf',
            });

        expect(resPost1.status).toBe(202);
        expect(resPost2.status).toBe(202);

        await procesarImportacionEnSegundoPlano(resPost1.body.importacionId, {
            textoLista: ext1.texto,
            proveedorNombre: 'Tostadero PDF 1',
            versionPrompt: 'v1',
            origenArchivo: 'pdf',
        });
        await procesarImportacionEnSegundoPlano(resPost2.body.importacionId, {
            textoLista: ext2.texto,
            proveedorNombre: 'Molino PDF 2',
            versionPrompt: 'v1',
            origenArchivo: 'pdf',
        });

        const det1 = await request(app)
            .get(`/api/importaciones/${resPost1.body.importacionId}`)
            .set('Authorization', `Bearer ${tokenDuenio}`);
        const det2 = await request(app)
            .get(`/api/importaciones/${resPost2.body.importacionId}`)
            .set('Authorization', `Bearer ${tokenDuenio}`);

        expect(det1.body.entrada.origenArchivo).toBe('pdf');
        expect(det2.body.entrada.origenArchivo).toBe('pdf');
        expect(det1.body.salida.items.map((i) => i.nombreInsumo)).toEqual([
            'Cafe Tostado',
            'Leche Entera',
        ]);
        expect(det2.body.salida.items.map((i) => i.nombreInsumo)).toEqual([
            'Azucar Organica',
            'Cacao Amargo',
        ]);
    });

    it('acepta POST /api/importaciones con imagen válida (>100KB), no guarda la imagen en MongoDB y rechaza entradas inválidas', async () => {
        const resSinDatos = await request(app)
            .post('/api/importaciones')
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send({ proveedorNombre: 'Sin datos' });
        expect(resSinDatos.status).toBe(400);
        expect(resSinDatos.body).toHaveProperty('mensaje', 'Datos de entrada inválidos');

        const resMimeInvalido = await request(app)
            .post('/api/importaciones')
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send({
                origenArchivo: 'imagen',
                imagenBase64: Buffer.from('gif-simulado').toString('base64'),
                imagenMime: 'image/gif',
            });
        expect(resMimeInvalido.status).toBe(400);
        expect(resMimeInvalido.body.detalles).toContain('Elegí una foto JPG, PNG o WEBP.');

        const resMuyGrande = await request(app)
            .post('/api/importaciones')
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send({
                origenArchivo: 'imagen',
                imagenBase64: 'A'.repeat(7 * 1024 * 1024 + 4),
                imagenMime: 'image/jpeg',
            });
        expect(resMuyGrande.status).toBe(400);
        expect(resMuyGrande.body.detalles).toContain('La foto es demasiado pesada. Máximo 5 MB.');

        // Payload > 100 KB (prueba que el límite JSON ampliado funciona en /api/importaciones)
        const imagenMedianaB64 = Buffer.alloc(160 * 1024, 0x42).toString('base64');
        const resOk = await request(app)
            .post('/api/importaciones')
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send({
                proveedorNombre: 'Mayorista Con Foto',
                origenArchivo: 'imagen',
                imagenBase64: imagenMedianaB64,
                imagenMime: 'image/jpeg',
            });

        expect(resOk.status).toBe(202);
        expect(resOk.body).toHaveProperty('importacionId');

        const docMongo = await ImportacionIA.findById(resOk.body.importacionId).lean();
        expect(docMongo.entrada.origenArchivo).toBe('imagen');
        expect(docMongo.entrada.textoLista).toBeNull();
        expect(docMongo.entrada.imagenMime).toBe('image/jpeg');
        expect(docMongo.entrada.imagenTamanoBytes).toBe(160 * 1024);
        expect(docMongo.entrada.imagenHash).toMatch(/^[a-f0-9]{64}$/);
        expect(JSON.stringify(docMongo)).not.toContain(imagenMedianaB64);

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                proveedor_detectado: 'Mayorista Con Foto',
                envio_detectado: '0.00',
                moneda: 'ARS',
                items: [
                    {
                        nombre_insumo: 'Leche entera',
                        cantidad: '12',
                        unidad: 'l',
                        precio_total: '16200.00',
                    },
                ],
                advertencias: [],
                version_prompt: 'v1',
                proveedor_ia: 'groq',
                latencia_ms: 820,
                contingencia: false,
            }),
        });

        await procesarImportacionEnSegundoPlano(resOk.body.importacionId, {
            proveedorNombre: 'Mayorista Con Foto',
            versionPrompt: 'v1',
            origenArchivo: 'imagen',
            imagenBase64: imagenMedianaB64,
            imagenMime: 'image/jpeg',
        });

        const cuerpoEnviado = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(cuerpoEnviado.imagen_base64).toBe(imagenMedianaB64);
        expect(cuerpoEnviado.imagen_mime).toBe('image/jpeg');
        expect(cuerpoEnviado.origen_archivo).toBe('imagen');

        const det = await request(app)
            .get(`/api/importaciones/${resOk.body.importacionId}`)
            .set('Authorization', `Bearer ${tokenDuenio}`);
        expect(det.status).toBe(200);
        expect(det.body.estado).toBe('LISTA');
        expect(det.body.salida.items).toHaveLength(1);
        expect(det.body.salida.items[0].nombreInsumo).toBe('Leche entera');
    });
});
