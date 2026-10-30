import { Server } from 'socket.io';
import { obtenerOrigenesPermitidos } from '../config/env.js';
import {
    registrarInstanciaSocket,
    SALA_ALERTAS_STOCK,
    SALA_LOCAL,
    SALA_VER_COSTOS,
} from './emitter.js';
import { autenticarSocketJwt } from './middleware/auth.socket.middleware.js';

const conexionesActivas = new Map();

/**
 * Construye el resumen de presencia activa (usuarios únicos conectados y total de sockets).
 */
export const obtenerEstadoPresencia = () => {
    const mapaUsuarios = new Map();

    for (const sesion of conexionesActivas.values()) {
        const clave = sesion.usuarioId ?? sesion.socketId;
        if (!mapaUsuarios.has(clave)) {
            mapaUsuarios.set(clave, {
                usuarioId: sesion.usuarioId,
                username: sesion.username,
                rol: sesion.rol,
                conexiones: 1,
                conectadoDesde: sesion.conectadoEn,
            });
        } else {
            mapaUsuarios.get(clave).conexiones += 1;
        }
    }

    const usuarios = Array.from(mapaUsuarios.values());
    return {
        totalUsuarios: usuarios.length,
        totalConexiones: conexionesActivas.size,
        usuarios,
    };
};

/**
 * Evalúa si un usuario autenticado puede unirse a la sala 'turno:{id}' (docs/seguridad.md §5.2):
 * Solo se permite si el usuario es el titular del turno, si tiene rol DUENIO,
 * o si posee el permiso granular 'caja.gestionar_turnos_ajenos'.
 */
export const validarAccesoSalaTurno = (usuario, { turnoId, titularId = null } = {}) => {
    const idLimpio = turnoId !== undefined && turnoId !== null ? String(turnoId).trim() : '';
    if (!idLimpio) {
        return {
            permitido: false,
            codigo: 400,
            mensaje: 'El identificador de turno (turnoId) es obligatorio',
            detalles: null,
        };
    }

    if (!usuario || !usuario.id) {
        return {
            permitido: false,
            codigo: 401,
            mensaje: 'Usuario no autenticado',
            detalles: null,
        };
    }

    const esDuenio = usuario.rol === 'DUENIO';
    const puedeGestionarAjenos =
        Array.isArray(usuario.permisos) &&
        usuario.permisos.includes('caja.gestionar_turnos_ajenos');
    const esTitular =
        titularId !== undefined &&
        titularId !== null &&
        Number(titularId) === Number(usuario.id);

    if (esDuenio || puedeGestionarAjenos || esTitular) {
        return {
            permitido: true,
            codigo: 200,
            sala: `turno:${idLimpio}`,
        };
    }

    return {
        permitido: false,
        codigo: 403,
        mensaje: 'No tiene permisos para unirse a un turno de caja ajeno',
        detalles: "Se requiere ser titular del turno o poseer 'caja.gestionar_turnos_ajenos'",
    };
};

/**
 * Retorna las opciones recomendadas de conexión y reconexión automática para clientes Socket.IO (T3.5).
 */
export const obtenerOpcionesClienteReconexion = (tokenJwt, extra = {}) => ({
    auth: { token: tokenJwt },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 300,
    reconnectionDelayMax: 3000,
    timeout: 5000,
    transports: ['websocket', 'polling'],
    ...extra,
});

/**
 * Inicializa el servidor Socket.IO sobre un servidor HTTP de Node,
 * configurando CORS restrictivo, handshake JWT RS256, salas y control de presencia.
 */
export const inicializarSocketIO = (servidorHttp) => {
    const origenesPermitidos = obtenerOrigenesPermitidos();

    const io = new Server(servidorHttp, {
        cors: {
            origin: origenesPermitidos,
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });

    io.use(autenticarSocketJwt);

    io.on('connection', (socket) => {
        const usuario = socket.usuario;

        // 1. Unión automática a la sala 'local' (cualquier empleado activo autenticado)
        socket.join(SALA_LOCAL);

        // 2. Unión a salas internas de autorización para filtrado de eventos (docs/seguridad.md §5.2)
        const tieneVerCostos =
            usuario.rol === 'DUENIO' ||
            (Array.isArray(usuario.permisos) && usuario.permisos.includes('recetas.ver_costos'));
        if (tieneVerCostos) {
            socket.join(SALA_VER_COSTOS);
        }

        if (usuario.rol === 'DUENIO' || usuario.rol === 'ENCARGADO') {
            socket.join(SALA_ALERTAS_STOCK);
        }

        // 3. Registro de presencia en vivo
        conexionesActivas.set(socket.id, {
            socketId: socket.id,
            usuarioId: usuario.id,
            username: usuario.username,
            rol: usuario.rol,
            conectadoEn: new Date().toISOString(),
        });

        io.to(SALA_LOCAL).emit('presencia.actualizada', obtenerEstadoPresencia());

        // Evento explícito opcional para confirmar unión a 'local'
        socket.on('sala:unirse_local', (callback) => {
            socket.join(SALA_LOCAL);
            if (typeof callback === 'function') {
                callback({ ok: true, sala: SALA_LOCAL });
            }
        });

        // Unión protegida a la sala 'turno:{id}'
        socket.on('turno:unirse', (datos = {}, callback) => {
            const resultado = validarAccesoSalaTurno(usuario, datos);
            if (!resultado.permitido) {
                const payloadError = {
                    ok: false,
                    mensaje: resultado.mensaje,
                    detalles: resultado.detalles,
                };
                socket.emit('error:autorizacion', {
                    mensaje: resultado.mensaje,
                    detalles: resultado.detalles,
                });
                if (typeof callback === 'function') {
                    callback(payloadError);
                }
                return;
            }

            socket.join(resultado.sala);
            if (typeof callback === 'function') {
                callback({ ok: true, sala: resultado.sala });
            }
        });

        socket.on('turno:salir', (datos = {}, callback) => {
            const idLimpio = datos?.turnoId ? String(datos.turnoId).trim() : '';
            if (idLimpio) {
                socket.leave(`turno:${idLimpio}`);
            }
            if (typeof callback === 'function') {
                callback({ ok: true, sala: `turno:${idLimpio}` });
            }
        });

        socket.on('presencia:consultar', (callback) => {
            if (typeof callback === 'function') {
                callback(obtenerEstadoPresencia());
            }
        });

        socket.on('disconnect', () => {
            conexionesActivas.delete(socket.id);
            io.to(SALA_LOCAL).emit('presencia.actualizada', obtenerEstadoPresencia());
        });
    });

    registrarInstanciaSocket(io);
    return io;
};
