import { Router } from 'express';
import { param } from 'express-validator';
import { obtenerResumenCostoProducto } from '../controllers/productoResumen.controller.js';
import { verificarToken, verificarPermiso } from '../middlewares/auth.middleware.js';
import { validarCampos } from '../middlewares/validarCampos.middleware.js';
import { limitadorConsultasCostosas } from '../middlewares/rateLimit.middleware.js';

const router = Router();

// Según docs/seguridad.md (§5.2), requiere token válido y permiso recetas.ver_costos
// Rate limiting de endpoint costoso y validación de entrada según T2.5
router.get(
    '/:id/resumen-costo',
    limitadorConsultasCostosas,
    verificarToken,
    verificarPermiso('recetas.ver_costos'),
    [
        param('id').notEmpty().withMessage('El id es obligatorio').isNumeric().withMessage('El id debe ser numérico'),
        validarCampos,
    ],
    obtenerResumenCostoProducto
);

export default router;
