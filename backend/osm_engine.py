"""
osm_engine — Densidad de comercios/POIs por zona vía OpenStreetMap Overpass (gratis, confiable).
═══════════════════════════════════════════════════════════════════════════════
Reemplaza al API de DENUE (gratis pero inestable: devolvía respuestas vacías). OSM Overpass
es gratis y responde de verdad. Escribe a la MISMA tabla `denue_zone_density` (la "tabla de
densidad de negocios" que ya leen los subscores `compute_amenidades`/`compute_lifestyle`) con
`source: "osm"`, así los scores de comercio (comercio) y vida se vuelven reales sin tocar nada
aguas abajo. Cero deuda.

UNA sola consulta por zona (trae todos los POIs con amenity/shop/leisure alrededor del centro
y los clasifica en Python) → educado con el API gratis. Honesto: si Overpass no responde, NO
inventa (no escribe), reporta el fallo.
"""
from __future__ import annotations

import logging
import math
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.osm_engine")


def _endpoint() -> str:
    return os.environ.get("IE_OSM_OVERPASS_URL") or "https://overpass-api.de/api/interpreter"


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# Clasificación de un POI de OSM → categoría DMX. Claves EN ESPAÑOL a propósito: el subscore
# de "lifestyle" (vida) busca tokens restaurante/bar/cafe/ocio/recreacion en by_category.
def _classify(tags: Dict[str, Any]) -> Optional[str]:
    a = (tags.get("amenity") or "").lower()
    s = (tags.get("shop") or "").lower()
    le = (tags.get("leisure") or "").lower()
    rw = (tags.get("railway") or "").lower()
    hw = (tags.get("highway") or "").lower()
    pt = (tags.get("public_transport") or "").lower()
    # Transporte (Metro/Metrobús/paradas) — para la dimensión de movilidad
    if (rw in ("station", "subway_entrance", "tram_stop", "halt")
            or hw == "bus_stop" or pt in ("station", "stop_position") or a == "bus_station"):
        return "transporte"
    if a in ("restaurant", "fast_food", "food_court"):
        return "restaurante"
    if a in ("bar", "pub", "biergarten"):
        return "bar"
    if a == "cafe":
        return "cafe"
    if a in ("cinema", "theatre", "nightclub", "arts_centre"):
        return "ocio"
    if le in ("park", "garden", "sports_centre", "pitch", "playground", "stadium", "dog_park"):
        return "recreacion"
    if a == "gym" or le == "fitness_centre":
        return "gimnasio"
    if s in ("supermarket", "convenience", "mall", "department_store", "greengrocer", "bakery"):
        return "mercado"
    if a in ("school", "kindergarten", "university", "college"):
        return "escuela"
    if a in ("hospital", "clinic", "doctors"):
        return "hospital"
    if a == "pharmacy":
        return "farmacia"
    if a == "bank":
        return "banco"
    if a or s:           # cualquier otro comercio/servicio → cuenta para densidad total
        return "otro_comercio"
    return None


def _area_km2(radius_m: int) -> float:
    return math.pi * (radius_m / 1000) ** 2


async def fetch_osm_pois(lat: float, lng: float, radius_m: int = 700, *, retries: int = 2) -> Optional[List[Dict[str, Any]]]:
    """Una consulta Overpass: todos los POIs (amenity/shop/leisure) alrededor del punto.
    Devuelve la lista de elementos, o None si el API no respondió (NO inventa)."""
    import httpx
    q = (
        f'[out:json][timeout:25];('
        f'node["amenity"](around:{radius_m},{lat},{lng});way["amenity"](around:{radius_m},{lat},{lng});'
        f'node["shop"](around:{radius_m},{lat},{lng});way["shop"](around:{radius_m},{lat},{lng});'
        f'node["leisure"](around:{radius_m},{lat},{lng});way["leisure"](around:{radius_m},{lat},{lng});'
        f'node["railway"~"station|subway_entrance|tram_stop|halt"](around:{radius_m},{lat},{lng});'
        f'node["highway"="bus_stop"](around:{radius_m},{lat},{lng});'
        f');out tags;'
    )
    for attempt in range(retries + 1):
        try:
            async with httpx.AsyncClient(timeout=45) as c:
                r = await c.post(_endpoint(), data={"data": q},
                                 headers={"User-Agent": "DMX/1.0 (densidad de zona)"})
            ctype = (r.headers.get("content-type") or "").lower()
            if r.status_code == 200 and "json" in ctype:
                return r.json().get("elements", [])
            # 504/429 = instancia saturada → reintenta
            log.warning(f"[osm] Overpass HTTP {r.status_code} (intento {attempt + 1})")
        except Exception as e:
            log.warning(f"[osm] error de red (intento {attempt + 1}): {e}")
    return None


async def compute_zone_density_osm(
    db, zone_id: str, lat: float, lng: float, radius_m: int = 700, tier: str = "colonia",
) -> Dict[str, Any]:
    """Cuenta POIs por categoría vía OSM y escribe la densidad en `denue_zone_density`
    (source='osm'). Honesto: si Overpass no respondió, no escribe y lo reporta."""
    elements = await fetch_osm_pois(lat, lng, radius_m)
    if elements is None:
        return {"ok": False, "zone_id": zone_id, "reason": "Overpass no respondió (reintenta)"}

    by_cat: Dict[str, int] = {}
    for el in elements:
        cat = _classify(el.get("tags") or {})
        if cat:
            by_cat[cat] = by_cat.get(cat, 0) + 1
    total = sum(by_cat.values())
    density = round(total / max(_area_km2(radius_m), 0.01), 2)

    doc = {
        "zone_id": zone_id, "tier": tier,
        "businesses_count_total": total, "by_category": by_cat,
        "businesses_per_km2": density, "radius_m": radius_m,
        "lat": lat, "lng": lng, "source": "osm", "last_synced": _iso(),
    }
    try:
        await db.denue_zone_density.update_one({"zone_id": zone_id}, {"$set": doc}, upsert=True)
    except Exception as e:
        log.warning(f"[osm] upsert density {zone_id}: {e}")
        return {"ok": False, "zone_id": zone_id, "reason": str(e)}

    return {"ok": True, "zone_id": zone_id, "total": total, "density": density, "by_category": by_cat}


# ─── Compat / reuso (reemplazo de denue_engine, que nunca funcionó) ───────────
async def get_zone_density(db, zone_id: str):
    """Densidad cacheada de la zona (poblada por OSM). Drop-in del antiguo denue_engine."""
    return await db.denue_zone_density.find_one({"zone_id": zone_id}, {"_id": 0})


async def compute_zone_density(db, zone_id: str, tier: str = "colonia",
                               radius_m: int = 700, lat=None, lng=None):
    """Compat (misma firma que el viejo denue): resuelve lat/lng (colonia.center o cube)
    y calcula la densidad por OSM. Sustituye la API de DENUE muerta."""
    if lat is None or lng is None:
        col = await db.colonias.find_one({"id": zone_id}, {"_id": 0, "center": 1})
        ctr = (col or {}).get("center")
        if isinstance(ctr, (list, tuple)) and len(ctr) == 2:
            lng, lat = float(ctr[0]), float(ctr[1])
        else:
            cube = await db.cube_aggregations.find_one(
                {"tier_id": zone_id, "period": "current"}, {"_id": 0, "geo": 1})
            geo = (cube or {}).get("geo") or {}
            lat = lat if lat is not None else geo.get("lat")
            lng = lng if lng is not None else geo.get("lng")
    if lat is None or lng is None:
        return {"ok": False, "zone_id": zone_id, "reason": "sin coordenadas"}
    return await compute_zone_density_osm(db, zone_id, float(lat), float(lng), radius_m=radius_m, tier=tier)


async def ensure_indexes(db) -> None:
    """Índice de la colección de densidad (OSM). Reemplaza ensure_indexes de denue_engine."""
    try:
        await db.denue_zone_density.create_index("zone_id", unique=True, name="density_zone_uniq")
    except Exception as e:
        log.warning(f"[osm] ensure_indexes: {e}")
