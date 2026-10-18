import { Router } from 'express';
import { obtenerResumenCostoProducto } from '../controllers/productoResumen.controller.js';

const router = Router();

router.get('/:id/resumen-costo', obtenerResumenCostoProducto);

export default router;
