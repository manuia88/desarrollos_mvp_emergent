"""W7.AS.3.I (R3) · Conversation Drift — superadmin REST routes.

Wirea el módulo PURO conversation_drift_detector (R2) que existía orphan (sin
routes ni UI). NO modifica la lógica del detector · solo lo expone.

4 endpoints (todos require_superadmin · rate-limit 30/min por usuario):
  GET  /api/superadmin/conversation-drift/compute?tenant_id=
       → {handoff_rate_delta, sentiment_delta, confidence_delta, baseline, current}
  GET  /api/superadmin/conversation-drift/alerts/history?tenant_id=&days=&page=&page_size=
       → últimos N días de alerts disparados · paginado (cap 100/página)
  POST /api/superadmin/conversation-drift/alerts/{alert_id}/ack
       → marca alert reconocido (idempotente · audit trail · NO suprime futuros)
  GET  /api/superadmin/conversation-drift/baseline/recompute?tenant_id=
       → fuerza recálculo (respeta dedup 1/7d · cron lo hace daily 04:45 UTC)

Pure module — Terminal G incluye este router en server.py durante su merge.
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request

from conversation_drift_detector import compute_drift, alert_if_drift

log = logging.getLogger("dmx.routes_conversation_drift")

router = APIRouter(prefix="/api/superadmin/conversation-drift", tags=["conversation-drift"])

ALERTS_COLL = "conversation_drift_alerts"
BASELINES_COLL = "conversation_drift_baselines"
PAGE_CAP = 100

# ─── Rate limit · 30 req/min por usuario (FAIL-OPEN si key ausente) ────────────
RATE_LIMIT = 30
RATE_WINDOW_S = 60
_buckets: Dict[str, List[float]] = defaultdict(list)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _check_rate(key: str, limit: int = RATE_LIMIT, window_s: int = RATE_WINDOW_S) -> bool:
    """Sliding-window limiter. Returns False when over the cap."""
    if not key:
        return True  # fail-open
    now = time.monotonic()
    _buckets[key] = [t for t in _buckets[key] if now - t < window_s]
    if len(_buckets[key]) >= limit:
        return False
    _buckets[key].append(now)
    return True


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if getattr(user, "role", "") != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    if not _check_rate(getattr(user, "user_id", None) or "sa"):
        raise HTTPException(429, "Demasiadas solicitudes, intenta en un momento")
    return user


def _isodate(v: Any) -> Optional[str]:
    if isinstance(v, datetime):
        return v.isoformat()
    return v if isinstance(v, str) else None


# ─── Core helpers (testable · operan sobre db directo) ────────────────────────
async def compute_drift_payload(db, tenant_id: str) -> Dict[str, Any]:
    """Adapta compute_drift() del detector a la shape que consume la UI.

    FAIL-OPEN: si el detector no devuelve baseline/current (insufficient data o
    excepción), retorna deltas 0 + reason=insufficient_baseline.
    """
    result = await compute_drift(db, tenant_id)
    deltas = result.get("deltas") or {}
    baseline = result.get("baseline") or {}
    current = result.get("current") or {}
    # <30d de data ⇒ sin baseline real (el detector devuelve n=0 con DB vacía)
    insufficient = int(baseline.get("n", 0) or 0) == 0
    return {
        "tenant_id": tenant_id,
        "handoff_rate_delta": deltas.get("handoff_rate", 0.0),
        "sentiment_delta": deltas.get("avg_sentiment", 0.0),
        "confidence_delta": deltas.get("avg_confidence", 0.0),
        "baseline": baseline,
        "current": current,
        "drift": int(result.get("drift", 0) or 0),
        "breached": result.get("breached") or [],
        "insufficient_baseline": insufficient,
        "reason": "insufficient_baseline" if insufficient else None,
    }


async def alerts_history(db, tenant_id: Optional[str], days: int,
                         page: int, page_size: int) -> Dict[str, Any]:
    """Alerts disparados en los últimos `days` días · paginado (cap PAGE_CAP)."""
    page = max(1, int(page or 1))
    page_size = max(1, min(PAGE_CAP, int(page_size or PAGE_CAP)))
    q: Dict[str, Any] = {"alerted_at": {"$gte": _now() - timedelta(days=days)}}
    if tenant_id:
        q["tenant_id"] = tenant_id
    try:
        total = await db[ALERTS_COLL].count_documents(q)
        cur = (db[ALERTS_COLL].find(q)
               .sort("alerted_at", -1)
               .skip((page - 1) * page_size)
               .limit(page_size))
        docs = await cur.to_list(length=page_size)
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[drift] alerts_history fail-open: {exc}")
        return {"count": 0, "total": 0, "page": page, "page_size": page_size, "alerts": []}

    alerts = []
    for d in docs:
        acked = bool(d.get("acknowledged"))
        alerts.append({
            "alert_id": str(d.get("_id", "")),
            "tenant_id": d.get("tenant_id"),
            "alerted_at": _isodate(d.get("alerted_at")),
            "breached": d.get("breached") or [],
            "deltas": d.get("deltas") or {},
            "status": "ack" if acked else "pending",
            "acknowledged": acked,
            "acknowledged_at": _isodate(d.get("acknowledged_at")),
        })
    return {"count": len(alerts), "total": total, "page": page,
            "page_size": page_size, "alerts": alerts}


async def ack_alert(db, alert_id: str, user_id: str = "sa") -> Dict[str, Any]:
    """Marca un alert como reconocido. Idempotente (set repetido = no-op).

    Solo acción visual: NO suprime alertas futuras (el dedup 1/7d es aparte).
    """
    # _id puede ser ObjectId (Mongo real) o string (tests / seeds)
    candidates: List[Any] = [alert_id]
    try:
        from bson import ObjectId
        if ObjectId.is_valid(alert_id):
            candidates.insert(0, ObjectId(alert_id))
    except Exception:
        pass

    doc = None
    for cid in candidates:
        try:
            doc = await db[ALERTS_COLL].find_one({"_id": cid})
        except Exception:
            doc = None
        if doc:
            break
    if not doc:
        raise HTTPException(404, "Alert no encontrado")

    already = bool(doc.get("acknowledged"))
    if not already:
        try:
            await db[ALERTS_COLL].update_one(
                {"_id": doc["_id"]},
                {"$set": {"acknowledged": True, "acknowledged_at": _now(),
                          "acknowledged_by": user_id}},
            )
        except Exception as exc:
            log.warning(f"[drift] ack update fail: {exc}")
            raise HTTPException(500, "No se pudo reconocer el alert")
        # audit trail (FAIL-OPEN)
        try:
            await db.audit_log.insert_one({
                "action": "conversation_drift_alert_ack",
                "actor": {"user_id": user_id, "role": "superadmin"},
                "entity_type": "conversation_drift_alert",
                "entity_id": str(doc["_id"]),
                "tenant_id": doc.get("tenant_id"),
                "ts": _now().isoformat(),
            })
        except Exception as exc:
            log.debug(f"[drift] ack audit skip: {exc}")

    return {"alert_id": str(doc["_id"]), "acknowledged": True, "already": already}


async def recompute_baseline(db, tenant_id: str) -> Dict[str, Any]:
    """Fuerza recálculo: re-evalúa drift (respeta dedup 1/7d vía alert_if_drift)
    y persiste un snapshot del baseline. FAIL-OPEN."""
    payload = await compute_drift_payload(db, tenant_id)
    alert_res = await alert_if_drift(db, tenant_id)  # internamente respeta cooldown 7d
    try:
        await db[BASELINES_COLL].insert_one({
            "tenant_id": tenant_id,
            "computed_at": _now(),
            "baseline": payload.get("baseline"),
            "current": payload.get("current"),
            "trigger": "manual_recompute",
        })
    except Exception as exc:
        log.debug(f"[drift] baseline snapshot skip: {exc}")
    return {
        "tenant_id": tenant_id,
        "recomputed": True,
        "drift": payload.get("drift", 0),
        "alerted": bool(alert_res.get("alerted")),
        "throttled": bool(alert_res.get("throttled")),
        "baseline": payload.get("baseline"),
        "current": payload.get("current"),
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────
@router.get("/compute")
async def compute_endpoint(request: Request, tenant_id: str = Query(..., min_length=1)):
    await _require_superadmin(request)
    db = request.app.state.db
    return await compute_drift_payload(db, tenant_id)


@router.get("/alerts/history")
async def alerts_history_endpoint(
    request: Request,
    tenant_id: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=365),
    page: int = Query(1, ge=1),
    page_size: int = Query(PAGE_CAP, ge=1, le=PAGE_CAP),
):
    await _require_superadmin(request)
    db = request.app.state.db
    return await alerts_history(db, tenant_id, days=days, page=page, page_size=page_size)


@router.post("/alerts/{alert_id}/ack")
async def ack_endpoint(request: Request, alert_id: str):
    user = await _require_superadmin(request)
    db = request.app.state.db
    return await ack_alert(db, alert_id, user_id=getattr(user, "user_id", None) or "sa")


@router.get("/baseline/recompute")
async def recompute_endpoint(request: Request, tenant_id: str = Query(..., min_length=1)):
    await _require_superadmin(request)
    db = request.app.state.db
    return await recompute_baseline(db, tenant_id)
