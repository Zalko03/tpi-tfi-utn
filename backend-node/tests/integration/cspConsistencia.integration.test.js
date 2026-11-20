import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import app from '../../app.js';

// La web se sirve desde tres lugares (Node /app, nginx de Docker y Vercel) y cada uno declara su CSP.
// Este test las compara para que un cambio en una no deje a las otras rompiendo fuentes, mapa o API.
const raizRepo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const aDirectivas = (csp) =>
    Object.fromEntries(
        csp
            .split(';')
            .map((parte) => parte.trim().split(/\s+/))
            .filter((tokens) => tokens[0])
            .map(([nombre, ...valores]) => [nombre, new Set(valores)])
    );

const cspVercel = () => {
    const config = JSON.parse(readFileSync(join(raizRepo, 'vercel.json'), 'utf8'));
    const cabeceras = config.headers.flatMap((regla) => regla.headers);
    return cabeceras.find((c) => c.key === 'Content-Security-Policy').value;
};

const cspNginx = () => {
    const texto = readFileSync(join(raizRepo, 'web', 'nginx.conf'), 'utf8');
    return texto.match(/Content-Security-Policy\s+"([^"]+)"/)[1];
};

const cspNode = async () => {
    const res = await request(app).get('/health');
    return res.headers['content-security-policy'];
};

const DIRECTIVAS_COMUNES = ['script-src', 'style-src', 'font-src', 'img-src', 'frame-src', 'connect-src'];

describe('Consistencia de la Content-Security-Policy de la web', () => {
    it('Vercel, nginx y Node permiten Google Fonts y el mapa de OpenStreetMap', async () => {
        for (const csp of [cspVercel(), cspNginx(), await cspNode()]) {
            const d = aDirectivas(csp);
            expect(d['style-src'].has('https://fonts.googleapis.com')).toBe(true);
            expect(d['font-src'].has('https://fonts.gstatic.com')).toBe(true);
            expect(d['frame-src'].has('https://www.openstreetmap.org')).toBe(true);
            expect([...d['script-src']]).toEqual(["'self'"]);
        }
    });

    it('ninguna CSP usa comodines', async () => {
        for (const csp of [cspVercel(), cspNginx(), await cspNode()]) {
            for (const valores of Object.values(aDirectivas(csp))) {
                for (const valor of valores) {
                    expect(['*', 'https:', 'http:', 'wss:', 'ws:']).not.toContain(valor);
                }
            }
        }
    });

    it('Vercel y nginx declaran exactamente las mismas directivas', () => {
        const vercel = aDirectivas(cspVercel());
        const nginx = aDirectivas(cspNginx());
        expect(Object.keys(nginx).sort()).toEqual(Object.keys(vercel).sort());
        for (const nombre of Object.keys(vercel)) {
            expect([...nginx[nombre]].sort()).toEqual([...vercel[nombre]].sort());
        }
    });

    it('Node coincide con la web en las directivas que importan para la interfaz', async () => {
        const vercel = aDirectivas(cspVercel());
        const node = aDirectivas(await cspNode());
        for (const nombre of DIRECTIVAS_COMUNES) {
            expect([...node[nombre]].sort()).toEqual([...vercel[nombre]].sort());
        }
    });
});
