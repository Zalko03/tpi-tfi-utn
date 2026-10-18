"""Serializadores para proveedores, insumos y compras."""
from decimal import Decimal
from rest_framework import serializers
from apps.insumos.models import Proveedor, Insumo, Compra
from apps.insumos.services import registrar_compra_y_actualizar_costo


class ProveedorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Proveedor
        fields = ["id", "nombre", "estado_activo", "creado_en", "actualizado_en"]
        read_only_fields = ["id", "creado_en", "actualizado_en"]


class InsumoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Insumo
        fields = [
            "id",
            "nombre",
            "unidad_base",
            "costo_unitario",
            "estado_activo",
            "creado_en",
            "actualizado_en",
        ]
        read_only_fields = ["id", "costo_unitario", "creado_en", "actualizado_en"]

    def validate_unidad_base(self, value):
        if value not in ("g", "ml", "un"):
            raise serializers.ValidationError("La unidad base debe ser 'g', 'ml' o 'un'.")
        return value


class CompraSerializer(serializers.ModelSerializer):
    insumo_nombre = serializers.ReadOnlyField(source="insumo.nombre")
    proveedor_nombre = serializers.ReadOnlyField(source="proveedor.nombre")

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
            "fecha",
            "creado_en",
        ]
        read_only_fields = ["id", "costo_unitario_calculado", "creado_en"]

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
