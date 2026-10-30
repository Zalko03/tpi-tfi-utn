"""
Pruebas unitarias para servicios de reportes (HU10 y HU11):
- Ganancia diaria con costo congelado (CA10.1) y rango de fechas.
- Ranking de productos más y menos vendidos, incluyendo productos sin rotación (CA10.2).
- Fórmulas matemáticas de Punto de Equilibrio (CA11.1) y metas diaria y semanal (CA11.2).
- Casos borde: costos fijos en cero/negativos, sin ventas, costos variables superiores a ventas y días inválidos.
"""

from decimal import Decimal
import pytest

from apps.recetas.models import Producto
from apps.ventas.services import (
    calcular_punto_equilibrio_y_metas,
    obtener_ganancia_diaria,
    obtener_ranking_productos,
    registrar_venta,
)


@pytest.mark.django_db
class TestUnitReportesServicios:
    @pytest.fixture
    def catalogo_productos(self):
        p1 = Producto.objects.create(
            nombre="Espresso Doble",
            precio_venta=Decimal("2000.00"),
            costo_total_calculado=Decimal("600.0000"),
            estado_activo=True,
        )
        p2 = Producto.objects.create(
            nombre="Capuccino Especial",
            precio_venta=Decimal("3000.00"),
            costo_total_calculado=Decimal("1000.0000"),
            estado_activo=True,
        )
        p3 = Producto.objects.create(
            nombre="Té en Hebras",
            precio_venta=Decimal("1800.00"),
            costo_total_calculado=Decimal("400.0000"),
            estado_activo=True,
        )
        return p1, p2, p3

    # =========================================================================
    # 1. Ganancia Diaria con Costo Congelado (CA10.1)
    # =========================================================================

    def test_ganancia_diaria_usa_costo_congelado_y_no_se_altera_ante_subas_posteriores_ca10_1(
        self, catalogo_productos
    ):
        """
        CA10.1: La ganancia diaria es la suma de (precio - costo congelado) de los ítems vendidos.
        Un cambio posterior en el costo del producto no altera la ganancia histórica.
        """
        p1, p2, _ = catalogo_productos

        # Venta: 2 Espressos ($2000 c/u, costo $600 c/u -> ganancia $2800)
        #      + 1 Capuccino ($3000, costo $1000 -> ganancia $2000)
        registrar_venta(
            items_data=[
                {"producto_id": p1.id, "cantidad": 2},
                {"producto_id": p2.id, "cantidad": 1},
            ],
            medio_pago="EFECTIVO",
        )

        # Aumentamos el costo del Espresso de $600 a $1500 posteriormente
        p1.costo_total_calculado = Decimal("1500.0000")
        p1.save(update_fields=["costo_total_calculado"])

        resumen = obtener_ganancia_diaria()
        assert resumen["cantidad_tickets"] == 1
        assert resumen["unidades_vendidas"] == "3.00"
        assert resumen["ingresos_totales"] == "7000.00"
        assert resumen["costo_total_congelado"] == "2200.0000"
        assert resumen["ganancia_bruta_diaria"] == "4800.0000"
        assert resumen["margen_bruto_promedio"] == "0.6857"
        assert len(resumen["desglose_por_dia"]) == 1

    def test_ganancia_diaria_sin_ventas_retorna_ceros_y_desglose_vacio(self):
        """Caso borde: cuando no hay ventas en el período evaluado."""
        resumen = obtener_ganancia_diaria()
        assert resumen["cantidad_tickets"] == 0
        assert resumen["unidades_vendidas"] == "0.00"
        assert resumen["ingresos_totales"] == "0.00"
        assert resumen["costo_total_congelado"] == "0.0000"
        assert resumen["ganancia_bruta_diaria"] == "0.0000"
        assert resumen["margen_bruto_promedio"] == "0.0000"
        assert resumen["desglose_por_dia"] == []

    # =========================================================================
    # 2. Ranking de Productos (CA10.2)
    # =========================================================================

    def test_ranking_productos_mas_y_menos_vendidos_incluyendo_sin_rotacion_ca10_2(
        self, catalogo_productos
    ):
        """
        CA10.2: El ranking ordena por cantidad vendida (más vendidos y menos vendidos),
        incluyendo productos activos con 0 ventas en 'menos_vendidos' para alertar falta de rotación.
        """
        p1, p2, p3 = catalogo_productos

        registrar_venta(
            items_data=[
                {"producto_id": p2.id, "cantidad": 5},
                {"producto_id": p1.id, "cantidad": 2},
            ],
            medio_pago="EFECTIVO",
        )

        ranking_data = obtener_ranking_productos(limite=3)
        assert ranking_data["total_productos_evaluados"] == 3
        assert ranking_data["mas_vendidos"][0]["producto_id"] == p2.id
        assert ranking_data["mas_vendidos"][0]["unidades_vendidas"] == "5.00"
        assert ranking_data["mas_vendidos"][1]["producto_id"] == p1.id
        assert ranking_data["mas_vendidos"][1]["unidades_vendidas"] == "2.00"

        # El producto p3 (Té en Hebras) no tuvo ventas: debe figurar en 'menos_vendidos' con 0.00
        assert ranking_data["menos_vendidos"][0]["producto_id"] == p3.id
        assert ranking_data["menos_vendidos"][0]["unidades_vendidas"] == "0.00"

    def test_ranking_productos_limite_personalizado(self, catalogo_productos):
        """El límite restringe la cantidad de elementos devueltos en cada ranking."""
        p1, p2, _ = catalogo_productos
        registrar_venta(
            items_data=[
                {"producto_id": p1.id, "cantidad": 10},
                {"producto_id": p2.id, "cantidad": 5},
            ],
            medio_pago="EFECTIVO",
        )

        ranking_data = obtener_ranking_productos(limite=1)
        assert len(ranking_data["mas_vendidos"]) == 1
        assert ranking_data["mas_vendidos"][0]["producto_id"] == p1.id
        assert len(ranking_data["menos_vendidos"]) == 1

    def test_ranking_sin_productos_activos(self):
        """Caso borde: si no hay productos activos ni ventas, retorna listas vacías."""
        ranking_data = obtener_ranking_productos()
        assert ranking_data["mas_vendidos"] == []
        assert ranking_data["menos_vendidos"] == []
        assert ranking_data["total_productos_evaluados"] == 0

    # =========================================================================
    # 3. Punto de Equilibrio y Metas (CA11.1 y CA11.2)
    # =========================================================================

    def test_punto_equilibrio_y_metas_calculo_explicito_ca11_1_y_ca11_2(self):
        """
        Fórmulas matemáticas:
        - Margen Contribución = 1 - (costos_variables / ventas)
        - PE ($) = costos_fijos / Margen Contribución
        - Meta diaria = PE mensual / dias_operativos
        - Meta semanal = meta_diaria * dias_semana
        """
        # costos_fijos = $1.200.000, costos_variables = $800.000, ventas = $2.000.000
        # margen_contribucion = 1 - (800.000 / 2.000.000) = 0.6000
        # PE mensual = 1.200.000 / 0.60 = $2.000.000,00
        # Meta diaria (25 días) = $80.000,00
        # Meta semanal (6 días) = $480.000,00
        resultado = calcular_punto_equilibrio_y_metas(
            costos_fijos=Decimal("1200000.00"),
            costos_variables=Decimal("800000.00"),
            ventas=Decimal("2000000.00"),
            dias_operativos=25,
            dias_semana=6,
        )

        assert resultado["margen_contribucion"] == "0.6000"
        assert resultado["punto_equilibrio_mensual"] == "2000000.00"
        assert resultado["meta_diaria"] == "80000.00"
        assert resultado["meta_semanal"] == "480000.00"
        assert resultado["porcentaje_cumplimiento_pe"] == "100.00"

    def test_punto_equilibrio_con_tickets_reales_de_la_base_de_datos(
        self, catalogo_productos
    ):
        """Calcula el PE tomando automáticamente ventas y costos de los tickets emitidos."""
        p1, _, _ = catalogo_productos
        # 10 Espressos a $2000 ($20.000 ingresos) con costo unitario $600 ($6.000 costo variable)
        # margen_contribucion = 1 - (6000 / 20000) = 0.7000
        # PE con costos fijos de $700.000 = 700.000 / 0.70 = $1.000.000,00
        registrar_venta(
            items_data=[{"producto_id": p1.id, "cantidad": 10}],
            medio_pago="EFECTIVO",
        )

        resultado = calcular_punto_equilibrio_y_metas(
            costos_fijos=Decimal("700000.00"),
            dias_operativos=25,
            dias_semana=5,
        )

        assert resultado["ventas_referencia"] == "20000.00"
        assert resultado["costos_variables"] == "6000.00"
        assert resultado["margen_contribucion"] == "0.7000"
        assert resultado["punto_equilibrio_mensual"] == "1000000.00"
        assert resultado["meta_diaria"] == "40000.00"
        assert resultado["meta_semanal"] == "200000.00"
        assert resultado["porcentaje_cumplimiento_pe"] == "2.00"

    def test_punto_equilibrio_costos_fijos_cero_o_negativos_lanza_error(self):
        """Caso borde: costos fijos <= 0 debe ser rechazado."""
        with pytest.raises(
            ValueError, match="Los costos_fijos deben ser mayores a cero"
        ):
            calcular_punto_equilibrio_y_metas(
                costos_fijos=Decimal("0.00"),
                costos_variables=Decimal("100.00"),
                ventas=Decimal("500.00"),
            )

        with pytest.raises(
            ValueError, match="Los costos_fijos deben ser mayores a cero"
        ):
            calcular_punto_equilibrio_y_metas(
                costos_fijos=Decimal("-500.00"),
                costos_variables=Decimal("100.00"),
                ventas=Decimal("500.00"),
            )

    def test_punto_equilibrio_sin_ventas_lanza_error(self):
        """Caso borde: si no hay ventas registradas ni proporcionadas, no se puede calcular."""
        # Sin ventas en la BD y sin parámetro ventas
        with pytest.raises(
            ValueError, match="El monto de ventas debe ser mayor a cero"
        ):
            calcular_punto_equilibrio_y_metas(costos_fijos=Decimal("500000.00"))

        # Ventas explícitas en cero
        with pytest.raises(
            ValueError, match="El monto de ventas debe ser mayor a cero"
        ):
            calcular_punto_equilibrio_y_metas(
                costos_fijos=Decimal("500000.00"),
                costos_variables=Decimal("0.00"),
                ventas=Decimal("0.00"),
            )

    def test_punto_equilibrio_costos_variables_superan_o_igualan_ventas_lanza_error(
        self,
    ):
        """Caso borde: cuando costos variables >= ventas, el negocio pierde dinero por unidad vendida."""
        # Costos variables superan a ventas
        with pytest.raises(
            ValueError, match="Los costos_variables igualan o superan a las ventas"
        ):
            calcular_punto_equilibrio_y_metas(
                costos_fijos=Decimal("500000.00"),
                costos_variables=Decimal("120000.00"),
                ventas=Decimal("100000.00"),
            )

        # Costos variables igualan a ventas
        with pytest.raises(
            ValueError, match="Los costos_variables igualan o superan a las ventas"
        ):
            calcular_punto_equilibrio_y_metas(
                costos_fijos=Decimal("500000.00"),
                costos_variables=Decimal("100000.00"),
                ventas=Decimal("100000.00"),
            )

    def test_punto_equilibrio_dias_operativos_invalidos_lanza_error(self):
        """Caso borde: días operativos o de semana menores o iguales a cero."""
        with pytest.raises(
            ValueError, match="dias_operativos y dias_semana deben ser mayores a cero"
        ):
            calcular_punto_equilibrio_y_metas(
                costos_fijos=Decimal("100000.00"),
                costos_variables=Decimal("40000.00"),
                ventas=Decimal("100000.00"),
                dias_operativos=0,
            )

        with pytest.raises(
            ValueError, match="dias_operativos y dias_semana deben ser mayores a cero"
        ):
            calcular_punto_equilibrio_y_metas(
                costos_fijos=Decimal("100000.00"),
                costos_variables=Decimal("40000.00"),
                ventas=Decimal("100000.00"),
                dias_semana=0,
            )
