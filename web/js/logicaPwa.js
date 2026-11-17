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
                titulo: 'Actividad en el local',
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
                    throw new Error('Una venta guardada sin internet tiene un producto que no es válido.');
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
            const motivo = errorMapeo || 'Una venta guardada sin internet no tiene productos válidos.';
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
                    let mensajeApi = '';
                    try {
                        const errBody = await res.json();
                        mensajeApi = errBody?.mensaje || errBody?.detail || '';
                    } catch {
                        // Mantener motivo por defecto
                    }
                    const motivo = mensajeErrorParaUsuario(res.status, mensajeApi);
                    moverVentaARechazadas(itemCola, motivo, res.status, storage);
                    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
                        console.warn('Venta offline rechazada por servidor:', res.status, mensajeApi);
                    }
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
/**
 * Mientras se escribe una fecha en el filtro: deja solo dígitos y agrega las barras
 * (ej. "17102026" -> "17/10/2026").
 */
export const formatearEntradaFecha = (texto = '') => {
    const digitos = String(texto ?? '').replace(/\D/g, '').slice(0, 8);
    if (digitos.length <= 2) return digitos;
    if (digitos.length <= 4) return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
    return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
};

/**
 * Convierte "dd/mm/aaaa" a "aaaa-mm-dd". Devuelve '' si está vacío y null si la fecha
 * está incompleta o no existe (ej. 31/02/2026).
 */
export const fechaTextoAIso = (texto = '') => {
    const limpio = String(texto ?? '').trim();
    if (!limpio) return '';
    const m = limpio.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const [, dia, mes, anio] = m;
    const fecha = new Date(Number(anio), Number(mes) - 1, Number(dia));
    if (
        fecha.getFullYear() !== Number(anio)
        || fecha.getMonth() !== Number(mes) - 1
        || fecha.getDate() !== Number(dia)
    ) {
        return null;
    }
    return `${anio}-${mes}-${dia}`;
};

/** Convierte "aaaa-mm-dd" a "dd/mm/aaaa" (o '' si no es una fecha válida). */
export const fechaIsoATexto = (iso = '') => {
    const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

export const formatearFechaLocalInput = (fecha = new Date()) => {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    if (Number.isNaN(d.getTime())) return '';
    const anio = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
};

export const ANIO_MINIMO_FILTRO_REPORTES = 2000;
export const ANIO_MAXIMO_FILTRO_REPORTES = 2100;

const parsearFechaSoloDiaLocal = (valor, esFin = false) => {
    const match = String(valor || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const anio = Number(match[1]);
    const mes = Number(match[2]) - 1;
    const dia = Number(match[3]);
    const d = esFin
        ? new Date(anio, mes, dia, 23, 59, 59, 999)
        : new Date(anio, mes, dia, 0, 0, 0, 0);
    d.setFullYear(anio);
    if (
        Number.isNaN(d.getTime()) ||
        d.getFullYear() !== anio ||
        d.getMonth() !== mes ||
        d.getDate() !== dia
    ) {
        return null;
    }
    return d.getTime();
};

/**
 * Valida que el rango [fechaDesde, fechaHasta] sea consistente (YYYY-MM-DD,
 * año entre 2000 y 2100 y desde <= hasta). Acepta fechas vacías para historial completo.
 */
export const validarRangoFechas = (fechaDesde = '', fechaHasta = '') => {
    const desde = String(fechaDesde ?? '').trim();
    const hasta = String(fechaHasta ?? '').trim();

    if (desde) {
        if (parsearFechaSoloDiaLocal(desde, false) === null) {
            return { valido: false, mensaje: 'La fecha "Desde" no tiene un formato válido.' };
        }
        const anioDesde = Number(desde.slice(0, 4));
        if (anioDesde < ANIO_MINIMO_FILTRO_REPORTES || anioDesde > ANIO_MAXIMO_FILTRO_REPORTES) {
            return {
                valido: false,
                mensaje: `El año de la fecha "Desde" debe estar entre ${ANIO_MINIMO_FILTRO_REPORTES} y ${ANIO_MAXIMO_FILTRO_REPORTES}.`,
            };
        }
    }
    if (hasta) {
        if (parsearFechaSoloDiaLocal(hasta, true) === null) {
            return { valido: false, mensaje: 'La fecha "Hasta" no tiene un formato válido.' };
        }
        const anioHasta = Number(hasta.slice(0, 4));
        if (anioHasta < ANIO_MINIMO_FILTRO_REPORTES || anioHasta > ANIO_MAXIMO_FILTRO_REPORTES) {
            return {
                valido: false,
                mensaje: `El año de la fecha "Hasta" debe estar entre ${ANIO_MINIMO_FILTRO_REPORTES} y ${ANIO_MAXIMO_FILTRO_REPORTES}.`,
            };
        }
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
 * Genera el siguiente identificador monotónico para descartar respuestas asíncronas obsoletas.
 */
export const siguienteIdCarga = (idActual = 0) => {
    const numero = Number(idActual);
    if (!Number.isFinite(numero) || numero < 0) {
        return 1;
    }
    return Math.floor(numero) + 1;
};

/**
 * Indica si una respuesta asíncrona corresponde a la carga más reciente todavía vigente.
 */
export const esCargaVigente = (idCargaRespuesta, idCargaActual) => {
    const respuesta = Number(idCargaRespuesta);
    const actual = Number(idCargaActual);
    return Number.isFinite(respuesta) && Number.isFinite(actual) && respuesta > 0 && respuesta === actual;
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
            tipoEtiqueta: v.origen === 'offline' ? 'Venta (sin internet)' : 'Venta',
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
            tipoEtiqueta: 'Venta (pendiente de envío)',
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
            tipoEtiqueta: esIngreso ? 'Insumos · Ingreso' : 'Insumos · Consumo',
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
                'No se pudo leer el texto del PDF. Probá subiéndolo de nuevo.',
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

const UNIDADES_POR_BASE_RECETA = {
    g: [
        { valor: 'g', etiqueta: 'g (Gramos)' },
        { valor: 'kg', etiqueta: 'kg (Kilogramos)' },
        { valor: 'mg', etiqueta: 'mg (Miligramos)' },
    ],
    ml: [
        { valor: 'ml', etiqueta: 'ml (Mililitros)' },
        { valor: 'l', etiqueta: 'l (Litros)' },
        { valor: 'cc', etiqueta: 'cc (Centímetros cúbicos)' },
    ],
    un: [
        { valor: 'un', etiqueta: 'un (Unidades)' },
        { valor: 'docena', etiqueta: 'docena (12 un)' },
    ],
};

const FACTORES_CONVERSION_RECETA = {
    'g->g': 1,
    'kg->g': 1000,
    'kilo->g': 1000,
    'mg->g': 0.001,
    'ml->ml': 1,
    'cc->ml': 1,
    'l->ml': 1000,
    'lt->ml': 1000,
    'litro->ml': 1000,
    'un->un': 1,
    'u->un': 1,
    'unidad->un': 1,
    'docena->un': 12,
};

/**
 * Verifica si el usuario autenticado posee un permiso granular activo.
 */
export const usuarioTienePermiso = (usuario, clavePermiso) => {
    if (!usuario || !clavePermiso) {
        return false;
    }
    const permisos = usuario.permisos;
    if (Array.isArray(permisos)) {
        if (permisos.includes(clavePermiso)) {
            return true;
        }
        // Superusuario sin PerfilUsuario emite rol DUENIO con lista de permisos vacía en JWT
        if (String(usuario.rol || '').toUpperCase() === 'DUENIO' && permisos.length === 0) {
            return true;
        }
        return false;
    }
    if (permisos && typeof permisos === 'object') {
        return Boolean(permisos[clavePermiso]);
    }
    return String(usuario.rol || '').toUpperCase() === 'DUENIO';
};

export const PERMISOS_POR_SECCION = {
    pos: ['ventas.cobrar_ticket'],
    caja: [
        'caja.abrir_turno',
        'caja.cerrar_turno',
        'caja.ver_efectivo_esperado',
        'caja.gestionar_turnos_ajenos',
    ],
    compras: [
        'compras.ver',
        'compras.registrar',
        'ia.importar_listas',
        'insumos.ver',
    ],
    recetas: ['recetas.ver'],
    finanzas: ['reportes.ver_financieros', 'reportes.ver_operativos'],
    personal: ['personal.ver'],
};

/**
 * Indica qué acciones rápidas de caja puede ver el usuario según sus permisos.
 * "Abrir turno" además se oculta mientras ya hay un turno abierto.
 */
export const accionesCajaVisiblesParaUsuario = (usuario, turnoActivo = null) => ({
    movimiento: usuarioTienePermiso(usuario, 'caja.registrar_movimiento'),
    abrirTurno: usuarioTienePermiso(usuario, 'caja.abrir_turno') && turnoActivo?.estado !== 'ABIERTO',
});

/**
 * Devuelve la lista de secciones visibles (en el orden del menú) para el usuario.
 */
export const seccionesVisiblesParaUsuario = (usuario) => {
    if (!usuario || typeof usuario !== 'object') {
        return [];
    }
    return Object.entries(PERMISOS_POR_SECCION)
        .filter(([, permisosRequeridos]) =>
            permisosRequeridos.some((clave) => usuarioTienePermiso(usuario, clave))
        )
        .map(([seccion]) => seccion);
};

/**
 * Devuelve las unidades compatibles con la unidad base de un insumo ('g', 'ml', 'un').
 */
export const obtenerUnidadesCompatiblesReceta = (unidadBase = '') => {
    const base = String(unidadBase || '').trim().toLowerCase();
    if (UNIDADES_POR_BASE_RECETA[base]) {
        return UNIDADES_POR_BASE_RECETA[base];
    }
    return [
        ...UNIDADES_POR_BASE_RECETA.g,
        ...UNIDADES_POR_BASE_RECETA.ml,
        ...UNIDADES_POR_BASE_RECETA.un,
    ];
};

/**
 * Factor multiplicador para convertir una cantidad de receta a la unidad base del insumo.
 */
export const calcularFactorConversionReceta = (unidadOrigen = '', unidadBase = '') => {
    const origen = String(unidadOrigen || '').trim().toLowerCase();
    const base = String(unidadBase || '').trim().toLowerCase();
    if (!origen || !base || origen === base) return 1;
    return FACTORES_CONVERSION_RECETA[`${origen}->${base}`] ?? 1;
};

/**
 * Mano de obra y descartables de un producto, con la misma fórmula del backend
 * (obtener_desglose_costeo_producto): mano de obra = minutos × costo por hora / 60.
 * Devuelve null si la API ocultó los costos (usuario sin recetas.ver_costos).
 */
export const calcularCostosExtraReceta = (producto) => {
    if (!producto || producto.costo_hora_mano_obra === null || producto.costo_hora_mano_obra === undefined) {
        return null;
    }
    const minutos = Math.max(Number(producto.minutos_mano_obra) || 0, 0);
    const costoHora = Number(producto.costo_hora_mano_obra) || 0;
    const descartables = Number(producto.descartables) || 0;
    const manoObra = minutos > 0 ? (minutos * costoHora) / 60 : 0;
    return { minutos, costoHora, manoObra, descartables };
};

/**
 * Crea un fetch que agrega el token vigente y, ante un 401, renueva la sesión una vez
 * y repite el pedido. Si varios pedidos vencen a la vez comparten una sola renovación
 * (el refresh rota y se invalida, así que dos renovaciones en paralelo fallarían).
 * - renovarSesion(): true si renovó, false si la sesión ya no se puede renovar.
 *   Si lanza (por ejemplo, sin red), no se cierra la sesión y se devuelve el 401 original.
 * - alVencerSesion(): se llama cuando no se pudo renovar.
 */
export const crearFetchConSesion = ({ fetchFn, obtenerToken, renovarSesion, alVencerSesion }) => {
    let renovacionEnCurso = null;

    const conToken = (opciones = {}) => {
        const headers = new Headers(opciones.headers || {});
        const token = obtenerToken();
        if (token) headers.set('Authorization', `Bearer ${token}`);
        return { ...opciones, headers };
    };

    const renovar = () => {
        if (!renovacionEnCurso) {
            renovacionEnCurso = Promise.resolve()
                .then(() => renovarSesion())
                .finally(() => {
                    renovacionEnCurso = null;
                });
        }
        return renovacionEnCurso;
    };

    const fetchConSesion = async (url, opciones = {}) => {
        const respuesta = await fetchFn(url, conToken(opciones));
        if (respuesta.status !== 401) return respuesta;

        let renovada;
        try {
            renovada = await renovar();
        } catch {
            return respuesta;
        }
        if (!renovada) {
            alVencerSesion();
            return respuesta;
        }
        return fetchFn(url, conToken(opciones));
    };

    fetchConSesion.renovar = renovar;
    return fetchConSesion;
};

/**
 * Traduce un código de estado HTTP y el mensaje de la API a un texto claro para el usuario.
 */
export const mensajeErrorParaUsuario = (status, mensajeApi = '') => {
    const codigo = Number(status);
    if (codigo === 403) {
        return 'No tenés permiso para hacer esto.';
    }
    if (codigo === 401) {
        return 'Tu sesión venció. Volvé a ingresar.';
    }
    if (codigo === 429) {
        return 'Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.';
    }
    const mensajeLimpio = typeof mensajeApi === 'string' ? mensajeApi.trim() : '';
    // Errores de negocio (4xx) traen su motivo en español; los del servidor (5xx/red) van genéricos.
    if (codigo >= 400 && codigo < 500 && mensajeLimpio) {
        return mensajeLimpio;
    }
    return 'No se pudo completar la operación. Probá de nuevo en unos minutos.';
};

/**
 * Extrae el mensaje legible desde una respuesta de error estándar { mensaje, detalles }.
 */
export const extraerMensajeErrorApi = (
    data,
    fallback = 'No se pudo completar la operación.'
) => {
    if (!data || typeof data !== 'object') return fallback;
    let detalleMsg = '';
    if (Array.isArray(data.detalles) && data.detalles.length > 0) {
        detalleMsg = String(data.detalles[0]);
    } else if (data.detalles && typeof data.detalles === 'object') {
        if (typeof data.detalles.mensaje === 'string' && data.detalles.mensaje.trim()) {
            detalleMsg = data.detalles.mensaje;
        } else {
            const primerValor = Object.values(data.detalles)[0];
            if (Array.isArray(primerValor) && primerValor.length > 0) {
                detalleMsg = String(primerValor[0]);
            } else if (typeof primerValor === 'string') {
                detalleMsg = primerValor;
            }
        }
    } else if (typeof data.detalles === 'string' && data.detalles.trim()) {
        detalleMsg = data.detalles;
    }
    return detalleMsg || data.mensaje || data.detail || fallback;
};

/**
 * Conserva únicamente los campos públicos necesarios para operar el POS en caché local,
 * descartando costos, márgenes y recetas para no exponer información sensible en el navegador.
 */
export const prepararCatalogoParaCache = (productos = []) => {
    if (!Array.isArray(productos)) {
        return [];
    }

    const limpios = [];
    for (const prod of productos) {
        if (!prod || typeof prod !== 'object') continue;
        const idNum = Number(prod.id);
        if (!Number.isInteger(idNum) || idNum <= 0) continue;

        const precioCentavos = convertirMontoACentavos(
            prod.precio_venta ?? prod.precioVenta ?? '0.00'
        );

        limpios.push({
            id: idNum,
            nombre: String(prod.nombre ?? ''),
            codigo_barras:
                prod.codigo_barras !== undefined && prod.codigo_barras !== null
                    ? String(prod.codigo_barras)
                    : null,
            precio_venta: formatearCentavosADecimal(precioCentavos),
            estado_activo:
                prod.estado_activo !== undefined ? Boolean(prod.estado_activo) : true,
        });
    }
    return limpios;
};

/**
 * Valida antes de cobrar (online u offline) que exista una carta real cargada
 * y que todos los ítems del carrito coincidan por id y precio con esa carta.
 */
export const validarCarritoContraCatalogo = (carrito = [], catalogo = []) => {
    if (!Array.isArray(catalogo) || catalogo.length === 0) {
        return {
            valido: false,
            mensaje:
                'No hay carta disponible. Conectate a internet para cargar los productos antes de vender.',
        };
    }

    if (!Array.isArray(carrito) || carrito.length === 0) {
        return {
            valido: false,
            mensaje: 'El ticket de venta está vacío.',
        };
    }

    const mapaCatalogo = new Map();
    for (const prod of catalogo) {
        if (!prod || typeof prod !== 'object') continue;
        const idNum = Number(prod.id);
        if (Number.isInteger(idNum) && idNum > 0) {
            mapaCatalogo.set(idNum, prod);
        }
    }

    if (mapaCatalogo.size === 0) {
        return {
            valido: false,
            mensaje:
                'No hay carta disponible. Conectate a internet para cargar los productos antes de vender.',
        };
    }

    for (const item of carrito) {
        const prodId = Number(item?.productoId ?? item?.producto ?? item?.producto_id);
        if (!Number.isInteger(prodId) || prodId <= 0) {
            return {
                valido: false,
                mensaje:
                    'Uno de los productos del ticket no es válido. Vacialo y volvé a cargarlo.',
            };
        }

        const prodCatalogo = mapaCatalogo.get(prodId);
        if (!prodCatalogo) {
            const nombreMostrar = item?.nombre ? `"${String(item.nombre)}"` : `#${prodId}`;
            return {
                valido: false,
                mensaje: `El producto ${nombreMostrar} no existe en la carta actual. Quitalo del ticket antes de cobrar.`,
            };
        }

        const precioCatalogoCentavos = convertirMontoACentavos(
            prodCatalogo.precio_venta ?? prodCatalogo.precioVenta
        );
        const tieneCentavos =
            item?.precioUnitarioCentavos !== undefined &&
            item?.precioUnitarioCentavos !== null &&
            Number.isFinite(Number(item.precioUnitarioCentavos));
        const precioItemCentavos = tieneCentavos
            ? Math.round(Number(item.precioUnitarioCentavos))
            : convertirMontoACentavos(
                  item?.precioUnitarioDecimal ?? item?.precio_unitario ?? item?.precio_venta
              );

        if (precioItemCentavos !== precioCatalogoCentavos) {
            const nombreMostrar = prodCatalogo.nombre || item?.nombre || `#${prodId}`;
            return {
                valido: false,
                mensaje: `El precio de "${nombreMostrar}" cambió en la carta actual. Quitalo y volvé a agregarlo antes de cobrar.`,
            };
        }
    }

    return {
        valido: true,
        mensaje: '',
    };
};

// Debe coincidir con PERMISOS_CATALOGO y ROLES_PLANTILLAS en backend-django/apps/usuarios/constantes.py
export const GRUPOS_PERMISOS_EQUIPO = [
    {
        id: 'ventas',
        titulo: 'Ventas',
        permisos: [
            { clave: 'ventas.cobrar_ticket', etiqueta: 'Cobrar tickets' },
            { clave: 'ventas.anular_ticket', etiqueta: 'Anular tickets' },
            { clave: 'ventas.aplicar_descuento', etiqueta: 'Aplicar descuentos' },
            { clave: 'ventas.ver_historial_propio', etiqueta: 'Ver sus propias ventas' },
            { clave: 'ventas.ver_historial_todos', etiqueta: 'Ver las ventas de todo el equipo' },
        ],
    },
    {
        id: 'caja',
        titulo: 'Caja',
        permisos: [
            { clave: 'caja.abrir_turno', etiqueta: 'Abrir turno de caja' },
            { clave: 'caja.cerrar_turno', etiqueta: 'Cerrar turno de caja' },
            { clave: 'caja.ver_efectivo_esperado', etiqueta: 'Ver el efectivo esperado en caja' },
            { clave: 'caja.registrar_movimiento', etiqueta: 'Registrar entradas y salidas de caja' },
            { clave: 'caja.gestionar_turnos_ajenos', etiqueta: 'Administrar turnos de otros empleados' },
        ],
    },
    {
        id: 'insumos',
        titulo: 'Insumos',
        permisos: [
            { clave: 'insumos.ver', etiqueta: 'Ver insumos y stock' },
            { clave: 'insumos.crear', etiqueta: 'Agregar insumos' },
            { clave: 'insumos.editar', etiqueta: 'Editar insumos' },
            { clave: 'insumos.eliminar', etiqueta: 'Borrar insumos' },
        ],
    },
    {
        id: 'compras',
        titulo: 'Compras',
        permisos: [
            { clave: 'compras.ver', etiqueta: 'Ver compras realizadas' },
            { clave: 'compras.registrar', etiqueta: 'Registrar compras' },
        ],
    },
    {
        id: 'recetas',
        titulo: 'Recetas y carta',
        permisos: [
            { clave: 'recetas.ver', etiqueta: 'Ver la carta y las recetas' },
            { clave: 'recetas.crear', etiqueta: 'Crear productos y recetas' },
            { clave: 'recetas.editar', etiqueta: 'Editar precios y recetas' },
            { clave: 'recetas.eliminar', etiqueta: 'Quitar ingredientes o recetas' },
            { clave: 'recetas.ver_costos', etiqueta: 'Ver costos de las recetas' },
        ],
    },
    {
        id: 'reportes',
        titulo: 'Reportes',
        permisos: [
            { clave: 'reportes.ver_financieros', etiqueta: 'Ver reportes de ganancias y dinero' },
            { clave: 'reportes.ver_operativos', etiqueta: 'Ver reportes de actividad del local' },
        ],
    },
    {
        id: 'ia',
        titulo: 'Asistente IA',
        permisos: [
            { clave: 'ia.importar_listas', etiqueta: 'Cargar listas de proveedores con IA' },
        ],
    },
    {
        id: 'personal',
        titulo: 'Equipo',
        permisos: [
            { clave: 'personal.ver', etiqueta: 'Ver la lista del equipo' },
            { clave: 'personal.crear', etiqueta: 'Agregar empleados' },
            { clave: 'personal.editar', etiqueta: 'Cambiar datos y rol de empleados' },
            { clave: 'personal.ajustar_permisos', etiqueta: 'Dar o quitar permisos' },
            { clave: 'personal.desactivar', etiqueta: 'Dar de baja y reactivar empleados' },
        ],
    },
    {
        id: 'auditoria',
        titulo: 'Registro de cambios',
        permisos: [
            { clave: 'auditoria.ver_logs', etiqueta: 'Ver el registro de cambios del equipo' },
        ],
    },
];

export const PERMISOS_CATALOGO_EQUIPO = GRUPOS_PERMISOS_EQUIPO.flatMap((grupo) =>
    grupo.permisos.map((item) => item.clave)
);

// Debe coincidir con ROLES_PLANTILLAS en backend-django/apps/usuarios/constantes.py
export const ROLES_PLANTILLAS = {
    DUENIO: Object.fromEntries(PERMISOS_CATALOGO_EQUIPO.map((clave) => [clave, true])),
    ENCARGADO: {
        'ventas.cobrar_ticket': true,
        'ventas.anular_ticket': true,
        'ventas.aplicar_descuento': true,
        'ventas.ver_historial_propio': true,
        'ventas.ver_historial_todos': true,
        'caja.abrir_turno': true,
        'caja.cerrar_turno': true,
        'caja.ver_efectivo_esperado': true,
        'caja.registrar_movimiento': true,
        'caja.gestionar_turnos_ajenos': true,
        'insumos.ver': true,
        'insumos.crear': true,
        'insumos.editar': true,
        'insumos.eliminar': false,
        'compras.ver': true,
        'compras.registrar': true,
        'recetas.ver': true,
        'recetas.crear': true,
        'recetas.editar': true,
        'recetas.eliminar': false,
        'recetas.ver_costos': true,
        'reportes.ver_financieros': false,
        'reportes.ver_operativos': true,
        'ia.importar_listas': false,
        'personal.ver': false,
        'personal.crear': false,
        'personal.editar': false,
        'personal.ajustar_permisos': false,
        'personal.desactivar': false,
        'auditoria.ver_logs': false,
    },
    CAJERO: {
        'ventas.cobrar_ticket': true,
        'ventas.anular_ticket': false,
        'ventas.aplicar_descuento': false,
        'ventas.ver_historial_propio': true,
        'ventas.ver_historial_todos': false,
        'caja.abrir_turno': true,
        'caja.cerrar_turno': true,
        'caja.ver_efectivo_esperado': false,
        'caja.registrar_movimiento': false,
        'caja.gestionar_turnos_ajenos': false,
        'insumos.ver': false,
        'insumos.crear': false,
        'insumos.editar': false,
        'insumos.eliminar': false,
        'compras.ver': false,
        'compras.registrar': false,
        'recetas.ver': false,
        'recetas.crear': false,
        'recetas.editar': false,
        'recetas.eliminar': false,
        'recetas.ver_costos': false,
        'reportes.ver_financieros': false,
        'reportes.ver_operativos': false,
        'ia.importar_listas': false,
        'personal.ver': false,
        'personal.crear': false,
        'personal.editar': false,
        'personal.ajustar_permisos': false,
        'personal.desactivar': false,
        'auditoria.ver_logs': false,
    },
};

/**
 * Devuelve una copia de la plantilla de permisos predeterminados para un rol dado.
 */
export const obtenerPlantillaRol = (rol = 'CAJERO') => {
    const claveRol = String(rol || 'CAJERO').trim().toUpperCase();
    const plantilla = ROLES_PLANTILLAS[claveRol] || ROLES_PLANTILLAS.CAJERO;
    return { ...plantilla };
};

/**
 * Construye el diccionario completo { clave: boolean } para todas las claves del catálogo
 * a partir de una lista/Set de claves marcadas o un objeto parcial de casillas.
 */
export const construirDictPermisosDesdeSeleccion = (seleccion = []) => {
    const activas = new Set();
    if (Array.isArray(seleccion) || seleccion instanceof Set) {
        for (const clave of seleccion) {
            if (typeof clave === 'string') activas.add(clave);
        }
    } else if (seleccion && typeof seleccion === 'object') {
        for (const [clave, valor] of Object.entries(seleccion)) {
            if (valor) activas.add(clave);
        }
    }
    const completo = {};
    for (const clave of PERMISOS_CATALOGO_EQUIPO) {
        completo[clave] = activas.has(clave);
    }
    return completo;
};

/**
 * Obtiene el diccionario completo de permisos iniciales de un empleado para premarcar casillas.
 */
export const obtenerPermisosInicialesEmpleado = (empleado) => {
    if (Array.isArray(empleado?.permisos_activos)) {
        return construirDictPermisosDesdeSeleccion(empleado.permisos_activos);
    }
    const base = obtenerPlantillaRol(empleado?.rol || 'CAJERO');
    if (
        empleado?.permisos &&
        typeof empleado.permisos === 'object' &&
        !Array.isArray(empleado.permisos)
    ) {
        for (const clave of PERMISOS_CATALOGO_EQUIPO) {
            if (clave in empleado.permisos) {
                base[clave] = Boolean(empleado.permisos[clave]);
            }
        }
    }
    return base;
};

/**
 * Indica qué botones globales de la pantalla Equipo & Permisos ve el usuario actual.
 */
export const accionesEquipoVisiblesParaUsuario = (usuarioActual) => ({
    agregarEmpleado: usuarioTienePermiso(usuarioActual, 'personal.crear'),
});

/**
 * Indica qué acciones ve el usuario actual sobre la tarjeta de un empleado.
 * Un usuario nunca puede darse de baja ni reactivarse a sí mismo.
 */
export const accionesEmpleadoVisiblesParaUsuario = (usuarioActual, empleado) => {
    if (!usuarioActual || !empleado) {
        return {
            permisos: false,
            cambiarRol: false,
            darDeBaja: false,
            reactivar: false,
        };
    }

    const idActual = usuarioActual.id ?? usuarioActual.user_id ?? null;
    const idEmpleado = empleado.id ?? null;
    const tieneAmbosIds =
        idActual !== null &&
        idActual !== undefined &&
        idEmpleado !== null &&
        idEmpleado !== undefined;
    const esMismoUsuario = tieneAmbosIds
        ? Number(idActual) === Number(idEmpleado)
        : Boolean(
              usuarioActual.username &&
                  empleado.username &&
                  usuarioActual.username === empleado.username
          );

    const puedeDesactivar = usuarioTienePermiso(usuarioActual, 'personal.desactivar');
    const estaActivo = empleado.is_active !== false;

    return {
        permisos: usuarioTienePermiso(usuarioActual, 'personal.ajustar_permisos'),
        cambiarRol: usuarioTienePermiso(usuarioActual, 'personal.editar'),
        darDeBaja: puedeDesactivar && estaActivo && !esMismoUsuario,
        reactivar: puedeDesactivar && !estaActivo && !esMismoUsuario,
    };
};

