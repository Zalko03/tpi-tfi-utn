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
            raise serializers.ValidationError("El monto del movimiento debe ser mayor a cero.")
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
