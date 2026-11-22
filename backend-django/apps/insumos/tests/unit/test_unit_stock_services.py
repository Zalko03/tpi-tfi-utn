"""Tests unitarios para gestión de stock real, compras y ajustes manuales (HU12)."""

import json
import urllib.error
import urllib.request
from decimal import Decimal

import pytest
from django.test import override_settings

from apps.insumos.models import Insumo, MovimientoStock, Proveedor
from apps.insumos.services import (
    ajustar_stock_insumo,
    listar_insumos_stock_bajo,
    listar_movimientos_stock_reales,
    registrar_compra_y_actualizar_costo,
    registrar_lote_compras_importacion,
)
from apps.usuarios.constantes import ROL_DUENIO
from apps.usuarios.services import crear_personal


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
class TestUnitStockInsumos:
    @pytest.fixture
    def duenio(self):
        return crear_personal(
            datos_usuario={"username": "duenio_stock_unit", "password": "password123"},
            rol=ROL_DUENIO,
        )

    @pytest.fixture
    def proveedor(self):
        return Proveedor.objects.create(nombre="Mayorista Stock")

    def test_compra_individual_y_por_lote_suman_stock_en_unidad_base(self, proveedor):
        """Las compras individuales y de importación suman stock convertido a unidad base."""
        cafe = Insumo.objects.create(
            nombre="Café Grano Stock",
            unidad_base="g",
            stock_minimo=Decimal("300.0000"),
        )
        leche = Insumo.objects.create(
            nombre="Leche Entera Stock",
            unidad_base="ml",
            stock_minimo=Decimal("2000.0000"),
        )

        # Compra individual: 1.5 kg -> +1500.0000 g
        compra = registrar_compra_y_actualizar_costo(
            proveedor=proveedor,
            insumo=cafe,
            precio_total=Decimal("30000.00"),
            cantidad=Decimal("1.5"),
            unidad="kg",
        )
        cafe.refresh_from_db()
        assert cafe.stock_actual == Decimal("1500.0000")

        mov_compra = MovimientoStock.objects.get(compra=compra)
        assert mov_compra.tipo == "INGRESO"
        assert mov_compra.subtipo == "COMPRA"
        assert mov_compra.cantidad_base == Decimal("1500.0000")
        assert mov_compra.stock_anterior == Decimal("0.0000")
        assert mov_compra.stock_posterior == Decimal("1500.0000")

        # Compra por lote de importación: +0.5 kg café (+500g) y +3 l leche (+3000ml)
        res_lote = registrar_lote_compras_importacion(
            proveedor_id=proveedor.id,
            items=[
                {
                    "insumo_id": cafe.id,
                    "cantidad": "0.5",
                    "unidad": "kg",
                    "precio_total": "11000.00",
                },
                {
                    "insumo_id": leche.id,
                    "cantidad": "3",
                    "unidad": "l",
                    "precio_total": "4500.00",
                },
            ],
        )
        cafe.refresh_from_db()
        leche.refresh_from_db()
        assert cafe.stock_actual == Decimal("2000.0000")
        assert leche.stock_actual == Decimal("3000.0000")
        assert res_lote["compras_creadas"][0]["stock_actual"] == "2000.0000"
        assert res_lote["compras_creadas"][1]["stock_actual"] == "3000.0000"

    def test_listar_movimientos_stock_topea_el_limite_en_500(self):
        """Un límite enorme en la consulta no devuelve más de 500 movimientos."""
        insumo = Insumo.objects.create(nombre="Harina Tope", unidad_base="g")
        MovimientoStock.objects.bulk_create(
            MovimientoStock(
                insumo=insumo,
                tipo="INGRESO",
                subtipo="AJUSTE_MANUAL",
                cantidad_base=Decimal("1.0000"),
                stock_anterior=Decimal("0.0000"),
                stock_posterior=Decimal("1.0000"),
            )
            for _ in range(501)
        )
        assert len(listar_movimientos_stock_reales(limite=100000)) == 500
        assert len(listar_movimientos_stock_reales(limite=3)) == 3

    @override_settings(
        NODE_BASE_URL="http://127.0.0.1:3000",
        EVENTOS_INTERNOS_CLAVE="clave-stock-unit",
    )
    def test_ajuste_manual_ingreso_egreso_y_alerta_stock_bajo(self, monkeypatch, duenio):
        """El ajuste manual actualiza stock, registra auditoría y notifica stock.bajo al caer bajo mínimo."""
        peticiones = []

        def fake_urlopen(req, timeout=None):
            peticiones.append(json.loads(req.data.decode("utf-8")))
            return _RespuestaHttpMock(202)

        monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

        azucar = Insumo.objects.create(
            nombre="Azúcar Mascabo Stock",
            unidad_base="g",
            stock_actual=Decimal("0.0000"),
            stock_minimo=Decimal("500.0000"),
        )

        # Ingreso de 1 kg -> 1000 g (no emite alerta)
        res_in = ajustar_stock_insumo(
            insumo_id=azucar.id,
            tipo="INGRESO",
            cantidad=Decimal("1"),
            unidad="kg",
            motivo="Inventario inicial",
            usuario=duenio,
        )
        assert res_in["insumo"].stock_actual == Decimal("1000.0000")
        assert res_in["alerta_stock_bajo"] is False
        assert peticiones == []

        # Egreso de 600 g -> queda 400 g (< mínimo 500 g) -> emite stock.bajo
        res_out = ajustar_stock_insumo(
            insumo_id=azucar.id,
            tipo="EGRESO",
            cantidad=Decimal("600"),
            unidad="g",
            motivo="Merma por humedad",
            usuario=duenio,
        )
        assert res_out["insumo"].stock_actual == Decimal("400.0000")
        assert res_out["alerta_stock_bajo"] is True
        assert len(peticiones) == 1
        assert peticiones[0]["evento"] == "stock.bajo"
        assert peticiones[0]["datos"] == {
            "insumoId": azucar.id,
            "nombre": "Azúcar Mascabo Stock",
            "stockActual": "400.0000",
            "stockMinimo": "500.0000",
            "unidadBase": "g",
        }
        assert list(listar_insumos_stock_bajo()) == [azucar]

    def test_ajuste_manual_rechaza_cantidad_invalida_o_unidad_incompatible(self, duenio):
        vaso = Insumo.objects.create(nombre="Vaso Stock", unidad_base="un")

        with pytest.raises(ValueError, match="mayor a cero"):
            ajustar_stock_insumo(vaso.id, "INGRESO", Decimal("0"), usuario=duenio)

        with pytest.raises(ValueError, match="No se puede convertir"):
            ajustar_stock_insumo(vaso.id, "INGRESO", Decimal("2"), unidad="kg", usuario=duenio)

    @override_settings(
        NODE_BASE_URL="http://127.0.0.1:3000",
        EVENTOS_INTERNOS_CLAVE="clave-stock-unit",
    )
    def test_ajuste_egreso_guarda_igual_si_node_no_responde(self, monkeypatch, duenio):
        def fake_falla(*_args, **_kwargs):
            raise urllib.error.URLError("Connection refused")

        monkeypatch.setattr(urllib.request, "urlopen", fake_falla)

        cafe = Insumo.objects.create(
            nombre="Café Tolerante Node",
            unidad_base="g",
            stock_actual=Decimal("200.0000"),
            stock_minimo=Decimal("300.0000"),
        )
        res = ajustar_stock_insumo(cafe.id, "EGRESO", Decimal("50"), usuario=duenio)
        cafe.refresh_from_db()
        assert res["alerta_stock_bajo"] is True
        assert cafe.stock_actual == Decimal("150.0000")
