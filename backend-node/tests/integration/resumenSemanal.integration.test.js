import { jest } from '@jest/globals';
import request from 'supertest';
import { generarTokenTest } from '../helpers/auth.helper.js';
import app from '../../app.js';

describe('Endpoint POST /v1/resumen-semanal (Consultor IA)', () => {
    const fetchOriginal = global.fetch;

    const payloadValido = {
        fecha_desde: '2026-10-20',
        fecha_hasta: '2026-10-27',
        total_ventas: '185000.00',
        ganancia_bruta_total: '112000.00',
        cantidad_tickets: 64,
        productos: [
            {
                nombre: 'Latte Vainilla',
                unidades_vendidas: 40,
                ingresos_totales: '120000.00',
                ganancia_bruta: '75000.00',
                margen_bruto_pct: '62.50',
            },
        ],
        alertas_insumos: ['Insumo Café en Grano: costo unitario $25000 por kg'],
        version_prompt: 'v1',
    };

    afterEach(() => {
        global.fetch = fetchOriginal;
    });

    it('responde 401 sin token JWT de autorización', async () => {
        const res = await request(app).post('/v1/resumen-semanal').send(payloadValido);
        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('mensaje');
    });

    it('responde 403 cuando un cajero sin permiso reportes.ver_operativos consulta el consultor', async () => {
        const tokenCajero = generarTokenTest({
            rol: 'CAJERO',
            permisos: ['ventas.crear', 'caja.abrir_cerrar'],
        });
        const res = await request(app)
            .post('/v1/resumen-semanal')
            .set('Authorization', `Bearer ${tokenCajero}`)
            .send(payloadValido);

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('mensaje');
    });

    it('responde 400 con formato estándar { mensaje, detalles } ante payload inválido', async () => {
        const tokenDuenio = generarTokenTest({ rol: 'DUENIO', permisos: [] });
        const res = await request(app)
            .post('/v1/resumen-semanal')
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send({
                ...payloadValido,
                productos: [],
            });

        expect(res.status).toBe(400);
        expect(res.body.mensaje).toBe('Datos de entrada inválidos');
        expect(Array.isArray(res.body.detalles)).toBe(true);
    });

    it('responde 200 invocando generarResumenSemanalIA en ai-service para Dueño/Encargado', async () => {
        const tokenEncargado = generarTokenTest({
            rol: 'ENCARGADO',
            permisos: ['reportes.ver_operativos'],
        });
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                resumen_ejecutivo: 'Margen operativo saludable con alta demanda en cafés.',
                productos_destacados: ['Latte Vainilla'],
                sugerencias_rotacion: [],
                alertas_costos: [],
                version_prompt: 'v1',
                proveedor_ia: 'groq',
                latencia_ms: 140,
                contingencia: false,
            }),
        });

        const res = await request(app)
            .post('/v1/resumen-semanal')
            .set('Authorization', `Bearer ${tokenEncargado}`)
            .send(payloadValido);

        expect(res.status).toBe(200);
        expect(res.body.resumen_ejecutivo).toContain('Margen operativo saludable');
        expect(res.body.contingencia).toBe(false);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('propaga contingencia: true y oculta resumen ficticio si ai-service responde en contingencia o cae', async () => {
        const tokenDuenio = generarTokenTest({ rol: 'DUENIO', permisos: [] });
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                resumen_ejecutivo: 'Demostración comercial ficticia',
                productos_destacados: ['Latte Vainilla'],
                sugerencias_rotacion: [],
                alertas_costos: ['Aviso técnico: GROQ_API_KEY no configurada.'],
                version_prompt: 'v1',
                proveedor_ia: 'contingencia',
                latencia_ms: 1,
                contingencia: true,
                mensaje_contingencia: 'No se pudo usar la IA, revisá la configuración.',
            }),
        });

        const resContingencia = await request(app)
            .post('/v1/resumen-semanal')
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send(payloadValido);

        expect(resContingencia.status).toBe(200);
        expect(resContingencia.body.contingencia).toBe(true);
        expect(resContingencia.body.proveedor_ia).toBe('contingencia');
        expect(resContingencia.body.mensaje_contingencia).toContain(
            'No se pudo usar la IA, revisá la configuración'
        );
        expect(resContingencia.body.resumen_ejecutivo).toBeNull();

        global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED ai-service'));
        const resCaida = await request(app)
            .post('/v1/resumen-semanal')
            .set('Authorization', `Bearer ${tokenDuenio}`)
            .send(payloadValido);

        expect(resCaida.status).toBe(200);
        expect(resCaida.body.contingencia).toBe(true);
        expect(resCaida.body.proveedor_ia).toBe('contingencia');
        expect(resCaida.body.mensaje_contingencia).toContain(
            'No se pudo usar la IA, revisá la configuración'
        );
        expect(resCaida.body.resumen_ejecutivo).toBeNull();
    });
});
