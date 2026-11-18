"""Apertura de turnos de caja: un solo turno ABIERTO por responsable."""

from decimal import Decimal

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.caja.models import TurnoCaja
from apps.caja.services import MENSAJE_TURNO_YA_ABIERTO
from apps.usuarios.constantes import ROL_CAJERO, ROL_ENCARGADO
from apps.usuarios.services import crear_personal


@pytest.mark.django_db
class TestApiAperturaTurno:
    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def cajero(self):
        return crear_personal(
            datos_usuario={"username": "cajero_apertura", "password": "password123"},
            rol=ROL_CAJERO,
        )

    @pytest.fixture
    def encargado(self):
        return crear_personal(
            datos_usuario={"username": "encargado_apertura", "password": "password123"},
            rol=ROL_ENCARGADO,
        )

    def _abrir(self, client, autenticado, **extra):
        client.force_authenticate(user=autenticado)
        return client.post(
            "/api/caja/turnos/", {"efectivo_inicial": "5000.00", **extra}, format="json"
        )

    def test_abre_turno_si_no_tiene_uno_abierto(self, client, cajero):
        res = self._abrir(client, cajero)
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data["estado"] == "ABIERTO"
        assert res.data["usuario"] == cajero.id

    def test_rechaza_segundo_turno_abierto_del_mismo_usuario(self, client, cajero):
        TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("5000.00"))

        res = self._abrir(client, cajero)

        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert res.data == {
            "mensaje": MENSAJE_TURNO_YA_ABIERTO,
            "detalles": [MENSAJE_TURNO_YA_ABIERTO],
        }
        assert TurnoCaja.objects.filter(usuario=cajero, estado="ABIERTO").count() == 1

    def test_permite_abrir_despues_de_cerrar(self, client, cajero):
        TurnoCaja.objects.create(
            usuario=cajero, efectivo_inicial=Decimal("5000.00"), estado="CERRADO"
        )

        res = self._abrir(client, cajero)

        assert res.status_code == status.HTTP_201_CREATED

    def test_otro_usuario_puede_abrir_su_turno(self, client, cajero, encargado):
        TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("5000.00"))

        res = self._abrir(client, encargado)

        assert res.status_code == status.HTTP_201_CREATED
        assert res.data["usuario"] == encargado.id

    def test_abrir_a_nombre_de_otro_valida_al_responsable(self, client, cajero, encargado):
        TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("5000.00"))

        res = self._abrir(client, encargado, usuario=cajero.id)

        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert res.data["mensaje"] == MENSAJE_TURNO_YA_ABIERTO

    def test_cerrar_sin_efectivo_contado_responde_400_voseo(self, client, cajero):
        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("5000.00"))
        client.force_authenticate(user=cajero)

        res = client.post(f"/api/caja/turnos/{turno.id}/cerrar/", {}, format="json")

        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert res.json() == {
            "mensaje": "Ingresá el efectivo contado para cerrar la caja.",
            "detalles": None,
        }

    def test_cerrar_turno_ya_cerrado_responde_400(self, client, cajero):
        turno = TurnoCaja.objects.create(
            usuario=cajero, efectivo_inicial=Decimal("5000.00"), estado="CERRADO"
        )
        client.force_authenticate(user=cajero)

        res = client.post(
            f"/api/caja/turnos/{turno.id}/cerrar/",
            {"efectivo_contado": "5000.00"},
            format="json",
        )

        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert res.json() == {
            "mensaje": "El turno de caja ya está cerrado.",
            "detalles": None,
        }
