import vm from 'vm';
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
        expect(res.text).toContain('btn-qr-carta-publica');
        expect(res.text).toContain('modal-qr-carta');
        expect(res.text).toContain('btn-imprimir-qr-carta');
        expect(res.text).toContain('btn-descargar-qr-svg');
        expect(res.text).toContain('modal-nuevo-producto');
        expect(res.text).toContain('modal-editar-precio-producto');
        expect(res.text).toContain('form-agregar-receta-item');
        expect(res.text).toContain('btn-modal-nuevo-empleado');
        expect(res.text).toContain('modal-nuevo-empleado');
        expect(res.text).toContain('modal-baja-empleado');
        expect(res.text).toContain('select-permisos-rol');
        expect(res.text).toContain('Siempre queda un dueño activo');
        expect(res.text).toContain('vista-configuracion');
        expect(res.text).toContain('form-configuracion-fiscal');
        expect(res.text).toContain('aviso-condicion-fiscal-compras');
        expect(res.text).toContain('aviso-condicion-fiscal-recetas');
        expect(res.text).toContain('panel-sugerencia-competencia');
        expect(res.text).toContain('form-sugerencia-producto');
        expect(res.text).toContain('form-agregar-competencia');
        expect(res.text).toContain('btn-usar-precio-sugerido');
        expect(res.text).toContain('check-compra-iva-incluido');
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

    it('sirve la página pública carta.html sin autenticación en /app/carta.html y /carta.html', async () => {
        const [resAppCarta, resRaizCarta, resCartaJs, resConfigJs] = await Promise.all([
            request(app).get('/app/carta.html'),
            request(app).get('/carta.html'),
            request(app).get('/app/js/carta.js'),
            request(app).get('/app/js/config.js'),
        ]);

        expect(resAppCarta.status).toBe(200);
        expect(resAppCarta.headers['content-type']).toMatch(/text\/html/);
        expect(resAppCarta.headers['content-security-policy']).toContain(
            'frame-src https://www.openstreetmap.org'
        );
        expect(resAppCarta.text).toContain('Carta Digital');
        expect(resAppCarta.text).toContain('carta-buscador');
        expect(resAppCarta.text).toContain('carta-lista-productos');
        expect(resAppCarta.text).toContain('carta-donde-estamos');
        expect(resAppCarta.text).toContain('Dónde estamos');
        expect(resAppCarta.text).toContain('Abrir en el mapa');
        expect(resAppCarta.text).toContain('(se abre en una pestaña nueva)');
        expect(resAppCarta.text).toContain('carta-ubicacion-iframe');
        expect(resAppCarta.text).toContain('referrerpolicy="strict-origin-when-cross-origin"');
        expect(resAppCarta.text).toContain('sandbox="allow-scripts allow-same-origin"');
        expect(resAppCarta.text).toContain('js/config.js');
        expect(resAppCarta.text).toContain('js/carta.js');
        expect(resAppCarta.text).not.toContain('input-token-jwt');

        expect(resRaizCarta.status).toBe(200);
        expect(resRaizCarta.headers['content-type']).toMatch(/text\/html/);
        expect(resRaizCarta.headers['content-security-policy']).toContain(
            'frame-src https://www.openstreetmap.org'
        );
        expect(resRaizCarta.text).toContain('Carta Digital');
        expect(resRaizCarta.text).toContain('carta-donde-estamos');

        expect(resCartaJs.status).toBe(200);
        expect(resCartaJs.text).toContain('/api/carta-publica/');
        expect(resCartaJs.text).toContain('renderizarUbicacionCarta');

        expect(resConfigJs.status).toBe(200);
        expect(resConfigJs.text).toContain('ubicacionLocal');
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
        const moduloSw = { exports: {} };
        vm.runInNewContext(resSw.text, { URL, module: moduloSw, exports: moduloSw.exports });
        const { debeIgnorarPeticionSw, NOMBRE_CACHE } = moduloSw.exports;

        expect(NOMBRE_CACHE).toBe('cafe-gestion-pwa-v4');
        expect(typeof debeIgnorarPeticionSw).toBe('function');
        expect(
            debeIgnorarPeticionSw(
                'https://cafe.local/app/carta.html',
                'document',
                'https://cafe.local'
            )
        ).toBe(false);
        expect(
            debeIgnorarPeticionSw(
                'https://cdn-externo.example/lib.js',
                'script',
                'https://cafe.local'
            )
        ).toBe(true);
        expect(
            debeIgnorarPeticionSw(
                'https://cafe.local/embed.html',
                'iframe',
                'https://cafe.local'
            )
        ).toBe(true);
        expect(
            debeIgnorarPeticionSw(
                'https://www.openstreetmap.org/export/embed.html?layer=mapnik',
                'document',
                'https://cafe.local'
            )
        ).toBe(true);

        expect(resSw.text).toContain('/app/carta.html');
        expect(resSw.text).toContain('/app/js/config.js');
        expect(resSw.text).toContain('/app/js/carta.js');
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
