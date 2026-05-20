"""W5.22 Z.8.7 Sub-B · Template → prompt dispatcher.

TEMPLATE_REGISTRY mapea los 10 template_keys a Z8_PROMPT_NN_NAME.md.
Si el .md de un template no existe en memory/ se devuelve un FALLBACK_PROMPT base
(no rompe el flujo · permite shipping antes de que memory/Z8_*.md esten listos).
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, Optional

from .loader import load_prompt_md
from .llm_client import call_llm

log = logging.getLogger("dmx.studio_copy_router")

# Spec ordering (asumido del index Z8_TEMPLATE_PROMPTS_INDEX.md)
TEMPLATE_REGISTRY: Dict[str, str] = {
    "luxury":         "Z8_PROMPT_01_LUXURY.md",
    "investor":       "Z8_PROMPT_02_INVESTOR.md",
    "family":         "Z8_PROMPT_03_FAMILY.md",
    "first_home":     "Z8_PROMPT_04_FIRST_HOME.md",
    "boutique":       "Z8_PROMPT_05_BOUTIQUE.md",
    "urgent":         "Z8_PROMPT_06_URGENT.md",
    "social_proof":   "Z8_PROMPT_07_SOCIAL_PROOF.md",
    "compare":        "Z8_PROMPT_08_COMPARE.md",
    "video_first":    "Z8_PROMPT_09_VIDEO_FIRST.md",
    "scrollytelling": "Z8_PROMPT_10_SCROLLYTELLING.md",
    # legacy alias
    "modern":         "Z8_PROMPT_03_FAMILY.md",
}


FALLBACK_PROMPT = """# DMX Studio · LANDING COPYWRITER (generic fallback)

Eres un copywriter inmobiliario experto en CDMX y LATAM. Tu mision es generar
copy estructurado en JSON para una landing de un proyecto inmobiliario.

Toma `project_data` (Pydantic-style dict) + `buyer_intent` ("live"/"invest"/"hybrid"/null)
+ `template_key` (luxury/investor/family/first_home/boutique/urgent/social_proof/compare/video_first/scrollytelling).

Reglas:
- Tono adaptado al template: luxury (sofisticado, exclusivo), investor (data-driven),
  family (calido), first_home (accesible), boutique (artesanal), urgent (escasez),
  social_proof (testimonios), compare (datos comparativos), video_first (cinematografico),
  scrollytelling (narrativo).
- Espanol es-MX nativo · cero anglicismos innecesarios · cero emojis.
- 12 secciones standard: hero, property_showcase, gallery, video, map, stats,
  features, testimonials, lead_form, calendar_booking, price_table, faq, countdown, footer.
- Salida ESTRICTAMENTE en JSON valido siguiendo el siguiente schema:
{
  "hero": {"headline": str, "subhead": str, "primary_cta": {"text": str}},
  "stats": [{"label": str, "value": str}],
  "features": [{"title": str, "description": str, "icon": str}],
  "testimonials": [{"author": str, "role": str, "quote": str, "rating": int}],
  "lead_form": {"headline": str, "submit_text": str, "success_message": str},
  "cta": {"primary": {"text": str}, "secondary": {"text": str}},
  "faq": [{"question": str, "answer": str}],
  "footer_legal": str,
  "meta": {"title": str, "description": str, "keywords": [str]}
}

Genera copy en este JSON · NO incluyas texto fuera del JSON.
"""


def get_prompt_for_template(template_key: str) -> str:
    """Devuelve el prompt .md correspondiente al template.

    Si la entry no existe → KeyError.
    Si el .md no existe en memory/ → log warning y retorna FALLBACK_PROMPT.
    """
    if template_key not in TEMPLATE_REGISTRY:
        raise KeyError(
            f"template_key desconocido: '{template_key}'. "
            f"Validos: {sorted(TEMPLATE_REGISTRY.keys())}"
        )
    filename = TEMPLATE_REGISTRY[template_key]
    try:
        return load_prompt_md(filename)
    except FileNotFoundError as exc:
        log.warning("[copy_router] %s · usando FALLBACK_PROMPT", exc)
        return FALLBACK_PROMPT


def build_llm_input(project_data: Dict[str, Any], template_key: str, buyer_intent: Optional[str]) -> str:
    """Construye el input del LLM: prompt + runtime block."""
    prompt = get_prompt_for_template(template_key)
    runtime_block = (
        "\n\n## RUNTIME INPUT\n"
        f"project_data = {json.dumps(project_data, default=str, ensure_ascii=False)}\n"
        f"buyer_intent = {json.dumps(buyer_intent)}"
    )
    return prompt + runtime_block


async def generate_copy(
    project_data: Dict[str, Any],
    template_key: str,
    buyer_intent: Optional[str] = None,
    force_regenerate: bool = False,
) -> Dict[str, Any]:
    """Invoca el LLM y retorna copy_json + tiempos.

    Returns:
        {"copy_json": dict, "cached": bool, "generation_time_ms": int, "fallback": bool}
    """
    import hashlib

    started = time.monotonic()
    canonical = json.dumps(project_data, sort_keys=True, default=str, ensure_ascii=False)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]
    cache_key = f"studio_copy:{template_key}:{buyer_intent or 'none'}:{digest}"

    prompt = build_llm_input(project_data, template_key, buyer_intent)
    result = await call_llm(prompt, cache_key, force_regenerate=force_regenerate)
    elapsed_ms = int((time.monotonic() - started) * 1000)
    return {
        "copy_json": result.get("data") if not result.get("fallback") else None,
        "cached": bool(result.get("cached")),
        "generation_time_ms": elapsed_ms,
        "fallback": bool(result.get("fallback")),
        "error": result.get("error"),
    }
