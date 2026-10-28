import { Router } from 'express';
import { obtenerResumenCostoProducto } from '../controllers/productoResumen.controller.js';
import { verificarToken, verificarPermiso } from '../middlewares/auth.middleware.js';

const router = Router();

// Según docs/seguridad.md (§5.2), requiere token válido y permiso recetas.ver_costos
router.get(
    '/:id/resumen-costo',
    verificarToken,
    verificarPermiso('recetas.ver_costos'),
    obtenerResumenCostoProducto
);

export default router;
