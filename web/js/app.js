/**
 * Sapori Stock · Sistema POS & Gestión Gastronómica
 * Frontend Comercial Híbrido (Web Cloud + Red Local LAN + Contingencia Offline)
 * Conectado a APIs de Django, Node & Socket.IO
 */

import {
    agregarProductoAlCarrito,
    buscarProductoPorCodigoOTexto,
    calcularResumenCarrito,
    encolarVentaOffline,
    extraerItemsDesdeTextoLista,
    formatearCentavosADecimal,
    formatearEventoTiempoReal,
    limpiarColaOffline,
    obtenerContenidoPlantillaCsv,
    obtenerVentasOffline,
    parsearCsvProveedor,
} from './logicaPwa.js';

const CLAVE_CATALOGO_CACHE = 'sapori_catalogo_cache';
const CLAVE_TURNO_CACHE = 'sapori_turno_cache';
const CLAVE_MODO_CONEXION = 'sapori_modo_conexion';
const CLAVE_DJANGO_URL = 'sapori_django_url';
const CLAVE_NODE_URL = 'sapori_node_url';

// Catálogo de respaldo inicial por si el backend tarda en responder
const CATALOGO_RESPALDO = [
    { id: 1, nombre: 'Café Espresso Doble', codigo_barras: '7790001000011', precio_venta: '2200.00', costo_total_calculado: '650.00', margen_bruto: '0.7045' },
    { id: 2, nombre: 'Café Flat White Barista', codigo_barras: '7790001000028', precio_venta: '3800.00', costo_total_calculado: '1420.00', margen_bruto: '0.6263' },
    { id: 3, nombre: 'Cappuccino Italiano', codigo_barras: '7790001000035', precio_venta: '3500.00', costo_total_calculado: '1350.00', margen_bruto: '0.6142' },
    { id: 4, nombre: 'Chipá Tradicional (x4)', codigo_barras: '7790001000042', precio_venta: '1800.00', costo_total_calculado: '820.00', margen_bruto: '0.5444' },
    { id: 5, nombre: 'Medialuna de Manteca', codigo_barras: '7790001000059', precio_venta: '1400.00', costo_total_calculado: '550.00', margen_bruto: '0.6071' },
];

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
            if (Array.isArray(lista) && lista.length > 0) return lista;
        }
    } catch {
        // Fallback al catálogo por defecto
    }
    return [...CATALOGO_RESPALDO];
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

export const estadoApp = {
    modoConexion: endpointsIniciales.modoConexion,
    djangoUrl: endpointsIniciales.djangoUrl,
    nodeUrl: endpointsIniciales.nodeUrl,
    tokenJwt: sessionStorage.getItem('cafe_jwt') || '',
    usuario: JSON.parse(sessionStorage.getItem('cafe_user') || 'null'),
    socket: null,
    turnoActivo: leerCacheTurnoLocal(),
    catalogo: leerCacheCatalogoLocal(),
    carrito: [],
    importacionActual: null,
    csvParseadoActual: null,
    insumos: [],
    proveedores: [],
    turnosHistorial: [],
    usuariosEquipo: [],
    filtroCategoriaActual: 'todos',
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
// TOAST NOTIFICACIONES FLOTANTES (CERO EMOJIS)
// ============================================================
export const mostrarToast = (mensaje, tipo = 'info') => {
    const contenedor = $('contenedor-toasts');
    if (!contenedor) return;

    const toast = document.createElement('div');
    toast.className = `toast-notif ${tipo}`;

    let iconoSvg = SVG_ICONOS.info;
    if (tipo === 'exito') iconoSvg = SVG_ICONOS.check;
    if (tipo === 'peligro' || tipo === 'advertencia') iconoSvg = SVG_ICONOS.alerta;

    toast.innerHTML = `<span style="display: inline-flex; align-items: center;">${iconoSvg}</span><span>${mensaje}</span>`;
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
        texto.textContent = `Modo Sin Internet Activo — ${cantidad} ventas en cola local`;
    } else {
        banner.style.display = 'none';
    }
};

const asegurarSesionYTurnoParaSincronizacion = async () => {
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

    const tokenInvalido = !estadoApp.tokenJwt || estadoApp.tokenJwt.startsWith('offline-token-');
    if (tokenInvalido) {
        const username = estadoApp.usuario?.username || 'duenio_demo';
        const password = sessionStorage.getItem('cafe_pwd') || 'Demo1234!';
        try {
            const resAuth = await fetch(`${estadoApp.djangoUrl}/api/auth/token/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            if (resAuth.ok) {
                const dataAuth = await resAuth.json();
                estadoApp.tokenJwt = dataAuth.access;
                sessionStorage.setItem('cafe_jwt', dataAuth.access);
                if (dataAuth.usuario) {
                    estadoApp.usuario = dataAuth.usuario;
                    sessionStorage.setItem('cafe_user', JSON.stringify(dataAuth.usuario));
                }
            }
        } catch {
            // Se manejará en el intento de sincronización
        }
    }

    let turnoIdValido = estadoApp.turnoActivo?.estado === 'ABIERTO' ? estadoApp.turnoActivo?.id : null;
    try {
        const resTurnos = await fetch(`${estadoApp.djangoUrl}/api/caja/turnos/`, {
            headers: {
                'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                'Content-Type': 'application/json',
            },
        });
        if (resTurnos.ok) {
            const dataTurnos = await resTurnos.json();
            const listaTurnos = Array.isArray(dataTurnos)
                ? dataTurnos
                : (dataTurnos.datos || dataTurnos.results || []);
            const miId = Number(estadoApp.usuario?.id || 0);
            const esDuenioOEncargado = ['DUENIO', 'ENCARGADO'].includes(
                String(estadoApp.usuario?.rol || '').toUpperCase()
            );

            const turnoPropioAbierto = listaTurnos.find(
                (t) => t.estado === 'ABIERTO' && (Number(t.usuario) === miId || esDuenioOEncargado)
            );
            if (turnoPropioAbierto) {
                turnoIdValido = turnoPropioAbierto.id;
                estadoApp.turnoActivo = turnoPropioAbierto;
                localStorage.setItem(CLAVE_TURNO_CACHE, JSON.stringify(turnoPropioAbierto));
            } else {
                const resCrear = await fetch(`${estadoApp.djangoUrl}/api/caja/turnos/`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ efectivo_inicial: '10000.00' }),
                });
                if (resCrear.ok) {
                    const nuevoTurno = await resCrear.json();
                    turnoIdValido = nuevoTurno.id;
                    estadoApp.turnoActivo = nuevoTurno;
                    localStorage.setItem(CLAVE_TURNO_CACHE, JSON.stringify(nuevoTurno));
                }
            }
        }
    } catch {
        // Fallback al turno en caché
    }

    return turnoIdValido || estadoApp.turnoActivo?.id || 1;
};

export const sincronizarVentasPendientes = async () => {
    const cola = obtenerVentasOffline();
    if (cola.length === 0) {
        if (estadoApp.modoConexion === 'offline') {
            estadoApp.modoConexion = 'local';
            localStorage.setItem(CLAVE_MODO_CONEXION, 'local');
            conectarSocketTiempoReal();
        }
        actualizarIndicadorColaOffline();
        mostrarToast('Modo en línea restablecido. No hay ventas pendientes en la cola local.', 'exito');
        return;
    }

    if (navigator.onLine === false) {
        mostrarToast('El dispositivo continúa sin conexión a internet.', 'advertencia');
        return;
    }

    mostrarToast(`Sincronizando ${cola.length} venta(s) pendiente(s) con el servidor...`, 'info');
    const turnoIdActivo = await asegurarSesionYTurnoParaSincronizacion();
    let sincronizadas = 0;

    for (const itemCola of cola) {
        const raw = itemCola.payload || {};
        const itemsRaw = raw.items_entrada || raw.items || [];
        const medioPago = raw.medio_pago || raw.metodo_pago || 'EFECTIVO';

        const payloadNormalizado = {
            turno_caja: turnoIdActivo,
            medio_pago: medioPago,
            origen: raw.origen || 'propio',
            items_entrada: itemsRaw.map((it) => ({
                producto_id: Number(it.producto_id || it.producto || 1),
                cantidad: String(it.cantidad || 1),
            })),
        };

        try {
            const res = await fetch(`${estadoApp.djangoUrl}/api/ventas/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                },
                body: JSON.stringify(payloadNormalizado),
            });
            if (res.ok) {
                sincronizadas += 1;
            } else {
                break;
            }
        } catch {
            break;
        }
    }

    if (sincronizadas === cola.length) {
        limpiarColaOffline();
        actualizarIndicadorColaOffline();
        conectarSocketTiempoReal();
        mostrarToast(`Se sincronizaron ${sincronizadas} venta(s) pendiente(s) con éxito.`, 'exito');
        await cargarTurnoActivo();
        await cargarFinanzas();
    } else {
        actualizarIndicadorColaOffline();
        mostrarToast('El servidor aún no está disponible para vaciar toda la cola.', 'advertencia');
    }
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

const actualizarUIUsuario = () => {
    const pantallaLogin = $('pantalla-login');
    const u = estadoApp.usuario;

    if (!estadoApp.tokenJwt) {
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
    actualizarIndicadorColaOffline();
};

const configurarVisibilidadPorRol = (rol) => {
    const esCajero = rol === 'CAJERO';

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
};

const iniciarSesionContingenciaOffline = (username) => {
    const uMin = String(username || 'cajero_demo').toLowerCase();
    let rol = 'CAJERO';
    if (uMin.includes('duenio')) rol = 'DUENIO';
    else if (uMin.includes('encargado')) rol = 'ENCARGADO';

    estadoApp.tokenJwt = `offline-token-${Date.now()}`;
    estadoApp.usuario = {
        id: 1,
        username: username || 'cajero_demo',
        rol,
        permisos: [],
    };
    sessionStorage.setItem('cafe_jwt', estadoApp.tokenJwt);
    sessionStorage.setItem('cafe_user', JSON.stringify(estadoApp.usuario));

    actualizarUIUsuario();
    renderizarCatalogoPOS();
    renderizarTablaRecetas();
    if (estadoApp.turnoActivo) {
        actualizarCardTurnoActivo(estadoApp.turnoActivo);
    }
    actualizarEstadoSocketUI(false, '(Contingencia Offline)');
    actualizarIndicadorColaOffline();
    mostrarToast(`Sesión iniciada en Modo Contingencia Offline (${username}).`, 'advertencia');
};

const ejecutarLogin = async (username, password, tokenManual = '') => {
    if (tokenManual) {
        estadoApp.tokenJwt = tokenManual;
        sessionStorage.setItem('cafe_jwt', tokenManual);
        actualizarUIUsuario();
        conectarSocketTiempoReal();
        cargarDatosIniciales();
        mostrarToast('Sesión iniciada con token de acceso.', 'exito');
        return;
    }

    if (estadoApp.modoConexion === 'offline' || navigator.onLine === false) {
        if (password) sessionStorage.setItem('cafe_pwd', password);
        iniciarSesionContingenciaOffline(username);
        return;
    }

    const estadoEl = $('mensaje-auth');
    if (estadoEl) estadoEl.textContent = 'Verificando credenciales...';

    try {
        const res = await fetch(`${estadoApp.djangoUrl}/api/auth/token/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json();

        if (!res.ok) {
            const err = data.mensaje || data.detail || 'Credenciales inválidas';
            if (estadoEl) estadoEl.textContent = err;
            mostrarToast(err, 'peligro');
            return;
        }

        estadoApp.tokenJwt = data.access;
        sessionStorage.setItem('cafe_jwt', data.access);
        if (password) sessionStorage.setItem('cafe_pwd', password);

        if (data.usuario) {
            estadoApp.usuario = data.usuario;
            sessionStorage.setItem('cafe_user', JSON.stringify(data.usuario));
        } else {
            const claims = decodificarClaimsJwt(data.access);
            if (claims) {
                estadoApp.usuario = {
                    id: claims.user_id || claims.sub,
                    username: claims.username || username,
                    rol: claims.rol || 'CAJERO',
                    permisos: claims.permisos || [],
                };
                sessionStorage.setItem('cafe_user', JSON.stringify(estadoApp.usuario));
            }
        }

        actualizarUIUsuario();
        conectarSocketTiempoReal();
        cargarDatosIniciales();
        mostrarToast(`Bienvenido a Sapori Stock, ${username}.`, 'exito');
    } catch {
        iniciarSesionContingenciaOffline(username);
    }
};

const cerrarSesion = () => {
    estadoApp.tokenJwt = '';
    estadoApp.usuario = null;
    sessionStorage.removeItem('cafe_jwt');
    sessionStorage.removeItem('cafe_user');
    if (estadoApp.socket) {
        estadoApp.socket.disconnect();
    }
    actualizarUIUsuario();
    mostrarToast('Sesión cerrada correctamente.', 'info');
};

// ============================================================
// CONEXIÓN SOCKET.IO EN TIEMPO REAL
// ============================================================
export const conectarSocketTiempoReal = () => {
    if (estadoApp.modoConexion === 'offline' || navigator.onLine === false) {
        actualizarEstadoSocketUI(false, '(Modo Offline)');
        return;
    }

    if (!window.io) {
        actualizarEstadoSocketUI(false, '(Cliente no disponible)');
        return;
    }

    if (estadoApp.socket) {
        estadoApp.socket.disconnect();
    }

    if (!estadoApp.tokenJwt) {
        actualizarEstadoSocketUI(false, '(Sin sesión activa)');
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
        actualizarEstadoSocketUI(true, 'En Línea');
    });

    socket.on('disconnect', () => {
        actualizarEstadoSocketUI(false, 'Reconectando...');
    });

    socket.on('connect_error', () => {
        actualizarEstadoSocketUI(false, 'Error de Enlace');
    });

    socket.on('presencia.actualizada', (datos) => {
        const el = $('insignia-presencia');
        if (el) {
            const cant = datos.totalUsuarios ?? 1;
            el.textContent = `${cant} terminal${cant !== 1 ? 'es' : ''} activa${cant !== 1 ? 's' : ''}`;
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
    el.textContent = `Sistema ${texto}`;
};

const registrarEventoEnFeed = (nombreEvento, payload) => {
    const item = formatearEventoTiempoReal(nombreEvento, payload);
    const lista = $('lista-eventos-vivo');
    if (lista) {
        const li = document.createElement('li');
        li.className = `evento-item ${item.nivel}`;
        li.innerHTML = `
            <div class="evento-titulo">
                <span>${item.titulo}</span>
                <small>${new Date(item.emitidoEn).toLocaleTimeString('es-AR')}</small>
            </div>
            <div class="evento-detalle">${item.detalle}</div>
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
};

// ============================================================
// MÓDULO 1: PUNTO DE VENTA (POS) + COLA OFFLINE
// ============================================================
export const cargarCatalogo = async () => {
    if (estadoApp.modoConexion !== 'offline' && navigator.onLine !== false) {
        try {
            const res = await fetch(`${estadoApp.djangoUrl}/api/productos/`, {
                headers: {
                    'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                    'Content-Type': 'application/json',
                },
            });
            if (res.ok) {
                const data = await res.json();
                const productos = Array.isArray(data) ? data : (data.datos || data.results || []);
                if (productos.length > 0) {
                    estadoApp.catalogo = productos;
                    localStorage.setItem(CLAVE_CATALOGO_CACHE, JSON.stringify(productos));
                }
            }
        } catch {
            // En caso de corte de internet usamos la copia persistida en localStorage
            estadoApp.catalogo = leerCacheCatalogoLocal();
        }
    } else {
        estadoApp.catalogo = leerCacheCatalogoLocal();
    }
    renderizarCatalogoPOS();
    renderizarTablaRecetas();
};

const renderizarCatalogoPOS = () => {
    const contenedor = $('grilla-productos');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    const filtro = estadoApp.filtroCategoriaActual;
    const filtrados = estadoApp.catalogo.filter((prod) => {
        if (filtro === 'todos') return true;
        const n = prod.nombre.toLowerCase();
        if (filtro === 'cafe') return n.includes('café') || n.includes('espresso') || n.includes('latte') || n.includes('cappuccino');
        if (filtro === 'panaderia') return n.includes('chipa') || n.includes('chipá') || n.includes('medialuna') || n.includes('torta');
        if (filtro === 'bebidas') return n.includes('jugo') || n.includes('limonada') || n.includes('agua');
        return true;
    });

    for (const prod of filtrados) {
        const card = document.createElement('div');
        card.className = 'producto-card-comercial';
        card.dataset.id = prod.id;

        const icono = obtenerIconoProducto(prod.nombre);
        const precioFormateado = formatearMoneda(prod.precio_venta);

        card.innerHTML = `
            <div>
                <div class="producto-icono-grande">${icono}</div>
                <h4 class="producto-titulo">${prod.nombre}</h4>
                <span class="producto-codigo-badge">${prod.codigo_barras || 'SIN CÓDIGO'}</span>
            </div>
            <div class="producto-precio-fila">
                <span class="producto-precio-grande">${precioFormateado}</span>
                <div class="producto-btn-agregar">+</div>
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
                <td colspan="5" class="text-center text-muted py-8">
                    El ticket está vacío.<br />Escanee un código de barras o seleccione productos.
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
                <strong>${item.nombre}</strong>
            </td>
            <td class="col-centro">
                <div class="item-control-cant">
                    <button type="button" class="btn-cant-tactil btn-restar" data-idx="${idx}">-</button>
                    <span class="item-cant-numero">${item.cantidad}</span>
                    <button type="button" class="btn-cant-tactil btn-sumar" data-idx="${idx}">+</button>
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
        $('estado-caja').textContent = `Venta guardada en cola offline (${resultadoCola.totalEnCola} pendiente/s).`;
    }
    mostrarToast('Sin conexión: venta registrada en Cola de Sincronización Offline.', 'advertencia');
};

const cobrarTicketVenta = async () => {
    const resumen = calcularResumenCarrito(estadoApp.carrito);
    if (resumen.itemsPayload.length === 0) {
        mostrarToast('El ticket de venta está vacío.', 'advertencia');
        return;
    }

    const turnoId = estadoApp.turnoActivo?.id || 1;
    const metodoRadio = document.querySelector('input[name="medio_pago_radio"]:checked');
    const metodoPago = metodoRadio ? metodoRadio.value : 'EFECTIVO';

    const payload = {
        turno_caja: turnoId,
        medio_pago: metodoPago,
        metodo_pago: metodoPago,
        origen: 'propio',
        items_entrada: resumen.itemsPayload.map((it) => ({
            producto_id: Number(it.producto || it.producto_id),
            producto: Number(it.producto || it.producto_id),
            cantidad: String(it.cantidad),
        })),
    };

    if (navigator.onLine === false || estadoApp.modoConexion === 'offline') {
        registrarCobroEnColaOffline(payload, resumen, metodoPago);
        return;
    }

    try {
        const res = await fetch(`${estadoApp.djangoUrl}/api/ventas/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${estadoApp.tokenJwt}`,
            },
            body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (res.ok) {
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
};

const mostrarModalTicketTermico = (datosVenta, resumenCarrito, metodoPago) => {
    const modal = $('modal-ticket-termico');
    if (!modal) return;

    const idFormateado = datosVenta.offline
        ? String(datosVenta.id)
        : `#${String(datosVenta.id).padStart(4, '0')}`;

    if ($('ticket-termico-id')) $('ticket-termico-id').textContent = idFormateado;
    if ($('ticket-termico-fecha')) $('ticket-termico-fecha').textContent = new Date().toLocaleString('es-AR');
    if ($('ticket-termico-cajero')) $('ticket-termico-cajero').textContent = estadoApp.usuario?.username || 'cajero_demo';
    if ($('ticket-termico-turno')) $('ticket-termico-turno').textContent = `#${datosVenta.turno_caja || 1}`;

    const leyendaEl = $('ticket-termico-leyenda');
    if (leyendaEl) {
        leyendaEl.textContent = datosVenta.offline
            ? 'Comprobante Emitido en Modo Offline - Pendiente de Sincronización'
            : 'Comprobante comercial no fiscal emitido por Sapori Stock';
    }

    const itemsBody = $('ticket-termico-items-body');
    if (itemsBody) {
        itemsBody.innerHTML = '';
        for (const item of estadoApp.carrito) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="col-texto">${item.cantidad}x ${item.nombre}</td>
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
        const res = await fetch(`${estadoApp.djangoUrl}/api/caja/turnos/`, {
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
        $('caja-turno-fondo-inicial').textContent = formatearMoneda(turno.efectivo_inicial);
    }

    if ($('caja-turno-cajero-texto')) {
        $('caja-turno-cajero-texto').textContent = `Responsable: ${turno.usuario_nombre || estadoApp.usuario?.username || 'cajero_demo'}`;
    }

    if ($('caja-turno-apertura-hora') && turno.apertura) {
        $('caja-turno-apertura-hora').textContent = `Apertura: ${new Date(turno.apertura).toLocaleString('es-AR')}`;
    }

    if ($('caja-turno-ventas-efectivo')) {
        $('caja-turno-ventas-efectivo').textContent = formatearMoneda(turno.ventas_efectivo_total || 0);
    }

    if ($('caja-turno-cant-tickets')) {
        const cant = Number(turno.cantidad_tickets || 0);
        $('caja-turno-cant-tickets').textContent = `${cant} ticket${cant !== 1 ? 's' : ''} emitido${cant !== 1 ? 's' : ''}`;
    }

    if ($('input-turno-id')) {
        $('input-turno-id').value = String(turno.id);
    }

    renderizarMovimientosCaja(turno.movimientos || []);
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
            <td class="col-centro"><span class="${esIngreso ? 'badge-diferencia-sobrante' : 'badge-diferencia-faltante'}">${m.tipo}</span></td>
            <td class="col-numero"><strong>${esIngreso ? '+' : '-'} ${formatearMoneda(m.monto)}</strong></td>
            <td class="col-texto">${m.motivo || '-'}</td>
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
            <td class="col-texto">${t.usuario_nombre || 'cajero_demo'}</td>
            <td class="col-centro">${t.apertura ? new Date(t.apertura).toLocaleDateString('es-AR') : '-'}</td>
            <td class="col-centro">${t.cierre ? new Date(t.cierre).toLocaleTimeString('es-AR') : '<span class="badge-estado-verde">Abierto</span>'}</td>
            <td class="col-numero">${formatearMoneda(t.efectivo_inicial)}</td>
            <td class="col-numero">${t.efectivo_esperado !== null ? formatearMoneda(t.efectivo_esperado) : `<span class="candado-confidencial">${SVG_ICONOS.candado} Confidencial</span>`}</td>
            <td class="col-numero">${t.efectivo_contado !== null ? formatearMoneda(t.efectivo_contado) : '-'}</td>
            <td class="col-numero">${diferenciaBadge}</td>
            <td class="col-centro"><span class="badge-rol ${t.estado === 'ABIERTO' ? 'cajero' : 'duenio'}">${t.estado}</span></td>
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
        const res = await fetch(`${estadoApp.djangoUrl}/api/caja/turnos/${turnoId}/cerrar/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${estadoApp.tokenJwt}`,
            },
            body: JSON.stringify({ efectivo_contado: efectivoContado }),
        });

        const data = await res.json();

        if (res.ok) {
            mostrarToast('Turno cerrado exitosamente con arqueo ciego.', 'exito');
            if ($('input-efectivo-contado')) $('input-efectivo-contado').value = '';
            cargarTurnoActivo();
        } else {
            mostrarToast(data.mensaje || 'Error al cerrar el turno.', 'peligro');
        }
    } catch (err) {
        mostrarToast(`Error de conexión al cerrar caja: ${err.message}`, 'peligro');
    }
};

// ============================================================
// MÓDULO 3: COMPRAS, IMPORTACIÓN CSV E IMPORTADOR IA
// ============================================================
export const cargarInsumos = async () => {
    try {
        const res = await fetch(`${estadoApp.djangoUrl}/api/insumos/`, {
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
        const res = await fetch(`${estadoApp.djangoUrl}/api/proveedores/`, {
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
            <td class="col-texto"><strong>${ins.nombre}</strong></td>
            <td class="col-centro"><span class="producto-codigo-badge">${ins.unidad_base}</span></td>
            <td class="col-numero"><strong>${formatearMoneda(ins.costo_unitario)}</strong> / ${ins.unidad_base}</td>
            <td class="col-centro"><span class="badge-estado-verde">Activo</span></td>
        `;
        tbody.appendChild(tr);
    }
};

const poblarSelectoresInsumos = () => {
    const sel = $('select-compra-insumo');
    if (!sel) return;
    sel.innerHTML = '';
    for (const ins of estadoApp.insumos) {
        const opt = document.createElement('option');
        opt.value = ins.id;
        opt.textContent = `${ins.nombre} (Unidad base: ${ins.unidad_base})`;
        sel.appendChild(opt);
    }
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

const procesarArchivoCsvSeleccionado = (archivo) => {
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = (evento) => {
        const texto = String(evento.target?.result || '');
        const resultado = parsearCsvProveedor(texto);
        if (resultado.items.length === 0) {
            mostrarToast('El archivo no contiene filas válidas de insumos y precios.', 'advertencia');
            return;
        }
        estadoApp.csvParseadoActual = resultado;
        renderizarPreviewCsv(resultado);
        if ($('textarea-lista-ia')) {
            $('textarea-lista-ia').value = resultado.textoParaIa;
        }
        mostrarToast(`Archivo procesado: ${resultado.items.length} ítems listos para previsualización.`, 'exito');
    };
    lector.readAsText(archivo, 'utf-8');
};

const renderizarPreviewCsv = (resultadoCsv) => {
    const panel = $('panel-preview-csv');
    const tbody = $('tabla-preview-csv-body');
    const resumen = $('resumen-preview-csv');
    if (!panel || !tbody || !resumen) return;

    panel.style.display = 'block';
    resumen.textContent = `${resultadoCsv.items.length} filas detectadas · Envío total acumulado: ${formatearMoneda(resultadoCsv.envioTotal)} · Delimitador: "${resultadoCsv.delimitadorDetectado}"`;
    tbody.innerHTML = '';

    for (const item of resultadoCsv.items) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="col-texto"><strong>${item.nombre_insumo}</strong></td>
            <td class="col-centro">${item.cantidad}</td>
            <td class="col-centro"><span class="producto-codigo-badge">${item.unidad}</span></td>
            <td class="col-numero font-bold">${formatearMoneda(item.precio_total)}</td>
            <td class="col-numero">${item.alicuota}%</td>
            <td class="col-numero">${formatearMoneda(item.envio)}</td>
        `;
        tbody.appendChild(tr);
    }
};

const enviarCsvAlCircuitoAprobacion = async () => {
    const csv = estadoApp.csvParseadoActual;
    if (!csv || csv.items.length === 0) {
        mostrarToast('Primero cargue un archivo CSV válido.', 'advertencia');
        return;
    }

    const proveedorNombre = $('input-proveedor-ia')?.value.trim() || 'Proveedor Planilla CSV';
    if ($('textarea-lista-ia')) {
        $('textarea-lista-ia').value = csv.textoParaIa;
    }
    if ($('estado-importacion-ia')) {
        $('estado-importacion-ia').textContent = 'Analizando planilla CSV con IA...';
    }

    try {
        const res = await fetch(`${estadoApp.nodeUrl}/api/importaciones`, {
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
        const data = await res.json();
        if (res.status === 202 && data.importacionId) {
            mostrarToast('Planilla enviada al circuito de aprobación. Cargando propuesta...', 'exito');
            await consultarDetalleImportacion(data.importacionId);
            if ($('estado-importacion-ia')) {
                $('estado-importacion-ia').textContent = 'Propuesta lista para revisión en el Paso 2.';
            }
        } else {
            renderizarPropuestaIAComercial({
                _id: 'local-csv',
                estado: 'LISTA',
                salida: {
                    proveedorDetectado: proveedorNombre,
                    envioDetectado: csv.envioTotal,
                    items: csv.items,
                },
            });
            mostrarToast('Propuesta generada desde CSV lista para aprobar en el Paso 2.', 'info');
        }
    } catch {
        renderizarPropuestaIAComercial({
            _id: 'local-csv',
            estado: 'LISTA',
            salida: {
                proveedorDetectado: proveedorNombre,
                envioDetectado: csv.envioTotal,
                items: csv.items,
            },
        });
        mostrarToast('Propuesta generada en modo local lista para aprobar en el Paso 2.', 'info');
    }
};

const confirmarCsvDirectoEnInventario = async () => {
    const csv = estadoApp.csvParseadoActual;
    if (!csv || csv.items.length === 0) {
        mostrarToast('Primero cargue un archivo CSV válido.', 'advertencia');
        return;
    }

    const proveedorNombre = $('input-proveedor-ia')?.value.trim() || 'Proveedor Planilla CSV';

    try {
        const res = await fetch(`${estadoApp.djangoUrl}/api/compras/confirmar-importacion/`, {
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

        const data = await res.json();
        if (res.ok) {
            mostrarToast(
                `Importación confirmada: ${data.compras_creadas?.length || csv.items.length} compras registradas y costos recalculados en cascada.`,
                'exito'
            );
            if ($('panel-preview-csv')) $('panel-preview-csv').style.display = 'none';
            await cargarInsumos();
            await cargarCatalogo();
        } else {
            mostrarToast(data.mensaje || 'No se pudo confirmar el lote de compras.', 'peligro');
        }
    } catch (err) {
        mostrarToast(`Error de red al confirmar importación: ${err.message}`, 'peligro');
    }
};

const consultarDetalleImportacion = async (importacionId, intento = 1) => {
    try {
        const res = await fetch(`${estadoApp.nodeUrl}/api/importaciones/${importacionId}`, {
            headers: { 'Authorization': `Bearer ${estadoApp.tokenJwt}` },
        });
        const datos = await res.json();
        if (res.ok) {
            if (
                (datos.estado === 'PENDIENTE' || datos.estado === 'PROCESANDO') &&
                intento < 12
            ) {
                await new Promise((r) => setTimeout(r, 350));
                return await consultarDetalleImportacion(importacionId, intento + 1);
            }
            renderizarPropuestaIAComercial(datos);
            return datos;
        }
    } catch {
        // Silencioso
    }
    return null;
};

const renderizarPropuestaIAComercial = (doc) => {
    const panel = $('panel-revision-ia');
    const tabla = $('tabla-items-ia-body');
    const banner = $('ia-resumen-banner');
    if (!panel || !tabla || !banner) return;

    panel.style.display = 'block';
    const salida = doc.salida || {};
    let itemsCrudos = Array.isArray(salida.items) && salida.items.length > 0
        ? salida.items
        : (Array.isArray(doc.items) && doc.items.length > 0 ? doc.items : []);

    let envioDetectado = salida.envioDetectado ?? doc.envioDetectado ?? 0;

    if (itemsCrudos.length === 0) {
        const textoFuente = doc.entrada?.textoLista || $('textarea-lista-ia')?.value || '';
        const extraidoLocal = extraerItemsDesdeTextoLista(textoFuente);
        if (extraidoLocal.items.length > 0) {
            itemsCrudos = extraidoLocal.items;
            if (!Number(envioDetectado)) {
                envioDetectado = extraidoLocal.envioDetectado;
            }
        } else if (estadoApp.csvParseadoActual?.items?.length > 0) {
            itemsCrudos = estadoApp.csvParseadoActual.items;
            if (!Number(envioDetectado)) {
                envioDetectado = estadoApp.csvParseadoActual.envioTotal;
            }
        }
    }

    const itemsNormalizados = itemsCrudos.map((it) => {
        const nombre = it.nombreInsumo || it.nombre_insumo || it.insumo_nombre || it.nombre || it.insumo || 'Insumo';
        const cantidad = String(it.cantidad ?? '1');
        const unidad = String(it.unidad || 'un');
        const precio = String(it.precioTotal ?? it.precio_total ?? it.precio ?? '0.00');
        const alicuota = String(it.alicuota ?? it.alicuotaIva ?? '21.00');
        const confianzaNum = Number(it.confianza ?? 0.98);
        return {
            nombreInsumo: nombre,
            nombre_insumo: nombre,
            cantidad,
            unidad,
            precioTotal: precio,
            precio_total: precio,
            ivaIncluido: it.ivaIncluido ?? it.iva_incluido ?? true,
            iva_incluido: it.iva_incluido ?? it.ivaIncluido ?? true,
            alicuota,
            confianza: Number.isFinite(confianzaNum) ? confianzaNum : 0.98,
        };
    });

    const proveedorDetectado =
        salida.proveedorDetectado ||
        doc.entrada?.proveedorNombre ||
        $('input-proveedor-ia')?.value.trim() ||
        'Distribuidora';

    estadoApp.importacionActual = {
        ...doc,
        salida: {
            ...salida,
            proveedorDetectado,
            envioDetectado: String(envioDetectado || '0.00'),
            items: itemsNormalizados,
        },
    };

    banner.innerHTML = `
        <strong>Proveedor Detectado:</strong> ${proveedorDetectado} ·
        <strong>Flete Prorrateado:</strong> ${formatearMoneda(envioDetectado || 0)} ·
        <strong>Estado:</strong> <span class="badge-rol duenio">${doc.estado || 'LISTA'}</span>
    `;

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
            <td class="col-texto"><strong>${it.nombreInsumo}</strong></td>
            <td class="col-centro">${it.cantidad}</td>
            <td class="col-centro"><span class="producto-codigo-badge">${it.unidad}</span></td>
            <td class="col-numero font-bold">${formatearMoneda(it.precioTotal)}</td>
            <td class="col-centro"><span class="badge-estado-verde">${pctConfianza}%</span></td>
        `;
        tbody.appendChild(tr);
    }
};

// ============================================================
// MÓDULO 4: INGENIERÍA DE RECETAS Y RENTABILIDAD
// ============================================================
const renderizarTablaRecetas = () => {
    const tbody = $('tabla-recetas-productos-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const esCajero = estadoApp.usuario?.rol === 'CAJERO';

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

        tr.innerHTML = `
            <td class="col-texto">
                <div style="display: flex; align-items: center; gap: 0.65rem;">
                    <span style="display: inline-flex; color: var(--color-ambar);">${obtenerIconoProducto(p.nombre)}</span>
                    <strong>${p.nombre}</strong>
                </div>
            </td>
            <td class="col-centro"><span class="producto-codigo-badge">${p.codigo_barras || 'S/C'}</span></td>
            <td class="col-numero font-bold">${formatearMoneda(p.precio_venta)}</td>
            <td class="col-numero">${!esCajero && costo !== null ? formatearMoneda(costo) : `<span class="candado-confidencial">${SVG_ICONOS.candado} Confidencial</span>`}</td>
            <td class="col-numero text-exito">${!esCajero && ganancia !== null ? formatearMoneda(ganancia) : `<span class="candado-confidencial">${SVG_ICONOS.candado} Confidencial</span>`}</td>
            <td class="col-texto">${margenBarraHtml}</td>
            <td class="col-centro">
                <button type="button" class="btn-refrescar-mini btn-recalcular-producto" data-id="${p.id}" title="Recalcular Costo" style="display: inline-flex; align-items: center; gap: 0.35rem;">
                    ${SVG_ICONOS.refrescar}
                    <span>Recalcular</span>
                </button>
            </td>
        `;

        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => {
            mostrarDesgloseReceta(p);
        });

        tr.querySelector('.btn-recalcular-producto')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            await recalcularProducto(p.id);
        });

        tbody.appendChild(tr);
    }
};

const mostrarDesgloseReceta = (producto) => {
    const panel = $('panel-desglose-receta');
    const titulo = $('receta-detalle-nombre');
    const tbody = $('tabla-receta-items-body');
    if (!panel || !titulo || !tbody) return;

    panel.style.display = 'block';
    titulo.textContent = `Desglose de Receta: ${producto.nombre}`;
    tbody.innerHTML = '';

    const items = Array.isArray(producto.receta_items) ? producto.receta_items : [];
    if (items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="col-centro text-muted py-4">Este producto utiliza el costo directo de carta sin sub-ítems detallados.</td>
            </tr>
        `;
        return;
    }

    const esCajero = estadoApp.usuario?.rol === 'CAJERO';
    for (const item of items) {
        const cant = Number(item.cantidad || 0);
        const costoUnit = item.insumo_costo_unitario !== null && item.insumo_costo_unitario !== undefined
            ? Number(item.insumo_costo_unitario)
            : null;
        const subtotal = costoUnit !== null ? cant * costoUnit : null;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="col-texto"><strong>${item.insumo_nombre || `Insumo #${item.insumo}`}</strong></td>
            <td class="col-centro">${cant} <span class="producto-codigo-badge">${item.unidad || item.insumo_unidad_base || 'un'}</span></td>
            <td class="col-numero">${!esCajero && costoUnit !== null ? `${formatearMoneda(costoUnit)} / ${item.insumo_unidad_base || item.unidad}` : `<span class="candado-confidencial">${SVG_ICONOS.candado} Confidencial</span>`}</td>
            <td class="col-numero font-bold">${!esCajero && subtotal !== null ? formatearMoneda(subtotal) : `<span class="candado-confidencial">${SVG_ICONOS.candado} Confidencial</span>`}</td>
        `;
        tbody.appendChild(tr);
    }
};

const recalcularProducto = async (productoId) => {
    try {
        const res = await fetch(`${estadoApp.djangoUrl}/api/productos/${productoId}/recalcular/`, {
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
        mostrarToast(`Error: ${err.message}`, 'peligro');
    }
};

const recalcularTodaLaCarta = async () => {
    mostrarToast('Recalculando costos de toda la carta comercial...', 'info');
    try {
        const resBulk = await fetch(`${estadoApp.djangoUrl}/api/productos/recalcular/`, {
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
            const res = await fetch(`${estadoApp.djangoUrl}/api/productos/${prod.id}/recalcular/`, {
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
// MÓDULO 5: FINANZAS Y PUNTO DE EQUILIBRIO
// ============================================================
export const cargarFinanzas = async () => {
    if (estadoApp.usuario?.rol === 'CAJERO') return;

    try {
        const resGanancia = await fetch(`${estadoApp.djangoUrl}/api/ventas/ganancia-diaria/`, {
            headers: { 'Authorization': `Bearer ${estadoApp.tokenJwt}` },
        });
        if (resGanancia.ok) {
            const data = await resGanancia.json();
            if ($('fin-facturacion-bruta')) $('fin-facturacion-bruta').textContent = formatearMoneda(data.ingresos_totales);
            if ($('fin-costo-congelado')) $('fin-costo-congelado').textContent = formatearMoneda(data.costo_total_congelado);
            if ($('fin-ganancia-neta')) $('fin-ganancia-neta').textContent = formatearMoneda(data.ganancia_bruta_diaria);
            if ($('fin-tickets-cant')) $('fin-tickets-cant').textContent = `${data.cantidad_tickets || 0} tickets emitidos`;
            if ($('fin-unidades-totales')) $('fin-unidades-totales').textContent = String(Math.round(Number(data.unidades_vendidas || 0)));

            const margenPct = (Number(data.margen_bruto_promedio || 0) * 100).toFixed(1);
            if ($('fin-margen-promedio')) $('fin-margen-promedio').textContent = `Margen neto promedio: ${margenPct}%`;
        }

        const resRanking = await fetch(`${estadoApp.djangoUrl}/api/ventas/ranking-productos/?limite=10`, {
            headers: { 'Authorization': `Bearer ${estadoApp.tokenJwt}` },
        });
        if (resRanking.ok) {
            const ranking = await resRanking.json();
            renderizarRankingProductos(ranking);
        }

        await calcularPuntoEquilibrio();
    } catch {
        // Fallback
    }
};

const renderizarRankingProductos = (ranking) => {
    const contenedorMas = $('ranking-mas-vendidos-lista');
    const contenedorSin = $('ranking-sin-rotacion-lista');
    if (!contenedorMas || !contenedorSin) return;

    contenedorMas.innerHTML = '';
    contenedorSin.innerHTML = '';

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
                    <span>${item.producto_nombre}</span>
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
        contenedorSin.innerHTML = '<p class="text-muted">Excelente: toda su carta registra rotación en el período.</p>';
    } else {
        for (const item of sinVentas) {
            const div = document.createElement('div');
            div.className = 'item-sin-rotacion';
            div.innerHTML = `
                <span><strong>${item.producto_nombre}</strong></span>
                <span class="badge-diferencia-faltante">0 ventas registradas</span>
            `;
            contenedorSin.appendChild(div);
        }
    }
};

const calcularPuntoEquilibrio = async () => {
    const costosFijos = $('input-pe-costos-fijos')?.value || '1500000';
    const diasOp = $('input-pe-dias-op')?.value || '26';
    const diasSem = $('input-pe-dias-sem')?.value || '6';

    try {
        const res = await fetch(`${estadoApp.djangoUrl}/api/ventas/punto-equilibrio/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                costos_fijos: costosFijos,
                dias_operativos: Number(diasOp),
                dias_semana: Number(diasSem),
            }),
        });

        if (res.ok) {
            const pe = await res.json();
            if ($('pe-monto-mensual')) $('pe-monto-mensual').textContent = formatearMoneda(pe.punto_equilibrio_mensual);
            if ($('pe-monto-diario')) $('pe-monto-diario').textContent = formatearMoneda(pe.meta_diaria);
            if ($('pe-monto-semanal')) $('pe-monto-semanal').textContent = formatearMoneda(pe.meta_semanal);

            const alcance = Math.min(100, Math.max(0, Number(pe.porcentaje_cumplimiento_pe || 0)));
            if ($('pe-barra-progreso')) $('pe-barra-progreso').style.width = `${alcance}%`;
            if ($('pe-porcentaje-texto')) $('pe-porcentaje-texto').textContent = `${alcance.toFixed(1)}% de meta mensual alcanzada`;
        }
    } catch {
        // Fallback
    }
};

// ============================================================
// MÓDULO 6: PERSONAL Y GOBERNANZA DEL DUEÑO
// ============================================================
export const cargarPersonal = async () => {
    try {
        const res = await fetch(`${estadoApp.djangoUrl}/api/usuarios/`, {
            headers: {
                'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                'Content-Type': 'application/json',
            },
        });
        if (res.ok) {
            const data = await res.json();
            estadoApp.usuariosEquipo = Array.isArray(data) ? data : (data.datos || data.results || []);
            renderizarTarjetasPersonal();
        }
    } catch {
        // Fallback
    }
};

const renderizarTarjetasPersonal = () => {
    const contenedor = $('equipo-tarjetas-grilla');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    for (const u of estadoApp.usuariosEquipo) {
        const card = document.createElement('div');
        card.className = 'usuario-tarjeta-comercial';

        const rol = (u.rol || 'CAJERO').toUpperCase();
        let rolEtiqueta = 'Cajero';
        let rolClase = 'cajero';
        if (rol === 'DUENIO') {
            rolEtiqueta = 'Dueño';
            rolClase = 'duenio';
        } else if (rol === 'ENCARGADO') {
            rolEtiqueta = 'Encargado';
            rolClase = 'encargado';
        }

        const nombre = u.first_name ? `${u.first_name} ${u.last_name || ''}` : u.username;

        card.innerHTML = `
            <div class="usuario-tarjeta-cabecera">
                <div class="usuario-avatar-tarjeta">${nombre[0].toUpperCase()}</div>
                <div>
                    <h4 style="font-size: 1.05rem; font-weight: 800;">${nombre}</h4>
                    <span class="text-muted" style="font-size: 0.8rem;">@${u.username}</span>
                </div>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
                <span class="badge-rol ${rolClase}">${rolEtiqueta}</span>
                <span class="${u.is_active ? 'badge-estado-verde' : 'badge-estado-rojo text-peligro'}" style="font-size: 0.82rem;">
                    ${u.is_active ? 'Activo' : 'Inactivo'}
                </span>
            </div>
            <div class="usuario-acciones-fila">
                <button type="button" class="btn-secundario-comercial btn-ver-permisos w-100" data-id="${u.id}">
                    Permisos (30)
                </button>
                <button type="button" class="btn-descartar-comercial btn-toggle-usuario" data-id="${u.id}" data-activo="${u.is_active}" data-rol="${rol}">
                    ${u.is_active ? 'Desactivar' : 'Activar'}
                </button>
            </div>
        `;

        card.querySelector('.btn-ver-permisos')?.addEventListener('click', () => {
            mostrarModalPermisos(u);
        });

        card.querySelector('.btn-toggle-usuario')?.addEventListener('click', async () => {
            await toggleEstadoUsuario(u);
        });

        contenedor.appendChild(card);
    }
};

const toggleEstadoUsuario = async (u) => {
    const accion = u.is_active ? 'desactivar' : 'activar';
    try {
        const res = await fetch(`${estadoApp.djangoUrl}/api/usuarios/${u.id}/${accion}/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ motivo: 'Acción administrativa desde el panel' }),
        });

        const data = await res.json();

        if (res.ok) {
            mostrarToast(`Usuario ${u.username} ${u.is_active ? 'desactivado' : 'activado'}.`, 'exito');
            await cargarPersonal();
        } else {
            let detalleMsg = '';
            if (Array.isArray(data.detalles) && data.detalles.length > 0) {
                detalleMsg = data.detalles[0];
            } else if (data.detalles && typeof data.detalles === 'object') {
                const primeraLista = Object.values(data.detalles)[0];
                if (Array.isArray(primeraLista) && primeraLista.length > 0) {
                    detalleMsg = primeraLista[0];
                }
            }
            const errorMsg = detalleMsg || data.mensaje || data.detail || 'Operación bloqueada';
            mostrarToast(`Regla de Supervivencia del Dueño: ${errorMsg}`, 'peligro');
        }
    } catch (err) {
        mostrarToast(`Error de seguridad: ${err.message}`, 'peligro');
    }
};

const mostrarModalPermisos = (u) => {
    const modal = $('modal-permisos');
    if (!modal) return;

    if ($('permisos-usuario-titulo')) $('permisos-usuario-titulo').textContent = `Permisos de @${u.username}`;
    if ($('permisos-usuario-rol')) $('permisos-usuario-rol').textContent = `Rol asignado: ${u.rol || 'CAJERO'} · 30 permisos auditados`;

    const contenedor = $('permisos-categorias-grilla');
    if (contenedor) {
        const permisosUsuario = Array.isArray(u.permisos) ? u.permisos : [];
        const esDuenio = u.rol === 'DUENIO';

        const categorias = {
            'Ventas y Facturación': ['ventas.cobrar_ticket', 'ventas.anular_ticket', 'ventas.aplicar_descuento', 'ventas.ver_historial_propio', 'ventas.ver_historial_todos'],
            'Caja y Arqueo Ciego': ['caja.abrir_turno', 'caja.cerrar_turno', 'caja.ver_efectivo_esperado', 'caja.registrar_movimiento', 'caja.gestionar_turnos_ajenos'],
            'Inventario de Insumos': ['insumos.ver', 'insumos.crear', 'insumos.editar', 'insumos.eliminar'],
            'Compras y Proveedores': ['compras.ver', 'compras.registrar'],
            'Ingeniería de Recetas': ['recetas.ver', 'recetas.crear', 'recetas.editar', 'recetas.eliminar', 'recetas.ver_costos'],
            'Reportes Ejecutivos': ['reportes.ver_financieros', 'reportes.ver_operativos'],
            'Inteligencia Artificial': ['ia.importar_listas'],
            'Personal y Roles': ['personal.ver', 'personal.crear', 'personal.editar', 'personal.ajustar_permisos', 'personal.desactivar'],
            'Auditoría de Seguridad': ['auditoria.ver_logs'],
        };

        contenedor.innerHTML = '';
        for (const [catNombre, lista] of Object.entries(categorias)) {
            const divCat = document.createElement('div');
            divCat.style.background = '#FAF7F2';
            divCat.style.border = '1px solid var(--color-borde-suave)';
            divCat.style.borderRadius = 'var(--radio-md)';
            divCat.style.padding = '1rem';
            divCat.style.marginBottom = '1rem';

            divCat.innerHTML = `<h4 style="font-size: 0.95rem; font-weight: 800; margin-bottom: 0.65rem;">${catNombre}</h4>`;

            const listaUl = document.createElement('ul');
            listaUl.style.listStyle = 'none';
            listaUl.style.display = 'flex';
            listaUl.style.flexDirection = 'column';
            listaUl.style.gap = '0.35rem';

            for (const perm of lista) {
                const tiene = esDuenio || permisosUsuario.includes(perm);
                const li = document.createElement('li');
                li.style.fontSize = '0.85rem';
                li.style.display = 'flex';
                li.style.alignItems = 'center';
                li.style.gap = '0.5rem';
                li.innerHTML = `<span style="display: inline-flex; color: ${tiene ? 'var(--color-exito)' : 'var(--color-peligro)'};">${tiene ? SVG_ICONOS.check : SVG_ICONOS.cruz}</span><code style="font-family: var(--fuente-mono);">${perm}</code>`;
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
    await cargarTurnoActivo();
    await cargarCatalogo();
    await cargarInsumos();
    await cargarProveedores();
    if (estadoApp.usuario?.rol !== 'CAJERO') {
        await cargarFinanzas();
        await cargarPersonal();
    }
    actualizarIndicadorColaOffline();
};

const cambiarSeccion = (nombreSeccion) => {
    document.querySelectorAll('.vista-modulo').forEach((v) => v.classList.remove('activa'));
    document.querySelectorAll('.sidebar-nav .nav-item').forEach((b) => b.classList.remove('activo'));

    const seccionEl = $(`vista-${nombreSeccion}`);
    const botonEl = document.querySelector(`.sidebar-nav .nav-item[data-seccion="${nombreSeccion}"]`);

    if (seccionEl) seccionEl.classList.add('activa');
    if (botonEl) botonEl.classList.add('activo');

    const titulos = {
        pos: { titulo: 'Punto de Venta', sub: 'Facturación rápida de mostrador y emisión de tickets' },
        caja: { titulo: 'Caja & Arqueo Ciego', sub: 'Control de turnos, arqueo ciego y auditoría de fondos' },
        compras: { titulo: 'Compras & Listas IA', sub: 'Importación CSV y extracción inteligente de listas de distribuidores' },
        recetas: { titulo: 'Ingeniería de Recetas & Rentabilidad', sub: 'Costeo dinámico por insumos, descartables y mano de obra' },
        finanzas: { titulo: 'Finanzas & Metas', sub: 'Facturación real, margen neto y punto de equilibrio' },
        personal: { titulo: 'Equipo & Permisos', sub: 'Gobernanza de personal y control granular de accesos' },
    };

    if (titulos[nombreSeccion]) {
        if ($('titulo-seccion-actual')) $('titulo-seccion-actual').textContent = titulos[nombreSeccion].titulo;
        if ($('subtitulo-seccion-actual')) $('subtitulo-seccion-actual').textContent = titulos[nombreSeccion].sub;
    }

    if (nombreSeccion === 'pos') {
        const input = $('input-codigo-barras');
        if (input) setTimeout(() => input.focus(), 100);
    }
};

// ============================================================
// INICIALIZACIÓN DE EVENTOS DEL DOM
// ============================================================
const inicializarEventosDOM = () => {
    // 1. Selector rápido de demostración comercial (1 Clic)
    document.querySelectorAll('.btn-demo-acceso').forEach((btn) => {
        btn.addEventListener('click', () => {
            const usuario = btn.dataset.usuario;
            const password = btn.dataset.password;
            if ($('input-username')) $('input-username').value = usuario;
            if ($('input-password')) $('input-password').value = password;
            ejecutarLogin(usuario, password);
        });
    });

    // 2. Submit de Formulario de Login
    $('form-login')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = $('input-username')?.value.trim();
        const password = $('input-password')?.value;
        const token = $('input-token-jwt')?.value.trim();
        ejecutarLogin(username, password, token);
    });

    // 3. Logout
    $('btn-cerrar-sesion')?.addEventListener('click', cerrarSesion);

    // 4. Navegación del Sidebar
    document.querySelectorAll('.sidebar-nav .nav-item').forEach((btn) => {
        btn.addEventListener('click', () => {
            const seccion = btn.dataset.seccion;
            cambiarSeccion(seccion);
        });
    });

    // 5. Drawer lateral de monitor
    $('btn-toggle-monitor')?.addEventListener('click', () => {
        $('panel-monitor-lateral')?.classList.toggle('abierto');
    });
    $('btn-cerrar-monitor')?.addEventListener('click', () => {
        $('panel-monitor-lateral')?.classList.remove('abierto');
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
            e.preventDefault();
            const input = $('input-codigo-barras');
            if (input) input.focus();
        } else if (e.key === 'F2') {
            e.preventDefault();
            cobrarTicketVenta();
        } else if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay').forEach((m) => {
                m.style.display = 'none';
            });
            $('panel-monitor-lateral')?.classList.remove('abierto');
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
    document.querySelectorAll('input[name="medio_pago_radio"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            document.querySelectorAll('.metodo-pago-chip').forEach((chip) => chip.classList.remove('activo'));
            radio.closest('.metodo-pago-chip')?.classList.add('activo');
            if ($('select-metodo-pago')) $('select-metodo-pago').value = radio.value;
        });
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
    $('form-arqueo-ciego')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const contado = $('input-efectivo-contado')?.value;
        if (contado !== undefined && contado !== '') {
            cerrarTurnoCaja(contado);
        }
    });

    $('btn-refrescar-turnos')?.addEventListener('click', cargarTurnoActivo);

    // 12. Movimiento de Caja Chica
    $('btn-modal-movimiento')?.addEventListener('click', () => {
        if ($('modal-movimiento-caja')) $('modal-movimiento-caja').style.display = 'flex';
    });
    $('form-movimiento-caja')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const tipo = $('select-movimiento-tipo').value;
        const monto = $('input-movimiento-monto').value;
        const motivo = $('input-movimiento-motivo').value;
        const turnoId = estadoApp.turnoActivo?.id || 1;

        try {
            const res = await fetch(`${estadoApp.djangoUrl}/api/caja/movimientos/`, {
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
            mostrarToast(`Error: ${err.message}`, 'peligro');
        }
    });

    // 13. Apertura de Turno
    $('btn-modal-abrir-turno')?.addEventListener('click', () => {
        if ($('modal-abrir-turno')) $('modal-abrir-turno').style.display = 'flex';
    });
    $('form-abrir-turno')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const efectivoInicial = $('input-apertura-fondo').value;
        try {
            const res = await fetch(`${estadoApp.djangoUrl}/api/caja/turnos/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                },
                body: JSON.stringify({ efectivo_inicial: efectivoInicial }),
            });
            if (res.ok) {
                mostrarToast('Turno de caja abierto correctamente.', 'exito');
                if ($('modal-abrir-turno')) $('modal-abrir-turno').style.display = 'none';
                cargarTurnoActivo();
            } else {
                mostrarToast('Error al abrir turno de caja.', 'peligro');
            }
        } catch (err) {
            mostrarToast(`Error: ${err.message}`, 'peligro');
        }
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
        if (archivo) procesarArchivoCsvSeleccionado(archivo);
    });

    inputArchivoCsv?.addEventListener('change', (e) => {
        const archivo = e.target.files?.[0];
        if (archivo) procesarArchivoCsvSeleccionado(archivo);
    });

    $('btn-csv-circuito-ia')?.addEventListener('click', enviarCsvAlCircuitoAprobacion);
    $('btn-csv-confirmar-directo')?.addEventListener('click', confirmarCsvDirectoEnInventario);

    // 16. Importador IA de Listas
    $('btn-ejemplo-proveedor')?.addEventListener('click', () => {
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
        const textoLista = $('textarea-lista-ia')?.value.trim() || '';
        const estadoPill = $('estado-importacion-ia');

        if (estadoPill) estadoPill.textContent = 'Analizando texto con IA...';

        try {
            const res = await fetch(`${estadoApp.nodeUrl}/api/importaciones`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                },
                body: JSON.stringify({
                    proveedorNombre,
                    textoLista,
                    versionPrompt: 'v1',
                }),
            });
            const data = await res.json();
            if (res.status === 202 && data.importacionId) {
                mostrarToast('Lista recibida. Procesando extracción de insumos...', 'info');
                await consultarDetalleImportacion(data.importacionId);
                if (estadoPill) estadoPill.textContent = 'Propuesta procesada y lista en el Paso 2.';
            } else {
                const extraidoLocal = extraerItemsDesdeTextoLista(textoLista);
                renderizarPropuestaIAComercial({
                    _id: 'local-ia',
                    estado: 'LISTA',
                    salida: {
                        proveedorDetectado: proveedorNombre,
                        envioDetectado: extraidoLocal.envioDetectado,
                        items: extraidoLocal.items,
                    },
                });
                mostrarToast('Propuesta extraída lista para revisión.', 'info');
            }
        } catch {
            const extraidoLocal = extraerItemsDesdeTextoLista(textoLista);
            renderizarPropuestaIAComercial({
                _id: 'local-ia',
                estado: 'LISTA',
                salida: {
                    proveedorDetectado: proveedorNombre,
                    envioDetectado: extraidoLocal.envioDetectado,
                    items: extraidoLocal.items,
                },
            });
            mostrarToast('Propuesta extraída en modo local lista para revisión.', 'info');
        }
    });

    $('btn-aprobar-ia')?.addEventListener('click', async () => {
        const doc = estadoApp.importacionActual;
        if (!doc) return;
        const id = doc._id;
        const salida = doc.salida || {};
        const itemsParaAprobar = Array.isArray(salida.items) ? salida.items : [];
        const proveedorNombre = salida.proveedorDetectado || $('input-proveedor-ia')?.value.trim() || 'Proveedor Importado IA';
        const envio = salida.envioDetectado || '0.00';

        try {
            if (id && !String(id).startsWith('local-')) {
                const res = await fetch(`${estadoApp.nodeUrl}/api/importaciones/${id}/aprobar`, {
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
            }

            // Fallback directo al endpoint transaccional de Django
            const resDjango = await fetch(`${estadoApp.djangoUrl}/api/compras/confirmar-importacion/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${estadoApp.tokenJwt}`,
                },
                body: JSON.stringify({
                    proveedor_nombre: proveedorNombre,
                    envio,
                    items: itemsParaAprobar.map((it) => ({
                        nombre_insumo: it.nombreInsumo || it.nombre_insumo,
                        cantidad: it.cantidad,
                        unidad: it.unidad,
                        precio_total: it.precioTotal || it.precio_total,
                        iva_incluido: true,
                        alicuota: it.alicuota || '21.00',
                    })),
                }),
            });
            const dataDjango = await resDjango.json();
            if (resDjango.ok) {
                const cantCompras = dataDjango.compras_creadas?.length || itemsParaAprobar.length;
                const cantRecetas = dataDjango.productos_recalculados?.length || 0;
                mostrarToast(
                    `Propuesta aprobada: ${cantCompras} insumos/compras actualizados y ${cantRecetas} recetas recalculadas.`,
                    'exito'
                );
                if ($('panel-revision-ia')) $('panel-revision-ia').style.display = 'none';
                await cargarInsumos();
                await cargarCatalogo();
            } else {
                mostrarToast(dataDjango.mensaje || 'Error al aprobar la propuesta.', 'peligro');
            }
        } catch (err) {
            mostrarToast(`Error: ${err.message}`, 'peligro');
        }
    });

    $('btn-cerrar-desglose')?.addEventListener('click', () => {
        if ($('panel-desglose-receta')) $('panel-desglose-receta').style.display = 'none';
    });

    $('btn-rechazar-ia')?.addEventListener('click', async () => {
        const id = estadoApp.importacionActual?._id;
        if (!id) return;
        try {
            const res = await fetch(`${estadoApp.nodeUrl}/api/importaciones/${id}/rechazar`, {
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
            mostrarToast(`Error: ${err.message}`, 'peligro');
        }
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

        try {
            const res = await fetch(`${estadoApp.djangoUrl}/api/compras/`, {
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
            mostrarToast(`Error: ${err.message}`, 'peligro');
        }
    });

    // 18. Recalcular toda la carta
    $('btn-recalcular-toda-carta')?.addEventListener('click', recalcularTodaLaCarta);

    // 19. Simulador de Punto de Equilibrio
    $('form-punto-equilibrio')?.addEventListener('submit', (e) => {
        e.preventDefault();
        calcularPuntoEquilibrio();
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
        mostrarToast(`Modo de conexión actualizado a: ${modo.toUpperCase()}.`, 'exito');
    });

    // 21. Sincronización de ventas offline y reconexión automática
    $('btn-sincronizar-offline')?.addEventListener('click', sincronizarVentasPendientes);

    window.addEventListener('online', () => {
        actualizarIndicadorColaOffline();
        mostrarToast('Conexión a internet restablecida. Sincronizando ventas pendientes...', 'info');
        sincronizarVentasPendientes();
    });

    window.addEventListener('offline', () => {
        actualizarIndicadorColaOffline();
        actualizarEstadoSocketUI(false, '(Sin Internet)');
        mostrarToast('Se detectó corte de internet. Modo Sin Internet Activo habilitado automáticamente.', 'advertencia');
    });

    // 22. Cierre de todos los modales con botón data-cerrar
    document.querySelectorAll('[data-cerrar]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const idModal = btn.dataset.cerrar;
            const modal = $(idModal);
            if (modal) modal.style.display = 'none';
        });
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
    registrarServiceWorkerPwa();
    actualizarUIUsuario();
    inicializarEventosDOM();

    if (estadoApp.tokenJwt) {
        conectarSocketTiempoReal();
        cargarDatosIniciales();
    }
});
