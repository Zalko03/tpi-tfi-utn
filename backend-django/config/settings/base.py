"""Configuración base de Django. Las variables se leen del .env de la raíz del repo."""

import os
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

from apps.usuarios.claves import obtener_claves_jwt

# BASE_DIR es backend-django/; su carpeta padre es la raíz del repo, donde vive el único .env
BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR.parent / ".env")


def _a_booleano(valor):
    return str(valor).strip().lower() in ("1", "true", "yes", "si", "sí")


DEBUG = _a_booleano(os.environ.get("DJANGO_DEBUG", "False"))

# Los valores por defecto existen solo para desarrollo: con DEBUG apagado
# y sin variable, el arranque falla en vez de usar una clave o hosts inseguros.
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
_hosts = os.environ.get("DJANGO_ALLOWED_HOSTS")

if DEBUG:
    SECRET_KEY = SECRET_KEY or "clave-solo-para-desarrollo-no-usar-en-produccion"
    _hosts = _hosts or "localhost,127.0.0.1"
else:
    if not SECRET_KEY:
        raise ImproperlyConfigured(
            "Falta DJANGO_SECRET_KEY (obligatoria con DJANGO_DEBUG apagado)."
        )
    if not _hosts:
        raise ImproperlyConfigured(
            "Falta DJANGO_ALLOWED_HOSTS (obligatoria con DJANGO_DEBUG apagado)."
        )

ALLOWED_HOSTS = [host.strip() for host in _hosts.split(",") if host.strip()]

# Par de claves criptográficas asimétricas para SimpleJWT RS256 (ADR-0001)
JWT_PRIVATE_KEY, JWT_PUBLIC_KEY = obtener_claves_jwt(BASE_DIR)

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "apps.comun",
    "apps.usuarios",
    "apps.insumos",
    "apps.recetas",
    "apps.caja",
    "apps.ventas",
    "apps.salud",
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.environ.get("DJANGO_THROTTLE_ANON", "200/day"),
        "user": os.environ.get("DJANGO_THROTTLE_USER", "2000/day"),
        "login": os.environ.get("DJANGO_THROTTLE_LOGIN", "10/minute"),
        "recalcular": os.environ.get("DJANGO_THROTTLE_RECALCULAR", "20/minute"),
    },
    "DEFAULT_PAGINATION_CLASS": "apps.comun.paginacion.PaginacionEstandar",
    "EXCEPTION_HANDLER": "apps.comun.excepciones.manejador_excepciones_api",
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=int(os.environ.get("DJANGO_ACCESS_TOKEN_MINUTES", "15"))
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=int(os.environ.get("DJANGO_REFRESH_TOKEN_DAYS", "1"))
    ),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "RS256",
    "SIGNING_KEY": JWT_PRIVATE_KEY,
    "VERIFYING_KEY": JWT_PUBLIC_KEY,
    "ISSUER": "cafe-gestion-django",
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "TOKEN_OBTAIN_SERIALIZER": "apps.usuarios.tokens.CustomTokenObtainPairSerializer",
    "TOKEN_REFRESH_SERIALIZER": "apps.usuarios.tokens.CustomTokenRefreshSerializer",
}

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
            ],
        },
    },
]

STATIC_URL = "/static/"

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
]

# Política CORS restrictiva sin comodín '*' (T2.5 y docs/seguridad.md)
_cors_origenes = os.environ.get(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000",
)
CORS_ALLOWED_ORIGINS = [
    origen.strip()
    for origen in _cors_origenes.split(",")
    if origen.strip() and origen.strip() != "*"
]
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = True

# Logging seguro con filtro sanitizador de contraseñas y tokens (T2.5)
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "sanitizador_seguridad": {
            "()": "apps.comun.logging.FiltroSanitizacionSeguridad",
        },
    },
    "formatters": {
        "estandar": {
            "format": "[%(asctime)s] %(levelname)s %(name)s: %(message)s",
        },
    },
    "handlers": {
        "consola": {
            "class": "logging.StreamHandler",
            "filters": ["sanitizador_seguridad"],
            "formatter": "estandar",
        },
    },
    "root": {
        "handlers": ["consola"],
        "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO"),
    },
}

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

USE_SQLITE = _a_booleano(os.environ.get("USE_SQLITE", "False"))

if USE_SQLITE:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
else:
    # La conexión es perezosa: Django no abre la base hasta la primera consulta.
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("POSTGRES_DB", "cafe_gestion"),
            "USER": os.environ.get("POSTGRES_USER", "cafe_user"),
            "PASSWORD": os.environ.get("POSTGRES_PASSWORD", ""),
            "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
            "PORT": os.environ.get("POSTGRES_PORT", "5432"),
        }
    }

LANGUAGE_CODE = "es-ar"
TIME_ZONE = "America/Argentina/Buenos_Aires"
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
