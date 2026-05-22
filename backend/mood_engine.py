"""W5.x F10 · Mood Engine.

Quiz de 6 preguntas (a/b) → mood_vector 5D (calm, social, eclectic, modern,
connected) → match euclidean contra property mood profiles. Persiste
mood_vector en lead_captures si visitor_session_id matchea. Cache resultados
del quiz por session en `mood_quiz_results` TTL 90d.

NO LLM · scoring puro heurístico.
"""
from __future__ import annotations

import logging
import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.mood")

RESULTS_COLLECTION = "mood_quiz_results"
RESULTS_TTL_DAYS = 90

DIMENSIONS = ["calm", "social", "eclectic", "modern", "connected"]

# Cada question shifts una dimensión · valor 'a' o 'b' · weight ±1 escala 0.5
QUESTION_WEIGHTS: Dict[str, Dict[str, Dict[str, int]]] = {
    "q1": {"a": {"calm": 1},     "b": {"calm": -1}},      # casa libro vs fuera gente
    "q2": {"a": {"social": 1},   "b": {"social": -1}},    # ciudad luz vs montaña
    "q3": {"a": {"eclectic": -1}, "b": {"eclectic": 1}},  # specialty min vs cafe barrio
    "q4": {"a": {"eclectic": -1}, "b": {"eclectic": 1}},  # limpio vs capas
    "q5": {"a": {"modern": -1},   "b": {"modern": 1}},    # jazz vs techno
    "q6": {"a": {"connected": 1}, "b": {"connected": -1}},  # vecinos vs anonimato
}

REQUIRED_QIDS = set(QUESTION_WEIGHTS.keys())
VALID_VALUES = {"a", "b"}

_MAX_DIST = math.sqrt(len(DIMENSIONS))  # √5 ≈ 2.236


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


# ─── Compute vector ──────────────────────────────────────────────────────────

def compute_mood_vector(answers: Dict[str, str]) -> Dict[str, float]:
    """Cada answer aporta ±0.5 a la dimensión correspondiente · clamp [0,1]."""
    vector = {d: 0.5 for d in DIMENSIONS}
    for qid, value in (answers or {}).items():
        w = QUESTION_WEIGHTS.get(qid)
        if not w:
            continue
        deltas = w.get(value)
        if not deltas:
            continue
        for dim, sign in deltas.items():
            vector[dim] = vector.get(dim, 0.5) + float(sign) * 0.5
    return {d: round(_clamp(vector[d]), 3) for d in DIMENSIONS}


def compute_mood_label(vector: Dict[str, float]) -> str:
    """3 dimensiones más extremas → label es-MX."""
    label_map = {
        "calm": ("Tranquilo", "Energético", "Balanceado"),
        "social": ("Social", "Íntimo", "Versátil"),
        "eclectic": ("Ecléctico", "Minimalista", "Clásico"),
        "modern": ("Moderno", "Tradicional", "Atemporal"),
        "connected": ("Conectado", "Privado", "Equilibrado"),
    }
    ranked = sorted(
        DIMENSIONS, key=lambda d: abs(float(vector.get(d, 0.5)) - 0.5), reverse=True
    )
    parts: List[str] = []
    for d in ranked[:3]:
        v = float(vector.get(d, 0.5))
        hi, lo, mid = label_map[d]
        if v >= 0.6:
            parts.append(hi)
        elif v <= 0.4:
            parts.append(lo)
        else:
            parts.append(mid)
    return " · ".join(parts)


def compute_match_affinity(
    user_vector: Dict[str, float], property_tags: Dict[str, float]
) -> int:
    """Afinidad 0-100 vía distancia euclidiana en 5D."""
    if not user_vector or not property_tags:
        return 0
    dist_sq = 0.0
    for d in DIMENSIONS:
        u = float(user_vector.get(d, 0.5))
        p = float(property_tags.get(d, 0.5))
        dist_sq += (u - p) ** 2
    dist = math.sqrt(dist_sq)
    affinity = (1.0 - dist / _MAX_DIST) * 100.0
    return int(round(_clamp(affinity, 0.0, 100.0)))


def compute_vibe_phrase(
    user_vector: Dict[str, float], property_tags: Dict[str, float]
) -> str:
    """Frase es-MX basada en dimensiones donde user y property tienen <0.2 distancia."""
    adj_map = {
        "calm": {"high": "tranquilo", "low": "energético"},
        "social": {"high": "social", "low": "íntimo"},
        "eclectic": {"high": "ecléctico", "low": "minimalista"},
        "modern": {"high": "moderno", "low": "tradicional"},
        "connected": {"high": "conectado", "low": "privado"},
    }
    strong_matches: List[str] = []
    for d in DIMENSIONS:
        u = float(user_vector.get(d, 0.5))
        p = float(property_tags.get(d, 0.5))
        if abs(u - p) < 0.2:
            # both lean same direction
            if u >= 0.55 and p >= 0.55:
                strong_matches.append(adj_map[d]["high"])
            elif u <= 0.45 and p <= 0.45:
                strong_matches.append(adj_map[d]["low"])
    if len(strong_matches) >= 3:
        return (
            "Esta propiedad te queda · porque te gusta lo "
            + ", ".join(strong_matches[:2]) + f" y {strong_matches[2]}"
        )
    if strong_matches:
        return f"Esta propiedad encaja con tu gusto por lo {' y '.join(strong_matches[:2])}"
    return "Esta propiedad encaja parcialmente con tu vibe"


# ─── Submit quiz ─────────────────────────────────────────────────────────────

def _validate_answers(answers: Dict[str, str]) -> Optional[str]:
    if not isinstance(answers, dict):
        return "answers debe ser dict"
    missing = REQUIRED_QIDS - set(answers.keys())
    if missing:
        return f"faltan respuestas: {sorted(missing)}"
    for qid, v in answers.items():
        if qid not in REQUIRED_QIDS:
            return f"qid inválido: {qid}"
        if v not in VALID_VALUES:
            return f"value inválido para {qid}: {v}"
    return None


async def submit_quiz(
    db,
    visitor_session_id: str,
    answers: Dict[str, str],
    force_refresh: bool = False,
) -> Dict[str, Any]:
    """Valida + computa vector + match + persiste + audit."""
    err = _validate_answers(answers)
    if err:
        return {"ok": False, "reason": err}
    if not visitor_session_id:
        return {"ok": False, "reason": "visitor_session_id requerido"}

    vector = compute_mood_vector(answers)
    label = compute_mood_label(vector)
    matches = await match_properties(db, vector, limit=5)
    now = _now()

    doc = {
        "result_id": f"mq_{uuid.uuid4().hex[:14]}",
        "visitor_session_id": visitor_session_id,
        "mood_vector": vector,
        "mood_label": label,
        "top_matches": [m.get("property_id") for m in matches if m.get("property_id")],
        "answers": dict(answers),
        "created_at": now,
        "ttl_until": now + timedelta(days=RESULTS_TTL_DAYS),
    }
    if db is not None:
        try:
            await db[RESULTS_COLLECTION].insert_one(dict(doc))
        except Exception as e:
            log.warning(f"[mood] insert result failed: {e}")

        # Si session matchea un lead capturado · update lead.mood_vector
        try:
            await db.lead_captures.update_one(
                {"visitor_session_id": visitor_session_id},
                {"$set": {"mood_vector": vector, "mood_label": label,
                           "mood_updated_at": now}},
            )
        except Exception as e:
            log.debug(f"[mood] lead update silent fail: {e}")

    # Audit fail-soft
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": visitor_session_id, "role": "public"},
            action="mood_quiz_submitted",
            entity_type="mood_quiz",
            entity_id=doc["result_id"],
            before=None,
            after={"mood_vector": vector, "mood_label": label,
                   "matches_count": len(matches)},
        )
    except Exception as e:
        log.debug(f"[mood] audit fail: {e}")

    return {
        "ok": True,
        "result_id": doc["result_id"],
        "mood_vector": vector,
        "mood_label": label,
        "matches": matches,
    }


# ─── Match properties ────────────────────────────────────────────────────────

async def match_properties(
    db, user_vector: Dict[str, float], limit: int = 5
) -> List[Dict[str, Any]]:
    """Itera DEVELOPMENTS (cap 100) + db.developments · ranking por affinity."""
    limit = max(1, min(int(limit or 5), 20))
    from mood_property_profiler import get_or_build_profile

    candidates: List[str] = []
    try:
        from data_developments import DEVELOPMENTS
        for d in DEVELOPMENTS[:100]:
            pid = d.get("id") or d.get("slug")
            if pid:
                candidates.append(pid)
    except Exception:
        pass
    if db is not None:
        try:
            async for d in db.developments.find({}, {"_id": 0, "id": 1, "slug": 1}).limit(100):
                pid = d.get("id") or d.get("slug")
                if pid and pid not in candidates:
                    candidates.append(pid)
        except Exception:
            pass

    scored: List[Dict[str, Any]] = []
    for pid in candidates:
        try:
            profile = await get_or_build_profile(db, pid)
            if not profile:
                continue
            tags = profile.get("mood_tags") or {}
            affinity = compute_match_affinity(user_vector, tags)
            phrase = compute_vibe_phrase(user_vector, tags)
            scored.append({
                "property_id": pid,
                "property_title": profile.get("name") or pid,
                "photo_url": profile.get("photo_url"),
                "affinity_pct": affinity,
                "vibe_phrase": phrase,
                "vibe_summary": profile.get("vibe_summary"),
            })
        except Exception as e:
            log.debug(f"[mood] match pid={pid} fail: {e}")
    scored.sort(key=lambda x: int(x.get("affinity_pct") or 0), reverse=True)
    return scored[:limit]


# ─── Indexes ─────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    """Indexes idempotentes para mood_quiz_results + property_mood_profiles."""
    if db is None:
        return
    try:
        from mood_property_profiler import PROFILE_COLLECTION

        await db[RESULTS_COLLECTION].create_index(
            "visitor_session_id", sparse=True, name="mq_session"
        )
        await db[RESULTS_COLLECTION].create_index(
            "ttl_until", expireAfterSeconds=0, name="mq_ttl"
        )
        await db[RESULTS_COLLECTION].create_index(
            [("created_at", -1)], name="mq_created_desc"
        )

        await db[PROFILE_COLLECTION].create_index(
            "property_id", unique=True, name="mp_property_uniq"
        )
        await db[PROFILE_COLLECTION].create_index(
            "ttl_until", expireAfterSeconds=0, name="mp_ttl"
        )
        log.info("[mood] indexes OK")
    except Exception as e:
        log.warning(f"[mood] ensure_indexes failed: {e}")
