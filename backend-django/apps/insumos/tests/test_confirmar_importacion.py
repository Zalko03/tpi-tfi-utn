"""
Pruebas de unidad e integración para la confirmación atómica de importación de compras
y propagación de recálculo de recetas con desglose (T3.3).
"""

from decimal import Decimal
import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.insumos.models import Compra, Insumo, Proveedor
from apps.insumos.services import registrar_lote_compras_importacion
from apps.recetas.models import Producto, RecetaItem
from apps.recetas.services import actualizar_costo_y_margen_producto
from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO
from apps.usuarios.services import crear_personal


@pytest.mark.django_db
class TestConfirmarImportacionCompras:
    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def duenio(self):
        return crear_personal(
            datos_usuario={"username": "duenio_t33", "password": "password123"},
            rol=ROL_DUENIO,
        )

    @pytest.fixture
    def cajero(self):
        return crear_personal(
            datos_usuario={"username": "cajero_t33", "password": "password123"},
            rol=ROL_CAJERO,
        )

    @pytest.fixture
    def escenario_catalogo(self):
        proveedor = Proveedor.objects.create(nombre="Distribuidora Litoral")
        cafe = Insumo.objects.create(
            nombre="Café Tostado Brasil",
            unidad_base="g",
            costo_unitario=Decimal("20.0000"),
        )
        leche = Insumo.objects.create(
            nombre="Leche Entera",
            unidad_base="ml",
            costo_unitario=Decimal("1.5000"),
        )
        latte = Producto.objects.create(
            nombre="Latte Clásico",
            precio_venta=Decimal("3200.00"),
            minutos_mano_obra=Decimal("3.00"),
            costo_hora_mano_obra=Decimal("2400.00"),
            descartables=Decimal("80.00"),
        )
        RecetaItem.objects.create(
            producto=latte,
            insumo=cafe,
            cantidad=Decimal("18.0000"),
            unidad="g",
        )
        RecetaItem.objects.create(
            producto=latte,
            insumo=leche,
            cantidad=Decimal("200.0000"),
            unidad="ml",
        )
        # Costo inicial: (18 * 20 = 360) + (200 * 1.5 = 300) + MO (3 * 2400 / 60 = 120) + Desc (80) = 860.0000
        actualizar_costo_y_margen_producto(latte)
        return {
            "proveedor": proveedor,
            "cafe": cafe,
            "leche": leche,
            "latte": latte,
        }

    def test_servicio_lote_prorratea_envio_y_recalcula_receta_con_desglose(
        self, escenario_catalogo
    ):
        """
        Verifica que registrar_lote_compras_importacion prorratee el envío según el valor
        de cada línea, actualice los insumos y devuelva el desglose para snapshots.
        """
        cafe = escenario_catalogo["cafe"]
        leche = escenario_catalogo["leche"]
        latte = escenario_catalogo["latte"]

        assert latte.costo_total_calculado == Decimal("860.0000")

        # Lote: Café $30.000 (75% del valor) y Leche $10.000 (25% del valor) -> Envío $4.000
        # Envío prorrateado: Café = $3.000, Leche = $1.000
        # Costo unitario nuevo Café: (30.000 + 3.000) / 1000 g = 33.0000 $/g
        # Costo unitario nuevo Leche: (10.000 + 1.000) / 5000 ml = 2.2000 $/ml
        resultado = registrar_lote_compras_importacion(
            proveedor_nombre="Distribuidora Litoral",
            envio_total=Decimal("4000.00"),
            items=[
                {
                    "nombre_insumo": "Café Tostado Brasil",
                    "cantidad": Decimal("1.0000"),
                    "unidad": "kg",
                    "precio_total": Decimal("30000.00"),
                    "iva_incluido": True,
                    "alicuota": Decimal("21.00"),
                },
                {
                    "insumo_id": leche.id,
                    "cantidad": Decimal("5.0000"),
                    "unidad": "l",
                    "precio_total": Decimal("10000.00"),
                    "iva_incluido": True,
                    "alicuota": Decimal("21.00"),
                },
            ],
        )

        cafe.refresh_from_db()
        leche.refresh_from_db()
        latte.refresh_from_db()

        assert cafe.costo_unitario == Decimal("33.0000")
        assert leche.costo_unitario == Decimal("2.2000")
        assert len(resultado["compras_creadas"]) == 2
        assert resultado["compras_creadas"][0]["envio_prorrateado"] == "3000.00"
        assert resultado["compras_creadas"][1]["envio_prorrateado"] == "1000.00"

        # Nuevo costo Latte: (18 * 33 = 594) + (200 * 2.2 = 440) + MO (120) + Desc (80) = 1234.0000
        assert latte.costo_total_calculado == Decimal("1234.0000")

        recalculos = resultado["productos_recalculados"]
        assert len(recalculos) == 2
        # Primer paso (tras actualizar café): 860 -> 1094
        assert recalculos[0]["producto_id"] == latte.id
        assert recalculos[0]["insumo_id"] == cafe.id
        assert recalculos[0]["costo_anterior"] == "860.0000"
        assert recalculos[0]["costo_nuevo"] == "1094.0000"
        # Segundo paso (tras actualizar leche): 1094 -> 1234
        assert recalculos[1]["producto_id"] == latte.id
        assert recalculos[1]["insumo_id"] == leche.id
        assert recalculos[1]["costo_anterior"] == "1094.0000"
        assert recalculos[1]["costo_nuevo"] == "1234.0000"
        assert recalculos[1]["costo_mano_obra"] == "120.0000"
        assert recalculos[1]["costo_descartables"] == "80.0000"
        assert len(recalculos[1]["desglose_insumos"]) == 2

    def test_servicio_lote_atomico_revierte_todo_si_un_item_falla(
        self, escenario_catalogo
    ):
        """
        Si el segundo ítem tiene una unidad incompatible con la unidad base del insumo,
        @transaction.atomic revierte toda la operación (0 compras creadas, costo intacto).
        """
        cafe = escenario_catalogo["cafe"]
        leche = escenario_catalogo["leche"]
        costo_original_cafe = cafe.costo_unitario

        with pytest.raises(ValueError, match="No se puede convertir"):
            registrar_lote_compras_importacion(
                proveedor_id=escenario_catalogo["proveedor"].id,
                envio_total=Decimal("0.00"),
                items=[
                    {
                        "insumo_id": cafe.id,
                        "cantidad": Decimal("1.0000"),
                        "unidad": "kg",
                        "precio_total": Decimal("35000.00"),
                    },
                    {
                        # Error intencional: leche tiene unidad_base 'ml', no 'kg'
                        "insumo_id": leche.id,
                        "cantidad": Decimal("2.0000"),
                        "unidad": "kg",
                        "precio_total": Decimal("5000.00"),
                    },
                ],
            )

        cafe.refresh_from_db()
        assert cafe.costo_unitario == costo_original_cafe
        assert Compra.objects.count() == 0

    def test_api_confirmar_importacion_exito_duenio(
        self, client, duenio, escenario_catalogo
    ):
        """POST /api/compras/confirmar-importacion/ con Dueño responde 201 y recalcula."""
        client.force_authenticate(user=duenio)
        payload = {
            "proveedor_nombre": "Distribuidora Litoral",
            "envio": "1000.00",
            "items": [
                {
                    "nombre_insumo": "Café Tostado Brasil",
                    "cantidad": "1.0000",
                    "unidad": "kg",
                    "precio_total": "29000.00",
                    "iva_incluido": True,
                    "alicuota": "21.00",
                }
            ],
        }

        res = client.post(
            "/api/compras/confirmar-importacion/", payload, format="json"
        )
        assert res.status_code == status.HTTP_201_CREATED
        data = res.json()
        assert "compras_creadas" in data
        assert "productos_recalculados" in data
        assert len(data["compras_creadas"]) == 1
        assert data["compras_creadas"][0]["costo_unitario_calculado"] == "30.0000"
        assert len(data["productos_recalculados"]) == 1
        assert (
            data["productos_recalculados"][0]["costo_nuevo"] == "1040.0000"
        )

    def test_api_confirmar_importacion_rechaza_cajero_403(
        self, client, cajero, escenario_catalogo
    ):
        """Test negativo: Cajero sin 'compras.registrar' recibe 403 con formato único."""
        client.force_authenticate(user=cajero)
        payload = {
            "proveedor_nombre": "Distribuidora Litoral",
            "envio": "0.00",
            "items": [
                {
                    "nombre_insumo": "Café Tostado Brasil",
                    "cantidad": "1.0000",
                    "unidad": "kg",
                    "precio_total": "29000.00",
                }
            ],
        }

        res = client.post(
            "/api/compras/confirmar-importacion/", payload, format="json"
        )
        assert res.status_code == status.HTTP_403_FORBIDDEN
        data = res.json()
        assert "mensaje" in data
        assert "detalles" in data
        assert Compra.objects.count() == 0

    def test_api_confirmar_importacion_rechaza_datos_invalidos_400(
        self, client, duenio
    ):
        """Datos inválidos responden 400 con el contrato de error unificado."""
        client.force_authenticate(user=duenio)
        res = client.post(
            "/api/compras/confirmar-importacion/",
            {"proveedor_nombre": "", "items": []},
            format="json",
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        data = res.json()
        assert "mensaje" in data
        assert "detalles" in data

