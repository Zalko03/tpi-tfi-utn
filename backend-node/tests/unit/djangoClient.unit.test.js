import { jest } from '@jest/globals';
import {
    confirmarImportacionComprasDjango,
    normalizarRespuestaConfirmacionDjango,
} from '../../src/clients/django.client.js';

describe('Unitario: Cliente HTTP Django para confirmación de compras (T3.3)', () => {
    const fetchOriginal = global.fetch;

    afterEach(() => {
        global.fetch = fetchOriginal;
        jest.restoreAllMocks();
    });

    it('normaliza la respuesta de Django de snake_case a camelCase preservando strings decimales', () => {
        const datosDjango = {
            proveedor_id: 7,
            proveedor_nombre: 'Distribuidora Litoral',
            envio_total: '2500.00',
            compras_creadas: [
                {
                    compra_id: 15,
                    insumo_id: 3,
                    insumo_nombre: 'Café Tostado Brasil',
                    unidad_base: 'g',
                    cantidad: '1.0000',
                    unidad: 'kg',
                    precio_total: '28000.00',
                    envio_prorrateado: '2500.00',
                    iva_incluido: true,
                    alicuota: '21.00',
                    costo_unitario_anterior: '20.0000',
                    costo_unitario_calculado: '30.5000',
                },
            ],
            productos_recalculados: [
                {
                    producto_id: 10,
                    insumo_id: 3,
                    nombre: 'Latte Clásico',
                    costo_anterior: '860.0000',
                    costo_nuevo: '1049.0000',
                    margen_nuevo: '0.6722',
                    costo_mano_obra: '120.0000',
                    costo_descartables: '80.0000',
                    desglose_insumos: [
                        {
                            insumo_id: 3,
                            nombre: 'Café Tostado Brasil',
                            cantidad: '18.0000',
                            unidad: 'g',
                            costo_unitario: '30.5000',
                            costo_linea: '549.0000',
                        },
                    ],
                },
            ],
        };

        const normalizado = normalizarRespuestaConfirmacionDjango(datosDjango);
        expect(normalizado.proveedorId).toBe(7);
        expect(normalizado.proveedorNombre).toBe('Distribuidora Litoral');
        expect(normalizado.envioTotal).toBe('2500.00');
        expect(normalizado.comprasCreadas).toHaveLength(1);
        expect(normalizado.comprasCreadas[0]).toMatchObject({
            compraId: 15,
            insumoId: 3,
            costoUnitarioAnterior: '20.0000',
            costoUnitarioCalculado: '30.5000',
        });
        expect(normalizado.productosRecalculados).toHaveLength(1);
        expect(normalizado.productosRecalculados[0]).toMatchObject({
            productoId: 10,
            insumoId: 3,
            costoAnterior: '860.0000',
            costoNuevo: '1049.0000',
            margenNuevo: '0.6722',
            costoManoObra: '120.0000',
            costoDescartables: '80.0000',
        });
        expect(normalizado.productosRecalculados[0].desgloseInsumos[0]).toEqual({
            insumoId: 3,
            nombre: 'Café Tostado Brasil',
            cantidad: '18.0000',
            unidad: 'g',
            costoUnitario: '30.5000',
            costoLinea: '549.0000',
        });
    });

    it('reenvía el JWT en la cabecera Authorization y traduce el payload de salida a snake_case', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 201,
            json: async () => ({
                proveedor_id: 1,
                proveedor_nombre: 'Mayorista Café',
                envio_total: '0.00',
                compras_creadas: [],
                productos_recalculados: [],
            }),
        });

        await confirmarImportacionComprasDjango(
            {
                proveedorNombre: 'Mayorista Café',
                envio: '0.00',
                items: [
                    {
                        nombreInsumo: 'Café Grano',
                        cantidad: '1',
                        unidad: 'kg',
                        precioTotal: '25000.00',
                    },
                ],
            },
            'token-jwt-simulado'
        );

        expect(global.fetch).toHaveBeenCalledTimes(1);
        const [url, opciones] = global.fetch.mock.calls[0];
        expect(url).toContain('/compras/confirmar-importacion/');
        expect(opciones.headers.Authorization).toBe('Bearer token-jwt-simulado');

        const cuerpoEnviado = JSON.parse(opciones.body);
        expect(cuerpoEnviado).toEqual({
            proveedor_nombre: 'Mayorista Café',
            envio: '0.00',
            items: [
                {
                    nombre_insumo: 'Café Grano',
                    cantidad: '1',
                    unidad: 'kg',
                    precio_total: '25000.00',
                    iva_incluido: true,
                    alicuota: '21.00',
                },
            ],
        });
    });

    it('lanza error 502 Bad Gateway si Django no responde o hay fallo de red', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(
            confirmarImportacionComprasDjango({
                proveedorNombre: 'Proveedor X',
                items: [
                    {
                        nombreInsumo: 'Azúcar',
                        cantidad: '10',
                        unidad: 'kg',
                        precioTotal: '12000',
                    },
                ],
            })
        ).rejects.toMatchObject({
            statusCode: 502,
            message: expect.stringContaining('núcleo transaccional Django'),
        });
    });

    it('propaga código HTTP 400 y detalles si Django rechaza por validación de negocio', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 400,
            json: async () => ({
                mensaje: 'No se puede convertir de kg a ml',
                detalles: ['Unidades incompatibles'],
            }),
        });

        await expect(
            confirmarImportacionComprasDjango({
                proveedorNombre: 'Proveedor X',
                items: [
                    {
                        nombreInsumo: 'Leche',
                        cantidad: '1',
                        unidad: 'kg',
                        precioTotal: '1500',
                    },
                ],
            })
        ).rejects.toMatchObject({
            statusCode: 400,
            message: 'No se puede convertir de kg a ml',
            detalles: ['Unidades incompatibles'],
        });
    });
});

