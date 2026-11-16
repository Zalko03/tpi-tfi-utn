import { Router } from 'express';
import { check } from 'express-validator';
import { generarResumenSemanal } from '../controllers/resumenSemanal.controller.js';
import { verificarPermiso, verificarToken } from '../middlewares/auth.middleware.js';
import { limitadorConsultasCostosas } from '../middlewares/rateLimit.middleware.js';
import { validarCampos } from '../middlewares/validarCampos.middleware.js';

const router = Router();

router.use(verificarToken, verificarPermiso('reportes.ver_operativos'));

const checksResumenSemanal = [
    check('fecha_desde')
        .isString()
        .withMessage('fecha_desde es obligatoria')
        .trim()
        .isLength({ min: 8, max: 20 })
        .withMessage('fecha_desde debe tener entre 8 y 20 caracteres'),
    check('fecha_hasta')
        .isString()
        .withMessage('fecha_hasta es obligatoria')
        .trim()
        .isLength({ min: 8, max: 20 })
        .withMessage('fecha_hasta debe tener entre 8 y 20 caracteres'),
    check('total_ventas')
        .notEmpty()
        .withMessage('total_ventas es obligatorio')
        .isFloat({ min: 0 })
        .withMessage('total_ventas debe ser un número mayor o igual a 0'),
    check('ganancia_bruta_total')
        .notEmpty()
        .withMessage('ganancia_bruta_total es obligatoria')
        .isNumeric()
        .withMessage('ganancia_bruta_total debe ser numérica'),
    check('cantidad_tickets')
        .isInt({ min: 0 })
        .withMessage('cantidad_tickets debe ser un entero mayor o igual a 0'),
    check('productos')
        .isArray({ min: 1 })
        .withMessage('productos debe incluir al menos un elemento'),
    check('productos.*.nombre')
        .isString()
        .trim()
        .notEmpty()
        .withMessage('Cada producto debe tener nombre'),
    check('productos.*.unidades_vendidas')
        .isFloat({ min: 0 })
        .withMessage('unidades_vendidas debe ser mayor o igual a 0'),
    check('productos.*.ingresos_totales')
        .isFloat({ min: 0 })
        .withMessage('ingresos_totales debe ser mayor o igual a 0'),
    check('productos.*.ganancia_bruta')
        .isNumeric()
        .withMessage('ganancia_bruta debe ser numérica'),
    check('productos.*.margen_bruto_pct')
        .isNumeric()
        .withMessage('margen_bruto_pct debe ser numérico'),
    check('alertas_insumos')
        .optional()
        .isArray()
        .withMessage('alertas_insumos debe ser un listado de strings'),
    check('version_prompt')
        .optional()
        .matches(/^v\d+$/)
        .withMessage('version_prompt debe tener formato v1, v2, etc.'),
    validarCampos,
];

router.post('/', limitadorConsultasCostosas, checksResumenSemanal, generarResumenSemanal);

export default router;
