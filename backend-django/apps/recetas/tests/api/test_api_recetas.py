"""
Pruebas de API para productos e ítems de receta (/api/productos/ y /api/recetas-items/).
Verifica creación con recálculo automático, inmutabilidad del producto al editar
un RecetaItem (HTTP 400) y autorización granular (HTTP 403).
"""

from decimal import Decimal

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.insumos.models import Insumo
from apps.recetas.models import Producto, RecetaItem
from apps.recetas.services import actualizar_costo_y_margen_producto
from apps.usuarios.constantes import ROL_CAJERO, ROL_ENCARGADO
from apps.usuarios.services import crear_personal


@pytest.mark.django_db
class TestApiRecetasItems:
    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def usuario_recetas(self, client):
        return crear_personal(
            datos_usuario={"username": "recetas_creador", "password": "password123"},
            rol=ROL_CAJERO,
            permisos={
                "recetas.ver": True,
                "recetas.crear": True,
                "recetas.editar": True,
                "recetas.ver_costos": True,
            },
        )

    @pytest.fixture
    def usuario_sin_crear(self):
        return crear_personal(
            datos_usuario={"username": "recetas_sin_crear", "password": "password123"},
            rol=ROL_ENCARGADO,
            permisos={"recetas.crear": False},
        )

    @pytest.fixture
    def insumo_cafe(self):
        return Insumo.objects.create(
            nombre="Café Molido Espresso",
            unidad_base="g",
            costo_unitario=Decimal("25.0000"),
        )

    @pytest.fixture
    def producto_base(self):
        producto = Producto.objects.create(
            nombre="Espresso Doble Test",
            precio_venta=Decimal("2000.00"),
            minutos_mano_obra=Decimal("1.50"),
            costo_hora_mano_obra=Decimal("2400.00"),
            descartables=Decimal("40.00"),
        )
        actualizar_costo_y_margen_producto(producto)
        return producto

    @pytest.fixture
    def producto_alternativo(self):
        producto = Producto.objects.create(
            nombre="Ristretto Test",
            precio_venta=Decimal("1800.00"),
            minutos_mano_obra=Decimal("1.00"),
            costo_hora_mano_obra=Decimal("2400.00"),
            descartables=Decimal("30.00"),
        )
        actualizar_costo_y_margen_producto(producto)
        return producto

    def test_post_receta_item_con_permiso_recalcula_costo_producto(
        self, client, usuario_recetas, producto_base, insumo_cafe
    ):
        """
        POST /api/recetas-items/ con permiso recetas.crear crea el ítem
        y recalcula costo_total_calculado, ganancia_bruta y margen_bruto del producto.
        """
        # Antes de agregar insumo: MO (1.5 * 2400 / 60 = 60) + descartables (40) = 100.0000
        assert producto_base.costo_total_calculado == Decimal("100.0000")

        client.force_authenticate(user=usuario_recetas)
        payload = {
            "producto": producto_base.id,
            "insumo": insumo_cafe.id,
            "cantidad": "20.0000",
            "unidad": "g",
        }
        res = client.post("/api/recetas-items/", payload, format="json")

        assert res.status_code == status.HTTP_201_CREATED
        data = res.json()
        assert data["producto"] == producto_base.id
        assert data["insumo"] == insumo_cafe.id

        # 20 g * $25/g = $500 + $60 MO + $40 descartables = $600.0000
        producto_base.refresh_from_db()
        assert producto_base.costo_total_calculado == Decimal("600.0000")
        assert producto_base.ganancia_bruta == Decimal("1400.0000")
        assert producto_base.margen_bruto == Decimal("0.7000")

    def test_patch_receta_item_no_permite_cambiar_producto_devuelve_400(
        self, client, usuario_recetas, producto_base, producto_alternativo, insumo_cafe
    ):
        """PATCH /api/recetas-items/{id}/ intentando cambiar producto devuelve HTTP 400."""
        item = RecetaItem.objects.create(
            producto=producto_base,
            insumo=insumo_cafe,
            cantidad=Decimal("18.0000"),
            unidad="g",
        )
        client.force_authenticate(user=usuario_recetas)

        res = client.patch(
            f"/api/recetas-items/{item.id}/",
            {"producto": producto_alternativo.id},
            format="json",
        )

        assert res.status_code == status.HTTP_400_BAD_REQUEST
        data = res.json()
        assert "mensaje" in data
        assert "detalles" in data
        assert "producto" in data["detalles"]

        item.refresh_from_db()
        assert item.producto_id == producto_base.id

    def test_patch_receta_item_actualiza_cantidad_y_recalcula(
        self, client, usuario_recetas, producto_base, insumo_cafe
    ):
        """PATCH /api/recetas-items/{id}/ actualizando cantidad (o mismo producto) recalcula."""
        item = RecetaItem.objects.create(
            producto=producto_base,
            insumo=insumo_cafe,
            cantidad=Decimal("10.0000"),
            unidad="g",
        )
        actualizar_costo_y_margen_producto(producto_base)
        client.force_authenticate(user=usuario_recetas)

        res = client.patch(
            f"/api/recetas-items/{item.id}/",
            {"producto": producto_base.id, "cantidad": "30.0000"},
            format="json",
        )

        assert res.status_code == status.HTTP_200_OK
        # 30 g * $25/g = $750 + $60 MO + $40 descartables = $850.0000
        producto_base.refresh_from_db()
        assert producto_base.costo_total_calculado == Decimal("850.0000")

    def test_post_receta_item_sin_permiso_recetas_crear_devuelve_403(
        self, client, usuario_sin_crear, producto_base, insumo_cafe
    ):
        """Usuario sin permiso recetas.crear recibe HTTP 403 al crear ítem de receta."""
        client.force_authenticate(user=usuario_sin_crear)
        payload = {
            "producto": producto_base.id,
            "insumo": insumo_cafe.id,
            "cantidad": "15.0000",
            "unidad": "g",
        }
        res = client.post("/api/recetas-items/", payload, format="json")

        assert res.status_code == status.HTTP_403_FORBIDDEN
        data = res.json()
        assert "mensaje" in data
        assert "detalles" in data
