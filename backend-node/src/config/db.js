import mongoose from 'mongoose';
import { mongoUri } from './env.js';

export const conectarDB = async () => {
    try {
        await mongoose.connect(mongoUri);
        // eslint-disable-next-line no-console
        console.log('MongoDB conectado exitosamente');
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error al conectar a MongoDB:', error.message);
        throw error;
    }
};

export const desconectarDB = async () => {
    await mongoose.disconnect();
};
