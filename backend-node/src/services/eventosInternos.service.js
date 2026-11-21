import { emitirVentaAnulada, emitirVentaRegistrada } from '../sockets/emitter.js';

const DESPACHADORES_POR_EVENTO = {
    'venta.registrada': emitirVentaRegistrada,
    'venta.anulada': emitirVentaAnulada,
};

/**
 * Despacha un evento de negocio recibido desde Django hacia las salas Socket.IO correspondientes.
 */
export const despacharEventoInterno = ({ evento, datos }) => {
    const despachador = DESPACHADORES_POR_EVENTO[evento];
    if (!despachador) {
        const error = new Error(`Evento interno no soportado: ${evento}`);
        error.status = 400;
        throw error;
    }

    const emitido = despachador(datos);
    return {
        recibido: true,
        evento,
        emitido,
    };
};
