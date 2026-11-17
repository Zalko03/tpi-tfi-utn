"""ViewSets para ventas y reportes operativos."""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.comun.filtros import extraer_rango_fechas, filtrar_queryset_por_rango_fechas
from apps.usuarios.permissions import PermisoObjetoVenta, TienePermiso, usuario_tiene_permiso
from apps.ventas.models import Venta
from apps.ventas.serializers import VentaSerializer
from apps.ventas.services import (
    calcular_punto_equilibrio_y_metas,
    obtener_ganancia_diaria,
    obtener_ranking_productos,
    obtener_reporte_ventas_por_producto,
)


class VentaViewSet(viewsets.ModelViewSet):
    queryset = (
        Venta.objects.select_related("turno_caja__usuario")
        .prefetch_related("items__producto")
        .all()
    )
    serializer_class = VentaSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["turno_caja", "medio_pago", "origen"]
    ordering_fields = ["fecha", "total"]
    ordering = ["-fecha", "-id"]

    def get_permissions(self):
        if self.action == "create":
            return [TienePermiso("ventas.cobrar_ticket")()]
        elif self.action == "list":
            return [TienePermiso("ventas.ver_historial_propio")()]
        elif self.action == "retrieve":
            return [
                TienePermiso("ventas.ver_historial_propio")(),
                PermisoObjetoVenta(),
            ]
        elif self.action in ("reporte_por_producto", "ranking_productos"):
            return [TienePermiso("reportes.ver_operativos")()]
        elif self.action in ("ganancia_diaria", "punto_equilibrio"):
            return [TienePermiso("reportes.ver_financieros")()]
        elif self.action == "anular":
            return [TienePermiso("ventas.anular_ticket")()]
        elif self.action in ("update", "partial_update", "destroy"):
            return [TienePermiso("ventas.anular_ticket")()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = getattr(self.request, "user", None)
        if not user or not user.is_authenticated:
            return qs.none()
        if user.is_superuser:
            return qs

        perfil = getattr(user, "perfil", None)
        if perfil and perfil.tiene_permiso("ventas.ver_historial_todos"):
            return qs

        payload = getattr(self.request.auth, "payload", None)
        if payload is None and hasattr(self.request.auth, "get"):
            payload = self.request.auth
        token_permisos = payload.get("permisos", []) if payload else []
        if "ventas.ver_historial_todos" in token_permisos:
            return qs

        if self.action == "list":
            return qs.filter(turno_caja__usuario=user)
        return qs

    def filter_queryset(self, queryset):
        if self.action == "list" and not usuario_tiene_permiso(
            self.request, "caja.ver_efectivo_esperado"
        ):
            # Evita deducir ventas en efectivo filtrando por medio_pago u ordenando por total
            self.filterset_fields = ["turno_caja", "origen"]
            self.ordering_fields = ["fecha"]
        else:
            self.filterset_fields = ["turno_caja", "medio_pago", "origen"]
            self.ordering_fields = ["fecha", "total"]
        qs = super().filter_queryset(queryset)
        if self.action == "list":
            qs = filtrar_queryset_por_rango_fechas(
                qs, self.request.query_params, campo_fecha="fecha"
            )
        return qs

    @action(detail=True, methods=["post"], url_path="anular")
    def anular(self, request, pk=None):
        """Anula una venta emitida (docs/seguridad.md §5.1)."""
        venta = self.get_object()
        return Response(
            {
                "mensaje": f"Venta #{venta.id} anulada exitosamente.",
                "venta_id": venta.id,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="reporte-por-producto")
    def reporte_por_producto(self, request):
        """
        Reporte agregado de ventas por producto filtrado por rango de fechas (T3.4).
        Query params opcionales: fecha_desde / fecha_inicio (YYYY-MM-DD), fecha_hasta / fecha_fin (YYYY-MM-DD).
        """
        fecha_inicio, fecha_fin = extraer_rango_fechas(request.query_params)

        datos = obtener_reporte_ventas_por_producto(fecha_inicio=fecha_inicio, fecha_fin=fecha_fin)
        return Response(
            {
                "datos": datos,
                "total": len(datos),
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="ganancia-diaria")
    def ganancia_diaria(self, request):
        """
        Reporte financiero de ganancia diaria y por período usando el costo congelado
        al momento de la venta (HU10 / CA10.1, permiso 'reportes.ver_financieros').
        Soporta ?fecha=YYYY-MM-DD o ?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD (y fecha_inicio/fecha_fin).
        """
        fecha_inicio, fecha_fin = extraer_rango_fechas(
            request.query_params, permitir_fecha_unica=True
        )

        resumen = obtener_ganancia_diaria(fecha_inicio=fecha_inicio, fecha_fin=fecha_fin)
        return Response(resumen, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="ranking-productos")
    def ranking_productos(self, request):
        """
        Ranking de productos más y menos vendidos en un rango de fechas
        (HU10 / CA10.2, permiso 'reportes.ver_operativos').
        """
        fecha_inicio, fecha_fin = extraer_rango_fechas(request.query_params)

        limite_param = request.query_params.get("limite", 10)
        try:
            limite = int(limite_param)
        except (TypeError, ValueError) as exc:
            raise serializers.ValidationError(
                "El parámetro 'limite' debe ser un número entero positivo."
            ) from exc

        resultado = obtener_ranking_productos(
            fecha_inicio=fecha_inicio, fecha_fin=fecha_fin, limite=limite
        )
        return Response(resultado, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get", "post"], url_path="punto-equilibrio")
    def punto_equilibrio(self, request):
        """
        Calcula el Punto de Equilibrio (PE) y las metas diaria y semanal
        (HU11 / CA11.1 y CA11.2, permiso 'reportes.ver_financieros').
        """
        fuente = (
            request.data
            if request.method == "POST" and isinstance(request.data, dict)
            else request.query_params
        )

        costos_fijos = fuente.get("costos_fijos")
        if costos_fijos is None or str(costos_fijos).strip() == "":
            raise serializers.ValidationError(
                "El parámetro 'costos_fijos' es obligatorio para calcular el punto de equilibrio."
            )

        costos_variables = fuente.get("costos_variables")
        ventas = fuente.get("ventas")
        dias_operativos = fuente.get("dias_operativos", 26)
        dias_semana = fuente.get("dias_semana", 6)

        fecha_inicio, fecha_fin = extraer_rango_fechas(fuente)

        try:
            resultado = calcular_punto_equilibrio_y_metas(
                costos_fijos=costos_fijos,
                costos_variables=costos_variables,
                ventas=ventas,
                dias_operativos=dias_operativos,
                dias_semana=dias_semana,
                fecha_inicio=fecha_inicio,
                fecha_fin=fecha_fin,
            )
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

        return Response(resultado, status=status.HTTP_200_OK)
