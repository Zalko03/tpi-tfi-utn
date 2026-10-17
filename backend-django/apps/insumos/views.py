"""ViewSets delgados para proveedores, insumos y compras."""
from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from apps.insumos.models import Proveedor, Insumo, Compra
from apps.insumos.serializers import ProveedorSerializer, InsumoSerializer, CompraSerializer


class ProveedorViewSet(viewsets.ModelViewSet):
    queryset = Proveedor.objects.all()
    serializer_class = ProveedorSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["estado_activo"]
    search_fields = ["nombre"]
    ordering_fields = ["nombre", "creado_en"]
    ordering = ["nombre"]


class InsumoViewSet(viewsets.ModelViewSet):
    queryset = Insumo.objects.all()
    serializer_class = InsumoSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["unidad_base", "estado_activo"]
    search_fields = ["nombre"]
    ordering_fields = ["nombre", "costo_unitario", "creado_en"]
    ordering = ["nombre"]


class CompraViewSet(viewsets.ModelViewSet):
    queryset = Compra.objects.select_related("proveedor", "insumo").all()
    serializer_class = CompraSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["proveedor", "insumo"]
    ordering_fields = ["fecha", "precio_total", "id"]
    ordering = ["-fecha", "-id"]
