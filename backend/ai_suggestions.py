"""Phase 4 Batch 16 · Sub-Chunk A — AI Suggestions Inline.

Generates contextual AI suggestions for entities (project / lead / unit / asesor / appointment)
using Claude Haiku via Emergent LLM Key. Cache 24h + on-demand regen.

Endpoints:
    GET   /api/ai/suggestions/{entity_type}/{entity_id}   ?force=1
    POST  /api/ai/suggestions/{suggestion_id}/dismiss
    POST  /api/ai/suggestions/{suggestion_id}/accept

Schema `ai_suggestions`:
    { id, entity_type, entity_id, dev_org_id,
      suggestion_type, title, body, cta_label, cta_action,
      status (active|dismissed|accepted),
      model, cost_usd, generated_at, expires_at,
      dismissed_at?, dismissed_by?, accepted_at?, accepted_by? }
"""
from __future__ import annotations

import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

log = logging.getLogger("dmx.ai_suggestions")

router = APIRouter(tags=["ai_suggestions"])

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
CLAUDE_HAIKU_MODEL = "claude-haiku-4-5-20251001"
CACHE_TTL_HOURS = 24

VALID_ENTITY_TYPES = {"project", "lead", "unit", "asesor", "appointment"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _db(req: Request):
    return req.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    u = await get_current_user(req)
    if not u:
        raise HTTPException(401, "No autenticado")
    return u


def _tenant(user) -> str:
    return getattr(user, "tenant_id", None) or "default"


# ─── System prompts per entity_type ──────────────────────────────────────────
_SYSTEM_BASE = (
    "Eres un asistente DMX para el ecosistema inmobiliario mexicano. Generas sugerencias "
    "accionables, breves y 100 % en español de México (es-MX). Cero invención: solo usa "
    "los datos del contexto. Prohibido usar emojis o markdown. Responde EXCLUSIVAMENTE con "
    "JSON válido (sin backticks, sin texto extra) con el siguiente esquema:\n"
    '{"suggestions": [ {"suggestion_type": "next_action|risk|opportunity|insight", '
    '"title": "<= 60 chars", "body": "<= 180 chars", '
    '"cta_label": "<= 22 chars", "cta_action": "open_url:/ruta | log_activity | dismiss"} ]}\n'
    "Devuelve entre 1 y 3 sugerencias, priorizando la más accionable primero. "
    "Si no hay información suficiente, devuelve un array vacío."
)

_SYSTEM_BY_TYPE = {
    "project": (
        "Analiza este proyecto: salud general, unidades, leads recientes y salud del pipeline. "
        "Sugiere la siguiente acción del developer_admin (subir docs faltantes, revisar precio, "
        "contactar leads calientes, ajustar política de citas)."
    ),
    "lead": (
        "Analiza este lead: etapa en pipeline, último toque, score, canal, preferencias. "
        "Sugiere la siguiente acción del asesor (llamar, enviar ficha IE, agendar visita, "
        "enviar argumentario)."
    ),
    "unit": (
        "Analiza esta unidad: status, precio vs. mercado de la colonia, días en inventario, "
        "engagement. Sugiere acción del developer (ajustar precio, crear campaña, marcar "
        "reservada, generar render)."
    ),
    "asesor": (
        "Analiza el desempeño de este asesor: leads activos, citas, cierres, ranking. "
        "Sugiere acciones de mejora (formar en producto X, priorizar pipeline Y, revisar "
        "tareas vencidas)."
    ),
    "appointment": (
        "Analiza esta cita: proyecto, lead, asesor asignado, tiempo hasta la cita. "
        "Sugiere acciones de preparación (briefing IE, confirmar por WhatsApp, recordar "
        "ubicación, enviar material previo)."
    ),
}


async def _build_context(db, entity_type: str, entity_id: str) -> Dict[str, Any]:
    """Collect minimal real data about the entity for Claude prompt."""
    ctx: Dict[str, Any] = {"entity_type": entity_type, "entity_id": entity_id}
    try:
        if entity_type == "project":
            from projects_unified import get_project_by_slug, get_units_for_project
            p = await get_project_by_slug(db, entity_id)
            if p:
                units = await get_units_for_project(db, p)
                available = sum(1 for u in units if u.get("status") == "disponible")
                sold = sum(1 for u in units if u.get("status") == "vendido")
                ctx.update({
                    "name": p.get("name"),
                    "stage": p.get("stage"),
                    "colonia": p.get("colonia_id"),
                    "price_from": p.get("price_from"),
                    "price_to": p.get("price_to"),
                    "units_total": len(units),
                    "units_available": available,
                    "units_sold": sold,
                })
                # Health score component
                hs = await db.health_scores.find_one(
                    {"entity_type": "project", "entity_id": entity_id},
                    {"_id": 0, "score": 1, "components": 1, "trend_7d": 1},
                )
                if hs:
                    ctx["health_score"] = hs.get("score")
                    ctx["trend_7d"] = hs.get("trend_7d")
                # Leads count
                ctx["leads_active"] = await db.leads.count_documents({
                    "project_id": entity_id,
                    "lead_stage": {"$nin": ["cerrado_ganado", "cerrado_perdido"]},
                })
                ctx["leads_hot"] = await db.leads.count_documents({
                    "project_id": entity_id, "lead_stage": "negociacion",
                })
        elif entity_type == "lead":
            lead = await db.leads.find_one({"lead_id": entity_id}, {"_id": 0}) \
                or await db.leads.find_one({"id": entity_id}, {"_id": 0})
            if lead:
                ctx.update({
                    "name": lead.get("name"),
                    "stage": lead.get("lead_stage"),
                    "project_id": lead.get("project_id"),
                    "source": lead.get("source"),
                    "score": lead.get("score") or lead.get("heat_score"),
                    "last_touch_at": lead.get("last_touch_at"),
                    "assigned_to": lead.get("assigned_to"),
                    "days_since_last_touch": None,
                })
                if lead.get("last_touch_at"):
                    try:
                        lt = datetime.fromisoformat(lead["last_touch_at"].replace("Z", "+00:00"))
                        ctx["days_since_last_touch"] = (_now() - lt).days
                    except Exception:
                        pass
        elif entity_type == "unit":
            # entity_id format: "{dev_id}:{unit_id}" or just unit_id
            parts = entity_id.split(":")
            dev_id = parts[0] if len(parts) > 1 else ""
            unit_id = parts[-1]
            unit = None
            if dev_id:
                from data_developments import DEVELOPMENTS_BY_ID
                dev = DEVELOPMENTS_BY_ID.get(dev_id)
                if dev:
                    for u in dev.get("units", []):
                        if u.get("unit_id") == unit_id or u.get("id") == unit_id:
                            unit = u
                            break
            if not unit:
                unit = await db.units.find_one({"unit_id": unit_id}, {"_id": 0}) \
                    or await db.units.find_one({"id": unit_id}, {"_id": 0})
            if unit:
                ctx.update({
                    "unit_number": unit.get("unit_number") or unit.get("id"),
                    "status": unit.get("status"),
                    "price": unit.get("price"),
                    "sqm": unit.get("sqm"),
                    "beds": unit.get("beds"),
                    "baths": unit.get("baths"),
                    "level": unit.get("level"),
                    "project_id": dev_id or unit.get("project_id"),
                })
        elif entity_type == "asesor":
            user_doc = await db.users.find_one({"user_id": entity_id}, {"_id": 0, "password_hash": 0})
            if user_doc:
                ctx.update({
                    "name": user_doc.get("name"),
                    "role": user_doc.get("role"),
                    "tenant_id": user_doc.get("tenant_id"),
                })
                ctx["leads_active"] = await db.leads.count_documents({
                    "assigned_to": entity_id,
                    "lead_stage": {"$nin": ["cerrado_ganado", "cerrado_perdido"]},
                })
                ctx["appointments_upcoming"] = await db.appointments.count_documents({
                    "asesor_id": entity_id,
                    "status": {"$in": ["confirmed", "pending"]},
                    "datetime": {"$gte": _now().isoformat()},
                })
                ctx["tasks_overdue"] = await db.tasks.count_documents({
                    "asesor_id": entity_id, "done": False,
                    "due_date": {"$lt": _now().isoformat()},
                })
        elif entity_type == "appointment":
            apt = await db.appointments.find_one(
                {"appointment_id": entity_id}, {"_id": 0}
            ) or await db.appointments.find_one({"id": entity_id}, {"_id": 0})
            if apt:
                ctx.update({
                    "project_id": apt.get("project_id"),
                    "lead_id": apt.get("lead_id"),
                    "asesor_id": apt.get("asesor_id"),
                    "datetime": apt.get("datetime"),
                    "status": apt.get("status"),
                    "type": apt.get("type"),
                })
                if apt.get("datetime"):
                    try:
                        dt = datetime.fromisoformat(apt["datetime"].replace("Z", "+00:00"))
                        hours = (dt - _now()).total_seconds() / 3600
                        ctx["hours_until"] = round(hours, 1)
                    except Exception:
                        pass
    except Exception as e:
        log.warning(f"[ai_suggestions] context build failed: {e}")
    return ctx


async def _call_claude(db, dev_org_id: str, entity_type: str,
                       ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Call Claude Haiku for suggestions. Returns list (possibly empty)."""
    if not EMERGENT_LLM_KEY:
        log.warning("[ai_suggestions] EMERGENT_LLM_KEY missing — skipping")
        return []
    try:
        from ai_budget import is_within_budget
        if not await is_within_budget(db, dev_org_id):
            log.warning(f"[ai_suggestions] budget cap hit for {dev_org_id}")
            return []
    except Exception:
        pass

    system = _SYSTEM_BASE + "\n\n" + _SYSTEM_BY_TYPE.get(entity_type, "")
    user_text = "CONTEXTO:\n" + json.dumps(ctx, ensure_ascii=False, default=str)

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"suggestions_{entity_type}_{uuid.uuid4().hex[:8]}",
            system_message=system,
        ).with_model("anthropic", CLAUDE_HAIKU_MODEL)
        raw = await chat.send_message(UserMessage(text=user_text[:5000]))
        if not raw:
            return []
        t_in = (len(system) + len(user_text[:5000])) // 4
        t_out = len(raw) // 4
        try:
            from ai_budget import track_ai_call
            await track_ai_call(db, dev_org_id, CLAUDE_HAIKU_MODEL, 0,
                                call_type=f"ai_suggestions_{entity_type}",
                                tokens_in=t_in, tokens_out=t_out)
        except Exception:
            pass
        text = raw.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S).strip()
        data = json.loads(text)
        return data.get("suggestions", []) if isinstance(data, dict) else []
    except Exception as e:
        log.warning(f"[ai_suggestions] Claude error: {e}")
        return []


async def _deterministic_fallback(ctx: Dict[str, Any], entity_type: str) -> List[Dict[str, Any]]:
    """Rule-based fallback when Claude is unavailable (budget exceeded, key missing).

    Returns a minimal, honest list of suggestions derived from simple heuristics
    on the entity context. Cero invención: solo usa campos presentes en ctx.
    """
    out: List[Dict[str, Any]] = []
    try:
        if entity_type == "project":
            hs = ctx.get("health_score")
            leads_hot = ctx.get("leads_hot") or 0
            leads_active = ctx.get("leads_active") or 0
            units_available = ctx.get("units_available") or 0
            slug = ctx.get("entity_id")
            if hs is not None and hs < 60:
                out.append({
                    "suggestion_type": "risk",
                    "title": f"Salud del proyecto en {hs}/100",
                    "body": "La puntuación de salud está por debajo del umbral saludable. Revisa documentos pendientes, unidades sin foto y leads sin atender.",
                    "cta_label": "Ver diagnóstico",
                    "cta_action": f"open_url:/desarrollador/proyectos/{slug}?diagnostic=open",
                })
            if leads_hot > 0:
                out.append({
                    "suggestion_type": "next_action",
                    "title": f"{leads_hot} leads en negociación",
                    "body": f"Tienes {leads_hot} leads calientes esperando un cierre. Priorízalos en el pipeline.",
                    "cta_label": "Ver CRM",
                    "cta_action": f"open_url:/desarrollador/desarrollos/{slug}/crm",
                })
            if units_available > 0 and leads_active == 0:
                out.append({
                    "suggestion_type": "opportunity",
                    "title": "Activa el portal público",
                    "body": f"Tienes {units_available} unidades disponibles y 0 leads activos. Comparte tu link público para captar.",
                    "cta_label": "Copiar link",
                    "cta_action": f"open_url:/reservar/{slug}",
                })
        elif entity_type == "lead":
            days = ctx.get("days_since_last_touch")
            stage = ctx.get("stage") or ""
            if days is not None and days >= 3 and stage not in ("cerrado_ganado", "cerrado_perdido"):
                out.append({
                    "suggestion_type": "next_action",
                    "title": f"Lead sin contacto hace {days} días",
                    "body": "El lead está enfriándose. Envía un mensaje o agenda una visita para reactivarlo.",
                    "cta_label": "Contactar",
                    "cta_action": "log_activity",
                })
        elif entity_type == "unit":
            if ctx.get("status") == "disponible" and ctx.get("price"):
                out.append({
                    "suggestion_type": "insight",
                    "title": "Unidad disponible",
                    "body": "Considera activar una campaña específica o ajustar el precio si lleva muchos días sin movimiento.",
                    "cta_label": "Ver comparables",
                    "cta_action": "log_activity",
                })
        elif entity_type == "asesor":
            overdue = ctx.get("tasks_overdue") or 0
            if overdue > 0:
                out.append({
                    "suggestion_type": "risk",
                    "title": f"{overdue} tareas vencidas",
                    "body": "Hay tareas sin completar. Revisa el tablero de tareas para ponerte al día.",
                    "cta_label": "Ver tareas",
                    "cta_action": "open_url:/asesor/tareas",
                })
        elif entity_type == "appointment":
            hours = ctx.get("hours_until")
            if hours is not None and 0 < hours < 24:
                out.append({
                    "suggestion_type": "next_action",
                    "title": "Cita próxima en menos de 24h",
                    "body": "Confirma al cliente por WhatsApp y prepara el briefing IE del proyecto.",
                    "cta_label": "Preparar",
                    "cta_action": "log_activity",
                })
    except Exception as e:
        log.warning(f"[ai_suggestions] fallback error: {e}")
    return out


async def _get_or_generate(
    db, entity_type: str, entity_id: str, dev_org_id: str, force: bool = False,
) -> List[Dict[str, Any]]:
    """Fetch cached active suggestions or generate new via Claude."""
    now = _now()

    if not force:
        cached = await db.ai_suggestions.find(
            {"entity_type": entity_type, "entity_id": entity_id,
             "status": "active", "expires_at": {"$gt": now.isoformat()}},
            {"_id": 0},
        ).sort("generated_at", -1).to_list(10)
        if cached:
            return cached

    # Generate fresh
    ctx = await _build_context(db, entity_type, entity_id)
    raw_suggestions = await _call_claude(db, dev_org_id, entity_type, ctx)

    # Deterministic fallback if Claude returned nothing (budget/key issues)
    fallback_used = False
    if not raw_suggestions:
        raw_suggestions = await _deterministic_fallback(ctx, entity_type)
        fallback_used = True

    # Expire old active ones (superseded)
    if force:
        await db.ai_suggestions.update_many(
            {"entity_type": entity_type, "entity_id": entity_id, "status": "active"},
            {"$set": {"status": "expired", "expired_at": now.isoformat()}},
        )

    # Persist new suggestions
    expires = now + timedelta(hours=CACHE_TTL_HOURS)
    persisted: List[Dict[str, Any]] = []
    for s in raw_suggestions[:3]:
        doc = {
            "id": f"sug_{uuid.uuid4().hex[:12]}",
            "entity_type": entity_type,
            "entity_id": entity_id,
            "dev_org_id": dev_org_id,
            "suggestion_type": (s.get("suggestion_type") or "insight")[:40],
            "title": (s.get("title") or "")[:80],
            "body": (s.get("body") or "")[:220],
            "cta_label": (s.get("cta_label") or "Ver detalles")[:30],
            "cta_action": (s.get("cta_action") or "")[:200],
            "status": "active",
            "model": "deterministic_fallback" if fallback_used else CLAUDE_HAIKU_MODEL,
            "generated_at": now.isoformat(),
            "expires_at": expires.isoformat(),
            "created_by_ai": not fallback_used,
        }
        try:
            await db.ai_suggestions.insert_one({**doc})
            persisted.append(doc)
        except Exception as e:
            log.warning(f"[ai_suggestions] insert failed: {e}")
    return persisted


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/api/ai/suggestions/{entity_type}/{entity_id}")
async def get_suggestions(
    entity_type: str, entity_id: str, request: Request,
    force: bool = Query(False),
):
    user = await _auth(request)
    if entity_type not in VALID_ENTITY_TYPES:
        raise HTTPException(400, f"entity_type inválido: {entity_type}")
    db = _db(request)
    items = await _get_or_generate(db, entity_type, entity_id, _tenant(user), force=force)
    # Return only active ones
    return {
        "items": [{k: v for k, v in i.items() if k != "_id"} for i in items],
        "count": len(items),
        "entity_type": entity_type,
        "entity_id": entity_id,
    }


class SuggestionActionIn(BaseModel):
    note: Optional[str] = ""


@router.post("/api/ai/suggestions/{suggestion_id}/dismiss")
async def dismiss_suggestion(suggestion_id: str, body: SuggestionActionIn, request: Request):
    user = await _auth(request)
    db = _db(request)
    res = await db.ai_suggestions.update_one(
        {"id": suggestion_id, "status": "active"},
        {"$set": {
            "status": "dismissed",
            "dismissed_at": _now().isoformat(),
            "dismissed_by": user.user_id,
            "dismiss_note": (body.note or "")[:200],
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Sugerencia no encontrada o ya procesada")
    # ML event
    try:
        from observability import emit_ml_event
        await emit_ml_event(
            db, event_type="ai_suggestion_dismissed",
            user_id=user.user_id, org_id=_tenant(user), role=user.role,
            context={"suggestion_id": suggestion_id},
            ai_decision={}, user_action={"action": "dismiss"},
        )
    except Exception:
        pass
    return {"ok": True, "suggestion_id": suggestion_id, "status": "dismissed"}


@router.post("/api/ai/suggestions/{suggestion_id}/accept")
async def accept_suggestion(suggestion_id: str, body: SuggestionActionIn, request: Request):
    user = await _auth(request)
    db = _db(request)
    res = await db.ai_suggestions.update_one(
        {"id": suggestion_id, "status": "active"},
        {"$set": {
            "status": "accepted",
            "accepted_at": _now().isoformat(),
            "accepted_by": user.user_id,
            "accept_note": (body.note or "")[:200],
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Sugerencia no encontrada o ya procesada")
    try:
        from observability import emit_ml_event
        await emit_ml_event(
            db, event_type="ai_suggestion_accepted",
            user_id=user.user_id, org_id=_tenant(user), role=user.role,
            context={"suggestion_id": suggestion_id},
            ai_decision={}, user_action={"action": "accept"},
        )
    except Exception:
        pass
    return {"ok": True, "suggestion_id": suggestion_id, "status": "accepted"}


# ─── Indexes ─────────────────────────────────────────────────────────────────

async def ensure_ai_suggestions_indexes(db):
    await db.ai_suggestions.create_index("id", unique=True, background=True)
    await db.ai_suggestions.create_index(
        [("entity_type", 1), ("entity_id", 1), ("status", 1), ("generated_at", -1)],
        background=True,
    )
    await db.ai_suggestions.create_index("expires_at", background=True)
    await db.ai_suggestions.create_index("dev_org_id", background=True)
    log.info("[ai_suggestions] indexes ensured")
