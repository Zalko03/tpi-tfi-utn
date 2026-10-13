from django.urls import path

from .views import obtener_estado

urlpatterns = [
    path('', obtener_estado, name='health'),
]
