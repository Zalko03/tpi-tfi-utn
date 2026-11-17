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
from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO, ROL_ENCARGADO
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


@pytest.mark.django_db
class TestApiProductosPermisosPOS:
    """Verifica que el cajero lea la carta sin costos y conserve el bloqueo de escritura/recetas."""

    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def cajero(self):
        return crear_personal(
            datos_usuario={"username": "cajero_carta_pos", "password": "password123"},
            rol=ROL_CAJERO,
        )

    @pytest.fixture
    def duenio(self):
        return crear_personal(
            datos_usuario={"username": "duenio_carta_pos", "password": "password123"},
            rol=ROL_DUENIO,
        )

    @pytest.fixture
    def producto_con_receta(self):
        insumo = Insumo.objects.create(
            nombre="Grano Geisha Test",
            unidad_base="g",
            costo_unitario=Decimal("40.0000"),
        )
        producto = Producto.objects.create(
            nombre="Filtrado Geisha Test",
            codigo_barras="7790001000999",
            precio_venta=Decimal("7500.00"),
            minutos_mano_obra=Decimal("3.00"),
            costo_hora_mano_obra=Decimal("2400.00"),
            descartables=Decimal("120.00"),
        )
        RecetaItem.objects.create(
            producto=producto,
            insumo=insumo,
            cantidad=Decimal("18.0000"),
            unidad="g",
        )
        actualizar_costo_y_margen_producto(producto)
        return producto

    def test_cajero_puede_listar_y_ver_detalle_producto_sin_costos(
        self, client, cajero, producto_con_receta
    ):
        client.force_authenticate(user=cajero)

        res_lista = client.get("/api/productos/")
        assert res_lista.status_code == status.HTTP_200_OK
        datos = res_lista.json().get("datos", [])
        assert len(datos) == 1
        item_lista = datos[0]
        assert item_lista["id"] == producto_con_receta.id
        assert item_lista["nombre"] == "Filtrado Geisha Test"
        assert item_lista["precio_venta"] == "7500.00"
        assert item_lista["costo_total_calculado"] is None
        assert item_lista["ganancia_bruta"] is None
        assert item_lista["margen_bruto"] is None
        assert item_lista["costo_hora_mano_obra"] is None
        assert item_lista["descartables"] is None
        assert item_lista["receta_items"][0]["insumo_costo_unitario"] is None

        res_detalle = client.get(f"/api/productos/{producto_con_receta.id}/")
        assert res_detalle.status_code == status.HTTP_200_OK
        detalle = res_detalle.json()
        assert detalle["costo_total_calculado"] is None
        assert detalle["ganancia_bruta"] is None
        assert detalle["margen_bruto"] is None
        assert detalle["costo_hora_mano_obra"] is None
        assert detalle["descartables"] is None
        assert detalle["receta_items"][0]["insumo_costo_unitario"] is None

    def test_cajero_recibe_403_en_escritura_productos_y_listado_recetas_items(
        self, client, cajero, producto_con_receta
    ):
        client.force_authenticate(user=cajero)

        res_post = client.post(
            "/api/productos/",
            {"nombre": "No Autorizado", "precio_venta": "1500.00"},
            format="json",
        )
        assert res_post.status_code == status.HTTP_403_FORBIDDEN

        res_patch = client.patch(
            f"/api/productos/{producto_con_receta.id}/",
            {"precio_venta": "9000.00"},
            format="json",
        )
        assert res_patch.status_code == status.HTTP_403_FORBIDDEN

        res_delete = client.delete(f"/api/productos/{producto_con_receta.id}/")
        assert res_delete.status_code == status.HTTP_403_FORBIDDEN

        res_items = client.get("/api/recetas-items/")
        assert res_items.status_code == status.HTTP_403_FORBIDDEN

    def test_duenio_sigue_viendo_costos_en_productos(self, client, duenio, producto_con_receta):
        client.force_authenticate(user=duenio)

        res_lista = client.get("/api/productos/")
        assert res_lista.status_code == status.HTTP_200_OK
        item_lista = res_lista.json()["datos"][0]
        assert item_lista["costo_total_calculado"] == "960.0000"
        assert item_lista["ganancia_bruta"] == "6540.0000"
        assert item_lista["margen_bruto"] == "0.8720"
        assert item_lista["costo_hora_mano_obra"] == "2400.00"
        assert item_lista["descartables"] == "120.00"
        assert Decimal(str(item_lista["receta_items"][0]["insumo_costo_unitario"])) == Decimal(
            "40.0000"
        )

        res_detalle = client.get(f"/api/productos/{producto_con_receta.id}/")
        assert res_detalle.status_code == status.HTTP_200_OK
        detalle = res_detalle.json()
        assert detalle["costo_total_calculado"] == "960.0000"
        assert detalle["costo_hora_mano_obra"] == "2400.00"
        assert detalle["descartables"] == "120.00"
        assert Decimal(str(detalle["receta_items"][0]["insumo_costo_unitario"])) == Decimal(
            "40.0000"
        )
