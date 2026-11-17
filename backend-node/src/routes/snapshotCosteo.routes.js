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
        check('productoId')
            .notEmpty()
            .withMessage('Tenés que indicar un producto.')
            .isNumeric()
            .withMessage('El producto indicado no es válido.'),
        check('costoTotal').notEmpty().withMessage('Falta el costo total del producto.'),
        check('margenBruto').notEmpty().withMessage('Falta el margen del producto.'),
        validarCampos,
    ],
    crearSnapshot
);

export default router;
