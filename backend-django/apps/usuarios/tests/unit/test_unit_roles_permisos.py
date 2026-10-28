"""
Tests unitarios aislados para la lógica de roles como plantillas y permisos granulares.
Valida el modelo PerfilUsuario y la resolución de overrides (docs/seguridad.md §1 y §2).
"""

import pytest
from django.contrib.auth import get_user_model

from apps.usuarios.constantes import (
    PERMISOS_CATALOGO,
    ROL_CAJERO,
    ROL_DUENIO,
    ROL_ENCARGADO,
)
from apps.usuarios.models import PerfilUsuario

User = get_user_model()


@pytest.mark.django_db
class TestUnitRolesYPermisos:
    """Suite de pruebas unitarias para plantillas de roles y permisos booleanos."""

    @pytest.fixture
    def user_duenio(self):
        user = User.objects.create_user(
            username="unit_duenio", password="password123", email="duenio@cafe.local"
        )
        PerfilUsuario.objects.create(usuario=user, rol=ROL_DUENIO)
        return user

    @pytest.fixture
    def user_encargado(self):
        user = User.objects.create_user(
            username="unit_encargado",
            password="password123",
            email="encargado@cafe.local",
        )
        PerfilUsuario.objects.create(usuario=user, rol=ROL_ENCARGADO)
        return user

    @pytest.fixture
    def user_cajero(self):
        user = User.objects.create_user(
            username="unit_cajero", password="password123", email="cajero@cafe.local"
        )
        PerfilUsuario.objects.create(usuario=user, rol=ROL_CAJERO)
        return user

    def test_catalogo_completo_contiene_30_permisos(self):
        """Verifica que el catálogo de permisos contenga exactamente las 30 claves especificadas."""
        assert len(PERMISOS_CATALOGO) == 30
        assert len(set(PERMISOS_CATALOGO)) == 30  # Sin duplicados

    def test_plantilla_duenio_posee_todos_los_permisos(self, user_duenio):
        """El rol Dueño tiene todos los permisos del catálogo en True de forma predeterminada."""
        perfil = user_duenio.perfil
        activos = perfil.obtener_permisos_activos()
        completos = perfil.obtener_permisos_completos()

        assert len(activos) == 30
        assert len(completos) == 30
        for perm in PERMISOS_CATALOGO:
            assert perfil.tiene_permiso(perm) is True
            assert completos[perm] is True

    def test_plantilla_encargado_permisos_operativos_sin_administracion(
        self, user_encargado
    ):
        """
        El Encargado cuenta con facultades operativas (costos, insumos, compras, ventas)
        pero no posee permisos sobre personal, reportes financieros ni borrado de insumos.
        """
        perfil = user_encargado.perfil
        # Permisos operativos habilitados
        assert perfil.tiene_permiso("recetas.ver_costos") is True
        assert perfil.tiene_permiso("insumos.ver") is True
        assert perfil.tiene_permiso("insumos.crear") is True
        assert perfil.tiene_permiso("insumos.editar") is True
        assert perfil.tiene_permiso("compras.registrar") is True
        assert perfil.tiene_permiso("ventas.anular_ticket") is True
        assert perfil.tiene_permiso("caja.gestionar_turnos_ajenos") is True
        assert perfil.tiene_permiso("reportes.ver_operativos") is True

        # Permisos restringidos
        assert perfil.tiene_permiso("personal.crear") is False
        assert perfil.tiene_permiso("personal.ajustar_permisos") is False
        assert perfil.tiene_permiso("personal.desactivar") is False
        assert perfil.tiene_permiso("reportes.ver_financieros") is False
        assert perfil.tiene_permiso("ia.importar_listas") is False
        assert perfil.tiene_permiso("insumos.eliminar") is False
        assert perfil.tiene_permiso("recetas.eliminar") is False
        assert perfil.tiene_permiso("auditoria.ver_logs") is False

    def test_plantilla_cajero_arqueo_ciego_y_operacion_minima(self, user_cajero):
        """
        El Cajero opera con permisos estrictamente transaccionales de venta y caja,
        con arqueo ciego obligatorio (caja.ver_efectivo_esperado = False).
        """
        perfil = user_cajero.perfil
        assert perfil.tiene_permiso("ventas.cobrar_ticket") is True
        assert perfil.tiene_permiso("ventas.ver_historial_propio") is True
        assert perfil.tiene_permiso("caja.abrir_turno") is True
        assert perfil.tiene_permiso("caja.cerrar_turno") is True

        # Arqueo ciego y restricciones de catálogo
        assert perfil.tiene_permiso("caja.ver_efectivo_esperado") is False
        assert perfil.tiene_permiso("caja.registrar_movimiento") is False
        assert perfil.tiene_permiso("caja.gestionar_turnos_ajenos") is False
        assert perfil.tiene_permiso("recetas.ver_costos") is False
        assert perfil.tiene_permiso("insumos.ver") is False
        assert perfil.tiene_permiso("compras.ver") is False
        assert perfil.tiene_permiso("reportes.ver_operativos") is False

    def test_sobreescritura_individual_encender_permiso(self, user_cajero):
        """Un Dueño puede encender un permiso que la plantilla traía apagado."""
        perfil = user_cajero.perfil
        assert perfil.tiene_permiso("caja.registrar_movimiento") is False
        assert "caja.registrar_movimiento" not in perfil.obtener_permisos_activos()

        # Encendemos individualmente el permiso
        perfil.permisos = {"caja.registrar_movimiento": True}
        perfil.save()

        assert perfil.tiene_permiso("caja.registrar_movimiento") is True
        assert "caja.registrar_movimiento" in perfil.obtener_permisos_activos()

    def test_sobreescritura_individual_apagar_permiso(self, user_encargado):
        """Un Dueño puede revocar un permiso que la plantilla traía encendido."""
        perfil = user_encargado.perfil
        assert perfil.tiene_permiso("ventas.anular_ticket") is True

        # Apagamos individualmente el permiso
        perfil.permisos = {"ventas.anular_ticket": False}
        perfil.save()

        assert perfil.tiene_permiso("ventas.anular_ticket") is False
        assert "ventas.anular_ticket" not in perfil.obtener_permisos_activos()

    def test_usuario_inactivo_no_posee_permisos_activos(self, user_duenio):
        """Si un usuario está desactivado (is_active = False), ningún permiso es válido."""
        user_duenio.is_active = False
        user_duenio.save()

        perfil = user_duenio.perfil
        assert perfil.obtener_permisos_activos() == []
        for perm in PERMISOS_CATALOGO:
            assert perfil.tiene_permiso(perm) is False

    def test_superuser_posee_todos_los_permisos_automaticamente(self, user_cajero):
        """Un superusuario activo obtiene True para cualquier permiso sin importar su rol."""
        user_cajero.is_superuser = True
        user_cajero.save()

        perfil = user_cajero.perfil
        assert len(perfil.obtener_permisos_activos()) == 30
        assert perfil.tiene_permiso("personal.crear") is True
        assert perfil.tiene_permiso("caja.ver_efectivo_esperado") is True

    def test_permiso_inexistente_retorna_false(self, user_duenio):
        """Consultar una clave fuera del catálogo siempre responde False."""
        perfil = user_duenio.perfil
        assert perfil.tiene_permiso("clave.totalmente_inventada") is False
