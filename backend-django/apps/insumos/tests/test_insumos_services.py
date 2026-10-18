"""Tests unitarios para servicios de insumos, conversión de unidades y costeo."""
from decimal import Decimal
import pytest
from apps.insumos.services import (
    convertir_a_unidad_base,
    calcular_costo_unitario,
    prorratear_envio,
)


class TestConversionUnidades:
    def test_conversion_kilos_a_gramos(self):
        resultado = convertir_a_unidad_base(Decimal("1"), "kg", "g")
        assert resultado == Decimal("1000.0000")

    def test_conversion_fraccion_kilo_a_gramos(self):
        resultado = convertir_a_unidad_base(Decimal("0.25"), "kg", "g")
        assert resultado == Decimal("250.0000")

    def test_conversion_litros_a_mililitros(self):
        resultado = convertir_a_unidad_base(Decimal("1.5"), "l", "ml")
        assert resultado == Decimal("1500.0000")

    def test_conversion_docena_a_unidades(self):
        resultado = convertir_a_unidad_base(Decimal("2"), "docena", "un")
        assert resultado == Decimal("24.0000")

    def test_error_en_unidades_incompatibles(self):
        with pytest.raises(ValueError, match="No se puede convertir"):
            convertir_a_unidad_base(Decimal("1"), "kg", "ml")

    def test_error_en_cantidad_cero_o_negativa(self):
        with pytest.raises(ValueError, match="mayor a cero"):
            convertir_a_unidad_base(Decimal("0"), "kg", "g")
        with pytest.raises(ValueError, match="mayor a cero"):
            convertir_a_unidad_base(Decimal("-5"), "kg", "g")


class TestCalculoCostoUnitario:
    def test_caso_excel_restock_lote_completo(self):
        """
        Falla del Excel resuelta: El dueño compró 100 chipás por $8.000 en lote.
        El sistema debe calcular $80 por unidad, evitando márgenes absurdos negativos.
        """
        costo_unitario = calcular_costo_unitario(
            precio_total=Decimal("8000.00"),
            cantidad=Decimal("100"),
            unidad="un",
            unidad_base="un",
            envio=Decimal("0.00"),
            iva_incluido=True,
        )
        assert costo_unitario == Decimal("80.0000")

    def test_costo_con_envio_prorrateado_y_conversion_gramos(self):
        """
        Bolsa de café 1 kg comprada a $25.000 con envío prorrateado de $2.500.
        Total = $27.500 / 1000 g = $27.5000 por gramo.
        """
        costo_gramo = calcular_costo_unitario(
            precio_total=Decimal("25000.00"),
            cantidad=Decimal("1"),
            unidad="kg",
            unidad_base="g",
            envio=Decimal("2500.00"),
            iva_incluido=True,
        )
        assert costo_gramo == Decimal("27.5000")

    def test_costo_con_iva_no_incluido(self):
        """
        Compra de $10.000 + 21% de IVA (alícuota 21%) para 100 unidades base.
        Monto con IVA = $12.100 / 100 = $121.0000.
        """
        costo = calcular_costo_unitario(
            precio_total=Decimal("10000.00"),
            cantidad=Decimal("100"),
            unidad="un",
            unidad_base="un",
            iva_incluido=False,
            alicuota=Decimal("21.00"),
            costear_con_iva=True,
        )
        assert costo == Decimal("121.0000")

    def test_error_cantidad_cero_evita_division_por_cero(self):
        with pytest.raises(ValueError, match="mayor a cero"):
            calcular_costo_unitario(
                precio_total=Decimal("5000.00"),
                cantidad=Decimal("0"),
                unidad="kg",
                unidad_base="g",
            )


class TestProrrateoEnvio:
    def test_prorrateo_proporcional_al_valor(self):
        """
        Dos líneas: una de $30.000 (75%) y otra de $10.000 (25%).
        Envío total = $4.000 -> Línea 1 recibe $3.000, Línea 2 recibe $1.000.
        """
        lineas = [
            {"precio_total": Decimal("30000.00")},
            {"precio_total": Decimal("10000.00")},
        ]
        resultado = prorratear_envio(lineas, Decimal("4000.00"))
        assert resultado == [Decimal("3000.00"), Decimal("1000.00")]

    def test_prorrateo_con_envio_cero(self):
        lineas = [{"precio_total": Decimal("5000.00")}]
        assert prorratear_envio(lineas, Decimal("0.00")) == [Decimal("0.00")]
