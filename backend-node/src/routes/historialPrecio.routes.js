import { Router } from 'express';
import { check } from 'express-validator';
import { validarCampos } from '../middlewares/validarCampos.middleware.js';
import { crearHistorial, listarHistorial } from '../controllers/historialPrecio.controller.js';

const router = Router();

router.get('/', listarHistorial);

router.post(
    '/',
    [
        check('productoId').notEmpty().withMessage('El productoId es obligatorio').isNumeric().withMessage('productoId debe ser numérico'),
        check('costoAnterior').notEmpty().withMessage('El costoAnterior es obligatorio'),
        check('costoNuevo').notEmpty().withMessage('El costoNuevo es obligatorio'),
        validarCampos,
    ],
    crearHistorial
);

export default router;
