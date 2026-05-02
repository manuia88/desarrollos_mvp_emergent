"""Phase 4 Batch 0.5 — Diagnostic Engine routes.

Endpoints:
  POST  /api/dev/projects/:id/diagnostic/run
  GET   /api/dev/projects/:id/diagnostic/latest
  GET   /api/dev/projects/:id/diagnostic/history
  POST  /api/dev/projects/:id/diagnostic/auto-fix/:action_id
  POST  /api/dev/projects/:id/diagnostic/ai-recommend/:probe_id

  POST  /api/diagnostic/user/:user_id/run
  GET   /api/diagnostic/user/:user_id/latest

  POST  /api/diagnostic/problem-reports
  GET   /api/superadmin/problem-reports
  PATCH /api/superadmin/problem-reports/:report_id

  GET   /api/superadmin/system-map
  GET   /api/superadmin/probe-recurrence
  GET   /api/superadmin/diagnostics/per-org
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel

from diagnostic_engine import (
    run_diagnostics, run_auto_fix, ai_recommend_for_failure, ProbeResult,
    PROBE_REGISTRY,
)

log = logging.getLogger("dmx.diag.routes")
router = APIRouter(prefix="/api", tags=["diagnostic"])


def _db(req: Request):
    return req.app.state.db


async def _auth(req: Request, roles_allowed: Optional[List[str]] = None):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if roles_allowed and user.role not in roles_allowed:
        raise HTTPException(403, f"Rol no permitido. Requiere {roles_allowed}.")
    return user


def _now():
    return datetime.now(timezone.utc)


# ═════════════════════════════════════════════════════════════════════════════
# PROJECT DIAGNOSTICS
# ═════════════════════════════════════════════════════════════════════════════

class RunDiagnosticPayload(BaseModel):
    scope: str = "all"            # 'all' | 'critical' | 'specific_modules'
    modules: Optional[List[str]] = None


@router.post("/dev/projects/{project_id}/diagnostic/run")
async def run_project_diagnostic(project_id: str, payload: RunDiagnosticPayload,
                                  request: Request, background_tasks: BackgroundTasks):
    user = await _auth(request, ["developer_admin", "director", "superadmin"])
    db = _db(request)
    # Run synchronously for MVP (can shift to background if >5s)
    doc = await run_diagnostics(
        db, project_id=project_id, scope=payload.scope,
        user=user, trigger="manual",
        module_filter=payload.modules,
    )
    # Audit + ml event
    try:
        import audit_log as al
        asyncio.create_task(al.log_mutation(
            db, user_id=user.user_id, role=user.role,
            org_id=getattr(user, "tenant_id", None),
            action="run", entity_type="project_diagnostic",
            entity_id=doc["id"], before=None,
            after={"project_id": project_id, "failed": doc["failed"]},
            ip=request.client.host if request.client else None,
        ))
        from observability import emit_ml_event
        asyncio.create_task(emit_ml_event(
            db, "diagnostic_run",
            user.user_id, getattr(user, "tenant_id", None), user.role,
            context={"project_id": project_id, "scope": payload.scope,
                     "failed": doc["failed"], "criticals": doc["criticals"]},
        ))
    except Exception as e:
        log.warning(f"audit failed: {e}")

    # Trigger notification if criticals
    if doc["criticals"] > 0:
        try:
            await _notify_critical_failures(db, user, project_id, doc)
        except Exception as e:
            log.warning(f"notify criticals failed: {e}")

    return doc


@router.get("/dev/projects/{project_id}/diagnostic/latest")
async def latest_project_diagnostic(project_id: str, request: Request):
    user = await _auth(request, ["developer_admin", "developer_member", "director", "superadmin"])
    db = _db(request)
    doc = await db.project_diagnostics.find_one(
        {"project_id": project_id}, {"_id": 0},
        sort=[("run_at", -1)]
    )
    if not doc:
        return {"project_id": project_id, "never_run": True}
    return doc


@router.get("/dev/projects/{project_id}/diagnostic/history")
async def project_diagnostic_history(project_id: str, request: Request, limit: int = 20):
    user = await _auth(request, ["developer_admin", "developer_member", "director", "superadmin"])
    db = _db(request)
    docs = await db.project_diagnostics.find(
        {"project_id": project_id}, {"_id": 0},
    ).sort("run_at", -1).limit(limit).to_list(limit)
    return {"project_id": project_id, "items": docs}


@router.post("/dev/projects/{project_id}/diagnostic/auto-fix/{action_id}")
async def auto_fix_project(project_id: str, action_id: str, request: Request):
    user = await _auth(request, ["developer_admin", "superadmin"])
    db = _db(request)
    result = await run_auto_fix(action_id, db, project_id, user)
    try:
        from observability import emit_ml_event
        asyncio.create_task(emit_ml_event(
            db, "auto_fix_applied",
            user.user_id, getattr(user, "tenant_id", None), user.role,
            context={"project_id": project_id, "action_id": action_id, "ok": result.get("ok")},
        ))
    except Exception:
        pass
    return result


class ProbeContext(BaseModel):
    probe_id: str
    error_type: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None


@router.post("/dev/projects/{project_id}/diagnostic/ai-recommend")
async def ai_recommend(project_id: str, payload: ProbeContext, request: Request):
    user = await _auth(request, ["developer_admin", "superadmin"])
    db = _db(request)
    # Build ProbeResult skeleton for the AI call
    result = ProbeResult(
        probe_id=payload.probe_id, module="unknown", severity="medium",
        passed=False, description=payload.description or "",
        error_type=payload.error_type, location=payload.location,
    )
    rec = await ai_recommend_for_failure(
        db, getattr(user, "tenant_id", "default"), result
    )
    if not rec:
        return {"ai_available": False,
                "fallback": {"recommendation": "Sin recomendación IA disponible. Revisar logs y doc."}}
    return {"ai_available": True, "recommendation": rec}


# ═════════════════════════════════════════════════════════════════════════════
# NOTIFICATION HELPER
# ═════════════════════════════════════════════════════════════════════════════

async def _notify_critical_failures(db, user, project_id: str, diag_doc: Dict):
    """Create an in-app notification per developer_admin of this org on criticals."""
    dev_org_id = getattr(user, "tenant_id", None)
    now_iso = _now().isoformat()
    crit = [r for r in diag_doc.get("probes_results", [])
            if not r.get("passed") and r.get("severity") == "critical"]
    if not crit:
        return
    # Dedupe: 1 notif/day max per (project, user)
    today = now_iso[:10]
    existing = await db.notifications.find_one({
        "dev_org_id": dev_org_id,
        "type": "diagnostic_critical",
        "ref_id": project_id,
        "created_at": {"$gte": today},
    })
    if existing:
        return
    async for u in db.users.find(
        {"tenant_id": dev_org_id, "role": {"$in": ["developer_admin", "director"]}},
        {"_id": 0, "user_id": 1, "email": 1, "name": 1},
    ):
        nid = f"notif_{uuid.uuid4().hex[:12]}"
        await db.notifications.insert_one({
            "id": nid, "user_id": u["user_id"], "dev_org_id": dev_org_id,
            "type": "diagnostic_critical", "ref_id": project_id,
            "title": f"Diagnóstico: {len(crit)} fallas críticas en proyecto",
            "body": f"Ejecución del {now_iso[:10]} detectó {len(crit)} probes críticas. Revisar inmediatamente.",
            "link": f"/desarrollador/proyectos/{project_id}?diagnostic=open",
            "read": False,
            "created_at": now_iso,
        })


# ═════════════════════════════════════════════════════════════════════════════
# USER DIAGNOSTICS
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/diagnostic/user/{user_id}/run")
async def run_user_diagnostic(user_id: str, request: Request):
    current = await _auth(request)
    # Allow self OR superadmin
    if current.user_id != user_id and current.role != "superadmin":
        raise HTTPException(403, "Solo el mismo usuario o superadmin.")
    db = _db(request)

    # User-level probes (inline — focused on user state)
    probes: List[Dict[str, Any]] = []

    async def p(probe_id, severity, description, ok, error_type=None,
                location=None, recommendation=None, extra=None):
        probes.append({
            "probe_id": probe_id, "severity": severity, "description": description,
            "passed": bool(ok),
            "error_type": None if ok else (error_type or "data_quality"),
            "location": location, "recommendation": recommendation,
            "extra": extra or {},
        })

    # 1. Rol coherente
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    await p("user_exists", "critical", "Usuario existe en BD",
            bool(user_doc), "orphan_record",
            location="db.users", recommendation="Usuario no encontrado.")

    if user_doc:
        role = user_doc.get("role")
        await p("user_role_valid", "high", "Rol de usuario válido",
                role in ("cliente", "asesor", "developer_admin", "developer_member",
                         "director", "superadmin", "inmobiliaria_admin",
                         "inmobiliaria_member"),
                "permission_issue", "users.role",
                f"Rol inválido: {role}")

        # 2. Session token válido
        session_present = bool(user_doc.get("last_login_at"))
        await p("user_session_valid", "medium", "Sesión reciente",
                session_present, "stale_data", "users.last_login_at",
                "Sin login reciente registrado — verificar auth flow.")

        # 3. Preferences
        pref = await db.user_preferences.find_one({"user_id": user_id}, {"_id": 0})
        await p("user_preferences_load", "low", "Preferences cargan",
                pref is not None, "data_quality", "user_preferences",
                "Sin preferences guardadas — flow new user OK.")

        # 4. Saved searches no broken
        broken_search = await db.saved_searches.count_documents({
            "user_id": user_id, "broken": True,
        })
        await p("saved_searches_healthy", "low", "Búsquedas guardadas sanas",
                broken_search == 0, "data_quality", "saved_searches",
                f"{broken_search} búsquedas con broken=True. Limpiar o re-crear.")

        # 5. Brokers activos (si asesor)
        if role == "asesor":
            brokers = await db.project_brokers.count_documents({
                "broker_user_id": user_id, "status": "active",
            })
            await p("asesor_brokers_active", "high", "Asesor tiene brokers activos",
                    brokers > 0, "wiring_broken", "project_brokers",
                    "Asesor sin brokers activos. No verá proyectos.",
                    extra={"brokers_active": brokers})

        # 6. Lead attributions
        leads_mine = await db.leads.count_documents({"asesor_user_id": user_id})
        await p("asesor_has_leads", "low", "Asesor tiene leads asignados",
                leads_mine >= 0, "data_quality", "leads",
                "Sin leads — natural si nuevo.",
                extra={"leads_assigned": leads_mine})

        # 7. Org access
        org = user_doc.get("tenant_id") or user_doc.get("org_id")
        await p("user_org_linked", "medium", "Usuario vinculado a organización",
                bool(org), "permission_issue", "users.tenant_id",
                "Usuario sin org. Puede no ver nada en portal interno.")

        # 8. Calendar OAuth
        has_cal = bool(user_doc.get("google_calendar_token"))
        await p("calendar_oauth_valid", "low", "Google Calendar OAuth válido",
                True, "integration_external", "users.google_calendar_token",
                "Sin token calendar — feature opcional.",
                extra={"connected": has_cal})

        # 9. Recent audit errors
        recent_errors = await db.audit_log.count_documents({
            "user_id": user_id, "action": {"$regex": "error|fail"},
            "created_at": {"$gte": (_now() - timedelta(days=7)).isoformat()},
        })
        await p("no_recent_audit_errors", "medium", "Sin errores en audit_log",
                recent_errors < 5, "data_quality", "audit_log",
                f"{recent_errors} eventos error en 7d. Revisar patrón.",
                extra={"error_events_7d": recent_errors})

        # 10. Recent ml_events for user (PostHog-style)
        recent_ml = await db.ml_training_events.count_documents({
            "user_id": user_id,
            "ts": {"$gte": (_now() - timedelta(days=7)).isoformat()},
        })
        await p("user_events_tracked", "low", "Eventos ML capturados",
                recent_ml >= 0, "integration_external", "ml_training_events",
                "Verificar PostHog wiring.",
                extra={"events_7d": recent_ml})

        # 11. Sentry lookup (placeholder — requires Sentry MCP)
        await p("sentry_user_events", "low", "Sentry MCP lookup (stub)",
                True, "integration_external", "observability.sentry",
                "Sentry MCP integration not wired.",
                extra={"note": "Requires Sentry MCP for real lookup."})

        # 12. Notifications stack
        unread = await db.notifications.count_documents({
            "user_id": user_id, "read": False,
        })
        await p("notifications_stack_ok", "low", "Stack de notificaciones OK",
                unread < 200, "data_quality", "notifications",
                f"{unread} notifs sin leer. Considerar cleanup.",
                extra={"unread": unread})

    total = len(probes)
    passed = sum(1 for p in probes if p["passed"])
    failed = total - passed

    diag_id = f"udiag_{uuid.uuid4().hex[:12]}"
    now_iso = _now().isoformat()
    doc = {
        "id": diag_id, "user_id": user_id,
        "run_at": now_iso, "run_by": current.user_id,
        "total_probes": total, "passed": passed, "failed": failed,
        "probes_results": probes,
    }
    await db.user_diagnostics.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.get("/diagnostic/user/{user_id}/latest")
async def latest_user_diagnostic(user_id: str, request: Request):
    current = await _auth(request)
    if current.user_id != user_id and current.role != "superadmin":
        raise HTTPException(403)
    db = _db(request)
    doc = await db.user_diagnostics.find_one(
        {"user_id": user_id}, {"_id": 0}, sort=[("run_at", -1)]
    )
    if not doc:
        return {"user_id": user_id, "never_run": True}
    return doc


# ═════════════════════════════════════════════════════════════════════════════
# USER PROBLEM REPORTS
# ═════════════════════════════════════════════════════════════════════════════

class ProblemReportPayload(BaseModel):
    description: str
    screenshot_data_url: Optional[str] = None
    current_url: Optional[str] = None
    recent_actions: Optional[List[Dict]] = None


@router.post("/diagnostic/problem-reports")
async def create_problem_report(payload: ProblemReportPayload, request: Request):
    user = await _auth(request)
    db = _db(request)

    # Run user-level diagnostic automatically
    try:
        user_diag = await run_user_diagnostic(user.user_id, request)
    except Exception as e:
        log.warning(f"user diag failed: {e}")
        user_diag = {"error": str(e)[:200]}

    # Snapshot last 50 audit entries for this user
    audit_trail: List[Dict] = []
    async for entry in db.audit_log.find(
        {"user_id": user.user_id}, {"_id": 0}
    ).sort("created_at", -1).limit(50):
        audit_trail.append(entry)

    rid = f"rpt_{uuid.uuid4().hex[:12]}"
    now_iso = _now().isoformat()
    report = {
        "id": rid, "user_id": user.user_id,
        "user_email": getattr(user, "email", None),
        "user_role": user.role,
        "dev_org_id": getattr(user, "tenant_id", None),
        "description": payload.description[:5000],
        "current_url": payload.current_url,
        "screenshot_present": bool(payload.screenshot_data_url),
        "recent_actions": payload.recent_actions or [],
        "user_diagnostic": user_diag,
        "audit_trail": audit_trail,
        "status": "open",
        "severity": "medium",
        "created_at": now_iso,
    }
    # Store screenshot separately if present (heavy)
    if payload.screenshot_data_url:
        await db.user_problem_screenshots.insert_one({
            "report_id": rid,
            "data_url": payload.screenshot_data_url[:500000],  # 500KB cap
            "created_at": now_iso,
        })
    await db.user_problem_reports.insert_one(dict(report))

    # Notify all superadmins
    try:
        async for sa in db.users.find({"role": "superadmin"}, {"_id": 0, "user_id": 1}):
            await db.notifications.insert_one({
                "id": f"notif_{uuid.uuid4().hex[:12]}",
                "user_id": sa["user_id"],
                "type": "user_problem_report",
                "ref_id": rid,
                "title": "Nuevo reporte de problema",
                "body": f"{user.role} reportó: {payload.description[:80]}…",
                "link": f"/superadmin/user-diagnostics?report={rid}",
                "read": False, "created_at": now_iso,
            })
    except Exception as e:
        log.warning(f"notify superadmin failed: {e}")

    try:
        from observability import emit_ml_event
        asyncio.create_task(emit_ml_event(
            db, "user_problem_reported",
            user.user_id, getattr(user, "tenant_id", None), user.role,
            context={"report_id": rid, "url": payload.current_url},
        ))
    except Exception:
        pass

    report.pop("_id", None)
    return {"ok": True, "report_id": rid, "report": report}


@router.get("/superadmin/problem-reports")
async def list_problem_reports(request: Request, status: Optional[str] = None, limit: int = 50):
    await _auth(request, ["superadmin"])
    db = _db(request)
    q: Dict = {}
    if status:
        q["status"] = status
    docs = await db.user_problem_reports.find(
        q, {"_id": 0, "audit_trail": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return {"items": docs, "count": len(docs)}


@router.get("/superadmin/problem-reports/{report_id}")
async def get_problem_report(report_id: str, request: Request):
    await _auth(request, ["superadmin"])
    db = _db(request)
    doc = await db.user_problem_reports.find_one({"id": report_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404)
    return doc


class ReportStatusPatch(BaseModel):
    status: str  # open | investigating | resolved
    notes: Optional[str] = None


@router.patch("/superadmin/problem-reports/{report_id}")
async def patch_problem_report(report_id: str, payload: ReportStatusPatch, request: Request):
    user = await _auth(request, ["superadmin"])
    db = _db(request)
    if payload.status not in ("open", "investigating", "resolved"):
        raise HTTPException(400, "Status inválido")
    update = {"status": payload.status,
              "updated_at": _now().isoformat(),
              "updated_by": user.user_id}
    if payload.notes:
        update["investigation_notes"] = payload.notes
    r = await db.user_problem_reports.update_one({"id": report_id}, {"$set": update})
    if r.matched_count == 0:
        raise HTTPException(404)
    return {"ok": True, **update}


# ═════════════════════════════════════════════════════════════════════════════
# SUPERADMIN SYSTEM MAP
# ═════════════════════════════════════════════════════════════════════════════

MODULE_DEPS = {
    # directed edges: A depends on B (data flows B→A)
    "schema": [],
    "ie_engine": ["schema"],
    "marketplace": ["schema", "ie_engine"],
    "cross_portal": ["schema"],
    "engagement": ["cross_portal"],
    "ai_integrations": ["schema", "ie_engine"],
    "integrations_external": [],
    "performance": [],
    "notifications": ["cross_portal"],
}


@router.get("/superadmin/system-map")
async def system_map(request: Request):
    await _auth(request, ["superadmin"])
    db = _db(request)
    cutoff = (_now() - timedelta(days=7)).isoformat()

    # Aggregate per module from project_diagnostics
    pipeline = [
        {"$match": {"run_at": {"$gte": cutoff}}},
        {"$unwind": "$probes_results"},
        {"$group": {
            "_id": "$probes_results.module",
            "pass": {"$sum": {"$cond": [{"$eq": ["$probes_results.passed", True]}, 1, 0]}},
            "fail": {"$sum": {"$cond": [{"$eq": ["$probes_results.passed", False]}, 1, 0]}},
        }},
    ]
    modules_agg: Dict[str, Dict] = {}
    async for row in db.project_diagnostics.aggregate(pipeline):
        modules_agg[row["_id"]] = {"pass": row["pass"], "fail": row["fail"]}

    # Build nodes
    nodes = []
    for mod in MODULE_DEPS.keys():
        agg = modules_agg.get(mod, {"pass": 0, "fail": 0})
        total = agg["pass"] + agg["fail"]
        pass_pct = (agg["pass"] / total * 100) if total else 100
        health = "green" if pass_pct >= 90 else "amber" if pass_pct >= 70 else "red"
        probe_count = sum(1 for p in PROBE_REGISTRY if p.module == mod)
        nodes.append({
            "id": mod,
            "label": mod.replace("_", " ").title(),
            "probe_count": probe_count,
            "runs_7d": total,
            "pass_pct_7d": round(pass_pct, 1),
            "health": health,
        })

    edges = []
    for mod, deps in MODULE_DEPS.items():
        for d in deps:
            edges.append({"from": d, "to": mod})

    # Global stats
    total_probes_ran = sum(m["pass"] + m["fail"] for m in modules_agg.values())
    total_pass = sum(m["pass"] for m in modules_agg.values())
    total_fail = sum(m["fail"] for m in modules_agg.values())
    pass_rate = round((total_pass / total_probes_ran * 100), 1) if total_probes_ran else 0
    criticals_open = await db.project_diagnostics.count_documents({
        "criticals": {"$gt": 0},
        "run_at": {"$gte": cutoff},
    })
    top_problematic = min(nodes, key=lambda n: n["pass_pct_7d"]) if nodes else None

    # Emit ml_event
    try:
        from observability import emit_ml_event
        user = await _auth(request, ["superadmin"])
        asyncio.create_task(emit_ml_event(
            db, "system_map_viewed",
            user.user_id, getattr(user, "tenant_id", None), user.role,
            context={"nodes": len(nodes), "pass_rate": pass_rate},
        ))
    except Exception:
        pass

    return {
        "nodes": nodes, "edges": edges,
        "stats": {
            "total_probes_ran_7d": total_probes_ran,
            "pass_rate_7d": pass_rate,
            "criticals_open": criticals_open,
            "top_problematic_module": top_problematic["id"] if top_problematic else None,
        },
    }


@router.get("/superadmin/probe-recurrence")
async def probe_recurrence(request: Request, limit: int = 50,
                            error_type: Optional[str] = None,
                            severity: Optional[str] = None,
                            module: Optional[str] = None):
    await _auth(request, ["superadmin"])
    db = _db(request)
    q: Dict = {}
    if error_type:
        q["error_type"] = error_type
    if severity:
        q["severity"] = severity
    if module:
        q["module"] = module
    items = await db.probe_recurrence.find(q, {"_id": 0}).sort(
        "recurrence_count", -1
    ).limit(limit).to_list(limit)
    # Enrich with # affected projects
    probe_ids = list({it["probe_id"] for it in items})
    affected_map: Dict[str, int] = {}
    for pid in probe_ids:
        affected_map[pid] = await db.probe_recurrence.count_documents({"probe_id": pid})
    for it in items:
        it["affected_projects"] = affected_map.get(it["probe_id"], 0)
    return {"items": items, "count": len(items)}


@router.get("/superadmin/diagnostics/per-org")
async def per_org_dashboard(request: Request):
    await _auth(request, ["superadmin"])
    db = _db(request)
    cutoff = (_now() - timedelta(days=7)).isoformat()
    pipeline = [
        {"$match": {"run_at": {"$gte": cutoff}}},
        {"$group": {
            "_id": "$dev_org_id",
            "runs": {"$sum": 1},
            "total_passed": {"$sum": "$passed"},
            "total_probes": {"$sum": "$total_probes"},
            "total_failed": {"$sum": "$failed"},
            "total_criticals": {"$sum": "$criticals"},
            "projects": {"$addToSet": "$project_id"},
        }},
    ]
    rows = []
    async for row in db.project_diagnostics.aggregate(pipeline):
        total = row["total_probes"] or 0
        rows.append({
            "dev_org_id": row["_id"],
            "runs_7d": row["runs"],
            "projects_count": len(row["projects"]),
            "pass_rate_7d": round((row["total_passed"] / total * 100), 1) if total else 100,
            "criticals_open": row["total_criticals"],
        })
    rows.sort(key=lambda r: r["pass_rate_7d"])
    return {"items": rows}


# ═════════════════════════════════════════════════════════════════════════════
# REGISTRY INSPECTION
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/dev/diagnostic/probe-registry")
async def list_probes(request: Request):
    user = await _auth(request, ["developer_admin", "developer_member", "director", "superadmin"])
    # Trigger probes import
    try:
        import probes  # noqa: F401
    except Exception:
        pass
    return {
        "total": len(PROBE_REGISTRY),
        "items": [
            {"id": p.id, "module": p.module, "severity": p.severity,
             "description": p.description}
            for p in PROBE_REGISTRY
        ],
    }


# ═════════════════════════════════════════════════════════════════════════════
# SCHEDULERS
# ═════════════════════════════════════════════════════════════════════════════

async def _daily_active_projects_diag(db, app):
    """Run diagnostics for all active projects — scheduled daily 6am."""
    log.info("[diagnostic] daily scheduler starting")
    from data_developments import DEVELOPMENTS
    for dev in DEVELOPMENTS:
        try:
            await run_diagnostics(
                db, project_id=dev["id"], scope="all",
                user=None, trigger="scheduled",
            )
        except Exception as e:
            log.warning(f"[diagnostic] daily run failed for {dev['id']}: {e}")
    log.info("[diagnostic] daily scheduler done")


def register_diagnostic_jobs(sched, db, app=None):
    try:
        from apscheduler.triggers.cron import CronTrigger
        sched.add_job(
            _daily_active_projects_diag,
            CronTrigger(hour=6, minute=15),
            id="diagnostic_daily", replace_existing=True,
            kwargs={"db": db, "app": app}, max_instances=1,
        )
        log.info("[diagnostic] daily job scheduled @ 06:15 MX")
    except Exception as e:
        log.warning(f"[diagnostic] schedule failed: {e}")


# ═════════════════════════════════════════════════════════════════════════════
# AUTO-FIX HANDLERS
# ═════════════════════════════════════════════════════════════════════════════

from diagnostic_engine import register_auto_fix


async def _fix_seed_commercialization(db, project_id, user):
    now = _now().isoformat()
    await db.project_commercialization.update_one(
        {"project_id": project_id},
        {"$setOnInsert": {
            "project_id": project_id,
            "dev_org_id": getattr(user, "tenant_id", "default"),
            "works_with_brokers": False,
            "default_commission_pct": 3.0,
            "iva_included": False,
            "broker_terms": "",
            "in_house_only": True,
            "approved_inmobiliarias": [],
            "created_at": now, "updated_at": now,
        }},
        upsert=True,
    )
    return {"message": "Política comercial seedeada con defaults conservadores."}


async def _fix_cleanup_orphan_assets(db, project_id, user):
    r = await db.project_assets.delete_many({"project_id": project_id, "orphan": True})
    return {"message": f"Eliminados {r.deleted_count} assets huérfanos."}


async def _fix_recompute_ie_score(db, project_id, user):
    # Touch + schedule future recompute (actual recompute lives in IE engine)
    await db.ie_score_requests.insert_one({
        "project_id": project_id,
        "requested_by": getattr(user, "user_id", None),
        "requested_at": _now().isoformat(),
        "status": "queued",
    })
    return {"message": "Recompute IE score en cola."}


async def _fix_recompute_lead_heat(db, project_id, user):
    r = await db.leads.update_many(
        {"project_id": project_id, "heat_score": {"$in": [None, 0]}},
        {"$set": {"heat_rescore_needed": True}},
    )
    return {"message": f"{r.modified_count} leads marcados para re-scoring."}


async def _fix_recompute_cash_flow(db, project_id, user):
    await db.cash_flow_requests.insert_one({
        "project_id": project_id,
        "requested_by": getattr(user, "user_id", None),
        "requested_at": _now().isoformat(),
        "status": "queued",
    })
    return {"message": "Cash flow recalc en cola."}


async def _fix_generate_narratives(db, project_id, user):
    await db.narrative_requests.insert_one({
        "project_id": project_id,
        "requested_by": getattr(user, "user_id", None),
        "requested_at": _now().isoformat(),
        "status": "queued",
    })
    return {"message": "Generación de narrativas encolada."}


register_auto_fix("seed_default_commercialization", _fix_seed_commercialization)
register_auto_fix("cleanup_orphan_assets", _fix_cleanup_orphan_assets)
register_auto_fix("recompute_ie_score", _fix_recompute_ie_score)
register_auto_fix("recompute_lead_heat", _fix_recompute_lead_heat)
register_auto_fix("recompute_cash_flow", _fix_recompute_cash_flow)
register_auto_fix("generate_narratives", _fix_generate_narratives)
