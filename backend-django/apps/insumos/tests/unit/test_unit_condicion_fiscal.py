"""Tests unitarios para configuración fiscal del local, cálculo de IVA y recálculo (HU14)."""

from decimal import Decimal

import pytest

from apps.insumos.models import (
    CONDICION_EXENTO,
    CONDICION_MONOTRIBUTISTA,
    CONDICION_NO_DECLARADA,
    CONDICION_RESPONSABLE_INSCRIPTO,
    ConfiguracionLocal,
    HistorialCondicionFiscal,
    Insumo,
    Proveedor,
)
from apps.insumos.services import (
    actualizar_condicion_fiscal,
    obtener_criterio_iva_vigente,
    registrar_compra_y_actualizar_costo,
    registrar_lote_compras_importacion,
)
from apps.recetas.models import Producto, RecetaItem
from apps.recetas.services import actualizar_costo_y_margen_producto
from apps.usuarios.constantes import ROL_DUENIO
from apps.usuarios.services import crear_personal


@pytest.mark.django_db
class TestUnitCondicionFiscal:
    @pytest.fixture
    def duenio(self):
        return crear_personal(
            datos_usuario={"username": "duenio_fiscal_unit", "password": "password123"},
            rol=ROL_DUENIO,
        )

    @pytest.fixture
    def escenario_cafe(self):
        proveedor = Proveedor.objects.create(nombre="Tostadores del Litoral")
        cafe = Insumo.objects.create(
            nombre="Café Molido Fiscal",
            unidad_base="g",
            costo_unitario=Decimal("0.0000"),
        )
        # Compra inicial con IVA incluido (21%): $12.100 por 1 kg = $12.1000/g con IVA, $10.0000/g sin IVA
        registrar_compra_y_actualizar_costo(
            proveedor=proveedor,
            insumo=cafe,
            precio_total=Decimal("12100.00"),
            cantidad=Decimal("1"),
            unidad="kg",
            envio=Decimal("0.00"),
            iva_incluido=True,
            alicuota=Decimal("21.00"),
        )
        espresso = Producto.objects.create(
            nombre="Espresso Fiscal",
            precio_venta=Decimal("2500.00"),
            minutos_mano_obra=Decimal("0.00"),
            costo_hora_mano_obra=Decimal("2500.00"),
            descartables=Decimal("0.00"),
        )
        RecetaItem.objects.create(
            producto=espresso,
            insumo=cafe,
            cantidad=Decimal("20.0000"),
            unidad="g",
        )
        actualizar_costo_y_margen_producto(espresso)
        return {"proveedor": proveedor, "cafe": cafe, "espresso": espresso}

    def test_criterio_por_defecto_sin_declarar_costea_con_iva_y_avisa(self, escenario_cafe):
        """CA14.2: sin declaración, costea con IVA (lo realmente pagado) y emite aviso."""
        criterio = obtener_criterio_iva_vigente()
        assert criterio["condicion_fiscal"] == CONDICION_NO_DECLARADA
        assert criterio["declarada"] is False
        assert criterio["costear_con_iva"] is True
        assert criterio["aviso"] is not None and "condición fiscal" in criterio["aviso"].lower()

        cafe = escenario_cafe["cafe"]
        espresso = escenario_cafe["espresso"]
        cafe.refresh_from_db()
        espresso.refresh_from_db()
        assert cafe.costo_unitario == Decimal("12.1000")
        assert espresso.costo_total_calculado == Decimal("242.0000")

    def test_responsable_inscripto_excluye_iva_y_recalcula_recetas_con_historial(
        self, duenio, escenario_cafe, monkeypatch
    ):
        """
        CA14.1 y CA14.3: cambiar a Responsable Inscripto recalcula insumos y productos
        afectados excluyendo el IVA, guarda historial y notifica a Node.
        """
        notificaciones = []
        monkeypatch.setattr(
            "apps.insumos.services.notificar_evento_node",
            lambda evento, datos: notificaciones.append((evento, datos)) or True,
        )

        resultado = actualizar_condicion_fiscal(
            condicion_nueva=CONDICION_RESPONSABLE_INSCRIPTO,
            usuario=duenio,
        )

        assert resultado["condicion_fiscal"] == CONDICION_RESPONSABLE_INSCRIPTO
        assert resultado["declarada"] is True
        assert resultado["costear_con_iva"] is False
        assert resultado["aviso"] is None
        assert resultado["cambio_realizado"] is True
        assert resultado["insumos_recalculados"] == 1
        assert resultado["productos_recalculados"] == 1

        cafe = escenario_cafe["cafe"]
        espresso = escenario_cafe["espresso"]
        cafe.refresh_from_db()
        espresso.refresh_from_db()

        assert cafe.costo_unitario == Decimal("10.0000")
        assert espresso.costo_total_calculado == Decimal("200.0000")
        assert espresso.ganancia_bruta == Decimal("2300.0000")

        historial = HistorialCondicionFiscal.objects.all()
        assert historial.count() == 1
        reg = historial.first()
        assert reg.condicion_anterior == CONDICION_NO_DECLARADA
        assert reg.condicion_nueva == CONDICION_RESPONSABLE_INSCRIPTO
        assert reg.costear_con_iva_anterior is True
        assert reg.costear_con_iva_nuevo is False
        assert reg.insumos_recalculados == 1
        assert reg.productos_recalculados == 1
        assert reg.modificado_por == duenio
        assert reg.detalles["productos"][0]["costo_anterior"] == "242.0000"
        assert reg.detalles["productos"][0]["costo_nuevo"] == "200.0000"

        assert len(notificaciones) == 1
        evento, payload = notificaciones[0]
        assert evento == "costos.recalculados"
        assert payload["condicionFiscal"] == CONDICION_RESPONSABLE_INSCRIPTO
        assert payload["productosRecalculados"][0]["costoNuevo"] == "200.0000"

    def test_nueva_compra_con_iva_no_incluido_respeta_responsable_inscripto_y_monotributista(
        self, duenio
    ):
        """
        CA14.1: con precio neto + 21% IVA (iva_incluido=False):
        - Responsable Inscripto toma neto ($10/un).
        - Monotributista o Exento suma el IVA ($12.10/un).
        """
        prov = Proveedor.objects.create(nombre="Envases del Norte")
        vaso = Insumo.objects.create(nombre="Vaso Térmico", unidad_base="un")

        actualizar_condicion_fiscal(CONDICION_RESPONSABLE_INSCRIPTO, usuario=duenio)
        compra_ri = registrar_compra_y_actualizar_costo(
            proveedor=prov,
            insumo=vaso,
            precio_total=Decimal("1000.00"),
            cantidad=Decimal("100"),
            unidad="un",
            iva_incluido=False,
            alicuota=Decimal("21.00"),
        )
        assert compra_ri.costo_unitario_calculado == Decimal("10.0000")
        assert compra_ri._aviso_fiscal is None

        actualizar_condicion_fiscal(CONDICION_MONOTRIBUTISTA, usuario=duenio)
        compra_mono = registrar_compra_y_actualizar_costo(
            proveedor=prov,
            insumo=vaso,
            precio_total=Decimal("1000.00"),
            cantidad=Decimal("100"),
            unidad="un",
            iva_incluido=False,
            alicuota=Decimal("21.00"),
        )
        assert compra_mono.costo_unitario_calculado == Decimal("12.1000")

        actualizar_condicion_fiscal(CONDICION_EXENTO, usuario=duenio)
        vaso.refresh_from_db()
        assert vaso.costo_unitario == Decimal("12.1000")
        assert HistorialCondicionFiscal.objects.count() == 3

    def test_importacion_en_lote_aplica_condicion_fiscal_vigente(self, duenio):
        """registrar_lote_compras_importacion usa el criterio fiscal vigente cuando no se fuerza."""
        actualizar_condicion_fiscal(CONDICION_RESPONSABLE_INSCRIPTO, usuario=duenio)

        resultado = registrar_lote_compras_importacion(
            proveedor_nombre="Mayorista Fiscal",
            envio_total=Decimal("0.00"),
            items=[
                {
                    "nombre_insumo": "Azúcar Fiscal",
                    "cantidad": Decimal("1"),
                    "unidad": "kg",
                    "precio_total": Decimal("1210.00"),
                    "iva_incluido": True,
                    "alicuota": Decimal("21.00"),
                }
            ],
        )
        assert resultado["costear_con_iva"] is False
        assert resultado["aviso_fiscal"] is None
        assert resultado["compras_creadas"][0]["costo_unitario_calculado"] == "1.0000"

    def test_cambio_fiscal_no_falla_si_node_lanza_error(self, duenio, escenario_cafe, monkeypatch):
        """La actualización fiscal en PostgreSQL se guarda aunque Node falle."""
        monkeypatch.setattr(
            "apps.insumos.services.notificar_evento_node",
            lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("Node caído")),
        )
        resultado = actualizar_condicion_fiscal(CONDICION_RESPONSABLE_INSCRIPTO, usuario=duenio)
        assert resultado["condicion_fiscal"] == CONDICION_RESPONSABLE_INSCRIPTO
        assert ConfiguracionLocal.objects.count() == 1
        assert HistorialCondicionFiscal.objects.count() == 1

    def test_rechaza_condicion_no_declarada_o_invalida(self, duenio):
        with pytest.raises(ValueError, match="condición fiscal válida"):
            actualizar_condicion_fiscal(CONDICION_NO_DECLARADA, usuario=duenio)
        with pytest.raises(ValueError, match="condición fiscal válida"):
            actualizar_condicion_fiscal("OTRA_INVENTADA", usuario=duenio)
