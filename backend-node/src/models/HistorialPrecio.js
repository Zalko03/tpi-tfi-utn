import mongoose from 'mongoose';

const historialPrecioSchema = new mongoose.Schema(
    {
        productoId: {
            type: Number,
            required: [true, 'El ID de producto es obligatorio'],
            index: true,
        },
        insumoId: {
            type: Number,
            required: false,
            index: true,
        },
        costoAnterior: {
            type: String,
            required: [true, 'El costo anterior es obligatorio'],
        },
        costoNuevo: {
            type: String,
            required: [true, 'El costo nuevo es obligatorio'],
        },
        motivo: {
            type: String,
            default: 'Actualización de compra de insumo',
            trim: true,
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

export const HistorialPrecio = mongoose.model('HistorialPrecio', historialPrecioSchema);
