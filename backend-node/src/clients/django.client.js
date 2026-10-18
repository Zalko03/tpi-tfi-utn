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
