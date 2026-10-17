import app from './app.js';
import { puerto } from './src/config/env.js';
import { conectarDB } from './src/config/db.js';

try {
    await conectarDB();
    app.listen(puerto, () => {
        console.log(`backend-node escuchando en el puerto ${puerto}`);
    });
} catch (error) {
    console.error('Fallo al iniciar el servidor:', error);
}
