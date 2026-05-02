"""AI integration probes."""
import os
from datetime import datetime, timezone, timedelta
from diagnostic_engine import functional_probe


def _now():
    return datetime.now(timezone.utc)


async def _claude_within_budget(db, project_id, user):
    dev_org_id = (getattr(user, "tenant_id", None) or
                  getattr(user, "org_id", None) or "default") if user else "default"
    try:
        from ai_budget import is_within_budget
        ok = await is_within_budget(db, dev_org_id)
        if not ok:
            return {"passed": False, "error_type": "ai_failure",
                    "location": f"ai_budget[org={dev_org_id}]",
                    "recommendation": "Budget AI mensual excedido. Aumentar límite en superadmin."}
    except Exception as e:
        return {"passed": False, "error_type": "wiring_broken",
                "location": "ai_budget.is_within_budget",
                "recommendation": f"Error verificando budget: {str(e)[:100]}"}
    if not os.environ.get("EMERGENT_LLM_KEY"):
        return {"passed": False, "error_type": "integration_external",
                "location": "env.EMERGENT_LLM_KEY",
                "recommendation": "EMERGENT_LLM_KEY no configurada — llamadas AI fallarán con stub."}
    return {"passed": True}


async def _cash_flow_generated(db, project_id, user):
    if not project_id:
        return {"passed": True}
    doc = await db.cash_flow_forecasts.find_one({"project_id": project_id}, {"_id": 0},
                                                 sort=[("generated_at", -1)])
    if not doc:
        return {"passed": False, "error_type": "stale_data",
                "location": "cash_flow_forecasts collection",
                "recommendation": "Cash flow nunca generado. Ir a pestaña Proyecciones → Recalcular.",
                "action_id": "recompute_cash_flow", "severity": "medium"}
    return {"passed": True}


async def _site_studies_complete(db, project_id, user):
    # Not project-scoped — check global
    total = await db.site_studies.count_documents({})
    incomplete = await db.site_studies.count_documents({
        "status": {"$in": ["queued", "running", "error"]},
        "created_at": {"$lt": (_now() - timedelta(hours=2)).isoformat()},
    })
    if incomplete > 5:
        return {"passed": False, "error_type": "ai_failure",
                "location": "site_studies collection",
                "recommendation": f"{incomplete} studies estancados >2h. Revisar worker AI.",
                "severity": "medium"}
    return {"passed": True, "extra": {"total": total, "stuck": incomplete}}


functional_probe("claude_calls_within_budget", "ai_integrations", "critical",
                 "AI budget within limits + EMERGENT_LLM_KEY presente",
                 _claude_within_budget, "ai_failure")
functional_probe("cash_flow_forecast_generated", "ai_integrations", "medium",
                 "Cash flow generado para el proyecto",
                 _cash_flow_generated, "stale_data")
functional_probe("site_selection_studies_complete", "ai_integrations", "low",
                 "Site selection studies no estancados",
                 _site_studies_complete, "ai_failure")
