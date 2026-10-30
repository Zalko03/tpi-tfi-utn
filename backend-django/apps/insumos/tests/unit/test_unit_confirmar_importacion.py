"""
Pruebas unitarias para el servicio de confirmación atómica de importaciones de compras,
prorrateo de envío y recálculo de recetas con desglose (T3.3).
"""

from decimal import Decimal
import pytest

from apps.insumos.models import Compra, Insumo, Proveedor
from apps.insumos.services import registrar_lote_compras_importacion
from apps.recetas.models import Producto, RecetaItem
from apps.recetas.services import actualizar_costo_y_margen_producto


@pytest.mark.django_db
class TestConfirmarImportacionService:
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

    def test_servicio_lote_con_envio_cero_y_creacion_proveedor_nuevo(
        self, escenario_catalogo
    ):
        """Permite confirmar importación con envío cero creando un proveedor nuevo por nombre."""
        cafe = escenario_catalogo["cafe"]
        resultado = registrar_lote_compras_importacion(
            proveedor_nombre="Nuevo Proveedor Mayorista",
            envio_total=Decimal("0.00"),
            items=[
                {
                    "insumo_id": cafe.id,
                    "cantidad": Decimal("2.0000"),
                    "unidad": "kg",
                    "precio_total": Decimal("50000.00"),
                    "iva_incluido": True,
                }
            ],
        )

        assert Proveedor.objects.filter(nombre="Nuevo Proveedor Mayorista").exists()
        assert len(resultado["compras_creadas"]) == 1
        assert Decimal(resultado["compras_creadas"][0]["envio_prorrateado"]) == Decimal(
            "0.00"
        )
        cafe.refresh_from_db()
        assert cafe.costo_unitario == Decimal("25.0000")

    def test_servicio_lote_rechaza_lista_vacia_o_envio_negativo(self):
        """Valida que no se permitan listas vacías ni montos de flete negativos."""
        with pytest.raises(
            ValueError, match="La lista de ítems a importar no puede estar vacía"
        ):
            registrar_lote_compras_importacion(items=[])

        with pytest.raises(ValueError, match="El costo de envío no puede ser negativo"):
            registrar_lote_compras_importacion(
                items=[
                    {
                        "nombre_insumo": "Azúcar",
                        "cantidad": 1,
                        "unidad": "kg",
                        "precio_total": 1000,
                    }
                ],
                envio_total=Decimal("-50.00"),
            )
