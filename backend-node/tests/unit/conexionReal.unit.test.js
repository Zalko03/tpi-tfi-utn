import { jest } from '@jest/globals';
import {
    ESTADO_CONEXION_INICIAL,
    aplicarResultadoPing,
    calcularEsperaProximoPing,
    debeTrabajarSinConexion,
    verificarSaludServidor,
} from '../../../web/js/logicaPwa.js';

describe('calcularEsperaProximoPing', () => {
    it('conectado usa el intervalo fijo de 30 s', () => {
        expect(calcularEsperaProximoPing(0)).toBe(30000);
    });

    it('fallando crece 5, 10, 20, 40 s y se topa en 60 s', () => {
        expect([1, 2, 3, 4, 5, 50].map((n) => calcularEsperaProximoPing(n))).toEqual([
            5000, 10000, 20000, 40000, 60000, 60000,
        ]);
    });

    it('valores raros se tratan como 0 fallos', () => {
        expect(calcularEsperaProximoPing(-3)).toBe(30000);
        expect(calcularEsperaProximoPing(NaN)).toBe(30000);
        expect(calcularEsperaProximoPing(undefined)).toBe(30000);
    });
});

describe('aplicarResultadoPing', () => {
    it('un solo fallo no declara el corte', () => {
        const r = aplicarResultadoPing(ESTADO_CONEXION_INICIAL, false);
        expect(r.estado).toEqual({ servidorAlcanzable: true, fallosSeguidos: 1 });
        expect(r.cambio).toBeNull();
    });

    it('el segundo fallo seguido declara el corte una sola vez', () => {
        const primero = aplicarResultadoPing(ESTADO_CONEXION_INICIAL, false);
        const segundo = aplicarResultadoPing(primero.estado, false);
        expect(segundo.estado.servidorAlcanzable).toBe(false);
        expect(segundo.cambio).toBe('corte');
        const tercero = aplicarResultadoPing(segundo.estado, false);
        expect(tercero.cambio).toBeNull();
        expect(tercero.estado.fallosSeguidos).toBe(3);
    });

    it('un ping bueno tras el corte avisa la vuelta y reinicia los fallos', () => {
        const r = aplicarResultadoPing({ servidorAlcanzable: false, fallosSeguidos: 4 }, true);
        expect(r.estado).toEqual({ servidorAlcanzable: true, fallosSeguidos: 0 });
        expect(r.cambio).toBe('vuelta');
    });

    it('un ping bueno estando conectado no es un cambio', () => {
        const r = aplicarResultadoPing({ servidorAlcanzable: true, fallosSeguidos: 1 }, true);
        expect(r.cambio).toBeNull();
        expect(r.estado.fallosSeguidos).toBe(0);
    });

    it('acepta un umbral de 1 para declarar el corte al primer fallo', () => {
        expect(aplicarResultadoPing(undefined, false, 1).cambio).toBe('corte');
    });
});

describe('verificarSaludServidor', () => {
    it('ok con 200 y arma la URL sin barras dobles', async () => {
        const fetchFn = jest.fn().mockResolvedValue({ ok: true, status: 200 });
        const r = await verificarSaludServidor({ fetchFn, baseUrl: 'http://x:8000/' });
        expect(r).toEqual({ ok: true, motivo: 'ok' });
        expect(fetchFn.mock.calls[0][0]).toBe('http://x:8000/health');
        expect(fetchFn.mock.calls[0][1].cache).toBe('no-store');
    });

    it('un 503 cuenta como servidor caído', async () => {
        const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 503 });
        expect(await verificarSaludServidor({ fetchFn, baseUrl: 'http://x' })).toEqual({
            ok: false,
            motivo: 'http_503',
        });
    });

    it('un error de red devuelve motivo red sin lanzar', async () => {
        const fetchFn = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        expect(await verificarSaludServidor({ fetchFn, baseUrl: 'http://x' })).toEqual({
            ok: false,
            motivo: 'red',
        });
    });

    it('si el servidor no contesta a tiempo aborta y devuelve timeout', async () => {
        jest.useFakeTimers();
        const fetchFn = jest.fn(
            (_url, { signal }) =>
                new Promise((_resolve, reject) => {
                    signal.addEventListener('abort', () => reject(new Error('abortado')));
                })
        );
        const promesa = verificarSaludServidor({ fetchFn, baseUrl: 'http://x', timeoutMs: 1000 });
        jest.advanceTimersByTime(1000);
        expect(await promesa).toEqual({ ok: false, motivo: 'timeout' });
        jest.useRealTimers();
    });

    it('sin URL o en modo offline no llama a fetch', async () => {
        const fetchFn = jest.fn();
        expect((await verificarSaludServidor({ fetchFn, baseUrl: 'offline' })).motivo).toBe('sin_url');
        expect((await verificarSaludServidor({ fetchFn, baseUrl: '' })).motivo).toBe('sin_url');
        expect(fetchFn).not.toHaveBeenCalled();
    });
});

describe('debeTrabajarSinConexion', () => {
    it('conectado de verdad: false', () => {
        expect(debeTrabajarSinConexion({ modoConexion: 'cloud' })).toBe(false);
    });

    it('cualquiera de las tres causas lo activa', () => {
        expect(debeTrabajarSinConexion({ modoConexion: 'offline' })).toBe(true);
        expect(debeTrabajarSinConexion({ modoConexion: 'cloud', navegadorEnLinea: false })).toBe(true);
        expect(debeTrabajarSinConexion({ modoConexion: 'local', servidorAlcanzable: false })).toBe(true);
    });
});
