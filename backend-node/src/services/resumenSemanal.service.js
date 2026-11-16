import { generarResumenSemanalIA } from '../clients/ai.client.js';

/**
 * Solicita a ai-service el diagnóstico ejecutivo semanal con métricas reales de ventas y costos.
 */
export const obtenerResumenSemanalEjecutivo = async (datosResumen, correlationId = null) => {
    const payload = {
        fecha_desde: datosResumen.fecha_desde,
        fecha_hasta: datosResumen.fecha_hasta,
        total_ventas: String(datosResumen.total_ventas),
        ganancia_bruta_total: String(datosResumen.ganancia_bruta_total),
        cantidad_tickets: Number(datosResumen.cantidad_tickets),
        productos: datosResumen.productos,
        alertas_insumos: Array.isArray(datosResumen.alertas_insumos)
            ? datosResumen.alertas_insumos
            : [],
        version_prompt: datosResumen.version_prompt || 'v1',
    };

    return await generarResumenSemanalIA(payload, 12000, correlationId);
};
