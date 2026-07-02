"""W5.4 — Buyer Score Engine · motor unificado 7 dimensiones.

Schema buyer_scores:
  {id, user_id, score (0-100), tier (hot|warm|cold),
   components: {behavioral_pct, match_pct, coach_stage_pct, quiz_completed_pct,
                favoritos_pct, visitas_pct, apify_enrichment_pct},
   unavailable: [dims sin fuente real],
   computed_at, prev_score, delta_pct}  ← delta_pct = new_score - prev_score (puntos absolutos)

Honestidad de fuente (doctrina Fable5 · regla 7): si Apify NO tiene señal real
(sin APIFY_API_TOKEN o sin implementación), la dimensión queda ESPERANDO-FUENTE
(available=False) y NO aporta un número inventado al score. En ese caso se EXCLUYE
y se renormalizan los pesos de las demás dimensiones (mismo criterio que cualquier
otra dimensión faltante).
"""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.buyer_score")

WEIGHTS: Dict[str, float] = {
    "behavioral_pct":       0.25,
    "match_pct":            0.20,
    "coach_stage_pct":      0.15,
    "quiz_completed_pct":   0.10,
    "favoritos_pct":        0.15,
    "visitas_pct":          0.10,
    "apify_enrichment_pct": 0.05,
}

# P90 empírico para normalización behavioral (cap conservador)
_BEHAVIORAL_P90 = 50
_FAVORITOS_CAP  = 20
_VISITAS_CAP    = 5
_APIFY_CAP      = 10

_TIER_HOT   = 75
_TIER_WARM  = 40


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _score_id() -> str:
    return f"bscore_{secrets.token_urlsafe(8)}"


# ─── Componente Apify (esperando-fuente · NUNCA inventa el valor) ──────────────

def _apify_external_searches(user_id: str) -> Optional[int]:
    """Conteo real de búsquedas externas vía Apify, o None si NO hay fuente.

    Honestidad de fuente: devolver None significa "esperando-fuente" → la dimensión
    se excluye del score (no contamina con un número inventado). Solo retorna un
    entero cuando exista señal REAL de Apify. Hoy no hay actor conectado, así que
    siempre es None hasta que se implemente la consulta real.
    """
    token = os.getenv("APIFY_API_TOKEN", "")
    if not token:
        log.info(f"[buyer_score] apify esperando-fuente (sin APIFY_API_TOKEN) · user={user_id}")
        return None
    # TODO: query real Apify actor cuando token esté presente. Mientras no exista la
    # consulta real, NO inventamos un valor: queda esperando-fuente (None).
    log.info(f"[buyer_score] apify esperando-fuente (token presente, consulta real pendiente) · user={user_id}")
    return None


# ─── Motor principal ──────────────────────────────────────────────────────────

async def compute_user_score(db, user_id: str) -> Dict[str, Any]:
    """Calcula score 0-100 del buyer en hasta 7 dimensiones. Siempre retorna dict válido.

    Las dimensiones sin fuente real (esperando-fuente) se listan en `unavailable` y
    se EXCLUYEN del cálculo: los pesos de las dimensiones disponibles se renormalizan
    para que sumen 1.0, de modo que una fuente faltante nunca contamina el score con
    un valor inventado ni lo arrastra a 0.
    """
    comps: Dict[str, float] = {}
    unavailable: list[str] = []  # dimensiones esperando-fuente (sin dato real)
    since_30d = _now() - timedelta(days=30)

    # ── 1. Behavioral (25%) ──────────────────────────────────────────────────
    try:
        event_count = await db.behavioral_events.count_documents({
            "user_id": user_id,
            "timestamp": {"$gte": since_30d},
        })
        comps["behavioral_pct"] = min(event_count / _BEHAVIORAL_P90, 1.0) * 100
    except Exception as exc:
        log.warning(f"[buyer_score] behavioral failed for {user_id}: {exc}")
        comps["behavioral_pct"] = 0.0

    # ── 2. Smart Match avg (20%) ──────────────────────────────────────────────
    try:
        from services.smart_match import compute_buyer_match_score
        match_result = await compute_buyer_match_score(db, user_id)
        comps["match_pct"] = float(match_result.get("avg_match", 0.0))
    except Exception as exc:
        log.warning(f"[buyer_score] smart_match failed for {user_id}: {exc}")
        comps["match_pct"] = 0.0

    # ── 3. Coach Stage (15%) ─────────────────────────────────────────────────
    try:
        conv = await db.buyer_coach_conversations.find_one(
            {"user_id": user_id},
            {"_id": 0, "current_stage": 1},
            sort=[("last_activity", -1)],
        )
        stage = int((conv or {}).get("current_stage", 0))
        comps["coach_stage_pct"] = min(stage / 7.0, 1.0) * 100
    except Exception as exc:
        log.warning(f"[buyer_score] coach_stage failed for {user_id}: {exc}")
        comps["coach_stage_pct"] = 0.0

    # ── 4. Quiz Completed (10%) ──────────────────────────────────────────────
    try:
        user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1})
        email = (user_doc or {}).get("email", "")
        quiz_exists = False
        if email:
            quiz_lead = await db.leads.find_one({"email": email, "source": "quiz"}, {"_id": 0, "id": 1})
            quiz_exists = bool(quiz_lead)
        comps["quiz_completed_pct"] = 100.0 if quiz_exists else 0.0
    except Exception as exc:
        log.warning(f"[buyer_score] quiz_completed failed for {user_id}: {exc}")
        comps["quiz_completed_pct"] = 0.0

    # ── 5. Favoritos Count (15%) ─────────────────────────────────────────────
    try:
        fav_count = await db.buyer_favorites.count_documents({"user_id": user_id})
        comps["favoritos_pct"] = min(fav_count / _FAVORITOS_CAP, 1.0) * 100
    except Exception as exc:
        log.warning(f"[buyer_score] favoritos failed for {user_id}: {exc}")
        comps["favoritos_pct"] = 0.0

    # ── 6. Visitas Agendadas (10%) ────────────────────────────────────────────
    try:
        visits_count = await db.appointments.count_documents({"user_id": user_id})
        comps["visitas_pct"] = min(visits_count / _VISITAS_CAP, 1.0) * 100
    except Exception as exc:
        log.warning(f"[buyer_score] visitas failed for {user_id}: {exc}")
        comps["visitas_pct"] = 0.0

    # ── 7. Apify Enrichment (5%) · esperando-fuente si no hay señal real ──────
    try:
        apify_count = _apify_external_searches(user_id)
        if apify_count is None:
            # Sin fuente real → NO inventamos valor. Se excluye del score y se
            # marca esperando-fuente (los pesos restantes se renormalizan abajo).
            unavailable.append("apify_enrichment_pct")
        else:
            comps["apify_enrichment_pct"] = min(apify_count / _APIFY_CAP, 1.0) * 100
    except Exception as exc:
        log.warning(f"[buyer_score] apify failed for {user_id}: {exc}")
        unavailable.append("apify_enrichment_pct")

    # ── Score final · renormaliza sobre las dimensiones DISPONIBLES ───────────
    # Las dimensiones esperando-fuente quedan fuera del numerador y del denominador,
    # de modo que un dato faltante no contamina (ni un RNG, ni un 0 forzado).
    active_weight = sum(WEIGHTS[k] for k in comps)
    if active_weight > 0:
        score = sum(comps[k] * WEIGHTS[k] for k in comps) / active_weight
    else:
        score = 0.0
    score = round(min(max(score, 0.0), 100.0), 1)

    tier = "hot" if score >= _TIER_HOT else ("warm" if score >= _TIER_WARM else "cold")

    return {
        "score": score,
        "tier": tier,
        "components": {k: round(v, 1) for k, v in comps.items()},
        "unavailable": unavailable,  # dimensiones esperando-fuente (visibles, sin contaminar)
    }


async def upsert_score(db, user_id: str, score_data: Dict[str, Any]) -> Dict[str, Any]:
    """Idempotent upsert del buyer_score. Calcula delta_pct vs prev_score."""
    existing = await db.buyer_scores.find_one(
        {"user_id": user_id}, {"_id": 0, "score": 1}
    )
    prev_score = float((existing or {}).get("score", 0.0))
    new_score  = float(score_data["score"])
    delta_pct  = round(new_score - prev_score, 1)  # puntos absolutos (no porcentaje relativo)

    doc: Dict[str, Any] = {
        "user_id":     user_id,
        "score":       new_score,
        "tier":        score_data["tier"],
        "components":  score_data.get("components", {}),
        "unavailable": score_data.get("unavailable", []),  # dims esperando-fuente
        "computed_at": _now(),
        "prev_score":  prev_score,
        "delta_pct":   delta_pct,
    }

    await db.buyer_scores.update_one(
        {"user_id": user_id},
        {"$set": doc},
        upsert=True,
    )
    return doc


async def ensure_buyer_score_indexes(db) -> None:
    """Crea índices TTL 90d + búsqueda rápida."""
    try:
        await db.buyer_scores.create_index("user_id", unique=True, sparse=True)
        await db.buyer_scores.create_index([("score", -1)])
        await db.buyer_scores.create_index([("tier", 1)])
        await db.buyer_scores.create_index(
            "computed_at",
            expireAfterSeconds=60 * 60 * 24 * 90,  # TTL 90d
            name="buyer_scores_ttl",
        )
    except Exception as exc:
        log.warning(f"[buyer_score] ensure_indexes failed: {exc}")
    try:
        await db.buyer_score_runs.create_index("ran_at")
    except Exception as exc:
        log.warning(f"[buyer_score] ensure_runs_indexes failed: {exc}")
