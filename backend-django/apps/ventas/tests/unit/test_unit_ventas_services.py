"""Tests unitarios para ventas y congelamiento de snapshots de costo."""

import logging
import uuid
from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError

from apps.caja.models import TurnoCaja
from apps.recetas.models import Producto
from apps.ventas.models import Venta
from apps.ventas.services import registrar_venta


@pytest.mark.django_db
class TestVentasServices:
    def test_registro_venta_con_snapshot_de_costo_congelado(self):
        """
        CA4.2: Dado un ítem vendido, cuando se registra la venta, entonces
        se guarda el costo vigente en ese momento y un cambio posterior de precios
        o costos no altera el registro histórico.
        """
        turno = TurnoCaja.objects.create(efectivo_inicial=Decimal("5000.00"))

        producto = Producto.objects.create(
            nombre="Espresso Doble",
            precio_venta=Decimal("2500.00"),
            costo_total_calculado=Decimal("1100.0000"),
        )

        items_data = [
            {
                "producto_id": producto.id,
                "cantidad": Decimal("2"),
                "precio_unitario": Decimal("2500.00"),
            }
        ]

        venta = registrar_venta(
            items_data=items_data,
            medio_pago="EFECTIVO",
            turno_caja=turno,
        )

        assert venta.total == Decimal("5000.00")
        assert venta.costo_total_snapshot == Decimal("2200.0000")

        item = venta.items.first()
        assert item.costo_unitario_snapshot == Decimal("1100.0000")

        # Modificamos el costo del producto a posteriori
        producto.costo_total_calculado = Decimal("1800.0000")
        producto.save()

        # El snapshot de la venta permanece inalterado
        item.refresh_from_db()
        assert item.costo_unitario_snapshot == Decimal("1100.0000")

    def test_error_venta_sin_items(self):
        with pytest.raises(ValueError, match="al menos un producto"):
            registrar_venta(items_data=[])

    def test_venta_usa_precio_producto_si_precio_unitario_es_cero_o_none(self):
        """Si precio_unitario llega en 0 o None, debe tomar producto.precio_venta."""
        turno = TurnoCaja.objects.create(efectivo_inicial=Decimal("5000.00"))
        producto = Producto.objects.create(
            nombre="Flat White",
            precio_venta=Decimal("3800.00"),
            costo_total_calculado=Decimal("1200.0000"),
        )

        venta = registrar_venta(
            items_data=[
                {"producto_id": producto.id, "cantidad": Decimal("1"), "precio_unitario": "0.00"},
                {"producto_id": producto.id, "cantidad": Decimal("2"), "precio_unitario": None},
            ],
            medio_pago="EFECTIVO",
            turno_caja=turno,
        )

        assert venta.total == Decimal("11400.00")
        precios = [item.precio_unitario for item in venta.items.all()]
        assert precios == [Decimal("3800.00"), Decimal("3800.00")]

    def test_venta_serializer_normaliza_origen_local_y_caja_a_propio(self):
        """El alias de origen 'local' o 'caja' debe normalizarse antes de ChoiceField."""
        from apps.ventas.serializers import VentaSerializer

        producto = Producto.objects.create(
            nombre="Cortado",
            precio_venta=Decimal("2200.00"),
            costo_total_calculado=Decimal("700.0000"),
        )
        for alias in ("local", "caja", "propio"):
            ser = VentaSerializer(
                data={
                    "origen": alias,
                    "medio_pago": "EFECTIVO",
                    "items": [{"producto": producto.id, "cantidad": "1"}],
                }
            )
            assert ser.is_valid(), ser.errors
            assert ser.validated_data["origen"] == "propio"

    def test_venta_ignora_precio_unitario_manipulado_menor_y_mayor_que_bd(self, caplog):
        """Siempre se cobra producto.precio_venta ignorando precios manipulados del cliente."""
        turno = TurnoCaja.objects.create(efectivo_inicial=Decimal("5000.00"))
        producto = Producto.objects.create(
            nombre="Latte Vainilla",
            precio_venta=Decimal("3200.00"),
            costo_total_calculado=Decimal("1000.0000"),
        )

        with caplog.at_level(logging.WARNING, logger="apps.ventas.services"):
            venta = registrar_venta(
                items_data=[
                    {
                        "producto_id": producto.id,
                        "cantidad": Decimal("1"),
                        "precio_unitario": Decimal("10.00"),
                    },
                    {
                        "producto_id": producto.id,
                        "cantidad": Decimal("2"),
                        "precio_unitario": Decimal("9900.00"),
                    },
                ],
                medio_pago="EFECTIVO",
                turno_caja=turno,
            )

        assert venta.total == Decimal("9600.00")
        precios = [item.precio_unitario for item in venta.items.all()]
        assert precios == [Decimal("3200.00"), Decimal("3200.00")]

        warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
        assert len(warnings) == 2
        assert warnings[0].producto_id == producto.id
        assert warnings[0].producto_nombre == "Latte Vainilla"
        assert warnings[0].origen == "propio"
        assert warnings[0].precio_cliente == "10.00"
        assert warnings[0].precio_bd == "3200.00"
        assert warnings[0].diferencia == "3190.00"
        assert warnings[1].precio_cliente == "9900.00"
        assert warnings[1].diferencia == "-6700.00"

    def test_venta_offline_sincronizada_tras_cambio_precio_no_se_rechaza_y_loguea(self, caplog):
        """
        Caso 1: una venta con origen='offline' y precio anterior al cambio en BD
        se registra con producto.precio_venta sin rechazarse y emite log auditable.
        """
        turno = TurnoCaja.objects.create(efectivo_inicial=Decimal("5000.00"))
        producto = Producto.objects.create(
            nombre="Medialuna Manteca",
            precio_venta=Decimal("2000.00"),
            costo_total_calculado=Decimal("600.0000"),
        )
        # Cambio de precio posterior mientras el POS estuvo sin conexión
        producto.precio_venta = Decimal("2500.00")
        producto.save(update_fields=["precio_venta"])

        with caplog.at_level(logging.WARNING, logger="apps.ventas.services"):
            venta = registrar_venta(
                items_data=[
                    {
                        "producto_id": producto.id,
                        "cantidad": Decimal("2"),
                        "precio_unitario": Decimal("2000.00"),
                    }
                ],
                medio_pago="EFECTIVO",
                origen="offline",
                turno_caja=turno,
            )

        assert venta.origen == "offline"
        assert venta.total == Decimal("5000.00")
        item = venta.items.get()
        assert item.precio_unitario == Decimal("2500.00")

        warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
        assert len(warnings) == 1
        rec = warnings[0]
        assert rec.producto_id == producto.id
        assert rec.producto_nombre == "Medialuna Manteca"
        assert rec.origen == "offline"
        assert rec.precio_cliente == "2000.00"
        assert rec.precio_bd == "2500.00"
        assert rec.diferencia == "500.00"
        assert "origen=offline" in rec.getMessage()
        assert "diferencia=500.00" in rec.getMessage()

    def test_venta_con_mismo_precio_bd_no_emite_warning(self, caplog):
        """Si precio_unitario coincide con producto.precio_venta, no se registra diferencia."""
        producto = Producto.objects.create(
            nombre="Americano",
            precio_venta=Decimal("2100.00"),
            costo_total_calculado=Decimal("500.0000"),
        )

        with caplog.at_level(logging.WARNING, logger="apps.ventas.services"):
            venta = registrar_venta(
                items_data=[
                    {
                        "producto_id": producto.id,
                        "cantidad": Decimal("1"),
                        "precio_unitario": Decimal("2100.00"),
                    }
                ],
                medio_pago="EFECTIVO",
            )

        assert venta.total == Decimal("2100.00")
        assert [r for r in caplog.records if r.levelno == logging.WARNING] == []

    def test_registrar_venta_idempotente_por_id_operacion(self):
        """Dos invocaciones con el mismo id_operacion devuelven la misma venta sin duplicar."""
        turno = TurnoCaja.objects.create(efectivo_inicial=Decimal("5000.00"))
        producto = Producto.objects.create(
            nombre="Espresso Idempotente",
            precio_venta=Decimal("2400.00"),
            costo_total_calculado=Decimal("700.0000"),
        )
        op_id = uuid.uuid4()

        venta_1 = registrar_venta(
            items_data=[{"producto_id": producto.id, "cantidad": Decimal("2")}],
            medio_pago="EFECTIVO",
            origen="offline",
            turno_caja=turno,
            id_operacion=op_id,
        )
        venta_2 = registrar_venta(
            items_data=[{"producto_id": producto.id, "cantidad": Decimal("2")}],
            medio_pago="EFECTIVO",
            origen="offline",
            turno_caja=turno,
            id_operacion=str(op_id),
        )

        assert venta_1.id == venta_2.id
        assert Venta.objects.filter(id_operacion=op_id).count() == 1
        assert venta_1.items.count() == 1

    def test_registrar_venta_rechaza_precio_bd_cero_o_negativo(self):
        """Nunca permite ventas cuando producto.precio_venta en BD es <= 0."""
        turno = TurnoCaja.objects.create(efectivo_inicial=Decimal("5000.00"))
        producto_gratis = Producto.objects.create(
            nombre="Producto Precio Cero",
            precio_venta=Decimal("0.00"),
            costo_total_calculado=Decimal("300.0000"),
        )

        with pytest.raises(ValidationError):
            registrar_venta(
                items_data=[{"producto_id": producto_gratis.id, "cantidad": Decimal("1")}],
                medio_pago="EFECTIVO",
                turno_caja=turno,
            )

        assert Venta.objects.count() == 0

    def test_registrar_venta_rechaza_producto_inexistente_o_inactivo(self):
        """Producto inactivo o inexistente lanza ValidationError y no crea venta."""
        turno = TurnoCaja.objects.create(efectivo_inicial=Decimal("5000.00"))
        inactivo = Producto.objects.create(
            nombre="Producto Inactivo",
            precio_venta=Decimal("1800.00"),
            costo_total_calculado=Decimal("500.0000"),
            estado_activo=False,
        )

        with pytest.raises(ValidationError):
            registrar_venta(
                items_data=[{"producto_id": inactivo.id, "cantidad": Decimal("1")}],
                turno_caja=turno,
            )

        with pytest.raises(ValidationError):
            registrar_venta(
                items_data=[{"producto_id": 999999, "cantidad": Decimal("1")}],
                turno_caja=turno,
            )

        assert Venta.objects.count() == 0

    def test_registrar_venta_rechaza_turno_cerrado(self):
        """No permite registrar venta sobre un turno en estado CERRADO."""
        turno_cerrado = TurnoCaja.objects.create(
            efectivo_inicial=Decimal("5000.00"),
            estado="CERRADO",
        )
        producto = Producto.objects.create(
            nombre="Cortado Turno Cerrado",
            precio_venta=Decimal("2200.00"),
            costo_total_calculado=Decimal("600.0000"),
        )

        with pytest.raises(ValidationError):
            registrar_venta(
                items_data=[{"producto_id": producto.id, "cantidad": Decimal("1")}],
                turno_caja=turno_cerrado,
            )

        assert Venta.objects.count() == 0
