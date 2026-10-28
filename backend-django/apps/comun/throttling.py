"""
Clases de throttling (Rate Limiting) para DRF según docs/seguridad.md (T2.5).
"""

from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    """
    Control de tasa para endpoints de autenticación (/api/auth/token/).
    Mitiga ataques de fuerza bruta y adivinación de credenciales.
    """

    scope = "login"


class RecalculoRateThrottle(UserRateThrottle):
    """
    Control de tasa para endpoints costosos con alto consumo de CPU/DB
    (ej. recálculo forzado de costos en cascada).
    """

    scope = "recalcular"
