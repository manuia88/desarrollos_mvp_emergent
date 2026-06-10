"""W5.5 Parte 1 — Live Pulse Readiness Engine.

Evalua si la plataforma tiene datos suficientes para subir la frecuencia
del cron de live_pulse. Calcula un score 0-100 ponderado por cobertura
real de leads, behavioral, atlax y disponibilidad de Apify real.

Estados (buckets del score):
    bootstrap (0-30) · growing (31-60) · ready (61-85) · optimal (86-100)

compute_readiness(db) -> dict con score, state, metrics, eta_hourly_days,
recommendation y history_90d.

record_readiness_snapshot(db) -> persiste snapshot en
live_pulse_readiness_history (TTL 365d) y dispara check_readiness_crossing.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List
from uuid import uuid4

log = logging.getLogger("dmx.live_pulse_readiness")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


STATE_RECOMMENDATIONS = {
    "bootstrap": "Mantener cron weekly · datos thin · re-evaluar en 30d",
    "growing":   "Considerar biweekly en los proximos 60d",
    "ready":     "Cambiar a daily o hourly · datos suficientes",
    "optimal":   "Activar hourly o */15min · datos optimos",
}


def _state_for(score: float) -> str:
    if score <= 30:
        return "bootstrap"
    if score <= 60:
        return "growing"
    if score <= 85:
        return "ready"
    return "optimal"


async def _count_leads_coverage(db, cutoff_iso: str) -> Dict[str, Any]:
    pipeline = [
        {"$match": {"created_at": {"$gte": cutoff_iso}, "zone_slug": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$zone_slug", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gte": 100}}},
    ]
    try:
        zones = await db.leads.aggregate(pipeline).to_list(None)
    except Exception as exc:
        log.warning(f"[readiness] leads aggregate failed: {exc}")
        zones = []
    n = len(zones)
    return {
        "value": round(min(n / 3.0, 1.0) * 100.0, 2),
        "zones_qualifying": n,
        "threshold_zones": 3,
        "threshold_per_zone": 100,
        "window_days": 30,
    }


async def _count_behavioral_coverage(db, cutoff_iso: str) -> Dict[str, Any]:
    # P0.9 · reconexión: la data real vive en behavioral_events (timestamp Date + page + metadata libre),
    # no en behavioral_tracking_events. La zona = metadata etiquetada o derivada del path /colonia/<slug>.
    try:
        cutoff_dt = datetime.fromisoformat(cutoff_iso.replace("Z", "+00:00"))
    except Exception:
        cutoff_dt = _now() - timedelta(days=7)
    zone_expr = {"$ifNull": ["$metadata.zone_slug", {"$ifNull": ["$metadata.colonia_slug",
        {"$let": {
            "vars": {"m": {"$regexFind": {"input": {"$ifNull": ["$page", ""]},
                                          "regex": "/colonia/([a-z0-9-]+)"}}},
            "in": {"$arrayElemAt": [{"$ifNull": ["$$m.captures", []]}, 0]},
        }}]}]}
    pipeline = [
        {"$match": {"timestamp": {"$gte": cutoff_dt}}},
        {"$group": {"_id": zone_expr, "count": {"$sum": 1}}},
        {"$match": {"_id": {"$nin": [None, ""]}, "count": {"$gte": 500}}},
    ]
    try:
        zones = await db.behavioral_events.aggregate(pipeline).to_list(None)
    except Exception as exc:
        log.warning(f"[readiness] behavioral aggregate failed: {exc}")
        zones = []
    n = len(zones)
    return {
        "value": round(min(n / 5.0, 1.0) * 100.0, 2),
        "zones_qualifying": n,
        "threshold_zones": 5,
        "threshold_per_zone": 500,
        "window_days": 7,
    }


async def _count_atlax_coverage(db, cutoff_iso: str) -> Dict[str, Any]:
    pipeline = [
        {"$match": {"created_at": {"$gte": cutoff_iso}}},
        {"$group": {
            "_id": {"$ifNull": ["$metadata.zone_slug", "$zone_slug"]},
            "count": {"$sum": 1},
        }},
        {"$match": {"_id": {"$nin": [None, ""]}, "count": {"$gte": 50}}},
    ]
    try:
        zones = await db.atlax_threads.aggregate(pipeline).to_list(None)
    except Exception as exc:
        log.warning(f"[readiness] atlax aggregate failed: {exc}")
        zones = []
    n = len(zones)
    return {
        "value": round(min(n / 3.0, 1.0) * 100.0, 2),
        "zones_qualifying": n,
        "threshold_zones": 3,
        "threshold_per_zone": 50,
        "window_days": 7,
    }


def _apify_real_pct() -> float:
    return 100.0 if os.environ.get("APIFY_TRENDS_REAL", "false").lower() == "true" else 0.0


def _estimate_eta_hourly(history: List[Dict[str, Any]], current_score: float) -> Any:
    """Extrapolacion lineal: slope per day sobre los ultimos snapshots. None si <7 puntos
    o slope no positivo. ETA = (85 - current_score) / slope_per_day en dias.
    """
    if len(history) < 7:
        return None
    # history ordenado asc por recorded_at
    try:
        # eje X: dias desde el primer snapshot
        first_ts = history[0].get("recorded_at")
        if isinstance(first_ts, str):
            first_dt = datetime.fromisoformat(first_ts.replace("Z", "+00:00"))
        elif isinstance(first_ts, datetime):
            first_dt = first_ts
        else:
            return None
        xs: List[float] = []
        ys: List[float] = []
        for h in history:
            ts = h.get("recorded_at")
            if isinstance(ts, str):
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            elif isinstance(ts, datetime):
                dt = ts
            else:
                continue
            xs.append((dt - first_dt).total_seconds() / 86400.0)
            ys.append(float(h.get("score") or 0.0))
        n = len(xs)
        if n < 2:
            return None
        # OLS slope (sin numpy)
        mean_x = sum(xs) / n
        mean_y = sum(ys) / n
        num = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(n))
        den = sum((xs[i] - mean_x) ** 2 for i in range(n))
        if den <= 0:
            return None
        slope_per_day = num / den
        if slope_per_day <= 0:
            return None
        remaining = 85.0 - current_score
        if remaining <= 0:
            return 0
        return int(round(remaining / slope_per_day))
    except Exception as exc:
        log.warning(f"[readiness] eta extrapolation failed: {exc}")
        return None


async def compute_readiness(db) -> Dict[str, Any]:
    """Score 0-100 + state + recommendation + ETA hourly."""
    now = _now()
    cutoff_30d = (now - timedelta(days=30)).isoformat()
    cutoff_7d = (now - timedelta(days=7)).isoformat()
    cutoff_90d = (now - timedelta(days=90)).isoformat()

    leads_cov = await _count_leads_coverage(db, cutoff_30d)
    beh_cov = await _count_behavioral_coverage(db, cutoff_7d)
    atlax_cov = await _count_atlax_coverage(db, cutoff_7d)
    apify_real = _apify_real_pct()

    score = (
        leads_cov["value"] * 0.40
        + beh_cov["value"] * 0.30
        + atlax_cov["value"] * 0.20
        + apify_real * 0.10
    )
    score = round(score, 2)
    state = _state_for(score)
    recommendation = STATE_RECOMMENDATIONS[state]

    # Historial 90d para extrapolar
    history: List[Dict[str, Any]] = []
    try:
        cursor = db.live_pulse_readiness_history.find(
            {"recorded_at": {"$gte": cutoff_90d}}, {"_id": 0},
        ).sort("recorded_at", 1)
        async for h in cursor:
            history.append(h)
    except Exception as exc:
        log.warning(f"[readiness] history fetch failed: {exc}")

    eta_hourly_days = _estimate_eta_hourly(history, score)

    return {
        "score": score,
        "state": state,
        "recommendation": recommendation,
        "metrics": {
            "leads_coverage": leads_cov,
            "behavioral_coverage": beh_cov,
            "atlax_coverage": atlax_cov,
            "apify_real": {"value": apify_real, "enabled": apify_real > 0},
        },
        "eta_hourly_days": eta_hourly_days,
        "history_90d": [
            {"recorded_at": h.get("recorded_at"), "score": h.get("score"), "state": h.get("state")}
            for h in history
        ],
        "computed_at": _iso(now),
    }


async def record_readiness_snapshot(db) -> Dict[str, Any]:
    """Persiste snapshot, dispara check_readiness_crossing y devuelve doc."""
    snap = await compute_readiness(db)
    now = _now()
    doc = {
        "id": str(uuid4()),
        "score": snap["score"],
        "state": snap["state"],
        "metrics": snap["metrics"],
        "recorded_at": _iso(now),
        "recorded_at_dt": now,  # para TTL 365d
    }
    try:
        await db.live_pulse_readiness_history.insert_one(dict(doc))
    except Exception as exc:
        log.warning(f"[readiness] insert snapshot failed: {exc}")

    # Hook crossing
    try:
        await check_readiness_crossing(db)
    except Exception as exc:
        log.warning(f"[readiness] check_crossing failed: {exc}")

    log.info(f"[readiness] snapshot recorded score={snap['score']} state={snap['state']}")
    return snap


async def check_readiness_crossing(db) -> int:
    """Si prev_state in (bootstrap, growing) y curr_state in (ready, optimal),
    notifica a todos los superadmin via notifications_engine. Devuelve count.
    """
    try:
        cursor = db.live_pulse_readiness_history.find({}, {"_id": 0}).sort("recorded_at", -1).limit(2)
        history = [h async for h in cursor]
    except Exception:
        return 0
    if len(history) < 2:
        return 0
    curr_state = history[0].get("state")
    prev_state = history[1].get("state")
    if prev_state in ("bootstrap", "growing") and curr_state in ("ready", "optimal"):
        try:
            import notifications_engine
            sa_cursor = db.users.find({"role": "superadmin"}, {"_id": 0, "user_id": 1, "id": 1})
            sent = 0
            async for sa in sa_cursor:
                uid = sa.get("user_id") or sa.get("id")
                if not uid:
                    continue
                await notifications_engine.emit_notification(
                    db,
                    user_id=uid,
                    type="readiness_ready",
                    severity="normal",
                    title="Live Pulse READY",
                    body=f"Live Pulse alcanzo score {history[0].get('score')} ({curr_state}). "
                         "Considera cambiar la frecuencia del cron a daily/hourly.",
                    payload={
                        "score": history[0].get("score"),
                        "prev_state": prev_state,
                        "curr_state": curr_state,
                    },
                    action_url="/superadmin/live-pulse",
                )
                sent += 1
            log.info(f"[readiness] crossing alert dispatched to {sent} superadmins")
            return sent
        except Exception as exc:
            log.warning(f"[readiness] crossing notify failed: {exc}")
            return 0
    return 0
