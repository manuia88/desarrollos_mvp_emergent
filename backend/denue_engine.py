"""W3.1A Phase 5 Foundation — DENUE Integration Engine.

DENUE API v1: https://www.inegi.org.mx/app/api/denue/v1/consulta/
Token: IE_INEGI_TOKEN (same INEGI key already present in env)

Collections:
  db.denue_businesses:
    { id, scian, name, lat, lng, employees_range, antiquity, zone_id, fetched_at }
  db.denue_zone_density:
    { zone_id, tier, businesses_count_total, by_category:{restaurants,gyms,
      schools,hospitals,pharmacies,banks,markets},
      businesses_per_km2, last_synced }
    index unique zone_id
"""
from __future__ import annotations

import logging
import math
import os
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("dmx.denue_engine")

DENUE_BASE = "https://www.inegi.org.mx/app/api/denue/v1/consulta"
# Per INEGI DENUE v1 docs: BuscarEntorno/{condicion}/{lat},{lng}/{distancia}/{token}
# DENUE token obtained separately from https://www.inegi.org.mx/app/api/denue/v1/tokenVerify.aspx
# Falls back to IE_INEGI_TOKEN for backwards-compat, but recommended: IE_DENUE_TOKEN

# Category keywords for DENUE text search
SCIAN_KEYWORDS: Dict[str, str] = {
    "restaurants": "restaurantes",
    "gyms":        "gimnasio",
    "markets":     "supermercado",
    "schools":     "escuela",
    "hospitals":   "hospital",
    "pharmacies":  "farmacia",
    "banks":       "banco",
}
DEFAULT_RADIUS_M = 2000
MAX_RECORDS = 500
# CDMX fallback center when zone has no geo data
CDMX_LAT = 19.4326
CDMX_LNG = -99.1332


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return "denue_" + secrets.token_urlsafe(8)


def _token() -> Optional[str]:
    # Prefer dedicated DENUE token, fallback to general INEGI token
    return os.environ.get("IE_DENUE_TOKEN") or os.environ.get("IE_INEGI_TOKEN")


# ─── DENUE API call ────────────────────────────────────────────────────────────

async def _fetch_denue_entorno(
    lat: float, lng: float, radius_m: int = DEFAULT_RADIUS_M,
    keyword: str = "todos", max_records: int = MAX_RECORDS,
) -> List[Dict[str, Any]]:
    """Call DENUE BuscarEntorno and return raw business list.
    Correct DENUE v1 URL: BuscarEntorno/{condicion}/{lat},{lng}/{distancia}/{token}
    """
    token = _token()
    if not token:
        log.warning("[denue] IE_DENUE_TOKEN / IE_INEGI_TOKEN ausente — retornando lista vacía")
        return []
    url = f"{DENUE_BASE}/BuscarEntorno/{keyword}/{lat},{lng}/{radius_m}/{token}"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, headers={"Accept": "application/json"})
        if r.status_code != 200:
            log.warning(f"[denue] BuscarEntorno HTTP {r.status_code} lat={lat} lng={lng} kw={keyword}")
            return []
        data = r.json()
        if isinstance(data, list):
            return data
        return []
    except Exception as e:
        log.warning(f"[denue] fetch error: {e}")
        return []


def _classify_scian(scian_str: str) -> Optional[str]:
    """Map a SCIAN code string to our category key."""
    if not scian_str:
        return None
    # DENUE response may have numeric SCIAN codes in various fields
    for cat, prefixes in {
        "restaurants": ["722"],
        "gyms":        ["713940", "71394", "7139"],
        "markets":     ["461", "462"],
        "schools":     ["611", "612"],
        "hospitals":   ["621", "622"],
        "pharmacies":  ["4661"],
        "banks":       ["522"],
    }.items():
        for pfx in prefixes:
            if str(scian_str).startswith(pfx):
                return cat
    return None


def _area_km2(radius_m: int) -> float:
    return math.pi * (radius_m / 1000) ** 2


# ─── Public fetch + density computation ───────────────────────────────────────

async def fetch_businesses_by_zone(
    lat: float, lng: float, radius_m: int = DEFAULT_RADIUS_M,
) -> List[Dict[str, Any]]:
    """Fetch DENUE businesses per category within radius_m meters of (lat, lng).
    Makes one call per category keyword. Returns normalized business dicts.
    """
    out: List[Dict[str, Any]] = []
    seen_ids: set = set()

    # One call per category keyword (DENUE API: per keyword)
    for cat, keyword in SCIAN_KEYWORDS.items():
        raw = await _fetch_denue_entorno(lat, lng, radius_m, keyword=keyword, max_records=100)
        for item in raw:
            # DENUE response fields may vary: Id, Nombre, Razon_social, Clase_actividad, Latitud, Longitud
            biz_id = str(item.get("Id") or item.get("id") or _new_id())
            if biz_id in seen_ids:
                continue
            seen_ids.add(biz_id)
            raw_scian = str(item.get("Clase_actividad") or item.get("codigo_act") or "")
            out.append({
                "id": biz_id,
                "scian": raw_scian,
                "category": cat,  # use the category we searched for
                "name": (item.get("Nombre") or item.get("Razon_social") or "").strip(),
                "lat": _safe_float(item.get("Latitud") or item.get("latitud")),
                "lng": _safe_float(item.get("Longitud") or item.get("longitud")),
                "employees_range": str(item.get("Estrato") or item.get("estrato") or ""),
                "antiquity": str(item.get("Fecha_alta") or item.get("fecha_alta") or ""),
                "fetched_at": _iso(),
            })

    return out


def _safe_float(v) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(str(v).replace(",", "."))
    except Exception:
        return None


# ─── Zone density aggregation ─────────────────────────────────────────────────

async def compute_zone_density(
    db, zone_id: str, tier: str = "colonia",
    radius_m: int = DEFAULT_RADIUS_M,
) -> Dict[str, Any]:
    """Fetch DENUE for zone, store businesses, compute density record."""
    # Resolve zone lat/lng from cube_aggregations
    cube_row = await db.cube_aggregations.find_one(
        {"tier_id": zone_id, "period": "current"}, {"_id": 0, "geo": 1, "name": 1},
    )
    geo = (cube_row or {}).get("geo") or {}
    lat = geo.get("lat") or CDMX_LAT
    lng = geo.get("lng") or CDMX_LNG

    businesses = await fetch_businesses_by_zone(lat, lng, radius_m)

    # Store businesses with zone_id tag
    if businesses:
        tagged = [{**b, "zone_id": zone_id} for b in businesses]
        try:
            # Remove stale for zone
            await db.denue_businesses.delete_many({"zone_id": zone_id})
            await db.denue_businesses.insert_many(tagged)
        except Exception as e:
            log.warning(f"[denue] store businesses failed {zone_id}: {e}")

    # Aggregate by category
    by_cat: Dict[str, int] = {k: 0 for k in SCIAN_KEYWORDS}
    for b in businesses:
        cat = b.get("category")
        if cat and cat in by_cat:
            by_cat[cat] += 1

    total = len(businesses)
    area = _area_km2(radius_m)
    density = round(total / max(area, 0.01), 2)

    doc: Dict[str, Any] = {
        "zone_id": zone_id,
        "tier": tier,
        "businesses_count_total": total,
        "by_category": by_cat,
        "businesses_per_km2": density,
        "radius_m": radius_m,
        "lat": lat,
        "lng": lng,
        "last_synced": _iso(),
    }
    try:
        await db.denue_zone_density.update_one(
            {"zone_id": zone_id},
            {"$set": doc},
            upsert=True,
        )
    except Exception as e:
        log.warning(f"[denue] upsert density failed {zone_id}: {e}")

    out = dict(doc)
    out.pop("_id", None)
    return out


async def get_zone_density(db, zone_id: str) -> Optional[Dict[str, Any]]:
    """Return cached density record for zone, or None."""
    doc = await db.denue_zone_density.find_one({"zone_id": zone_id}, {"_id": 0})
    return doc


async def lookup_business(
    db, empresa: str, limit: int = 20,
) -> List[Dict[str, Any]]:
    """Search db.denue_businesses by name (partial match, case-insensitive)."""
    if not empresa:
        return []
    cursor = db.denue_businesses.find(
        {"name": {"$regex": empresa, "$options": "i"}},
        {"_id": 0},
    ).limit(limit)
    return [doc async for doc in cursor]


# ─── Weekly cron: sync top active zones ────────────────────────────────────────

async def cron_denue_sync_weekly(db) -> Dict[str, Any]:
    """Sync DENUE density for top 100 active zones + CDMX colonias."""
    # Top zones by lead activity
    cursor = db.cube_aggregations.find(
        {"tier": "colonia", "period": "current"}, {"_id": 0, "tier_id": 1, "name": 1},
    ).sort([("kpis.leads_count", -1)]).limit(100)
    zones = [{"zone_id": r["tier_id"], "tier": "colonia"} async for r in cursor]

    synced = 0
    failed = 0
    for z in zones:
        try:
            await compute_zone_density(db, z["zone_id"], z["tier"])
            synced += 1
            # Audit log
            try:
                from audit_log import log_mutation
                await log_mutation(
                    db, None, "read", "denue_sync", z["zone_id"],
                    before=None, after={"zone_id": z["zone_id"]}, request=None,
                )
            except Exception:
                pass
        except Exception as e:
            log.warning(f"[denue cron] sync failed {z['zone_id']}: {e}")
            failed += 1

    return {"ok": True, "synced": synced, "failed": failed, "completed_at": _iso()}


def schedule_denue_sync_cron(scheduler, db) -> None:
    """Register cron `denue_sync_weekly` Mon 05:00 MX."""
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(cron_denue_sync_weekly, "denue_sync_weekly"),
            CronTrigger(day_of_week="mon", hour=5, minute=0,
                        timezone="America/Mexico_City"),
            args=[db], id="denue_sync_weekly",
            replace_existing=True, misfire_grace_time=3600,
        )
    except Exception as e:
        log.warning(f"[denue] schedule cron failed: {e}")


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    try:
        await db.denue_businesses.create_index([("zone_id", 1)], name="denue_biz_zone")
        await db.denue_businesses.create_index([("scian", 1)], name="denue_biz_scian")
        await db.denue_businesses.create_index([("name", "text")], name="denue_biz_name_text")
        await db.denue_zone_density.create_index("zone_id", unique=True, name="denue_density_zone_uniq")
    except Exception as e:
        log.warning(f"[denue] ensure_indexes failed: {e}")
