"""Pruebas de API para anulación de ventas (POST /api/ventas/{id}/anular/)."""

from decimal import Decimal

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.caja.models import TurnoCaja
from apps.insumos.models import Insumo
from apps.recetas.models import Producto, RecetaItem
from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO, ROL_ENCARGADO
from apps.usuarios.services import crear_personal
from apps.ventas.models import Venta
from apps.ventas.services import registrar_venta


@pytest.mark.django_db
class TestApiAnulacionVentas:
    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def duenio(self):
        return crear_personal(
            datos_usuario={"username": "duenio_api_anul", "password": "password123"},
            rol=ROL_DUENIO,
        )

    @pytest.fixture
    def encargado(self):
        return crear_personal(
            datos_usuario={"username": "encargado_api_anul", "password": "password123"},
            rol=ROL_ENCARGADO,
        )

    @pytest.fixture
    def cajero(self):
        return crear_personal(
            datos_usuario={"username": "cajero_api_anul", "password": "password123"},
            rol=ROL_CAJERO,
        )

    @pytest.fixture
    def producto(self):
        return Producto.objects.create(
            nombre="Americano API",
            precio_venta=Decimal("2500.00"),
            costo_total_calculado=Decimal("800.0000"),
            estado_activo=True,
        )

    def test_api_anular_venta_ok_con_encargado(self, client, cajero, encargado, producto):
        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("2000.00"))
        venta = registrar_venta(
            items_data=[{"producto_id": producto.id, "cantidad": 2}],
            medio_pago="EFECTIVO",
            turno_caja=turno,
        )

        client.force_authenticate(user=encargado)
        resp = client.post(
            f"/api/ventas/{venta.id}/anular/",
            {"motivo": "Ticket duplicado"},
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK, resp.data
        assert resp.data["venta_id"] == venta.id
        assert resp.data["estado"] == "ANULADA"
        assert resp.data["anulada_por"] == encargado.id
        assert resp.data["motivo_anulacion"] == "Ticket duplicado"
        assert resp.data["anulada_en"] is not None

        venta.refresh_from_db()
        assert venta.estado == "ANULADA"
        assert venta.anulada_por_id == encargado.id
        assert venta.anulada_en is not None
        assert venta.motivo_anulacion == "Ticket duplicado"

        # También aparece con estado ANULADA en GET /api/ventas/
        resp_lista = client.get("/api/ventas/")
        assert resp_lista.status_code == status.HTTP_200_OK
        item = next(v for v in resp_lista.data["datos"] if v["id"] == venta.id)
        assert item["estado"] == "ANULADA"
        assert item["anulada_por_nombre"] == encargado.username
        assert item["motivo_anulacion"] == "Ticket duplicado"

    def test_api_doble_anulacion_retorna_400_formato_unico(self, client, duenio, producto):
        turno = TurnoCaja.objects.create(usuario=duenio, efectivo_inicial=Decimal("1000.00"))
        venta = registrar_venta(
            items_data=[{"producto_id": producto.id, "cantidad": 1}],
            medio_pago="EFECTIVO",
            turno_caja=turno,
        )

        client.force_authenticate(user=duenio)
        resp_1 = client.post(f"/api/ventas/{venta.id}/anular/", {}, format="json")
        assert resp_1.status_code == status.HTTP_200_OK

        resp_2 = client.post(f"/api/ventas/{venta.id}/anular/", {}, format="json")
        assert resp_2.status_code == status.HTTP_400_BAD_REQUEST
        assert "mensaje" in resp_2.data
        assert "detalles" in resp_2.data
        assert "anulada" in resp_2.data["mensaje"].lower()

    def test_api_anular_venta_sin_permiso_retorna_403_formato_unico(self, client, cajero, producto):
        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("1000.00"))
        venta = registrar_venta(
            items_data=[{"producto_id": producto.id, "cantidad": 1}],
            medio_pago="EFECTIVO",
            turno_caja=turno,
        )

        client.force_authenticate(user=cajero)
        resp = client.post(f"/api/ventas/{venta.id}/anular/", {}, format="json")
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert "mensaje" in resp.data
        assert "detalles" in resp.data

        venta.refresh_from_db()
        assert venta.estado == "EMITIDA"

    def test_api_anular_venta_en_turno_cerrado_retorna_400(self, client, cajero, duenio, producto):
        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("1000.00"))
        venta = registrar_venta(
            items_data=[{"producto_id": producto.id, "cantidad": 1}],
            medio_pago="EFECTIVO",
            turno_caja=turno,
        )

        client.force_authenticate(user=duenio)
        resp_cierre = client.post(
            f"/api/caja/turnos/{turno.id}/cerrar/",
            {"efectivo_contado": "3500.00"},
            format="json",
        )
        assert resp_cierre.status_code == status.HTTP_200_OK

        resp_anular = client.post(
            f"/api/ventas/{venta.id}/anular/",
            {"motivo": "Intento tardío"},
            format="json",
        )
        assert resp_anular.status_code == status.HTTP_400_BAD_REQUEST
        assert "mensaje" in resp_anular.data
        assert "cerrado" in resp_anular.data["mensaje"].lower()
        assert Venta.objects.filter(pk=venta.pk, estado="EMITIDA").exists()

    def test_api_venta_anulada_no_suma_en_caja_ni_reportes(self, client, duenio):
        leche = Insumo.objects.create(
            nombre="Leche Entera API Anul",
            unidad_base="ml",
            costo_unitario=Decimal("2.0000"),
        )
        prod_valido = Producto.objects.create(
            nombre="Latte Válido",
            precio_venta=Decimal("3000.00"),
            costo_total_calculado=Decimal("900.0000"),
            estado_activo=True,
        )
        prod_anulado = Producto.objects.create(
            nombre="Mocha Anulado",
            precio_venta=Decimal("4000.00"),
            costo_total_calculado=Decimal("1200.0000"),
            estado_activo=True,
        )
        RecetaItem.objects.create(
            producto=prod_valido, insumo=leche, cantidad=Decimal("200.0000"), unidad="ml"
        )
        RecetaItem.objects.create(
            producto=prod_anulado, insumo=leche, cantidad=Decimal("250.0000"), unidad="ml"
        )

        turno = TurnoCaja.objects.create(usuario=duenio, efectivo_inicial=Decimal("10000.00"))
        venta_ok = registrar_venta(
            items_data=[{"producto_id": prod_valido.id, "cantidad": 1}],
            medio_pago="EFECTIVO",
            turno_caja=turno,
        )
        venta_baja = registrar_venta(
            items_data=[{"producto_id": prod_anulado.id, "cantidad": 2}],
            medio_pago="EFECTIVO",
            turno_caja=turno,
        )

        client.force_authenticate(user=duenio)
        resp_anul = client.post(
            f"/api/ventas/{venta_baja.id}/anular/",
            {"motivo": "Cliente canceló"},
            format="json",
        )
        assert resp_anul.status_code == status.HTTP_200_OK

        # Turno abierto: ventas_efectivo_total y cantidad_tickets excluyen la anulada
        resp_turno = client.get(f"/api/caja/turnos/{turno.id}/")
        assert resp_turno.status_code == status.HTTP_200_OK
        assert resp_turno.data["ventas_efectivo_total"] == "3000.00"
        assert resp_turno.data["cantidad_tickets"] == 1

        # Cierre de caja: efectivo_esperado = 10000 + 3000 = 13000
        resp_cierre = client.post(
            f"/api/caja/turnos/{turno.id}/cerrar/",
            {"efectivo_contado": "13000.00"},
            format="json",
        )
        assert resp_cierre.status_code == status.HTTP_200_OK
        assert resp_cierre.data["efectivo_esperado"] == "13000.00"
        assert resp_cierre.data["diferencia"] == "0.00"

        # Ganancia diaria
        resp_ganancia = client.get("/api/ventas/ganancia-diaria/")
        assert resp_ganancia.status_code == status.HTTP_200_OK
        assert resp_ganancia.data["cantidad_tickets"] == 1
        assert resp_ganancia.data["ingresos_totales"] == "3000.00"
        assert resp_ganancia.data["costo_total_congelado"] == "900.0000"

        # Reporte por producto y ranking
        resp_rep = client.get("/api/ventas/reporte-por-producto/")
        assert resp_rep.status_code == status.HTTP_200_OK
        assert [r["producto_id"] for r in resp_rep.data["datos"]] == [prod_valido.id]

        resp_rank = client.get("/api/ventas/ranking-productos/")
        assert resp_rank.status_code == status.HTTP_200_OK
        assert resp_rank.data["mas_vendidos"][0]["producto_id"] == prod_valido.id
        assert resp_rank.data["menos_vendidos"][0]["producto_id"] == prod_anulado.id
        assert resp_rank.data["menos_vendidos"][0]["unidades_vendidas"] == "0.00"

        # Punto de equilibrio
        resp_pe = client.get("/api/ventas/punto-equilibrio/?costos_fijos=700000.00")
        assert resp_pe.status_code == status.HTTP_200_OK
        assert resp_pe.data["ventas_referencia"] == "3000.00"
        assert resp_pe.data["costos_variables"] == "900.00"

        # Movimientos de insumos / consumo
        resp_movs = client.get("/api/insumos/movimientos/?tipo=EGRESO")
        assert resp_movs.status_code == status.HTTP_200_OK
        origenes = {m["origen_id"] for m in resp_movs.data["datos"]}
        assert venta_ok.id in origenes
        assert venta_baja.id not in origenes
