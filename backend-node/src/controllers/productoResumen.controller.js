import { obtenerProductoDjango } from '../clients/django.client.js';
import * as historialRepo from '../repositories/historialPrecio.repository.js';
import * as snapshotRepo from '../repositories/snapshotCosteo.repository.js';

export const obtenerResumenCostoProducto = async (req, res, next) => {
    try {
        const { id } = req.params;

        const [productoDjango, historial, ultimoSnapshot] = await Promise.all([
            obtenerProductoDjango(id),
            historialRepo.listarHistorialPorProducto(id, { limite: 5 }),
            snapshotRepo.obtenerUltimoSnapshotPorProducto(id),
        ]);

        if (!productoDjango) {
            return res.status(404).json({
                mensaje: 'Producto no encontrado en el catálogo',
                detalles: null,
            });
        }

        res.status(200).json({
            producto: productoDjango,
            historialReciente: historial.datos,
            ultimoSnapshot: ultimoSnapshot || null,
        });
    } catch (error) {
        next(error);
    }
};
