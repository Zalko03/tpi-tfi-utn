"""Serializadores para productos y recetas."""

from decimal import Decimal

from rest_framework import serializers

from apps.recetas.models import PrecioCompetencia, Producto, RecetaItem
from apps.recetas.services import (
    MULTIPLOS_REDONDEO_PERMITIDOS,
    actualizar_costo_y_margen_producto,
    obtener_sugerencia_precio_producto,
)


class CartaPublicaProductoSerializer(serializers.ModelSerializer):
    """
    Serializador público de solo lectura para la carta digital por QR (HU15).
    Declara exclusivamente id, nombre y precio_venta para no exponer jamás costos ni recetas.
    """

    class Meta:
        model = Producto
        fields = ["id", "nombre", "precio_venta"]
        read_only_fields = ["id", "nombre", "precio_venta"]


class RecetaItemSerializer(serializers.ModelSerializer):
    insumo_nombre = serializers.ReadOnlyField(source="insumo.nombre")
    insumo_unidad_base = serializers.ReadOnlyField(source="insumo.unidad_base")
    insumo_costo_unitario = serializers.ReadOnlyField(source="insumo.costo_unitario")

    class Meta:
        model = RecetaItem
        fields = [
            "id",
            "producto",
            "insumo",
            "insumo_nombre",
            "insumo_unidad_base",
            "insumo_costo_unitario",
            "cantidad",
            "unidad",
        ]

    def validate_cantidad(self, value):
        if Decimal(str(value)) <= Decimal("0"):
            raise serializers.ValidationError(
                "La cantidad del insumo en la receta debe ser mayor a cero."
            )
        return value

    def validate(self, attrs):
        if self.instance is not None and "producto" in attrs:
            producto_nuevo = attrs["producto"]
            if producto_nuevo is None or producto_nuevo.pk != self.instance.producto_id:
                raise serializers.ValidationError(
                    {"producto": "No se puede cambiar el producto de un ítem de receta existente."}
                )
        return attrs


class PrecioCompetenciaSerializer(serializers.ModelSerializer):
    producto_nombre = serializers.ReadOnlyField(source="producto.nombre")

    class Meta:
        model = PrecioCompetencia
        fields = [
            "id",
            "producto",
            "producto_nombre",
            "nombre_competidor",
            "precio",
            "observacion",
            "creado_en",
            "actualizado_en",
        ]
        read_only_fields = ["id", "creado_en", "actualizado_en"]

    def validate_nombre_competidor(self, value):
        limpio = str(value or "").strip()
        return limpio or "Referencia de mercado"

    def validate_precio(self, value):
        if Decimal(str(value)) <= Decimal("0"):
            raise serializers.ValidationError("El precio de competencia debe ser mayor a cero.")
        return value

    def validate(self, attrs):
        if self.instance is not None and "producto" in attrs:
            producto_nuevo = attrs["producto"]
            if producto_nuevo is None or producto_nuevo.pk != self.instance.producto_id:
                raise serializers.ValidationError(
                    {"producto": "No se puede cambiar el producto de una referencia existente."}
                )
        return attrs


class ProductoSerializer(serializers.ModelSerializer):
    receta_items = RecetaItemSerializer(many=True, read_only=True)
    precios_competencia = PrecioCompetenciaSerializer(many=True, read_only=True)
    precio_sugerido = serializers.SerializerMethodField()
    sugerencia_precio = serializers.SerializerMethodField()

    class Meta:
        model = Producto
        fields = [
            "id",
            "nombre",
            "codigo_barras",
            "precio_venta",
            "minutos_mano_obra",
            "costo_hora_mano_obra",
            "descartables",
            "costo_total_calculado",
            "ganancia_bruta",
            "margen_bruto",
            "margen_objetivo",
            "redondeo_multiplo",
            "precio_sugerido",
            "sugerencia_precio",
            "precios_competencia",
            "receta_items",
            "estado_activo",
            "creado_en",
            "actualizado_en",
        ]
        read_only_fields = [
            "id",
            "costo_total_calculado",
            "ganancia_bruta",
            "margen_bruto",
            "precio_sugerido",
            "sugerencia_precio",
            "creado_en",
            "actualizado_en",
        ]

    def _obtener_sugerencia_cache(self, obj) -> dict:
        cache_mapa = getattr(self, "_sugerencia_cache_por_obj", None)
        if cache_mapa is None:
            cache_mapa = {}
            self._sugerencia_cache_por_obj = cache_mapa
        clave = id(obj)
        if clave not in cache_mapa:
            cache_mapa[clave] = obtener_sugerencia_precio_producto(obj)
        return cache_mapa[clave]

    def get_precio_sugerido(self, obj) -> str:
        return self._obtener_sugerencia_cache(obj)["precio_sugerido"]

    def get_sugerencia_precio(self, obj) -> dict:
        return self._obtener_sugerencia_cache(obj)

    def validate_precio_venta(self, value):
        if Decimal(str(value)) <= Decimal("0"):
            raise serializers.ValidationError("El precio de venta debe ser mayor a cero.")
        return value

    def validate_minutos_mano_obra(self, value):
        if Decimal(str(value or 0)) < Decimal("0"):
            raise serializers.ValidationError(
                "Los minutos de mano de obra no pueden ser negativos."
            )
        return value

    def validate_margen_objetivo(self, value):
        margen = Decimal(str(value))
        if margen < Decimal("0") or margen >= Decimal("1"):
            raise serializers.ValidationError(
                "El margen objetivo debe ser mayor o igual a 0 y menor a 1 (ej. 0.30 para 30%)."
            )
        return value

    def validate_redondeo_multiplo(self, value):
        if int(value) not in MULTIPLOS_REDONDEO_PERMITIDOS:
            raise serializers.ValidationError("El múltiplo de redondeo debe ser $50 o $100.")
        return int(value)

    def create(self, validated_data):
        producto = super().create(validated_data)
        actualizar_costo_y_margen_producto(producto)
        return producto

    def update(self, instance, validated_data):
        producto = super().update(instance, validated_data)
        actualizar_costo_y_margen_producto(producto)
        return producto

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            usuario = request.user
            tiene_costos = False
            if getattr(usuario, "is_superuser", False):
                tiene_costos = True
            elif hasattr(usuario, "perfil") and usuario.perfil:
                tiene_costos = usuario.perfil.tiene_permiso("recetas.ver_costos")
            else:
                payload = getattr(request.auth, "payload", None)
                if payload is None and hasattr(request.auth, "get"):
                    payload = request.auth
                token_permisos = payload.get("permisos", []) if payload else []
                tiene_costos = "recetas.ver_costos" in token_permisos

            if not tiene_costos:
                ret["costo_hora_mano_obra"] = None
                ret["descartables"] = None
                ret["costo_total_calculado"] = None
                ret["ganancia_bruta"] = None
                ret["margen_bruto"] = None
                ret["margen_objetivo"] = None
                ret["redondeo_multiplo"] = None
                ret["precio_sugerido"] = None
                ret["sugerencia_precio"] = None
                ret["precios_competencia"] = []
                if "receta_items" in ret and isinstance(ret["receta_items"], list):
                    for item in ret["receta_items"]:
                        item["insumo_costo_unitario"] = None
        return ret
