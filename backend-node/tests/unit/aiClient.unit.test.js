import { jest } from '@jest/globals';
import {
    extraerPreciosIA,
    generarResumenSemanalIA,
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

        it('reenvía imagen_base64 e imagen_mime sin texto_lista cuando llega una foto', async () => {
            const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    proveedor_detectado: 'Foto Mayorista',
                    envio_detectado: '0.00',
                    moneda: 'ARS',
                    items: [
                        {
                            nombre_insumo: 'Café molido',
                            cantidad: '1',
                            unidad: 'kg',
                            precio_total: '21000.00',
                        },
                    ],
                    advertencias: [],
                    version_prompt: 'v1',
                    proveedor_ia: 'groq',
                    latencia_ms: 910,
                    contingencia: false,
                }),
            });

            const imgB64 = Buffer.from('jpeg-simulado').toString('base64');
            const resultado = await extraerPreciosIA({
                proveedorNombre: 'Foto Mayorista',
                versionPrompt: 'v1',
                origenArchivo: 'imagen',
                imagenBase64: imgB64,
                imagenMime: 'image/jpeg',
            });

            expect(resultado.contingencia).toBe(false);
            expect(resultado.items).toHaveLength(1);
            expect(global.fetch).toHaveBeenCalledTimes(1);

            const [urlLlamada, opciones] = global.fetch.mock.calls[0];
            expect(urlLlamada).toContain('/v1/extraer-precios');
            const cuerpoEnviado = JSON.parse(opciones.body);
            expect(cuerpoEnviado).toEqual({
                proveedor_nombre: 'Foto Mayorista',
                version_prompt: 'v1',
                origen_archivo: 'imagen',
                imagen_base64: imgB64,
                imagen_mime: 'image/jpeg',
            });
            expect(cuerpoEnviado).not.toHaveProperty('texto_lista');
            expect(timeoutSpy).toHaveBeenCalledWith(25000);
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
            expect(resultado.mensajeContingencia).toContain('No se pudo usar la IA, revisá la configuración');
        });

        it('descarta ítems heurísticos si ai-service responde con contingencia: true o proveedor_ia: "contingencia"', () => {
            const normalizado = validarYNormalizarSalidaIA({
                proveedor_detectado: 'Distribuidora Demo',
                envio_detectado: '1500.00',
                moneda: 'ARS',
                items: [
                    {
                        nombre_insumo: 'Café heurístico',
                        cantidad: '1',
                        unidad: 'kg',
                        precio_total: '20000.00',
                    },
                ],
                advertencias: ['GROQ_API_KEY no está configurada en el entorno.'],
                version_prompt: 'v1',
                proveedor_ia: 'contingencia',
                latencia_ms: 2,
                contingencia: true,
                mensaje_contingencia: 'No se pudo usar la IA, revisá la configuración.',
            });

            expect(normalizado.contingencia).toBe(true);
            expect(normalizado.proveedorIa).toBe('contingencia');
            expect(normalizado.items).toEqual([]);
            expect(normalizado.envioDetectado).toBe('0.00');
            expect(normalizado.advertencias).toEqual([
                'GROQ_API_KEY no está configurada en el entorno.',
            ]);
            expect(normalizado.mensajeContingencia).toContain('No se pudo usar la IA');
        });
    });

    describe('generarResumenSemanalIA', () => {
        it('oculta texto demo y expone contingencia cuando ai-service responde en modo contingencia', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    resumen_ejecutivo: 'Demostración comercial: rentabilidad operativa óptima.',
                    productos_destacados: ['Espresso'],
                    sugerencias_rotacion: [],
                    alertas_costos: ['Aviso técnico: GROQ_API_KEY no configurada.'],
                    version_prompt: 'v1',
                    proveedor_ia: 'contingencia',
                    latencia_ms: 1,
                    contingencia: true,
                    mensaje_contingencia: 'No se pudo usar la IA, revisá la configuración.',
                }),
            });

            const res = await generarResumenSemanalIA({
                fecha_desde: '2026-11-01',
                fecha_hasta: '2026-11-07',
                total_ventas: '1000.00',
                ganancia_bruta_total: '500.00',
                cantidad_tickets: 10,
                productos: [],
            });

            expect(res.contingencia).toBe(true);
            expect(res.proveedor_ia).toBe('contingencia');
            expect(res.resumen_ejecutivo).toBeNull();
            expect(res.mensaje_contingencia).toContain('No se pudo usar la IA, revisá la configuración');
            expect(res.advertencias).toEqual(['Aviso técnico: GROQ_API_KEY no configurada.']);
        });

        it('retorna contingencia explícita sin resumen falso cuando ai-service no responde', async () => {
            global.fetch = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));

            const res = await generarResumenSemanalIA({
                fecha_desde: '2026-11-01',
                fecha_hasta: '2026-11-07',
                total_ventas: '1000.00',
                ganancia_bruta_total: '500.00',
                cantidad_tickets: 10,
                productos: [],
            });

            expect(res.contingencia).toBe(true);
            expect(res.proveedor_ia).toBe('contingencia');
            expect(res.resumen_ejecutivo).toBeNull();
            expect(res.mensaje_contingencia).toContain('No se pudo usar la IA, revisá la configuración');
            expect(res.advertencias).toEqual(['connect ECONNREFUSED']);
        });
    });
});
