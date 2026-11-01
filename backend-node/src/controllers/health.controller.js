import mongoose from 'mongoose';
import { djangoBaseUrl } from '../config/env.js';

export const obtenerEstado = (req, res) => {
    // No toca Mongo: indica solo que el proceso está vivo (Liveness).
    res.status(200).json({ estado: 'ok', servicio: 'backend-node' });
};

export const verificarEstadoConexiones = async (
    timeoutMs = 1500,
    conexionMongo = mongoose.connection
) => {
    // 1. Estado de MongoDB: 1 = connected, 2 = connecting, 0 = disconnected
    const mongoConectado = conexionMongo.readyState === 1;
    const checks = {
        mongodb: {
            estado: mongoConectado ? 'ok' : 'desconectado',
            readyState: conexionMongo.readyState,
        },
    };

    // 2. Estado de Django
    try {
        const resDjango = await fetch(`${djangoBaseUrl}/../health`, {
            signal: AbortSignal.timeout(timeoutMs),
        });
        checks.django = {
            estado: resDjango.ok ? 'ok' : 'degradado',
            statusCode: resDjango.status,
        };
    } catch (err) {
        checks.django = {
            estado: 'inoperativo',
            error: err.message,
        };
    }

    const esSaludable = mongoConectado && checks.django.estado === 'ok';
    const esDegradado = mongoConectado && checks.django.estado !== 'ok';

    return {
        estado: esSaludable ? 'ok' : esDegradado ? 'degradado' : 'error',
        servicio: 'backend-node',
        checks,
    };
};

export const obtenerEstadoProfundo = async (req, res, next) => {
    try {
        const resultado = await verificarEstadoConexiones();
        const codigoHttp = resultado.estado === 'error' ? 503 : 200;
        res.status(codigoHttp).json(resultado);
    } catch (error) {
        next(error);
    }
};
