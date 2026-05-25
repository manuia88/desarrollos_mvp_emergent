"""W7.AS.3.E (R2) — Conversation Drift Detector (ML loop).

Módulo PURO importable por conversation_engine (opcional · FAIL-OPEN). NO toca
server/engine/asistente/UI. Terminal D wirea register_cron() en server.py.

Reusa el patrón de drift de W5.15 FSD (drift_detector.py): compara baseline
(ventana larga) vs current (ventana corta) y alerta si el cambio relativo
supera un umbral.

Métricas del agente conversacional:
  - handoff_rate  = threads en handoff / total threads
  - avg_sentiment = media de sentiment (pos=+1, neu=0, neg=-1)
  - avg_confidence= media de confidence de respuestas del agente

Baseline = últimos 30d · Current = últimos 7d. Drift si abs(delta relativo)
de cualquier métrica > 15%. Alerta vía notifications_engine con dedup 1/7d.

Funciones públicas:
  - compute_drift(db, tenant_id) -> dict      (FAIL-OPEN → {"drift": 0})
  - alert_if_drift(db, tenant_id) -> dict
  - register_cron(scheduler, db=None) -> None  (DAILY 04:45 UTC, max_instances=1)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.conversation_drift")

DRIFT_THRESHOLD = 0.15          # 15% cambio relativo
COOLDOWN_DAYS = 7               # dedup de alertas
BASELINE_DAYS = 30
CURRENT_DAYS = 7
_EPS = 1e-6


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _sentiment_num(s: Optional[str]) -> float:
    return {"positive": 1.0, "neutral": 0.0, "negative": -1.0}.get(s or "neutral", 0.0)


async def _window_metrics(db, tenant_id: str, days: int) -> Dict[str, float]:
    """Métricas del agente para el tenant en la ventana de `days` días."""
    since = _now() - timedelta(days=days)
    q = {"tenant_id": tenant_id, "created_at": {"$gte": since}}

    total = await db.conversation_threads.count_documents(q)
    if total == 0:
        return {"handoff_rate": 0.0, "avg_sentiment": 0.0,
                "avg_confidence": 0.0, "n": 0}

    handoff = await db.conversation_threads.count_documents({**q, "status": "handoff"})

    # avg_sentiment desde los threads
    cur = db.conversation_threads.find(q, {"_id": 0, "sentiment": 1})
    s_sum, s_n = 0.0, 0
    async for d in cur:
        s_sum += _sentiment_num(d.get("sentiment"))
        s_n += 1
    avg_sentiment = (s_sum / s_n) if s_n else 0.0

    # avg_confidence desde mensajes del agente con confidence
    c_sum, c_n = 0.0, 0
    try:
        mcur = db.conversation_messages.find(
            {"tenant_id": tenant_id, "role": "assistant",
             "created_at": {"$gte": since}, "confidence": {"$exists": True}},
            {"_id": 0, "confidence": 1},
        )
        async for m in mcur:
            v = m.get("confidence")
            if isinstance(v, (int, float)):
                c_sum += float(v)
                c_n += 1
    except Exception:
        pass
    avg_confidence = (c_sum / c_n) if c_n else 0.0

    return {
        "handoff_rate": handoff / total,
        "avg_sentiment": avg_sentiment,
        "avg_confidence": avg_confidence,
        "n": total,
    }


def _rel_delta(current: float, baseline: float) -> float:
    """Cambio relativo respecto al baseline (robusto a baseline≈0)."""
    denom = abs(baseline) if abs(baseline) > _EPS else 1.0
    return (current - baseline) / denom


async def compute_drift(db, tenant_id: str) -> Dict[str, Any]:
    """Compara baseline (30d) vs current (7d). FAIL-OPEN → {"drift": 0}.

    Returns:
        {
          "drift": 0|1,                # 1 si alguna métrica supera el umbral
          "breached": ["handoff_rate", ...],
          "baseline": {...}, "current": {...}, "deltas": {...},
          "tenant_id": ...,
        }
    """
    try:
        baseline = await _window_metrics(db, tenant_id, BASELINE_DAYS)
        current = await _window_metrics(db, tenant_id, CURRENT_DAYS)

        metrics = ("handoff_rate", "avg_sentiment", "avg_confidence")
        deltas: Dict[str, float] = {}
        breached = []
        for m in metrics:
            d = _rel_delta(current.get(m, 0.0), baseline.get(m, 0.0))
            deltas[m] = round(d, 4)
            if abs(d) > DRIFT_THRESHOLD:
                breached.append(m)

        return {
            "drift": 1 if breached else 0,
            "breached": breached,
            "baseline": baseline,
            "current": current,
            "deltas": deltas,
            "tenant_id": tenant_id,
        }
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[drift] compute_drift fail-open: {exc}")
        return {"drift": 0, "breached": [], "tenant_id": tenant_id}


async def _recent_alert(db, tenant_id: str) -> bool:
    """True si ya hubo alerta en los últimos COOLDOWN_DAYS (dedup)."""
    try:
        cutoff = _now() - timedelta(days=COOLDOWN_DAYS)
        doc = await db.conversation_drift_alerts.find_one(
            {"tenant_id": tenant_id, "alerted_at": {"$gte": cutoff}}
        )
        return doc is not None
    except Exception:
        return False


async def alert_if_drift(db, tenant_id: str) -> Dict[str, Any]:
    """Computa drift y, si hay, alerta (dedup 1/7d). FAIL-OPEN."""
    result = await compute_drift(db, tenant_id)
    if not result.get("drift"):
        return {"alerted": False, "drift": 0, "tenant_id": tenant_id}

    try:
        if await _recent_alert(db, tenant_id):
            return {"alerted": False, "drift": result["drift"],
                    "throttled": True, "tenant_id": tenant_id}

        breached = ", ".join(result.get("breached") or [])
        try:
            from notifications_engine import emit_notification
            await emit_notification(
                db,
                user_id="admin@desarrollosmx.com",
                tenant_id=tenant_id,
                type="generic",
                severity="high",
                title="Drift detectado en Conversation Agent",
                body=f"Tenant {tenant_id}: cambio >15% en {breached}.",
                payload={"deltas": result.get("deltas")},
            )
        except Exception as exc:
            log.debug(f"[drift] notify skip: {exc}")

        try:
            await db.conversation_drift_alerts.insert_one({
                "tenant_id": tenant_id, "alerted_at": _now(),
                "breached": result.get("breached"), "deltas": result.get("deltas"),
            })
        except Exception as exc:
            log.debug(f"[drift] persist alert skip: {exc}")

        return {"alerted": True, "drift": result["drift"],
                "breached": result.get("breached"), "tenant_id": tenant_id}
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[drift] alert_if_drift fail-open: {exc}")
        return {"alerted": False, "drift": 0, "tenant_id": tenant_id}


async def _run_all_tenants(db=None) -> Dict[str, Any]:
    """Job del cron: chequea drift de todos los tenants. FAIL-OPEN."""
    if db is None:
        log.warning("[drift] cron sin db — skip")
        return {"skipped": "no_db"}
    checked, alerted = 0, 0
    try:
        tenants = await db.conversation_threads.distinct("tenant_id")
    except Exception as exc:
        log.warning(f"[drift] distinct tenants failed: {exc}")
        return {"skipped": "error"}
    for tid in tenants or []:
        if not tid:
            continue
        try:
            r = await alert_if_drift(db, tid)
            checked += 1
            if r.get("alerted"):
                alerted += 1
        except Exception as exc:
            log.warning(f"[drift] tenant {tid} failed: {exc}")
    return {"tenants_checked": checked, "alerts": alerted}


def register_cron(scheduler, db=None) -> None:
    """Registra el cron DAILY 04:45 UTC (max_instances=1). FAIL-OPEN."""
    try:
        scheduler.add_job(
            _run_all_tenants,
            "cron",
            hour=4, minute=45, timezone="UTC",
            args=[db],
            id="conversation_drift_daily",
            replace_existing=True,
            max_instances=1,
        )
        log.info("[drift] job registered @ 04:45 UTC daily")
    except Exception as exc:
        log.warning(f"[drift] register_cron failed: {exc}")
