/**
 * Configuración pública del sitio web (carta digital y endpoints).
 * Para ocultar la sección del mapa en la carta, dejá latitud o longitud en null.
 */
window.__SAPORI_CONFIG__ = {
    ...(window.__SAPORI_CONFIG__ || {}),
    ubicacionLocal: {
        // Dirección real del local (Google Maps: "Sapori Café, Mariano I. Loza 475, Goya").
        // Coordenadas de OpenStreetMap para el número 475.
        direccion: 'Mariano I. Loza 475, Goya, Corrientes',
        latitud: -29.1437,
        longitud: -59.264,
    },
};
