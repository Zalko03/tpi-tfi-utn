"""
Pruebas de API para filtrado por rango de fechas (fecha_desde / fecha_hasta) en
Reportes y Trazabilidad:
- GET /api/ventas/
- GET /api/ventas/ganancia-diaria/
- GET /api/ventas/ranking-productos/
- GET /api/ventas/reporte-por-producto/
- GET /api/compras/
- GET /api/insumos/movimientos/
- GET /api/caja/turnos/
- GET /api/caja/movimientos/
- GET /api/usuarios/auditoria/
"""

from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.caja.models import MovimientoCaja, TurnoCaja
from apps.insumos.models import Compra, Insumo, Proveedor
from apps.recetas.models import Producto, RecetaItem
from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO, ROL_ENCARGADO
from apps.usuarios.models import RegistroAuditoria
from apps.usuarios.services import crear_personal
from apps.ventas.models import Venta, VentaItem

TZ_AR = ZoneInfo("America/Argentina/Buenos_Aires")


def _dt_ar(anio: int, mes: int, dia: int, hora: int = 12, minuto: int = 0, segundo: int = 0):
    return datetime(anio, mes, dia, hora, minuto, segundo, tzinfo=TZ_AR)


@pytest.mark.django_db
class TestApiFiltrosFechasTrazabilidad:
    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def duenio(self):
        return crear_personal(
            datos_usuario={"username": "duenio_traza", "password": "password123"},
            rol=ROL_DUENIO,
        )

    @pytest.fixture
    def encargado(self):
        return crear_personal(
            datos_usuario={"username": "encargado_traza", "password": "password123"},
            rol=ROL_ENCARGADO,
        )

    @pytest.fixture
    def cajero(self):
        return crear_personal(
            datos_usuario={"username": "cajero_traza", "password": "password123"},
            rol=ROL_CAJERO,
        )

    @pytest.fixture
    def datos_historicos(self, duenio, cajero):
        proveedor = Proveedor.objects.create(nombre="Proveedor Trazabilidad")
        cafe = Insumo.objects.create(
            nombre="Café Trazabilidad",
            unidad_base="g",
            costo_unitario=Decimal("20.0000"),
        )
        espresso = Producto.objects.create(
            nombre="Espresso Trazabilidad",
            precio_venta=Decimal("2500.00"),
            costo_total_calculado=Decimal("400.0000"),
            estado_activo=True,
        )
        RecetaItem.objects.create(
            producto=espresso,
            insumo=cafe,
            cantidad=Decimal("20.0000"),
            unidad="g",
        )

        # Compras (ingresos de stock): 1 antes, 1 en rango (inicio día 12), 1 en rango (fin día 14), 1 después
        compra_antes = Compra.objects.create(
            proveedor=proveedor,
            insumo=cafe,
            precio_total=Decimal("10000.00"),
            cantidad=Decimal("1.0000"),
            unidad="kg",
            costo_unitario_calculado=Decimal("10.0000"),
            fecha=_dt_ar(2026, 11, 11, 23, 59, 59),
        )
        compra_inicio = Compra.objects.create(
            proveedor=proveedor,
            insumo=cafe,
            precio_total=Decimal("20000.00"),
            cantidad=Decimal("1.0000"),
            unidad="kg",
            costo_unitario_calculado=Decimal("20.0000"),
            fecha=_dt_ar(2026, 11, 12, 0, 0, 0),
        )
        compra_fin = Compra.objects.create(
            proveedor=proveedor,
            insumo=cafe,
            precio_total=Decimal("30000.00"),
            cantidad=Decimal("1.5000"),
            unidad="kg",
            costo_unitario_calculado=Decimal("20.0000"),
            fecha=_dt_ar(2026, 11, 14, 23, 59, 59),
        )
        compra_despues = Compra.objects.create(
            proveedor=proveedor,
            insumo=cafe,
            precio_total=Decimal("40000.00"),
            cantidad=Decimal("2.0000"),
            unidad="kg",
            costo_unitario_calculado=Decimal("20.0000"),
            fecha=_dt_ar(2026, 11, 15, 0, 0, 0),
        )

        # Turnos de caja: 1 cerrado antes, 1 abierto el 11 y cerrado el 13 (en rango), 1 abierto el 14, 1 cerrado el 15
        turno_antes = TurnoCaja.objects.create(
            usuario=cajero,
            apertura=_dt_ar(2026, 11, 11, 8, 0, 0),
            cierre=_dt_ar(2026, 11, 11, 18, 0, 0),
            efectivo_inicial=Decimal("5000.00"),
            efectivo_contado=Decimal("5000.00"),
            efectivo_esperado=Decimal("5000.00"),
            diferencia=Decimal("0.00"),
            estado="CERRADO",
        )
        turno_cierre_rango = TurnoCaja.objects.create(
            usuario=cajero,
            apertura=_dt_ar(2026, 11, 12, 20, 0, 0),
            cierre=_dt_ar(2026, 11, 13, 1, 30, 0),
            efectivo_inicial=Decimal("10000.00"),
            efectivo_contado=Decimal("15000.00"),
            efectivo_esperado=Decimal("15000.00"),
            diferencia=Decimal("0.00"),
            estado="CERRADO",
        )
        turno_abierto_rango = TurnoCaja.objects.create(
            usuario=duenio,
            apertura=_dt_ar(2026, 11, 14, 9, 0, 0),
            estado="ABIERTO",
            efectivo_inicial=Decimal("8000.00"),
        )
        turno_despues = TurnoCaja.objects.create(
            usuario=cajero,
            apertura=_dt_ar(2026, 11, 15, 8, 0, 0),
            cierre=_dt_ar(2026, 11, 15, 16, 0, 0),
            efectivo_inicial=Decimal("5000.00"),
            efectivo_contado=Decimal("5000.00"),
            efectivo_esperado=Decimal("5000.00"),
            diferencia=Decimal("0.00"),
            estado="CERRADO",
        )

        # Movimientos de caja chica
        mov_antes = MovimientoCaja.objects.create(
            turno_caja=turno_antes,
            tipo="ENTRADA",
            monto=Decimal("1000.00"),
            motivo="Cambio antes",
            fecha=_dt_ar(2026, 11, 11, 12, 0, 0),
        )
        mov_rango = MovimientoCaja.objects.create(
            turno_caja=turno_cierre_rango,
            tipo="SALIDA",
            monto=Decimal("1500.00"),
            motivo="Hielo en rango",
            fecha=_dt_ar(2026, 11, 13, 0, 30, 0),
        )
        mov_despues = MovimientoCaja.objects.create(
            turno_caja=turno_despues,
            tipo="ENTRADA",
            monto=Decimal("2000.00"),
            motivo="Cambio después",
            fecha=_dt_ar(2026, 11, 15, 10, 0, 0),
        )

        # Ventas: 1 antes (nov 11 23:59), 2 en rango (nov 12 00:00 y nov 14 23:59), 1 después (nov 15 00:00)
        def _crear_venta(fecha_dt, turno_obj, cantidad_prod):
            total_val = Decimal("2500.00") * cantidad_prod
            costo_val = Decimal("400.0000") * cantidad_prod
            v = Venta.objects.create(
                turno_caja=turno_obj,
                fecha=fecha_dt,
                medio_pago="EFECTIVO",
                origen="propio",
                total=total_val,
                costo_total_snapshot=costo_val,
            )
            VentaItem.objects.create(
                venta=v,
                producto=espresso,
                cantidad=Decimal(str(cantidad_prod)),
                precio_unitario=Decimal("2500.00"),
                costo_unitario_snapshot=Decimal("400.0000"),
            )
            return v

        v_antes = _crear_venta(_dt_ar(2026, 11, 11, 23, 59, 59), turno_antes, 1)
        v_inicio = _crear_venta(_dt_ar(2026, 11, 12, 0, 0, 0), turno_cierre_rango, 2)
        v_fin = _crear_venta(_dt_ar(2026, 11, 14, 23, 59, 59), turno_abierto_rango, 3)
        v_despues = _crear_venta(_dt_ar(2026, 11, 15, 0, 0, 0), turno_despues, 4)

        # Auditoría de usuarios
        aud_antes = RegistroAuditoria.objects.create(
            usuario_modificado=cajero,
            modificado_por=duenio,
            accion="MODIFICACION_USUARIO",
            detalles={"nota": "antes"},
            fecha=_dt_ar(2026, 11, 11, 10, 0, 0),
        )
        aud_rango = RegistroAuditoria.objects.create(
            usuario_modificado=cajero,
            modificado_por=duenio,
            accion="AJUSTE_PERMISOS",
            detalles={"nota": "rango"},
            fecha=_dt_ar(2026, 11, 13, 15, 0, 0),
        )

        return {
            "cafe": cafe,
            "espresso": espresso,
            "compras": (compra_antes, compra_inicio, compra_fin, compra_despues),
            "turnos": (turno_antes, turno_cierre_rango, turno_abierto_rango, turno_despues),
            "movimientos_caja": (mov_antes, mov_rango, mov_despues),
            "ventas": (v_antes, v_inicio, v_fin, v_despues),
            "auditorias": (aud_antes, aud_rango),
        }

    def test_ventas_filtra_por_fecha_desde_y_hasta_inclusivo(
        self, client, duenio, datos_historicos
    ):
        client.force_authenticate(user=duenio)
        _, v_inicio, v_fin, _ = datos_historicos["ventas"]

        resp = client.get("/api/ventas/?fecha_desde=2026-11-12&fecha_hasta=2026-11-14")
        assert resp.status_code == status.HTTP_200_OK
        ids = {item["id"] for item in resp.data["datos"]}
        assert ids == {v_inicio.id, v_fin.id}

        # Sin parámetros sigue devolviendo todas (compatibilidad hacia atrás)
        resp_todas = client.get("/api/ventas/")
        assert resp_todas.status_code == status.HTTP_200_OK
        assert resp_todas.data["total"] == 4

    def test_compras_y_movimientos_stock_filtran_por_fecha_desde_y_hasta(
        self, client, duenio, cajero, datos_historicos
    ):
        client.force_authenticate(user=duenio)
        _, c_inicio, c_fin, _ = datos_historicos["compras"]
        _, v_inicio, v_fin, _ = datos_historicos["ventas"]

        # 1. Compras
        resp_compras = client.get("/api/compras/?fecha_desde=2026-11-12&fecha_hasta=2026-11-14")
        assert resp_compras.status_code == status.HTTP_200_OK
        ids_compras = {item["id"] for item in resp_compras.data["datos"]}
        assert ids_compras == {c_inicio.id, c_fin.id}

        # 2. Movimientos de stock unificados (ingresos por compra + egresos por venta con receta)
        resp_movs = client.get(
            "/api/insumos/movimientos/?fecha_desde=2026-11-12&fecha_hasta=2026-11-14"
        )
        assert resp_movs.status_code == status.HTTP_200_OK
        movs = resp_movs.data["datos"]
        assert resp_movs.data["total"] == 4
        origen_ids_ingreso = {m["origen_id"] for m in movs if m["tipo"] == "INGRESO"}
        origen_ids_egreso = {m["origen_id"] for m in movs if m["tipo"] == "EGRESO"}
        assert origen_ids_ingreso == {c_inicio.id, c_fin.id}
        assert origen_ids_egreso == {v_inicio.id, v_fin.id}

        # Filtro adicional por tipo=EGRESO
        resp_egresos = client.get(
            "/api/insumos/movimientos/?fecha_desde=2026-11-12&fecha_hasta=2026-11-14&tipo=EGRESO"
        )
        assert resp_egresos.status_code == status.HTTP_200_OK
        assert {m["origen_id"] for m in resp_egresos.data["datos"]} == {v_inicio.id, v_fin.id}

        # Test negativo de permisos: Cajero no tiene 'insumos.ver' -> 403
        client.force_authenticate(user=cajero)
        resp_403 = client.get(
            "/api/insumos/movimientos/?fecha_desde=2026-11-12&fecha_hasta=2026-11-14"
        )
        assert resp_403.status_code == status.HTTP_403_FORBIDDEN

    def test_turnos_y_movimientos_caja_filtran_por_fecha_desde_y_hasta(
        self, client, duenio, datos_historicos
    ):
        client.force_authenticate(user=duenio)
        _, t_cierre_rango, t_abierto_rango, _ = datos_historicos["turnos"]
        _, mov_rango, _ = datos_historicos["movimientos_caja"]

        # Turnos en rango (incluye cierre del 13 y abierto del 14)
        resp_turnos = client.get("/api/caja/turnos/?fecha_desde=2026-11-12&fecha_hasta=2026-11-14")
        assert resp_turnos.status_code == status.HTTP_200_OK
        assert {t["id"] for t in resp_turnos.data["datos"]} == {
            t_cierre_rango.id,
            t_abierto_rango.id,
        }

        # Solo cierres de caja en rango
        resp_cierres = client.get(
            "/api/caja/turnos/?fecha_desde=2026-11-12&fecha_hasta=2026-11-14&estado=CERRADO"
        )
        assert resp_cierres.status_code == status.HTTP_200_OK
        assert {t["id"] for t in resp_cierres.data["datos"]} == {t_cierre_rango.id}

        # Movimientos de caja chica en rango
        resp_movs = client.get(
            "/api/caja/movimientos/?fecha_desde=2026-11-12&fecha_hasta=2026-11-14"
        )
        assert resp_movs.status_code == status.HTTP_200_OK
        assert {m["id"] for m in resp_movs.data["datos"]} == {mov_rango.id}

    def test_reportes_y_auditoria_soportan_fecha_desde_y_fecha_hasta(
        self, client, duenio, datos_historicos
    ):
        client.force_authenticate(user=duenio)
        _, aud_rango = datos_historicos["auditorias"]

        # Ganancia diaria con fecha_desde / fecha_hasta (v_inicio=2x2500 + v_fin=3x2500 = 5u, $12500)
        resp_ganancia = client.get(
            "/api/ventas/ganancia-diaria/?fecha_desde=2026-11-12&fecha_hasta=2026-11-14"
        )
        assert resp_ganancia.status_code == status.HTTP_200_OK
        assert resp_ganancia.data["cantidad_tickets"] == 2
        assert resp_ganancia.data["unidades_vendidas"] == "5.00"
        assert resp_ganancia.data["ingresos_totales"] == "12500.00"

        # Ranking y reporte por producto con fecha_desde / fecha_hasta
        resp_ranking = client.get(
            "/api/ventas/ranking-productos/?fecha_desde=2026-11-12&fecha_hasta=2026-11-14"
        )
        assert resp_ranking.status_code == status.HTTP_200_OK
        assert resp_ranking.data["mas_vendidos"][0]["unidades_vendidas"] == "5.00"

        resp_prod = client.get(
            "/api/ventas/reporte-por-producto/?fecha_desde=2026-11-12&fecha_hasta=2026-11-14"
        )
        assert resp_prod.status_code == status.HTTP_200_OK
        assert resp_prod.data["datos"][0]["unidades_vendidas"] == "5.00"

        # Auditoría de usuarios
        resp_aud = client.get(
            "/api/usuarios/auditoria/?fecha_desde=2026-11-12&fecha_hasta=2026-11-14"
        )
        assert resp_aud.status_code == status.HTTP_200_OK
        assert {a["id"] for a in resp_aud.data["datos"]} == {aud_rango.id}

    def test_rango_fechas_invertido_o_invalido_retorna_400_formato_unico(self, client, duenio):
        client.force_authenticate(user=duenio)
        for url in (
            "/api/ventas/?fecha_desde=2026-11-15&fecha_hasta=2026-11-12",
            "/api/insumos/movimientos/?fecha_desde=invalida",
            "/api/caja/turnos/?fecha_desde=2026-11-20&fecha_hasta=2026-11-10",
            "/api/compras/?fecha_hasta=no-es-fecha",
        ):
            resp = client.get(url)
            assert resp.status_code == status.HTTP_400_BAD_REQUEST
            assert "mensaje" in resp.data
            assert "detalles" in resp.data
