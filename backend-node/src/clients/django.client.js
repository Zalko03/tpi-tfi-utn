import { djangoBaseUrl } from '../config/env.js';

export const obtenerProductoDjango = async (productoId, timeoutMs = 3000) => {
    try {
        const respuesta = await fetch(`${djangoBaseUrl}/productos/${productoId}/`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(timeoutMs),
        });

        if (!respuesta.ok) {
            if (respuesta.status === 404) {
                return null;
            }
            throw new Error(`Django respondió con estado HTTP ${respuesta.status}`);
        }

        const datos = await respuesta.json();
        return datos;
    } catch (error) {
        // En caso de timeout o indisponibilidad, registramos el evento y retornamos estado degradado
        // eslint-disable-next-line no-console
        console.warn(`[django.client] Falló consulta de producto ${productoId}: ${error.message}`);
        return {
            degradado: true,
            id: Number(productoId),
            mensaje: 'No se pudo comunicar con el núcleo transaccional Django',
            error: error.message,
        };
    }
};

/**
 * Traduce la respuesta de confirmación de compras de Django (snake_case)
 * al contrato interno de Node (camelCase) en este único punto de integración.
 */
export const normalizarRespuestaConfirmacionDjango = (datos) => {
    const comprasCreadas = Array.isArray(datos?.compras_creadas)
        ? datos.compras_creadas.map((c) => ({
              compraId: Number(c.compra_id),
              insumoId: Number(c.insumo_id),
              insumoNombre: c.insumo_nombre,
              unidadBase: c.unidad_base,
              cantidad: String(c.cantidad),
              unidad: c.unidad,
              precioTotal: String(c.precio_total),
              envioProrrateado: String(c.envio_prorrateado ?? '0.00'),
              ivaIncluido: Boolean(c.iva_incluido ?? true),
              alicuota: String(c.alicuota ?? '21.00'),
              costoUnitarioAnterior: String(c.costo_unitario_anterior ?? '0.0000'),
              costoUnitarioCalculado: String(c.costo_unitario_calculado),
          }))
        : [];

    const productosRecalculados = Array.isArray(datos?.productos_recalculados)
        ? datos.productos_recalculados.map((p) => ({
              productoId: Number(p.producto_id),
              insumoId: p.insumo_id ? Number(p.insumo_id) : undefined,
              nombre: p.nombre,
              costoAnterior: String(p.costo_anterior),
              costoNuevo: String(p.costo_nuevo),
              margenNuevo: String(p.margen_nuevo),
              costoManoObra: String(p.costo_mano_obra ?? '0.0000'),
              costoDescartables: String(p.costo_descartables ?? '0.0000'),
              desgloseInsumos: Array.isArray(p.desglose_insumos)
                  ? p.desglose_insumos.map((d) => ({
                        insumoId: Number(d.insumo_id),
                        nombre: d.nombre,
                        cantidad: String(d.cantidad),
                        unidad: d.unidad,
                        costoUnitario: String(d.costo_unitario),
                        costoLinea: String(d.costo_linea),
                    }))
                  : [],
          }))
        : [];

    return {
        proveedorId: datos?.proveedor_id ? Number(datos.proveedor_id) : null,
        proveedorNombre: datos?.proveedor_nombre || null,
        envioTotal: String(datos?.envio_total ?? '0.00'),
        comprasCreadas,
        productosRecalculados,
    };
};

/**
 * Envía el lote de compras aprobado por el usuario al núcleo transaccional Django
 * (POST /api/compras/confirmar-importacion/) reenviando el token JWT RS256.
 */
export const confirmarImportacionComprasDjango = async (
    { proveedorId = null, proveedorNombre = null, envio = '0.00', items = [] },
    tokenJwt = null,
    timeoutMs = 5000
) => {
    const cabeceras = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
    if (tokenJwt) {
        cabeceras.Authorization = tokenJwt.startsWith('Bearer ')
            ? tokenJwt
            : `Bearer ${tokenJwt}`;
    }

    const cuerpoDjango = {
        ...(proveedorId ? { proveedor_id: Number(proveedorId) } : {}),
        ...(proveedorNombre ? { proveedor_nombre: String(proveedorNombre).trim() } : {}),
        envio: String(envio ?? '0.00'),
        items: items.map((item) => ({
            ...(item.insumoId ? { insumo_id: Number(item.insumoId) } : {}),
            ...(item.nombreInsumo ? { nombre_insumo: String(item.nombreInsumo).trim() } : {}),
            cantidad: String(item.cantidad),
            unidad: String(item.unidad).trim().toLowerCase(),
            precio_total: String(item.precioTotal),
            iva_incluido: Boolean(item.ivaIncluido ?? true),
            alicuota: String(item.alicuota ?? '21.00'),
            ...(item.unidadBase ? { unidad_base: item.unidadBase } : {}),
        })),
    };

    let respuesta;
    try {
        respuesta = await fetch(`${djangoBaseUrl}/compras/confirmar-importacion/`, {
            method: 'POST',
            headers: cabeceras,
            body: JSON.stringify(cuerpoDjango),
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (errorRed) {
        const error = new Error(
            'No se pudo comunicar con el núcleo transaccional Django para registrar la compra'
        );
        error.statusCode = 502;
        error.detalles = { causa: errorRed.message };
        throw error;
    }

    let datos = null;
    try {
        datos = await respuesta.json();
    } catch {
        datos = null;
    }

    if (!respuesta.ok) {
        const mensajeDjango =
            datos?.mensaje ||
            `El núcleo transaccional Django rechazó la operación (HTTP ${respuesta.status})`;
        const error = new Error(mensajeDjango);
        error.statusCode =
            respuesta.status >= 400 && respuesta.status < 500 ? respuesta.status : 502;
        error.detalles = datos?.detalles ?? null;
        throw error;
    }

    return normalizarRespuestaConfirmacionDjango(datos);
};
