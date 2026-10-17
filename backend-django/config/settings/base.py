"""Configuración base de Django. Las variables se leen del .env de la raíz del repo."""
import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

# BASE_DIR es backend-django/; su carpeta padre es la raíz del repo, donde vive el único .env
BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR.parent / '.env')


def _a_booleano(valor):
    return str(valor).strip().lower() in ('1', 'true', 'yes', 'si', 'sí')


DEBUG = _a_booleano(os.environ.get('DJANGO_DEBUG', 'False'))

# Los valores por defecto existen solo para desarrollo: con DEBUG apagado
# y sin variable, el arranque falla en vez de usar una clave o hosts inseguros.
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')
_hosts = os.environ.get('DJANGO_ALLOWED_HOSTS')

if DEBUG:
    SECRET_KEY = SECRET_KEY or 'clave-solo-para-desarrollo-no-usar-en-produccion'
    _hosts = _hosts or 'localhost,127.0.0.1'
else:
    if not SECRET_KEY:
        raise ImproperlyConfigured('Falta DJANGO_SECRET_KEY (obligatoria con DJANGO_DEBUG apagado).')
    if not _hosts:
        raise ImproperlyConfigured('Falta DJANGO_ALLOWED_HOSTS (obligatoria con DJANGO_DEBUG apagado).')

ALLOWED_HOSTS = [host.strip() for host in _hosts.split(',') if host.strip()]

INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'rest_framework',
    'django_filters',
    'apps.comun',
    'apps.insumos',
    'apps.recetas',
    'apps.caja',
    'apps.ventas',
    'apps.salud',
]

REST_FRAMEWORK = {
    'DEFAULT_PAGINATION_CLASS': 'apps.comun.paginacion.PaginacionEstandar',
    'EXCEPTION_HANDLER': 'apps.comun.excepciones.manejador_excepciones_api',
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
}

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.middleware.common.CommonMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'

USE_SQLITE = _a_booleano(os.environ.get('USE_SQLITE', 'False'))

if USE_SQLITE:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }
else:
    # La conexión es perezosa: Django no abre la base hasta la primera consulta.
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('POSTGRES_DB', 'cafe_gestion'),
            'USER': os.environ.get('POSTGRES_USER', 'cafe_user'),
            'PASSWORD': os.environ.get('POSTGRES_PASSWORD', ''),
            'HOST': os.environ.get('POSTGRES_HOST', 'localhost'),
            'PORT': os.environ.get('POSTGRES_PORT', '5432'),
        }
    }

LANGUAGE_CODE = 'es-ar'
TIME_ZONE = 'America/Argentina/Buenos_Aires'
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
