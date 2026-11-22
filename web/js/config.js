/**
 * Configuración pública del sitio web (carta digital y endpoints).
 * Para ocultar la sección del mapa en la carta, dejá latitud o longitud en null.
 */
window.__SAPORI_CONFIG__ = {
    ...(window.__SAPORI_CONFIG__ || {}),
    // Backends publicados en Render (modo nube). Si Render asigna otros nombres, cambialos acá
    // y en la CSP: vercel.json, web/nginx.conf y backend-node/app.js (connect-src, con https y wss).
    urlsNube: {
        django: 'https://sapori-backend-django.onrender.com',
        node: 'https://sapori-backend-node.onrender.com',
    },
    ubicacionLocal: {
        // Dirección real del local (Google Maps: "Sapori Café, Mariano I. Loza 475, Goya").
        // Coordenadas de OpenStreetMap para el número 475.
        direccion: 'Mariano I. Loza 475, Goya, Corrientes',
        latitud: -29.1437,
        longitud: -59.264,
    },
};
