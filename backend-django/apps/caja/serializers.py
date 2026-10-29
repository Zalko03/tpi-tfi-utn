"""Serializadores para turnos y movimientos de caja."""

from decimal import Decimal
from rest_framework import serializers
from apps.caja.models import TurnoCaja, MovimientoCaja


class MovimientoCajaSerializer(serializers.ModelSerializer):
    class Meta:
        model = MovimientoCaja
        fields = ["id", "turno_caja", "tipo", "monto", "motivo", "fecha"]

    def validate_monto(self, value):
        if Decimal(str(value)) <= Decimal("0"):
            raise serializers.ValidationError(
                "El monto del movimiento debe ser mayor a cero."
            )
        return value


class TurnoCajaSerializer(serializers.ModelSerializer):
    movimientos = MovimientoCajaSerializer(many=True, read_only=True)

    class Meta:
        model = TurnoCaja
        fields = [
            "id",
            "usuario",
            "apertura",
            "cierre",
            "efectivo_inicial",
            "efectivo_contado",
            "efectivo_esperado",
            "diferencia",
            "estado",
            "movimientos",
        ]
        read_only_fields = ["id", "cierre", "efectivo_esperado", "diferencia"]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            usuario = request.user
            puede_ver_esperado = False
            if getattr(usuario, "is_superuser", False):
                puede_ver_esperado = True
            elif hasattr(usuario, "perfil") and usuario.perfil:
                puede_ver_esperado = usuario.perfil.tiene_permiso(
                    "caja.ver_efectivo_esperado"
                )
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
