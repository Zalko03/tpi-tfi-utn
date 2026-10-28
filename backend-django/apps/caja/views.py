"""ViewSets para turnos y movimientos de caja."""

from decimal import Decimal
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.caja.models import TurnoCaja, MovimientoCaja
from apps.caja.serializers import TurnoCajaSerializer, MovimientoCajaSerializer
from apps.usuarios.permissions import TienePermiso, PermisoObjetoTurnoCaja


class TurnoCajaViewSet(viewsets.ModelViewSet):
    queryset = TurnoCaja.objects.prefetch_related("movimientos", "ventas").all()
    serializer_class = TurnoCajaSerializer

    def get_permissions(self):
        if self.action == "create":
            return [TienePermiso("caja.abrir_turno")()]
        elif self.action == "cerrar":
            return [TienePermiso("caja.cerrar_turno")(), PermisoObjetoTurnoCaja()]
        elif self.action == "list":
            return [TienePermiso("caja.abrir_turno")()]
        elif self.action == "retrieve":
            return [TienePermiso("caja.abrir_turno")(), PermisoObjetoTurnoCaja()]
        elif self.action in ("update", "partial_update", "destroy"):
            return [TienePermiso("caja.gestionar_turnos_ajenos")()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        if (
            "usuario" not in serializer.validated_data
            and self.request.user.is_authenticated
        ):
            serializer.save(usuario=self.request.user)
        else:
            serializer.save()

    def get_queryset(self):
        qs = super().get_queryset()
        user = getattr(self.request, "user", None)
        if not user or not user.is_authenticated:
            return qs.none()
        if user.is_superuser:
            return qs

        perfil = getattr(user, "perfil", None)
        if perfil and perfil.tiene_permiso("caja.gestionar_turnos_ajenos"):
            return qs

        payload = getattr(self.request.auth, "payload", None)
        if payload is None and hasattr(self.request.auth, "get"):
            payload = self.request.auth
        token_permisos = payload.get("permisos", []) if payload else []
        if "caja.gestionar_turnos_ajenos" in token_permisos:
            return qs

        return qs.filter(usuario=user)

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

        puede_ver_esperado = False
        if request.user.is_superuser:
            puede_ver_esperado = True
        elif hasattr(request.user, "perfil") and request.user.perfil:
            puede_ver_esperado = request.user.perfil.tiene_permiso(
                "caja.ver_efectivo_esperado"
            )
        else:
            payload = getattr(request.auth, "payload", None)
            if payload is None and hasattr(request.auth, "get"):
                payload = request.auth
            token_permisos = payload.get("permisos", []) if payload else []
            puede_ver_esperado = "caja.ver_efectivo_esperado" in token_permisos

        return Response(
            {
                "mensaje": "Turno cerrado exitosamente.",
                "turno_id": turno.id,
                "efectivo_contado": str(turno.efectivo_contado),
                "efectivo_esperado": str(turno.efectivo_esperado)
                if puede_ver_esperado
                else None,
                "diferencia": str(turno.diferencia) if puede_ver_esperado else None,
                "estado": turno.estado,
            },
            status=status.HTTP_200_OK,
        )


class MovimientoCajaViewSet(viewsets.ModelViewSet):
    queryset = MovimientoCaja.objects.all()
    serializer_class = MovimientoCajaSerializer
    filterset_fields = ["turno_caja", "tipo"]

    def get_permissions(self):
        if self.action in ("list", "retrieve", "create"):
            return [TienePermiso("caja.registrar_movimiento")()]
        elif self.action in ("update", "partial_update", "destroy"):
            return [TienePermiso("caja.gestionar_turnos_ajenos")()]
        return [IsAuthenticated()]
