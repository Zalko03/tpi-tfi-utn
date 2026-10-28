from django.urls import include, path

urlpatterns = [
    path("health", include("apps.salud.urls")),
    path("api/", include("apps.insumos.urls")),
    path("api/", include("apps.recetas.urls")),
    path("api/", include("apps.caja.urls")),
    path("api/", include("apps.ventas.urls")),
    path("api/", include("apps.usuarios.urls")),
]
