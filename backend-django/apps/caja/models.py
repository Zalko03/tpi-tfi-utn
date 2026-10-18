"""Modelos para turnos y movimientos de caja."""
from decimal import Decimal
from django.conf import settings
from django.db import models
from django.utils import timezone


class TurnoCaja(models.Model):
    ESTADOS = (
        ("ABIERTO", "Abierto"),
        ("CERRADO", "Cerrado"),
    )

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="turnos_caja",
        verbose_name="Usuario responsable",
    )
    apertura = models.DateTimeField(
        default=timezone.now,
        verbose_name="Fecha y hora de apertura",
    )
    cierre = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Fecha y hora de cierre",
    )
    efectivo_inicial = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        verbose_name="Efectivo inicial en caja ($)",
    )
    efectivo_contado = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Efectivo contado al cierre ($)",
    )
    efectivo_esperado = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        verbose_name="Efectivo esperado ($)",
    )
    diferencia = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        verbose_name="Diferencia de caja (contado - esperado)",
    )
    estado = models.CharField(
        max_length=10,
        choices=ESTADOS,
        default="ABIERTO",
        verbose_name="Estado del turno",
    )

    class Meta:
        verbose_name = "Turno de Caja"
        verbose_name_plural = "Turnos de Caja"
        ordering = ["-apertura"]

    def __str__(self):
        return f"Turno {self.id} ({self.estado}) - {self.apertura.strftime('%Y-%m-%d %H:%M')}"

    def calcular_efectivo_esperado(self) -> Decimal:
        """
        Efectivo esperado = apertura + ventas en efectivo + entradas - salidas (§3).
        Transferencias y tarjetas se computan por separado.
        """
        ventas_efectivo = sum(
            (v.total for v in self.ventas.filter(medio_pago="EFECTIVO")),
            Decimal("0.00"),
        )
        entradas = sum(
            (m.monto for m in self.movimientos.filter(tipo="ENTRADA")),
            Decimal("0.00"),
        )
        salidas = sum(
            (m.monto for m in self.movimientos.filter(tipo="SALIDA")),
            Decimal("0.00"),
        )
        return self.efectivo_inicial + ventas_efectivo + entradas - salidas


class MovimientoCaja(models.Model):
    TIPOS = (
        ("ENTRADA", "Entrada de efectivo"),
        ("SALIDA", "Salida de efectivo"),
    )

    turno_caja = models.ForeignKey(
        TurnoCaja,
        on_delete=models.CASCADE,
        related_name="movimientos",
        verbose_name="Turno de caja",
    )
    tipo = models.CharField(
        max_length=10,
        choices=TIPOS,
        verbose_name="Tipo de movimiento",
    )
    monto = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name="Monto ($)",
    )
    motivo = models.CharField(
        max_length=200,
        verbose_name="Motivo del movimiento",
    )
    fecha = models.DateTimeField(
        default=timezone.now,
        verbose_name="Fecha y hora",
    )

    class Meta:
        verbose_name = "Movimiento de Caja"
        verbose_name_plural = "Movimientos de Caja"
        ordering = ["-fecha"]

    def __str__(self):
        return f"{self.tipo} ${self.monto}: {self.motivo}"
