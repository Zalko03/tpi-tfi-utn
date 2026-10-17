import mongoose from 'mongoose';

const desgloseInsumoSchema = new mongoose.Schema(
    {
        insumoId: { type: Number, required: true },
        nombre: { type: String, required: true },
        cantidad: { type: String, required: true },
        unidad: { type: String, required: true },
        costoUnitario: { type: String, required: true },
        costoLinea: { type: String, required: true },
    },
    { _id: false }
);

const snapshotCosteoSchema = new mongoose.Schema(
    {
        productoId: {
            type: Number,
            required: [true, 'El ID de producto es obligatorio'],
            index: true,
        },
        desgloseInsumos: [desgloseInsumoSchema],
        costoManoObra: {
            type: String,
            default: '0.0000',
        },
        costoDescartables: {
            type: String,
            default: '0.0000',
        },
        costoTotal: {
            type: String,
            required: [true, 'El costo total es obligatorio'],
        },
        margenBruto: {
            type: String,
            required: [true, 'El margen bruto es obligatorio'],
        },
        estadoActivo: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

export const SnapshotCosteo = mongoose.model('SnapshotCosteo', snapshotCosteoSchema);
