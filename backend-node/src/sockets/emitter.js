let ioInstancia = null;

export const SALA_LOCAL = 'local';
export const SALA_VER_COSTOS = 'permiso:recetas.ver_costos';
export const SALA_ALERTAS_STOCK = 'rol:stock_alertas';
export const SALA_VER_ARQUEO = 'permiso:caja.ver_efectivo_esperado';

export const registrarInstanciaSocket = (io) => {
    ioInstancia = io;
};

export const obtenerInstanciaSocket = () => {
    return ioInstancia;
};

/**
 * Emite el evento 'venta.registrada':
 * - Con total y medio_pago/metodoPago únicamente a usuarios en SALA_VER_ARQUEO (arqueo ciego estricto).
 * - Sin montos ni medios de pago a la sala 'local' y 'turno:{id}' para no filtrar el arqueo a CAJERO.
 */
export const emitirVentaRegistrada = (datosVenta) => {
    if (!ioInstancia || !datosVenta) {
        return false;
    }

    const emitidoEn = new Date().toISOString();
    const {
        total: _total,
        medio_pago: _medioPago,
        metodoPago: _metodoPago,
        ...datosPublicos
    } = datosVenta;

    const payloadPrivilegiado = {
        ...datosVenta,
        emitidoEn,
    };
    const payloadPublico = {
        ...datosPublicos,
        emitidoEn,
    };

    const turnoId = datosVenta.turnoId ?? datosVenta.turno_caja ?? null;
    ioInstancia.to(SALA_VER_ARQUEO).emit('venta.registrada', payloadPrivilegiado);

    if (turnoId) {
        ioInstancia
            .to([SALA_LOCAL, `turno:${turnoId}`])
            .except(SALA_VER_ARQUEO)
            .emit('venta.registrada', payloadPublico);
    } else {
        ioInstancia
            .to(SALA_LOCAL)
            .except(SALA_VER_ARQUEO)
            .emit('venta.registrada', payloadPublico);
    }

    return true;
};

/**
 * Emite el evento 'costo.actualizado' únicamente a clientes autorizados con
 * el permiso 'recetas.ver_costos' (docs/seguridad.md §5.2 y CA8.3).
 */
export const emitirCostoActualizado = (datosCosto) => {
    if (!ioInstancia || !datosCosto) {
        return false;
    }

    const margenNuevoNum = Number(datosCosto.margenNuevo ?? datosCosto.margenBruto ?? 1);
    const margenObjetivoNum = Number(datosCosto.margenObjetivo ?? 0.3);
    const alertaMargenBajo =
        Number.isFinite(margenNuevoNum) && margenNuevoNum < margenObjetivoNum;

    const payload = {
        ...datosCosto,
        alertaMargenBajo,
        emitidoEn: new Date().toISOString(),
    };

    ioInstancia.to(SALA_VER_COSTOS).emit('costo.actualizado', payload);
    return true;
};

/**
 * Emite el evento 'stock.bajo' únicamente a usuarios con rol DUENIO o ENCARGADO
 * (docs/seguridad.md §5.2).
 */
export const emitirStockBajo = (datosStock) => {
    if (!ioInstancia || !datosStock) {
        return false;
    }

    const payload = {
        ...datosStock,
        emitidoEn: new Date().toISOString(),
    };

    ioInstancia.to(SALA_ALERTAS_STOCK).emit('stock.bajo', payload);
    return true;
};

/**
 * Emite el evento 'importacion.lista' cuando finaliza la extracción asíncrona
 * de una lista de precios con IA (Paso 3 del flujo de arquitectura).
 */
export const emitirImportacionLista = (datosImportacion) => {
    if (!ioInstancia || !datosImportacion) {
        return false;
    }

    const payload = {
        ...datosImportacion,
        emitidoEn: new Date().toISOString(),
    };

    ioInstancia.to(SALA_LOCAL).emit('importacion.lista', payload);
    return true;
};
