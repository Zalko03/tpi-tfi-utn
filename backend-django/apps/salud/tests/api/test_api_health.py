import os
import subprocess
import sys
from pathlib import Path

DIRECTORIO_DJANGO = Path(__file__).resolve().parents[4]


def test_health_responde_ok_sin_base_de_datos(client):
    # Sin la marca django_db, cualquier consulta a la base haría fallar el test.
    respuesta = client.get("/health")

    assert respuesta.status_code == 200
    assert respuesta.json() == {"estado": "ok", "servicio": "backend-django"}


def test_health_rechaza_metodos_distintos_de_get(client):
    assert client.post("/health").status_code == 405


def _arrancar_con_entorno(**variables):
    """Importa los settings en un proceso aparte con un entorno controlado."""
    entorno = {
        k: v
        for k, v in os.environ.items()
        if not k.startswith(("DJANGO_", "POSTGRES_"))
    }
    # Variables vacías (no ausentes): load_dotenv no pisa las ya definidas,
    # así el resultado no depende de que exista un .env local.
    entorno.update({"DJANGO_SECRET_KEY": "", "DJANGO_ALLOWED_HOSTS": ""})
    entorno.update(variables)
    entorno["DJANGO_SETTINGS_MODULE"] = "config.settings.dev"
    return subprocess.run(
        [sys.executable, "-c", "import django; django.setup()"],
        cwd=DIRECTORIO_DJANGO,
        env=entorno,
        capture_output=True,
        text=True,
    )


def test_sin_debug_y_sin_secret_key_el_arranque_falla():
    resultado = _arrancar_con_entorno(
        DJANGO_DEBUG="False", DJANGO_ALLOWED_HOSTS="localhost"
    )

    assert resultado.returncode != 0
    assert "DJANGO_SECRET_KEY" in resultado.stderr


def test_sin_debug_y_sin_allowed_hosts_el_arranque_falla():
    resultado = _arrancar_con_entorno(DJANGO_DEBUG="False", DJANGO_SECRET_KEY="x")

    assert resultado.returncode != 0
    assert "DJANGO_ALLOWED_HOSTS" in resultado.stderr


def test_con_debug_y_sin_variables_usa_valores_de_desarrollo():
    resultado = _arrancar_con_entorno(DJANGO_DEBUG="True")

    assert resultado.returncode == 0, resultado.stderr
