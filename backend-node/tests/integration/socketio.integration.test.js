import http from 'http';
import { io as ioClient } from 'socket.io-client';
import app from '../../app.js';
import {
    emitirCostoActualizado,
    emitirImportacionLista,
    emitirStockBajo,
    emitirVentaRegistrada,
} from '../../src/sockets/emitter.js';
import {
    inicializarSocketIO,
    obtenerEstadoPresencia,
    obtenerOpcionesClienteReconexion,
} from '../../src/sockets/index.js';
import { generarTokenTest } from '../helpers/auth.helper.js';

describe('Integración: Socket.IO en Tiempo Real, Salas, Eventos y Presencia (T3.5)', () => {
    let servidorHttp;
    let ioServer;
    let urlBase;
    const clientesAbiertos = [];

    const conectarCliente = (token, opcionesExtra = {}) => {
        const opciones = obtenerOpcionesClienteReconexion(token, {
            forceNew: true,
            reconnectionDelay: 50,
            reconnectionDelayMax: 150,
            ...opcionesExtra,
        });
        const cliente = ioClient(urlBase, opciones);
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

    const verificarNoRecibeEvento = (cliente, nombreEvento, esperaMs = 200) =>
        new Promise((resolve, reject) => {
            const manejador = (payload) => {
                clearTimeout(timer);
                reject(
                    new Error(
                        `El cliente no autorizado recibió indebidamente ${nombreEvento}: ${JSON.stringify(payload)}`
                    )
                );
            };

            const timer = setTimeout(() => {
                cliente.off(nombreEvento, manejador);
                resolve(true);
            }, esperaMs);

            cliente.once(nombreEvento, manejador);
        });

    beforeAll(async () => {
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
        if (ioServer) {
            await new Promise((resolve) => ioServer.close(resolve));
        }
        if (servidorHttp && servidorHttp.listening) {
            await new Promise((resolve) => servidorHttp.close(resolve));
        }
    });

    it('rechaza conexiones en el handshake cuando no hay token o el token es inválido (CA9.1)', async () => {
        const clienteSinToken = conectarCliente('', { reconnection: false });

        await expect(esperarConexion(clienteSinToken)).rejects.toThrow(
            'Token de autenticación no provisto en el handshake'
        );

        const clienteTokenFalso = conectarCliente('token.invalido.falso', {
            reconnection: false,
        });

        await expect(esperarConexion(clienteTokenFalso)).rejects.toThrow(
            'Token de autenticación inválido o firma no verificada'
        );
    });

    it('une automáticamente a la sala local, registra presencia activa y la actualiza al desconectar', async () => {
        const tokenDuenio = generarTokenTest({
            user_id: 1,
            username: 'duenio_presencia',
            rol: 'DUENIO',
        });
        const tokenCajero = generarTokenTest({
            user_id: 20,
            username: 'cajero_presencia',
            rol: 'CAJERO',
            permisos: ['ventas.crear'],
        });

        const clienteDuenio = conectarCliente(tokenDuenio);
        await esperarConexion(clienteDuenio);

        const promesaPresenciaConCajero = esperarEvento(clienteDuenio, 'presencia.actualizada');
        const clienteCajero = conectarCliente(tokenCajero);
        await esperarConexion(clienteCajero);

        const presenciaAlConectar = await promesaPresenciaConCajero;
        expect(presenciaAlConectar.totalUsuarios).toBe(2);
        expect(presenciaAlConectar.usuarios.map((u) => u.username)).toEqual(
            expect.arrayContaining(['duenio_presencia', 'cajero_presencia'])
        );

        // Consulta explícita de presencia mediante callback
        const estadoConsultado = await new Promise((resolve) => {
            clienteDuenio.emit('presencia:consultar', (respuesta) => resolve(respuesta));
        });
        expect(estadoConsultado.totalConexiones).toBe(2);

        // Al desconectarse el cajero, se notifica a la sala 'local'
        const promesaPresenciaAlSalir = esperarEvento(clienteDuenio, 'presencia.actualizada');
        clienteCajero.disconnect();

        const presenciaFinal = await promesaPresenciaAlSalir;
        expect(presenciaFinal.totalUsuarios).toBe(1);
        expect(obtenerEstadoPresencia().totalUsuarios).toBe(1);
    });

    it('controla el acceso a la sala turno:{id} y emite venta.registrada a local y turno:{id}', async () => {
        const tokenCajeroTitular = generarTokenTest({
            user_id: 15,
            username: 'cajero_turno_10',
            rol: 'CAJERO',
            permisos: ['ventas.crear'],
        });
        const tokenOtroCajero = generarTokenTest({
            user_id: 16,
            username: 'cajero_otro',
            rol: 'CAJERO',
            permisos: ['ventas.crear'],
        });

        const clienteTitular = conectarCliente(tokenCajeroTitular);
        const clienteOtro = conectarCliente(tokenOtroCajero);
        await Promise.all([esperarConexion(clienteTitular), esperarConexion(clienteOtro)]);

        // 1. El cajero titular se une a su propio turno (turno:10)
        const respUnionTitular = await new Promise((resolve) => {
            clienteTitular.emit('turno:unirse', { turnoId: 10, titularId: 15 }, resolve);
        });
        expect(respUnionTitular).toEqual({ ok: true, sala: 'turno:10' });

        // 2. Otro cajero intenta unirse al turno 10 ajeno -> debe ser rechazado (docs/seguridad.md §5.2)
        const promesaErrorAutorizacion = esperarEvento(clienteOtro, 'error:autorizacion');
        const respUnionAjena = await new Promise((resolve) => {
            clienteOtro.emit('turno:unirse', { turnoId: 10, titularId: 15 }, resolve);
        });
        const eventoError = await promesaErrorAutorizacion;

        expect(respUnionAjena.ok).toBe(false);
        expect(respUnionAjena.mensaje).toContain('turno de caja ajeno');
        expect(eventoError.mensaje).toContain('turno de caja ajeno');

        // 3. Emitir venta.registrada: la reciben los miembros de 'local' y 'turno:10' without duplicar entrega por socket
        const promesaVentaTitular = esperarEvento(clienteTitular, 'venta.registrada');
        const promesaVentaLocal = esperarEvento(clienteOtro, 'venta.registrada');

        emitirVentaRegistrada({
            ventaId: 501,
            turnoId: 10,
            total: '6400.00',
            metodoPago: 'EFECTIVO',
        });

        const [ventaEnTitular, ventaEnLocal] = await Promise.all([
            promesaVentaTitular,
            promesaVentaLocal,
        ]);

        expect(ventaEnTitular).toMatchObject({
            ventaId: 501,
            turnoId: 10,
            total: '6400.00',
        });
        expect(ventaEnLocal.ventaId).toBe(501);
    });

    it('filtra costo.actualizado y stock.bajo según rol/permisos y emite importacion.lista a local (CA8.3)', async () => {
        const tokenDuenio = generarTokenTest({
            user_id: 1,
            username: 'duenio_alertas',
            rol: 'DUENIO',
            permisos: ['recetas.ver_costos'],
        });
        const tokenEncargadoSinCostos = generarTokenTest({
            user_id: 5,
            username: 'encargado_stock',
            rol: 'ENCARGADO',
            permisos: ['insumos.ver'],
        });
        const tokenCajero = generarTokenTest({
            user_id: 22,
            username: 'cajero_raso',
            rol: 'CAJERO',
            permisos: ['ventas.crear'],
        });

        const clienteDuenio = conectarCliente(tokenDuenio);
        const clienteEncargado = conectarCliente(tokenEncargadoSinCostos);
        const clienteCajero = conectarCliente(tokenCajero);

        await Promise.all([
            esperarConexion(clienteDuenio),
            esperarConexion(clienteEncargado),
            esperarConexion(clienteCajero),
        ]);

        // A. Evento 'costo.actualizado' con margen bajo (< 0.30) -> solo DUENIO (con recetas.ver_costos) lo recibe
        const promesaCostoDuenio = esperarEvento(clienteDuenio, 'costo.actualizado');
        const promesaNoCostoEncargado = verificarNoRecibeEvento(
            clienteEncargado,
            'costo.actualizado'
        );
        const promesaNoCostoCajero = verificarNoRecibeEvento(clienteCajero, 'costo.actualizado');

        emitirCostoActualizado({
            productoId: 901,
            nombre: 'Cappuccino Italiano',
            costoAnterior: '900.0000',
            costoNuevo: '1500.0000',
            margenNuevo: '0.2400',
            margenObjetivo: 0.3,
        });

        const [costoRecibido] = await Promise.all([
            promesaCostoDuenio,
            promesaNoCostoEncargado,
            promesaNoCostoCajero,
        ]);

        expect(costoRecibido).toMatchObject({
            productoId: 901,
            nombre: 'Cappuccino Italiano',
            costoNuevo: '1500.0000',
            margenNuevo: '0.2400',
            alertaMargenBajo: true,
        });

        // B. Evento 'stock.bajo' -> lo reciben DUENIO y ENCARGADO, pero NO el CAJERO
        const promesaStockDuenio = esperarEvento(clienteDuenio, 'stock.bajo');
        const promesaStockEncargado = esperarEvento(clienteEncargado, 'stock.bajo');
        const promesaNoStockCajero = verificarNoRecibeEvento(clienteCajero, 'stock.bajo');

        emitirStockBajo({
            insumoId: 11,
            nombre: 'Leche Entera',
            stockActual: '1500.0000',
            stockMinimo: '5000.0000',
            unidadBase: 'ml',
        });

        const [stockDuenio, stockEncargado] = await Promise.all([
            promesaStockDuenio,
            promesaStockEncargado,
            promesaNoStockCajero,
        ]);

        expect(stockDuenio.insumoId).toBe(11);
        expect(stockEncargado.nombre).toBe('Leche Entera');

        // C. Evento 'importacion.lista' -> se emite a la sala 'local'
        const promesaImpDuenio = esperarEvento(clienteDuenio, 'importacion.lista');
        emitirImportacionLista({
            importacionId: '665f1a2b3c4d5e6f7a8b9c0d',
            estado: 'LISTA',
            proveedorDetectado: 'Mayorista Café Sur',
            cantidadItems: 4,
            contingencia: false,
        });

        const impRecibida = await promesaImpDuenio;
        expect(impRecibida).toMatchObject({
            importacionId: '665f1a2b3c4d5e6f7a8b9c0d',
            estado: 'LISTA',
            cantidadItems: 4,
        });
    });

    it('reconecta automáticamente al cliente tras un corte de conexión del socket', async () => {
        const token = generarTokenTest({
            user_id: 9,
            username: 'encargado_reconexion',
            rol: 'ENCARGADO',
        });

        const cliente = conectarCliente(token, {
            reconnection: true,
            reconnectionDelay: 40,
            reconnectionDelayMax: 80,
        });

        await esperarConexion(cliente);
        const primerSocketId = cliente.id;
        expect(primerSocketId).toBeTruthy();

        const promesaReconexion = new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error('Timeout esperando reconexión automática')),
                2500
            );
            cliente.io.once('reconnect', () => {
                clearTimeout(timer);
                resolve(true);
            });
        });

        // Simulamos caída abrupta del transporte subyacente para disparar la reconexión automática del cliente
        cliente.io.engine.close();

        await expect(promesaReconexion).resolves.toBe(true);
        await esperarConexion(cliente);
        expect(cliente.connected).toBe(true);
    });
});
