const NOMBRE_CACHE = 'cafe-gestion-pwa-v4';
const RECURSOS_CASCARA = [
    '/app/',
    '/app/index.html',
    '/app/carta.html',
    '/app/manifest.webmanifest',
    '/app/css/estilos.css',
    '/app/js/logicaPwa.js',
    '/app/js/app.js',
    '/app/js/config.js',
    '/app/js/carta.js',
    '/app/vendor/pdfjs/pdf.min.js',
    '/app/vendor/pdfjs/pdf.worker.min.js',
    '/app/vendor/sheetjs/xlsx.full.min.js',
    '/app/vendor/mammoth/mammoth.browser.min.js',
    '/',
    '/index.html',
    '/carta.html',
    '/manifest.webmanifest',
    '/css/estilos.css',
    '/js/logicaPwa.js',
    '/js/app.js',
    '/js/config.js',
    '/js/carta.js',
    '/vendor/pdfjs/pdf.min.js',
    '/vendor/pdfjs/pdf.worker.min.js',
    '/vendor/sheetjs/xlsx.full.min.js',
    '/vendor/mammoth/mammoth.browser.min.js',
];

/**
 * Determina si una petición debe ser ignorada por el Service Worker (no interceptar ni cachear).
 * Se ignoran peticiones de otros orígenes, destinos 'iframe' y URLs de OpenStreetMap.
 */
function debeIgnorarPeticionSw(url, destino = '', origen = '') {
    if (!url) {
        return true;
    }

    let urlObj;
    try {
        urlObj = url instanceof URL ? url : new URL(String(url), origen || undefined);
    } catch {
        return true;
    }

    const origenNormalizado = typeof origen === 'string' ? origen : '';
    const hostname = urlObj.hostname.toLowerCase();

    if (origenNormalizado && urlObj.origin !== origenNormalizado) {
        return true;
    }

    if (destino === 'iframe') {
        return true;
    }

    if (hostname === 'openstreetmap.org' || hostname.endsWith('.openstreetmap.org')) {
        return true;
    }

    return false;
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
    self.addEventListener('install', (evento) => {
        evento.waitUntil(
            caches
                .open(NOMBRE_CACHE)
                .then(async (cache) => {
                    await Promise.allSettled(RECURSOS_CASCARA.map((url) => cache.add(url)));
                })
                .then(() => self.skipWaiting())
        );
    });

    self.addEventListener('activate', (evento) => {
        evento.waitUntil(
            caches
                .keys()
                .then((claves) =>
                    Promise.all(
                        claves
                            .filter((clave) => clave !== NOMBRE_CACHE)
                            .map((claveAntigua) => caches.delete(claveAntigua))
                    )
                )
                .then(() => self.clients.claim())
        );
    });

    self.addEventListener('fetch', (evento) => {
        const url = new URL(evento.request.url);
        const origenPropio = self.location ? self.location.origin : '';

        // Nunca interceptar ni cachear iframes ni peticiones externas (ej. mapa de OpenStreetMap)
        if (debeIgnorarPeticionSw(url, evento.request.destination, origenPropio)) {
            return;
        }

        // Las peticiones a APIs o WebSockets nunca se sirven desde caché estática
        if (
            evento.request.method !== 'GET' ||
            url.pathname.startsWith('/api/') ||
            url.pathname.startsWith('/importaciones') ||
            url.pathname.startsWith('/socket.io/') ||
            url.pathname.startsWith('/health')
        ) {
            return;
        }

        // Estrategia Network-First con fallback a caché para recursos de la interfaz PWA
        evento.respondWith(
            fetch(evento.request)
                .then((respuestaRed) => {
                    if (respuestaRed && respuestaRed.status === 200) {
                        const copia = respuestaRed.clone();
                        caches.open(NOMBRE_CACHE).then((cache) => cache.put(evento.request, copia));
                    }
                    return respuestaRed;
                })
                .catch(async () => {
                    const directa = await caches.match(evento.request);
                    if (directa) return directa;

                    if (evento.request.mode === 'navigate') {
                        if (url.pathname.endsWith('/carta.html')) {
                            return (
                                (await caches.match('/app/carta.html')) ||
                                (await caches.match('/carta.html'))
                            );
                        }
                        return (
                            (await caches.match('/app/index.html')) ||
                            (await caches.match('/index.html'))
                        );
                    }
                    return directa;
                })
        );
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { debeIgnorarPeticionSw, NOMBRE_CACHE };
}
