import * as historialRepo from '../repositories/historialPrecio.repository.js';

export const registrarCambioPrecio = async ({ productoId, insumoId, costoAnterior, costoNuevo, motivo }) => {
    if (!productoId || !costoAnterior || !costoNuevo) {
        throw new Error('productoId, costoAnterior y costoNuevo son obligatorios');
    }
    return await historialRepo.crearHistorial({
        productoId: Number(productoId),
        insumoId: insumoId ? Number(insumoId) : undefined,
        costoAnterior: String(costoAnterior),
        costoNuevo: String(costoNuevo),
        motivo: motivo || 'Actualización de costo de insumo',
    });
};

export const obtenerHistorial = async (productoId, { limite = 10, pagina = 1 } = {}) => {
    return await historialRepo.listarHistorialPorProducto(productoId, { limite, pagina });
};
