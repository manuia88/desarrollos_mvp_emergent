"""W5.x F4 Sub-A · Narrative Layer engine · LLM cross-feature storyteller.

NOTA: existe ya un `narrative_engine.py` (IE narratives Phase C2 · 677 lineas) que
NO debe sobreescribirse. Este archivo es el motor de la W5.x F4 Narrative Layer
(audiences, DISC, tax integration). Usa LLM Claude Sonnet via emergentintegrations.

Pipeline:
  1. Check cache (collection narrative_cache · TTL via ttl_until)
  2. collect facts (narrative_collector)
  3. collect tax block (narrative_collector · Sub-D)
  4. build prompt (narrative_templates)
  5. LLM call (Claude Sonnet · emergentintegrations.LlmChat)
  6. Parse JSON output · verify citations
  7. Cache + audit + budget tracking · fail-soft a template fallback
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from narrative_templates import AUDIENCE_PROFILES, build_prompt
from narrative_collector import (
    collect_for_unit,
    collect_for_project,
    collect_for_colonia,
    collect_for_lead_property,
    collect_tax_block,
)

log = logging.getLogger("dmx.narrative_layer")

COLLECTION = "narrative_cache"
DEFAULT_TTL_HOURS = 1
HIGH_CONFIDENCE_TTL_HOURS = 24
HIGH_CONFIDENCE_THRESHOLD = 0.85
LLM_MODEL = "claude-sonnet-4-5-20250929"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


async def _cache_get(db, scope: str, entity_id: str, audience: str, language: str, disc: Optional[str]) -> Optional[Dict[str, Any]]:
    try:
        doc = await db[COLLECTION].find_one(
            {"scope": scope, "entity_id": entity_id, "audience": audience, "language": language, "disc_overlay": disc},
            {"_id": 0},
        )
        if not doc:
            return None
        ttl_until = doc.get("ttl_until")
        if isinstance(ttl_until, str):
            try:
                ttl_dt = datetime.fromisoformat(ttl_until.replace("Z", "+00:00"))
            except Exception:
                return None
        else:
            ttl_dt = ttl_until
        if ttl_dt and ttl_dt < _now():
            return None
        return doc
    except Exception as e:  # noqa: BLE001
        log.warning(f"[narrative_layer] cache_get failed: {e}")
        return None


async def _cache_set(db, payload: Dict[str, Any]) -> None:
    try:
        key = {
            "scope": payload["scope"], "entity_id": payload["entity_id"],
            "audience": payload["audience"], "language": payload["language"],
            "disc_overlay": payload.get("disc_overlay"),
        }
        await db[COLLECTION].update_one(key, {"$set": payload}, upsert=True)
    except Exception as e:  # noqa: BLE001
        log.warning(f"[narrative_layer] cache_set failed: {e}")


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        pass
    # Fallback: localizar el primer JSON object dentro del texto
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def _template_fallback(audience: str, facts: Dict[str, Any], tax_block: Dict[str, Any]) -> Dict[str, Any]:
    """Narrative templated sin LLM · usado si la llamada al modelo falla."""
    profile = AUDIENCE_PROFILES.get(audience) or AUDIENCE_PROFILES["neutral"]
    bullets = []
    citations: List[Dict[str, str]] = []
    for k, v in facts.items():
        if k.startswith("_"):
            continue
        if isinstance(v, dict) and "value" in v:
            bullets.append(f"{k.replace('_', ' ')}: {v['value']} [{v.get('source', 'fuente interna')}]")
            citations.append({"claim": f"{k}: {v['value']}", "source": v.get("source", "fuente interna")})
    body = " · ".join(bullets[:6]) or "Datos en preparacion."
    long_txt = f"{profile['opening_hook']} {body}. {profile['closing_template']}"
    if tax_block:
        long_txt += " [Tax Projector F6]"
        citations.append({"claim": "estimado fiscal", "source": "Tax Projector F6"})
    medium_txt = body[:580]
    short_txt = (bullets[0] if bullets else "Datos disponibles · agenda visita.")[:278]
    return {
        "narrative_long": long_txt,
        "narrative_medium": medium_txt,
        "narrative_short": short_txt,
        "citations": citations,
        "confidence": 0.3,
        "fallback": True,
    }


def _has_numeric_citation(text: str, citations: List[Dict[str, Any]]) -> bool:
    """Heuristica simple: si hay numeros en el texto, debe haber al menos 1 citation."""
    if not text:
        return True
    if re.search(r"\d", text):
        return bool(citations)
    return True


async def _call_llm(system_prompt: str, user_prompt: str) -> Dict[str, Any]:
    """Invoca Claude Sonnet via emergentintegrations.LlmChat · retorna {text, tokens_in, tokens_out, ok}."""
    try:
        from llm_client import LlmChat, UserMessage as LlmUserMsg
    except Exception as e:  # noqa: BLE001
        log.warning(f"[narrative_layer] emergentintegrations import failed: {e}")
        return {"ok": False, "reason": "llm_unavailable"}

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return {"ok": False, "reason": "no_emergent_llm_key"}

    session_id = f"narrative_{uuid.uuid4().hex[:12]}"
    try:
        chat = (
            LlmChat(api_key=api_key, session_id=session_id, system_message=system_prompt)
            .with_model("anthropic", LLM_MODEL)
            .with_max_tokens(1500)
        )
        resp = await chat.send_message(LlmUserMsg(text=user_prompt))
        text = str(resp) if not isinstance(resp, str) else resp
        # tokens aproximados (no exactos cuando el SDK no los expone)
        return {"ok": True, "text": text, "tokens_in": len(user_prompt) // 4, "tokens_out": len(text) // 4}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[narrative_layer] LLM call failed: {e}")
        return {"ok": False, "reason": str(e)}


async def generate(
    db,
    scope: str,
    entity_id: str,
    audience: str = "neutral",
    language: str = "es-MX",
    disc: Optional[str] = None,
    force_refresh: bool = False,
    user_id: Optional[str] = None,
    custom_facts: Optional[Dict[str, Any]] = None,
    custom_tax_block: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Genera narrative (long/medium/short) para una entidad y audiencia.

    Args:
        custom_facts: si se pasa, NO consulta collections · usa directamente estos facts.
                      Útil para scope="comparison" u otros callers que ya tienen los facts pre-collected.
        custom_tax_block: igual que custom_facts pero para el bloque fiscal.
    """
    audience = audience if audience in AUDIENCE_PROFILES else "neutral"

    # 1) Cache (skip si custom_facts · estas narrativas son siempre on-demand)
    if not force_refresh and custom_facts is None:
        hit = await _cache_get(db, scope, entity_id, audience, language, disc)
        if hit:
            hit["cached"] = True
            return hit

    # 2) Facts (custom override > collections reales)
    if custom_facts is not None:
        facts = custom_facts
    elif scope == "unit":
        facts = await collect_for_unit(db, entity_id)
    elif scope == "project":
        facts = await collect_for_project(db, entity_id)
    elif scope == "colonia":
        facts = await collect_for_colonia(db, entity_id)
    elif scope == "lead_property":
        try:
            lead_id, property_id = entity_id.split(":", 1)
        except ValueError:
            facts = {}
        else:
            facts = await collect_for_lead_property(db, lead_id, property_id)
    else:
        facts = {}

    # 3) Tax block (Sub-D)
    if custom_tax_block is not None:
        tax_block = custom_tax_block
    else:
        try:
            tax_block = await collect_tax_block(db, scope, entity_id, audience)
        except Exception as e:  # noqa: BLE001
            log.warning(f"[narrative_layer] tax_block failed: {e}")
            tax_block = {}

    # 4) Prompt
    prompts = build_prompt(audience, disc, facts, tax_block, language)

    # 5) LLM
    t0 = time.time()
    llm = await _call_llm(prompts["system_prompt"], prompts["user_prompt"])
    elapsed_ms = int((time.time() - t0) * 1000)

    parsed: Optional[Dict[str, Any]] = None
    if llm.get("ok"):
        parsed = _extract_json(llm.get("text", ""))

    fallback_used = False
    if not parsed or not parsed.get("narrative_long"):
        # Fallback templated
        parsed = _template_fallback(audience, facts, tax_block)
        fallback_used = True

    confidence = float(parsed.get("confidence") or (0.3 if fallback_used else 0.6))
    citations = parsed.get("citations") or []

    # Cita check: si confidence sugiere > 0.5 y no hay citations + hay numeros → bajar confidence
    long_t = (parsed.get("narrative_long") or "")[:5000]
    medium_t = (parsed.get("narrative_medium") or "")[:600]
    short_t = (parsed.get("narrative_short") or "")[:280]
    if not _has_numeric_citation(long_t, citations) and confidence > 0.5:
        confidence = 0.5

    if fallback_used:
        confidence = min(confidence, 0.3)

    # Budget + audit (best-effort · firmas reales main)
    try:
        from ai_budget import track_ai_call  # type: ignore
        if llm.get("ok"):
            t_in = int(llm.get("tokens_in") or 0)
            t_out = int(llm.get("tokens_out") or 0)
            await track_ai_call(
                db,
                dev_org_id=user_id or "anon",
                model="claude-sonnet-4-5",
                tokens=t_in + t_out,
                call_type="narrative",
                tokens_in=t_in,
                tokens_out=t_out,
                feature_key="narrative_layer",
            )
    except Exception:
        pass
    try:
        from audit_immutable_engine import log as _audit_log  # type: ignore
        await _audit_log(
            db,
            actor={"user_id": user_id or "system", "role": "system"},
            action="narrative_generated",
            entity_type=f"narrative:{scope}",
            entity_id=entity_id,
            after={
                "audience": audience,
                "fallback": fallback_used,
                "tokens_used": int((llm.get("tokens_in") or 0) + (llm.get("tokens_out") or 0)),
            },
        )
    except Exception:
        # audit es best-effort · no rompe la generacion
        pass

    ttl_hours = HIGH_CONFIDENCE_TTL_HOURS if confidence >= HIGH_CONFIDENCE_THRESHOLD else DEFAULT_TTL_HOURS
    ttl_until = _now() + timedelta(hours=ttl_hours)

    payload = {
        "id": uuid.uuid4().hex,
        "scope": scope,
        "entity_id": entity_id,
        "audience": audience,
        "language": language,
        "disc_overlay": disc,
        "narrative_long": long_t,
        "narrative_medium": medium_t,
        "narrative_short": short_t,
        "used_facts": [
            {"key": k, "value": (v.get("value") if isinstance(v, dict) else v), "source": (v.get("source") if isinstance(v, dict) else "")}
            for k, v in facts.items() if not k.startswith("_")
        ],
        "citations": citations,
        "confidence": round(confidence, 3),
        "fallback": fallback_used,
        "elapsed_ms": elapsed_ms,
        "model": LLM_MODEL if llm.get("ok") else "templated_fallback",
        "generated_at": _iso(_now()),
        "ttl_until": _iso(ttl_until),
        "tax_block_used": bool(tax_block),
    }

    # Skip cache si custom_facts (narrativas on-demand · no contaminamos cache)
    if custom_facts is None:
        await _cache_set(db, payload)
    payload["cached"] = False
    return payload


async def ensure_indexes(db) -> None:
    """Indexes para narrative_cache · compound unique + TTL sobre ttl_until."""
    try:
        await db[COLLECTION].create_index(
            [("scope", 1), ("entity_id", 1), ("audience", 1), ("language", 1), ("disc_overlay", 1)],
            unique=True,
            name="narrative_layer_compound",
        )
        # TTL no aplica directo sobre string ISO · usamos check en _cache_get
        await db[COLLECTION].create_index("generated_at")
    except Exception as e:  # noqa: BLE001
        log.warning(f"[narrative_layer] ensure_indexes failed: {e}")
