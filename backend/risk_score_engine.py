"""W3.4A/B — Risk Score Engine.

V1 (W3.4A): SESNSP crime layer only.
V2 (W3.4B): + natural risk (Atlas CDMX + CENAPRED) + perception (ENVIPE) + title heuristic.

Composite weights V2:
  crime 40% · natural 25% · title 15% · perception 20%
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import crime_data_engine as crime_data

log = logging.getLogger("dmx.risk_score_engine")

FORMULA_VERSION = "2.0.0"

# Empirical CDMX reference: incidents per 100K hab over 6m.
# 0 incidents → score 100; 5000 incidents → score 0.
CRIME_NORM_HIGH = 5000.0

# V2 composite weights
WEIGHTS_V2 = {
    "crime": 0.40,
    "natural": 0.25,
    "title": 0.15,
    "perception": 0.20,
}


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


# ─── V2 multi-source ──────────────────────────────────────────────────────────

async def _title_risk_heuristic(db, zone_id: str) -> Optional[Dict[str, Any]]:
    """W3.4B: heurística mejorada con Transaction Network W3.2.
    Si zona tiene transactions con property_id_hash que cambió manos ≥3 veces
    en 24m → flag elevated risk. Returns None si no hay data (honest stub).
    """
    cutoff = (_now() - timedelta(days=730)).isoformat()
    pipeline = [
        {"$match": {"zone_id": zone_id, "closed_at": {"$gte": cutoff},
                    "property_id_hash": {"$exists": True, "$ne": None}}},
        {"$group": {"_id": "$property_id_hash", "n": {"$sum": 1}}},
        {"$match": {"n": {"$gte": 3}}},
        {"$count": "flips"},
    ]
    res = await db.transactions.aggregate(pipeline).to_list(1)
    flip_count = (res[0].get("flips") if res else 0) or 0
    sample = await db.transactions.count_documents(
        {"zone_id": zone_id, "closed_at": {"$gte": cutoff}},
    )
    if sample == 0:
        return None
    flip_rate = flip_count / max(sample, 1) * 100
    # Higher flip_rate → higher RISK → lower SCORE
    score = round(max(0.0, min(100.0, 100 - flip_rate * 8)), 1)
    return {
        "available": True,
        "title_score": score,
        "flips_24m": flip_count,
        "transactions_24m": sample,
        "flip_rate_pct": round(flip_rate, 2),
        "method": "heuristic_v2.1_transaction_network",
        "v3_pending": "RPP partnership Y2",
    }


async def compute_risk_score_v2(db, zone_id: str) -> Dict[str, Any]:
    """V2 composite: crime 40% + natural 25% + title 15% + perception 20%.

    Each dimension may be unavailable; weights renormalize over available
    dimensions when ≥1 is present. Returns honest stub if all unavailable.
    """
    import natural_risk_engine as natural
    import perception_risk_engine as perception

    crime = await crime_data.aggregate_crime_zone(db, zone_id, period_months=6)
    crime_score = (
        _crime_to_score(crime.get("incidents_per_100k"))
        if crime.get("available") else None
    )

    nat = await natural.compute_natural_risk_zone(db, zone_id)
    natural_score = None
    if nat.get("available"):
        # natural composite_risk is RISK 0-100; invert to SCORE
        natural_score = round(_clamp(100 - (nat.get("composite_risk") or 0)), 1)

    title = await _title_risk_heuristic(db, zone_id)
    title_score = title.get("title_score") if title else None

    perc = await perception.compute_perception_risk_zone(db, zone_id)
    perception_score = None
    if perc.get("available"):
        # perception_risk_score is RISK 0-100; invert to SCORE
        perception_score = round(_clamp(100 - (perc.get("perception_risk_score") or 0)), 1)

    sources_active: List[str] = []
    if crime_score is not None:      sources_active.append("sesnsp")
    if natural_score is not None:    sources_active.append("atlas_cdmx")
    if title_score is not None:      sources_active.append("transaction_network")
    if perception_score is not None: sources_active.append("envipe_inegi")

    placeholder_flags = {
        "crime": crime_score is None,
        "natural": natural_score is None,
        "title": title_score is None,
        "perception": perception_score is None,
    }

    # Renormalize weights over available dimensions
    parts = {
        "crime": crime_score, "natural": natural_score,
        "title": title_score, "perception": perception_score,
    }
    available_weight = sum(WEIGHTS_V2[k] for k, v in parts.items() if v is not None)
    if available_weight == 0:
        doc = {
            "zone_id": zone_id, "available": False,
            "reason": "no_data_any_source",
            "components": {f"{k}_score": v for k, v in parts.items()},
            "placeholder_flags": placeholder_flags,
            "sources_active": [], "formula_version": FORMULA_VERSION,
            "computed_at": _iso(), "computed_at_dt": _now(),
        }
        try:
            await db.risk_scores_zone.insert_one(dict(doc))
        except Exception:
            pass
        out = dict(doc); out.pop("_id", None); out.pop("computed_at_dt", None)
        return out

    composite = round(
        sum(WEIGHTS_V2[k] * v for k, v in parts.items() if v is not None) / available_weight,
        1,
    )
    letter = _letter(composite)

    doc = {
        "zone_id": zone_id,
        "alcaldia": (perc.get("alcaldia") or crime.get("alcaldia")),
        "score_letter": letter,
        "score_numeric": composite,
        "components": {
            "crime_score": crime_score,
            "crime_normalized_per_100k": crime.get("incidents_per_100k"),
            "crime_total_incidents_6m": crime.get("total_incidents"),
            "crime_by_category": crime.get("by_category"),
            "natural_score": natural_score,
            "natural_detail": {
                "composite_risk": nat.get("composite_risk"),
                "sismic_zone": nat.get("sismic_zone"),
                "flood_pct": nat.get("flood_pct"),
                "subsidence_mm_year": nat.get("subsidence_mm_year"),
            } if nat.get("available") else None,
            "title_risk_score": title_score,
            "title_detail": title,
            "percepcion_score": perception_score,
            "percepcion_detail": {
                "perception_pct": perc.get("perception_pct"),
                "year": perc.get("year"),
            } if perc.get("available") else None,
        },
        "placeholder_flags": placeholder_flags,
        "sources_active": sources_active,
        "weights": WEIGHTS_V2,
        "available_weight": round(available_weight, 2),
        "formula_version": FORMULA_VERSION,
        "available": True,
        "computed_at": _iso(),
        "computed_at_dt": _now(),
    }
    try:
        await db.risk_scores_zone.insert_one(dict(doc))
    except Exception as e:
        log.warning(f"[risk_v2] insert {zone_id}: {e}")

    out = dict(doc); out.pop("_id", None); out.pop("computed_at_dt", None)
    return out


# ─── Letter change detection (W3.4B alert engine) ─────────────────────────────

async def detect_letter_change(
    db, zone_id: str, new_letter: str, new_score: float,
) -> Optional[Dict[str, Any]]:
    """Compare against previous risk_scores_zone for this zone (skip current
    insert). If letter changed, INSERT db.risk_letter_changes + system_alert."""
    if not new_letter:
        return None

    prev = await db.risk_scores_zone.find_one(
        {"zone_id": zone_id, "available": True,
         "score_letter": {"$exists": True, "$ne": new_letter}},
        {"_id": 0, "score_letter": 1, "score_numeric": 1, "computed_at": 1},
        sort=[("computed_at_dt", -1)],
    )
    if not prev:
        return None
    prev_letter = prev.get("score_letter")
    if not prev_letter or prev_letter == new_letter:
        return None

    # Severity: drop in letter (A→B = down) is worse
    rank = {"A": 5, "B": 4, "C": 3, "D": 2, "E": 1, "F": 0}
    delta = rank.get(prev_letter, 0) - rank.get(new_letter, 0)
    if delta > 2:
        severity = "critical"   # bajada drástica
    elif delta > 0:
        severity = "warning"    # bajada
    else:
        severity = "info"       # subida (mejora)

    import secrets
    change_id = f"rc_{secrets.token_urlsafe(8)}"
    change = {
        "id": change_id,
        "zone_id": zone_id,
        "prev_letter": prev_letter,
        "new_letter": new_letter,
        "prev_score": prev.get("score_numeric"),
        "new_score": new_score,
        "delta_letters": delta,
        "severity": severity,
        "changed_at": _iso(),
        "changed_at_dt": _now(),
        "acknowledged_at": None,
        "acknowledged_by": None,
    }
    try:
        await db.risk_letter_changes.insert_one(dict(change))
    except Exception as e:
        log.warning(f"[risk] letter change insert: {e}")
        return None

    try:
        await db.system_alerts.insert_one({
            "ts": _now(), "severity": severity,
            "source": "risk_letter_change",
            "message": (
                f"Risk Score zona {zone_id}: {prev_letter} → {new_letter}"
                f" ({prev.get('score_numeric')} → {new_score})"
            ),
            "details": change, "resolved_at": None,
        })
    except Exception:
        pass

    # Email Resend on critical drop
    if severity == "critical":
        try:
            import os, httpx
            resend_key = os.environ.get("RESEND_API_KEY")
            alert_email = os.environ.get("ALERT_EMAIL", "admin@desarrollosmx.com")
            if resend_key:
                async with httpx.AsyncClient(timeout=10) as client:
                    await client.post(
                        "https://api.resend.com/emails",
                        headers={"Authorization": f"Bearer {resend_key}"},
                        json={
                            "from": "DMX Risk <no-reply@desarrollosmx.com>",
                            "to": [alert_email],
                            "subject": f"[DMX] Risk drop crítico · {zone_id}: {prev_letter}→{new_letter}",
                            "text": (
                                f"La zona {zone_id} bajó {delta} letras de riesgo.\n"
                                f"Score: {prev.get('score_numeric')} → {new_score}.\n"
                                f"Revisa /superadmin/risk-alerts."
                            ),
                        },
                    )
        except Exception as e:
            log.warning(f"[risk] critical email failed: {e}")

    out = dict(change); out.pop("changed_at_dt", None); out.pop("_id", None)
    return out


# ─── Get cached or recompute ──────────────────────────────────────────────────

async def get_risk_score_or_compute(db, zone_id: str) -> Dict[str, Any]:
    """Return cached score if < 24h old, else recompute V2."""
    cutoff = _now() - timedelta(hours=24)
    cached = await db.risk_scores_zone.find_one(
        {"zone_id": zone_id, "computed_at_dt": {"$gte": cutoff}},
        {"_id": 0, "computed_at_dt": 0},
        sort=[("computed_at_dt", -1)],
    )
    if cached:
        return {**cached, "cache": "hit"}
    fresh = await compute_risk_score_v2(db, zone_id)
    # Fire letter change detection (best-effort)
    if fresh.get("available") and fresh.get("score_letter"):
        try:
            await detect_letter_change(
                db, zone_id, fresh["score_letter"], fresh["score_numeric"],
            )
        except Exception as e:
            log.warning(f"[risk] letter change detect failed {zone_id}: {e}")
    return {**fresh, "cache": "miss"}


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
            res = await compute_risk_score_v2(db, z["zone_id"])
            if res.get("available"):
                refreshed += 1
                # Letter change detection
                try:
                    await detect_letter_change(
                        db, z["zone_id"], res.get("score_letter"), res.get("score_numeric"),
                    )
                except Exception:
                    pass
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
        # W3.4B — letter changes
        await db.risk_letter_changes.create_index(
            [("zone_id", 1), ("changed_at_dt", -1)],
            name="risk_change_zone_ts",
        )
        await db.risk_letter_changes.create_index(
            "changed_at_dt", expireAfterSeconds=180 * 86400, name="risk_change_ttl_6m",
        )
        await db.risk_letter_changes.create_index("severity", name="risk_change_severity")
    except Exception as e:
        log.warning(f"[risk] ensure_indexes failed: {e}")
