"""Phase 3 Batch 31 · services — Briefing Tráfico + Clima.

Pipeline para Asesor:
  1. Origen + destino (lat,lng o coords)
  2. Mapbox Directions API → tiempo con tráfico, ruta
  3. NOAA NWS forecast → clima en destino (Estados Unidos) o Open-Meteo fallback
  4. Cache `db.traffic_briefings_cache` con TTL configurable (default 15 min)

Falla suave: si Mapbox no responde o no hay token, usa Haversine + multiplicador
y marca `is_stale=true` con `last_known` desde cache si existe.
"""
from __future__ import annotations

import logging
import math
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

import httpx

log = logging.getLogger("dmx.traffic_briefing")

MAPBOX_TOKEN = os.environ.get("MAPBOX_TOKEN", "")
TTL_MINUTES = int(os.environ.get("TRAFFIC_BRIEFING_TTL_MIN", "15"))
USER_AGENT = "DesarrollosMX/1.0 (contacto@desarrollosmx.io)"


# ─── Time utils ───────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


# ─── Geocoding fallback (Haversine) ───────────────────────────────────────────

def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _estimate_minutes_from_distance(km: float) -> int:
    """Estimación urbana LATAM: 25 km/h promedio + 30% por tráfico."""
    base_min = (km / 25.0) * 60.0
    return max(5, int(round(base_min * 1.30)))


# ─── Mapbox Directions ────────────────────────────────────────────────────────

async def _fetch_mapbox_directions(
    origin: Tuple[float, float],
    destination: Tuple[float, float],
) -> Optional[Dict[str, Any]]:
    """Mapbox Directions API con tráfico en vivo. Retorna None si falla."""
    if not MAPBOX_TOKEN:
        log.info("[traffic_briefing] MAPBOX_TOKEN ausente, skip")
        return None

    o_lng, o_lat = origin[1], origin[0]
    d_lng, d_lat = destination[1], destination[0]
    coords = f"{o_lng},{o_lat};{d_lng},{d_lat}"

    url = (
        f"https://api.mapbox.com/directions/v5/mapbox/driving-traffic/"
        f"{coords}?geometries=geojson&overview=simplified&access_token={MAPBOX_TOKEN}"
    )

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(url)
            if r.status_code != 200:
                log.warning(f"[traffic_briefing] Mapbox HTTP {r.status_code}")
                return None
            data = r.json()
    except Exception as e:
        log.warning(f"[traffic_briefing] Mapbox exception: {e}")
        return None

    routes = data.get("routes", [])
    if not routes:
        return None

    route = routes[0]
    duration_s = route.get("duration", 0)
    distance_m = route.get("distance", 0)
    geometry = route.get("geometry")

    return {
        "traffic_minutes": int(round(duration_s / 60.0)),
        "distance_km": round(distance_m / 1000.0, 2),
        "geometry": geometry,
    }


# ─── Weather (Open-Meteo gratis, sin key) ─────────────────────────────────────

WEATHER_CODE_LABELS = {
    0: "Despejado",
    1: "Mayormente despejado",
    2: "Parcialmente nublado",
    3: "Nublado",
    45: "Niebla",
    48: "Niebla densa",
    51: "Llovizna ligera",
    53: "Llovizna",
    55: "Llovizna intensa",
    61: "Lluvia ligera",
    63: "Lluvia",
    65: "Lluvia intensa",
    71: "Nieve ligera",
    73: "Nieve",
    75: "Nieve intensa",
    80: "Chubascos",
    81: "Chubascos fuertes",
    82: "Chubascos violentos",
    95: "Tormenta eléctrica",
    96: "Tormenta con granizo",
    99: "Tormenta severa",
}


async def _fetch_weather(lat: float, lng: float) -> Optional[Dict[str, Any]]:
    """
    Open-Meteo (gratis, sin key) para clima actual + próxima hora.
    Cobertura mundial incluye LATAM. NOAA NWS solo cubre EE.UU.
    """
    url = (
        f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}"
        f"&current=temperature_2m,weather_code,wind_speed_10m,precipitation"
        f"&timezone=auto"
    )

    try:
        async with httpx.AsyncClient(
            timeout=6.0,
            headers={"User-Agent": USER_AGENT},
        ) as client:
            r = await client.get(url)
            if r.status_code != 200:
                return None
            data = r.json()
    except Exception as e:
        log.warning(f"[traffic_briefing] Weather exception: {e}")
        return None

    cur = data.get("current", {}) or {}
    code_raw = cur.get("weather_code")
    code = int(code_raw) if code_raw is not None else -1
    return {
        "temperature_c": round(float(cur.get("temperature_2m") or 0), 1),
        "weather_code": code,
        "weather_label": WEATHER_CODE_LABELS.get(code, "Sin datos"),
        "wind_speed_kmh": round(float(cur.get("wind_speed_10m") or 0), 1),
        "precipitation_mm": round(float(cur.get("precipitation") or 0), 2),
    }


# ─── Cache helpers ────────────────────────────────────────────────────────────

def _cache_key(origin: Tuple[float, float], destination: Tuple[float, float]) -> str:
    return f"{origin[0]:.4f},{origin[1]:.4f}->{destination[0]:.4f},{destination[1]:.4f}"


async def _load_cached(db, key: str) -> Optional[Dict[str, Any]]:
    doc = await db.traffic_briefings_cache.find_one({"key": key}, {"_id": 0})
    return doc


async def _save_cache(db, key: str, payload: Dict[str, Any]) -> None:
    await db.traffic_briefings_cache.update_one(
        {"key": key},
        {"$set": {**payload, "key": key, "cached_at": _now()}},
        upsert=True,
    )


# ─── Main entry ───────────────────────────────────────────────────────────────

async def build_briefing(
    db,
    origin: Tuple[float, float],
    destination: Tuple[float, float],
    origin_label: str = "",
    destination_label: str = "",
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Construye briefing tráfico + clima.

    Devuelve estructura:
      {
        briefing_id, origin, destination,
        traffic_minutes, distance_km, route_geometry,
        weather: {...},
        is_stale, generated_at, source
      }
    """
    key = _cache_key(origin, destination)
    cached = await _load_cached(db, key)

    if cached:
        cached_at = cached.get("cached_at")
        if isinstance(cached_at, datetime):
            if cached_at.tzinfo is None:
                cached_at = cached_at.replace(tzinfo=timezone.utc)
            age_min = (_now() - cached_at).total_seconds() / 60.0
            if age_min < TTL_MINUTES:
                cached["is_stale"] = False
                cached["cached_at"] = _iso(cached_at)
                return cached

    # Live fetch
    mapbox_data = await _fetch_mapbox_directions(origin, destination)
    weather = await _fetch_weather(destination[0], destination[1])

    is_stale = False
    source = "live"

    if mapbox_data is None:
        # Fallback Haversine
        km = _haversine_km(origin[0], origin[1], destination[0], destination[1])
        mapbox_data = {
            "traffic_minutes": _estimate_minutes_from_distance(km),
            "distance_km": round(km, 2),
            "geometry": None,
        }
        is_stale = True
        source = "estimated"

        # Si tenemos cache last_known, lo preferimos para minutos
        if cached:
            mapbox_data["traffic_minutes"] = cached.get(
                "traffic_minutes", mapbox_data["traffic_minutes"],
            )
            mapbox_data["distance_km"] = cached.get(
                "distance_km", mapbox_data["distance_km"],
            )
            source = "last_known"

    if weather is None and cached:
        weather = cached.get("weather")
        if weather is not None:
            is_stale = True

    briefing_id = str(uuid.uuid4())
    doc = {
        "briefing_id": briefing_id,
        "origin": list(origin),
        "destination": list(destination),
        "origin_label": origin_label,
        "destination_label": destination_label,
        "project_id": project_id,
        "traffic_minutes": mapbox_data["traffic_minutes"],
        "distance_km": mapbox_data["distance_km"],
        "route_geometry": mapbox_data.get("geometry"),
        "weather": weather or {},
        "is_stale": is_stale,
        "source": source,
        "generated_at": _iso(_now()),
        "ttl_minutes": TTL_MINUTES,
    }

    await _save_cache(db, key, doc)
    return doc


async def ensure_traffic_indexes(db) -> None:
    await db.traffic_briefings_cache.create_index("key", unique=True)
    await db.traffic_briefings_cache.create_index("cached_at")
    log.info("[traffic_briefing] indexes ensured")
