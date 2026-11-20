/**
 * Sapori Stock · Sistema POS & Gestión Gastronómica
 * Frontend Comercial Híbrido (Web Cloud + Red Local LAN + Contingencia Offline)
 * Conectado a APIs de Django, Node & Socket.IO
 */

import {
    accionesCajaVisiblesParaUsuario,
    accionesEmpleadoVisiblesParaUsuario,
    accionesEquipoVisiblesParaUsuario,
    agregarProductoAlCarrito,
    buscarProductoPorCodigoOTexto,
    calcularCostosExtraReceta,
    calcularDimensionesReescaladoImagen,
    calcularFactorConversionReceta,
    calcularResumenCarrito,
    CALIDAD_JPEG_IMAGEN_IMPORTACION,
    construirDictPermisosDesdeSeleccion,
    construirUrlCartaPublica,
    consultarDisponibilidadDemoApi,
    fechaIsoATexto,
    fechaTextoAIso,
    formatearEntradaFecha,
    crearFetchConSesion,
    construirQueryRangoFechas,
    ejecutarSincronizacionConLock,
    encolarVentaOffline,
    esArchivoDocAntiguo,
    esArchivoDocx,
    esArchivoExcel,
    esArchivoImagenImportacion,
    esArchivoPdf,
    esCargaVigente,
    escaparHtml,
    evaluarCsvPlantillaDirecta,
    evaluarEstadoImportacionIA,
    evaluarEstadoResumenIA,
    evaluarTextoComoCsvDirecto,
    extraerBase64DeDataUrl,
    extraerCsvDeExcelBuffer,
    extraerMensajeErrorApi,
    extraerTextoDeDocxBuffer,
    extraerTextoDePdfBuffer,
    filtrarRegistrosPorRangoFechas,
    formatearCentavosADecimal,
    formatearEventoTiempoReal,
    formatearFechaLocalInput,
    generarIdOperacion,
    generarSvgQrCarta,
    GRUPOS_PERMISOS_EQUIPO,
    guardarPreferenciaSonidosSilenciados,
    LADO_MAXIMO_IMAGEN_IMPORTACION_PX,
    leerPreferenciaSonidosSilenciados,
    MENSAJE_DOC_ANTIGUO,
    MENSAJE_FOTO_LISTA_IA,
    MENSAJE_IA_NO_DISPONIBLE,
    mensajeErrorParaUsuario,
    obtenerContenidoPlantillaCsv,
    obtenerPermisosInicialesEmpleado,
    obtenerPlantillaRol,
    obtenerSonidoParaEvento,
    obtenerUnidadesCompatiblesReceta,
    obtenerVentasOffline,
    parsearCsvProveedor,
    prepararCatalogoParaCache,
    procesarColaVentasOffline,
    puedeGestionarQrCarta,
    resolverPerfilDemoDesdeBoton,
    seccionesVisiblesParaUsuario,
    siguienteIdCarga,
    SONIDOS,
    unificarTrazabilidadRegistros,
    usuarioTienePermiso,
    validarArchivoImportacionGeneral,
    validarCarritoContraCatalogo,
    validarRangoFechas,
    validarTamanoArchivoImportacion,
} from './logicaPwa.js';

const CLAVE_CATALOGO_CACHE = 'sapori_catalogo_cache';
const CLAVE_TURNO_CACHE = 'sapori_turno_cache';
const CLAVE_MODO_CONEXION = 'sapori_modo_conexion';
const CLAVE_DJANGO_URL = 'sapori_django_url';
const CLAVE_NODE_URL = 'sapori_node_url';

/**
 * Resuelve dinámicamente las URLs de DJANGO_API_URL y NODE_API_URL:
 * - Si corre en localhost o 127.0.0.1, usa http://localhost:8000 y http://localhost:3000 (salvo override en localStorage).
 * - Si corre en dominio externo (ej. Vercel), lee window.__SAPORI_CONFIG__ o localStorage.
 */
export const resolverEndpointsServidor = () => {
    const host = window.location.hostname;
    const esLocalhost = host === 'localhost' || host === '127.0.0.1';
    const configGlobal = window.__SAPORI_CONFIG__ || {};

    const modoGuardado = localStorage.getItem(CLAVE_MODO_CONEXION) || (esLocalhost ? 'local' : 'cloud');
    const djangoGuardado = localStorage.getItem(CLAVE_DJANGO_URL);
    const nodeGuardado = localStorage.getItem(CLAVE_NODE_URL);

    const DJANGO_API_URL = esLocalhost
        ? djangoGuardado || 'http://localhost:8000'
        : djangoGuardado || configGlobal.DJANGO_API_URL || 'https://sapori-backend-django.onrender.com';

    const NODE_API_URL = esLocalhost
        ? nodeGuardado || (window.location.origin.includes('3000') ? window.location.origin : 'http://localhost:3000')
        : nodeGuardado || configGlobal.NODE_API_URL || 'https://sapori-backend-node.onrender.com';

    return {
        modoConexion: modoGuardado,
        djangoUrl: DJANGO_API_URL.replace(/\/$/, ''),
        nodeUrl: NODE_API_URL.replace(/\/$/, ''),
    };
};

const leerCacheCatalogoLocal = () => {
    try {
        const guardado = localStorage.getItem(CLAVE_CATALOGO_CACHE);
        if (guardado) {
            const lista = JSON.parse(guardado);
            if (Array.isArray(lista) && lista.length > 0) {
                return prepararCatalogoParaCache(lista);
            }
        }
    } catch {
        // Sin caché válida en localStorage
    }
    return [];
};

const leerCacheTurnoLocal = () => {
    try {
        const guardado = localStorage.getItem(CLAVE_TURNO_CACHE);
        if (guardado) return JSON.parse(guardado);
    } catch {
        // Fallback null
    }
    return null;
};

const endpointsIniciales = resolverEndpointsServidor();

sessionStorage.removeItem('cafe_pwd');
const tokenInicialGuardado = sessionStorage.getItem('cafe_jwt') || '';
if (tokenInicialGuardado.startsWith('offline-token-')) {
    sessionStorage.removeItem('cafe_jwt');
    sessionStorage.removeItem('cafe_user');
}

export const estadoApp = {
    modoConexion: endpointsIniciales.modoConexion,
    djangoUrl: endpointsIniciales.djangoUrl,
    nodeUrl: endpointsIniciales.nodeUrl,
    tokenJwt: tokenInicialGuardado.startsWith('offline-token-') ? '' : tokenInicialGuardado,
    demoAccesoDisponible: false,
    usuario: tokenInicialGuardado.startsWith('offline-token-')
        ? null
        : JSON.parse(sessionStorage.getItem('cafe_user') || 'null'),
    socket: null,
    turnoActivo: leerCacheTurnoLocal(),
    catalogo: leerCacheCatalogoLocal(),
    carrito: [],
    importacionActual: null,
    csvParseadoActual: null,
    csvContingenciaFallback: null,
    imagenImportacionActual: null,
    ultimoOrigenArchivo: 'texto',
    insumos: [],
    proveedores: [],
    turnosHistorial: [],
    usuariosEquipo: [],
    empleadoEditandoPermisos: null,
    empleadoParaBaja: null,
    productoDesgloseId: null,
    filtroCategoriaActual: 'todos',
    idCargaReportes: 0,
    trazabilidad: {
        registros: [],
        conteos: { total: 0, ventas: 0, stock: 0, caja: 0 },
        categoriaActiva: 'todos',
        fechaDesde: '',
        fechaHasta: '',
    },
    contadores: {
        ventas: 0,
        alertasMargen: 0,
        alertasStock: 0,
    },
};

const $ = (id) => document.getElementById(id);

// Formateador de moneda en Pesos Argentinos
const formatearMoneda = (monto) => {
    const num = Number(monto) || 0;
    return '$ ' + num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Íconos vectoriales SVG monocromáticos limpios (stroke="currentColor")
const SVG_ICONOS = {
    taza: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>`,
    panaderia: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"></path></svg>`,
    bebida: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"></path><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"></path></svg>`,
    candado: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
    check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    cruz: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    alerta: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
    info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
    refrescar: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`,
};

// Asignación de ícono vectorial formal según categoría del producto
const obtenerIconoProducto = (nombre = '') => {
    const n = nombre.toLowerCase();
    if (n.includes('chipa') || n.includes('chipá') || n.includes('medialuna') || n.includes('croissant') || n.includes('torta') || n.includes('tostado')) {
        return SVG_ICONOS.panaderia;
    }
    if (n.includes('jugo') || n.includes('limonada') || n.includes('fria')) {
        return SVG_ICONOS.bebida;
    }
    return SVG_ICONOS.taza;
};

// ============================================================
// SONIDOS SINTÉTICOS CON WEB AUDIO API (SIN ARCHIVOS EXTERNOS)
// ============================================================
let audioContexto = null;
let huboInteraccionAudio = false;
let sonidosSilenciados = leerPreferenciaSonidosSilenciados();

const obtenerOCrearAudioContext = () => {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioContexto) {
        try {
            audioContexto = new AudioCtx();
        } catch {
            return null;
        }
    }
    if (audioContexto.state === 'suspended' && typeof audioContexto.resume === 'function') {
        audioContexto.resume().catch(() => {});
    }
    return audioContexto;
};

const registrarDesbloqueoAudio = () => {
    if (typeof window === 'undefined') return;
    const desbloquear = () => {
        huboInteraccionAudio = true;
        obtenerOCrearAudioContext();
    };
    // Los navegadores bloquean el audio hasta la primera interacción del usuario.
    window.addEventListener('pointerdown', desbloquear, { capture: true, once: true, passive: true });
    window.addEventListener('keydown', desbloquear, { capture: true, once: true, passive: true });
    window.addEventListener('click', desbloquear, { capture: true, once: true, passive: true });
};

const reproducirSonido = (nombreSonido) => {
    if (!nombreSonido || sonidosSilenciados || !huboInteraccionAudio) return;
    const notas = SONIDOS[nombreSonido];
    if (!Array.isArray(notas) || notas.length === 0) return;

    const ctx = obtenerOCrearAudioContext();
    if (!ctx) return;

    try {
        const inicioBase = ctx.currentTime + 0.005;
        for (const nota of notas) {
            const freq = Number(nota.frecuencia);
            const dur = Number(nota.duracion);
            const retardo = Math.max(0, Number(nota.retardo) || 0);
            const gananciaMax = Math.min(0.18, Math.max(0.01, Number(nota.ganancia) || 0.08));
            if (!(freq > 0) || !(dur > 0)) continue;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = nota.tipo || 'sine';
            osc.frequency.setValueAtTime(freq, inicioBase + retardo);

            const t0 = inicioBase + retardo;
            const ataque = Math.min(0.01, dur * 0.25);
            const tFin = t0 + dur;

            // Envolvente corta de ataque/decaimiento para evitar chasquidos al iniciar o cortar la onda.
            gain.gain.setValueAtTime(0.0001, t0);
            gain.gain.linearRampToValueAtTime(gananciaMax, t0 + ataque);
            gain.gain.exponentialRampToValueAtTime(0.0001, tFin);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(t0);
            osc.stop(tFin + 0.01);
        }
    } catch {
        // Ignoramos fallos de reproducción en entornos restringidos.
    }
};

const actualizarBotonSonidosUI = () => {
    const btn = $('btn-toggle-sonidos');
    if (!btn) return;
    const iconoActivo = btn.querySelector('.icono-sonido-activo');
    const iconoSilenciado = btn.querySelector('.icono-sonido-silenciado');
    const texto = sonidosSilenciados ? 'Activar sonidos' : 'Silenciar sonidos';
    btn.setAttribute('aria-label', texto);
    btn.setAttribute('title', texto);
    btn.setAttribute('aria-pressed', sonidosSilenciados ? 'true' : 'false');
    btn.classList.toggle('sonidos-silenciados', sonidosSilenciados);
    if (iconoActivo) iconoActivo.hidden = sonidosSilenciados;
    if (iconoSilenciado) iconoSilenciado.hidden = !sonidosSilenciados;
};

// ============================================================
// LOADERS EN BOTONES Y SECCIONES (CSS PURO + ACCESIBILIDAD)
// ============================================================
const conCargando = async (boton, accionAsync) => {
    if (!boton) {
        return await accionAsync();
    }
    // Evita doble clic o reentrada mientras la operación sigue en curso.
    if (boton.dataset.cargando === '1') {
        return undefined;
    }

    const estabaDeshabilitado = Boolean(boton.disabled);
    boton.dataset.cargando = '1';
    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
    boton.classList.add('btn-cargando');

    let textoSr = boton.querySelector('.texto-cargando-sr');
    if (!textoSr) {
        textoSr = document.createElement('span');
        textoSr.className = 'sr-only texto-cargando-sr';
        textoSr.textContent = ' Cargando…';
        boton.appendChild(textoSr);
    }

    try {
        return await accionAsync();
    } finally {
        delete boton.dataset.cargando;
        boton.disabled = estabaDeshabilitado;
        boton.removeAttribute('aria-busy');
        boton.classList.remove('btn-cargando');
        const srActual = boton.querySelector('.texto-cargando-sr');
        if (srActual) srActual.remove();
    }
};

const construirEstadoCargandoBloque = (texto = 'Cargando…') => `
    <div class="estado-cargando-bloque" role="status" aria-live="polite">
        <span class="spinner-carga" aria-hidden="true"></span>
        <span>${escaparHtml(texto)}</span>
    </div>
`;

const construirCargandoPos = () => {
    const tarjetasEsqueleto = Array.from({ length: 4 }, () => `
        <div class="esqueleto-pos-card" aria-hidden="true">
            <span class="esqueleto-linea esqueleto-w-40"></span>
            <span class="esqueleto-linea esqueleto-w-85"></span>
            <span class="esqueleto-linea esqueleto-w-50"></span>
        </div>
    `).join('');
    return `${construirEstadoCargandoBloque('Cargando carta…')}${tarjetasEsqueleto}`;
};

const construirFilasCargandoTabla = (columnas, texto = 'Cargando…', filasEsqueleto = 3) => {
    const anchos = ['esqueleto-w-75', 'esqueleto-w-50', 'esqueleto-w-60', 'esqueleto-w-40', 'esqueleto-w-85'];
    const celdasEsqueleto = Array.from(
        { length: columnas },
        (_, i) => `<td><span class="esqueleto-linea ${anchos[i % anchos.length]}"></span></td>`
    ).join('');
    const filas = Array.from(
        { length: filasEsqueleto },
        () => `<tr class="fila-esqueleto" aria-hidden="true">${celdasEsqueleto}</tr>`
    ).join('');

    return `
        <tr class="fila-cargando-estado">
            <td colspan="${columnas}" class="col-centro py-4">
                <div class="estado-cargando-inline" role="status" aria-live="polite">
                    <span class="spinner-carga" aria-hidden="true"></span>
                    <span>${escaparHtml(texto)}</span>
                </div>
            </td>
        </tr>
        ${filas}
    `;
};

const construirCargandoEquipo = () => {
    const tarjetas = Array.from({ length: 3 }, () => `
        <div class="esqueleto-equipo-card" aria-hidden="true">
            <span class="esqueleto-linea esqueleto-w-60"></span>
            <span class="esqueleto-linea esqueleto-w-40"></span>
            <span class="esqueleto-linea esqueleto-w-85"></span>
        </div>
    `).join('');
    return `${construirEstadoCargandoBloque('Cargando equipo…')}${tarjetas}`;
};

// ============================================================
// TOAST NOTIFICACIONES FLOTANTES (CERO EMOJIS)
// ============================================================
export const mostrarToast = (mensaje, tipo = 'info') => {
    const contenedor = $('contenedor-toasts');
    if (!contenedor) return;
    // Recién vencida la sesión, los pedidos que ya estaban en camino fallan en cadena:
    // solo se deja el aviso de "Tu sesión venció".
    if (tipo !== 'exito' && Date.now() < (estadoApp.avisosSilenciadosHasta || 0)) return;

    const sonidoToast = obtenerSonidoParaEvento('toast', { tipo });
    if (sonidoToast) reproducirSonido(sonidoToast);

    const toast = document.createElement('div');
    toast.className = `toast-notif ${tipo}`;

    let iconoSvg = SVG_ICONOS.info;
    if (tipo === 'exito') iconoSvg = SVG_ICONOS.check;
    if (tipo === 'peligro' || tipo === 'advertencia') iconoSvg = SVG_ICONOS.alerta;

    toast.innerHTML = `<span style="display: inline-flex; align-items: center;">${iconoSvg}</span><span>${escaparHtml(mensaje)}</span>`;
    contenedor.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        toast.style.transition = 'all 0.25s ease';
        setTimeout(() => toast.remove(), 260);
    }, 3800);
};

// ============================================================
// GESTIÓN DE COLA OFFLINE Y RECONEXIÓN AUTOMÁTICA
// ============================================================
export const actualizarIndicadorColaOffline = () => {
    const banner = $('banner-cola-offline');
    const texto = $('texto-cola-offline');
    if (!banner || !texto) return;

    const cola = obtenerVentasOffline();
    const cantidad = cola.length;
    const sinInternet = navigator.onLine === false || estadoApp.modoConexion === 'offline';

    if (sinInternet || cantidad > 0) {
        banner.style.display = 'flex';
        texto.textContent =
            cantidad === 1
                ? 'Sin internet: 1 venta guardada, se enviará al volver la conexión'
                : `Sin internet: ${cantidad} ventas guardadas, se enviarán al volver la conexión`;
    } else {
        banner.style.display = 'none';
    }
};

const asegurarSesionYTurnosParaSincronizacion = async () => {
    const host = window.location.hostname;
    const esLocalhost = host === 'localhost' || host === '127.0.0.1';
    if (estadoApp.modoConexion === 'offline') {
        estadoApp.modoConexion = esLocalhost ? 'local' : 'cloud';
        localStorage.setItem(CLAVE_MODO_CONEXION, estadoApp.modoConexion);
    }
    if (esLocalhost && (!estadoApp.djangoUrl || estadoApp.djangoUrl.includes('onrender.com'))) {
        estadoApp.djangoUrl = 'http://localhost:8000';
        localStorage.setItem(CLAVE_DJANGO_URL, estadoApp.djangoUrl);
    }
    if (esLocalhost && (!estadoApp.nodeUrl || estadoApp.nodeUrl.includes('onrender.com'))) {
        estadoApp.nodeUrl = 'http://localhost:3000';
        localStorage.setItem(CLAVE_NODE_URL, estadoApp.nodeUrl);
    }

    const claimsToken = estadoApp.tokenJwt ? decodificarClaimsJwt(estadoApp.tokenJwt) : null;
    const tokenExpirado = claimsToken?.exp ? claimsToken.exp * 1000 <= Date.now() : false;
    if (!estadoApp.tokenJwt || !claimsToken || tokenExpirado) {
        return {
            ok: false,
            error: 'La sesión expiró o es inválida. Iniciá sesión nuevamente para sincronizar.',
            listaTurnos: [],
        };
    }

    let listaTurnos = [];
    try {
        const resTurnos = await fetchConSesion(`${estadoApp.djangoUrl}/api/caja/turnos/?limite=100`, {
            headers: {
                'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                'Content-Type': 'application/json',
            },
        });
        if (resTurnos.ok) {
            const dataTurnos = await resTurnos.json();
            listaTurnos = Array.isArray(dataTurnos)
                ? dataTurnos
                : (dataTurnos.datos || dataTurnos.results || []);
            const miId = Number(estadoApp.usuario?.id || 0);
            const turnoPropioAbierto = listaTurnos.find(
                (t) => t.estado === 'ABIERTO' && Number(t.usuario) === miId
            );
            if (turnoPropioAbierto) {
                estadoApp.turnoActivo = turnoPropioAbierto;
                localStorage.setItem(CLAVE_TURNO_CACHE, JSON.stringify(turnoPropioAbierto));
            }
        }
    } catch {
        // Fallback al turno abierto en caché únicamente si pertenece al usuario actual
    }

    return { ok: true, listaTurnos };
};

const estadoLockSincronizacion = { enCurso: false };

export const sincronizarVentasPendientes = async () => {
    return ejecutarSincronizacionConLock(async () => {
        // Si el modo de conexión estaba en "offline" manual/contingencia, intentar reconectar contra el servidor local/activo sin bloquearse por el flag manual
        if (estadoApp.modoConexion === 'offline') {
            const host = window.location.hostname;
            const esLocalhost = host === 'localhost' || host === '127.0.0.1';
            estadoApp.modoConexion = esLocalhost ? 'local' : 'cloud';
            localStorage.setItem(CLAVE_MODO_CONEXION, estadoApp.modoConexion);
            if (
                esLocalhost &&
                (!estadoApp.djangoUrl ||
                    estadoApp.djangoUrl.includes('onrender.com') ||
                    estadoApp.djangoUrl === 'offline')
            ) {
                estadoApp.djangoUrl = 'http://localhost:8000';
                localStorage.setItem(CLAVE_DJANGO_URL, estadoApp.djangoUrl);
            }
        }

        const cola = obtenerVentasOffline();
        if (cola.length === 0) {
            if (estadoApp.modoConexion === 'offline') {
                estadoApp.modoConexion = 'local';
                localStorage.setItem(CLAVE_MODO_CONEXION, 'local');
                conectarSocketTiempoReal();
            }
            actualizarIndicadorColaOffline();
            mostrarToast(
                'Modo en línea restablecido. No hay ventas pendientes en la cola local.',
                'exito'
            );
            return;
        }

        if (navigator.onLine === false) {
            mostrarToast('El dispositivo continúa sin conexión a internet.', 'advertencia');
            return;
        }

        mostrarToast(`Enviando ${cola.length} venta(s) guardada(s)…`, 'info');
        const sesionTurnos = await asegurarSesionYTurnosParaSincronizacion();
        if (!sesionTurnos.ok) {
            mostrarToast(sesionTurnos.error, 'peligro');
            return;
        }

        const resultado = await procesarColaVentasOffline({
            fetchFn: fetch,
            djangoUrl: estadoApp.djangoUrl,
            tokenJwt: estadoApp.tokenJwt,
            usuario: estadoApp.usuario,
            turnoActivo: estadoApp.turnoActivo,
            listaTurnos: sesionTurnos.listaTurnos,
            onItemSincronizado: () => {
                actualizarIndicadorColaOffline();
            },
            onItemRechazado: (_item, motivo) => {
                actualizarIndicadorColaOffline();
                mostrarToast(
                    `Venta offline movida a rechazadas: ${motivo}`,
                    'advertencia'
                );
            },
        });

        if (resultado.sinTurnoAbierto) {
            mostrarToast(
                'No hay un turno de caja abierto para enviar las ventas guardadas. Abrí un turno primero.',
                'peligro'
            );
        }

        if (resultado.restantes === 0) {
            if (estadoApp.modoConexion === 'offline') {
                estadoApp.modoConexion = 'local';
                localStorage.setItem(CLAVE_MODO_CONEXION, 'local');
            }
            actualizarIndicadorColaOffline();
            conectarSocketTiempoReal();
            if (resultado.sincronizadas > 0) {
                mostrarToast(
                    `Se sincronizaron ${resultado.sincronizadas} venta(s) pendiente(s) con éxito.`,
                    'exito'
                );
            }
            await cargarTurnoActivo();
            await cargarCatalogo();
            if (estadoApp.usuario?.rol !== 'CAJERO') {
                await cargarFinanzas();
            }
        } else {
            actualizarIndicadorColaOffline();
            mostrarToast(
                `Se sincronizaron ${resultado.sincronizadas} venta(s). Quedan ${resultado.restantes} pendiente(s) en cola.`,
                'advertencia'
            );
        }
    }, estadoLockSincronizacion);
};

// ============================================================
// GESTIÓN DE AUTENTICACIÓN Y ROLES
// ============================================================
const decodificarClaimsJwt = (token) => {
    try {
        const parte = token.split('.')[1];
        if (!parte) return null;
        const json = atob(parte.replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(json);
    } catch {
        return null;
    }
};

const actualizarEstadoVisibilidadCampo = (btnToggle, visible) => {
    if (!btnToggle) return;
    const targetId = btnToggle.dataset.targetInput;
    const input = targetId ? $(targetId) : null;
    if (!input) return;

    const esVisible = Boolean(visible);
    input.type = esVisible ? 'text' : 'password';
    btnToggle.setAttribute('aria-pressed', esVisible ? 'true' : 'false');

    const labelMostrar = btnToggle.dataset.labelMostrar || 'Mostrar';
    const labelOcultar = btnToggle.dataset.labelOcultar || 'Ocultar';
    btnToggle.setAttribute('aria-label', esVisible ? labelOcultar : labelMostrar);

    const iconoMostrar = btnToggle.querySelector('.icono-ojo-mostrar');
    const iconoOcultar = btnToggle.querySelector('.icono-ojo-ocultar');
    if (iconoMostrar) iconoMostrar.hidden = esVisible;
    if (iconoOcultar) iconoOcultar.hidden = !esVisible;
};

const restablecerVisibilidadCredencialesLogin = () => {
    document.querySelectorAll('.btn-toggle-visibilidad').forEach((btn) => {
        actualizarEstadoVisibilidadCampo(btn, false);
    });
};

const inicializarTogglesVisibilidad = () => {
    document.querySelectorAll('.btn-toggle-visibilidad').forEach((btn) => {
        actualizarEstadoVisibilidadCampo(btn, false);
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.targetInput;
            const input = targetId ? $(targetId) : null;
            if (!input) return;
            actualizarEstadoVisibilidadCampo(btn, input.type === 'password');
        });
    });
};

const limpiarCredencialesFormularioLogin = ({ resetearFormulario = false } = {}) => {
    if (resetearFormulario) {
        $('form-login')?.reset();
    } else {
        if ($('input-password')) $('input-password').value = '';
    }
    restablecerVisibilidadCredencialesLogin();
};

const actualizarUIUsuario = () => {
    const pantallaLogin = $('pantalla-login');
    const u = estadoApp.usuario;

    if (!estadoApp.tokenJwt) {
        restablecerVisibilidadCredencialesLogin();
        if ($('btn-config-servidor-header')) {
            $('btn-config-servidor-header').style.display = 'none';
        }
        if ($('btn-qr-carta-publica')) {
            $('btn-qr-carta-publica').hidden = true;
        }
        if ($('modal-qr-carta')) {
            $('modal-qr-carta').style.display = 'none';
        }
        if (pantallaLogin) pantallaLogin.style.display = 'flex';
        return;
    }

    if (pantallaLogin) pantallaLogin.style.display = 'none';

    if (!u) {
        const claims = decodificarClaimsJwt(estadoApp.tokenJwt);
        if (claims) {
            estadoApp.usuario = {
                id: claims.user_id || claims.sub,
                username: claims.username || 'usuario',
                rol: claims.rol || 'CAJERO',
                permisos: claims.permisos || [],
            };
        }
    }

    const usuarioActual = estadoApp.usuario || { username: 'Operador', rol: 'CAJERO' };
    const rol = (usuarioActual.rol || 'CAJERO').toUpperCase();

    if ($('sidebar-nombre-usuario')) {
        const nombreMostrar = usuarioActual.first_name
            ? `${usuarioActual.first_name} ${usuarioActual.last_name || ''}`
            : usuarioActual.username;
        $('sidebar-nombre-usuario').textContent = nombreMostrar;
    }

    if ($('usuario-avatar-letra')) {
        const letra = (usuarioActual.first_name || usuarioActual.username || 'U')[0].toUpperCase();
        $('usuario-avatar-letra').textContent = letra;
    }

    const badgeRol = $('badge-rol-usuario');
    if (badgeRol) {
        badgeRol.className = `badge-rol ${rol.toLowerCase()}`;
        if (rol === 'DUENIO') badgeRol.textContent = 'Dueño';
        else if (rol === 'ENCARGADO') badgeRol.textContent = 'Encargado';
        else badgeRol.textContent = 'Cajero';
    }

    if ($('ticket-cajero-nombre')) {
        $('ticket-cajero-nombre').textContent = `Atendido por: ${usuarioActual.username}`;
    }

    configurarVisibilidadPorRol(rol);
    actualizarVisibilidadGestionRecetas();
    actualizarIndicadorColaOffline();
};


// Acciones rápidas de caja según permisos y turno (solo pantalla; el backend ya las protege).
const aplicarAccionesCajaVisibles = () => {
    const accionesCaja = accionesCajaVisiblesParaUsuario(estadoApp.usuario, estadoApp.turnoActivo);
    if ($('btn-modal-movimiento')) $('btn-modal-movimiento').style.display = accionesCaja.movimiento ? '' : 'none';
    if ($('btn-modal-abrir-turno')) $('btn-modal-abrir-turno').style.display = accionesCaja.abrirTurno ? '' : 'none';
    const tarjetaAcciones = document.querySelector('.acciones-rapidas-caja');
    if (tarjetaAcciones) {
        tarjetaAcciones.style.display = accionesCaja.movimiento || accionesCaja.abrirTurno ? '' : 'none';
    }
};

const configurarVisibilidadPorRol = (rol) => {
    const seccionesVisibles = seccionesVisiblesParaUsuario(estadoApp.usuario);
    const esCajero = rol === 'CAJERO';

    const btnConfigHeader = $('btn-config-servidor-header');
    if (btnConfigHeader) {
        btnConfigHeader.style.display = rol === 'DUENIO' ? 'flex' : 'none';
    }

    document.querySelectorAll('.sidebar-nav .nav-item').forEach((btn) => {
        const seccion = btn.dataset.seccion;
        btn.style.display = seccionesVisibles.includes(seccion) ? '' : 'none';
    });

    aplicarAccionesCajaVisibles();

    if ($('caja-panel-cajero-ciego')) {
        $('caja-panel-cajero-ciego').style.display = 'block';
    }
    if ($('caja-panel-gerencia-auditoria')) {
        $('caja-panel-gerencia-auditoria').style.display = esCajero ? 'none' : 'block';
    }

    if ($('finanzas-contenido-gerencia')) {
        $('finanzas-contenido-gerencia').style.display = esCajero ? 'none' : 'flex';
    }
    if ($('finanzas-bloqueo-cajero')) {
        $('finanzas-bloqueo-cajero').style.display = esCajero ? 'block' : 'none';
    }

    const vistaActiva = document.querySelector('.vista-modulo.activa');
    const seccionActiva = vistaActiva ? vistaActiva.id.replace(/^vista-/, '') : '';
    if (seccionesVisibles.length === 0) {
        document.querySelectorAll('.vista-modulo').forEach((v) => v.classList.remove('activa'));
        document.querySelectorAll('.sidebar-nav .nav-item').forEach((b) => b.classList.remove('activo'));
    } else if (!seccionesVisibles.includes(seccionActiva)) {
        cambiarSeccion(seccionesVisibles[0]);
    }

    actualizarVisibilidadGestionRecetas();
    actualizarVisibilidadGestionEquipo();
};

const intentarReanudarSesionOffline = (usernameSolicitado = '') => {
    const tokenGuardado = sessionStorage.getItem('cafe_jwt') || estadoApp.tokenJwt || '';
    const claims = tokenGuardado && !tokenGuardado.startsWith('offline-token-')
        ? decodificarClaimsJwt(tokenGuardado)
        : null;
    const tokenVigente = Boolean(
        claims && (!claims.exp || claims.exp * 1000 > Date.now())
    );

    if (!tokenVigente) {
        const estadoEl = $('mensaje-auth');
        const msg = 'No hay conexión y no hay una sesión guardada. Conectate para ingresar.';
        if (estadoEl) estadoEl.textContent = msg;
        mostrarToast(msg, 'advertencia');
        return false;
    }

    const usuarioCacheado = JSON.parse(sessionStorage.getItem('cafe_user') || 'null');
    if (
        usernameSolicitado
        && claims.username
        && claims.username.toLowerCase() !== String(usernameSolicitado).trim().toLowerCase()
    ) {
        const estadoEl = $('mensaje-auth');
        const msg = 'Sin conexión: solo podés seguir con el usuario de la sesión guardada.';
        if (estadoEl) estadoEl.textContent = msg;
        mostrarToast(msg, 'advertencia');
        return false;
    }

    estadoApp.tokenJwt = tokenGuardado;
    estadoApp.usuario = usuarioCacheado || {
        id: claims.user_id || claims.sub,
        username: claims.username || 'Operador',
        rol: claims.rol || 'CAJERO',
        permisos: claims.permisos || [],
    };
    sessionStorage.setItem('cafe_jwt', estadoApp.tokenJwt);
    sessionStorage.setItem('cafe_user', JSON.stringify(estadoApp.usuario));

    actualizarUIUsuario();
    renderizarCatalogoPOS();
    renderizarTablaRecetas();
    if (estadoApp.turnoActivo) {
        actualizarCardTurnoActivo(estadoApp.turnoActivo);
    }
    actualizarEstadoSocketUI(false, 'Trabajando sin internet');
    actualizarIndicadorColaOffline();
    mostrarToast('Seguís trabajando sin internet con tu sesión guardada.', 'advertencia');
    return true;
};

const aplicarSesionAutenticada = (data, nombreFallback = '') => {
    estadoApp.tokenJwt = data.access;
    sessionStorage.setItem('cafe_jwt', data.access);
    if (data.refresh) sessionStorage.setItem('cafe_refresh', data.refresh);
    estadoApp.avisosSilenciadosHasta = 0;

    if (data.usuario) {
        estadoApp.usuario = data.usuario;
        sessionStorage.setItem('cafe_user', JSON.stringify(data.usuario));
    } else {
        const claims = decodificarClaimsJwt(data.access);
        if (claims) {
            estadoApp.usuario = {
                id: claims.user_id || claims.sub,
                username: claims.username || nombreFallback,
                rol: claims.rol || 'CAJERO',
                permisos: claims.permisos || [],
            };
            sessionStorage.setItem('cafe_user', JSON.stringify(estadoApp.usuario));
        }
    }

    const nombreBienvenida = estadoApp.usuario?.username || nombreFallback;
    limpiarCredencialesFormularioLogin();
    actualizarUIUsuario();
    conectarSocketTiempoReal();
    cargarDatosIniciales();
    mostrarToast(`Bienvenido a Sapori Stock, ${nombreBienvenida}.`, 'exito');
};

const enviarSolicitudLogin = async ({
    url,
    payload,
    nombreFallback = '',
    mensajeCarga = 'Verificando credenciales...',
    mensajeErrorPorDefecto = 'No se pudo ingresar. Revisá tus datos.',
    esDemo = false,
}) => {
    if (estadoApp.modoConexion === 'offline' || navigator.onLine === false) {
        intentarReanudarSesionOffline(nombreFallback);
        return;
    }

    const estadoEl = $('mensaje-auth');
    if (estadoEl) estadoEl.textContent = mensajeCarga;

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            if (esDemo && res.status === 404) {
                estadoApp.demoAccesoDisponible = false;
            }
            const err =
                res.status === 429
                    ? mensajeErrorParaUsuario(429)
                    : esDemo && res.status === 404
                      ? 'El acceso rápido no está habilitado. Ingresá tu usuario y contraseña.'
                      : data.mensaje || data.detail || mensajeErrorPorDefecto;
            if (estadoEl) estadoEl.textContent = err;
            mostrarToast(err, 'peligro');
            return;
        }

        aplicarSesionAutenticada(data, nombreFallback);
    } catch {
        intentarReanudarSesionOffline(nombreFallback);
    }
};

const ejecutarLogin = async (username, password) =>
    enviarSolicitudLogin({
        url: `${estadoApp.djangoUrl}/api/auth/token/`,
        payload: { username, password },
        nombreFallback: username,
        mensajeCarga: 'Verificando credenciales...',
        mensajeErrorPorDefecto: 'Credenciales inválidas',
    });

const ejecutarLoginDemo = async (perfil, nombreUsuarioDemo = '') =>
    enviarSolicitudLogin({
        url: `${estadoApp.djangoUrl}/api/auth/demo/`,
        payload: { perfil },
        nombreFallback: nombreUsuarioDemo,
        mensajeCarga: 'Ingresando...',
        mensajeErrorPorDefecto: 'El acceso rápido no está habilitado. Ingresá tu usuario y contraseña.',
        esDemo: true,
    });

const actualizarDisponibilidadDemo = async () => {
    if (estadoApp.modoConexion === 'offline' || navigator.onLine === false) {
        estadoApp.demoAccesoDisponible = false;
        return false;
    }
    const disponible = await consultarDisponibilidadDemoApi({
        fetchFn: (url, opciones) => fetch(url, opciones),
        djangoUrl: estadoApp.djangoUrl,
    });
    estadoApp.demoAccesoDisponible = disponible;
    return disponible;
};

const cerrarSesion = ({ motivo = 'Sesión cerrada correctamente.', tipo = 'info' } = {}) => {
    // Revoca el refresh en el servidor (si no hay red, igual se borra del navegador).
    const refresh = sessionStorage.getItem('cafe_refresh');
    if (refresh) {
        fetch(`${estadoApp.djangoUrl}/api/auth/token/blacklist/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh }),
        }).catch(() => {});
    }
    sessionStorage.removeItem('cafe_refresh');
    estadoApp.tokenJwt = '';
    estadoApp.usuario = null;
    estadoApp.productoDesgloseId = null;
    if ($('panel-desglose-receta')) $('panel-desglose-receta').style.display = 'none';
    sessionStorage.removeItem('cafe_jwt');
    sessionStorage.removeItem('cafe_user');
    sessionStorage.removeItem('cafe_pwd');
    if (estadoApp.socket) {
        estadoApp.socket.disconnect();
    }
    limpiarCredencialesFormularioLogin({ resetearFormulario: true });
    actualizarUIUsuario();
    actualizarDisponibilidadDemo();
    mostrarToast(motivo, tipo);
};

// Renueva el token de acceso con el refresh guardado. Devuelve false si la sesión ya no
// se puede renovar; lanza si no hay red (en ese caso no se cierra la sesión).
const renovarSesion = async () => {
    const refresh = sessionStorage.getItem('cafe_refresh');
    if (!refresh) return false;
    const res = await fetch(`${estadoApp.djangoUrl}/api/auth/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    if (!data?.access) return false;
    estadoApp.tokenJwt = data.access;
    sessionStorage.setItem('cafe_jwt', data.access);
    if (data.refresh) sessionStorage.setItem('cafe_refresh', data.refresh);
    if (estadoApp.socket) conectarSocketTiempoReal();
    return true;
};

const cerrarSesionPorVencimiento = () => {
    if (!estadoApp.tokenJwt) return; // ya se cerró (varios pedidos vencidos a la vez)
    cerrarSesion({ motivo: mensajeErrorParaUsuario(401), tipo: 'advertencia' });
    estadoApp.avisosSilenciadosHasta = Date.now() + 5000;
};

const fetchConSesion = crearFetchConSesion({
    fetchFn: (url, opciones) => fetch(url, opciones),
    obtenerToken: () => estadoApp.tokenJwt,
    renovarSesion,
    alVencerSesion: cerrarSesionPorVencimiento,
});

// ============================================================
// CONEXIÓN SOCKET.IO EN TIEMPO REAL
// ============================================================
export const conectarSocketTiempoReal = () => {
    if (estadoApp.modoConexion === 'offline' || navigator.onLine === false) {
        actualizarEstadoSocketUI(false, 'Trabajando sin internet');
        return;
    }

    if (!window.io) {
        actualizarEstadoSocketUI(false, 'Sin conexión');
        return;
    }

    if (estadoApp.socket) {
        estadoApp.socket.disconnect();
    }

    if (!estadoApp.tokenJwt) {
        actualizarEstadoSocketUI(false, 'Sin sesión iniciada');
        return;
    }

    const socket = window.io(estadoApp.nodeUrl, {
        auth: { token: estadoApp.tokenJwt },
        reconnection: true,
        reconnectionAttempts: 15,
        reconnectionDelay: 400,
        reconnectionDelayMax: 3000,
        transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
        actualizarEstadoSocketUI(true, 'Conectado');
    });

    socket.on('disconnect', () => {
        actualizarEstadoSocketUI(false, 'Reconectando…');
    });

    socket.on('connect_error', async () => {
        // Si Node rechazó la conexión porque el token venció, se renueva la sesión
        // (renovarSesion vuelve a conectar el socket con el token nuevo).
        const claims = decodificarClaimsJwt(estadoApp.tokenJwt);
        const tokenVencido = Boolean(claims?.exp && claims.exp * 1000 <= Date.now());
        if (tokenVencido && socket === estadoApp.socket) {
            try {
                const renovada = await fetchConSesion.renovar();
                if (!renovada) cerrarSesionPorVencimiento();
                return;
            } catch {
                // Sin red: queda el aviso de abajo.
            }
        }
        actualizarEstadoSocketUI(false, 'Sin conexión');
    });

    socket.on('presencia.actualizada', (datos) => {
        const el = $('insignia-presencia');
        if (el) {
            const cant = datos.totalUsuarios ?? 1;
            el.textContent = cant === 1 ? '1 equipo conectado' : `${cant} equipos conectados`;
        }
    });

    socket.on('venta.registrada', (payload) => {
        registrarEventoEnFeed('venta.registrada', payload);
        cargarFinanzas();
        cargarTurnoActivo();
    });

    socket.on('costo.actualizado', (payload) => {
        registrarEventoEnFeed('costo.actualizado', payload);
        cargarCatalogo();
    });

    socket.on('stock.bajo', (payload) => {
        registrarEventoEnFeed('stock.bajo', payload);
        cargarInsumos();
    });

    socket.on('importacion.lista', async (payload) => {
        registrarEventoEnFeed('importacion.lista', payload);
        if (payload?.importacionId) {
            await consultarDetalleImportacion(payload.importacionId);
        }
    });

    estadoApp.socket = socket;
};

const actualizarEstadoSocketUI = (conectado, texto = '') => {
    const el = $('insignia-socket');
    if (!el) return;
    el.className = `pildora-socket ${conectado ? 'conectado' : 'desconectado'}`;
    el.textContent = texto;
};

const registrarEventoEnFeed = (nombreEvento, payload) => {
    const item = formatearEventoTiempoReal(nombreEvento, payload);
    const lista = $('lista-eventos-vivo');
    if (lista) {
        const li = document.createElement('li');
        li.className = `evento-item ${item.nivel}`;
        li.innerHTML = `
            <div class="evento-titulo">
                <span>${escaparHtml(item.titulo)}</span>
                <small>${new Date(item.emitidoEn).toLocaleTimeString('es-AR')}</small>
            </div>
            <div class="evento-detalle">${escaparHtml(item.detalle)}</div>
        `;
        lista.prepend(li);
    }

    if (nombreEvento === 'venta.registrada') {
        estadoApp.contadores.ventas += 1;
    } else if (nombreEvento === 'costo.actualizado' && item.alertaMargenBajo) {
        estadoApp.contadores.alertasMargen += 1;
    } else if (nombreEvento === 'stock.bajo') {
        estadoApp.contadores.alertasStock += 1;
    }

    if ($('metrica-ventas')) $('metrica-ventas').textContent = String(estadoApp.contadores.ventas);
    if ($('metrica-alertas-margen')) $('metrica-alertas-margen').textContent = String(estadoApp.contadores.alertasMargen);
    if ($('metrica-alertas-stock')) $('metrica-alertas-stock').textContent = String(estadoApp.contadores.alertasStock);

    const totalAlertas = estadoApp.contadores.ventas + estadoApp.contadores.alertasMargen + estadoApp.contadores.alertasStock;
    if ($('contador-notificaciones')) $('contador-notificaciones').textContent = String(totalAlertas);

    const sonidoSocket = obtenerSonidoParaEvento('socket', { nombreEvento, payload });
    if (sonidoSocket) reproducirSonido(sonidoSocket);
};

// ============================================================
// MÓDULO 1: PUNTO DE VENTA (POS) + COLA OFFLINE
// ============================================================
export const cargarCatalogo = async () => {
    if (estadoApp.modoConexion !== 'offline' && navigator.onLine !== false) {
        if ($('grilla-productos')) {
            $('grilla-productos').innerHTML = construirCargandoPos();
        }
        if ($('tabla-recetas-productos-body')) {
            $('tabla-recetas-productos-body').innerHTML = construirFilasCargandoTabla(7, 'Cargando recetas…', 3);
        }
        try {
            const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/productos/?limite=100`, {
                headers: {
                    'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                    'Content-Type': 'application/json',
                },
            });
            if (res.ok) {
                const data = await res.json();
                const productos = Array.isArray(data) ? data : (data.datos || data.results || []);
                estadoApp.catalogo = productos;
                const catalogoCache = prepararCatalogoParaCache(productos);
                localStorage.setItem(CLAVE_CATALOGO_CACHE, JSON.stringify(catalogoCache));
            } else {
                estadoApp.catalogo = leerCacheCatalogoLocal();
                const msg =
                    estadoApp.catalogo.length > 0
                        ? 'No se pudo actualizar la carta desde el servidor. Se muestra la última carta guardada.'
                        : 'No se pudo cargar la carta desde el servidor. Conectate o reintentá antes de vender.';
                mostrarToast(msg, 'advertencia');
            }
        } catch {
            // En caso de corte de internet usamos la copia persistida en localStorage
            estadoApp.catalogo = leerCacheCatalogoLocal();
            const msg =
                estadoApp.catalogo.length > 0
                    ? 'Sin conexión al servidor para actualizar la carta. Se muestra la última carta guardada.'
                    : 'No hay carta disponible. Conectate a internet para cargar los productos antes de vender.';
            mostrarToast(msg, 'advertencia');
        } finally {
            renderizarCatalogoPOS();
            renderizarTablaRecetas();
        }
    } else {
        estadoApp.catalogo = leerCacheCatalogoLocal();
        renderizarCatalogoPOS();
        renderizarTablaRecetas();
    }
    if (estadoApp.productoDesgloseId !== null && $('panel-desglose-receta')?.style.display !== 'none') {
        const productoActual = estadoApp.catalogo.find(
            (p) => Number(p.id) === Number(estadoApp.productoDesgloseId)
        );
        if (productoActual) {
            mostrarDesgloseReceta(productoActual);
        }
    }
};

const renderizarCatalogoPOS = () => {
    const contenedor = $('grilla-productos');
    const btnCobrar = $('btn-cobrar-ticket');
    const estadoCaja = $('estado-caja');
    const sinCarta = !Array.isArray(estadoApp.catalogo) || estadoApp.catalogo.length === 0;

    if (btnCobrar) {
        btnCobrar.disabled = sinCarta;
        btnCobrar.title = sinCarta
            ? 'No hay carta disponible. Cargá los productos antes de vender.'
            : 'Cobrar y Emitir Ticket (F2)';
    }
    if (estadoCaja) {
        estadoCaja.textContent = sinCarta
            ? 'Cobro bloqueado: no hay carta cargada.'
            : 'Listo para escanear productos o cobrar.';
    }

    if (!contenedor) return;
    contenedor.innerHTML = '';

    if (sinCarta) {
        const aviso = document.createElement('div');
        aviso.className = 'pos-carta-vacia';
        aviso.textContent =
            'No hay carta disponible. Conectate a internet para cargar los productos antes de vender.';
        contenedor.appendChild(aviso);
        return;
    }

    const filtro = estadoApp.filtroCategoriaActual;
    const filtrados = estadoApp.catalogo.filter((prod) => {
        if (filtro === 'todos') return true;
        const n = String(prod.nombre || '').toLowerCase();
        if (filtro === 'cafe') return n.includes('café') || n.includes('espresso') || n.includes('latte') || n.includes('cappuccino');
        if (filtro === 'panaderia') return n.includes('chipa') || n.includes('chipá') || n.includes('medialuna') || n.includes('torta');
        if (filtro === 'bebidas') return n.includes('jugo') || n.includes('limonada') || n.includes('agua');
        return true;
    });

    if (filtrados.length === 0) {
        const avisoFiltro = document.createElement('div');
        avisoFiltro.className = 'pos-carta-vacia';
        avisoFiltro.textContent = 'No hay productos disponibles en esta categoría.';
        contenedor.appendChild(avisoFiltro);
        return;
    }

    for (const prod of filtrados) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'producto-card-comercial';
        card.dataset.id = String(prod.id);

        const icono = obtenerIconoProducto(prod.nombre);
        const precioFormateado = formatearMoneda(prod.precio_venta);

        card.innerHTML = `
            <div>
                <div class="producto-icono-grande" aria-hidden="true">${icono}</div>
                <span class="producto-titulo" style="display: block;">${escaparHtml(prod.nombre)}</span>
                <span class="producto-codigo-badge">${escaparHtml(prod.codigo_barras || 'SIN CÓDIGO')}</span>
            </div>
            <div class="producto-precio-fila">
                <span class="producto-precio-grande">${escaparHtml(precioFormateado)}</span>
                <span class="producto-btn-agregar" aria-hidden="true">+</span>
            </div>
        `;

        card.addEventListener('click', () => {
            agregarProducto(prod);
        });

        contenedor.appendChild(card);
    }
};

const agregarProducto = (prod, cantidad = 1) => {
    estadoApp.carrito = agregarProductoAlCarrito(estadoApp.carrito, prod, cantidad);
    renderizarCarritoTicket();
    reproducirSonido(obtenerSonidoParaEvento('carrito.agregado'));

    const inputLaser = $('input-codigo-barras');
    if (inputLaser) {
        inputLaser.value = '';
        inputLaser.focus();
    }
};

const renderizarCarritoTicket = () => {
    const tabla = $('tabla-carrito-body');
    const totalEl = $('caja-total-monto');
    if (!tabla || !totalEl) return;

    tabla.innerHTML = '';

    if (estadoApp.carrito.length === 0) {
        tabla.innerHTML = `
            <tr>
                <td colspan="5" class="col-centro text-center text-muted py-8">
                    El ticket está vacío.<br />Escaneá un código de barras o elegí productos.
                </td>
            </tr>
        `;
        totalEl.textContent = '$ 0,00';
        return;
    }

    for (const [idx, item] of estadoApp.carrito.entries()) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="col-texto">
                <strong>${escaparHtml(item.nombre)}</strong>
            </td>
            <td class="col-centro">
                <div class="item-control-cant">
                    <button type="button" class="btn-cant-tactil btn-restar" data-idx="${idx}" aria-label="Restar una unidad de ${escaparHtml(item.nombre)}">-</button>
                    <span class="item-cant-numero">${item.cantidad}</span>
                    <button type="button" class="btn-cant-tactil btn-sumar" data-idx="${idx}" aria-label="Sumar una unidad de ${escaparHtml(item.nombre)}">+</button>
                </div>
            </td>
            <td class="col-numero">${formatearMoneda(item.precioUnitarioDecimal)}</td>
            <td class="col-numero font-bold"><strong>${formatearMoneda(item.subtotalDecimal)}</strong></td>
            <td class="col-centro">
                <button type="button" class="btn-item-eliminar" data-idx="${idx}" title="Eliminar ítem" aria-label="Eliminar ítem">
                    ${SVG_ICONOS.cruz}
                </button>
            </td>
        `;
        tabla.appendChild(tr);
    }

    tabla.querySelectorAll('.btn-restar').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = Number(btn.dataset.idx);
            if (estadoApp.carrito[idx].cantidad > 1) {
                estadoApp.carrito[idx].cantidad -= 1;
                estadoApp.carrito[idx].subtotalCentavos = estadoApp.carrito[idx].cantidad * estadoApp.carrito[idx].precioUnitarioCentavos;
                estadoApp.carrito[idx].subtotalDecimal = formatearCentavosADecimal(estadoApp.carrito[idx].subtotalCentavos);
            } else {
                estadoApp.carrito.splice(idx, 1);
            }
            renderizarCarritoTicket();
        });
    });

    tabla.querySelectorAll('.btn-sumar').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = Number(btn.dataset.idx);
            estadoApp.carrito[idx].cantidad += 1;
            estadoApp.carrito[idx].subtotalCentavos = estadoApp.carrito[idx].cantidad * estadoApp.carrito[idx].precioUnitarioCentavos;
            estadoApp.carrito[idx].subtotalDecimal = formatearCentavosADecimal(estadoApp.carrito[idx].subtotalCentavos);
            renderizarCarritoTicket();
        });
    });

    tabla.querySelectorAll('.btn-item-eliminar').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = Number(btn.dataset.idx);
            estadoApp.carrito.splice(idx, 1);
            renderizarCarritoTicket();
        });
    });

    const resumen = calcularResumenCarrito(estadoApp.carrito);
    totalEl.textContent = formatearMoneda(resumen.totalDecimal);
};

const registrarCobroEnColaOffline = (payload, resumen, metodoPago) => {
    const resultadoCola = encolarVentaOffline(payload);
    actualizarIndicadorColaOffline();

    mostrarModalTicketTermico(
        {
            id: resultadoCola.ventaEncolada.idTemporal,
            turno_caja: payload.turno_caja,
            offline: true,
        },
        resumen,
        metodoPago
    );

    estadoApp.carrito = [];
    renderizarCarritoTicket();
    if ($('estado-caja')) {
        $('estado-caja').textContent = 'Sin internet: la venta quedó guardada y se enviará sola.';
    }
    reproducirSonido(obtenerSonidoParaEvento('venta.offline'));
    mostrarToast('Sin internet: la venta quedó guardada y se enviará sola.', 'advertencia');
};

const cobrarTicketVenta = async () => conCargando($('btn-cobrar-ticket'), async () => {
    const validacionCatalogo = validarCarritoContraCatalogo(
        estadoApp.carrito,
        estadoApp.catalogo
    );
    if (!validacionCatalogo.valido) {
        const esCartaOCarritoVacio =
            !Array.isArray(estadoApp.catalogo) ||
            estadoApp.catalogo.length === 0 ||
            !Array.isArray(estadoApp.carrito) ||
            estadoApp.carrito.length === 0;
        mostrarToast(
            validacionCatalogo.mensaje,
            esCartaOCarritoVacio ? 'advertencia' : 'peligro'
        );
        if ($('estado-caja')) {
            $('estado-caja').textContent = validacionCatalogo.mensaje;
        }
        return;
    }

    const resumen = calcularResumenCarrito(estadoApp.carrito);
    if (resumen.itemsPayload.length === 0) {
        mostrarToast('El ticket de venta está vacío.', 'advertencia');
        return;
    }

    const turnoId = estadoApp.turnoActivo?.estado === 'ABIERTO' ? estadoApp.turnoActivo.id : null;
    if (!turnoId) {
        mostrarToast('No hay un turno de caja abierto. Abrí un turno antes de cobrar.', 'peligro');
        return;
    }

    const metodoRadio = document.querySelector('input[name="medio_pago_radio"]:checked');
    const metodoPago = metodoRadio ? metodoRadio.value : 'EFECTIVO';

    const itemsMapeados = [];
    for (const it of estadoApp.carrito) {
        const prodId = Number(it.productoId || it.producto || it.producto_id);
        if (!Number.isInteger(prodId) || prodId <= 0) {
            mostrarToast('Error: uno de los ítems del ticket no tiene un producto válido.', 'peligro');
            return;
        }
        const itemPayload = {
            producto_id: prodId,
            producto: prodId,
            cantidad: String(it.cantidad),
        };
        if (it.precioUnitarioDecimal && Number(it.precioUnitarioDecimal) > 0) {
            itemPayload.precio_unitario = String(it.precioUnitarioDecimal);
        }
        itemsMapeados.push(itemPayload);
    }

    const idOperacion = generarIdOperacion();
    const payload = {
        id_operacion: idOperacion,
        turno_caja: turnoId,
        medio_pago: metodoPago,
        metodo_pago: metodoPago,
        origen: 'propio',
        items: itemsMapeados,
        items_entrada: itemsMapeados,
    };

    if (navigator.onLine === false || estadoApp.modoConexion === 'offline') {
        registrarCobroEnColaOffline(payload, resumen, metodoPago);
        return;
    }

    try {
        const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/ventas/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${estadoApp.tokenJwt}`,
            },
            body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (res.ok) {
            reproducirSonido(obtenerSonidoParaEvento('venta.cobrada'));
            mostrarToast(`Venta #${data.id} cobrada con éxito.`, 'exito');
            mostrarModalTicketTermico(data, resumen, metodoPago);
            estadoApp.carrito = [];
            renderizarCarritoTicket();
            cargarTurnoActivo();
        } else {
            const err = data.mensaje || data.detail || 'No se pudo registrar la venta';
            mostrarToast(err, 'peligro');
            if ($('estado-caja')) $('estado-caja').textContent = err;
        }
    } catch {
        // Ante caída de red o servidor inaccesible, no bloqueamos al cajero
        registrarCobroEnColaOffline(payload, resumen, metodoPago);
    }
});

const mostrarModalTicketTermico = (datosVenta, resumenCarrito, metodoPago) => {
    const modal = $('modal-ticket-termico');
    if (!modal) return;

    const idFormateado = datosVenta.offline
        ? String(datosVenta.id)
        : `#${String(datosVenta.id).padStart(4, '0')}`;

    if ($('ticket-termico-id')) $('ticket-termico-id').textContent = idFormateado;
    if ($('ticket-termico-fecha')) $('ticket-termico-fecha').textContent = new Date().toLocaleString('es-AR');
    if ($('ticket-termico-cajero')) $('ticket-termico-cajero').textContent = estadoApp.usuario?.username || 'Operador';
    if ($('ticket-termico-turno')) $('ticket-termico-turno').textContent = datosVenta.turno_caja ? `#${datosVenta.turno_caja}` : '-';

    const leyendaEl = $('ticket-termico-leyenda');
    if (leyendaEl) {
        leyendaEl.textContent = datosVenta.offline
            ? 'Comprobante emitido sin internet - se enviará al volver la conexión'
            : 'No válido como factura';
    }

    const itemsBody = $('ticket-termico-items-body');
    if (itemsBody) {
        itemsBody.innerHTML = '';
        for (const item of estadoApp.carrito) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="col-texto">${item.cantidad}x ${escaparHtml(item.nombre)}</td>
                <td class="col-numero">${formatearMoneda(item.subtotalDecimal)}</td>
            `;
            itemsBody.appendChild(tr);
        }
    }

    const totalNum = Number(resumenCarrito.totalDecimal);
    const ivaNum = totalNum - (totalNum / 1.21);

    if ($('ticket-termico-total')) $('ticket-termico-total').textContent = formatearMoneda(resumenCarrito.totalDecimal);
    if ($('ticket-termico-iva')) $('ticket-termico-iva').textContent = formatearMoneda(ivaNum);
    if ($('ticket-termico-metodo')) $('ticket-termico-metodo').textContent = metodoPago;

    modal.style.display = 'flex';
};

// ============================================================
// MÓDULO 2: CAJA Y ARQUEO CIEGO
// ============================================================
export const cargarTurnoActivo = async () => {
    if (estadoApp.modoConexion === 'offline' || navigator.onLine === false) {
        const turnoCache = leerCacheTurnoLocal();
        if (turnoCache) {
            estadoApp.turnoActivo = turnoCache;
            actualizarCardTurnoActivo(turnoCache);
        }
        return;
    }

    try {
        const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/caja/turnos/?limite=100`, {
            headers: {
                'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                'Content-Type': 'application/json',
            },
        });
        if (res.ok) {
            const data = await res.json();
            const turnos = Array.isArray(data) ? data : (data.datos || data.results || []);
            estadoApp.turnosHistorial = turnos;

            const turnoAbierto = turnos.find((t) => t.estado === 'ABIERTO');
            if (turnoAbierto) {
                estadoApp.turnoActivo = turnoAbierto;
                localStorage.setItem(CLAVE_TURNO_CACHE, JSON.stringify(turnoAbierto));
                actualizarCardTurnoActivo(turnoAbierto);
            } else if (turnos.length > 0) {
                estadoApp.turnoActivo = turnos[0];
                localStorage.setItem(CLAVE_TURNO_CACHE, JSON.stringify(turnos[0]));
                actualizarCardTurnoActivo(turnos[0]);
            }
            renderizarTablaTurnosAuditoria();
        }
    } catch {
        const turnoCache = leerCacheTurnoLocal();
        if (turnoCache) {
            estadoApp.turnoActivo = turnoCache;
            actualizarCardTurnoActivo(turnoCache);
        }
    }
};

const actualizarCardTurnoActivo = (turno) => {
    if ($('texto-turno-cabecera')) {
        $('texto-turno-cabecera').textContent = turno.estado === 'ABIERTO'
            ? `Turno #${turno.id} Abierto`
            : `Turno #${turno.id} Cerrado`;
    }

    if ($('caja-turno-estado-texto')) {
        $('caja-turno-estado-texto').textContent = turno.estado === 'ABIERTO'
            ? `Turno #${turno.id} Abierto`
            : `Turno #${turno.id} Cerrado`;
        $('caja-turno-estado-texto').className = turno.estado === 'ABIERTO'
            ? 'badge-estado-verde'
            : 'badge-estado-rojo text-peligro';
    }

    if ($('caja-turno-fondo-inicial')) {
        $('caja-turno-fondo-inicial').textContent =
            turno.efectivo_inicial === null || turno.efectivo_inicial === undefined
                ? 'Confidencial (Arqueo ciego)'
                : formatearMoneda(turno.efectivo_inicial);
    }

    if ($('caja-turno-cajero-texto')) {
        $('caja-turno-cajero-texto').textContent = `Responsable: ${turno.usuario_nombre || estadoApp.usuario?.username || 'Operador'}`;
    }

    if ($('caja-turno-apertura-hora') && turno.apertura) {
        $('caja-turno-apertura-hora').textContent = `Apertura: ${new Date(turno.apertura).toLocaleString('es-AR')}`;
    }

    if ($('caja-turno-ventas-efectivo')) {
        const ventasEfectivo = turno.ventas_efectivo_total;
        $('caja-turno-ventas-efectivo').textContent = (ventasEfectivo === null || ventasEfectivo === undefined)
            ? 'Confidencial (Arqueo ciego)'
            : formatearMoneda(ventasEfectivo);
    }

    if ($('caja-turno-cant-tickets')) {
        if (turno.cantidad_tickets === null || turno.cantidad_tickets === undefined) {
            $('caja-turno-cant-tickets').textContent = 'Confidencial (Arqueo ciego)';
        } else {
            const cant = Number(turno.cantidad_tickets || 0);
            $('caja-turno-cant-tickets').textContent = `${cant} ticket${cant !== 1 ? 's' : ''} emitido${cant !== 1 ? 's' : ''}`;
        }
    }

    if ($('input-turno-id')) {
        $('input-turno-id').value = String(turno.id);
    }

    renderizarMovimientosCaja(turno.movimientos || []);
    aplicarAccionesCajaVisibles();
};

const renderizarMovimientosCaja = (movimientos = []) => {
    const tbody = $('tabla-movimientos-caja-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const lista = Array.isArray(movimientos) ? movimientos : [];
    if (lista.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="col-centro text-muted py-4">No se registran egresos ni ingresos extraordinarios en el turno activo.</td>
            </tr>
        `;
        return;
    }

    for (const m of lista) {
        const tr = document.createElement('tr');
        const esIngreso = m.tipo === 'ENTRADA' || m.tipo === 'INGRESO';
        const hora = m.fecha ? new Date(m.fecha).toLocaleTimeString('es-AR') : '-';
        tr.innerHTML = `
            <td class="col-centro">${hora}</td>
            <td class="col-centro"><span class="${esIngreso ? 'badge-diferencia-sobrante' : 'badge-diferencia-faltante'}">${escaparHtml(m.tipo)}</span></td>
            <td class="col-numero"><strong>${esIngreso ? '+' : '-'} ${formatearMoneda(m.monto)}</strong></td>
            <td class="col-texto">${escaparHtml(m.motivo || '-')}</td>
        `;
        tbody.appendChild(tr);
    }
};

const renderizarTablaTurnosAuditoria = () => {
    const tbody = $('tabla-turnos-historial-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (estadoApp.turnosHistorial.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="col-centro text-muted py-4">No hay turnos registrados aún.</td></tr>`;
        return;
    }

    for (const t of estadoApp.turnosHistorial) {
        const tr = document.createElement('tr');

        let diferenciaBadge = '<span class="badge-diferencia-exacta">$ 0,00</span>';
        if (t.diferencia !== null && t.diferencia !== undefined) {
            const dif = Number(t.diferencia);
            if (dif > 0) {
                diferenciaBadge = `<span class="badge-diferencia-sobrante">+ ${formatearMoneda(dif)} (Sobrante)</span>`;
            } else if (dif < 0) {
                diferenciaBadge = `<span class="badge-diferencia-faltante">${formatearMoneda(dif)} (Faltante)</span>`;
            } else {
                diferenciaBadge = `<span class="badge-diferencia-exacta">Exacto ($ 0,00)</span>`;
            }
        } else if (t.estado === 'ABIERTO') {
            diferenciaBadge = `<span class="text-muted">Turno en curso</span>`;
        }

        tr.innerHTML = `
            <td class="col-centro"><strong>#${t.id}</strong></td>
            <td class="col-texto">${escaparHtml(t.usuario_nombre || 'Operador')}</td>
            <td class="col-centro">${t.apertura ? new Date(t.apertura).toLocaleDateString('es-AR') : '-'}</td>
            <td class="col-centro">${t.cierre ? new Date(t.cierre).toLocaleTimeString('es-AR') : '<span class="badge-estado-verde">Abierto</span>'}</td>
            <td class="col-numero">${t.efectivo_inicial !== null && t.efectivo_inicial !== undefined ? formatearMoneda(t.efectivo_inicial) : `<span class="candado-confidencial">${SVG_ICONOS.candado} Confidencial</span>`}</td>
            <td class="col-numero">${t.efectivo_esperado !== null ? formatearMoneda(t.efectivo_esperado) : `<span class="candado-confidencial">${SVG_ICONOS.candado} Confidencial</span>`}</td>
            <td class="col-numero">${t.efectivo_contado !== null ? formatearMoneda(t.efectivo_contado) : '-'}</td>
            <td class="col-numero">${diferenciaBadge}</td>
            <td class="col-centro"><span class="badge-rol ${t.estado === 'ABIERTO' ? 'cajero' : 'duenio'}">${escaparHtml(t.estado)}</span></td>
        `;
        tbody.appendChild(tr);
    }
};

const cerrarTurnoCaja = async (efectivoContado) => {
    const turnoId = estadoApp.turnoActivo?.id;
    if (!turnoId) {
        mostrarToast('No hay un turno de caja activo para cerrar.', 'advertencia');
        return;
    }

    try {
        const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/caja/turnos/${turnoId}/cerrar/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${estadoApp.tokenJwt}`,
            },
            body: JSON.stringify({ efectivo_contado: efectivoContado }),
        });

        const data = await res.json();

        if (res.ok) {
            reproducirSonido(obtenerSonidoParaEvento('turno.cerrado'));
            mostrarToast('Turno cerrado exitosamente con arqueo ciego.', 'exito');
            if ($('input-efectivo-contado')) $('input-efectivo-contado').value = '';
            cargarTurnoActivo();
        } else {
            mostrarToast(data.mensaje || 'Error al cerrar el turno.', 'peligro');
        }
    } catch (err) {
        console.error('Error de conexión al cerrar caja:', err);
        mostrarToast(mensajeErrorParaUsuario(0), 'peligro');
    }
};

// ============================================================
// MÓDULO 3: COMPRAS, IMPORTACIÓN CSV E IMPORTADOR IA
// ============================================================
export const cargarInsumos = async () => {
    try {
        const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/insumos/?limite=100`, {
            headers: {
                'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                'Content-Type': 'application/json',
            },
        });
        if (res.ok) {
            const data = await res.json();
            estadoApp.insumos = Array.isArray(data) ? data : (data.datos || data.results || []);
            renderizarTablaInsumos();
            poblarSelectoresInsumos();
        }
    } catch {
        // Fallback
    }
};

export const cargarProveedores = async () => {
    try {
        const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/proveedores/?limite=100`, {
            headers: {
                'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                'Content-Type': 'application/json',
            },
        });
        if (res.ok) {
            const data = await res.json();
            estadoApp.proveedores = Array.isArray(data) ? data : (data.datos || data.results || []);
            poblarSelectoresProveedores();
        }
    } catch {
        // Fallback
    }
};

const renderizarTablaInsumos = () => {
    const tbody = $('tabla-insumos-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (estadoApp.insumos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="col-centro text-muted py-4">No hay insumos registrados.</td></tr>`;
        return;
    }

    for (const ins of estadoApp.insumos) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="col-centro">#${ins.id}</td>
            <td class="col-texto"><strong>${escaparHtml(ins.nombre)}</strong></td>
            <td class="col-centro"><span class="producto-codigo-badge">${escaparHtml(ins.unidad_base)}</span></td>
            <td class="col-numero"><strong>${formatearMoneda(ins.costo_unitario)}</strong> / ${escaparHtml(ins.unidad_base)}</td>
            <td class="col-centro"><span class="badge-estado-verde">Activo</span></td>
        `;
        tbody.appendChild(tr);
    }
};

const poblarSelectoresInsumos = () => {
    const selectores = [$('select-compra-insumo'), $('select-receta-insumo')].filter(Boolean);
    for (const sel of selectores) {
        const valorPrevio = sel.value;
        sel.innerHTML = '';
        for (const ins of estadoApp.insumos) {
            const opt = document.createElement('option');
            opt.value = ins.id;
            opt.textContent = `${ins.nombre} (Unidad base: ${ins.unidad_base})`;
            sel.appendChild(opt);
        }
        if (valorPrevio && Array.from(sel.options).some((o) => o.value === valorPrevio)) {
            sel.value = valorPrevio;
        }
    }
    actualizarSelectUnidadReceta();
};

const poblarSelectoresProveedores = () => {
    const sel = $('select-compra-proveedor');
    if (!sel) return;
    sel.innerHTML = '';
    for (const prov of estadoApp.proveedores) {
        const opt = document.createElement('option');
        opt.value = prov.id;
        opt.textContent = prov.nombre;
        sel.appendChild(opt);
    }
};

const descargarPlantillaCsvModelo = () => {
    const contenido = obtenerContenidoPlantillaCsv();
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_lista_proveedor.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    mostrarToast('Plantilla plantilla_lista_proveedor.csv descargada.', 'info');
};

const configurarPdfJsLocal = () => {
    const pdfjsLib = typeof window !== 'undefined' ? window.pdfjsLib : null;
    if (!pdfjsLib || !pdfjsLib.GlobalWorkerOptions) return null;
    const baseApp =
        typeof window !== 'undefined' && window.location.pathname.startsWith('/app')
            ? '/app'
            : '';
    pdfjsLib.GlobalWorkerOptions.workerSrc = `${baseApp}/vendor/pdfjs/pdf.worker.min.js`;
    return pdfjsLib;
};

const leerArchivoComoArrayBuffer = (archivo) => {
    if (typeof archivo?.arrayBuffer === 'function') {
        return archivo.arrayBuffer();
    }
    return new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = (ev) => resolve(ev.target?.result);
        lector.onerror = () => reject(new Error('No se pudo leer el archivo como ArrayBuffer.'));
        lector.readAsArrayBuffer(archivo);
    });
};

const mostrarEstadoArchivoPdf = (mensaje, tipo = 'info') => {
    const el = $('estado-archivo-lista-ia');
    if (!el) return;
    if (!mensaje) {
        el.style.display = 'none';
        el.textContent = '';
        el.className = 'alerta-archivo-pdf';
        return;
    }
    el.style.display = 'block';
    el.className = `alerta-archivo-pdf ${tipo}`;
    el.textContent = String(mensaje);
};

const procesarArchivoPdfSeleccionado = async (archivo, origenSelector = 'ia') => {
    if (!archivo) return;
    mostrarEstadoArchivoPdf(`Leyendo el PDF “${archivo.name}”…`, 'info');
    try {
        const pdfjsLib = configurarPdfJsLocal();
        const buffer = await leerArchivoComoArrayBuffer(archivo);
        const resultado = await extraerTextoDePdfBuffer(buffer, pdfjsLib);

        if (!resultado.ok || resultado.esEscaneado) {
            estadoApp.ultimoOrigenArchivo = 'texto';
            if ($('textarea-lista-ia')) {
                $('textarea-lista-ia').value = '';
            }
            const aviso = resultado.mensajeError || 'El PDF parece ser una imagen escaneada sin texto seleccionable. Convertilo a texto/CSV o usá un PDF con texto.';
            mostrarEstadoArchivoPdf(aviso, 'advertencia');
            mostrarToast(aviso, 'advertencia');
            return;
        }

        estadoApp.ultimoOrigenArchivo = 'pdf';
        if ($('textarea-lista-ia')) {
            $('textarea-lista-ia').value = resultado.texto;
        }
        const evalCsv = evaluarTextoComoCsvDirecto(resultado.texto);
        if (evalCsv.compatible) {
            aplicarCsvParseadoEnPreview(evalCsv.resultado, 'pdf');
        } else {
            estadoApp.csvContingenciaFallback = null;
        }
        const etiquetaPaginas = resultado.paginas === 1 ? '1 página' : `${resultado.paginas} páginas`;
        mostrarEstadoArchivoPdf(
            `PDF “${archivo.name}” leído (${etiquetaPaginas}). Listo para analizar con la IA.`,
            'info'
        );
        mostrarToast(
            `Archivo leído: ${resultado.lineas} renglones listos para revisar`,
            'exito'
        );
        if (origenSelector === 'csv') {
            $('textarea-lista-ia')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
        }
    } catch (err) {
        console.error('Error al leer PDF:', err);
        const msg = 'No se pudo leer el archivo PDF.';
        mostrarEstadoArchivoPdf(msg, 'advertencia');
        mostrarToast(msg, 'peligro');
    }
};

const procesarArchivoExcelSeleccionado = async (archivo, origenSelector = 'csv') => {
    if (!archivo) return;
    mostrarEstadoArchivoPdf(`Leyendo la planilla “${archivo.name}”…`, 'info');
    try {
        const xlsxLib = typeof window !== 'undefined' ? window.XLSX : null;
        const buffer = await leerArchivoComoArrayBuffer(archivo);
        const { csv, nombreHoja, totalHojas, lineas } = extraerCsvDeExcelBuffer(buffer, xlsxLib);
        const { compatible, resultado } = evaluarCsvPlantillaDirecta(csv);

        if (compatible && resultado.items.length > 0) {
            aplicarCsvParseadoEnPreview(resultado, 'archivo CSV');
            const avisoHojas =
                totalHojas > 1 ? ` (primera hoja “${nombreHoja}” de ${totalHojas})` : '';
            mostrarEstadoArchivoPdf(
                `Archivo leído: ${resultado.items.length} renglones listos para revisar (sin IA)${avisoHojas}.`,
                'info'
            );
            mostrarToast(
                `Archivo leído: ${resultado.items.length} renglones listos para revisar`,
                'exito'
            );
            if (origenSelector === 'ia') {
                $('panel-preview-csv')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
            }
            return;
        }

        estadoApp.csvParseadoActual = null;
        estadoApp.csvContingenciaFallback = null;
        if ($('panel-preview-csv')) {
            $('panel-preview-csv').style.display = 'none';
        }
        estadoApp.ultimoOrigenArchivo = 'csv';
        if ($('textarea-lista-ia')) {
            $('textarea-lista-ia').value = csv;
        }
        const avisoHojas = totalHojas > 1 ? ` (primera hoja “${nombreHoja}”)` : '';
        mostrarEstadoArchivoPdf(
            `Planilla “${archivo.name}”${avisoHojas} leída (${lineas} renglones). Lista para analizar con la IA.`,
            'info'
        );
        mostrarToast(
            `Archivo leído: ${lineas} renglones listos para revisar`,
            'info'
        );
        if (origenSelector === 'csv') {
            $('textarea-lista-ia')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
        }
    } catch (err) {
        console.error('Error al leer Excel:', err);
        const msg = 'No se pudo leer la planilla.';
        mostrarEstadoArchivoPdf(msg, 'advertencia');
        mostrarToast(msg, 'peligro');
    }
};

const procesarArchivoDocxSeleccionado = async (archivo, origenSelector = 'ia') => {
    if (!archivo) return;
    mostrarEstadoArchivoPdf(`Leyendo el Word “${archivo.name}”…`, 'info');
    try {
        const mammothLib = typeof window !== 'undefined' ? window.mammoth : null;
        const buffer = await leerArchivoComoArrayBuffer(archivo);
        const resultado = await extraerTextoDeDocxBuffer(buffer, mammothLib);

        estadoApp.ultimoOrigenArchivo = 'texto';
        if ($('textarea-lista-ia')) {
            $('textarea-lista-ia').value = resultado.texto;
        }
        const evalCsv = evaluarTextoComoCsvDirecto(resultado.texto);
        if (evalCsv.compatible) {
            aplicarCsvParseadoEnPreview(evalCsv.resultado, 'docx');
        } else {
            estadoApp.csvContingenciaFallback = null;
        }
        mostrarEstadoArchivoPdf(
            `Word “${archivo.name}” leído (${resultado.lineas} renglones). Listo para analizar con la IA.`,
            'info'
        );
        mostrarToast(
            `Archivo leído: ${resultado.lineas} renglones listos para revisar`,
            'exito'
        );
        if (origenSelector === 'csv') {
            $('textarea-lista-ia')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
        }
    } catch (err) {
        console.error('Error al leer Word:', err);
        const msg = 'No se pudo leer el archivo Word.';
        mostrarEstadoArchivoPdf(msg, 'advertencia');
        mostrarToast(msg, 'peligro');
    }
};

const limpiarFotoImportacionActual = ({ limpiarAviso = false } = {}) => {
    estadoApp.imagenImportacionActual = null;
    const preview = $('preview-foto-lista-ia');
    const imgPreview = $('img-preview-foto-ia');
    const textarea = $('textarea-lista-ia');
    if (preview) preview.style.display = 'none';
    if (imgPreview) imgPreview.removeAttribute('src');
    if (textarea) textarea.required = true;
    if (estadoApp.ultimoOrigenArchivo === 'imagen') {
        estadoApp.ultimoOrigenArchivo = 'texto';
    }
    if (limpiarAviso) {
        mostrarEstadoArchivoPdf('', 'info');
    }
};

const redimensionarImagenParaImportacion = async (archivo) => {
    const dataUrlOriginal = await new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = () => resolve(String(lector.result || ''));
        lector.onerror = () => reject(new Error('No se pudo leer la foto seleccionada.'));
        lector.readAsDataURL(archivo);
    });

    const imagen = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('No se pudo cargar la foto. Probá con otra imagen.'));
        img.src = dataUrlOriginal;
    });

    const { ancho, alto } = calcularDimensionesReescaladoImagen(
        imagen.naturalWidth || imagen.width,
        imagen.naturalHeight || imagen.height,
        LADO_MAXIMO_IMAGEN_IMPORTACION_PX
    );

    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Tu navegador no pudo preparar la foto para analizar.');
    }
    // Fondo blanco para evitar transparencias oscuras al convertir PNG/WEBP a JPEG
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(imagen, 0, 0, ancho, alto);

    const dataUrlJpeg = canvas.toDataURL('image/jpeg', CALIDAD_JPEG_IMAGEN_IMPORTACION);
    const base64 = extraerBase64DeDataUrl(dataUrlJpeg);
    if (!base64) {
        throw new Error('No se pudo preparar la foto en formato JPEG.');
    }

    return {
        dataUrl: dataUrlJpeg,
        base64,
        mime: 'image/jpeg',
        ancho,
        alto,
    };
};

const procesarArchivoImagenSeleccionado = async (archivo, origenSelector = 'ia') => {
    if (!archivo) return;
    mostrarEstadoArchivoPdf(`Preparando la foto “${archivo.name}”…`, 'info');
    try {
        const { dataUrl, base64, mime, ancho, alto } =
            await redimensionarImagenParaImportacion(archivo);

        estadoApp.imagenImportacionActual = {
            base64,
            mime,
            dataUrl,
            nombre: archivo.name,
            ancho,
            alto,
        };
        estadoApp.ultimoOrigenArchivo = 'imagen';
        estadoApp.csvParseadoActual = null;
        estadoApp.csvContingenciaFallback = null;
        if ($('panel-preview-csv')) {
            $('panel-preview-csv').style.display = 'none';
        }
        const textarea = $('textarea-lista-ia');
        if (textarea) {
            textarea.value = '';
            textarea.required = false;
        }
        if ($('img-preview-foto-ia')) {
            $('img-preview-foto-ia').src = dataUrl;
        }
        if ($('texto-preview-foto-ia')) {
            $('texto-preview-foto-ia').textContent = MENSAJE_FOTO_LISTA_IA;
        }
        if ($('preview-foto-lista-ia')) {
            $('preview-foto-lista-ia').style.display = 'flex';
        }
        mostrarEstadoArchivoPdf(MENSAJE_FOTO_LISTA_IA, 'info');
        mostrarToast(MENSAJE_FOTO_LISTA_IA, 'exito');
        if (origenSelector === 'csv') {
            $('preview-foto-lista-ia')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
        }
    } catch (err) {
        console.error('Error al preparar la foto:', err);
        limpiarFotoImportacionActual();
        const msg = 'No se pudo procesar la foto seleccionada.';
        mostrarEstadoArchivoPdf(msg, 'advertencia');
        mostrarToast(msg, 'peligro');
    }
};

const aplicarCsvParseadoEnPreview = (resultado, origenEtiqueta = 'archivo CSV') => {
    limpiarFotoImportacionActual();
    estadoApp.csvParseadoActual = resultado;
    estadoApp.csvContingenciaFallback = resultado;
    estadoApp.ultimoOrigenArchivo =
        origenEtiqueta === 'pdf'
            ? 'pdf'
            : origenEtiqueta === 'docx'
              ? 'texto'
              : 'csv';
    renderizarPreviewCsv(resultado);
    if ($('textarea-lista-ia') && resultado.textoParaIa && origenEtiqueta === 'archivo CSV') {
        $('textarea-lista-ia').value = resultado.textoParaIa;
    }
};

const procesarArchivoImportacionSeleccionado = async (archivo, origenSelector = 'csv') => {
    if (!archivo) return;
    if (esArchivoDocAntiguo(archivo)) {
        mostrarEstadoArchivoPdf(MENSAJE_DOC_ANTIGUO, 'advertencia');
        mostrarToast(MENSAJE_DOC_ANTIGUO, 'advertencia');
        return;
    }

    const validacionArchivo = validarArchivoImportacionGeneral(archivo);
    if (!validacionArchivo.valido) {
        mostrarEstadoArchivoPdf(validacionArchivo.mensajeError, 'advertencia');
        mostrarToast(validacionArchivo.mensajeError, 'peligro');
        return;
    }

    const validacionTamano = validarTamanoArchivoImportacion(archivo);
    if (!validacionTamano.valido) {
        mostrarEstadoArchivoPdf(validacionTamano.mensajeError, 'advertencia');
        mostrarToast(validacionTamano.mensajeError, 'peligro');
        return;
    }

    if (esArchivoImagenImportacion(archivo)) {
        await procesarArchivoImagenSeleccionado(archivo, origenSelector);
        return;
    }

    limpiarFotoImportacionActual();

    if (esArchivoPdf(archivo)) {
        await procesarArchivoPdfSeleccionado(archivo, origenSelector);
        return;
    }
    if (esArchivoExcel(archivo)) {
        await procesarArchivoExcelSeleccionado(archivo, origenSelector);
        return;
    }
    if (esArchivoDocx(archivo)) {
        await procesarArchivoDocxSeleccionado(archivo, origenSelector);
        return;
    }

    mostrarEstadoArchivoPdf('', 'info');
    const lector = new FileReader();
    lector.onload = (evento) => {
        const texto = String(evento.target?.result || '');
        const resultado = parsearCsvProveedor(texto);
        if (resultado.items.length > 0) {
            aplicarCsvParseadoEnPreview(resultado, 'archivo CSV');
            mostrarToast(
                `Archivo leído: ${resultado.items.length} renglones listos para revisar`,
                'exito'
            );
            return;
        }
        if (origenSelector === 'ia' && texto.trim().length > 0) {
            estadoApp.ultimoOrigenArchivo = 'texto';
            if ($('textarea-lista-ia')) {
                $('textarea-lista-ia').value = texto.trim();
            }
            mostrarToast(`Archivo de texto "${archivo.name}" cargado en el editor.`, 'info');
            return;
        }
        mostrarToast('El archivo no contiene filas válidas de insumos y precios.', 'advertencia');
    };
    lector.readAsText(archivo, 'utf-8');
};

const previsualizarCsvDesdeTexto = () => {
    const textoCrudo = $('textarea-lista-ia')?.value || '';
    const { compatible, resultado } = evaluarTextoComoCsvDirecto(textoCrudo);
    if (!compatible || resultado.items.length === 0) {
        mostrarToast(
            'El texto no tiene el formato de la planilla modelo. Descargá la planilla modelo para ver cómo tiene que estar.',
            'advertencia'
        );
        return;
    }
    aplicarCsvParseadoEnPreview(resultado, 'texto pegado');
    $('panel-preview-csv')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    mostrarToast(
        `Vista previa sin IA: ${resultado.items.length} renglones listos para revisar.`,
        'exito'
    );
};

const renderizarPreviewCsv = (resultadoCsv) => {
    const panel = $('panel-preview-csv');
    const tbody = $('tabla-preview-csv-body');
    const resumen = $('resumen-preview-csv');
    if (!panel || !tbody || !resumen) return;

    const etiquetaDelimitador =
        resultadoCsv.delimitadorDetectado === '\t' ? 'TAB' : resultadoCsv.delimitadorDetectado || ',';
    panel.style.display = 'block';
    resumen.textContent = `${resultadoCsv.items.length} renglones detectados · Sin IA · Envío total: ${formatearMoneda(resultadoCsv.envioTotal)} · Separador: "${etiquetaDelimitador}"`;
    tbody.innerHTML = '';

    for (const item of resultadoCsv.items) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="col-texto"><strong>${escaparHtml(item.nombre_insumo)}</strong></td>
            <td class="col-centro">${escaparHtml(item.cantidad)}</td>
            <td class="col-centro"><span class="producto-codigo-badge">${escaparHtml(item.unidad)}</span></td>
            <td class="col-numero font-bold">${formatearMoneda(item.precio_total)}</td>
            <td class="col-numero">${escaparHtml(item.alicuota)}%</td>
            <td class="col-numero">${formatearMoneda(item.envio)}</td>
        `;
        tbody.appendChild(tr);
    }
};

const construirHtmlAlertaContingenciaIA = ({
    mensajePrincipal = MENSAJE_IA_NO_DISPONIBLE,
    detalleTecnico = '',
    advertencias = [],
    sugerenciaAlternativa = '',
    mostrarBotonCsvDirecto = false,
} = {}) => {
    // Las advertencias de contingencia son errores técnicos (ej. "fetch failed"): quedan en
    // los logs de Node y no se muestran. El motivo solo se muestra si agrega algo al título.
    void advertencias;
    const listaAdvertencias = [];
    const motivoRepetido = String(detalleTecnico || '')
        .replace(/\.$/, '')
        .startsWith(String(mensajePrincipal || '').replace(/\.$/, ''));
    const detalleHtml = detalleTecnico && !motivoRepetido
        ? `<p class="alerta-contingencia-ia-detalle"><strong>Motivo:</strong> ${escaparHtml(detalleTecnico)}</p>`
        : '';
    const advertenciasHtml =
        listaAdvertencias.length > 0
            ? `<ul class="alerta-contingencia-ia-lista">${listaAdvertencias.map((adv) => `<li>${escaparHtml(adv)}</li>`).join('')}</ul>`
            : '';
    const alternativaHtml = sugerenciaAlternativa
        ? `<p class="alerta-contingencia-ia-alternativa">${escaparHtml(sugerenciaAlternativa)}</p>`
        : '';
    const botonCsvHtml = mostrarBotonCsvDirecto
        ? `<div class="alerta-contingencia-ia-acciones">
                <button type="button" id="btn-contingencia-usar-csv-directo" class="btn-exito-comercial">
                    Ver vista previa sin IA
                </button>
           </div>`
        : '';

    return `
        <div class="alerta-contingencia-ia-titulo">
            ${SVG_ICONOS.alerta}
            <span>${escaparHtml(mensajePrincipal)}</span>
        </div>
        ${detalleHtml}
        ${advertenciasHtml}
        ${alternativaHtml}
        ${botonCsvHtml}
    `;
};

const enviarCsvAlCircuitoAprobacion = async () => {
    const csv = estadoApp.csvParseadoActual;
    if (!csv || csv.items.length === 0) {
        mostrarToast('Primero cargá una planilla válida.', 'advertencia');
        return;
    }

    const proveedorNombre = $('input-proveedor-ia')?.value.trim() || 'Proveedor Planilla CSV';
    if ($('textarea-lista-ia')) {
        $('textarea-lista-ia').value = csv.textoParaIa;
    }
    if ($('estado-importacion-ia')) {
        $('estado-importacion-ia').textContent = 'Analizando con IA...';
    }

    renderizarPropuestaIAComercial({
        _id: null,
        estado: 'PROCESANDO',
        entrada: { proveedorNombre, textoLista: csv.textoParaIa },
        salida: { proveedorDetectado: proveedorNombre, envioDetectado: '0.00', items: [] },
    });

    try {
        const res = await fetchConSesion(`${estadoApp.nodeUrl}/api/importaciones`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${estadoApp.tokenJwt}`,
            },
            body: JSON.stringify({
                proveedorNombre,
                textoLista: csv.textoParaIa,
                versionPrompt: 'v1',
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 202 && data.importacionId) {
            mostrarToast('Planilla enviada al circuito de aprobación. Analizando con IA...', 'info');
            const datosDetalle = await consultarDetalleImportacion(data.importacionId);
            const evaluacion = evaluarEstadoImportacionIA(datosDetalle);
            if ($('estado-importacion-ia')) {
                $('estado-importacion-ia').textContent = evaluacion.esContingencia
                    ? MENSAJE_IA_NO_DISPONIBLE
                    : evaluacion.enProceso
                      ? 'Analizando con IA...'
                      : 'Propuesta lista para revisión en el Paso 2.';
            }
            if (evaluacion.esContingencia) {
                mostrarToast(MENSAJE_IA_NO_DISPONIBLE, 'advertencia');
            }
        } else {
            console.warn('Error al enviar lista al servicio de IA:', res.status, data);
            const motivo = mensajeErrorParaUsuario(res.status, data?.mensaje);
            renderizarPropuestaIAComercial({
                _id: null,
                estado: 'CONTINGENCIA',
                contingencia: true,
                proveedorIa: 'contingencia',
                mensajeContingencia: motivo,
                advertencias: data?.detalles ? [String(data.detalles)] : [],
                salida: { proveedorDetectado: proveedorNombre, envioDetectado: '0.00', items: [] },
            });
            if ($('estado-importacion-ia')) {
                $('estado-importacion-ia').textContent = MENSAJE_IA_NO_DISPONIBLE;
            }
            mostrarToast(MENSAJE_IA_NO_DISPONIBLE, 'advertencia');
        }
    } catch (err) {
        console.error('Error al consultar servicio de importación IA:', err);
        renderizarPropuestaIAComercial({
            _id: null,
            estado: 'CONTINGENCIA',
            contingencia: true,
            proveedorIa: 'contingencia',
            mensajeContingencia: 'No se pudo conectar con el servicio de importación IA.',
            advertencias: ['No pudimos comunicarnos con el servidor de IA.'],
            salida: { proveedorDetectado: proveedorNombre, envioDetectado: '0.00', items: [] },
        });
        if ($('estado-importacion-ia')) {
            $('estado-importacion-ia').textContent = MENSAJE_IA_NO_DISPONIBLE;
        }
        mostrarToast(MENSAJE_IA_NO_DISPONIBLE, 'advertencia');
    }
};

const confirmarCsvDirectoEnInventario = async () => conCargando($('btn-csv-confirmar-directo'), async () => {
    try {
        const csv = estadoApp.csvParseadoActual;
        if (!csv || csv.items.length === 0) {
            mostrarToast('Primero cargá una planilla válida.', 'advertencia');
            return;
        }

        const proveedorNombre = $('input-proveedor-ia')?.value.trim() || 'Proveedor Planilla CSV';

        const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/compras/confirmar-importacion/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${estadoApp.tokenJwt}`,
            },
            body: JSON.stringify({
                proveedor_nombre: proveedorNombre,
                envio: csv.envioTotal,
                items: csv.items.map((it) => ({
                    nombre_insumo: it.nombre_insumo,
                    cantidad: it.cantidad,
                    unidad: it.unidad,
                    precio_total: it.precio_total,
                    iva_incluido: true,
                    alicuota: it.alicuota,
                })),
            }),
        });

        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            reproducirSonido(obtenerSonidoParaEvento('importacion.confirmada'));
            mostrarToast(
                `Precios confirmados sin IA: ${data.compras_creadas?.length || csv.items.length} compras registradas y costos actualizados.`,
                'exito'
            );
            estadoApp.csvParseadoActual = null;
            estadoApp.csvContingenciaFallback = null;
            if ($('panel-preview-csv')) $('panel-preview-csv').style.display = 'none';
            if ($('panel-revision-ia') && estadoApp.importacionActual?.contingencia) {
                $('panel-revision-ia').style.display = 'none';
            }
            await cargarInsumos();
            await cargarCatalogo();
        } else {
            console.warn('Error al confirmar importación directa:', res.status, data);
            mostrarToast(mensajeErrorParaUsuario(res.status, data?.mensaje), 'peligro');
        }
    } catch (err) {
        console.error('Error de red al confirmar importación:', err);
        mostrarToast(mensajeErrorParaUsuario(0), 'peligro');
    }
});

const consultarDetalleImportacion = async (importacionId, intento = 1) => {
    try {
        const res = await fetchConSesion(`${estadoApp.nodeUrl}/api/importaciones/${importacionId}`, {
            headers: { 'Authorization': `Bearer ${estadoApp.tokenJwt}` },
        });
        const datos = await res.json().catch(() => ({}));
        if (res.ok) {
            if (
                (datos.estado === 'PENDIENTE' || datos.estado === 'PROCESANDO') &&
                intento < 40
            ) {
                if (intento === 1) {
                    renderizarPropuestaIAComercial(datos);
                }
                await new Promise((r) => setTimeout(r, 500));
                return await consultarDetalleImportacion(importacionId, intento + 1);
            }
            renderizarPropuestaIAComercial(datos);
            return datos;
        }

        console.warn('Error al consultar resultado de importación IA:', res.status, datos);
        const docError = {
            _id: importacionId,
            estado: 'CONTINGENCIA',
            contingencia: true,
            proveedorIa: 'contingencia',
            mensajeContingencia: mensajeErrorParaUsuario(res.status, datos?.mensaje),
            salida: { items: [] },
        };
        renderizarPropuestaIAComercial(docError);
        return docError;
    } catch (err) {
        console.error('Error al consultar importación IA:', err);
        const docError = {
            _id: importacionId,
            estado: 'CONTINGENCIA',
            contingencia: true,
            proveedorIa: 'contingencia',
            mensajeContingencia: 'Error de conexión al consultar el servicio de IA.',
            salida: { items: [] },
        };
        renderizarPropuestaIAComercial(docError);
        return docError;
    }
};

const renderizarPropuestaIAComercial = (doc) => {
    const panel = $('panel-revision-ia');
    const tabla = $('tabla-items-ia-body');
    const banner = $('ia-resumen-banner');
    const alertaContingencia = $('ia-alerta-contingencia');
    const btnAprobar = $('btn-aprobar-ia');
    const btnRechazar = $('btn-rechazar-ia');
    const pasoCirculo = $('ia-paso2-circulo');
    if (!panel || !tabla || !banner) return;

    panel.style.display = 'block';
    const salida = doc?.salida || {};
    const evaluacion = evaluarEstadoImportacionIA(doc);

    if (evaluacion.enProceso) {
        if (alertaContingencia) {
            alertaContingencia.style.display = 'none';
            alertaContingencia.innerHTML = '';
        }
        if (pasoCirculo) {
            pasoCirculo.className = 'paso-circulo';
        }
        estadoApp.importacionActual = {
            ...(doc || {}),
            salida: { ...salida, items: [] },
        };
        banner.innerHTML = `
            <div class="alerta-procesando-ia">
                <strong>Analizando con IA...</strong>
                <span>${escaparHtml(evaluacion.detalleTecnico)}</span>
            </div>
        `;
        tabla.innerHTML = `
            <tr>
                <td colspan="5" class="col-centro text-muted py-4">Analizando con IA... Esperando respuesta del servicio.</td>
            </tr>
        `;
        if (btnAprobar) {
            btnAprobar.disabled = true;
            btnAprobar.style.display = 'inline-flex';
        }
        if (btnRechazar) {
            btnRechazar.disabled = true;
        }
        return;
    }

    if (evaluacion.esContingencia) {
        if (pasoCirculo) {
            pasoCirculo.className = 'paso-circulo';
        }
        const textoCandidatoCsv = doc?.entrada?.textoLista || $('textarea-lista-ia')?.value || '';
        const evalCsvTexto = evaluarTextoComoCsvDirecto(textoCandidatoCsv);
        const csvDisponible =
            estadoApp.csvContingenciaFallback?.items?.length > 0
                ? estadoApp.csvContingenciaFallback
                : evalCsvTexto.compatible
                  ? evalCsvTexto.resultado
                  : null;
        estadoApp.csvContingenciaFallback = csvDisponible;

        if (alertaContingencia) {
            alertaContingencia.style.display = 'block';
            alertaContingencia.innerHTML = construirHtmlAlertaContingenciaIA({
                ...evaluacion,
                mostrarBotonCsvDirecto: Boolean(csvDisponible && csvDisponible.items.length > 0),
            });
            $('btn-contingencia-usar-csv-directo')?.addEventListener('click', () => {
                if (!estadoApp.csvContingenciaFallback) return;
                estadoApp.csvParseadoActual = estadoApp.csvContingenciaFallback;
                renderizarPreviewCsv(estadoApp.csvParseadoActual);
                $('panel-preview-csv')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
                mostrarToast(
                    `Vista previa sin IA: ${estadoApp.csvParseadoActual.items.length} renglones listos para confirmar.`,
                    'info'
                );
            });
        }
        estadoApp.importacionActual = {
            ...(doc || {}),
            contingencia: true,
            salida: {
                ...salida,
                items: [],
            },
        };
        banner.innerHTML = `
            <strong>Estado:</strong> <span class="badge-alerta-amarilla">${escaparHtml(doc?.estado || 'CONTINGENCIA')}</span> ·
            <strong>Proveedor IA:</strong> ${escaparHtml(doc?.proveedorIa || doc?.proveedor_ia || 'contingencia')}
        `;
        tabla.innerHTML = `
            <tr>
                <td colspan="5" class="col-centro text-muted py-4">No hay propuesta generada por IA porque el servicio entró en modo contingencia.</td>
            </tr>
        `;
        if (btnAprobar) {
            btnAprobar.disabled = true;
            btnAprobar.style.display = 'none';
        }
        if (btnRechazar) {
            btnRechazar.disabled = false;
            const spanRechazar = btnRechazar.querySelector('span');
            if (spanRechazar) {
                spanRechazar.textContent = doc?._id ? 'Descartar Registro' : 'Cerrar Aviso';
            }
        }
        return;
    }

    if (alertaContingencia) {
        alertaContingencia.style.display = 'none';
        alertaContingencia.innerHTML = '';
    }
    if (pasoCirculo) {
        pasoCirculo.className = 'paso-circulo exito';
    }

    let itemsCrudos = [];
    if (Array.isArray(salida.items) && salida.items.length > 0) {
        itemsCrudos = salida.items;
    } else if (Array.isArray(doc?.items) && doc.items.length > 0) {
        itemsCrudos = doc.items;
    } else if (Array.isArray(doc?.propuesta?.items) && doc.propuesta.items.length > 0) {
        itemsCrudos = doc.propuesta.items;
    }

    const envioDetectado = salida.envioDetectado ?? doc?.envioDetectado ?? doc?.propuesta?.envioDetectado ?? 0;

    const itemsNormalizados = itemsCrudos.map((it) => {
        const nombre =
            it.insumo ||
            it.nombre ||
            it.insumo_nombre ||
            it.nombreInsumo ||
            it.nombre_insumo ||
            'Insumo';
        const cantidad = String(it.cantidad ?? '1');
        const unidad = String(it.unidad || 'un');
        const precio = String(
            it.precio_total ??
            it.precio ??
            it.costo_total ??
            it.precioTotal ??
            '0.00'
        );
        const alicuota = String(it.alicuota ?? it.alicuotaIva ?? '21.00');
        const confianzaNum = Number(it.confianza ?? 0.98);
        return {
            insumo: nombre,
            nombre,
            insumo_nombre: nombre,
            nombreInsumo: nombre,
            nombre_insumo: nombre,
            cantidad,
            unidad,
            precio,
            precio_total: precio,
            costo_total: precio,
            precioTotal: precio,
            ivaIncluido: it.ivaIncluido ?? it.iva_incluido ?? true,
            iva_incluido: it.iva_incluido ?? it.ivaIncluido ?? true,
            alicuota,
            confianza: Number.isFinite(confianzaNum) ? confianzaNum : 0.98,
        };
    });

    const proveedorDetectado =
        salida.proveedorDetectado ||
        doc?.proveedorDetectado ||
        doc?.propuesta?.proveedorDetectado ||
        doc?.entrada?.proveedorNombre ||
        $('input-proveedor-ia')?.value.trim() ||
        'Distribuidora';

    estadoApp.importacionActual = {
        ...doc,
        _id: doc._id,
        salida: {
            ...salida,
            proveedorDetectado,
            envioDetectado: String(envioDetectado || '0.00'),
            items: itemsNormalizados,
        },
    };

    banner.innerHTML = `
        <strong>Proveedor Detectado:</strong> ${escaparHtml(proveedorDetectado)} ·
        <strong>Flete Prorrateado:</strong> ${formatearMoneda(envioDetectado || 0)} ·
        <strong>Proveedor IA:</strong> ${escaparHtml(doc?.proveedorIa || 'IA')} ·
        <strong>Estado:</strong> <span class="badge-rol duenio">${escaparHtml(doc?.estado || 'LISTA')}</span>
    `;

    if (btnAprobar) {
        btnAprobar.style.display = 'inline-flex';
        btnAprobar.disabled = itemsNormalizados.length === 0;
    }
    if (btnRechazar) {
        btnRechazar.disabled = false;
        const spanRechazar = btnRechazar.querySelector('span');
        if (spanRechazar) {
            spanRechazar.textContent = 'Descartar Borrador';
        }
    }

    tabla.innerHTML = '';
    if (itemsNormalizados.length === 0) {
        tabla.innerHTML = `
            <tr>
                <td colspan="5" class="col-centro text-muted py-4">No se detectaron líneas con precios válidos en el texto ingresado.</td>
            </tr>
        `;
        return;
    }

    for (const it of itemsNormalizados) {
        const tr = document.createElement('tr');
        const pctConfianza = Math.round(
            (it.confianza <= 1 ? it.confianza * 100 : it.confianza)
        );
        tr.innerHTML = `
            <td class="col-texto"><strong>${escaparHtml(it.nombreInsumo)}</strong></td>
            <td class="col-centro">${escaparHtml(it.cantidad)}</td>
            <td class="col-centro"><span class="producto-codigo-badge">${escaparHtml(it.unidad)}</span></td>
            <td class="col-numero font-bold">${formatearMoneda(it.precioTotal)}</td>
            <td class="col-centro"><span class="badge-estado-verde">${pctConfianza}%</span></td>
        `;
        tabla.appendChild(tr);
    }
};

// ============================================================
// MÓDULO 4: INGENIERÍA DE RECETAS Y RENTABILIDAD
// ============================================================
const actualizarVisibilidadGestionRecetas = () => {
    const btnNuevo = $('btn-modal-nuevo-producto');
    if (btnNuevo) {
        btnNuevo.style.display = usuarioTienePermiso(estadoApp.usuario, 'recetas.crear') ? '' : 'none';
    }
    const btnQr = $('btn-qr-carta-publica');
    if (btnQr) {
        btnQr.hidden = !puedeGestionarQrCarta(estadoApp.usuario);
    }
};

let ultimoSvgQrCartaGenerado = '';

const abrirModalQrCarta = () => {
    if (!puedeGestionarQrCarta(estadoApp.usuario)) return;
    const modal = $('modal-qr-carta');
    if (!modal) return;

    const urlCarta = construirUrlCartaPublica(window.location.origin, window.location.pathname);
    ultimoSvgQrCartaGenerado = generarSvgQrCarta(urlCarta, { tamanoPx: 248 });

    const contenedorSvg = $('qr-carta-svg-contenedor');
    if (contenedorSvg) {
        contenedorSvg.innerHTML = ultimoSvgQrCartaGenerado;
    }
    if ($('qr-carta-cartel-url')) {
        $('qr-carta-cartel-url').textContent = urlCarta;
    }
    if ($('input-url-carta-publica')) {
        $('input-url-carta-publica').value = urlCarta;
    }
    if ($('link-abrir-carta-publica')) {
        $('link-abrir-carta-publica').href = urlCarta;
    }
    modal.style.display = 'flex';
};

const actualizarSelectUnidadReceta = () => {
    const selInsumo = $('select-receta-insumo');
    const selUnidad = $('select-receta-unidad');
    if (!selUnidad) return;

    const insumoId = selInsumo ? Number(selInsumo.value) : null;
    const insumoSel = estadoApp.insumos.find((i) => Number(i.id) === insumoId);
    const opciones = obtenerUnidadesCompatiblesReceta(insumoSel?.unidad_base || '');

    selUnidad.innerHTML = '';
    for (const op of opciones) {
        const opt = document.createElement('option');
        opt.value = op.valor;
        opt.textContent = op.etiqueta;
        selUnidad.appendChild(opt);
    }
    if (insumoSel?.unidad_base) {
        selUnidad.value = insumoSel.unidad_base;
    }
};

const abrirModalEditarPrecioProducto = (producto) => {
    const modal = $('modal-editar-precio-producto');
    if (!modal || !producto) return;
    if ($('input-editar-precio-id')) $('input-editar-precio-id').value = String(producto.id);
    if ($('editar-precio-producto-nombre')) {
        $('editar-precio-producto-nombre').textContent = producto.nombre || '';
    }
    if ($('input-editar-precio-venta')) {
        $('input-editar-precio-venta').value = producto.precio_venta ?? '';
    }
    modal.style.display = 'flex';
};

const renderizarTablaRecetas = () => {
    actualizarVisibilidadGestionRecetas();

    const tbody = $('tabla-recetas-productos-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!Array.isArray(estadoApp.catalogo) || estadoApp.catalogo.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="col-centro text-muted py-4">No hay productos cargados en la carta.</td>
            </tr>
        `;
        return;
    }

    const esCajero = estadoApp.usuario?.rol === 'CAJERO';
    const puedeEditar = usuarioTienePermiso(estadoApp.usuario, 'recetas.editar');

    for (const p of estadoApp.catalogo) {
        const tr = document.createElement('tr');

        const precio = Number(p.precio_venta) || 0;
        const costo = p.costo_total_calculado !== null && p.costo_total_calculado !== undefined
            ? Number(p.costo_total_calculado)
            : null;
        const ganancia = p.ganancia_bruta !== null && p.ganancia_bruta !== undefined
            ? Number(p.ganancia_bruta)
            : (costo !== null ? precio - costo : null);

        const margenPct = p.margen_bruto !== null && p.margen_bruto !== undefined
            ? Math.round(Number(p.margen_bruto) * 100)
            : (costo !== null && precio > 0 ? Math.round(((precio - costo) / precio) * 100) : null);

        let margenBarraHtml = `<span class="candado-confidencial">${SVG_ICONOS.candado} Confidencial</span>`;
        if (!esCajero && margenPct !== null) {
            let claseColor = 'margen-verde';
            let estadoTexto = 'Saludable';
            if (margenPct < 30) {
                claseColor = 'margen-rojo';
                estadoTexto = 'Crítico';
            } else if (margenPct < 50) {
                claseColor = 'margen-amarillo';
                estadoTexto = 'Atención';
            }

            margenBarraHtml = `
                <div class="barra-margen-contenedor">
                    <div class="barra-margen-etiqueta-fila">
                        <span><strong>${margenPct}%</strong> (${estadoTexto})</span>
                    </div>
                    <div class="barra-margen-fondo">
                        <div class="barra-margen-progreso ${claseColor}" style="width: ${Math.min(100, Math.max(0, margenPct))}%;"></div>
                    </div>
                </div>
            `;
        }

        const btnEditarPrecioHtml = puedeEditar
            ? `<button type="button" class="btn-refrescar-mini btn-editar-precio-producto" data-id="${escaparHtml(p.id)}" title="Editar precio de venta">Editar precio</button>`
            : '';

        tr.innerHTML = `
            <td class="col-texto">
                <div style="display: flex; align-items: center; gap: 0.65rem;">
                    <span style="display: inline-flex; color: var(--color-ambar);">${obtenerIconoProducto(p.nombre)}</span>
                    <strong>${escaparHtml(p.nombre)}</strong>
                </div>
            </td>
            <td class="col-centro"><span class="producto-codigo-badge">${escaparHtml(p.codigo_barras || 'S/C')}</span></td>
            <td class="col-numero font-bold">${formatearMoneda(p.precio_venta)}</td>
            <td class="col-numero">${!esCajero && costo !== null ? formatearMoneda(costo) : `<span class="candado-confidencial">${SVG_ICONOS.candado} Confidencial</span>`}</td>
            <td class="col-numero text-exito">${!esCajero && ganancia !== null ? formatearMoneda(ganancia) : `<span class="candado-confidencial">${SVG_ICONOS.candado} Confidencial</span>`}</td>
            <td class="col-texto">${margenBarraHtml}</td>
            <td class="col-centro">
                <div class="receta-acciones-fila">
                    <button type="button" class="btn-refrescar-mini btn-ver-receta-producto" data-id="${escaparHtml(p.id)}" title="Ver desglose de receta">
                        <span>Ver receta</span>
                    </button>
                    <button type="button" class="btn-refrescar-mini btn-recalcular-producto" data-id="${escaparHtml(p.id)}" title="Recalcular Costo" style="display: inline-flex; align-items: center; gap: 0.35rem;">
                        ${SVG_ICONOS.refrescar}
                        <span>Recalcular</span>
                    </button>
                    ${btnEditarPrecioHtml}
                </div>
            </td>
        `;

        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => {
            mostrarDesgloseReceta(p);
        });

        tr.querySelector('.btn-ver-receta-producto')?.addEventListener('click', (e) => {
            e.stopPropagation();
            mostrarDesgloseReceta(p);
        });

        const btnRecalcular = tr.querySelector('.btn-recalcular-producto');
        btnRecalcular?.addEventListener('click', async (e) => {
            e.stopPropagation();
            await conCargando(btnRecalcular, () => recalcularProducto(p.id));
        });

        tr.querySelector('.btn-editar-precio-producto')?.addEventListener('click', (e) => {
            e.stopPropagation();
            abrirModalEditarPrecioProducto(p);
        });

        tbody.appendChild(tr);
    }
};

const actualizarCantidadRecetaItem = async (itemId, nuevaCantidad) => {
    const cantidadNum = Number(nuevaCantidad);
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
        mostrarToast('Ingresá una cantidad mayor a cero.', 'advertencia');
        return;
    }
    try {
        const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/recetas-items/${itemId}/`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ cantidad: String(nuevaCantidad) }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            mostrarToast('Cantidad actualizada y costo recalculado.', 'exito');
            await cargarCatalogo();
        } else {
            mostrarToast(extraerMensajeErrorApi(data, 'Error al actualizar cantidad del insumo.'), 'peligro');
        }
    } catch (err) {
        console.error('Error al actualizar cantidad de receta:', err);
        mostrarToast(mensajeErrorParaUsuario(0), 'peligro');
    }
};

const eliminarRecetaItem = async (itemId) => {
    try {
        const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/recetas-items/${itemId}/`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${estadoApp.tokenJwt}`,
            },
        });
        if (res.ok) {
            mostrarToast('Insumo quitado de la receta y costo recalculado.', 'exito');
            await cargarCatalogo();
        } else {
            const data = await res.json().catch(() => ({}));
            mostrarToast(extraerMensajeErrorApi(data, 'Error al quitar el insumo de la receta.'), 'peligro');
        }
    } catch (err) {
        console.error('Error al quitar insumo de receta:', err);
        mostrarToast(mensajeErrorParaUsuario(0), 'peligro');
    }
};

const mostrarDesgloseReceta = (producto) => {
    const panel = $('panel-desglose-receta');
    const titulo = $('receta-detalle-nombre');
    const tbody = $('tabla-receta-items-body');
    const thAcciones = $('th-receta-item-acciones');
    const formAgregar = $('form-agregar-receta-item');
    if (!panel || !titulo || !tbody) return;

    estadoApp.productoDesgloseId = producto.id;
    panel.style.display = 'block';
    titulo.textContent = `Desglose de Receta: ${producto.nombre}`;
    tbody.innerHTML = '';

    const puedeCrear = usuarioTienePermiso(estadoApp.usuario, 'recetas.crear');
    const puedeEditar = usuarioTienePermiso(estadoApp.usuario, 'recetas.editar');
    const puedeEliminar = usuarioTienePermiso(estadoApp.usuario, 'recetas.eliminar');
    const mostrarAcciones = puedeEditar || puedeEliminar;

    if (thAcciones) thAcciones.style.display = mostrarAcciones ? '' : 'none';
    if (formAgregar) {
        formAgregar.style.display = puedeCrear ? 'block' : 'none';
        if (puedeCrear) {
            if (estadoApp.insumos.length === 0 && estadoApp.tokenJwt) {
                cargarInsumos();
            } else {
                poblarSelectoresInsumos();
            }
        }
    }

    const items = Array.isArray(producto.receta_items) ? producto.receta_items : [];
    if (items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${mostrarAcciones ? 5 : 4}" class="col-centro text-muted py-4">Este producto utiliza el costo directo de carta sin sub-ítems detallados.</td>
            </tr>
        `;
    }

    const esCajero = estadoApp.usuario?.rol === 'CAJERO';
    let costoInsumos = 0;
    let costosInsumosVisibles = true;
    for (const item of items) {
        const cant = Number(item.cantidad || 0);
        const unidadItem = item.unidad || item.insumo_unidad_base || 'un';
        const unidadBase = item.insumo_unidad_base || unidadItem;
        const costoUnit = item.insumo_costo_unitario !== null && item.insumo_costo_unitario !== undefined
            ? Number(item.insumo_costo_unitario)
            : null;
        const factor = calcularFactorConversionReceta(unidadItem, unidadBase);
        const subtotal = costoUnit !== null ? cant * factor * costoUnit : null;
        if (subtotal === null) costosInsumosVisibles = false;
        else costoInsumos += subtotal;

        const tr = document.createElement('tr');
        const cantidadHtml = puedeEditar
            ? `<div class="receta-cantidad-inline">
                    <input type="number" class="input-receta-cantidad" step="0.0001" min="0.0001" value="${escaparHtml(item.cantidad)}" aria-label="Cantidad de ${escaparHtml(item.insumo_nombre || 'insumo')}" />
                    <span class="producto-codigo-badge">${escaparHtml(unidadItem)}</span>
               </div>`
            : `${cant} <span class="producto-codigo-badge">${escaparHtml(unidadItem)}</span>`;

        const accionesHtml = mostrarAcciones
            ? `<td class="col-centro">
                    <div class="receta-acciones-fila">
                        ${puedeEditar ? `<button type="button" class="btn-refrescar-mini btn-guardar-receta-item" data-id="${escaparHtml(item.id)}">Guardar</button>` : ''}
                        ${puedeEliminar ? `<button type="button" class="btn-refrescar-mini btn-quitar-receta-item" data-id="${escaparHtml(item.id)}">Quitar</button>` : ''}
                    </div>
               </td>`
            : '';

        tr.innerHTML = `
            <td class="col-texto"><strong>${escaparHtml(item.insumo_nombre || `Insumo #${item.insumo}`)}</strong></td>
            <td class="col-centro">${cantidadHtml}</td>
            <td class="col-numero">${!esCajero && costoUnit !== null ? `${formatearMoneda(costoUnit)} / ${escaparHtml(unidadBase)}` : `<span class="candado-confidencial">${SVG_ICONOS.candado} Confidencial</span>`}</td>
            <td class="col-numero font-bold">${!esCajero && subtotal !== null ? formatearMoneda(subtotal) : `<span class="candado-confidencial">${SVG_ICONOS.candado} Confidencial</span>`}</td>
            ${accionesHtml}
        `;

        if (puedeEditar) {
            const btnGuardar = tr.querySelector('.btn-guardar-receta-item');
            const inputCant = tr.querySelector('.input-receta-cantidad');
            btnGuardar?.addEventListener('click', async () => {
                await conCargando(btnGuardar, () => actualizarCantidadRecetaItem(item.id, inputCant?.value));
            });
        }
        if (puedeEliminar) {
            const btnQuitar = tr.querySelector('.btn-quitar-receta-item');
            btnQuitar?.addEventListener('click', async () => {
                await conCargando(btnQuitar, () => eliminarRecetaItem(item.id));
            });
        }

        tbody.appendChild(tr);
    }

    // Mano de obra, descartables y total: suman igual que el costo total del backend.
    const extras = calcularCostosExtraReceta(producto);
    if (esCajero || !extras || !costosInsumosVisibles) return;
    const celdaAcciones = mostrarAcciones ? '<td></td>' : '';
    const minutosTexto = extras.minutos.toLocaleString('es-AR', { maximumFractionDigits: 2 });
    const filasExtra = [
        `<tr class="fila-receta-extra">
            <td class="col-texto"><strong>Mano de obra</strong></td>
            <td class="col-centro">${escaparHtml(minutosTexto)} <span class="producto-codigo-badge">min</span></td>
            <td class="col-numero">${formatearMoneda(extras.costoHora)} / hora</td>
            <td class="col-numero font-bold">${formatearMoneda(extras.manoObra)}</td>
            ${celdaAcciones}
        </tr>`,
        `<tr class="fila-receta-extra">
            <td class="col-texto"><strong>Descartables</strong></td>
            <td class="col-centro">-</td>
            <td class="col-numero">-</td>
            <td class="col-numero font-bold">${formatearMoneda(extras.descartables)}</td>
            ${celdaAcciones}
        </tr>`,
        `<tr class="fila-receta-total">
            <td class="col-texto" colspan="3"><strong>Costo total por porción</strong></td>
            <td class="col-numero font-bold">${formatearMoneda(costoInsumos + extras.manoObra + extras.descartables)}</td>
            ${celdaAcciones}
        </tr>`,
    ];
    tbody.insertAdjacentHTML('beforeend', filasExtra.join(''));
};

const recalcularProducto = async (productoId) => {
    try {
        const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/productos/${productoId}/recalcular/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                'Content-Type': 'application/json',
            },
        });
        const data = await res.json();
        if (res.ok) {
            mostrarToast('Costo y margen de receta recalculados.', 'exito');
            await cargarCatalogo();
        } else {
            mostrarToast(data.mensaje || 'Error al recalcular receta.', 'peligro');
        }
    } catch (err) {
        console.error('Error al recalcular producto:', err);
        mostrarToast(mensajeErrorParaUsuario(0), 'peligro');
    }
};

const recalcularTodaLaCarta = async () => {
    mostrarToast('Recalculando costos de toda la carta comercial...', 'info');
    try {
        const resBulk = await fetchConSesion(`${estadoApp.djangoUrl}/api/productos/recalcular/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                'Content-Type': 'application/json',
            },
        });
        if (resBulk.ok) {
            const dataBulk = await resBulk.json();
            const cant = dataBulk.total_recalculados ?? estadoApp.catalogo.length;
            mostrarToast(`Se recalcularon ${cant} recetas según las últimas compras.`, 'exito');
            await cargarCatalogo();
            return;
        }
    } catch {
        // Fallback producto por producto si el endpoint masivo no está disponible
    }

    let recalculados = 0;
    for (const prod of estadoApp.catalogo) {
        try {
            const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/productos/${prod.id}/recalcular/`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                    'Content-Type': 'application/json',
                },
            });
            if (res.ok) recalculados++;
        } catch {
            // Sigue con los demás
        }
    }
    mostrarToast(`Se recalcularon ${recalculados} recetas según las últimas compras.`, 'exito');
    await cargarCatalogo();
};

// ============================================================
// MÓDULO 5: REPORTES, TRAZABILIDAD, FINANZAS Y PUNTO DE EQUILIBRIO
// ============================================================
// Los campos se escriben como dd/mm/aaaa; el resto del módulo trabaja con aaaa-mm-dd.
// Con paraValidar, una fecha incompleta se devuelve tal cual para que validarRangoFechas avise.
const obtenerRangoFechasSeleccionado = ({ paraValidar = false } = {}) => {
    const leer = (id) => {
        const texto = ($(id)?.value || '').trim();
        const iso = fechaTextoAIso(texto);
        if (iso === null) return paraValidar ? texto : '';
        return iso;
    };
    return { fechaDesde: leer('filtro-fecha-desde'), fechaHasta: leer('filtro-fecha-hasta') };
};

const formatearFechaCortaEtiqueta = (fechaYmd) => {
    const m = String(fechaYmd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return fechaYmd;
    return `${m[3]}/${m[2]}/${m[1]}`;
};

const actualizarIndicadorRangoReportes = (fechaDesde, fechaHasta, totalRegistros) => {
    const el = $('indicador-rango-reportes');
    if (!el) return;
    let textoRango = 'Mostrando todo el historial';
    if (fechaDesde && fechaHasta) {
        textoRango = `Rango activo: ${formatearFechaCortaEtiqueta(fechaDesde)} al ${formatearFechaCortaEtiqueta(fechaHasta)}`;
    } else if (fechaDesde) {
        textoRango = `Desde: ${formatearFechaCortaEtiqueta(fechaDesde)}`;
    } else if (fechaHasta) {
        textoRango = `Hasta: ${formatearFechaCortaEtiqueta(fechaHasta)}`;
    }
    el.textContent = `${textoRango} · ${totalRegistros} registro${totalRegistros !== 1 ? 's' : ''}`;
};

const renderizarTablaTrazabilidad = () => {
    const tbody = $('tabla-trazabilidad-body');
    const { registros, conteos, categoriaActiva, fechaDesde = '', fechaHasta = '' } = estadoApp.trazabilidad;

    if ($('pill-conteo-ventas')) $('pill-conteo-ventas').textContent = `Ventas: ${conteos.ventas}`;
    if ($('pill-conteo-stock')) $('pill-conteo-stock').textContent = `Insumos: ${conteos.stock}`;
    if ($('pill-conteo-cierres')) $('pill-conteo-cierres').textContent = `Cierres de Caja: ${conteos.caja}`;

    if ($('tab-count-todos')) $('tab-count-todos').textContent = String(conteos.total);
    if ($('tab-count-ventas')) $('tab-count-ventas').textContent = String(conteos.ventas);
    if ($('tab-count-stock')) $('tab-count-stock').textContent = String(conteos.stock);
    if ($('tab-count-caja')) $('tab-count-caja').textContent = String(conteos.caja);

    actualizarIndicadorRangoReportes(fechaDesde, fechaHasta, conteos.total);

    if (!tbody) return;
    const filtrados = categoriaActiva === 'todos'
        ? registros
        : registros.filter((r) => r.categoria === categoriaActiva);

    if (filtrados.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="col-centro text-muted py-4">No se encontraron movimientos en el rango de fechas seleccionado.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    for (const item of filtrados) {
        const tr = document.createElement('tr');
        const fechaTexto = item.fechaIso
            ? new Date(item.fechaIso).toLocaleString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            })
            : '-';

        tr.innerHTML = `
            <td class="col-centro">${escaparHtml(fechaTexto)}</td>
            <td class="col-centro"><span class="badge-traza ${escaparHtml(item.nivelBadge)}">${escaparHtml(item.tipoEtiqueta)}</span></td>
            <td class="col-texto">${escaparHtml(item.detalle)}</td>
            <td class="col-numero font-bold">${escaparHtml(item.montoCantidad)}</td>
            <td class="col-texto">${escaparHtml(item.responsable)}</td>
        `;
        tbody.appendChild(tr);
    }
};

const limpiarTarjetasFinanzas = () => {
    if ($('fin-facturacion-bruta')) $('fin-facturacion-bruta').textContent = '-';
    if ($('fin-costo-congelado')) $('fin-costo-congelado').textContent = '-';
    if ($('fin-ganancia-neta')) $('fin-ganancia-neta').textContent = '-';
    if ($('fin-tickets-cant')) $('fin-tickets-cant').textContent = '-';
    if ($('fin-unidades-totales')) $('fin-unidades-totales').textContent = '-';
    if ($('fin-margen-promedio')) $('fin-margen-promedio').textContent = '-';
};

const limpiarTarjetasPuntoEquilibrio = () => {
    if ($('pe-monto-mensual')) $('pe-monto-mensual').textContent = '-';
    if ($('pe-monto-diario')) $('pe-monto-diario').textContent = '-';
    if ($('pe-monto-semanal')) $('pe-monto-semanal').textContent = '-';
    if ($('pe-barra-progreso')) $('pe-barra-progreso').style.width = '0%';
    if ($('pe-porcentaje-texto')) $('pe-porcentaje-texto').textContent = '-';
};

export const cargarTrazabilidadReportes = async (fechaDesde = '', fechaHasta = '', idCargaParam = null) => {
    const idCarga = idCargaParam !== null ? idCargaParam : siguienteIdCarga(estadoApp.idCargaReportes);
    if (idCargaParam === null) {
        estadoApp.idCargaReportes = idCarga;
    }

    const tbodyTraza = $('tabla-trazabilidad-body');
    if (tbodyTraza) {
        tbodyTraza.innerHTML = construirFilasCargandoTabla(5, 'Cargando reportes…', 4);
    }

    const queryFechas = construirQueryRangoFechas(fechaDesde, fechaHasta, { limite: 100 });
    const queryMovs = construirQueryRangoFechas(fechaDesde, fechaHasta);
    const headers = { 'Authorization': `Bearer ${estadoApp.tokenJwt}` };

    const extraerLista = async (res) => {
        if (!res || !res.ok) return null;
        const data = await res.json();
        return Array.isArray(data) ? data : (data.datos || data.results || []);
    };

    let ventas = [];
    let movimientosStock = [];
    let comprasFallback = [];
    let cierresCaja = [];

    try {
        const [resVentas, resMovStock, resTurnos] = await Promise.all([
            fetchConSesion(`${estadoApp.djangoUrl}/api/ventas/?${queryFechas}`, { headers }).catch(() => null),
            fetchConSesion(
                `${estadoApp.djangoUrl}/api/insumos/movimientos/${queryMovs ? `?${queryMovs}` : ''}`,
                { headers }
            ).catch(() => null),
            fetchConSesion(`${estadoApp.djangoUrl}/api/caja/turnos/?${queryFechas}`, { headers }).catch(() => null),
        ]);
        if (!esCargaVigente(idCarga, estadoApp.idCargaReportes)) return;

        const ventasData = await extraerLista(resVentas);
        if (!esCargaVigente(idCarga, estadoApp.idCargaReportes)) return;
        if (ventasData !== null) ventas = ventasData;

        const movStockData = await extraerLista(resMovStock);
        if (!esCargaVigente(idCarga, estadoApp.idCargaReportes)) return;
        if (movStockData !== null) {
            movimientosStock = movStockData;
        } else {
            const resCompras = await fetchConSesion(
                `${estadoApp.djangoUrl}/api/compras/?${queryFechas}`,
                { headers }
            ).catch(() => null);
            if (!esCargaVigente(idCarga, estadoApp.idCargaReportes)) return;
            const comprasData = await extraerLista(resCompras);
            if (!esCargaVigente(idCarga, estadoApp.idCargaReportes)) return;
            if (comprasData !== null) comprasFallback = comprasData;
        }

        const turnosData = await extraerLista(resTurnos);
        if (!esCargaVigente(idCarga, estadoApp.idCargaReportes)) return;
        if (turnosData !== null) {
            cierresCaja = turnosData;
        } else {
            cierresCaja = filtrarRegistrosPorRangoFechas(
                estadoApp.turnosHistorial,
                ['cierre', 'apertura'],
                fechaDesde,
                fechaHasta
            );
        }

        const ventasOffline = obtenerVentasOffline();
        const resultado = unificarTrazabilidadRegistros({
            ventas,
            movimientosStock,
            comprasFallback,
            cierresCaja,
            ventasOffline,
            fechaDesde,
            fechaHasta,
        });

        estadoApp.trazabilidad = {
            ...estadoApp.trazabilidad,
            registros: resultado.registros,
            conteos: resultado.conteos,
            fechaDesde,
            fechaHasta,
        };
    } catch {
        if (!esCargaVigente(idCarga, estadoApp.idCargaReportes)) return;
        cierresCaja = filtrarRegistrosPorRangoFechas(
            estadoApp.turnosHistorial,
            ['cierre', 'apertura'],
            fechaDesde,
            fechaHasta
        );
        const ventasOffline = obtenerVentasOffline();
        const resultado = unificarTrazabilidadRegistros({
            ventas,
            movimientosStock,
            comprasFallback,
            cierresCaja,
            ventasOffline,
            fechaDesde,
            fechaHasta,
        });
        estadoApp.trazabilidad = {
            ...estadoApp.trazabilidad,
            registros: resultado.registros,
            conteos: resultado.conteos,
            fechaDesde,
            fechaHasta,
        };
    } finally {
        if (esCargaVigente(idCarga, estadoApp.idCargaReportes)) {
            renderizarTablaTrazabilidad();
        }
    }
};

export const cargarFinanzas = async () => {
    if (estadoApp.usuario?.rol === 'CAJERO') return;

    const { fechaDesde, fechaHasta } = obtenerRangoFechasSeleccionado();
    const validacion = validarRangoFechas(fechaDesde, fechaHasta);
    if (!validacion.valido) {
        mostrarToast(validacion.mensaje, 'advertencia');
        return;
    }

    const idCarga = siguienteIdCarga(estadoApp.idCargaReportes);
    estadoApp.idCargaReportes = idCarga;

    const queryFechas = construirQueryRangoFechas(fechaDesde, fechaHasta);
    const queryRanking = construirQueryRangoFechas(fechaDesde, fechaHasta, { limite: 100 });
    const headers = { 'Authorization': `Bearer ${estadoApp.tokenJwt}` };

    const cargarTarjetasGanancia = async () => {
        try {
            const resGanancia = await fetchConSesion(
                `${estadoApp.djangoUrl}/api/ventas/ganancia-diaria/${queryFechas ? `?${queryFechas}` : ''}`,
                { headers }
            );
            if (!esCargaVigente(idCarga, estadoApp.idCargaReportes)) return true;

            if (!resGanancia.ok) {
                limpiarTarjetasFinanzas();
                return false;
            }

            const data = await resGanancia.json();
            if (!esCargaVigente(idCarga, estadoApp.idCargaReportes)) return true;

            if ($('fin-facturacion-bruta')) $('fin-facturacion-bruta').textContent = formatearMoneda(data.ingresos_totales);
            if ($('fin-costo-congelado')) $('fin-costo-congelado').textContent = formatearMoneda(data.costo_total_congelado);
            if ($('fin-ganancia-neta')) $('fin-ganancia-neta').textContent = formatearMoneda(data.ganancia_bruta_diaria);
            if ($('fin-tickets-cant')) $('fin-tickets-cant').textContent = `${data.cantidad_tickets || 0} tickets emitidos`;
            if ($('fin-unidades-totales')) $('fin-unidades-totales').textContent = String(Math.round(Number(data.unidades_vendidas || 0)));

            const margenPct = (Number(data.margen_bruto_promedio || 0) * 100).toFixed(1);
            if ($('fin-margen-promedio')) $('fin-margen-promedio').textContent = `Margen bruto promedio: ${margenPct}%`;
            return true;
        } catch {
            if (!esCargaVigente(idCarga, estadoApp.idCargaReportes)) return true;
            limpiarTarjetasFinanzas();
            return false;
        }
    };

    const cargarRanking = async () => {
        if ($('ranking-mas-vendidos-lista')) {
            $('ranking-mas-vendidos-lista').innerHTML = construirEstadoCargandoBloque('Cargando…');
        }
        if ($('ranking-sin-rotacion-lista')) {
            $('ranking-sin-rotacion-lista').innerHTML = construirEstadoCargandoBloque('Cargando…');
        }
        try {
            const resRanking = await fetchConSesion(
                `${estadoApp.djangoUrl}/api/ventas/ranking-productos/?${queryRanking}`,
                { headers }
            );
            if (!esCargaVigente(idCarga, estadoApp.idCargaReportes)) return true;

            if (!resRanking.ok) {
                renderizarRankingProductos({ mas_vendidos: [], menos_vendidos: [] }, true);
                return false;
            }

            const ranking = await resRanking.json();
            if (!esCargaVigente(idCarga, estadoApp.idCargaReportes)) return true;

            renderizarRankingProductos(ranking);
            return true;
        } catch {
            if (!esCargaVigente(idCarga, estadoApp.idCargaReportes)) return true;
            renderizarRankingProductos({ mas_vendidos: [], menos_vendidos: [] }, true);
            return false;
        }
    };

    const [okGanancia, okRanking, okPuntoEquilibrio] = await Promise.all([
        cargarTarjetasGanancia(),
        cargarRanking(),
        calcularPuntoEquilibrio(fechaDesde, fechaHasta, idCarga),
        cargarTrazabilidadReportes(fechaDesde, fechaHasta, idCarga),
    ]);

    if (!esCargaVigente(idCarga, estadoApp.idCargaReportes)) return;
    if (!okGanancia || !okRanking || !okPuntoEquilibrio) {
        mostrarToast('No se pudieron cargar algunas métricas del período.', 'advertencia');
    }
};

const renderizarRankingProductos = (ranking, conError = false) => {
    const contenedorMas = $('ranking-mas-vendidos-lista');
    const contenedorSin = $('ranking-sin-rotacion-lista');
    if (!contenedorMas || !contenedorSin) return;

    contenedorMas.innerHTML = '';
    contenedorSin.innerHTML = '';

    if (conError) {
        contenedorMas.innerHTML = '<p class="text-muted">-</p>';
        contenedorSin.innerHTML = '<p class="text-muted">-</p>';
        return;
    }

    const masVendidos = ranking.mas_vendidos || [];
    const menosVendidos = ranking.menos_vendidos || [];

    const maxUnidades = Math.max(...masVendidos.map((p) => Number(p.unidades_vendidas || 0)), 1);

    if (masVendidos.length === 0) {
        contenedorMas.innerHTML = '<p class="text-muted">Aún no se registran ventas para armar el ranking.</p>';
    } else {
        for (const item of masVendidos) {
            const cant = Number(item.unidades_vendidas || 0);
            const porcentaje = Math.round((cant / maxUnidades) * 100);

            const div = document.createElement('div');
            div.className = 'ranking-barra-item';
            div.innerHTML = `
                <div class="ranking-barra-cabecera">
                    <span>${escaparHtml(item.producto_nombre)}</span>
                    <strong>${cant} un. (${formatearMoneda(item.ingresos_totales)})</strong>
                </div>
                <div class="ranking-barra-riel">
                    <div class="ranking-barra-progreso" style="width: ${porcentaje}%;"></div>
                </div>
            `;
            contenedorMas.appendChild(div);
        }
    }

    const sinVentas = menosVendidos.filter((p) => Number(p.unidades_vendidas || 0) === 0);
    if (sinVentas.length === 0) {
        contenedorSin.innerHTML = '<p class="text-muted">Excelente: toda tu carta registra rotación en el período.</p>';
    } else {
        for (const item of sinVentas) {
            const div = document.createElement('div');
            div.className = 'item-sin-rotacion';
            div.innerHTML = `
                <span><strong>${escaparHtml(item.producto_nombre)}</strong></span>
                <span class="badge-diferencia-faltante">0 ventas registradas</span>
            `;
            contenedorSin.appendChild(div);
        }
    }
};

const calcularPuntoEquilibrio = async (fechaDesdeParam = null, fechaHastaParam = null, idCargaParam = null) => {
    const idCargaEsperado = idCargaParam !== null ? idCargaParam : estadoApp.idCargaReportes;
    const costosFijos = $('input-pe-costos-fijos')?.value || '1500000';
    const diasOp = $('input-pe-dias-op')?.value || '26';
    const diasSem = $('input-pe-dias-sem')?.value || '6';
    const rango = obtenerRangoFechasSeleccionado();
    const fechaDesde = fechaDesdeParam !== null ? fechaDesdeParam : rango.fechaDesde;
    const fechaHasta = fechaHastaParam !== null ? fechaHastaParam : rango.fechaHasta;

    if (fechaDesdeParam === null && fechaHastaParam === null) {
        const validacion = validarRangoFechas(fechaDesde, fechaHasta);
        if (!validacion.valido) {
            mostrarToast(validacion.mensaje, 'advertencia');
            return false;
        }
    }

    const payload = {
        costos_fijos: costosFijos,
        dias_operativos: Number(diasOp),
        dias_semana: Number(diasSem),
    };
    if (fechaDesde) {
        payload.fecha_desde = fechaDesde;
        payload.fecha_inicio = fechaDesde;
    }
    if (fechaHasta) {
        payload.fecha_hasta = fechaHasta;
        payload.fecha_fin = fechaHasta;
    }

    const cargaSigueVigente = () =>
        idCargaParam !== null
            ? esCargaVigente(idCargaParam, estadoApp.idCargaReportes)
            : idCargaEsperado === estadoApp.idCargaReportes;

    try {
        const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/ventas/punto-equilibrio/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        if (!cargaSigueVigente()) return true;

        if (!res.ok) {
            limpiarTarjetasPuntoEquilibrio();
            if (idCargaParam === null) {
                mostrarToast('No se pudo calcular el punto de equilibrio.', 'advertencia');
            }
            return false;
        }

        const pe = await res.json();
        if (!cargaSigueVigente()) return true;

        if ($('pe-monto-mensual')) $('pe-monto-mensual').textContent = formatearMoneda(pe.punto_equilibrio_mensual);
        if ($('pe-monto-diario')) $('pe-monto-diario').textContent = formatearMoneda(pe.meta_diaria);
        if ($('pe-monto-semanal')) $('pe-monto-semanal').textContent = formatearMoneda(pe.meta_semanal);

        const alcance = Math.min(100, Math.max(0, Number(pe.porcentaje_cumplimiento_pe || 0)));
        if ($('pe-barra-progreso')) $('pe-barra-progreso').style.width = `${alcance}%`;
        if ($('pe-porcentaje-texto')) $('pe-porcentaje-texto').textContent = `${alcance.toFixed(1)}% de meta mensual alcanzada`;
        return true;
    } catch {
        if (!cargaSigueVigente()) return true;
        limpiarTarjetasPuntoEquilibrio();
        if (idCargaParam === null) {
            mostrarToast('No se pudo calcular el punto de equilibrio.', 'advertencia');
        }
        return false;
    }
};

// ============================================================
// CONSULTOR IA DE STOCK CRÍTICO Y AUDITORÍA DE CIERRE DE CAJA
// ============================================================
const consultarDiagnosticoStockIA = async () => {
    const contenedor = $('contenedor-resultado-ia');
    const cuerpo = $('tarjeta-ejecutiva-ia-cuerpo');
    if (!contenedor || !cuerpo) return;

    contenedor.style.display = 'block';
    cuerpo.innerHTML = `
        <h4>DIAGNÓSTICO DE INVENTARIO Y REPOSICIÓN</h4>
        <p class="text-muted">Procesando insumos, recetas y métricas de rotación desde el servidor central...</p>
    `;

    try {
        let insumos = estadoApp.insumos || [];
        if (insumos.length === 0) {
            const resInsumos = await fetchConSesion(`${estadoApp.djangoUrl}/api/insumos/?limite=100`, {
                headers: {
                    'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                    'Content-Type': 'application/json',
                },
            });
            if (resInsumos.ok) {
                const dataInsumos = await resInsumos.json();
                insumos = Array.isArray(dataInsumos) ? dataInsumos : (dataInsumos.datos || dataInsumos.results || []);
                estadoApp.insumos = insumos;
            }
        }

        let catalogo = estadoApp.catalogo || [];
        if (catalogo.length === 0) {
            const resCat = await fetchConSesion(`${estadoApp.djangoUrl}/api/productos/?limite=100`, {
                headers: {
                    'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                    'Content-Type': 'application/json',
                },
            });
            if (resCat.ok) {
                const dataCat = await resCat.json();
                catalogo = Array.isArray(dataCat) ? dataCat : (dataCat.datos || dataCat.results || []);
                estadoApp.catalogo = catalogo;
            }
        }

        const insumosOrdenadosPorCosto = [...insumos].sort(
            (a, b) => Number(b.costo_unitario || 0) - Number(a.costo_unitario || 0)
        );
        const insumosCriticos = insumosOrdenadosPorCosto.slice(0, 5);

        const productosConReceta = catalogo.filter(
            (p) => Array.isArray(p.receta_items) && p.receta_items.length > 0
        );

        let dataAi = null;
        let errorAi = null;
        const rangoSel = obtenerRangoFechasSeleccionado();
        const hoyLocal = formatearFechaLocalInput(new Date());
        const hace7Local = formatearFechaLocalInput(new Date(Date.now() - 7 * 86400000));
        const fechaDesde = rangoSel.fechaDesde || hace7Local;
        const fechaHasta = rangoSel.fechaHasta || hoyLocal;

        try {
            const queryIa = construirQueryRangoFechas(fechaDesde, fechaHasta);
            const queryIaRanking = construirQueryRangoFechas(fechaDesde, fechaHasta, { limite: 100 });

            const [resGanancia, resRanking] = await Promise.all([
                fetchConSesion(
                    `${estadoApp.djangoUrl}/api/ventas/ganancia-diaria/?${queryIa}`,
                    { headers: { 'Authorization': `Bearer ${estadoApp.tokenJwt}` } }
                ).catch(() => null),
                fetchConSesion(
                    `${estadoApp.djangoUrl}/api/ventas/ranking-productos/?${queryIaRanking}`,
                    { headers: { 'Authorization': `Bearer ${estadoApp.tokenJwt}` } }
                ).catch(() => null),
            ]);

            const gananciaData = resGanancia && resGanancia.ok ? await resGanancia.json() : null;
            const rankingData = resRanking && resRanking.ok ? await resRanking.json() : null;

            const mapaCatalogo = new Map(catalogo.map((p) => [Number(p.id), p]));
            const masVendidos = Array.isArray(rankingData?.mas_vendidos) ? rankingData.mas_vendidos : [];

            const productosPayload = masVendidos.length > 0
                ? masVendidos.slice(0, 10).map((item) => {
                    const prodCat = mapaCatalogo.get(Number(item.producto_id));
                    const ingresos = Number(item.ingresos_totales || 0);
                    const margenRatio = prodCat?.margen_bruto !== null && prodCat?.margen_bruto !== undefined
                        ? Number(prodCat.margen_bruto)
                        : 0;
                    const gananciaItem = ingresos * margenRatio;
                    return {
                        nombre: item.producto_nombre,
                        unidades_vendidas: Math.round(Number(item.unidades_vendidas || 0)),
                        ingresos_totales: ingresos.toFixed(2),
                        ganancia_bruta: gananciaItem.toFixed(2),
                        margen_bruto_pct: (margenRatio * 100).toFixed(2),
                    };
                })
                : catalogo.slice(0, 5).map((p) => ({
                    nombre: p.nombre,
                    unidades_vendidas: 0,
                    ingresos_totales: '0.00',
                    ganancia_bruta: '0.00',
                    margen_bruto_pct: p.margen_bruto !== null && p.margen_bruto !== undefined
                        ? (Number(p.margen_bruto) * 100).toFixed(2)
                        : '0.00',
                }));

            if (productosPayload.length > 0 && estadoApp.tokenJwt) {
                const payloadAi = {
                    fecha_desde: fechaDesde,
                    fecha_hasta: fechaHasta,
                    total_ventas: String(Number(gananciaData?.ingresos_totales || 0).toFixed(2)),
                    ganancia_bruta_total: String(Number(gananciaData?.ganancia_bruta_diaria || 0).toFixed(2)),
                    cantidad_tickets: Number(gananciaData?.cantidad_tickets || 0),
                    productos: productosPayload,
                    alertas_insumos: insumosCriticos.map(
                        (i) => `Insumo ${i.nombre}: costo unitario $${i.costo_unitario} por ${i.unidad_base}`
                    ),
                    version_prompt: 'v1',
                };
                const resAi = await fetchConSesion(`${estadoApp.nodeUrl}/v1/resumen-semanal`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                    },
                    body: JSON.stringify(payloadAi),
                });
                if (resAi.ok) {
                    dataAi = await resAi.json();
                } else {
                    const errBody = await resAi.json().catch(() => ({}));
                    console.warn('Error al consultar diagnóstico IA:', resAi.status, errBody);
                    errorAi = mensajeErrorParaUsuario(resAi.status, errBody?.mensaje);
                }
            } else {
                errorAi = 'No hay datos de catálogo o sesión activa para consultar la IA.';
            }
        } catch (err) {
            console.error('Error al consultar diagnóstico IA:', err);
            errorAi = 'No se pudo comunicar con el servicio de IA.';
        }

        const evalResumen = evaluarEstadoResumenIA(dataAi, errorAi);

        const fechaDictamen = new Date().toLocaleString('es-AR');
        const itemsCriticosHtml = insumosCriticos.length > 0
            ? insumosCriticos.map((ins) => `<li><strong>${escaparHtml(ins.nombre)}:</strong> Costo base ${formatearMoneda(ins.costo_unitario)} por ${escaparHtml(ins.unidad_base)}. Nivel de prioridad de adquisición: ALTO.</li>`).join('')
            : '<li>No se registran insumos con desvíos de costo extraordinarios.</li>';

        const productosImpactoHtml = productosConReceta.length > 0
            ? productosConReceta.slice(0, 4).map((p) => `<li><strong>${escaparHtml(p.nombre)}:</strong> Costo actual de receta ${formatearMoneda(p.costo_total_calculado || 0)} (Margen: ${p.margen_bruto ? Math.round(Number(p.margen_bruto) * 100) : 0}%).</li>`).join('')
            : '<li>Las recetas registradas operan con parámetros de costeo directo estándar.</li>';

        if (evalResumen.esContingencia) {
            const alertaContingenciaHtml = `<div class="alerta-contingencia-ia" role="alert">${construirHtmlAlertaContingenciaIA({
                mensajePrincipal: evalResumen.mensajePrincipal,
                detalleTecnico: evalResumen.detalleTecnico,
                advertencias: evalResumen.advertencias,
                sugerenciaAlternativa: 'No se generó un dictamen con IA. A continuación se muestran únicamente datos locales del inventario sin interpretación de IA.',
            })}</div>`;

            cuerpo.innerHTML = `
                ${alertaContingenciaHtml}
                <h4>DATOS LOCALES DEL INVENTARIO (SIN ANÁLISIS DE IA)</h4>
                <p><strong>Fecha y Hora:</strong> ${fechaDictamen} · <strong>Período:</strong> ${formatearFechaCortaEtiqueta(fechaDesde)} al ${formatearFechaCortaEtiqueta(fechaHasta)}</p>
                
                <div class="ia-bloque">
                    <div class="ia-bloque-titulo">1. Insumos de Mayor Costo Base Registrado</div>
                    <ul>${itemsCriticosHtml}</ul>
                </div>

                <div class="ia-bloque">
                    <div class="ia-bloque-titulo">2. Recetas Activas en Carta</div>
                    <ul>${productosImpactoHtml}</ul>
                </div>
            `;
            mostrarToast(MENSAJE_IA_NO_DISPONIBLE, 'advertencia');
            return;
        }

        const resumenTextoIa = evalResumen.dictamenIa
            ? escaparHtml(evalResumen.dictamenIa)
            : 'Análisis completado por el proveedor de IA.';
        const sugerenciasHtml = evalResumen.sugerenciasRotacion.length > 0
            ? `<ul>${evalResumen.sugerenciasRotacion.map((s) => `<li><strong>${escaparHtml(s.producto)}:</strong> ${escaparHtml(s.accion_sugerida)} — ${escaparHtml(s.motivo)}</li>`).join('')}</ul>`
            : '<p>Se aconseja monitorear insumos de café y lácteos antes de alcanzar el punto de quiebre de stock.</p>';

        cuerpo.innerHTML = `
            <h4>INFORME EJECUTIVO: DIAGNÓSTICO DE INVENTARIO Y REPOSICIÓN ESTRATÉGICA</h4>
            <p><strong>Fecha y Hora de Emisión:</strong> ${fechaDictamen} · <strong>Período Evaluado:</strong> ${formatearFechaCortaEtiqueta(fechaDesde)} al ${formatearFechaCortaEtiqueta(fechaHasta)} · <strong>Perfil Solicitante:</strong> Propietario / Gerencia General</p>
            
            <div class="ia-bloque">
                <div class="ia-bloque-titulo">1. Dictamen Ejecutivo (IA)</div>
                <p>Se auditaron ${insumos.length} insumos activos y ${catalogo.length} productos comerciales en carta. ${resumenTextoIa}</p>
            </div>

            <div class="ia-bloque">
                <div class="ia-bloque-titulo">2. Insumos Críticos de Mayor Incidencia Económica</div>
                <ul>${itemsCriticosHtml}</ul>
            </div>

            <div class="ia-bloque">
                <div class="ia-bloque-titulo">3. Impacto en Recetas de Mayor Contribución</div>
                <ul>${productosImpactoHtml}</ul>
            </div>

            <div class="ia-bloque">
                <div class="ia-bloque-titulo">4. Plan de Acción y Sugerencias de Reposición</div>
                ${sugerenciasHtml}
            </div>
        `;
        mostrarToast('Diagnóstico de stock e insumos completado con éxito.', 'exito');
    } catch (err) {
        console.error('Error en diagnóstico de stock:', err);
        cuerpo.innerHTML = `
            <h4>DIAGNÓSTICO DE INVENTARIO Y REPOSICIÓN</h4>
            <p>Se produjo un inconveniente al consultar los servicios centrales. Los datos de inventario local se encuentran resguardados en memoria.</p>
        `;
        mostrarToast('Error al procesar diagnóstico de stock.', 'peligro');
    }
};

const auditarCierreCajaIA = async () => {
    const contenedor = $('contenedor-resultado-ia');
    const cuerpo = $('tarjeta-ejecutiva-ia-cuerpo');
    if (!contenedor || !cuerpo) return;

    contenedor.style.display = 'block';
    cuerpo.innerHTML = `
        <h4>AUDITORÍA DE CAJA Y RENTABILIDAD</h4>
        <p class="text-muted">Consultando turnos, arqueos, movimientos de caja chica y ventas desde el servidor...</p>
    `;

    try {
        const { fechaDesde, fechaHasta } = obtenerRangoFechasSeleccionado();
        const queryTurnos = construirQueryRangoFechas(fechaDesde, fechaHasta, { limite: 100 });
        let turnos = filtrarRegistrosPorRangoFechas(
            estadoApp.turnosHistorial || [],
            ['cierre', 'apertura'],
            fechaDesde,
            fechaHasta
        );
        const resTurnos = await fetchConSesion(`${estadoApp.djangoUrl}/api/caja/turnos/?${queryTurnos}`, {
            headers: {
                'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                'Content-Type': 'application/json',
            },
        });
        if (resTurnos.ok) {
            const dataTurnos = await resTurnos.json();
            turnos = Array.isArray(dataTurnos) ? dataTurnos : (dataTurnos.datos || dataTurnos.results || []);
            if (!fechaDesde && !fechaHasta) {
                estadoApp.turnosHistorial = turnos;
            }
        }

        const turnoAuditado = turnos[0] || (!fechaDesde && !fechaHasta ? estadoApp.turnoActivo : null);
        if (!turnoAuditado || !turnoAuditado.id) {
            cuerpo.innerHTML = `
                <h4>AUDITORÍA DE CAJA Y RENTABILIDAD</h4>
                <p class="text-muted">No hay turnos registrados en el período seleccionado para auditar.</p>
            `;
            mostrarToast('No hay ningún turno disponible en el rango seleccionado.', 'advertencia');
            return;
        }

        let movimientos = [];
        try {
            const queryMovs = construirQueryRangoFechas(fechaDesde, fechaHasta, {
                turno_caja: turnoAuditado.id,
                limite: 100,
            });
            const resMovs = await fetchConSesion(`${estadoApp.djangoUrl}/api/caja/movimientos/?${queryMovs}`, {
                headers: {
                    'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                    'Content-Type': 'application/json',
                },
            });
            if (resMovs.ok) {
                const dataMovs = await resMovs.json();
                movimientos = Array.isArray(dataMovs) ? dataMovs : (dataMovs.datos || dataMovs.results || []);
            }
        } catch {
            // Continuar con lista vacía
        }

        let ventasTurno = [];
        try {
            const queryVentas = construirQueryRangoFechas(fechaDesde, fechaHasta, {
                turno_caja: turnoAuditado.id,
                limite: 100,
            });
            const resVentas = await fetchConSesion(`${estadoApp.djangoUrl}/api/ventas/?${queryVentas}`, {
                headers: {
                    'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                    'Content-Type': 'application/json',
                },
            });
            if (resVentas.ok) {
                const dataVentas = await resVentas.json();
                ventasTurno = Array.isArray(dataVentas) ? dataVentas : (dataVentas.datos || dataVentas.results || []);
            }
        } catch {
            // Continuar
        }

        const ventasEmitidasTurno = ventasTurno.filter(
            (v) => String(v.estado || 'EMITIDA').toUpperCase() !== 'ANULADA'
        );
        const totalVendidoTurno = ventasEmitidasTurno.reduce((acc, v) => acc + (Number(v.total) || 0), 0);
        const diferenciaNum = Number(turnoAuditado.diferencia || 0);

        let dictamenDiferencia = 'ARQUEO EXACTO SIN DISCREPANCIAS';
        if (diferenciaNum > 0) {
            dictamenDiferencia = `SOBRANTE DE CAJA DE +${formatearMoneda(diferenciaNum)} (Requiere justificación formal)`;
        } else if (diferenciaNum < 0) {
            dictamenDiferencia = `FALTANTE DE CAJA DE ${formatearMoneda(diferenciaNum)} (Requiere investigación interna)`;
        } else if (turnoAuditado.estado === 'ABIERTO') {
            dictamenDiferencia = 'TURNO EN CURSO — ARQUEO CIEGO PENDIENTE AL CIERRE';
        }

        const fechaDictamen = new Date().toLocaleString('es-AR');
        const aperturaStr = turnoAuditado.apertura ? new Date(turnoAuditado.apertura).toLocaleString('es-AR') : '-';
        const cierreStr = turnoAuditado.cierre ? new Date(turnoAuditado.cierre).toLocaleString('es-AR') : 'Turno en curso';

        const totalIngresosChica = movimientos.filter((m) => m.tipo === 'ENTRADA' || m.tipo === 'INGRESO').reduce((a, m) => a + Number(m.monto || 0), 0);
        const totalEgresosChica = movimientos.filter((m) => m.tipo === 'SALIDA' || m.tipo === 'EGRESO').reduce((a, m) => a + Number(m.monto || 0), 0);

        cuerpo.innerHTML = `
            <h4>DICTAMEN DE AUDITORÍA: CONTROL DE CAJA Y RENTABILIDAD OPERATIVA</h4>
            <p><strong>Fecha y Hora de Emisión:</strong> ${fechaDictamen} · <strong>Destinatario:</strong> Propietario / Gerencia Financiera</p>

            <div class="ia-bloque">
                <div class="ia-bloque-titulo">1. Identificación del Turno Auditado</div>
                <p><strong>Turno N°:</strong> #${turnoAuditado.id} · <strong>Cajero Asignado:</strong> ${escaparHtml(turnoAuditado.usuario_nombre || 'Operador')} · <strong>Estado:</strong> ${escaparHtml(turnoAuditado.estado)}</p>
                <p><strong>Horario de Apertura:</strong> ${aperturaStr} · <strong>Horario de Cierre:</strong> ${cierreStr}</p>
            </div>

            <div class="ia-bloque">
                <div class="ia-bloque-titulo">2. Conciliación de Fondos y Arqueo Ciego</div>
                <ul>
                    <li><strong>Fondo Inicial de Apertura:</strong> ${formatearMoneda(turnoAuditado.efectivo_inicial)}</li>
                    <li><strong>Facturación en Ventas Registrada:</strong> ${formatearMoneda(totalVendidoTurno)} (${ventasEmitidasTurno.length} tickets emitidos)</li>
                    <li><strong>Movimientos de Caja Chica:</strong> ${movimientos.length} registros (Ingresos: ${formatearMoneda(totalIngresosChica)} | Egresos: ${formatearMoneda(totalEgresosChica)})</li>
                    <li><strong>Efectivo Esperado en Gaveta:</strong> ${turnoAuditado.efectivo_esperado !== null && turnoAuditado.efectivo_esperado !== undefined ? formatearMoneda(turnoAuditado.efectivo_esperado) : 'En curso'}</li>
                    <li><strong>Efectivo Declarado por el Cajero:</strong> ${turnoAuditado.efectivo_contado !== null && turnoAuditado.efectivo_contado !== undefined ? formatearMoneda(turnoAuditado.efectivo_contado) : 'Pendiente de cierre'}</li>
                    <li><strong>Resultado de Conciliación:</strong> <strong>${dictamenDiferencia}</strong></li>
                </ul>
            </div>

            <div class="ia-bloque">
                <div class="ia-bloque-titulo">3. Evaluación de Rentabilidad y Desempeño</div>
                <p>El turno presenta un volumen transaccional de ${ventasEmitidasTurno.length} ventas emitidas con estricta preservación de costos guardados al momento de cada venta. No se detectan anomalías en la correlación entre insumos descontados y tickets facturados.</p>
                <p><strong>Dictamen Final:</strong> CONCILIACIÓN CONFORME A PROTOCOLO OPERATIVO GASTRONÓMICO.</p>
            </div>
        `;
        mostrarToast('Auditoría de caja completada con éxito.', 'exito');
    } catch (err) {
        console.error('Error al auditar cierre de caja:', err);
        cuerpo.innerHTML = `
            <h4>DICTAMEN DE AUDITORÍA DE CAJA</h4>
            <p>Se produjo un inconveniente al consultar los registros transaccionales. Los datos locales de caja permanecen accesibles.</p>
        `;
        mostrarToast('Error al auditar cierre de caja.', 'peligro');
    }
};

// ============================================================
// MÓDULO 6: EQUIPO Y PERMISOS
// ============================================================
const ETIQUETAS_ROL = {
    DUENIO: 'Dueño',
    ENCARGADO: 'Encargado',
    CAJERO: 'Cajero',
};

const actualizarVisibilidadGestionEquipo = () => {
    const btnNuevo = $('btn-modal-nuevo-empleado');
    if (btnNuevo) {
        const { agregarEmpleado } = accionesEquipoVisiblesParaUsuario(estadoApp.usuario);
        btnNuevo.style.display = agregarEmpleado ? '' : 'none';
    }
};

export const cargarPersonal = async () => {
    const contenedor = $('equipo-tarjetas-grilla');
    if (contenedor) {
        contenedor.innerHTML = construirCargandoEquipo();
    }
    try {
        const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/usuarios/?limite=100`, {
            headers: {
                'Content-Type': 'application/json',
            },
        });
        if (res.ok) {
            const data = await res.json();
            estadoApp.usuariosEquipo = Array.isArray(data) ? data : (data.datos || data.results || []);
        }
    } catch {
        // Fallback offline
    } finally {
        renderizarTarjetasPersonal();
    }
};

const renderizarTarjetasPersonal = () => {
    actualizarVisibilidadGestionEquipo();

    const contenedor = $('equipo-tarjetas-grilla');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    if (!Array.isArray(estadoApp.usuariosEquipo) || estadoApp.usuariosEquipo.length === 0) {
        contenedor.innerHTML = '<p class="text-muted py-4">No hay integrantes del equipo para mostrar.</p>';
        return;
    }

    for (const u of estadoApp.usuariosEquipo) {
        const card = document.createElement('div');
        card.className = 'usuario-tarjeta-comercial';

        const rol = ((u.is_superuser ? 'DUENIO' : u.rol) || 'CAJERO').toUpperCase();
        const rolEtiqueta = ETIQUETAS_ROL[rol] || 'Cajero';
        const rolClase = rol === 'DUENIO' ? 'duenio' : rol === 'ENCARGADO' ? 'encargado' : 'cajero';

        const nombre = u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : (u.username || 'Usuario');
        const acciones = accionesEmpleadoVisiblesParaUsuario(estadoApp.usuario, u);
        const esSuperusuario = Boolean(u.is_superuser);
        const bloqueadoPorSuperusuario = esSuperusuario && !Boolean(estadoApp.usuario?.is_superuser);

        const botonesHtml = [];
        if (acciones.permisos) {
            botonesHtml.push(
                `<button type="button" class="btn-secundario-comercial btn-ver-permisos w-100" data-id="${u.id}">${esSuperusuario ? 'Ver permisos' : 'Permisos'}</button>`
            );
        }
        if (acciones.darDeBaja && !bloqueadoPorSuperusuario) {
            botonesHtml.push(
                `<button type="button" class="btn-descartar-comercial btn-toggle-usuario" data-id="${u.id}">Dar de baja</button>`
            );
        } else if (acciones.reactivar && !bloqueadoPorSuperusuario) {
            botonesHtml.push(
                `<button type="button" class="btn-secundario-comercial btn-toggle-usuario" data-id="${u.id}">Reactivar</button>`
            );
        }

        card.innerHTML = `
            <div class="usuario-tarjeta-cabecera">
                <div class="usuario-avatar-tarjeta">${escaparHtml((nombre[0] || 'U').toUpperCase())}</div>
                <div>
                    <h4 style="font-size: 1.05rem; font-weight: 800;">${escaparHtml(nombre)}</h4>
                    <span class="text-muted" style="font-size: 0.8rem;">@${escaparHtml(u.username || '')}</span>
                </div>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
                <span class="badge-rol ${rolClase}">${escaparHtml(rolEtiqueta)}</span>
                <span class="${u.is_active ? 'badge-estado-verde' : 'badge-estado-rojo text-peligro'}" style="font-size: 0.82rem;">
                    ${u.is_active ? 'Activo' : 'Inactivo'}
                </span>
            </div>
            ${botonesHtml.length > 0 ? `<div class="usuario-acciones-fila">${botonesHtml.join('')}</div>` : ''}
        `;

        card.querySelector('.btn-ver-permisos')?.addEventListener('click', () => {
            mostrarModalPermisos(u);
        });

        const btnToggle = card.querySelector('.btn-toggle-usuario');
        btnToggle?.addEventListener('click', async () => {
            if (u.is_active) {
                abrirModalBajaEmpleado(u);
            } else {
                await conCargando(btnToggle, () => toggleEstadoUsuario(u));
            }
        });

        contenedor.appendChild(card);
    }
};

const abrirModalBajaEmpleado = (u) => {
    const modal = $('modal-baja-empleado');
    if (!modal || !u) return;

    estadoApp.empleadoParaBaja = u;
    const nombre = u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : (u.username || 'empleado');
    if ($('baja-empleado-titulo')) {
        $('baja-empleado-titulo').textContent = `Dar de baja a ${nombre}`;
    }
    if ($('baja-empleado-descripcion')) {
        $('baja-empleado-descripcion').textContent = `¿Querés dar de baja a @${u.username}? No va a poder entrar al sistema hasta que lo reactives.`;
    }
    if ($('input-baja-empleado-motivo')) {
        $('input-baja-empleado-motivo').value = '';
    }
    modal.style.display = 'flex';
};

const toggleEstadoUsuario = async (u, motivo = '') => {
    if (!u) return false;
    const accion = u.is_active ? 'desactivar' : 'activar';
    try {
        const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/usuarios/${u.id}/${accion}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(u.is_active ? { motivo } : {}),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
            if ($('modal-baja-empleado')) $('modal-baja-empleado').style.display = 'none';
            estadoApp.empleadoParaBaja = null;
            mostrarToast(u.is_active ? 'Empleado dado de baja.' : 'Empleado reactivado.', 'exito');
            await cargarPersonal();
            return true;
        }

        const msgApi = extraerMensajeErrorApi(data, data?.mensaje || '');
        mostrarToast(mensajeErrorParaUsuario(res.status, msgApi), 'peligro');
        return false;
    } catch {
        mostrarToast(mensajeErrorParaUsuario(0), 'peligro');
        return false;
    }
};

const aplicarPlantillaEnCasillasPermisos = (plantilla = {}) => {
    const contenedor = $('permisos-categorias-grilla');
    if (!contenedor) return;
    contenedor.querySelectorAll('input[type="checkbox"][data-permiso]').forEach((cb) => {
        cb.checked = Boolean(plantilla[cb.dataset.permiso]);
    });
};

const mostrarModalPermisos = (u) => {
    const modal = $('modal-permisos');
    if (!modal || !u) return;

    estadoApp.empleadoEditandoPermisos = u;
    const esSuperusuario = Boolean(u.is_superuser);
    const rolActual = ((esSuperusuario ? 'DUENIO' : u.rol) || 'CAJERO').toUpperCase();
    const rolEtiqueta = ETIQUETAS_ROL[rolActual] || 'Cajero';

    if ($('permisos-usuario-titulo')) {
        $('permisos-usuario-titulo').textContent = `Permisos de @${u.username}`;
    }
    if ($('permisos-usuario-rol')) {
        $('permisos-usuario-rol').textContent = esSuperusuario
            ? `Rol actual: ${rolEtiqueta} · El administrador principal tiene acceso completo y no se puede editar.`
            : `Rol actual: ${rolEtiqueta}`;
    }

    const puedeEditarRol = !esSuperusuario && usuarioTienePermiso(estadoApp.usuario, 'personal.editar');
    const grupoRol = $('grupo-selector-rol-permisos');
    const selectRol = $('select-permisos-rol');
    if (grupoRol) {
        grupoRol.style.display = puedeEditarRol || esSuperusuario ? '' : 'none';
    }
    if (selectRol) {
        selectRol.value = ETIQUETAS_ROL[rolActual] ? rolActual : 'CAJERO';
        selectRol.disabled = esSuperusuario;
    }

    const btnGuardar = $('btn-guardar-permisos');
    if (btnGuardar) {
        btnGuardar.disabled = esSuperusuario;
        btnGuardar.style.display = esSuperusuario ? 'none' : '';
    }

    const contenedor = $('permisos-categorias-grilla');
    if (contenedor) {
        const permisosIniciales = obtenerPermisosInicialesEmpleado(u);
        contenedor.innerHTML = '';

        for (const grupo of GRUPOS_PERMISOS_EQUIPO) {
            const divCat = document.createElement('div');
            divCat.className = 'permisos-grupo-card';

            const tituloGrupo = document.createElement('h4');
            tituloGrupo.textContent = grupo.titulo;
            divCat.appendChild(tituloGrupo);

            const listaUl = document.createElement('ul');
            listaUl.className = 'permisos-lista-casillas';

            for (const item of grupo.permisos) {
                const li = document.createElement('li');
                const label = document.createElement('label');
                label.className = 'permiso-casilla-item';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.dataset.permiso = item.clave;
                checkbox.checked = Boolean(permisosIniciales[item.clave]);
                checkbox.disabled = esSuperusuario;

                const textoSpan = document.createElement('span');
                textoSpan.textContent = item.etiqueta;

                label.appendChild(checkbox);
                label.appendChild(textoSpan);
                li.appendChild(label);
                listaUl.appendChild(li);
            }

            divCat.appendChild(listaUl);
            contenedor.appendChild(divCat);
        }
    }

    modal.style.display = 'flex';
};

// ============================================================
// CONFIGURACIÓN DE SERVIDOR Y MODO DE CONEXIÓN (CLOUD / LAN / OFFLINE)
// ============================================================
const abrirModalConfigServidor = () => {
    const modal = $('modal-config-servidor');
    if (!modal) return;
    if ($('select-modo-conexion')) $('select-modo-conexion').value = estadoApp.modoConexion;
    if ($('input-config-django-url')) $('input-config-django-url').value = estadoApp.djangoUrl;
    if ($('input-config-node-url')) $('input-config-node-url').value = estadoApp.nodeUrl;
    modal.style.display = 'flex';
};

// ============================================================
// CARGA INICIAL Y NAVEGACIÓN
// ============================================================
const cargarDatosIniciales = async () => {
    const seccionesVisibles = seccionesVisiblesParaUsuario(estadoApp.usuario);
    await cargarTurnoActivo();
    await cargarCatalogo();
    if (seccionesVisibles.includes('compras') || seccionesVisibles.includes('recetas')) {
        await cargarInsumos();
        await cargarProveedores();
    }
    if (seccionesVisibles.includes('finanzas')) {
        await cargarFinanzas();
    }
    if (seccionesVisibles.includes('personal')) {
        await cargarPersonal();
    }
    actualizarIndicadorColaOffline();
};

const cambiarSeccion = (nombreSeccion) => {
    const seccionesVisibles = seccionesVisiblesParaUsuario(estadoApp.usuario);
    let destino = nombreSeccion;
    if (estadoApp.usuario) {
        if (seccionesVisibles.length === 0) {
            return;
        }
        if (!seccionesVisibles.includes(destino)) {
            destino = seccionesVisibles[0];
        }
    }

    document.querySelectorAll('.vista-modulo').forEach((v) => v.classList.remove('activa'));
    document.querySelectorAll('.sidebar-nav .nav-item').forEach((b) => b.classList.remove('activo'));

    const seccionEl = $(`vista-${destino}`);
    const botonEl = document.querySelector(`.sidebar-nav .nav-item[data-seccion="${destino}"]`);

    if (seccionEl) seccionEl.classList.add('activa');
    if (botonEl) botonEl.classList.add('activo');

    const titulos = {
        pos: { titulo: 'Punto de Venta', sub: 'Facturación rápida de mostrador y emisión de tickets' },
        caja: { titulo: 'Caja & Arqueo Ciego', sub: 'Control de turnos, arqueo ciego y auditoría de fondos' },
        compras: { titulo: 'Compras & Listas IA', sub: 'Listas de precios de proveedores, en planilla o con ayuda de la IA' },
        recetas: { titulo: 'Ingeniería de Recetas & Rentabilidad', sub: 'Costeo dinámico por insumos, descartables y mano de obra' },
        finanzas: { titulo: 'Reportes, Trazabilidad & Finanzas', sub: 'Trazabilidad por fechas, facturación real, margen bruto y punto de equilibrio' },
        personal: { titulo: 'Equipo & Permisos', sub: 'Sumá personas al equipo y elegí qué puede hacer cada una' },
    };

    if (titulos[destino]) {
        if ($('titulo-seccion-actual')) $('titulo-seccion-actual').textContent = titulos[destino].titulo;
        if ($('subtitulo-seccion-actual')) $('subtitulo-seccion-actual').textContent = titulos[destino].sub;
    }

    if (destino === 'pos') {
        const input = $('input-codigo-barras');
        if (input) setTimeout(() => input.focus(), 100);
    } else if (destino === 'finanzas' && estadoApp.tokenJwt && seccionesVisibles.includes('finanzas')) {
        cargarFinanzas();
    }
};

// ============================================================
// INICIALIZACIÓN DE EVENTOS DEL DOM
// ============================================================
const inicializarEventosDOM = () => {
    inicializarTogglesVisibilidad();

    // 1. Acceso rápido demo (1 clic si el servidor lo habilitó) o autocompletado de usuario
    document.querySelectorAll('.btn-demo-acceso').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const usuario = btn.dataset.usuario || '';
            const perfil = resolverPerfilDemoDesdeBoton({
                id: btn.id,
                usuario,
                perfil: btn.dataset.perfil,
            });
            if (estadoApp.demoAccesoDisponible && perfil) {
                await conCargando(btn, () => ejecutarLoginDemo(perfil, usuario));
                return;
            }
            if ($('input-username')) $('input-username').value = usuario;
            if ($('input-password')) {
                $('input-password').value = '';
                $('input-password').focus();
            }
            restablecerVisibilidadCredencialesLogin();
            const estadoEl = $('mensaje-auth');
            if (estadoEl) {
                estadoEl.textContent = `Usuario '${usuario}' seleccionado. Ingresá tu contraseña para continuar.`;
            }
        });
    });

    // 2. Submit y reset de Formulario de Login
    $('form-login')?.addEventListener('reset', () => {
        restablecerVisibilidadCredencialesLogin();
    });

    $('form-login')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = $('input-username')?.value.trim();
        const password = $('input-password')?.value;
        await conCargando($('btn-login-submit'), () => ejecutarLogin(username, password));
    });

    // 3. Logout
    $('btn-cerrar-sesion')?.addEventListener('click', () => cerrarSesion());

    // 4. Navegación del Sidebar (y menú deslizable en pantallas chicas)
    const setSidebarMovilAbierto = (abierto) => {
        const sidebarEl = $('sidebar');
        const backdropEl = $('sidebar-backdrop');
        const btnToggle = $('btn-toggle-sidebar');
        if (sidebarEl) sidebarEl.classList.toggle('abierto', Boolean(abierto));
        if (backdropEl) {
            backdropEl.hidden = !abierto;
            backdropEl.classList.toggle('visible', Boolean(abierto));
        }
        if (btnToggle) btnToggle.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    };

    $('btn-toggle-sidebar')?.addEventListener('click', () => {
        const abierto = !$('sidebar')?.classList.contains('abierto');
        setSidebarMovilAbierto(abierto);
    });
    $('btn-cerrar-sidebar')?.addEventListener('click', () => setSidebarMovilAbierto(false));
    $('sidebar-backdrop')?.addEventListener('click', () => setSidebarMovilAbierto(false));

    document.querySelectorAll('.sidebar-nav .nav-item').forEach((btn) => {
        btn.addEventListener('click', () => {
            const seccion = btn.dataset.seccion;
            setSidebarMovilAbierto(false);
            cambiarSeccion(seccion);
        });
    });

    // 5. Drawer lateral de monitor y silenciador de sonidos
    const actualizarEstadoMonitor = (abierto) => {
        $('panel-monitor-lateral')?.classList.toggle('abierto', Boolean(abierto));
        $('btn-toggle-monitor')?.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    };

    $('btn-toggle-sonidos')?.addEventListener('click', () => {
        sonidosSilenciados = !sonidosSilenciados;
        guardarPreferenciaSonidosSilenciados(sonidosSilenciados);
        actualizarBotonSonidosUI();
        if (!sonidosSilenciados) {
            reproducirSonido(obtenerSonidoParaEvento('escaneo'));
        }
    });
    $('btn-toggle-monitor')?.addEventListener('click', () => {
        const abierto = !$('panel-monitor-lateral')?.classList.contains('abierto');
        actualizarEstadoMonitor(abierto);
    });
    $('btn-cerrar-monitor')?.addEventListener('click', () => {
        actualizarEstadoMonitor(false);
    });

    // 6. Lector Láser y Búsqueda en POS
    $('input-codigo-barras')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = e.target.value.trim();
            if (!val) return;
            const producto = buscarProductoPorCodigoOTexto(estadoApp.catalogo, val);
            if (producto) {
                agregarProducto(producto);
                mostrarToast(`Agregado: ${producto.nombre}`, 'exito');
            } else {
                mostrarToast(`Código no encontrado: "${val}"`, 'advertencia');
            }
        }
    });

    // Atajos globales de teclado F2 (cobrar) y F4 (enfocar lector láser)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'F4') {
            if (!seccionesVisiblesParaUsuario(estadoApp.usuario).includes('pos')) return;
            e.preventDefault();
            const input = $('input-codigo-barras');
            if (input) input.focus();
        } else if (e.key === 'F2') {
            if (!seccionesVisiblesParaUsuario(estadoApp.usuario).includes('pos')) return;
            e.preventDefault();
            cobrarTicketVenta();
        } else if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay').forEach((m) => {
                m.style.display = 'none';
            });
            actualizarEstadoMonitor(false);
            setSidebarMovilAbierto(false);
        }
    });

    // 7. Filtros de Categorías en POS
    document.querySelectorAll('.btn-categoria-filtro').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-categoria-filtro').forEach((b) => b.classList.remove('activo'));
            btn.classList.add('activo');
            estadoApp.filtroCategoriaActual = btn.dataset.filtro;
            renderizarCatalogoPOS();
        });
    });

    // 8. Botones de Cobro y Vaciar en POS
    $('btn-cobrar-ticket')?.addEventListener('click', cobrarTicketVenta);
    $('btn-limpiar-carrito')?.addEventListener('click', () => {
        estadoApp.carrito = [];
        renderizarCarritoTicket();
        mostrarToast('Ticket vaciado.', 'info');
    });

    // 9. Radios de Medios de Pago
    const sincronizarChipsMedioPago = (valorSeleccionado) => {
        document.querySelectorAll('.metodo-pago-chip').forEach((chip) => chip.classList.remove('activo'));
        const radioMatch = Array.from(document.querySelectorAll('input[name="medio_pago_radio"]')).find(
            (r) => r.value === valorSeleccionado
        );
        if (radioMatch) {
            radioMatch.checked = true;
            radioMatch.closest('.metodo-pago-chip')?.classList.add('activo');
        }
    };

    document.querySelectorAll('input[name="medio_pago_radio"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            sincronizarChipsMedioPago(radio.value);
            if ($('select-metodo-pago')) $('select-metodo-pago').value = radio.value;
        });
    });

    $('select-metodo-pago')?.addEventListener('change', (e) => {
        sincronizarChipsMedioPago(e.target.value);
    });

    // 10. Modales de Impresión de Ticket Térmico
    $('btn-imprimir-ticket')?.addEventListener('click', () => {
        window.print();
    });
    $('btn-nueva-venta')?.addEventListener('click', () => {
        if ($('modal-ticket-termico')) $('modal-ticket-termico').style.display = 'none';
        $('input-codigo-barras')?.focus();
    });

    // 11. Cierre de Caja con Arqueo Ciego
    $('form-arqueo-ciego')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const contado = $('input-efectivo-contado')?.value;
        if (contado !== undefined && contado !== '') {
            await conCargando($('btn-cerrar-caja-ciego'), () => cerrarTurnoCaja(contado));
        }
    });

    $('btn-refrescar-turnos')?.addEventListener('click', () => {
        conCargando($('btn-refrescar-turnos'), cargarTurnoActivo);
    });

    // 12. Movimiento de Caja Chica
    $('btn-modal-movimiento')?.addEventListener('click', () => {
        if ($('modal-movimiento-caja')) $('modal-movimiento-caja').style.display = 'flex';
    });
    $('form-movimiento-caja')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const tipo = $('select-movimiento-tipo').value;
        const monto = $('input-movimiento-monto').value;
        const motivo = $('input-movimiento-motivo').value;
        const turnoId = estadoApp.turnoActivo?.estado === 'ABIERTO' ? estadoApp.turnoActivo.id : null;
        if (!turnoId) {
            mostrarToast('No hay un turno de caja abierto para registrar movimientos.', 'peligro');
            return;
        }

        const btnSubmit = e.submitter || $('btn-confirmar-movimiento-caja');
        await conCargando(btnSubmit, async () => {
            try {
                const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/caja/movimientos/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                    },
                    body: JSON.stringify({
                        turno_caja: turnoId,
                        tipo,
                        monto,
                        motivo,
                    }),
                });
                if (res.ok) {
                    mostrarToast('Movimiento de caja chica registrado con éxito.', 'exito');
                    if ($('modal-movimiento-caja')) $('modal-movimiento-caja').style.display = 'none';
                    $('form-movimiento-caja').reset();
                    cargarTurnoActivo();
                } else {
                    mostrarToast('Error al registrar movimiento.', 'peligro');
                }
            } catch (err) {
                console.error('Error al registrar movimiento:', err);
                mostrarToast(mensajeErrorParaUsuario(0), 'peligro');
            }
        });
    });

    // 13. Apertura de Turno
    $('btn-modal-abrir-turno')?.addEventListener('click', () => {
        if ($('modal-abrir-turno')) $('modal-abrir-turno').style.display = 'flex';
    });
    $('form-abrir-turno')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const efectivoInicial = $('input-apertura-fondo').value;
        const btnSubmit = e.submitter || $('btn-confirmar-abrir-turno');
        await conCargando(btnSubmit, async () => {
            try {
                const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/caja/turnos/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                    },
                    body: JSON.stringify({ efectivo_inicial: efectivoInicial }),
                });
                if (res.ok) {
                    reproducirSonido(obtenerSonidoParaEvento('turno.abierto'));
                    mostrarToast('Turno de caja abierto correctamente.', 'exito');
                    if ($('modal-abrir-turno')) $('modal-abrir-turno').style.display = 'none';
                    cargarTurnoActivo();
                } else {
                    const data = await res.json().catch(() => null);
                    mostrarToast(mensajeErrorParaUsuario(res.status, data?.mensaje), 'peligro');
                    // Si ya había un turno abierto, se refresca la caja para mostrarlo.
                    if (res.status === 400) cargarTurnoActivo();
                }
            } catch (err) {
                console.error('Error al registrar movimiento:', err);
                mostrarToast(mensajeErrorParaUsuario(0), 'peligro');
            }
        });
    });

    // 14. Pestañas de Compras
    document.querySelectorAll('.tab-compras-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-compras-btn').forEach((b) => b.classList.remove('activa'));
            document.querySelectorAll('.subtab-contenido').forEach((c) => c.classList.remove('activa'));
            btn.classList.add('activa');
            const subtab = $(`subtab-${btn.dataset.tab}`);
            if (subtab) subtab.classList.add('activa');
        });
    });

    // 15. Importación de Archivos .CSV / .TXT (Drag & Drop + Botones)
    $('btn-descargar-plantilla-csv')?.addEventListener('click', descargarPlantillaCsvModelo);

    const zonaDrop = $('zona-drop-csv');
    const inputArchivoCsv = $('input-archivo-csv');

    zonaDrop?.addEventListener('click', () => {
        inputArchivoCsv?.click();
    });

    zonaDrop?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputArchivoCsv?.click();
        }
    });

    zonaDrop?.addEventListener('dragover', (e) => {
        e.preventDefault();
        zonaDrop.classList.add('drag-activo');
    });

    zonaDrop?.addEventListener('dragleave', () => {
        zonaDrop.classList.remove('drag-activo');
    });

    zonaDrop?.addEventListener('drop', (e) => {
        e.preventDefault();
        zonaDrop.classList.remove('drag-activo');
        const archivo = e.dataTransfer?.files?.[0];
        if (archivo) procesarArchivoImportacionSeleccionado(archivo, 'csv');
    });

    inputArchivoCsv?.addEventListener('change', (e) => {
        const archivo = e.target.files?.[0];
        e.target.value = '';
        if (archivo) procesarArchivoImportacionSeleccionado(archivo, 'csv');
    });

    const inputArchivoIa = $('archivo-lista-ia');
    $('btn-cargar-archivo-ia')?.addEventListener('click', () => {
        inputArchivoIa?.click();
    });
    inputArchivoIa?.addEventListener('change', (e) => {
        const archivo = e.target.files?.[0];
        e.target.value = '';
        if (archivo) procesarArchivoImportacionSeleccionado(archivo, 'ia');
    });

    $('btn-csv-circuito-ia')?.addEventListener('click', () => {
        conCargando($('btn-csv-circuito-ia'), enviarCsvAlCircuitoAprobacion);
    });
    $('btn-csv-confirmar-directo')?.addEventListener('click', confirmarCsvDirectoEnInventario);
    $('btn-csv-desde-texto')?.addEventListener('click', previsualizarCsvDesdeTexto);

    // 16. Importador IA de Listas
    $('btn-quitar-foto-ia')?.addEventListener('click', () => {
        limpiarFotoImportacionActual({ limpiarAviso: true });
        mostrarToast('Foto quitada. Podés subir otro archivo o pegar texto.', 'info');
    });

    $('textarea-lista-ia')?.addEventListener('input', () => {
        if (estadoApp.imagenImportacionActual && $('textarea-lista-ia')?.value.trim()) {
            limpiarFotoImportacionActual({ limpiarAviso: true });
        }
    });

    $('btn-ejemplo-proveedor')?.addEventListener('click', () => {
        limpiarFotoImportacionActual({ limpiarAviso: true });
        estadoApp.ultimoOrigenArchivo = 'texto';
        if ($('input-proveedor-ia')) $('input-proveedor-ia').value = 'Distribuidora Central de Café';
        if ($('textarea-lista-ia')) {
            $('textarea-lista-ia').value = `Distribuidora Central de Café
- Café Colombia Supremo x 5 kg: $115000
- Leche Entera Barista x 12 litros: $16200
- Azúcar Orgánica x 10 kg: $14500
- Vasos Polipapel 8oz x 100 un: $12000
Flete y entrega a local: $4500`;
        }
        mostrarToast('Ejemplo realista de proveedor cargado.', 'info');
    });

    $('form-importacion-ia')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const proveedorNombre = $('input-proveedor-ia')?.value.trim() || 'Mayorista Café del Litoral';
        const imagenActual = estadoApp.imagenImportacionActual;
        const textoLista = $('textarea-lista-ia')?.value.trim() || '';

        if (!imagenActual && !textoLista) {
            const aviso = 'Pegá el texto de la lista o subí un archivo o foto para analizar.';
            mostrarEstadoArchivoPdf(aviso, 'advertencia');
            mostrarToast(aviso, 'advertencia');
            $('textarea-lista-ia')?.focus();
            return;
        }
        if (!imagenActual && textoLista.startsWith('%PDF-')) {
            const aviso = 'No se pudo leer el texto del PDF. Probá subiéndolo de nuevo.';
            mostrarEstadoArchivoPdf(aviso, 'advertencia');
            mostrarToast(aviso, 'advertencia');
            return;
        }

        await conCargando($('btn-analizar-ia'), async () => {
            if (imagenActual) {
                estadoApp.csvContingenciaFallback = null;
            } else {
                const evalCsv = evaluarTextoComoCsvDirecto(textoLista);
                if (evalCsv.compatible) {
                    estadoApp.csvContingenciaFallback = evalCsv.resultado;
                } else if (
                    !(estadoApp.csvParseadoActual?.items?.length > 0 &&
                    estadoApp.csvParseadoActual.textoParaIa === textoLista)
                ) {
                    estadoApp.csvContingenciaFallback = null;
                }
            }
            const estadoPill = $('estado-importacion-ia');

            if (estadoPill) estadoPill.textContent = 'Analizando con IA...';
            renderizarPropuestaIAComercial({
                _id: null,
                estado: 'PROCESANDO',
                entrada: imagenActual
                    ? { proveedorNombre, origenArchivo: 'imagen' }
                    : { proveedorNombre, textoLista, origenArchivo: estadoApp.ultimoOrigenArchivo || 'texto' },
                salida: { proveedorDetectado: proveedorNombre, envioDetectado: '0.00', items: [] },
            });

            const cuerpoSolicitud = imagenActual
                ? {
                      proveedorNombre,
                      origenArchivo: 'imagen',
                      imagenBase64: imagenActual.base64,
                      imagenMime: imagenActual.mime,
                  }
                : {
                      proveedorNombre,
                      textoLista,
                      versionPrompt: 'v1',
                      origenArchivo: estadoApp.ultimoOrigenArchivo || 'texto',
                  };

            try {
                const res = await fetchConSesion(`${estadoApp.nodeUrl}/api/importaciones`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                    },
                    body: JSON.stringify(cuerpoSolicitud),
                });
                const data = await res.json().catch(() => ({}));
                if (res.status === 202 && data.importacionId) {
                    mostrarToast('Lista recibida. Analizando con IA...', 'info');
                    const datosDetalle = await consultarDetalleImportacion(data.importacionId);
                    const evaluacion = evaluarEstadoImportacionIA(datosDetalle);
                    if (estadoPill) {
                        estadoPill.textContent = evaluacion.esContingencia
                            ? MENSAJE_IA_NO_DISPONIBLE
                            : evaluacion.enProceso
                              ? 'Analizando con IA...'
                              : 'Propuesta procesada con IA y lista en el Paso 2.';
                    }
                    if (evaluacion.esContingencia) {
                        mostrarToast(MENSAJE_IA_NO_DISPONIBLE, 'advertencia');
                    }
                } else {
                    console.warn('Error al analizar lista con IA:', res.status, data);
                    const motivo = mensajeErrorParaUsuario(res.status, data?.mensaje);
                    renderizarPropuestaIAComercial({
                        _id: null,
                        estado: 'CONTINGENCIA',
                        contingencia: true,
                        proveedorIa: 'contingencia',
                        mensajeContingencia: motivo,
                        advertencias: data?.detalles ? [String(data.detalles)] : [],
                        salida: { proveedorDetectado: proveedorNombre, envioDetectado: '0.00', items: [] },
                    });
                    if (estadoPill) estadoPill.textContent = MENSAJE_IA_NO_DISPONIBLE;
                    mostrarToast(MENSAJE_IA_NO_DISPONIBLE, 'advertencia');
                }
            } catch (err) {
                renderizarPropuestaIAComercial({
                    _id: null,
                    estado: 'CONTINGENCIA',
                    contingencia: true,
                    proveedorIa: 'contingencia',
                    mensajeContingencia: err?.message || 'No se pudo conectar con el servicio de IA.',
                    advertencias: [err?.message || 'Error de red'],
                    salida: { proveedorDetectado: proveedorNombre, envioDetectado: '0.00', items: [] },
                });
                if (estadoPill) estadoPill.textContent = MENSAJE_IA_NO_DISPONIBLE;
                mostrarToast(MENSAJE_IA_NO_DISPONIBLE, 'advertencia');
            }
        });
    });

    $('btn-aprobar-ia')?.addEventListener('click', async () => {
        const doc = estadoApp.importacionActual;
        if (!doc) return;
        const evaluacion = evaluarEstadoImportacionIA(doc);
        if (!evaluacion.puedeAprobar) {
            mostrarToast(MENSAJE_IA_NO_DISPONIBLE, 'advertencia');
            return;
        }
        const id = doc._id;
        const salida = doc.salida || {};
        const itemsParaAprobar = Array.isArray(salida.items) ? salida.items : [];
        const proveedorNombre = salida.proveedorDetectado || $('input-proveedor-ia')?.value.trim() || 'Proveedor Importado IA';
        const envio = salida.envioDetectado || '0.00';

        await conCargando($('btn-aprobar-ia'), async () => {
            try {
                const res = await fetchConSesion(`${estadoApp.nodeUrl}/api/importaciones/${id}/aprobar`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                    },
                    body: JSON.stringify({
                        proveedorNombre,
                        envio,
                        items: itemsParaAprobar,
                    }),
                });
                const data = await res.json();
                if (res.ok) {
                    reproducirSonido(obtenerSonidoParaEvento('importacion.confirmada'));
                    const cantCompras = data.comprasCreadas?.length || itemsParaAprobar.length;
                    const cantRecetas = data.productosRecalculados?.length || 0;
                    mostrarToast(
                        `Propuesta aprobada: ${cantCompras} insumos/compras actualizados y ${cantRecetas} recetas recalculadas.`,
                        'exito'
                    );
                    if ($('panel-revision-ia')) $('panel-revision-ia').style.display = 'none';
                    await cargarInsumos();
                    await cargarCatalogo();
                    return;
                }
                console.warn('Error al aprobar propuesta IA:', res.status, data);
                mostrarToast(
                    mensajeErrorParaUsuario(res.status, data?.mensaje),
                    'peligro'
                );
            } catch (err) {
                console.error('Error de red al aprobar propuesta IA:', err);
                mostrarToast(mensajeErrorParaUsuario(0), 'peligro');
            }
        });
    });

    $('btn-cerrar-desglose')?.addEventListener('click', () => {
        estadoApp.productoDesgloseId = null;
        if ($('panel-desglose-receta')) $('panel-desglose-receta').style.display = 'none';
    });

    $('btn-rechazar-ia')?.addEventListener('click', async () => {
        const id = estadoApp.importacionActual?._id;
        if (!id || String(id).startsWith('local-')) {
            if ($('panel-revision-ia')) $('panel-revision-ia').style.display = 'none';
            estadoApp.importacionActual = null;
            return;
        }
        await conCargando($('btn-rechazar-ia'), async () => {
            try {
                const res = await fetchConSesion(`${estadoApp.nodeUrl}/api/importaciones/${id}/rechazar`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                    },
                    body: JSON.stringify({ motivo: 'Descartado por operador en revisión' }),
                });
                if (res.ok) {
                    mostrarToast('Propuesta de importación descartada.', 'info');
                    if ($('panel-revision-ia')) $('panel-revision-ia').style.display = 'none';
                }
            } catch (err) {
                console.error('Error al registrar movimiento:', err);
                mostrarToast(mensajeErrorParaUsuario(0), 'peligro');
            }
        });
    });

    // 17. Compra Manual de Insumos
    $('btn-modal-nueva-compra')?.addEventListener('click', () => {
        if ($('modal-nueva-compra')) $('modal-nueva-compra').style.display = 'flex';
    });
    $('form-nueva-compra')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const proveedor = $('select-compra-proveedor').value;
        const insumo = $('select-compra-insumo').value;
        const cantidad = $('input-compra-cantidad').value;
        const unidad = $('select-compra-unidad').value;
        const precioTotal = $('input-compra-total').value;
        const envio = $('input-compra-envio').value || '0.00';

        const btnSubmit = e.submitter || $('btn-confirmar-nueva-compra');
        await conCargando(btnSubmit, async () => {
            try {
                const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/compras/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                    },
                    body: JSON.stringify({
                        proveedor: Number(proveedor),
                        insumo: Number(insumo),
                        cantidad,
                        unidad,
                        precio_total: precioTotal,
                        envio,
                        iva_incluido: true,
                    }),
                });
                if (res.ok) {
                    mostrarToast('Compra registrada y costo base ponderado recalculado.', 'exito');
                    if ($('modal-nueva-compra')) $('modal-nueva-compra').style.display = 'none';
                    $('form-nueva-compra').reset();
                    cargarInsumos();
                    cargarCatalogo();
                } else {
                    mostrarToast('Error al registrar compra.', 'peligro');
                }
            } catch (err) {
                console.error('Error al registrar movimiento:', err);
                mostrarToast(mensajeErrorParaUsuario(0), 'peligro');
            }
        });
    });

    // 18. Recalcular toda la carta y Gestión de Productos / Recetas
    $('btn-recalcular-toda-carta')?.addEventListener('click', () => {
        conCargando($('btn-recalcular-toda-carta'), recalcularTodaLaCarta);
    });

    $('btn-qr-carta-publica')?.addEventListener('click', abrirModalQrCarta);

    $('btn-copiar-url-carta')?.addEventListener('click', async () => {
        const inputUrl = $('input-url-carta-publica');
        const url = inputUrl?.value || '';
        if (!url) return;
        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(url);
            } else if (inputUrl) {
                inputUrl.select();
                document.execCommand('copy');
            }
            mostrarToast('Enlace de la carta copiado.', 'exito');
        } catch {
            mostrarToast('No pudimos copiar el enlace automáticamente. Copialo desde el recuadro.', 'advertencia');
        }
    });

    $('btn-descargar-qr-svg')?.addEventListener('click', () => {
        if (!ultimoSvgQrCartaGenerado) return;
        const blob = new Blob([ultimoSvgQrCartaGenerado], { type: 'image/svg+xml;charset=utf-8' });
        const urlObj = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = urlObj;
        enlace.download = 'qr-carta-sapori.svg';
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
        setTimeout(() => URL.revokeObjectURL(urlObj), 1000);
        mostrarToast('Imagen del código QR descargada.', 'exito');
    });

    $('btn-imprimir-qr-carta')?.addEventListener('click', () => {
        document.body.classList.add('imprimiendo-qr-carta');
        const limpiarClasePrint = () => {
            document.body.classList.remove('imprimiendo-qr-carta');
            window.removeEventListener('afterprint', limpiarClasePrint);
        };
        window.addEventListener('afterprint', limpiarClasePrint);
        window.print();
        setTimeout(limpiarClasePrint, 600);
    });

    $('btn-modal-nuevo-producto')?.addEventListener('click', () => {
        if (!usuarioTienePermiso(estadoApp.usuario, 'recetas.crear')) return;
        $('form-nuevo-producto')?.reset();
        if ($('input-nuevo-producto-minutos')) $('input-nuevo-producto-minutos').value = '0.00';
        if ($('input-nuevo-producto-costo-hora')) $('input-nuevo-producto-costo-hora').value = '2500.00';
        if ($('modal-nuevo-producto')) $('modal-nuevo-producto').style.display = 'flex';
    });

    $('form-nuevo-producto')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!usuarioTienePermiso(estadoApp.usuario, 'recetas.crear')) return;

        const nombre = ($('input-nuevo-producto-nombre')?.value || '').trim();
        const codigoBarras = ($('input-nuevo-producto-codigo')?.value || '').trim();
        const precioVenta = $('input-nuevo-producto-precio')?.value;
        const minutosManoObra = $('input-nuevo-producto-minutos')?.value || '0.00';
        const costoHoraManoObra = $('input-nuevo-producto-costo-hora')?.value || '2500.00';

        if (!nombre) {
            mostrarToast('Ingresá el nombre del producto.', 'advertencia');
            return;
        }

        const btnSubmit = e.submitter || $('btn-confirmar-nuevo-producto');
        await conCargando(btnSubmit, async () => {
            try {
                const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/productos/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                    },
                    body: JSON.stringify({
                        nombre,
                        codigo_barras: codigoBarras || null,
                        precio_venta: precioVenta,
                        minutos_mano_obra: minutosManoObra,
                        costo_hora_mano_obra: costoHoraManoObra,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    if ($('modal-nuevo-producto')) $('modal-nuevo-producto').style.display = 'none';
                    $('form-nuevo-producto').reset();
                    mostrarToast(`Producto "${data.nombre || nombre}" agregado a la carta.`, 'exito');
                    await cargarCatalogo();
                } else {
                    mostrarToast(extraerMensajeErrorApi(data, 'No se pudo crear el producto.'), 'peligro');
                }
            } catch (err) {
                console.error('Error al registrar movimiento:', err);
                mostrarToast(mensajeErrorParaUsuario(0), 'peligro');
            }
        });
    });

    $('form-editar-precio-producto')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!usuarioTienePermiso(estadoApp.usuario, 'recetas.editar')) return;

        const productoId = $('input-editar-precio-id')?.value;
        const precioVenta = $('input-editar-precio-venta')?.value;
        if (!productoId) return;

        const btnSubmit = e.submitter || $('btn-confirmar-editar-precio');
        await conCargando(btnSubmit, async () => {
            try {
                const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/productos/${productoId}/`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                    },
                    body: JSON.stringify({ precio_venta: precioVenta }),
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    if ($('modal-editar-precio-producto')) $('modal-editar-precio-producto').style.display = 'none';
                    mostrarToast('Precio de venta actualizado y margen recalculado.', 'exito');
                    await cargarCatalogo();
                } else {
                    mostrarToast(extraerMensajeErrorApi(data, 'No se pudo actualizar el precio de venta.'), 'peligro');
                }
            } catch (err) {
                console.error('Error al registrar movimiento:', err);
                mostrarToast(mensajeErrorParaUsuario(0), 'peligro');
            }
        });
    });

    $('select-receta-insumo')?.addEventListener('change', actualizarSelectUnidadReceta);

    $('form-agregar-receta-item')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!usuarioTienePermiso(estadoApp.usuario, 'recetas.crear')) return;

        const productoId = estadoApp.productoDesgloseId;
        const insumoId = $('select-receta-insumo')?.value;
        const cantidad = $('input-receta-cantidad')?.value;
        const unidad = $('select-receta-unidad')?.value;

        if (!productoId || !insumoId) {
            mostrarToast('Seleccioná un producto e insumo válidos.', 'advertencia');
            return;
        }

        const btnSubmit = e.submitter || $('btn-agregar-receta-item');
        await conCargando(btnSubmit, async () => {
            try {
                const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/recetas-items/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                    },
                    body: JSON.stringify({
                        producto: Number(productoId),
                        insumo: Number(insumoId),
                        cantidad,
                        unidad,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    if ($('input-receta-cantidad')) $('input-receta-cantidad').value = '';
                    mostrarToast('Insumo agregado a la receta y costo recalculado.', 'exito');
                    await cargarCatalogo();
                } else {
                    mostrarToast(extraerMensajeErrorApi(data, 'No se pudo agregar el insumo a la receta.'), 'peligro');
                }
            } catch (err) {
                console.error('Error al registrar movimiento:', err);
                mostrarToast(mensajeErrorParaUsuario(0), 'peligro');
            }
        });
    });

    // 19. Simulador de Punto de Equilibrio
    $('form-punto-equilibrio')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await conCargando($('btn-calcular-pe'), () => calcularPuntoEquilibrio());
    });

    // 20. Configuración de Servidor y Modo de Conexión
    $('btn-config-servidor-login')?.addEventListener('click', abrirModalConfigServidor);
    $('btn-config-servidor-header')?.addEventListener('click', abrirModalConfigServidor);

    $('select-modo-conexion')?.addEventListener('change', (e) => {
        const modo = e.target.value;
        if (modo === 'local') {
            if ($('input-config-django-url')) $('input-config-django-url').value = 'http://localhost:8000';
            if ($('input-config-node-url')) $('input-config-node-url').value = 'http://localhost:3000';
        } else if (modo === 'cloud') {
            const cfg = window.__SAPORI_CONFIG__ || {};
            if ($('input-config-django-url')) $('input-config-django-url').value = cfg.DJANGO_API_URL || 'https://sapori-backend-django.onrender.com';
            if ($('input-config-node-url')) $('input-config-node-url').value = cfg.NODE_API_URL || 'https://sapori-backend-node.onrender.com';
        }
    });

    $('form-config-servidor')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const modo = $('select-modo-conexion')?.value || 'local';
        const djangoUrl = ($('input-config-django-url')?.value || 'http://localhost:8000').trim().replace(/\/$/, '');
        const nodeUrl = ($('input-config-node-url')?.value || 'http://localhost:3000').trim().replace(/\/$/, '');

        estadoApp.modoConexion = modo;
        estadoApp.djangoUrl = djangoUrl;
        estadoApp.nodeUrl = nodeUrl;

        localStorage.setItem(CLAVE_MODO_CONEXION, modo);
        localStorage.setItem(CLAVE_DJANGO_URL, djangoUrl);
        localStorage.setItem(CLAVE_NODE_URL, nodeUrl);

        if ($('modal-config-servidor')) $('modal-config-servidor').style.display = 'none';
        actualizarIndicadorColaOffline();
        conectarSocketTiempoReal();
        if (!estadoApp.tokenJwt) {
            actualizarDisponibilidadDemo();
        }
        const etiquetasModo = {
            local: 'En la computadora del local',
            cloud: 'En internet',
            offline: 'Sin internet (temporal)',
        };
        mostrarToast(
            `Modo de conexión actualizado a: ${etiquetasModo[modo] || 'En la computadora del local'}.`,
            'exito'
        );
    });

    // 21. Sincronización de ventas offline y reconexión automática
    $('btn-sincronizar-offline')?.addEventListener('click', () => {
        conCargando($('btn-sincronizar-offline'), sincronizarVentasPendientes);
    });

    // 21b. Consultor IA de Stock y Cierre de Caja para el Dueño
    $('btn-ia-diagnostico-stock')?.addEventListener('click', () => {
        conCargando($('btn-ia-diagnostico-stock'), consultarDiagnosticoStockIA);
    });
    $('btn-ia-auditar-caja')?.addEventListener('click', () => {
        conCargando($('btn-ia-auditar-caja'), auditarCierreCajaIA);
    });

    // 21c. Filtro de Fechas y Trazabilidad en Reportes y Finanzas
    const aplicarFiltroFechasReportes = async (boton = $('btn-filtrar-fechas')) => {
        const { fechaDesde, fechaHasta } = obtenerRangoFechasSeleccionado({ paraValidar: true });
        const validacion = validarRangoFechas(fechaDesde, fechaHasta);
        if (!validacion.valido) {
            mostrarToast(validacion.mensaje, 'advertencia');
            return;
        }
        document.querySelectorAll('.btn-atajo-fecha').forEach((b) => b.classList.remove('activo'));
        await conCargando(boton, () => cargarFinanzas());
    };
    const manejarEnterFiltroFechas = (evento) => {
        if (evento.key === 'Enter') {
            evento.preventDefault();
            aplicarFiltroFechasReportes();
        }
    };
    ['filtro-fecha-desde', 'filtro-fecha-hasta'].forEach((id) => {
        const campo = $(id);
        if (!campo) return;
        campo.addEventListener('keydown', manejarEnterFiltroFechas);
        // Barras automáticas mientras se escribe (no dispara la búsqueda).
        campo.addEventListener('input', () => {
            const formateado = formatearEntradaFecha(campo.value);
            if (formateado !== campo.value) campo.value = formateado;
        });
    });
    // Botón de calendario: abre el selector nativo y copia la fecha elegida al campo.
    document.querySelectorAll('.btn-calendario-fecha').forEach((btn) => {
        const campo = $(btn.dataset.para);
        const calendario = $(`${btn.dataset.para}-calendario`);
        if (!campo || !calendario) return;
        btn.addEventListener('click', () => {
            calendario.value = fechaTextoAIso(campo.value) || '';
            try {
                calendario.showPicker();
            } catch {
                calendario.focus();
                calendario.click();
            }
        });
        calendario.addEventListener('change', () => {
            campo.value = fechaIsoATexto(calendario.value);
            campo.focus();
        });
    });
    $('btn-filtrar-fechas')?.addEventListener('click', () => aplicarFiltroFechasReportes($('btn-filtrar-fechas')));
    $('btn-limpiar-fechas')?.addEventListener('click', async () => {
        if ($('filtro-fecha-desde')) $('filtro-fecha-desde').value = '';
        if ($('filtro-fecha-hasta')) $('filtro-fecha-hasta').value = '';
        document.querySelectorAll('.btn-atajo-fecha').forEach((b) => b.classList.remove('activo'));
        await conCargando($('btn-limpiar-fechas'), () => cargarFinanzas());
    });

    document.querySelectorAll('.btn-atajo-fecha').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const atajo = btn.dataset.atajo;
            const ahora = new Date();
            let desde = formatearFechaLocalInput(ahora);
            const hasta = formatearFechaLocalInput(ahora);

            if (atajo === '7dias') {
                desde = formatearFechaLocalInput(new Date(ahora.getTime() - 6 * 86400000));
            } else if (atajo === 'mes') {
                desde = formatearFechaLocalInput(new Date(ahora.getFullYear(), ahora.getMonth(), 1));
            }

            if ($('filtro-fecha-desde')) $('filtro-fecha-desde').value = fechaIsoATexto(desde);
            if ($('filtro-fecha-hasta')) $('filtro-fecha-hasta').value = fechaIsoATexto(hasta);

            document.querySelectorAll('.btn-atajo-fecha').forEach((b) => b.classList.remove('activo'));
            btn.classList.add('activo');
            await conCargando(btn, () => cargarFinanzas());
        });
    });

    document.querySelectorAll('.btn-trazabilidad-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-trazabilidad-tab').forEach((b) => b.classList.remove('activa'));
            btn.classList.add('activa');
            estadoApp.trazabilidad.categoriaActiva = btn.dataset.categoria || 'todos';
            renderizarTablaTrazabilidad();
        });
    });

    window.addEventListener('online', () => {
        actualizarIndicadorColaOffline();
        mostrarToast('Volvió internet. Enviando ventas guardadas…', 'info');
        sincronizarVentasPendientes();
    });

    window.addEventListener('offline', () => {
        actualizarIndicadorColaOffline();
        actualizarEstadoSocketUI(false, 'Trabajando sin internet');
        mostrarToast('Se cortó internet. Podés seguir vendiendo; las ventas se guardarán para enviarse solas.', 'advertencia');
    });

    // 22. Cierre de todos los modales con botón data-cerrar
    document.querySelectorAll('[data-cerrar]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const idModal = btn.dataset.cerrar;
            const modal = $(idModal);
            if (modal) modal.style.display = 'none';
        });
    });

    // 23. Equipo & Permisos: alta de empleados, cambio de rol, permisos y baja
    $('btn-modal-nuevo-empleado')?.addEventListener('click', () => {
        if (!usuarioTienePermiso(estadoApp.usuario, 'personal.crear')) return;
        $('form-nuevo-empleado')?.reset();
        if ($('select-nuevo-empleado-rol')) $('select-nuevo-empleado-rol').value = 'CAJERO';
        actualizarEstadoVisibilidadCampo($('btn-toggle-nuevo-empleado-password'), false);
        if ($('modal-nuevo-empleado')) $('modal-nuevo-empleado').style.display = 'flex';
    });

    $('form-nuevo-empleado')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!usuarioTienePermiso(estadoApp.usuario, 'personal.crear')) return;

        const first_name = ($('input-nuevo-empleado-nombre')?.value || '').trim();
        const last_name = ($('input-nuevo-empleado-apellido')?.value || '').trim();
        const username = ($('input-nuevo-empleado-usuario')?.value || '').trim();
        const password = $('input-nuevo-empleado-password')?.value || '';
        const email = ($('input-nuevo-empleado-email')?.value || '').trim();
        const rol = $('select-nuevo-empleado-rol')?.value || 'CAJERO';

        if (!username) {
            mostrarToast('Ingresá un nombre de usuario.', 'advertencia');
            return;
        }
        if (password.length < 4) {
            mostrarToast('La contraseña tiene que tener al menos 4 caracteres.', 'advertencia');
            return;
        }

        await conCargando($('btn-submit-nuevo-empleado'), async () => {
            try {
                const res = await fetchConSesion(`${estadoApp.djangoUrl}/api/usuarios/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        username,
                        password,
                        first_name,
                        last_name,
                        email,
                        rol,
                        permisos: {},
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    if ($('modal-nuevo-empleado')) $('modal-nuevo-empleado').style.display = 'none';
                    $('form-nuevo-empleado')?.reset();
                    actualizarEstadoVisibilidadCampo($('btn-toggle-nuevo-empleado-password'), false);
                    mostrarToast('Empleado agregado.', 'exito');
                    await cargarPersonal();
                } else {
                    const msgApi = extraerMensajeErrorApi(data, data?.mensaje || '');
                    mostrarToast(mensajeErrorParaUsuario(res.status, msgApi), 'peligro');
                }
            } catch {
                mostrarToast(mensajeErrorParaUsuario(0), 'peligro');
            }
        });
    });

    $('select-permisos-rol')?.addEventListener('change', (e) => {
        if (estadoApp.empleadoEditandoPermisos?.is_superuser) return;
        aplicarPlantillaEnCasillasPermisos(obtenerPlantillaRol(e.target.value));
    });

    $('form-permisos-empleado')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const u = estadoApp.empleadoEditandoPermisos;
        if (!u || u.is_superuser || !usuarioTienePermiso(estadoApp.usuario, 'personal.ajustar_permisos')) {
            return;
        }

        const clavesMarcadas = Array.from(
            document.querySelectorAll('#permisos-categorias-grilla input[type="checkbox"][data-permiso]:checked')
        ).map((cb) => cb.dataset.permiso);
        const permisosDict = construirDictPermisosDesdeSeleccion(clavesMarcadas);

        const puedeEditarRol = usuarioTienePermiso(estadoApp.usuario, 'personal.editar');
        const rolOriginal = ((u.is_superuser ? 'DUENIO' : u.rol) || 'CAJERO').toUpperCase();
        const nuevoRol = ($('select-permisos-rol')?.value || rolOriginal).toUpperCase();
        const cambioRol = puedeEditarRol && nuevoRol !== rolOriginal;

        await conCargando($('btn-guardar-permisos'), async () => {
            let rolActualizado = false;
            try {
                if (cambioRol) {
                    const resRol = await fetchConSesion(`${estadoApp.djangoUrl}/api/usuarios/${u.id}/`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ rol: nuevoRol }),
                    });
                    const dataRol = await resRol.json().catch(() => ({}));
                    if (!resRol.ok) {
                        const msgApi = extraerMensajeErrorApi(dataRol, dataRol?.mensaje || '');
                        mostrarToast(mensajeErrorParaUsuario(resRol.status, msgApi), 'peligro');
                        return;
                    }
                    rolActualizado = true;
                    u.rol = nuevoRol;
                }

                const resPerm = await fetchConSesion(`${estadoApp.djangoUrl}/api/usuarios/${u.id}/ajustar-permisos/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ permisos: permisosDict }),
                });
                const dataPerm = await resPerm.json().catch(() => ({}));
                if (resPerm.ok) {
                    if ($('modal-permisos')) $('modal-permisos').style.display = 'none';
                    estadoApp.empleadoEditandoPermisos = null;
                    mostrarToast('Permisos guardados.', 'exito');
                    await cargarPersonal();
                } else {
                    const msgApi = extraerMensajeErrorApi(dataPerm, dataPerm?.mensaje || '');
                    mostrarToast(mensajeErrorParaUsuario(resPerm.status, msgApi), 'peligro');
                    if (rolActualizado) {
                        await cargarPersonal();
                    }
                }
            } catch {
                mostrarToast(mensajeErrorParaUsuario(0), 'peligro');
            }
        });
    });

    $('form-baja-empleado')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const u = estadoApp.empleadoParaBaja;
        if (!u) return;

        const motivo = ($('input-baja-empleado-motivo')?.value || '').trim();
        await conCargando($('btn-confirmar-baja-empleado'), () => toggleEstadoUsuario(u, motivo));
    });
};

const registrarServiceWorkerPwa = () => {
    if ('serviceWorker' in navigator) {
        const rutaSw = window.location.pathname.startsWith('/app') ? '/app/sw.js' : '/sw.js';
        navigator.serviceWorker.register(rutaSw).catch(() => {
            // Operación local en HTTP
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    registrarDesbloqueoAudio();
    actualizarBotonSonidosUI();
    registrarServiceWorkerPwa();
    actualizarUIUsuario();
    renderizarCatalogoPOS();
    inicializarEventosDOM();

    if (estadoApp.tokenJwt) {
        conectarSocketTiempoReal();
        cargarDatosIniciales();
    } else {
        actualizarDisponibilidadDemo();
    }
});
