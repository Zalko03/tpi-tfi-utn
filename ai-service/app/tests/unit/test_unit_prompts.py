"""Tests unitarios para el cargador seguro de prompts versionados (app/services/prompts.py)."""
import pytest
from app.services.prompts import cargar_prompt


class TestUnitPrompts:
    """Pruebas unitarias de lectura y validación de seguridad de prompts."""

    def test_carga_prompt_extraer_precios_v1(self):
        contenido = cargar_prompt("extraer_precios", "v1")
        assert "JSON" in contenido
        assert "items" in contenido
        assert "precio_total" in contenido

    def test_carga_prompt_resumen_semanal_v1(self):
        contenido = cargar_prompt("resumen_semanal", "v1")
        assert "resumen_ejecutivo" in contenido
        assert "sugerencias_rotacion" in contenido

    @pytest.mark.parametrize("version_maliciosa", ["../v1", "v1/../../etc", "v", "latest", ""])
    def test_bloquea_path_traversal_en_version(self, version_maliciosa):
        with pytest.raises(ValueError, match="Versión de prompt inválida"):
            cargar_prompt("extraer_precios", version_maliciosa)

    @pytest.mark.parametrize("nombre_malicioso", ["../secret", "extraer/precios", "prompt.txt", ""])
    def test_bloquea_path_traversal_en_nombre(self, nombre_malicioso):
        with pytest.raises(ValueError, match="Nombre de prompt inválido"):
            cargar_prompt(nombre_malicioso, "v1")

    def test_lanza_file_not_found_si_version_no_existe(self):
        with pytest.raises(FileNotFoundError):
            cargar_prompt("extraer_precios", "v99")
