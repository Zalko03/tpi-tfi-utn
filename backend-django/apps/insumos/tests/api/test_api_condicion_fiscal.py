"""Pruebas de API para configuración fiscal del local y tratamiento de IVA (HU14)."""

from decimal import Decimal

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.insumos.models import (
    CONDICION_MONOTRIBUTISTA,
    CONDICION_NO_DECLARADA,
    CONDICION_RESPONSABLE_INSCRIPTO,
    HistorialCondicionFiscal,
    Insumo,
    Proveedor,
)
from apps.recetas.models import Producto, RecetaItem
from apps.recetas.services import actualizar_costo_y_margen_producto
from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO, ROL_ENCARGADO
from apps.usuarios.services import crear_personal


@pytest.mark.django_db
class TestApiCondicionFiscal:
    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def duenio(self):
        return crear_personal(
            datos_usuario={"username": "duenio_fiscal_api", "password": "password123"},
            rol=ROL_DUENIO,
        )

    @pytest.fixture
    def encargado(self):
        return crear_personal(
            datos_usuario={"username": "encargado_fiscal_api", "password": "password123"},
            rol=ROL_ENCARGADO,
        )

    @pytest.fixture
    def cajero(self):
        return crear_personal(
            datos_usuario={"username": "cajero_fiscal_api", "password": "password123"},
            rol=ROL_CAJERO,
        )

    @pytest.fixture
    def datos_base(self):
        proveedor = Proveedor.objects.create(nombre="Proveedor Café Fiscal")
        cafe = Insumo.objects.create(nombre="Café Granos API", unidad_base="g")
        producto = Producto.objects.create(
            nombre="Espresso API Fiscal",
            precio_venta=Decimal("3000.00"),
            minutos_mano_obra=Decimal("0.00"),
            costo_hora_mano_obra=Decimal("2500.00"),
            descartables=Decimal("0.00"),
        )
        RecetaItem.objects.create(
            producto=producto,
            insumo=cafe,
            cantidad=Decimal("10.0000"),
            unidad="g",
        )
        actualizar_costo_y_margen_producto(producto)
        return {"proveedor": proveedor, "cafe": cafe, "producto": producto}

    def test_flujo_completo_sin_declarar_a_responsable_inscripto_y_vuelta(
        self, client, duenio, datos_base
    ):
        """
        Cubre CA14.1, CA14.2 y CA14.3 vía HTTP:
        1. Inicialmente está NO_DECLARADA con aviso y costeo con IVA.
        2. Una compra se costea con IVA e incluye aviso_fiscal.
        3. Dueño declara RESPONSABLE_INSCRIPTO -> recalcula insumo y receta sin IVA y guarda historial.
        4. Nueva compra ya no incluye IVA ni aviso.
        5. Cambio a MONOTRIBUTISTA vuelve a recalcular con IVA y suma al historial.
        """
        client.force_authenticate(user=duenio)

        # 1. GET inicial
        res_get = client.get("/api/configuracion-fiscal/")
        assert res_get.status_code == status.HTTP_200_OK
        data_get = res_get.json()
        assert data_get["condicion_fiscal"] == CONDICION_NO_DECLARADA
        assert data_get["declarada"] is False
        assert data_get["costear_con_iva"] is True
        assert data_get["aviso"] is not None
        assert len(data_get["opciones"]) == 3
        assert data_get["historial"] == []

        # 2. Compra sin declarar -> costea con IVA y avisa
        res_compra_1 = client.post(
            "/api/compras/",
            {
                "proveedor": datos_base["proveedor"].id,
                "insumo": datos_base["cafe"].id,
                "precio_total": "12100.00",
                "cantidad": "1",
                "unidad": "kg",
                "iva_incluido": True,
                "alicuota": "21.00",
            },
            format="json",
        )
        assert res_compra_1.status_code == status.HTTP_201_CREATED
        compra_1 = res_compra_1.json()
        assert compra_1["costo_unitario_calculado"] == "12.1000"
        assert compra_1["costear_con_iva"] is True
        assert compra_1["aviso_fiscal"] is not None

        producto = datos_base["producto"]
        producto.refresh_from_db()
        assert producto.costo_total_calculado == Decimal("121.0000")

        # 3. Declarar Responsable Inscripto
        res_put = client.put(
            "/api/configuracion-fiscal/",
            {"condicion_fiscal": CONDICION_RESPONSABLE_INSCRIPTO},
            format="json",
        )
        assert res_put.status_code == status.HTTP_200_OK
        data_put = res_put.json()
        assert data_put["condicion_fiscal"] == CONDICION_RESPONSABLE_INSCRIPTO
        assert data_put["declarada"] is True
        assert data_put["costear_con_iva"] is False
        assert data_put["aviso"] is None
        assert data_put["insumos_recalculados"] == 1
        assert data_put["productos_recalculados"] == 1

        producto.refresh_from_db()
        assert producto.costo_total_calculado == Decimal("100.0000")

        # 4. Nueva compra como Responsable Inscripto -> excluye IVA y sin aviso
        res_compra_2 = client.post(
            "/api/compras/",
            {
                "proveedor": datos_base["proveedor"].id,
                "insumo": datos_base["cafe"].id,
                "precio_total": "24200.00",
                "cantidad": "1",
                "unidad": "kg",
                "iva_incluido": True,
                "alicuota": "21.00",
            },
            format="json",
        )
        assert res_compra_2.status_code == status.HTTP_201_CREATED
        compra_2 = res_compra_2.json()
        assert compra_2["costo_unitario_calculado"] == "20.0000"
        assert compra_2["costear_con_iva"] is False
        assert compra_2["aviso_fiscal"] is None

        # 5. Cambio a Monotributista -> recalcula con IVA y registra segundo historial
        res_patch = client.patch(
            "/api/configuracion-fiscal/",
            {"condicion_fiscal": CONDICION_MONOTRIBUTISTA},
            format="json",
        )
        assert res_patch.status_code == status.HTTP_200_OK
        producto.refresh_from_db()
        assert producto.costo_total_calculado == Decimal("242.0000")

        res_hist = client.get("/api/configuracion-fiscal/historial/")
        assert res_hist.status_code == status.HTTP_200_OK
        assert res_hist.json()["total"] == 2
        assert HistorialCondicionFiscal.objects.count() == 2

    def test_validacion_condicion_invalida_retorna_400_formato_unico(self, client, duenio):
        client.force_authenticate(user=duenio)
        res = client.put(
            "/api/configuracion-fiscal/",
            {"condicion_fiscal": "NO_DECLARADA"},
            format="json",
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        data = res.json()
        assert "mensaje" in data
        assert "detalles" in data

    def test_estado_fiscal_accesible_para_encargado_y_bloqueado_para_cajero(
        self, client, encargado, cajero
    ):
        client.force_authenticate(user=encargado)
        res_enc = client.get("/api/configuracion-fiscal/estado/")
        assert res_enc.status_code == status.HTTP_200_OK
        assert res_enc.json()["declarada"] is False
        assert res_enc.json()["aviso"] is not None

        client.force_authenticate(user=cajero)
        res_caj = client.get("/api/configuracion-fiscal/estado/")
        assert res_caj.status_code == status.HTTP_403_FORBIDDEN
        assert "mensaje" in res_caj.json()
        assert "detalles" in res_caj.json()
