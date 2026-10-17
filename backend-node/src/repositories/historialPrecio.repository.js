import { HistorialPrecio } from '../models/HistorialPrecio.js';

export const crearHistorial = async (datos) => {
    return await HistorialPrecio.create(datos);
};

export const listarHistorialPorProducto = async (productoId, { limite = 20, pagina = 1 } = {}) => {
    const filtro = { estadoActivo: true };
    if (productoId) {
        filtro.productoId = Number(productoId);
    }
    const skip = (Number(pagina) - 1) * Number(limite);
    const [datos, total] = await Promise.all([
        HistorialPrecio.find(filtro).sort({ createdAt: -1 }).skip(skip).limit(Number(limite)),
        HistorialPrecio.countDocuments(filtro),
    ]);
    return { datos, total, pagina: Number(pagina), limite: Number(limite) };
};
