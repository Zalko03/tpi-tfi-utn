"""Serializadores para proveedores, insumos, compras y configuración fiscal."""

from decimal import Decimal

from rest_framework import serializers

from apps.insumos.models import (
    CONDICION_EXENTO,
    CONDICION_MONOTRIBUTISTA,
    CONDICION_RESPONSABLE_INSCRIPTO,
    Compra,
    Insumo,
    MovimientoStock,
    Proveedor,
)
from apps.insumos.services import (
    obtener_criterio_iva_vigente,
    registrar_compra_y_actualizar_costo,
)


class ProveedorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Proveedor
        fields = ["id", "nombre", "estado_activo", "creado_en", "actualizado_en"]
        read_only_fields = ["id", "creado_en", "actualizado_en"]


class InsumoSerializer(serializers.ModelSerializer):
    stock_bajo = serializers.BooleanField(read_only=True)

    class Meta:
        model = Insumo
        fields = [
            "id",
            "nombre",
            "unidad_base",
            "costo_unitario",
            "stock_actual",
            "stock_minimo",
            "stock_bajo",
            "estado_activo",
            "creado_en",
            "actualizado_en",
        ]
        read_only_fields = [
            "id",
            "costo_unitario",
            "stock_actual",
            "stock_bajo",
            "creado_en",
            "actualizado_en",
        ]

    def validate_unidad_base(self, value):
        if value not in ("g", "ml", "un"):
            raise serializers.ValidationError("La unidad base debe ser 'g', 'ml' o 'un'.")
        return value

    def validate_stock_minimo(self, value):
        if value is not None and Decimal(str(value)) < Decimal("0"):
            raise serializers.ValidationError("El stock mínimo no puede ser negativo.")
        return value


class AjusteStockSerializer(serializers.Serializer):
    """Valida una solicitud de ajuste manual de stock de un insumo (HU12)."""

    tipo = serializers.ChoiceField(
        choices=[("INGRESO", "Ingreso"), ("EGRESO", "Egreso")],
        error_messages={"invalid_choice": "El tipo de ajuste debe ser INGRESO o EGRESO."},
    )
    cantidad = serializers.DecimalField(max_digits=14, decimal_places=4)
    unidad = serializers.CharField(max_length=10, required=False, allow_blank=True, default="")
    motivo = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")

    def validate_cantidad(self, value):
        if Decimal(str(value)) <= Decimal("0"):
            raise serializers.ValidationError("La cantidad del ajuste debe ser mayor a cero.")
        return value


class MovimientoStockSerializer(serializers.ModelSerializer):
    insumo_nombre = serializers.ReadOnlyField(source="insumo.nombre")
    unidad_base = serializers.ReadOnlyField(source="insumo.unidad_base")
    usuario_nombre = serializers.ReadOnlyField(source="usuario.username")

    class Meta:
        model = MovimientoStock
        fields = [
            "id",
            "insumo",
            "insumo_nombre",
            "unidad_base",
            "tipo",
            "subtipo",
            "cantidad_base",
            "stock_anterior",
            "stock_posterior",
            "compra",
            "venta",
            "usuario",
            "usuario_nombre",
            "motivo",
            "fecha",
            "creado_en",
        ]
        read_only_fields = fields


class CompraSerializer(serializers.ModelSerializer):
    insumo_nombre = serializers.ReadOnlyField(source="insumo.nombre")
    proveedor_nombre = serializers.ReadOnlyField(source="proveedor.nombre")
    costear_con_iva = serializers.SerializerMethodField()
    aviso_fiscal = serializers.SerializerMethodField()

    class Meta:
        model = Compra
        fields = [
            "id",
            "proveedor",
            "proveedor_nombre",
            "insumo",
            "insumo_nombre",
            "precio_total",
            "cantidad",
            "unidad",
            "envio",
            "iva_incluido",
            "alicuota",
            "costo_unitario_calculado",
            "costear_con_iva",
            "aviso_fiscal",
            "fecha",
            "creado_en",
        ]
        read_only_fields = [
            "id",
            "costo_unitario_calculado",
            "costear_con_iva",
            "aviso_fiscal",
            "creado_en",
        ]

    def _obtener_criterio_contexto(self) -> dict:
        criterio = self.context.get("_criterio_fiscal")
        if criterio is None:
            criterio = obtener_criterio_iva_vigente()
            self.context["_criterio_fiscal"] = criterio
        return criterio

    def get_costear_con_iva(self, obj) -> bool:
        if hasattr(obj, "_costear_con_iva_aplicado"):
            return bool(obj._costear_con_iva_aplicado)
        return bool(self._obtener_criterio_contexto()["costear_con_iva"])

    def get_aviso_fiscal(self, obj) -> str | None:
        if hasattr(obj, "_aviso_fiscal"):
            return obj._aviso_fiscal
        return self._obtener_criterio_contexto()["aviso"]

    def validate_cantidad(self, value):
        if Decimal(str(value)) <= Decimal("0"):
            raise serializers.ValidationError("La cantidad adquirida debe ser mayor a cero.")
        return value

    def validate_precio_total(self, value):
        if Decimal(str(value)) < Decimal("0"):
            raise serializers.ValidationError("El precio total no puede ser negativo.")
        return value

    def validate_envio(self, value):
        if Decimal(str(value or 0)) < Decimal("0"):
            raise serializers.ValidationError("El costo de envío no puede ser negativo.")
        return value

    def create(self, validated_data):
        try:
            return registrar_compra_y_actualizar_costo(
                proveedor=validated_data["proveedor"],
                insumo=validated_data["insumo"],
                precio_total=validated_data["precio_total"],
                cantidad=validated_data["cantidad"],
                unidad=validated_data["unidad"],
                envio=validated_data.get("envio", Decimal("0.00")),
                iva_incluido=validated_data.get("iva_incluido", True),
                alicuota=validated_data.get("alicuota", Decimal("21.00")),
                fecha=validated_data.get("fecha"),
            )
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc


class ItemConfirmacionImportacionSerializer(serializers.Serializer):
    insumo_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    nombre_insumo = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=150
    )
    cantidad = serializers.DecimalField(max_digits=12, decimal_places=4)
    unidad = serializers.CharField(max_length=10)
    precio_total = serializers.DecimalField(max_digits=12, decimal_places=2)
    iva_incluido = serializers.BooleanField(default=True, required=False)
    alicuota = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("21.00"),
        required=False,
    )
    unidad_base = serializers.ChoiceField(
        choices=["g", "ml", "un"], required=False, allow_null=True
    )

    def validate_cantidad(self, value):
        if Decimal(str(value)) <= Decimal("0"):
            raise serializers.ValidationError("La cantidad adquirida debe ser mayor a cero.")
        return value

    def validate_precio_total(self, value):
        if Decimal(str(value)) <= Decimal("0"):
            raise serializers.ValidationError("El precio total debe ser mayor a cero.")
        return value

    def validate(self, attrs):
        insumo_id = attrs.get("insumo_id")
        nombre = (attrs.get("nombre_insumo") or "").strip()
        if not insumo_id and not nombre:
            raise serializers.ValidationError("Cada ítem debe indicar un insumo.")
        return attrs


class ConfirmarImportacionComprasSerializer(serializers.Serializer):
    proveedor_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    proveedor_nombre = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=150
    )
    envio = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        required=False,
    )
    items = ItemConfirmacionImportacionSerializer(many=True, allow_empty=False)

    def validate_envio(self, value):
        if Decimal(str(value or 0)) < Decimal("0"):
            raise serializers.ValidationError("El costo de envío no puede ser negativo.")
        return value

    def validate(self, attrs):
        proveedor_id = attrs.get("proveedor_id")
        proveedor_nombre = (attrs.get("proveedor_nombre") or "").strip()
        if not proveedor_id and not proveedor_nombre:
            raise serializers.ValidationError("Elegí o escribí un proveedor.")
        return attrs


class ConfiguracionFiscalActualizarSerializer(serializers.Serializer):
    """Valida la condición fiscal declarada por el dueño del local (HU14)."""

    condicion_fiscal = serializers.ChoiceField(
        choices=[
            (CONDICION_RESPONSABLE_INSCRIPTO, "Responsable Inscripto"),
            (CONDICION_MONOTRIBUTISTA, "Monotributista"),
            (CONDICION_EXENTO, "IVA Exento"),
        ],
        error_messages={
            "required": "Elegí una condición fiscal para guardar.",
            "invalid_choice": (
                "Elegí una condición fiscal válida: Responsable Inscripto, Monotributista o IVA Exento."
            ),
        },
    )
