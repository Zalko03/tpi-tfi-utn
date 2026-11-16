"""Tests unitarios para verificar la idempotencia segura de seed_demo."""

from decimal import Decimal

import pytest
from django.contrib.auth.models import User
from django.core.management import CommandError, call_command
from django.test import override_settings

from apps.caja.models import TurnoCaja
from apps.insumos.models import Compra, Insumo, Proveedor


@pytest.mark.django_db
class TestUnitSeedDemo:
    @override_settings(DEBUG=True)
    def test_seed_demo_preserva_costo_con_compras_y_no_fuerza_turno_id_1(self, monkeypatch):
        """
        Si ya existen compras registradas sobre un insumo o turnos previos con otro id,
        seed_demo no debe sobrescribir costo_unitario ni forzar TurnoCaja(id=1).
        """
        monkeypatch.delenv("SEED_DEMO_PASSWORD", raising=False)
        otro_usuario = User.objects.create_user(username="otro_operador", password="x")
        turno_previo = TurnoCaja.objects.create(
            usuario=otro_usuario,
            efectivo_inicial=Decimal("1000.00"),
            estado="CERRADO",
        )

        prov = Proveedor.objects.create(nombre="Tostadero Café del Sur")
        insumo = Insumo.objects.create(
            nombre="Café Especialidad Colombia",
            unidad_base="g",
            costo_unitario=Decimal("75.0000"),
        )
        Compra.objects.create(
            proveedor=prov,
            insumo=insumo,
            cantidad=Decimal("1000.0000"),
            unidad="g",
            precio_total=Decimal("75000.00"),
            costo_unitario_calculado=Decimal("75.0000"),
            envio=Decimal("0.00"),
        )

        call_command("seed_demo")

        insumo.refresh_from_db()
        turno_previo.refresh_from_db()
        assert insumo.costo_unitario == Decimal("75.0000")
        assert turno_previo.usuario == otro_usuario
        assert turno_previo.estado == "CERRADO"

        # Sin SEED_DEMO_PASSWORD los usuarios quedan con contraseña inusable (sin clave hardcodeada)
        duenio = User.objects.get(username="duenio_demo")
        assert not duenio.has_usable_password()

        turnos_abiertos = TurnoCaja.objects.filter(
            usuario__username="cajero_demo",
            estado="ABIERTO",
        )
        assert turnos_abiertos.count() == 1
        assert turnos_abiertos.first().id != turno_previo.id

        # Re-ejecutar seed_demo mantiene idempotencia sin duplicar turnos abiertos
        call_command("seed_demo")
        assert (
            TurnoCaja.objects.filter(usuario__username="cajero_demo", estado="ABIERTO").count() == 1
        )

    @override_settings(DEBUG=False)
    def test_seed_demo_bloqueado_en_produccion_salvo_force_production(self, monkeypatch):
        """Con DEBUG=False, seed_demo falla salvo que se pase --force-production explícito."""
        monkeypatch.delenv("SEED_DEMO_ALLOW_PRODUCTION", raising=False)
        with pytest.raises(CommandError, match="DEBUG=False"):
            call_command("seed_demo")

        clave_test = "ClaveEntornoTest!99"
        monkeypatch.setenv("SEED_DEMO_PASSWORD", clave_test)
        call_command("seed_demo", force_production=True)

        cajero = User.objects.get(username="cajero_demo")
        assert cajero.check_password(clave_test)
