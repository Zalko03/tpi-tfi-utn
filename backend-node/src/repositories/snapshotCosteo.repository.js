import { SnapshotCosteo } from '../models/SnapshotCosteo.js';

export const crearSnapshot = async (datos) => {
    return await SnapshotCosteo.create(datos);
};

export const listarSnapshotsPorProducto = async (productoId, { limite = 20, pagina = 1 } = {}) => {
    const filtro = { estadoActivo: true };
    if (productoId) {
        filtro.productoId = Number(productoId);
    }
    const skip = (Number(pagina) - 1) * Number(limite);
    const [datos, total] = await Promise.all([
        SnapshotCosteo.find(filtro).sort({ createdAt: -1 }).skip(skip).limit(Number(limite)),
        SnapshotCosteo.countDocuments(filtro),
    ]);
    return { datos, total, pagina: Number(pagina), limite: Number(limite) };
};

export const obtenerUltimoSnapshotPorProducto = async (productoId) => {
    return await SnapshotCosteo.findOne({ productoId: Number(productoId), estadoActivo: true }).sort({
        createdAt: -1,
    });
};
