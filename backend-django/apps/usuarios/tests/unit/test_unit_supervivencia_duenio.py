"""
Tests unitarios aislados para la regla de supervivencia del último Dueño activo
y servicios de administración de personal (docs/seguridad.md §3 y §4).
Valida casos de éxito, casos borde y excepciones de dominio de forma aislada.
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.exceptions import PermissionDenied

from apps.usuarios.constantes import (
    ROL_CAJERO,
    ROL_DUENIO,
    ROL_ENCARGADO,
)
from apps.usuarios.exceptions import ErrorSupervivenciaDuenio
from apps.usuarios.models import RegistroAuditoria
from apps.usuarios.services import (
    activar_personal,
    actualizar_personal,
    contar_duenios_activos,
    crear_personal,
    desactivar_personal,
)

User = get_user_model()


@pytest.mark.django_db
class TestUnitSupervivenciaDuenio:
    """Pruebas unitarias de la regla de supervivencia del último Dueño activo."""

    @pytest.fixture
    def duenio_unico(self):
        return crear_personal(
            datos_usuario={
                "username": "duenio_solitario",
                "password": "claveSegura123!",
                "email": "solitario@cafe.local",
            },
            rol=ROL_DUENIO,
        )

    def test_contar_duenios_activos(self, duenio_unico):
        """El contador identifica correctamente la cantidad de dueños activos."""
        assert contar_duenios_activos() == 1
        assert contar_duenios_activos(excluir_usuario_id=duenio_unico.id) == 0

    def test_desactivar_unico_duenio_lanza_excepcion_dominio(self, duenio_unico):
        """Intentar desactivar al único Dueño activo debe lanzar ErrorSupervivenciaDuenio."""
        with pytest.raises(ErrorSupervivenciaDuenio) as exc_info:
            desactivar_personal(duenio_unico.id, motivo="Intento de baja del dueño")

        assert "único Dueño activo" in str(exc_info.value)
        duenio_unico.refresh_from_db()
        assert duenio_unico.is_active is True

    def test_degradar_unico_duenio_a_cajero_lanza_excepcion_dominio(self, duenio_unico):
        """Intentar cambiar el rol del único Dueño a Cajero debe ser rechazado."""
        with pytest.raises(ErrorSupervivenciaDuenio) as exc_info:
            actualizar_personal(duenio_unico.id, rol=ROL_CAJERO)

        assert "único Dueño activo" in str(exc_info.value)
        duenio_unico.refresh_from_db()
        assert duenio_unico.perfil.rol == ROL_DUENIO

    def test_degradar_unico_duenio_a_encargado_lanza_excepcion_dominio(
        self, duenio_unico
    ):
        """Intentar cambiar el rol del único Dueño a Encargado debe ser rechazado."""
        with pytest.raises(ErrorSupervivenciaDuenio) as exc_info:
            actualizar_personal(duenio_unico.id, rol=ROL_ENCARGADO)

        assert "único Dueño activo" in str(exc_info.value)
        duenio_unico.refresh_from_db()
        assert duenio_unico.perfil.rol == ROL_DUENIO

    def test_quitar_permiso_critico_personal_ajustar_permisos_a_unico_duenio_lanza_excepcion(
        self, duenio_unico
    ):
        """Revocar permisos administrativos críticos al único Dueño deja el sistema huérfano."""
        with pytest.raises(ErrorSupervivenciaDuenio) as exc_info:
            actualizar_personal(
                duenio_unico.id,
                permisos={"personal.ajustar_permisos": False},
            )

        assert "único Dueño activo" in str(exc_info.value)
        assert "personal.ajustar_permisos" in str(exc_info.value)

    def test_quitar_permiso_critico_personal_crear_a_unico_duenio_lanza_excepcion(
        self, duenio_unico
    ):
        """Revocar personal.crear al único Dueño debe ser rechazado por regla de supervivencia."""
        with pytest.raises(ErrorSupervivenciaDuenio) as exc_info:
            actualizar_personal(
                duenio_unico.id,
                permisos={"personal.crear": False},
            )

        assert "permisos administrativos críticos" in str(exc_info.value)

    def test_quitar_permiso_critico_personal_desactivar_a_unico_duenio_lanza_excepcion(
        self, duenio_unico
    ):
        """Revocar personal.desactivar al único Dueño debe ser rechazado."""
        with pytest.raises(ErrorSupervivenciaDuenio) as exc_info:
            actualizar_personal(
                duenio_unico.id,
                permisos={"personal.desactivar": False},
            )

        assert "permisos administrativos críticos" in str(exc_info.value)

    def test_quitar_permiso_no_critico_a_unico_duenio_tiene_exito(self, duenio_unico):
        """Apagar un permiso operativo no crítico (ej. ia.importar_listas) al único Dueño está permitido."""
        usuario_act = actualizar_personal(
            duenio_unico.id,
            permisos={"ia.importar_listas": False},
        )
        assert usuario_act.perfil.tiene_permiso("ia.importar_listas") is False
        assert usuario_act.perfil.tiene_permiso("personal.crear") is True

    def test_supervivencia_permite_desactivar_cuando_existe_otro_duenio_activo(
        self, duenio_unico
    ):
        """Si existen dos Dueños activos, se puede desactivar a uno, pero no al último restante."""
        duenio2 = crear_personal(
            datos_usuario={"username": "segundo_duenio", "password": "password123"},
            rol=ROL_DUENIO,
        )
        assert contar_duenios_activos() == 2

        # Desactivamos al primer dueño: debe permitirse
        desactivado = desactivar_personal(duenio_unico.id, motivo="Retiro de sociedad")
        assert desactivado.is_active is False
        assert contar_duenios_activos() == 1

        # Intentar desactivar al segundo dueño ahora debe fallar
        with pytest.raises(ErrorSupervivenciaDuenio):
            desactivar_personal(duenio2.id, motivo="Baja del último")

        duenio2.refresh_from_db()
        assert duenio2.is_active is True

    def test_supervivencia_permite_cambiar_rol_cuando_hay_otro_duenio_activo(
        self, duenio_unico
    ):
        """Si existe otro Dueño activo, se permite cambiar el rol de un Dueño."""
        crear_personal(
            datos_usuario={"username": "duenio_permanente", "password": "password123"},
            rol=ROL_DUENIO,
        )
        assert contar_duenios_activos() == 2

        # Cambiamos el rol del primer dueño a Encargado
        usuario_actualizado = actualizar_personal(duenio_unico.id, rol=ROL_ENCARGADO)
        assert usuario_actualizado.perfil.rol == ROL_ENCARGADO
        assert contar_duenios_activos() == 1

    def test_duenio_inactivo_no_cuenta_como_duenio_activo(self, duenio_unico):
        """Un Dueño inactivo previo no habilita a desactivar al único Dueño activo restante."""
        duenio_inactivo = crear_personal(
            datos_usuario={"username": "duenio_inactivo", "password": "password123"},
            rol=ROL_DUENIO,
        )
        # Desactivamos a duenio_inactivo aprovechando que duenio_unico está activo
        desactivar_personal(duenio_inactivo.id)
        duenio_inactivo.refresh_from_db()
        assert duenio_inactivo.is_active is False
        assert contar_duenios_activos() == 1

        # Intentar desactivar al dueño restante debe fallar aunque exista otro registro con rol DUENIO
        with pytest.raises(ErrorSupervivenciaDuenio):
            desactivar_personal(duenio_unico.id)

    def test_desactivacion_logica_sin_borrado_fisico_registra_auditoria(
        self, duenio_unico
    ):
        """Desactivar un empleado cajero marca is_active = False, no borra la fila y crea auditoría."""
        cajero = crear_personal(
            datos_usuario={"username": "cajero_a_baja", "password": "password123"},
            rol=ROL_CAJERO,
        )

        cajero_desactivado = desactivar_personal(
            cajero.id, motivo="Fin de contrato", desactivado_por=duenio_unico
        )
        assert cajero_desactivado.is_active is False
        assert User.objects.filter(id=cajero.id).exists() is True

        auditoria = RegistroAuditoria.objects.filter(
            usuario_modificado=cajero, accion="DESACTIVACION"
        ).first()
        assert auditoria is not None
        assert auditoria.modificado_por == duenio_unico
        assert auditoria.detalles["motivo"] == "Fin de contrato"

    def test_reactivacion_de_personal(self, duenio_unico):
        """Un empleado desactivado puede ser reactivado correctamente registrando auditoría."""
        cajero = crear_personal(
            datos_usuario={"username": "cajero_reinc", "password": "password123"},
            rol=ROL_CAJERO,
        )
        desactivar_personal(cajero.id, desactivado_por=duenio_unico)
        assert User.objects.get(id=cajero.id).is_active is False

        cajero_activo = activar_personal(cajero.id, activado_por=duenio_unico)
        assert cajero_activo.is_active is True
        assert User.objects.get(id=cajero.id).is_active is True

    def test_jerarquia_operador_sin_permiso_no_puede_otorgar_a_terceros(
        self, duenio_unico
    ):
        """Un operador no puede otorgar permisos que él mismo no posee."""
        encargado = crear_personal(
            datos_usuario={"username": "encargado_jefe", "password": "password123"},
            rol=ROL_ENCARGADO,
            creado_por=duenio_unico,
        )

        # El encargado intenta crear un cajero con personal.crear (que el encargado no posee)
        with pytest.raises(PermissionDenied) as exc_info:
            crear_personal(
                datos_usuario={"username": "cajero_ilegal", "password": "password123"},
                rol=ROL_CAJERO,
                permisos={"personal.crear": True},
                creado_por=encargado,
            )

        assert "No puede otorgar el permiso" in str(exc_info.value)
