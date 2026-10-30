"""Modelos para registro de ventas e ítems con snapshots de costo congelados."""
from decimal import Decimal
from django.db import models
from django.utils import timezone


class Venta(models.Model):
    MEDIOS_PAGO = (
        ("EFECTIVO", "Efectivo"),
        ("TRANSFERENCIA", "Transferencia"),
        ("TARJETA", "Tarjeta de débito/crédito"),
    )
    ORIGENES = (
        ("propio", "Cobro propio en caja"),
        ("importado", "Importado de POS externo"),
    )

    turno_caja = models.ForeignKey(
        "caja.TurnoCaja",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="ventas",
        verbose_name="Turno de caja",
    )
    fecha = models.DateTimeField(
        default=timezone.now,
        verbose_name="Fecha y hora de venta",
    )
    medio_pago = models.CharField(
        max_length=15,
        choices=MEDIOS_PAGO,
        default="EFECTIVO",
        verbose_name="Medio de pago",
    )
    origen = models.CharField(
        max_length=10,
        choices=ORIGENES,
        default="propio",
        verbose_name="Origen de la venta",
    )
    total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        verbose_name="Total cobrado ($)",
    )
    costo_total_snapshot = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=Decimal("0.0000"),
        verbose_name="Costo total congelado al vender ($)",
    )
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Venta"
        verbose_name_plural = "Ventas"
        ordering = ["-fecha", "-id"]
        indexes = [
            models.Index(fields=["fecha"], name="idx_venta_fecha"),
            models.Index(
                fields=["-fecha", "-id"], name="idx_venta_fecha_id_desc"
            ),
        ]

    def __str__(self):
        return f"Ticket #{self.id} (${self.total}) - {self.medio_pago}"


class VentaItem(models.Model):
    venta = models.ForeignKey(
        Venta,
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="Venta",
    )
    producto = models.ForeignKey(
        "recetas.Producto",
        on_delete=models.PROTECT,
        related_name="items_vendidos",
        verbose_name="Producto",
    )
    cantidad = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=Decimal("1.00"),
        verbose_name="Cantidad vendida",
    )
    precio_unitario = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name="Precio unitario al cobrar ($)",
    )
    costo_unitario_snapshot = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        verbose_name="Costo unitario congelado ($)",
    )

    class Meta:
        verbose_name = "Ítem de Venta"
        verbose_name_plural = "Ítems de Venta"
        indexes = [
            models.Index(
                fields=["venta", "producto"], name="idx_ventaitem_venta_prod"
            ),
            models.Index(
                fields=["producto", "venta"], name="idx_ventaitem_prod_venta"
            ),
        ]

    def __str__(self):
        return f"{self.cantidad}x {self.producto.nombre} (${self.precio_unitario})"
