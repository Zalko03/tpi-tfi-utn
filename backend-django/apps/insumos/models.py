"""Modelos para proveedores, insumos y compras."""
from decimal import Decimal
from django.db import models
from django.utils import timezone


class Proveedor(models.Model):
    nombre = models.CharField(max_length=150, unique=True, verbose_name="Nombre del proveedor")
    estado_activo = models.BooleanField(default=True, verbose_name="Estado activo")
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Proveedor"
        verbose_name_plural = "Proveedores"
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class Insumo(models.Model):
    UNIDADES_BASE = (
        ("g", "Gramos (g)"),
        ("ml", "Mililitros (ml)"),
        ("un", "Unidades (un)"),
    )

    nombre = models.CharField(max_length=150, unique=True, verbose_name="Nombre del insumo")
    unidad_base = models.CharField(max_length=5, choices=UNIDADES_BASE, verbose_name="Unidad base")
    costo_unitario = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=Decimal("0.0000"),
        verbose_name="Costo por unidad base vigente",
    )
    estado_activo = models.BooleanField(default=True, verbose_name="Estado activo")
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Insumo"
        verbose_name_plural = "Insumos"
        ordering = ["nombre"]

    def __str__(self):
        return f"{self.nombre} ({self.unidad_base})"


class Compra(models.Model):
    proveedor = models.ForeignKey(
        Proveedor,
        on_delete=models.PROTECT,
        related_name="compras",
        verbose_name="Proveedor",
    )
    insumo = models.ForeignKey(
        Insumo,
        on_delete=models.PROTECT,
        related_name="compras",
        verbose_name="Insumo",
    )
    precio_total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name="Precio total pagado",
    )
    cantidad = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        verbose_name="Cantidad adquirida",
    )
    unidad = models.CharField(
        max_length=10,
        verbose_name="Unidad de compra (ej. kg, g, l, ml, un)",
    )
    envio = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        verbose_name="Envío prorrateado",
    )
    iva_incluido = models.BooleanField(
        default=True,
        verbose_name="¿IVA incluido en el precio?",
    )
    alicuota = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("21.00"),
        verbose_name="Alícuota de IVA (%)",
    )
    costo_unitario_calculado = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=Decimal("0.0000"),
        verbose_name="Costo unitario en unidad base",
    )
    fecha = models.DateTimeField(
        default=timezone.now,
        verbose_name="Fecha de compra",
    )
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Compra"
        verbose_name_plural = "Compras"
        ordering = ["-fecha", "-id"]

    def __str__(self):
        return f"Compra {self.id}: {self.insumo.nombre} ({self.cantidad} {self.unidad})"
