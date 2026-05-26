"""W7.AS.3.H · Confidence Score REST routes.

2 endpoints:
  GET /api/conversation/{conversation_id}/confidence-history   (owner asesor / superadmin)
       → histograma de confidence por turno assistant de la conversación.
  GET /api/superadmin/confidence/stats                          (superadmin)
       → agregados: avg per asesor · top low-confidence convs · trend 7d/30d.

Stub-aware: si no hay mensajes con confidence persistido → listas vacías + nota.
Owner gate: el asesor dueño del thread o un superadmin. Reusa get_current_user.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.routes_conversation_confidence")

router = APIRouter(prefix="/api/conversation", tags=["conversation-confidence"])
sa_router = APIRouter(prefix="/api/superadmin/confidence", tags=["conversation-confidence-admin"])


# ─── auth helpers (mismo patrón que routes/conversation.py) ──────────────────

async def _optional_user(request: Request):
    try:
        from server import get_current_user
        return await get_current_user(request)
    except Exception:
        return None


async def _require_user(request: Request):
    user = await _optional_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


async def _require_superadmin(request: Request):
    user = await _require_user(request)
    if getattr(user, "role", "") != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


def _tenant_of(user) -> str:
    return getattr(user, "tenant_id", None) or getattr(user, "user_id", None) or "default"


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── owner endpoint ──────────────────────────────────────────────────────────

@router.get("/{conversation_id}/confidence-history")
async def confidence_history(conversation_id: str, request: Request):
    """Histograma de confidence por turno assistant. Owner asesor o superadmin."""
    user = await _require_user(request)
    db = request.app.state.db

    thread = await db.conversation_threads.find_one({"_id": conversation_id})
    if not thread:
        raise HTTPException(404, "Conversación no encontrada")

    is_sa = getattr(user, "role", "") == "superadmin"
    if not is_sa:
        # owner gate: mismo tenant + (sin asesor asignado o el asesor es quien pide)
        if thread.get("tenant_id") != _tenant_of(user):
            raise HTTPException(403, "Sin permiso para esta conversación")
        asesor = thread.get("asesor_id")
        if asesor and asesor != getattr(user, "user_id", None):
            raise HTTPException(403, "Solo el asesor owner puede ver el histórico")

    cursor = db.conversation_messages.find(
        {"conversation_id": conversation_id, "role": "assistant",
         "confidence": {"$exists": True}},
        {"_id": 0, "confidence": 1, "confidence_reason": 1, "created_at": 1},
    ).sort("created_at", 1)

    history: List[Dict[str, Any]] = []
    async for m in cursor:
        ts = m.get("created_at")
        history.append({
            "turn": len(history) + 1,
            "confidence": m.get("confidence"),
            "reason": m.get("confidence_reason") or "",
            "created_at": ts.isoformat() if hasattr(ts, "isoformat") else ts,
        })

    vals = [h["confidence"] for h in history if isinstance(h["confidence"], (int, float))]
    avg = round(sum(vals) / len(vals), 1) if vals else None
    low = sum(1 for v in vals if v < 50)

    return {
        "conversation_id": conversation_id,
        "count": len(history),
        "avg_confidence": avg,
        "low_confidence_turns": low,
        "last_confidence": thread.get("ultimo_confidence_score"),
        "history": history,
    }


# ─── superadmin stats endpoint ───────────────────────────────────────────────

@sa_router.get("/stats")
async def confidence_stats(request: Request):
    """Agregados de confidence: avg per asesor · top low-confidence convs · trend."""
    await _require_superadmin(request)
    db = request.app.state.db

    msgs = db.conversation_messages
    threads = db.conversation_threads

    # avg per conversación (para mapear a asesor) + trend windows
    now = _now()
    d7 = now - timedelta(days=7)
    d30 = now - timedelta(days=30)

    async def _avg_since(since: Optional[datetime]) -> Optional[float]:
        q: Dict[str, Any] = {"role": "assistant", "confidence": {"$exists": True}}
        if since is not None:
            q["created_at"] = {"$gte": since}
        total, n = 0.0, 0
        async for m in msgs.find(q, {"_id": 0, "confidence": 1}):
            v = m.get("confidence")
            if isinstance(v, (int, float)):
                total += v
                n += 1
        return round(total / n, 1) if n else None

    trend = {
        "7d": await _avg_since(d7),
        "30d": await _avg_since(d30),
        "all": await _avg_since(None),
    }

    # avg per asesor (usa ultimo_confidence_score denormado en el thread)
    per_asesor: Dict[str, Dict[str, float]] = {}
    low_convs: List[Dict[str, Any]] = []
    async for t in threads.find(
        {"ultimo_confidence_score": {"$exists": True}},
        {"_id": 1, "asesor_id": 1, "ultimo_confidence_score": 1, "lead_id": 1, "tenant_id": 1},
    ):
        score = t.get("ultimo_confidence_score")
        if not isinstance(score, (int, float)):
            continue
        aid = t.get("asesor_id") or "unassigned"
        agg = per_asesor.setdefault(aid, {"sum": 0.0, "n": 0})
        agg["sum"] += score
        agg["n"] += 1
        if score < 50:
            low_convs.append({
                "conversation_id": t.get("_id"),
                "asesor_id": aid,
                "lead_id": t.get("lead_id"),
                "confidence": score,
            })

    avg_per_asesor = [
        {"asesor_id": aid, "avg_confidence": round(v["sum"] / v["n"], 1), "conversations": v["n"]}
        for aid, v in per_asesor.items() if v["n"]
    ]
    avg_per_asesor.sort(key=lambda x: x["avg_confidence"])
    low_convs.sort(key=lambda x: x["confidence"])

    return {
        "trend": trend,
        "avg_per_asesor": avg_per_asesor,
        "top_low_confidence": low_convs[:20],
        "generated_at": now.isoformat(),
    }


# ─── indexes (wired desde server.py startup) ─────────────────────────────────

async def ensure_indexes(db) -> None:
    """W7.AS.3.H · índice confidence sobre conversation_messages + usage counter.
    Idempotente / fail-soft."""
    try:
        # sparse · solo mensajes assistant scoreados llevan confidence
        await db.conversation_messages.create_index(
            [("confidence", 1)], background=True, sparse=True)
        # drift_detector filtra por (tenant_id, role, created_at, confidence)
        await db.conversation_messages.create_index(
            [("tenant_id", 1), ("role", 1), ("created_at", -1)], background=True)
        await db.conversation_threads.create_index(
            [("ultimo_confidence_score", 1)], background=True, sparse=True)
        await db.conversation_confidence_usage.create_index("day", background=True)
        # TTL · los counters diarios (1 doc por tenant·día) se auto-borran a los 7d
        await db.conversation_confidence_usage.create_index(
            "created_at", expireAfterSeconds=7 * 24 * 3600, background=True)
    except Exception as exc:
        log.warning(f"[conversation_confidence] ensure_indexes failed: {exc}")
