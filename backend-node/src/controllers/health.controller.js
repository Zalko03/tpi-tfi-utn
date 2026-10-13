export const obtenerEstado = (req, res) => {
    // No toca Mongo: indica solo que el proceso está vivo.
    res.status(200).json({ estado: 'ok', servicio: 'backend-node' });
};
