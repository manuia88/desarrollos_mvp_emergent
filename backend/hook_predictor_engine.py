"""W5.22 Z.5 — Hook Predictor Engine standalone.

Scoring de "hook" (frase inicial / texto corto de marketing) en 4 dimensiones
(clarity, cta, novelty, urgency), peso 25% c/u → score 0-100.

Pipeline:
    1) Cache lookup (sha256 del content + audience · TTL 7d)
    2) LLM scoring (Claude Sonnet 4.5 via emergentintegrations) con rubric estricto
    3) FAIL-OPEN: si LLM falla → heurística determinista (length + keywords + ?)
    4) Persistencia score + audit_immutable_engine.log

Colecciones:
    hook_predictor_cache   { content_hash, audience, score, breakdown, suggestion,
                             confidence, source, created_at, expires_at, model? }
    hook_predictor_scores  { id, user_id, tenant_id, content_hash, score, breakdown,
                             suggestion, source, confidence, audience, created_at }

Funciones públicas:
    predict_hook_score(db, text, target_audience?, user?, request?) → dict
    get_stats(db, user_id?, tenant_id?, days=30) → dict
    get_stats_global(db, days=30) → dict
    ensure_indexes(db) → idempotente
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.hook_predictor")

EMERGENT_LLM_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = "claude-sonnet-4-5-20250929"
CACHE_TTL_DAYS = 7
DEFAULT_THRESHOLD = int(os.environ.get("HOOK_PREDICTOR_THRESHOLD", "60"))
MAX_TEXT_LEN = 2000
# G.101 audit fix · cap LLM cost runaway (superadmin bypass)
DAILY_LLM_CAP_PER_TENANT = int(os.environ.get("HOOK_PREDICTOR_DAILY_CAP_PER_TENANT", "200"))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid() -> str:
    return f"hpred_{uuid.uuid4().hex[:12]}"


def _hash_content(text: str, audience: Optional[str], tenant_id: Optional[str] = None) -> str:
    """G.103 audit fix · include tenant_id in hash to prevent cross-tenant cache sharing.

    tenant_id=None preserves backward compat para callers públicos sin auth.
    """
    payload = (text or "")[:MAX_TEXT_LEN] + "|" + (audience or "") + "|" + (tenant_id or "_global")
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def _check_daily_llm_cap(db, tenant_id: Optional[str], role: str) -> None:
    """G.101 audit fix · cap LLM scores diarios por tenant (superadmin bypass)."""
    if role == "superadmin" or not tenant_id or tenant_id == "default":
        return
    from fastapi import HTTPException
    since = _now() - timedelta(days=1)
    try:
        count = await db.hook_predictor_scores.count_documents({
            "tenant_id": tenant_id,
            "source": {"$in": ["llm", "cache"]},  # heuristic no cuesta · no cuenta
            "created_at": {"$gte": since},
        })
    except Exception:
        return  # FAIL-OPEN si query falla
    if count >= DAILY_LLM_CAP_PER_TENANT:
        raise HTTPException(
            429,
            f"hook_predictor_daily_cap_exceeded · max {DAILY_LLM_CAP_PER_TENANT}/día/tenant · evita LLM cost runaway",
        )


# ─── ensure_indexes ──────────────────────────────────────────────────────────
async def ensure_indexes(db) -> None:
    """Idempotente · cache TTL via expires_at + scores by user/tenant/time."""
    try:
        await db.hook_predictor_cache.create_index("content_hash", unique=True)
        await db.hook_predictor_cache.create_index(
            "expires_at", expireAfterSeconds=0,
        )
        await db.hook_predictor_scores.create_index("user_id")
        await db.hook_predictor_scores.create_index("tenant_id")
        await db.hook_predictor_scores.create_index([("created_at", -1)])
        log.info("[hook_predictor] indexes OK")
    except Exception as exc:
        log.warning(f"[hook_predictor] ensure_indexes failed: {exc}")


# ─── LLM rubric ──────────────────────────────────────────────────────────────
_SYSTEM_RUBRIC = (
    "Eres un evaluador estricto de hooks para marketing inmobiliario MX (es-MX). "
    "Calificas un texto en 4 dimensiones, cada una de 0 a 100 enteros:\n"
    "  - clarity   : ¿se entiende rápido qué se ofrece? (0=confuso · 100=clarísimo)\n"
    "  - cta       : ¿invita a una acción concreta? (0=sin CTA · 100=CTA explícito)\n"
    "  - novelty   : ¿usa un ángulo fresco o repite cliché? (0=cliché · 100=ángulo único)\n"
    "  - urgency   : ¿transmite razón para actuar ahora? (0=neutral · 100=urgencia natural)\n"
    "El score final se calculará como promedio simple de las 4 dimensiones (peso 25% c/u). "
    "Si el score final estimado es <60, incluye sugerencia accionable (<=140 chars) en es-MX. "
    "Sin emojis. Sin markdown. Responde EXCLUSIVAMENTE con JSON válido:\n"
    '{"clarity": int, "cta": int, "novelty": int, "urgency": int, '
    '"suggestion": "..."|null, "confidence": "alta"|"media"|"baja"}'
)


def _audience_hint(audience: Optional[str]) -> str:
    if not audience:
        return ""
    a = (audience or "").strip()[:80]
    return f"AUDIENCIA OBJETIVO: {a}\n\n"


async def _llm_score(text: str, audience: Optional[str]) -> Optional[Dict[str, Any]]:
    """Call Claude Sonnet 4.5 via emergentintegrations. None on failure."""
    if not EMERGENT_LLM_KEY:
        return None
    try:
        from llm_client import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"hookpred_{uuid.uuid4().hex[:8]}",
            system_message=_SYSTEM_RUBRIC,
        ).with_model("anthropic", CLAUDE_MODEL)
        user_text = _audience_hint(audience) + "TEXTO A EVALUAR:\n" + (text or "")[:MAX_TEXT_LEN]
        raw = await chat.send_message(UserMessage(text=user_text))
        if not raw:
            return None
        clean = raw.strip()
        if clean.startswith("```"):
            clean = re.sub(r"^```(?:json)?\s*|\s*```$", "", clean, flags=re.S).strip()
        data = json.loads(clean)
        if not isinstance(data, dict):
            return None
        return _normalize_breakdown(data)
    except Exception as exc:
        log.warning(f"[hook_predictor] LLM error: {exc}")
        return None


def _normalize_breakdown(data: Dict[str, Any]) -> Dict[str, Any]:
    def _clip(v: Any) -> int:
        try:
            n = int(round(float(v)))
        except Exception:
            n = 50
        return max(0, min(100, n))

    breakdown = {
        "clarity": _clip(data.get("clarity")),
        "cta": _clip(data.get("cta")),
        "novelty": _clip(data.get("novelty")),
        "urgency": _clip(data.get("urgency")),
    }
    score = round(sum(breakdown.values()) / 4.0)
    suggestion = data.get("suggestion")
    if isinstance(suggestion, str):
        suggestion = suggestion.strip()[:200] or None
    else:
        suggestion = None
    confidence = (data.get("confidence") or "media").lower()
    if confidence not in {"alta", "media", "baja"}:
        confidence = "media"
    return {
        "score": score,
        "breakdown": breakdown,
        "suggestion": suggestion,
        "confidence": confidence,
    }


# ─── Heuristic fallback (FAIL-OPEN) ──────────────────────────────────────────
_CTA_TOKENS = {
    "agenda", "agendar", "visita", "visítalo", "reserva", "reservar", "compra",
    "llama", "whatsapp", "contacta", "descúbrelo", "descarga", "regístrate",
    "solicita", "obtén", "aprovecha", "haz tu", "conoce",
}
_URGENCY_TOKENS = {
    "hoy", "ahora", "última", "últimas", "limitado", "limitada", "preventa",
    "cierra", "sólo", "solo", "termina", "no esperes", "esta semana",
}
_NOVELTY_TOKENS = {
    "exclusivo", "exclusiva", "único", "única", "diseñado", "boutique",
    "panorámica", "skyline", "premier",
}


def _heuristic_score(text: str) -> Dict[str, Any]:
    """Deterministic fallback when LLM unavailable. Returns same shape as LLM."""
    body = (text or "").strip()
    low = body.lower()
    words = re.findall(r"\b[\wáéíóúñü]+\b", low)
    n_words = len(words)

    # clarity: penalizar texto muy corto (<3w) o muy largo (>40w)
    if n_words == 0:
        clarity = 0
    elif n_words < 3:
        clarity = 30
    elif n_words > 40:
        clarity = max(20, 80 - (n_words - 40) * 2)
    else:
        clarity = 70

    # cta: cuenta tokens CTA en lower-case
    cta_hits = sum(1 for tk in _CTA_TOKENS if tk in low)
    cta = min(100, 20 + cta_hits * 25)
    if "?" in body:
        cta = min(100, cta + 10)

    # novelty: tokens + uniqueness ratio (vocabulary diversity)
    nov_hits = sum(1 for tk in _NOVELTY_TOKENS if tk in low)
    unique_ratio = (len(set(words)) / n_words) if n_words else 0
    novelty = min(100, int(30 + nov_hits * 20 + unique_ratio * 40))

    # urgency
    urg_hits = sum(1 for tk in _URGENCY_TOKENS if tk in low)
    urgency = min(100, 15 + urg_hits * 30)

    breakdown = {"clarity": clarity, "cta": cta, "novelty": novelty, "urgency": urgency}
    score = round(sum(breakdown.values()) / 4.0)
    suggestion: Optional[str] = None
    if score < 60:
        gaps = sorted(breakdown.items(), key=lambda kv: kv[1])
        weakest = gaps[0][0]
        hint = {
            "clarity": "Acorta la frase y haz explícito el beneficio principal.",
            "cta": "Agrega una invitación clara (visita, agenda, descubre).",
            "novelty": "Cambia el cliché por un dato concreto o ángulo diferente.",
            "urgency": "Suma una razón temporal real (última unidad, cierre de etapa).",
        }
        suggestion = hint.get(weakest, "Reescribe enfatizando beneficio + acción.")
    return {
        "score": score,
        "breakdown": breakdown,
        "suggestion": suggestion,
        "confidence": "baja",
    }


# ─── Cache ───────────────────────────────────────────────────────────────────
async def _cache_get(db, content_hash: str) -> Optional[Dict[str, Any]]:
    try:
        doc = await db.hook_predictor_cache.find_one(
            {"content_hash": content_hash}, {"_id": 0},
        )
        if not doc:
            return None
        exp = doc.get("expires_at")
        if isinstance(exp, datetime) and exp < _now():
            return None
        return doc
    except Exception as exc:
        log.warning(f"[hook_predictor] cache_get failed: {exc}")
        return None


async def _cache_put(db, content_hash: str, audience: Optional[str],
                     payload: Dict[str, Any], source: str) -> None:
    try:
        now = _now()
        doc = {
            "content_hash": content_hash,
            "audience": audience,
            "score": payload["score"],
            "breakdown": payload["breakdown"],
            "suggestion": payload.get("suggestion"),
            "confidence": payload.get("confidence", "media"),
            "source": source,
            "model": CLAUDE_MODEL if source == "llm" else None,
            "created_at": now,
            "expires_at": now + timedelta(days=CACHE_TTL_DAYS),
        }
        await db.hook_predictor_cache.update_one(
            {"content_hash": content_hash}, {"$set": doc}, upsert=True,
        )
    except Exception as exc:
        log.warning(f"[hook_predictor] cache_put failed: {exc}")


# ─── Public API ──────────────────────────────────────────────────────────────
async def predict_hook_score(
    db,
    text: str,
    target_audience: Optional[str] = None,
    user: Optional[Any] = None,
    request: Optional[Any] = None,
) -> Dict[str, Any]:
    """Score a hook in 4 dimensions. Cache 7d. FAIL-OPEN to heuristic.

    Returns:
        {
          score: 0-100,
          breakdown: {clarity, cta, novelty, urgency},
          suggestion: str|None,
          confidence: alta|media|baja,
          source: cache|llm|heuristic,
          threshold: int,
          passes: bool,
          missing_data: bool   # True if LLM unavailable and heuristic used
        }
    """
    body = (text or "").strip()
    if not body:
        return {
            "score": 0,
            "breakdown": {"clarity": 0, "cta": 0, "novelty": 0, "urgency": 0},
            "suggestion": "Escribe al menos una frase para evaluar.",
            "confidence": "baja",
            "source": "empty",
            "threshold": DEFAULT_THRESHOLD,
            "passes": False,
            "missing_data": True,
        }

    # G.101 audit fix · enforce daily LLM cap antes de proceder (superadmin bypass)
    tenant_id_check = getattr(user, "tenant_id", None) if user else None
    role_check = getattr(user, "role", "anon") if user else "anon"
    await _check_daily_llm_cap(db, tenant_id_check, role_check)

    # G.103 audit fix · include tenant_id en hash para evitar cache cross-tenant
    content_hash = _hash_content(body, target_audience, tenant_id_check)

    # 1) cache
    cached = await _cache_get(db, content_hash)
    if cached:
        payload = {
            "score": cached["score"],
            "breakdown": cached["breakdown"],
            "suggestion": cached.get("suggestion"),
            "confidence": cached.get("confidence", "media"),
            "source": "cache",
        }
    else:
        # 2) LLM
        llm = await _llm_score(body, target_audience)
        if llm:
            payload = {**llm, "source": "llm"}
            await _cache_put(db, content_hash, target_audience, llm, "llm")
            # G.101 audit fix · track ai_budget cost para cap diario tenant
            try:
                from ai_budget import track_ai_call
                tokens_in = len(body) // 4
                tokens_out = 200  # rubric response avg
                if tenant_id_check:
                    await track_ai_call(
                        db, dev_org_id=tenant_id_check, model=CLAUDE_MODEL,
                        tokens=tokens_in + tokens_out, call_type="hook_predictor",
                        tokens_in=tokens_in, tokens_out=tokens_out,
                        feature_key="hook_predictor",
                    )
            except Exception as exc:
                log.debug(f"[hook_predictor] ai_budget track skip: {exc}")
        else:
            # 3) Heuristic (FAIL-OPEN)
            heur = _heuristic_score(body)
            payload = {**heur, "source": "heuristic"}
            # cache heuristic con TTL más corto reutilizando misma TTL (acepta riesgo)
            await _cache_put(db, content_hash, target_audience, heur, "heuristic")

    payload["threshold"] = DEFAULT_THRESHOLD
    payload["passes"] = payload["score"] >= DEFAULT_THRESHOLD
    payload["missing_data"] = payload["source"] == "heuristic" and not EMERGENT_LLM_KEY

    # Persistir score record + audit
    try:
        user_id = getattr(user, "user_id", None) or "anon"
        tenant_id = getattr(user, "tenant_id", None) or "default"
        await db.hook_predictor_scores.insert_one({
            "id": _uid(),
            "user_id": user_id,
            "tenant_id": tenant_id,
            "content_hash": content_hash,
            "audience": target_audience,
            "score": payload["score"],
            "breakdown": payload["breakdown"],
            "suggestion": payload.get("suggestion"),
            "confidence": payload.get("confidence"),
            "source": payload["source"],
            "created_at": _now(),
        })
        try:
            from audit_immutable_engine import log as audit_log
            await audit_log(
                db,
                actor={"user_id": user_id, "role": getattr(user, "role", "anon")},
                action="hook_predictor_score",
                entity_type="hook_predictor",
                entity_id=content_hash[:16],
                after={"score": payload["score"], "source": payload["source"]},
                request=request,
            )
        except Exception:
            pass
    except Exception as exc:
        log.warning(f"[hook_predictor] persist failed: {exc}")

    return payload


async def get_stats(db, user_id: Optional[str] = None,
                    tenant_id: Optional[str] = None, days: int = 30) -> Dict[str, Any]:
    """Aggregated stats for a user (or tenant scope)."""
    days = max(1, min(int(days or 30), 365))
    cutoff = _now() - timedelta(days=days)
    q: Dict[str, Any] = {"created_at": {"$gte": cutoff}}
    if user_id:
        q["user_id"] = user_id
    elif tenant_id:
        q["tenant_id"] = tenant_id

    try:
        cursor = db.hook_predictor_scores.find(q, {"_id": 0})
        rows = [r async for r in cursor]
    except Exception as exc:
        log.warning(f"[hook_predictor] get_stats failed: {exc}")
        rows = []

    total = len(rows)
    if total == 0:
        return {
            "total_scored": 0,
            "avg_score": None,
            "distribution_by_tier": {"excellent": 0, "good": 0, "weak": 0},
            "top_dimensions_failing": [],
            "days": days,
        }
    avg = round(sum(r.get("score", 0) for r in rows) / total, 1)
    dist = {"excellent": 0, "good": 0, "weak": 0}
    fails = {"clarity": 0, "cta": 0, "novelty": 0, "urgency": 0}
    for r in rows:
        s = r.get("score", 0)
        if s >= 80:
            dist["excellent"] += 1
        elif s >= 60:
            dist["good"] += 1
        else:
            dist["weak"] += 1
        bd = r.get("breakdown") or {}
        for k in fails:
            if bd.get(k, 100) < 60:
                fails[k] += 1
    top_fail = sorted(fails.items(), key=lambda kv: kv[1], reverse=True)
    top_dimensions = [{"dimension": k, "fail_count": v} for k, v in top_fail if v > 0]

    return {
        "total_scored": total,
        "avg_score": avg,
        "distribution_by_tier": dist,
        "top_dimensions_failing": top_dimensions,
        "days": days,
    }


async def get_stats_global(db, days: int = 30) -> Dict[str, Any]:
    """Superadmin · stats agregadas sin filtro por user/tenant."""
    return await get_stats(db, user_id=None, tenant_id=None, days=days)
