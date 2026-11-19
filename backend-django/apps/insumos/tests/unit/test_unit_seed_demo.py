"""Tests unitarios para verificar la idempotencia segura de seed_demo y su modo --video."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.auth.models import User
from django.core.management import CommandError, call_command
from django.test import override_settings
from django.utils import timezone

from apps.caja.models import MovimientoCaja, TurnoCaja
from apps.insumos.models import Compra, Insumo, Proveedor
from apps.recetas.models import Producto, RecetaItem
from apps.ventas.models import Venta, VentaItem
from apps.ventas.services import (
    calcular_punto_equilibrio_y_metas,
    obtener_ganancia_diaria,
    obtener_ranking_productos,
)


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

    @override_settings(DEBUG=True)
    def test_seed_demo_video_puebla_datos_completos_y_es_idempotente(self, monkeypatch):
        """
        seed_demo --video crea productos con receta completa (incluido uno con margen < 30%),
        ventas en 14 días, 1 venta anulada, 2 turnos cerrados y 1 abierto con caja chica,
        sin cambiar contraseñas existentes ni duplicar registros al ejecutarse dos veces.
        """
        monkeypatch.delenv("SEED_DEMO_PASSWORD", raising=False)
        clave_previa = "ClavePropiaPreexistente!2026"
        duenio_previo = User.objects.create_user(username="duenio_demo", password=clave_previa)
        User.objects.create_user(username="barista_extra", password="ExtraPass!1")

        call_command("seed_demo", video=True)

        duenio_previo.refresh_from_db()
        assert duenio_previo.check_password(clave_previa)
        assert User.objects.filter(username="barista_extra").exists()

        productos = list(Producto.objects.filter(estado_activo=True))
        assert len(productos) >= 10
        assert all(p.receta_items.exists() for p in productos)
        assert all(p.minutos_mano_obra > Decimal("0") for p in productos)
        assert any(p.descartables > Decimal("0") for p in productos)
        assert any(p.margen_bruto < Decimal("0.30") for p in productos)

        turnos_cerrados = TurnoCaja.objects.filter(
            usuario__username="cajero_demo", estado="CERRADO"
        )
        turnos_abiertos = TurnoCaja.objects.filter(
            usuario__username="cajero_demo", estado="ABIERTO"
        )
        assert turnos_cerrados.count() == 2
        assert turnos_abiertos.count() == 1
        assert all(t.movimientos.exists() for t in turnos_cerrados)
        assert turnos_abiertos.first().movimientos.exists()

        assert Venta.objects.filter(estado="ANULADA").count() == 1
        venta_anulada = Venta.objects.get(estado="ANULADA")
        assert venta_anulada.anulada_por == duenio_previo
        assert venta_anulada.motivo_anulacion != ""

        ahora_local = timezone.localtime(timezone.now())
        hace_14_dias = (ahora_local - timedelta(days=13)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        hace_7_dias = (ahora_local - timedelta(days=6)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        fechas_emitidas = [
            timezone.localtime(f).date()
            for f in Venta.objects.filter(estado="EMITIDA", fecha__gte=hace_14_dias).values_list(
                "fecha", flat=True
            )
        ]
        dias_distintos = set(fechas_emitidas)
        assert len(dias_distintos) >= 12
        assert any(d < hace_7_dias.date() for d in dias_distintos)
        assert any(d >= hace_7_dias.date() for d in dias_distintos)

        # Reportes y punto de equilibrio sobre los últimos 7 días devuelven datos consistentes
        resumen_7d = obtener_ganancia_diaria(fecha_inicio=hace_7_dias, fecha_fin=ahora_local)
        assert resumen_7d["cantidad_tickets"] > 0
        assert Decimal(resumen_7d["ingresos_totales"]) > Decimal("0")

        ranking_7d = obtener_ranking_productos(fecha_inicio=hace_7_dias, fecha_fin=ahora_local)
        assert len(ranking_7d["mas_vendidos"]) > 0
        assert any(
            Decimal(it["unidades_vendidas"]) == Decimal("0.00")
            for it in ranking_7d["menos_vendidos"]
        )

        pe_7d = calcular_punto_equilibrio_y_metas(
            costos_fijos=Decimal("1500000.00"),
            fecha_inicio=hace_7_dias,
            fecha_fin=ahora_local,
        )
        assert Decimal(pe_7d["punto_equilibrio_mensual"]) > Decimal("0")

        conteos_primera_ejecucion = (
            User.objects.count(),
            Proveedor.objects.count(),
            Insumo.objects.count(),
            Compra.objects.count(),
            Producto.objects.count(),
            RecetaItem.objects.count(),
            TurnoCaja.objects.count(),
            MovimientoCaja.objects.count(),
            Venta.objects.count(),
            VentaItem.objects.count(),
        )
        esperado_primera = turnos_abiertos.first().efectivo_esperado

        # Segunda ejecución: idempotencia total sin duplicados ni cambios en contraseñas
        call_command("seed_demo", video=True)

        duenio_previo.refresh_from_db()
        assert duenio_previo.check_password(clave_previa)
        assert (
            User.objects.count(),
            Proveedor.objects.count(),
            Insumo.objects.count(),
            Compra.objects.count(),
            Producto.objects.count(),
            RecetaItem.objects.count(),
            TurnoCaja.objects.count(),
            MovimientoCaja.objects.count(),
            Venta.objects.count(),
            VentaItem.objects.count(),
        ) == conteos_primera_ejecucion
        turnos_abiertos.first().refresh_from_db()
        assert turnos_abiertos.first().efectivo_esperado == esperado_primera

    @override_settings(DEBUG=True)
    def test_seed_demo_video_sobre_base_estandar_no_duplica_turno_ni_cambia_clave(
        self, monkeypatch
    ):
        """
        Si ya se había ejecutado seed_demo estándar con contraseña definida, correr luego
        seed_demo --video sin SEED_DEMO_PASSWORD conserva la clave y el turno abierto previo.
        """
        clave_inicial = "DemoSegura!2026"
        monkeypatch.setenv("SEED_DEMO_PASSWORD", clave_inicial)
        call_command("seed_demo")

        monkeypatch.delenv("SEED_DEMO_PASSWORD", raising=False)
        call_command("seed_demo", video=True)
        call_command("seed_demo", video=True)

        cajero = User.objects.get(username="cajero_demo")
        assert cajero.check_password(clave_inicial)
        assert TurnoCaja.objects.filter(usuario=cajero, estado="ABIERTO").count() == 1
        assert TurnoCaja.objects.filter(usuario=cajero, estado="CERRADO").count() == 2
        assert Venta.objects.filter(estado="ANULADA").count() == 1
