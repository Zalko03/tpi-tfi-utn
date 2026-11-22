import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 5173;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    let urlPath = decodeURIComponent(req.url.split('?')[0]);

    if (urlPath === '/' || urlPath === '/app' || urlPath === '/app/') {
        urlPath = '/index.html';
    } else if (urlPath.startsWith('/app/')) {
        urlPath = urlPath.slice(4);
    }

    const filePath = path.join(__dirname, urlPath);

    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Acceso denegado');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            const indexPath = path.join(__dirname, 'index.html');
            fs.readFile(indexPath, (readErr, content) => {
                if (readErr) {
                    res.writeHead(404);
                    res.end('No encontrado');
                } else {
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(content);
                }
            });
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
        });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Sapori Stock Web] Servidor Front-end disponible en: http://localhost:${PORT}`);
});
