"""W7.AS.3.C · Conversation first-message hook scoring (cycle-closer).

Módulo puro standalone, importable por conversation_engine.py.
Puntúa el PRIMER mensaje del asesor con la rúbrica 4D de hook_predictor_engine
(W5.22 · Z.5) y levanta un gate de advertencia si el score es bajo.

Gate semántico: si score < GATE_THRESHOLD (60) → gate_warning=True. NO bloquea
el envío; sólo marca el flag para que la UI/asistente sugiera mejorar el copy.

Cache: 7d vía hash de (message_text, audience, tenant_id) en la colección
conversation_hook_scores. El engine ya cachea internamente; esta capa evita
re-invocarlo para mensajes idénticos y refuerza idempotencia.

FAIL-OPEN: si el engine no está disponible o falla, retorna shape neutro
(gate_warning=False, source="unavailable") sin crash.
"""
from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.conversation_hook_predictor")

GATE_THRESHOLD = 60
CACHE_TTL_DAYS = 7

_db_singleton = None  # lazy cache de la conexión standalone


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash(message_text: str, audience: Optional[str], tenant_id: Optional[str]) -> str:
    seed = f"{(message_text or '').strip()}|{audience or ''}|{tenant_id or ''}"
    return "chook_" + hashlib.sha256(seed.encode("utf-8")).hexdigest()[:24]


async def _get_db():
    """Conexión perezosa standalone (sin tocar server.py). FAIL-OPEN → None."""
    global _db_singleton
    if _db_singleton is not None:
        return _db_singleton
    try:
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        if not mongo_url or not db_name:
            return None
        from motor.motor_asyncio import AsyncIOMotorClient
        _db_singleton = AsyncIOMotorClient(mongo_url)[db_name]
        return _db_singleton
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[conversation_hook] db connect failed: {exc}")
        return None


def _neutral(message_text: str, reason: str) -> Dict[str, Any]:
    """Shape neutro FAIL-OPEN · gate nunca bloquea."""
    return {
        "score": None,
        "breakdown": {"clarity": None, "cta": None, "novelty": None, "urgency": None},
        "gate_warning": False,
        "passes_gate": True,  # neutro = no bloquea
        "threshold": GATE_THRESHOLD,
        "suggestion": None,
        "source": "unavailable",
        "reason": reason,
    }


def _build_payload(score_doc: Dict[str, Any], source: str) -> Dict[str, Any]:
    raw_score = score_doc.get("score")
    try:
        score_num = float(raw_score) if raw_score is not None else None
    except (TypeError, ValueError):
        score_num = None
    gate_warning = score_num is not None and score_num < GATE_THRESHOLD
    return {
        "score": score_num,
        "breakdown": score_doc.get("breakdown") or {},
        "gate_warning": gate_warning,
        "passes_gate": not gate_warning,
        "threshold": GATE_THRESHOLD,
        "suggestion": score_doc.get("suggestion"),
        "source": source,
    }


async def score_first_message(
    message_text: str, audience: Optional[str] = None, tenant_id: Optional[str] = None
) -> Dict[str, Any]:
    """Puntúa el primer mensaje y aplica el gate (warning, no bloqueo).

    Returns:
        {score, breakdown, gate_warning, passes_gate, threshold, suggestion, source}
    FAIL-OPEN siempre · idempotente vía cache 7d por hash.
    """
    body = (message_text or "").strip()
    if not body:
        return _neutral(message_text, "empty_message")

    content_hash = _hash(body, audience, tenant_id)
    db = await _get_db()

    # 1) Cache wrapper 7d (best-effort)
    if db is not None:
        try:
            cached = await db.conversation_hook_scores.find_one({"hash": content_hash}, {"_id": 0})
            if cached:
                cached_at = cached.get("cached_at")
                if cached_at and (_now() - cached_at) < timedelta(days=CACHE_TTL_DAYS):
                    return _build_payload(cached, source="cache")
        except Exception as exc:
            log.warning(f"[conversation_hook] cache read failed: {exc}")

    # 2) Engine (W5.22 Z.5) · import perezoso · FAIL-OPEN
    try:
        from hook_predictor_engine import predict_hook_score

        engine_res = await predict_hook_score(db, body, target_audience=audience)
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[conversation_hook] engine failed: {exc}")
        return _neutral(message_text, "engine_error")

    if not isinstance(engine_res, dict):
        return _neutral(message_text, "bad_engine_shape")

    payload = _build_payload(engine_res, source=engine_res.get("source", "engine"))

    # 3) Cache put (best-effort · idempotente vía upsert por hash)
    if db is not None:
        try:
            await db.conversation_hook_scores.update_one(
                {"hash": content_hash},
                {"$set": {
                    "hash": content_hash,
                    "score": payload["score"],
                    "breakdown": payload["breakdown"],
                    "suggestion": payload["suggestion"],
                    "audience": audience,
                    "tenant_id": tenant_id,
                    "cached_at": _now(),
                }},
                upsert=True,
            )
        except Exception as exc:
            log.warning(f"[conversation_hook] cache put failed: {exc}")

    return payload


async def ensure_indexes(db) -> None:
    try:
        await db.conversation_hook_scores.create_index("hash", unique=True)
    except Exception as exc:
        log.warning(f"[conversation_hook] ensure_indexes failed: {exc}")
