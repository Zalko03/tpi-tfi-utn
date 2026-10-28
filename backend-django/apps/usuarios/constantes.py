"""
Constantes, catálogo de permisos granulares y plantillas de roles
según la especificación de docs/seguridad.md (§1 y §2).
"""

ROL_DUENIO = "DUENIO"
ROL_ENCARGADO = "ENCARGADO"
ROL_CAJERO = "CAJERO"

ROLES_CHOICES = (
    (ROL_DUENIO, "Dueño"),
    (ROL_ENCARGADO, "Encargado"),
    (ROL_CAJERO, "Cajero"),
)

PERMISOS_CATALOGO = [
    # Ventas
    "ventas.cobrar_ticket",
    "ventas.anular_ticket",
    "ventas.aplicar_descuento",
    "ventas.ver_historial_propio",
    "ventas.ver_historial_todos",
    # Caja
    "caja.abrir_turno",
    "caja.cerrar_turno",
    "caja.ver_efectivo_esperado",
    "caja.registrar_movimiento",
    "caja.gestionar_turnos_ajenos",
    # Insumos
    "insumos.ver",
    "insumos.crear",
    "insumos.editar",
    "insumos.eliminar",
    # Compras
    "compras.ver",
    "compras.registrar",
    # Recetas
    "recetas.ver",
    "recetas.crear",
    "recetas.editar",
    "recetas.eliminar",
    "recetas.ver_costos",
    # Reportes
    "reportes.ver_financieros",
    "reportes.ver_operativos",
    # IA
    "ia.importar_listas",
    # Personal
    "personal.ver",
    "personal.crear",
    "personal.editar",
    "personal.ajustar_permisos",
    "personal.desactivar",
    # Auditoría
    "auditoria.ver_logs",
]

# Permisos críticos de administración del sistema protegidos por la regla de supervivencia
PERMISOS_CRITICOS_ADMINISTRACION = {
    "personal.crear",
    "personal.ajustar_permisos",
    "personal.desactivar",
    "personal.editar",
    "personal.ver",
}

# Plantillas de permisos predeterminados por rol (docs/seguridad.md §2)
ROLES_PLANTILLAS = {
    ROL_DUENIO: {perm: True for perm in PERMISOS_CATALOGO},
    ROL_ENCARGADO: {
        # Ventas
        "ventas.cobrar_ticket": True,
        "ventas.anular_ticket": True,
        "ventas.aplicar_descuento": True,
        "ventas.ver_historial_propio": True,
        "ventas.ver_historial_todos": True,
        # Caja
        "caja.abrir_turno": True,
        "caja.cerrar_turno": True,
        "caja.ver_efectivo_esperado": True,
        "caja.registrar_movimiento": True,
        "caja.gestionar_turnos_ajenos": True,
        # Insumos
        "insumos.ver": True,
        "insumos.crear": True,
        "insumos.editar": True,
        "insumos.eliminar": False,
        # Compras
        "compras.ver": True,
        "compras.registrar": True,
        # Recetas
        "recetas.ver": True,
        "recetas.crear": True,
        "recetas.editar": True,
        "recetas.eliminar": False,
        "recetas.ver_costos": True,
        # Reportes
        "reportes.ver_financieros": False,
        "reportes.ver_operativos": True,
        # IA
        "ia.importar_listas": False,
        # Personal
        "personal.ver": False,
        "personal.crear": False,
        "personal.editar": False,
        "personal.ajustar_permisos": False,
        "personal.desactivar": False,
        # Auditoría
        "auditoria.ver_logs": False,
    },
    ROL_CAJERO: {
        # Ventas
        "ventas.cobrar_ticket": True,
        "ventas.anular_ticket": False,
        "ventas.aplicar_descuento": False,
        "ventas.ver_historial_propio": True,
        "ventas.ver_historial_todos": False,
        # Caja
        "caja.abrir_turno": True,
        "caja.cerrar_turno": True,
        "caja.ver_efectivo_esperado": False,  # Arqueo ciego
        "caja.registrar_movimiento": False,
        "caja.gestionar_turnos_ajenos": False,
        # Insumos
        "insumos.ver": False,
        "insumos.crear": False,
        "insumos.editar": False,
        "insumos.eliminar": False,
        # Compras
        "compras.ver": False,
        "compras.registrar": False,
        # Recetas
        "recetas.ver": False,
        "recetas.crear": False,
        "recetas.editar": False,
        "recetas.eliminar": False,
        "recetas.ver_costos": False,
        # Reportes
        "reportes.ver_financieros": False,
        "reportes.ver_operativos": False,
        # IA
        "ia.importar_listas": False,
        # Personal
        "personal.ver": False,
        "personal.crear": False,
        "personal.editar": False,
        "personal.ajustar_permisos": False,
        "personal.desactivar": False,
        # Auditoría
        "auditoria.ver_logs": False,
    },
}
