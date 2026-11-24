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


class CartaPublicaRateThrottle(AnonRateThrottle):
    """
    Control de tasa anónimo para la consulta pública de la carta digital (HU15).
    Protege el catálogo público contra scraping masivo o abuso sin exigir sesión.
    """

    scope = "carta_publica"


class CambioClaveRateThrottle(UserRateThrottle):
    """
    Control de tasa para "cambiar mi clave". Es por usuario (no por IP) porque el endpoint
    exige sesión, y limita probar contraseñas actuales con una sesión robada.
    """

    scope = "cambio_clave"
