"""ViewSets delgados para proveedores, insumos y compras."""

from rest_framework import viewsets, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from apps.insumos.models import Proveedor, Insumo, Compra
from apps.insumos.serializers import (
    ProveedorSerializer,
    InsumoSerializer,
    CompraSerializer,
)
from apps.usuarios.permissions import TienePermiso


class ProveedorViewSet(viewsets.ModelViewSet):
    queryset = Proveedor.objects.all()
    serializer_class = ProveedorSerializer
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["estado_activo"]
    search_fields = ["nombre"]
    ordering_fields = ["nombre", "creado_en"]
    ordering = ["nombre"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [TienePermiso("insumos.ver")()]
        elif self.action == "create":
            return [TienePermiso("insumos.crear")()]
        elif self.action in ("update", "partial_update"):
            return [TienePermiso("insumos.editar")()]
        elif self.action == "destroy":
            return [TienePermiso("insumos.eliminar")()]
        return [IsAuthenticated()]


class InsumoViewSet(viewsets.ModelViewSet):
    queryset = Insumo.objects.all()
    serializer_class = InsumoSerializer
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["unidad_base", "estado_activo"]
    search_fields = ["nombre"]
    ordering_fields = ["nombre", "costo_unitario", "creado_en"]
    ordering = ["nombre"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [TienePermiso("insumos.ver")()]
        elif self.action == "create":
            return [TienePermiso("insumos.crear")()]
        elif self.action in ("update", "partial_update"):
            return [TienePermiso("insumos.editar")()]
        elif self.action == "destroy":
            return [TienePermiso("insumos.eliminar")()]
        return [IsAuthenticated()]


class CompraViewSet(viewsets.ModelViewSet):
    queryset = Compra.objects.select_related("proveedor", "insumo").all()
    serializer_class = CompraSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["proveedor", "insumo"]
    ordering_fields = ["fecha", "precio_total", "id"]
    ordering = ["-fecha", "-id"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [TienePermiso("compras.ver")()]
        elif self.action in ("create", "update", "partial_update", "destroy"):
            return [TienePermiso("compras.registrar")()]
        return [IsAuthenticated()]
