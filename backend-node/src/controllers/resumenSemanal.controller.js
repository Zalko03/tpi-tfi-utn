import { obtenerResumenSemanalEjecutivo } from '../services/resumenSemanal.service.js';

export const generarResumenSemanal = async (req, res, next) => {
    try {
        const {
            fecha_desde: fechaDesde,
            fecha_hasta: fechaHasta,
            total_ventas: totalVentas,
            ganancia_bruta_total: gananciaBrutaTotal,
            cantidad_tickets: cantidadTickets,
            productos,
            alertas_insumos: alertasInsumos,
            version_prompt: versionPrompt,
        } = req.body;

        const resultado = await obtenerResumenSemanalEjecutivo(
            {
                fecha_desde: fechaDesde,
                fecha_hasta: fechaHasta,
                total_ventas: totalVentas,
                ganancia_bruta_total: gananciaBrutaTotal,
                cantidad_tickets: cantidadTickets,
                productos,
                alertas_insumos: alertasInsumos,
                version_prompt: versionPrompt,
            },
            req.correlationId || null
        );

        res.status(200).json(resultado);
    } catch (error) {
        next(error);
    }
};
