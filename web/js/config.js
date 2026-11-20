/**
 * Configuración pública del sitio web (carta digital y endpoints).
 * Para ocultar la sección del mapa en la carta, dejá latitud o longitud en null.
 */
window.__SAPORI_CONFIG__ = {
    ...(window.__SAPORI_CONFIG__ || {}),
    ubicacionLocal: {
        direccion: 'Av. 25 de Mayo 100 (frente a Plaza 25 de Mayo), Resistencia, Chaco',
        latitud: -27.4514,
        longitud: -58.9867,
    },
};
