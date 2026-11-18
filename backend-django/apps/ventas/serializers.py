"""Serializadores para ventas e ítems de venta."""

from decimal import Decimal

from rest_framework import exceptions, serializers

from apps.usuarios.permissions import usuario_tiene_permiso
from apps.ventas.models import Venta, VentaItem
from apps.ventas.services import registrar_venta


class VentaItemInputSerializer(serializers.Serializer):
    producto_id = serializers.IntegerField(required=False)
    producto = serializers.IntegerField(required=False)
    cantidad = serializers.DecimalField(max_digits=8, decimal_places=2, default=Decimal("1.00"))
    precio_unitario = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )

    def validate(self, attrs):
        if "producto_id" not in attrs and "producto" not in attrs:
            raise serializers.ValidationError("Elegí un producto para agregar a la venta.")
        if "producto_id" not in attrs:
            attrs["producto_id"] = attrs["producto"]
        return attrs


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
    id_operacion = serializers.UUIDField(required=False, allow_null=True)
    usuario_nombre = serializers.ReadOnlyField(source="turno_caja.usuario.username")
    anulada_por_nombre = serializers.ReadOnlyField(source="anulada_por.username")

    class Meta:
        model = Venta
        fields = [
            "id",
            "id_operacion",
            "turno_caja",
            "usuario_nombre",
            "fecha",
            "medio_pago",
            "origen",
            "estado",
            "anulada_en",
            "anulada_por",
            "anulada_por_nombre",
            "motivo_anulacion",
            "total",
            "costo_total_snapshot",
            "items",
            "items_entrada",
            "creado_en",
        ]
        read_only_fields = [
            "id",
            "usuario_nombre",
            "fecha",
            "estado",
            "anulada_en",
            "anulada_por",
            "anulada_por_nombre",
            "motivo_anulacion",
            "total",
            "costo_total_snapshot",
            "creado_en",
        ]

    def to_internal_value(self, data):
        if isinstance(data, dict):
            data = dict(data)
            if "items" in data and "items_entrada" not in data:
                data["items_entrada"] = data["items"]
            if "origen" in data and data["origen"] is not None:
                origen_norm = str(data["origen"]).strip().lower()
                if origen_norm in ("local", "caja", "propio"):
                    data["origen"] = "propio"
                elif origen_norm in ("importado", "offline"):
                    data["origen"] = origen_norm
        return super().to_internal_value(data)

    def validate(self, attrs):
        turno = attrs.get("turno_caja")
        request = self.context.get("request")
        if turno and request and hasattr(request, "user"):
            user = request.user
            if not getattr(user, "is_superuser", False):
                puede_ajenos = usuario_tiene_permiso(request, "caja.gestionar_turnos_ajenos")
                if turno.usuario_id and turno.usuario_id != user.id and not puede_ajenos:
                    raise exceptions.PermissionDenied(
                        "Tenés que usar tu propio turno de caja abierto."
                    )

        if turno and turno.estado != "ABIERTO":
            raise serializers.ValidationError(
                {"turno_caja": "No se puede registrar una venta en un turno de caja cerrado."}
            )

        if not attrs.get("items_entrada"):
            raise serializers.ValidationError(
                {"items_entrada": "La venta debe contener al menos un producto."}
            )

        return attrs

    def create(self, validated_data):
        items_data = validated_data.pop("items_entrada")
        try:
            return registrar_venta(
                items_data=items_data,
                medio_pago=validated_data.get("medio_pago", "EFECTIVO"),
                origen=validated_data.get("origen", "propio"),
                turno_caja=validated_data.get("turno_caja"),
                id_operacion=validated_data.get("id_operacion"),
            )
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        request = self.context.get("request")
        if (
            request
            and getattr(request, "method", "GET") != "POST"
            and not usuario_tiene_permiso(request, "caja.ver_efectivo_esperado")
        ):
            # Arqueo ciego estricto: un usuario sin caja.ver_efectivo_esperado no puede
            # consultar montos ni medios de pago históricos para reconstruir el arqueo.
            ret["total"] = None
            ret["medio_pago"] = None
            ret["costo_total_snapshot"] = None
            for item in ret.get("items") or []:
                if isinstance(item, dict):
                    item["precio_unitario"] = None
                    item["costo_unitario_snapshot"] = None
                    if "subtotal" in item:
                        item["subtotal"] = None
        return ret
