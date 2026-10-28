import { describe, it, expect, jest } from '@jest/globals';
import { detectarClaveNoSql, sanitizarNoSql } from '../../src/middlewares/nosqlSanitize.middleware.js';

describe('Unit Tests - Sanitización y Detección NoSQL (nosqlSanitize.middleware)', () => {
    it('detectarClaveNoSql retorna null para objetos y valores primitivos limpios', () => {
        expect(detectarClaveNoSql(null)).toBeNull();
        expect(detectarClaveNoSql(123)).toBeNull();
        expect(detectarClaveNoSql('cafe')).toBeNull();
        expect(detectarClaveNoSql({ productoId: 1, costo: 150.5 })).toBeNull();
        expect(detectarClaveNoSql([{ id: 1 }, { id: 2 }])).toBeNull();
    });

    it('detectarClaveNoSql detecta operadores MongoDB con $ en primer nivel', () => {
        const infractor = detectarClaveNoSql({ $gt: 0 });
        expect(infractor).toBe('$gt');
    });

    it('detectarClaveNoSql detecta operadores MongoDB anidados', () => {
        const infractor = detectarClaveNoSql({
            productoId: {
                $ne: null,
            },
        });
        expect(infractor).toBe('$ne');
    });

    it('detectarClaveNoSql detecta inyecciones con operador de subdocumento (.)', () => {
        const infractor = detectarClaveNoSql({
            'usuario.rol': 'DUENIO',
        });
        expect(infractor).toBe('usuario.rol');
    });

    it('detectarClaveNoSql detecta inyecciones dentro de arrays', () => {
        const payload = [
            { nombre: 'Cafe' },
            { $where: 'sleep(1000)' },
        ];
        const infractor = detectarClaveNoSql(payload);
        expect(infractor).toBe('$where');
    });

    it('middleware sanitizarNoSql rechaza con HTTP 400 y formato unificado si el body está infectado', () => {
        const req = {
            body: { precio: { $gt: 100 } },
            query: {},
            params: {},
        };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        const next = jest.fn();

        sanitizarNoSql(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            mensaje: 'Datos de entrada inválidos',
            detalles: "Intento de inyección NoSQL detectado: clave no permitida '$gt'",
        });
    });

    it('middleware sanitizarNoSql rechaza con HTTP 400 si la query contiene operadores', () => {
        const req = {
            body: {},
            query: { id: { $ne: '1' } },
            params: {},
        };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        const next = jest.fn();

        sanitizarNoSql(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('middleware sanitizarNoSql llama a next() cuando la petición es legítima', () => {
        const req = {
            body: { productoId: 5, costoTotal: 250 },
            query: { limite: '10' },
            params: { id: '5' },
        };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        const next = jest.fn();

        sanitizarNoSql(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });
});
