const NOMBRE_CACHE = 'cafe-gestion-pwa-v1';
const RECURSOS_CASCARA = [
    '/app/',
    '/app/index.html',
    '/app/manifest.webmanifest',
    '/app/css/estilos.css',
    '/app/js/logicaPwa.js',
    '/app/js/app.js',
];

self.addEventListener('install', (evento) => {
    evento.waitUntil(
        caches
            .open(NOMBRE_CACHE)
            .then((cache) => cache.addAll(RECURSOS_CASCARA))
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
            .catch(() => caches.match(evento.request))
    );
});
