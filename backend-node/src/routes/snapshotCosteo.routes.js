import { Router } from 'express';
import { check } from 'express-validator';
import { validarCampos } from '../middlewares/validarCampos.middleware.js';
import { crearSnapshot, listarSnapshots, obtenerUltimo } from '../controllers/snapshotCosteo.controller.js';
import { verificarToken, verificarPermiso } from '../middlewares/auth.middleware.js';

const router = Router();

// Según docs/seguridad.md (§5.2), el acceso a costos y snapshots requiere token válido y permiso recetas.ver_costos
router.use(verificarToken, verificarPermiso('recetas.ver_costos'));

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
