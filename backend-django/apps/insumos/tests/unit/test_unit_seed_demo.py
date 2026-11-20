"""Tests unitarios para verificar la idempotencia segura de seed_demo y su modo --video."""

from datetime import datetime, timedelta
from decimal import Decimal
from io import StringIO

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
        assert len(productos) == 11
        assert all(p.receta_items.exists() for p in productos)
        assert all(p.minutos_mano_obra > Decimal("0") for p in productos)
        assert any(p.descartables > Decimal("0") for p in productos)

        brownie = Producto.objects.get(nombre="Brownie Intenso Chocolate 70%")
        assert brownie.margen_bruto < Decimal("0.30")

        turnos_cerrados = TurnoCaja.objects.filter(
            usuario__username="cajero_demo", estado="CERRADO"
        )
        turnos_abiertos = TurnoCaja.objects.filter(
            usuario__username="cajero_demo", estado="ABIERTO"
        )
        assert TurnoCaja.objects.count() == 3
        assert turnos_cerrados.count() == 2
        assert turnos_abiertos.count() == 1
        assert all(t.movimientos.exists() for t in turnos_cerrados)
        assert turnos_abiertos.first().movimientos.exists()

        turno_1 = (
            turnos_cerrados.filter(movimientos__motivo="Fondo de cambio inicial - Turno mañana")
            .distinct()
            .get()
        )
        turno_2 = (
            turnos_cerrados.filter(movimientos__motivo="Refuerzo de efectivo para fin de semana")
            .distinct()
            .get()
        )
        assert turno_1.efectivo_esperado == turno_1.calcular_efectivo_esperado()
        assert turno_1.diferencia == Decimal("0.00")
        assert turno_2.efectivo_esperado == turno_2.calcular_efectivo_esperado()
        assert turno_2.diferencia == Decimal("-200.00")

        assert Venta.objects.filter(estado="EMITIDA").count() == 20
        assert Venta.objects.filter(estado="ANULADA").count() == 1
        assert Venta.objects.count() == 21
        assert not Venta.objects.filter(medio_pago="EFECTIVO", turno_caja__isnull=True).exists()

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

    @override_settings(DEBUG=True)
    def test_seed_demo_video_falla_si_hay_turno_abierto_viejo_de_cajero_demo(self, monkeypatch):
        """
        Si cajero_demo tiene un turno ABIERTO de un día anterior, --video debe frenar
        inmediatamente con CommandError sin crear turnos superpuestos.
        """
        monkeypatch.delenv("SEED_DEMO_PASSWORD", raising=False)
        cajero = User.objects.create_user(username="cajero_demo", password="x")
        turno_viejo = TurnoCaja.objects.create(
            usuario=cajero,
            efectivo_inicial=Decimal("5000.00"),
            apertura=timezone.now() - timedelta(days=3),
            estado="ABIERTO",
        )

        with pytest.raises(CommandError, match="turno abierto viejo"):
            call_command("seed_demo", video=True)

        turnos_abiertos = TurnoCaja.objects.filter(usuario=cajero, estado="ABIERTO")
        assert turnos_abiertos.count() == 1
        assert turnos_abiertos.first().id == turno_viejo.id
        assert TurnoCaja.objects.filter(usuario=cajero, estado="CERRADO").count() == 0

    @override_settings(DEBUG=True)
    def test_seed_demo_video_reacomoda_fechas_al_correr_cinco_dias_despues(self, monkeypatch):
        """
        Al correr seed_demo --video un día, cerrar ese turno abierto de ensayo y volver a
        correrlo 5 días después, no duplica productos ni ventas, reacomoda todas las fechas
        relativas al nuevo día y vincula las ventas de hoy y la anulada al nuevo turno abierto.
        """
        from apps.insumos.management.commands.seed_demo import _uuid_seed_video

        monkeypatch.delenv("SEED_DEMO_PASSWORD", raising=False)
        tz_actual = timezone.get_current_timezone()
        dia_1 = timezone.make_aware(datetime(2026, 11, 19, 14, 0, 0), tz_actual)
        dia_2 = dia_1 + timedelta(days=5)
        fecha_simulada = {"actual": dia_1}

        monkeypatch.setattr(timezone, "now", lambda: fecha_simulada["actual"])

        call_command("seed_demo", video=True)

        conteos_base = (
            Producto.objects.count(),
            Insumo.objects.count(),
            Compra.objects.count(),
            Venta.objects.filter(estado="EMITIDA").count(),
            Venta.objects.filter(estado="ANULADA").count(),
            VentaItem.objects.count(),
        )
        assert conteos_base[0] == 11
        assert conteos_base[3] == 20
        assert conteos_base[4] == 1

        # Se cierra el turno abierto del ensayo del día 1 con su arqueo completo antes de volver a correr el día 6
        cajero = User.objects.get(username="cajero_demo")
        turno_ensayo = TurnoCaja.objects.get(usuario=cajero, estado="ABIERTO")
        esperado_ensayo = turno_ensayo.calcular_efectivo_esperado()
        turno_ensayo.efectivo_esperado = esperado_ensayo
        turno_ensayo.efectivo_contado = esperado_ensayo
        turno_ensayo.diferencia = Decimal("0.00")
        turno_ensayo.estado = "CERRADO"
        turno_ensayo.cierre = dia_1 + timedelta(hours=2)
        turno_ensayo.save(
            update_fields=[
                "efectivo_esperado",
                "efectivo_contado",
                "diferencia",
                "estado",
                "cierre",
            ]
        )

        fecha_simulada["actual"] = dia_2
        call_command("seed_demo", video=True)

        assert (
            Producto.objects.count(),
            Insumo.objects.count(),
            Compra.objects.count(),
            Venta.objects.filter(estado="EMITIDA").count(),
            Venta.objects.filter(estado="ANULADA").count(),
            VentaItem.objects.count(),
        ) == conteos_base
        assert not Venta.objects.filter(medio_pago="EFECTIVO", turno_caja__isnull=True).exists()

        turnos_abiertos = TurnoCaja.objects.filter(usuario=cajero, estado="ABIERTO")
        assert turnos_abiertos.count() == 1
        turno_hoy = turnos_abiertos.first()
        assert turno_hoy.id != turno_ensayo.id
        assert timezone.localtime(turno_hoy.apertura).date() == dia_2.date()
        assert turno_hoy.movimientos.count() == 3
        assert all(
            timezone.localtime(m.fecha).date() == dia_2.date() for m in turno_hoy.movimientos.all()
        )
        assert turno_hoy.efectivo_esperado == turno_hoy.calcular_efectivo_esperado()

        # Los 2 turnos cerrados demo no se duplican (quedan los 2 demo + 1 de ensayo cerrado)
        assert TurnoCaja.objects.filter(usuario=cajero, estado="CERRADO").count() == 3
        turno_demo_1 = (
            TurnoCaja.objects.filter(
                usuario=cajero,
                estado="CERRADO",
                movimientos__motivo="Fondo de cambio inicial - Turno mañana",
            )
            .distinct()
            .get()
        )
        turno_demo_2 = (
            TurnoCaja.objects.filter(
                usuario=cajero,
                estado="CERRADO",
                movimientos__motivo="Refuerzo de efectivo para fin de semana",
            )
            .distinct()
            .get()
        )
        assert (
            timezone.localtime(turno_demo_1.apertura).date() == (dia_2 - timedelta(days=11)).date()
        )
        assert timezone.localtime(turno_demo_1.cierre).date() == (dia_2 - timedelta(days=11)).date()
        assert turno_demo_1.diferencia == Decimal("0.00")
        assert turno_demo_1.efectivo_esperado == turno_demo_1.calcular_efectivo_esperado()
        assert (
            timezone.localtime(turno_demo_2.apertura).date() == (dia_2 - timedelta(days=4)).date()
        )
        assert timezone.localtime(turno_demo_2.cierre).date() == (dia_2 - timedelta(days=4)).date()
        assert turno_demo_2.diferencia == Decimal("-200.00")
        assert turno_demo_2.efectivo_esperado == turno_demo_2.calcular_efectivo_esperado()
        assert all(
            timezone.localtime(m.fecha).date() == (dia_2 - timedelta(days=4)).date()
            for m in turno_demo_2.movimientos.all()
        )

        # Las ventas que pertenecían al turno cerrado previo NO se re-vinculan al turno nuevo,
        # preservando la consistencia contable de turno_ensayo.
        turno_ensayo.refresh_from_db()
        assert turno_ensayo.efectivo_esperado == esperado_ensayo
        assert turno_ensayo.efectivo_esperado == turno_ensayo.calcular_efectivo_esperado()
        assert (
            turno_ensayo.diferencia
            == turno_ensayo.efectivo_contado - turno_ensayo.efectivo_esperado
        )
        for clave_hoy in ("hoy-v1", "hoy-v2", "hoy-v3", "hoy-anulada"):
            venta = Venta.objects.get(id_operacion=_uuid_seed_video(clave_hoy))
            assert venta.turno_caja_id == turno_ensayo.id
            assert timezone.localtime(venta.fecha).date() == dia_1.date()

        venta_anulada = Venta.objects.get(id_operacion=_uuid_seed_video("hoy-anulada"))
        assert venta_anulada.estado == "ANULADA"
        assert timezone.localtime(venta_anulada.anulada_en).date() == dia_1.date()

        # Las ventas históricas se reacomodan respecto a dia_2 para poblar "Últimos 7 días"
        inicio_hoy_2 = timezone.localtime(dia_2).replace(hour=0, minute=0, second=0, microsecond=0)
        hace_7_dias_2 = inicio_hoy_2 - timedelta(days=6)
        resumen_7d_2 = obtener_ganancia_diaria(fecha_inicio=hace_7_dias_2, fecha_fin=dia_2)
        assert resumen_7d_2["cantidad_tickets"] > 0
        assert Decimal(resumen_7d_2["ingresos_totales"]) > Decimal("0")

    @override_settings(DEBUG=True)
    def test_seed_demo_video_no_sobrescribe_productos_existentes_y_advierte_margen_brownie(
        self, monkeypatch
    ):
        """
        Si un producto del escenario --video ya existía en la base, no sobrescribe su precio_venta
        ni codigo_barras; si el Brownie queda con margen >= 30%, emite advertencia por stdout.
        """
        monkeypatch.delenv("SEED_DEMO_PASSWORD", raising=False)
        latte_previo = Producto.objects.create(
            nombre="Café Latte",
            codigo_barras="7799999000001",
            precio_venta=Decimal("5100.00"),
            estado_activo=True,
        )
        brownie_previo = Producto.objects.create(
            nombre="Brownie Intenso Chocolate 70%",
            codigo_barras="7799999000002",
            precio_venta=Decimal("9000.00"),
            minutos_mano_obra=Decimal("3.00"),
            costo_hora_mano_obra=Decimal("2500.00"),
            descartables=Decimal("45.00"),
            estado_activo=True,
        )

        salida = StringIO()
        call_command("seed_demo", video=True, stdout=salida)

        latte_previo.refresh_from_db()
        brownie_previo.refresh_from_db()
        assert latte_previo.precio_venta == Decimal("5100.00")
        assert latte_previo.codigo_barras == "7799999000001"
        assert brownie_previo.precio_venta == Decimal("9000.00")
        assert brownie_previo.codigo_barras == "7799999000002"
        assert brownie_previo.margen_bruto >= Decimal("0.30")
        assert "Brownie Intenso Chocolate 70%" in salida.getvalue()

    @override_settings(DEBUG=False)
    def test_seed_demo_video_bloqueado_en_produccion(self, monkeypatch):
        """Con DEBUG=False, seed_demo --video también debe bloquearse salvo autorización explícita."""
        monkeypatch.delenv("SEED_DEMO_ALLOW_PRODUCTION", raising=False)
        with pytest.raises(CommandError, match="DEBUG=False"):
            call_command("seed_demo", video=True)

    @override_settings(DEBUG=True)
    def test_seed_demo_tolera_colision_codigo_barras_con_producto_externo(self, monkeypatch):
        """Si otro producto ya usa el código de barras demo, crea el producto demo con None."""
        monkeypatch.delenv("SEED_DEMO_PASSWORD", raising=False)
        externo = Producto.objects.create(
            nombre="Producto Externo Preexistente",
            codigo_barras="7790001000011",
            precio_venta=Decimal("1500.00"),
            estado_activo=True,
        )

        call_command("seed_demo")

        externo.refresh_from_db()
        espresso = Producto.objects.get(nombre="Café Espresso")
        assert externo.codigo_barras == "7790001000011"
        assert espresso.codigo_barras is None

    @override_settings(DEBUG=True)
    def test_seed_demo_video_reactiva_producto_preexistente_inactivo(self, monkeypatch):
        """Un producto demo preexistente con estado_activo=False se reactiva para no romper ventas."""
        monkeypatch.delenv("SEED_DEMO_PASSWORD", raising=False)
        espresso_inactivo = Producto.objects.create(
            nombre="Café Espresso",
            codigo_barras="7790001000011",
            precio_venta=Decimal("2200.00"),
            estado_activo=False,
        )

        call_command("seed_demo", video=True)

        espresso_inactivo.refresh_from_db()
        assert espresso_inactivo.estado_activo is True
        assert Venta.objects.filter(estado="EMITIDA").count() == 20

    @override_settings(DEBUG=True)
    def test_seed_demo_actualiza_unidad_base_de_insumo_sin_compras_aunque_coincida_costo(
        self, monkeypatch
    ):
        """Si un insumo sin compras coincide en costo_unitario pero no en unidad_base, la corrige."""
        monkeypatch.delenv("SEED_DEMO_PASSWORD", raising=False)
        insumo = Insumo.objects.create(
            nombre="Café Especialidad Colombia",
            unidad_base="un",
            costo_unitario=Decimal("28.0000"),
            estado_activo=False,
        )

        call_command("seed_demo")

        insumo.refresh_from_db()
        assert insumo.unidad_base == "g"
        assert insumo.estado_activo is True
