import {
    agregarProductoAlCarrito,
    buscarProductoPorCodigoOTexto,
    calcularResumenCarrito,
    formatearEventoTiempoReal,
} from './logicaPwa.js';

const CATALOGO_LOCAL_RESPALDO = [
    { id: 1, nombre: 'Espresso Doble', codigo_barras: '7790001000011', precio_venta: '2200.00' },
    { id: 2, nombre: 'Flat White Especial', codigo_barras: '7790001000028', precio_venta: '3200.00' },
    { id: 3, nombre: 'Cappuccino Italiano', codigo_barras: '7790001000035', precio_venta: '3100.00' },
    { id: 4, nombre: 'Medialuna de Manteca', codigo_barras: '7790001000042', precio_venta: '1400.00' },
];

const estadoApp = {
    djangoUrl: 'http://localhost:8000',
    nodeUrl: window.location.origin.includes('3000')
        ? window.location.origin
        : 'http://localhost:3000',
    tokenJwt: sessionStorage.getItem('cafe_jwt') || '',
    usuarioId: Number(sessionStorage.getItem('cafe_uid') || 1),
    socket: null,
    catalogo: [...CATALOGO_LOCAL_RESPALDO],
    carrito: [],
    importacionActual: null,
    contadores: {
        ventas: 0,
        alertasMargen: 0,
        alertasStock: 0,
    },
};

const $ = (id) => document.getElementById(id);

const registrarEventoEnFeed = (nombreEvento, payload) => {
    const itemFormateado = formatearEventoTiempoReal(nombreEvento, payload);
    const lista = $('lista-eventos-vivo');
    if (!lista) return;

    const li = document.createElement('li');
    li.className = `evento-item ${itemFormateado.nivel}`;

    const cabecera = document.createElement('div');
    cabecera.className = 'evento-titulo';
    const spanTitulo = document.createElement('span');
    spanTitulo.textContent = itemFormateado.titulo;
    const spanHora = document.createElement('small');
    spanHora.textContent = new Date(itemFormateado.emitidoEn).toLocaleTimeString('es-AR');
    cabecera.appendChild(spanTitulo);
    cabecera.appendChild(spanHora);

    const detalle = document.createElement('div');
    detalle.className = 'evento-detalle';
    detalle.textContent = itemFormateado.detalle;

    li.appendChild(cabecera);
    li.appendChild(detalle);
    lista.prepend(li);

    if (nombreEvento === 'venta.registrada') {
        estadoApp.contadores.ventas += 1;
    } else if (nombreEvento === 'costo.actualizado' && itemFormateado.alertaMargenBajo) {
        estadoApp.contadores.alertasMargen += 1;
    } else if (nombreEvento === 'stock.bajo') {
        estadoApp.contadores.alertasStock += 1;
    }

    actualizarMetricasTablero();
};

const actualizarMetricasTablero = () => {
    if ($('metrica-ventas')) $('metrica-ventas').textContent = String(estadoApp.contadores.ventas);
    if ($('metrica-alertas-margen')) {
        $('metrica-alertas-margen').textContent = String(estadoApp.contadores.alertasMargen);
    }
    if ($('metrica-alertas-stock')) {
        $('metrica-alertas-stock').textContent = String(estadoApp.contadores.alertasStock);
    }
};

const actualizarEstadoSocketUI = (conectado, textoDetalle = '') => {
    const insignia = $('insignia-socket');
    if (!insignia) return;
    insignia.className = `insignia ${conectado ? 'conectado' : 'desconectado'}`;
    insignia.textContent = conectado
        ? `Tiempo Real: Conectado ${textoDetalle}`
        : `Tiempo Real: Desconectado ${textoDetalle}`;
};

const conectarSocketTiempoReal = () => {
    if (!window.io) {
        actualizarEstadoSocketUI(false, '(cliente Socket.IO no cargado)');
        return;
    }

    if (estadoApp.socket) {
        estadoApp.socket.disconnect();
    }

    if (!estadoApp.tokenJwt) {
        actualizarEstadoSocketUI(false, '(sin JWT)');
        return;
    }

    const socket = window.io(estadoApp.nodeUrl, {
        auth: { token: estadoApp.tokenJwt },
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 300,
        reconnectionDelayMax: 3000,
        transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
        actualizarEstadoSocketUI(true, `(sala local)`);
    });

    socket.on('disconnect', () => {
        actualizarEstadoSocketUI(false, '(reconectando...)');
    });

    socket.on('connect_error', (err) => {
        const msg = err?.data?.mensaje || err?.message || 'Error de handshake';
        actualizarEstadoSocketUI(false, `(${msg})`);
    });

    socket.on('presencia.actualizada', (estadoPresencia) => {
        const spanPresencia = $('insignia-presencia');
        if (spanPresencia) {
            spanPresencia.textContent = `Presencia activa: ${estadoPresencia.totalUsuarios ?? 0} usuarios (${estadoPresencia.totalConexiones ?? 0} conex.)`;
        }
    });

    socket.on('venta.registrada', (payload) => {
        registrarEventoEnFeed('venta.registrada', payload);
    });

    socket.on('costo.actualizado', (payload) => {
        registrarEventoEnFeed('costo.actualizado', payload);
    });

    socket.on('stock.bajo', (payload) => {
        registrarEventoEnFeed('stock.bajo', payload);
    });

    socket.on('importacion.lista', async (payload) => {
        registrarEventoEnFeed('importacion.lista', payload);
        if (payload?.importacionId) {
            await consultarDetalleImportacion(payload.importacionId);
        }
    });

    socket.on('error:autorizacion', (payload) => {
        registrarEventoEnFeed('error:autorizacion', payload);
    });

    estadoApp.socket = socket;
};

const renderizarCatalogoRapido = () => {
    const contenedor = $('grilla-productos');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    for (const prod of estadoApp.catalogo) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-producto-rapido';
        btn.innerHTML = `<strong>${prod.nombre}</strong><span>$${prod.precio_venta} · <small>${prod.codigo_barras || 'S/C'}</small></span>`;
        btn.addEventListener('click', () => {
            estadoApp.carrito = agregarProductoAlCarrito(estadoApp.carrito, prod, 1);
            renderizarCarrito();
        });
        contenedor.appendChild(btn);
    }
};

const renderizarCarrito = () => {
    const cuerpo = $('tabla-carrito-body');
    const totalEl = $('caja-total-monto');
    if (!cuerpo || !totalEl) return;

    cuerpo.innerHTML = '';
    for (const item of estadoApp.carrito) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.nombre}</td>
            <td>${item.cantidad}</td>
            <td>$${item.precioUnitarioDecimal}</td>
            <td><strong>$${item.subtotalDecimal}</strong></td>
        `;
        cuerpo.appendChild(tr);
    }

    const resumen = calcularResumenCarrito(estadoApp.carrito);
    totalEl.textContent = `$${resumen.totalDecimal}`;
};

const renderizarPropuestaIA = (doc) => {
    estadoApp.importacionActual = doc;
    const panel = $('panel-revision-ia');
    const estadoTexto = $('estado-importacion-ia');
    const tablaBody = $('tabla-items-ia-body');
    if (!panel || !estadoTexto || !tablaBody) return;

    panel.style.display = 'flex';
    const salida = doc.salida || {};
    estadoTexto.textContent = `ID: ${doc._id} · Estado: ${doc.estado} · Proveedor: ${salida.proveedorDetectado || 'N/D'} · Envío: $${salida.envioDetectado || '0.00'}`;

    tablaBody.innerHTML = '';
    const items = Array.isArray(salida.items) ? salida.items : [];
    for (const item of items) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.nombreInsumo}</td>
            <td>${item.cantidad} ${item.unidad}</td>
            <td>$${item.precioTotal}</td>
            <td>${Math.round(Number(item.confianza || 1) * 100)}%</td>
        `;
        tablaBody.appendChild(tr);
    }
};

const consultarDetalleImportacion = async (importacionId) => {
    try {
        const res = await fetch(`${estadoApp.nodeUrl}/api/importaciones/${importacionId}`, {
            headers: { Authorization: `Bearer ${estadoApp.tokenJwt}` },
        });
        const datos = await res.json();
        if (res.ok) {
            renderizarPropuestaIA(datos);
        } else {
            $('estado-importacion-ia').textContent = datos.mensaje || 'Error al consultar importación';
        }
    } catch (error) {
        $('estado-importacion-ia').textContent = `Error de red al consultar importación: ${error.message}`;
    }
};

const inicializarEventosUI = () => {
    // 1. Login contra Django o carga manual de token JWT
    $('form-login')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const username = $('input-username').value.trim();
        const password = $('input-password').value;
        const tokenManual = $('input-token-jwt').value.trim();

        if (tokenManual) {
            estadoApp.tokenJwt = tokenManual;
            sessionStorage.setItem('cafe_jwt', tokenManual);
            $('mensaje-auth').textContent = 'Token JWT aplicado en sesión.';
            conectarSocketTiempoReal();
            return;
        }

        try {
            const res = await fetch(`${estadoApp.djangoUrl}/api/auth/token/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const data = await res.json();
            if (!res.ok) {
                $('mensaje-auth').textContent = data.mensaje || 'Credenciales inválidas';
                return;
            }
            estadoApp.tokenJwt = data.access;
            sessionStorage.setItem('cafe_jwt', data.access);
            $('input-token-jwt').value = data.access;
            $('mensaje-auth').textContent = `Sesión iniciada como ${username}.`;
            conectarSocketTiempoReal();
        } catch (err) {
            $('mensaje-auth').textContent = `No se pudo conectar a Django (${err.message})`;
        }
    });

    // 2. Unión a sala turno:{id}
    $('btn-unirse-turno')?.addEventListener('click', () => {
        const turnoId = $('input-turno-id').value.trim();
        const titularId = Number($('input-titular-id').value || estadoApp.usuarioId);
        if (!estadoApp.socket || !estadoApp.socket.connected) {
            $('estado-caja').textContent = 'Conecte primero el socket con un token JWT válido.';
            return;
        }
        estadoApp.socket.emit('turno:unirse', { turnoId, titularId }, (respuesta) => {
            if (respuesta?.ok) {
                $('estado-caja').textContent = `Unido a la sala ${respuesta.sala}`;
            } else {
                $('estado-caja').textContent = `Rechazado: ${respuesta?.mensaje || 'Sin permiso'}`;
            }
        });
    });

    // 3. Lector de código de barras (HID Enter)
    $('input-codigo-barras')?.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            const valor = ev.target.value;
            const encontrado = buscarProductoPorCodigoOTexto(estadoApp.catalogo, valor);
            if (encontrado) {
                estadoApp.carrito = agregarProductoAlCarrito(estadoApp.carrito, encontrado, 1);
                renderizarCarrito();
                $('estado-caja').textContent = `Agregado por lector: ${encontrado.nombre}`;
                ev.target.value = '';
            } else {
                $('estado-caja').textContent = `Código o producto no encontrado: ${valor}`;
            }
        }
    });

    $('btn-limpiar-carrito')?.addEventListener('click', () => {
        estadoApp.carrito = [];
        renderizarCarrito();
    });

    // 4. Cobrar ticket en Caja (POST /api/ventas/ en Django)
    $('btn-cobrar-ticket')?.addEventListener('click', async () => {
        const resumen = calcularResumenCarrito(estadoApp.carrito);
        if (resumen.itemsPayload.length === 0) {
            $('estado-caja').textContent = 'El carrito está vacío.';
            return;
        }

        const turnoId = Number($('input-turno-id').value || 1);
        const metodoPago = $('select-metodo-pago').value;

        try {
            const res = await fetch(`${estadoApp.djangoUrl}/api/ventas/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${estadoApp.tokenJwt}`,
                },
                body: JSON.stringify({
                    turno_caja: turnoId,
                    metodo_pago: metodoPago,
                    origen: 'LOCAL',
                    items_entrada: resumen.itemsPayload,
                }),
            });
            const datos = await res.json();
            if (res.ok) {
                $('estado-caja').textContent = `Ticket #${datos.id} cobrado ($${resumen.totalDecimal}).`;
                estadoApp.carrito = [];
                renderizarCarrito();
            } else {
                $('estado-caja').textContent = datos.mensaje || 'Error al registrar venta';
            }
        } catch (error) {
            $('estado-caja').textContent = `Error de conexión con Django: ${error.message}`;
        }
    });

    // 5. Enviar lista de proveedor a Importación IA (POST /api/importaciones -> 202)
    $('form-importacion-ia')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const proveedorNombre = $('input-proveedor-ia').value.trim();
        const textoLista = $('textarea-lista-ia').value.trim();

        try {
            const res = await fetch(`${estadoApp.nodeUrl}/api/importaciones`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${estadoApp.tokenJwt}`,
                },
                body: JSON.stringify({
                    proveedorNombre,
                    textoLista,
                    versionPrompt: 'v1',
                }),
            });
            const datos = await res.json();
            if (res.status === 202) {
                $('estado-importacion-ia').textContent = `Solicitud 202 aceptada (ID: ${datos.importacionId}). Procesando con IA...`;
                setTimeout(() => consultarDetalleImportacion(datos.importacionId), 600);
            } else {
                $('estado-importacion-ia').textContent = datos.mensaje || 'No se pudo iniciar la importación';
            }
        } catch (error) {
            $('estado-importacion-ia').textContent = `Error al contactar Node: ${error.message}`;
        }
    });

    // 6. Aprobar propuesta humana (POST /api/importaciones/:id/aprobar)
    $('btn-aprobar-ia')?.addEventListener('click', async () => {
        const id = estadoApp.importacionActual?._id;
        if (!id) return;

        try {
            const res = await fetch(`${estadoApp.nodeUrl}/api/importaciones/${id}/aprobar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${estadoApp.tokenJwt}`,
                },
                body: JSON.stringify({}),
            });
            const datos = await res.json();
            if (res.ok) {
                $('estado-importacion-ia').textContent = `Importación APROBADA: ${datos.comprasCreadas?.length ?? 0} compras y ${datos.productosRecalculados?.length ?? 0} recetas recalculadas.`;
            } else {
                $('estado-importacion-ia').textContent = datos.mensaje || 'Error al aprobar importación';
            }
        } catch (error) {
            $('estado-importacion-ia').textContent = `Error al aprobar: ${error.message}`;
        }
    });

    // 7. Rechazar propuesta humana (POST /api/importaciones/:id/rechazar)
    $('btn-rechazar-ia')?.addEventListener('click', async () => {
        const id = estadoApp.importacionActual?._id;
        if (!id) return;

        try {
            const res = await fetch(`${estadoApp.nodeUrl}/api/importaciones/${id}/rechazar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${estadoApp.tokenJwt}`,
                },
                body: JSON.stringify({ motivo: 'Rechazada durante la revisión humana en tablero' }),
            });
            const datos = await res.json();
            if (res.ok) {
                $('estado-importacion-ia').textContent =
                    'Importación RECHAZADA. No se crearon compras ni se alteraron costos (CA7.3).';
            } else {
                $('estado-importacion-ia').textContent = datos.mensaje || 'Error al rechazar importación';
            }
        } catch (error) {
            $('estado-importacion-ia').textContent = `Error al rechazar: ${error.message}`;
        }
    });
};

const registrarServiceWorkerPwa = () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/app/sw.js').catch(() => {
            // En desarrollo local sin HTTPS o fuera de /app/ no bloquea la app
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    registrarServiceWorkerPwa();
    renderizarCatalogoRapido();
    renderizarCarrito();
    inicializarEventosUI();
    if (estadoApp.tokenJwt) {
        $('input-token-jwt').value = estadoApp.tokenJwt;
        conectarSocketTiempoReal();
    }
});
