import { despacharEventoInterno } from '../services/eventosInternos.service.js';

/**
 * Recibe notificaciones internas de eventos de negocio desde backend-django.
 */
export const recibirEventoInterno = async (req, res, next) => {
    try {
        const { evento, datos } = req.body;
        const resultado = await despacharEventoInterno({ evento, datos });
        return res.status(202).json(resultado);
    } catch (error) {
        return next(error);
    }
};
