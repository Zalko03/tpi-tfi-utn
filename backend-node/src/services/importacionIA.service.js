import { extraerPreciosIA } from '../clients/ai.client.js';
import { confirmarImportacionComprasDjango } from '../clients/django.client.js';
import * as importacionRepo from '../repositories/importacionIA.repository.js';
import { registrarCambioPrecio } from './historialPrecio.service.js';
import { guardarSnapshot } from './snapshotCosteo.service.js';

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

/**
 * Paso 4 y 5 del flujo de arquitectura (T3.3):
 * El humano aprueba la propuesta de precios -> Node llama a Django para crear
 * las compras y recalcular recetas -> Node guarda historial_precios y snapshots_costeo
 * en MongoDB y marca la importación como APROBADA.
 */
export const aprobarImportacionPrecios = async (
    id,
    {
        usuarioId,
        tokenJwt = null,
        proveedorId = null,
        proveedorNombre = null,
        envio = null,
        items = null,
    } = {}
) => {
    const importacion = await obtenerImportacion(id);

    if (importacion.estado === 'APROBADA' || importacion.estado === 'RECHAZADA') {
        const error = new Error(
            `La importación ya se encuentra en estado ${importacion.estado} y no puede volver a procesarse`
        );
        error.statusCode = 400;
        throw error;
    }

    if (importacion.estado !== 'LISTA' && importacion.estado !== 'CONTINGENCIA') {
        const error = new Error(
            `La importación en estado ${importacion.estado} aún no puede ser aprobada`
        );
        error.statusCode = 400;
        throw error;
    }

    const itemsConfirmados =
        Array.isArray(items) && items.length > 0 ? items : importacion.salida?.items || [];

    if (itemsConfirmados.length === 0) {
        const error = new Error('No hay ítems de precios válidos para aprobar en esta importación');
        error.statusCode = 400;
        throw error;
    }

    const nombreProveedorFinal =
        proveedorNombre ||
        importacion.salida?.proveedorDetectado ||
        importacion.entrada?.proveedorNombre ||
        'Proveedor Importado IA';

    const envioFinal =
        envio !== null && envio !== undefined
            ? String(envio)
            : String(importacion.salida?.envioDetectado ?? '0.00');

    const resultadoDjango = await confirmarImportacionComprasDjango(
        {
            proveedorId,
            proveedorNombre: nombreProveedorFinal,
            envio: envioFinal,
            items: itemsConfirmados,
        },
        tokenJwt
    );

    // Por cada receta recalculada en Django, guardamos HistorialPrecio y SnapshotCosteo (CA3.2)
    for (const prod of resultadoDjango.productosRecalculados) {
        await registrarCambioPrecio({
            productoId: prod.productoId,
            insumoId: prod.insumoId,
            costoAnterior: prod.costoAnterior,
            costoNuevo: prod.costoNuevo,
            motivo: `Aprobación de importación IA (${resultadoDjango.proveedorNombre || nombreProveedorFinal})`,
        });

        await guardarSnapshot({
            productoId: prod.productoId,
            desgloseInsumos: prod.desgloseInsumos,
            costoManoObra: prod.costoManoObra,
            costoDescartables: prod.costoDescartables,
            costoTotal: prod.costoNuevo,
            margenBruto: prod.margenNuevo,
        });
    }

    const comprasIds = resultadoDjango.comprasCreadas.map((c) => c.compraId);
    const productosIds = [
        ...new Set(resultadoDjango.productosRecalculados.map((p) => p.productoId)),
    ];

    const importacionActualizada = await importacionRepo.actualizarImportacionPorId(id, {
        estado: 'APROBADA',
        aprobadoPorId: usuarioId ? Number(usuarioId) : null,
        comprasGeneradasIds: comprasIds,
        productosRecalculadosIds: productosIds,
    });

    return {
        importacion: importacionActualizada,
        comprasCreadas: resultadoDjango.comprasCreadas,
        productosRecalculados: resultadoDjango.productosRecalculados,
    };
};

/**
 * Rechazo humano de la propuesta de precios (CA7.3):
 * Marca la importación como RECHAZADA en MongoDB sin llamar a Django,
 * sin crear ninguna compra ni modificar ningún costo.
 */
export const rechazarImportacionPrecios = async (id, { usuarioId, motivo = null } = {}) => {
    const importacion = await obtenerImportacion(id);

    if (importacion.estado === 'APROBADA' || importacion.estado === 'RECHAZADA') {
        const error = new Error(
            `La importación ya se encuentra en estado ${importacion.estado} y no puede rechazarse`
        );
        error.statusCode = 400;
        throw error;
    }

    const motivoLimpio = motivo ? String(motivo).trim() : 'Rechazada por revisión humana';

    return await importacionRepo.actualizarImportacionPorId(id, {
        estado: 'RECHAZADA',
        rechazadoPorId: usuarioId ? Number(usuarioId) : null,
        motivoRechazo: motivoLimpio,
    });
};
