"""IE Engine probes."""
from datetime import datetime, timezone, timedelta
from diagnostic_engine import functional_probe


def _now():
    return datetime.now(timezone.utc)


async def _ie_score_recent(db, project_id, user):
    if not project_id:
        return {"passed": True}
    score = await db.ie_scores.find_one({"project_id": project_id}, {"_id": 0},
                                        sort=[("computed_at", -1)])
    if not score:
        return {"passed": False, "error_type": "stale_data",
                "location": "ie_scores collection",
                "recommendation": "No hay IE score calculado. Ejecutar recompute manual.",
                "action_id": "recompute_ie_score"}
    computed = score.get("computed_at")
    if computed:
        try:
            c_dt = datetime.fromisoformat(computed.replace("Z", "+00:00"))
            if _now() - c_dt > timedelta(days=7):
                return {"passed": False, "error_type": "stale_data",
                        "location": f"ie_scores[{project_id}].computed_at",
                        "recommendation": f"IE score antiguo ({(_now()-c_dt).days} días). Re-ejecutar.",
                        "action_id": "recompute_ie_score"}
        except Exception:
            pass
    return {"passed": True, "extra": {"last_computed": computed}}


async def _heat_per_lead(db, project_id, user):
    if not project_id:
        return {"passed": True}
    # Count leads without heat_score
    total = await db.leads.count_documents({"project_id": project_id})
    if total == 0:
        return {"passed": True, "extra": {"leads": 0}}
    no_heat = await db.leads.count_documents({
        "project_id": project_id, "heat_score": {"$in": [None, 0]}
    })
    pct = round((no_heat / total) * 100, 1) if total else 0
    if pct > 30:
        return {"passed": False, "error_type": "ai_failure",
                "location": f"leads[project_id={project_id}].heat_score",
                "recommendation": f"{no_heat}/{total} leads sin heat score ({pct}%). "
                                   "Re-ejecutar batch scoring.",
                "action_id": "recompute_lead_heat",
                "extra": {"missing_pct": pct}}
    return {"passed": True}


async def _ai_summary_cache(db, project_id, user):
    if not project_id:
        return {"passed": True}
    # ai_briefings_cache pattern used in briefing engine
    cached = await db.ai_briefings.find_one({"project_id": project_id}, {"_id": 0})
    if not cached:
        return {"passed": True, "extra": {"note": "Sin briefing cache — generable on-demand"}}
    return {"passed": True}


async def _narratives_work(db, project_id, user):
    # Check narratives_generation endpoint path is registered
    if not project_id:
        return {"passed": True}
    count = await db.narratives.count_documents({"project_id": project_id})
    if count == 0:
        return {"passed": False, "error_type": "ai_failure",
                "location": "narratives collection",
                "recommendation": "Sin narrativas generadas. Ejecutar generación desde IE Engine.",
                "action_id": "generate_narratives", "severity": "low"}
    return {"passed": True, "extra": {"count": count}}


functional_probe("ie_score_calculated_recent", "ie_engine", "high",
                 "IE score calculado en últimos 7 días", _ie_score_recent, "stale_data")
functional_probe("heat_score_per_lead_calculated", "ie_engine", "medium",
                 "Leads tienen heat_score asignado", _heat_per_lead, "ai_failure")
functional_probe("ai_summary_cached_or_generatable", "ie_engine", "low",
                 "AI briefing cache disponible o generable",
                 _ai_summary_cache, "stale_data")
functional_probe("narratives_generation_works", "ie_engine", "low",
                 "Narrativas del proyecto generadas",
                 _narratives_work, "ai_failure")
