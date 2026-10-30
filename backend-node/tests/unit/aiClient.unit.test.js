import { jest } from '@jest/globals';
import {
    extraerPreciosIA,
    validarItemExtraido,
    validarYNormalizarSalidaIA,
} from '../../src/clients/ai.client.js';

describe('Unit Tests - Cliente HTTP hacia ai-service (ai.client.js)', () => {
    const fetchOriginal = global.fetch;

    afterEach(() => {
        global.fetch = fetchOriginal;
        jest.restoreAllMocks();
    });

    describe('validarItemExtraido', () => {
        it('acepta un ítem con nombre, unidad permitida y montos positivos', () => {
            expect(
                validarItemExtraido({
                    nombre_insumo: 'Café en grano',
                    cantidad: '1',
                    unidad: 'kg',
                    precio_total: '18500.00',
                })
            ).toBe(true);
        });

        it('rechaza ítems con cantidad o precio no positivos o unidad inválida', () => {
            expect(
                validarItemExtraido({
                    nombre_insumo: 'Café',
                    cantidad: '0',
                    unidad: 'kg',
                    precio_total: '18500',
                })
            ).toBe(false);

            expect(
                validarItemExtraido({
                    nombre_insumo: 'Café',
                    cantidad: '1',
                    unidad: 'bolsa',
                    precio_total: '18500',
                })
            ).toBe(false);

            expect(
                validarItemExtraido({
                    nombre_insumo: 'Café',
                    cantidad: '1',
                    unidad: 'kg',
                    precio_total: '-500',
                })
            ).toBe(false);
        });
    });

    describe('validarYNormalizarSalidaIA', () => {
        it('traduce snake_case a camelCase conservando precisión decimal en strings', () => {
            const salidaCruda = {
                proveedor_detectado: 'Mayorista Litoral',
                envio_detectado: '3500.00',
                moneda: 'ARS',
                items: [
                    {
                        nombre_insumo: 'Leche entera',
                        cantidad: '12',
                        unidad: 'l',
                        precio_total: '14400.50',
                        iva_incluido: true,
                        alicuota: '21.00',
                        confianza: '0.96',
                        texto_original: 'Leche entera x12L $14400.50',
                    },
                ],
                advertencias: [],
                version_prompt: 'v1',
                proveedor_ia: 'gemini',
                latencia_ms: 615,
                contingencia: false,
                mensaje_contingencia: null,
            };

            const normalizado = validarYNormalizarSalidaIA(salidaCruda);
            expect(normalizado.proveedorDetectado).toBe('Mayorista Litoral');
            expect(normalizado.envioDetectado).toBe('3500.00');
            expect(normalizado.versionPrompt).toBe('v1');
            expect(normalizado.proveedorIa).toBe('gemini');
            expect(normalizado.latenciaMs).toBe(615);
            expect(normalizado.items).toHaveLength(1);
            expect(normalizado.items[0]).toEqual({
                nombreInsumo: 'Leche entera',
                cantidad: '12',
                unidad: 'l',
                precioTotal: '14400.50',
                ivaIncluido: true,
                alicuota: '21.00',
                confianza: '0.96',
                textoOriginal: 'Leche entera x12L $14400.50',
            });
        });

        it('lanza error si falta el array items o algún ítem es inválido', () => {
            expect(() => validarYNormalizarSalidaIA({})).toThrow(
                'La respuesta de ai-service no contiene una estructura válida de items'
            );

            expect(() =>
                validarYNormalizarSalidaIA({
                    items: [{ nombre_insumo: '', cantidad: '0', unidad: 'kg', precio_total: '100' }],
                })
            ).toThrow('El ítem en posición 0 no cumple el esquema de validación');
        });
    });

    describe('extraerPreciosIA', () => {
        it('retorna la salida normalizada cuando ai-service responde 200 OK', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    proveedor_detectado: 'Distribuidora Sur',
                    envio_detectado: '0.00',
                    moneda: 'ARS',
                    items: [
                        {
                            nombre_insumo: 'Azúcar común',
                            cantidad: '10',
                            unidad: 'kg',
                            precio_total: '9800.00',
                        },
                    ],
                    advertencias: [],
                    version_prompt: 'v1',
                    proveedor_ia: 'gemini',
                    latencia_ms: 420,
                    contingencia: false,
                }),
            });

            const resultado = await extraerPreciosIA({
                textoLista: 'Azúcar 10 kg $9800',
                proveedorNombre: 'Distribuidora Sur',
                versionPrompt: 'v1',
            });

            expect(resultado.contingencia).toBe(false);
            expect(resultado.items).toHaveLength(1);
            expect(resultado.items[0].nombreInsumo).toBe('Azúcar común');
            expect(resultado.latenciaMs).toBe(420);
        });

        it('retorna objeto de contingencia cuando ai-service falla o no está disponible', async () => {
            global.fetch = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));

            const resultado = await extraerPreciosIA({
                textoLista: 'Café 1 kg $18000',
                proveedorNombre: 'Tostadero Norte',
                versionPrompt: 'v1',
            });

            expect(resultado.contingencia).toBe(true);
            expect(resultado.proveedorIa).toBe('contingencia');
            expect(resultado.items).toEqual([]);
            expect(resultado.proveedorDetectado).toBe('Tostadero Norte');
            expect(resultado.mensajeContingencia).toContain('manual o por CSV');
        });
    });
});
