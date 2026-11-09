import {
    agregarProductoAlCarrito,
    buscarProductoPorCodigoOTexto,
    calcularResumenCarrito,
    convertirMontoACentavos,
    encolarVentaOffline,
    extraerItemsDesdeTextoLista,
    formatearCentavosADecimal,
    formatearEventoTiempoReal,
    limpiarColaOffline,
    obtenerContenidoPlantillaCsv,
    obtenerVentasOffline,
    parsearCsvProveedor,
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
    });
});
