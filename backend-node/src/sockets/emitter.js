let ioInstancia = null;

export const SALA_LOCAL = 'local';
export const SALA_VER_COSTOS = 'permiso:recetas.ver_costos';
export const SALA_ALERTAS_STOCK = 'rol:stock_alertas';
export const SALA_VER_ARQUEO = 'permiso:caja.ver_efectivo_esperado';
export const SALA_VER_VENTAS_COMPLETAS = 'permiso:ventas_arqueo_y_costos';

const CAMPOS_COSTOS_VENTA = new Set([
    'costoTotalSnapshot',
    'costo_total_snapshot',
    'costoTotal',
    'costo_total',
    'costoUnitarioSnapshot',
    'costo_unitario_snapshot',
    'margenBruto',
    'margen_bruto',
    'margen',
]);
const CAMPOS_GANANCIA_VENTA = new Set(['gananciaBruta', 'ganancia_bruta', 'ganancia']);
const CAMPOS_ARQUEO_VENTA = new Set(['total', 'medio_pago', 'metodoPago', 'medioPago']);
const CAMPOS_COSTOS_ITEM = new Set(['costoUnitarioSnapshot', 'costo_unitario_snapshot']);
const CAMPOS_ARQUEO_ITEM = new Set(['precioUnitario', 'precio_unitario', 'subtotal']);

const filtrarItemVenta = (item, { incluirArqueo, incluirCostos }) => {
    if (!item || typeof item !== 'object') {
        return item;
    }
    const limpio = {};
    for (const [clave, valor] of Object.entries(item)) {
        if (!incluirCostos && CAMPOS_COSTOS_ITEM.has(clave)) continue;
        if (!incluirArqueo && CAMPOS_ARQUEO_ITEM.has(clave)) continue;
        limpio[clave] = valor;
    }
    return limpio;
};

const construirPayloadVenta = (datosVenta, { incluirArqueo, incluirCostos, emitidoEn }) => {
    const payload = {};
    for (const [clave, valor] of Object.entries(datosVenta)) {
        if (!incluirCostos && CAMPOS_COSTOS_VENTA.has(clave)) continue;
        if (!incluirArqueo && CAMPOS_ARQUEO_VENTA.has(clave)) continue;
        // La ganancia revela el total si se combina con el costo, por eso requiere ambos permisos.
        if ((!incluirCostos || !incluirArqueo) && CAMPOS_GANANCIA_VENTA.has(clave)) continue;

        if (clave === 'items' && Array.isArray(valor)) {
            payload.items = valor.map((it) =>
                filtrarItemVenta(it, { incluirArqueo, incluirCostos })
            );
        } else {
            payload[clave] = valor;
        }
    }
    payload.emitidoEn = emitidoEn;
    return payload;
};

export const registrarInstanciaSocket = (io) => {
    ioInstancia = io;
};

export const obtenerInstanciaSocket = () => {
    return ioInstancia;
};

/**
 * Emite un evento de venta ('venta.registrada' o 'venta.anulada') filtrando por salas:
 * - Arqueo y costos: payload completo a SALA_VER_VENTAS_COMPLETAS.
 * - Solo arqueo (sin 'recetas.ver_costos'): sin costos ni ganancia a SALA_VER_ARQUEO.
 * - Solo costos (sin 'caja.ver_efectivo_esperado'): sin montos/medios ni ganancia a SALA_VER_COSTOS.
 * - Resto de 'local' / 'turno:{id}': sin montos, medios de pago, costos ni ganancia.
 */
const emitirEventoVenta = (nombreEvento, datosVenta) => {
    if (!ioInstancia || !datosVenta) {
        return false;
    }

    const emitidoEn = new Date().toISOString();
    const turnoId = datosVenta.turnoId ?? datosVenta.turno_caja ?? null;

    const payloadCompleto = construirPayloadVenta(datosVenta, {
        incluirArqueo: true,
        incluirCostos: true,
        emitidoEn,
    });
    const payloadSoloArqueo = construirPayloadVenta(datosVenta, {
        incluirArqueo: true,
        incluirCostos: false,
        emitidoEn,
    });
    const payloadSoloCostos = construirPayloadVenta(datosVenta, {
        incluirArqueo: false,
        incluirCostos: true,
        emitidoEn,
    });
    const payloadPublico = construirPayloadVenta(datosVenta, {
        incluirArqueo: false,
        incluirCostos: false,
        emitidoEn,
    });

    ioInstancia.to(SALA_VER_VENTAS_COMPLETAS).emit(nombreEvento, payloadCompleto);
    ioInstancia.to(SALA_VER_ARQUEO).except(SALA_VER_COSTOS).emit(nombreEvento, payloadSoloArqueo);
    ioInstancia.to(SALA_VER_COSTOS).except(SALA_VER_ARQUEO).emit(nombreEvento, payloadSoloCostos);

    const salasPublicas = turnoId ? [SALA_LOCAL, `turno:${turnoId}`] : [SALA_LOCAL];
    ioInstancia
        .to(salasPublicas)
        .except([SALA_VER_ARQUEO, SALA_VER_COSTOS])
        .emit(nombreEvento, payloadPublico);

    return true;
};

export const emitirVentaRegistrada = (datosVenta) => {
    return emitirEventoVenta('venta.registrada', datosVenta);
};

export const emitirVentaAnulada = (datosVenta) => {
    return emitirEventoVenta('venta.anulada', datosVenta);
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
