import mongoose from 'mongoose';
import { ImportacionIA } from '../models/ImportacionIA.js';

export const crearImportacion = async (datos) => {
    return await ImportacionIA.create(datos);
};

export const obtenerImportacionPorId = async (id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return null;
    }
    return await ImportacionIA.findOne({ _id: id, estadoActivo: true });
};

export const actualizarImportacionPorId = async (id, camposActualizados) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return null;
    }
    return await ImportacionIA.findOneAndUpdate(
        { _id: id, estadoActivo: true },
        { $set: camposActualizados },
        { new: true, runValidators: true }
    );
};

export const listarImportaciones = async ({ estado, pagina = 1, limite = 10 } = {}) => {
    const filtro = { estadoActivo: true };
    if (estado) {
        filtro.estado = String(estado).trim().toUpperCase();
    }
    const skip = (Number(pagina) - 1) * Number(limite);
    const [datos, total] = await Promise.all([
        ImportacionIA.find(filtro).sort({ createdAt: -1 }).skip(skip).limit(Number(limite)),
        ImportacionIA.countDocuments(filtro),
    ]);
    return {
        datos,
        pagina: Number(pagina),
        limite: Number(limite),
        total,
    };
};
