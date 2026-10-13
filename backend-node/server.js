import app from './app.js';
import { puerto } from './src/config/env.js';

app.listen(puerto, () => {
    console.log(`backend-node escuchando en el puerto ${puerto}`);
});
