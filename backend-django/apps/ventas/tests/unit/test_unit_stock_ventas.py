"""Tests unitarios para descuento de stock por receta al vender, devolución al anular y alertas (HU12)."""

import json
import urllib.error
import urllib.request
import uuid
from decimal import Decimal

import pytest
from django.test import override_settings

from apps.caja.models import TurnoCaja
from apps.insumos.models import Insumo, MovimientoStock
from apps.recetas.models import Producto, RecetaItem
from apps.usuarios.constantes import ROL_CAJERO, ROL_ENCARGADO
from apps.usuarios.services import crear_personal
from apps.ventas.services import anular_venta, registrar_venta


class _RespuestaHttpMock:
    def __init__(self, status_code=202):
        self.status = status_code

    def getcode(self):
        return self.status

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


@pytest.mark.django_db
class TestUnitStockVentas:
    @pytest.fixture
    def cajero(self):
        return crear_personal(
            datos_usuario={"username": "cajero_stock_v", "password": "password123"},
            rol=ROL_CAJERO,
        )

    @pytest.fixture
    def encargado(self):
        return crear_personal(
            datos_usuario={"username": "encargado_stock_v", "password": "password123"},
            rol=ROL_ENCARGADO,
        )

    @pytest.fixture
    def escenario_recetas(self):
        cafe = Insumo.objects.create(
            nombre="Café Molido Venta Stock",
            unidad_base="g",
            costo_unitario=Decimal("30.0000"),
            stock_actual=Decimal("500.0000"),
            stock_minimo=Decimal("450.0000"),
        )
        leche = Insumo.objects.create(
            nombre="Leche Barista Venta Stock",
            unidad_base="ml",
            costo_unitario=Decimal("2.0000"),
            stock_actual=Decimal("2000.0000"),
            stock_minimo=Decimal("500.0000"),
        )
        latte = Producto.objects.create(
            nombre="Latte Stock Test",
            precio_venta=Decimal("3800.00"),
            costo_total_calculado=Decimal("940.0000"),
            estado_activo=True,
        )
        # Receta en kg y litros para validar conversión a unidad base al descontar (CA12.1)
        RecetaItem.objects.create(
            producto=latte, insumo=cafe, cantidad=Decimal("0.0200"), unidad="kg"
        )
        RecetaItem.objects.create(
            producto=latte, insumo=leche, cantidad=Decimal("0.2000"), unidad="l"
        )
        espresso = Producto.objects.create(
            nombre="Espresso Stock Test",
            precio_venta=Decimal("2200.00"),
            costo_total_calculado=Decimal("540.0000"),
            estado_activo=True,
        )
        RecetaItem.objects.create(
            producto=espresso, insumo=cafe, cantidad=Decimal("18.0000"), unidad="g"
        )
        return {"cafe": cafe, "leche": leche, "latte": latte, "espresso": espresso}

    @override_settings(
        NODE_BASE_URL="http://127.0.0.1:3000",
        EVENTOS_INTERNOS_CLAVE="clave-stock-ventas",
    )
    def test_venta_descuenta_stock_en_unidad_base_y_emite_alerta_minimo(
        self, monkeypatch, cajero, escenario_recetas
    ):
        """
        CA12.1 y CA12.2: vender 2 Lattes + 1 Espresso descuenta 58g de café y 400ml de leche.
        Como café baja a 442g (< mínimo 450g), emite 'stock.bajo' solo para café.
        """
        peticiones = []

        def fake_urlopen(req, timeout=None):
            peticiones.append(json.loads(req.data.decode("utf-8")))
            return _RespuestaHttpMock(202)

        monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("5000.00"))
        cafe = escenario_recetas["cafe"]
        leche = escenario_recetas["leche"]
        latte = escenario_recetas["latte"]
        espresso = escenario_recetas["espresso"]

        venta = registrar_venta(
            items_data=[
                {"producto_id": latte.id, "cantidad": Decimal("2")},
                {"producto_id": espresso.id, "cantidad": Decimal("1")},
            ],
            medio_pago="EFECTIVO",
            turno_caja=turno,
        )

        cafe.refresh_from_db()
        leche.refresh_from_db()
        # 500 - (2*20 + 18) = 442 g; 2000 - (2*200) = 1600 ml
        assert cafe.stock_actual == Decimal("442.0000")
        assert leche.stock_actual == Decimal("1600.0000")

        mov_cafe = MovimientoStock.objects.get(venta=venta, insumo=cafe, subtipo="VENTA_RECETA")
        assert mov_cafe.tipo == "EGRESO"
        assert mov_cafe.cantidad_base == Decimal("58.0000")
        assert mov_cafe.stock_anterior == Decimal("500.0000")
        assert mov_cafe.stock_posterior == Decimal("442.0000")

        mov_leche = MovimientoStock.objects.get(venta=venta, insumo=leche, subtipo="VENTA_RECETA")
        assert mov_leche.cantidad_base == Decimal("400.0000")

        eventos = [p["evento"] for p in peticiones]
        assert eventos == ["venta.registrada", "stock.bajo"]
        alerta_stock = peticiones[1]["datos"]
        assert alerta_stock == {
            "insumoId": cafe.id,
            "nombre": cafe.nombre,
            "stockActual": "442.0000",
            "stockMinimo": "450.0000",
            "unidadBase": "g",
        }

    def test_reintento_idempotente_no_descuenta_stock_dos_veces(self, cajero, escenario_recetas):
        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("5000.00"))
        cafe = escenario_recetas["cafe"]
        latte = escenario_recetas["latte"]
        op_id = uuid.uuid4()

        v1 = registrar_venta(
            items_data=[{"producto_id": latte.id, "cantidad": Decimal("1")}],
            turno_caja=turno,
            id_operacion=op_id,
        )
        v2 = registrar_venta(
            items_data=[{"producto_id": latte.id, "cantidad": Decimal("1")}],
            turno_caja=turno,
            id_operacion=op_id,
        )

        assert v1.id == v2.id
        cafe.refresh_from_db()
        assert cafe.stock_actual == Decimal("480.0000")
        assert MovimientoStock.objects.filter(venta=v1, subtipo="VENTA_RECETA").count() == 2

    def test_anulacion_devuelve_stock_descontado_incluso_si_cambia_receta(
        self, cajero, encargado, escenario_recetas
    ):
        """Al anular la venta, devuelve exactamente lo descontado originalmente."""
        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("5000.00"))
        cafe = escenario_recetas["cafe"]
        leche = escenario_recetas["leche"]
        latte = escenario_recetas["latte"]

        venta = registrar_venta(
            items_data=[{"producto_id": latte.id, "cantidad": Decimal("3")}],
            turno_caja=turno,
        )
        cafe.refresh_from_db()
        leche.refresh_from_db()
        assert cafe.stock_actual == Decimal("440.0000")
        assert leche.stock_actual == Decimal("1400.0000")

        # Cambiamos la receta después de vender
        RecetaItem.objects.filter(producto=latte, insumo=cafe).update(
            cantidad=Decimal("5.0000"), unidad="g"
        )

        anular_venta(venta, encargado, motivo="Cliente canceló")

        cafe.refresh_from_db()
        leche.refresh_from_db()
        assert cafe.stock_actual == Decimal("500.0000")
        assert leche.stock_actual == Decimal("2000.0000")

        dev_cafe = MovimientoStock.objects.get(venta=venta, insumo=cafe, subtipo="ANULACION_VENTA")
        assert dev_cafe.tipo == "INGRESO"
        assert dev_cafe.cantidad_base == Decimal("60.0000")
        assert dev_cafe.stock_anterior == Decimal("440.0000")
        assert dev_cafe.stock_posterior == Decimal("500.0000")

    @override_settings(
        NODE_BASE_URL="http://127.0.0.1:3000",
        EVENTOS_INTERNOS_CLAVE="clave-stock-ventas",
    )
    def test_si_node_falla_descuento_de_stock_igual_se_persiste(
        self, monkeypatch, cajero, escenario_recetas
    ):
        monkeypatch.setattr(
            urllib.request,
            "urlopen",
            lambda *_a, **_kw: (_ for _ in ()).throw(urllib.error.URLError("Node caído")),
        )
        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("2000.00"))
        cafe = escenario_recetas["cafe"]
        latte = escenario_recetas["latte"]

        registrar_venta(
            items_data=[{"producto_id": latte.id, "cantidad": Decimal("3")}],
            turno_caja=turno,
        )
        cafe.refresh_from_db()
        assert cafe.stock_actual == Decimal("440.0000")
