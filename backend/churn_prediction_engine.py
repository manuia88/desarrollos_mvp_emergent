"""W5.FF4 Sub-D — Churn Prediction Engine.

Detecta usuarios en riesgo de churn comparando uso baseline (últimos 30d) vs
reciente (últimos 7d) per feature. Si drop_pct > 70% → genera churn_risk_score.

API:
  compute_churn_risk(db, user_id, baseline_days=30, recent_days=7)
      → Dict con churn_risk_score (0-100) + features_dropped + recommendation
  detect_cold_users(db, threshold_score=60)
      → List[Dict] ordenado por score desc

FAIL-SOFT: cualquier excepción retorna estructura neutra (score=0, lista vacía).
Consume W4.3 behavioral_events (vía feature_usage_analytics).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

_log = logging.getLogger("dmx.churn_prediction_engine")

DEFAULT_BASELINE_DAYS = 30
DEFAULT_RECENT_DAYS = 7
DROP_THRESHOLD_PCT = 70.0  # >70% drop = flagged
DEFAULT_RISK_THRESHOLD = 60  # detect_cold_users filter


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _drop_pct(baseline: float, recent: float, baseline_days: int, recent_days: int) -> float:
    """Normalize to daily rate, compare drop. Returns 0..100."""
    if baseline_days <= 0 or recent_days <= 0:
        return 0.0
    base_rate = baseline / baseline_days
    rec_rate = recent / recent_days
    if base_rate <= 0.0001:
        return 0.0  # no baseline · cannot measure drop
    drop = max(0.0, (base_rate - rec_rate) / base_rate) * 100.0
    return min(100.0, drop)


async def _features_per_period(db, user_id: str, since: datetime) -> Dict[str, int]:
    """Returns {feature: count} for user since timestamp."""
    if db is None or not user_id:
        return {}
    try:
        pipeline = [
            {"$match": {"user_id": user_id, "timestamp": {"$gte": since}, "feature": {"$ne": None}}},
            {"$group": {"_id": "$feature", "count": {"$sum": 1}}},
            {"$project": {"_id": 0, "feature": "$_id", "count": 1}},
        ]
        rows = await db.behavioral_events.aggregate(pipeline).to_list(length=300)
        return {r["feature"]: int(r.get("count") or 0) for r in rows if r.get("feature")}
    except Exception as exc:
        _log.warning(f"[churn] _features_per_period failed user={user_id} err={exc}")
        return {}


async def _last_active(db, user_id: str) -> Optional[str]:
    if db is None or not user_id:
        return None
    try:
        doc = await db.behavioral_events.find_one(
            {"user_id": user_id}, {"_id": 0, "timestamp": 1}, sort=[("timestamp", -1)],
        )
        if not doc:
            return None
        ts = doc.get("timestamp")
        if isinstance(ts, datetime):
            return ts.isoformat()
        return str(ts) if ts else None
    except Exception as exc:
        _log.warning(f"[churn] _last_active failed user={user_id} err={exc}")
        return None


async def compute_churn_risk(
    db,
    user_id: str,
    baseline_days: int = DEFAULT_BASELINE_DAYS,
    recent_days: int = DEFAULT_RECENT_DAYS,
) -> Dict[str, Any]:
    """Per-user churn risk score 0..100.

    Algorithm:
      1. Per feature: count_baseline (30d) vs count_recent (7d)
      2. Compute drop_pct (normalized to daily rate)
      3. Features dropped = those with drop_pct > 70%
      4. Risk score = avg(drop_pct of dropped features) capped at 100
    """
    out = {
        "user_id": user_id,
        "churn_risk_score": 0,
        "features_dropped": [],
        "features_count_baseline": 0,
        "features_count_recent": 0,
        "last_active_at": None,
        "recommendation": "",
    }
    if not user_id:
        return out
    try:
        now = _now()
        baseline_since = now - timedelta(days=max(baseline_days, 1))
        recent_since = now - timedelta(days=max(recent_days, 1))
        baseline_counts = await _features_per_period(db, user_id, baseline_since)
        recent_counts = await _features_per_period(db, user_id, recent_since)

        dropped: List[Dict[str, Any]] = []
        for fk, base_n in baseline_counts.items():
            rec_n = recent_counts.get(fk, 0)
            dp = _drop_pct(base_n, rec_n, baseline_days, recent_days)
            if dp > DROP_THRESHOLD_PCT:
                dropped.append({
                    "feature_key": fk,
                    "baseline_count": base_n,
                    "recent_count": rec_n,
                    "drop_pct": round(dp, 1),
                })

        # Risk score = max drop across features (more aggressive than avg)
        if dropped:
            score = int(round(max(d["drop_pct"] for d in dropped)))
        else:
            score = 0

        last_active = await _last_active(db, user_id)
        recommendation = ""
        if score >= 80:
            recommendation = "Contacto inmediato · demo personalizada · oferta retención"
        elif score >= 60:
            recommendation = "Email re-engagement · ofrecer onboarding 1:1"
        elif score >= 30:
            recommendation = "Newsletter destacando features nuevas"

        out.update({
            "churn_risk_score": min(100, max(0, score)),
            "features_dropped": dropped,
            "features_count_baseline": len(baseline_counts),
            "features_count_recent": len(recent_counts),
            "last_active_at": last_active,
            "recommendation": recommendation,
        })
        return out
    except Exception as exc:
        _log.warning(f"[churn] compute_churn_risk failed user={user_id} err={exc}")
        return out


async def detect_cold_users(
    db,
    threshold_score: int = DEFAULT_RISK_THRESHOLD,
    user_limit: int = 1000,
) -> List[Dict[str, Any]]:
    """Iterate active users · return those with churn_risk_score > threshold.

    Only considers users with at least 1 event in baseline period (90d).
    Ordered by score desc.
    """
    if db is None:
        return []
    cold: List[Dict[str, Any]] = []
    try:
        since = _now() - timedelta(days=DEFAULT_BASELINE_DAYS)
        # Active user ids in last baseline
        pipeline = [
            {"$match": {"timestamp": {"$gte": since}, "user_id": {"$ne": None}}},
            {"$group": {"_id": "$user_id"}},
            {"$limit": int(user_limit)},
        ]
        rows = await db.behavioral_events.aggregate(pipeline).to_list(length=user_limit)
        user_ids = [r["_id"] for r in rows if r.get("_id")]

        for uid in user_ids:
            try:
                risk = await compute_churn_risk(db, uid)
                if risk["churn_risk_score"] > threshold_score:
                    # Hydrate basic user info for sales team
                    try:
                        u = await db.users.find_one(
                            {"user_id": uid},
                            {"_id": 0, "email": 1, "name": 1, "role": 1, "tenant_id": 1},
                        )
                    except Exception:
                        u = None
                    risk_entry = dict(risk)
                    if u:
                        risk_entry["email"] = u.get("email")
                        risk_entry["name"] = u.get("name")
                        risk_entry["role"] = u.get("role")
                        risk_entry["tenant_id"] = u.get("tenant_id")
                    cold.append(risk_entry)
            except Exception as exc:
                _log.warning(f"[churn] detect_cold_users user={uid} err={exc}")

        cold.sort(key=lambda x: x.get("churn_risk_score", 0), reverse=True)
        return cold
    except Exception as exc:
        _log.warning(f"[churn] detect_cold_users failed err={exc}")
        return []
