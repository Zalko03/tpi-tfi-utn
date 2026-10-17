"""Rutas para apps.insumos."""
from rest_framework.routers import DefaultRouter
from apps.insumos.views import ProveedorViewSet, InsumoViewSet, CompraViewSet

router = DefaultRouter()
router.register(r"proveedores", ProveedorViewSet, basename="proveedor")
router.register(r"insumos", InsumoViewSet, basename="insumo")
router.register(r"compras", CompraViewSet, basename="compra")

urlpatterns = router.urls
