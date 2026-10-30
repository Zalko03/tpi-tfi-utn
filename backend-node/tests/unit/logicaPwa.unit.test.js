import {
    agregarProductoAlCarrito,
    buscarProductoPorCodigoOTexto,
    calcularResumenCarrito,
    convertirMontoACentavos,
    formatearCentavosADecimal,
    formatearEventoTiempoReal,
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
});
