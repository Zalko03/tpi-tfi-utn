"""Servicio de turnos de caja: reglas de negocio de apertura."""

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.caja.models import TurnoCaja

MENSAJE_TURNO_YA_ABIERTO = (
    "Ya hay un turno de caja abierto para este usuario. Cerralo antes de abrir uno nuevo."
)


def abrir_turno(serializer, usuario):
    """
    Abre un turno de caja para `usuario`, siempre que no tenga otro turno ABIERTO.

    La regla es por responsable (PLAN_IMPLEMENTACION §3: el cajero opera "solo su turno"):
    el encargado puede abrir el suyo aunque un cajero tenga uno abierto.
    Se bloquea la fila del usuario para que dos pedidos simultáneos no abran dos turnos.
    """
    with transaction.atomic():
        if usuario is not None:
            get_user_model().objects.select_for_update().filter(pk=usuario.pk).first()
            if TurnoCaja.objects.filter(usuario=usuario, estado="ABIERTO").exists():
                raise ValidationError([MENSAJE_TURNO_YA_ABIERTO])
        return serializer.save(usuario=usuario)
