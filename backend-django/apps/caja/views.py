"""ViewSets para turnos y movimientos de caja."""
from decimal import Decimal
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.caja.models import TurnoCaja, MovimientoCaja
from apps.caja.serializers import TurnoCajaSerializer, MovimientoCajaSerializer


class TurnoCajaViewSet(viewsets.ModelViewSet):
    queryset = TurnoCaja.objects.prefetch_related("movimientos", "ventas").all()
    serializer_class = TurnoCajaSerializer

    @action(detail=True, methods=["post"], url_path="cerrar")
    def cerrar(self, request, pk=None):
        """Cierra el turno, calcula el efectivo esperado y la diferencia (HU5)."""
        turno = self.get_object()
        if turno.estado == "CERRADO":
            return Response(
                {"mensaje": "El turno de caja ya se encuentra cerrado."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        efectivo_contado = request.data.get("efectivo_contado")
        if efectivo_contado is None:
            return Response(
                {"mensaje": "Debe informar el efectivo_contado para cerrar la caja."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        contado = Decimal(str(efectivo_contado))
        esperado = turno.calcular_efectivo_esperado()
        diferencia = contado - esperado

        turno.efectivo_contado = contado
        turno.efectivo_esperado = esperado
        turno.diferencia = diferencia
        turno.estado = "CERRADO"
        turno.cierre = timezone.now()
        turno.save()

        return Response(
            {
                "mensaje": "Turno cerrado exitosamente.",
                "turno_id": turno.id,
                "efectivo_contado": str(turno.efectivo_contado),
                "efectivo_esperado": str(turno.efectivo_esperado),
                "diferencia": str(turno.diferencia),
                "estado": turno.estado,
            },
            status=status.HTTP_200_OK,
        )


class MovimientoCajaViewSet(viewsets.ModelViewSet):
    queryset = MovimientoCaja.objects.all()
    serializer_class = MovimientoCajaSerializer
    filterset_fields = ["turno_caja", "tipo"]
