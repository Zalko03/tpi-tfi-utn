"""
Tests unitarios aislados para la emisión, verificación criptográfica asimétrica
y consistencia del payload JWT RS256 (ADR-0001 y docs/seguridad.md).
"""

import jwt
import pytest
from django.conf import settings
from django.contrib.auth import get_user_model

from apps.usuarios.claves import generar_par_rsa_strings, obtener_claves_jwt
from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO
from apps.usuarios.services import crear_personal
from apps.usuarios.tokens import CustomTokenObtainPairSerializer

User = get_user_model()


@pytest.mark.django_db
class TestUnitJwtRs256:
    """Pruebas unitarias criptográficas para el par de claves y tokens RS256."""

    @pytest.fixture
    def user_duenio(self):
        return crear_personal(
            datos_usuario={
                "username": "duenio_crypto",
                "password": "claveSegura123!",
                "email": "duenio@cafe.local",
                "first_name": "Dueño",
                "last_name": "Transaccional",
            },
            rol=ROL_DUENIO,
        )

    @pytest.fixture
    def user_cajero(self):
        return crear_personal(
            datos_usuario={
                "username": "cajero_crypto",
                "password": "claveSegura123!",
                "email": "cajero@cafe.local",
                "first_name": "Carlos",
                "last_name": "Cajero",
            },
            rol=ROL_CAJERO,
        )

    def test_cabecera_token_especifica_algoritmo_rs256(self, user_duenio):
        """El token generado debe llevar alg='RS256' y typ='JWT' en la cabecera."""
        token_obj = CustomTokenObtainPairSerializer.get_token(user_duenio)
        access_token_str = str(token_obj.access_token)

        header = jwt.get_unverified_header(access_token_str)
        assert header["alg"] == "RS256"
        assert header["typ"] == "JWT"

    def test_firma_con_privada_valida_con_clave_publica_configurada(self, user_duenio):
        """El token firmado por Django se valida exitosamente usando la clave pública configurada."""
        token_obj = CustomTokenObtainPairSerializer.get_token(user_duenio)
        access_token_str = str(token_obj.access_token)

        decoded = jwt.decode(
            access_token_str,
            settings.JWT_PUBLIC_KEY,
            algorithms=["RS256"],
            issuer="cafe-gestion-django",
        )
        assert decoded["iss"] == "cafe-gestion-django"
        assert decoded["user_id"] == user_duenio.id

    def test_verificacion_falla_con_clave_publica_ajena(self, user_duenio):
        """Un token RS256 no puede ser validado con una clave pública RSA distinta."""
        token_obj = CustomTokenObtainPairSerializer.get_token(user_duenio)
        access_token_str = str(token_obj.access_token)

        # Generamos un par RSA ajeno
        otra_priv, otra_pub = generar_par_rsa_strings()

        with pytest.raises(jwt.InvalidSignatureError):
            jwt.decode(
                access_token_str,
                otra_pub,
                algorithms=["RS256"],
                issuer="cafe-gestion-django",
            )

    def test_payload_coincide_exactamente_con_especificacion_adr0001(self, user_duenio):
        """
        Verifica todos los claims especificados en ADR-0001 §4:
        iss, sub, user_id, username, email, rol, permisos, token_type, exp, iat, jti.
        """
        token_obj = CustomTokenObtainPairSerializer.get_token(user_duenio)
        access_token_str = str(token_obj.access_token)

        payload = jwt.decode(
            access_token_str,
            settings.JWT_PUBLIC_KEY,
            algorithms=["RS256"],
            issuer="cafe-gestion-django",
        )

        assert payload["iss"] == "cafe-gestion-django"
        assert payload["sub"] == str(user_duenio.id)
        assert payload["user_id"] == user_duenio.id
        assert payload["username"] == "duenio_crypto"
        assert payload["email"] == "duenio@cafe.local"
        assert payload["rol"] == ROL_DUENIO
        assert isinstance(payload["permisos"], list)
        assert len(payload["permisos"]) == 30
        assert "ventas.cobrar_ticket" in payload["permisos"]
        assert "personal.crear" in payload["permisos"]
        assert payload["token_type"] == "access"
        assert "exp" in payload
        assert "iat" in payload
        assert "jti" in payload

    def test_payload_cajero_arqueo_ciego(self, user_cajero):
        """El token del cajero refleja su rol y excluye permisos restringidos (caja.ver_efectivo_esperado)."""
        token_obj = CustomTokenObtainPairSerializer.get_token(user_cajero)
        payload = jwt.decode(
            str(token_obj.access_token),
            settings.JWT_PUBLIC_KEY,
            algorithms=["RS256"],
            issuer="cafe-gestion-django",
        )

        assert payload["rol"] == ROL_CAJERO
        assert "ventas.cobrar_ticket" in payload["permisos"]
        assert "caja.abrir_turno" in payload["permisos"]
        assert "caja.ver_efectivo_esperado" not in payload["permisos"]
        assert "recetas.ver_costos" not in payload["permisos"]
        assert "personal.crear" not in payload["permisos"]

    def test_payload_refleja_overrides_individuales(self, user_cajero):
        """Si un usuario tiene permisos personalizados, estos se inyectan en el array 'permisos' del token."""
        user_cajero.perfil.permisos = {"caja.registrar_movimiento": True}
        user_cajero.perfil.save()

        token_obj = CustomTokenObtainPairSerializer.get_token(user_cajero)
        payload = jwt.decode(
            str(token_obj.access_token),
            settings.JWT_PUBLIC_KEY,
            algorithms=["RS256"],
            issuer="cafe-gestion-django",
        )

        assert "caja.registrar_movimiento" in payload["permisos"]

    def test_tiempo_de_vida_access_token_15_minutos(self, user_duenio):
        """Verifica que la diferencia entre exp e iat sea de 15 minutos (900 segundos)."""
        token_obj = CustomTokenObtainPairSerializer.get_token(user_duenio)
        payload = jwt.decode(
            str(token_obj.access_token),
            settings.JWT_PUBLIC_KEY,
            algorithms=["RS256"],
            issuer="cafe-gestion-django",
        )
        diferencia = payload["exp"] - payload["iat"]
        assert diferencia == 900  # 15 minutos en segundos

    def test_obtener_claves_jwt_fallback_efimero(self, monkeypatch):
        """Verifica que el fallback genera claves RSA válidas cuando no hay variables ni archivos."""
        monkeypatch.delenv("DJANGO_JWT_PRIVATE_KEY", raising=False)
        monkeypatch.delenv("DJANGO_JWT_PUBLIC_KEY", raising=False)
        monkeypatch.setenv("DJANGO_JWT_PRIVATE_KEY_PATH", "no_existe/priv.pem")
        monkeypatch.setenv("DJANGO_JWT_PUBLIC_KEY_PATH", "no_existe/pub.pem")

        priv_pem, pub_pem = obtener_claves_jwt()
        assert "BEGIN PRIVATE KEY" in priv_pem
        assert "BEGIN PUBLIC KEY" in pub_pem
