import { renderizarUbicacionCarta } from './logicaPwa.js';

const $ = (id) => document.getElementById(id);

const estadoCarta = {
    productos: [],
    filtro: '',
    cargando: false,
};

const formatearPrecioArs = (valor) => {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) {
        return '$ 0,00';
    }
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(numero);
};

const formatearHoraConsulta = (fecha = new Date()) =>
    fecha.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
    });

const resolverEndpointsCandidatos = () => {
    const configGlobal = window.__SAPORI_CONFIG__ || {};
    const { protocol, hostname, port, origin } = window.location;
    const esLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    let djangoGuardado = '';
    try {
        djangoGuardado = localStorage.getItem('sapori_django_url') || '';
    } catch {
        djangoGuardado = '';
    }

    if (djangoGuardado) {
        return [`${djangoGuardado.replace(/\/+$/, '')}/api/carta-publica/`];
    }
    if (configGlobal.DJANGO_API_URL) {
        return [`${String(configGlobal.DJANGO_API_URL).replace(/\/+$/, '')}/api/carta-publica/`];
    }
    if (port === '3000') {
        return [`${protocol}//${hostname}:8000/api/carta-publica/`];
    }
    if (port === '8000') {
        return [`${origin}/api/carta-publica/`];
    }
    if (!esLocalhost) {
        return [
            `${origin}/api/carta-publica/`,
            'https://sapori-backend-django.onrender.com/api/carta-publica/',
        ];
    }
    if (port === '' || port === '80' || port === '443') {
        return [`${origin}/api/carta-publica/`];
    }
    return [`${protocol}//${hostname}:8000/api/carta-publica/`];
};

const mostrarEstado = ({ cargando = false, error = '', vacioTitulo = '', vacioDetalle = '' }) => {
    const elCargando = $('carta-estado-cargando');
    const elError = $('carta-estado-error');
    const elVacio = $('carta-estado-vacio');
    const elLista = $('carta-lista-productos');

    if (elCargando) elCargando.hidden = !cargando;
    if (elError) {
        elError.hidden = !error;
        if (error && $('carta-error-mensaje')) {
            $('carta-error-mensaje').textContent = error;
        }
    }
    if (elVacio) {
        elVacio.hidden = !vacioTitulo;
        if (vacioTitulo && $('carta-vacio-titulo')) {
            $('carta-vacio-titulo').textContent = vacioTitulo;
        }
        if ($('carta-vacio-detalle')) {
            $('carta-vacio-detalle').textContent = vacioDetalle || '';
        }
    }
    if (elLista) {
        elLista.hidden = cargando || Boolean(error) || Boolean(vacioTitulo);
    }
};

const renderizarProductos = () => {
    const listaEl = $('carta-lista-productos');
    const cantidadEl = $('carta-cantidad');
    if (!listaEl) return;

    const consulta = estadoCarta.filtro.trim().toLowerCase();
    const filtrados = consulta
        ? estadoCarta.productos.filter((prod) =>
              String(prod.nombre || '')
                  .toLowerCase()
                  .includes(consulta)
          )
        : estadoCarta.productos;

    if (cantidadEl) {
        const total = filtrados.length;
        cantidadEl.textContent =
            total === 1 ? '1 producto disponible' : `${total} productos disponibles`;
    }

    listaEl.innerHTML = '';

    if (estadoCarta.productos.length === 0) {
        mostrarEstado({
            vacioTitulo: 'Todavía no hay productos publicados en la carta.',
            vacioDetalle: 'Consultá en el mostrador o volvé a actualizar en unos minutos.',
        });
        return;
    }

    if (filtrados.length === 0) {
        mostrarEstado({
            vacioTitulo: `No encontramos "${estadoCarta.filtro.trim()}".`,
            vacioDetalle: 'Probá con otro nombre o borrá la búsqueda para ver toda la carta.',
        });
        return;
    }

    mostrarEstado({});

    for (const prod of filtrados) {
        const li = document.createElement('li');
        li.className = 'carta-publica-item';

        const nombreSpan = document.createElement('span');
        nombreSpan.className = 'carta-publica-item-nombre';
        nombreSpan.textContent = String(prod.nombre || 'Producto');

        const precioSpan = document.createElement('span');
        precioSpan.className = 'carta-publica-item-precio';
        precioSpan.textContent = formatearPrecioArs(prod.precio_venta);

        li.appendChild(nombreSpan);
        li.appendChild(precioSpan);
        listaEl.appendChild(li);
    }
};

const cargarCartaPublica = async () => {
    if (estadoCarta.cargando) return;
    estadoCarta.cargando = true;

    const btnActualizar = $('btn-actualizar-carta');
    if (btnActualizar) btnActualizar.disabled = true;
    if ($('carta-cantidad')) $('carta-cantidad').textContent = 'Actualizando…';

    mostrarEstado({ cargando: true });

    try {
        const candidatos = resolverEndpointsCandidatos();
        let respuesta = null;

        for (let i = 0; i < candidatos.length; i++) {
            const url = candidatos[i];
            const res = await fetch(url, {
                method: 'GET',
                headers: { Accept: 'application/json' },
            });
            if (res.status === 404 && i < candidatos.length - 1) {
                continue;
            }
            respuesta = res;
            break;
        }

        if (!respuesta) {
            throw new Error('Sin respuesta del servidor');
        }

        if (respuesta.status === 429) {
            mostrarEstado({
                error: 'Hiciste muchas consultas seguidas. Esperá un momento y volvé a probar.',
            });
            if ($('carta-cantidad')) $('carta-cantidad').textContent = 'Consultá de nuevo en breve';
            return;
        }

        if (!respuesta.ok) {
            mostrarEstado({
                error: 'No pudimos cargar la carta ahora. Volvé a intentar en unos segundos.',
            });
            if ($('carta-cantidad')) $('carta-cantidad').textContent = 'Sin conexión con la carta';
            return;
        }

        const data = await respuesta.json();
        const productos = Array.isArray(data)
            ? data
            : Array.isArray(data?.datos)
              ? data.datos
              : [];

        estadoCarta.productos = productos.map((p) => ({
            id: p?.id,
            nombre: String(p?.nombre || ''),
            precio_venta: p?.precio_venta,
        }));

        if ($('carta-ultima-consulta')) {
            $('carta-ultima-consulta').textContent = `Actualizado ${formatearHoraConsulta()}`;
        }

        renderizarProductos();
    } catch {
        mostrarEstado({
            error: 'No pudimos conectarnos para traer la carta. Revisá tu internet.',
        });
        if ($('carta-cantidad')) $('carta-cantidad').textContent = 'Sin conexión';
    } finally {
        estadoCarta.cargando = false;
        if (btnActualizar) btnActualizar.disabled = false;
    }
};

const inicializarMapaUbicacion = () => {
    renderizarUbicacionCarta(
        {
            seccion: $('carta-donde-estamos'),
            direccionEl: $('carta-ubicacion-direccion'),
            iframe: $('carta-ubicacion-iframe'),
            enlace: $('carta-ubicacion-link'),
        },
        typeof window !== 'undefined' ? window.__SAPORI_CONFIG__ : null
    );
};

document.addEventListener('DOMContentLoaded', () => {
    $('carta-buscador')?.addEventListener('input', (evento) => {
        estadoCarta.filtro = evento.target.value || '';
        if (!estadoCarta.cargando && $('carta-estado-error')?.hidden) {
            renderizarProductos();
        }
    });

    $('btn-actualizar-carta')?.addEventListener('click', cargarCartaPublica);
    $('btn-reintentar-carta')?.addEventListener('click', cargarCartaPublica);

    inicializarMapaUbicacion();
    cargarCartaPublica();
});
