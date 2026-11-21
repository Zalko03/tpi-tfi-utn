"""
Suite exhaustiva de pruebas negativas sistemáticas por permiso en endpoints de negocio (T2.6).
Verifica que cualquier petición de un usuario autenticado sin el permiso granular requerido
o con restricciones de objeto reciba exactamente HTTP 403 Forbidden con el formato
unificado de error { "mensaje": "...", "detalles": null } (docs/api-errores.md y docs/seguridad.md).
"""

from decimal import Decimal

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.caja.models import TurnoCaja
from apps.insumos.models import Insumo, Proveedor
from apps.recetas.models import Producto
from apps.usuarios.constantes import ROL_CAJERO, ROL_DUENIO, ROL_ENCARGADO
from apps.usuarios.services import crear_personal
from apps.ventas.models import Venta


@pytest.mark.django_db
class TestApiPermisosNegativosSistematicos:
    """Tests negativos sistemáticos por endpoint y permiso."""

    @pytest.fixture
    def client(self):
        return APIClient()

    @pytest.fixture
    def duenio(self):
        return crear_personal(
            datos_usuario={"username": "duenio_test_neg", "password": "password123"},
            rol=ROL_DUENIO,
        )

    @pytest.fixture
    def encargado(self):
        return crear_personal(
            datos_usuario={"username": "encargado_test_neg", "password": "password123"},
            rol=ROL_ENCARGADO,
        )

    @pytest.fixture
    def cajero(self):
        return crear_personal(
            datos_usuario={"username": "cajero_test_neg", "password": "password123"},
            rol=ROL_CAJERO,
        )

    @pytest.fixture
    def cajero_dos(self):
        return crear_personal(
            datos_usuario={
                "username": "cajero_dos_test_neg",
                "password": "password123",
            },
            rol=ROL_CAJERO,
        )

    @pytest.fixture
    def proveedor(self):
        return Proveedor.objects.create(nombre="Distribuidora Café Central")

    @pytest.fixture
    def insumo(self):
        return Insumo.objects.create(
            nombre="Café Grano Especial",
            unidad_base="g",
            costo_unitario=Decimal("25.0000"),
        )

    @pytest.fixture
    def producto(self, insumo):
        return Producto.objects.create(
            nombre="Café Americano",
            precio_venta=Decimal("2500.00"),
            costo_total_calculado=Decimal("1200.0000"),
            ganancia_bruta=Decimal("1300.0000"),
            margen_bruto=Decimal("52.00"),
        )

    def _verificar_403(self, response):
        """Valida que la respuesta cumpla con HTTP 403 y el contrato de docs/api-errores.md."""
        assert response.status_code == status.HTTP_403_FORBIDDEN
        data = response.json()
        assert "mensaje" in data
        assert isinstance(data["mensaje"], str)
        assert len(data["mensaje"]) > 0
        assert "detalles" in data

    # ==========================================
    # MÓDULO INSUMOS Y PROVEEDORES
    # ==========================================

    def test_insumos_get_rechaza_cajero_sin_insumos_ver(self, client, cajero):
        """Cajero sin 'insumos.ver' recibe 403 al listar insumos."""
        client.force_authenticate(user=cajero)
        res = client.get("/api/insumos/")
        self._verificar_403(res)

    def test_insumos_post_rechaza_cajero_sin_insumos_crear(self, client, cajero):
        """Cajero sin 'insumos.crear' recibe 403 al crear insumo."""
        client.force_authenticate(user=cajero)
        res = client.post(
            "/api/insumos/",
            {"nombre": "Leche Almendras", "unidad_base": "ml"},
            format="json",
        )
        self._verificar_403(res)

    def test_insumos_put_rechaza_cajero_sin_insumos_editar(self, client, cajero, insumo):
        """Cajero sin 'insumos.editar' recibe 403 al editar insumo."""
        client.force_authenticate(user=cajero)
        res = client.patch(
            f"/api/insumos/{insumo.id}/",
            {"costo_unitario": "30.0000"},
            format="json",
        )
        self._verificar_403(res)

    def test_insumos_delete_rechaza_encargado_sin_insumos_eliminar(self, client, encargado, insumo):
        """Encargado (que por plantilla no puede eliminar insumos) recibe 403 al hacer DELETE."""
        client.force_authenticate(user=encargado)
        res = client.delete(f"/api/insumos/{insumo.id}/")
        self._verificar_403(res)

    def test_proveedores_get_rechaza_cajero_sin_insumos_ver(self, client, cajero):
        """Cajero recibe 403 al listar proveedores."""
        client.force_authenticate(user=cajero)
        res = client.get("/api/proveedores/")
        self._verificar_403(res)

    def test_proveedores_post_rechaza_cajero_sin_insumos_crear(self, client, cajero):
        """Cajero recibe 403 al dar de alta proveedores."""
        client.force_authenticate(user=cajero)
        res = client.post(
            "/api/proveedores/",
            {"nombre": "Distribuidora Nueva"},
            format="json",
        )
        self._verificar_403(res)

    def test_proveedores_delete_rechaza_encargado_sin_insumos_eliminar(
        self, client, encargado, proveedor
    ):
        """Encargado recibe 403 al eliminar proveedor."""
        client.force_authenticate(user=encargado)
        res = client.delete(f"/api/proveedores/{proveedor.id}/")
        self._verificar_403(res)

    # ==========================================
    # MÓDULO COMPRAS
    # ==========================================

    def test_compras_get_rechaza_cajero_sin_compras_ver(self, client, cajero):
        """Cajero no tiene permiso para consultar historial de compras."""
        client.force_authenticate(user=cajero)
        res = client.get("/api/compras/")
        self._verificar_403(res)

    def test_compras_post_rechaza_cajero_sin_compras_registrar(
        self, client, cajero, proveedor, insumo
    ):
        """Cajero no tiene permiso para registrar compras de mercadería."""
        client.force_authenticate(user=cajero)
        payload = {
            "proveedor": proveedor.id,
            "insumo": insumo.id,
            "cantidad": "10.00",
            "precio_total": "5000.00",
        }
        res = client.post("/api/compras/", payload, format="json")
        self._verificar_403(res)

    # ==========================================
    # MÓDULO RECETAS Y PRODUCTOS
    # ==========================================

    def test_productos_get_rechaza_usuario_sin_recetas_ver_ni_cobrar_ticket(self, client):
        """Usuario sin 'recetas.ver' ni 'ventas.cobrar_ticket' recibe 403 al listar productos."""
        operador_sin_permiso = crear_personal(
            datos_usuario={"username": "sin_carta_test", "password": "password123"},
            rol=ROL_CAJERO,
            permisos={"recetas.ver": False, "ventas.cobrar_ticket": False},
        )
        client.force_authenticate(user=operador_sin_permiso)
        res = client.get("/api/productos/")
        self._verificar_403(res)

    def test_productos_post_rechaza_cajero_sin_recetas_crear(self, client, cajero):
        """Cajero recibe 403 al crear productos."""
        client.force_authenticate(user=cajero)
        res = client.post(
            "/api/productos/",
            {"nombre": "Cappuccino", "precio_venta": "3500.00"},
            format="json",
        )
        self._verificar_403(res)

    def test_productos_put_rechaza_cajero_sin_recetas_editar(self, client, cajero, producto):
        """Cajero recibe 403 al editar productos."""
        client.force_authenticate(user=cajero)
        res = client.patch(
            f"/api/productos/{producto.id}/",
            {"precio_venta": "4000.00"},
            format="json",
        )
        self._verificar_403(res)

    def test_productos_delete_rechaza_encargado_sin_recetas_eliminar(
        self, client, encargado, producto
    ):
        """Encargado (sin recetas.eliminar en plantilla) recibe 403 al eliminar producto."""
        client.force_authenticate(user=encargado)
        res = client.delete(f"/api/productos/{producto.id}/")
        self._verificar_403(res)

    def test_productos_costo_rechaza_cajero_sin_recetas_ver_costos(self, client, cajero, producto):
        """Cajero recibe 403 al intentar acceder a /api/productos/:id/costo/."""
        client.force_authenticate(user=cajero)
        res = client.get(f"/api/productos/{producto.id}/costo/")
        self._verificar_403(res)

    def test_productos_recalcular_rechaza_cajero_sin_recetas_ver_costos(
        self, client, cajero, producto
    ):
        """Cajero recibe 403 al intentar invocar /api/productos/:id/recalcular/."""
        client.force_authenticate(user=cajero)
        res = client.post(f"/api/productos/{producto.id}/recalcular/")
        self._verificar_403(res)

    def test_recetas_items_get_rechaza_cajero_sin_recetas_ver(self, client, cajero):
        """Cajero recibe 403 al listar items de recetas."""
        client.force_authenticate(user=cajero)
        res = client.get("/api/recetas-items/")
        self._verificar_403(res)

    def test_recetas_items_post_rechaza_cajero_sin_recetas_crear(
        self, client, cajero, producto, insumo
    ):
        """Cajero recibe 403 al asociar insumos a recetas."""
        client.force_authenticate(user=cajero)
        payload = {
            "producto": producto.id,
            "insumo": insumo.id,
            "cantidad": "20.0000",
            "unidad": "g",
        }
        res = client.post("/api/recetas-items/", payload, format="json")
        self._verificar_403(res)

    # ==========================================
    # MÓDULO VENTAS
    # ==========================================

    def test_ventas_post_rechaza_usuario_sin_ventas_cobrar_ticket(self, client, duenio, producto):
        """Usuario con ventas.cobrar_ticket apagado recibe 403 al intentar registrar una venta."""
        usuario_sin_cobro = crear_personal(
            datos_usuario={"username": "sin_cobro", "password": "password123"},
            rol=ROL_CAJERO,
            permisos={"ventas.cobrar_ticket": False},
            creado_por=duenio,
        )
        client.force_authenticate(user=usuario_sin_cobro)
        payload = {"items_entrada": [{"producto_id": producto.id, "cantidad": "1.00"}]}
        res = client.post("/api/ventas/", payload, format="json")
        self._verificar_403(res)

    def test_ventas_anular_rechaza_cajero_sin_ventas_anular_ticket(self, client, cajero, producto):
        """Cajero recibe 403 al intentar anular una venta sin el permiso ventas.anular_ticket."""
        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("1000.00"))
        venta = Venta.objects.create(turno_caja=turno, total=Decimal("2500.00"))

        client.force_authenticate(user=cajero)
        res = client.post(f"/api/ventas/{venta.id}/anular/")
        self._verificar_403(res)

    def test_ventas_retrieve_objeto_rechaza_cajero_en_turno_ajeno(self, client, cajero, cajero_dos):
        """Cajero recibe 403 al intentar consultar una venta perteneciente a otro cajero."""
        turno_otro = TurnoCaja.objects.create(
            usuario=cajero_dos, efectivo_inicial=Decimal("1000.00")
        )
        venta_otro = Venta.objects.create(turno_caja=turno_otro, total=Decimal("3000.00"))

        client.force_authenticate(user=cajero)
        res = client.get(f"/api/ventas/{venta_otro.id}/")
        self._verificar_403(res)

    def test_ventas_post_rechaza_turno_de_otro_cajero(self, client, cajero, cajero_dos, producto):
        """Cajero recibe 403 si intenta registrar una venta sobre el turno de otro cajero."""
        turno_otro = TurnoCaja.objects.create(
            usuario=cajero_dos, efectivo_inicial=Decimal("1000.00")
        )

        client.force_authenticate(user=cajero)
        payload = {
            "turno_caja": turno_otro.id,
            "items_entrada": [{"producto_id": producto.id, "cantidad": "1.00"}],
        }
        res = client.post("/api/ventas/", payload, format="json")
        self._verificar_403(res)

    # ==========================================
    # MÓDULO CAJA
    # ==========================================

    def test_caja_turnos_post_rechaza_usuario_sin_caja_abrir_turno(self, client, duenio):
        """Usuario con caja.abrir_turno apagado recibe 403 al abrir turno."""
        usuario_sin_apertura = crear_personal(
            datos_usuario={"username": "sin_apertura", "password": "password123"},
            rol=ROL_CAJERO,
            permisos={"caja.abrir_turno": False},
            creado_por=duenio,
        )
        client.force_authenticate(user=usuario_sin_apertura)
        res = client.post(
            "/api/caja/turnos/",
            {"efectivo_inicial": "5000.00"},
            format="json",
        )
        self._verificar_403(res)

    def test_caja_turnos_cerrar_rechaza_usuario_sin_caja_cerrar_turno(self, client, duenio, cajero):
        """Usuario con caja.cerrar_turno apagado recibe 403 al intentar cerrar."""
        usuario_sin_cierre = crear_personal(
            datos_usuario={"username": "sin_cierre", "password": "password123"},
            rol=ROL_CAJERO,
            permisos={"caja.cerrar_turno": False},
            creado_por=duenio,
        )
        turno = TurnoCaja.objects.create(
            usuario=usuario_sin_cierre, efectivo_inicial=Decimal("5000.00")
        )

        client.force_authenticate(user=usuario_sin_cierre)
        res = client.post(
            f"/api/caja/turnos/{turno.id}/cerrar/",
            {"efectivo_contado": "5000.00"},
            format="json",
        )
        self._verificar_403(res)

    def test_caja_turnos_cerrar_objeto_rechaza_cajero_en_turno_ajeno(
        self, client, cajero, cajero_dos
    ):
        """Cajero recibe 403 al intentar cerrar el turno de otro usuario."""
        turno_otro = TurnoCaja.objects.create(
            usuario=cajero_dos, efectivo_inicial=Decimal("2000.00")
        )

        client.force_authenticate(user=cajero)
        res = client.post(
            f"/api/caja/turnos/{turno_otro.id}/cerrar/",
            {"efectivo_contado": "2000.00"},
            format="json",
        )
        self._verificar_403(res)

    def test_caja_turnos_retrieve_objeto_rechaza_cajero_en_turno_ajeno(
        self, client, cajero, cajero_dos
    ):
        """Cajero recibe 403 al consultar el detalle del turno de otro usuario."""
        turno_otro = TurnoCaja.objects.create(
            usuario=cajero_dos, efectivo_inicial=Decimal("2000.00")
        )

        client.force_authenticate(user=cajero)
        res = client.get(f"/api/caja/turnos/{turno_otro.id}/")
        self._verificar_403(res)

    def test_caja_movimientos_post_rechaza_cajero_sin_permiso(self, client, cajero):
        """Cajero sin 'caja.registrar_movimiento' recibe 403 al registrar movimiento."""
        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("2000.00"))
        client.force_authenticate(user=cajero)
        payload = {
            "turno_caja": turno.id,
            "tipo": "EGRESO",
            "monto": "500.00",
            "motivo": "Compra de hielo",
        }
        res = client.post("/api/caja/movimientos-caja/", payload, format="json")
        self._verificar_403(res)

    def test_caja_movimientos_get_rechaza_cajero_sin_permiso(self, client, cajero):
        """Cajero recibe 403 al listar movimientos de caja."""
        client.force_authenticate(user=cajero)
        res = client.get("/api/caja/movimientos-caja/")
        self._verificar_403(res)

    # ==========================================
    # MÓDULO PERSONAL Y AUDITORÍA
    # ==========================================

    def test_personal_get_rechaza_encargado_y_cajero(self, client, encargado, cajero):
        """Ni Encargado ni Cajero tienen 'personal.ver'."""
        client.force_authenticate(user=encargado)
        res_enc = client.get("/api/usuarios/")
        self._verificar_403(res_enc)

        client.force_authenticate(user=cajero)
        res_caj = client.get("/api/usuarios/")
        self._verificar_403(res_caj)

    def test_personal_post_rechaza_encargado_sin_personal_crear(self, client, encargado):
        """Encargado recibe 403 al intentar registrar nuevo personal."""
        client.force_authenticate(user=encargado)
        payload = {
            "username": "nuevo_cajero",
            "password": "password123",
            "email": "cajero@cafe.local",
            "rol": "CAJERO",
        }
        res = client.post("/api/usuarios/", payload, format="json")
        self._verificar_403(res)

    def test_personal_put_rechaza_encargado_sin_personal_editar(self, client, encargado, cajero):
        """Encargado recibe 403 al intentar editar perfil de otro empleado."""
        client.force_authenticate(user=encargado)
        res = client.patch(
            f"/api/usuarios/{cajero.id}/",
            {"email": "modificado@cafe.local"},
            format="json",
        )
        self._verificar_403(res)

    def test_personal_desactivar_rechaza_encargado_sin_personal_desactivar(
        self, client, encargado, cajero
    ):
        """Encargado recibe 403 al intentar desactivar a un usuario."""
        client.force_authenticate(user=encargado)
        res = client.post(
            f"/api/usuarios/{cajero.id}/desactivar/",
            {"motivo": "Fin de contrato"},
            format="json",
        )
        self._verificar_403(res)

    def test_personal_ajustar_permisos_rechaza_encargado(self, client, encargado, cajero):
        """Encargado recibe 403 al intentar modificar permisos de un usuario."""
        client.force_authenticate(user=encargado)
        res = client.post(
            f"/api/usuarios/{cajero.id}/ajustar-permisos/",
            {"permisos": {"insumos.ver": True}},
            format="json",
        )
        self._verificar_403(res)

    def test_auditoria_get_rechaza_encargado_y_cajero_sin_auditoria_ver_logs(
        self, client, encargado, cajero
    ):
        """Encargado y Cajero reciben 403 al intentar consultar logs de auditoría."""
        client.force_authenticate(user=encargado)
        res_enc = client.get("/api/usuarios/auditoria/")
        self._verificar_403(res_enc)

        client.force_authenticate(user=cajero)
        res_caj = client.get("/api/usuarios/auditoria/")
        self._verificar_403(res_caj)

    # ==========================================
    # OVERRIDE BOOLEANO INDIVIDUAL (ENCENDER Y APAGAR)
    # ==========================================

    def test_override_booleano_apagar_permiso_a_encargado(self, client, duenio, insumo):
        """Encargado con insumos.ver sobreescrito en False es rechazado con 403."""
        encargado_restringido = crear_personal(
            datos_usuario={"username": "enc_restringido", "password": "password123"},
            rol=ROL_ENCARGADO,
            permisos={"insumos.ver": False},
            creado_por=duenio,
        )
        client.force_authenticate(user=encargado_restringido)
        res = client.get("/api/insumos/")
        self._verificar_403(res)

    def test_override_booleano_encender_permiso_a_cajero(self, client, duenio):
        """Cajero con insumos.ver encendido en True puede consultar exitosamente (200 OK)."""
        cajero_autorizado = crear_personal(
            datos_usuario={"username": "caj_autorizado", "password": "password123"},
            rol=ROL_CAJERO,
            permisos={"insumos.ver": True},
            creado_por=duenio,
        )
        client.force_authenticate(user=cajero_autorizado)
        res = client.get("/api/insumos/")
        assert res.status_code == status.HTTP_200_OK

    # ==========================================
    # REGLA DE ARQUEO CIEGO EN CIERRE DE TURNO
    # ==========================================

    def test_arqueo_ciego_cajero_no_recibe_efectivo_esperado_ni_diferencia(self, client, cajero):
        """Al cerrar turno, un cajero no recibe efectivo_esperado ni diferencia en la respuesta."""
        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("5000.00"))
        client.force_authenticate(user=cajero)
        res = client.post(
            f"/api/caja/turnos/{turno.id}/cerrar/",
            {"efectivo_contado": "5200.00"},
            format="json",
        )
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert data["efectivo_contado"] == "5200.00"
        assert data["efectivo_esperado"] is None
        assert data["diferencia"] is None
        assert data["estado"] == "CERRADO"

    def test_arqueo_duenio_recibe_efectivo_esperado_y_diferencia(self, client, duenio):
        """Dueño con caja.ver_efectivo_esperado ve el saldo teórico y la diferencia calculada."""
        turno = TurnoCaja.objects.create(usuario=duenio, efectivo_inicial=Decimal("5000.00"))
        client.force_authenticate(user=duenio)
        res = client.post(
            f"/api/caja/turnos/{turno.id}/cerrar/",
            {"efectivo_contado": "5200.00"},
            format="json",
        )
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert data["efectivo_contado"] == "5200.00"
        assert data["efectivo_esperado"] == "5000.00"
        assert data["diferencia"] == "200.00"
        assert data["estado"] == "CERRADO"

    def test_arqueo_ciego_cajero_no_recibe_ventas_efectivo_total(self, client, cajero):
        """Un cajero no debe recibir ventas_efectivo_total al consultar turnos (arqueo 100% ciego)."""
        from apps.recetas.models import Producto
        from apps.ventas.services import registrar_venta

        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("5000.00"))
        prod = Producto.objects.create(
            nombre="Espresso",
            precio_venta=Decimal("2500.00"),
            costo_total_calculado=Decimal("700.0000"),
        )
        registrar_venta(
            items_data=[{"producto_id": prod.id, "cantidad": Decimal("1")}],
            medio_pago="EFECTIVO",
            turno_caja=turno,
        )

        client.force_authenticate(user=cajero)
        res_detalle = client.get(f"/api/caja/turnos/{turno.id}/")
        assert res_detalle.status_code == status.HTTP_200_OK
        detalle = res_detalle.json()
        assert detalle["efectivo_esperado"] is None
        assert detalle["diferencia"] is None
        assert detalle["ventas_efectivo_total"] is None
        assert detalle["efectivo_inicial"] is None
        assert detalle["cantidad_tickets"] is None
        assert detalle["movimientos"] == []

        res_lista = client.get("/api/caja/turnos/")
        assert res_lista.status_code == status.HTTP_200_OK
        datos_lista = res_lista.json().get("datos", [])
        assert len(datos_lista) >= 1
        assert datos_lista[0]["ventas_efectivo_total"] is None
        assert datos_lista[0]["efectivo_inicial"] is None
        assert datos_lista[0]["cantidad_tickets"] is None
        assert datos_lista[0]["movimientos"] == []

    def test_arqueo_ciego_cajero_no_puede_deducir_efectivo_por_get_ventas(self, client, cajero):
        """
        Un cajero no debe poder reconstruir ventas_efectivo_total consultando
        GET /api/ventas/?turno_caja=<id>&medio_pago=EFECTIVO, pero sí puede registrar
        una venta con POST /api/ventas/ y confirmar su creación.
        """
        from apps.caja.models import MovimientoCaja
        from apps.recetas.models import Producto
        from apps.ventas.services import registrar_venta

        turno = TurnoCaja.objects.create(usuario=cajero, efectivo_inicial=Decimal("5000.00"))
        MovimientoCaja.objects.create(
            turno_caja=turno, tipo="ENTRADA", monto=Decimal("1000.00"), motivo="Cambio"
        )
        prod = Producto.objects.create(
            nombre="Flat White Ciego",
            precio_venta=Decimal("3000.00"),
            costo_total_calculado=Decimal("800.0000"),
        )
        registrar_venta(
            items_data=[{"producto_id": prod.id, "cantidad": Decimal("1")}],
            medio_pago="EFECTIVO",
            turno_caja=turno,
        )
        registrar_venta(
            items_data=[{"producto_id": prod.id, "cantidad": Decimal("1")}],
            medio_pago="TARJETA",
            turno_caja=turno,
        )

        client.force_authenticate(user=cajero)

        # POST /api/ventas/ sigue confirmando creación al cajero
        res_post = client.post(
            "/api/ventas/",
            {
                "turno_caja": turno.id,
                "medio_pago": "EFECTIVO",
                "items_entrada": [{"producto_id": prod.id, "cantidad": "1.00"}],
            },
            format="json",
        )
        assert res_post.status_code == status.HTTP_201_CREATED
        assert res_post.json()["id"] is not None

        # GET /api/ventas/?turno_caja=<id>&medio_pago=EFECTIVO oculta montos, medios y no filtra por medio_pago
        res_ventas = client.get(f"/api/ventas/?turno_caja={turno.id}&medio_pago=EFECTIVO")
        assert res_ventas.status_code == status.HTTP_200_OK
        datos_ventas = res_ventas.json().get("datos", [])
        assert len(datos_ventas) == 3  # Incluye TARJETA porque medio_pago no se filtra al cajero
        for v in datos_ventas:
            assert v["total"] is None
            assert v["medio_pago"] is None
            assert v["costo_total_snapshot"] is None
            for item in v["items"]:
                assert item["precio_unitario"] is None
                assert item["costo_unitario_snapshot"] is None

        # GET /api/caja/turnos/<id>/ muestra los movimientos del turno propio pero oculta los montos (arqueo ciego)
        res_turno = client.get(f"/api/caja/turnos/{turno.id}/")
        assert res_turno.status_code == status.HTTP_200_OK
        t_data = res_turno.json()
        assert t_data["ventas_efectivo_total"] is None
        assert t_data["efectivo_esperado"] is None
        assert t_data["efectivo_inicial"] is None
        assert t_data["cantidad_tickets"] is None
        assert len(t_data["movimientos"]) == 1
        assert t_data["movimientos"][0]["motivo"] == "Cambio"

    def test_arqueo_duenio_recibe_ventas_efectivo_total(self, client, duenio):
        """Dueño con caja.ver_efectivo_esperado ve ventas_efectivo_total del turno."""
        from apps.recetas.models import Producto
        from apps.ventas.services import registrar_venta

        turno = TurnoCaja.objects.create(usuario=duenio, efectivo_inicial=Decimal("5000.00"))
        prod = Producto.objects.create(
            nombre="Latte",
            precio_venta=Decimal("3200.00"),
            costo_total_calculado=Decimal("900.0000"),
        )
        registrar_venta(
            items_data=[{"producto_id": prod.id, "cantidad": Decimal("1")}],
            medio_pago="EFECTIVO",
            turno_caja=turno,
        )

        client.force_authenticate(user=duenio)
        res_detalle = client.get(f"/api/caja/turnos/{turno.id}/")
        assert res_detalle.status_code == status.HTTP_200_OK
        detalle = res_detalle.json()
        assert detalle["ventas_efectivo_total"] == "3200.00"
        assert detalle["efectivo_esperado"] is not None

    # ==========================================
    # CONFIGURACIÓN FISCAL DEL LOCAL (HU14)
    # ==========================================

    def test_configuracion_fiscal_rechaza_encargado_y_cajero(self, client, encargado, cajero):
        """Solo el Dueño puede consultar o modificar /api/configuracion-fiscal/ y su historial."""
        for usuario in (encargado, cajero):
            client.force_authenticate(user=usuario)
            self._verificar_403(client.get("/api/configuracion-fiscal/"))
            self._verificar_403(
                client.put(
                    "/api/configuracion-fiscal/",
                    {"condicion_fiscal": "RESPONSABLE_INSCRIPTO"},
                    format="json",
                )
            )
            self._verificar_403(
                client.patch(
                    "/api/configuracion-fiscal/",
                    {"condicion_fiscal": "MONOTRIBUTISTA"},
                    format="json",
                )
            )
            self._verificar_403(client.get("/api/configuracion-fiscal/historial/"))

        client.force_authenticate(user=cajero)
        self._verificar_403(client.get("/api/configuracion-fiscal/estado/"))
