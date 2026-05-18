"""W5.5 Parte 1 — Live Pulse routes.

Endpoints publicos (T0):
    GET  /api/live-pulse/zones
    GET  /api/live-pulse/zone/{slug}/timeline

Endpoints autenticados:
    POST   /api/live-pulse/alerts/subscribe       (tier T3+)
    GET    /api/live-pulse/alerts/my-subs
    DELETE /api/live-pulse/alerts/{sub_id}

Endpoints superadmin:
    GET  /api/superadmin/live-pulse/readiness
    POST /api/superadmin/live-pulse/set-frequency
    GET  /api/superadmin/live-pulse/stats
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request

import live_pulse_cron
import live_pulse_readiness

log = logging.getLogger("dmx.routes.live_pulse")

router = APIRouter()


def _db(request: Request):
    return request.app.state.db


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _current_user(request: Request):
    from server import get_current_user
    return await get_current_user(request)


async def _require_user(request: Request):
    user = await _current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    return user


async def _user_tier_t(request: Request, user) -> str:
    """Mapea rol + plan org a niveles T0..T5.

    T0 = anonimo · T1 = buyer/free · T2 = asesor freelance / pro free
    T3 = pro plan o developer/inmobiliaria member · T4 = enterprise o director
    T5 = superadmin
    """
    if not user:
        return "T0"
    role = getattr(user, "role", "") or ""
    if role == "superadmin":
        return "T5"
    if role in ("developer_director", "developer_admin", "inmobiliaria_director", "inmobiliaria_admin"):
        return "T4"
    if role in ("developer_member", "inmobiliaria_member",
                "developer_advisor", "developer_obras", "developer_marketing",
                "inmobiliaria_advisor", "inmobiliaria_marketing"):
        return "T3"
    # tenant plan check para advisor/buyer
    db = _db(request)
    tenant_id = getattr(user, "tenant_id", None)
    if tenant_id:
        try:
            org = await db.organizations.find_one(
                {"tenant_id": tenant_id}, {"_id": 0, "plan": 1, "tier": 1},
            )
            if org:
                plan = (org.get("plan") or org.get("tier") or "").lower()
                if plan in ("enterprise", "premium"):
                    return "T4"
                if plan in ("pro", "growth", "trial"):
                    return "T3"
        except Exception:
            pass
    if role in ("advisor", "asesor_admin", "asesor_freelance"):
        return "T2"
    return "T1"


# ─── Endpoint 1 — publico ────────────────────────────────────────────────────

@router.get("/api/live-pulse/zones")
async def list_zones(
    request: Request,
    limit: int = 50,
    sort: str = "score_desc",
    min_score: float = 0,
):
    db = _db(request)
    limit = max(1, min(int(limit), 100))
    pipeline = [
        {"$sort": {"computed_at": -1}},
        {"$group": {"_id": "$zone_slug", "latest": {"$first": "$$ROOT"}}},
        {"$replaceRoot": {"newRoot": "$latest"}},
        {"$match": {"score": {"$gte": float(min_score)}}},
        {"$sort": {"score": -1 if sort == "score_desc" else 1}},
        {"$limit": limit},
    ]
    try:
        cursor = db.live_pulse_snapshots.aggregate(pipeline)
        rows = []
        async for r in cursor:
            r.pop("_id", None)
            rows.append(r)
    except Exception as exc:
        log.warning(f"[live_pulse.zones] failed: {exc}")
        rows = []
    return {"zones": rows, "count": len(rows)}


# ─── Endpoint 2 — publico ────────────────────────────────────────────────────

@router.get("/api/live-pulse/zone/{slug}/timeline")
async def zone_timeline(slug: str, request: Request, days: int = 90):
    days = max(1, min(int(days), 365))
    cutoff = (_now() - timedelta(days=days)).isoformat()
    db = _db(request)
    rows = []
    try:
        cursor = db.live_pulse_snapshots.find(
            {"zone_slug": slug, "computed_at": {"$gte": cutoff}}, {"_id": 0},
        ).sort("computed_at", 1)
        async for r in cursor:
            rows.append(r)
    except Exception as exc:
        log.warning(f"[live_pulse.timeline] failed: {exc}")
    if not rows:
        return {
            "zone_slug": slug,
            "timeline": [],
            "stats": {"avg": 0, "peak": 0, "low": 0},
        }
    scores = [float(r.get("score") or 0) for r in rows]
    return {
        "zone_slug": slug,
        "timeline": rows,
        "stats": {
            "avg": round(sum(scores) / len(scores), 2),
            "peak": round(max(scores), 2),
            "low": round(min(scores), 2),
        },
    }


# ─── Endpoint 3 — subscribe (T3+) ────────────────────────────────────────────

@router.post("/api/live-pulse/alerts/subscribe")
async def subscribe(request: Request, body: Dict[str, Any]):
    user = await _require_user(request)
    tier = await _user_tier_t(request, user)
    if tier not in ("T3", "T4", "T5"):
        raise HTTPException(status_code=403, detail="Requiere tier T3 o superior")

    zone_slug = (body or {}).get("zone_slug")
    if not zone_slug:
        raise HTTPException(status_code=422, detail="zone_slug es requerido")
    threshold = float((body or {}).get("threshold_score", 80))
    if threshold < 0 or threshold > 100:
        raise HTTPException(status_code=422, detail="threshold_score debe estar en [0,100]")

    db = _db(request)
    sub_id = str(uuid4())
    user_id = getattr(user, "user_id", None) or getattr(user, "id", None)
    now = _now()
    await db.live_pulse_subscriptions.update_one(
        {"user_id": user_id, "zone_slug": zone_slug},
        {"$set": {
            "id": sub_id,
            "user_id": user_id,
            "zone_slug": zone_slug,
            "threshold_score": threshold,
            "active": True,
            "tier_at_subscribe": tier,
            "created_at": now.isoformat(),
        }},
        upsert=True,
    )

    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": user_id, "role": getattr(user, "role", "")},
            action="live_pulse_subscribe",
            entity_type="live_pulse_subscription",
            entity_id=sub_id,
            before=None,
            after={"zone_slug": zone_slug, "threshold_score": threshold},
            request=request,
        )
    except Exception as exc:
        log.warning(f"[live_pulse.subscribe] audit failed: {exc}")

    return {"sub_id": sub_id, "active": True, "zone_slug": zone_slug, "threshold_score": threshold}


# ─── Endpoint 4 — my-subs ────────────────────────────────────────────────────

@router.get("/api/live-pulse/alerts/my-subs")
async def my_subs(request: Request):
    user = await _require_user(request)
    user_id = getattr(user, "user_id", None) or getattr(user, "id", None)
    db = _db(request)
    cursor = db.live_pulse_subscriptions.find(
        {"user_id": user_id, "active": True}, {"_id": 0},
    ).sort("created_at", -1)
    subs = [s async for s in cursor]
    return {"subs": subs, "count": len(subs)}


# ─── Endpoint 5 — unsubscribe ────────────────────────────────────────────────

@router.delete("/api/live-pulse/alerts/{sub_id}")
async def unsubscribe(sub_id: str, request: Request):
    user = await _require_user(request)
    user_id = getattr(user, "user_id", None) or getattr(user, "id", None)
    db = _db(request)
    sub = await db.live_pulse_subscriptions.find_one({"id": sub_id}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="Suscripcion no encontrada")
    if sub.get("user_id") != user_id and getattr(user, "role", "") != "superadmin":
        raise HTTPException(status_code=404, detail="Suscripcion no encontrada")

    await db.live_pulse_subscriptions.update_one(
        {"id": sub_id},
        {"$set": {"active": False, "deactivated_at": _now().isoformat()}},
    )

    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": user_id, "role": getattr(user, "role", "")},
            action="live_pulse_unsubscribe",
            entity_type="live_pulse_subscription",
            entity_id=sub_id,
            before={"active": True},
            after={"active": False},
            request=request,
        )
    except Exception as exc:
        log.warning(f"[live_pulse.unsubscribe] audit failed: {exc}")

    return {"ok": True, "sub_id": sub_id}


# ─── Endpoint 6 — readiness (superadmin) ─────────────────────────────────────

@router.get("/api/superadmin/live-pulse/readiness")
async def readiness(request: Request):
    from permissions import require_superadmin
    await require_superadmin(request)
    return await live_pulse_readiness.compute_readiness(_db(request))


# ─── Endpoint 7 — set-frequency (superadmin) ─────────────────────────────────

@router.post("/api/superadmin/live-pulse/set-frequency")
async def set_frequency(request: Request, body: Dict[str, Any]):
    from permissions import require_superadmin
    user = await require_superadmin(request)
    new_freq = (body or {}).get("frequency")
    if new_freq not in live_pulse_cron.VALID_FREQUENCIES:
        raise HTTPException(
            status_code=422,
            detail=f"frequency debe ser uno de {sorted(live_pulse_cron.VALID_FREQUENCIES)}",
        )

    old_freq = os.environ.get("LIVE_PULSE_FREQUENCY", "weekly")
    os.environ["LIVE_PULSE_FREQUENCY"] = new_freq

    # Reschedule via global scheduler
    try:
        from scheduler_ie import _scheduler as _global_scheduler  # type: ignore
        if _global_scheduler is None:
            raise RuntimeError("scheduler no inicializado")
        live_pulse_cron.reschedule_live_pulse_cron(_global_scheduler, new_freq)
    except Exception as exc:
        log.warning(f"[live_pulse.set_frequency] reschedule failed: {exc}")
        # revert env
        os.environ["LIVE_PULSE_FREQUENCY"] = old_freq
        raise HTTPException(status_code=500, detail=f"Reschedule fallido: {exc}")

    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            _db(request),
            actor={"user_id": getattr(user, "user_id", "system"), "role": "superadmin"},
            action="live_pulse_frequency_changed",
            entity_type="live_pulse_cron",
            entity_id="live_pulse_compute_cron",
            before={"frequency": old_freq},
            after={"frequency": new_freq},
            request=request,
        )
    except Exception as exc:
        log.warning(f"[live_pulse.set_frequency] audit failed: {exc}")

    return {"ok": True, "old": old_freq, "new": new_freq}


@router.get("/api/superadmin/live-pulse/stats")
async def stats(request: Request):
    from permissions import require_superadmin
    await require_superadmin(request)
    db = _db(request)
    now = _now()

    try:
        zones_tracked = await db.live_pulse_snapshots.distinct("zone_slug")
    except Exception:
        zones_tracked = []
    cutoff_24h = (now - timedelta(hours=24)).isoformat()
    try:
        snaps_24h = await db.live_pulse_snapshots.count_documents(
            {"computed_at": {"$gte": cutoff_24h}},
        )
    except Exception:
        snaps_24h = 0
    cutoff_30d = (now - timedelta(days=30))
    try:
        alerts_30d = await db.live_pulse_alerts_sent.count_documents(
            {"$or": [
                {"sent_at_dt": {"$gte": cutoff_30d}},
                {"sent_at": {"$gte": cutoff_30d.isoformat()}},
            ]},
        )
    except Exception:
        alerts_30d = 0

    # Avg score sobre el snapshot mas reciente por zona
    avg_score = 0.0
    try:
        agg = db.live_pulse_snapshots.aggregate([
            {"$sort": {"computed_at": -1}},
            {"$group": {"_id": "$zone_slug", "latest_score": {"$first": "$score"}}},
            {"$group": {"_id": None, "avg": {"$avg": "$latest_score"}}},
        ])
        async for d in agg:
            avg_score = round(float(d.get("avg") or 0.0), 2)
            break
    except Exception as exc:
        log.warning(f"[live_pulse.stats] avg failed: {exc}")

    # Top 5 trending
    top5 = []
    try:
        cursor = db.live_pulse_snapshots.aggregate([
            {"$sort": {"computed_at": -1}},
            {"$group": {"_id": "$zone_slug", "latest": {"$first": "$$ROOT"}}},
            {"$replaceRoot": {"newRoot": "$latest"}},
            {"$sort": {"score": -1}},
            {"$limit": 5},
        ])
        async for r in cursor:
            r.pop("_id", None)
            top5.append(r)
    except Exception as exc:
        log.warning(f"[live_pulse.stats] top5 failed: {exc}")

    return {
        "zones_tracked": len(zones_tracked),
        "snapshots_24h": snaps_24h,
        "alerts_sent_30d": alerts_30d,
        "avg_score": avg_score,
        "top_5_trending": top5,
        "current_frequency": os.environ.get("LIVE_PULSE_FREQUENCY", "weekly"),
    }


# ─── Endpoint 9 (W5.5 P2) — score-distribution (superadmin) ──────────────────

@router.get("/api/superadmin/live-pulse/score-distribution")
async def score_distribution(request: Request):
    """Aggregate latest snapshot por zona y agrupa por bucket."""
    from permissions import require_superadmin
    await require_superadmin(request)
    db = _db(request)
    dist = {"cold": 0, "warm": 0, "hot": 0, "surging": 0, "total": 0}
    try:
        cursor = db.live_pulse_snapshots.aggregate([
            {"$sort": {"computed_at": -1}},
            {"$group": {"_id": "$zone_slug", "latest": {"$first": "$$ROOT"}}},
            {"$replaceRoot": {"newRoot": "$latest"}},
        ])
        async for r in cursor:
            score = float(r.get("score") or 0.0)
            bucket = r.get("bucket")
            if not bucket:
                # fallback derivar del score
                if score <= 40:
                    bucket = "cold"
                elif score <= 65:
                    bucket = "warm"
                elif score <= 85:
                    bucket = "hot"
                else:
                    bucket = "surging"
            if bucket in dist:
                dist[bucket] += 1
            dist["total"] += 1
    except Exception as exc:
        log.warning(f"[live_pulse.score_distribution] failed: {exc}")
    return dist

# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("live_pulse_alerts", plan_tier="pro",        monthly_price_mxn=199, category="intelligence", name="Live Pulse Alerts")
