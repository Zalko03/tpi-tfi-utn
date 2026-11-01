import { Router } from 'express';
import { obtenerEstado, obtenerEstadoProfundo } from '../controllers/health.controller.js';

const router = Router();

router.get('/', obtenerEstado);
router.get('/profundo', obtenerEstadoProfundo);

export default router;
