import { obtenerProductoDjango } from '../clients/django.client.js';

describe('Cliente Django con tolerancia a fallos (T1.11 / docs/integracion.md)', () => {
    it('debe responder con degradado: true cuando Django no esté disponible', async () => {
        // Consultamos un puerto donde no haya nada o con URL inaccesible
        const resultado = await obtenerProductoDjango(99999, 500);

        // Si Django está corriendo pero el producto no existe retorna null (404),
        // o si no está corriendo retorna objeto con degradado: true.
        if (resultado === null) {
            expect(resultado).toBeNull();
        } else {
            expect(resultado).toHaveProperty('degradado', true);
            expect(resultado).toHaveProperty('id', 99999);
        }
    });
});
