"""Tests de integración para endpoints de DRF, paginación y formato unificado de errores."""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.insumos.models import Insumo
from apps.usuarios.constantes import ROL_DUENIO
from apps.usuarios.models import PerfilUsuario

User = get_user_model()


@pytest.mark.django_db
class TestApiContratos:
    @pytest.fixture
    def client(self):
        c = APIClient()
        user = User.objects.create_user(
            username="contrato_duenio",
            password="password123",
            email="duenio@cafe.local",
        )
        PerfilUsuario.objects.create(usuario=user, rol=ROL_DUENIO)
        c.force_authenticate(user=user)
        return c

    def test_contrato_paginacion_lista_insumos(self, client):
        """El listado debe responder con la estructura { datos, pagina, limite, total }."""
        Insumo.objects.create(nombre="Insumo A", unidad_base="g")
        Insumo.objects.create(nombre="Insumo B", unidad_base="ml")

        res = client.get("/api/insumos/")
        assert res.status_code == 200
        data = res.json()

        assert "datos" in data
        assert "pagina" in data
        assert "limite" in data
        assert "total" in data
        assert data["total"] == 2
        assert len(data["datos"]) == 2

    def test_contrato_error_404_formato_unico(self, client):
        """Un recurso inexistente responde 404 con { mensaje, detalles: null }."""
        res = client.get("/api/insumos/99999/")
        assert res.status_code == 404
        data = res.json()

        assert "mensaje" in data
        assert "detalles" in data
        assert data["mensaje"] == "Recurso no encontrado"
        assert data["detalles"] is None

    def test_contrato_error_400_validacion(self, client):
        """Datos inválidos responden 400 con { mensaje, detalles }."""
        res = client.post(
            "/api/insumos/", {"nombre": "", "unidad_base": "invalida"}, format="json"
        )
        assert res.status_code == 400
        data = res.json()

        assert "mensaje" in data
        assert "detalles" in data
        assert data["detalles"] is not None
