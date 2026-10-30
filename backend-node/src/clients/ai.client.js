import { aiServiceUrl } from '../config/env.js';

const UNIDADES_VALIDAS = new Set(['g', 'kg', 'mg', 'ml', 'cc', 'l', 'un', 'docena']);

/**
 * Valida que un ítem extraído por la IA contenga los campos requeridos y valores positivos.
 */
export const validarItemExtraido = (item) => {
    if (!item || typeof item !== 'object') {
        return false;
    }
    const nombre = typeof item.nombre_insumo === 'string' ? item.nombre_insumo.trim() : '';
    const unidad = typeof item.unidad === 'string' ? item.unidad.trim().toLowerCase() : '';
    const cantidadNum = Number(item.cantidad);
    const precioNum = Number(item.precio_total);

    if (!nombre || !UNIDADES_VALIDAS.has(unidad)) {
        return false;
    }
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
        return false;
    }
    if (!Number.isFinite(precioNum) || precioNum <= 0) {
        return false;
    }
    return true;
};

/**
 * Valida la estructura general devuelta por ai-service y traduce de snake_case a camelCase.
 * Lanza Error si el contrato no es válido.
 */
export const validarYNormalizarSalidaIA = (datos) => {
    if (!datos || typeof datos !== 'object' || !Array.isArray(datos.items)) {
        throw new Error('La respuesta de ai-service no contiene una estructura válida de items');
    }

    const itemsNormalizados = datos.items.map((item, indice) => {
        if (!validarItemExtraido(item)) {
            throw new Error(`El ítem en posición ${indice} no cumple el esquema de validación`);
        }
        return {
            nombreInsumo: item.nombre_insumo.trim(),
            cantidad: String(item.cantidad),
            unidad: item.unidad.trim().toLowerCase(),
            precioTotal: String(item.precio_total),
            ivaIncluido: Boolean(item.iva_incluido ?? true),
            alicuota: String(item.alicuota ?? '21.00'),
            confianza: String(item.confianza ?? '1.00'),
            textoOriginal: item.texto_original ? String(item.texto_original) : null,
        };
    });

    return {
        proveedorDetectado: datos.proveedor_detectado || null,
        envioDetectado: String(datos.envio_detectado ?? '0.00'),
        moneda: datos.moneda || 'ARS',
        items: itemsNormalizados,
        advertencias: Array.isArray(datos.advertencias) ? datos.advertencias.map(String) : [],
        versionPrompt: datos.version_prompt || 'v1',
        proveedorIa: datos.proveedor_ia || 'desconocido',
        latenciaMs: Number.isFinite(Number(datos.latencia_ms)) ? Number(datos.latencia_ms) : 0,
        contingencia: Boolean(datos.contingencia),
        mensajeContingencia: datos.mensaje_contingencia || null,
    };
};

/**
 * Consume POST /v1/extraer-precios de ai-service con timeout acotado y degradación elegante.
 */
export const extraerPreciosIA = async (
    { textoLista, proveedorNombre = null, versionPrompt = 'v1' },
    timeoutMs = 12000
) => {
    const inicio = Date.now();
    try {
        const respuesta = await fetch(`${aiServiceUrl}/v1/extraer-precios`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                texto_lista: textoLista,
                proveedor_nombre: proveedorNombre,
                version_prompt: versionPrompt,
            }),
            signal: AbortSignal.timeout(timeoutMs),
        });

        if (!respuesta.ok) {
            throw new Error(`ai-service respondió con estado HTTP ${respuesta.status}`);
        }

        const datosCrudos = await respuesta.json();
        return validarYNormalizarSalidaIA(datosCrudos);
    } catch (error) {
        const latenciaMs = Math.max(0, Date.now() - inicio);
        return {
            proveedorDetectado: proveedorNombre || null,
            envioDetectado: '0.00',
            moneda: 'ARS',
            items: [],
            advertencias: [error.message],
            versionPrompt,
            proveedorIa: 'contingencia',
            latenciaMs,
            contingencia: true,
            mensajeContingencia:
                'No se pudo procesar la lista con el servicio de IA. Puede cargar los precios de forma manual o por CSV.',
            error: error.message,
        };
    }
};
