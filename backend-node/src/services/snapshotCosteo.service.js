import * as snapshotRepo from '../repositories/snapshotCosteo.repository.js';

export const guardarSnapshot = async (datos) => {
    if (!datos.productoId || !datos.costoTotal || !datos.margenBruto) {
        throw new Error('productoId, costoTotal y margenBruto son obligatorios');
    }
    return await snapshotRepo.crearSnapshot(datos);
};

export const obtenerSnapshots = async (productoId, { limite = 10, pagina = 1 } = {}) => {
    return await snapshotRepo.listarSnapshotsPorProducto(productoId, { limite, pagina });
};

export const obtenerUltimoSnapshot = async (productoId) => {
    return await snapshotRepo.obtenerUltimoSnapshotPorProducto(productoId);
};
