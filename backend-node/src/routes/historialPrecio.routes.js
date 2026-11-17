import { Router } from 'express';
import { check } from 'express-validator';
import { validarCampos } from '../middlewares/validarCampos.middleware.js';
import { crearHistorial, listarHistorial } from '../controllers/historialPrecio.controller.js';
import { verificarToken, verificarPermiso } from '../middlewares/auth.middleware.js';

const router = Router();

// Según docs/seguridad.md (§5.2), las rutas de historial de precios requieren token válido y permiso insumos.ver
router.use(verificarToken, verificarPermiso('insumos.ver'));

router.get('/', listarHistorial);

router.post(
    '/',
    [
        check('productoId')
            .notEmpty()
            .withMessage('Tenés que indicar un producto.')
            .isNumeric()
            .withMessage('El producto indicado no es válido.'),
        check('costoAnterior').notEmpty().withMessage('Falta el costo anterior del producto.'),
        check('costoNuevo').notEmpty().withMessage('Falta el costo nuevo del producto.'),
        validarCampos,
    ],
    crearHistorial
);

export default router;
