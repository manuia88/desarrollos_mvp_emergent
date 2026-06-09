"""C6 Correctitud · Hora de la Ciudad de México para lo que VE el usuario.

Regla: GUARDAMOS en UTC (correcto para la base), pero lo que se MUESTRA al usuario
(fechas en PDFs, "hoy", "esta semana") va en hora CDMX — si no, cerca de medianoche
una venta de hoy puede salir con la fecha de mañana.

Helper canónico reusable en los 4 portales. Fail-soft: si la zona no está
disponible, cae a UTC (nunca rompe).
"""
from __future__ import annotations

from datetime import datetime, timezone

_CDMX_TZ = None


def _tz():
    global _CDMX_TZ
    if _CDMX_TZ is not None:
        return _CDMX_TZ
    try:
        from zoneinfo import ZoneInfo
        _CDMX_TZ = ZoneInfo("America/Mexico_City")
    except Exception:
        _CDMX_TZ = timezone.utc  # fail-soft
    return _CDMX_TZ


def now_cdmx() -> datetime:
    """Ahora, en hora CDMX (aware)."""
    return datetime.now(_tz())


def to_cdmx(dt: datetime) -> datetime:
    """Convierte un datetime (UTC o naive-asumido-UTC) a hora CDMX."""
    if dt is None:
        return now_cdmx()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    try:
        return dt.astimezone(_tz())
    except Exception:
        return dt


def today_cdmx_str(fmt: str = "%Y-%m-%d") -> str:
    """La fecha de HOY en CDMX, formateada (para mostrar al usuario)."""
    return now_cdmx().strftime(fmt)
