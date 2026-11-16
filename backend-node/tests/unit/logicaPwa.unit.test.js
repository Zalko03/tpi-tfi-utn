import { jest } from '@jest/globals';
import {
    agregarProductoAlCarrito,
    buscarProductoPorCodigoOTexto,
    calcularResumenCarrito,
    CLAVE_COLA_VENTAS_RECHAZADAS,
    construirQueryRangoFechas,
    convertirMontoACentavos,
    ejecutarSincronizacionConLock,
    eliminarVentaOffline,
    encolarVentaOffline,
    escaparHtml,
    estaFechaEnRango,
    evaluarEstadoImportacionIA,
    evaluarEstadoResumenIA,
    extraerItemsDesdeTextoLista,
    filtrarRegistrosPorRangoFechas,
    formatearCentavosADecimal,
    formatearEventoTiempoReal,
    formatearFechaLocalInput,
    generarIdOperacion,
    limpiarColaOffline,
    MENSAJE_IA_NO_DISPONIBLE,
    obtenerContenidoPlantillaCsv,
    obtenerVentasOffline,
    obtenerVentasRechazadasOffline,
    parsearCsvProveedor,
    procesarColaVentasOffline,
    unificarTrazabilidadRegistros,
    validarRangoFechas,
} from '../../../web/js/logicaPwa.js';

describe('Lógica del Cliente PWA (T3.6 - Tablero, Importación IA y Caja)', () => {
    const catalogoEjemplo = [
        { id: 1, nombre: 'Espresso Doble', codigo_barras: '7790001000011', precio_venta: '2200.50' },
        { id: 2, nombre: 'Flat White Especial', codigo_barras: '7790001000028', precio_venta: '3200.00' },
    ];

    describe('Aritmética monetaria en centavos enteros (sin float)', () => {
        it('convierte montos decimales a centavos enteros exactos y viceversa', () => {
            expect(convertirMontoACentavos('2200.50')).toBe(220050);
            expect(convertirMontoACentavos('19,99')).toBe(1999);
            expect(convertirMontoACentavos('18500')).toBe(1850000);
            expect(convertirMontoACentavos('')).toBe(0);

            // Evita el clásico error de punto flotante 0.1 + 0.2 = 0.30000000000000004
            const suma = convertirMontoACentavos('0.10') + convertirMontoACentavos('0.20');
            expect(suma).toBe(30);
            expect(formatearCentavosADecimal(suma)).toBe('0.30');
            expect(formatearCentavosADecimal(220050)).toBe('2200.50');
        });
    });

    describe('Búsqueda por lector de código de barras (HID) o nombre (CA4.4)', () => {
        it('encuentra un producto por código de barras exacto', () => {
            const prod = buscarProductoPorCodigoOTexto(catalogoEjemplo, '7790001000028');
            expect(prod).not.toBeNull();
            expect(prod.id).toBe(2);
            expect(prod.nombre).toBe('Flat White Especial');
        });

        it('encuentra un producto por coincidencia parcial de nombre y retorna null si no existe', () => {
            const prod = buscarProductoPorCodigoOTexto(catalogoEjemplo, 'espresso');
            expect(prod?.id).toBe(1);
            expect(buscarProductoPorCodigoOTexto(catalogoEjemplo, '999999999')).toBeNull();
        });
    });

    describe('Carrito de Caja Rápida y construcción de payload para Django', () => {
        it('agrega productos, acumula cantidades repetidas y calcula el total exacto', () => {
            let carrito = [];
            carrito = agregarProductoAlCarrito(carrito, catalogoEjemplo[0], 2);
            carrito = agregarProductoAlCarrito(carrito, catalogoEjemplo[1], 1);
            carrito = agregarProductoAlCarrito(carrito, catalogoEjemplo[0], 1);

            expect(carrito).toHaveLength(2);
            expect(carrito[0].cantidad).toBe(3);
            expect(carrito[0].subtotalDecimal).toBe('6601.50');

            const resumen = calcularResumenCarrito(carrito);
            expect(resumen.cantidadUnidades).toBe(4);
            expect(resumen.totalCentavos).toBe(980150);
            expect(resumen.totalDecimal).toBe('9801.50');
            expect(resumen.itemsPayload).toEqual([
                { producto: 1, cantidad: 3 },
                { producto: 2, cantidad: 1 },
            ]);
        });
    });

    describe('Formateo de eventos de Socket.IO para el Tablero en Tiempo Real', () => {
        it('formatea venta.registrada, costo.actualizado (con alerta de margen < 30%), stock.bajo e importacion.lista', () => {
            const evVenta = formatearEventoTiempoReal('venta.registrada', {
                ventaId: 77,
                turnoId: 4,
                total: '5400.00',
                metodoPago: 'EFECTIVO',
            });
            expect(evVenta.nivel).toBe('exito');
            expect(evVenta.titulo).toContain('#77');

            const evCostoCritico = formatearEventoTiempoReal('costo.actualizado', {
                nombre: 'Cappuccino Italiano',
                costoAnterior: '900.0000',
                costoNuevo: '1600.0000',
                margenNuevo: '0.2200',
                alertaMargenBajo: true,
            });
            expect(evCostoCritico.nivel).toBe('peligro');
            expect(evCostoCritico.alertaMargenBajo).toBe(true);
            expect(evCostoCritico.detalle).toContain('22.0%');

            const evStock = formatearEventoTiempoReal('stock.bajo', {
                nombre: 'Leche Entera',
                stockActual: '1200',
                stockMinimo: '5000',
                unidadBase: 'ml',
            });
            expect(evStock.nivel).toBe('peligro');
            expect(evStock.titulo).toContain('Leche Entera');

            const evImp = formatearEventoTiempoReal('importacion.lista', {
                estado: 'LISTA',
                proveedorDetectado: 'Mayorista Sur',
                cantidadItems: 5,
                contingencia: false,
            });
            expect(evImp.nivel).toBe('info');
            expect(evImp.titulo).toContain('5 ítems');
        });
    });

    describe('Parser CSV robusto de listas de precios (coma y punto y coma)', () => {
        it('parsea correctamente la plantilla oficial separada por comas y acumula envío', () => {
            const csvComas = obtenerContenidoPlantillaCsv();
            const resultado = parsearCsvProveedor(csvComas);

            expect(resultado.delimitadorDetectado).toBe(',');
            expect(resultado.items).toHaveLength(4);
            expect(resultado.items[0]).toMatchObject({
                nombre_insumo: 'Café Tostado en Grano Especial',
                cantidad: '5',
                unidad: 'kg',
                precio_total: '115000.00',
                alicuota: '21.00',
                envio: '4500.00',
            });
            expect(resultado.envioTotal).toBe('4500.00');
            expect(resultado.textoParaIa).toContain('Café Tostado en Grano Especial 5 kg: $115000.00');
        });

        it('parsea archivos exportados de Excel en español separados por punto y coma (;)', () => {
            const csvPuntoYComa = [
                'insumo;cantidad;unidad;precio_total;alicuota_iva;envio',
                'Leche Descremada;12;l;15800,50;21,00;1200,00',
                'Cacao Amargo Puro;2;kg;19400,00;10,50;0,00',
            ].join('\n');

            const resultado = parsearCsvProveedor(csvPuntoYComa);

            expect(resultado.delimitadorDetectado).toBe(';');
            expect(resultado.items).toHaveLength(2);
            expect(resultado.items[0].nombre_insumo).toBe('Leche Descremada');
            expect(resultado.items[0].precio_total).toBe('15800.50');
            expect(resultado.items[1].alicuota).toBe('10.50');
            expect(resultado.envioTotal).toBe('1200.00');
        });

        it('extrae ítems estructurados desde texto libre o CSV usando extraerItemsDesdeTextoLista', () => {
            const texto = [
                'Mayorista Café del Litoral',
                '- Café Colombia Supremo x 5 kg: $115000',
                '- Leche Entera Barista x 12 litros: $16200',
                'Envío: $4500',
            ].join('\n');

            const extraido = extraerItemsDesdeTextoLista(texto);
            expect(extraido.envioDetectado).toBe('4500.00');
            expect(extraido.items).toHaveLength(2);
            expect(extraido.items[0]).toMatchObject({
                nombreInsumo: 'Café Colombia Supremo',
                cantidad: '5',
                unidad: 'kg',
                precioTotal: '115000.00',
            });
            expect(extraido.items[1]).toMatchObject({
                nombreInsumo: 'Leche Entera Barista',
                cantidad: '12',
                unidad: 'l',
                precioTotal: '16200.00',
            });
        });
    });

    describe('Cola de Sincronización Offline de Ventas (Resiliencia ante corte de Internet)', () => {
        const crearStorageMock = () => {
            const mapa = new Map();
            return {
                getItem: (clave) => (mapa.has(clave) ? mapa.get(clave) : null),
                setItem: (clave, valor) => mapa.set(clave, String(valor)),
                removeItem: (clave) => mapa.delete(clave),
            };
        };

        it('encola ventas offline en orden, las recupera y permite vaciar la cola al sincronizar', () => {
            const storage = crearStorageMock();
            expect(obtenerVentasOffline(storage)).toEqual([]);

            const venta1 = {
                turno_caja: 1,
                metodo_pago: 'EFECTIVO',
                items_entrada: [{ producto: 1, cantidad: 2 }],
            };
            const venta2 = {
                turno_caja: 1,
                metodo_pago: 'TARJETA',
                items_entrada: [{ producto: 2, cantidad: 1 }],
            };

            const res1 = encolarVentaOffline(venta1, storage);
            expect(res1.totalEnCola).toBe(1);
            expect(res1.ventaEncolada.idTemporal).toMatch(/^OFF-/);

            const res2 = encolarVentaOffline(venta2, storage);
            expect(res2.totalEnCola).toBe(2);

            const pendientes = obtenerVentasOffline(storage);
            expect(pendientes).toHaveLength(2);
            expect(pendientes[0].payload.metodo_pago).toBe('EFECTIVO');
            expect(pendientes[1].payload.metodo_pago).toBe('TARJETA');

            limpiarColaOffline(storage);
            expect(obtenerVentasOffline(storage)).toEqual([]);
        });

        it('elimina ventas individuales confirmadas para evitar duplicados si se corta la sincronización', () => {
            const storage = crearStorageMock();
            const r1 = encolarVentaOffline({ turno_caja: 2, items: [{ producto: 10, cantidad: 1 }] }, storage);
            const r2 = encolarVentaOffline({ turno_caja: 2, items: [{ producto: 11, cantidad: 2 }] }, storage);

            const restantes = eliminarVentaOffline(r1.ventaEncolada.idTemporal, storage);
            expect(restantes).toHaveLength(1);
            expect(restantes[0].idTemporal).toBe(r2.ventaEncolada.idTemporal);
            expect(obtenerVentasOffline(storage)).toHaveLength(1);

            const vacia = eliminarVentaOffline(r2.ventaEncolada.idTemporal, storage);
            expect(vacia).toEqual([]);
            expect(obtenerVentasOffline(storage)).toEqual([]);
        });

        it('escapa etiquetas HTML peligrosas para prevenir XSS en tablas y reportes', () => {
            expect(escaparHtml('<img src=x onerror="alert(1)">')).toBe(
                '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
            );
            expect(escaparHtml("Café 'Especial' & Co.")).toBe(
                'Café &#39;Especial&#39; &amp; Co.'
            );
            expect(escaparHtml(null)).toBe('');
        });

        it('genera id_operacion UUID v4 válido y lo incluye al encolar ventas offline', () => {
            const uuidRegex =
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            const id1 = generarIdOperacion();
            expect(id1).toMatch(uuidRegex);

            const storage = crearStorageMock();
            const res = encolarVentaOffline(
                { turno_caja: 7, medio_pago: 'EFECTIVO', items: [{ producto: 1, cantidad: 1 }] },
                storage
            );
            expect(res.ventaEncolada.payload.id_operacion).toMatch(uuidRegex);
        });

        it('sincroniza cola offline con navigator.locks (y fallback), enviando origen offline e id_operacion y aislando rechazos 4xx', async () => {
            const storage = crearStorageMock();
            const opId1 = generarIdOperacion();
            const opId2 = generarIdOperacion();
            const opId3 = generarIdOperacion();

            // Venta 1: 400 definitivo (ej. producto inactivo) -> debe moverse a cafe_cola_ventas_rechazadas
            encolarVentaOffline(
                {
                    id_operacion: opId1,
                    turno_caja: 10,
                    medio_pago: 'EFECTIVO',
                    origen: 'propio',
                    items_entrada: [{ producto_id: 99, cantidad: 1 }],
                },
                storage
            );
            // Venta 2: válida con turno_caja 10 abierto -> debe enviarse con origen 'offline', id_operacion y turno 10
            encolarVentaOffline(
                {
                    id_operacion: opId2,
                    turno_caja: 10,
                    medio_pago: 'TARJETA',
                    origen: 'propio',
                    items_entrada: [{ producto_id: 2, cantidad: 1 }],
                },
                storage
            );
            // Venta 3: válida pero turno 5 cerrado -> debe usar el turno abierto del usuario actual (10), no el de otro cajero (20)
            encolarVentaOffline(
                {
                    id_operacion: opId3,
                    turno_caja: 5,
                    medio_pago: 'EFECTIVO',
                    items_entrada: [{ producto_id: 3, cantidad: 2 }],
                },
                storage
            );

            const cuerposEnviados = [];
            const fetchMock = jest.fn(async (_url, opciones) => {
                const body = JSON.parse(opciones.body);
                cuerposEnviados.push(body);
                if (body.id_operacion === opId1) {
                    return {
                        ok: false,
                        status: 400,
                        json: async () => ({ mensaje: 'Producto inactivo' }),
                    };
                }
                return {
                    ok: true,
                    status: 201,
                    json: async () => ({ id: 100 }),
                };
            });

            const lockRequestMock = jest.fn(async (_nombre, _opts, cb) => cb({ name: 'sync-ventas' }));

            const resLock = await ejecutarSincronizacionConLock(
                () =>
                    procesarColaVentasOffline({
                        fetchFn: fetchMock,
                        djangoUrl: 'http://localhost:8000',
                        tokenJwt: 'jwt.test',
                        usuario: { id: 15, rol: 'CAJERO' },
                        listaTurnos: [
                            { id: 5, usuario: 15, estado: 'CERRADO' },
                            { id: 20, usuario: 99, estado: 'ABIERTO' },
                            { id: 10, usuario: 15, estado: 'ABIERTO' },
                        ],
                        storage,
                    }),
                { enCurso: false },
                { request: lockRequestMock }
            );

            expect(lockRequestMock).toHaveBeenCalledWith(
                'sync-ventas',
                { ifAvailable: true },
                expect.any(Function)
            );
            expect(resLock.sincronizadas).toBe(2);
            expect(resLock.rechazadas).toBe(1);
            expect(resLock.restantes).toBe(0);
            expect(obtenerVentasOffline(storage)).toEqual([]);

            const rechazadas = obtenerVentasRechazadasOffline(storage);
            expect(rechazadas).toHaveLength(1);
            expect(rechazadas[0].payload.id_operacion).toBe(opId1);
            expect(rechazadas[0].statusHttp).toBe(400);
            expect(storage.getItem(CLAVE_COLA_VENTAS_RECHAZADAS)).toBeTruthy();

            expect(cuerposEnviados[1].origen).toBe('offline');
            expect(cuerposEnviados[1].id_operacion).toBe(opId2);
            expect(cuerposEnviados[1].turno_caja).toBe(10);
            expect(cuerposEnviados[2].origen).toBe('offline');
            expect(cuerposEnviados[2].id_operacion).toBe(opId3);
            expect(cuerposEnviados[2].turno_caja).toBe(10);
        });

        it('interrumpe sincronización ante 5xx o 429 manteniendo pendientes y respeta lock no disponible', async () => {
            const storage = crearStorageMock();
            encolarVentaOffline(
                { turno_caja: 10, medio_pago: 'EFECTIVO', items: [{ producto: 1, cantidad: 1 }] },
                storage
            );

            const lockOcupado = {
                request: jest.fn(async (_nombre, _opts, cb) => cb(null)),
            };
            const omitido = await ejecutarSincronizacionConLock(
                () => Promise.resolve({ sincronizadas: 1 }),
                { enCurso: false },
                lockOcupado
            );
            expect(omitido).toEqual({ omitidoPorLock: true });

            const fetchError503 = jest.fn(async () => ({ ok: false, status: 503 }));
            const res503 = await ejecutarSincronizacionConLock(
                () =>
                    procesarColaVentasOffline({
                        fetchFn: fetchError503,
                        djangoUrl: 'http://localhost:8000',
                        tokenJwt: 'jwt.test',
                        usuario: { id: 15, rol: 'CAJERO' },
                        listaTurnos: [{ id: 10, usuario: 15, estado: 'ABIERTO' }],
                        storage,
                    }),
                { enCurso: false },
                null
            );

            expect(res503.interrumpidoPorRedOServidor).toBe(true);
            expect(res503.restantes).toBe(1);
            expect(obtenerVentasRechazadasOffline(storage)).toEqual([]);
        });
    });

    describe('Filtro por rango de fechas y trazabilidad unificada (Reportes)', () => {
        it('valida rangos Desde/Hasta y construye query params compatibles', () => {
            expect(validarRangoFechas('2026-11-12', '2026-11-14')).toEqual({
                valido: true,
                mensaje: '',
            });
            expect(validarRangoFechas('', '2026-11-14').valido).toBe(true);
            expect(validarRangoFechas('2026-11-15', '2026-11-12').valido).toBe(false);
            expect(validarRangoFechas('invalida', '2026-11-12').valido).toBe(false);

            expect(
                construirQueryRangoFechas('2026-11-12', '2026-11-14', { limite: 100 })
            ).toBe('fecha_desde=2026-11-12&fecha_hasta=2026-11-14&limite=100');
            expect(construirQueryRangoFechas('', '')).toBe('');
            expect(formatearFechaLocalInput(new Date(2026, 10, 12, 23, 45))).toBe('2026-11-12');
        });

        it('filtra fechas inclusivamente de 00:00:00 a 23:59:59.999 en estado local/offline', () => {
            const isoInicioDia12 = new Date(2026, 10, 12, 0, 0, 0, 0).toISOString();
            const isoFinDia14 = new Date(2026, 10, 14, 23, 59, 59, 999).toISOString();
            const isoAntes = new Date(2026, 10, 11, 23, 59, 59, 999).toISOString();
            const isoDespues = new Date(2026, 10, 15, 0, 0, 0, 0).toISOString();

            expect(estaFechaEnRango(isoInicioDia12, '2026-11-12', '2026-11-14')).toBe(true);
            expect(estaFechaEnRango(isoFinDia14, '2026-11-12', '2026-11-14')).toBe(true);
            expect(estaFechaEnRango(isoAntes, '2026-11-12', '2026-11-14')).toBe(false);
            expect(estaFechaEnRango(isoDespues, '2026-11-12', '2026-11-14')).toBe(false);

            const registros = [
                { id: 1, cierre: isoAntes, apertura: isoAntes },
                { id: 2, cierre: null, apertura: isoInicioDia12 },
                { id: 3, cierre: isoFinDia14, apertura: isoAntes },
                { id: 4, cierre: isoDespues, apertura: isoDespues },
            ];
            const filtrados = filtrarRegistrosPorRangoFechas(
                registros,
                ['cierre', 'apertura'],
                '2026-11-12',
                '2026-11-14'
            );
            expect(filtrados.map((r) => r.id)).toEqual([2, 3]);
        });

        it('unifica y ordena ventas, movimientos de stock, cierres de caja y cola offline dentro del rango', () => {
            const fechaDia12 = new Date(2026, 10, 12, 10, 30, 0).toISOString();
            const fechaDia13 = new Date(2026, 10, 13, 14, 0, 0).toISOString();
            const fechaDia14 = new Date(2026, 10, 14, 19, 15, 0).toISOString();
            const fechaFuera = new Date(2026, 10, 10, 12, 0, 0).toISOString();

            const resultado = unificarTrazabilidadRegistros({
                ventas: [
                    {
                        id: 10,
                        fecha: fechaDia12,
                        medio_pago: 'EFECTIVO',
                        total: '5000.00',
                        usuario_nombre: 'cajero_demo',
                        items: [{ producto_nombre: 'Espresso', cantidad: 2 }],
                    },
                    {
                        id: 11,
                        fecha: fechaFuera,
                        medio_pago: 'TARJETA',
                        total: '3000.00',
                    },
                ],
                movimientosStock: [
                    {
                        id: 'compra-1',
                        fecha: fechaDia13,
                        tipo: 'INGRESO',
                        insumo_nombre: 'Café Colombia',
                        cantidad: '5',
                        unidad: 'kg',
                        monto: '115000.00',
                        detalle: 'Compra a Distribuidora Central',
                        usuario_nombre: 'Gerencia / Compras',
                    },
                    {
                        id: 'compra-2',
                        fecha: fechaFuera,
                        tipo: 'INGRESO',
                        insumo_nombre: 'Leche',
                        cantidad: '12',
                        unidad: 'l',
                    },
                ],
                cierresCaja: [
                    {
                        id: 4,
                        estado: 'CERRADO',
                        apertura: fechaDia14,
                        cierre: fechaDia14,
                        efectivo_contado: '25000.00',
                        diferencia: '0.00',
                        cantidad_tickets: 8,
                        usuario_nombre: 'encargado_demo',
                    },
                ],
                ventasOffline: [
                    {
                        idTemporal: 'OFF-1',
                        creadoEn: fechaDia13,
                        payload: {
                            medio_pago: 'EFECTIVO',
                            items_entrada: [{ producto_id: 1, cantidad: 2 }],
                        },
                    },
                    {
                        idTemporal: 'OFF-2',
                        creadoEn: fechaFuera,
                        payload: { medio_pago: 'EFECTIVO', items_entrada: [] },
                    },
                ],
                fechaDesde: '2026-11-12',
                fechaHasta: '2026-11-14',
            });

            expect(resultado.conteos).toEqual({
                total: 4,
                ventas: 2,
                stock: 1,
                caja: 1,
            });
            expect(resultado.registros.map((r) => r.id)).toEqual([
                'caja-4',
                'offline-OFF-1',
                'stock-compra-1',
                'venta-10',
            ]);
            expect(resultado.registros[0].tipoEtiqueta).toBe('Cierre de Caja');
            expect(resultado.registros[2].tipoEtiqueta).toBe('Stock · Ingreso');
        });
    });

    describe('Detección explícita de contingencia IA en Importaciones y Consultor IA', () => {
        it('evaluarEstadoImportacionIA muestra "No se pudo usar la IA, revisá la configuración" y bloquea aprobación en contingencia', () => {
            const evalContingencia = evaluarEstadoImportacionIA({
                _id: '507f1f77bcf86cd799439011',
                estado: 'CONTINGENCIA',
                contingencia: true,
                proveedorIa: 'contingencia',
                mensajeContingencia: 'GROQ_API_KEY no configurada',
                advertencias: ['GROQ_API_KEY no está configurada en el entorno.'],
                salida: { items: [{ nombreInsumo: 'Café falso' }] },
            });

            expect(evalContingencia.estadoVisual).toBe('contingencia');
            expect(evalContingencia.esContingencia).toBe(true);
            expect(evalContingencia.mensajePrincipal).toBe('No se pudo usar la IA, revisá la configuración');
            expect(evalContingencia.detalleTecnico).toContain('GROQ_API_KEY');
            expect(evalContingencia.advertencias).toContain('GROQ_API_KEY no está configurada en el entorno.');
            expect(evalContingencia.sugerenciaAlternativa).toContain('CSV');
            expect(evalContingencia.puedeAprobar).toBe(false);

            const evalProveedorContingencia = evaluarEstadoImportacionIA({
                _id: '507f1f77bcf86cd799439012',
                estado: 'LISTA',
                contingencia: false,
                proveedor_ia: 'contingencia',
                salida: { items: [{ nombreInsumo: 'Café heurístico' }] },
            });
            expect(evalProveedorContingencia.esContingencia).toBe(true);
            expect(evalProveedorContingencia.puedeAprobar).toBe(false);
        });

        it('evaluarEstadoImportacionIA diferencia estado PROCESANDO y estado LISTA real', () => {
            const evalProcesando = evaluarEstadoImportacionIA({ estado: 'PROCESANDO' });
            expect(evalProcesando.estadoVisual).toBe('procesando');
            expect(evalProcesando.enProceso).toBe(true);
            expect(evalProcesando.mensajePrincipal).toContain('Analizando con IA');
            expect(evalProcesando.puedeAprobar).toBe(false);

            const evalLista = evaluarEstadoImportacionIA({
                _id: '507f1f77bcf86cd799439013',
                estado: 'LISTA',
                contingencia: false,
                proveedorIa: 'groq',
                salida: {
                    items: [{ nombreInsumo: 'Café Colombia', cantidad: '5', unidad: 'kg', precioTotal: '115000.00' }],
                },
            });
            expect(evalLista.estadoVisual).toBe('lista');
            expect(evalLista.esContingencia).toBe(false);
            expect(evalLista.puedeAprobar).toBe(true);
        });

        it('evaluarEstadoResumenIA y formatearEventoTiempoReal exponen mensaje explícito ante contingencia o error', () => {
            const evalResContingencia = evaluarEstadoResumenIA({
                contingencia: true,
                proveedor_ia: 'contingencia',
                mensaje_contingencia: 'Sin proveedor LLM',
                resumen_ejecutivo: 'Texto demo que no debe mostrarse',
                advertencias: ['GROQ_API_KEY faltante'],
            });
            expect(evalResContingencia.esContingencia).toBe(true);
            expect(evalResContingencia.mensajePrincipal).toBe(MENSAJE_IA_NO_DISPONIBLE);
            expect(evalResContingencia.dictamenIa).toBe('');

            const evalResRed = evaluarEstadoResumenIA(null, new Error('Failed to fetch'));
            expect(evalResRed.esContingencia).toBe(true);
            expect(evalResRed.mensajePrincipal).toBe(MENSAJE_IA_NO_DISPONIBLE);
            expect(evalResRed.detalleTecnico).toBe('Failed to fetch');

            const evalResOk = evaluarEstadoResumenIA({
                contingencia: false,
                proveedor_ia: 'groq',
                resumen_ejecutivo: 'Margen saludable en bebidas calientes.',
                productos_destacados: ['Espresso Doble'],
                sugerencias_rotacion: [],
                alertas_costos: [],
            });
            expect(evalResOk.esContingencia).toBe(false);
            expect(evalResOk.dictamenIa).toBe('Margen saludable en bebidas calientes.');

            const evImpCont = formatearEventoTiempoReal('importacion.lista', {
                estado: 'CONTINGENCIA',
                contingencia: true,
                mensajeContingencia: 'GROQ_API_KEY ausente',
            });
            expect(evImpCont.nivel).toBe('advertencia');
            expect(evImpCont.detalle).toContain('No se pudo usar la IA, revisá la configuración');
        });
    });
});
