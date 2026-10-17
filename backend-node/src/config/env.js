import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// El único .env vive en la raíz del repo (tres niveles arriba de src/config).
const directorioActual = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(directorioActual, '../../../.env'), quiet: true });

export const entorno = process.env.NODE_ENV || 'development';
export const puerto = Number(process.env.NODE_PORT) || 3000;
export const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/cafe_gestion';
export const djangoBaseUrl = process.env.DJANGO_BASE_URL || 'http://localhost:8000/api';
