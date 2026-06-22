"""Conector AirROI — datos REALES de renta corta / Airbnb por zona (ADR, ocupación, ingreso). Fuente que el founder
pidió. Fail-open: sin API key no rompe (la calculadora usa el estimado manual). Cuando se ponga AIRROI_API_KEY, la
calculadora jala tarifa/ocupación reales por colonia. Lo refresca un cron (scheduler_ie). Build-for-endstate.

Guarda en db.airroi_zone (zone_id → {adr, ocupacion, ingreso_mensual, fecha_consulta}). La calculadora lo lee por colonia.
"""
import os
from datetime import datetime, timezone
from typing import Dict, Any, Optional

_BASE = "https://api.airroi.com/v1"   # ajustar al endpoint real cuando se contrate AirROI


async def fetch_zone(zone_id: str, lat: Optional[float] = None, lng: Optional[float] = None) -> Optional[Dict[str, Any]]:
    """Jala métricas de renta corta de AirROI para una zona. None si no hay key o falla (fail-open)."""
    key = os.environ.get("AIRROI_API_KEY")
    if not key:
        return None
    try:
        import httpx
        params = {"lat": lat, "lng": lng} if (lat is not None and lng is not None) else {"market": zone_id}
        async with httpx.AsyncClient() as c:
            r = await c.get(f"{_BASE}/market/metrics", params=params, headers={"Authorization": f"Bearer {key}"}, timeout=20)
        if r.status_code != 200:
            return None
        d = r.json() or {}
        return {
            "adr": d.get("adr") or d.get("average_daily_rate"),
            "ocupacion": d.get("occupancy") or d.get("occupancy_rate"),
            "ingreso_mensual": d.get("revenue_monthly") or d.get("monthly_revenue"),
            "fuente": "AirROI", "fecha_consulta": datetime.now(timezone.utc).isoformat(),
        }
    except Exception:
        return None


async def get_zone(db, zone_id: str) -> Optional[Dict[str, Any]]:
    """Lee la métrica cacheada de AirROI para la zona (la llena el cron). None si no hay."""
    try:
        d = await db.airroi_zone.find_one({"zone_id": zone_id}, {"_id": 0})
        return d
    except Exception:
        return None


async def refresh_zone(db, zone_id: str, lat: Optional[float] = None, lng: Optional[float] = None) -> Optional[Dict[str, Any]]:
    """Cron: jala de AirROI y cachea. Fail-open."""
    data = await fetch_zone(zone_id, lat, lng)
    if not data:
        return None
    try:
        await db.airroi_zone.update_one({"zone_id": zone_id}, {"$set": {"zone_id": zone_id, **data}}, upsert=True)
    except Exception:
        pass
    return data
