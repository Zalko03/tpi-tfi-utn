"""Rutas para apps.insumos."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.insumos.views import (
    CompraViewSet,
    ConfiguracionFiscalEstadoView,
    ConfiguracionFiscalHistorialView,
    ConfiguracionFiscalView,
    InsumoViewSet,
    ProveedorViewSet,
)

router = DefaultRouter()
router.register(r"proveedores", ProveedorViewSet, basename="proveedor")
router.register(r"insumos", InsumoViewSet, basename="insumo")
router.register(r"compras", CompraViewSet, basename="compra")

urlpatterns = [
    path("configuracion-fiscal/", ConfiguracionFiscalView.as_view(), name="configuracion-fiscal"),
    path(
        "configuracion-fiscal/estado/",
        ConfiguracionFiscalEstadoView.as_view(),
        name="configuracion-fiscal-estado",
    ),
    path(
        "configuracion-fiscal/historial/",
        ConfiguracionFiscalHistorialView.as_view(),
        name="configuracion-fiscal-historial",
    ),
    *router.urls,
]
