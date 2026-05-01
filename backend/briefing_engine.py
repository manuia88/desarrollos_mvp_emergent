"""
IE Engine · Phase C3 — Briefing IE Comparador Asesor (Chunk 3).

Genera pitch de 2 párrafos + WhatsApp text con Claude Sonnet 4.5 usando
scores reales del development + colonia + (opcional) lead/contact profile.

Cache: 24h por (development_id, lead_id|null). Invalida si scores N1-N4 drift ≥5pts.
Cap budget: $5 USD/sesión rolling 1h.

Schema ie_advisor_briefings:
  { id, advisor_user_id, development_id, lead_id?, contact_id?,
    hook, headline_pros [array{score_code, score_value, score_label_es, narrative}],
    honest_caveats [array{same}], call_to_action, whatsapp_text,
    prompt_version, scores_snapshot, generated_at, expires_at,
    used (bool), feedback (nullable dict),
    model, cost_usd }
"""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from narrative_engine import (
    PRICE_IN_PER_1K, PRICE_OUT_PER_1K, SESSION_BUDGET_CAP_USD,
    _session_budget_used, _scores_changed, _build_snapshot, _ensure_aware,
    _fetch_scores_map,
)

PROMPT_VERSION = "v1.0"
CACHE_TTL_HOURS = 24

SCORE_LABEL_ES = {
    # Colonia N1-N2
    "IE_COL_AIRE": "Calidad del aire",
    "IE_COL_CLIMA_ISLA_CALOR": "Isla de calor",
    "IE_COL_CONECTIVIDAD_VIALIDAD": "Vialidad",
    "IE_COL_CULTURAL_MUSEOS": "Museos",
    "IE_COL_CULTURAL_PARQUES": "Parques",
    "IE_COL_CULTURAL_VIDA_NOCTURNA": "Vida nocturna",
    "IE_COL_DEMOGRAFIA_EDUCACION": "Escolaridad",
    "IE_COL_DEMOGRAFIA_ESTABILIDAD": "Estabilidad",
    "IE_COL_DEMOGRAFIA_FAMILIA": "Familias",
    "IE_COL_DEMOGRAFIA_INGRESO": "Ingreso",
    "IE_COL_DEMOGRAFIA_JOVEN": "Jóvenes",
    "IE_COL_PRECIO": "Precio m²",
    "IE_COL_PLUSVALIA_HIST": "Plusvalía histórica",
    "IE_COL_LIQUIDEZ": "Liquidez",
    "IE_COL_DEMANDA_NETA": "Demanda neta",
    # Proyecto N1-N2
    "IE_PROY_SCORE_VS_COLONIA": "Score vs colonia",
    "IE_PROY_SCORE_VS_CIUDAD": "Score vs ciudad",
    "IE_PROY_PRECIO_VS_MERCADO": "Precio vs mercado",
    "IE_PROY_AMENIDADES": "Amenidades",
    "IE_PROY_LISTING_HEALTH": "Calidad del listing",
    "IE_PROY_BADGE_TOP": "Top en su colonia",
    "IE_PROY_ABSORCION_VELOCIDAD": "Velocidad absorción",
    "IE_PROY_PRESALES_RATIO": "Preventa",
    "IE_PROY_MARCA_TRUST": "Confianza marca",
    "IE_PROY_DEVELOPER_TRUST": "Track record developer",
    "IE_PROY_DEVELOPER_DELIVERY_HIST": "Delivery histórico",
    "IE_PROY_COMPETITION_PRESSURE": "Presión competencia",
    # N4
    "IE_COL_PLUSVALIA_PROYECTADA": "Plusvalía proyectada 5y",
    "IE_PROY_DAYS_TO_SELLOUT": "Días a sellout",
    "IE_PROY_ROI_BUYER": "ROI comprador 5y",
}


SYSTEM_PROMPT = """Eres analista DMX que genera pitches de venta data-backed para asesores inmobiliarios CDMX. 
Tono profesional, claro, en es-MX. 

REGLAS INMUTABLES:
- NUNCA inventes datos. Solo cita scores que estén en el input.
- Si un score es rojo/ámbar, encuadra honesto. NO fearmongering.
- Si IE_PROY_ROI_BUYER es tier=red, encuadra como "patrimonial a largo plazo" + caveat sobre liquidez vs CETES. Tono educativo, NO transaccional.
- Cita scores específicos con sus values (ej. "ABSORCION 58%" no "buena absorción").
- CTA debe sugerir siguiente paso concreto (visita, comparativa, llamada).
- whatsapp_text: ≤800 chars, plain text, sin markdown, SIN emojis (ni ✅ ni ⚠️ ni ninguno), legible en móvil, cita 2-3 scores clave y CTA. Usa "+" para pros y "-" para caveats si necesitas separadores.
- Output: EXCLUSIVAMENTE JSON válido con exactamente las keys: hook, headline_pros, honest_caveats, call_to_action, whatsapp_text, context_hint.
- headline_pros: 4-6 items con estructura {score_code, score_value, score_label_es, narrative (1 frase concreta)}
- honest_caveats: 2 items con la misma estructura
- Idioma: español México (es-MX).
"""


def _build_user_prompt(
    dev_name: str,
    colonia: str,
    asesor_name: str,
    proj_scores: Dict[str, Dict[str, Any]],
    col_scores: Dict[str, Dict[str, Any]],
    narrative_proj: Optional[str],
    lead: Optional[Dict[str, Any]],
    contact: Optional[Dict[str, Any]],
) -> str:
    lines = [f"Genera briefing para asesor {asesor_name} sobre desarrollo {dev_name} en {colonia}.", ""]
    lines.append("SCORES PROYECTO REALES:")
    for code, d in sorted(proj_scores.items()):
        if d.get("value") is None:
            continue
        label = SCORE_LABEL_ES.get(code, code)
        lines.append(f"  - {code} ({label}): {d['value']} · tier {d.get('tier','?')}")
    lines.append("")
    lines.append("SCORES COLONIA REALES:")
    for code, d in sorted(col_scores.items()):
        if d.get("value") is None:
            continue
        label = SCORE_LABEL_ES.get(code, code)
        lines.append(f"  - {code} ({label}): {d['value']} · tier {d.get('tier','?')}")
    lines.append("")
    if narrative_proj:
        lines.append("NARRATIVA AI EXISTENTE (referencia, NO copies textual):")
        lines.append(f"  {narrative_proj}")
        lines.append("")
    if lead:
        lines.append("LEAD PROFILE:")
        for k, v in lead.items():
            lines.append(f"  - {k}: {v}")
        lines.append("")
    elif contact:
        lines.append("CONTACTO PROFILE:")
        for k, v in contact.items():
            lines.append(f"  - {k}: {v}")
        lines.append("")
    lines.append("Genera JSON válido con: hook, headline_pros (4-6), honest_caveats (2), call_to_action, whatsapp_text (≤800 chars plain), context_hint (frase corta si hay lead/contacto, null si no).")
    return "\n".join(lines)


async def _generate_briefing(system_prompt: str, user_prompt: str, session_key: str) -> Dict[str, Any]:
    """Single Claude call. Returns parsed JSON dict + cost tracking."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY no configurado")
    model = "claude-sonnet-4-5-20250929"
    chat = LlmChat(
        api_key=api_key, session_id=session_key,
        system_message=system_prompt,
    ).with_model("anthropic", model)

    resp = await chat.send_message(UserMessage(text=user_prompt))
    text = (resp or "").strip()
    # Strip potential markdown fences
    if text.startswith("```"):
        text = text.split("```", 2)[1].lstrip("json").lstrip("\n").strip()
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0].strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        # Second-chance: find first { and last }
        try:
            start = text.index("{"); end = text.rindex("}")
            parsed = json.loads(text[start:end+1])
        except Exception as e:
            raise RuntimeError(f"Claude response no es JSON válido: {e}. Raw: {text[:200]}")

    in_tokens = len(user_prompt) // 4 + len(system_prompt) // 4
    out_tokens = len(text) // 4
    cost = (in_tokens / 1000.0) * PRICE_IN_PER_1K + (out_tokens / 1000.0) * PRICE_OUT_PER_1K

    return {
        "parsed": parsed,
        "model": model,
        "input_tokens": in_tokens,
        "output_tokens": out_tokens,
        "cost_usd": round(cost, 6),
    }


async def get_or_generate_briefing(
    db,
    advisor_user_id: str,
    advisor_name: str,
    development_id: str,
    lead_id: Optional[str] = None,
    contact_id: Optional[str] = None,
    force: bool = False,
) -> Dict[str, Any]:
    """Main entry point. Returns briefing doc ready for UI."""
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(development_id)
    if not dev:
        raise HTTPException(404, f"Desarrollo {development_id} no existe")

    proj_scores = await _fetch_scores_map(db, development_id)
    col_zone = (dev.get("colonia_id") or "").replace("-", "_")
    col_scores = await _fetch_scores_map(db, col_zone) if col_zone else {}

    if not proj_scores:
        raise HTTPException(422, "Proyecto sin scores reales aún. Ejecuta recompute-all primero.")

    # Cache lookup by (advisor, dev, lead|contact|none)
    cache_key = {
        "advisor_user_id": advisor_user_id,
        "development_id": development_id,
        "lead_id": lead_id,
        "contact_id": contact_id,
        "prompt_version": PROMPT_VERSION,
    }
    existing = await db.ie_advisor_briefings.find_one(cache_key, {"_id": 0}, sort=[("generated_at", -1)])
    now = datetime.now(timezone.utc)
    all_snapshot_scores = {**proj_scores, **{f"col_{k}": v for k, v in col_scores.items()}}
    cache_valid = (
        existing and existing.get("expires_at")
        and _ensure_aware(existing["expires_at"]) > now
        and not _scores_changed(existing.get("scores_snapshot", {}), all_snapshot_scores)
        and not force
    )
    if cache_valid:
        return {**existing, "cache_hit": True}

    # Budget gate
    used = await _session_budget_used(db)
    if used >= SESSION_BUDGET_CAP_USD:
        if existing:
            return {**existing, "cache_hit": True, "stale": True}
        raise HTTPException(429, f"Cap LLM alcanzado ({used:.2f}/${SESSION_BUDGET_CAP_USD}). Reintenta en 1h.")

    # Gather optional context
    lead = None
    contact = None
    if lead_id:
        lead_doc = await db.asesor_leads.find_one({"id": lead_id}, {"_id": 0}) or \
                   await db.asesor_busquedas.find_one({"id": lead_id}, {"_id": 0})
        if lead_doc:
            lead = {k: lead_doc.get(k) for k in ("budget_min", "budget_max", "beds", "intent_tags", "lookalike_score", "colonias_target") if lead_doc.get(k) is not None}
    if not lead and contact_id:
        contact_doc = await db.asesor_contactos.find_one({"id": contact_id}, {"_id": 0})
        if contact_doc:
            contact = {k: contact_doc.get(k) for k in ("first_name", "last_name", "temperatura", "tipo", "tags", "notas") if contact_doc.get(k) is not None}

    # Fetch proyecto narrative for context (reference only, don't copy)
    narrative_doc = await db.ie_narratives.find_one(
        {"scope": "development", "entity_id": development_id, "prompt_version": "v1.0"},
        {"_id": 0}, sort=[("generated_at", -1)],
    )
    narrative_proj = narrative_doc["narrative_text"] if narrative_doc else None

    user_prompt = _build_user_prompt(
        dev_name=dev.get("name"), colonia=dev.get("colonia", ""),
        asesor_name=advisor_name, proj_scores=proj_scores, col_scores=col_scores,
        narrative_proj=narrative_proj, lead=lead, contact=contact,
    )
    session_key = f"briefing_{advisor_user_id}_{development_id}_{lead_id or contact_id or 'none'}_{int(now.timestamp())}"
    out = await _generate_briefing(SYSTEM_PROMPT, user_prompt, session_key)

    # Enrich headline_pros and caveats with label_es if missing (defensive)
    for bucket in ("headline_pros", "honest_caveats"):
        for item in out["parsed"].get(bucket, []) or []:
            code = item.get("score_code")
            if code and not item.get("score_label_es"):
                item["score_label_es"] = SCORE_LABEL_ES.get(code, code)

    # Hard cap whatsapp_text
    wpt = out["parsed"].get("whatsapp_text") or ""
    if len(wpt) > 800:
        wpt = wpt[:797].rstrip() + "…"
    out["parsed"]["whatsapp_text"] = wpt

    doc = {
        "id": uuid.uuid4().hex,
        "advisor_user_id": advisor_user_id,
        "development_id": development_id,
        "lead_id": lead_id,
        "contact_id": contact_id,
        "hook": out["parsed"].get("hook", ""),
        "headline_pros": out["parsed"].get("headline_pros", []) or [],
        "honest_caveats": out["parsed"].get("honest_caveats", []) or [],
        "call_to_action": out["parsed"].get("call_to_action", ""),
        "whatsapp_text": wpt,
        "context_hint": out["parsed"].get("context_hint"),
        "prompt_version": PROMPT_VERSION,
        "scores_snapshot": _build_snapshot(all_snapshot_scores),
        "generated_at": now,
        "expires_at": now + timedelta(hours=CACHE_TTL_HOURS),
        "used": False,
        "feedback": None,
        "model": out["model"],
        "input_tokens": out["input_tokens"],
        "output_tokens": out["output_tokens"],
        "cost_usd": out["cost_usd"],
    }
    # Also persist in ie_narratives so budget cap includes briefings
    await db.ie_narratives.insert_one({
        "id": uuid.uuid4().hex, "scope": "briefing", "entity_id": doc["id"],
        "narrative_text": doc["hook"],
        "prompt_version": PROMPT_VERSION, "scores_snapshot": doc["scores_snapshot"],
        "generated_at": now, "expires_at": doc["expires_at"],
        "model": out["model"], "input_tokens": out["input_tokens"],
        "output_tokens": out["output_tokens"], "cost_usd": out["cost_usd"],
    })
    await db.ie_advisor_briefings.insert_one(doc)
    doc.pop("_id", None)
    return {**doc, "cache_hit": False}


# ─── Router ─────────────────────────────────────────────────────────────────
router = APIRouter(prefix="/api/asesor", tags=["briefing-ie"])


class BriefingRequest(BaseModel):
    development_id: str
    lead_id: Optional[str] = None
    contact_id: Optional[str] = None
    force: bool = False


class FeedbackRequest(BaseModel):
    result: str  # closed_lead | didnt_close | partial
    comments: Optional[str] = None


@router.post("/briefing-ie")
async def create_briefing(payload: BriefingRequest, request: Request):
    from routes_advisor import require_advisor
    user = await require_advisor(request)
    db = request.app.state.db
    doc = await get_or_generate_briefing(
        db, user.user_id, user.name or user.email or "Asesor",
        payload.development_id, payload.lead_id, payload.contact_id, payload.force,
    )
    return _serialize(doc)


@router.get("/briefing-ie/{briefing_id}")
async def get_briefing(briefing_id: str, request: Request):
    from routes_advisor import require_advisor
    user = await require_advisor(request)
    db = request.app.state.db
    doc = await db.ie_advisor_briefings.find_one({"id": briefing_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Briefing no existe")
    # Owner or asesor_admin
    if doc.get("advisor_user_id") != user.user_id and user.role not in ("asesor_admin", "superadmin"):
        raise HTTPException(403, "No tienes acceso a este briefing")
    return _serialize(doc)


@router.post("/briefing-ie/{briefing_id}/feedback")
async def submit_feedback(briefing_id: str, payload: FeedbackRequest, request: Request):
    from routes_advisor import require_advisor
    user = await require_advisor(request)
    db = request.app.state.db
    if payload.result not in ("closed_lead", "didnt_close", "partial", "marked_used"):
        raise HTTPException(400, "result inválido")
    doc = await db.ie_advisor_briefings.find_one({"id": briefing_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Briefing no existe")
    if doc.get("advisor_user_id") != user.user_id and user.role not in ("asesor_admin", "superadmin"):
        raise HTTPException(403, "No autorizado")
    upd = {"feedback": {"result": payload.result, "comments": payload.comments, "ts": datetime.now(timezone.utc)}}
    if payload.result == "marked_used":
        upd["used"] = True
        upd.pop("feedback", None)
    else:
        upd["used"] = True
    await db.ie_advisor_briefings.update_one({"id": briefing_id}, {"$set": upd})
    return {"ok": True, "briefing_id": briefing_id}


@router.get("/briefings")
async def list_briefings(request: Request, limit: int = Query(50, ge=1, le=200), only_mine: bool = Query(True)):
    from routes_advisor import require_advisor
    user = await require_advisor(request)
    db = request.app.state.db
    q: Dict[str, Any] = {}
    if only_mine or user.role == "advisor":
        q["advisor_user_id"] = user.user_id
    docs = await db.ie_advisor_briefings.find(q, {"_id": 0}).sort("generated_at", -1).limit(limit).to_list(length=limit)
    return [_serialize(d) for d in docs]


@router.get("/briefings/summary")
async def briefings_summary(request: Request):
    """Widget /asesor dashboard: count + closed % + 3 recent."""
    from routes_advisor import require_advisor
    user = await require_advisor(request)
    db = request.app.state.db
    since = datetime.now(timezone.utc) - timedelta(days=7)
    q = {"advisor_user_id": user.user_id, "generated_at": {"$gte": since}}
    total = await db.ie_advisor_briefings.count_documents(q)
    closed = await db.ie_advisor_briefings.count_documents({**q, "feedback.result": "closed_lead"})
    partial = await db.ie_advisor_briefings.count_documents({**q, "feedback.result": "partial"})
    with_feedback = await db.ie_advisor_briefings.count_documents({**q, "feedback": {"$ne": None}})
    recent = await db.ie_advisor_briefings.find(q, {"_id": 0}).sort("generated_at", -1).limit(3).to_list(3)
    return {
        "count_7d": total,
        "with_feedback": with_feedback,
        "closed": closed,
        "partial": partial,
        "closed_pct": round((closed / with_feedback * 100), 1) if with_feedback else None,
        "recent": [_serialize(d, light=True) for d in recent],
    }


def _serialize(doc: Dict[str, Any], light: bool = False) -> Dict[str, Any]:
    """Strip MongoDB artifacts + optionally reduce payload for list views."""
    if not doc:
        return {}
    out = {k: v for k, v in doc.items() if k != "_id"}
    # enrich with dev name for UI convenience
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        dev = DEVELOPMENTS_BY_ID.get(out.get("development_id"))
        if dev:
            out["development_name"] = dev.get("name")
            out["development_colonia"] = dev.get("colonia")
    except ImportError:
        pass
    if light:
        keep = {"id", "development_id", "development_name", "development_colonia",
                "lead_id", "contact_id", "generated_at", "used", "feedback",
                "hook", "cache_hit"}
        out = {k: v for k, v in out.items() if k in keep}
    return out


async def ensure_indexes(db):
    await db.ie_advisor_briefings.create_index([("advisor_user_id", 1), ("generated_at", -1)])
    await db.ie_advisor_briefings.create_index([
        ("advisor_user_id", 1), ("development_id", 1),
        ("lead_id", 1), ("contact_id", 1), ("prompt_version", 1),
    ])
    await db.ie_advisor_briefings.create_index([("expires_at", 1)])
