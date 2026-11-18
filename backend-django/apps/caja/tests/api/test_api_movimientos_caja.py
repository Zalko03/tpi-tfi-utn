"""Visibilidad de movimientos de caja por rol y titularidad del turno."""

from decimal import Decimal

import pytest
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APIClient, APIRequestFactory

from apps.caja.models import MovimientoCaja, TurnoCaja
from apps.caja.serializers import TurnoCajaSerializer
from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO, ROL_ENCARGADO
from apps.usuarios.services import crear_personal


@pytest.mark.django_db
class TestApiMovimientosCaja:
    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def duenio(self):
        return crear_personal(
            datos_usuario={"username": "duenio_movs", "password": "password123"},
            rol=ROL_DUENIO,
        )

    @pytest.fixture
    def encargado(self):
        return crear_personal(
            datos_usuario={"username": "encargado_movs", "password": "password123"},
            rol=ROL_ENCARGADO,
        )

    @pytest.fixture
    def cajero_uno(self, duenio):
        return crear_personal(
            datos_usuario={"username": "cajero_movs_1", "password": "password123"},
            rol=ROL_CAJERO,
            permisos={"caja.registrar_movimiento": True},
            creado_por=duenio,
        )

    @pytest.fixture
    def cajero_dos(self, duenio):
        return crear_personal(
            datos_usuario={"username": "cajero_movs_2", "password": "password123"},
            rol=ROL_CAJERO,
            permisos={"caja.registrar_movimiento": True},
            creado_por=duenio,
        )

    @pytest.fixture
    def cajero_estandar(self):
        return crear_personal(
            datos_usuario={"username": "cajero_movs_estandar", "password": "password123"},
            rol=ROL_CAJERO,
        )

    @pytest.fixture
    def datos_movimientos(self, cajero_uno, cajero_dos, cajero_estandar):
        turno_c1 = TurnoCaja.objects.create(
            usuario=cajero_uno, efectivo_inicial=Decimal("10000.00")
        )
        turno_c2 = TurnoCaja.objects.create(usuario=cajero_dos, efectivo_inicial=Decimal("8000.00"))
        turno_estandar = TurnoCaja.objects.create(
            usuario=cajero_estandar, efectivo_inicial=Decimal("5000.00")
        )

        mov_c1_a = MovimientoCaja.objects.create(
            turno_caja=turno_c1,
            tipo="ENTRADA",
            monto=Decimal("5000.00"),
            motivo="Cambio chico turno 1",
        )
        mov_c1_b = MovimientoCaja.objects.create(
            turno_caja=turno_c1,
            tipo="SALIDA",
            monto=Decimal("2500.00"),
            motivo="Compra hielo turno 1",
        )
        mov_c2 = MovimientoCaja.objects.create(
            turno_caja=turno_c2,
            tipo="SALIDA",
            monto=Decimal("1500.00"),
            motivo="Flete turno 2",
        )
        mov_est_a = MovimientoCaja.objects.create(
            turno_caja=turno_estandar,
            tipo="ENTRADA",
            monto=Decimal("3000.00"),
            motivo="Cambio inicial estándar",
        )
        mov_est_b = MovimientoCaja.objects.create(
            turno_caja=turno_estandar,
            tipo="SALIDA",
            monto=Decimal("1200.00"),
            motivo="Insumo urgente estándar",
        )

        return {
            "turnos": (turno_c1, turno_c2, turno_estandar),
            "movimientos_c1": (mov_c1_a, mov_c1_b),
            "movimiento_c2": mov_c2,
            "movimientos_estandar": (mov_est_a, mov_est_b),
        }

    def test_cajero_lista_ve_solo_sus_propios_movimientos(
        self, client, cajero_uno, datos_movimientos
    ):
        _, turno_c2, _ = datos_movimientos["turnos"]
        mov_c1_a, mov_c1_b = datos_movimientos["movimientos_c1"]

        client.force_authenticate(user=cajero_uno)
        res = client.get("/api/caja/movimientos/")

        assert res.status_code == status.HTTP_200_OK
        ids_recibidos = {m["id"] for m in res.json()["datos"]}
        assert ids_recibidos == {mov_c1_a.id, mov_c1_b.id}

        res_filtrado = client.get(f"/api/caja/movimientos/?turno_caja={turno_c2.id}")
        assert res_filtrado.status_code == status.HTTP_200_OK
        assert res_filtrado.json()["datos"] == []

    def test_cajero_detalle_ve_propio_y_recibe_404_en_ajeno(
        self, client, cajero_uno, datos_movimientos
    ):
        mov_c1_a, _ = datos_movimientos["movimientos_c1"]
        mov_c2 = datos_movimientos["movimiento_c2"]

        client.force_authenticate(user=cajero_uno)

        res_propio = client.get(f"/api/caja/movimientos/{mov_c1_a.id}/")
        assert res_propio.status_code == status.HTTP_200_OK
        assert res_propio.json()["id"] == mov_c1_a.id

        res_ajeno = client.get(f"/api/caja/movimientos/{mov_c2.id}/")
        assert res_ajeno.status_code == status.HTTP_404_NOT_FOUND
        cuerpo = res_ajeno.json()
        assert "mensaje" in cuerpo and "detalles" in cuerpo

    def test_encargado_ve_todos_los_movimientos_lista_y_detalle(
        self, client, encargado, datos_movimientos
    ):
        mov_c1_a, mov_c1_b = datos_movimientos["movimientos_c1"]
        mov_c2 = datos_movimientos["movimiento_c2"]
        mov_est_a, mov_est_b = datos_movimientos["movimientos_estandar"]
        esperados = {mov_c1_a.id, mov_c1_b.id, mov_c2.id, mov_est_a.id, mov_est_b.id}

        client.force_authenticate(user=encargado)
        res_lista = client.get("/api/caja/movimientos/")
        assert res_lista.status_code == status.HTTP_200_OK
        assert {m["id"] for m in res_lista.json()["datos"]} == esperados

        res_det_c1 = client.get(f"/api/caja/movimientos/{mov_c1_a.id}/")
        res_det_c2 = client.get(f"/api/caja/movimientos/{mov_c2.id}/")
        assert res_det_c1.status_code == status.HTTP_200_OK
        assert res_det_c2.status_code == status.HTTP_200_OK

    def test_duenio_ve_todos_los_movimientos_lista_y_detalle(
        self, client, duenio, datos_movimientos
    ):
        mov_c1_a, mov_c1_b = datos_movimientos["movimientos_c1"]
        mov_c2 = datos_movimientos["movimiento_c2"]
        mov_est_a, mov_est_b = datos_movimientos["movimientos_estandar"]
        esperados = {mov_c1_a.id, mov_c1_b.id, mov_c2.id, mov_est_a.id, mov_est_b.id}

        client.force_authenticate(user=duenio)
        res_lista = client.get("/api/caja/movimientos/")
        assert res_lista.status_code == status.HTTP_200_OK
        assert {m["id"] for m in res_lista.json()["datos"]} == esperados

        res_det = client.get(f"/api/caja/movimientos/{mov_c2.id}/")
        assert res_det.status_code == status.HTTP_200_OK
        assert res_det.json()["id"] == mov_c2.id

    def test_superusuario_ve_todos_los_movimientos(self, client, datos_movimientos):
        superuser = User.objects.create_superuser(
            username="admin_movs", email="admin@cafe.local", password="password123"
        )
        mov_c1_a, mov_c1_b = datos_movimientos["movimientos_c1"]
        mov_c2 = datos_movimientos["movimiento_c2"]
        mov_est_a, mov_est_b = datos_movimientos["movimientos_estandar"]
        esperados = {mov_c1_a.id, mov_c1_b.id, mov_c2.id, mov_est_a.id, mov_est_b.id}

        client.force_authenticate(user=superuser)
        res_lista = client.get("/api/caja/movimientos/")
        assert res_lista.status_code == status.HTTP_200_OK
        assert {m["id"] for m in res_lista.json()["datos"]} == esperados

        res_det = client.get(f"/api/caja/movimientos/{mov_c2.id}/")
        assert res_det.status_code == status.HTTP_200_OK

    def test_cajero_estandar_ve_movimientos_de_su_turno_sin_romper_arqueo_ciego(
        self, client, cajero_estandar, datos_movimientos
    ):
        _, _, turno_estandar = datos_movimientos["turnos"]
        mov_est_a, mov_est_b = datos_movimientos["movimientos_estandar"]

        client.force_authenticate(user=cajero_estandar)

        res_lista = client.get("/api/caja/turnos/")
        assert res_lista.status_code == status.HTTP_200_OK
        turnos = res_lista.json()["datos"]
        assert len(turnos) == 1
        turno_data = turnos[0]
        assert turno_data["id"] == turno_estandar.id
        assert {m["id"] for m in turno_data["movimientos"]} == {mov_est_a.id, mov_est_b.id}
        assert turno_data["efectivo_inicial"] is None
        assert turno_data["efectivo_esperado"] is None
        assert turno_data["diferencia"] is None
        assert turno_data["ventas_efectivo_total"] is None
        assert turno_data["cantidad_tickets"] is None

        res_detalle = client.get(f"/api/caja/turnos/{turno_estandar.id}/")
        assert res_detalle.status_code == status.HTTP_200_OK
        det_data = res_detalle.json()
        assert {m["id"] for m in det_data["movimientos"]} == {mov_est_a.id, mov_est_b.id}
        assert det_data["efectivo_inicial"] is None
        assert det_data["efectivo_esperado"] is None

        res_movs = client.get("/api/caja/movimientos/")
        assert res_movs.status_code == status.HTTP_403_FORBIDDEN

    def test_serializer_turno_ajeno_oculta_movimientos_sin_permiso(
        self, cajero_uno, datos_movimientos
    ):
        _, turno_c2, _ = datos_movimientos["turnos"]
        req = APIRequestFactory().get(f"/api/caja/turnos/{turno_c2.id}/")
        req.user = cajero_uno

        data = TurnoCajaSerializer(turno_c2, context={"request": req}).data
        assert data["movimientos"] == []
        assert data["efectivo_inicial"] is None
        assert data["efectivo_esperado"] is None
