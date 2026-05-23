"""W6.MOV.1 · SOC (Sistema Operación Certificado) Franchise Engine.

Scoring 0-100 por asesor en 5 dimensiones (pesos iguales 20% c/u):
    1. lead_conversion (closed_won / leads_30d)
    2. nps_proxy (avg lead.rating normalizado 1-10 → 0-100)
    3. response_time (median min primera respuesta · < 5min=100 · > 60min=0)
    4. revenue_30d (pipeline_value_mxn closed-won / target_30d configurable)
    5. compliance (audits passed / audits total)

4 niveles franquicia:
    - bronze    (0-49)
    - silver    (50-69)
    - gold      (70-89)
    - platinum  (90-100)

Cache 7d en `soc_franchise_cache` por user_id · recompute lazy.
Manual override superadmin: pin level + reason ≥10 chars → bypass scoring.
Audit: certify · revoke · manual_override loggeados vía audit_immutable_engine.

FAIL-OPEN · si data insuficiente retorna score=None + reason · NO crash.
NO LLM · 100% determinístico desde data interna.
"""
from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.soc_franchise_engine")

# Pesos por dimensión (suma = 1.0)
DIMENSION_WEIGHTS = {
    "lead_conversion": 0.20,
    "nps_proxy": 0.20,
    "response_time": 0.20,
    "revenue_30d": 0.20,
    "compliance": 0.20,
}

CACHE_TTL_DAYS = int(os.environ.get("SOC_FRANCHISE_CACHE_TTL_DAYS", "7"))
INDEX_VERSION = "1.0.0"
REVENUE_TARGET_30D_DEFAULT = float(os.environ.get("SOC_REVENUE_TARGET_30D_MXN", "5000000"))

# Score thresholds por level
LEVEL_THRESHOLDS = [
    (90, "platinum"),
    (70, "gold"),
    (50, "silver"),
    (0,  "bronze"),
]
VALID_LEVELS = {"bronze", "silver", "gold", "platinum"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def level_for_score(score: float) -> str:
    for threshold, label in LEVEL_THRESHOLDS:
        if score >= threshold:
            return label
    return "bronze"


def _cache_key(user_id: str) -> str:
    raw = f"soc:{user_id}:{INDEX_VERSION}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _stage(lead: Dict[str, Any]) -> str:
    return (lead.get("lead_stage") or lead.get("status") or "").lower()


WON_STATUSES = {"closed_won", "ganado", "won", "cerrado_ganado"}
LOST_STATUSES = {"closed_lost", "perdido", "lost"}


async def _load_leads_for_advisor(db, user_id: str, since_iso: str) -> List[Dict[str, Any]]:
    cursor = db.leads.find(
        {"$or": [
            {"assigned_to": user_id},
            {"asesor_id": user_id},
            {"assigned_user_id": user_id},
        ]},
        {"_id": 0},
    )
    out: List[Dict[str, Any]] = []
    async for ld in cursor:
        ca = ld.get("created_at") or ""
        if isinstance(ca, str) and ca >= since_iso:
            out.append(ld)
    return out


async def _compute_lead_conversion(leads: List[Dict[str, Any]]) -> Tuple[float, Dict[str, Any]]:
    if not leads:
        return 50.0, {"score": 50.0, "missing_data": True, "reason": "sin_leads_30d", "leads_total": 0, "leads_won": 0}
    won = sum(1 for ld in leads if _stage(ld) in WON_STATUSES)
    rate = won / len(leads)
    # 0% won = 0 · 30% won = 100 (industry strong-performer threshold)
    score = _clamp((rate / 0.30) * 100.0)
    return score, {
        "score": round(score, 1),
        "leads_total": len(leads),
        "leads_won": won,
        "conversion_rate_pct": round(rate * 100.0, 1),
    }


async def _compute_nps_proxy(leads: List[Dict[str, Any]]) -> Tuple[float, Dict[str, Any]]:
    ratings: List[float] = []
    for ld in leads:
        r = ld.get("rating") or ld.get("lead_rating") or ld.get("nps_rating")
        if r is None:
            continue
        try:
            rv = float(r)
            if 0 <= rv <= 10:
                ratings.append(rv)
        except Exception:
            continue
    if not ratings:
        return 65.0, {"score": 65.0, "missing_data": True, "reason": "sin_ratings", "ratings_count": 0}
    avg = sum(ratings) / len(ratings)
    # 1 = 0 · 10 = 100 · linear
    score = _clamp(((avg - 1.0) / 9.0) * 100.0)
    return score, {
        "score": round(score, 1),
        "ratings_count": len(ratings),
        "avg_rating": round(avg, 2),
    }


async def _compute_response_time(leads: List[Dict[str, Any]]) -> Tuple[float, Dict[str, Any]]:
    """Median minutos primera respuesta · < 5 min = 100 · > 60 min = 0 · linear interp."""
    deltas_min: List[float] = []
    for ld in leads:
        ca = ld.get("created_at")
        fr = ld.get("first_response_at") or ld.get("first_contact_at")
        try:
            if ca and fr:
                cdt = datetime.fromisoformat(str(ca).replace("Z", "+00:00"))
                fdt = datetime.fromisoformat(str(fr).replace("Z", "+00:00"))
                d_min = (fdt - cdt).total_seconds() / 60.0
                if 0 <= d_min <= 60 * 48:  # clamp 48h max
                    deltas_min.append(d_min)
        except Exception:
            continue
    if not deltas_min:
        return 50.0, {"score": 50.0, "missing_data": True, "reason": "sin_first_response", "samples": 0}
    deltas_min.sort()
    n = len(deltas_min)
    median = deltas_min[n // 2] if n % 2 == 1 else (deltas_min[n // 2 - 1] + deltas_min[n // 2]) / 2
    if median <= 5:
        score = 100.0
    elif median >= 60:
        score = 0.0
    else:
        score = 100.0 - ((median - 5.0) / 55.0) * 100.0
    return score, {
        "score": round(score, 1),
        "median_minutes": round(median, 1),
        "samples": n,
    }


async def _compute_revenue_30d(leads: List[Dict[str, Any]]) -> Tuple[float, Dict[str, Any]]:
    """Sum amount_total de leads closed_won 30d / target_30d · ratio 1.0 = 100."""
    closed_amount = 0.0
    won_count = 0
    for ld in leads:
        if _stage(ld) not in WON_STATUSES:
            continue
        amt = ld.get("amount_total") or ld.get("price_mxn") or ld.get("expected_value_mxn") or 0
        try:
            closed_amount += float(amt)
            won_count += 1
        except Exception:
            continue
    target = REVENUE_TARGET_30D_DEFAULT
    ratio = closed_amount / target if target > 0 else 0
    score = _clamp(ratio * 100.0)
    return score, {
        "score": round(score, 1),
        "revenue_mxn": round(closed_amount, 2),
        "target_mxn": target,
        "won_count": won_count,
        "ratio": round(ratio, 3),
    }


async def _compute_compliance(db, user_id: str, since_iso: str) -> Tuple[float, Dict[str, Any]]:
    """% audits passed / audits total (sólo eventos del user en último mes).

    Si user no aparece en audit_immutable → score neutral 75 + missing_data flag.
    """
    try:
        cursor = db.audit_immutable.find(
            {
                "actor.user_id": user_id,
                "ts_iso": {"$gte": since_iso},
            },
            {"_id": 0, "action": 1, "after": 1},
        )
        total = 0
        passed = 0
        async for row in cursor:
            total += 1
            after = row.get("after") or {}
            # Heuristic: si action incluye 'fail'/'reject' o after.status='failed' → not passed
            action = (row.get("action") or "").lower()
            status = (after.get("status") or "").lower() if isinstance(after, dict) else ""
            if "fail" in action or "reject" in action or status in ("failed", "rejected"):
                continue
            passed += 1
        if total == 0:
            return 75.0, {"score": 75.0, "missing_data": True, "reason": "sin_audit_events", "total": 0, "passed": 0}
        rate = passed / total
        score = _clamp(rate * 100.0)
        return score, {
            "score": round(score, 1),
            "total": total,
            "passed": passed,
            "pass_rate_pct": round(rate * 100.0, 1),
        }
    except Exception as exc:
        log.warning(f"_compute_compliance fallback for {user_id}: {exc}")
        return 75.0, {"score": 75.0, "missing_data": True, "reason": "audit_unavailable"}


async def compute_soc_score(
    db,
    user_id: str,
    use_cache: bool = True,
) -> Dict[str, Any]:
    """Calcula score SOC 0-100 + level + breakdown 5 dimensiones.

    Returns:
        {
            user_id, score 0-100|None, level bronze|silver|gold|platinum,
            breakdown: {lead_conversion, nps_proxy, response_time, revenue_30d, compliance, weights},
            computed_at, cached, version, manual_override
        }
    """
    # 1. Cache check
    if use_cache:
        cached = await db.soc_franchise_cache.find_one({"user_id": user_id})
        if cached:
            computed_at = cached.get("computed_at")
            if computed_at and (_now() - computed_at).days < CACHE_TTL_DAYS:
                cached["cached"] = True
                cached.pop("_id", None)
                return cached

    # 2. Load user
    user = await db.users.find_one(
        {"user_id": user_id},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1, "tenant_id": 1, "avatar_url": 1,
         "soc_manual_override_level": 1, "soc_manual_override_reason": 1, "soc_manual_override_score": 1},
    )
    if not user:
        return {
            "user_id": user_id,
            "score": None,
            "level": "bronze",
            "reason": "user_not_found",
            "version": INDEX_VERSION,
            "computed_at": _now(),
        }

    # 3. Manual override (superadmin pin)
    manual_level = user.get("soc_manual_override_level")
    if manual_level and manual_level in VALID_LEVELS:
        score = user.get("soc_manual_override_score")
        if score is None:
            # Si solo level fue pinned, asignar threshold inferior del level
            for thr, lvl in LEVEL_THRESHOLDS:
                if lvl == manual_level:
                    score = float(thr) if thr > 0 else 10.0
                    break
            score = score if score is not None else 50.0
        result = {
            "user_id": user_id,
            "name": user.get("name") or user.get("email"),
            "score": round(float(score), 1),
            "level": manual_level,
            "manual_override": True,
            "manual_override_reason": user.get("soc_manual_override_reason", ""),
            "breakdown": None,
            "computed_at": _now(),
            "cached": False,
            "version": INDEX_VERSION,
        }
        await _persist_cache(db, user_id, result)
        return result

    # 4. Compute 5 dimensions
    since = (_now() - timedelta(days=30)).isoformat()
    leads = await _load_leads_for_advisor(db, user_id, since)

    conv_s, conv_d   = await _compute_lead_conversion(leads)
    nps_s, nps_d     = await _compute_nps_proxy(leads)
    rt_s, rt_d       = await _compute_response_time(leads)
    rev_s, rev_d     = await _compute_revenue_30d(leads)
    comp_s, comp_d   = await _compute_compliance(db, user_id, since)

    score = (
        conv_s * DIMENSION_WEIGHTS["lead_conversion"]
        + nps_s * DIMENSION_WEIGHTS["nps_proxy"]
        + rt_s  * DIMENSION_WEIGHTS["response_time"]
        + rev_s * DIMENSION_WEIGHTS["revenue_30d"]
        + comp_s * DIMENSION_WEIGHTS["compliance"]
    )
    score = _clamp(score)

    result = {
        "user_id": user_id,
        "name": user.get("name") or user.get("email"),
        "email": user.get("email"),
        "avatar_url": user.get("avatar_url"),
        "tenant_id": user.get("tenant_id"),
        "score": round(score, 1),
        "level": level_for_score(score),
        "manual_override": False,
        "breakdown": {
            "lead_conversion": conv_d,
            "nps_proxy": nps_d,
            "response_time": rt_d,
            "revenue_30d": rev_d,
            "compliance": comp_d,
            "weights": DIMENSION_WEIGHTS,
        },
        "computed_at": _now(),
        "cached": False,
        "version": INDEX_VERSION,
    }
    await _persist_cache(db, user_id, result)
    return result


async def _persist_cache(db, user_id: str, result: Dict[str, Any]) -> None:
    try:
        cache_doc = {**result, "user_id": user_id}
        cache_doc.pop("_id", None)
        await db.soc_franchise_cache.update_one(
            {"user_id": user_id},
            {"$set": cache_doc},
            upsert=True,
        )
    except Exception as exc:
        log.warning(f"_persist_cache failed for {user_id}: {exc}")


async def list_franchisees(
    db,
    level: Optional[str] = None,
    limit: int = 20,
    skip: int = 0,
    use_cache: bool = True,
    public_safe: bool = False,
) -> List[Dict[str, Any]]:
    """Top N franquiciatarios sorted by score desc.

    Si use_cache=True lee directo de soc_franchise_cache (rápido para leaderboard público).
    public_safe=True (audit forense G.90 fix) elimina PII (email · tenant_id · manual_override)
    de la respuesta · debe usarse SIEMPRE en endpoint público T0 sin auth.
    """
    query: Dict[str, Any] = {"score": {"$ne": None}}
    if level and level in VALID_LEVELS:
        query["level"] = level

    # PII-safe projection cuando endpoint público · admin obtiene full
    if public_safe:
        projection = {"_id": 0, "user_id": 1, "name": 1, "avatar_url": 1,
                      "score": 1, "level": 1, "computed_at": 1}
    else:
        projection = {"_id": 0, "user_id": 1, "name": 1, "email": 1, "avatar_url": 1,
                      "score": 1, "level": 1, "tenant_id": 1, "computed_at": 1, "manual_override": 1}

    cursor = (
        db.soc_franchise_cache.find(query, projection)
        .sort("score", -1)
        .skip(skip)
        .limit(limit)
    )
    items = [doc async for doc in cursor]

    # Compute deltas semana (variación vs snapshot 7d antes)
    week_ago = (_now() - timedelta(days=7)).isoformat()
    for it in items:
        try:
            prev = await db.soc_franchise_history.find_one(
                {"user_id": it["user_id"], "snapshot_at": {"$lte": week_ago}},
                {"_id": 0, "score": 1}, sort=[("snapshot_at", -1)],
            )
            if prev and prev.get("score") is not None:
                it["delta_week"] = round(float(it["score"]) - float(prev["score"]), 1)
            else:
                it["delta_week"] = None
        except Exception:
            it["delta_week"] = None

    return items


async def get_stats(db) -> Dict[str, Any]:
    """Stats globales · counts por level · avg score · top mover · bottom mover."""
    pipeline = [
        {"$match": {"score": {"$ne": None}}},
        {"$group": {
            "_id": "$level",
            "count": {"$sum": 1},
            "avg_score": {"$avg": "$score"},
        }},
    ]
    levels_stats: Dict[str, Any] = {}
    async for row in db.soc_franchise_cache.aggregate(pipeline):
        levels_stats[row["_id"]] = {
            "count": row["count"],
            "avg_score": round(row["avg_score"], 1),
        }

    total_franchisees = sum(t["count"] for t in levels_stats.values())
    total_users_adv = await db.users.count_documents({"role": {"$in": ["advisor", "asesor_admin"]}})

    # Top/bottom movers (delta semana)
    week_ago = (_now() - timedelta(days=7)).isoformat()
    movers = []
    async for it in db.soc_franchise_cache.find(
        {"score": {"$ne": None}},
        {"_id": 0, "user_id": 1, "name": 1, "score": 1, "level": 1},
    ).sort("score", -1).limit(200):
        prev = await db.soc_franchise_history.find_one(
            {"user_id": it["user_id"], "snapshot_at": {"$lte": week_ago}},
            {"_id": 0, "score": 1}, sort=[("snapshot_at", -1)],
        )
        if prev and prev.get("score") is not None:
            it["delta_week"] = round(float(it["score"]) - float(prev["score"]), 1)
            movers.append(it)
    movers.sort(key=lambda r: r.get("delta_week", 0))
    top_movers = list(reversed(movers[-5:])) if movers else []
    bottom_movers = movers[:5] if movers else []

    return {
        "total_franchisees": total_franchisees,
        "total_advisors": total_users_adv,
        "coverage_pct": round((total_franchisees / total_users_adv * 100) if total_users_adv else 0, 1),
        "levels": levels_stats,
        "top_movers": top_movers,
        "bottom_movers": bottom_movers,
        "version": INDEX_VERSION,
        "computed_at": _now(),
    }


async def certify(db, user_id: str, level: str, reason: str, actor: Dict[str, Any]) -> Dict[str, Any]:
    """Superadmin certify · pin level + reason · audit log."""
    if level not in VALID_LEVELS:
        raise ValueError(f"level inválido: {level} · usa bronze|silver|gold|platinum")
    if not reason or len(reason.strip()) < 10:
        raise ValueError("reason requerido (min 10 chars)")

    # Score por default al threshold inferior del level
    threshold_score = next((float(thr) if thr > 0 else 10.0 for thr, lvl in LEVEL_THRESHOLDS if lvl == level), 50.0)

    res = await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "soc_manual_override_level": level,
            "soc_manual_override_reason": reason.strip(),
            "soc_manual_override_score": threshold_score,
            "soc_certified_at": _now(),
        }},
    )
    if res.matched_count == 0:
        raise ValueError(f"user {user_id} not found")

    # Recompute para refrescar cache
    result = await compute_soc_score(db, user_id, use_cache=False)

    try:
        import audit_immutable_engine
        await audit_immutable_engine.log(
            db, actor, "soc_franchise.certify", "user", user_id,
            before=None, after={"level": level, "reason": reason, "score": threshold_score},
        )
    except Exception as exc:
        log.warning(f"certify audit skipped: {exc}")

    return result


async def revoke(db, user_id: str, reason: str, actor: Dict[str, Any]) -> Dict[str, Any]:
    """Superadmin revoke · elimina manual override · audit log."""
    if not reason or len(reason.strip()) < 10:
        raise ValueError("reason requerido (min 10 chars)")

    res = await db.users.update_one(
        {"user_id": user_id},
        {"$unset": {
            "soc_manual_override_level": "",
            "soc_manual_override_reason": "",
            "soc_manual_override_score": "",
            "soc_certified_at": "",
        }},
    )
    if res.matched_count == 0:
        raise ValueError(f"user {user_id} not found")

    # Recompute para volver al score real
    result = await compute_soc_score(db, user_id, use_cache=False)

    try:
        import audit_immutable_engine
        await audit_immutable_engine.log(
            db, actor, "soc_franchise.revoke", "user", user_id,
            before=None, after={"reason": reason},
        )
    except Exception as exc:
        log.warning(f"revoke audit skipped: {exc}")

    return result


async def snapshot_history(db) -> int:
    """Job opcional · escribe snapshot diario a soc_franchise_history para deltas semana."""
    now = _now()
    snapshot_at = now.isoformat()
    count = 0
    cursor = db.soc_franchise_cache.find(
        {"score": {"$ne": None}},
        {"_id": 0, "user_id": 1, "score": 1, "level": 1},
    )
    async for it in cursor:
        try:
            await db.soc_franchise_history.insert_one({
                "user_id": it["user_id"],
                "score": it.get("score"),
                "level": it.get("level"),
                "snapshot_at": snapshot_at,
            })
            count += 1
        except Exception as exc:
            log.warning(f"snapshot_history insert failed: {exc}")
    return count


async def ensure_indexes(db) -> None:
    """Create indexes on first use. Idempotent."""
    try:
        await db.soc_franchise_cache.create_index("user_id", unique=True)
        await db.soc_franchise_cache.create_index([("score", -1)])
        await db.soc_franchise_cache.create_index("level")
        await db.soc_franchise_cache.create_index("computed_at")
        await db.soc_franchise_history.create_index([("user_id", 1), ("snapshot_at", -1)])
        await db.soc_franchise_history.create_index("snapshot_at")
    except Exception as exc:
        log.warning(f"ensure_indexes warning: {exc}")
