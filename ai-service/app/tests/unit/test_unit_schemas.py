"""Tests unitarios de validación de esquemas Pydantic v2 (app/schemas/)."""
from decimal import Decimal
import pytest
from pydantic import ValidationError
from app.schemas.extraccion import (
    ItemPrecioExtraido,
    SalidaIAExtraccionPrecios,
    SolicitudExtraccionPrecios,
)
from app.schemas.resumen import (
    ProductoRendimientoEntrada,
    SalidaIAResumenSemanal,
    SolicitudResumenSemanal,
)


class TestUnitSchemasExtraccion:
    """Pruebas unitarias para los esquemas de extracción de precios."""

    def test_solicitud_extraccion_valida(self):
        solicitud = SolicitudExtraccionPrecios(
            texto_lista="  Café en grano 1 kg $18500  ",
            proveedor_nombre="Distribuidora Norte",
            version_prompt="v1",
        )
        assert solicitud.texto_lista == "Café en grano 1 kg $18500"
        assert solicitud.proveedor_nombre == "Distribuidora Norte"
        assert solicitud.version_prompt == "v1"

    def test_solicitud_extraccion_rechaza_texto_vacio_o_espacios(self):
        with pytest.raises(ValidationError):
            SolicitudExtraccionPrecios(texto_lista="     ")

    def test_solicitud_extraccion_rechaza_version_prompt_invalida(self):
        with pytest.raises(ValidationError):
            SolicitudExtraccionPrecios(
                texto_lista="Leche entera 1 l $1200",
                version_prompt="../v1",
            )

    def test_item_precio_extraido_convierte_a_decimal_y_normaliza_unidad(self):
        item = ItemPrecioExtraido(
            nombre_insumo="  Leche entera larga vida ",
            cantidad="12",
            unidad="LITRO",
            precio_total="14400.50",
            iva_incluido=True,
            alicuota="21.00",
            confianza="0.95",
        )
        assert item.nombre_insumo == "Leche entera larga vida"
        assert isinstance(item.cantidad, Decimal)
        assert item.cantidad == Decimal("12")
        assert item.unidad == "l"
        assert isinstance(item.precio_total, Decimal)
        assert item.precio_total == Decimal("14400.50")

    @pytest.mark.parametrize(
        "unidad_entrada,unidad_esperada",
        [
            ("kilo", "kg"),
            ("KG", "kg"),
            ("g", "g"),
            ("ml", "ml"),
            ("litro", "l"),
            ("lt", "l"),
            ("u", "un"),
            ("unidad", "un"),
            ("docena", "docena"),
        ],
    )
    def test_item_normaliza_variantes_de_unidades(self, unidad_entrada, unidad_esperada):
        item = ItemPrecioExtraido(
            nombre_insumo="Insumo prueba",
            cantidad="1",
            unidad=unidad_entrada,
            precio_total="1000",
        )
        assert item.unidad == unidad_esperada

    def test_item_rechaza_unidad_desconocida(self):
        with pytest.raises(ValidationError):
            ItemPrecioExtraido(
                nombre_insumo="Café",
                cantidad="1",
                unidad="bolson",
                precio_total="5000",
            )

    @pytest.mark.parametrize("valor_invalido", ["0", "-5", "0.00"])
    def test_item_rechaza_cantidad_no_positiva(self, valor_invalido):
        with pytest.raises(ValidationError):
            ItemPrecioExtraido(
                nombre_insumo="Café",
                cantidad=valor_invalido,
                unidad="kg",
                precio_total="5000",
            )

    @pytest.mark.parametrize("precio_invalido", ["0", "-100.50"])
    def test_item_rechaza_precio_total_no_positivo(self, precio_invalido):
        with pytest.raises(ValidationError):
            ItemPrecioExtraido(
                nombre_insumo="Café",
                cantidad="1",
                unidad="kg",
                precio_total=precio_invalido,
            )

    def test_salida_ia_extraccion_valida_estructura_completa(self):
        datos = {
            "proveedor_detectado": "Tostadero Sur",
            "envio_detectado": "2500.00",
            "moneda": "ARS",
            "items": [
                {
                    "nombre_insumo": "Café Brasil",
                    "cantidad": "5",
                    "unidad": "kg",
                    "precio_total": "75000.00",
                }
            ],
            "advertencias": [],
        }
        salida = SalidaIAExtraccionPrecios.model_validate(datos)
        assert salida.envio_detectado == Decimal("2500.00")
        assert len(salida.items) == 1
        assert salida.items[0].precio_total == Decimal("75000.00")


class TestUnitSchemasResumen:
    """Pruebas unitarias para los esquemas de resumen semanal."""

    def test_solicitud_resumen_semanal_valida(self):
        solicitud = SolicitudResumenSemanal(
            fecha_desde="2026-10-20",
            fecha_hasta="2026-10-27",
            total_ventas="500000.00",
            ganancia_bruta_total="300000.00",
            cantidad_tickets=150,
            productos=[
                ProductoRendimientoEntrada(
                    nombre="Espresso Doble",
                    unidades_vendidas=80,
                    ingresos_totales="160000.00",
                    ganancia_bruta="112000.00",
                    margen_bruto_pct="70.00",
                )
            ],
        )
        assert solicitud.total_ventas == Decimal("500000.00")
        assert len(solicitud.productos) == 1

    def test_solicitud_resumen_rechaza_lista_productos_vacia(self):
        with pytest.raises(ValidationError):
            SolicitudResumenSemanal(
                fecha_desde="2026-10-20",
                fecha_hasta="2026-10-27",
                total_ventas="500000.00",
                ganancia_bruta_total="300000.00",
                cantidad_tickets=150,
                productos=[],
            )

    def test_salida_ia_resumen_rechaza_texto_demasiado_corto(self):
        with pytest.raises(ValidationError):
            SalidaIAResumenSemanal(resumen_ejecutivo="Corto")
