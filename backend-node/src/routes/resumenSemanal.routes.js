import { Router } from 'express';
import { check } from 'express-validator';
import { generarResumenSemanal } from '../controllers/resumenSemanal.controller.js';
import { verificarPermiso, verificarToken } from '../middlewares/auth.middleware.js';
import { limitadorIA } from '../middlewares/rateLimit.middleware.js';
import { validarCampos } from '../middlewares/validarCampos.middleware.js';

const router = Router();

router.use(verificarToken, verificarPermiso('reportes.ver_operativos'));

const checksResumenSemanal = [
    check('fecha_desde')
        .isString()
        .withMessage('Elegí la fecha de inicio.')
        .trim()
        .isLength({ min: 8, max: 20 })
        .withMessage('La fecha de inicio no es válida.'),
    check('fecha_hasta')
        .isString()
        .withMessage('Elegí la fecha de fin.')
        .trim()
        .isLength({ min: 8, max: 20 })
        .withMessage('La fecha de fin no es válida.'),
    check('total_ventas')
        .notEmpty()
        .withMessage('Faltan los totales del período.')
        .isFloat({ min: 0 })
        .withMessage('Los totales del período no son válidos.'),
    check('ganancia_bruta_total')
        .notEmpty()
        .withMessage('Faltan los totales del período.')
        .isNumeric()
        .withMessage('Los totales del período no son válidos.'),
    check('cantidad_tickets')
        .isInt({ min: 0 })
        .withMessage('La cantidad de tickets del período no es válida.'),
    check('productos')
        .isArray({ min: 1 })
        .withMessage('El resumen tiene que incluir al menos un producto.'),
    check('productos.*.nombre')
        .isString()
        .trim()
        .notEmpty()
        .withMessage('Cada producto del resumen tiene que tener nombre.'),
    check('productos.*.unidades_vendidas')
        .isFloat({ min: 0 })
        .withMessage('Las cantidades vendidas de los productos no son válidas.'),
    check('productos.*.ingresos_totales')
        .isFloat({ min: 0 })
        .withMessage('Los montos de los productos del resumen no son válidos.'),
    check('productos.*.ganancia_bruta')
        .isNumeric()
        .withMessage('Los montos de los productos del resumen no son válidos.'),
    check('productos.*.margen_bruto_pct')
        .isNumeric()
        .withMessage('Los márgenes de los productos del resumen no son válidos.'),
    check('alertas_insumos')
        .optional()
        .isArray()
        .withMessage('Las alertas de insumos no son válidas.'),
    check('version_prompt')
        .optional()
        .matches(/^v\d+$/)
        .withMessage('La versión de las instrucciones de la IA no es válida.'),
    validarCampos,
];

router.post('/', limitadorIA, checksResumenSemanal, generarResumenSemanal);

export default router;
