"""ViewSets para ventas y reportes operativos."""

from django.utils.dateparse import parse_date, parse_datetime
from datetime import datetime, time
from django.utils import timezone
from rest_framework import viewsets, filters, serializers, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from apps.ventas.models import Venta
from apps.ventas.serializers import VentaSerializer
from apps.ventas.services import obtener_reporte_ventas_por_producto
from apps.usuarios.permissions import TienePermiso, PermisoObjetoVenta


def _parsear_parametro_fecha(valor: str | None, es_fin: bool = False):
    """Convierte una cadena ISO de fecha o fecha-hora en datetime con zona horaria."""
    if not valor:
        return None
    texto = str(valor).strip()
    dt = parse_datetime(texto)
    if dt is not None:
        if timezone.is_naive(dt):
            return timezone.make_aware(dt)
        return dt

    fecha = parse_date(texto)
    if fecha is not None:
        hora = time(23, 59, 59, 999999) if es_fin else time(0, 0, 0)
        return timezone.make_aware(datetime.combine(fecha, hora))

    raise serializers.ValidationError(
        f"Formato de fecha inválido: '{valor}'. Use YYYY-MM-DD o ISO-8601."
    )


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
            return [
                TienePermiso("ventas.ver_historial_propio")(),
                PermisoObjetoVenta(),
            ]
        elif self.action == "reporte_por_producto":
            return [TienePermiso("reportes.ver_operativos")()]
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

        if self.action == "list":
            return qs.filter(turno_caja__usuario=user)
        return qs

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

    @action(detail=False, methods=["get"], url_path="reporte-por-producto")
    def reporte_por_producto(self, request):
        """
        Reporte agregado de ventas por producto filtrado por rango de fechas (T3.4).
        Query params opcionales: fecha_inicio (YYYY-MM-DD), fecha_fin (YYYY-MM-DD).
        """
        fecha_inicio = _parsear_parametro_fecha(
            request.query_params.get("fecha_inicio"), es_fin=False
        )
        fecha_fin = _parsear_parametro_fecha(
            request.query_params.get("fecha_fin"), es_fin=True
        )
        if fecha_inicio and fecha_fin and fecha_inicio > fecha_fin:
            raise serializers.ValidationError(
                "fecha_inicio no puede ser posterior a fecha_fin."
            )

        datos = obtener_reporte_ventas_por_producto(
            fecha_inicio=fecha_inicio, fecha_fin=fecha_fin
        )
        return Response(
            {
                "datos": datos,
                "total": len(datos),
            },
            status=status.HTTP_200_OK,
        )
