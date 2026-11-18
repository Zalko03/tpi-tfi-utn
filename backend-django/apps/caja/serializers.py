"""Serializadores para turnos y movimientos de caja."""

from decimal import Decimal

from rest_framework import serializers

from apps.caja.models import MovimientoCaja, TurnoCaja
from apps.usuarios.permissions import usuario_tiene_permiso


class MovimientoCajaSerializer(serializers.ModelSerializer):
    class Meta:
        model = MovimientoCaja
        fields = ["id", "turno_caja", "tipo", "monto", "motivo", "fecha"]

    def to_internal_value(self, data):
        if isinstance(data, dict) and "tipo" in data:
            data = dict(data)
            mapa_alias = {"INGRESO": "ENTRADA", "EGRESO": "SALIDA"}
            tipo_raw = str(data.get("tipo", "")).strip().upper()
            if tipo_raw in mapa_alias:
                data["tipo"] = mapa_alias[tipo_raw]
        return super().to_internal_value(data)

    def validate_monto(self, value):
        if Decimal(str(value)) <= Decimal("0"):
            raise serializers.ValidationError("El monto del movimiento debe ser mayor a cero.")
        return value


class TurnoCajaSerializer(serializers.ModelSerializer):
    movimientos = MovimientoCajaSerializer(many=True, read_only=True)
    usuario_nombre = serializers.ReadOnlyField(source="usuario.username")
    ventas_efectivo_total = serializers.SerializerMethodField()
    cantidad_tickets = serializers.SerializerMethodField()

    class Meta:
        model = TurnoCaja
        fields = [
            "id",
            "usuario",
            "usuario_nombre",
            "apertura",
            "cierre",
            "efectivo_inicial",
            "efectivo_contado",
            "efectivo_esperado",
            "diferencia",
            "estado",
            "movimientos",
            "ventas_efectivo_total",
            "cantidad_tickets",
        ]
        read_only_fields = [
            "id",
            "usuario_nombre",
            "cierre",
            "efectivo_esperado",
            "diferencia",
            "ventas_efectivo_total",
            "cantidad_tickets",
        ]

    def to_internal_value(self, data):
        if isinstance(data, dict):
            data = dict(data)
            if "monto_apertura" in data and "efectivo_inicial" not in data:
                data["efectivo_inicial"] = data["monto_apertura"]
        return super().to_internal_value(data)

    def get_ventas_efectivo_total(self, obj) -> str:
        from decimal import InvalidOperation

        from django.db.models import Sum

        try:
            cache_prefetch = getattr(obj, "_prefetched_objects_cache", None)
            if isinstance(cache_prefetch, dict) and "ventas" in cache_prefetch:
                total = sum(
                    (
                        v.total
                        for v in obj.ventas.all()
                        if v.medio_pago == "EFECTIVO"
                        and getattr(v, "estado", "EMITIDA") == "EMITIDA"
                    ),
                    Decimal("0.00"),
                )
            else:
                agregado = obj.ventas.filter(medio_pago="EFECTIVO", estado="EMITIDA").aggregate(
                    total=Sum("total")
                )
                total = (agregado.get("total") if isinstance(agregado, dict) else None) or Decimal(
                    "0.00"
                )
            return str(Decimal(str(total)).quantize(Decimal("0.01")))
        except (InvalidOperation, TypeError, ValueError, AttributeError):
            return "0.00"

    def get_cantidad_tickets(self, obj) -> int:
        try:
            cache_prefetch = getattr(obj, "_prefetched_objects_cache", None)
            if isinstance(cache_prefetch, dict) and "ventas" in cache_prefetch:
                return sum(
                    1 for v in obj.ventas.all() if getattr(v, "estado", "EMITIDA") == "EMITIDA"
                )
            conteo = obj.ventas.filter(estado="EMITIDA").count()
            return int(conteo) if isinstance(conteo, (int, float)) else 0
        except (TypeError, ValueError, AttributeError):
            return 0

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            if not usuario_tiene_permiso(request, "caja.ver_efectivo_esperado"):
                ret["efectivo_inicial"] = None
                ret["efectivo_esperado"] = None
                ret["diferencia"] = None
                ret["ventas_efectivo_total"] = None
                ret["cantidad_tickets"] = None
                usuario_id = getattr(request.user, "id", None)
                es_titular = (
                    usuario_id is not None and getattr(instance, "usuario_id", None) == usuario_id
                )
                if not es_titular and not usuario_tiene_permiso(
                    request, "caja.gestionar_turnos_ajenos"
                ):
                    ret["movimientos"] = []
        return ret
