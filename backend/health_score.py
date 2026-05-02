"""Phase 4 Batch 14 — Health Score Engine.

Computes composite health scores for: project, asesor, client.
Caches results 60 min. Daily snapshots at 6am MX for trend tracking.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional


# ─── Component weights ────────────────────────────────────────────────────────
PROJECT_WEIGHTS = {
    "completeness": 0.25,
    "engagement":   0.30,
    "velocity":     0.25,
    "task_health":  0.20,
}
ASESOR_WEIGHTS = {
    "pipeline_value":  0.30,
    "response_time":   0.25,
    "conversion_rate": 0.25,
    "activity_7d":     0.20,
}
CLIENT_WEIGHTS = {
    "journey_stage":    0.30,
    "engagement_score": 0.30,
    "fit_score":        0.25,
    "urgency":          0.15,
}

TTL_MINUTES = 60


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _color(score: float) -> str:
    if score >= 80:
        return "green"
    if score >= 60:
        return "amber"
    return "red"


def _empty(entity_type: str, entity_id: str, reason: str) -> Dict[str, Any]:
    return {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "score": 0,
        "components": {},
        "alerts": [{"type": "error", "message": reason}],
        "status": "red",
        "computed_at": _now().isoformat(),
        "ttl_minutes": TTL_MINUTES,
        "trend_7d": 0,
    }


# ─── Project ──────────────────────────────────────────────────────────────────

async def _project_score(db, entity_id: str) -> Dict[str, Any]:
    from projects_unified import get_project_by_slug, get_units_for_project

    project = await get_project_by_slug(db, entity_id)
    if not project:
        return _empty("project", entity_id, "Proyecto no encontrado")

    units = await get_units_for_project(db, project)
    since_30d = _now() - timedelta(days=30)

    # 1. Completeness (25%)
    checks = [
        bool(project.get("name")),
        bool(project.get("colonia")),
        bool(project.get("description") or project.get("tagline")),
        len(units) > 0,
        bool(project.get("cover_photo") or project.get("photos")),
    ]
    comm = await db.project_commercialization.find_one({"project_id": entity_id}, {"_id": 0})
    checks.append(bool(comm))
    completeness = round(sum(checks) / len(checks) * 100)

    # 2. Engagement (30%)
    leads_30d = await db.leads.count_documents({
        "project_id": entity_id,
        "created_at": {"$gte": since_30d},
    })
    engagement = min(100, leads_30d * 10)

    # 3. Velocity (25%)
    total_u = max(1, len(units))
    sold_u = len([u for u in units if u.get("status") in ("vendido", "reservado")])
    target = max(1, total_u * 0.05)
    recent_sales = await db.audit_log.count_documents({
        "entity_type": "unit",
        "action": "update",
        "to.status": {"$in": ["vendido", "reservado"]},
        "created_at": {"$gte": since_30d},
    })
    velocity = min(100, round((recent_sales / target) * 100))
    if sold_u / total_u > 0.6:
        velocity = max(velocity, 70)

    # 4. Task Health (20%)
    now = _now()
    total_tasks = await db.tasks.count_documents({"project_id": entity_id})
    overdue = await db.tasks.count_documents({
        "project_id": entity_id,
        "due_at": {"$lt": now},
        "done": {"$ne": True},
    })
    if total_tasks == 0:
        task_health = 80
    else:
        task_health = round(max(0, (1 - (overdue / total_tasks) * 2)) * 100)

    total = round(
        completeness * 0.25 + engagement * 0.30 + velocity * 0.25 + task_health * 0.20
    )

    components = {
        "completeness": {"score": completeness, "weight": 0.25, "label": "Completitud",
                         "status": _color(completeness)},
        "engagement":   {"score": engagement, "weight": 0.30, "label": "Engagement",
                         "status": _color(engagement), "detail": f"{leads_30d} leads (30d)"},
        "velocity":     {"score": velocity, "weight": 0.25, "label": "Velocidad de ventas",
                         "status": _color(velocity), "detail": f"{recent_sales} ventas/mes"},
        "task_health":  {"score": task_health, "weight": 0.20, "label": "Salud de tareas",
                         "status": _color(task_health), "detail": f"{overdue}/{total_tasks} vencidas"},
    }

    alerts: List[Dict[str, str]] = []
    if completeness < 60:
        alerts.append({"type": "warning", "message": "Perfil del proyecto incompleto"})
    if leads_30d == 0:
        alerts.append({"type": "info", "message": "Sin leads nuevos en 30 días"})
    if overdue > 0:
        alerts.append({"type": "warning", "message": f"{overdue} tarea(s) vencida(s)"})

    return {
        "entity_type": "project", "entity_id": entity_id,
        "score": total, "components": components,
        "alerts": alerts, "status": _color(total),
    }


# ─── Asesor ───────────────────────────────────────────────────────────────────

async def _asesor_score(db, entity_id: str) -> Dict[str, Any]:
    user = await db.users.find_one({"user_id": entity_id}, {"_id": 0})
    if not user:
        return _empty("asesor", entity_id, "Asesor no encontrado")

    since_30d = _now() - timedelta(days=30)
    since_7d = _now() - timedelta(days=7)

    # 1. Pipeline value (30%)
    ops = await db.asesor_operaciones.find(
        {"asesor_user_id": entity_id, "status": {"$in": ["pendiente", "en_proceso"]}},
        {"_id": 0, "price": 1},
    ).to_list(length=500)
    pipeline_value = sum(o.get("price", 0) for o in ops)
    pipeline = min(100, round(pipeline_value / 50000))

    # 2. Response time proxy (25%)
    leads_30d = await db.leads.count_documents({
        "assigned_to": entity_id,
        "created_at": {"$gte": since_30d},
    })
    response = min(100, leads_30d * 10)

    # 3. Conversion (25%)
    total_leads = await db.leads.count_documents({"assigned_to": entity_id})
    closed_ops = await db.asesor_operaciones.count_documents({
        "asesor_user_id": entity_id, "status": "cerrada_ganada",
    })
    conversion = 50 if total_leads == 0 else min(100, round(closed_ops / total_leads * 500))

    # 4. Activity 7d (20%)
    tasks_done = await db.asesor_tareas.count_documents({
        "user_id": entity_id, "done": True, "done_at": {"$gte": since_7d},
    })
    contacts = await db.asesor_contactos.count_documents({
        "user_id": entity_id, "updated_at": {"$gte": since_7d},
    })
    activity = min(100, tasks_done * 10 + contacts * 5)

    total = round(pipeline * 0.30 + response * 0.25 + conversion * 0.25 + activity * 0.20)

    components = {
        "pipeline_value":  {"score": pipeline, "weight": 0.30, "label": "Pipeline activo",
                            "status": _color(pipeline),
                            "detail": f"${pipeline_value/1_000_000:.1f}M en proceso"},
        "response_time":   {"score": response, "weight": 0.25, "label": "Velocidad de respuesta",
                            "status": _color(response), "detail": f"{leads_30d} leads contactados"},
        "conversion_rate": {"score": conversion, "weight": 0.25, "label": "Tasa de conversión",
                            "status": _color(conversion),
                            "detail": f"{closed_ops} cierres / {total_leads} leads"},
        "activity_7d":     {"score": activity, "weight": 0.20, "label": "Actividad 7 días",
                            "status": _color(activity),
                            "detail": f"{tasks_done} tareas · {contacts} contactos"},
    }

    alerts: List[Dict[str, str]] = []
    if pipeline < 40:
        alerts.append({"type": "info", "message": "Pipeline bajo — considera prospectar"})
    if activity < 30:
        alerts.append({"type": "warning", "message": "Baja actividad en los últimos 7 días"})

    return {
        "entity_type": "asesor", "entity_id": entity_id,
        "score": total, "components": components,
        "alerts": alerts, "status": _color(total),
    }


# ─── Client ───────────────────────────────────────────────────────────────────

async def _client_score(db, entity_id: str) -> Dict[str, Any]:
    contact = await db.asesor_contactos.find_one({"id": entity_id}, {"_id": 0})
    if not contact:
        lead = await db.leads.find_one({"lead_id": entity_id}, {"_id": 0})
        if not lead:
            return _empty("client", entity_id, "Cliente no encontrado")
        contact = lead

    # 1. Journey stage (30%)
    stage = contact.get("stage", contact.get("lead_stage", "nuevo"))
    STAGE_SCORES = {
        "nuevo": 20, "contactado": 35, "calificado": 50, "visita": 65,
        "oferta": 80, "negociacion": 90, "cerrado_ganado": 100, "cerrado_perdido": 0,
        "vendido": 100, "qualified": 50,
    }
    journey = STAGE_SCORES.get(stage, 30)

    # 2. Engagement (30%)
    timeline_count = len(contact.get("timeline", []))
    citas = await db.asesor_citas.count_documents({"contacto_id": entity_id})
    engagement_s = min(100, timeline_count * 10 + citas * 20)

    # 3. Fit score (25%)
    searches = await db.asesor_busquedas.find(
        {"contacto_id": entity_id}, {"_id": 0, "match_score": 1},
    ).to_list(10)
    fit = round(sum(b.get("match_score", 50) for b in searches) / len(searches)) if searches else 50

    # 4. Urgency (15%)
    urgency_level = contact.get("urgency", contact.get("urgencia", "media"))
    URGENCY_SCORES = {"alta": 90, "media": 50, "baja": 20, "high": 90, "medium": 50, "low": 20}
    urgency = URGENCY_SCORES.get(str(urgency_level).lower(), 50)

    total = round(journey * 0.30 + engagement_s * 0.30 + fit * 0.25 + urgency * 0.15)

    components = {
        "journey_stage":    {"score": journey, "weight": 0.30, "label": "Etapa del viaje",
                             "status": _color(journey), "detail": stage},
        "engagement_score": {"score": engagement_s, "weight": 0.30, "label": "Engagement",
                             "status": _color(engagement_s),
                             "detail": f"{timeline_count} interacciones · {citas} citas"},
        "fit_score":        {"score": fit, "weight": 0.25, "label": "Fit con búsqueda",
                             "status": _color(fit)},
        "urgency":          {"score": urgency, "weight": 0.15, "label": "Urgencia",
                             "status": _color(urgency), "detail": str(urgency_level)},
    }

    alerts: List[Dict[str, str]] = []
    if journey < 40 and engagement_s < 40:
        alerts.append({"type": "info", "message": "Cliente frío — considera recontactar"})

    return {
        "entity_type": "client", "entity_id": entity_id,
        "score": total, "components": components,
        "alerts": alerts, "status": _color(total),
    }


# ─── Cache + main entry point ─────────────────────────────────────────────────

async def compute_health_score(entity_type: str, entity_id: str, db,
                                force: bool = False) -> Dict[str, Any]:
    """Compute or retrieve cached health score."""
    now = _now()

    if not force:
        cached = await db.health_scores.find_one(
            {"entity_type": entity_type, "entity_id": entity_id}, {"_id": 0},
        )
        if cached:
            computed_at = cached.get("computed_at")
            if computed_at:
                if isinstance(computed_at, str):
                    computed_at = datetime.fromisoformat(computed_at)
                if computed_at.tzinfo is None:
                    computed_at = computed_at.replace(tzinfo=timezone.utc)
                if (now - computed_at).total_seconds() / 60 < TTL_MINUTES:
                    return cached

    if entity_type == "project":
        result = await _project_score(db, entity_id)
    elif entity_type == "asesor":
        result = await _asesor_score(db, entity_id)
    elif entity_type == "client":
        result = await _client_score(db, entity_id)
    else:
        return _empty(entity_type, entity_id, f"entity_type desconocido: {entity_type}")

    result["computed_at"] = now.isoformat()
    result["ttl_minutes"] = TTL_MINUTES

    # Trend vs 7-day snapshot
    snap = await db.health_scores_snapshots.find_one(
        {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "snapped_at": {"$gte": now - timedelta(days=7)},
        },
        {"_id": 0, "score": 1},
        sort=[("snapped_at", -1)],
    )
    result["trend_7d"] = (result["score"] - snap["score"]) if snap else 0

    await db.health_scores.replace_one(
        {"entity_type": entity_type, "entity_id": entity_id},
        result,
        upsert=True,
    )
    return result


# ─── Daily snapshot job ───────────────────────────────────────────────────────

async def take_health_snapshots(db) -> int:
    """Daily: snapshot all cached scores for trend calculation."""
    now = _now()
    count = 0
    async for doc in db.health_scores.find({}, {"_id": 0}):
        await db.health_scores_snapshots.insert_one({
            "id": str(uuid.uuid4()),
            "entity_type": doc["entity_type"],
            "entity_id": doc["entity_id"],
            "score": doc.get("score", 0),
            "components": doc.get("components", {}),
            "snapped_at": now,
        })
        count += 1
    # Keep only last 30d
    await db.health_scores_snapshots.delete_many({"snapped_at": {"$lt": now - timedelta(days=30)}})
    return count


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_health_score_indexes(db):
    await db.health_scores.create_index(
        [("entity_type", 1), ("entity_id", 1)], unique=True, background=True,
    )
    await db.health_scores.create_index("computed_at", background=True)
    await db.health_scores_snapshots.create_index(
        [("entity_type", 1), ("entity_id", 1), ("snapped_at", -1)], background=True,
    )
    await db.health_scores_snapshots.create_index("snapped_at", background=True)
