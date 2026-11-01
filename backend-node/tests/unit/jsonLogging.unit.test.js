import { formatearLogJson } from '../../src/utils/logger.js';

describe('Unit Tests: formatearLogJson y estructuración de logs (TP 4)', () => {
    it('genera una cadena JSON válida con campos estándar y correlationId', () => {
        const salida = formatearLogJson({
            nivel: 'info',
            mensaje: 'Petición procesada exitosamente',
            correlationId: 'req-corr-12345',
            metadatos: { duracionMs: 45, endpoint: '/api/productos' },
        });

        const parsed = JSON.parse(salida);
        expect(parsed.nivel).toBe('INFO');
        expect(parsed.servicio).toBe('backend-node');
        expect(parsed.mensaje).toBe('Petición procesada exitosamente');
        expect(parsed.correlationId).toBe('req-corr-12345');
        expect(parsed.metadatos).toEqual({ duracionMs: 45, endpoint: '/api/productos' });
        expect(parsed.timestamp).toBeDefined();
    });

    it('sanitiza automáticamente campos sensibles en los metadatos', () => {
        const salida = formatearLogJson({
            nivel: 'warn',
            mensaje: 'Intento de autenticación',
            correlationId: 'corr-auth-111',
            metadatos: {
                usuario: 'admin',
                password: 'MiPasswordSuperSecreta',
                token: 'eyJhbGciOiJSUzI1Ni...',
            },
        });

        const parsed = JSON.parse(salida);
        expect(parsed.metadatos.usuario).toBe('admin');
        expect(parsed.metadatos.password).toBe('********');
        expect(parsed.metadatos.token).toBe('********');
        expect(salida).not.toContain('MiPasswordSuperSecreta');
    });
});
