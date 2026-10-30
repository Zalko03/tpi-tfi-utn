import http from 'http';
import app from './app.js';
import { puerto } from './src/config/env.js';
import { conectarDB } from './src/config/db.js';
import { inicializarSocketIO } from './src/sockets/index.js';

try {
    await conectarDB();
    const servidorHttp = http.createServer(app);
    inicializarSocketIO(servidorHttp);

    servidorHttp.listen(puerto, () => {
        // eslint-disable-next-line no-console
        console.log(`backend-node (HTTP + Socket.IO) escuchando en el puerto ${puerto}`);
    });
} catch (error) {
    // eslint-disable-next-line no-console
    console.error('Fallo al iniciar el servidor:', error);
}
