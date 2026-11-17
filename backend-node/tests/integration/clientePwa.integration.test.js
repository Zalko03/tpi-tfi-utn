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
        expect(res.text).toContain('filtro-fecha-desde');
        expect(res.text).toContain('filtro-fecha-hasta');
        expect(res.text).toContain('tabla-trazabilidad-reportes');
        expect(res.text).toContain('ia-alerta-contingencia');
        expect(res.text).toContain('Cargar planilla del proveedor');
        expect(res.text).toContain('Vista previa');
        expect(res.text).toContain('¿No podés conectarte?');
        expect(res.text).not.toContain('input-token-jwt');
        expect(res.text).toContain('btn-csv-confirmar-directo');
        expect(res.text).toContain('btn-csv-desde-texto');
        expect(res.text).toContain('btn-modal-nuevo-producto');
        expect(res.text).toContain('modal-nuevo-producto');
        expect(res.text).toContain('modal-editar-precio-producto');
        expect(res.text).toContain('form-agregar-receta-item');
        expect(res.text).toContain('archivo-lista-ia');
        expect(res.text).toContain('/app/vendor/pdfjs/pdf.min.js');
        expect(res.text).toContain('/app/vendor/sheetjs/xlsx.full.min.js');
        expect(res.text).toContain('/app/vendor/mammoth/mammoth.browser.min.js');
        expect(res.text).not.toMatch(/https?:\/\/[^"']*(?:pdfjs|sheetjs|xlsx|mammoth)|cdnjs|unpkg|jsdelivr/i);
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
        const [
            resSw,
            resCss,
            resAppJs,
            resLogicaJs,
            resPdfJs,
            resPdfWorker,
            resSheetJs,
            resMammoth,
        ] = await Promise.all([
            request(app).get('/app/sw.js'),
            request(app).get('/app/css/estilos.css'),
            request(app).get('/app/js/app.js'),
            request(app).get('/app/js/logicaPwa.js'),
            request(app).get('/app/vendor/pdfjs/pdf.min.js'),
            request(app).get('/app/vendor/pdfjs/pdf.worker.min.js'),
            request(app).get('/app/vendor/sheetjs/xlsx.full.min.js'),
            request(app).get('/app/vendor/mammoth/mammoth.browser.min.js'),
        ]);

        expect(resSw.status).toBe(200);
        expect(resSw.text).toContain('cafe-gestion-pwa-v2');
        expect(resSw.text).toContain('/app/vendor/pdfjs/pdf.min.js');
        expect(resSw.text).toContain('/app/vendor/pdfjs/pdf.worker.min.js');
        expect(resSw.text).toContain('/app/vendor/sheetjs/xlsx.full.min.js');
        expect(resSw.text).toContain('/app/vendor/mammoth/mammoth.browser.min.js');

        expect(resPdfJs.status).toBe(200);
        expect(resPdfWorker.status).toBe(200);
        expect(resSheetJs.status).toBe(200);
        expect(resMammoth.status).toBe(200);

        expect(resCss.status).toBe(200);
        expect(resCss.text).toContain('.grilla-modulos');

        expect(resAppJs.status).toBe(200);
        expect(resAppJs.text).toContain('conectarSocketTiempoReal');
        expect(resAppJs.text).toContain('evaluarEstadoImportacionIA');
        expect(resAppJs.text).toContain('evaluarEstadoResumenIA');
        expect(resAppJs.text).toContain('evaluarTextoComoCsvDirecto');
        expect(resAppJs.text).toContain('extraerTextoDePdfBuffer');
        expect(resAppJs.text).toContain('btn-contingencia-usar-csv-directo');
        expect(resAppJs.text).toContain('/api/compras/confirmar-importacion/');
        expect(resAppJs.text).toContain('/api/productos/');
        expect(resAppJs.text).toContain('/api/recetas-items/');
        expect(resAppJs.text).toContain('usuarioTienePermiso');
        expect(resAppJs.text).toContain('Cobro bloqueado: no hay carta cargada.');
        expect(resAppJs.text).not.toContain('extraerItemsDesdeTextoLista');

        expect(resLogicaJs.status).toBe(200);
        expect(resLogicaJs.text).toContain('convertirMontoACentavos');
        expect(resLogicaJs.text).toContain('No se pudo usar la IA, revisá la configuración');
        expect(resLogicaJs.text).toContain('El PDF parece ser una imagen escaneada sin texto seleccionable');
    });
});
