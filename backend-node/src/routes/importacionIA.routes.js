import { Router } from 'express';
import { check } from 'express-validator';
import {
    aprobarImportacion,
    crearImportacion,
    listarImportaciones,
    obtenerImportacionPorId,
    rechazarImportacion,
} from '../controllers/importacionIA.controller.js';
import { verificarPermiso, verificarToken } from '../middlewares/auth.middleware.js';
import { limitadorIA } from '../middlewares/rateLimit.middleware.js';
import { validarCampos } from '../middlewares/validarCampos.middleware.js';

const router = Router();

// Según docs/seguridad.md (§2), procesar y aprobar listas de precios con IA requiere 'ia.importar_listas'
router.use(verificarToken, verificarPermiso('ia.importar_listas'));

const MAX_IMAGEN_BASE64_BYTES = 7 * 1024 * 1024;
const MIMES_IMAGEN_VALIDOS = ['image/jpeg', 'image/png', 'image/webp'];

const esPeticionConImagen = (req) =>
    String(req.body?.origenArchivo || '').toLowerCase() === 'imagen' ||
    req.body?.imagenBase64 !== undefined ||
    req.body?.imagenMime !== undefined;

const checksImportacionObligatorios = [
    check('textoLista')
        .if((_valor, { req }) => !esPeticionConImagen(req))
        .isString()
        .withMessage('La lista de precios tiene que ser texto.')
        .trim()
        .isLength({ min: 3, max: 15000 })
        .withMessage('La lista de precios tiene que tener entre 3 y 15.000 caracteres.')
        .custom((valor) => {
            if (String(valor || '').trim().startsWith('%PDF-')) {
                throw new Error('No se pudo leer el texto del PDF. Probá subiéndolo de nuevo.');
            }
            return true;
        }),
    check('textoLista')
        .if(
            (valor, { req }) =>
                esPeticionConImagen(req) &&
                valor !== undefined &&
                valor !== null &&
                String(valor).trim() !== ''
        )
        .isString()
        .withMessage('La lista de precios tiene que ser texto.')
        .trim()
        .isLength({ min: 3, max: 15000 })
        .withMessage('La lista de precios tiene que tener entre 3 y 15.000 caracteres.'),
    check('imagenBase64')
        .if((_valor, { req }) => esPeticionConImagen(req))
        .exists({ checkFalsy: true })
        .withMessage('Tenés que subir una foto de la lista de precios.')
        .bail()
        .isString()
        .withMessage('La foto tiene que enviarse en formato base64.')
        .bail()
        .custom((valor) => {
            const limpio = valor.trim();
            if (!limpio) {
                throw new Error('Tenés que subir una foto de la lista de precios.');
            }
            if (limpio.startsWith('data:')) {
                throw new Error('La foto no tiene un formato base64 válido.');
            }
            if (Buffer.byteLength(limpio, 'utf8') > MAX_IMAGEN_BASE64_BYTES) {
                throw new Error('La foto es demasiado pesada. Máximo 5 MB.');
            }
            if (limpio.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(limpio)) {
                throw new Error('La foto no tiene un formato base64 válido.');
            }
            if (Buffer.from(limpio, 'base64').length === 0) {
                throw new Error('La foto está vacía.');
            }
            return true;
        }),
    check('imagenMime')
        .if((_valor, { req }) => esPeticionConImagen(req))
        .exists({ checkFalsy: true })
        .withMessage('Tenés que indicar el formato de la foto.')
        .bail()
        .isString()
        .withMessage('El formato de la foto tiene que ser texto.')
        .bail()
        .trim()
        .toLowerCase()
        .isIn(MIMES_IMAGEN_VALIDOS)
        .withMessage('Elegí una foto JPG, PNG o WEBP.'),
    check('proveedorNombre')
        .optional({ values: 'null' })
        .isString()
        .withMessage('El nombre del proveedor tiene que ser texto.')
        .trim()
        .isLength({ max: 150 })
        .withMessage('El nombre del proveedor no puede superar los 150 caracteres.'),
    check('versionPrompt')
        .optional()
        .matches(/^v\d+$/)
        .withMessage('La versión de las instrucciones de la IA no es válida.'),
    check('origenArchivo')
        .optional({ values: 'null' })
        .isIn(['texto', 'csv', 'pdf', 'imagen'])
        .withMessage('El tipo de archivo no es válido.'),
    validarCampos,
];

const checksAprobarImportacion = [
    check('proveedorId')
        .optional({ values: 'null' })
        .isInt({ min: 1 })
        .withMessage('El proveedor elegido no es válido.'),
    check('proveedorNombre')
        .optional({ values: 'null' })
        .isString()
        .withMessage('El nombre del proveedor tiene que ser texto.')
        .trim()
        .isLength({ max: 150 })
        .withMessage('El nombre del proveedor no puede superar los 150 caracteres.'),
    check('envio')
        .optional({ values: 'null' })
        .isNumeric()
        .withMessage('El costo de envío tiene que ser un número.'),
    check('items')
        .optional({ values: 'null' })
        .isArray({ min: 1 })
        .withMessage('La lista tiene que tener al menos un producto.'),
    validarCampos,
];

const checksRechazarImportacion = [
    check('motivo')
        .optional({ values: 'null' })
        .isString()
        .withMessage('El motivo tiene que ser texto.')
        .trim()
        .isLength({ max: 300 })
        .withMessage('El motivo no puede superar los 300 caracteres.'),
    validarCampos,
];

router.get('/', listarImportaciones);
router.get('/:id', obtenerImportacionPorId);
router.post('/', limitadorIA, checksImportacionObligatorios, crearImportacion);
router.post('/:id/aprobar', checksAprobarImportacion, aprobarImportacion);
router.post('/:id/rechazar', checksRechazarImportacion, rechazarImportacion);

export default router;
