"""
Gestión y carga de claves criptográficas RSA para SimpleJWT (algoritmo RS256).
Permite configurar rutas PEM por entorno, leer desde variables o generar claves
efímeras para desarrollo y pruebas automatizadas (ADR-0001).
"""

import logging
import os
from pathlib import Path
from typing import Tuple

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

logger = logging.getLogger(__name__)

# Caché en memoria para par efímero durante ejecución (desarrollo/tests)
_CLAVE_PRIVADA_MEMORIA: str | None = None
_CLAVE_PUBLICA_MEMORIA: str | None = None


def generar_par_rsa_strings() -> Tuple[str, str]:
    """Genera un par de claves RSA 2048-bit en formato PEM como cadenas de texto."""
    clave_privada = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )
    priv_pem = clave_privada.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    pub_pem = (
        clave_privada.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode("utf-8")
    )
    return priv_pem, pub_pem


def _generar_par_rsa_efimero() -> Tuple[str, str]:
    """Genera y almacena en caché en memoria un par de claves RSA efímero."""
    global _CLAVE_PRIVADA_MEMORIA, _CLAVE_PUBLICA_MEMORIA
    if _CLAVE_PRIVADA_MEMORIA and _CLAVE_PUBLICA_MEMORIA:
        return _CLAVE_PRIVADA_MEMORIA, _CLAVE_PUBLICA_MEMORIA

    priv_pem, pub_pem = generar_par_rsa_strings()
    _CLAVE_PRIVADA_MEMORIA = priv_pem
    _CLAVE_PUBLICA_MEMORIA = pub_pem
    logger.info("Claves RSA efímeras generadas para desarrollo/pruebas.")
    return _CLAVE_PRIVADA_MEMORIA, _CLAVE_PUBLICA_MEMORIA


def obtener_claves_jwt(base_dir: Path | None = None) -> Tuple[str, str]:
    """
    Obtiene la clave privada y pública en formato PEM para RS256.
    Prioridad:
    1. Variables de entorno con el contenido PEM directo (`DJANGO_JWT_PRIVATE_KEY` y `DJANGO_JWT_PUBLIC_KEY`).
    2. Archivos referenciados por `DJANGO_JWT_PRIVATE_KEY_PATH` y `DJANGO_JWT_PUBLIC_KEY_PATH`.
    3. Rutas por defecto `config/keys/private.pem` y `config/keys/public.pem`.
    4. Fallback en memoria (par RSA efímero) para pruebas y arranque rápido.
    """
    # 1. Contenido directo en variables
    priv_env = os.environ.get("DJANGO_JWT_PRIVATE_KEY")
    pub_env = os.environ.get("DJANGO_JWT_PUBLIC_KEY")
    if priv_env and pub_env:
        return priv_env.strip(), pub_env.strip()

    # 2. Rutas a archivos PEM
    priv_path_str = os.environ.get(
        "DJANGO_JWT_PRIVATE_KEY_PATH", "config/keys/private.pem"
    )
    pub_path_str = os.environ.get(
        "DJANGO_JWT_PUBLIC_KEY_PATH", "config/keys/public.pem"
    )

    priv_path = Path(priv_path_str)
    if not priv_path.is_absolute() and base_dir:
        priv_path = base_dir / priv_path

    if priv_path.is_file():
        priv_pem = priv_path.read_text(encoding="utf-8").strip()

        pub_path = Path(pub_path_str)
        if not pub_path.is_absolute() and base_dir:
            pub_path = base_dir / pub_path

        if pub_path.is_file():
            pub_pem = pub_path.read_text(encoding="utf-8").strip()
            return priv_pem, pub_pem

        # Si no hay archivo de clave pública, derivarla de la privada
        try:
            loaded_key = serialization.load_pem_private_key(
                priv_pem.encode("utf-8"), password=None
            )
            pub_pem = (
                loaded_key.public_key()
                .public_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PublicFormat.SubjectPublicKeyInfo,
                )
                .decode("utf-8")
            )
            return priv_pem, pub_pem
        except Exception as e:
            logger.warning("No se pudo derivar clave pública de %s: %s", priv_path, e)

    # 3. Fallback en memoria
    return _generar_par_rsa_efimero()
