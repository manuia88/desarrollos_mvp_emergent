"""W3.4A — Risk Score V1 Engine (SESNSP-backed).

V1 covers ONLY crime layer (SESNSP). Future V2 (W3.4B) adds:
  - natural_score (CENAPRED + Atlas Riesgo CDMX)
  - title_risk_score (RPP partnership, Y2)
  - percepcion_score (ENVIPE)

Schema db.risk_scores_zone:
  { zone_id, score_letter, score_numeric,
    components: { crime_score (0-100),
                  crime_normalized_per_100k,
                  natural_score: null, title_risk_score: null, percepcion_score: null },
    sources_active: ["sesnsp"], formula_version,
    available, reason?, computed_at, computed_at_dt }
  index (zone_id, computed_at_dt desc) · TTL 90d
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import crime_data_engine as crime_data

log = logging.getLogger("dmx.risk_score_engine")

FORMULA_VERSION = "1.0.0"

# Empirical CDMX reference: incidents per 100K hab over 6m.
# 0 incidents → score 100; 5000 incidents → score 0.
CRIME_NORM_HIGH = 5000.0


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def _letter(score: float) -> str:
    if score >= 80: return "A"
    if score >= 65: return "B"
    if score >= 50: return "C"
    if score >= 35: return "D"
    if score >= 20: return "E"
    return "F"


def _crime_to_score(per_100k: Optional[float]) -> Optional[float]:
    if per_100k is None:
        return None
    s = 100 - (per_100k / CRIME_NORM_HIGH) * 100
    return round(_clamp(s), 1)


# ─── Compute V1 ───────────────────────────────────────────────────────────────

async def compute_risk_score_v1(db, zone_id: str) -> Dict[str, Any]:
    """V1 score: only SESNSP crime layer. Returns honest stub when no data."""
    crime = await crime_data.aggregate_crime_zone(db, zone_id, period_months=6)

    if not crime.get("available"):
        doc = {
            "zone_id": zone_id,
            "available": False,
            "reason": crime.get("reason") or "no_crime_data",
            "components": {
                "crime_score": None,
                "crime_normalized_per_100k": None,
                "natural_score": None,
                "title_risk_score": None,
                "percepcion_score": None,
            },
            "sources_active": [],
            "formula_version": FORMULA_VERSION,
            "computed_at": _iso(),
            "computed_at_dt": _now(),
        }
        try:
            await db.risk_scores_zone.insert_one(dict(doc))
        except Exception as e:
            log.warning(f"[risk] insert insufficient {zone_id}: {e}")
        out = dict(doc); out.pop("_id", None); out.pop("computed_at_dt", None)
        return out

    per_100k = crime.get("incidents_per_100k")
    crime_score = _crime_to_score(per_100k)

    # V1 weighted composite = solo crime (peso 100% V1)
    composite = round(crime_score or 50.0, 1)
    letter = _letter(composite)

    doc = {
        "zone_id": zone_id,
        "alcaldia": crime.get("alcaldia"),
        "score_letter": letter,
        "score_numeric": composite,
        "components": {
            "crime_score": crime_score,
            "crime_normalized_per_100k": per_100k,
            "crime_total_incidents_6m": crime.get("total_incidents"),
            "crime_by_category": crime.get("by_category"),
            "natural_score": None,
            "title_risk_score": None,
            "percepcion_score": None,
        },
        "sources_active": ["sesnsp"],
        "formula_version": FORMULA_VERSION,
        "available": True,
        "computed_at": _iso(),
        "computed_at_dt": _now(),
    }
    try:
        await db.risk_scores_zone.insert_one(dict(doc))
    except Exception as e:
        log.warning(f"[risk] insert {zone_id}: {e}")

    out = dict(doc); out.pop("_id", None); out.pop("computed_at_dt", None)
    return out


# ─── Get cached or recompute ──────────────────────────────────────────────────

async def get_risk_score_or_compute(db, zone_id: str) -> Dict[str, Any]:
    """Return cached score if < 24h old, else recompute."""
    cutoff = _now() - timedelta(hours=24)
    cached = await db.risk_scores_zone.find_one(
        {"zone_id": zone_id, "computed_at_dt": {"$gte": cutoff}},
        {"_id": 0, "computed_at_dt": 0},
        sort=[("computed_at_dt", -1)],
    )
    if cached:
        return {**cached, "cache": "hit"}
    return {**(await compute_risk_score_v1(db, zone_id)), "cache": "miss"}


# ─── List paginated (superadmin) ──────────────────────────────────────────────

async def list_all_scores(
    db, tier: Optional[str] = None, limit: int = 50,
) -> List[Dict[str, Any]]:
    pipeline = [
        {"$sort": {"computed_at_dt": -1}},
        {"$group": {"_id": "$zone_id", "doc": {"$first": "$$ROOT"}}},
        {"$replaceRoot": {"newRoot": "$doc"}},
        {"$project": {"_id": 0, "computed_at_dt": 0}},
        {"$sort": {"score_numeric": 1}},   # ascending: high-risk zones first
        {"$limit": limit},
    ]
    cursor = db.risk_scores_zone.aggregate(pipeline)
    rows = [d async for d in cursor]
    if tier:
        # Best-effort tier filter via dim_zones lookup
        zone_ids = [r["zone_id"] for r in rows]
        cursor2 = db.dim_zones.find(
            {"zone_id": {"$in": zone_ids}, "tier": tier},
            {"_id": 0, "zone_id": 1},
        )
        keep = {z["zone_id"] async for z in cursor2}
        rows = [r for r in rows if r["zone_id"] in keep]
    return rows


# ─── Daily cron ───────────────────────────────────────────────────────────────

async def cron_risk_score_zone_daily(db) -> Dict[str, Any]:
    """Daily refresh — runs after zone_score_daily 04:00 MX."""
    cursor = db.cube_aggregations.find(
        {"period": "current"}, {"_id": 0, "tier_id": 1, "tier": 1},
    ).limit(500)
    zones = [{"zone_id": r["tier_id"], "tier": r.get("tier", "colonia")}
             async for r in cursor]
    refreshed = 0
    insufficient = 0
    failed = 0
    for z in zones:
        try:
            res = await compute_risk_score_v1(db, z["zone_id"])
            if res.get("available"):
                refreshed += 1
            else:
                insufficient += 1
        except Exception as e:
            log.warning(f"[risk cron] {z['zone_id']}: {e}")
            failed += 1
    return {
        "ok": True, "refreshed": refreshed, "insufficient": insufficient,
        "failed": failed, "completed_at": _iso(),
    }


def schedule_risk_score_cron(scheduler, db) -> None:
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(cron_risk_score_zone_daily, "risk_score_zone_daily"),
            CronTrigger(hour=5, minute=0, timezone="America/Mexico_City"),
            args=[db], id="risk_score_zone_daily",
            replace_existing=True, misfire_grace_time=3600,
        )
    except Exception as e:
        log.warning(f"[risk] schedule cron failed: {e}")


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    try:
        await db.risk_scores_zone.create_index(
            [("zone_id", 1), ("computed_at_dt", -1)],
            name="risk_zone_ts",
        )
        await db.risk_scores_zone.create_index(
            "computed_at_dt",
            expireAfterSeconds=90 * 86400,
            name="risk_ttl_90d",
        )
        await db.risk_scores_zone.create_index("score_letter", name="risk_letter")
    except Exception as e:
        log.warning(f"[risk] ensure_indexes failed: {e}")
