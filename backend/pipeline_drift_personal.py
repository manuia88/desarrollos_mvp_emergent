"""P2.T2 — pipeline_drift_personal · drift del pipeline PERSONAL de un asesor.

Módulo PURO importable por el Analyst agent (agent_workforce/analyst.py). NO toca
server/asistente/routes/command_center. FAIL-OPEN → {"drift": 0, ...deltas 0}.

Reusa el patrón de drift de W7.AS.3 conversation_drift_detector (que a su vez reusa
W5.15 FSD drift_detector): compara una ventana BASELINE (30d) contra una ventana
CURRENT (7d) y marca drift si el cambio relativo de alguna métrica supera el umbral.

Métricas del pipeline personal del asesor (owner_id = user_id):
  · response_rate  = leads contactados (timeline) / leads creados en la ventana.
  · conversion     = búsquedas movidas a 'ganada' / leads creados en la ventana.
  · handoff        = búsquedas movidas a 'perdida' (análogo a escalación/abandono).

API:
  compute_pipeline_drift(db, user_id, tenant_id)
    -> {"drift": 0|1, "breached": [...],
        "handoff_delta", "conversion_delta", "response_rate_delta",
        "baseline": {...}, "current": {...}, "user_id", "tenant_id"}
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict

log = logging.getLogger("dmx.pipeline_drift_personal")

DRIFT_THRESHOLD = 0.15      # 15% cambio relativo (mismo umbral que conversation_drift)
BASELINE_DAYS = 30
CURRENT_DAYS = 7
_EPS = 1e-6


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _rel_delta(current: float, baseline: float) -> float:
    """Cambio relativo respecto al baseline (robusto a baseline≈0)."""
    denom = abs(baseline) if abs(baseline) > _EPS else 1.0
    return (current - baseline) / denom


async def _window_metrics(db, user_id: str, tenant_id, days: int) -> Dict[str, float]:
    """Métricas del pipeline del asesor en la ventana de `days` días. Cada métrica
    aislada en try/except → un campo ausente degrada a 0, nunca rompe."""
    # Scoping del pipeline personal = owner_id (los docs del asesor no llevan
    # tenant_id; tenant_id queda en la firma/contrato pero no filtra docs).
    since = _now() - timedelta(days=days)
    base_q: Dict[str, Any] = {"owner_id": user_id}

    # Denominador común: leads creados en la ventana.
    leads_n = 0
    try:
        leads_n = await db.asesor_contactos.count_documents(
            {**base_q, "created_at": {"$gte": since}})
    except Exception:
        leads_n = 0

    if not leads_n:
        return {"response_rate": 0.0, "conversion": 0.0, "handoff": 0.0, "n": 0}

    # response_rate: contactos distintos tocados (timeline) en la ventana.
    touched = 0
    try:
        ids = await db.asesor_contacto_timeline.find(
            {"owner_id": user_id, "ts": {"$gte": since}},
            {"_id": 0, "contacto_id": 1}).to_list(2000)
        touched = len({d.get("contacto_id") for d in ids if d.get("contacto_id")})
    except Exception:
        touched = 0

    # conversion / handoff: búsquedas movidas en la ventana (updated_at).
    won = lost = 0
    try:
        won = await db.asesor_busquedas.count_documents(
            {**base_q, "stage": "ganada", "updated_at": {"$gte": since}})
    except Exception:
        won = 0
    try:
        lost = await db.asesor_busquedas.count_documents(
            {**base_q, "stage": "perdida", "updated_at": {"$gte": since}})
    except Exception:
        lost = 0

    denom = float(leads_n)
    return {
        "response_rate": touched / denom,
        "conversion": won / denom,
        "handoff": lost / denom,
        "n": leads_n,
    }


async def compute_pipeline_drift(db, user_id: str, tenant_id=None) -> Dict[str, Any]:
    """Compara baseline (30d) vs current (7d). FAIL-OPEN → drift 0 / deltas 0."""
    try:
        baseline = await _window_metrics(db, user_id, tenant_id, BASELINE_DAYS)
        current = await _window_metrics(db, user_id, tenant_id, CURRENT_DAYS)

        d_resp = _rel_delta(current["response_rate"], baseline["response_rate"])
        d_conv = _rel_delta(current["conversion"], baseline["conversion"])
        d_handoff = _rel_delta(current["handoff"], baseline["handoff"])

        breached = []
        if abs(d_resp) > DRIFT_THRESHOLD:
            breached.append("response_rate")
        if abs(d_conv) > DRIFT_THRESHOLD:
            breached.append("conversion")
        if abs(d_handoff) > DRIFT_THRESHOLD:
            breached.append("handoff")

        return {
            "drift": 1 if breached else 0,
            "breached": breached,
            "response_rate_delta": round(d_resp, 4),
            "conversion_delta": round(d_conv, 4),
            "handoff_delta": round(d_handoff, 4),
            "baseline": baseline,
            "current": current,
            "user_id": user_id,
            "tenant_id": tenant_id,
        }
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[pipeline_drift_personal] fail-open: {exc}")
        return {"drift": 0, "breached": [],
                "response_rate_delta": 0, "conversion_delta": 0, "handoff_delta": 0,
                "user_id": user_id, "tenant_id": tenant_id}
