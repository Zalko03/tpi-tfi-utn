import mongoose from 'mongoose';
import { registrarCambioPrecio } from './historialPrecio.service.js';
import { guardarSnapshot } from './snapshotCosteo.service.js';
import {
    emitirCostoActualizado,
    emitirVentaAnulada,
    emitirVentaRegistrada,
} from '../sockets/emitter.js';

const procesarCostosRecalculados = async (datos = {}) => {
    const productos = Array.isArray(datos.productosRecalculados)
        ? datos.productosRecalculados
        : [];
    const motivo = datos.motivo || 'Recálculo de costos por condición fiscal';
    const mongoConectado = mongoose.connection.readyState === 1;
    let emitidos = 0;

    for (const prod of productos) {
        if (!prod || !prod.productoId) continue;

        if (mongoConectado) {
            await registrarCambioPrecio({
                productoId: prod.productoId,
                insumoId: prod.insumoId,
                costoAnterior: prod.costoAnterior,
                costoNuevo: prod.costoNuevo,
                motivo,
            });

            await guardarSnapshot({
                productoId: prod.productoId,
                desgloseInsumos: Array.isArray(prod.desgloseInsumos) ? prod.desgloseInsumos : [],
                costoManoObra: prod.costoManoObra || '0.0000',
                costoDescartables: prod.costoDescartables || '0.0000',
                costoTotal: prod.costoNuevo,
                margenBruto: prod.margenNuevo,
            });
        }

        if (
            emitirCostoActualizado({
                productoId: prod.productoId,
                insumoId: prod.insumoId,
                nombre: prod.nombre,
                costoAnterior: prod.costoAnterior,
                costoNuevo: prod.costoNuevo,
                margenNuevo: prod.margenNuevo,
            })
        ) {
            emitidos += 1;
        }
    }

    return emitidos > 0;
};

const DESPACHADORES_POR_EVENTO = {
    'venta.registrada': emitirVentaRegistrada,
    'venta.anulada': emitirVentaAnulada,
    'costos.recalculados': procesarCostosRecalculados,
};

/**
 * Despacha un evento de negocio recibido desde Django hacia MongoDB (si aplica)
 * y las salas Socket.IO correspondientes.
 */
export const despacharEventoInterno = async ({ evento, datos }) => {
    const despachador = DESPACHADORES_POR_EVENTO[evento];
    if (!despachador) {
        const error = new Error(`Evento interno no soportado: ${evento}`);
        error.status = 400;
        throw error;
    }

    const emitido = await despachador(datos);
    return {
        recibido: true,
        evento,
        emitido: Boolean(emitido),
    };
};
