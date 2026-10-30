import * as importacionService from '../services/importacionIA.service.js';

export const crearImportacion = async (req, res, next) => {
    try {
        const { textoLista, proveedorNombre, versionPrompt } = req.body;
        const usuarioId = req.usuario?.id;

        const importacion = await importacionService.iniciarImportacionPrecios({
            usuarioId,
            textoLista,
            proveedorNombre,
            versionPrompt,
        });

        return res.status(202).json({
            mensaje: 'Importación recibida y en procesamiento asíncrono',
            importacionId: importacion._id,
            estado: importacion.estado,
            versionPrompt: importacion.versionPrompt,
            creadoEn: importacion.createdAt,
        });
    } catch (error) {
        return next(error);
    }
};

export const obtenerImportacionPorId = async (req, res, next) => {
    try {
        const { id } = req.params;
        const importacion = await importacionService.obtenerImportacion(id);
        return res.status(200).json(importacion);
    } catch (error) {
        return next(error);
    }
};

export const listarImportaciones = async (req, res, next) => {
    try {
        const { estado, pagina = 1, limite = 10 } = req.query;
        const resultado = await importacionService.obtenerListadoImportaciones({
            estado,
            pagina: Number(pagina),
            limite: Number(limite),
        });
        return res.status(200).json(resultado);
    } catch (error) {
        return next(error);
    }
};

export const aprobarImportacion = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { proveedorId, proveedorNombre, envio, items } = req.body;
        const usuarioId = req.usuario?.id;
        const tokenJwt = req.headers.authorization || null;

        const resultado = await importacionService.aprobarImportacionPrecios(id, {
            usuarioId,
            tokenJwt,
            proveedorId,
            proveedorNombre,
            envio,
            items,
        });

        return res.status(200).json({
            mensaje: 'Importación aprobada, compras registradas y costos recalculados',
            importacion: resultado.importacion,
            comprasCreadas: resultado.comprasCreadas,
            productosRecalculados: resultado.productosRecalculados,
        });
    } catch (error) {
        return next(error);
    }
};

export const rechazarImportacion = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { motivo } = req.body;
        const usuarioId = req.usuario?.id;

        const importacion = await importacionService.rechazarImportacionPrecios(id, {
            usuarioId,
            motivo,
        });

        return res.status(200).json({
            mensaje: 'Importación rechazada sin modificar compras ni costos',
            importacion,
        });
    } catch (error) {
        return next(error);
    }
};
