"""Rutas para apps.caja."""
from rest_framework.routers import DefaultRouter
from apps.caja.views import TurnoCajaViewSet, MovimientoCajaViewSet

router = DefaultRouter()
router.register(r"turnos", TurnoCajaViewSet, basename="turno")
router.register(r"movimientos-caja", MovimientoCajaViewSet, basename="movimiento-caja")

urlpatterns = router.urls
