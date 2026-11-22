"""ViewSets para productos y recetas."""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.comun.throttling import CartaPublicaRateThrottle, RecalculoRateThrottle
from apps.insumos.services import obtener_criterio_iva_vigente
from apps.recetas.models import PrecioCompetencia, RecetaItem
from apps.recetas.serializers import (
    CartaPublicaProductoSerializer,
    PrecioCompetenciaSerializer,
    ProductoSerializer,
    RecetaItemSerializer,
)
from apps.recetas.services import (
    actualizar_costo_y_margen_producto,
    listar_productos_carta_publica,
    listar_productos_con_costos_optimizado,
    obtener_sugerencia_precio_producto,
)
from apps.usuarios.permissions import TieneAlgunPermiso, TienePermiso


class CartaPublicaView(APIView):
    """
    Endpoint público de solo lectura con la carta digital para clientes por QR (HU15).
    No requiere autenticación, aplica rate limiting anónimo y expone solo id, nombre y precio.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [CartaPublicaRateThrottle]

    def get(self, request):
        productos = listar_productos_carta_publica()
        serializer = CartaPublicaProductoSerializer(productos, many=True)
        return Response(
            {
                "datos": serializer.data,
                "total": len(serializer.data),
            },
            status=status.HTTP_200_OK,
        )


class ProductoViewSet(viewsets.ModelViewSet):
    queryset = listar_productos_con_costos_optimizado(incluir_competencia=True)
    serializer_class = ProductoSerializer
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["estado_activo"]
    search_fields = ["nombre", "codigo_barras"]
    ordering_fields = [
        "nombre",
        "precio_venta",
        "costo_total_calculado",
        "margen_bruto",
    ]
    ordering = ["nombre"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [TieneAlgunPermiso("recetas.ver", "ventas.cobrar_ticket")()]
        elif self.action == "create":
            return [TienePermiso("recetas.crear")()]
        elif self.action in ("update", "partial_update"):
            return [TienePermiso("recetas.editar")()]
        elif self.action == "destroy":
            return [TienePermiso("recetas.eliminar")()]
        elif self.action in ("recalcular", "recalcular_todos", "costo", "precio_sugerido"):
            return [TienePermiso("recetas.ver_costos")()]
        return [IsAuthenticated()]

    @action(
        detail=False,
        methods=["post"],
        url_path="recalcular",
        throttle_classes=[RecalculoRateThrottle],
    )
    def recalcular_todos(self, request):
        """Fuerza el recálculo de costos y márgenes de toda la carta activa."""
        productos = list(self.get_queryset().filter(estado_activo=True))
        resultados = []
        for producto in productos:
            actualizar_costo_y_margen_producto(producto)
            resultados.append(
                {
                    "producto_id": producto.id,
                    "nombre": producto.nombre,
                    "costo_total": str(producto.costo_total_calculado),
                    "ganancia_bruta": str(producto.ganancia_bruta),
                    "margen_bruto": str(producto.margen_bruto),
                }
            )
        criterio = obtener_criterio_iva_vigente()
        return Response(
            {
                "mensaje": f"Se recalcularon {len(resultados)} recetas exitosamente.",
                "total_recalculados": len(resultados),
                "costear_con_iva": criterio["costear_con_iva"],
                "aviso_fiscal": criterio["aviso"],
                "productos": resultados,
            },
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="recalcular",
        throttle_classes=[RecalculoRateThrottle],
    )
    def recalcular(self, request, pk=None):
        """Fuerza el recálculo de costos y márgenes del producto (con rate limiting de T2.5)."""
        producto = self.get_object()
        actualizar_costo_y_margen_producto(producto)
        criterio = obtener_criterio_iva_vigente()
        return Response(
            {
                "mensaje": f"Costo recalculado exitosamente para {producto.nombre}",
                "costo_total": str(producto.costo_total_calculado),
                "ganancia_bruta": str(producto.ganancia_bruta),
                "margen_bruto": str(producto.margen_bruto),
                "costear_con_iva": criterio["costear_con_iva"],
                "aviso_fiscal": criterio["aviso"],
            },
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["get"],
        url_path="costo",
    )
    def costo(self, request, pk=None):
        """Consulta protegida del desglose de costos y márgenes (docs/seguridad.md §5.1)."""
        producto = self.get_object()
        return Response(
            {
                "producto_id": producto.id,
                "nombre": producto.nombre,
                "costo_total_calculado": str(producto.costo_total_calculado),
                "ganancia_bruta": str(producto.ganancia_bruta),
                "margen_bruto": str(producto.margen_bruto),
            },
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["get"],
        url_path="precio-sugerido",
    )
    def precio_sugerido(self, request, pk=None):
        """
        Calcula el precio sugerido del producto según margen objetivo, redondeo configurable
        y precios de competencia cargados, sin modificar precio_venta automáticamente (HU9).
        """
        producto = self.get_object()
        margen_param = request.query_params.get("margen_objetivo")
        multiplo_param = request.query_params.get("redondeo_multiplo")

        try:
            sugerencia = obtener_sugerencia_precio_producto(
                producto,
                margen_objetivo=margen_param if margen_param not in (None, "") else None,
                redondeo_multiplo=multiplo_param if multiplo_param not in (None, "") else None,
            )
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

        return Response(sugerencia, status=status.HTTP_200_OK)


class RecetaItemViewSet(viewsets.ModelViewSet):
    queryset = RecetaItem.objects.select_related("producto", "insumo").all()
    serializer_class = RecetaItemSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["producto", "insumo"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [TienePermiso("recetas.ver")()]
        elif self.action == "create":
            return [TienePermiso("recetas.crear")()]
        elif self.action in ("update", "partial_update"):
            return [TienePermiso("recetas.editar")()]
        elif self.action == "destroy":
            return [TienePermiso("recetas.eliminar")()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        item = serializer.save()
        actualizar_costo_y_margen_producto(item.producto)

    def perform_update(self, serializer):
        item = serializer.save()
        actualizar_costo_y_margen_producto(item.producto)

    def perform_destroy(self, instance):
        producto = instance.producto
        instance.delete()
        actualizar_costo_y_margen_producto(producto)


class PrecioCompetenciaViewSet(viewsets.ModelViewSet):
    """CRUD de precios de referencia de la competencia cargados a mano por producto (HU9)."""

    queryset = PrecioCompetencia.objects.select_related("producto").all()
    serializer_class = PrecioCompetenciaSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["producto"]
    ordering_fields = ["precio", "nombre_competidor", "creado_en"]
    ordering = ["precio", "id"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [TienePermiso("recetas.ver_costos")()]
        elif self.action == "create":
            return [TienePermiso("recetas.crear")()]
        elif self.action in ("update", "partial_update"):
            return [TienePermiso("recetas.editar")()]
        elif self.action == "destroy":
            return [TienePermiso("recetas.eliminar")()]
        return [IsAuthenticated()]
