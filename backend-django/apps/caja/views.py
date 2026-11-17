"""ViewSets para turnos y movimientos de caja."""

from decimal import Decimal

from django.db.models import Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.caja.models import MovimientoCaja, TurnoCaja
from apps.caja.serializers import MovimientoCajaSerializer, TurnoCajaSerializer
from apps.caja.services import abrir_turno
from apps.comun.filtros import extraer_rango_fechas, filtrar_queryset_por_rango_fechas
from apps.usuarios.permissions import PermisoObjetoTurnoCaja, TienePermiso, usuario_tiene_permiso


class TurnoCajaViewSet(viewsets.ModelViewSet):
    queryset = (
        TurnoCaja.objects.select_related("usuario").prefetch_related("movimientos", "ventas").all()
    )
    serializer_class = TurnoCajaSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["estado"]
    ordering_fields = ["apertura", "cierre", "id"]
    ordering = ["-apertura", "-id"]

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
        usuario = serializer.validated_data.get("usuario")
        if usuario is None and self.request.user.is_authenticated:
            usuario = self.request.user
        abrir_turno(serializer, usuario)

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

        if self.action == "list":
            return qs.filter(usuario=user)
        return qs

    def filter_queryset(self, queryset):
        qs = super().filter_queryset(queryset)
        if self.action != "list":
            return qs

        dt_desde, dt_hasta = extraer_rango_fechas(self.request.query_params)
        if dt_desde is None and dt_hasta is None:
            return qs

        # Turnos cerrados se filtran por fecha de cierre; turnos aún abiertos por fecha de apertura.
        q_cierre = Q(cierre__isnull=False)
        q_apertura = Q(cierre__isnull=True)
        if dt_desde is not None:
            q_cierre &= Q(cierre__gte=dt_desde)
            q_apertura &= Q(apertura__gte=dt_desde)
        if dt_hasta is not None:
            q_cierre &= Q(cierre__lte=dt_hasta)
            q_apertura &= Q(apertura__lte=dt_hasta)

        return qs.filter(q_cierre | q_apertura)

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

        puede_ver_esperado = usuario_tiene_permiso(request, "caja.ver_efectivo_esperado")

        return Response(
            {
                "mensaje": "Turno cerrado exitosamente.",
                "turno_id": turno.id,
                "efectivo_contado": str(turno.efectivo_contado),
                "efectivo_esperado": str(turno.efectivo_esperado) if puede_ver_esperado else None,
                "diferencia": str(turno.diferencia) if puede_ver_esperado else None,
                "estado": turno.estado,
            },
            status=status.HTTP_200_OK,
        )


class MovimientoCajaViewSet(viewsets.ModelViewSet):
    queryset = MovimientoCaja.objects.all()
    serializer_class = MovimientoCajaSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["turno_caja", "tipo"]
    ordering_fields = ["fecha", "monto", "id"]
    ordering = ["-fecha", "-id"]

    def filter_queryset(self, queryset):
        qs = super().filter_queryset(queryset)
        if self.action == "list":
            qs = filtrar_queryset_por_rango_fechas(
                qs, self.request.query_params, campo_fecha="fecha"
            )
        return qs

    def get_permissions(self):
        if self.action in ("list", "retrieve", "create"):
            return [TienePermiso("caja.registrar_movimiento")()]
        elif self.action in ("update", "partial_update", "destroy"):
            return [TienePermiso("caja.gestionar_turnos_ajenos")()]
        return [IsAuthenticated()]
