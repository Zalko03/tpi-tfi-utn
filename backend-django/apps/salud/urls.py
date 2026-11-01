from django.urls import path

from .views import obtener_estado, obtener_estado_profundo

urlpatterns = [
    path("", obtener_estado, name="health"),
    path("/", obtener_estado, name="health_slash"),
    path("/profundo", obtener_estado_profundo, name="health_profundo"),
    path("/profundo/", obtener_estado_profundo, name="health_profundo_slash"),
    path("profundo", obtener_estado_profundo, name="health_profundo_directo"),
    path("profundo/", obtener_estado_profundo, name="health_profundo_directo_slash"),
]
