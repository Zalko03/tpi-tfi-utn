import { extraerPreciosIA } from '../clients/ai.client.js';
import * as importacionRepo from '../repositories/importacionIA.repository.js';

/**
 * Ejecuta en segundo plano la consulta a ai-service y persiste la salida,
 * latencia y versión de prompt en MongoDB sin bloquear la petición HTTP original.
 */
export const procesarImportacionEnSegundoPlano = async (
    importacionId,
    { textoLista, proveedorNombre = null, versionPrompt = 'v1' }
) => {
    try {
        await importacionRepo.actualizarImportacionPorId(importacionId, {
            estado: 'PROCESANDO',
        });

        const resultadoIA = await extraerPreciosIA({
            textoLista,
            proveedorNombre,
            versionPrompt,
        });

        const estadoFinal = resultadoIA.contingencia ? 'CONTINGENCIA' : 'LISTA';

        return await importacionRepo.actualizarImportacionPorId(importacionId, {
            estado: estadoFinal,
            salida: {
                proveedorDetectado: resultadoIA.proveedorDetectado,
                envioDetectado: resultadoIA.envioDetectado,
                moneda: resultadoIA.moneda,
                items: resultadoIA.items,
                advertencias: resultadoIA.advertencias,
            },
            versionPrompt: resultadoIA.versionPrompt,
            proveedorIa: resultadoIA.proveedorIa,
            latenciaMs: resultadoIA.latenciaMs,
            contingencia: resultadoIA.contingencia,
            mensajeError: resultadoIA.mensajeContingencia || resultadoIA.error || null,
        });
    } catch (error) {
        return await importacionRepo.actualizarImportacionPorId(importacionId, {
            estado: 'FALLIDA',
            contingencia: true,
            mensajeError: error.message || 'Error inesperado durante el procesamiento de IA',
        });
    }
};

/**
 * Registra la importación en estado PENDIENTE, lanza el procesamiento asíncrono
 * y retorna de inmediato el documento creado para responder HTTP 202 Accepted.
 */
export const iniciarImportacionPrecios = async ({
    usuarioId,
    textoLista,
    proveedorNombre = null,
    versionPrompt = 'v1',
}) => {
    const textoLimpio = typeof textoLista === 'string' ? textoLista.trim() : '';
    if (!usuarioId || !textoLimpio) {
        const error = new Error('usuarioId y textoLista son obligatorios');
        error.statusCode = 400;
        throw error;
    }

    const datosEntrada = {
        textoLista: textoLimpio,
        proveedorNombre: proveedorNombre ? String(proveedorNombre).trim() : null,
    };
    const versionLimpia = versionPrompt ? String(versionPrompt).trim() : 'v1';

    const nuevaImportacion = await importacionRepo.crearImportacion({
        usuarioId: Number(usuarioId),
        entrada: datosEntrada,
        versionPrompt: versionLimpia,
        estado: 'PENDIENTE',
    });

    // Disparo asíncrono no bloqueante (Paso 1 y 2 del flujo de importación)
    setImmediate(() => {
        procesarImportacionEnSegundoPlano(nuevaImportacion._id, {
            textoLista: datosEntrada.textoLista,
            proveedorNombre: datosEntrada.proveedorNombre,
            versionPrompt: versionLimpia,
        }).catch(() => {
            // El error ya es capturado y persistido dentro de procesarImportacionEnSegundoPlano
        });
    });

    return nuevaImportacion;
};

export const obtenerImportacion = async (id) => {
    const importacion = await importacionRepo.obtenerImportacionPorId(id);
    if (!importacion) {
        const error = new Error('La importación solicitada no existe');
        error.statusCode = 404;
        throw error;
    }
    return importacion;
};

export const obtenerListadoImportaciones = async ({ estado, pagina = 1, limite = 10 } = {}) => {
    return await importacionRepo.listarImportaciones({ estado, pagina, limite });
};
