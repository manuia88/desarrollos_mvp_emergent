"""W4.18 SUB-FIX 5 — GTFS CDMX engine.

GTFS estático Metro/Metrobús/Ecobici + afluencia diaria via CKAN datos.cdmx.gob.mx.
Cron mensual día 1 03:30 MX (static) + diario 06:30 MX (afluencia).

Conservador: gtfs-kit no se instala por defecto (heavy deps geopandas/folium).
Implementación lightweight: descarga ZIP GTFS + parse stops.txt manual.
"""
from __future__ import annotations

import io
import logging
import math
import zipfile
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import csv as _csv
import httpx

log = logging.getLogger("dmx.data_sources.gtfs")

CKAN_BASE = "https://datos.cdmx.gob.mx/api/3/action"
PACKAGE_NAME = "gtfs"


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


class GTFSEngine:
    def __init__(self, db):
        self.db = db

    async def fetch_package(self) -> Dict[str, Any]:
        """CKAN package_search id=gtfs."""
        url = f"{CKAN_BASE}/package_search"
        try:
            async with httpx.AsyncClient(timeout=20) as cli:
                r = await cli.get(url, params={"q": PACKAGE_NAME, "rows": 10})
                if r.status_code != 200:
                    return {"ok": False, "error": f"HTTP {r.status_code}"}
                results = (r.json().get("result") or {}).get("results") or []
                pkg = next((p for p in results
                            if "gtfs" in (p.get("name") or "").lower()), None)
                if not pkg:
                    return {"ok": False, "error": "package gtfs no encontrado"}
                resources = [{
                    "id": res.get("id"), "name": res.get("name"),
                    "format": res.get("format"), "url": res.get("url"),
                } for res in (pkg.get("resources") or [])]
                return {"ok": True, "package": pkg.get("name"),
                        "resources": resources[:20]}
        except Exception as exc:
            log.warning(f"[gtfs] package_search err: {exc}")
            return {"ok": False, "error": str(exc)}

    async def fetch_zip_and_parse_stops(self, url: str) -> List[Dict[str, Any]]:
        """Download GTFS ZIP + extrae stops.txt."""
        try:
            async with httpx.AsyncClient(timeout=90, follow_redirects=True) as cli:
                r = await cli.get(url)
                if r.status_code != 200:
                    return []
                buf = io.BytesIO(r.content)
        except Exception as exc:
            log.warning(f"[gtfs] zip fetch err: {exc}")
            return []

        rows: List[Dict[str, Any]] = []
        try:
            with zipfile.ZipFile(buf) as zf:
                if "stops.txt" not in zf.namelist():
                    return []
                with zf.open("stops.txt") as f:
                    content = f.read().decode("utf-8", errors="ignore")
                reader = _csv.DictReader(io.StringIO(content))
                for d in reader:
                    sid = d.get("stop_id")
                    try:
                        lat = float(d.get("stop_lat") or 0)
                        lng = float(d.get("stop_lon") or 0)
                    except Exception:
                        continue
                    if not sid or not (lat and lng):
                        continue
                    rows.append({
                        "stop_id": sid,
                        "stop_name": d.get("stop_name", ""),
                        "lat": lat, "lng": lng,
                        "transit_lines": [],
                        "persisted_at": _now(),
                    })
        except Exception as exc:
            log.warning(f"[gtfs] parse err: {exc}")
        return rows

    async def persist_to_cache(self, rows: List[Dict[str, Any]]) -> int:
        n = 0
        for r in rows[:20000]:
            try:
                await self.db.gtfs_cdmx.update_one(
                    {"stop_id": r["stop_id"]},
                    {"$set": r}, upsert=True,
                )
                n += 1
            except Exception:
                pass
        return n

    async def get_transit_accessibility(
        self, lat: float, lng: float, radius_m: int = 500,
    ) -> Dict[str, Any]:
        """Returns score + nearest stops desde cache."""
        # bbox aproximada (1deg ~ 111km)
        deg = radius_m / 111_000.0 * 1.5
        cur = self.db.gtfs_cdmx.find(
            {"lat": {"$gte": lat - deg, "$lte": lat + deg},
             "lng": {"$gte": lng - deg, "$lte": lng + deg}},
            {"_id": 0, "stop_id": 1, "stop_name": 1,
             "lat": 1, "lng": 1, "transit_lines": 1},
        ).limit(2000)
        nearest: List[Dict[str, Any]] = []
        async for d in cur:
            dist = _haversine_m(lat, lng, d["lat"], d["lng"])
            if dist <= radius_m:
                d["distance_m"] = round(dist, 1)
                nearest.append(d)
        nearest.sort(key=lambda x: x["distance_m"])
        # walkability score: 100 si ≥3 stops · 60 si 1-2 · 0 si none
        n = len(nearest)
        score = 100 if n >= 3 else (60 if n >= 1 else 0)
        return {
            "ok": True, "lat": lat, "lng": lng, "radius_m": radius_m,
            "nearest_stops": nearest[:8], "lines_count": n,
            "accessibility_score": score,
        }

    async def stats(self) -> Dict[str, Any]:
        total = await self.db.gtfs_cdmx.count_documents({})
        last = await self.db.data_sources_sync_log.find_one(
            {"source": {"$in": ["gtfs_static", "gtfs_afluencia"]}},
            {"_id": 0}, sort=[("started_at", -1)],
        )
        return {"source": "gtfs", "total_stops": total, "last_sync": last}


async def run_gtfs_monthly_cron(db) -> Dict[str, Any]:
    """Mensual día 1 03:30 MX · static."""
    started = _now()
    engine = GTFSEngine(db)
    pkg = await engine.fetch_package()
    upserted = 0
    if pkg.get("ok"):
        zip_resources = [r for r in pkg.get("resources") or []
                         if (r.get("format") or "").upper() in ("ZIP", "GTFS")][:5]
        for res in zip_resources:
            url = res.get("url")
            if not url:
                continue
            rows = await engine.fetch_zip_and_parse_stops(url)
            if rows:
                upserted += await engine.persist_to_cache(rows)
                break  # primer ZIP exitoso suficiente
    summary = {
        "source": "gtfs_static", "started_at": started, "ended_at": _now(),
        "duration_ms": int((_now() - started).total_seconds() * 1000),
        "ckan_ok": pkg.get("ok", False),
        "stops_upserted": upserted, "ok": upserted > 0 or pkg.get("ok", False),
    }
    try:
        await db.data_sources_sync_log.insert_one(dict(summary))
    except Exception:
        pass
    log.info(f"[gtfs_monthly_cron] {summary}")
    return summary


async def run_gtfs_daily_cron(db) -> Dict[str, Any]:
    """Diario 06:30 MX · afluencia (placeholder · CKAN tiene endpoints separados)."""
    started = _now()
    summary = {
        "source": "gtfs_afluencia", "started_at": started, "ended_at": _now(),
        "duration_ms": 0,
        "ok": True,
        "note": "Afluencia data placeholder · feed específico CKAN se anexa en H2",
    }
    try:
        await db.data_sources_sync_log.insert_one(dict(summary))
    except Exception:
        pass
    log.info(f"[gtfs_daily_cron] {summary}")
    return summary
