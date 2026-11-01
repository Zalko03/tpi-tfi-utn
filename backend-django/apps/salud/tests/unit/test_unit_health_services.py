"""
Tests unitarios puros para servicios de salud (TP 4).
No requiere conexión real a base de datos externa (usa mocks).
"""

from unittest.mock import MagicMock, patch

from apps.salud.services import verificar_salud_base_datos


@patch("apps.salud.services.connection")
def test_verificar_salud_base_datos_exitoso(mock_connection):
    mock_cursor = MagicMock()
    mock_cursor.fetchone.return_value = (1,)
    mock_connection.cursor.return_value.__enter__.return_value = mock_cursor
    mock_connection.vendor = "postgresql"

    resultado = verificar_salud_base_datos()

    assert resultado["estado"] == "ok"
    assert resultado["motor"] == "postgresql"
    assert "latencia_ms" in resultado
    assert isinstance(resultado["latencia_ms"], float)
    mock_cursor.execute.assert_called_once_with("SELECT 1")


@patch("apps.salud.services.connection")
def test_verificar_salud_base_datos_captura_excepcion(mock_connection):
    mock_connection.cursor.side_effect = RuntimeError("Conexión perdida con la base de datos")
    mock_connection.vendor = "postgresql"

    resultado = verificar_salud_base_datos()

    assert resultado["estado"] == "error"
    assert "Conexión perdida" in resultado["mensaje"]
    assert resultado["motor"] == "postgresql"
