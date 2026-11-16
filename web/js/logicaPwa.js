/**
 * Escapa caracteres HTML especiales para prevenir XSS al renderizar texto externo en innerHTML.
 */
export const escaparHtml = (valor) => {
    if (valor === null || valor === undefined) {
        return '';
    }
    return String(valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

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
            const turno = payload.turnoId ?? payload.turno_caja ?? 'Local';
            const tieneTotal = payload.total !== undefined && payload.total !== null;
            const metodo = payload.metodoPago || payload.medio_pago;
            return {
                evento: nombreEvento,
                nivel: 'exito',
                titulo: `Venta #${payload.ventaId ?? '-'} registrada`,
                detalle: tieneTotal
                    ? `Total $${payload.total} · Turno #${turno}${metodo ? ` (${metodo})` : ''}`
                    : `Turno #${turno} · Operación confirmada`,
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
            const enContingencia =
                Boolean(payload.contingencia) ||
                payload.estado === 'CONTINGENCIA' ||
                payload.estado === 'FALLIDA' ||
                payload.proveedorIa === 'contingencia' ||
                payload.proveedor_ia === 'contingencia';
            return {
                evento: nombreEvento,
                nivel: enContingencia ? 'advertencia' : 'info',
                titulo: enContingencia
                    ? 'Importación IA en modo contingencia'
                    : `Propuesta IA lista (${payload.cantidadItems ?? 0} ítems)`,
                detalle: enContingencia
                    ? `No se pudo usar la IA, revisá la configuración${payload.mensajeContingencia ? ` · ${payload.mensajeContingencia}` : ''}`
                    : `Proveedor: ${payload.proveedorDetectado || 'Sin especificar'} · Estado: ${payload.estado || 'LISTA'}`,
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
        return {
            items: [],
            envioTotal: '0.00',
            delimitadorDetectado: ',',
            textoParaIa: '',
            origen: 'csv-directo',
            requiereIa: false,
        };
    }

    const lineas = texto
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));

    if (lineas.length === 0) {
        return {
            items: [],
            envioTotal: '0.00',
            delimitadorDetectado: ',',
            textoParaIa: '',
            origen: 'csv-directo',
            requiereIa: false,
        };
    }

    const primeraLinea = lineas[0];
    const delimitador = primeraLinea.includes(';')
        ? ';'
        : primeraLinea.includes(',')
          ? ','
          : primeraLinea.includes('\t')
            ? '\t'
            : ',';

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
            c.includes('precio') ||
            c.includes('costo') ||
            c.includes('importe')
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
        ? colsCabecera.findIndex(
              (c) =>
                  c.includes('precio') ||
                  c.includes('total') ||
                  c.includes('importe') ||
                  c.includes('costo') ||
                  c.includes('valor')
          )
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

        const cantidad =
            idxCantidad >= 0 ? normalizarCantidadTexto(cols[idxCantidad]) : '1';
        const unidad =
            idxUnidad >= 0
                ? String(cols[idxUnidad] || 'un')
                      .trim()
                      .toLowerCase() || 'un'
                : 'un';
        const precioTotal =
            idxPrecio >= 0 ? normalizarNumeroTexto(cols[idxPrecio], '0.00') : '0.00';
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
        origen: 'csv-directo',
        requiereIa: false,
    };
};

/**
 * Evalúa si un texto pegado o cargado corresponde a una planilla CSV/tabular compatible
 * con la importación directa CSV (100% sin IA).
 */
export const evaluarTextoComoCsvDirecto = (textoCrudo = '') => {
    const texto = String(textoCrudo || '').trim();
    if (!texto || (!texto.includes(',') && !texto.includes(';') && !texto.includes('\t'))) {
        return {
            compatible: false,
            resultado: {
                items: [],
                envioTotal: '0.00',
                delimitadorDetectado: ',',
                textoParaIa: '',
                origen: 'csv-directo',
                requiereIa: false,
            },
        };
    }

    const resultado = parsearCsvProveedor(texto);
    return {
        compatible: resultado.items.length > 0,
        resultado,
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
export const CLAVE_COLA_VENTAS_RECHAZADAS = 'cafe_cola_ventas_rechazadas';

/**
 * Genera un UUID v4 usando crypto.randomUUID() con fallback determinista en estructura v4.
 */
export const generarIdOperacion = () => {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};

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
 * Obtiene la lista de ventas offline rechazadas definitivamente (errores 4xx de validación).
 */
export const obtenerVentasRechazadasOffline = (storagePersonalizado = null) => {
    const storage = obtenerStorageSeguro(storagePersonalizado);
    if (!storage) return [];
    try {
        const crudo = storage.getItem(CLAVE_COLA_VENTAS_RECHAZADAS);
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
    const payloadConId = {
        ...(ventaPayload || {}),
        id_operacion: ventaPayload?.id_operacion || generarIdOperacion(),
    };

    const registroOffline = {
        idTemporal: `OFF-${Date.now()}-${colaActual.length + 1}`,
        creadoEn: new Date().toISOString(),
        sincronizada: false,
        payload: payloadConId,
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
 * Elimina una venta específica de la cola offline apenas se confirma su envío exitoso.
 */
export const eliminarVentaOffline = (idTemporal, storagePersonalizado = null) => {
    const storage = obtenerStorageSeguro(storagePersonalizado);
    const colaActual = obtenerVentasOffline(storage);
    const nuevaCola = colaActual.filter((item) => item?.idTemporal !== idTemporal);
    if (storage) {
        if (nuevaCola.length === 0) {
            storage.removeItem(CLAVE_COLA_VENTAS_OFFLINE);
        } else {
            storage.setItem(CLAVE_COLA_VENTAS_OFFLINE, JSON.stringify(nuevaCola));
        }
    }
    return nuevaCola;
};

/**
 * Mueve una venta encolada con rechazo definitivo 4xx a una clave separada de rechazadas
 * y la elimina de la cola activa para no bloquear la sincronización del resto.
 */
export const moverVentaARechazadas = (
    itemCola,
    motivoError = '',
    statusHttp = null,
    storagePersonalizado = null
) => {
    const storage = obtenerStorageSeguro(storagePersonalizado);
    const rechazadasActual = obtenerVentasRechazadasOffline(storage);
    const registroRechazado = {
        ...itemCola,
        rechazadaEn: new Date().toISOString(),
        statusHttp,
        motivoError: String(motivoError || 'Rechazada por el servidor'),
    };
    const nuevasRechazadas = [...rechazadasActual, registroRechazado];
    if (storage) {
        storage.setItem(CLAVE_COLA_VENTAS_RECHAZADAS, JSON.stringify(nuevasRechazadas));
    }
    eliminarVentaOffline(itemCola?.idTemporal, storage);
    return nuevasRechazadas;
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

/**
 * Ejecuta una rutina de sincronización protegida por Web Locks API (`sync-ventas`)
 * con fallback seguro mediante flag en memoria cuando `navigator.locks` no existe.
 */
export const ejecutarSincronizacionConLock = async (
    fnSincronizacion,
    estadoLockFallback = { enCurso: false },
    locksApi = null
) => {
    const locks =
        locksApi ??
        (typeof navigator !== 'undefined' && navigator?.locks ? navigator.locks : null);

    if (locks && typeof locks.request === 'function') {
        return locks.request('sync-ventas', { ifAvailable: true }, async (lock) => {
            if (!lock) {
                return { omitidoPorLock: true };
            }
            return fnSincronizacion();
        });
    }

    if (estadoLockFallback.enCurso) {
        return { omitidoPorLock: true };
    }

    estadoLockFallback.enCurso = true;
    try {
        return await fnSincronizacion();
    } finally {
        estadoLockFallback.enCurso = false;
    }
};

/**
 * Determina el turno_caja para sincronizar una venta offline:
 * conserva el turno original guardado en el ítem si sigue ABIERTO,
 * o usa el turno abierto del propio usuario actual sin pisar con el turno de otro cajero.
 */
export const resolverTurnoParaVentaOffline = ({
    turnoOriginalId = null,
    listaTurnos = [],
    turnoActivo = null,
    usuario = null,
} = {}) => {
    const miId = Number(usuario?.id || 0);
    const esDuenioOEncargado = ['DUENIO', 'ENCARGADO'].includes(
        String(usuario?.rol || '').toUpperCase()
    );
    const turnos = Array.isArray(listaTurnos) ? listaTurnos : [];

    const turnoPropioAbierto = turnos.find(
        (t) => t && t.estado === 'ABIERTO' && (miId > 0 ? Number(t.usuario) === miId : true)
    );

    if (turnoOriginalId !== null && turnoOriginalId !== undefined && Number(turnoOriginalId) > 0) {
        const idBuscado = Number(turnoOriginalId);
        if (turnos.length > 0) {
            const turnoOriginal = turnos.find((t) => Number(t.id) === idBuscado);
            if (
                turnoOriginal &&
                turnoOriginal.estado === 'ABIERTO' &&
                (Number(turnoOriginal.usuario) === miId || esDuenioOEncargado)
            ) {
                return turnoOriginal.id;
            }
            return turnoPropioAbierto ? turnoPropioAbierto.id : null;
        }

        if (
            turnoActivo &&
            turnoActivo.estado === 'ABIERTO' &&
            Number(turnoActivo.id) === idBuscado &&
            (!turnoActivo.usuario || Number(turnoActivo.usuario) === miId || esDuenioOEncargado)
        ) {
            return turnoActivo.id;
        }
    }

    if (turnoPropioAbierto) {
        return turnoPropioAbierto.id;
    }

    if (
        turnoActivo &&
        turnoActivo.estado === 'ABIERTO' &&
        (!turnoActivo.usuario || Number(turnoActivo.usuario) === miId)
    ) {
        return turnoActivo.id;
    }

    return null;
};

/**
 * Procesa los ítems de la cola offline contra POST /api/ventas/:
 * - Envía origen: 'offline' e id_operacion para garantizar idempotencia.
 * - Errores 4xx definitivos (excepto 401/408/429) mueven el ítem a cafe_cola_ventas_rechazadas.
 * - Errores de red, 5xx o 401/408/429 interrumpen la cola para reintentar luego.
 */
export const procesarColaVentasOffline = async ({
    fetchFn,
    djangoUrl,
    tokenJwt,
    usuario = null,
    turnoActivo = null,
    listaTurnos = [],
    storage = null,
    onItemSincronizado = null,
    onItemRechazado = null,
} = {}) => {
    const cola = obtenerVentasOffline(storage);
    let sincronizadas = 0;
    let rechazadas = 0;
    let sinTurnoAbierto = false;
    let interrumpidoPorRedOServidor = false;

    for (const itemCola of cola) {
        const raw = itemCola.payload || {};
        const itemsRaw = raw.items_entrada || raw.items || [];
        const medioPago = raw.medio_pago || raw.metodo_pago || 'EFECTIVO';

        let itemsMapeados = [];
        let errorMapeo = '';
        try {
            itemsMapeados = itemsRaw.map((it) => {
                const prodId = Number(it.producto || it.producto_id || it.id);
                if (!Number.isInteger(prodId) || prodId <= 0) {
                    throw new Error('Producto faltante o inválido en una venta de la cola offline.');
                }
                const itemObj = {
                    producto: prodId,
                    producto_id: prodId,
                    cantidad: String(it.cantidad || 1),
                };
                if (it.precio_unitario && Number(it.precio_unitario) > 0) {
                    itemObj.precio_unitario = String(it.precio_unitario);
                }
                return itemObj;
            });
        } catch (errItem) {
            errorMapeo = errItem.message;
        }

        if (errorMapeo || itemsMapeados.length === 0) {
            const motivo = errorMapeo || 'Una venta en cola offline no contiene productos válidos.';
            moverVentaARechazadas(itemCola, motivo, 400, storage);
            rechazadas += 1;
            if (typeof onItemRechazado === 'function') onItemRechazado(itemCola, motivo, 400);
            continue;
        }

        const turnoParaVenta = resolverTurnoParaVentaOffline({
            turnoOriginalId: raw.turno_caja,
            listaTurnos,
            turnoActivo,
            usuario,
        });

        if (!turnoParaVenta) {
            sinTurnoAbierto = true;
            break;
        }

        const payloadNormalizado = {
            turno_caja: turnoParaVenta,
            medio_pago: String(medioPago).toUpperCase(),
            origen: 'offline',
            id_operacion: raw.id_operacion || generarIdOperacion(),
            items: itemsMapeados,
            items_entrada: itemsMapeados,
        };

        try {
            const res = await fetchFn(`${djangoUrl}/api/ventas/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tokenJwt}`,
                },
                body: JSON.stringify(payloadNormalizado),
            });

            if (res.ok) {
                sincronizadas += 1;
                eliminarVentaOffline(itemCola.idTemporal, storage);
                if (typeof onItemSincronizado === 'function') onItemSincronizado(itemCola);
            } else {
                const esErrorClienteDefinitivo =
                    res.status >= 400 &&
                    res.status < 500 &&
                    ![401, 408, 429].includes(res.status);

                if (esErrorClienteDefinitivo) {
                    let motivo = `Error HTTP ${res.status}`;
                    try {
                        const errBody = await res.json();
                        motivo = errBody?.mensaje || errBody?.detail || motivo;
                    } catch {
                        // Mantener motivo por defecto
                    }
                    moverVentaARechazadas(itemCola, motivo, res.status, storage);
                    rechazadas += 1;
                    if (typeof onItemRechazado === 'function') {
                        onItemRechazado(itemCola, motivo, res.status);
                    }
                } else {
                    interrumpidoPorRedOServidor = true;
                    break;
                }
            }
        } catch {
            interrumpidoPorRedOServidor = true;
            break;
        }
    }

    return {
        sincronizadas,
        rechazadas,
        restantes: obtenerVentasOffline(storage).length,
        sinTurnoAbierto,
        interrumpidoPorRedOServidor,
    };
};

/**
 * Formatea una fecha Date a 'YYYY-MM-DD' usando la zona horaria local.
 */
export const formatearFechaLocalInput = (fecha = new Date()) => {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    if (Number.isNaN(d.getTime())) return '';
    const anio = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
};

const parsearFechaSoloDiaLocal = (valor, esFin = false) => {
    const match = String(valor || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const anio = Number(match[1]);
    const mes = Number(match[2]) - 1;
    const dia = Number(match[3]);
    const d = esFin
        ? new Date(anio, mes, dia, 23, 59, 59, 999)
        : new Date(anio, mes, dia, 0, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
};

/**
 * Valida que el rango [fechaDesde, fechaHasta] sea consistente (YYYY-MM-DD y desde <= hasta).
 */
export const validarRangoFechas = (fechaDesde = '', fechaHasta = '') => {
    const desde = String(fechaDesde || '').trim();
    const hasta = String(fechaHasta || '').trim();

    if (desde && parsearFechaSoloDiaLocal(desde, false) === null) {
        return { valido: false, mensaje: 'La fecha "Desde" no tiene un formato válido.' };
    }
    if (hasta && parsearFechaSoloDiaLocal(hasta, true) === null) {
        return { valido: false, mensaje: 'La fecha "Hasta" no tiene un formato válido.' };
    }
    if (desde && hasta && desde > hasta) {
        return {
            valido: false,
            mensaje: 'La fecha "Desde" no puede ser posterior a la fecha "Hasta".',
        };
    }
    return { valido: true, mensaje: '' };
};

/**
 * Determina de forma inclusiva si un timestamp ISO o YYYY-MM-DD cae dentro de [fechaDesde, fechaHasta].
 */
export const estaFechaEnRango = (fechaValor, fechaDesde = '', fechaHasta = '') => {
    const desde = String(fechaDesde || '').trim();
    const hasta = String(fechaHasta || '').trim();
    if (!desde && !hasta) return true;
    if (!fechaValor) return false;

    const texto = String(fechaValor).trim();
    let ms = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
        const match = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        ms = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0).getTime();
    } else {
        ms = new Date(texto).getTime();
    }
    if (Number.isNaN(ms)) return false;

    if (desde) {
        const inicioMs = parsearFechaSoloDiaLocal(desde, false);
        if (inicioMs !== null && ms < inicioMs) return false;
    }
    if (hasta) {
        const finMs = parsearFechaSoloDiaLocal(hasta, true);
        if (finMs !== null && ms > finMs) return false;
    }
    return true;
};

/**
 * Filtra una lista de registros locales/offline por rango de fechas usando uno o varios campos candidatos.
 */
export const filtrarRegistrosPorRangoFechas = (
    registros = [],
    camposFecha = 'fecha',
    fechaDesde = '',
    fechaHasta = ''
) => {
    const lista = Array.isArray(registros) ? registros : [];
    const desde = String(fechaDesde || '').trim();
    const hasta = String(fechaHasta || '').trim();
    if (!desde && !hasta) return [...lista];

    const campos = Array.isArray(camposFecha) ? camposFecha : [camposFecha];
    return lista.filter((item) => {
        if (!item || typeof item !== 'object') return false;
        const valor = campos.map((c) => item[c]).find((v) => v !== null && v !== undefined && v !== '');
        return estaFechaEnRango(valor, desde, hasta);
    });
};

/**
 * Construye query string con fecha_desde, fecha_hasta y parámetros adicionales sin omitir compatibilidad.
 */
export const construirQueryRangoFechas = (fechaDesde = '', fechaHasta = '', paramsExtra = {}) => {
    const params = new URLSearchParams();
    const desde = String(fechaDesde || '').trim();
    const hasta = String(fechaHasta || '').trim();

    if (desde) params.set('fecha_desde', desde);
    if (hasta) params.set('fecha_hasta', hasta);

    if (paramsExtra && typeof paramsExtra === 'object') {
        for (const [clave, valor] of Object.entries(paramsExtra)) {
            if (valor !== undefined && valor !== null && String(valor) !== '') {
                params.set(clave, String(valor));
            }
        }
    }
    return params.toString();
};

const formatearMontoSimple = (valor) => {
    const num = Number(valor);
    if (!Number.isFinite(num)) return '-';
    return `$ ${num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Unifica y ordena cronológicamente Ventas, Movimientos de Stock (o Compras fallback),
 * Cierres de Caja y Ventas Offline pendientes dentro del rango de fechas seleccionado.
 */
export const unificarTrazabilidadRegistros = ({
    ventas = [],
    movimientosStock = [],
    comprasFallback = [],
    cierresCaja = [],
    ventasOffline = [],
    fechaDesde = '',
    fechaHasta = '',
} = {}) => {
    const ventasFiltradas = filtrarRegistrosPorRangoFechas(ventas, 'fecha', fechaDesde, fechaHasta);
    const ventasOfflineFiltradas = filtrarRegistrosPorRangoFechas(
        ventasOffline,
        ['creadoEn', 'fecha'],
        fechaDesde,
        fechaHasta
    );

    const fuenteStock = Array.isArray(movimientosStock) && movimientosStock.length > 0
        ? movimientosStock
        : (Array.isArray(comprasFallback)
            ? comprasFallback.map((c) => ({
                id: `compra-${c.id}`,
                fecha: c.fecha,
                tipo: 'INGRESO',
                subtipo: 'COMPRA',
                insumo_nombre: c.insumo_nombre || `Insumo #${c.insumo}`,
                cantidad: c.cantidad,
                unidad: c.unidad,
                monto: c.precio_total,
                detalle: `Compra a ${c.proveedor_nombre || 'Proveedor'}`,
                usuario_nombre: 'Gerencia / Compras',
            }))
            : []);
    const stockFiltrado = filtrarRegistrosPorRangoFechas(
        fuenteStock,
        'fecha',
        fechaDesde,
        fechaHasta
    );

    const cierresFiltrados = filtrarRegistrosPorRangoFechas(
        cierresCaja,
        ['cierre', 'apertura'],
        fechaDesde,
        fechaHasta
    );

    const registros = [];

    for (const v of ventasFiltradas) {
        const items = Array.isArray(v.items) ? v.items : [];
        const resumenItems = items.length > 0
            ? items.map((it) => `${Number(it.cantidad || 1)}x ${it.producto_nombre || `Prod #${it.producto}`}`).join(', ')
            : 'Ticket de mostrador';
        const medio = v.medio_pago ? ` · ${v.medio_pago}` : '';
        registros.push({
            id: `venta-${v.id}`,
            categoria: 'venta',
            fechaIso: v.fecha || v.creado_en || '',
            tipoEtiqueta: v.origen === 'offline' ? 'Venta (Sync Offline)' : 'Venta',
            nivelBadge: 'exito',
            detalle: `Ticket #${v.id}${medio} · ${resumenItems}`,
            montoCantidad: v.total !== null && v.total !== undefined
                ? formatearMontoSimple(v.total)
                : 'Confidencial',
            responsable: v.usuario_nombre || (v.turno_caja ? `Turno #${v.turno_caja}` : 'Mostrador'),
        });
    }

    for (const vo of ventasOfflineFiltradas) {
        const payload = vo.payload || {};
        const items = payload.items_entrada || payload.items || [];
        const cantItems = items.reduce((acc, it) => acc + (Number(it.cantidad) || 1), 0);
        registros.push({
            id: `offline-${vo.idTemporal || vo.creadoEn}`,
            categoria: 'venta',
            fechaIso: vo.creadoEn || '',
            tipoEtiqueta: 'Venta (Cola Offline)',
            nivelBadge: 'advertencia',
            detalle: `Pendiente sync (${payload.medio_pago || 'EFECTIVO'}) · ${cantItems} unidad(es)`,
            montoCantidad: 'Pendiente sync',
            responsable: 'Terminal Local',
        });
    }

    for (const m of stockFiltrado) {
        const esIngreso = String(m.tipo || '').toUpperCase() === 'INGRESO';
        const signo = esIngreso ? '+' : '-';
        const cantNum = Number(m.cantidad || 0);
        const cantStr = Number.isFinite(cantNum)
            ? `${signo}${cantNum.toLocaleString('es-AR', { maximumFractionDigits: 2 })} ${m.unidad || m.unidad_base || ''}`.trim()
            : `${signo}${m.cantidad || 0} ${m.unidad || ''}`.trim();
        const montoTexto = m.monto !== null && m.monto !== undefined
            ? ` (${formatearMontoSimple(m.monto)})`
            : '';

        registros.push({
            id: `stock-${m.id}`,
            categoria: 'stock',
            fechaIso: m.fecha || '',
            tipoEtiqueta: esIngreso ? 'Stock · Ingreso' : 'Stock · Consumo',
            nivelBadge: esIngreso ? 'info' : 'advertencia',
            detalle: `${m.insumo_nombre || 'Insumo'} · ${m.detalle || m.subtipo || 'Movimiento'}`,
            montoCantidad: `${cantStr}${montoTexto}`,
            responsable: m.usuario_nombre || 'Sistema',
        });
    }

    for (const t of cierresFiltrados) {
        const esCerrado = t.estado === 'CERRADO' || Boolean(t.cierre);
        const fechaTurno = t.cierre || t.apertura || '';
        const difNum = t.diferencia !== null && t.diferencia !== undefined ? Number(t.diferencia) : null;
        let difTexto = 'En curso';
        let nivel = 'info';
        if (esCerrado && difNum !== null) {
            if (difNum > 0) {
                difTexto = `Sobrante +${formatearMontoSimple(difNum)}`;
                nivel = 'exito';
            } else if (difNum < 0) {
                difTexto = `Faltante ${formatearMontoSimple(difNum)}`;
                nivel = 'peligro';
            } else {
                difTexto = 'Arqueo exacto ($ 0,00)';
                nivel = 'exito';
            }
        }
        const montoCaja = esCerrado
            ? (t.efectivo_contado !== null && t.efectivo_contado !== undefined
                ? `Declarado: ${formatearMontoSimple(t.efectivo_contado)}`
                : 'Cerrado')
            : (t.efectivo_inicial !== null && t.efectivo_inicial !== undefined
                ? `Fondo: ${formatearMontoSimple(t.efectivo_inicial)}`
                : 'Abierto');

        registros.push({
            id: `caja-${t.id}`,
            categoria: 'caja',
            fechaIso: fechaTurno,
            tipoEtiqueta: esCerrado ? 'Cierre de Caja' : 'Turno Abierto',
            nivelBadge: nivel,
            detalle: `Turno #${t.id} · ${difTexto} (${t.cantidad_tickets ?? 0} tickets)`,
            montoCantidad: montoCaja,
            responsable: t.usuario_nombre || 'Operador',
        });
    }

    registros.sort((a, b) => {
        const ta = new Date(a.fechaIso).getTime() || 0;
        const tb = new Date(b.fechaIso).getTime() || 0;
        return tb - ta;
    });

    const conteos = {
        total: registros.length,
        ventas: ventasFiltradas.length + ventasOfflineFiltradas.length,
        stock: stockFiltrado.length,
        caja: cierresFiltrados.length,
    };

    return { registros, conteos };
};

export const MENSAJE_IA_NO_DISPONIBLE = 'No se pudo usar la IA, revisá la configuración';

/**
 * Evalúa el estado visual de una importación de precios IA sin disfrazar
 * respuestas de contingencia o errores de red como propuestas válidas de IA.
 */
export const evaluarEstadoImportacionIA = (doc = null) => {
    if (!doc || typeof doc !== 'object') {
        return {
            estadoVisual: 'contingencia',
            esContingencia: true,
            enProceso: false,
            mensajePrincipal: MENSAJE_IA_NO_DISPONIBLE,
            detalleTecnico: 'No se recibió respuesta del servicio de importación.',
            advertencias: [],
            sugerenciaAlternativa:
                'Podés usar la Importación directa CSV (sin IA) desde la previsualización de CSV o registrar la compra de forma manual.',
            puedeAprobar: false,
        };
    }

    const estado = String(doc.estado || '').toUpperCase();
    const proveedorIa = doc.proveedorIa ?? doc.proveedor_ia ?? null;
    const esContingencia =
        Boolean(doc.contingencia) ||
        estado === 'CONTINGENCIA' ||
        estado === 'FALLIDA' ||
        proveedorIa === 'contingencia';

    const enProceso = !esContingencia && (estado === 'PENDIENTE' || estado === 'PROCESANDO');

    const salida = doc.salida || {};
    const items = Array.isArray(salida.items)
        ? salida.items
        : Array.isArray(doc.items)
          ? doc.items
          : [];

    const advertenciasCrudas = [
        ...(Array.isArray(doc.advertencias) ? doc.advertencias : []),
        ...(Array.isArray(salida.advertencias) ? salida.advertencias : []),
    ]
        .map((a) => String(a || '').trim())
        .filter(Boolean);
    const advertencias = [...new Set(advertenciasCrudas)];

    const detalleCrudo =
        doc.mensajeContingencia ||
        doc.mensaje_contingencia ||
        doc.mensajeError ||
        doc.error ||
        '';
    const detalleTecnico = String(detalleCrudo || '').trim();

    if (esContingencia) {
        return {
            estadoVisual: 'contingencia',
            esContingencia: true,
            enProceso: false,
            mensajePrincipal: MENSAJE_IA_NO_DISPONIBLE,
            detalleTecnico,
            advertencias,
            sugerenciaAlternativa:
                'No se generó ninguna propuesta con IA. Podés usar la Importación directa CSV (sin IA) o registrar la compra de forma manual.',
            puedeAprobar: false,
        };
    }

    if (enProceso) {
        return {
            estadoVisual: 'procesando',
            esContingencia: false,
            enProceso: true,
            mensajePrincipal: 'Analizando con IA...',
            detalleTecnico: 'Consultando el servicio de IA para extraer insumos y precios.',
            advertencias: [],
            sugerenciaAlternativa: '',
            puedeAprobar: false,
        };
    }

    const tieneIdServidor = Boolean(doc._id && !String(doc._id).startsWith('local-'));
    return {
        estadoVisual: 'lista',
        esContingencia: false,
        enProceso: false,
        mensajePrincipal: 'Propuesta generada por IA lista para revisión',
        detalleTecnico: '',
        advertencias,
        sugerenciaAlternativa: '',
        puedeAprobar: tieneIdServidor && items.length > 0,
    };
};

/**
 * Evalúa la respuesta del endpoint /v1/resumen-semanal (Consultor IA)
 * diferenciando una respuesta real de IA del modo contingencia.
 */
export const evaluarEstadoResumenIA = (respuestaAi = null, errorRed = null) => {
    if (errorRed || !respuestaAi || typeof respuestaAi !== 'object') {
        const msgError =
            typeof errorRed === 'string'
                ? errorRed
                : errorRed?.message || 'No se pudo comunicar con el servicio de IA.';
        return {
            esContingencia: true,
            mensajePrincipal: MENSAJE_IA_NO_DISPONIBLE,
            detalleTecnico: msgError,
            advertencias: msgError ? [msgError] : [],
            dictamenIa: '',
            productosDestacados: [],
            sugerenciasRotacion: [],
            alertasCostos: [],
        };
    }

    const proveedorIa = respuestaAi.proveedor_ia ?? respuestaAi.proveedorIa ?? null;
    const esContingencia =
        Boolean(respuestaAi.contingencia) || proveedorIa === 'contingencia';

    const advertenciasCrudas = [
        ...(Array.isArray(respuestaAi.advertencias) ? respuestaAi.advertencias : []),
        ...(esContingencia && Array.isArray(respuestaAi.alertas_costos)
            ? respuestaAi.alertas_costos
            : []),
    ]
        .map((a) => String(a || '').trim())
        .filter(Boolean);
    const advertencias = [...new Set(advertenciasCrudas)];

    const detalleTecnico = String(
        respuestaAi.mensaje_contingencia || respuestaAi.mensajeContingencia || ''
    ).trim();

    if (esContingencia) {
        return {
            esContingencia: true,
            mensajePrincipal: MENSAJE_IA_NO_DISPONIBLE,
            detalleTecnico,
            advertencias,
            dictamenIa: '',
            productosDestacados: [],
            sugerenciasRotacion: [],
            alertasCostos: [],
        };
    }

    return {
        esContingencia: false,
        mensajePrincipal: '',
        detalleTecnico: '',
        advertencias: [],
        dictamenIa: String(respuestaAi.resumen_ejecutivo || '').trim(),
        productosDestacados: Array.isArray(respuestaAi.productos_destacados)
            ? respuestaAi.productos_destacados
            : [],
        sugerenciasRotacion: Array.isArray(respuestaAi.sugerencias_rotacion)
            ? respuestaAi.sugerencias_rotacion
            : [],
        alertasCostos: Array.isArray(respuestaAi.alertas_costos)
            ? respuestaAi.alertas_costos
            : [],
    };
};

export const MENSAJE_PDF_ESCANEADO =
    'El PDF parece ser una imagen escaneada sin texto seleccionable. Convertilo a texto/CSV o usá un PDF con texto.';

/**
 * Determina si un archivo seleccionado corresponde a un documento PDF por extensión o MIME type.
 */
export const esArchivoPdf = (archivo) => {
    if (!archivo) return false;
    const nombre = String(archivo.name || '').trim().toLowerCase();
    const tipo = String(archivo.type || '').trim().toLowerCase();
    return tipo === 'application/pdf' || nombre.endsWith('.pdf');
};

/**
 * Reconstruye líneas legibles a partir de los items devueltos por pdf.js `page.getTextContent()`,
 * agrupando fragmentos por coordenada Y y ordenándolos por coordenada X para preservar
 * la estructura de renglones (`insumo - precio - unidad`).
 */
export const reconstruirLineasDeItemsPdf = (items = []) => {
    if (!Array.isArray(items) || items.length === 0) {
        return '';
    }

    const filas = [];
    const TOLERANCIA_Y = 2.5;

    for (const item of items) {
        if (!item || typeof item.str !== 'string') continue;
        const textoCrudo = item.str;
        if (!textoCrudo.trim()) continue;

        const x = Array.isArray(item.transform) ? Number(item.transform[4] ?? 0) : 0;
        const y = Array.isArray(item.transform) ? Number(item.transform[5] ?? 0) : 0;
        const width = Number(item.width ?? 0);

        let fila = filas.find((f) => Math.abs(f.y - y) <= TOLERANCIA_Y);
        if (!fila) {
            fila = { y, segmentos: [] };
            filas.push(fila);
        }
        fila.segmentos.push({ x, width, str: textoCrudo });
    }

    filas.sort((a, b) => b.y - a.y);

    const lineas = [];
    for (const fila of filas) {
        fila.segmentos.sort((a, b) => a.x - b.x);
        let linea = '';
        let prevEndX = null;

        for (const seg of fila.segmentos) {
            const textoSeg = seg.str;
            if (!linea) {
                linea = textoSeg;
            } else {
                const gap = prevEndX !== null ? seg.x - prevEndX : 10;
                const necesitaEspacio =
                    gap >= 1.5 && !linea.endsWith(' ') && !textoSeg.startsWith(' ');
                linea += (necesitaEspacio ? ' ' : '') + textoSeg;
            }
            prevEndX = seg.x + (Number.isFinite(seg.width) ? seg.width : 0);
        }

        const lineaLimpia = linea.replace(/[ \t]+/g, ' ').trim();
        if (lineaLimpia) {
            lineas.push(lineaLimpia);
        }
    }

    return lineas.join('\n');
};

/**
 * Evalúa si el texto extraído de un PDF contiene texto seleccionable real
 * o corresponde a un PDF escaneado / binario sin texto.
 */
export const evaluarTextoExtraidoPdf = (textoCrudo = '') => {
    const texto = String(textoCrudo || '').trim();
    if (texto.startsWith('%PDF-')) {
        return {
            valido: false,
            esEscaneado: false,
            texto: '',
            mensajeError:
                'No se pudo leer el contenido binario del PDF. Usá la extracción con pdf.js local.',
        };
    }

    const caracteresUtiles = texto.replace(/[\s\r\n]+/g, '');
    if (caracteresUtiles.length < 6) {
        return {
            valido: false,
            esEscaneado: true,
            texto: '',
            mensajeError: MENSAJE_PDF_ESCANEADO,
        };
    }

    return {
        valido: true,
        esEscaneado: false,
        texto,
        mensajeError: null,
    };
};

/**
 * Lee un ArrayBuffer / Uint8Array de PDF página por página usando pdf.js local
 * y devuelve el texto extraído preservando renglones, o un aviso explícito si es un PDF escaneado.
 */
export const extraerTextoDePdfBuffer = async (
    bufferPdf,
    pdfjsLibRef = null,
    opciones = {}
) => {
    const pdfjs =
        pdfjsLibRef ||
        (typeof globalThis !== 'undefined' ? globalThis.pdfjsLib : null);

    if (!pdfjs || typeof pdfjs.getDocument !== 'function') {
        throw new Error('La librería local pdf.js no está disponible para procesar archivos PDF.');
    }

    const datos =
        bufferPdf instanceof Uint8Array
            ? bufferPdf
            : bufferPdf instanceof ArrayBuffer
              ? new Uint8Array(bufferPdf)
              : new Uint8Array(bufferPdf?.buffer || bufferPdf);

    const disableWorker =
        opciones.disableWorker !== undefined
            ? opciones.disableWorker
            : typeof Worker === 'undefined';

    const tareaCarga = pdfjs.getDocument({
        data: datos,
        verbosity: 0,
        disableWorker,
        ...opciones,
        // Mitigación CVE-2024-4367: impedir ejecución de eval en fuentes PDF incluso si opciones lo habilita
        isEvalSupported: false,
    });

    const pdfDoc = await tareaCarga.promise;
    try {
        const paginasTexto = [];
        for (let numPagina = 1; numPagina <= pdfDoc.numPages; numPagina++) {
            const pagina = await pdfDoc.getPage(numPagina);
            const contenido = await pagina.getTextContent();
            const textoPagina = reconstruirLineasDeItemsPdf(contenido?.items || []);
            if (textoPagina) {
                paginasTexto.push(textoPagina);
            }
        }

        const textoUnido = paginasTexto.join('\n').trim();
        const evaluacion = evaluarTextoExtraidoPdf(textoUnido);
        return {
            ok: evaluacion.valido,
            esEscaneado: evaluacion.esEscaneado,
            mensajeError: evaluacion.mensajeError,
            texto: evaluacion.texto,
            paginas: pdfDoc.numPages,
            lineas: evaluacion.texto ? evaluacion.texto.split('\n').length : 0,
        };
    } finally {
        if (typeof pdfDoc?.destroy === 'function') {
            await pdfDoc.destroy().catch(() => {});
        }
    }
};

export const TAMANO_MAXIMO_ARCHIVO_IMPORTACION_BYTES = 5 * 1024 * 1024;
export const MENSAJE_ARCHIVO_DEMASIADO_GRANDE =
    'El archivo supera el límite máximo permitido de 5 MB.';
export const MENSAJE_DOC_ANTIGUO = 'Guardá el archivo como .docx y volvé a subirlo';

/**
 * Valida antes de leer un archivo que no supere el tamaño máximo permitido (5 MB por defecto).
 */
export const validarTamanoArchivoImportacion = (
    archivo,
    maxBytes = TAMANO_MAXIMO_ARCHIVO_IMPORTACION_BYTES
) => {
    if (!archivo) {
        return { valido: false, mensajeError: 'No se seleccionó ningún archivo.' };
    }
    const tamano = Number(archivo.size ?? 0);
    if (Number.isFinite(tamano) && tamano > maxBytes) {
        return { valido: false, mensajeError: MENSAJE_ARCHIVO_DEMASIADO_GRANDE };
    }
    return { valido: true, mensajeError: null };
};

/**
 * Detecta archivos Word heredados en formato binario .doc (distinto de .docx).
 */
export const esArchivoDocAntiguo = (archivo) => {
    if (!archivo) return false;
    const nombre = String(archivo.name || '').trim().toLowerCase();
    const tipo = String(archivo.type || '').trim().toLowerCase();
    if (nombre.endsWith('.docx')) return false;
    return nombre.endsWith('.doc') || tipo === 'application/msword';
};

/**
 * Determina si un archivo corresponde a una planilla Excel (.xlsx o .xls).
 */
export const esArchivoExcel = (archivo) => {
    if (!archivo) return false;
    const nombre = String(archivo.name || '').trim().toLowerCase();
    const tipo = String(archivo.type || '').trim().toLowerCase();
    if (nombre.endsWith('.xlsx') || nombre.endsWith('.xls')) {
        return true;
    }
    // En Windows algunos navegadores reportan .csv como application/vnd.ms-excel
    if (
        nombre.endsWith('.csv') ||
        nombre.endsWith('.txt') ||
        nombre.endsWith('.pdf') ||
        nombre.endsWith('.doc') ||
        nombre.endsWith('.docx')
    ) {
        return false;
    }
    return (
        tipo === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        tipo === 'application/vnd.ms-excel'
    );
};

/**
 * Determina si un archivo corresponde a un documento Word moderno (.docx).
 */
export const esArchivoDocx = (archivo) => {
    if (!archivo) return false;
    const nombre = String(archivo.name || '').trim().toLowerCase();
    const tipo = String(archivo.type || '').trim().toLowerCase();
    return (
        nombre.endsWith('.docx') ||
        tipo === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
};

/**
 * Verifica si un texto CSV (por ejemplo, exportado desde la primera hoja de un Excel)
 * posee encabezados compatibles con la plantilla CSV directa del proyecto y filas válidas.
 */
export const evaluarCsvPlantillaDirecta = (contenidoCsv = '') => {
    const vacio = {
        compatible: false,
        resultado: parsearCsvProveedor(''),
    };
    const texto = String(contenidoCsv || '').trim();
    if (!texto) return vacio;

    const lineas = texto
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));

    if (lineas.length < 2) return vacio;

    const primeraLinea = lineas[0];
    const delimitador = primeraLinea.includes(';')
        ? ';'
        : primeraLinea.includes(',')
          ? ','
          : primeraLinea.includes('\t')
            ? '\t'
            : null;

    if (!delimitador) return vacio;

    const colsCabecera = primeraLinea.split(delimitador).map((c) =>
        c
            .replace(/["']/g, '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
    );

    const tieneColumnaInsumo = colsCabecera.some(
        (c) => c.includes('insumo') || c.includes('producto') || c.includes('nombre')
    );
    const tieneColumnaPrecio = colsCabecera.some(
        (c) =>
            c.includes('precio') ||
            c.includes('total') ||
            c.includes('importe') ||
            c.includes('costo') ||
            c.includes('valor')
    );

    if (!tieneColumnaInsumo || !tieneColumnaPrecio) {
        return vacio;
    }

    const evalCsv = evaluarTextoComoCsvDirecto(texto);
    return {
        compatible: evalCsv.compatible,
        resultado: evalCsv.resultado,
    };
};

/**
 * Convierte la primera hoja de un archivo Excel (.xlsx / .xls) a texto CSV usando SheetJS local.
 */
export const extraerCsvDeExcelBuffer = (bufferExcel, xlsxRef = null) => {
    const xlsx =
        xlsxRef || (typeof globalThis !== 'undefined' ? globalThis.XLSX : null);

    if (
        !xlsx ||
        typeof xlsx.read !== 'function' ||
        typeof xlsx.utils?.sheet_to_csv !== 'function'
    ) {
        throw new Error(
            'La librería local SheetJS no está disponible para procesar archivos Excel.'
        );
    }

    if (!bufferExcel) {
        throw new Error('El archivo Excel está vacío o no se pudo leer.');
    }

    const datos =
        bufferExcel instanceof Uint8Array
            ? bufferExcel
            : bufferExcel instanceof ArrayBuffer
              ? new Uint8Array(bufferExcel)
              : new Uint8Array(bufferExcel?.buffer || bufferExcel);

    if (!datos || datos.byteLength === 0) {
        throw new Error('El archivo Excel está vacío o no contiene datos.');
    }

    const workbook = xlsx.read(datos, { type: 'array' });
    if (!workbook || !Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
        throw new Error('El archivo Excel no contiene hojas para importar.');
    }

    const nombreHoja = workbook.SheetNames[0];
    const primeraHoja = workbook.Sheets?.[nombreHoja];
    if (!primeraHoja) {
        throw new Error('La primera hoja del archivo Excel está vacía.');
    }

    const csv = String(
        xlsx.utils.sheet_to_csv(primeraHoja, { blankrows: false, rawNumbers: true }) || ''
    ).trim();

    if (!csv || csv.replace(/[,;\s\r\n]+/g, '').length === 0) {
        throw new Error('La primera hoja del archivo Excel está vacía o no contiene datos.');
    }

    const lineas = csv
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    return {
        ok: true,
        csv,
        nombreHoja,
        totalHojas: workbook.SheetNames.length,
        lineas: lineas.length,
    };
};

/**
 * Extrae únicamente texto plano desde un archivo Word (.docx) usando Mammoth local.
 */
export const extraerTextoDeDocxBuffer = async (bufferDocx, mammothRef = null) => {
    const mammoth =
        mammothRef || (typeof globalThis !== 'undefined' ? globalThis.mammoth : null);

    if (!mammoth || typeof mammoth.extractRawText !== 'function') {
        throw new Error(
            'La librería local Mammoth no está disponible para procesar archivos Word (.docx).'
        );
    }

    if (!bufferDocx) {
        throw new Error('El archivo Word (.docx) está vacío o no se pudo leer.');
    }

    let arrayBuffer;
    if (bufferDocx instanceof ArrayBuffer) {
        arrayBuffer = bufferDocx;
    } else if (ArrayBuffer.isView(bufferDocx)) {
        arrayBuffer = bufferDocx.buffer.slice(
            bufferDocx.byteOffset,
            bufferDocx.byteOffset + bufferDocx.byteLength
        );
    } else if (bufferDocx?.buffer instanceof ArrayBuffer) {
        arrayBuffer = bufferDocx.buffer;
    } else {
        throw new Error('El formato del archivo Word (.docx) no es válido.');
    }

    if (arrayBuffer.byteLength === 0) {
        throw new Error('El archivo Word (.docx) está vacío o no contiene datos.');
    }

    const resultado = await mammoth.extractRawText({ arrayBuffer });
    const texto = String(resultado?.value || '').trim();
    if (!texto) {
        throw new Error(
            'El documento Word (.docx) no contiene texto legible para importar.'
        );
    }

    const lineas = texto
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    return {
        ok: true,
        texto,
        lineas: lineas.length,
        advertencias: Array.isArray(resultado?.messages) ? resultado.messages : [],
    };
};

