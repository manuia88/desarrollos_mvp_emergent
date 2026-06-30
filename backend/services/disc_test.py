"""Phase 4 Batch 32 · services — DISC inline test.

7 preguntas force-choice DISC clásico. Cada opción asigna pesos a las 4
dimensiones (D · I · S · C). Total normalizado a 0-100 por dimensión.

Schema:
  db.asesor_disc_profiles: {
    asesor_id (PK), answers: [{q_id, value}],
    result: { D, I, S, C, primary }, narrative_text, completed_at
  }

Reusa patrón de ColoniaQuiz (B26): wizard frontend + scoring backend.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.disc_test")

EMERGENT_LLM_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
HAIKU_MODEL = "claude-haiku-4-5-20251001"


# ─── Question matrix (mismo orden que frontend/config/discQuestions.js) ──────

# Cada respuesta tiene pesos a las 4 dims [D, I, S, C]
QUESTIONS: List[Dict[str, Any]] = [
    {
        "q_id": "q1",
        "options": {
            "a": [4, 1, 0, 1],  # liderar
            "b": [1, 4, 1, 0],  # motivar
            "c": [0, 1, 4, 1],  # apoyar
            "d": [1, 0, 1, 4],  # organizar
        },
    },
    {
        "q_id": "q2",
        "options": {
            "a": [4, 1, 0, 1],  # actuar rápido
            "b": [1, 4, 1, 0],  # buscar gente
            "c": [0, 1, 4, 1],  # mantener calma
            "d": [1, 0, 1, 4],  # analizar
        },
    },
    {
        "q_id": "q3",
        "options": {
            "a": [4, 1, 0, 1],  # directa
            "b": [1, 4, 1, 0],  # expresiva
            "c": [0, 1, 4, 1],  # paciente
            "d": [1, 0, 1, 4],  # precisa
        },
    },
    {
        "q_id": "q4",
        "options": {
            "a": [4, 0, 1, 1],  # competir y ganar
            "b": [0, 4, 1, 1],  # entusiasmar al grupo
            "c": [1, 1, 4, 0],  # estabilizar relaciones
            "d": [1, 1, 0, 4],  # asegurar precisión
        },
    },
    {
        "q_id": "q5",
        "options": {
            "a": [4, 1, 1, 0],  # decisiones rápidas
            "b": [1, 4, 0, 1],  # decisiones intuitivas
            "c": [1, 0, 4, 1],  # decisiones consensuadas
            "d": [0, 1, 1, 4],  # decisiones basadas en datos
        },
    },
    {
        "q_id": "q6",
        "options": {
            "a": [4, 1, 0, 1],  # ambicioso y enfocado
            "b": [1, 4, 1, 0],  # sociable y persuasivo
            "c": [0, 1, 4, 1],  # leal y confiable
            "d": [1, 0, 1, 4],  # cauteloso y metódico
        },
    },
    {
        "q_id": "q7",
        "options": {
            "a": [4, 0, 1, 1],  # asumir el control
            "b": [1, 4, 1, 0],  # generar ideas
            "c": [0, 1, 4, 1],  # cuidar al equipo
            "d": [1, 0, 1, 4],  # documentar el proceso
        },
    },
]

VALID_OPTIONS = {"a", "b", "c", "d"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


# ─── Scoring ──────────────────────────────────────────────────────────────────

def _score_answers(answers: List[Dict[str, str]]) -> Dict[str, int]:
    """Suma pesos por dimensión, normaliza a 0-100."""
    raw = {"D": 0, "I": 0, "S": 0, "C": 0}
    by_qid = {a.get("q_id"): a.get("value") for a in answers if isinstance(a, dict)}

    for q in QUESTIONS:
        v = by_qid.get(q["q_id"])
        if v not in VALID_OPTIONS:
            continue
        weights = q["options"][v]
        raw["D"] += weights[0]
        raw["I"] += weights[1]
        raw["S"] += weights[2]
        raw["C"] += weights[3]

    # Normalizar: max teórico = 4 * 7 = 28 por dimensión
    max_theoretical = 4 * len(QUESTIONS)
    return {k: int(round(v / max_theoretical * 100)) for k, v in raw.items()}


def _primary(scores: Dict[str, int]) -> str:
    return max(scores.items(), key=lambda kv: kv[1])[0]


# ─── Narrative (Claude Haiku) ─────────────────────────────────────────────────

PRIMARY_DESCRIPTIONS = {
    "D": "Dominante: orientado a resultados, decisivo, directo.",
    "I": "Influyente: persuasivo, sociable, optimista.",
    "S": "Estable: paciente, leal, busca armonía.",
    "C": "Cauteloso: analítico, preciso, sistemático.",
}


async def _generate_narrative(scores: Dict[str, int], primary: str) -> str:
    """Claude Haiku ≤80 palabras. Cost-gated."""
    if not EMERGENT_LLM_KEY:
        return (
            f"Tu perfil dominante es **{primary}**. "
            f"{PRIMARY_DESCRIPTIONS.get(primary, '')} "
            "Configura EMERGENT_LLM_KEY para narrativa personalizada."
        )

    try:
        from llm_client import LlmChat, UserMessage  # type: ignore

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"disc_{uuid.uuid4().hex[:10]}",
            system_message=(
                "Eres un coach de ventas inmobiliarias. Genera narrativas "
                "personalizadas DISC para asesores. REGLAS:\n"
                "1) Máximo 80 palabras. Sin excepciones.\n"
                "2) Idioma es-MX. Sin emojis.\n"
                "3) Estructura: 1 frase identidad, 1 frase fortaleza venta, "
                "1 frase qué evitar.\n"
                "4) Ejemplo: 'Eres dominante: rápido en cerrar deals, "
                "prefieres clientes decisivos, evita micromanagement.'\n"
                "5) Tono profesional, accionable."
            ),
        ).with_model("anthropic", HAIKU_MODEL)

        prompt = (
            f"Perfil DISC del asesor:\n"
            f"- D (Dominante): {scores['D']}\n"
            f"- I (Influyente): {scores['I']}\n"
            f"- S (Estable): {scores['S']}\n"
            f"- C (Cauteloso): {scores['C']}\n"
            f"Dimensión primaria: {primary}\n\n"
            "Genera la narrativa siguiendo las reglas."
        )
        text = await chat.send_message(UserMessage(text=prompt))
        return (text or "").strip()
    except Exception as e:
        log.warning(f"[disc_test] narrative exception: {e}")
        return (
            f"Tu perfil dominante es **{primary}**. "
            f"{PRIMARY_DESCRIPTIONS.get(primary, '')}"
        )


# ─── Public API ───────────────────────────────────────────────────────────────

async def submit_disc(
    db,
    asesor_id: str,
    answers: List[Dict[str, str]],
) -> Dict[str, Any]:
    if not isinstance(answers, list) or len(answers) < len(QUESTIONS):
        raise ValueError(f"Se requieren {len(QUESTIONS)} respuestas")

    scores = _score_answers(answers)
    primary = _primary(scores)
    narrative = await _generate_narrative(scores, primary)

    doc = {
        "asesor_id": asesor_id,
        "answers": answers[:len(QUESTIONS)],
        "result": {**scores, "primary": primary},
        "narrative_text": narrative,
        "completed_at": _now(),
    }

    await db.asesor_disc_profiles.update_one(
        {"asesor_id": asesor_id},
        {"$set": doc},
        upsert=True,
    )

    try:
        from routes.dev_batch14 import log_activity
        await log_activity(
            db, actor_id=asesor_id, actor_type="asesor",
            action="disc_completed", entity_id=asesor_id,
            entity_type="asesor_disc_profile",
            metadata={"primary": primary},
        )
    except Exception as _e:
        log.warning("[audit] log_activity perdido (disc_completed asesor_disc_profile %s): %s",
                    asesor_id, _e)

    # Trust score bonus +5
    try:
        from services.trust_score import invalidate_trust_score
        await invalidate_trust_score(db, asesor_id)
    except Exception:
        pass

    out = dict(doc)
    out["completed_at"] = _iso(doc["completed_at"])
    return out


async def get_disc_profile(db, asesor_id: str) -> Optional[Dict[str, Any]]:
    doc = await db.asesor_disc_profiles.find_one(
        {"asesor_id": asesor_id}, {"_id": 0},
    )
    if not doc:
        return None
    if isinstance(doc.get("completed_at"), datetime):
        doc["completed_at"] = _iso(doc["completed_at"])
    return doc


async def delete_disc_profile(db, asesor_id: str) -> bool:
    r = await db.asesor_disc_profiles.delete_one({"asesor_id": asesor_id})
    if r.deleted_count > 0:
        try:
            from services.trust_score import invalidate_trust_score
            await invalidate_trust_score(db, asesor_id)
        except Exception:
            pass
        return True
    return False


async def ensure_disc_indexes(db) -> None:
    await db.asesor_disc_profiles.create_index("asesor_id", unique=True)
    log.info("[disc_test] indexes ensured")
