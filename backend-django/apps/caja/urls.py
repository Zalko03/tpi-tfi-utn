"""Rutas para apps.caja."""

from rest_framework.routers import DefaultRouter
from apps.caja.views import TurnoCajaViewSet, MovimientoCajaViewSet

router = DefaultRouter()
router.register(r"turnos", TurnoCajaViewSet, basename="turno")
router.register(r"caja/turnos", TurnoCajaViewSet, basename="caja-turno")
router.register(r"movimientos-caja", MovimientoCajaViewSet, basename="movimiento-caja")
router.register(r"caja/movimientos", MovimientoCajaViewSet, basename="caja-movimiento")
router.register(
    r"caja/movimientos-caja", MovimientoCajaViewSet, basename="caja-movimientos-caja"
)

urlpatterns = router.urls
