"""ViewSets para ventas."""
from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from apps.ventas.models import Venta
from apps.ventas.serializers import VentaSerializer


class VentaViewSet(viewsets.ModelViewSet):
    queryset = Venta.objects.prefetch_related("items__producto").all()
    serializer_class = VentaSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["turno_caja", "medio_pago", "origen"]
    ordering_fields = ["fecha", "total"]
    ordering = ["-fecha", "-id"]
