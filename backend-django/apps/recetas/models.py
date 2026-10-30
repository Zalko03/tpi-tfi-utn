"""Modelos para productos y formulación de recetas."""
from decimal import Decimal
from django.db import models


class Producto(models.Model):
    nombre = models.CharField(
        max_length=150,
        unique=True,
        verbose_name="Nombre del producto",
    )
    codigo_barras = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        unique=True,
        verbose_name="Código de barras (EAN/UPC)",
    )
    precio_venta = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name="Precio de venta al público",
    )
    minutos_mano_obra = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=Decimal("0.00"),
        verbose_name="Minutos de preparación",
    )
    costo_hora_mano_obra = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("2500.00"),
        verbose_name="Costo de mano de obra por hora ($)",
    )
    descartables = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        verbose_name="Costo de descartables (vasos, servilletas, etc.)",
    )
    costo_total_calculado = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=Decimal("0.0000"),
        verbose_name="Costo total calculado",
    )
    ganancia_bruta = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=Decimal("0.0000"),
        verbose_name="Ganancia bruta ($)",
    )
    margen_bruto = models.DecimalField(
        max_digits=6,
        decimal_places=4,
        default=Decimal("0.0000"),
        verbose_name="Margen bruto (ratio, ej. 0.5600 = 56%)",
    )
    estado_activo = models.BooleanField(
        default=True,
        verbose_name="Estado activo",
    )
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Producto"
        verbose_name_plural = "Productos"
        ordering = ["nombre"]
        indexes = [
            models.Index(
                fields=["estado_activo", "nombre"],
                name="idx_producto_activo_nombre",
            ),
        ]

    def __str__(self):
        return f"{self.nombre} (${self.precio_venta})"


class RecetaItem(models.Model):
    producto = models.ForeignKey(
        Producto,
        on_delete=models.CASCADE,
        related_name="receta_items",
        verbose_name="Producto",
    )
    insumo = models.ForeignKey(
        "insumos.Insumo",
        on_delete=models.PROTECT,
        related_name="usos_en_recetas",
        verbose_name="Insumo",
    )
    cantidad = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        verbose_name="Cantidad requerida",
    )
    unidad = models.CharField(
        max_length=10,
        verbose_name="Unidad de receta (ej. g, ml, un)",
    )

    class Meta:
        verbose_name = "Ítem de Receta"
        verbose_name_plural = "Ítems de Receta"
        unique_together = ("producto", "insumo")
        indexes = [
            models.Index(
                fields=["insumo", "producto"],
                name="idx_recetaitem_insumo_prod",
            ),
        ]

    def __str__(self):
        return f"{self.producto.nombre} -> {self.insumo.nombre} ({self.cantidad} {self.unidad})"
