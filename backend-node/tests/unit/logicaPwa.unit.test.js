import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { jest } from '@jest/globals';
import {
    accionesCajaVisiblesParaUsuario,
    accionesEmpleadoVisiblesParaUsuario,
    accionesEquipoVisiblesParaUsuario,
    agregarProductoAlCarrito,
    buscarProductoPorCodigoOTexto,
    calcularCostosExtraReceta,
    calcularDimensionesReescaladoImagen,
    calcularFactorConversionReceta,
    calcularResumenCarrito,
    construirDictPermisosDesdeSeleccion,
    construirUrlCartaPublica,
    construirUrlsMapaOpenStreetMap,
    consultarDisponibilidadDemoApi,
    fechaIsoATexto,
    fechaTextoAIso,
    formatearEntradaFecha,
    crearFetchConSesion,
    CLAVE_COLA_VENTAS_RECHAZADAS,
    CLAVE_SONIDOS_SILENCIADOS,
    construirQueryRangoFechas,
    convertirMontoACentavos,
    ejecutarSincronizacionConLock,
    eliminarVentaOffline,
    encolarVentaOffline,
    esArchivoDocAntiguo,
    esArchivoDocx,
    esArchivoExcel,
    esArchivoImagenImportacion,
    esArchivoPdf,
    esCargaVigente,
    escaparHtml,
    estaFechaEnRango,
    evaluarCsvPlantillaDirecta,
    evaluarEstadoImportacionIA,
    evaluarEstadoResumenIA,
    evaluarTextoComoCsvDirecto,
    evaluarTextoExtraidoPdf,
    extraerBase64DeDataUrl,
    extraerCsvDeExcelBuffer,
    extraerItemsDesdeTextoLista,
    extraerMensajeErrorApi,
    extraerTextoDeDocxBuffer,
    extraerTextoDePdfBuffer,
    filtrarRegistrosPorRangoFechas,
    formatearCentavosADecimal,
    formatearEventoTiempoReal,
    formatearFechaLocalInput,
    generarIdOperacion,
    generarMatrizQr,
    generarSvgQrCarta,
    GRUPOS_PERMISOS_EQUIPO,
    guardarPreferenciaSonidosSilenciados,
    LADO_MAXIMO_IMAGEN_IMPORTACION_PX,
    leerPreferenciaSonidosSilenciados,
    limpiarColaOffline,
    MENSAJE_ARCHIVO_DEMASIADO_GRANDE,
    MENSAJE_DOC_ANTIGUO,
    MENSAJE_IA_NO_DISPONIBLE,
    MENSAJE_PDF_ESCANEADO,
    MENSAJE_TIPO_IMAGEN_INVALIDO,
    mensajeErrorParaUsuario,
    obtenerContenidoPlantillaCsv,
    obtenerPermisosInicialesEmpleado,
    obtenerPlantillaRol,
    obtenerSonidoParaEvento,
    obtenerUnidadesCompatiblesReceta,
    obtenerVentasOffline,
    obtenerVentasRechazadasOffline,
    parsearCsvProveedor,
    PERMISOS_CATALOGO_EQUIPO,
    PERMISOS_POR_SECCION,
    prepararCatalogoParaCache,
    procesarColaVentasOffline,
    puedeGestionarQrCarta,
    reconstruirLineasDeItemsPdf,
    renderizarUbicacionCarta,
    resolverPerfilDemoDesdeBoton,
    resolverUbicacionCartaPublica,
    ROLES_PLANTILLAS,
    seccionesVisiblesParaUsuario,
    siguienteIdCarga,
    SONIDOS,
    TAMANO_MAXIMO_ARCHIVO_IMPORTACION_BYTES,
    unificarTrazabilidadRegistros,
    usuarioTienePermiso,
    validarArchivoImagenImportacion,
    validarArchivoImportacionGeneral,
    validarCarritoContraCatalogo,
    validarRangoFechas,
    validarTamanoArchivoImportacion,
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

            const evOtro = formatearEventoTiempoReal('otro.evento', { ok: true });
            expect(evOtro.titulo).toBe('Actividad en el local');
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

        it('validarRangoFechas acepta fechas vacías, exige años entre 2000 y 2100 y rechaza desde > hasta', () => {
            expect(validarRangoFechas('', '')).toEqual({ valido: true, mensaje: '' });
            expect(validarRangoFechas('2026-11-12', '')).toEqual({ valido: true, mensaje: '' });
            expect(validarRangoFechas('', '2026-11-14')).toEqual({ valido: true, mensaje: '' });
            expect(validarRangoFechas(null, undefined)).toEqual({ valido: true, mensaje: '' });
            expect(validarRangoFechas('2000-01-01', '2100-12-31')).toEqual({
                valido: true,
                mensaje: '',
            });

            // Años intermedios al tipear en Chrome (0002, 0202) y fuera del rango 2000-2100
            const resAnio0002 = validarRangoFechas('0002-11-16', '2026-11-16');
            expect(resAnio0002.valido).toBe(false);
            expect(resAnio0002.mensaje).toContain('2000');

            const resAnio1999 = validarRangoFechas('1999-12-31', '2026-11-16');
            expect(resAnio1999.valido).toBe(false);
            expect(resAnio1999.mensaje).toContain('2000');

            const resHasta2101 = validarRangoFechas('2026-11-16', '2101-01-01');
            expect(resHasta2101.valido).toBe(false);
            expect(resHasta2101.mensaje).toContain('2100');

            // Desde posterior a Hasta
            const resInvertido = validarRangoFechas('2026-11-20', '2026-11-10');
            expect(resInvertido.valido).toBe(false);
            expect(resInvertido.mensaje).toContain('posterior');

            // Fecha de calendario inexistente
            expect(validarRangoFechas('2026-02-30', '2026-03-01').valido).toBe(false);
        });

        it('siguienteIdCarga y esCargaVigente descartan respuestas de cargas obsoletas', () => {
            const primera = siguienteIdCarga(0);
            const segunda = siguienteIdCarga(primera);
            const tercera = siguienteIdCarga(segunda);

            expect(primera).toBe(1);
            expect(segunda).toBe(2);
            expect(tercera).toBe(3);
            expect(siguienteIdCarga(undefined)).toBe(1);
            expect(siguienteIdCarga(-5)).toBe(1);

            expect(esCargaVigente(tercera, tercera)).toBe(true);
            expect(esCargaVigente(primera, tercera)).toBe(false);
            expect(esCargaVigente(segunda, tercera)).toBe(false);
            expect(esCargaVigente(0, 0)).toBe(false);
            expect(esCargaVigente(null, 1)).toBe(false);
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
            expect(resultado.registros[2].tipoEtiqueta).toBe('Insumos · Ingreso');
        });

        it('marca las ventas anuladas con badge "Anulada" y detalle de motivo sin ocultar confidencialidad', () => {
            const fechaDia12 = new Date(2026, 10, 12, 11, 0, 0).toISOString();
            const resultado = unificarTrazabilidadRegistros({
                ventas: [
                    {
                        id: 21,
                        fecha: fechaDia12,
                        medio_pago: 'EFECTIVO',
                        estado: 'ANULADA',
                        motivo_anulacion: 'Ticket duplicado',
                        total: '3500.00',
                        usuario_nombre: 'encargado_demo',
                        items: [{ producto_nombre: 'Latte', cantidad: 1 }],
                    },
                    {
                        id: 22,
                        fecha: fechaDia12,
                        medio_pago: null,
                        estado: 'ANULADA',
                        motivo_anulacion: '',
                        total: null,
                        usuario_nombre: 'cajero_demo',
                        items: [{ producto_nombre: 'Espresso', cantidad: 1 }],
                    },
                ],
                fechaDesde: '2026-11-12',
                fechaHasta: '2026-11-12',
            });

            expect(resultado.registros).toHaveLength(2);
            const [r1, r2] = resultado.registros;
            expect(r1.tipoEtiqueta).toBe('Venta · Anulada');
            expect(r1.nivelBadge).toBe('peligro');
            expect(r1.detalle).toContain('Anulada: Ticket duplicado');
            expect(r1.montoCantidad).toContain('(Anulada)');

            expect(r2.tipoEtiqueta).toBe('Venta · Anulada');
            expect(r2.nivelBadge).toBe('peligro');
            expect(r2.montoCantidad).toBe('Confidencial');
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

        it('evaluarTextoComoCsvDirecto y parsearCsvProveedor permiten importación directa CSV sin IA ni GROQ_API_KEY', () => {
            const csvPegado = [
                'insumo;cantidad;unidad;precio_total;alicuota_iva;envio',
                'Café Tostado;2;kg;42000,00;21,00;1500,00',
                'Azúcar;5;kg;7500,00;21,00;0,00',
            ].join('\n');

            const evalCsv = evaluarTextoComoCsvDirecto(csvPegado);
            expect(evalCsv.compatible).toBe(true);
            expect(evalCsv.resultado.origen).toBe('csv-directo');
            expect(evalCsv.resultado.requiereIa).toBe(false);
            expect(evalCsv.resultado.items).toHaveLength(2);
            expect(evalCsv.resultado.envioTotal).toBe('1500.00');

            // Cabeceras reducidas sin columna cantidad/unidad
            const csvMinimo = 'insumo,precio_total\nCacao Amargo,19800';
            const evalMinimo = evaluarTextoComoCsvDirecto(csvMinimo);
            expect(evalMinimo.compatible).toBe(true);
            expect(evalMinimo.resultado.items[0]).toMatchObject({
                nombre_insumo: 'Cacao Amargo',
                cantidad: '1',
                unidad: 'un',
                precio_total: '19800.00',
            });

            // Texto libre no tabular NO debe confundirse con CSV válido
            const textoLibre = 'Hola, te paso los precios:\nCafé 1 kg $25000';
            const evalTexto = evaluarTextoComoCsvDirecto(textoLibre);
            expect(evalTexto.compatible).toBe(false);
            expect(evalTexto.resultado.items).toEqual([]);
        });
    });

    describe('Extracción de texto de archivos .pdf con pdf.js local (Offline-First)', () => {
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

        const crearPdfRealConLineas = (lineas = []) => {
            const ops = ['BT', '/F1 12 Tf'];
            let y = 760;
            for (const linea of lineas) {
                const escapada = String(linea)
                    .replace(/\\/g, '\\\\')
                    .replace(/\(/g, '\\(')
                    .replace(/\)/g, '\\)');
                ops.push(`1 0 0 1 72 ${y} Tm (${escapada}) Tj`);
                y -= 18;
            }
            ops.push('ET');
            const stream = ops.join('\n');
            const objetos = [
                '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
                '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
                '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
                `4 0 obj\n<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream\nendobj\n`,
                '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
            ];
            let pdf = '%PDF-1.4\n';
            const offsets = [0];
            for (const obj of objetos) {
                offsets.push(Buffer.byteLength(pdf, 'latin1'));
                pdf += obj;
            }
            const xrefPos = Buffer.byteLength(pdf, 'latin1');
            pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
            for (let i = 1; i < offsets.length; i++) {
                pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
            }
            pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
            return new Uint8Array(Buffer.from(pdf, 'latin1'));
        };

        it('detecta archivos PDF por extensión o MIME type y reconstruye renglones por coordenada Y', () => {
            expect(esArchivoPdf({ name: 'lista_precios.PDF', type: '' })).toBe(true);
            expect(esArchivoPdf({ name: 'archivo', type: 'application/pdf' })).toBe(true);
            expect(esArchivoPdf({ name: 'lista.csv', type: 'text/csv' })).toBe(false);

            const lineas = reconstruirLineasDeItemsPdf([
                { str: 'Cafe Tostado', transform: [1, 0, 0, 1, 72, 760], width: 65 },
                { str: '5 kg', transform: [1, 0, 0, 1, 200, 760], width: 25 },
                { str: '$115000', transform: [1, 0, 0, 1, 300, 760], width: 45 },
                { str: 'Leche Entera', transform: [1, 0, 0, 1, 72, 740], width: 65 },
                { str: '12 l', transform: [1, 0, 0, 1, 200, 740], width: 20 },
                { str: '$16200', transform: [1, 0, 0, 1, 300, 740], width: 40 },
            ]);
            expect(lineas).toBe('Cafe Tostado 5 kg $115000\nLeche Entera 12 l $16200');
        });

        it('extrae texto real distinto de dos PDFs reales usando pdf.js local y rechaza PDF escaneado sin texto', async () => {
            const pdf1 = crearPdfRealConLineas([
                'Distribuidora Cafe Litoral',
                'Cafe Tostado 5 kg: $115000',
                'Leche Entera 12 l: $16200',
            ]);
            const pdf2 = crearPdfRealConLineas([
                'Molino Central SRL',
                'Azucar Organica 10 kg: $14500',
                'Cacao Amargo 2 kg: $19400',
                'Harina 0000 25 kg: $22000',
            ]);
            const pdfEscaneado = crearPdfRealConLineas([]);

            const res1 = await extraerTextoDePdfBuffer(pdf1.buffer, pdfjsLocal, {
                disableWorker: true,
            });
            const res2 = await extraerTextoDePdfBuffer(pdf2.buffer, pdfjsLocal, {
                disableWorker: true,
            });
            const res3 = await extraerTextoDePdfBuffer(pdfEscaneado.buffer, pdfjsLocal, {
                disableWorker: true,
            });

            expect(res1.ok).toBe(true);
            expect(res1.esEscaneado).toBe(false);
            expect(res1.texto).not.toContain('%PDF-');
            expect(res1.texto).toContain('Cafe Tostado 5 kg: $115000');
            expect(res1.texto).toContain('Leche Entera 12 l: $16200');

            expect(res2.ok).toBe(true);
            expect(res2.esEscaneado).toBe(false);
            expect(res2.texto).not.toContain('%PDF-');
            expect(res2.texto).toContain('Azucar Organica 10 kg: $14500');
            expect(res2.texto).toContain('Cacao Amargo 2 kg: $19400');
            expect(res2.texto).toContain('Harina 0000 25 kg: $22000');
            expect(res1.texto).not.toBe(res2.texto);

            expect(res3.ok).toBe(false);
            expect(res3.esEscaneado).toBe(true);
            expect(res3.texto).toBe('');
            expect(res3.mensajeError).toBe(MENSAJE_PDF_ESCANEADO);

            const evalBinario = evaluarTextoExtraidoPdf('%PDF-1.4\n1 0 obj');
            expect(evalBinario.valido).toBe(false);
        });

        it('fuerza isEvalSupported: false en pdfjs.getDocument (mitigación CVE-2024-4367) aunque opciones intente habilitarlo', async () => {
            const pdfMock = {
                numPages: 1,
                getPage: jest.fn().mockResolvedValue({
                    getTextContent: jest.fn().mockResolvedValue({
                        items: [{ str: 'Cafe Tostado 1 kg $25000', transform: [1, 0, 0, 1, 72, 760], width: 120 }],
                    }),
                }),
                destroy: jest.fn().mockResolvedValue(undefined),
            };
            const pdfjsMock = {
                getDocument: jest.fn().mockReturnValue({
                    promise: Promise.resolve(pdfMock),
                }),
            };

            const resultado = await extraerTextoDePdfBuffer(new Uint8Array([37, 80, 68, 70]), pdfjsMock, {
                disableWorker: true,
                isEvalSupported: true,
            });

            expect(resultado.ok).toBe(true);
            expect(pdfjsMock.getDocument).toHaveBeenCalledTimes(1);
            expect(pdfjsMock.getDocument).toHaveBeenCalledWith(
                expect.objectContaining({
                    disableWorker: true,
                    isEvalSupported: false,
                })
            );
        });
    });

    describe('Importación de Excel (.xlsx/.xls), Word (.docx), rechazo de .doc y límite 5 MB (Offline-First)', () => {
        it('detecta formatos .xlsx/.xls, .docx, rechaza .doc antiguo y valida límite de 5 MB', () => {
            expect(esArchivoExcel({ name: 'lista.XLSX', type: '' })).toBe(true);
            expect(esArchivoExcel({ name: 'lista.xls', type: '' })).toBe(true);
            expect(esArchivoExcel({ name: 'lista.csv', type: 'application/vnd.ms-excel' })).toBe(false);

            expect(esArchivoDocx({ name: 'presupuesto.DOCX', type: '' })).toBe(true);
            expect(esArchivoDocx({ name: 'presupuesto.doc', type: 'application/msword' })).toBe(false);

            expect(esArchivoDocAntiguo({ name: 'lista_vieja.DOC', type: '' })).toBe(true);
            expect(esArchivoDocAntiguo({ name: 'lista_vieja.doc', type: 'application/msword' })).toBe(true);
            expect(esArchivoDocAntiguo({ name: 'lista_nueva.docx', type: '' })).toBe(false);
            expect(MENSAJE_DOC_ANTIGUO).toBe('Guardá el archivo como .docx y volvé a subirlo');

            expect(
                validarTamanoArchivoImportacion({
                    name: 'ok.xlsx',
                    size: TAMANO_MAXIMO_ARCHIVO_IMPORTACION_BYTES,
                })
            ).toEqual({ valido: true, mensajeError: null });

            expect(
                validarTamanoArchivoImportacion({
                    name: 'gigante.xlsx',
                    size: TAMANO_MAXIMO_ARCHIVO_IMPORTACION_BYTES + 1,
                })
            ).toEqual({
                valido: false,
                mensajeError: MENSAJE_ARCHIVO_DEMASIADO_GRANDE,
            });
        });

        it('extraerCsvDeExcelBuffer lee únicamente la primera hoja y convierte a CSV con SheetJS', () => {
            const hoja1 = { '!ref': 'A1:D2' };
            const hoja2 = { '!ref': 'A1:B2' };
            const xlsxMock = {
                read: jest.fn(() => ({
                    SheetNames: ['Lista Mayo', 'Notas Internas'],
                    Sheets: {
                        'Lista Mayo': hoja1,
                        'Notas Internas': hoja2,
                    },
                })),
                utils: {
                    sheet_to_csv: jest.fn((hoja) =>
                        hoja === hoja1
                            ? 'insumo,cantidad,unidad,precio_total\nCafé Tostado,5,kg,115000'
                            : 'otra,hoja\nignorar,999'
                    ),
                },
            };

            const res = extraerCsvDeExcelBuffer(new Uint8Array([80, 75, 3, 4]).buffer, xlsxMock);

            expect(xlsxMock.read).toHaveBeenCalledTimes(1);
            expect(xlsxMock.utils.sheet_to_csv).toHaveBeenCalledTimes(1);
            expect(xlsxMock.utils.sheet_to_csv).toHaveBeenCalledWith(hoja1, {
                blankrows: false,
                rawNumbers: true,
            });
            expect(res).toEqual({
                ok: true,
                csv: 'insumo,cantidad,unidad,precio_total\nCafé Tostado,5,kg,115000',
                nombreHoja: 'Lista Mayo',
                totalHojas: 2,
                lineas: 2,
            });

            const evalDirecta = evaluarCsvPlantillaDirecta(res.csv);
            expect(evalDirecta.compatible).toBe(true);
            expect(evalDirecta.resultado.items).toHaveLength(1);
            expect(evalDirecta.resultado.items[0].nombre_insumo).toBe('Café Tostado');
        });

        it('integración real con SheetJS v0.20.3 vendored preserva valores numéricos con formato de moneda o miles', () => {
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const rutaSheetJs = path.resolve(
                __dirname,
                '../../../web/vendor/sheetjs/xlsx.full.min.js'
            );
            const codigoSheetJs = fs.readFileSync(rutaSheetJs, 'utf8');
            const contexto = { console };
            vm.runInNewContext(codigoSheetJs, contexto);
            const xlsxReal = contexto.XLSX;

            expect(xlsxReal).toBeDefined();
            expect(xlsxReal.version).toBe('0.20.3');

            const wb = xlsxReal.utils.book_new();
            const ws = xlsxReal.utils.aoa_to_sheet([
                ['insumo', 'cantidad', 'unidad', 'precio_total', 'alicuota_iva', 'envio'],
                ['Café Tostado en Grano', 2, 'kg', 18000, 21, 0],
                ['Leche Entera Barista', 10, 'l', 14000.5, 21, 0],
            ]);
            ws.D2.z = '#,##0';
            ws.D3.z = '"$"#,##0.00';
            xlsxReal.utils.book_append_sheet(wb, ws, 'Lista');

            const bufferXlsx = xlsxReal.write(wb, { type: 'array', bookType: 'xlsx' });
            const extraido = extraerCsvDeExcelBuffer(bufferXlsx, xlsxReal);
            const parseado = parsearCsvProveedor(extraido.csv);

            expect(extraido.ok).toBe(true);
            expect(parseado.items).toHaveLength(2);
            expect(parseado.items[0].precio_total).toBe('18000.00');
            expect(parseado.items[1].precio_total).toBe('14000.50');
        });

        it('evaluarCsvPlantillaDirecta rechaza encabezados no coincidentes para derivar a IA y extraerCsvDeExcelBuffer falla en hojas vacías', () => {
            const csvOtraEstructura = [
                'codigo_articulo,descripcion,presentacion,lista_vigente',
                'A-101,Café en grano molido,Bolsa 1kg,24500',
            ].join('\n');
            expect(evaluarCsvPlantillaDirecta(csvOtraEstructura).compatible).toBe(false);

            const xlsxSinHojas = {
                read: jest.fn(() => ({ SheetNames: [], Sheets: {} })),
                utils: { sheet_to_csv: jest.fn() },
            };
            expect(() => extraerCsvDeExcelBuffer(new Uint8Array([1, 2, 3]), xlsxSinHojas)).toThrow(
                'El archivo Excel no contiene hojas para importar.'
            );

            const xlsxHojaVacia = {
                read: jest.fn(() => ({
                    SheetNames: ['Hoja1'],
                    Sheets: { Hoja1: {} },
                })),
                utils: { sheet_to_csv: jest.fn(() => ',,,\n   ') },
            };
            expect(() => extraerCsvDeExcelBuffer(new Uint8Array([1, 2, 3]), xlsxHojaVacia)).toThrow(
                'La primera hoja del archivo Excel está vacía o no contiene datos.'
            );

            expect(() => extraerCsvDeExcelBuffer(new Uint8Array([]), xlsxHojaVacia)).toThrow(
                'El archivo Excel está vacío o no contiene datos.'
            );
        });

        it('extraerTextoDeDocxBuffer extrae texto plano con mammoth.extractRawText y valida documentos vacíos o errores', async () => {
            const mammothMock = {
                extractRawText: jest.fn().mockResolvedValue({
                    value: 'Lista Distribuidora Central\nCafé Colombia 5 kg: $115000\nEnvío: $4500',
                    messages: [],
                }),
            };

            const buffer = new Uint8Array([80, 75, 3, 4, 1, 2]).buffer;
            const res = await extraerTextoDeDocxBuffer(buffer, mammothMock);

            expect(mammothMock.extractRawText).toHaveBeenCalledTimes(1);
            expect(mammothMock.extractRawText).toHaveBeenCalledWith({
                arrayBuffer: expect.any(ArrayBuffer),
            });
            expect(res.ok).toBe(true);
            expect(res.lineas).toBe(3);
            expect(res.texto).toContain('Café Colombia 5 kg: $115000');

            const mammothVacio = {
                extractRawText: jest.fn().mockResolvedValue({ value: '   \n  ', messages: [] }),
            };
            await expect(
                extraerTextoDeDocxBuffer(new Uint8Array([80, 75, 3, 4]), mammothVacio)
            ).rejects.toThrow('El documento Word (.docx) no contiene texto legible para importar.');

            const mammothError = {
                extractRawText: jest.fn().mockRejectedValue(new Error('Archivo DOCX corrupto')),
            };
            await expect(
                extraerTextoDeDocxBuffer(new Uint8Array([80, 75, 3, 4]), mammothError)
            ).rejects.toThrow('Archivo DOCX corrupto');

            await expect(extraerTextoDeDocxBuffer(new ArrayBuffer(0), mammothMock)).rejects.toThrow(
                'El archivo Word (.docx) está vacío o no contiene datos.'
            );
        });
    });

    describe('Gestión de carta y recetas por permisos granulares', () => {
        it('usuarioTienePermiso evalúa permisos de recetas.crear, recetas.editar y recetas.eliminar', () => {
            const encargado = {
                rol: 'ENCARGADO',
                permisos: ['recetas.ver', 'recetas.crear', 'recetas.editar', 'recetas.ver_costos'],
            };
            expect(usuarioTienePermiso(encargado, 'recetas.crear')).toBe(true);
            expect(usuarioTienePermiso(encargado, 'recetas.editar')).toBe(true);
            expect(usuarioTienePermiso(encargado, 'recetas.eliminar')).toBe(false);

            const cajero = { rol: 'CAJERO', permisos: ['ventas.cobrar_ticket'] };
            expect(usuarioTienePermiso(cajero, 'recetas.crear')).toBe(false);
            expect(usuarioTienePermiso(cajero, 'recetas.editar')).toBe(false);
            expect(usuarioTienePermiso(cajero, 'recetas.eliminar')).toBe(false);

            const duenioSuperuser = { rol: 'DUENIO', permisos: [] };
            expect(usuarioTienePermiso(duenioSuperuser, 'recetas.eliminar')).toBe(true);

            expect(usuarioTienePermiso(null, 'recetas.crear')).toBe(false);
        });

        it('obtenerUnidadesCompatiblesReceta y calcularFactorConversionReceta manejan g/kg, ml/l y un/docena', () => {
            expect(obtenerUnidadesCompatiblesReceta('g').map((u) => u.valor)).toEqual([
                'g',
                'kg',
                'mg',
            ]);
            expect(obtenerUnidadesCompatiblesReceta('ml').map((u) => u.valor)).toEqual([
                'ml',
                'l',
                'cc',
            ]);
            expect(obtenerUnidadesCompatiblesReceta('un').map((u) => u.valor)).toEqual([
                'un',
                'docena',
            ]);

            expect(calcularFactorConversionReceta('kg', 'g')).toBe(1000);
            expect(calcularFactorConversionReceta('l', 'ml')).toBe(1000);
            expect(calcularFactorConversionReceta('docena', 'un')).toBe(12);
            expect(calcularFactorConversionReceta('g', 'g')).toBe(1);
        });

        it('extraerMensajeErrorApi prioriza detalles de validación DRF y cae en mensaje/fallback', () => {
            expect(
                extraerMensajeErrorApi({
                    mensaje: 'Error de validación',
                    detalles: { producto: ['No se puede cambiar el producto.'] },
                })
            ).toBe('No se puede cambiar el producto.');
            expect(extraerMensajeErrorApi({ mensaje: 'Permiso denegado', detalles: null })).toBe(
                'Permiso denegado'
            );
            expect(extraerMensajeErrorApi(null, 'Fallo genérico')).toBe('Fallo genérico');
        });
    });

    describe('Caché segura del catálogo POS y validación de carrito contra carta real', () => {
        it('prepararCatalogoParaCache conserva solo campos de venta y elimina costos, márgenes y recetas', () => {
            const entrada = [
                {
                    id: 5,
                    nombre: 'Filtrado Geisha',
                    codigo_barras: '7790001000059',
                    precio_venta: '7500.00',
                    estado_activo: true,
                    minutos_mano_obra: '3.00',
                    costo_hora_mano_obra: '2500.00',
                    descartables: '120.00',
                    costo_total_calculado: '2100.0000',
                    ganancia_bruta: '5400.0000',
                    margen_bruto: '0.7200',
                    receta_items: [{ id: 1, insumo: 2, insumo_costo_unitario: '45.0000' }],
                },
                null,
                { id: 0, nombre: 'Inválido', precio_venta: '100.00' },
            ];

            const limpio = prepararCatalogoParaCache(entrada);

            expect(limpio).toEqual([
                {
                    id: 5,
                    nombre: 'Filtrado Geisha',
                    codigo_barras: '7790001000059',
                    precio_venta: '7500.00',
                    estado_activo: true,
                },
            ]);
            expect(Object.keys(limpio[0]).sort()).toEqual([
                'codigo_barras',
                'estado_activo',
                'id',
                'nombre',
                'precio_venta',
            ]);
            expect(limpio[0].costo_total_calculado).toBeUndefined();
            expect(limpio[0].ganancia_bruta).toBeUndefined();
            expect(limpio[0].margen_bruto).toBeUndefined();
            expect(limpio[0].costo_hora_mano_obra).toBeUndefined();
            expect(limpio[0].descartables).toBeUndefined();
            expect(limpio[0].receta_items).toBeUndefined();
            expect(prepararCatalogoParaCache(null)).toEqual([]);
        });

        it('validarCarritoContraCatalogo rechaza carta vacía, id inexistente o precio distinto y acepta carrito válido', () => {
            const catalogoReal = [
                { id: 5, nombre: 'Filtrado Geisha', precio_venta: '7500.00', estado_activo: true },
                { id: 8, nombre: 'Espresso Doble', precio_venta: '2200.00', estado_activo: true },
            ];

            const carritoValido = agregarProductoAlCarrito([], catalogoReal[0], 2);

            const resCartaVacia = validarCarritoContraCatalogo(carritoValido, []);
            expect(resCartaVacia.valido).toBe(false);
            expect(resCartaVacia.mensaje).toContain('No hay carta disponible');

            const resCarritoVacio = validarCarritoContraCatalogo([], catalogoReal);
            expect(resCarritoVacio.valido).toBe(false);
            expect(resCarritoVacio.mensaje).toContain('vacío');

            const carritoIdInexistente = agregarProductoAlCarrito(
                [],
                { id: 99, nombre: 'Producto Fantasma', precio_venta: '1400.00' },
                1
            );
            const resIdInexistente = validarCarritoContraCatalogo(
                carritoIdInexistente,
                catalogoReal
            );
            expect(resIdInexistente.valido).toBe(false);
            expect(resIdInexistente.mensaje).toContain('no existe en la carta actual');

            const carritoPrecioDistinto = agregarProductoAlCarrito(
                [],
                { id: 5, nombre: 'Filtrado Geisha', precio_venta: '1400.00' },
                1
            );
            const resPrecioDistinto = validarCarritoContraCatalogo(
                carritoPrecioDistinto,
                catalogoReal
            );
            expect(resPrecioDistinto.valido).toBe(false);
            expect(resPrecioDistinto.mensaje).toContain('cambió en la carta actual');

            const carritoMultiple = agregarProductoAlCarrito(carritoValido, catalogoReal[1], 1);
            const resOk = validarCarritoContraCatalogo(carritoMultiple, catalogoReal);
            expect(resOk).toEqual({ valido: true, mensaje: '' });
        });
    });

    describe('Mensajes de error legibles para el usuario (sin códigos HTTP técnicos)', () => {
        it('mensajeErrorParaUsuario mapea 401, 403, 429, 400/422 con mensajeApi y errores de servidor/red', () => {
            expect(mensajeErrorParaUsuario(403)).toBe('No tenés permiso para hacer esto.');
            expect(mensajeErrorParaUsuario(401)).toBe('Tu sesión venció. Volvé a ingresar.');
            expect(mensajeErrorParaUsuario(429)).toBe(
                'Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.'
            );
            expect(mensajeErrorParaUsuario(400, 'El insumo es obligatorio')).toBe(
                'El insumo es obligatorio'
            );
            expect(mensajeErrorParaUsuario(422, 'Cantidad inválida')).toBe('Cantidad inválida');
            expect(mensajeErrorParaUsuario(409, 'El turno ya está cerrado')).toBe('El turno ya está cerrado');
            expect(mensajeErrorParaUsuario(404, 'Recurso no encontrado')).toBe('Recurso no encontrado');
            expect(mensajeErrorParaUsuario(403, 'No tiene permisos para realizar esta acción')).toBe(
                'No tenés permiso para hacer esto.'
            );
            expect(mensajeErrorParaUsuario(400, '')).toBe(
                'No se pudo completar la operación. Probá de nuevo en unos minutos.'
            );
            expect(mensajeErrorParaUsuario(500, 'Internal Server Error')).toBe(
                'No se pudo completar la operación. Probá de nuevo en unos minutos.'
            );
            expect(mensajeErrorParaUsuario(502)).toBe(
                'No se pudo completar la operación. Probá de nuevo en unos minutos.'
            );
            expect(mensajeErrorParaUsuario(0)).toBe(
                'No se pudo completar la operación. Probá de nuevo en unos minutos.'
            );
        });
    });

    describe('Pedidos con renovación de sesión', () => {
        const respuesta = (status) => ({ status, ok: status < 400 });

        const armar = ({ respuestas, renovarSesion }) => {
            let token = 'vencido';
            const tokensUsados = [];
            const fetchFn = jest.fn(async (_url, opciones) => {
                tokensUsados.push(opciones.headers.get('Authorization'));
                return respuestas.shift();
            });
            const alVencerSesion = jest.fn();
            const renovar = jest.fn(async () => {
                const ok = await renovarSesion();
                if (ok) token = 'nuevo';
                return ok;
            });
            const fetchConSesion = crearFetchConSesion({
                fetchFn,
                obtenerToken: () => token,
                renovarSesion: renovar,
                alVencerSesion,
            });
            return { fetchConSesion, fetchFn, tokensUsados, alVencerSesion, renovar };
        };

        it('si no hay 401 no renueva y manda el token vigente', async () => {
            const { fetchConSesion, tokensUsados, renovar } = armar({
                respuestas: [respuesta(200)],
                renovarSesion: async () => true,
            });
            const res = await fetchConSesion('/api/x', {
                headers: { 'Content-Type': 'application/json' },
            });
            expect(res.status).toBe(200);
            expect(tokensUsados).toEqual(['Bearer vencido']);
            expect(renovar).not.toHaveBeenCalled();
        });

        it('ante un 401 renueva y repite el pedido con el token nuevo', async () => {
            const { fetchConSesion, tokensUsados, alVencerSesion } = armar({
                respuestas: [respuesta(401), respuesta(200)],
                renovarSesion: async () => true,
            });
            const res = await fetchConSesion('/api/x', { method: 'POST', body: '{}' });
            expect(res.status).toBe(200);
            expect(tokensUsados).toEqual(['Bearer vencido', 'Bearer nuevo']);
            expect(alVencerSesion).not.toHaveBeenCalled();
        });

        it('si no se puede renovar avisa que venció y devuelve el 401', async () => {
            const { fetchConSesion, fetchFn, alVencerSesion } = armar({
                respuestas: [respuesta(401)],
                renovarSesion: async () => false,
            });
            const res = await fetchConSesion('/api/x');
            expect(res.status).toBe(401);
            expect(fetchFn).toHaveBeenCalledTimes(1);
            expect(alVencerSesion).toHaveBeenCalledTimes(1);
        });

        it('si la renovación falla por red no cierra la sesión', async () => {
            const { fetchConSesion, alVencerSesion } = armar({
                respuestas: [respuesta(401)],
                renovarSesion: async () => {
                    throw new TypeError('Failed to fetch');
                },
            });
            const res = await fetchConSesion('/api/x');
            expect(res.status).toBe(401);
            expect(alVencerSesion).not.toHaveBeenCalled();
        });

        it('varios 401 a la vez comparten una sola renovación', async () => {
            let liberar;
            const espera = new Promise((r) => {
                liberar = r;
            });
            const { fetchConSesion, renovar } = armar({
                respuestas: [respuesta(401), respuesta(401), respuesta(200), respuesta(200)],
                renovarSesion: async () => {
                    await espera;
                    return true;
                },
            });
            const pedidos = Promise.all([fetchConSesion('/api/a'), fetchConSesion('/api/b')]);
            await new Promise((r) => setTimeout(r, 0));
            liberar();
            const [a, b] = await pedidos;
            expect(a.status).toBe(200);
            expect(b.status).toBe(200);
            expect(renovar).toHaveBeenCalledTimes(1);
        });
    });

    describe('Fechas del filtro escritas como dd/mm/aaaa', () => {
        it('agrega las barras mientras se escribe', () => {
            expect(formatearEntradaFecha('1')).toBe('1');
            expect(formatearEntradaFecha('171')).toBe('17/1');
            expect(formatearEntradaFecha('1710')).toBe('17/10');
            expect(formatearEntradaFecha('17102026')).toBe('17/10/2026');
            expect(formatearEntradaFecha('17/10/2026999')).toBe('17/10/2026');
            expect(formatearEntradaFecha('ab17-10')).toBe('17/10');
        });

        it('convierte a aaaa-mm-dd y rechaza fechas incompletas o inexistentes', () => {
            expect(fechaTextoAIso('17/10/2026')).toBe('2026-10-17');
            expect(fechaTextoAIso('  ')).toBe('');
            expect(fechaTextoAIso('17/10')).toBeNull();
            expect(fechaTextoAIso('31/02/2026')).toBeNull();
            expect(fechaTextoAIso('29/02/2028')).toBe('2028-02-29');
        });

        it('convierte aaaa-mm-dd a dd/mm/aaaa para los atajos y el calendario', () => {
            expect(fechaIsoATexto('2026-11-17')).toBe('17/11/2026');
            expect(fechaIsoATexto('')).toBe('');
            expect(fechaIsoATexto('17/11/2026')).toBe('');
        });
    });

    describe('Costos extra del desglose de receta', () => {
        it('calcula mano de obra y descartables igual que el backend', () => {
            const extras = calcularCostosExtraReceta({
                minutos_mano_obra: '2.00',
                costo_hora_mano_obra: '2500.00',
                descartables: '80.00',
            });
            expect(extras.minutos).toBe(2);
            expect(extras.costoHora).toBe(2500);
            expect(extras.manoObra).toBeCloseTo(83.3333, 4);
            expect(extras.descartables).toBe(80);
            // Insumos $812 + mano de obra + descartables = $975,33 (costo total del backend).
            expect(812 + extras.manoObra + extras.descartables).toBeCloseTo(975.33, 2);
        });

        it('sin minutos la mano de obra es cero', () => {
            const extras = calcularCostosExtraReceta({
                minutos_mano_obra: '0',
                costo_hora_mano_obra: '2400.00',
                descartables: '0.00',
            });
            expect(extras.manoObra).toBe(0);
            expect(extras.descartables).toBe(0);
        });

        it('devuelve null si la API ocultó los costos', () => {
            expect(
                calcularCostosExtraReceta({
                    minutos_mano_obra: '2',
                    costo_hora_mano_obra: null,
                    descartables: null,
                })
            ).toBeNull();
            expect(calcularCostosExtraReceta(null)).toBeNull();
        });
    });

    describe('Acciones rápidas de caja según permisos', () => {
        it('el cajero por defecto no ve Movimiento de Caja Chica pero sí Abrir Nuevo Turno', () => {
            const cajero = {
                rol: 'CAJERO',
                permisos: [
                    'ventas.cobrar_ticket',
                    'ventas.ver_historial_propio',
                    'caja.abrir_turno',
                    'caja.cerrar_turno',
                ],
            };
            expect(accionesCajaVisiblesParaUsuario(cajero)).toEqual({
                movimiento: false,
                abrirTurno: true,
            });
        });

        it('sin caja.abrir_turno se oculta Abrir Nuevo Turno', () => {
            const usuario = { rol: 'CAJERO', permisos: ['ventas.cobrar_ticket'] };
            expect(accionesCajaVisiblesParaUsuario(usuario)).toEqual({
                movimiento: false,
                abrirTurno: false,
            });
        });

        it('encargado con registrar_movimiento y dueño superusuario ven ambas acciones', () => {
            const encargado = {
                rol: 'ENCARGADO',
                permisos: ['caja.abrir_turno', 'caja.registrar_movimiento'],
            };
            expect(accionesCajaVisiblesParaUsuario(encargado)).toEqual({
                movimiento: true,
                abrirTurno: true,
            });
            expect(accionesCajaVisiblesParaUsuario({ rol: 'DUENIO', permisos: [] })).toEqual({
                movimiento: true,
                abrirTurno: true,
            });
        });

        it('sin usuario no muestra ninguna acción', () => {
            expect(accionesCajaVisiblesParaUsuario(null)).toEqual({
                movimiento: false,
                abrirTurno: false,
            });
        });

        it('con un turno abierto se oculta Abrir Nuevo Turno aunque tenga el permiso', () => {
            const cajero = { rol: 'CAJERO', permisos: ['caja.abrir_turno'] };
            expect(accionesCajaVisiblesParaUsuario(cajero, { id: 1, estado: 'ABIERTO' })).toEqual({
                movimiento: false,
                abrirTurno: false,
            });
            const duenio = { rol: 'DUENIO', permisos: [] };
            expect(accionesCajaVisiblesParaUsuario(duenio, { id: 1, estado: 'ABIERTO' })).toEqual({
                movimiento: true,
                abrirTurno: false,
            });
        });

        it('con el último turno cerrado vuelve a mostrarse Abrir Nuevo Turno', () => {
            const cajero = { rol: 'CAJERO', permisos: ['caja.abrir_turno'] };
            expect(accionesCajaVisiblesParaUsuario(cajero, { id: 1, estado: 'CERRADO' })).toEqual({
                movimiento: false,
                abrirTurno: true,
            });
        });
    });

    describe('Menú visible según permisos del usuario', () => {
        it('seccionesVisiblesParaUsuario respeta el orden del menú y los permisos por rol', () => {
            expect(Object.keys(PERMISOS_POR_SECCION)).toEqual([
                'pos',
                'caja',
                'compras',
                'recetas',
                'finanzas',
                'personal',
            ]);

            const duenioSuperusuario = { rol: 'DUENIO', permisos: [] };
            expect(seccionesVisiblesParaUsuario(duenioSuperusuario)).toEqual([
                'pos',
                'caja',
                'compras',
                'recetas',
                'finanzas',
                'personal',
            ]);

            const encargadoPorDefecto = {
                rol: 'ENCARGADO',
                permisos: [
                    'ventas.cobrar_ticket',
                    'caja.abrir_turno',
                    'caja.cerrar_turno',
                    'caja.ver_efectivo_esperado',
                    'caja.gestionar_turnos_ajenos',
                    'compras.ver',
                    'compras.registrar',
                    'insumos.ver',
                    'recetas.ver',
                    'reportes.ver_operativos',
                ],
            };
            expect(seccionesVisiblesParaUsuario(encargadoPorDefecto)).toEqual([
                'pos',
                'caja',
                'compras',
                'recetas',
                'finanzas',
            ]);

            const cajeroPorDefecto = {
                rol: 'CAJERO',
                permisos: ['ventas.cobrar_ticket', 'caja.abrir_turno', 'caja.cerrar_turno'],
            };
            expect(seccionesVisiblesParaUsuario(cajeroPorDefecto)).toEqual(['pos', 'caja']);

            const cajeroConCompras = {
                rol: 'CAJERO',
                permisos: ['ventas.cobrar_ticket', 'ia.importar_listas'],
            };
            expect(seccionesVisiblesParaUsuario(cajeroConCompras)).toEqual(['pos', 'compras']);

            expect(seccionesVisiblesParaUsuario(null)).toEqual([]);
            expect(seccionesVisiblesParaUsuario({ rol: 'CAJERO', permisos: [] })).toEqual([]);
        });
    });

    describe('Equipo & Permisos: catálogo, plantillas por rol y visibilidad de acciones', () => {
        it('GRUPOS_PERMISOS_EQUIPO define 9 áreas y las 30 claves del catálogo con etiquetas simples', () => {
            expect(GRUPOS_PERMISOS_EQUIPO).toHaveLength(9);
            expect(PERMISOS_CATALOGO_EQUIPO).toHaveLength(30);
            expect(new Set(PERMISOS_CATALOGO_EQUIPO).size).toBe(30);

            for (const grupo of GRUPOS_PERMISOS_EQUIPO) {
                expect(grupo.titulo.trim().length).toBeGreaterThan(0);
                for (const item of grupo.permisos) {
                    expect(item.clave).toMatch(/^[a-z]+\.[a-z_]+$/);
                    expect(item.etiqueta.trim().length).toBeGreaterThan(0);
                    expect(item.etiqueta).not.toContain('.');
                }
            }
        });

        it('obtenerPlantillaRol devuelve copias exactas de las plantillas para DUENIO, ENCARGADO y CAJERO', () => {
            const duenio = obtenerPlantillaRol('DUENIO');
            expect(Object.keys(duenio)).toHaveLength(30);
            expect(Object.values(duenio).every((v) => v === true)).toBe(true);

            const encargado = obtenerPlantillaRol('encargado');
            expect(encargado['ventas.anular_ticket']).toBe(true);
            expect(encargado['recetas.ver_costos']).toBe(true);
            expect(encargado['insumos.eliminar']).toBe(false);
            expect(encargado['recetas.eliminar']).toBe(false);
            expect(encargado['reportes.ver_financieros']).toBe(false);
            expect(encargado['personal.ver']).toBe(false);

            const cajero = obtenerPlantillaRol('CAJERO');
            expect(cajero['ventas.cobrar_ticket']).toBe(true);
            expect(cajero['ventas.ver_historial_propio']).toBe(true);
            expect(cajero['caja.abrir_turno']).toBe(true);
            expect(cajero['caja.cerrar_turno']).toBe(true);
            expect(cajero['caja.ver_efectivo_esperado']).toBe(false);
            expect(cajero['ventas.anular_ticket']).toBe(false);

            // Mutar la copia devuelta no altera la constante ROLES_PLANTILLAS
            cajero['ventas.anular_ticket'] = true;
            expect(ROLES_PLANTILLAS.CAJERO['ventas.anular_ticket']).toBe(false);
            expect(obtenerPlantillaRol('DESCONOCIDO')).toEqual(ROLES_PLANTILLAS.CAJERO);
        });

        it('construirDictPermisosDesdeSeleccion arma el dict completo true/false para las 30 claves', () => {
            const desdeLista = construirDictPermisosDesdeSeleccion([
                'ventas.cobrar_ticket',
                'caja.abrir_turno',
                'clave.inexistente',
            ]);
            expect(Object.keys(desdeLista)).toHaveLength(30);
            expect(desdeLista['ventas.cobrar_ticket']).toBe(true);
            expect(desdeLista['caja.abrir_turno']).toBe(true);
            expect(desdeLista['ventas.anular_ticket']).toBe(false);
            expect(desdeLista['personal.crear']).toBe(false);
            expect('clave.inexistente' in desdeLista).toBe(false);

            const desdeObjeto = construirDictPermisosDesdeSeleccion({
                'recetas.ver': true,
                'recetas.ver_costos': false,
            });
            expect(Object.keys(desdeObjeto)).toHaveLength(30);
            expect(desdeObjeto['recetas.ver']).toBe(true);
            expect(desdeObjeto['recetas.ver_costos']).toBe(false);
        });

        it('obtenerPermisosInicialesEmpleado usa permisos_activos o cae en plantilla + overrides', () => {
            const desdeActivos = obtenerPermisosInicialesEmpleado({
                rol: 'CAJERO',
                permisos_activos: ['ventas.cobrar_ticket', 'recetas.ver'],
            });
            expect(desdeActivos['ventas.cobrar_ticket']).toBe(true);
            expect(desdeActivos['recetas.ver']).toBe(true);
            expect(desdeActivos['caja.abrir_turno']).toBe(false);

            const desdeSinActivos = obtenerPermisosInicialesEmpleado({
                rol: 'CAJERO',
                permisos: { 'caja.registrar_movimiento': true },
            });
            expect(desdeSinActivos['ventas.cobrar_ticket']).toBe(true);
            expect(desdeSinActivos['caja.registrar_movimiento']).toBe(true);
            expect(desdeSinActivos['personal.crear']).toBe(false);
        });

        it('accionesEquipoVisiblesParaUsuario y accionesEmpleadoVisiblesParaUsuario ocultan acciones sin permiso y bloquean la autobaja', () => {
            const duenio = {
                id: 1,
                username: 'duenio_demo',
                rol: 'DUENIO',
                permisos: Object.keys(ROLES_PLANTILLAS.DUENIO),
            };
            const cajeroActivo = { id: 2, username: 'cajero_1', rol: 'CAJERO', is_active: true };
            const cajeroInactivo = { id: 3, username: 'cajero_2', rol: 'CAJERO', is_active: false };

            expect(accionesEquipoVisiblesParaUsuario(duenio)).toEqual({ agregarEmpleado: true });
            expect(accionesEmpleadoVisiblesParaUsuario(duenio, cajeroActivo)).toEqual({
                permisos: true,
                cambiarRol: true,
                darDeBaja: true,
                reactivar: false,
            });
            expect(accionesEmpleadoVisiblesParaUsuario(duenio, cajeroInactivo)).toEqual({
                permisos: true,
                cambiarRol: true,
                darDeBaja: false,
                reactivar: true,
            });

            // No puede darse de baja ni reactivarse a sí mismo
            expect(
                accionesEmpleadoVisiblesParaUsuario(duenio, {
                    id: 1,
                    username: 'duenio_demo',
                    rol: 'DUENIO',
                    is_active: true,
                })
            ).toEqual({
                permisos: true,
                cambiarRol: true,
                darDeBaja: false,
                reactivar: false,
            });

            const soloLectura = { id: 4, username: 'supervisor', rol: 'ENCARGADO', permisos: ['personal.ver'] };
            expect(accionesEquipoVisiblesParaUsuario(soloLectura)).toEqual({ agregarEmpleado: false });
            expect(accionesEmpleadoVisiblesParaUsuario(soloLectura, cajeroActivo)).toEqual({
                permisos: false,
                cambiarRol: false,
                darDeBaja: false,
                reactivar: false,
            });

            const soloPermisos = {
                id: 5,
                username: 'rrhh',
                rol: 'ENCARGADO',
                permisos: ['personal.ver', 'personal.ajustar_permisos'],
            };
            expect(accionesEmpleadoVisiblesParaUsuario(soloPermisos, cajeroActivo)).toEqual({
                permisos: true,
                cambiarRol: false,
                darDeBaja: false,
                reactivar: false,
            });

            expect(accionesEmpleadoVisiblesParaUsuario(null, cajeroActivo)).toEqual({
                permisos: false,
                cambiarRol: false,
                darDeBaja: false,
                reactivar: false,
            });
        });

        it('extraerMensajeErrorApi rescata mensaje anidado de ErrorSupervivenciaDuenio en detalles', () => {
            const msg = extraerMensajeErrorApi({
                mensaje: 'Datos de entrada inválidos',
                detalles: {
                    detalles: null,
                    mensaje: 'No se puede cambiar el rol del único Dueño activo en el sistema.',
                },
            });
            expect(msg).toBe('No se puede cambiar el rol del único Dueño activo en el sistema.');
        });
    });

    describe('Sonidos sintéticos y preferencia de silencio (Web Audio)', () => {
        it('define secuencias válidas para cobro, escaneo, error, caja y aviso con frecuencias y duraciones positivas', () => {
            expect(Object.keys(SONIDOS).sort()).toEqual(['aviso', 'caja', 'cobro', 'error', 'escaneo']);

            for (const [_nombre, notas] of Object.entries(SONIDOS)) {
                expect(Array.isArray(notas)).toBe(true);
                expect(notas.length).toBeGreaterThanOrEqual(1);
                for (const nota of notas) {
                    expect(Number.isFinite(nota.frecuencia)).toBe(true);
                    expect(nota.frecuencia).toBeGreaterThan(0);
                    expect(Number.isFinite(nota.duracion)).toBe(true);
                    expect(nota.duracion).toBeGreaterThan(0);
                    expect(nota.retardo ?? 0).toBeGreaterThanOrEqual(0);
                    expect(nota.ganancia).toBeGreaterThan(0);
                    expect(nota.ganancia).toBeLessThanOrEqual(0.2);
                }
            }
            expect(SONIDOS.cobro.length).toBeGreaterThanOrEqual(2);
            expect(SONIDOS.cobro[1].frecuencia).toBeGreaterThan(SONIDOS.cobro[0].frecuencia);
        });

        it('lee y guarda la preferencia de silencio tolerando storage ausente o con errores', () => {
            const mapa = new Map();
            const storageOk = {
                getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
                setItem: (k, v) => mapa.set(k, String(v)),
            };

            expect(leerPreferenciaSonidosSilenciados(storageOk)).toBe(false);
            expect(guardarPreferenciaSonidosSilenciados(true, storageOk)).toBe(true);
            expect(mapa.get(CLAVE_SONIDOS_SILENCIADOS)).toBe('true');
            expect(leerPreferenciaSonidosSilenciados(storageOk)).toBe(true);

            expect(guardarPreferenciaSonidosSilenciados(false, storageOk)).toBe(true);
            expect(leerPreferenciaSonidosSilenciados(storageOk)).toBe(false);

            const storageConError = {
                getItem: () => {
                    throw new Error('SecurityError');
                },
                setItem: () => {
                    throw new Error('QuotaExceededError');
                },
            };
            expect(leerPreferenciaSonidosSilenciados(storageConError)).toBe(false);
            expect(guardarPreferenciaSonidosSilenciados(true, storageConError)).toBe(false);
            expect(leerPreferenciaSonidosSilenciados(null)).toBe(false);
            expect(guardarPreferenciaSonidosSilenciados(true, null)).toBe(false);
        });

        it('mapea cada evento del sistema a su sonido correspondiente y silencia toasts informativos', () => {
            expect(obtenerSonidoParaEvento('venta.cobrada')).toBe('cobro');
            expect(obtenerSonidoParaEvento('venta.offline')).toBe('cobro');
            expect(obtenerSonidoParaEvento('importacion.confirmada')).toBe('cobro');
            expect(obtenerSonidoParaEvento('carrito.agregado')).toBe('escaneo');
            expect(obtenerSonidoParaEvento('turno.abierto')).toBe('caja');
            expect(obtenerSonidoParaEvento('turno.cerrado')).toBe('caja');

            expect(obtenerSonidoParaEvento('toast', { tipo: 'peligro' })).toBe('error');
            expect(obtenerSonidoParaEvento('toast', { tipo: 'info' })).toBeNull();
            expect(obtenerSonidoParaEvento('toast', { tipo: 'advertencia' })).toBeNull();
            expect(obtenerSonidoParaEvento('toast', { tipo: 'exito' })).toBeNull();

            expect(
                obtenerSonidoParaEvento('socket', {
                    nombreEvento: 'costo.actualizado',
                    payload: { alertaMargenBajo: true },
                })
            ).toBe('aviso');
            expect(
                obtenerSonidoParaEvento('socket', {
                    nombreEvento: 'costo.actualizado',
                    payload: { alertaMargenBajo: false },
                })
            ).toBeNull();
            expect(obtenerSonidoParaEvento('socket', { nombreEvento: 'stock.bajo' })).toBe('aviso');
            expect(obtenerSonidoParaEvento('socket', { nombreEvento: 'venta.registrada' })).toBeNull();
            expect(obtenerSonidoParaEvento('evento.desconocido')).toBeNull();
        });
    });

    describe('Validación y reescalado de fotos de listas de precios', () => {
        it('valida tipo (JPG, PNG, WEBP) y tamaño máximo (5 MB) de imágenes seleccionadas', () => {
            expect(esArchivoImagenImportacion({ name: 'lista.JPG', type: '' })).toBe(true);
            expect(esArchivoImagenImportacion({ name: 'captura', type: 'image/webp' })).toBe(true);
            expect(esArchivoImagenImportacion({ name: 'lista.pdf', type: 'application/pdf' })).toBe(false);

            expect(
                validarArchivoImagenImportacion({
                    name: 'lista.jpg',
                    type: 'image/jpeg',
                    size: 1024 * 1024,
                })
            ).toEqual({ valido: true, mensajeError: null });

            expect(
                validarArchivoImagenImportacion({
                    name: 'foto.png',
                    type: 'image/png',
                    size: TAMANO_MAXIMO_ARCHIVO_IMPORTACION_BYTES,
                })
            ).toEqual({ valido: true, mensajeError: null });

            expect(
                validarArchivoImagenImportacion({
                    name: 'foto.webp',
                    type: 'image/webp',
                    size: 500000,
                })
            ).toEqual({ valido: true, mensajeError: null });

            expect(
                validarArchivoImagenImportacion({
                    name: 'animado.gif',
                    type: 'image/gif',
                    size: 50000,
                })
            ).toEqual({
                valido: false,
                mensajeError: MENSAJE_TIPO_IMAGEN_INVALIDO,
            });

            expect(
                validarArchivoImagenImportacion({
                    name: 'gigante.jpg',
                    type: 'image/jpeg',
                    size: TAMANO_MAXIMO_ARCHIVO_IMPORTACION_BYTES + 1,
                })
            ).toEqual({
                valido: false,
                mensajeError: MENSAJE_ARCHIVO_DEMASIADO_GRANDE,
            });

            expect(
                validarArchivoImagenImportacion({
                    name: 'vacia.jpg',
                    type: 'image/jpeg',
                    size: 0,
                })
            ).toEqual({
                valido: false,
                mensajeError: 'La foto está vacía. Elegí otra.',
            });

            expect(
                validarArchivoImportacionGeneral({
                    name: 'comprimido.zip',
                    type: 'application/zip',
                    size: 1024,
                }).valido
            ).toBe(false);
        });

        it('calcula dimensiones proporcionales acotando el lado mayor a 1600 px y extrae base64', () => {
            expect(LADO_MAXIMO_IMAGEN_IMPORTACION_PX).toBe(1600);

            expect(calcularDimensionesReescaladoImagen(3200, 1600)).toEqual({
                ancho: 1600,
                alto: 800,
                reescalada: true,
            });
            expect(calcularDimensionesReescaladoImagen(1200, 2400)).toEqual({
                ancho: 800,
                alto: 1600,
                reescalada: true,
            });
            expect(calcularDimensionesReescaladoImagen(800, 600)).toEqual({
                ancho: 800,
                alto: 600,
                reescalada: false,
            });
            expect(calcularDimensionesReescaladoImagen(1600, 1600)).toEqual({
                ancho: 1600,
                alto: 1600,
                reescalada: false,
            });
            expect(() => calcularDimensionesReescaladoImagen(0, 100)).toThrow(
                'Dimensiones de imagen inválidas.'
            );

            expect(extraerBase64DeDataUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe('/9j/4AAQ');
            expect(extraerBase64DeDataUrl('sin-prefijo')).toBe('');
        });
    });

    describe('Carta pública por QR: permisos, URL y codificador ISO/IEC 18004 (T5)', () => {
        it('puedeGestionarQrCarta habilita solo si tiene permiso recetas.editar (dueño y encargado sí, cajero y cocina no)', () => {
            expect(puedeGestionarQrCarta({ rol: 'DUENIO', permisos: [] })).toBe(true);
            expect(
                puedeGestionarQrCarta({
                    rol: 'ENCARGADO',
                    permisos: ['recetas.ver', 'recetas.crear', 'recetas.editar', 'recetas.ver_costos'],
                })
            ).toBe(true);
            expect(
                puedeGestionarQrCarta({
                    rol: 'ENCARGADO',
                    permisos: ['recetas.ver'],
                })
            ).toBe(false);
            expect(
                puedeGestionarQrCarta({
                    rol: 'CAJERO',
                    permisos: ['ventas.cobrar_ticket'],
                })
            ).toBe(false);
            expect(
                puedeGestionarQrCarta({
                    rol: 'COCINA',
                    permisos: ['recetas.ver', 'insumos.ver'],
                })
            ).toBe(false);
            expect(
                puedeGestionarQrCarta({
                    rol: 'COCINA',
                    permisos: ['recetas.editar'],
                })
            ).toBe(true);
            expect(puedeGestionarQrCarta(null)).toBe(false);
        });

        it('construirUrlCartaPublica respeta prefijo /app/ o raíz /', () => {
            expect(construirUrlCartaPublica('http://localhost:3000', '/app/index.html')).toBe(
                'http://localhost:3000/app/carta.html'
            );
            expect(construirUrlCartaPublica('http://localhost:3000', '/app/')).toBe(
                'http://localhost:3000/app/carta.html'
            );
            expect(construirUrlCartaPublica('http://localhost:3000', '/app')).toBe(
                'http://localhost:3000/app/carta.html'
            );
            expect(construirUrlCartaPublica('https://cafesapori.com/', '/')).toBe(
                'https://cafesapori.com/carta.html'
            );
            expect(construirUrlCartaPublica('https://cafesapori.com', '/index.html')).toBe(
                'https://cafesapori.com/carta.html'
            );
        });

        it('generarMatrizQr produce una matriz cuadrada determinista con finder, separadores, timing y dark module ISO', () => {
            expect(() => generarMatrizQr('')).toThrow();

            const urlCorta = 'http://localhost:3000/app/carta.html';
            const m1 = generarMatrizQr(urlCorta);
            const m2 = generarMatrizQr(urlCorta);
            expect(m1).toEqual(m2);

            const n = m1.length;
            expect(n).toBeGreaterThanOrEqual(21);
            expect((n - 17) % 4).toBe(0);
            for (const fila of m1) {
                expect(fila.length).toBe(n);
            }

            // Verificar 3 finder patterns 7x7 + separadores blancos
            const verificarFinder = (r0, c0) => {
                for (let r = 0; r < 7; r++) {
                    for (let c = 0; c < 7; c++) {
                        const borde = r === 0 || r === 6 || c === 0 || c === 6;
                        const centro = r >= 2 && r <= 4 && c >= 2 && c <= 4;
                        expect(m1[r0 + r][c0 + c]).toBe(borde || centro);
                    }
                }
            };
            verificarFinder(0, 0);
            verificarFinder(0, n - 7);
            verificarFinder(n - 7, 0);

            // Separadores blancos
            for (let i = 0; i < 8; i++) {
                expect(m1[7][i]).toBe(false);
                expect(m1[i][7]).toBe(false);
                expect(m1[7][n - 1 - i]).toBe(false);
                expect(m1[i][n - 8]).toBe(false);
                expect(m1[n - 8][i]).toBe(false);
                expect(m1[n - 1 - i][7]).toBe(false);
            }

            // Timing patterns fila 6 y col 6
            for (let i = 8; i < n - 8; i++) {
                expect(m1[6][i]).toBe(i % 2 === 0);
                expect(m1[i][6]).toBe(i % 2 === 0);
            }

            // Dark module fijo ISO en (n - 8, 8)
            expect(m1[n - 8][8]).toBe(true);
        });

        it('decodifica integralmente los bits de formato BCH(15,5), desenmascara y recupera la URL original (v1 a v6+)', () => {
            const urlsPrueba = [
                'http://localhost/carta.html',
                'http://localhost:3000/app/carta.html',
                'https://sapori-cafe-gestion.onrender.com/app/carta.html?sucursal=resistencia&vista=qr&largo=123456789012345678901234567890',
            ];

            const mascaraFn = (m, r, c) => {
                if (m === 0) return (r + c) % 2 === 0;
                if (m === 1) return r % 2 === 0;
                if (m === 2) return c % 3 === 0;
                if (m === 3) return (r + c) % 3 === 0;
                if (m === 4) return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
                if (m === 5) return ((r * c) % 2) + ((r * c) % 3) === 0;
                if (m === 6) return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
                return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
            };

            const alignTabla = {
                1: [],
                2: [6, 18],
                3: [6, 22],
                4: [6, 26],
                5: [6, 30],
                6: [6, 34],
                7: [6, 22, 38],
            };

            const dataCountTabla = {
                M: { 1: 16, 2: 28, 3: 44, 4: 64, 5: 86, 6: 108, 7: 124 },
            };

            for (const url of urlsPrueba) {
                const matriz = generarMatrizQr(url, { nivelEcc: 'M' });
                const n = matriz.length;
                const ver = (n - 17) / 4;

                // Leer ambas copias de format info y verificar coincidencia + BCH(15,5)
                let fmtA = 0;
                let fmtB = 0;
                for (let i = 0; i < 15; i++) {
                    const bA =
                        i < 6
                            ? matriz[i][8]
                            : i < 8
                              ? matriz[i + 1][8]
                              : matriz[n - 15 + i][8];
                    const bB =
                        i < 8
                            ? matriz[8][n - i - 1]
                            : i < 9
                              ? matriz[8][15 - i]
                              : matriz[8][15 - i - 1];
                    if (bA) fmtA |= 1 << i;
                    if (bB) fmtB |= 1 << i;
                }
                expect(fmtA).toBe(fmtB);

                const rawFmt = fmtA ^ 0x5412;
                let rem = rawFmt;
                for (let i = 14; i >= 10; i--) {
                    if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
                }
                expect(rem).toBe(0);

                const eccBits = (rawFmt >> 13) & 3;
                const maskId = (rawFmt >> 10) & 7;
                expect(eccBits).toBe(0); // 'M' = 00

                // Marcar módulos de función para leer los bits de datos en zigzag
                const esFunc = Array.from({ length: n }, () => Array(n).fill(false));
                for (let r = 0; r < 9; r++) {
                    for (let c = 0; c < 9; c++) esFunc[r][c] = true;
                }
                for (let r = 0; r < 9; r++) {
                    for (let c = n - 8; c < n; c++) esFunc[r][c] = true;
                }
                for (let r = n - 8; r < n; r++) {
                    for (let c = 0; c < 9; c++) esFunc[r][c] = true;
                }
                for (let i = 8; i < n - 8; i++) {
                    esFunc[6][i] = true;
                    esFunc[i][6] = true;
                }
                for (const cr of alignTabla[ver]) {
                    for (const cc of alignTabla[ver]) {
                        if ((cr <= 8 && cc <= 8) || (cr <= 8 && cc >= n - 9) || (cr >= n - 9 && cc <= 8)) continue;
                        for (let dr = -2; dr <= 2; dr++) {
                            for (let dc = -2; dc <= 2; dc++) esFunc[cr + dr][cc + dc] = true;
                        }
                    }
                }
                if (ver >= 7) {
                    for (let r = 0; r < 6; r++) {
                        for (let c = n - 11; c < n - 8; c++) {
                            esFunc[r][c] = true;
                            esFunc[c][r] = true;
                        }
                    }
                }

                const bitsLeidos = [];
                let subir = true;
                for (let col = n - 1; col > 0; col -= 2) {
                    if (col === 6) col--;
                    for (let step = 0; step < n; step++) {
                        const fila = subir ? n - 1 - step : step;
                        for (let dc = 0; dc < 2; dc++) {
                            const c = col - dc;
                            if (!esFunc[fila][c]) {
                                const crudo = matriz[fila][c];
                                const desenmascarado = mascaraFn(maskId, fila, c) ? !crudo : crudo;
                                bitsLeidos.push(desenmascarado ? 1 : 0);
                            }
                        }
                    }
                    subir = !subir;
                }

                // Deshacer intercalado para recuperar los bytes de datos (v3: 1 bloque, v4-v7: 2 o 4 bloques)
                const totalData = dataCountTabla.M[ver];
                const numBloques = ver <= 3 ? 1 : ver <= 5 ? 2 : 4;
                const dataPorBloque = totalData / numBloques;
                const codewords = [];
                for (let i = 0; i + 7 < bitsLeidos.length; i += 8) {
                    let b = 0;
                    for (let j = 0; j < 8; j++) b = (b << 1) | bitsLeidos[i + j];
                    codewords.push(b);
                }

                const bloquesDatos = Array.from({ length: numBloques }, () => []);
                for (let i = 0; i < totalData; i++) {
                    bloquesDatos[i % numBloques].push(codewords[i]);
                }
                const dataUnida = bloquesDatos.flat();
                expect(dataUnida.length).toBe(dataPorBloque * numBloques);

                const dataBits = [];
                for (const b of dataUnida) {
                    for (let i = 7; i >= 0; i--) dataBits.push((b >> i) & 1);
                }
                const leerInt = (inicio, len) => {
                    let v = 0;
                    for (let i = 0; i < len; i++) v = (v << 1) | dataBits[inicio + i];
                    return v;
                };

                expect(leerInt(0, 4)).toBe(0b0100); // Modo Byte
                const longitud = leerInt(4, 8);
                const bytesDecodificados = [];
                for (let i = 0; i < longitud; i++) {
                    bytesDecodificados.push(leerInt(12 + i * 8, 8));
                }
                const textoRecuperado = new TextDecoder().decode(new Uint8Array(bytesDecodificados));
                expect(textoRecuperado).toBe(url);
            }
        });

        it('generarSvgQrCarta devuelve SVG válido con quiet zone de 4 módulos y escape de atributos', () => {
            const url = 'http://localhost:3000/app/carta.html';
            const matriz = generarMatrizQr(url);
            const svg = generarSvgQrCarta(url, { tamanoPx: 240 });

            const esperadoViewBox = `viewBox="0 0 ${matriz.length + 8} ${matriz.length + 8}"`;
            expect(svg).toContain('<svg ');
            expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
            expect(svg).toContain(esperadoViewBox);
            expect(svg).toContain('width="240" height="240"');
            expect(svg).toContain('shape-rendering="crispEdges"');
            expect(svg).toContain('<rect width="100%" height="100%"');
            expect(svg).toContain('<path d="M');
            expect(svg).toContain('</svg>');
        });
    });

    describe('Mapa de ubicación OpenStreetMap en carta pública (T8)', () => {
        it('construirUrlsMapaOpenStreetMap arma URL embebida con bbox/marker y enlace externo válido', () => {
            const resultado = construirUrlsMapaOpenStreetMap(
                {
                    direccion: '  Av. San Martín 1420, Resistencia, Chaco  ',
                    latitud: -27.4514,
                    longitud: -58.9867,
                },
                { delta: 0.005, zoom: 17 }
            );

            expect(resultado).not.toBeNull();
            expect(resultado.direccion).toBe('Av. San Martín 1420, Resistencia, Chaco');
            expect(resultado.latitud).toBe(-27.4514);
            expect(resultado.longitud).toBe(-58.9867);

            const embedUrl = new URL(resultado.urlEmbed);
            expect(embedUrl.origin).toBe('https://www.openstreetmap.org');
            expect(embedUrl.pathname).toBe('/export/embed.html');
            expect(embedUrl.searchParams.get('layer')).toBe('mapnik');
            expect(embedUrl.searchParams.get('bbox')).toBe(
                '-58.991700,-27.456400,-58.981700,-27.446400'
            );
            expect(embedUrl.searchParams.get('marker')).toBe('-27.451400,-58.986700');

            expect(resultado.urlMapa).toBe(
                'https://www.openstreetmap.org/?mlat=-27.451400&mlon=-58.986700#map=17/-27.451400/-58.986700'
            );
        });

        it('construirUrlsMapaOpenStreetMap y resolverUbicacionCartaPublica devuelven null sin coordenadas válidas', () => {
            expect(construirUrlsMapaOpenStreetMap(null)).toBeNull();
            expect(construirUrlsMapaOpenStreetMap({})).toBeNull();
            expect(
                construirUrlsMapaOpenStreetMap({
                    direccion: 'Av. San Martín 1420',
                    latitud: null,
                    longitud: -58.9867,
                })
            ).toBeNull();
            expect(
                construirUrlsMapaOpenStreetMap({
                    latitud: '',
                    longitud: '',
                })
            ).toBeNull();
            expect(
                construirUrlsMapaOpenStreetMap({
                    latitud: -91,
                    longitud: -58.9867,
                })
            ).toBeNull();
            expect(
                construirUrlsMapaOpenStreetMap({
                    latitud: -27.4514,
                    longitud: 181,
                })
            ).toBeNull();

            expect(resolverUbicacionCartaPublica(null)).toBeNull();
            expect(resolverUbicacionCartaPublica({})).toBeNull();
            expect(
                resolverUbicacionCartaPublica({
                    ubicacionLocal: { direccion: 'Solo dirección sin coords' },
                })
            ).toBeNull();
        });

        it('renderizarUbicacionCarta mantiene oculta la sección sin coordenadas y no asigna src al iframe', () => {
            const atributosRemovidosIframe = [];
            const atributosRemovidosEnlace = [];
            const elementos = {
                seccion: { hidden: false },
                direccionEl: { textContent: 'Vieja dirección', hidden: false },
                iframe: {
                    src: 'https://www.openstreetmap.org/previo',
                    removeAttribute: (nombre) => {
                        atributosRemovidosIframe.push(nombre);
                        delete elementos.iframe.src;
                    },
                },
                enlace: {
                    href: 'https://www.openstreetmap.org/previo',
                    removeAttribute: (nombre) => {
                        atributosRemovidosEnlace.push(nombre);
                        delete elementos.enlace.href;
                    },
                },
            };

            const mostrado = renderizarUbicacionCarta(elementos, {
                ubicacionLocal: { direccion: 'Sin mapa', latitud: null, longitud: null },
            });

            expect(mostrado).toBe(false);
            expect(elementos.seccion.hidden).toBe(true);
            expect(elementos.direccionEl.textContent).toBe('');
            expect(elementos.direccionEl.hidden).toBe(true);
            expect(atributosRemovidosIframe).toEqual(['src']);
            expect(atributosRemovidosEnlace).toEqual(['href']);
            expect(elementos.iframe.src).toBeUndefined();
        });

        it('renderizarUbicacionCarta muestra la sección cuando hay configuración en web/js/config.js', () => {
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const rutaConfig = path.resolve(__dirname, '../../../web/js/config.js');
            const codigoConfig = fs.readFileSync(rutaConfig, 'utf8');

            const contexto = { window: {} };
            vm.runInNewContext(codigoConfig, contexto);

            const elementos = {
                seccion: { hidden: true },
                direccionEl: { textContent: '', hidden: true },
                iframe: { src: '' },
                enlace: { href: '' },
            };

            const mostrado = renderizarUbicacionCarta(elementos, contexto.window.__SAPORI_CONFIG__);

            expect(mostrado).toBe(true);
            expect(elementos.seccion.hidden).toBe(false);
            expect(elementos.direccionEl.hidden).toBe(false);
            expect(elementos.direccionEl.textContent).toContain('Plaza 25 de Mayo');
            expect(elementos.direccionEl.textContent).toContain('Resistencia, Chaco');
            expect(elementos.iframe.src).toMatch(
                /^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?bbox=.*&layer=mapnik&marker=/
            );
            expect(elementos.enlace.href).toMatch(/^https:\/\/www\.openstreetmap\.org\/\?mlat=/);
        });

        it('construirUrlsMapaOpenStreetMap soporta opciones null, strings numéricos, límites exactos y alias lat/lon/lng', () => {
            const conOpcionesNull = construirUrlsMapaOpenStreetMap(
                { lat: '-27.4514', lon: '-58.9867', direccion: 'Plaza 25 de Mayo' },
                null
            );
            expect(conOpcionesNull).not.toBeNull();
            expect(conOpcionesNull.latitud).toBe(-27.4514);
            expect(conOpcionesNull.longitud).toBe(-58.9867);

            const enBordes = construirUrlsMapaOpenStreetMap({
                lat: -90,
                lng: 180,
                direccion: '',
            });
            expect(enBordes).not.toBeNull();
            expect(enBordes.direccion).toBe('');
            expect(enBordes.urlEmbed).toContain('marker=-90.000000,180.000000');

            const enOrigen = construirUrlsMapaOpenStreetMap({ latitud: 0, longitud: 0 });
            expect(enOrigen).not.toBeNull();
            expect(enOrigen.latitud).toBe(0);
            expect(enOrigen.longitud).toBe(0);

            expect(
                construirUrlsMapaOpenStreetMap({ latitud: true, longitud: -58.98 })
            ).toBeNull();
            expect(
                construirUrlsMapaOpenStreetMap({ latitud: false, longitud: -58.98 })
            ).toBeNull();
            expect(
                construirUrlsMapaOpenStreetMap({ latitud: {}, longitud: [] })
            ).toBeNull();
            expect(
                construirUrlsMapaOpenStreetMap({ latitud: Number.NaN, longitud: -58.98 })
            ).toBeNull();
            expect(
                construirUrlsMapaOpenStreetMap({ latitud: Number.POSITIVE_INFINITY, longitud: -58.98 })
            ).toBeNull();

            const elementos = {
                seccion: { hidden: true },
                direccionEl: { textContent: 'Anterior', hidden: false },
                iframe: { src: '' },
                enlace: { href: '' },
            };
            const mostrado = renderizarUbicacionCarta(elementos, {
                ubicacion: { lat: -27.45, lng: -58.98, direccion: '   ' },
            });
            expect(mostrado).toBe(true);
            expect(elementos.seccion.hidden).toBe(false);
            expect(elementos.direccionEl.textContent).toBe('');
            expect(elementos.direccionEl.hidden).toBe(true);
        });

        it('debeIgnorarPeticionSw en web/sw.js ignora otros orígenes, destino iframe, URLs vacías/inválidas y subdominios OSM', () => {
            const requireCjs = createRequire(import.meta.url);
            const { debeIgnorarPeticionSw, NOMBRE_CACHE } = requireCjs('../../../web/sw.js');

            expect(NOMBRE_CACHE).toBe('cafe-gestion-pwa-v4');
            expect(debeIgnorarPeticionSw('', 'document', 'https://sapori.local')).toBe(true);
            expect(debeIgnorarPeticionSw(null, 'document', 'https://sapori.local')).toBe(true);
            expect(debeIgnorarPeticionSw('http://[', 'document', 'https://sapori.local')).toBe(true);
            expect(
                debeIgnorarPeticionSw(
                    'https://tile.openstreetmap.org/17/44056/76251.png',
                    'image',
                    'https://sapori.local'
                )
            ).toBe(true);
            expect(
                debeIgnorarPeticionSw(
                    'https://sapori.local/app/carta.html',
                    'document',
                    'https://sapori.local'
                )
            ).toBe(false);
            expect(
                debeIgnorarPeticionSw(
                    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans',
                    'style',
                    'https://sapori.local'
                )
            ).toBe(true);
            expect(
                debeIgnorarPeticionSw(
                    'https://sapori.local/mapa-interno.html',
                    'iframe',
                    'https://sapori.local'
                )
            ).toBe(true);
            expect(
                debeIgnorarPeticionSw(
                    new URL('https://www.openstreetmap.org/export/embed.html?bbox=1,2,3,4'),
                    '',
                    'https://www.openstreetmap.org'
                )
            ).toBe(true);
            expect(
                debeIgnorarPeticionSw(
                    'https://openstreetmap.org/',
                    'document',
                    'https://openstreetmap.org'
                )
            ).toBe(true);
            expect(
                debeIgnorarPeticionSw(
                    'https://fakeopenstreetmap.org/app.js',
                    'script',
                    'https://fakeopenstreetmap.org'
                )
            ).toBe(false);
        });
    });

    describe('Acceso rápido de demostración (resolverPerfilDemoDesdeBoton y consultarDisponibilidadDemoApi)', () => {
        it('mapea los tres botones y usuarios demo a su perfil exacto y rechaza otros valores', () => {
            expect(resolverPerfilDemoDesdeBoton({ id: 'btn-demo-duenio' })).toBe('duenio');
            expect(resolverPerfilDemoDesdeBoton({ id: 'btn-demo-encargado' })).toBe('encargado');
            expect(resolverPerfilDemoDesdeBoton({ id: 'btn-demo-cajero' })).toBe('cajero');

            expect(resolverPerfilDemoDesdeBoton({ usuario: 'duenio_demo' })).toBe('duenio');
            expect(resolverPerfilDemoDesdeBoton({ usuario: 'encargado_demo' })).toBe('encargado');
            expect(resolverPerfilDemoDesdeBoton({ usuario: 'cajero_demo' })).toBe('cajero');

            expect(resolverPerfilDemoDesdeBoton({ perfil: 'DUENIO' })).toBe('duenio');
            expect(resolverPerfilDemoDesdeBoton({ perfil: 'admin' })).toBeNull();
            expect(resolverPerfilDemoDesdeBoton({ usuario: 'admin' })).toBeNull();
            expect(resolverPerfilDemoDesdeBoton({ id: 'btn-otro' })).toBeNull();
            expect(resolverPerfilDemoDesdeBoton()).toBeNull();
        });

        it('consulta GET /api/auth/demo/ y devuelve true solo si disponible === true', async () => {
            const fetchOkTrue = jest.fn(async () => ({
                ok: true,
                json: async () => ({ disponible: true }),
            }));
            expect(
                await consultarDisponibilidadDemoApi({
                    fetchFn: fetchOkTrue,
                    djangoUrl: 'http://localhost:8000/',
                })
            ).toBe(true);
            expect(fetchOkTrue).toHaveBeenCalledWith('http://localhost:8000/api/auth/demo/', {
                method: 'GET',
                headers: { Accept: 'application/json' },
            });

            const fetchOkFalse = jest.fn(async () => ({
                ok: true,
                json: async () => ({ disponible: false }),
            }));
            expect(
                await consultarDisponibilidadDemoApi({
                    fetchFn: fetchOkFalse,
                    djangoUrl: 'http://localhost:8000',
                })
            ).toBe(false);

            const fetchErrorHttp = jest.fn(async () => ({
                ok: false,
                status: 500,
                json: async () => ({}),
            }));
            expect(
                await consultarDisponibilidadDemoApi({
                    fetchFn: fetchErrorHttp,
                    djangoUrl: 'http://localhost:8000',
                })
            ).toBe(false);

            const fetchRed = jest.fn(async () => {
                throw new Error('Falla de red');
            });
            expect(
                await consultarDisponibilidadDemoApi({
                    fetchFn: fetchRed,
                    djangoUrl: 'http://localhost:8000',
                })
            ).toBe(false);
        });
    });
});
