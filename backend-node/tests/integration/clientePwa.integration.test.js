import request from 'supertest';
import app from '../../app.js';

describe('Integración: Cliente Mínimo PWA en /app (T3.6)', () => {
    it('sirve index.html con los tres módulos requeridos: Tablero, Importación IA y Caja Rápida', async () => {
        const res = await request(app).get('/app/index.html');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.text).toContain('Tablero en Tiempo Real');
        expect(res.text).toContain('Importación de Precios con IA');
        expect(res.text).toContain('Caja Rápida y Turno');
        expect(res.text).toContain('/app/manifest.webmanifest');
        expect(res.text).toContain('/app/js/app.js');
    });

    it('sirve manifest.webmanifest válido para instalación como PWA en red local (LAN)', async () => {
        const res = await request(app).get('/app/manifest.webmanifest');

        expect(res.status).toBe(200);
        const manifest = JSON.parse(res.text);
        expect(manifest).toMatchObject({
            short_name: 'Café Gestión',
            display: 'standalone',
            start_url: '/app/index.html',
            scope: '/app/',
        });
        expect(Array.isArray(manifest.icons)).toBe(true);
        expect(manifest.icons.length).toBeGreaterThanOrEqual(1);
    });

    it('sirve el Service Worker (sw.js), la hoja de estilos y los módulos JS del cliente PWA', async () => {
        const [resSw, resCss, resAppJs, resLogicaJs] = await Promise.all([
            request(app).get('/app/sw.js'),
            request(app).get('/app/css/estilos.css'),
            request(app).get('/app/js/app.js'),
            request(app).get('/app/js/logicaPwa.js'),
        ]);

        expect(resSw.status).toBe(200);
        expect(resSw.text).toContain('cafe-gestion-pwa-v1');

        expect(resCss.status).toBe(200);
        expect(resCss.text).toContain('.grilla-modulos');

        expect(resAppJs.status).toBe(200);
        expect(resAppJs.text).toContain('conectarSocketTiempoReal');

        expect(resLogicaJs.status).toBe(200);
        expect(resLogicaJs.text).toContain('convertirMontoACentavos');
    });
});
