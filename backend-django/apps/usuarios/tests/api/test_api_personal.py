"""
Tests de API e integración para endpoints de gestión de personal (/api/usuarios/)
y autorización a nivel de vista y objeto (docs/seguridad.md §5).
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.caja.models import TurnoCaja
from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO
from apps.usuarios.permissions import PermisoObjetoTurnoCaja
from apps.usuarios.services import crear_personal

User = get_user_model()


@pytest.mark.django_db
class TestApiPersonalEndpoints:
    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def duenio(self):
        return crear_personal(
            datos_usuario={
                "username": "duenio_api_p",
                "password": "claveSegura123!",
                "email": "duenio_p@cafe.local",
            },
            rol=ROL_DUENIO,
        )

    @pytest.fixture
    def cajero(self):
        return crear_personal(
            datos_usuario={
                "username": "cajero_api_p",
                "password": "claveSegura123!",
                "email": "cajero_p@cafe.local",
            },
            rol=ROL_CAJERO,
        )

    def test_listado_usuarios_requiere_permiso_personal_ver(self, client, duenio, cajero):
        """Un usuario sin permiso recibe HTTP 403 con el formato de error unificado."""
        # Cajero no tiene personal.ver
        client.force_authenticate(user=cajero)
        res_cajero = client.get("/api/usuarios/")
        assert res_cajero.status_code == 403
        data_error = res_cajero.json()
        assert data_error["mensaje"] == "No tenés permisos para realizar esta acción"
        assert data_error["detalles"] is None

        # Dueño tiene personal.ver
        client.force_authenticate(user=duenio)
        res_duenio = client.get("/api/usuarios/")
        assert res_duenio.status_code == 200
        data = res_duenio.json()
        assert "datos" in data
        assert data["total"] >= 2

    def test_creacion_personal_exitoso_por_duenio(self, client, duenio):
        """Dueño con personal.crear da de alta un nuevo empleado con HTTP 201."""
        client.force_authenticate(user=duenio)
        res = client.post(
            "/api/usuarios/",
            {
                "username": "nuevo_cajero",
                "password": "claveSegura123!",
                "email": "nuevo@cafe.local",
                "rol": ROL_CAJERO,
            },
            format="json",
        )
        assert res.status_code == 201
        data = res.json()
        assert data["username"] == "nuevo_cajero"
        assert data["rol"] == ROL_CAJERO
        assert data["is_active"] is True

    def test_desactivar_ultimo_duenio_responde_400(self, client, duenio):
        """El endpoint HTTP /api/usuarios/:id/desactivar/ responde 400 ante el último dueño."""
        client.force_authenticate(user=duenio)
        res = client.post(f"/api/usuarios/{duenio.id}/desactivar/", format="json")
        assert res.status_code == 400
        data = res.json()
        assert "mensaje" in data
        assert "único Dueño activo" in str(data)

    def test_desactivar_cajero_responde_200_y_desactiva_logicamente(self, client, duenio, cajero):
        """Desactivar a un cajero responde 200, marca is_active = False sin borrado físico."""
        client.force_authenticate(user=duenio)
        res = client.post(
            f"/api/usuarios/{cajero.id}/desactivar/",
            {"motivo": "Fin de contrato"},
            format="json",
        )
        assert res.status_code == 200
        cajero.refresh_from_db()
        assert cajero.is_active is False
        assert User.objects.filter(id=cajero.id).exists() is True

    def test_ajustar_permisos_individuales_responde_200(self, client, duenio, cajero):
        """POST /api/usuarios/:id/ajustar-permisos/ sobreescribe flags booleanos."""
        client.force_authenticate(user=duenio)
        res = client.post(
            f"/api/usuarios/{cajero.id}/ajustar-permisos/",
            {"permisos": {"caja.registrar_movimiento": True}},
            format="json",
        )
        assert res.status_code == 200
        cajero.refresh_from_db()
        assert cajero.perfil.tiene_permiso("caja.registrar_movimiento") is True

    def test_endpoint_me_retorna_usuario_autenticado_actual(self, client, cajero):
        """GET /api/usuarios/me/ responde 200 con el perfil del usuario logueado."""
        client.force_authenticate(user=cajero)
        res = client.get("/api/usuarios/me/")
        assert res.status_code == 200
        data = res.json()
        assert data["username"] == "cajero_api_p"
        assert data["rol"] == ROL_CAJERO
        assert isinstance(data["permisos_activos"], list)

    def test_autorizacion_objeto_turnos_caja(self, duenio, cajero):
        """Cajero solo accede a su propio turno, dueño accede a cualquiera."""
        cajero2 = crear_personal(
            datos_usuario={"username": "cajero_dos", "password": "password123"},
            rol=ROL_CAJERO,
        )
        turno_cajero1 = TurnoCaja.objects.create(usuario=cajero)
        permiso_checker = PermisoObjetoTurnoCaja()

        class MockRequest:
            def __init__(self, user):
                self.user = user

        # Cajero 1 sobre su turno
        assert (
            permiso_checker.has_object_permission(MockRequest(cajero), None, turno_cajero1) is True
        )
        # Cajero 2 sobre turno ajeno
        assert (
            permiso_checker.has_object_permission(MockRequest(cajero2), None, turno_cajero1)
            is False
        )
        # Dueño sobre cualquier turno
        assert (
            permiso_checker.has_object_permission(MockRequest(duenio), None, turno_cajero1) is True
        )

    def test_superusuario_sin_perfil_o_con_perfil_cajero_se_serializa_como_duenio(
        self, client, duenio
    ):
        """Un superusuario siempre se expone con rol DUENIO y todos los permisos sin tocar la BD."""
        from apps.usuarios.constantes import PERMISOS_CATALOGO
        from apps.usuarios.models import PerfilUsuario

        admin_sin_perfil = User.objects.create_superuser(
            username="admin_sin_perfil",
            email="admin_sp@cafe.local",
            password="claveSegura123!",
        )
        admin_con_perfil_cajero = User.objects.create_superuser(
            username="admin_perfil_cajero",
            email="admin_pc@cafe.local",
            password="claveSegura123!",
        )
        PerfilUsuario.objects.create(usuario=admin_con_perfil_cajero, rol=ROL_CAJERO)

        client.force_authenticate(user=duenio)
        res = client.get("/api/usuarios/?limite=50")
        assert res.status_code == 200
        usuarios_por_nombre = {u["username"]: u for u in res.json()["datos"]}

        for username in ("admin_sin_perfil", "admin_perfil_cajero"):
            u = usuarios_por_nombre[username]
            assert u["is_superuser"] is True
            assert u["rol"] == ROL_DUENIO
            assert u["permisos_activos"] == sorted(PERMISOS_CATALOGO)

        client.force_authenticate(user=admin_sin_perfil)
        res_me = client.get("/api/usuarios/me/")
        assert res_me.status_code == 200
        assert res_me.json()["rol"] == ROL_DUENIO
        assert res_me.json()["is_superuser"] is True

    def test_proteccion_superusuario_sin_perfil_en_endpoints_personal(self, client, duenio):
        """Editar o desactivar un superusuario sin perfil devuelve 400 (nunca 500)."""
        admin = User.objects.create_superuser(
            username="admin_protegido_api",
            email="admin_prot_api@cafe.local",
            password="claveSegura123!",
        )

        # No-superusuario intenta editar datos, rol, permisos o desactivar al superusuario
        client.force_authenticate(user=duenio)
        res_patch = client.patch(
            f"/api/usuarios/{admin.id}/",
            {"rol": ROL_CAJERO},
            format="json",
        )
        assert res_patch.status_code == 400
        assert "mensaje" in res_patch.json()

        res_perm = client.post(
            f"/api/usuarios/{admin.id}/ajustar-permisos/",
            {"permisos": {"ventas.crear": False}},
            format="json",
        )
        assert res_perm.status_code == 400

        res_baja = client.post(
            f"/api/usuarios/{admin.id}/desactivar/",
            {"motivo": "Prueba"},
            format="json",
        )
        assert res_baja.status_code == 400

        # Superusuario tampoco puede alterar su propio rol ni permisos
        client.force_authenticate(user=admin)
        res_admin_rol = client.patch(
            f"/api/usuarios/{admin.id}/",
            {"rol": ROL_CAJERO},
            format="json",
        )
        assert res_admin_rol.status_code == 400

        res_admin_perm = client.post(
            f"/api/usuarios/{admin.id}/ajustar-permisos/",
            {"permisos": {"ventas.crear": False}},
            format="json",
        )
        assert res_admin_perm.status_code == 400

        # Superusuario sí puede editar sus datos básicos sin fallar por falta de perfil
        res_admin_datos = client.patch(
            f"/api/usuarios/{admin.id}/",
            {"first_name": "Principal"},
            format="json",
        )
        assert res_admin_datos.status_code == 200
        assert res_admin_datos.json()["first_name"] == "Principal"

    def test_delete_usuario_devuelve_mensaje_claro_sin_jerga(self, client, duenio, cajero):
        """DELETE /api/usuarios/:id/ desactiva y responde sin tecnicismos."""
        client.force_authenticate(user=duenio)
        res = client.delete(f"/api/usuarios/{cajero.id}/")
        assert res.status_code == 200
        assert res.json() == {
            "mensaje": "Usuario desactivado correctamente.",
            "detalles": None,
        }
