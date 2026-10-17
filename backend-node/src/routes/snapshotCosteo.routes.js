import { Router } from 'express';
import { check } from 'express-validator';
import { validarCampos } from '../middlewares/validarCampos.middleware.js';
import { crearSnapshot, listarSnapshots, obtenerUltimo } from '../controllers/snapshotCosteo.controller.js';

const router = Router();

router.get('/', listarSnapshots);
router.get('/:id/ultimo', obtenerUltimo);

router.post(
    '/',
    [
        check('productoId').notEmpty().withMessage('El productoId es obligatorio').isNumeric().withMessage('productoId debe ser numérico'),
        check('costoTotal').notEmpty().withMessage('El costoTotal es obligatorio'),
        check('margenBruto').notEmpty().withMessage('El margenBruto es obligatorio'),
        validarCampos,
    ],
    crearSnapshot
);

export default router;
