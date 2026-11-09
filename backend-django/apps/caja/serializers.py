"""Serializadores para turnos y movimientos de caja."""

from decimal import Decimal

from rest_framework import serializers

from apps.caja.models import MovimientoCaja, TurnoCaja


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

    def get_ventas_efectivo_total(self, obj) -> str:
        from decimal import InvalidOperation

        from django.db.models import Sum

        try:
            cache_prefetch = getattr(obj, "_prefetched_objects_cache", None)
            if isinstance(cache_prefetch, dict) and "ventas" in cache_prefetch:
                total = sum(
                    (v.total for v in obj.ventas.all() if v.medio_pago == "EFECTIVO"),
                    Decimal("0.00"),
                )
            else:
                agregado = obj.ventas.filter(medio_pago="EFECTIVO").aggregate(total=Sum("total"))
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
                return len(obj.ventas.all())
            conteo = obj.ventas.count()
            return int(conteo) if isinstance(conteo, (int, float)) else 0
        except (TypeError, ValueError, AttributeError):
            return 0

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            usuario = request.user
            puede_ver_esperado = False
            if getattr(usuario, "is_superuser", False):
                puede_ver_esperado = True
            elif hasattr(usuario, "perfil") and usuario.perfil:
                puede_ver_esperado = usuario.perfil.tiene_permiso("caja.ver_efectivo_esperado")
            else:
                payload = getattr(request.auth, "payload", None)
                if payload is None and hasattr(request.auth, "get"):
                    payload = request.auth
                token_permisos = payload.get("permisos", []) if payload else []
                puede_ver_esperado = "caja.ver_efectivo_esperado" in token_permisos

            if not puede_ver_esperado:
                ret["efectivo_esperado"] = None
                ret["diferencia"] = None
        return ret
