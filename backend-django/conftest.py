"""Configuración global de pytest para ejecución aislada con SQLite por defecto."""

import os
import sys
from pathlib import Path

import pytest

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

os.environ.setdefault("USE_SQLITE", "True")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
# Evita que pytest envíe notificaciones HTTP reales al servidor Node local si .env define clave.
os.environ.setdefault("EVENTOS_INTERNOS_CLAVE", "")


@pytest.fixture(autouse=True)
def _avisos_node_sincronos(settings):
    """
    Los tests verifican el aviso a Node de forma síncrona (lo que se envía y que una falla no
    rompe la operación). El modo real en segundo plano tiene tests propios que lo reactivan.
    Se usa el fixture `settings` porque pytest-django ya cargó la configuración al llegar acá.
    """
    settings.NODE_EVENTOS_EN_SEGUNDO_PLANO = False
