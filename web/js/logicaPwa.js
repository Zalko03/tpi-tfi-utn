/**
 * Convierte un monto decimal (string o número) a entero en centavos
 * para evitar errores de punto flotante en cálculos de caja (AGENTS.md).
 */
export const convertirMontoACentavos = (valor) => {
    if (valor === null || valor === undefined || valor === '') {
        return 0;
    }

    const limpio = String(valor).trim().replace(',', '.');
    const coincidencia = limpio.match(/^(-?\d+)(?:\.(\d+))?$/);
    if (!coincidencia) {
        return 0;
    }

    const signo = coincidencia[1].startsWith('-') ? -1 : 1;
    const parteEntera = Math.abs(parseInt(coincidencia[1], 10));
    const decimalesRaw = (coincidencia[2] || '').padEnd(2, '0').slice(0, 2);
    const parteDecimal = parseInt(decimalesRaw, 10);

    return signo * (parteEntera * 100 + parteDecimal);
};

/**
 * Convierte un entero en centavos a representación decimal exacta "0.00".
 */
export const formatearCentavosADecimal = (centavos) => {
    const entero = Number.isFinite(Number(centavos)) ? Math.round(Number(centavos)) : 0;
    const signo = entero < 0 ? '-' : '';
    const absoluto = Math.abs(entero);
    const pesos = Math.floor(absoluto / 100);
    const restoCentavos = String(absoluto % 100).padStart(2, '0');
    return `${signo}${pesos}.${restoCentavos}`;
};

/**
 * Busca un producto en el catálogo local priorizando coincidencia exacta
 * de código de barras (lector HID por emulación de teclado, CA4.4)
 * y luego coincidencia parcial por nombre.
 */
export const buscarProductoPorCodigoOTexto = (catalogo = [], entrada = '') => {
    const consulta = String(entrada || '').trim();
    if (!consulta || !Array.isArray(catalogo)) {
        return null;
    }

    const porCodigoExacto = catalogo.find(
        (p) =>
            p &&
            p.codigo_barras &&
            String(p.codigo_barras).trim().toLowerCase() === consulta.toLowerCase()
    );
    if (porCodigoExacto) {
        return porCodigoExacto;
    }

    const consultaMin = consulta.toLowerCase();
    return (
        catalogo.find(
            (p) => p && p.nombre && String(p.nombre).toLowerCase().includes(consultaMin)
        ) || null
    );
};

/**
 * Agrega un producto al carrito de caja (o incrementa su cantidad si ya existe)
 * operando exclusivamente con enteros en centavos.
 */
export const agregarProductoAlCarrito = (carritoActual = [], producto, cantidad = 1) => {
    if (!producto || !producto.id) {
        return Array.isArray(carritoActual) ? [...carritoActual] : [];
    }

    const cantEntera = Math.max(1, parseInt(cantidad, 10) || 1);
    const precioCentavos = convertirMontoACentavos(
        producto.precio_venta ?? producto.precioVenta ?? '0.00'
    );

    const copia = Array.isArray(carritoActual) ? carritoActual.map((item) => ({ ...item })) : [];
    const indice = copia.findIndex((item) => Number(item.productoId) === Number(producto.id));

    if (indice >= 0) {
        copia[indice].cantidad += cantEntera;
        copia[indice].subtotalCentavos = copia[indice].cantidad * copia[indice].precioUnitarioCentavos;
        copia[indice].subtotalDecimal = formatearCentavosADecimal(copia[indice].subtotalCentavos);
    } else {
        const subtotalCentavos = cantEntera * precioCentavos;
        copia.push({
            productoId: Number(producto.id),
            nombre: producto.nombre,
            codigoBarras: producto.codigo_barras || '',
            cantidad: cantEntera,
            precioUnitarioCentavos: precioCentavos,
            precioUnitarioDecimal: formatearCentavosADecimal(precioCentavos),
            subtotalCentavos,
            subtotalDecimal: formatearCentavosADecimal(subtotalCentavos),
        });
    }

    return copia;
};

/**
 * Calcula los totales del carrito en centavos y construye el payload para POST /api/ventas/.
 */
export const calcularResumenCarrito = (carrito = []) => {
    const lista = Array.isArray(carrito) ? carrito : [];
    let totalCentavos = 0;
    let cantidadUnidades = 0;

    const itemsPayload = lista.map((item) => {
        const subtotal = Number(item.subtotalCentavos) || 0;
        const cantidad = Number(item.cantidad) || 0;
        totalCentavos += subtotal;
        cantidadUnidades += cantidad;
        return {
            producto: item.productoId,
            cantidad,
        };
    });

    return {
        totalCentavos,
        totalDecimal: formatearCentavosADecimal(totalCentavos),
        cantidadUnidades,
        itemsPayload,
    };
};

/**
 * Clasifica y da formato legible a los eventos recibidos por Socket.IO
 * para mostrarlos en el tablero en tiempo real (T3.5 y T3.6).
 */
export const formatearEventoTiempoReal = (nombreEvento, payload = {}) => {
    const marcaTiempo = payload?.emitidoEn || new Date().toISOString();

    switch (nombreEvento) {
        case 'venta.registrada': {
            const total = payload.total ?? '0.00';
            const turno = payload.turnoId ?? payload.turno_caja ?? 'Local';
            return {
                evento: nombreEvento,
                nivel: 'exito',
                titulo: `Venta #${payload.ventaId ?? '-'} registrada`,
                detalle: `Total $${total} · Turno #${turno} (${payload.metodoPago || 'EFECTIVO'})`,
                alertaMargenBajo: false,
                emitidoEn: marcaTiempo,
            };
        }
        case 'costo.actualizado': {
            const margenPct = (Number(payload.margenNuevo ?? payload.margenBruto ?? 0) * 100).toFixed(
                1
            );
            const esCritico = Boolean(payload.alertaMargenBajo);
            return {
                evento: nombreEvento,
                nivel: esCritico ? 'peligro' : 'advertencia',
                titulo: esCritico
                    ? `Alerta de margen bajo: ${payload.nombre || 'Producto'}`
                    : `Costo actualizado: ${payload.nombre || 'Producto'}`,
                detalle: `Costo $${payload.costoAnterior ?? '-'} -> $${payload.costoNuevo ?? '-'} · Margen: ${margenPct}%`,
                alertaMargenBajo: esCritico,
                emitidoEn: marcaTiempo,
            };
        }
        case 'stock.bajo': {
            return {
                evento: nombreEvento,
                nivel: 'peligro',
                titulo: `Stock crítico: ${payload.nombre || 'Insumo'}`,
                detalle: `Disponible: ${payload.stockActual ?? '0'} ${payload.unidadBase || ''} (mínimo ${payload.stockMinimo ?? '0'})`,
                alertaMargenBajo: false,
                emitidoEn: marcaTiempo,
            };
        }
        case 'importacion.lista': {
            const enContingencia = Boolean(payload.contingencia) || payload.estado === 'CONTINGENCIA';
            return {
                evento: nombreEvento,
                nivel: enContingencia ? 'advertencia' : 'info',
                titulo: enContingencia
                    ? 'Importación IA en modo contingencia'
                    : `Propuesta IA lista (${payload.cantidadItems ?? 0} ítems)`,
                detalle: `Proveedor: ${payload.proveedorDetectado || 'Sin especificar'} · Estado: ${payload.estado || 'LISTA'}`,
                alertaMargenBajo: false,
                emitidoEn: marcaTiempo,
            };
        }
        default:
            return {
                evento: nombreEvento,
                nivel: 'info',
                titulo: `Evento ${nombreEvento}`,
                detalle: JSON.stringify(payload),
                alertaMargenBajo: false,
                emitidoEn: marcaTiempo,
            };
    }
};
