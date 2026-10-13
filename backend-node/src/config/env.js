import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// El único .env vive en la raíz del repo (tres niveles arriba de src/config).
const directorioActual = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(directorioActual, '../../../.env'), quiet: true });

export const entorno = process.env.NODE_ENV || 'development';
export const puerto = Number(process.env.NODE_PORT) || 3000;
