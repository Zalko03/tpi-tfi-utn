"""ViewSets y vistas delgadas para proveedores, insumos, compras y configuración fiscal."""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.comun.filtros import extraer_rango_fechas, filtrar_queryset_por_rango_fechas
from apps.insumos.models import Compra, Insumo, Proveedor
from apps.insumos.serializers import (
    AjusteStockSerializer,
    CompraSerializer,
    ConfiguracionFiscalActualizarSerializer,
    ConfirmarImportacionComprasSerializer,
    InsumoSerializer,
    MovimientoStockSerializer,
    ProveedorSerializer,
)
from apps.insumos.services import (
    actualizar_condicion_fiscal,
    ajustar_stock_insumo,
    listar_historial_condicion_fiscal,
    listar_insumos_stock_bajo,
    listar_movimientos_stock_reales,
    obtener_criterio_iva_vigente,
    obtener_detalle_configuracion_fiscal,
    obtener_movimientos_stock_trazabilidad,
    registrar_lote_compras_importacion,
)
from apps.usuarios.permissions import (
    EsDuenio,
    TieneAlgunPermiso,
    TienePermiso,
    usuario_tiene_permiso,
)


class ProveedorViewSet(viewsets.ModelViewSet):
    queryset = Proveedor.objects.all()
    serializer_class = ProveedorSerializer
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["estado_activo"]
    search_fields = ["nombre"]
    ordering_fields = ["nombre", "creado_en"]
    ordering = ["nombre"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [TienePermiso("insumos.ver")()]
        elif self.action == "create":
            return [TienePermiso("insumos.crear")()]
        elif self.action in ("update", "partial_update"):
            return [TienePermiso("insumos.editar")()]
        elif self.action == "destroy":
            return [TienePermiso("insumos.eliminar")()]
        return [IsAuthenticated()]


class InsumoViewSet(viewsets.ModelViewSet):
    queryset = Insumo.objects.all()
    serializer_class = InsumoSerializer
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["unidad_base", "estado_activo"]
    search_fields = ["nombre"]
    ordering_fields = ["nombre", "costo_unitario", "stock_actual", "stock_minimo", "creado_en"]
    ordering = ["nombre"]

    def get_permissions(self):
        if self.action in (
            "list",
            "retrieve",
            "movimientos",
            "movimientos_stock",
            "stock_bajo",
        ):
            return [TienePermiso("insumos.ver")()]
        elif self.action == "create":
            return [TienePermiso("insumos.crear")()]
        elif self.action in ("update", "partial_update", "ajustar_stock"):
            return [TienePermiso("insumos.editar")()]
        elif self.action == "destroy":
            return [TienePermiso("insumos.eliminar")()]
        return [IsAuthenticated()]

    @action(detail=True, methods=["post"], url_path="ajustar-stock")
    def ajustar_stock(self, request, pk=None):
        """Registra un ajuste manual de stock (INGRESO o EGRESO) sobre el insumo (HU12)."""
        insumo = self.get_object()
        serializer = AjusteStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        datos = serializer.validated_data

        try:
            resultado = ajustar_stock_insumo(
                insumo_id=insumo.id,
                tipo=datos["tipo"],
                cantidad=datos["cantidad"],
                unidad=datos.get("unidad") or None,
                motivo=datos.get("motivo") or "",
                usuario=request.user,
            )
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

        insumo_actualizado = resultado["insumo"]
        return Response(
            {
                "mensaje": "Stock actualizado correctamente.",
                "insumo": InsumoSerializer(insumo_actualizado).data,
                "movimiento": MovimientoStockSerializer(resultado["movimiento"]).data,
                "alerta_stock_bajo": resultado["alerta_stock_bajo"],
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="stock-bajo")
    def stock_bajo(self, request):
        """Lista los insumos activos cuyo stock actual está por debajo de su stock mínimo."""
        insumos = list(listar_insumos_stock_bajo())
        datos = InsumoSerializer(insumos, many=True).data
        return Response({"datos": datos, "total": len(datos)}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="movimientos-stock")
    def movimientos_stock(self, request):
        """Lista los movimientos reales persistidos en MovimientoStock (HU12)."""
        dt_desde, dt_hasta = extraer_rango_fechas(request.query_params)

        insumo_raw = request.query_params.get("insumo")
        insumo_id = None
        if insumo_raw not in (None, ""):
            try:
                insumo_id = int(insumo_raw)
            except (TypeError, ValueError) as exc:
                raise serializers.ValidationError("El insumo seleccionado no es válido.") from exc

        tipo_param = request.query_params.get("tipo")
        if tipo_param and str(tipo_param).strip().upper() not in ("INGRESO", "EGRESO"):
            raise serializers.ValidationError("El tipo de movimiento debe ser ingreso o egreso.")

        subtipo_param = request.query_params.get("subtipo")
        limite_raw = request.query_params.get("limite", 100)
        try:
            limite = int(limite_raw)
        except (TypeError, ValueError) as exc:
            raise serializers.ValidationError("El límite debe ser un número entero.") from exc

        movimientos = list(
            listar_movimientos_stock_reales(
                fecha_desde=dt_desde,
                fecha_hasta=dt_hasta,
                insumo_id=insumo_id,
                tipo=tipo_param,
                subtipo=subtipo_param,
                limite=limite,
            )
        )
        datos = MovimientoStockSerializer(movimientos, many=True).data
        return Response({"datos": datos, "total": len(datos)}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="movimientos")
    def movimientos(self, request):
        """
        Trazabilidad de movimientos de stock (ingresos por compra y egresos teóricos
        por ventas con receta) filtrable por fecha_desde, fecha_hasta, insumo y tipo.
        """
        dt_desde, dt_hasta = extraer_rango_fechas(request.query_params)

        insumo_raw = request.query_params.get("insumo")
        insumo_id = None
        if insumo_raw not in (None, ""):
            try:
                insumo_id = int(insumo_raw)
            except (TypeError, ValueError) as exc:
                raise serializers.ValidationError("El insumo seleccionado no es válido.") from exc

        tipo_param = request.query_params.get("tipo")
        if tipo_param and str(tipo_param).strip().upper() not in ("INGRESO", "EGRESO"):
            raise serializers.ValidationError("El tipo de movimiento debe ser ingreso o egreso.")

        incluir_costos = usuario_tiene_permiso(
            request, "recetas.ver_costos"
        ) or usuario_tiene_permiso(request, "compras.ver")

        datos = obtener_movimientos_stock_trazabilidad(
            fecha_desde=dt_desde,
            fecha_hasta=dt_hasta,
            insumo_id=insumo_id,
            tipo=tipo_param,
            incluir_costos=incluir_costos,
        )
        return Response({"datos": datos, "total": len(datos)}, status=status.HTTP_200_OK)


class CompraViewSet(viewsets.ModelViewSet):
    queryset = Compra.objects.select_related("proveedor", "insumo").all()
    serializer_class = CompraSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["proveedor", "insumo"]
    ordering_fields = ["fecha", "precio_total", "id"]
    ordering = ["-fecha", "-id"]

    def filter_queryset(self, queryset):
        qs = super().filter_queryset(queryset)
        if self.action == "list":
            qs = filtrar_queryset_por_rango_fechas(
                qs, self.request.query_params, campo_fecha="fecha"
            )
        return qs

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [TienePermiso("compras.ver")()]
        elif self.action in (
            "create",
            "update",
            "partial_update",
            "destroy",
            "confirmar_importacion",
        ):
            return [TienePermiso("compras.registrar")()]
        return [IsAuthenticated()]

    @action(
        detail=False,
        methods=["post"],
        url_path="confirmar-importacion",
    )
    def confirmar_importacion(self, request):
        """
        Registra de forma atómica el lote de compras derivado de una importación
        aprobada por el humano (T3.3), prorrateando envío y recalculando recetas.
        """
        serializer = ConfirmarImportacionComprasSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        datos = serializer.validated_data

        try:
            resultado = registrar_lote_compras_importacion(
                items=datos["items"],
                proveedor_id=datos.get("proveedor_id"),
                proveedor_nombre=datos.get("proveedor_nombre"),
                envio_total=datos.get("envio"),
            )
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

        return Response(
            {
                "mensaje": "Importación de compras registrada y recetas recalculadas exitosamente",
                **resultado,
            },
            status=status.HTTP_201_CREATED,
        )


class ConfiguracionFiscalView(APIView):
    """
    Configuración fiscal del local exclusiva del Dueño (HU14):
    - GET: devuelve condición actual, si está declarada, criterio de IVA e historial reciente.
    - PUT/PATCH: declara o cambia la condición fiscal, recalcula insumos/recetas y registra historial.
    """

    permission_classes = [EsDuenio]

    def get(self, request):
        return Response(obtener_detalle_configuracion_fiscal(), status=status.HTTP_200_OK)

    def _actualizar(self, request):
        serializer = ConfiguracionFiscalActualizarSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            resultado = actualizar_condicion_fiscal(
                condicion_nueva=serializer.validated_data["condicion_fiscal"],
                usuario=request.user,
            )
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

        if resultado["cambio_realizado"]:
            mensaje = (
                f"Condición fiscal actualizada a {resultado['condicion_fiscal_etiqueta']}. "
                f"Se recalcularon {resultado['insumos_recalculados']} insumos y "
                f"{resultado['productos_recalculados']} recetas."
            )
        else:
            mensaje = (
                f"La condición fiscal ya estaba configurada como "
                f"{resultado['condicion_fiscal_etiqueta']}."
            )

        return Response(
            {
                "mensaje": mensaje,
                **resultado,
            },
            status=status.HTTP_200_OK,
        )

    def put(self, request):
        return self._actualizar(request)

    def patch(self, request):
        return self._actualizar(request)


class ConfiguracionFiscalEstadoView(APIView):
    """
    Consulta de solo lectura del estado fiscal vigente (aviso si no está declarada)
    para operadores con permisos sobre insumos, compras o costos de recetas (CA14.2).
    """

    permission_classes = [TieneAlgunPermiso("insumos.ver", "compras.ver", "recetas.ver_costos")]

    def get(self, request):
        return Response(obtener_criterio_iva_vigente(), status=status.HTTP_200_OK)


class ConfiguracionFiscalHistorialView(APIView):
    """Historial de cambios de condición fiscal exclusivo del Dueño (CA14.3)."""

    permission_classes = [EsDuenio]

    def get(self, request):
        datos = listar_historial_condicion_fiscal(limite=50)
        return Response({"datos": datos, "total": len(datos)}, status=status.HTTP_200_OK)
