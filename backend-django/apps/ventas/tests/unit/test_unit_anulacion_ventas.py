"""Pruebas unitarias para la anulación de ventas (anular_venta)."""

from decimal import Decimal

import pytest
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.caja.models import TurnoCaja
from apps.recetas.models import Producto
from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO, ROL_ENCARGADO
from apps.usuarios.services import crear_personal
from apps.ventas.models import Venta
from apps.ventas.services import anular_venta, registrar_venta


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
