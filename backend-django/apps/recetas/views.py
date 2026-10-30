"""ViewSets para productos y recetas."""

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from apps.comun.throttling import RecalculoRateThrottle
from apps.recetas.models import RecetaItem
from apps.recetas.serializers import ProductoSerializer, RecetaItemSerializer
from apps.recetas.services import (
    actualizar_costo_y_margen_producto,
    listar_productos_con_costos_optimizado,
)
from apps.usuarios.permissions import TienePermiso


class ProductoViewSet(viewsets.ModelViewSet):
    queryset = listar_productos_con_costos_optimizado()
    serializer_class = ProductoSerializer
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["estado_activo"]
    search_fields = ["nombre", "codigo_barras"]
    ordering_fields = [
        "nombre",
        "precio_venta",
        "costo_total_calculado",
        "margen_bruto",
    ]
    ordering = ["nombre"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [TienePermiso("recetas.ver")()]
        elif self.action == "create":
            return [TienePermiso("recetas.crear")()]
        elif self.action in ("update", "partial_update"):
            return [TienePermiso("recetas.editar")()]
        elif self.action == "destroy":
            return [TienePermiso("recetas.eliminar")()]
        elif self.action in ("recalcular", "costo"):
            return [TienePermiso("recetas.ver_costos")()]
        return [IsAuthenticated()]

    @action(
        detail=True,
        methods=["post"],
        url_path="recalcular",
        throttle_classes=[RecalculoRateThrottle],
    )
    def recalcular(self, request, pk=None):
        """Fuerza el recálculo de costos y márgenes del producto (con rate limiting de T2.5)."""
        producto = self.get_object()
        actualizar_costo_y_margen_producto(producto)
        return Response(
            {
                "mensaje": f"Costo recalculado exitosamente para {producto.nombre}",
                "costo_total": str(producto.costo_total_calculado),
                "ganancia_bruta": str(producto.ganancia_bruta),
                "margen_bruto": str(producto.margen_bruto),
            },
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["get"],
        url_path="costo",
    )
    def costo(self, request, pk=None):
        """Consulta protegida del desglose de costos y márgenes (docs/seguridad.md §5.1)."""
        producto = self.get_object()
        return Response(
            {
                "producto_id": producto.id,
                "nombre": producto.nombre,
                "costo_total_calculado": str(producto.costo_total_calculado),
                "ganancia_bruta": str(producto.ganancia_bruta),
                "margen_bruto": str(producto.margen_bruto),
            },
            status=status.HTTP_200_OK,
        )


class RecetaItemViewSet(viewsets.ModelViewSet):
    queryset = RecetaItem.objects.select_related("producto", "insumo").all()
    serializer_class = RecetaItemSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["producto", "insumo"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [TienePermiso("recetas.ver")()]
        elif self.action == "create":
            return [TienePermiso("recetas.crear")()]
        elif self.action in ("update", "partial_update"):
            return [TienePermiso("recetas.editar")()]
        elif self.action == "destroy":
            return [TienePermiso("recetas.eliminar")()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        item = serializer.save()
        actualizar_costo_y_margen_producto(item.producto)

    def perform_update(self, serializer):
        item = serializer.save()
        actualizar_costo_y_margen_producto(item.producto)

    def perform_destroy(self, instance):
        producto = instance.producto
        instance.delete()
        actualizar_costo_y_margen_producto(producto)
