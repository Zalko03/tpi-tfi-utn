import * as snapshotService from '../services/snapshotCosteo.service.js';

export const crearSnapshot = async (req, res, next) => {
    try {
        const resultado = await snapshotService.guardarSnapshot(req.body);
        res.status(201).json(resultado);
    } catch (error) {
        next(error);
    }
};

export const listarSnapshots = async (req, res, next) => {
    try {
        const { productoId, pagina = 1, limite = 10 } = req.query;
        const resultado = await snapshotService.obtenerSnapshots(productoId, {
            pagina: Number(pagina),
            limite: Number(limite),
        });
        res.status(200).json(resultado);
    } catch (error) {
        next(error);
    }
};

export const obtenerUltimo = async (req, res, next) => {
    try {
        const { id } = req.params;
        const resultado = await snapshotService.obtenerUltimoSnapshot(id);
        if (!resultado) {
            return res.status(404).json({
                mensaje: 'No se encontraron snapshots para este producto',
                detalles: null,
            });
        }
        res.status(200).json(resultado);
    } catch (error) {
        next(error);
    }
};
