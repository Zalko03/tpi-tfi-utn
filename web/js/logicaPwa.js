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

/**
 * Contenido oficial para descargar la plantilla CSV modelo de proveedor.
 */
export const obtenerContenidoPlantillaCsv = () => {
    return [
        'insumo,cantidad,unidad,precio_total,alicuota_iva,envio',
        'Café Tostado en Grano Especial,5,kg,115000.00,21.00,4500.00',
        'Leche Entera Barista,12,l,16200.00,21.00,0.00',
        'Azúcar Orgánica,10,kg,14500.00,21.00,0.00',
        'Vasos Polipapel 8oz,100,un,12000.00,21.00,0.00',
    ].join('\n');
};

/**
 * Parsea un archivo CSV/TXT de lista de precios de proveedor soportando tanto coma (,)
 * como punto y coma (;), estándar de Excel en español.
 */
export const parsearCsvProveedor = (contenidoCsv = '') => {
    const texto = String(contenidoCsv || '').trim();
    if (!texto) {
        return { items: [], envioTotal: '0.00', textoParaIa: '' };
    }

    const lineas = texto
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));

    if (lineas.length === 0) {
        return { items: [], envioTotal: '0.00', textoParaIa: '' };
    }

    const primeraLinea = lineas[0];
    const delimitador = primeraLinea.includes(';') ? ';' : ',';

    const separarColumnas = (linea) => {
        const resultado = [];
        let actual = '';
        let enComillas = false;
        for (let i = 0; i < linea.length; i++) {
            const char = linea[i];
            if (char === '"') {
                enComillas = !enComillas;
            } else if (char === delimitador && !enComillas) {
                resultado.push(actual.trim());
                actual = '';
            } else {
                actual += char;
            }
        }
        resultado.push(actual.trim());
        return resultado;
    };

    const normalizarNumeroTexto = (val, defecto = '0.00') => {
        if (val === undefined || val === null || String(val).trim() === '') {
            return defecto;
        }
        let limpio = String(val).replace(/[$\s"]/g, '');
        if (delimitador === ';' && limpio.includes(',')) {
            limpio = limpio.replace(/\./g, '').replace(',', '.');
        } else {
            limpio = limpio.replace(',', '.');
        }
        const num = Number(limpio);
        return Number.isFinite(num) && num >= 0 ? num.toFixed(2) : defecto;
    };

    const normalizarCantidadTexto = (val) => {
        if (val === undefined || val === null || String(val).trim() === '') {
            return '1';
        }
        const limpio = String(val).replace(/["\s]/g, '').replace(',', '.');
        const num = Number(limpio);
        return Number.isFinite(num) && num > 0 ? String(num) : '1';
    };

    const colsCabecera = separarColumnas(primeraLinea).map((c) =>
        c
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
    );

    const tieneCabecera = colsCabecera.some(
        (c) =>
            c.includes('insumo') ||
            c.includes('producto') ||
            c.includes('cantidad') ||
            c.includes('precio')
    );

    const indiceInicio = tieneCabecera ? 1 : 0;
    const idxInsumo = tieneCabecera
        ? Math.max(0, colsCabecera.findIndex((c) => c.includes('insumo') || c.includes('producto') || c.includes('nombre')))
        : 0;
    const idxCantidad = tieneCabecera
        ? colsCabecera.findIndex((c) => c.includes('cant'))
        : 1;
    const idxUnidad = tieneCabecera
        ? colsCabecera.findIndex((c) => c.includes('unid'))
        : 2;
    const idxPrecio = tieneCabecera
        ? colsCabecera.findIndex((c) => c.includes('precio') || c.includes('total') || c.includes('importe'))
        : 3;
    const idxAlicuota = tieneCabecera
        ? colsCabecera.findIndex((c) => c.includes('iva') || c.includes('alicuota'))
        : 4;
    const idxEnvio = tieneCabecera
        ? colsCabecera.findIndex((c) => c.includes('envio') || c.includes('flete'))
        : 5;

    const items = [];
    let envioTotalCentavos = 0;

    for (let i = indiceInicio; i < lineas.length; i++) {
        const cols = separarColumnas(lineas[i]);
        if (cols.length < 2) continue;

        const nombreInsumo = String(cols[idxInsumo >= 0 ? idxInsumo : 0] || '').trim();
        if (!nombreInsumo) continue;

        const cantidad = normalizarCantidadTexto(cols[idxCantidad >= 0 ? idxCantidad : 1]);
        const unidad = String(cols[idxUnidad >= 0 ? idxUnidad : 2] || 'un')
            .trim()
            .toLowerCase() || 'un';
        const precioTotal = normalizarNumeroTexto(cols[idxPrecio >= 0 ? idxPrecio : 3], '0.00');
        const alicuotaIva = normalizarNumeroTexto(
            idxAlicuota >= 0 ? cols[idxAlicuota] : '21.00',
            '21.00'
        );
        const envioFila = normalizarNumeroTexto(
            idxEnvio >= 0 ? cols[idxEnvio] : '0.00',
            '0.00'
        );

        if (Number(precioTotal) <= 0) continue;

        envioTotalCentavos += convertirMontoACentavos(envioFila);

        items.push({
            nombre_insumo: nombreInsumo,
            nombreInsumo,
            cantidad,
            unidad,
            precio_total: precioTotal,
            precioTotal,
            iva_incluido: true,
            alicuota: alicuotaIva,
            alicuotaIva,
            envio: envioFila,
        });
    }

    const envioTotal = formatearCentavosADecimal(envioTotalCentavos);
    const lineasTextoIa = items.map(
        (it) => `${it.nombre_insumo} ${it.cantidad} ${it.unidad}: $${it.precio_total}`
    );
    if (envioTotalCentavos > 0) {
        lineasTextoIa.push(`Envío: $${envioTotal}`);
    }

    return {
        items,
        envioTotal,
        delimitadorDetectado: delimitador,
        textoParaIa: lineasTextoIa.join('\n'),
    };
};

/**
 * Extrae ítems de precios desde texto libre o CSV en el cliente cuando se requiere
 * previsualización o respaldo local ante listas pegadas manualmente.
 */
export const extraerItemsDesdeTextoLista = (textoCrudo = '') => {
    const texto = String(textoCrudo || '').trim();
    if (!texto) {
        return { items: [], envioDetectado: '0.00' };
    }

    const resultadoCsv = parsearCsvProveedor(texto);
    if (
        resultadoCsv.items.length > 0 &&
        (texto.includes(',') || texto.includes(';')) &&
        !texto.includes('$')
    ) {
        return {
            items: resultadoCsv.items.map((it) => ({
                nombreInsumo: it.nombre_insumo,
                nombre_insumo: it.nombre_insumo,
                cantidad: it.cantidad,
                unidad: it.unidad,
                precioTotal: it.precio_total,
                precio_total: it.precio_total,
                ivaIncluido: true,
                alicuota: it.alicuota || '21.00',
                confianza: '0.99',
            })),
            envioDetectado: resultadoCsv.envioTotal,
        };
    }

    const lineas = texto
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    const normalizarMonto = (str) => {
        let s = String(str || '')
            .replace(/\$/g, '')
            .trim();
        if (s.includes('.') && s.includes(',')) {
            s = s.replace(/\./g, '').replace(',', '.');
        } else if (s.includes('.') && s.split('.').pop().length === 3) {
            s = s.replace(/\./g, '');
        } else if (s.includes(',')) {
            s = s.replace(',', '.');
        }
        const n = Number(s);
        return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : '0.00';
    };

    let envioDetectado = '0.00';
    const items = [];

    for (const linea of lineas) {
        if (/(?:env[ií]o|flete)/i.test(linea)) {
            const mEnv = linea.match(/\$?\s*([\d.,]+)/);
            if (mEnv) {
                envioDetectado = normalizarMonto(mEnv[1]);
                continue;
            }
        }

        const mPrecio = linea.match(/\$\s*([\d.,]+)/) || linea.match(/:\s*([\d.,]+)\s*$/);
        if (!mPrecio) continue;

        const precioTotal = normalizarMonto(mPrecio[1]);
        if (Number(precioTotal) <= 0) continue;

        const sub = linea
            .slice(0, mPrecio.index)
            .replace(/^[-*•\s]+|[-*:\s]+$/g, '')
            .trim();
        let cantidad = '1';
        let unidad = 'un';
        let nombre = sub;

        const mCant = sub.match(
            /(?:x\s*)?(\d+(?:[.,]\d+)?)\s*(kg|kilo|kilos|g|gr|gramos|l|lt|litro|litros|ml|cc|un|u|unidad|unidades|docena)\b/i
        );
        if (mCant) {
            cantidad = mCant[1].replace(',', '.');
            const uRaw = mCant[2].toLowerCase();
            if (uRaw.startsWith('kil')) unidad = 'kg';
            else if (uRaw.startsWith('gr')) unidad = 'g';
            else if (uRaw.startsWith('l')) unidad = 'l';
            else if (uRaw.startsWith('u')) unidad = 'un';
            else unidad = uRaw;

            nombre = sub
                .slice(0, mCant.index)
                .replace(/(?:pack|caja|bolsa|x)\s*$/i, '')
                .replace(/^[-*•\s,]+|[-*:\s,]+$/g, '')
                .trim();
        }

        if (!nombre) nombre = sub;

        items.push({
            nombreInsumo: nombre,
            nombre_insumo: nombre,
            cantidad,
            unidad,
            precioTotal,
            precio_total: precioTotal,
            ivaIncluido: true,
            alicuota: '21.00',
            confianza: '0.98',
        });
    }

    return { items, envioDetectado };
};

export const CLAVE_COLA_VENTAS_OFFLINE = 'sapori_cola_ventas_offline';

const obtenerStorageSeguro = (storagePersonalizado = null) => {
    if (storagePersonalizado) return storagePersonalizado;
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
    return null;
};

/**
 * Obtiene la lista de ventas pendientes almacenadas en la cola offline.
 */
export const obtenerVentasOffline = (storagePersonalizado = null) => {
    const storage = obtenerStorageSeguro(storagePersonalizado);
    if (!storage) return [];
    try {
        const crudo = storage.getItem(CLAVE_COLA_VENTAS_OFFLINE);
        if (!crudo) return [];
        const parseado = JSON.parse(crudo);
        return Array.isArray(parseado) ? parseado : [];
    } catch {
        return [];
    }
};

/**
 * Encola una venta en localStorage cuando no hay conexión a internet o el backend no responde.
 */
export const encolarVentaOffline = (ventaPayload, storagePersonalizado = null) => {
    const storage = obtenerStorageSeguro(storagePersonalizado);
    const colaActual = obtenerVentasOffline(storage);

    const registroOffline = {
        idTemporal: `OFF-${Date.now()}-${colaActual.length + 1}`,
        creadoEn: new Date().toISOString(),
        sincronizada: false,
        payload: ventaPayload,
    };

    const nuevaCola = [...colaActual, registroOffline];
    if (storage) {
        storage.setItem(CLAVE_COLA_VENTAS_OFFLINE, JSON.stringify(nuevaCola));
    }

    return {
        ventaEncolada: registroOffline,
        totalEnCola: nuevaCola.length,
        cola: nuevaCola,
    };
};

/**
 * Vacía la cola de ventas offline una vez sincronizadas con el servidor.
 */
export const limpiarColaOffline = (storagePersonalizado = null) => {
    const storage = obtenerStorageSeguro(storagePersonalizado);
    if (storage) {
        storage.removeItem(CLAVE_COLA_VENTAS_OFFLINE);
    }
    return [];
};

