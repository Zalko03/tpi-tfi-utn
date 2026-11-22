# Socket.IO (cliente) — Build vendored para navegador

- **Versión exacta:** `4.8.4` (la misma que `socket.io` en `backend-node/package.json`; cliente y servidor tienen que coincidir)
- **Archivo:** `socket.io.min.js`
- **Origen:** `backend-node/node_modules/socket.io/client-dist/socket.io.min.js` (paquete oficial `socket.io`, repositorio `socketio/socket.io`)
- **Fecha de copia:** `2026-11-21`
- **SHA-256:** `d5d79a35039e860b32bdef4795528b05c2f788d4b2d9dacc913120e2878f7b3f`

## Por qué está acá

Antes la web cargaba `/socket.io/socket.io.js`, que lo sirve Node. En Vercel la web es estática y no
tiene Node detrás, así que ese archivo no existía, `window.io` quedaba indefinido y el tablero en vivo
(HU8) no conectaba. Con el archivo en `vendor/` la web lo carga desde su propio origen
(`script-src 'self'`) y abre el WebSocket contra la URL de Node configurada (`connect-src` con `wss://`).

## Cómo actualizarlo

Si se actualiza `socket.io` en `backend-node`, volver a copiar el archivo y el hash:

```bash
cp backend-node/node_modules/socket.io/client-dist/socket.io.min.js web/vendor/socket.io/
sha256sum web/vendor/socket.io/socket.io.min.js
```

El test `backend-node/tests/unit/vendorSocketIo.unit.test.js` falla si las versiones no coinciden.
