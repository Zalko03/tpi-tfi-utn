"""Utilidades compartidas de filtrado por rango de fechas para ViewSets y reportes."""

from datetime import datetime, time

from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import serializers


def parsear_parametro_fecha(valor: str | None, es_fin: bool = False) -> datetime | None:
    """
    Convierte una cadena YYYY-MM-DD o ISO-8601 en datetime con zona horaria activa.
    Si recibe solo fecha (YYYY-MM-DD), normaliza al inicio (00:00:00) o fin (23:59:59.999999).
    """
    if valor is None or str(valor).strip() == "":
        return None

    texto = str(valor).strip()
    tz_actual = timezone.get_current_timezone()

    fecha = parse_date(texto)
    if fecha is not None and len(texto) == 10:
        hora = time(23, 59, 59, 999999) if es_fin else time(0, 0, 0)
        return timezone.make_aware(datetime.combine(fecha, hora), tz_actual)

    dt = parse_datetime(texto)
    if dt is not None:
        if timezone.is_naive(dt):
            return timezone.make_aware(dt, tz_actual)
        return dt

    if fecha is not None:
        hora = time(23, 59, 59, 999999) if es_fin else time(0, 0, 0)
        return timezone.make_aware(datetime.combine(fecha, hora), tz_actual)

    raise serializers.ValidationError(
        f"Formato de fecha inválido: '{valor}'. Use YYYY-MM-DD o ISO-8601."
    )


def extraer_rango_fechas(
    query_params,
    *,
    permitir_fecha_unica: bool = False,
) -> tuple[datetime | None, datetime | None]:
    """
    Extrae y valida el rango [fecha_desde, fecha_hasta] desde query_params o payload dict,
    aceptando también los alias heredados fecha_inicio / fecha_fin.
    """
    if permitir_fecha_unica:
        fecha_unica = query_params.get("fecha")
        if fecha_unica:
            dt_desde = parsear_parametro_fecha(fecha_unica, es_fin=False)
            dt_hasta = parsear_parametro_fecha(fecha_unica, es_fin=True)
            return dt_desde, dt_hasta

    raw_desde = query_params.get("fecha_desde")
    if raw_desde is None or str(raw_desde).strip() == "":
        raw_desde = query_params.get("fecha_inicio")

    raw_hasta = query_params.get("fecha_hasta")
    if raw_hasta is None or str(raw_hasta).strip() == "":
        raw_hasta = query_params.get("fecha_fin")

    dt_desde = parsear_parametro_fecha(raw_desde, es_fin=False)
    dt_hasta = parsear_parametro_fecha(raw_hasta, es_fin=True)

    if dt_desde and dt_hasta and dt_desde > dt_hasta:
        raise serializers.ValidationError("fecha_desde no puede ser posterior a fecha_hasta.")

    return dt_desde, dt_hasta


def filtrar_queryset_por_rango_fechas(
    queryset,
    query_params,
    campo_fecha: str = "fecha",
):
    """Aplica filtro inclusivo [fecha_desde, fecha_hasta] sobre campo_fecha si se especifican."""
    dt_desde, dt_hasta = extraer_rango_fechas(query_params)
    if dt_desde is not None:
        queryset = queryset.filter(**{f"{campo_fecha}__gte": dt_desde})
    if dt_hasta is not None:
        queryset = queryset.filter(**{f"{campo_fecha}__lte": dt_hasta})
    return queryset
