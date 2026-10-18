"""ViewSets para productos y recetas."""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from apps.recetas.models import Producto, RecetaItem
from apps.recetas.serializers import ProductoSerializer, RecetaItemSerializer
from apps.recetas.services import actualizar_costo_y_margen_producto


class ProductoViewSet(viewsets.ModelViewSet):
    queryset = Producto.objects.prefetch_related("receta_items__insumo").all()
    serializer_class = ProductoSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["estado_activo"]
    search_fields = ["nombre", "codigo_barras"]
    ordering_fields = ["nombre", "precio_venta", "costo_total_calculado", "margen_bruto"]
    ordering = ["nombre"]

    @action(detail=True, methods=["post"], url_path="recalcular")
    def recalcular(self, request, pk=None):
        """Fuerza el recálculo de costos y márgenes del producto."""
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


class RecetaItemViewSet(viewsets.ModelViewSet):
    queryset = RecetaItem.objects.select_related("producto", "insumo").all()
    serializer_class = RecetaItemSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["producto", "insumo"]

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
