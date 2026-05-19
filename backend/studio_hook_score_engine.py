"""W5.22 Z.2 Sub-B — Studio Hook Score Engine.

Evalua el "gancho" de un copy de carrusel en escala 0-100.
Dimensiones: clarity (25) + CTA (25) + novelty (25) + urgency (25).

Si score < hook_score_min al generar carrusel → 422 con suggestion (gate de calidad).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.studio_hook_score")

CLAUDE_MODEL = "claude-sonnet-4-5-20250929"
OPENAI_MODEL = "gpt-4o-mini"


def _score_prompt(text: str, language: str) -> str:
    lang_note = "El texto esta en español." if language == "es-MX" else "The text is in English."
    return f"""Eres un experto en copywriting para marketing inmobiliario en redes sociales.
Evalua el siguiente texto de carrusel en 4 dimensiones (0-25 cada una):

TEXTO:
{text[:2000]}

{lang_note}

DIMENSIONES:
1. clarity (0-25): Claridad del mensaje principal. ¿Se entiende de inmediato qué se ofrece?
2. cta (0-25): Efectividad del llamado a la accion. ¿Es específico, urgente y claro?
3. novelty (0-25): Novedad y diferenciacion. ¿Evita clichés del sector inmobiliario?
4. urgency (0-25): Sentido de urgencia o relevancia temporal. ¿Por que actuar ahora?

FORMATO (JSON estricto, sin texto adicional):
{{
  "scores": {{
    "clarity": <int 0-25>,
    "cta": <int 0-25>,
    "novelty": <int 0-25>,
    "urgency": <int 0-25>
  }},
  "total": <int 0-100>,
  "suggestion": "<texto de mejora en 1-2 oraciones, idioma del texto>"
}}"""


async def _call_llm(prompt: str, provider: str = "anthropic") -> str:
    from emergentintegrations.llm.chat import LlmChat, UserMessage as LlmUserMsg
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY no configurado")
    model = CLAUDE_MODEL if provider == "anthropic" else OPENAI_MODEL
    chat = LlmChat(
        api_key=api_key,
        session_id=f"hook_score_{id(prompt)}",
        system_message="Responde siempre con JSON valido. Solo JSON, sin markdown.",
    ).with_model(provider, model)
    return await chat.send_message(LlmUserMsg(text=prompt))


async def compute_hook_score(text: str, language: str = "es-MX") -> Dict[str, Any]:
    """Computa hook score 0-100 + breakdown. Usado por gate en carrusel/generate."""
    if not text or not text.strip():
        return {
            "total": 0,
            "scores": {"clarity": 0, "cta": 0, "novelty": 0, "urgency": 0},
            "suggestion": "El texto no puede estar vacio.",
        }
    prompt = _score_prompt(text.strip(), language)
    try:
        raw = await asyncio.wait_for(_call_llm(prompt, "anthropic"), timeout=25.0)
    except (asyncio.TimeoutError, Exception) as e:
        log.warning(f"[hook_score] Claude failed ({e}), fallback OpenAI")
        try:
            raw = await asyncio.wait_for(_call_llm(prompt, "openai"), timeout=25.0)
        except Exception as e2:
            log.warning(f"[hook_score] OpenAI fallback failed: {e2}")
            return _heuristic_score(text)

    try:
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        if m:
            data = json.loads(m.group(0))
            scores = data.get("scores", {})
            total = data.get("total")
            if total is None:
                total = sum(scores.get(k, 0) for k in ("clarity", "cta", "novelty", "urgency"))
            return {
                "total": min(100, max(0, int(total))),
                "scores": {
                    "clarity": int(scores.get("clarity", 0)),
                    "cta": int(scores.get("cta", 0)),
                    "novelty": int(scores.get("novelty", 0)),
                    "urgency": int(scores.get("urgency", 0)),
                },
                "suggestion": str(data.get("suggestion", "")),
            }
    except Exception as e:
        log.warning(f"[hook_score] parse failed: {e}, raw={raw[:200]}")

    return _heuristic_score(text)


def _heuristic_score(text: str) -> Dict[str, Any]:
    """Score heuristico cuando LLM falla."""
    t = text.lower()
    clichés = ["hogar de tus sueños", "no lo pierdas", "oportunidad única", "últimas unidades"]
    cta_words = ["agenda", "descarga", "contacta", "llama", "whatsapp", "visita", "schedule"]
    urgency_words = ["hoy", "ahora", "limited", "últimas", "cierra", "preventa", "last"]

    clarity = 18 if len(text) > 30 else 10
    cta = 20 if any(w in t for w in cta_words) else 8
    novelty = 20 - sum(5 for c in clichés if c in t)
    urgency = 20 if any(w in t for w in urgency_words) else 10
    total = max(0, clarity + cta + novelty + urgency)
    return {
        "total": total,
        "scores": {"clarity": clarity, "cta": cta, "novelty": max(0, novelty), "urgency": urgency},
        "suggestion": "Considera añadir un CTA concreto y evitar clichés del sector.",
    }
