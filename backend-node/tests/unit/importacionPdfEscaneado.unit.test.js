import {
    ALTO_MAXIMO_LIENZO_PDF_PX,
    calcularLienzoPdfEscaneado,
    LADO_MAXIMO_IMAGEN_IMPORTACION_PX,
    MAX_PAGINAS_PDF_ESCANEADO,
    MENSAJE_IMPORTACION_SIN_CONEXION,
    mensajeFallaImportacionIA,
} from '../../../web/js/logicaPwa.js';

// Hoja A4 en puntos de pdf.js (escala 1).
const A4 = { ancho: 595, alto: 842 };

describe('calcularLienzoPdfEscaneado', () => {
    it('una sola hoja A4 se amplía hasta el ancho máximo sin pasarse', () => {
        const lienzo = calcularLienzoPdfEscaneado([A4]);
        expect(lienzo.ancho).toBeLessThanOrEqual(LADO_MAXIMO_IMAGEN_IMPORTACION_PX);
        expect(lienzo.ancho).toBe(Math.round(595 * lienzo.escala));
        expect(lienzo.paginas).toEqual([{ y: 0, ancho: lienzo.ancho, alto: lienzo.alto }]);
        expect(lienzo.paginasUsadas).toBe(1);
        expect(lienzo.paginasOmitidas).toBe(0);
    });

    it('apila las páginas una debajo de otra sin superar el alto máximo', () => {
        const lienzo = calcularLienzoPdfEscaneado([A4, A4, A4]);
        expect(lienzo.paginas.map((p) => p.y)).toEqual([
            0,
            lienzo.paginas[0].alto,
            lienzo.paginas[0].alto + lienzo.paginas[1].alto,
        ]);
        expect(lienzo.alto).toBe(lienzo.paginas.reduce((suma, p) => suma + p.alto, 0));
        expect(lienzo.alto).toBeLessThanOrEqual(ALTO_MAXIMO_LIENZO_PDF_PX);
    });

    it(`usa solo las primeras ${MAX_PAGINAS_PDF_ESCANEADO} páginas y avisa cuántas quedaron afuera`, () => {
        const lienzo = calcularLienzoPdfEscaneado([A4, A4, A4], { totalPaginas: 7 });
        expect(lienzo.paginasUsadas).toBe(MAX_PAGINAS_PDF_ESCANEADO);
        expect(lienzo.paginasOmitidas).toBe(4);

        const sinTotal = calcularLienzoPdfEscaneado([A4, A4, A4, A4, A4]);
        expect(sinTotal.paginas).toHaveLength(MAX_PAGINAS_PDF_ESCANEADO);
        expect(sinTotal.paginasOmitidas).toBe(2);
    });

    it('no amplía más de 3 veces una página chica', () => {
        const lienzo = calcularLienzoPdfEscaneado([{ ancho: 100, alto: 50 }]);
        expect(lienzo.escala).toBe(3);
        expect(lienzo).toMatchObject({ ancho: 300, alto: 150 });
    });

    it('ignora páginas con medidas inválidas y falla si no queda ninguna', () => {
        const lienzo = calcularLienzoPdfEscaneado([{ ancho: 0, alto: 10 }, A4]);
        expect(lienzo.paginasUsadas).toBe(1);
        expect(() => calcularLienzoPdfEscaneado([])).toThrow('El PDF no tiene páginas para dibujar.');
        expect(() => calcularLienzoPdfEscaneado(null)).toThrow();
    });
});

describe('mensajeFallaImportacionIA', () => {
    it('distingue sesión vencida, permisos y exceso de pedidos', () => {
        expect(mensajeFallaImportacionIA(401)).toBe('Tu sesión venció. Volvé a ingresar.');
        expect(mensajeFallaImportacionIA(403)).toBe('No tenés permiso para hacer esto.');
        expect(mensajeFallaImportacionIA(429)).toMatch(/Demasiados intentos/);
    });

    it('avisa cuando el archivo es demasiado pesado', () => {
        expect(mensajeFallaImportacionIA(413)).toMatch(/demasiado pesado/);
    });

    it('muestra el motivo de validación que manda el servidor', () => {
        expect(mensajeFallaImportacionIA(400, 'La foto es demasiado pesada. Máximo 5 MB.')).toBe(
            'La foto es demasiado pesada. Máximo 5 MB.'
        );
    });

    it('errores del servidor o sin código: la IA no respondió (no "revisá la configuración")', () => {
        for (const codigo of [500, 502, 503, undefined, 0]) {
            const mensaje = mensajeFallaImportacionIA(codigo, 'detalle interno');
            expect(mensaje).toBe('El servicio de IA no respondió. Probá de nuevo en unos minutos.');
        }
    });

    it('el mensaje sin conexión no culpa a la configuración', () => {
        expect(MENSAJE_IMPORTACION_SIN_CONEXION).toMatch(/conexión/);
        expect(MENSAJE_IMPORTACION_SIN_CONEXION).not.toMatch(/configuración/);
    });
});
