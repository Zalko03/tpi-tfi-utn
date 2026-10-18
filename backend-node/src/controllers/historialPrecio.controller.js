import * as historialService from '../services/historialPrecio.service.js';

export const crearHistorial = async (req, res, next) => {
    try {
        const resultado = await historialService.registrarCambioPrecio(req.body);
        res.status(201).json(resultado);
    } catch (error) {
        next(error);
    }
};

export const listarHistorial = async (req, res, next) => {
    try {
        const { productoId, pagina = 1, limite = 10 } = req.query;
        const resultado = await historialService.obtenerHistorial(productoId, {
            pagina: Number(pagina),
            limite: Number(limite),
        });
        res.status(200).json(resultado);
    } catch (error) {
        next(error);
    }
};
