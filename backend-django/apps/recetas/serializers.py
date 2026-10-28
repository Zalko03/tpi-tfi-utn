"""Serializadores para productos y recetas."""

from decimal import Decimal
from rest_framework import serializers
from apps.recetas.models import Producto, RecetaItem
from apps.recetas.services import actualizar_costo_y_margen_producto


class RecetaItemSerializer(serializers.ModelSerializer):
    insumo_nombre = serializers.ReadOnlyField(source="insumo.nombre")
    insumo_unidad_base = serializers.ReadOnlyField(source="insumo.unidad_base")
    insumo_costo_unitario = serializers.ReadOnlyField(source="insumo.costo_unitario")

    class Meta:
        model = RecetaItem
        fields = [
            "id",
            "insumo",
            "insumo_nombre",
            "insumo_unidad_base",
            "insumo_costo_unitario",
            "cantidad",
            "unidad",
        ]

    def validate_cantidad(self, value):
        if Decimal(str(value)) <= Decimal("0"):
            raise serializers.ValidationError(
                "La cantidad del insumo en la receta debe ser mayor a cero."
            )
        return value


class ProductoSerializer(serializers.ModelSerializer):
    receta_items = RecetaItemSerializer(many=True, read_only=True)

    class Meta:
        model = Producto
        fields = [
            "id",
            "nombre",
            "codigo_barras",
            "precio_venta",
            "minutos_mano_obra",
            "costo_hora_mano_obra",
            "descartables",
            "costo_total_calculado",
            "ganancia_bruta",
            "margen_bruto",
            "receta_items",
            "estado_activo",
            "creado_en",
            "actualizado_en",
        ]
        read_only_fields = [
            "id",
            "costo_total_calculado",
            "ganancia_bruta",
            "margen_bruto",
            "creado_en",
            "actualizado_en",
        ]

    def validate_precio_venta(self, value):
        if Decimal(str(value)) <= Decimal("0"):
            raise serializers.ValidationError(
                "El precio de venta debe ser mayor a cero."
            )
        return value

    def validate_minutos_mano_obra(self, value):
        if Decimal(str(value or 0)) < Decimal("0"):
            raise serializers.ValidationError(
                "Los minutos de mano de obra no pueden ser negativos."
            )
        return value

    def create(self, validated_data):
        producto = super().create(validated_data)
        actualizar_costo_y_margen_producto(producto)
        return producto

    def update(self, instance, validated_data):
        producto = super().update(instance, validated_data)
        actualizar_costo_y_margen_producto(producto)
        return producto

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            usuario = request.user
            tiene_costos = False
            if getattr(usuario, "is_superuser", False):
                tiene_costos = True
            elif hasattr(usuario, "perfil") and usuario.perfil:
                tiene_costos = usuario.perfil.tiene_permiso("recetas.ver_costos")
            else:
                payload = getattr(request.auth, "payload", None)
                if payload is None and hasattr(request.auth, "get"):
                    payload = request.auth
                token_permisos = payload.get("permisos", []) if payload else []
                tiene_costos = "recetas.ver_costos" in token_permisos

            if not tiene_costos:
                ret["costo_total_calculado"] = None
                ret["ganancia_bruta"] = None
                ret["margen_bruto"] = None
                if "receta_items" in ret and isinstance(ret["receta_items"], list):
                    for item in ret["receta_items"]:
                        item["insumo_costo_unitario"] = None
        return ret
