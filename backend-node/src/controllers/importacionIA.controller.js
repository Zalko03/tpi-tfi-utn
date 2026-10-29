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
