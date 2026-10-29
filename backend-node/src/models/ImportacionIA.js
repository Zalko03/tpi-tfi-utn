import mongoose from 'mongoose';

export const ESTADOS_IMPORTACION_IA = [
    'PENDIENTE',
    'PROCESANDO',
    'LISTA',
    'CONTINGENCIA',
    'APROBADA',
    'RECHAZADA',
    'FALLIDA',
];

const itemImportadoSchema = new mongoose.Schema(
    {
        nombreInsumo: {
            type: String,
            required: [true, 'El nombre del insumo es obligatorio'],
            trim: true,
        },
        cantidad: {
            type: String,
            required: [true, 'La cantidad es obligatoria'],
        },
        unidad: {
            type: String,
            required: [true, 'La unidad es obligatoria'],
            trim: true,
            lowercase: true,
        },
        precioTotal: {
            type: String,
            required: [true, 'El precio total es obligatorio'],
        },
        ivaIncluido: {
            type: Boolean,
            default: true,
        },
        alicuota: {
            type: String,
            default: '21.00',
        },
        confianza: {
            type: String,
            default: '1.00',
        },
        textoOriginal: {
            type: String,
            default: null,
        },
    },
    { _id: false }
);

const importacionIASchema = new mongoose.Schema(
    {
        usuarioId: {
            type: Number,
            required: [true, 'El ID del usuario solicitante es obligatorio'],
            index: true,
        },
        entrada: {
            textoLista: {
                type: String,
                required: [true, 'El texto de la lista de precios es obligatorio'],
                trim: true,
            },
            proveedorNombre: {
                type: String,
                default: null,
                trim: true,
            },
        },
        salida: {
            proveedorDetectado: {
                type: String,
                default: null,
            },
            envioDetectado: {
                type: String,
                default: '0.00',
            },
            moneda: {
                type: String,
                default: 'ARS',
            },
            items: {
                type: [itemImportadoSchema],
                default: [],
            },
            advertencias: {
                type: [String],
                default: [],
            },
        },
        estado: {
            type: String,
            enum: {
                values: ESTADOS_IMPORTACION_IA,
                message: 'El estado {VALUE} no es válido',
            },
            default: 'PENDIENTE',
            index: true,
        },
        versionPrompt: {
            type: String,
            default: 'v1',
            trim: true,
        },
        proveedorIa: {
            type: String,
            default: null,
            trim: true,
        },
        latenciaMs: {
            type: Number,
            default: 0,
            min: [0, 'La latencia no puede ser negativa'],
        },
        contingencia: {
            type: Boolean,
            default: false,
        },
        mensajeError: {
            type: String,
            default: null,
        },
        estadoActivo: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
        collection: 'importaciones_ia',
    }
);

export const ImportacionIA = mongoose.model('ImportacionIA', importacionIASchema);
