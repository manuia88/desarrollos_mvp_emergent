"""W3.4B — Natural Risk Engine (Atlas CDMX + CENAPRED).

Sources:
  - Atlas CDMX: https://www.atlas.cdmx.gob.mx/ — sísmica, inundación, hundimiento subsuelo
  - CENAPRED Atlas Nacional: http://www.atlasnacionalderiesgos.gob.mx/

V1 scoring is deterministic (point-in-polygon style) — no ML. Operator can
upload GeoJSON manually via `parse_atlas_geojson()` until live URLs are stable.

Schema db.natural_risk_layers:
  { zone_id, sismic_zone:"A|B|C|D", flood_pct, subsidence_mm_year,
    composite_score, fetched_at, sources:[] }
  unique (zone_id)

Composite formula:
  composite = 0.40*sismic + 0.35*flood + 0.25*subsidence
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.natural_risk_engine")

ATLAS_CDMX_BASE = "https://www.atlas.cdmx.gob.mx/api/geojson"
CENAPRED_BASE = "http://www.atlasnacionalderiesgos.gob.mx/api/geojson"

# Sismic zone → risk score (high score = high risk)
SISMIC_SCORES = {"A": 20, "B": 50, "C": 75, "D": 95}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


# ─── Fetch + parse ────────────────────────────────────────────────────────────

async def fetch_atlas_cdmx_layers(db) -> Dict[str, Any]:
    """Best-effort fetch of Atlas CDMX layers. Logs and returns honest stub
    when network fails (production operator can call `parse_atlas_geojson`
    manually with downloaded file)."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=30) as client:
            urls = {
                "sismic":      f"{ATLAS_CDMX_BASE}/zonificacion-sismica.geojson",
                "flood":       f"{ATLAS_CDMX_BASE}/inundaciones.geojson",
                "subsidence":  f"{ATLAS_CDMX_BASE}/hundimiento.geojson",
            }
            results = {}
            for k, url in urls.items():
                try:
                    r = await client.get(url)
                    if r.status_code == 200 and "json" in (r.headers.get("content-type") or ""):
                        gj = r.json()
                        results[k] = {"status": "fetched", "features": len(gj.get("features") or [])}
                    else:
                        results[k] = {"status": "http_error", "code": r.status_code}
                except Exception as e:
                    results[k] = {"status": "fetch_error", "error": str(e)[:120]}
            return {"ok": True, "layers": results}
    except Exception as e:
        log.warning(f"[atlas] fetch failed: {e}")
        return {"ok": False, "reason": "atlas_unavailable", "error": str(e)[:200]}


async def upsert_zone_layer(
    db, zone_id: str, *,
    sismic_zone: Optional[str] = None,
    flood_pct: Optional[float] = None,
    subsidence_mm_year: Optional[float] = None,
    sources: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Upsert per-zone natural risk record (operator helper for manual ingest)."""
    sismic = SISMIC_SCORES.get(sismic_zone or "", 50)
    flood_score = _clamp((flood_pct or 0))
    sub_score = _clamp((subsidence_mm_year or 0) * 4)  # 25 mm/year → 100 risk

    composite = round(0.40 * sismic + 0.35 * flood_score + 0.25 * sub_score, 1)
    doc = {
        "zone_id": zone_id,
        "sismic_zone": sismic_zone,
        "sismic_score": sismic,
        "flood_pct": flood_pct,
        "flood_score": flood_score,
        "subsidence_mm_year": subsidence_mm_year,
        "subsidence_score": sub_score,
        "composite_score": composite,
        "fetched_at": _iso(),
        "sources": sources or ["atlas_cdmx"],
    }
    await db.natural_risk_layers.update_one(
        {"zone_id": zone_id}, {"$set": doc}, upsert=True,
    )
    return doc


# ─── Compute per zone ─────────────────────────────────────────────────────────

async def compute_natural_risk_zone(db, zone_id: str) -> Dict[str, Any]:
    """Return composite score 0-100 + sub-components.
    Inverts sense for risk_score_engine: Higher composite = MORE risk → score
    inverted (lower risk → higher score) downstream."""
    doc = await db.natural_risk_layers.find_one({"zone_id": zone_id}, {"_id": 0})
    if not doc:
        return {"available": False, "reason": "no_atlas_data", "zone_id": zone_id}
    return {
        "available": True,
        "zone_id": zone_id,
        "composite_risk": doc.get("composite_score"),
        "sismic_zone": doc.get("sismic_zone"),
        "sismic_score": doc.get("sismic_score"),
        "flood_pct": doc.get("flood_pct"),
        "flood_score": doc.get("flood_score"),
        "subsidence_mm_year": doc.get("subsidence_mm_year"),
        "subsidence_score": doc.get("subsidence_score"),
        "sources": doc.get("sources") or [],
        "fetched_at": doc.get("fetched_at"),
    }


# ─── Cron ─────────────────────────────────────────────────────────────────────

async def cron_cenapred_atlas_quarterly_ingest(db) -> Dict[str, Any]:
    """Cron 1ro mes 09:00 MX trimestral (jan/abr/jul/oct).
    Best-effort fetch. Failure → system_alert.warning."""
    out = await fetch_atlas_cdmx_layers(db)
    if not out.get("ok"):
        try:
            await db.system_alerts.insert_one({
                "ts": _now(), "severity": "warning",
                "source": "cenapred_atlas_quarterly_ingest",
                "message": "Atlas CDMX/CENAPRED fetch fallido — operador puede ingestar GeoJSON manual",
                "details": out, "resolved_at": None,
            })
        except Exception:
            pass
    out["completed_at"] = _iso()
    return out


def schedule_atlas_quarterly_cron(scheduler, db) -> None:
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(cron_cenapred_atlas_quarterly_ingest, "cenapred_atlas_quarterly_ingest"),
            CronTrigger(month="1,4,7,10", day=1, hour=9, minute=0, timezone="America/Mexico_City"),
            args=[db], id="cenapred_atlas_quarterly_ingest",
            replace_existing=True, misfire_grace_time=3600,
        )
    except Exception as e:
        log.warning(f"[atlas] schedule cron failed: {e}")


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    try:
        await db.natural_risk_layers.create_index(
            "zone_id", unique=True, name="natural_zone_unique",
        )
    except Exception as e:
        log.warning(f"[atlas] ensure_indexes failed: {e}")
