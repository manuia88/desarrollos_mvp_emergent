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

# P2.1 · resiliencia: Overpass se satura seguido (504/429). Cacheamos el último resultado bueno
# por punto y, si la API falla, servimos ese caché (≤24h) en vez de None → la densidad de zona
# sigue funcionando durante caídas externas. (In-memory; multi-instancia → mover a colección/Redis.)
import asyncio
import time as _time
_OSM_CACHE: Dict[str, tuple] = {}
_OSM_CACHE_TTL = 86400  # 24h

# Enfriamiento cuando Overpass nos frena (429/504). En lista de un elemento para poder cambiarlo
# desde dentro de la función sin declararlo global. Media hora es suficiente para que el servicio
# nos vuelva a atender, y el cron de zonas corre cada 12 min: en la pausa usa caché y no falla.
_OVERPASS_PAUSA_S = 1800
_OVERPASS_PAUSA_HASTA = [0.0]


def _osm_key(lat: float, lng: float, radius_m: int) -> str:
    return f"{round(lat, 4)}|{round(lng, 4)}|{radius_m}"


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
    key = _osm_key(lat, lng, radius_m)

    # DEJAR DE MARTILLAR (auditoría A–Z 07-26). Overpass es un servicio público GRATUITO y le
    # estábamos pegando cada 12 minutos, reintentando tres veces seguidas sin pausa. Resultado:
    # nos devolvía 429 (demasiadas peticiones) de forma permanente, el cron de zonas fallaba cada
    # 12 min, y el registro se llenaba de ese error tapando los que sí importan.
    # Cuando nos frenan, esperamos: no volvemos a llamar hasta que pase el enfriamiento y mientras
    # tanto se sirve la caché. Es lo correcto con un servicio gratuito y de paso el registro vuelve
    # a ser legible.
    if _time.time() < _OVERPASS_PAUSA_HASTA[0]:
        faltan = int(_OVERPASS_PAUSA_HASTA[0] - _time.time())
        hit = _OSM_CACHE.get(key)
        if hit and (_time.time() - hit[0]) < _OSM_CACHE_TTL:
            return hit[1]
        log.info(f"[osm] Overpass nos frenó; en pausa {faltan}s más y sin caché para {key}")
        return None

    for attempt in range(retries + 1):
        try:
            async with httpx.AsyncClient(timeout=45) as c:
                r = await c.post(_endpoint(), data={"data": q},
                                 headers={"User-Agent": "DMX/1.0 (densidad de zona)"})
            ctype = (r.headers.get("content-type") or "").lower()
            if r.status_code == 200 and "json" in ctype:
                elements = r.json().get("elements", [])
                _OSM_CACHE[key] = (_time.time(), elements)  # P2.1 · guarda el último bueno
                return elements
            if r.status_code in (429, 504):
                # Nos están frenando a propósito. Reintentar de inmediato solo empeora el freno.
                _OVERPASS_PAUSA_HASTA[0] = _time.time() + _OVERPASS_PAUSA_S
                log.warning(f"[osm] Overpass HTTP {r.status_code} — en pausa "
                            f"{_OVERPASS_PAUSA_S // 60} min para no seguir insistiendo")
                break
            log.warning(f"[osm] Overpass HTTP {r.status_code} (intento {attempt + 1})")
        except Exception as e:
            log.warning(f"[osm] error de red (intento {attempt + 1}): {e}")
        if attempt < retries:
            await asyncio.sleep(2 ** attempt)   # 1s, 2s — respirar entre intentos
    # P2.1 · Overpass falló todos los intentos → sirve el último resultado bueno cacheado (≤24h).
    hit = _OSM_CACHE.get(key)
    if hit and (_time.time() - hit[0]) < _OSM_CACHE_TTL:
        log.warning(f"[osm] sirviendo caché ({len(hit[1])} POIs) tras fallo de Overpass para {key}")
        return hit[1]
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
