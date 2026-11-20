"""Servicios del módulo de caja: reglas de negocio para turnos y movimientos."""

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.caja.models import TurnoCaja

MENSAJE_TURNO_YA_ABIERTO = (
    "Ya hay un turno de caja abierto para este usuario. Cerralo antes de abrir uno nuevo."
)
MENSAJE_TURNO_CERRADO_MOVIMIENTO = (
    "No podés registrar movimientos en un turno de caja que ya está cerrado."
)
MENSAJE_TURNO_AJENO_MOVIMIENTO = (
    "No tenés permiso para registrar movimientos en el turno de otra persona."
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


def validar_movimiento_en_turno(
    turno: TurnoCaja,
    usuario,
    puede_gestionar_ajenos: bool = False,
) -> None:
    """
    Valida que el usuario pueda registrar un movimiento sobre `turno`
    y que el turno continúe en estado ABIERTO.
    """
    if usuario is not None and not getattr(usuario, "is_superuser", False):
        if not puede_gestionar_ajenos and turno.usuario_id != getattr(usuario, "id", None):
            raise PermissionDenied(MENSAJE_TURNO_AJENO_MOVIMIENTO)

    if turno.estado != "ABIERTO":
        raise ValidationError([MENSAJE_TURNO_CERRADO_MOVIMIENTO])


def registrar_movimiento_caja(
    serializer,
    usuario,
    puede_gestionar_ajenos: bool = False,
):
    """
    Persiste un movimiento de caja bloqueando la fila del turno para impedir
    registros concurrentes sobre un turno que se está cerrando.
    """
    turno = serializer.validated_data["turno_caja"]
    with transaction.atomic():
        turno_actual = TurnoCaja.objects.select_for_update().get(pk=turno.pk)
        validar_movimiento_en_turno(
            turno=turno_actual,
            usuario=usuario,
            puede_gestionar_ajenos=puede_gestionar_ajenos,
        )
        return serializer.save()
