"""Rutas para apps.recetas."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.recetas.views import (
    CartaPublicaView,
    PrecioCompetenciaViewSet,
    ProductoViewSet,
    RecetaItemViewSet,
)

router = DefaultRouter()
router.register(r"productos", ProductoViewSet, basename="producto")
router.register(r"recetas-items", RecetaItemViewSet, basename="receta-item")
router.register(r"precios-competencia", PrecioCompetenciaViewSet, basename="precio-competencia")

urlpatterns = [
    path("carta-publica/", CartaPublicaView.as_view(), name="carta-publica"),
    *router.urls,
]
