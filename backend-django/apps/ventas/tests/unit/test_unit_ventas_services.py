"""Tests unitarios para ventas y congelamiento de snapshots de costo."""

from decimal import Decimal
import pytest
from apps.caja.models import TurnoCaja
from apps.recetas.models import Producto
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
