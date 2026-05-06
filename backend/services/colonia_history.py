"""Phase 4 Batch 27 · services — Colonia History (Claude Sonnet 4.5).

Genera narrativa de pasado (20 años) + futuro (10 años) por colonia.
Cache 7 días en `db.colonia_history`. Gating vía ai_budget.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.colonia_history")

CACHE_DAYS = 7
MODEL = "claude-sonnet-4-5-20250929"


SYSTEM_PROMPT = """Eres un analista urbano experto en CDMX y mercado inmobiliario LATAM.
Tu trabajo: generar UN análisis estructurado de la historia (últimos 20 años) y proyección
(próximos 10 años) de una colonia específica, basado en el contexto que recibes.

Reglas:
- TODO en español es-MX (México). Sin emojis.
- Devuelve EXCLUSIVAMENTE un JSON válido con la estructura solicitada.
- Sé específico, evita generalidades vacías. Cita números/eventos cuando el contexto los avale.
- Si el contexto está limitado, asume el promedio de su tier y sé conservador en las predicciones.
- past_milestones: 5-7 hitos clave entre los últimos 20 años (transformación urbana,
  gentrificación, infraestructura nueva, comercio, riesgos materializados).
- future_projections: 3-5 predicciones a 5-10 años con confidence_pct (0-100), drivers (lista corta),
  risks (lista corta) y precio_proyectado_m2 si aplica.
- summary_text: 2-3 párrafos cortos (máx 600 caracteres en total) integrando pasado y futuro."""


JSON_SHAPE_HINT = """{
  "past_milestones": [
    {"year": 2008, "event": "string", "impact_pct": 12}
  ],
  "future_projections": [
    {
      "year": 2030,
      "prediction": "string",
      "confidence_pct": 75,
      "drivers": ["string", "string"],
      "risks": ["string"],
      "precio_proyectado_m2": 95000
    }
  ],
  "summary_text": "string"
}"""


def _build_user_prompt(colonia_data: Dict[str, Any]) -> str:
    col = colonia_data.get("colonia", {})
    scores = colonia_data.get("scores", {})
    twin = colonia_data.get("climate_twin", {})
    risks = colonia_data.get("risks", {})
    return (
        f"Colonia: {col.get('nombre', '—')} ({col.get('alcaldia', '—')}, CDMX). "
        f"Tier: {col.get('tier', '—')}.\n"
        f"Precio promedio actual: ${colonia_data.get('avg_price_m2', 0):,} MXN/m².\n"
        f"Momentum 90d: {colonia_data.get('momentum_label', '—')}. "
        f"Proyectos activos: {colonia_data.get('projects_count', 0)}.\n"
        f"Scores IE: vida={scores.get('vida','—')}, seguridad={scores.get('seguridad','—')}, "
        f"plusvalia={scores.get('plusvalia','—')}, movilidad={scores.get('movilidad','—')}, "
        f"comercio={scores.get('comercio','—')}.\n"
        f"Climate Twin: {twin.get('city','—')} ({twin.get('country','—')}, "
        f"{twin.get('similarity_pct', 0)}% similitud) — {twin.get('description','')}\n"
        f"Riesgos: inundación={risks.get('flood','—')}, sismo={risks.get('seismic','—')}, "
        f"robo={risks.get('theft','—')}, calor={risks.get('heat_stress','—')}.\n\n"
        f"Devuelve un JSON con esta forma exacta (sin markdown):\n{JSON_SHAPE_HINT}"
    )


def _empty_payload(colonia_nombre: str = "") -> Dict[str, Any]:
    return {
        "past_milestones": [],
        "future_projections": [],
        "summary_text": (
            f"Historia de {colonia_nombre} disponible cuando completemos análisis con IA. "
            "Vuelve en breve."
        ),
        "mock": True,
    }


async def _call_claude(user_prompt: str) -> Optional[Dict[str, Any]]:
    """Invoca Claude Sonnet vía emergentintegrations. Devuelve dict parseado o None."""
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        log.warning("[colonia_history] EMERGENT_LLM_KEY missing — returning mock")
        return None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=api_key,
            session_id="dmx_colonia_history",
            system_message=SYSTEM_PROMPT,
        ).with_model("anthropic", MODEL)
        raw = await chat.send_message(UserMessage(text=user_prompt))
        text = (raw or "").strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"): lines = lines[1:]
            if lines and lines[-1].startswith("```"): lines = lines[:-1]
            text = "\n".join(lines).strip()
        try:
            return json.loads(text)
        except Exception:
            s, e = text.find("{"), text.rfind("}")
            if 0 <= s < e:
                return json.loads(text[s:e + 1])
            return None
    except Exception as ex:
        log.warning(f"[colonia_history] Claude call failed: {ex}")
        return None


async def generate_colonia_history(db, colonia_id: str) -> Dict[str, Any]:
    """Genera (o lee de cache) la historia + proyección de una colonia."""
    # ── Cache hit ─────────────────────────────────────────────────────────────
    try:
        cached = await db.colonia_history.find_one({"colonia_id": colonia_id}, {"_id": 0})
        if cached:
            ts = cached.get("generated_at")
            if isinstance(ts, datetime):
                age = datetime.now(timezone.utc) - ts.replace(tzinfo=ts.tzinfo or timezone.utc)
                if age < timedelta(days=CACHE_DAYS):
                    return {**cached, "from_cache": True}
    except Exception as ex:
        log.debug(f"[colonia_history] cache read failed: {ex}")

    # ── Build context ─────────────────────────────────────────────────────────
    from services.colonia_intelligence import get_colonia_full
    colonia_data = await get_colonia_full(db, colonia_id)
    if not colonia_data or not colonia_data.get("colonia"):
        return None  # caller should 404

    user_prompt = _build_user_prompt(colonia_data)
    parsed = await _call_claude(user_prompt)

    if not parsed or not isinstance(parsed, dict):
        nombre = colonia_data["colonia"].get("nombre", colonia_id)
        return {
            "colonia_id": colonia_id,
            "colonia_nombre": nombre,
            **_empty_payload(nombre),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    # Normalizar arrays
    past = parsed.get("past_milestones", []) or []
    future = parsed.get("future_projections", []) or []
    if not isinstance(past, list): past = []
    if not isinstance(future, list): future = []

    payload = {
        "colonia_id": colonia_id,
        "colonia_nombre": colonia_data["colonia"].get("nombre", colonia_id),
        "past_milestones": past[:7],
        "future_projections": future[:5],
        "summary_text": (parsed.get("summary_text") or "").strip()[:1200],
        "generated_at": datetime.now(timezone.utc),
        "model": MODEL,
        "mock": False,
    }

    # ── Cache write ───────────────────────────────────────────────────────────
    try:
        await db.colonia_history.update_one(
            {"colonia_id": colonia_id},
            {"$set": payload},
            upsert=True,
        )
    except Exception as ex:
        log.debug(f"[colonia_history] cache write failed: {ex}")

    # ── ai_budget tracking (best-effort, single shared bucket public_marketplace) ─
    try:
        from ai_budget import track_ai_call
        approx_tokens = (len(user_prompt) + len(json.dumps(parsed))) // 4
        await track_ai_call(
            db, dev_org_id="public_marketplace", model=MODEL,
            tokens=approx_tokens, call_type="colonia_history",
        )
    except Exception:
        pass

    # Reutilizar dict pero con `generated_at` ISO-string en la respuesta JSON
    out = dict(payload)
    out["generated_at"] = payload["generated_at"].isoformat()
    out["from_cache"] = False
    return out
