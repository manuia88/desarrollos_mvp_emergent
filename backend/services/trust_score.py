"""Phase 4 Batch 32 · services — Asesor Trust Score (composite 0-100).

Schema:
  db.asesor_trust_scores: {
    asesor_id (PK), score: 0-100, components: {
      experience_score, deals_score, endorsement_score,
      response_time_score, certifications_score, disc_complete_bonus
    }, last_computed, ttl_minutes: 240
  }

Weighted formula (caps en docstring):
  experience      → 25 pts  (years_experience * 5, cap 25)
  deals           → 30 pts  (deals_closed_total / 100 * 30, cap 30)
  endorsements    → 25 pts  (avg_rating * count_verified / 10, cap 25)
  response_time   → 15 pts  (max(0, 20 - response_hours), cap 15)
  certifications  →  5 pts  (count_certifications * 2, cap 5)
  disc_bonus      → +5 pts  (si DISC completado)

Re-compute on: nuevo endorsement verificado · nuevo deal cerrado · DISC submitted.
Cache TTL: 4h (240 min).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.trust_score")

CACHE_TTL_MIN = 240
WON_STATUSES = {"won", "ganado", "cerrado_ganado", "closed_won"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _cap(v: float, ceiling: float) -> float:
    return min(max(0.0, v), ceiling)


# ─── Component computations ──────────────────────────────────────────────────

async def _experience_score(db, asesor_id: str) -> float:
    """experience_score: years_experience * 5, cap 25."""
    li = await db.asesor_linkedin_profiles.find_one(
        {"asesor_id": asesor_id}, {"_id": 0, "profile_data": 1},
    )
    years = int(((li or {}).get("profile_data") or {}).get("years_experience", 0))
    return _cap(years * 5.0, 25.0)


async def _deals_score(db, asesor_id: str) -> float:
    """deals_score: deals_closed_total / 100 * 30, cap 30."""
    deals = await db.leads.count_documents({
        "$and": [
            {"$or": [
                {"assigned_to": asesor_id},
                {"asesor_id": asesor_id},
            ]},
            {"$or": [
                {"status": {"$in": list(WON_STATUSES)}},
                {"lead_stage": {"$in": list(WON_STATUSES)}},
            ]},
        ],
    })
    return _cap((deals / 100.0) * 30.0, 30.0)


async def _endorsement_score(db, asesor_id: str) -> float:
    """endorsement_score: avg_rating * count_verified / 10, cap 25."""
    docs = await db.asesor_endorsements.find(
        {"asesor_id": asesor_id, "verified": True},
        {"_id": 0, "rating": 1},
    ).to_list(500)
    if not docs:
        return 0.0
    count = len(docs)
    avg = sum(int(d.get("rating") or 0) for d in docs) / count
    return _cap((avg * count) / 10.0, 25.0)


async def _response_time_score(db, asesor_id: str) -> float:
    """response_time_score: max(0, 20 - response_time_hours), cap 15."""
    # Reusa asesor_metrics_snapshots si existe (B20)
    snap = await db.asesor_metrics_snapshots.find_one(
        {"asesor_id": asesor_id},
        {"_id": 0, "response_time_hours": 1},
        sort=[("snapshot_at", -1)],
    )
    if snap and snap.get("response_time_hours") is not None:
        rt = float(snap["response_time_hours"])
    else:
        # Fallback: live compute
        try:
            from services.asesor_metrics import compute_asesor_metrics
            m = await compute_asesor_metrics(db, asesor_id, "30d")
            rt = float(m.get("response_time_hours", 24.0))
        except Exception:
            rt = 24.0
    return _cap(20.0 - rt, 15.0)


async def _certifications_score(db, asesor_id: str) -> float:
    """certifications_score: count_certifications * 2, cap 5."""
    li = await db.asesor_linkedin_profiles.find_one(
        {"asesor_id": asesor_id}, {"_id": 0, "profile_data": 1},
    )
    certs = ((li or {}).get("profile_data") or {}).get("certifications") or []
    return _cap(len(certs) * 2.0, 5.0)


async def _disc_bonus(db, asesor_id: str) -> float:
    """+5 si DISC completado."""
    doc = await db.asesor_disc_profiles.find_one(
        {"asesor_id": asesor_id}, {"_id": 0, "result": 1},
    )
    return 5.0 if doc and doc.get("result") else 0.0


# ─── Public API ───────────────────────────────────────────────────────────────

async def compute_trust_score(
    db,
    asesor_id: str,
    force_refresh: bool = False,
) -> Dict[str, Any]:
    # Cache lookup
    if not force_refresh:
        cached = await db.asesor_trust_scores.find_one(
            {"asesor_id": asesor_id}, {"_id": 0},
        )
        if cached:
            lc = cached.get("last_computed")
            if isinstance(lc, datetime):
                # Mongo a veces devuelve naive; normalizamos a UTC
                if lc.tzinfo is None:
                    lc = lc.replace(tzinfo=timezone.utc)
                age_min = (_now() - lc).total_seconds() / 60.0
                if age_min < CACHE_TTL_MIN:
                    cached["last_computed"] = _iso(lc)
                    cached["from_cache"] = True
                    return cached

    components = {
        "experience_score": round(await _experience_score(db, asesor_id), 2),
        "deals_score": round(await _deals_score(db, asesor_id), 2),
        "endorsement_score": round(await _endorsement_score(db, asesor_id), 2),
        "response_time_score": round(await _response_time_score(db, asesor_id), 2),
        "certifications_score": round(await _certifications_score(db, asesor_id), 2),
        "disc_complete_bonus": round(await _disc_bonus(db, asesor_id), 2),
    }
    total = sum(components.values())
    # cap final 0-100
    score = int(round(min(100.0, max(0.0, total))))

    doc = {
        "asesor_id": asesor_id,
        "score": score,
        "components": components,
        "last_computed": _now(),
        "ttl_minutes": CACHE_TTL_MIN,
    }
    await db.asesor_trust_scores.update_one(
        {"asesor_id": asesor_id},
        {"$set": doc},
        upsert=True,
    )

    out = dict(doc)
    out["last_computed"] = _iso(doc["last_computed"])
    out["from_cache"] = False
    return out


async def invalidate_trust_score(db, asesor_id: str) -> None:
    """Marca cache stale (next read recompute). No borra para mantener UI estable."""
    await db.asesor_trust_scores.update_one(
        {"asesor_id": asesor_id},
        {"$set": {"last_computed": _now() - timedelta(minutes=CACHE_TTL_MIN + 1)}},
    )


async def ensure_trust_score_indexes(db) -> None:
    await db.asesor_trust_scores.create_index("asesor_id", unique=True)
    log.info("[trust_score] indexes ensured")
