"""W4.18 SUB-FIX 6 — OSM Geofabrik MX engine.

Geofabrik PBF download: distrito-federal-latest.osm.pbf. Cron semanal lunes 02:30 MX.

Conservador: pyrosm/osmium requiere C++ deps. Implementación lightweight:
fallback a Overpass API (HTTP) para POIs por bbox · cache progresivo.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("dmx.data_sources.osm")

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
GEOFABRIK_PBF = "https://download.geofabrik.de/north-america/mexico/distrito-federal-latest.osm.pbf"

# CDMX bbox aproximado (south, west, north, east)
CDMX_BBOX = (19.05, -99.36, 19.59, -98.95)

CATEGORIES = {
    "school": ("amenity", "school"),
    "hospital": ("amenity", "hospital"),
    "restaurant": ("amenity", "restaurant"),
    "cafe": ("amenity", "cafe"),
    "bank": ("amenity", "bank"),
    "park": ("leisure", "park"),
    "shop": ("shop", None),
    "transport": ("public_transport", None),
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    R = 6_371_000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


class OSMEngine:
    def __init__(self, db):
        self.db = db

    async def fetch_overpass_bbox(
        self, bbox=CDMX_BBOX, max_pois: int = 5000,
    ) -> List[Dict[str, Any]]:
        """Overpass API · returns POIs en bbox por categorías."""
        s, w, n, e = bbox
        # query Overpass: amenity + leisure + shop dentro de bbox
        ql = f"""
[out:json][timeout:60];
(
  node["amenity"~"^(school|hospital|restaurant|cafe|bank)$"]({s},{w},{n},{e});
  node["leisure"="park"]({s},{w},{n},{e});
  node["shop"]({s},{w},{n},{e});
  node["public_transport"]({s},{w},{n},{e});
);
out body {max_pois};
"""
        try:
            async with httpx.AsyncClient(
                timeout=120,
                headers={"User-Agent": "DesarrollosMX/1.0 (data-sources/osm)"},
            ) as cli:
                r = await cli.get(OVERPASS_URL, params={"data": ql})
                if r.status_code != 200:
                    log.warning(f"[osm] overpass HTTP {r.status_code}: {r.text[:200]}")
                    return []
                els = r.json().get("elements") or []
        except Exception as exc:
            log.warning(f"[osm] overpass err: {exc}")
            return []

        rows: List[Dict[str, Any]] = []
        for el in els[:max_pois]:
            if el.get("type") != "node":
                continue
            tags = el.get("tags") or {}
            cat = None
            sub = None
            if tags.get("amenity") in ("school", "hospital", "restaurant", "cafe", "bank"):
                cat = tags["amenity"]
                sub = "amenity"
            elif tags.get("leisure") == "park":
                cat = "park"
                sub = "leisure"
            elif tags.get("shop"):
                cat = "shop"
                sub = tags["shop"]
            elif tags.get("public_transport"):
                cat = "transport"
                sub = tags["public_transport"]
            if not cat:
                continue
            rows.append({
                "osm_id": str(el.get("id")),
                "category": cat, "subcategory": sub,
                "name": tags.get("name", ""),
                "lat": el.get("lat"), "lng": el.get("lon"),
                "ageb_id": None,
                "persisted_at": _now(),
            })
        return rows

    async def persist_to_cache(self, rows: List[Dict[str, Any]]) -> int:
        n = 0
        for r in rows[:20000]:
            try:
                await self.db.osm_pois.update_one(
                    {"osm_id": r["osm_id"]},
                    {"$set": r}, upsert=True,
                )
                n += 1
            except Exception:
                pass
        return n

    async def get_amenities_radius(
        self, lat: float, lng: float, radius_m: int = 500,
        categories: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Returns POIs + walkability score 0-100."""
        deg = radius_m / 111_000.0 * 1.5
        q = {"lat": {"$gte": lat - deg, "$lte": lat + deg},
             "lng": {"$gte": lng - deg, "$lte": lng + deg}}
        if categories:
            q["category"] = {"$in": categories}
        cur = self.db.osm_pois.find(
            q, {"_id": 0, "osm_id": 1, "category": 1, "subcategory": 1,
                "name": 1, "lat": 1, "lng": 1},
        ).limit(2000)
        pois: List[Dict[str, Any]] = []
        counts_by_cat: Dict[str, int] = {}
        async for d in cur:
            dist = _haversine_m(lat, lng, d["lat"], d["lng"])
            if dist <= radius_m:
                d["distance_m"] = round(dist, 1)
                pois.append(d)
                c = d.get("category", "other")
                counts_by_cat[c] = counts_by_cat.get(c, 0) + 1
        pois.sort(key=lambda x: x["distance_m"])
        # walkability: 100 si ≥4 categorías distintas y ≥10 POIs · 70 si 2-3 cats · 30 si 1 cat · 0 vacío
        unique_cats = len(counts_by_cat)
        total = len(pois)
        if unique_cats >= 4 and total >= 10:
            score = 100
        elif unique_cats >= 2:
            score = 70
        elif unique_cats == 1:
            score = 30
        else:
            score = 0
        return {
            "ok": True, "lat": lat, "lng": lng, "radius_m": radius_m,
            "pois": pois[:25], "counts_by_category": counts_by_cat,
            "walkability_score": score,
        }

    async def stats(self) -> Dict[str, Any]:
        total = await self.db.osm_pois.count_documents({})
        by_cat: Dict[str, int] = {}
        for c in CATEGORIES.keys():
            by_cat[c] = await self.db.osm_pois.count_documents({"category": c})
        last = await self.db.data_sources_sync_log.find_one(
            {"source": "osm"}, {"_id": 0}, sort=[("started_at", -1)],
        )
        return {"source": "osm", "total_pois": total,
                "by_category": by_cat, "last_sync": last}


async def run_osm_weekly_cron(db) -> Dict[str, Any]:
    """Semanal lunes 02:30 MX · Overpass bbox CDMX."""
    started = _now()
    engine = OSMEngine(db)
    rows = await engine.fetch_overpass_bbox()
    upserted = await engine.persist_to_cache(rows)
    summary = {
        "source": "osm", "started_at": started, "ended_at": _now(),
        "duration_ms": int((_now() - started).total_seconds() * 1000),
        "pois_fetched": len(rows), "pois_upserted": upserted,
        "ok": upserted > 0,
    }
    try:
        await db.data_sources_sync_log.insert_one(dict(summary))
    except Exception:
        pass
    log.info(f"[osm_weekly_cron] {summary}")
    return summary
