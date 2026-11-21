"""Tests unitarios para cálculo de precio sugerido con margen objetivo y competencia (HU9)."""

from decimal import Decimal

import pytest

from apps.insumos.models import Insumo
from apps.recetas.models import PrecioCompetencia, Producto, RecetaItem
from apps.recetas.services import (
    actualizar_costo_y_margen_producto,
    calcular_precio_sugerido,
    obtener_sugerencia_precio_producto,
    redondear_a_multiplo,
)


@pytest.mark.django_db
class TestPrecioSugeridoUnit:
    def test_redondeo_a_multiplos_50_y_100(self):
        assert redondear_a_multiplo(Decimal("2483.61"), 50) == Decimal("2500.00")
        assert redondear_a_multiplo(Decimal("2120.00"), 50) == Decimal("2100.00")
        assert redondear_a_multiplo(Decimal("2140.00"), 50) == Decimal("2150.00")
        assert redondear_a_multiplo(Decimal("2140.00"), 100) == Decimal("2100.00")
        assert redondear_a_multiplo(Decimal("2160.00"), 100) == Decimal("2200.00")

    def test_ca91_calcula_precio_sugerido_por_margen_objetivo_y_redondeo(self):
        """
        CA9.1: costo / (1 - margen_objetivo) redondeado al múltiplo configurado ($50 o $100).
        Caso verificado: costo $1092.79 con margen objetivo 56% -> $2483.61 -> $2500.00.
        """
        res_50 = calcular_precio_sugerido(
            costo_total=Decimal("1092.7900"),
            margen_objetivo=Decimal("0.5600"),
            redondeo_multiplo=50,
        )
        assert res_50["precio_base_redondeado"] == "2500.00"
        assert res_50["precio_sugerido"] == "2500.00"
        assert res_50["acotado_por"] == "NINGUNO"
        assert res_50["competencia_cantidad"] == 0

        # Con costo $1200 y margen 45%: 1200 / 0.55 = 2181.82
        # En múltiplo de 50 -> 2200.00; en múltiplo de 100 -> 2200.00
        # Con costo $1200 y margen 44%: 1200 / 0.56 = 2142.86 -> $2150 (50) vs $2100 (100)
        res_m50 = calcular_precio_sugerido(
            costo_total=Decimal("1200.0000"),
            margen_objetivo=Decimal("0.4400"),
            redondeo_multiplo=50,
        )
        res_m100 = calcular_precio_sugerido(
            costo_total=Decimal("1200.0000"),
            margen_objetivo=Decimal("0.4400"),
            redondeo_multiplo=100,
        )
        assert res_m50["precio_sugerido"] == "2150.00"
        assert res_m100["precio_sugerido"] == "2100.00"

    def test_ca92_acota_precio_sugerido_por_promedio_y_minimo_competencia(self):
        """
        CA9.2: Con precios de competencia cargados, el sugerido queda dentro de [min, promedio].
        """
        # Competencia: 2800, 3200, 3600 -> min=2800.00, prom=3200.00
        competidores = [Decimal("2800.00"), Decimal("3200.00"), Decimal("3600.00")]

        # 1) Base por margen = 1500 / (1 - 0.60) = 3750 -> supera promedio (3200) -> acota a 3200
        res_alto = calcular_precio_sugerido(
            costo_total=Decimal("1500.00"),
            margen_objetivo=Decimal("0.60"),
            redondeo_multiplo=50,
            precios_competencia=competidores,
        )
        assert res_alto["precio_base_redondeado"] == "3750.00"
        assert res_alto["competencia_minimo"] == "2800.00"
        assert res_alto["competencia_promedio"] == "3200.00"
        assert res_alto["precio_sugerido"] == "3200.00"
        assert res_alto["acotado_por"] == "PROMEDIO"

        # 2) Base por margen = 1500 / (1 - 0.30) = 2142.86 -> 2150 -> debajo del mínimo (2800) -> sube a 2800
        res_bajo = calcular_precio_sugerido(
            costo_total=Decimal("1500.00"),
            margen_objetivo=Decimal("0.30"),
            redondeo_multiplo=50,
            precios_competencia=competidores,
        )
        assert res_bajo["precio_base_redondeado"] == "2150.00"
        assert res_bajo["precio_sugerido"] == "2800.00"
        assert res_bajo["acotado_por"] == "MINIMO"

        # 3) Base por margen = 1500 / (1 - 0.50) = 3000 -> dentro de [2800, 3200] -> queda 3000
        res_dentro = calcular_precio_sugerido(
            costo_total=Decimal("1500.00"),
            margen_objetivo=Decimal("0.50"),
            redondeo_multiplo=50,
            precios_competencia=competidores,
        )
        assert res_dentro["precio_sugerido"] == "3000.00"
        assert res_dentro["acotado_por"] == "NINGUNO"

    def test_un_solo_precio_competencia_fija_minimo_y_promedio(self):
        res = calcular_precio_sugerido(
            costo_total=Decimal("1000.00"),
            margen_objetivo=Decimal("0.50"),
            redondeo_multiplo=50,
            precios_competencia=[Decimal("2400.00")],
        )
        assert res["competencia_cantidad"] == 1
        assert res["competencia_minimo"] == "2400.00"
        assert res["competencia_promedio"] == "2400.00"
        assert res["precio_sugerido"] == "2400.00"
        assert res["acotado_por"] == "MINIMO"

    def test_validaciones_evitan_division_por_cero_y_parametros_invalidos(self):
        with pytest.raises(ValueError, match="menor al 100%"):
            calcular_precio_sugerido(Decimal("1000.00"), Decimal("1.00"), 50)

        with pytest.raises(ValueError, match="menor al 100%"):
            calcular_precio_sugerido(Decimal("1000.00"), Decimal("-0.10"), 50)

        with pytest.raises(ValueError, match="50 o \\$100"):
            calcular_precio_sugerido(Decimal("1000.00"), Decimal("0.30"), 25)

        with pytest.raises(ValueError, match="mayores a cero"):
            calcular_precio_sugerido(
                Decimal("1000.00"),
                Decimal("0.30"),
                50,
                precios_competencia=[Decimal("0.00")],
            )

    def test_obtener_sugerencia_producto_no_modifica_precio_venta(self):
        insumo = Insumo.objects.create(
            nombre="Café Sugerido Unit",
            unidad_base="g",
            costo_unitario=Decimal("50.0000"),
        )
        producto = Producto.objects.create(
            nombre="Espresso Sugerido Unit",
            precio_venta=Decimal("2200.00"),
            minutos_mano_obra=Decimal("0.00"),
            descartables=Decimal("0.00"),
            margen_objetivo=Decimal("0.5000"),
            redondeo_multiplo=100,
        )
        RecetaItem.objects.create(
            producto=producto,
            insumo=insumo,
            cantidad=Decimal("20.0000"),
            unidad="g",
        )
        actualizar_costo_y_margen_producto(producto)

        PrecioCompetencia.objects.create(
            producto=producto,
            nombre_competidor="Cafetería Vecina",
            precio=Decimal("2500.00"),
        )
        PrecioCompetencia.objects.create(
            producto=producto,
            nombre_competidor="Bar Plaza",
            precio=Decimal("2900.00"),
        )

        sugerencia = obtener_sugerencia_precio_producto(producto)
        producto.refresh_from_db()

        # Costo 1000 / (1 - 0.5) = 2000 -> acotado por mínimo competencia (2500.00)
        assert sugerencia["precio_base_redondeado"] == "2000.00"
        assert sugerencia["competencia_minimo"] == "2500.00"
        assert sugerencia["competencia_promedio"] == "2700.00"
        assert sugerencia["precio_sugerido"] == "2500.00"
        # Nunca cambia el precio_venta solo
        assert producto.precio_venta == Decimal("2200.00")
