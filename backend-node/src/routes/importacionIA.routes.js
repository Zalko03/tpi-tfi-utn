import { Router } from 'express';
import { check } from 'express-validator';
import {
    crearImportacion,
    listarImportaciones,
    obtenerImportacionPorId,
} from '../controllers/importacionIA.controller.js';
import { verificarPermiso, verificarToken } from '../middlewares/auth.middleware.js';
import { validarCampos } from '../middlewares/validarCampos.middleware.js';

const router = Router();

// Según docs/seguridad.md (§2), procesar listas de precios con IA requiere 'ia.importar_listas'
router.use(verificarToken, verificarPermiso('ia.importar_listas'));

const checksImportacionObligatorios = [
    check('textoLista')
        .isString()
        .withMessage('textoLista debe ser una cadena de texto')
        .trim()
        .isLength({ min: 3, max: 15000 })
        .withMessage('textoLista debe tener entre 3 y 15000 caracteres'),
    check('proveedorNombre')
        .optional({ values: 'null' })
        .isString()
        .withMessage('proveedorNombre debe ser una cadena de texto')
        .trim()
        .isLength({ max: 150 })
        .withMessage('proveedorNombre no puede superar los 150 caracteres'),
    check('versionPrompt')
        .optional()
        .matches(/^v\d+$/)
        .withMessage('versionPrompt debe tener formato v1, v2, etc.'),
    validarCampos,
];

router.get('/', listarImportaciones);
router.get('/:id', obtenerImportacionPorId);
router.post('/', checksImportacionObligatorios, crearImportacion);

export default router;
