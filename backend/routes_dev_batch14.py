"""Phase 4 Batch 14 — Health Score + Activity Feed + Notifications + Setup Checklist + Weekly Brief.

Endpoints:
  GET  /api/health-score/{entity_type}/{entity_id}
  GET  /api/health-score/batch
  POST /api/health-score/{entity_type}/{entity_id}/recompute

  GET  /api/activity/feed
  POST /api/activity/log          (internal use)

  POST /api/notifications/mark-read  (single + bulk — new endpoint)

  GET  /api/panel/setup-progress
  GET  /api/panel/weekly-brief
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel

log = logging.getLogger("dmx.batch14")

router = APIRouter(tags=["batch14"])

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
CLAUDE_HAIKU_MODEL = "claude-haiku-4-5-20251001"


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _db(req: Request):
    return req.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


async def _require_developer(req: Request):
    user = await _auth(req)
    if user.role not in ("developer_admin", "developer_director", "developer_member",
                          "superadmin", "asesor_admin", "advisor"):
        raise HTTPException(403, "Acceso denegado")
    return user


# ─── Notification helper ──────────────────────────────────────────────────────

async def create_notification(db, user_id: str, notif_type: str, title: str,
                               body: str, action_url: str = "",
                               priority: str = "med", org_id: str = "default"):
    """Helper: insert a notification into db.notifications (B14 schema)."""
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "org_id": org_id,
        "type": notif_type,
        "title": title,
        "body": body,
        "message": body,           # legacy compat for NotificationsBell
        "action_url": action_url,
        "priority": priority,
        "read_at": None,
        "read": False,
        "created_at": _now().isoformat(),
        "notification_id": str(uuid.uuid4()),
    }
    await db.notifications.insert_one(doc)


# ─── Activity helper ──────────────────────────────────────────────────────────

async def log_activity(db, actor_id: str, actor_type: str, action: str,
                        entity_id: str, entity_type: str,
                        metadata: Dict[str, Any] = None, inmobiliaria_id: str = ""):
    """Fire-and-forget helper to log an activity event."""
    doc = {
        "id": str(uuid.uuid4()),
        "actor_id": actor_id,
        "actor_type": actor_type,
        "action": action,
        "entity_id": entity_id,
        "entity_type": entity_type,
        "metadata": metadata or {},
        "inmobiliaria_id": inmobiliaria_id,
        "timestamp": _now().isoformat(),
    }
    try:
        await db.activities.insert_one(doc)
    except Exception as e:
        log.warning(f"[activity] insert failed: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# A) HEALTH SCORE ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/api/health-score/{entity_type}/{entity_id}")
async def get_health_score(entity_type: str, entity_id: str, request: Request):
    """Get (or compute and cache) health score for an entity."""
    await _auth(request)
    db = _db(request)

    if entity_type not in ("project", "asesor", "client"):
        raise HTTPException(400, f"entity_type inválido: {entity_type}")

    from health_score import compute_health_score
    result = await compute_health_score(entity_type, entity_id, db)
    return result


@router.get("/api/health-score/batch")
async def get_health_score_batch(
    request: Request,
    entity_type: str = Query(...),
    ids: str = Query(...),
):
    """Batch-fetch health scores. ids = comma-separated list."""
    await _auth(request)
    db = _db(request)

    if entity_type not in ("project", "asesor", "client"):
        raise HTTPException(400, f"entity_type inválido: {entity_type}")

    id_list = [i.strip() for i in ids.split(",") if i.strip()][:20]  # cap 20
    from health_score import compute_health_score
    results = []
    for eid in id_list:
        try:
            r = await compute_health_score(entity_type, eid, db)
            results.append(r)
        except Exception as e:
            results.append({"entity_type": entity_type, "entity_id": eid,
                             "score": 0, "error": str(e)})
    return {"results": results, "count": len(results)}


@router.post("/api/health-score/{entity_type}/{entity_id}/recompute")
async def recompute_health_score(entity_type: str, entity_id: str, request: Request):
    """Force recompute health score, bypassing cache."""
    await _auth(request)
    db = _db(request)

    if entity_type not in ("project", "asesor", "client"):
        raise HTTPException(400, f"entity_type inválido: {entity_type}")

    from health_score import compute_health_score
    result = await compute_health_score(entity_type, entity_id, db, force=True)

    # Trigger health-score notification if score < 50
    if result.get("score", 100) < 50 and entity_type == "project":
        try:
            devs = await db.users.find(
                {"role": {"$in": ["developer_admin", "developer_director"]}},
                {"_id": 0, "user_id": 1},
            ).to_list(10)
            for dev in devs:
                await create_notification(
                    db, dev["user_id"], "health_score_alert",
                    "Alerta de salud del proyecto",
                    f"Proyecto {entity_id} tiene una puntuación de salud crítica: {result.get('score')}",
                    action_url=f"/desarrollador/proyectos/{entity_id}",
                    priority="high",
                )
        except Exception as e:
            log.warning(f"[health_score] notification error: {e}")

    return result


# ─────────────────────────────────────────────────────────────────────────────
# B) ACTIVITY FEED ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/api/activity/feed")
async def get_activity_feed(
    request: Request,
    limit: int = Query(50, le=100),
    actor_id: Optional[str] = Query(None),
    inmobiliaria_id: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
):
    """Activity feed scoped by user/org."""
    user = await _auth(request)
    db = _db(request)

    q: Dict[str, Any] = {}
    if actor_id:
        q["actor_id"] = actor_id
    else:
        org = getattr(user, "tenant_id", None) or "default"
        q["inmobiliaria_id"] = inmobiliaria_id or org
    if entity_type:
        q["entity_type"] = entity_type

    items = await db.activities.find(q, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return {"items": items, "count": len(items)}


@router.post("/api/activity/log")
async def post_activity_log(request: Request):
    """Log an activity event (for frontend-triggered events)."""
    user = await _auth(request)
    db = _db(request)
    body = await request.json()
    await log_activity(
        db,
        actor_id=user.user_id,
        actor_type=user.role,
        action=body.get("action", "unknown"),
        entity_id=body.get("entity_id", ""),
        entity_type=body.get("entity_type", ""),
        metadata=body.get("metadata", {}),
        inmobiliaria_id=getattr(user, "tenant_id", None) or "default",
    )
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# C) NOTIFICATIONS mark-read (new bulk endpoint)
# ─────────────────────────────────────────────────────────────────────────────

class MarkReadIn(BaseModel):
    ids: Optional[List[str]] = None   # None = mark ALL
    all: bool = False


@router.post("/api/notifications/mark-read")
async def mark_notifications_read(body: MarkReadIn, request: Request):
    """Mark one, multiple, or all notifications as read for the current user."""
    user = await _auth(request)
    db = _db(request)
    now = _now().isoformat()

    q: Dict[str, Any] = {"user_id": user.user_id, "read_at": None}
    if not body.all and body.ids:
        q["id"] = {"$in": body.ids}
    elif not body.all and not body.ids:
        raise HTTPException(400, "Provee ids o all=true")

    result = await db.notifications.update_many(q, {"$set": {"read_at": now, "read": True}})
    return {"ok": True, "updated": result.modified_count}


# ─────────────────────────────────────────────────────────────────────────────
# D) SETUP CHECKLIST
# ─────────────────────────────────────────────────────────────────────────────

async def setup_progress(user_id: str, db) -> Dict[str, Any]:
    """Compute the 5-item first-project setup checklist."""
    # 1. Created first project
    project_count = await db.projects.count_documents({"created_by": user_id})
    # Also check legacy
    from data_developments import DEVELOPMENTS_BY_ID
    has_project = project_count > 0 or len(DEVELOPMENTS_BY_ID) > 0

    # 2. Uploaded 5+ photos to a prototype
    photo_count = await db.project_assets.count_documents({"uploader_user_id": user_id})
    has_photos = photo_count >= 5

    # 3. Defined prices + availability
    units_with_price = await db.units.count_documents({"price": {"$gt": 0}})
    has_prices = units_with_price > 0

    # 4. Assigned an advisor to a project
    preassign_count = await db.project_preassignments.count_documents({})
    has_advisor = preassign_count > 0

    # 5. Published to marketplace (has a development in public listing)
    from routes_public import _dev_overlay_cache
    has_published = len(_dev_overlay_cache) > 0 or await db.projects.count_documents(
        {"status": "publicado"}
    ) > 0

    items = [
        {"key": "create_project", "label": "Crear primer proyecto", "done": has_project,
         "action_url": "/desarrollador/proyectos/nuevo"},
        {"key": "upload_photos",  "label": "Subir 5+ fotos a un prototipo", "done": has_photos,
         "action_url": "/desarrollador/proyectos"},
        {"key": "define_prices",  "label": "Definir precios y disponibilidad", "done": has_prices,
         "action_url": "/desarrollador/proyectos"},
        {"key": "assign_advisor", "label": "Asignar asesor a proyecto", "done": has_advisor,
         "action_url": "/desarrollador/proyectos"},
        {"key": "publish_marketplace", "label": "Publicar a marketplace", "done": has_published,
         "action_url": "/desarrollador/proyectos"},
    ]

    done_count = sum(1 for i in items if i["done"])
    return {
        "items": items,
        "done": done_count,
        "total": len(items),
        "pct": round(done_count / len(items) * 100),
        "all_done": done_count == len(items),
    }


@router.get("/api/panel/setup-progress")
async def get_setup_progress(request: Request):
    user = await _auth(request)
    db = _db(request)
    return await setup_progress(user.user_id, db)


# ─────────────────────────────────────────────────────────────────────────────
# E) WEEKLY BRIEF (AI-generated)
# ─────────────────────────────────────────────────────────────────────────────

async def _generate_weekly_brief(user_id: str, inmobiliaria_id: str, db) -> Dict[str, Any]:
    """Generate AI weekly brief for a user via Claude Haiku."""
    now = _now()
    since_7d = now - timedelta(days=7)
    week_start = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    # Pull stats
    new_leads = await db.leads.count_documents({"created_at": {"$gte": since_7d}})
    citas_count = await db.asesor_citas.count_documents({"created_at": {"$gte": since_7d}})
    sales_count = await db.audit_log.count_documents({
        "entity_type": "unit",
        "action": "update",
        "to.status": {"$in": ["vendido", "reservado"]},
        "created_at": {"$gte": since_7d},
    })
    tasks_overdue = await db.tasks.count_documents({
        "due_at": {"$lt": now}, "done": {"$ne": True},
    })

    # Health scores summary
    cached_scores = await db.health_scores.find(
        {"entity_type": "project"}, {"_id": 0, "score": 1, "entity_id": 1},
    ).to_list(20)
    avg_health = round(
        sum(s.get("score", 0) for s in cached_scores) / len(cached_scores)
    ) if cached_scores else 0
    low_health = [s["entity_id"] for s in cached_scores if s.get("score", 100) < 60]

    stats_text = (
        f"Estadísticas de los últimos 7 días:\n"
        f"- Leads nuevos: {new_leads}\n"
        f"- Citas realizadas: {citas_count}\n"
        f"- Ventas/reservas: {sales_count}\n"
        f"- Tareas vencidas: {tasks_overdue}\n"
        f"- Salud promedio de proyectos: {avg_health}/100\n"
        f"- Proyectos con salud baja: {', '.join(low_health) if low_health else 'ninguno'}\n"
    )

    # Check cache first
    cached_brief = await db.weekly_briefs.find_one(
        {
            "user_id": user_id,
            "inmobiliaria_id": inmobiliaria_id,
            "week_start": week_start.isoformat(),
        },
        {"_id": 0},
    )
    if cached_brief:
        return cached_brief

    # Generate with Claude
    brief_data: Dict[str, Any] = {
        "summary": f"Esta semana: {new_leads} leads nuevos, {sales_count} ventas. Salud del portafolio: {avg_health}/100.",
        "top_action": "Revisar leads sin contactar en las últimas 48h",
        "top_risk": f"Tareas vencidas: {tasks_overdue}" if tasks_overdue > 0 else "",
        "kpi_changes": [
            {"label": "Leads nuevos", "value": new_leads, "trend": "neutral"},
            {"label": "Ventas/reservas", "value": sales_count, "trend": "up" if sales_count > 0 else "neutral"},
            {"label": "Salud portafolio", "value": f"{avg_health}/100", "trend": "up" if avg_health >= 70 else "down"},
        ],
    }

    if EMERGENT_LLM_KEY:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=str(uuid.uuid4()),
                system_message=(
                    "Eres un asistente de BI para una plataforma inmobiliaria. "
                    "Analiza las estadísticas y genera un resumen ejecutivo semanal en español (es-MX). "
                    "Responde EXCLUSIVAMENTE con JSON válido (sin markdown, sin backticks) con las claves: "
                    "summary (2 oraciones max), top_action (1 acción prioritaria), top_risk (1 riesgo o ''), "
                    "kpi_changes (array de {label, value, trend: up|down|neutral}). "
                    "Sé conciso, sin emojis, con tono ejecutivo."
                ),
            ).with_model("anthropic", CLAUDE_HAIKU_MODEL)
            raw = await chat.send_message(UserMessage(text=stats_text))
            if raw:
                raw = raw.strip().strip("```json").strip("```").strip()
                parsed = json.loads(raw)
                brief_data.update(parsed)
                # Budget tracking
                try:
                    from ai_budget import track_ai_call
                    await track_ai_call(
                        db, inmobiliaria_id, CLAUDE_HAIKU_MODEL, 0, "weekly_brief",
                        tokens_in=len(stats_text) // 4, tokens_out=len(raw) // 4,
                    )
                except Exception:
                    pass
        except Exception as e:
            log.warning(f"[weekly_brief] Claude generation failed: {e}")

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "inmobiliaria_id": inmobiliaria_id,
        "week_start": week_start.isoformat(),
        "generated_at": now.isoformat(),
        **brief_data,
    }
    await db.weekly_briefs.replace_one(
        {"user_id": user_id, "inmobiliaria_id": inmobiliaria_id,
         "week_start": week_start.isoformat()},
        doc, upsert=True,
    )
    return doc


@router.get("/api/panel/weekly-brief")
async def get_weekly_brief(request: Request):
    user = await _auth(request)
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"

    # Check if stale (>7d old or missing)
    now = _now()
    week_start = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    cached = await db.weekly_briefs.find_one(
        {"user_id": user.user_id, "inmobiliaria_id": org,
         "week_start": week_start.isoformat()},
        {"_id": 0},
    )
    if cached:
        return cached

    try:
        return await _generate_weekly_brief(user.user_id, org, db)
    except Exception as e:
        log.warning(f"[weekly_brief] generation error: {e}")
        return {
            "id": "", "user_id": user.user_id, "inmobiliaria_id": org,
            "week_start": week_start.isoformat(), "generated_at": now.isoformat(),
            "summary": "Resumen no disponible — reintenta en unos minutos.",
            "top_action": "Revisar dashboard de proyectos",
            "top_risk": "",
            "kpi_changes": [],
            "error": str(e),
        }


# ─────────────────────────────────────────────────────────────────────────────
# Weekly brief batch generation (called by APScheduler)
# ─────────────────────────────────────────────────────────────────────────────

async def generate_weekly_briefs_for_all(db):
    """Generate weekly briefs for all users active in the last 30 days."""
    since_30d = _now() - timedelta(days=30)
    active_users = await db.users.find(
        {"last_login_at": {"$gte": since_30d.isoformat()}},
        {"_id": 0, "user_id": 1, "tenant_id": 1},
    ).to_list(200)

    count = 0
    for u in active_users:
        try:
            org = u.get("tenant_id") or "default"
            await _generate_weekly_brief(u["user_id"], org, db)
            count += 1
        except Exception as e:
            log.warning(f"[weekly_briefs] user {u.get('user_id')} failed: {e}")
    log.info(f"[weekly_briefs] generated {count}/{len(active_users)}")
    return count


# ─────────────────────────────────────────────────────────────────────────────
# Indexes
# ─────────────────────────────────────────────────────────────────────────────

async def ensure_batch14_indexes(db):
    await db.activities.create_index("timestamp", background=True)
    await db.activities.create_index([("actor_id", 1), ("timestamp", -1)], background=True)
    await db.activities.create_index([("inmobiliaria_id", 1), ("timestamp", -1)], background=True)
    await db.activities.create_index([("entity_type", 1), ("timestamp", -1)], background=True)
    await db.weekly_briefs.create_index(
        [("user_id", 1), ("inmobiliaria_id", 1), ("week_start", 1)],
        unique=True, background=True,
    )
    await db.weekly_briefs.create_index("generated_at", background=True)
    log.info("[batch14] indexes ensured")
