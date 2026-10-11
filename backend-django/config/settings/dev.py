"""Configuración de desarrollo local."""
import os
from pathlib import Path

from dotenv import load_dotenv

# Se carga el .env antes del valor por defecto para que un DJANGO_DEBUG=False
# escrito allí se respete. base.py vuelve a llamar a load_dotenv sin efecto.
load_dotenv(Path(__file__).resolve().parents[3] / '.env')

# En desarrollo, DEBUG es True salvo que se indique lo contrario. Debe fijarse
# antes de importar base, que decide según DEBUG si exige SECRET_KEY y hosts.
os.environ.setdefault('DJANGO_DEBUG', 'True')

from .base import *  # noqa: E402,F401,F403
