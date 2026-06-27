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
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request, Query

log = logging.getLogger("dmx.batch14")

router = APIRouter(tags=["batch14"])

EMERGENT_LLM_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
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


async def _assert_health_access(user, entity_type: str, entity_id: str, db) -> None:
    """SEGURIDAD (pentest 2026-06-27): el rol logueado NO basta — el entity debe ser del tenant del usuario.
    Antes get/recompute health-score eran lectura+escritura cross-tenant (proyectos/asesores de otra cuenta)."""
    from tenant_scope import assert_dev_project, is_superadmin, assert_lead_owner
    if is_superadmin(user):
        return
    if entity_type == "project":
        assert_dev_project(user, entity_id)
    elif entity_type == "client":
        await assert_lead_owner(db, user, entity_id)
    elif entity_type == "asesor":
        if entity_id == getattr(user, "user_id", None):
            return
        target = await db.users.find_one(
            {"user_id": entity_id}, {"_id": 0, "tenant_id": 1, "dev_org_id": 1, "inmobiliaria_id": 1})
        owners = {(target or {}).get("tenant_id"), (target or {}).get("dev_org_id"), (target or {}).get("inmobiliaria_id")}
        owners.discard(None)
        u_tenant = (getattr(user, "tenant_id", "") or getattr(user, "dev_org_id", "") or "")
        if not (u_tenant and u_tenant in owners):
            raise HTTPException(403, "Este asesor es de otra cuenta")


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
    user = await _auth(request)
    db = _db(request)

    if entity_type not in ("project", "asesor", "client"):
        raise HTTPException(400, f"entity_type inválido: {entity_type}")
    await _assert_health_access(user, entity_type, entity_id, db)

    from health_score import compute_health_score
    result = await compute_health_score(entity_type, entity_id, db)
    return result


# (/api/health-score/batch borrado 2026-06-16 · 0 callers · además era lectura cross-tenant
#  sin guard; borrarlo elimina la fuga. La UI no llama ningún health-score/* por HTTP.)


@router.post("/api/health-score/{entity_type}/{entity_id}/recompute")
async def recompute_health_score(entity_type: str, entity_id: str, request: Request):
    """Force recompute health score, bypassing cache."""
    user = await _auth(request)
    db = _db(request)

    if entity_type not in ("project", "asesor", "client"):
        raise HTTPException(400, f"entity_type inválido: {entity_type}")
    await _assert_health_access(user, entity_type, entity_id, db)

    from health_score import compute_health_score
    result = await compute_health_score(entity_type, entity_id, db, force=True)

    # Trigger health-score notification if score < 50
    if result.get("score", 100) < 50 and entity_type == "project":
        try:
            _t = (getattr(user, "tenant_id", "") or getattr(user, "dev_org_id", "") or "")
            devs = await db.users.find(
                {"role": {"$in": ["developer_admin", "developer_director"]},
                 "$or": [{"tenant_id": _t}, {"dev_org_id": _t}]},  # SEGURIDAD: solo devs del MISMO tenant (pentest)
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

    # Scope fail-closed: no permitir ver el feed de OTRO actor/cuenta vía query param.
    is_super = getattr(user, "role", None) == "superadmin"
    uid = getattr(user, "user_id", None)
    org = getattr(user, "tenant_id", None) or "default"
    q: Dict[str, Any] = {}
    if actor_id and (is_super or actor_id == uid):
        q["actor_id"] = actor_id
    elif is_super and inmobiliaria_id:
        q["inmobiliaria_id"] = inmobiliaria_id
    else:
        q["inmobiliaria_id"] = org   # propio tenant; ignora actor_id/inmobiliaria_id ajenos
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

# (POST /api/notifications/mark-read [bulk] borrado 2026-06-16 · 0 callers · la UI usa
#  el per-id /{id}/mark-read y /mark-all-read)


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
    from routes.public import _dev_overlay_cache
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
    citas_count = await db.appointments.count_documents({"created_at": {"$gte": since_7d}})  # citas reales = appointments
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
            from llm_client import LlmChat, UserMessage
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
            from services.llm_guard import send_with_timeout
            raw = await send_with_timeout(
                chat, UserMessage(text=stats_text), label="dev_batch14.weekly_brief", timeout=25.0
            )
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
