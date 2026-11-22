import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rutaVendor = path.resolve(__dirname, '../../../web/vendor/socket.io');

describe('Cliente Socket.IO vendored (web/vendor/socket.io)', () => {
    const archivo = fs.readFileSync(path.join(rutaVendor, 'socket.io.min.js'));
    const readme = fs.readFileSync(path.join(rutaVendor, 'README.md'), 'utf8');

    it('tiene la misma versión que el servidor socket.io de backend-node', () => {
        const versionServidor = JSON.parse(
            fs.readFileSync(path.resolve(__dirname, '../../node_modules/socket.io/package.json'), 'utf8')
        ).version;
        const cabecera = archivo.subarray(0, 200).toString('utf8');
        expect(cabecera).toContain(`Socket.IO v${versionServidor}`);
    });

    it('coincide con el SHA-256 registrado en el README', () => {
        const hash = crypto.createHash('sha256').update(archivo).digest('hex');
        expect(readme).toContain(hash);
    });
});
