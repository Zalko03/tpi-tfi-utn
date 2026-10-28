"""
Rutas URL para autenticación SimpleJWT y gestión de personal.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.usuarios.views import (
    LoginView,
    LogoutView,
    RefreshView,
    RegistroAuditoriaViewSet,
    UsuarioViewSet,
)

router = DefaultRouter()
router.register(
    r"usuarios/auditoria", RegistroAuditoriaViewSet, basename="usuario-auditoria"
)
router.register(r"usuarios", UsuarioViewSet, basename="usuario")

auth_patterns = [
    path("token/", LoginView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", RefreshView.as_view(), name="token_refresh"),
    path("token/blacklist/", LogoutView.as_view(), name="token_blacklist"),
    path("logout/", LogoutView.as_view(), name="logout"),
]

urlpatterns = [
    path("auth/", include(auth_patterns)),
    path("", include(router.urls)),
]
