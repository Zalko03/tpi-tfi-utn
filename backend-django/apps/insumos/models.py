"""Modelos para proveedores, insumos, compras y configuración fiscal del local."""

from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

CONDICION_NO_DECLARADA = "NO_DECLARADA"
CONDICION_RESPONSABLE_INSCRIPTO = "RESPONSABLE_INSCRIPTO"
CONDICION_MONOTRIBUTISTA = "MONOTRIBUTISTA"
CONDICION_EXENTO = "EXENTO"

CONDICIONES_FISCALES_CHOICES = (
    (CONDICION_NO_DECLARADA, "Sin declarar"),
    (CONDICION_RESPONSABLE_INSCRIPTO, "Responsable Inscripto"),
    (CONDICION_MONOTRIBUTISTA, "Monotributista"),
    (CONDICION_EXENTO, "IVA Exento"),
)

CONDICIONES_FISCALES_DECLARABLES = {
    CONDICION_RESPONSABLE_INSCRIPTO,
    CONDICION_MONOTRIBUTISTA,
    CONDICION_EXENTO,
}


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


class ConfiguracionLocal(models.Model):
    """Configuración fiscal única del local para definir el tratamiento del IVA en el costeo (HU14)."""

    condicion_fiscal = models.CharField(
        max_length=30,
        choices=CONDICIONES_FISCALES_CHOICES,
        default=CONDICION_NO_DECLARADA,
        verbose_name="Condición fiscal del local",
    )
    actualizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="configuraciones_fiscales_actualizadas",
        verbose_name="Actualizado por",
    )
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Configuración del local"
        verbose_name_plural = "Configuraciones del local"

    @property
    def declarada(self) -> bool:
        return self.condicion_fiscal != CONDICION_NO_DECLARADA

    @property
    def costear_con_iva(self) -> bool:
        # Responsable Inscripto toma el IVA de compras como crédito fiscal (costea sin IVA).
        # Monotributista, IVA Exento y Sin declarar (criterio por defecto §0 2b) costean con IVA.
        return self.condicion_fiscal != CONDICION_RESPONSABLE_INSCRIPTO

    def __str__(self):
        return f"Configuración Local ({self.get_condicion_fiscal_display()})"


class HistorialCondicionFiscal(models.Model):
    """Registro histórico de cambios de condición fiscal y recálculo de costos (CA14.3)."""

    condicion_anterior = models.CharField(
        max_length=30,
        choices=CONDICIONES_FISCALES_CHOICES,
        verbose_name="Condición fiscal anterior",
    )
    condicion_nueva = models.CharField(
        max_length=30,
        choices=CONDICIONES_FISCALES_CHOICES,
        verbose_name="Condición fiscal nueva",
    )
    costear_con_iva_anterior = models.BooleanField(
        verbose_name="¿Costeaba con IVA antes?",
    )
    costear_con_iva_nuevo = models.BooleanField(
        verbose_name="¿Costea con IVA ahora?",
    )
    insumos_recalculados = models.PositiveIntegerField(
        default=0,
        verbose_name="Cantidad de insumos recalculados",
    )
    productos_recalculados = models.PositiveIntegerField(
        default=0,
        verbose_name="Cantidad de productos recalculados",
    )
    detalles = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="Resumen de costos recalculados",
    )
    modificado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cambios_condicion_fiscal",
        verbose_name="Modificado por",
    )
    fecha = models.DateTimeField(
        default=timezone.now,
        verbose_name="Fecha del cambio",
    )

    class Meta:
        verbose_name = "Historial de condición fiscal"
        verbose_name_plural = "Historial de condiciones fiscales"
        ordering = ["-fecha", "-id"]

    def __str__(self):
        return f"{self.condicion_anterior} -> {self.condicion_nueva} ({self.fecha:%Y-%m-%d %H:%M})"
