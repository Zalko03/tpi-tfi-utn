import {
    armarTicketDesdeRegistroHistorial,
    calcularIvaIncluidoCentavos,
    encolarVentaOffline,
    unificarTrazabilidadRegistros,
} from '../../../web/js/logicaPwa.js';

// Storage en memoria para no depender de localStorage del navegador.
const crearStorage = () => {
    const datos = {};
    return {
        getItem: (k) => (k in datos ? datos[k] : null),
        setItem: (k, v) => {
            datos[k] = String(v);
        },
        removeItem: (k) => {
            delete datos[k];
        },
    };
};

const ventaServidor = (extra = {}) => ({
    id: 12,
    fecha: '2026-11-20T15:42:00Z',
    medio_pago: 'TARJETA',
    total: '5400.00',
    usuario_nombre: 'cajero_demo',
    turno_caja: 3,
    estado: 'EMITIDA',
    turno_estado: 'ABIERTO',
    origen: 'propio',
    items: [
        { producto: 1, producto_nombre: 'Espresso', cantidad: '2.000', precio_unitario: '1500.00' },
        { producto: 2, producto_nombre: 'Medialuna', cantidad: '3.000', precio_unitario: '800.00' },
    ],
    ...extra,
});

const registroDeVenta = (venta) =>
    unificarTrazabilidadRegistros({ ventas: [venta] }).registros.find((r) => r.categoria === 'venta');

describe('Ticket desde el historial de Reportes', () => {
    it('calcula el IVA incluido (21%) en centavos, igual que el ticket al cobrar', () => {
        expect(calcularIvaIncluidoCentavos(540000)).toBe(93719);
        expect(calcularIvaIncluidoCentavos(0)).toBe(0);
    });

    it('arma el ticket de una venta del servidor con su fecha original', () => {
        const ticket = armarTicketDesdeRegistroHistorial(registroDeVenta(ventaServidor()));
        expect(ticket).toEqual({
            numero: '#0012',
            fechaIso: '2026-11-20T15:42:00Z',
            cajero: 'cajero_demo',
            turno: '#3',
            items: [
                { descripcion: '2x Espresso', subtotalDecimal: '3000.00' },
                { descripcion: '3x Medialuna', subtotalDecimal: '2400.00' },
            ],
            totalDecimal: '5400.00',
            ivaDecimal: '937.19',
            medioPago: 'TARJETA',
            offline: false,
            anulada: false,
            motivoAnulacion: '',
        });
    });

    it('marca la venta anulada con su motivo', () => {
        const ticket = armarTicketDesdeRegistroHistorial(
            registroDeVenta(ventaServidor({ estado: 'ANULADA', motivo_anulacion: '  Cobro duplicado ' }))
        );
        expect(ticket.anulada).toBe(true);
        expect(ticket.motivoAnulacion).toBe('Cobro duplicado');
        expect(ticket.totalDecimal).toBe('5400.00');
    });

    it('deja los montos en null si el backend los ocultó (sin permiso para ver montos)', () => {
        const ticket = armarTicketDesdeRegistroHistorial(
            registroDeVenta(
                ventaServidor({
                    total: null,
                    medio_pago: null,
                    items: [{ producto: 1, producto_nombre: 'Espresso', cantidad: '1.000', precio_unitario: null }],
                })
            )
        );
        expect(ticket.totalDecimal).toBeNull();
        expect(ticket.ivaDecimal).toBeNull();
        expect(ticket.medioPago).toBeNull();
        expect(ticket.items).toEqual([{ descripcion: '1x Espresso', subtotalDecimal: null }]);
    });

    it('usa la foto guardada al encolar una venta sin conexión', () => {
        const storage = crearStorage();
        const payload = {
            turno_caja: 5,
            medio_pago: 'EFECTIVO',
            items_entrada: [{ producto_id: 1, producto: 1, cantidad: '2' }],
        };
        const { ventaEncolada } = encolarVentaOffline(payload, storage, {
            cajero: 'cajero_demo',
            items: [{ nombre: 'Espresso', cantidad: 2, subtotalDecimal: '3000.00' }],
        });
        // La foto no viaja al backend: queda fuera del payload.
        expect(ventaEncolada.payload.ticket).toBeUndefined();

        const registro = unificarTrazabilidadRegistros({ ventasOffline: [ventaEncolada] }).registros[0];
        const ticket = armarTicketDesdeRegistroHistorial(registro);
        expect(ticket).toMatchObject({
            numero: ventaEncolada.idTemporal,
            fechaIso: ventaEncolada.creadoEn,
            cajero: 'cajero_demo',
            turno: '#5',
            items: [{ descripcion: '2x Espresso', subtotalDecimal: '3000.00' }],
            totalDecimal: '3000.00',
            ivaDecimal: '520.66',
            medioPago: 'EFECTIVO',
            offline: true,
            anulada: false,
        });
    });

    it('sin foto (venta encolada antes del cambio), busca nombre y precio en el catálogo', () => {
        const ventaVieja = {
            idTemporal: 'OFF-1-1',
            creadoEn: '2026-11-21T10:00:00Z',
            payload: {
                medio_pago: 'QR',
                items_entrada: [
                    { producto_id: 2, cantidad: '2' },
                    { producto_id: 9, cantidad: '1', precio_unitario: '100.00' },
                ],
            },
        };
        const catalogo = [{ id: 2, nombre: 'Medialuna', precio_venta: '800.00' }];
        const registro = unificarTrazabilidadRegistros({ ventasOffline: [ventaVieja] }).registros[0];
        const ticket = armarTicketDesdeRegistroHistorial(registro, catalogo);
        expect(ticket.items).toEqual([
            { descripcion: '2x Medialuna', subtotalDecimal: '1600.00' },
            { descripcion: '1x Prod #9', subtotalDecimal: '100.00' },
        ]);
        expect(ticket.totalDecimal).toBe('1700.00');
        expect(ticket.cajero).toBe('-');
        expect(ticket.turno).toBe('-');
        expect(ticket.medioPago).toBe('QR');
    });

    it('devuelve null para filas que no son ventas', () => {
        expect(armarTicketDesdeRegistroHistorial(null)).toBeNull();
        expect(armarTicketDesdeRegistroHistorial({ categoria: 'stock' })).toBeNull();
    });
});
