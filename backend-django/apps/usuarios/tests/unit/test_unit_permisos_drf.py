"""
Tests unitarios puros para clases de permiso DRF y reglas de autorización a nivel de objeto.
Valida has_permission y has_object_permission sin dependencias de base de datos (T2.6).
"""

from decimal import Decimal
from unittest.mock import MagicMock
import pytest

from apps.caja.serializers import TurnoCajaSerializer
from apps.recetas.serializers import ProductoSerializer
from apps.usuarios.constantes import (
    PERMISOS_CATALOGO,
    ROL_CAJERO,
    ROL_DUENIO,
    ROL_ENCARGADO,
)
from apps.usuarios.permissions import (
    EsDuenio,
    EsEncargadoODuenio,
    PermisoObjetoTurnoCaja,
    PermisoObjetoVenta,
    TienePermiso,
)


class MockUser:
    """Usuario simulado liviano para tests unitarios puros."""

    def __init__(
        self,
        id=1,
        username="test_user",
        is_authenticated=True,
        is_active=True,
        is_superuser=False,
        rol=None,
        permisos_dict=None,
    ):
        self.id = id
        self.username = username
        self.is_authenticated = is_authenticated
        self.is_active = is_active
        self.is_superuser = is_superuser
        if rol is not None or permisos_dict is not None:
            self.perfil = MagicMock()
            self.perfil.rol = rol
            self.perfil.tiene_permiso = MagicMock(
                side_effect=lambda p: (
                    permisos_dict.get(p, False) if permisos_dict is not None else False
                )
            )
        else:
            self.perfil = None


class MockRequest:
    """Request simulado para DRF con atributos user y auth."""

    def __init__(self, user=None, auth_payload=None):
        self.user = user
        if auth_payload is not None:
            self.auth = MagicMock()
            self.auth.payload = auth_payload
        else:
            self.auth = None


class TestTienePermisoUnitario:
    """Evaluación exhaustiva de has_permission para los 30 permisos del catálogo."""

    @pytest.mark.parametrize("clave_permiso", PERMISOS_CATALOGO)
    def test_tiene_permiso_usuario_con_permiso_habilitado_retorna_true(
        self, clave_permiso
    ):
        user = MockUser(permisos_dict={clave_permiso: True})
        req = MockRequest(user=user)
        permiso_cls = TienePermiso(clave_permiso)()
        assert permiso_cls.has_permission(req, None) is True

    @pytest.mark.parametrize("clave_permiso", PERMISOS_CATALOGO)
    def test_tiene_permiso_usuario_sin_permiso_retorna_false(self, clave_permiso):
        user = MockUser(permisos_dict={clave_permiso: False})
        req = MockRequest(user=user)
        permiso_cls = TienePermiso(clave_permiso)()
        assert permiso_cls.has_permission(req, None) is False

    @pytest.mark.parametrize("clave_permiso", PERMISOS_CATALOGO)
    def test_tiene_permiso_usuario_no_autenticado_retorna_false(self, clave_permiso):
        user = MockUser(is_authenticated=False, permisos_dict={clave_permiso: True})
        req = MockRequest(user=user)
        permiso_cls = TienePermiso(clave_permiso)()
        assert permiso_cls.has_permission(req, None) is False

    @pytest.mark.parametrize("clave_permiso", PERMISOS_CATALOGO)
    def test_tiene_permiso_usuario_inactivo_retorna_false(self, clave_permiso):
        user = MockUser(is_active=False, permisos_dict={clave_permiso: True})
        req = MockRequest(user=user)
        permiso_cls = TienePermiso(clave_permiso)()
        assert permiso_cls.has_permission(req, None) is False

    @pytest.mark.parametrize("clave_permiso", PERMISOS_CATALOGO)
    def test_tiene_permiso_superuser_siempre_retorna_true(self, clave_permiso):
        user = MockUser(is_superuser=True, permisos_dict={})
        req = MockRequest(user=user)
        permiso_cls = TienePermiso(clave_permiso)()
        assert permiso_cls.has_permission(req, None) is True

    @pytest.mark.parametrize("clave_permiso", PERMISOS_CATALOGO)
    def test_tiene_permiso_fallback_token_jwt_permite_o_rechaza(self, clave_permiso):
        # Usuario sin perfil pero con token JWT
        user = MockUser()  # sin perfil
        req_con_permiso = MockRequest(
            user=user, auth_payload={"permisos": [clave_permiso]}
        )
        permiso_cls = TienePermiso(clave_permiso)()
        assert permiso_cls.has_permission(req_con_permiso, None) is True

        req_sin_permiso = MockRequest(
            user=user, auth_payload={"permisos": ["otro.permiso"]}
        )
        assert permiso_cls.has_permission(req_sin_permiso, None) is False

    def test_mensaje_estandar_tiene_permiso(self):
        permiso_cls = TienePermiso("insumos.ver")()
        assert permiso_cls.message == "No tiene permisos para realizar esta acción"


class TestEsDuenioYEncargadoUnitario:
    """Tests unitarios para las clases de permiso EsDuenio y EsEncargadoODuenio."""

    def test_es_duenio_permite_solo_rol_duenio(self):
        perm = EsDuenio()
        duenio = MockUser(rol=ROL_DUENIO)
        encargado = MockUser(rol=ROL_ENCARGADO)
        cajero = MockUser(rol=ROL_CAJERO)
        admin = MockUser(is_superuser=True)

        assert perm.has_permission(MockRequest(duenio), None) is True
        assert perm.has_permission(MockRequest(admin), None) is True
        assert perm.has_permission(MockRequest(encargado), None) is False
        assert perm.has_permission(MockRequest(cajero), None) is False
        assert perm.has_permission(MockRequest(None), None) is False
        assert (
            perm.has_permission(
                MockRequest(MockUser(is_active=False, rol=ROL_DUENIO)), None
            )
            is False
        )

    def test_es_encargado_o_duenio_permite_ambos_roles(self):
        perm = EsEncargadoODuenio()
        duenio = MockUser(rol=ROL_DUENIO)
        encargado = MockUser(rol=ROL_ENCARGADO)
        cajero = MockUser(rol=ROL_CAJERO)
        admin = MockUser(is_superuser=True)

        assert perm.has_permission(MockRequest(duenio), None) is True
        assert perm.has_permission(MockRequest(encargado), None) is True
        assert perm.has_permission(MockRequest(admin), None) is True
        assert perm.has_permission(MockRequest(cajero), None) is False
        assert (
            perm.has_permission(
                MockRequest(MockUser(is_active=False, rol=ROL_ENCARGADO)), None
            )
            is False
        )


class TestPermisoObjetoTurnoCajaUnitario:
    """Tests unitarios para reglas de objeto en turnos de caja (cajero vs ajenos)."""

    def test_cajero_accede_a_su_propio_turno(self):
        perm = PermisoObjetoTurnoCaja()
        cajero = MockUser(id=10, rol=ROL_CAJERO)
        turno_propio = MagicMock(usuario_id=10)

        assert (
            perm.has_object_permission(MockRequest(cajero), None, turno_propio) is True
        )

    def test_cajero_rechazado_al_intentar_acceder_turno_ajeno(self):
        perm = PermisoObjetoTurnoCaja()
        cajero = MockUser(
            id=10, rol=ROL_CAJERO, permisos_dict={"caja.gestionar_turnos_ajenos": False}
        )
        turno_ajeno = MagicMock(usuario_id=99)

        assert (
            perm.has_object_permission(MockRequest(cajero), None, turno_ajeno) is False
        )

    def test_encargado_con_gestionar_turnos_ajenos_accede_a_cualquier_turno(self):
        perm = PermisoObjetoTurnoCaja()
        encargado = MockUser(
            id=5,
            rol=ROL_ENCARGADO,
            permisos_dict={"caja.gestionar_turnos_ajenos": True},
        )
        turno_cajero = MagicMock(usuario_id=10)

        assert (
            perm.has_object_permission(MockRequest(encargado), None, turno_cajero)
            is True
        )

    def test_usuario_con_claim_token_gestionar_turnos_ajenos_accede(self):
        perm = PermisoObjetoTurnoCaja()
        user_sin_perfil = MockUser(id=20)
        req = MockRequest(
            user=user_sin_perfil,
            auth_payload={"permisos": ["caja.gestionar_turnos_ajenos"]},
        )
        turno_ajeno = MagicMock(usuario_id=30)

        assert perm.has_object_permission(req, None, turno_ajeno) is True

    def test_superuser_accede_a_cualquier_turno(self):
        perm = PermisoObjetoTurnoCaja()
        admin = MockUser(id=1, is_superuser=True)
        turno = MagicMock(usuario_id=50)

        assert perm.has_object_permission(MockRequest(admin), None, turno) is True

    def test_usuario_inactivo_o_no_autenticado_rechazado(self):
        perm = PermisoObjetoTurnoCaja()
        inactivo = MockUser(id=10, is_active=False)
        no_auth = MockUser(id=10, is_authenticated=False)
        turno = MagicMock(usuario_id=10)

        assert perm.has_object_permission(MockRequest(inactivo), None, turno) is False
        assert perm.has_object_permission(MockRequest(no_auth), None, turno) is False
        assert perm.has_object_permission(MockRequest(None), None, turno) is False


class TestPermisoObjetoVentaUnitario:
    """Tests unitarios para reglas de objeto en ventas (cajero vs historial global)."""

    def test_cajero_accede_a_venta_de_su_turno(self):
        perm = PermisoObjetoVenta()
        cajero = MockUser(id=10, rol=ROL_CAJERO)
        turno = MagicMock(usuario_id=10)
        venta_propia = MagicMock(turno_caja=turno)

        assert (
            perm.has_object_permission(MockRequest(cajero), None, venta_propia) is True
        )

    def test_cajero_rechazado_en_venta_de_turno_ajeno(self):
        perm = PermisoObjetoVenta()
        cajero = MockUser(
            id=10, rol=ROL_CAJERO, permisos_dict={"ventas.ver_historial_todos": False}
        )
        turno_ajeno = MagicMock(usuario_id=20)
        venta_ajena = MagicMock(turno_caja=turno_ajeno)

        assert (
            perm.has_object_permission(MockRequest(cajero), None, venta_ajena) is False
        )

    def test_encargado_con_ver_historial_todos_accede_a_cualquier_venta(self):
        perm = PermisoObjetoVenta()
        encargado = MockUser(
            id=5,
            rol=ROL_ENCARGADO,
            permisos_dict={"ventas.ver_historial_todos": True},
        )
        turno_cajero = MagicMock(usuario_id=10)
        venta = MagicMock(turno_caja=turno_cajero)

        assert perm.has_object_permission(MockRequest(encargado), None, venta) is True

    def test_usuario_con_claim_token_ver_historial_todos_accede(self):
        perm = PermisoObjetoVenta()
        user_sin_perfil = MockUser(id=20)
        req = MockRequest(
            user=user_sin_perfil,
            auth_payload={"permisos": ["ventas.ver_historial_todos"]},
        )
        venta = MagicMock(turno_caja=MagicMock(usuario_id=50))

        assert perm.has_object_permission(req, None, venta) is True

    def test_superuser_accede_a_cualquier_venta(self):
        perm = PermisoObjetoVenta()
        admin = MockUser(id=1, is_superuser=True)
        venta = MagicMock(turno_caja=MagicMock(usuario_id=99))

        assert perm.has_object_permission(MockRequest(admin), None, venta) is True

    def test_venta_sin_turno_rechaza_a_cajero(self):
        perm = PermisoObjetoVenta()
        cajero = MockUser(
            id=10, rol=ROL_CAJERO, permisos_dict={"ventas.ver_historial_todos": False}
        )
        venta_sin_turno = MagicMock(turno_caja=None)

        assert (
            perm.has_object_permission(MockRequest(cajero), None, venta_sin_turno)
            is False
        )


class TestReglasArqueoCiegoYCostosUnitario:
    """Tests unitarios sobre el enmascaramiento de datos sensibles en serializadores."""

    def test_arqueo_ciego_oculta_esperado_y_diferencia_a_cajero(self):
        cajero = MockUser(
            id=10,
            rol=ROL_CAJERO,
            permisos_dict={"caja.ver_efectivo_esperado": False},
        )
        req = MockRequest(user=cajero)

        turno = MagicMock(
            id=1,
            usuario=cajero,
            apertura="2026-10-28T10:00:00Z",
            cierre=None,
            efectivo_inicial=Decimal("5000.00"),
            efectivo_contado=Decimal("5200.00"),
            efectivo_esperado=Decimal("5000.00"),
            diferencia=Decimal("200.00"),
            estado="CERRADO",
            movimientos=MagicMock(all=lambda: []),
        )

        serializer = TurnoCajaSerializer(turno, context={"request": req})
        data = serializer.data

        assert data["efectivo_esperado"] is None
        assert data["diferencia"] is None
        assert data["efectivo_contado"] == "5200.00"

    def test_arqueo_ciego_muestra_esperado_a_duenio_o_encargado(self):
        duenio = MockUser(
            id=1,
            rol=ROL_DUENIO,
            permisos_dict={"caja.ver_efectivo_esperado": True},
        )
        req = MockRequest(user=duenio)

        turno = MagicMock(
            id=1,
            usuario=duenio,
            apertura="2026-10-28T10:00:00Z",
            cierre=None,
            efectivo_inicial=Decimal("5000.00"),
            efectivo_contado=Decimal("5200.00"),
            efectivo_esperado=Decimal("5000.00"),
            diferencia=Decimal("200.00"),
            estado="CERRADO",
            movimientos=MagicMock(all=lambda: []),
        )

        serializer = TurnoCajaSerializer(turno, context={"request": req})
        data = serializer.data

        assert data["efectivo_esperado"] == "5000.00"
        assert data["diferencia"] == "200.00"

    def test_ocultamiento_costos_a_usuario_sin_recetas_ver_costos(self):
        cajero = MockUser(
            id=10,
            rol=ROL_CAJERO,
            permisos_dict={"recetas.ver_costos": False},
        )
        req = MockRequest(user=cajero)

        producto = MagicMock(
            id=1,
            nombre="Café Latte",
            codigo_barras="12345",
            precio_venta=Decimal("4000.00"),
            minutos_mano_obra=Decimal("2.00"),
            costo_hora_mano_obra=Decimal("2500.00"),
            descartables=Decimal("100.00"),
            costo_total_calculado=Decimal("2181.3333"),
            ganancia_bruta=Decimal("1818.6667"),
            margen_bruto=Decimal("45.47"),
            receta_items=MagicMock(all=lambda: []),
            estado_activo=True,
            creado_en="2026-10-28T10:00:00Z",
            actualizado_en="2026-10-28T10:00:00Z",
        )

        serializer = ProductoSerializer(producto, context={"request": req})
        data = serializer.data

        assert data["costo_total_calculado"] is None
        assert data["ganancia_bruta"] is None
        assert data["margen_bruto"] is None
        assert data["precio_venta"] == "4000.00"
