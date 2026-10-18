"""Tests unitarios para cálculo de recetas, costeo, márgenes y recálculo."""
from decimal import Decimal
import pytest
from apps.insumos.models import Insumo
from apps.recetas.models import Producto, RecetaItem
from apps.recetas.services import (
    calcular_costo_producto,
    calcular_margen_y_ganancia,
    actualizar_costo_y_margen_producto,
    recalcular_recetas_por_insumo,
)


@pytest.mark.django_db
class TestCosteoRecetas:
    def test_costeo_producto_con_insumos_mano_obra_y_descartables(self):
        """
        Caso del Excel: Café Latte
        - Café en grano: 60 g a $27.50 / g = $1.650,00
        - Leche: 290 ml a $1.20 / ml = $348,00
        - Mano de obra: 2 minutos a $2.500/hora / 60 = $83,3333
        - Descartables: $100,00
        Costo total esperado = $2.181,3333
        """
        insumo_cafe = Insumo.objects.create(
            nombre="Café Especialidad Brasil",
            unidad_base="g",
            costo_unitario=Decimal("27.5000"),
        )
        insumo_leche = Insumo.objects.create(
            nombre="Leche Entera",
            unidad_base="ml",
            costo_unitario=Decimal("1.2000"),
        )

        producto = Producto.objects.create(
            nombre="Café Latte",
            precio_venta=Decimal("4000.00"),
            minutos_mano_obra=Decimal("2.00"),
            costo_hora_mano_obra=Decimal("2500.00"),
            descartables=Decimal("100.00"),
        )

        RecetaItem.objects.create(
            producto=producto,
            insumo=insumo_cafe,
            cantidad=Decimal("60.0000"),
            unidad="g",
        )
        RecetaItem.objects.create(
            producto=producto,
            insumo=insumo_leche,
            cantidad=Decimal("0.2900"),
            unidad="l",  # Se convierte de litros a ml automáticamente
        )

        costo = calcular_costo_producto(producto)
        assert costo == Decimal("2181.3333")

        ganancia, margen = calcular_margen_y_ganancia(producto.precio_venta, costo)
        # Ganancia = 4000 - 2181.3333 = 1818.6667
        assert ganancia == Decimal("1818.6667")
        # Margen = 1818.6667 / 4000 = 0.4547
        assert margen == Decimal("0.4547")

    def test_recalculo_automatico_al_cambiar_precio_insumo(self):
        """
        T1.8 / HU3: Al cambiar el precio de un insumo, se recalculan
        todas las recetas que lo utilizan.
        """
        insumo = Insumo.objects.create(
            nombre="Harina de Mandioca",
            unidad_base="g",
            costo_unitario=Decimal("5.0000"),
        )
        producto = Producto.objects.create(
            nombre="Chipá Tradicional",
            precio_venta=Decimal("1500.00"),
            minutos_mano_obra=Decimal("1.00"),
            costo_hora_mano_obra=Decimal("2500.00"),
            descartables=Decimal("20.00"),
        )
        RecetaItem.objects.create(
            producto=producto,
            insumo=insumo,
            cantidad=Decimal("50.0000"),
            unidad="g",
        )

        actualizar_costo_y_margen_producto(producto)
        costo_inicial = producto.costo_total_calculado

        # Aumenta el insumo a $10 / g (+ $250 en la receta)
        insumo.costo_unitario = Decimal("10.0000")
        insumo.save()

        resumen = recalcular_recetas_por_insumo(insumo.id)
        producto.refresh_from_db()

        assert len(resumen) == 1
        assert producto.costo_total_calculado == costo_inicial + Decimal("250.0000")
