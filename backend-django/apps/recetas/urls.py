"""Rutas para apps.recetas."""
from rest_framework.routers import DefaultRouter
from apps.recetas.views import ProductoViewSet, RecetaItemViewSet

router = DefaultRouter()
router.register(r"productos", ProductoViewSet, basename="producto")
router.register(r"recetas-items", RecetaItemViewSet, basename="receta-item")

urlpatterns = router.urls
