"""ViewSets para ventas."""

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from apps.ventas.models import Venta
from apps.ventas.serializers import VentaSerializer
from apps.usuarios.permissions import TienePermiso, PermisoObjetoVenta


class VentaViewSet(viewsets.ModelViewSet):
    queryset = Venta.objects.prefetch_related("items__producto").all()
    serializer_class = VentaSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["turno_caja", "medio_pago", "origen"]
    ordering_fields = ["fecha", "total"]
    ordering = ["-fecha", "-id"]

    def get_permissions(self):
        if self.action == "create":
            return [TienePermiso("ventas.cobrar_ticket")()]
        elif self.action == "list":
            return [TienePermiso("ventas.ver_historial_propio")()]
        elif self.action == "retrieve":
            return [TienePermiso("ventas.ver_historial_propio")(), PermisoObjetoVenta()]
        elif self.action == "anular":
            return [TienePermiso("ventas.anular_ticket")()]
        elif self.action in ("update", "partial_update", "destroy"):
            return [TienePermiso("ventas.anular_ticket")()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = getattr(self.request, "user", None)
        if not user or not user.is_authenticated:
            return qs.none()
        if user.is_superuser:
            return qs

        perfil = getattr(user, "perfil", None)
        if perfil and perfil.tiene_permiso("ventas.ver_historial_todos"):
            return qs

        payload = getattr(self.request.auth, "payload", None)
        if payload is None and hasattr(self.request.auth, "get"):
            payload = self.request.auth
        token_permisos = payload.get("permisos", []) if payload else []
        if "ventas.ver_historial_todos" in token_permisos:
            return qs

        return qs.filter(turno_caja__usuario=user)

    @action(detail=True, methods=["post"], url_path="anular")
    def anular(self, request, pk=None):
        """Anula una venta emitida (docs/seguridad.md §5.1)."""
        venta = self.get_object()
        return Response(
            {
                "mensaje": f"Venta #{venta.id} anulada exitosamente.",
                "venta_id": venta.id,
            },
            status=status.HTTP_200_OK,
        )
