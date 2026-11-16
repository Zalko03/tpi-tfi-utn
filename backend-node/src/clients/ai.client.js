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

    const esContingencia =
        Boolean(datos.contingencia) || datos.proveedor_ia === 'contingencia';

    const itemsNormalizados = esContingencia
        ? []
        : datos.items.map((item, indice) => {
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

    const advertencias = Array.isArray(datos.advertencias) ? datos.advertencias.map(String) : [];

    return {
        proveedorDetectado: datos.proveedor_detectado || null,
        envioDetectado: esContingencia ? '0.00' : String(datos.envio_detectado ?? '0.00'),
        moneda: datos.moneda || 'ARS',
        items: itemsNormalizados,
        advertencias,
        versionPrompt: datos.version_prompt || 'v1',
        proveedorIa: datos.proveedor_ia || (esContingencia ? 'contingencia' : 'desconocido'),
        latenciaMs: Number.isFinite(Number(datos.latencia_ms)) ? Number(datos.latencia_ms) : 0,
        contingencia: esContingencia,
        mensajeContingencia:
            datos.mensaje_contingencia ||
            (esContingencia
                ? 'No se pudo usar la IA, revisá la configuración. Puede cargar los precios de forma manual o por CSV.'
                : null),
    };
};

/**
 * Consume POST /v1/extraer-precios de ai-service con timeout acotado y degradación elegante.
 */
export const extraerPreciosIA = async (
    { textoLista, proveedorNombre = null, versionPrompt = 'v1' },
    timeoutMs = 12000,
    correlationId = null
) => {
    const inicio = Date.now();
    try {
        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };
        if (correlationId) {
            headers['X-Request-ID'] = correlationId;
        }

        const respuesta = await fetch(`${aiServiceUrl}/v1/extraer-precios`, {
            method: 'POST',
            headers,
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
                'No se pudo usar la IA, revisá la configuración. Puede cargar los precios de forma manual o por CSV.',
            error: error.message,
        };
    }
};

/**
 * Consume POST /v1/resumen-semanal de ai-service para consultoría de métricas y rendimiento.
 */
export const generarResumenSemanalIA = async (
    payload,
    timeoutMs = 12000,
    correlationId = null
) => {
    const inicio = Date.now();
    try {
        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };
        if (correlationId) {
            headers['X-Request-ID'] = correlationId;
        }

        const respuesta = await fetch(`${aiServiceUrl}/v1/resumen-semanal`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(timeoutMs),
        });

        if (!respuesta.ok) {
            throw new Error(`ai-service respondió con estado HTTP ${respuesta.status}`);
        }

        const datos = await respuesta.json();
        const esContingencia =
            Boolean(datos?.contingencia) || datos?.proveedor_ia === 'contingencia';
        const advertencias = Array.isArray(datos?.advertencias)
            ? datos.advertencias.map(String)
            : esContingencia && Array.isArray(datos?.alertas_costos)
              ? datos.alertas_costos.map(String)
              : [];

        return {
            ...datos,
            resumen_ejecutivo: esContingencia ? null : (datos?.resumen_ejecutivo ?? null),
            contingencia: esContingencia,
            proveedor_ia: datos?.proveedor_ia || (esContingencia ? 'contingencia' : 'desconocido'),
            mensaje_contingencia:
                datos?.mensaje_contingencia ||
                (esContingencia ? 'No se pudo usar la IA, revisá la configuración.' : null),
            advertencias,
        };
    } catch (error) {
        const latenciaMs = Math.max(0, Date.now() - inicio);
        return {
            resumen_ejecutivo: null,
            productos_destacados: [],
            sugerencias_rotacion: [],
            alertas_costos: [`Aviso técnico: ${error.message}`],
            advertencias: [error.message],
            version_prompt: payload?.version_prompt || 'v1',
            proveedor_ia: 'contingencia',
            latencia_ms: latenciaMs,
            contingencia: true,
            mensaje_contingencia: 'No se pudo usar la IA, revisá la configuración.',
        };
    }
};
