import { Router } from 'express';
import { check } from 'express-validator';
import { recibirEventoInterno } from '../controllers/eventosInternos.controller.js';
import { verificarClaveInterna } from '../middlewares/authInterna.middleware.js';
import { validarCampos } from '../middlewares/validarCampos.middleware.js';

const router = Router();

const EVENTOS_VENTA_PERMITIDOS = ['venta.registrada', 'venta.anulada'];

const checksEventoInterno = [
    check('evento')
        .exists({ checkFalsy: true })
        .withMessage('El nombre del evento es obligatorio.')
        .bail()
        .isIn(EVENTOS_VENTA_PERMITIDOS)
        .withMessage('El tipo de evento interno no es válido.'),
    check('datos')
        .exists()
        .withMessage('Los datos del evento son obligatorios.')
        .bail()
        .custom((valor) => Boolean(valor && typeof valor === 'object' && !Array.isArray(valor)))
        .withMessage('Los datos del evento deben enviarse como un objeto.'),
    check('datos.ventaId')
        .exists()
        .withMessage('El identificador de venta es obligatorio.')
        .bail()
        .isInt({ min: 1 })
        .withMessage('El identificador de venta debe ser un entero positivo.'),
    validarCampos,
];

router.post('/eventos', verificarClaveInterna, checksEventoInterno, recibirEventoInterno);

export default router;
