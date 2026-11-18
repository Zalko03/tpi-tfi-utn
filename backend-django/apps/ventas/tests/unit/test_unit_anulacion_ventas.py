"""Pruebas unitarias para la anulación de ventas (anular_venta)."""

from decimal import Decimal

import pytest
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.caja.models import TurnoCaja
from apps.insumos.models import Insumo
from apps.insumos.services import obtener_movimientos_stock_trazabilidad
from apps.recetas.models import Producto, RecetaItem
from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO, ROL_ENCARGADO
from apps.usuarios.services import crear_personal
from apps.ventas.models import Venta
from apps.ventas.services import (
    anular_venta,
    calcular_punto_equilibrio_y_metas,
    obtener_ganancia_diaria,
    obtener_ranking_productos,
    obtener_reporte_ventas_por_producto,
    registrar_venta,
)


@pytest.mark.django_db
class TestUnitAnularVenta:
    @pytest.fixture
    def duenio(self):
        return crear_personal(
            datos_usuario={"username": "duenio_unit_anul", "password": "password123"},
            rol=ROL_DUENIO,
        )

    @pytest.fixture
    def encargado(self):
        return crear_personal(
            datos_usuario={"username": "encargado_unit_anul", "password": "password123"},
            rol=ROL_ENCARGADO,
        )

    @pytest.fixture
    def cajero(self):
        return crear_personal(
            datos_usuario={"username": "cajero_unit_anul", "password": "password123"},
            rol=ROL_CAJERO,
        )

    @pytest.fixture
    def producto(self):
        return Producto.objects.create(
            nombre="Cortado Unit",
            precio_venta=Decimal("2200.00"),
            costo_total_calculado=Decimal("700.0000"),
            estado_activo=True,
        )

    def test_anular_venta_ok_guarda_estado_usuario_fecha_y_motivo(
        self, cajero, encargado, producto
    ):
        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("1000.00"))
        venta = registrar_venta(
            items_data=[{"producto_id": producto.id, "cantidad": 2}],
            medio_pago="EFECTIVO",
            turno_caja=turno,
        )
        assert venta.estado == "EMITIDA"

        anulada = anular_venta(venta, encargado, motivo="  Error en pedido  ")

        anulada.refresh_from_db()
        assert anulada.estado == "ANULADA"
        assert anulada.anulada_por_id == encargado.id
        assert anulada.anulada_en is not None
        assert anulada.motivo_anulacion == "Error en pedido"
        assert Venta.objects.filter(pk=venta.pk).exists()

    def test_anular_venta_sin_permiso_lanza_permission_denied(self, cajero, producto):
        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("1000.00"))
        venta = registrar_venta(
            items_data=[{"producto_id": producto.id, "cantidad": 1}],
            medio_pago="EFECTIVO",
            turno_caja=turno,
        )

        with pytest.raises(PermissionDenied):
            anular_venta(venta, cajero, motivo="Intento sin permiso")

        venta.refresh_from_db()
        assert venta.estado == "EMITIDA"

    def test_anular_venta_ya_anulada_lanza_validation_error(self, duenio, producto):
        turno = TurnoCaja.objects.create(usuario=duenio, efectivo_inicial=Decimal("1000.00"))
        venta = registrar_venta(
            items_data=[{"producto_id": producto.id, "cantidad": 1}],
            medio_pago="EFECTIVO",
            turno_caja=turno,
        )
        anular_venta(venta, duenio, motivo="Primera anulación")

        with pytest.raises(ValidationError, match="ya se encuentra anulada"):
            anular_venta(venta, duenio, motivo="Segunda anulación")

    def test_anular_venta_con_turno_cerrado_lanza_validation_error(self, cajero, duenio, producto):
        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("1000.00"))
        venta = registrar_venta(
            items_data=[{"producto_id": producto.id, "cantidad": 1}],
            medio_pago="EFECTIVO",
            turno_caja=turno,
        )
        turno.estado = "CERRADO"
        turno.save(update_fields=["estado"])

        with pytest.raises(ValidationError, match="turno de caja ya está cerrado"):
            anular_venta(venta, duenio, motivo="Fuera de turno")

        venta.refresh_from_db()
        assert venta.estado == "EMITIDA"

    def test_venta_anulada_no_suma_en_caja_reportes_ni_consumo_insumos(self, duenio):
        cafe = Insumo.objects.create(
            nombre="Café Molido Anul",
            unidad_base="g",
            costo_unitario=Decimal("20.0000"),
        )
        prod_a = Producto.objects.create(
            nombre="Espresso Anul",
            precio_venta=Decimal("2000.00"),
            costo_total_calculado=Decimal("500.0000"),
            estado_activo=True,
        )
        prod_b = Producto.objects.create(
            nombre="Lungo Anul",
            precio_venta=Decimal("2500.00"),
            costo_total_calculado=Decimal("700.0000"),
            estado_activo=True,
        )
        RecetaItem.objects.create(
            producto=prod_a, insumo=cafe, cantidad=Decimal("18.0000"), unidad="g"
        )
        RecetaItem.objects.create(
            producto=prod_b, insumo=cafe, cantidad=Decimal("20.0000"), unidad="g"
        )

        turno = TurnoCaja.objects.create(usuario=duenio, efectivo_inicial=Decimal("5000.00"))
        venta_valida = registrar_venta(
            items_data=[{"producto_id": prod_a.id, "cantidad": 2}],
            medio_pago="EFECTIVO",
            turno_caja=turno,
        )
        venta_anulada = registrar_venta(
            items_data=[{"producto_id": prod_b.id, "cantidad": 4}],
            medio_pago="EFECTIVO",
            turno_caja=turno,
        )

        anular_venta(venta_anulada, duenio, motivo="Devolución")

        # 1. Caja: solo cuenta venta_valida ($4000) + inicial ($5000) = $9000
        assert turno.calcular_efectivo_esperado() == Decimal("9000.00")

        # 2. Ganancia diaria: solo 1 ticket (venta_valida)
        ganancia = obtener_ganancia_diaria()
        assert ganancia["cantidad_tickets"] == 1
        assert ganancia["unidades_vendidas"] == "2.00"
        assert ganancia["ingresos_totales"] == "4000.00"
        assert ganancia["costo_total_congelado"] == "1000.0000"
        assert ganancia["ganancia_bruta_diaria"] == "3000.0000"

        # 3. Reporte por producto y ranking: prod_b queda con 0 ventas
        reporte = obtener_reporte_ventas_por_producto()
        assert len(reporte) == 1
        assert reporte[0]["producto_id"] == prod_a.id
        assert reporte[0]["unidades_vendidas"] == "2.00"

        ranking = obtener_ranking_productos(limite=5)
        assert ranking["mas_vendidos"][0]["producto_id"] == prod_a.id
        assert ranking["menos_vendidos"][0]["producto_id"] == prod_b.id
        assert ranking["menos_vendidos"][0]["unidades_vendidas"] == "0.00"

        # 4. Punto de equilibrio usando ventas de BD: toma $4000 y costo $1000
        pe = calcular_punto_equilibrio_y_metas(costos_fijos=Decimal("750000.00"))
        assert pe["ventas_referencia"] == "4000.00"
        assert pe["costos_variables"] == "1000.00"

        # 5. Consumo de insumos (trazabilidad): solo egresos de venta_valida
        movs = obtener_movimientos_stock_trazabilidad(tipo="EGRESO")
        origen_ids = {m["origen_id"] for m in movs}
        assert venta_valida.id in origen_ids
        assert venta_anulada.id not in origen_ids
