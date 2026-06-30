"""Phase 4 Batch 33 · services — Visit Auto-Prep Briefing.

Pre-cita briefing AI (Claude Sonnet 4.5) con context aggregation:
  - Lead profile + saved_searches + favoritos + buyer_history
  - Activity timeline 30d (mensajes B29, vistas B28, comparaciones B22)
  - Health score B14
  - Project context: precio, scores, comparables top 3 (B22), cash flow
  - Argumentario RAG B31: top 5 objeciones probables

Output JSON estructurado:
  { lead_summary (≤100 palabras), top_3_objections [{objection, script}],
    top_3_talking_points, closing_recommendation, related_comparables [project_id],
    data_sources [str] }

Cache permanente (no expira; briefing es histórico de cita específica).
ai_budget gating + cost tracking.
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.visit_auto_prep")

EMERGENT_LLM_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
SONNET_MODEL = "claude-sonnet-4-5-20250929"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


# ─── Context aggregation ──────────────────────────────────────────────────────

async def _aggregate_lead_context(
    db, lead_id: str, project_id: Optional[str],
) -> Dict[str, Any]:
    sources: List[str] = []
    ctx: Dict[str, Any] = {}

    # Lead doc
    lead = await db.leads.find_one(
        {"$or": [{"id": lead_id}, {"lead_id": lead_id}]},
        {"_id": 0},
    )
    if not lead:
        lead = await db.users.find_one({"user_id": lead_id}, {"_id": 0})
    ctx["lead"] = lead or {}
    if lead:
        sources.append("leads")

    # Saved searches
    try:
        searches = await db.saved_searches.find(
            {"user_id": lead_id}, {"_id": 0},
        ).limit(5).to_list(5)
        ctx["saved_searches"] = searches
        if searches:
            sources.append("saved_searches")
    except Exception:
        ctx["saved_searches"] = []

    # Favoritos
    try:
        favs = await db.favoritos.find(
            {"user_id": lead_id}, {"_id": 0},
        ).limit(10).to_list(10)
        ctx["favoritos"] = favs
        if favs:
            sources.append("favoritos")
    except Exception:
        ctx["favoritos"] = []

    # Buyer history (B28)
    since = _now() - timedelta(days=30)
    try:
        history = await db.buyer_history.find(
            {"user_id": lead_id, "ts": {"$gte": since.isoformat()}},
            {"_id": 0},
        ).sort("ts", -1).limit(50).to_list(50)
        ctx["history_30d"] = history
        if history:
            sources.append("buyer_history")
    except Exception:
        ctx["history_30d"] = []

    # Chat threads (B29)
    try:
        threads = await db.chat_threads.find(
            {"buyer_id": lead_id}, {"_id": 0},
        ).limit(5).to_list(5)
        ctx["chat_threads_count"] = len(threads)
        if threads:
            sources.append("chat_threads")
    except Exception:
        ctx["chat_threads_count"] = 0

    # Health score (B14)
    try:
        hs = await db.health_scores.find_one(
            {"entity_type": "lead", "entity_id": lead_id},
            {"_id": 0, "score": 1, "computed_at": 1},
            sort=[("computed_at", -1)],
        )
        if hs:
            ctx["health_score"] = hs.get("score")
            sources.append("health_scores")
    except Exception:
        pass

    # Lead source attribution (B13)
    try:
        attr = await db.lead_attribution.find_one(
            {"lead_id": lead_id}, {"_id": 0},
        )
        ctx["attribution"] = attr or {}
        if attr:
            sources.append("lead_attribution")
    except Exception:
        ctx["attribution"] = {}

    # Project context
    if project_id:
        proj = await db.developments.find_one(
            {"id": project_id},
            {"_id": 0, "id": 1, "name": 1, "colonia": 1, "ciudad": 1,
             "price_from": 1, "tier": 1, "amenities": 1, "scores": 1,
             "description_es": 1},
        )
        ctx["project"] = proj or {}
        if proj:
            sources.append("developments")

        # Comparables top 3 (B22 ColoniaComparator)
        try:
            from services.colonia_comparator import compare_colonias  # if exists
            colonia = (proj or {}).get("colonia", "")
            if colonia:
                comps = await db.developments.find(
                    {"colonia": colonia, "id": {"$ne": project_id}},
                    {"_id": 0, "id": 1, "name": 1, "price_from": 1},
                ).limit(3).to_list(3)
                ctx["comparables"] = comps
                if comps:
                    sources.append("comparables")
        except Exception:
            ctx["comparables"] = []

    ctx["data_sources"] = sources
    return ctx


# ─── Argumentario RAG B31 (top 5 objections) ──────────────────────────────────

async def _fetch_top_objections(db, lead_summary_hint: str) -> List[Dict[str, Any]]:
    try:
        from services.argumentario_rag import search_kb
        # Use lead profile + price tier + intent as query
        chunks = await search_kb(db, lead_summary_hint, top_k=5, category="objeciones")
        return [
            {"title": c["title"], "content": c["content"], "kb_id": c["kb_id"]}
            for c in chunks
        ]
    except Exception as e:
        log.warning(f"[visit_prep] argumentario fail: {e}")
        return []


# ─── Claude Sonnet generator ──────────────────────────────────────────────────

async def _generate_briefing_with_claude(
    ctx: Dict[str, Any], objections_kb: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Llama Claude Sonnet con prompt JSON estructurado."""
    if not EMERGENT_LLM_KEY:
        return _fallback_briefing(ctx, objections_kb)

    lead = ctx.get("lead") or {}
    project = ctx.get("project") or {}
    history_count = len(ctx.get("history_30d") or [])
    favs_count = len(ctx.get("favoritos") or [])

    # Construye prompt compacto
    objections_text = "\n".join(
        f"- {o['title']}: {o['content'][:200]}"
        for o in objections_kb[:5]
    )

    system_msg = (
        "Eres un coach de ventas inmobiliarias LATAM. Generas briefings "
        "pre-visita en JSON estricto. REGLAS:\n"
        "1) Idioma es-MX. Sin emojis.\n"
        "2) lead_summary ≤100 palabras.\n"
        "3) top_3_objections: 3 items, cada uno con campos 'objection' y 'script' "
        "(script ≤60 palabras, listo para decir al cliente).\n"
        "4) top_3_talking_points: 3 frases concretas (≤25 palabras c/u).\n"
        "5) closing_recommendation: ≤80 palabras accionable.\n"
        "6) Output JSON válido con esas exactas claves. NADA fuera del JSON."
    )

    prompt = (
        f"## Lead\n"
        f"Nombre: {lead.get('first_name', '')} {lead.get('last_name', '')}\n"
        f"Stage: {lead.get('lead_stage') or lead.get('status') or 'nuevo'}\n"
        f"Health score: {ctx.get('health_score', '—')}\n"
        f"Activity 30d: {history_count} eventos · {favs_count} favoritos · "
        f"{ctx.get('chat_threads_count', 0)} chats\n"
        f"Source: {(ctx.get('attribution') or {}).get('source', 'desconocido')}\n\n"
        f"## Proyecto a visitar\n"
        f"Nombre: {project.get('name', 'sin info')}\n"
        f"Zona: {project.get('colonia', '')} {project.get('ciudad', '')}\n"
        f"Tier: {project.get('tier', '')}\n"
        f"Precio desde: ${project.get('price_from', 0):,} MXN\n\n"
        f"## Objeciones probables (KB Argumentario)\n{objections_text}\n\n"
        f"Genera el briefing JSON. Asegúrate que las objeciones del briefing "
        f"sean coherentes con el perfil del lead."
    )

    try:
        from llm_client import LlmChat, UserMessage  # type: ignore

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"visit_prep_{uuid.uuid4().hex[:10]}",
            system_message=system_msg,
        ).with_model("anthropic", SONNET_MODEL)

        response = await chat.send_message(UserMessage(text=prompt))
        text = (response or "").strip()

        # Extraer JSON
        if text.startswith("```"):
            text = text.strip("`").lstrip("json").strip()
        # Buscar primer { y último }
        s = text.find("{")
        e = text.rfind("}")
        if s >= 0 and e > s:
            text = text[s:e + 1]

        data = json.loads(text)

        # Sanitize
        return {
            "lead_summary": str(data.get("lead_summary", ""))[:800],
            "top_3_objections": (data.get("top_3_objections") or [])[:3],
            "top_3_talking_points": (data.get("top_3_talking_points") or [])[:3],
            "closing_recommendation": str(data.get("closing_recommendation", ""))[:600],
        }
    except Exception as e:
        log.warning(f"[visit_prep] Claude exception: {e}")
        return _fallback_briefing(ctx, objections_kb)


def _fallback_briefing(
    ctx: Dict[str, Any], objections_kb: List[Dict[str, Any]],
) -> Dict[str, Any]:
    lead = ctx.get("lead") or {}
    project = ctx.get("project") or {}
    name = f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip() or "Lead"
    history_count = len(ctx.get("history_30d") or [])

    summary = (
        f"{name} es un lead "
        f"{'activo' if history_count > 5 else 'nuevo'}. "
        f"Tiene {len(ctx.get('favoritos') or [])} favoritos, "
        f"{ctx.get('chat_threads_count', 0)} conversaciones abiertas. "
        f"Visita programada al proyecto {project.get('name', 'sin asignar')}."
    )

    objections = []
    for o in objections_kb[:3]:
        first_sentence = o.get("content", "").split(".")[0]
        objections.append({
            "objection": o.get("title", ""),
            "script": (first_sentence + ".")[:240],
        })

    return {
        "lead_summary": summary[:800],
        "top_3_objections": objections,
        "top_3_talking_points": [
            "Confirma el motivo principal de la visita.",
            "Pregunta qué cambió respecto a sus búsquedas anteriores.",
            "Cierra con 2 unidades específicas: una conservadora, una premium.",
        ],
        "closing_recommendation": (
            "Cierra ofreciendo apartado reembolsable de 5 días. "
            "Reduce fricción mental y bloquea la unidad."
        ),
    }


# ─── Public API ───────────────────────────────────────────────────────────────

async def generate_visit_briefing(
    db, appointment_id: str, force: bool = False,
) -> Dict[str, Any]:
    # Cache permanente
    if not force:
        cached = await db.visit_briefings.find_one(
            {"appointment_id": appointment_id}, {"_id": 0},
        )
        if cached:
            cached["from_cache"] = True
            for k in ("generated_at", "viewed_at"):
                if isinstance(cached.get(k), datetime):
                    cached[k] = _iso(cached[k])
            return cached

    appt = await db.appointments.find_one(
        {"$or": [
            {"appointment_id": appointment_id},
            {"id": appointment_id},
        ]},
        {"_id": 0},
    )
    if not appt:
        raise ValueError("Appointment no encontrada")

    asesor_id = appt.get("asesor_id", "")
    lead_id = appt.get("lead_id") or appt.get("buyer_id") or ""
    project_id = appt.get("project_id") or appt.get("development_id")

    # ai_budget gating
    try:
        from ai_budget import is_within_budget
        org_id = "system"
        if asesor_id:
            user = await db.users.find_one({"user_id": asesor_id}, {"_id": 0, "tenant_id": 1})
            org_id = (user or {}).get("tenant_id") or "system"
        if not await is_within_budget(db, org_id):
            log.warning(f"[visit_prep] budget exceeded org={org_id}, fallback only")
    except Exception:
        pass

    ctx = await _aggregate_lead_context(db, lead_id, project_id)

    # Hint para RAG: tier proyecto + intent del lead
    hint_parts = [
        (ctx.get("project") or {}).get("tier", ""),
        (ctx.get("project") or {}).get("colonia", ""),
        "objeción precio plusvalía financiamiento",
    ]
    objections_kb = await _fetch_top_objections(db, " ".join(hint_parts))

    content = await _generate_briefing_with_claude(ctx, objections_kb)
    content["related_comparables"] = [
        c.get("id") for c in (ctx.get("comparables") or []) if c.get("id")
    ]
    content["data_sources"] = ctx.get("data_sources", [])

    doc = {
        "briefing_id": str(uuid.uuid4()),
        "appointment_id": appointment_id,
        "asesor_id": asesor_id,
        "lead_id": lead_id,
        "project_id": project_id,
        "generated_at": _now(),
        "content": content,
        "viewed_at": None,
    }
    await db.visit_briefings.update_one(
        {"appointment_id": appointment_id},
        {"$set": doc},
        upsert=True,
    )

    try:
        from routes.dev_batch14 import log_activity
        await log_activity(
            db, actor_id=asesor_id, actor_type="asesor",
            action="visit_briefing_generated", entity_id=doc["briefing_id"],
            entity_type="visit_briefing",
            metadata={"appointment_id": appointment_id},
        )
    except Exception as _e:
        log.warning("[audit] log_activity perdido (visit_briefing_generated visit_briefing %s): %s",
                    doc["briefing_id"], _e)

    out = dict(doc)
    out["generated_at"] = _iso(doc["generated_at"])
    out["from_cache"] = False
    return out


async def get_briefing(db, appointment_id: str) -> Optional[Dict[str, Any]]:
    doc = await db.visit_briefings.find_one(
        {"appointment_id": appointment_id}, {"_id": 0},
    )
    if not doc:
        return None
    for k in ("generated_at", "viewed_at"):
        if isinstance(doc.get(k), datetime):
            doc[k] = _iso(doc[k])
    return doc


async def mark_briefing_viewed(db, briefing_id: str, asesor_id: str) -> bool:
    r = await db.visit_briefings.update_one(
        {"briefing_id": briefing_id, "asesor_id": asesor_id,
         "viewed_at": None},
        {"$set": {"viewed_at": _now()}},
    )
    return r.modified_count > 0


# ─── Cron auto-generation ─────────────────────────────────────────────────────

async def auto_generate_upcoming_briefings(db) -> Dict[str, int]:
    """
    Para cada appointment programada en próximas 24h sin briefing → genera.
    """
    now = _now()
    until = now + timedelta(hours=24)

    cur = db.appointments.find(
        {
            "status": {"$in": ["scheduled", "agendada", "confirmada"]},
            "$or": [
                {"scheduled_at": {"$gte": now.isoformat(), "$lte": until.isoformat()}},
                {"datetime": {"$gte": now.isoformat(), "$lte": until.isoformat()}},
            ],
        },
        {"_id": 0, "appointment_id": 1, "id": 1, "asesor_id": 1, "lead_id": 1},
    ).limit(100)

    generated = 0
    failed = 0
    async for appt in cur:
        appt_id = appt.get("appointment_id") or appt.get("id")
        if not appt_id:
            continue
        existing = await db.visit_briefings.find_one(
            {"appointment_id": appt_id}, {"_id": 0, "briefing_id": 1},
        )
        if existing:
            continue
        try:
            await generate_visit_briefing(db, appt_id)
            generated += 1
            # Notify B14 activity
            try:
                from routes.dev_batch14 import log_activity
                await log_activity(
                    db, actor_id=appt.get("asesor_id", ""),
                    actor_type="system", action="visit_briefing_ready",
                    entity_id=appt_id, entity_type="appointment",
                )
            except Exception as _e:
                log.warning("[audit] log_activity perdido (visit_briefing_ready appointment %s): %s",
                            appt_id, _e)
        except Exception as e:
            log.warning(f"[visit_prep cron] fail {appt_id}: {e}")
            failed += 1

    log.info(f"[visit_prep cron] generated={generated} failed={failed}")
    return {"generated": generated, "failed": failed}


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_visit_prep_indexes(db) -> None:
    await db.visit_briefings.create_index("briefing_id", unique=True)
    await db.visit_briefings.create_index("appointment_id", unique=True)
    await db.visit_briefings.create_index([("asesor_id", 1), ("generated_at", -1)])
    log.info("[visit_prep] indexes ensured")
