import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// El único .env vive en la raíz del repo (tres niveles arriba de src/config).
const directorioActual = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(directorioActual, '../../../.env'), quiet: true });

export const entorno = process.env.NODE_ENV || 'development';
export const puerto = Number(process.env.NODE_PORT) || 3000;
export const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/cafe_gestion';
export const djangoBaseUrl = process.env.DJANGO_BASE_URL || 'http://localhost:8000/api';

/**
 * Obtiene la clave pública RSA para validación de tokens JWT (RS256).
 * Prioridad de resolución:
 * 1. process.env.JWT_PUBLIC_KEY (contenido directo en formato PEM)
 * 2. process.env.JWT_PUBLIC_KEY_PATH (ruta específica a archivo .pem)
 * 3. Fallback a rutas estándar conocidas (config/keys/public.pem en raíz, backend-node o backend-django)
 * Retorna la clave en string o null si no se encuentra disponible.
 */
export const obtenerClavePublicaJwt = () => {
    const claveDirecta = process.env.JWT_PUBLIC_KEY;
    if (claveDirecta && claveDirecta.trim().length > 0) {
        return claveDirecta.replace(/\\n/g, '\n').trim();
    }

    if (process.env.JWT_PUBLIC_KEY_PATH) {
        const rutaConfigurada = process.env.JWT_PUBLIC_KEY_PATH;
        const posiblesRutas = [
            path.isAbsolute(rutaConfigurada) ? rutaConfigurada : null,
            path.resolve(directorioActual, '../../../', rutaConfigurada),
            path.resolve(directorioActual, '../../', rutaConfigurada),
            path.resolve(process.cwd(), rutaConfigurada),
        ].filter(Boolean);

        for (const ruta of posiblesRutas) {
            try {
                if (fs.existsSync(ruta)) {
                    const contenido = fs.readFileSync(ruta, 'utf8').trim();
                    if (contenido.length > 0) {
                        return contenido;
                    }
                }
            } catch {
                // Continuar si hay error de lectura
            }
        }
        return null;
    }

    // Si no se configuró JWT_PUBLIC_KEY ni JWT_PUBLIC_KEY_PATH, probar rutas por defecto
    const rutasDefault = [
        path.resolve(directorioActual, '../../../config/keys/public.pem'),
        path.resolve(directorioActual, '../../config/keys/public.pem'),
        path.resolve(directorioActual, '../../../backend-django/config/keys/public.pem'),
        path.resolve(process.cwd(), 'config/keys/public.pem'),
    ];

    for (const ruta of rutasDefault) {
        try {
            if (fs.existsSync(ruta)) {
                const contenido = fs.readFileSync(ruta, 'utf8').trim();
                if (contenido.length > 0) {
                    return contenido;
                }
            }
        } catch {
            // Continuar con la siguiente opción si hay error de lectura
        }
    }

    return null;
};

export const jwtPublicKey = obtenerClavePublicaJwt();
