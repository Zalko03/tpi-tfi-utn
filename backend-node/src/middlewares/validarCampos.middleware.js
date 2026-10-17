import { validationResult } from 'express-validator';

export const validarCampos = (req, res, next) => {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
        return res.status(400).json({
            mensaje: 'Datos de entrada inválidos',
            detalles: errores.array().map((err) => `${err.path}: ${err.msg}`),
        });
    }
    next();
};
