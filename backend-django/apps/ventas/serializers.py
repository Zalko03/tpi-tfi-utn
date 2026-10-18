"""Serializadores para ventas e ítems de venta."""
from decimal import Decimal
from rest_framework import serializers
from apps.ventas.models import Venta, VentaItem
from apps.ventas.services import registrar_venta


class VentaItemInputSerializer(serializers.Serializer):
    producto_id = serializers.IntegerField()
    cantidad = serializers.DecimalField(max_digits=8, decimal_places=2, default=Decimal("1.00"))
    precio_unitario = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)


class VentaItemDetailSerializer(serializers.ModelSerializer):
    producto_nombre = serializers.ReadOnlyField(source="producto.nombre")

    class Meta:
        model = VentaItem
        fields = [
            "id",
            "producto",
            "producto_nombre",
            "cantidad",
            "precio_unitario",
            "costo_unitario_snapshot",
        ]


class VentaSerializer(serializers.ModelSerializer):
    items = VentaItemDetailSerializer(many=True, read_only=True)
    items_entrada = VentaItemInputSerializer(many=True, write_only=True, required=True)

    class Meta:
        model = Venta
        fields = [
            "id",
            "turno_caja",
            "fecha",
            "medio_pago",
            "origen",
            "total",
            "costo_total_snapshot",
            "items",
            "items_entrada",
            "creado_en",
        ]
        read_only_fields = ["id", "fecha", "total", "costo_total_snapshot", "creado_en"]

    def create(self, validated_data):
        items_data = validated_data.pop("items_entrada")
        return registrar_venta(
            items_data=items_data,
            medio_pago=validated_data.get("medio_pago", "EFECTIVO"),
            origen=validated_data.get("origen", "propio"),
            turno_caja=validated_data.get("turno_caja"),
        )
