"""Rutas para apps.recetas."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.recetas.views import CartaPublicaView, ProductoViewSet, RecetaItemViewSet

router = DefaultRouter()
router.register(r"productos", ProductoViewSet, basename="producto")
router.register(r"recetas-items", RecetaItemViewSet, basename="receta-item")

urlpatterns = [
    path("carta-publica/", CartaPublicaView.as_view(), name="carta-publica"),
    *router.urls,
]
