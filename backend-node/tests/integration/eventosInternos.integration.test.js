import http from 'http';
import request from 'supertest';
import { io as ioClient } from 'socket.io-client';
import app from '../../app.js';
import {
    inicializarSocketIO,
    obtenerOpcionesClienteReconexion,
} from '../../src/sockets/index.js';
import { generarTokenTest } from '../helpers/auth.helper.js';

describe('Integración: POST /api/internos/eventos y emisión filtrada en vivo (HU8)', () => {
    let servidorHttp;
    let ioServer;
    let urlBase;
    const clientesAbiertos = [];
    let claveOriginal;

    const conectarCliente = (token) => {
        const cliente = ioClient(
            urlBase,
            obtenerOpcionesClienteReconexion(token, {
                forceNew: true,
                reconnection: false,
            })
        );
        clientesAbiertos.push(cliente);
        return cliente;
    };

    const esperarConexion = (cliente) =>
        new Promise((resolve, reject) => {
            if (cliente.connected) {
                resolve();
                return;
            }
            cliente.once('connect', () => resolve());
            cliente.once('connect_error', (err) => reject(err));
        });

    const esperarEvento = (cliente, nombreEvento, timeoutMs = 1500) =>
        new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                cliente.off(nombreEvento, manejador);
                reject(new Error(`Timeout esperando evento ${nombreEvento}`));
            }, timeoutMs);

            const manejador = (payload) => {
                clearTimeout(timer);
                resolve(payload);
            };

            cliente.once(nombreEvento, manejador);
        });

    beforeAll(async () => {
        claveOriginal = process.env.EVENTOS_INTERNOS_CLAVE;
        process.env.EVENTOS_INTERNOS_CLAVE = 'clave-interna-test-hu8-segura';

        servidorHttp = http.createServer(app);
        ioServer = inicializarSocketIO(servidorHttp);

        await new Promise((resolve) => {
            servidorHttp.listen(0, '127.0.0.1', () => {
                const { port } = servidorHttp.address();
                urlBase = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    afterEach(() => {
        process.env.EVENTOS_INTERNOS_CLAVE = 'clave-interna-test-hu8-segura';
        while (clientesAbiertos.length > 0) {
            const c = clientesAbiertos.pop();
            if (c && c.connected) {
                c.disconnect();
            } else if (c) {
                c.close();
            }
        }
    });

    afterAll(async () => {
        if (claveOriginal === undefined) {
            delete process.env.EVENTOS_INTERNOS_CLAVE;
        } else {
            process.env.EVENTOS_INTERNOS_CLAVE = claveOriginal;
        }
        if (ioServer) {
            await new Promise((resolve) => ioServer.close(resolve));
        }
        if (servidorHttp && servidorHttp.listening) {
            await new Promise((resolve) => servidorHttp.close(resolve));
        }
    });

    it('rechaza peticiones sin clave interna, con clave inválida o sin configurar en servidor', async () => {
        const bodyValido = {
            evento: 'venta.registrada',
            datos: { ventaId: 101, turnoId: 4, total: '2500.00' },
        };

        const resSinClave = await request(app).post('/api/internos/eventos').send(bodyValido);
        expect(resSinClave.status).toBe(401);
        expect(resSinClave.body).toEqual({
            mensaje: 'Clave interna de autenticación no provista',
            detalles: null,
        });

        const resClaveInvalida = await request(app)
            .post('/api/internos/eventos')
            .set('X-Clave-Interna', 'clave-incorrecta')
            .send(bodyValido);
        expect(resClaveInvalida.status).toBe(401);
        expect(resClaveInvalida.body).toEqual({
            mensaje: 'Clave interna de autenticación inválida',
            detalles: null,
        });

        delete process.env.EVENTOS_INTERNOS_CLAVE;
        const resSinConfig = await request(app)
            .post('/api/internos/eventos')
            .set('X-Clave-Interna', 'cualquiera')
            .send(bodyValido);
        expect(resSinConfig.status).toBe(500);
        expect(resSinConfig.body).toHaveProperty('mensaje');
        expect(resSinConfig.body).toHaveProperty('detalles', null);
    });

    it('valida el cuerpo con formato único de error (400)', async () => {
        const resEventoInvalido = await request(app)
            .post('/api/internos/eventos')
            .set('X-Clave-Interna', 'clave-interna-test-hu8-segura')
            .send({ evento: 'otro.evento', datos: { ventaId: 1 } });

        expect(resEventoInvalido.status).toBe(400);
        expect(resEventoInvalido.body).toHaveProperty('mensaje');
        expect(resEventoInvalido.body).toHaveProperty('detalles');

        const resSinVentaId = await request(app)
            .post('/api/internos/eventos')
            .set('X-Clave-Interna', 'clave-interna-test-hu8-segura')
            .send({ evento: 'venta.registrada', datos: { turnoId: 1 } });

        expect(resSinVentaId.status).toBe(400);
        expect(resSinVentaId.body).toHaveProperty('mensaje');
        expect(resSinVentaId.body).toHaveProperty('detalles');
    });

    it('emite venta.registrada filtrando costos (recetas.ver_costos) y arqueo (caja.ver_efectivo_esperado)', async () => {
        const clienteDuenio = conectarCliente(
            generarTokenTest({
                user_id: 1,
                username: 'duenio_vivo',
                rol: 'DUENIO',
                permisos: ['caja.ver_efectivo_esperado', 'recetas.ver_costos'],
            })
        );
        const clienteSoloArqueo = conectarCliente(
            generarTokenTest({
                user_id: 2,
                username: 'encargado_sin_costos',
                rol: 'ENCARGADO',
                permisos: ['caja.ver_efectivo_esperado', 'ventas.ver_historial_todos'],
            })
        );
        const clienteSoloCostos = conectarCliente(
            generarTokenTest({
                user_id: 3,
                username: 'analista_costos',
                rol: 'ENCARGADO',
                permisos: ['recetas.ver_costos'],
            })
        );
        const clienteCajero = conectarCliente(
            generarTokenTest({
                user_id: 4,
                username: 'cajero_vivo',
                rol: 'CAJERO',
                turnoId: 12,
                permisos: ['ventas.cobrar_ticket'],
            })
        );

        await Promise.all([
            esperarConexion(clienteDuenio),
            esperarConexion(clienteSoloArqueo),
            esperarConexion(clienteSoloCostos),
            esperarConexion(clienteCajero),
        ]);

        await new Promise((resolve) => {
            clienteCajero.emit('turno:unirse', { turnoId: 12 }, resolve);
        });

        const pDuenio = esperarEvento(clienteDuenio, 'venta.registrada');
        const pSoloArqueo = esperarEvento(clienteSoloArqueo, 'venta.registrada');
        const pSoloCostos = esperarEvento(clienteSoloCostos, 'venta.registrada');
        const pCajero = esperarEvento(clienteCajero, 'venta.registrada');

        const res = await request(app)
            .post('/api/internos/eventos')
            .set('X-Clave-Interna', 'clave-interna-test-hu8-segura')
            .send({
                evento: 'venta.registrada',
                datos: {
                    ventaId: 805,
                    turnoId: 12,
                    estado: 'EMITIDA',
                    origen: 'propio',
                    total: '7200.00',
                    medio_pago: 'EFECTIVO',
                    metodoPago: 'EFECTIVO',
                    costoTotalSnapshot: '2400.0000',
                    gananciaBruta: '4800.0000',
                    cantidadItems: 1,
                    items: [
                        {
                            productoId: 9,
                            productoNombre: 'Flat White',
                            cantidad: '2.00',
                            precioUnitario: '3600.00',
                            costoUnitarioSnapshot: '1200.0000',
                        },
                    ],
                },
            });

        expect(res.status).toBe(202);
        expect(res.body).toEqual({
            recibido: true,
            evento: 'venta.registrada',
            emitido: true,
        });

        const [evDuenio, evArqueo, evCostos, evCajero] = await Promise.all([
            pDuenio,
            pSoloArqueo,
            pSoloCostos,
            pCajero,
        ]);

        // Dueño recibe todo (arqueo + costos + ganancia)
        expect(evDuenio).toMatchObject({
            ventaId: 805,
            turnoId: 12,
            total: '7200.00',
            metodoPago: 'EFECTIVO',
            costoTotalSnapshot: '2400.0000',
            gananciaBruta: '4800.0000',
        });
        expect(evDuenio.items[0].costoUnitarioSnapshot).toBe('1200.0000');
        expect(evDuenio.items[0].precioUnitario).toBe('3600.00');

        // Usuario con caja.ver_efectivo_esperado SIN recetas.ver_costos: ve total pero NO costos ni ganancia
        expect(evArqueo.total).toBe('7200.00');
        expect(evArqueo.metodoPago).toBe('EFECTIVO');
        expect(evArqueo.costoTotalSnapshot).toBeUndefined();
        expect(evArqueo.gananciaBruta).toBeUndefined();
        expect(evArqueo.items[0].precioUnitario).toBe('3600.00');
        expect(evArqueo.items[0].costoUnitarioSnapshot).toBeUndefined();

        // Usuario con recetas.ver_costos SIN caja.ver_efectivo_esperado: ve costo pero NO total ni ganancia
        expect(evCostos.costoTotalSnapshot).toBe('2400.0000');
        expect(evCostos.total).toBeUndefined();
        expect(evCostos.metodoPago).toBeUndefined();
        expect(evCostos.gananciaBruta).toBeUndefined();
        expect(evCostos.items[0].costoUnitarioSnapshot).toBe('1200.0000');
        expect(evCostos.items[0].precioUnitario).toBeUndefined();

        // Cajero: no ve total, ni medio de pago, ni costos, ni ganancia
        expect(evCajero.ventaId).toBe(805);
        expect(evCajero.turnoId).toBe(12);
        expect(evCajero.total).toBeUndefined();
        expect(evCajero.medio_pago).toBeUndefined();
        expect(evCajero.metodoPago).toBeUndefined();
        expect(evCajero.costoTotalSnapshot).toBeUndefined();
        expect(evCajero.gananciaBruta).toBeUndefined();
        expect(evCajero.items[0].productoNombre).toBe('Flat White');
        expect(evCajero.items[0].precioUnitario).toBeUndefined();
        expect(evCajero.items[0].costoUnitarioSnapshot).toBeUndefined();
    });

    it('emite venta.anulada con el mismo filtrado estricto de costos y arqueo', async () => {
        const clienteDuenio = conectarCliente(
            generarTokenTest({
                user_id: 10,
                username: 'duenio_anul',
                rol: 'DUENIO',
                permisos: ['caja.ver_efectivo_esperado', 'recetas.ver_costos'],
            })
        );
        const clienteSinCostos = conectarCliente(
            generarTokenTest({
                user_id: 11,
                username: 'encargado_sin_costos_anul',
                rol: 'ENCARGADO',
                permisos: ['caja.ver_efectivo_esperado'],
            })
        );
        const clienteCajero = conectarCliente(
            generarTokenTest({
                user_id: 12,
                username: 'cajero_anul',
                rol: 'CAJERO',
                permisos: ['ventas.cobrar_ticket'],
            })
        );

        await Promise.all([
            esperarConexion(clienteDuenio),
            esperarConexion(clienteSinCostos),
            esperarConexion(clienteCajero),
        ]);

        const pDuenio = esperarEvento(clienteDuenio, 'venta.anulada');
        const pSinCostos = esperarEvento(clienteSinCostos, 'venta.anulada');
        const pCajero = esperarEvento(clienteCajero, 'venta.anulada');

        const res = await request(app)
            .post('/api/internos/eventos')
            .set('X-Clave-Interna', 'clave-interna-test-hu8-segura')
            .send({
                evento: 'venta.anulada',
                datos: {
                    ventaId: 806,
                    turnoId: 12,
                    estado: 'ANULADA',
                    motivoAnulacion: 'Error de carga',
                    total: '4500.00',
                    metodoPago: 'TARJETA',
                    costoTotalSnapshot: '1500.0000',
                    gananciaBruta: '3000.0000',
                },
            });

        expect(res.status).toBe(202);

        const [evDuenio, evSinCostos, evCajero] = await Promise.all([
            pDuenio,
            pSinCostos,
            pCajero,
        ]);

        expect(evDuenio).toMatchObject({
            ventaId: 806,
            estado: 'ANULADA',
            motivoAnulacion: 'Error de carga',
            total: '4500.00',
            costoTotalSnapshot: '1500.0000',
            gananciaBruta: '3000.0000',
        });

        expect(evSinCostos.ventaId).toBe(806);
        expect(evSinCostos.total).toBe('4500.00');
        expect(evSinCostos.costoTotalSnapshot).toBeUndefined();
        expect(evSinCostos.gananciaBruta).toBeUndefined();

        expect(evCajero.ventaId).toBe(806);
        expect(evCajero.estado).toBe('ANULADA');
        expect(evCajero.motivoAnulacion).toBe('Error de carga');
        expect(evCajero.total).toBeUndefined();
        expect(evCajero.metodoPago).toBeUndefined();
        expect(evCajero.costoTotalSnapshot).toBeUndefined();
        expect(evCajero.gananciaBruta).toBeUndefined();
    });
});
