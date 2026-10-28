import { describe, it, expect } from '@jest/globals';
import { enmascararDatosSensibles } from '../../src/utils/sanitizarLogs.js';

describe('Unit Tests - Sanitización de Logs (sanitizarLogs.js)', () => {
    it('retorna el mismo valor primitivo sin alteraciones', () => {
        expect(enmascararDatosSensibles(null)).toBeNull();
        expect(enmascararDatosSensibles(42)).toBe(42);
        expect(enmascararDatosSensibles('mensaje regular')).toBe('mensaje regular');
    });

    it('enmascara claves sensibles como password, token, refresh, authorization', () => {
        const payload = {
            id: 1,
            username: 'cajero1',
            password: 'mi-clave-super-secreta',
            token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
            refresh: 'refresh-token-secreto',
            authorization: 'Bearer eyJhbGciOi...',
        };

        const resultado = enmascararDatosSensibles(payload);

        expect(resultado.id).toBe(1);
        expect(resultado.username).toBe('cajero1');
        expect(resultado.password).toBe('********');
        expect(resultado.token).toBe('********');
        expect(resultado.refresh).toBe('********');
        expect(resultado.authorization).toBe('********');
    });

    it('enmascara datos sensibles de forma recursiva en objetos anidados', () => {
        const payload = {
            usuario: {
                perfil: {
                    clave: 'clave123',
                },
            },
            configuracion: {
                autenticacion: {
                    secret: 'super-secret',
                },
            },
        };

        const resultado = enmascararDatosSensibles(payload);

        expect(resultado.usuario.perfil.clave).toBe('********');
        expect(resultado.configuracion.autenticacion.secret).toBe('********');
    });

    it('enmascara datos sensibles en listas/arrays de objetos', () => {
        const lista = [
            { id: 1, password: 'p1' },
            { id: 2, password: 'p2' },
        ];

        const resultado = enmascararDatosSensibles(lista);

        expect(resultado[0].id).toBe(1);
        expect(resultado[0].password).toBe('********');
        expect(resultado[1].id).toBe(2);
        expect(resultado[1].password).toBe('********');
    });
});
