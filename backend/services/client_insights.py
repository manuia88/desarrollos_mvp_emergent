"""Phase 4 Batch 33 · services — Client Insights aggregation.

Aggregate datos de B13/B14/B22/B25/B28/B29 en un shape estructurado.
Claude Haiku para sentiment chat + recommended next action.
Cache 30min en db.client_insights_cache.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.client_insights")

EMERGENT_LLM_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
HAIKU_MODEL = "claude-haiku-4-5-20251001"
CACHE_TTL_MIN = 30


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


# ─── Sentiment via Haiku ──────────────────────────────────────────────────────

async def _classify_sentiment(messages: List[str]) -> str:
    """positivo · neutral · negativo. Fallback heurístico si no hay LLM key."""
    if not messages:
        return "neutral"
    text = " ".join(messages[-5:])  # último 5 mensajes
    if not text.strip():
        return "neutral"

    if not EMERGENT_LLM_KEY:
        # Heuristic: keywords
        lower = text.lower()
        positive = ["gracias", "excelente", "perfecto", "interesado", "compro", "agendar"]
        negative = ["caro", "no", "cancelar", "molesto", "tarde", "decepcion"]
        p = sum(1 for w in positive if w in lower)
        n = sum(1 for w in negative if w in lower)
        if p > n:
            return "positivo"
        if n > p:
            return "negativo"
        return "neutral"

    try:
        from llm_client import LlmChat, UserMessage  # type: ignore
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"sentiment_{uuid.uuid4().hex[:8]}",
            system_message=(
                "Clasifica el sentiment del cliente en: positivo, neutral, "
                "negativo. Responde SOLO una palabra. Idioma es-MX."
            ),
        ).with_model("anthropic", HAIKU_MODEL)
        resp = await chat.send_message(UserMessage(
            text=f"Mensajes recientes del cliente:\n{text[:1200]}\n\nSentiment:",
        ))
        result = (resp or "").strip().lower()
        if "positiv" in result:
            return "positivo"
        if "negativ" in result:
            return "negativo"
        return "neutral"
    except Exception as e:
        log.warning(f"[client_insights] sentiment exception: {e}")
        return "neutral"


# ─── Next action recommendation ───────────────────────────────────────────────

async def _recommend_next_action(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """Claude Haiku genera siguiente acción accionable."""
    if not EMERGENT_LLM_KEY:
        return _heuristic_next_action(ctx)

    history_count = len(ctx.get("history_30d") or [])
    favs_count = len(ctx.get("favoritos") or [])
    chat_count = ctx.get("chat_threads_count", 0)
    last_view = ctx.get("last_view_at", "")
    sentiment = ctx.get("sentiment", "neutral")
    health = ctx.get("health_score", "—")

    try:
        from llm_client import LlmChat, UserMessage  # type: ignore
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"next_action_{uuid.uuid4().hex[:8]}",
            system_message=(
                "Eres coach de ventas. Genera UNA acción siguiente concreta para "
                "el asesor con este lead. REGLAS:\n"
                "1) Idioma es-MX. Sin emojis.\n"
                "2) Máximo 25 palabras.\n"
                "3) Verbo en imperativo + tiempo + razón breve.\n"
                "4) Ejemplos: 'Llama antes 18h: vio Polanco x3 últimos 2d.', "
                "'Manda WhatsApp ahora con 2 comparables.', 'Agenda visita: "
                "lead frío, último chat hace 5 días.'"
            ),
        ).with_model("anthropic", HAIKU_MODEL)

        prompt = (
            f"Lead activity: {history_count} eventos 30d, {favs_count} favoritos, "
            f"{chat_count} chats. Sentiment: {sentiment}. Health: {health}. "
            f"Última vista: {last_view}.\n\nGenera la acción ahora."
        )
        resp = await chat.send_message(UserMessage(text=prompt))
        text = (resp or "").strip()

        # Detectar tipo
        action_type = "call"
        lower = text.lower()
        if "whatsapp" in lower or "wa " in lower or "wa." in lower:
            action_type = "whatsapp"
        elif "email" in lower or "correo" in lower:
            action_type = "email"
        elif "agenda" in lower or "visita" in lower or "cita" in lower:
            action_type = "schedule_visit"
        elif "llama" in lower or "llamar" in lower:
            action_type = "call"

        return {
            "text": text[:200],
            "action_type": action_type,
        }
    except Exception as e:
        log.warning(f"[client_insights] next_action exception: {e}")
        return _heuristic_next_action(ctx)


def _heuristic_next_action(ctx: Dict[str, Any]) -> Dict[str, Any]:
    history_count = len(ctx.get("history_30d") or [])
    favs_count = len(ctx.get("favoritos") or [])
    chat_count = ctx.get("chat_threads_count", 0)

    if history_count > 10 and favs_count >= 3:
        return {
            "text": "Llama antes 18h: lead muy activo con favoritos definidos.",
            "action_type": "call",
        }
    if chat_count > 0:
        return {
            "text": "Responde en chat ahora: tiene conversación abierta sin cerrar.",
            "action_type": "whatsapp",
        }
    if history_count == 0:
        return {
            "text": "Inicia contacto: lead nuevo sin actividad. Manda WhatsApp.",
            "action_type": "whatsapp",
        }
    return {
        "text": "Agenda visita: lead con interés tibio, propón visita guiada.",
        "action_type": "schedule_visit",
    }


# ─── Health trend 7d ──────────────────────────────────────────────────────────

async def _health_trend(db, lead_id: str) -> Dict[str, Any]:
    cur = db.health_scores.find(
        {"entity_type": "lead", "entity_id": lead_id},
        {"_id": 0, "score": 1, "computed_at": 1},
    ).sort("computed_at", -1).limit(20)
    rows = await cur.to_list(20)
    if not rows:
        return {"current": 0, "trend_7d": 0}

    current = int(rows[0].get("score", 0))
    cutoff = _now() - timedelta(days=7)
    older = None
    for r in rows[1:]:
        ca = r.get("computed_at")
        if isinstance(ca, datetime):
            if ca.tzinfo is None:
                ca = ca.replace(tzinfo=timezone.utc)
            if ca <= cutoff:
                older = int(r.get("score", 0))
                break
    trend = current - (older or current)
    return {"current": current, "trend_7d": trend}


# ─── Main aggregation ─────────────────────────────────────────────────────────

async def compute_client_insights(
    db, lead_id: str, asesor_id: str = "", force: bool = False,
) -> Dict[str, Any]:
    # Cache 30min
    if not force:
        cached = await db.client_insights_cache.find_one(
            {"lead_id": lead_id}, {"_id": 0},
        )
        if cached:
            ca = cached.get("computed_at")
            if isinstance(ca, datetime):
                if ca.tzinfo is None:
                    ca = ca.replace(tzinfo=timezone.utc)
                age_min = (_now() - ca).total_seconds() / 60.0
                if age_min < CACHE_TTL_MIN:
                    cached["computed_at"] = _iso(ca)
                    cached["from_cache"] = True
                    return cached

    # Lead doc
    lead = await db.leads.find_one(
        {"$or": [{"id": lead_id}, {"lead_id": lead_id}]}, {"_id": 0},
    )
    if not lead:
        lead = await db.users.find_one({"user_id": lead_id}, {"_id": 0})

    name = ""
    if lead:
        first = lead.get("first_name") or lead.get("name", "")
        last = lead.get("last_name", "")
        name = f"{first} {last}".strip() or lead.get("email", "")

    # Activity timeline 30d (combinado)
    since = _now() - timedelta(days=30)
    timeline: List[Dict[str, Any]] = []

    # buyer_history
    try:
        history = await db.buyer_history.find(
            {"user_id": lead_id, "ts": {"$gte": since.isoformat()}},
            {"_id": 0},
        ).sort("ts", -1).limit(50).to_list(50)
        for h in history:
            timeline.append({
                "ts": h.get("ts"),
                "type": h.get("event_type", "view"),
                "label": h.get("project_name") or h.get("event_type", "actividad"),
                "ref_id": h.get("project_id") or h.get("development_id"),
            })
    except Exception:
        history = []

    # Favoritos
    try:
        favs = await db.favoritos.find(
            {"user_id": lead_id}, {"_id": 0},
        ).sort("created_at", -1).limit(10).to_list(10)
        for f in favs:
            ts = f.get("created_at")
            if isinstance(ts, datetime):
                ts = _iso(ts)
            timeline.append({
                "ts": ts,
                "type": "favorito",
                "label": f.get("project_name", "Favorito"),
                "ref_id": f.get("project_id"),
            })
    except Exception:
        favs = []

    # Chats B29
    chat_threads = []
    chat_messages_count = 0
    last_message_text = ""
    last_message_at = None
    try:
        chat_threads = await db.chat_threads.find(
            {"buyer_id": lead_id}, {"_id": 0},
        ).limit(5).to_list(5)
        thread_ids = [t.get("thread_id") for t in chat_threads if t.get("thread_id")]
        if thread_ids:
            chat_messages_count = await db.chat_messages.count_documents(
                {"thread_id": {"$in": thread_ids}},
            )
            last_msg = await db.chat_messages.find_one(
                {"thread_id": {"$in": thread_ids}, "sender_role": "buyer"},
                {"_id": 0, "text": 1, "sent_at": 1},
                sort=[("sent_at", -1)],
            )
            if last_msg:
                last_message_text = last_msg.get("text", "")[:200]
                last_message_at = last_msg.get("sent_at")
                if isinstance(last_message_at, datetime):
                    last_message_at = _iso(last_message_at)
    except Exception:
        pass

    # Recent buyer messages (último 5) → para sentiment
    last_msgs_text: List[str] = []
    try:
        if chat_threads:
            tids = [t.get("thread_id") for t in chat_threads]
            last_buyer_msgs = await db.chat_messages.find(
                {"thread_id": {"$in": tids}, "sender_role": "buyer"},
                {"_id": 0, "text": 1},
            ).sort("sent_at", -1).limit(5).to_list(5)
            last_msgs_text = [m.get("text", "") for m in last_buyer_msgs]
    except Exception:
        pass

    sentiment = await _classify_sentiment(last_msgs_text)

    # Source attribution
    attribution = None
    try:
        attribution = await db.lead_attribution.find_one(
            {"lead_id": lead_id}, {"_id": 0},
        )
    except Exception:
        attribution = None

    # Top vistas (últimos 5) y top favoritos
    top_views: List[Dict[str, Any]] = []
    seen_pids = set()
    for h in history:
        pid = h.get("project_id") or h.get("development_id")
        if pid and pid not in seen_pids:
            seen_pids.add(pid)
            top_views.append({
                "project_id": pid,
                "project_name": h.get("project_name", ""),
                "ts": h.get("ts"),
            })
        if len(top_views) >= 5:
            break

    top_favs = [
        {
            "project_id": f.get("project_id"),
            "project_name": f.get("project_name", ""),
        }
        for f in favs[:5] if f.get("project_id")
    ]

    # Health trend
    health = await _health_trend(db, lead_id)

    # Sort timeline DESC
    timeline.sort(key=lambda x: str(x.get("ts") or ""), reverse=True)
    timeline = timeline[:30]

    # Last view ts
    last_view_at = None
    for h in history:
        if h.get("ts"):
            last_view_at = h.get("ts")
            break

    ctx = {
        "history_30d": history,
        "favoritos": favs,
        "chat_threads_count": len(chat_threads),
        "sentiment": sentiment,
        "health_score": health.get("current"),
        "last_view_at": last_view_at or "",
    }
    next_action = await _recommend_next_action(ctx)

    insights = {
        "lead_id": lead_id,
        "name": name,
        "health": health,  # {current, trend_7d}
        "activity_30d": {
            "total": len(history),
            "favoritos": len(favs),
            "chats": chat_messages_count,
            "last_view_at": last_view_at,
        },
        "timeline": timeline,
        "attribution": attribution or {},
        "top_views": top_views,
        "top_favoritos": top_favs,
        "chat": {
            "threads_count": len(chat_threads),
            "messages_count": chat_messages_count,
            "last_message_text": last_message_text,
            "last_message_at": last_message_at,
            "sentiment": sentiment,
        },
        "next_action": next_action,
        "computed_at": _now(),
    }

    await db.client_insights_cache.update_one(
        {"lead_id": lead_id},
        {"$set": insights},
        upsert=True,
    )

    insights["computed_at"] = _iso(insights["computed_at"])
    insights["from_cache"] = False
    return insights


async def ensure_client_insights_indexes(db) -> None:
    await db.client_insights_cache.create_index("lead_id", unique=True)
    await db.client_insights_cache.create_index("computed_at")
    log.info("[client_insights] indexes ensured")
